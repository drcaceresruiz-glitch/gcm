import "server-only";
import { prisma } from "@/lib/prisma";
import { puede } from "@/lib/rbac";
import { normalizarDecimal, multiplicar } from "@/lib/decimal";
import {
  codigoPadre,
  calcularProfundidades,
  sumarHojas,
  aportantes,
  LARGO_MAXIMO_CODIGO,
} from "@/lib/jerarquia-partidas";
import { calcularRenumeracion } from "@/lib/renumerar-partidas";
import { motivoNoAdmiteCambios } from "@/lib/obras";
import type { SesionActiva } from "@/services/sesion.service";
import type {
  AuditAction,
  ModalidadPartida,
  WbsType,
} from "@/generated/prisma/enums";

/**
 * Edicion de partidas.
 *
 * La importacion desde Excel nunca sale perfecta: hay filas con formulas
 * arrastradas, metrados mal tecleados y descripciones a medias. Poder
 * corregirlas dentro del sistema evita el circuito de arreglar el Excel y
 * volver a importar, que ademas obliga a rehacer todo el presupuesto para
 * cambiar una celda.
 */

export type Resultado<T = void> =
  | ({ ok: true } & (T extends void ? object : { datos: T }))
  | { ok: false; error: string };

/** Comprueba que la partida existe, es de la empresa y el presupuesto esta abierto. */
async function contextoEditable(sesion: SesionActiva, partidaId: string) {
  const partida = await prisma.wbsItem.findFirst({
    // El filtro por empresa sale de la sesion: sin esto, cambiar el id en la
    // peticion permitiria editar el presupuesto de otro cliente.
    where: { id: partidaId, project: { companyId: sesion.companyId } },
    select: {
      id: true,
      projectId: true,
      codigoPartida: true,
      descripcion: true,
      unidad: true,
      metrado: true,
      precioUnitario: true,
      parcial: true,
      tipo: true,
      modalidad: true,
      project: { select: { estado: true, archivadaEn: true } },
    },
  });

  if (!partida) return { ok: false as const, error: "Partida no encontrada." };

  // Antes que el congelado: una obra cerrada no admite cambios aunque su
  // presupuesto nunca llegara a congelarse.
  const noAdmite = motivoNoAdmiteCambios(partida.project);
  if (noAdmite) return { ok: false as const, error: noAdmite };

  const congelada = await prisma.baseline.findFirst({
    where: { projectId: partida.projectId, aprobadaAt: { not: null } },
    select: { version: true },
  });

  if (congelada) {
    return {
      ok: false as const,
      error: `El presupuesto esta congelado (linea base v${congelada.version}). Los cambios deben registrarse como adicionales.`,
    };
  }

  return { ok: true as const, partida };
}

async function auditar(datos: {
  sesion: SesionActiva;
  projectId: string;
  entidadId: string;
  accion: AuditAction;
  antes?: unknown;
  despues?: unknown;
}): Promise<void> {
  await prisma.auditLog
    .create({
      data: {
        companyId: datos.sesion.companyId,
        userId: datos.sesion.userId,
        projectId: datos.projectId,
        entidad: "WbsItem",
        entidadId: datos.entidadId,
        accion: datos.accion,
        antes: (datos.antes ?? null) as never,
        despues: (datos.despues ?? null) as never,
      },
    })
    .catch(() => {});
}

export interface CamposPartida {
  descripcion?: string;
  /// Cambiarla altera como se calcula el importe de aqui en adelante.
  modalidad?: ModalidadPartida;
  unidad?: string | null;
  metrado?: string | null;
  precioUnitario?: string | null;
  /// Si se envia, manda sobre el calculo. Es lo que permite mantener las
  /// partidas a suma alzada, donde el importe no es metrado x precio.
  parcial?: string | null;
}

export async function actualizarPartida(
  sesion: SesionActiva,
  partidaId: string,
  campos: CamposPartida,
): Promise<Resultado> {
  if (!puede(sesion, "partida:editar")) {
    return { ok: false, error: "No tienes permiso para editar partidas." };
  }

  const ctx = await contextoEditable(sesion, partidaId);
  if (!ctx.ok) return ctx;
  const { partida } = ctx;

  const modalidadFinal = campos.modalidad ?? partida.modalidad;

  /**
   * Una fila de alcance NO puede llevar cifras propias.
   *
   * No es una cuestion de orden: `aportantes` hace que cualquier importe
   * positivo CUBRA a sus ancestros, asi que un alcance con importe no suma
   * de mas, sino que BORRA del costo directo el precio cerrado de su partida
   * padre, y con el el BAC y los subtotales. La pantalla dejaba esa celda
   * editable y el servicio no lo comprobaba: era el punto 7 de PENDIENTES.
   */
  if (modalidadFinal === "ALCANCE") {
    for (const campo of ["parcial", "metrado", "precioUnitario"] as const) {
      const valor = campos[campo];
      if (valor !== undefined && valor !== null && valor.trim() !== "") {
        return {
          ok: false,
          error:
            `"${partida.codigoPartida}" solo detalla el alcance de otra partida ` +
            "y no lleva cifras propias: el dinero esta en su partida padre.",
        };
      }
    }
  }

  // La modalidad de un capitulo es basura ignorada por el calculo —su importe
  // es la suma de lo que cuelga—, asi que aceptarla solo sirve para que
  // alguien crea que significa algo.
  if (campos.modalidad !== undefined && partida.tipo === "CAPITULO") {
    return {
      ok: false,
      error: "Un capitulo no tiene modalidad: su importe es la suma de sus partidas.",
    };
  }

  const datos: Record<string, unknown> = {};

  if (campos.descripcion !== undefined) {
    const texto = campos.descripcion.trim();
    if (texto === "") {
      return { ok: false, error: "La descripcion no puede quedar vacia." };
    }
    datos["descripcion"] = texto.slice(0, 500);
  }

  if (campos.unidad !== undefined) {
    const u = campos.unidad?.trim() ?? "";
    datos["unidad"] = u === "" ? null : u.slice(0, 20);
  }

  // Los numericos se normalizan con la misma precision que la base. Un
  // texto no numerico se rechaza en vez de guardarse como nulo: perder un
  // metrado en silencio es peor que un mensaje de error.
  for (const [campo, decimales, enteros] of [
    ["metrado", 4, ENTEROS_METRADO],
    ["precioUnitario", 4, ENTEROS_PRECIO],
    ["parcial", 2, ENTEROS_IMPORTE],
  ] as const) {
    const valor = campos[campo];
    if (valor === undefined) continue;

    if (valor === null || valor.trim() === "") {
      datos[campo] = null;
      continue;
    }

    const normalizado = normalizarDecimal(valor, decimales);
    if (normalizado === null) {
      return { ok: false, error: `El valor de ${campo} no es un numero valido.` };
    }
    // La magnitud, que `normalizarDecimal` no mira: ajusta los decimales y
    // deja pasar cualquier parte entera. Once digitos en un metrado pasaban
    // hasta chocar contra la base, y eso no sale como aviso.
    if (noCabe(normalizado, enteros)) {
      return {
        ok: false,
        error: `El valor de ${campo} no puede pasar de ${enteros} digitos enteros.`,
      };
    }
    datos[campo] = normalizado;
  }

  /**
   * El importe solo se recalcula en partidas a precios unitarios.
   *
   * En una partida a suma alzada el precio esta cerrado y el metrado es
   * referencial: corregir ese metrado no puede alterar un importe ya
   * pactado con el contratista. Y en una fila de alcance el dinero vive en
   * su partida padre, asi que tampoco tiene importe propio que recalcular.
   */
  const modalidad = campos.modalidad ?? partida.modalidad;

  if (campos.parcial === undefined && modalidad === "PRECIOS_UNITARIOS") {
    /**
     * Lo tocado manda; lo no tocado se lee de la base.
     *
     * El `??` de antes no distinguia «no lo has tocado» de «lo has borrado»:
     * al vaciar el metrado, `datos["metrado"]` quedaba en null y el `??`
     * recaia en el metrado VIEJO, asi que la fila se guardaba sin metrado y
     * con el importe intacto, calculado sobre una cifra que ya no estaba.
     */
    const tocado = (campo: "metrado" | "precioUnitario") =>
      campos[campo] !== undefined;

    const metrado = (
      tocado("metrado") ? datos["metrado"] : (partida.metrado?.toString() ?? null)
    ) as string | null;
    const precio = (
      tocado("precioUnitario")
        ? datos["precioUnitario"]
        : (partida.precioUnitario?.toString() ?? null)
    ) as string | null;

    // Si en ESTA edicion se ha borrado uno de los dos operandos, el importe se
    // va con el: un importe sin las cifras que lo justifican no se puede
    // defender delante de nadie.
    const borroOperando =
      (tocado("metrado") && datos["metrado"] === null) ||
      (tocado("precioUnitario") && datos["precioUnitario"] === null);

    if (borroOperando) {
      datos["parcial"] = null;
    } else if (metrado && precio) {
      const calculado = multiplicar(metrado, precio, 2);

      // El producto puede no caber aunque quepan sus dos operandos.
      if (calculado !== null && noCabe(calculado, ENTEROS_IMPORTE)) {
        return {
          ok: false,
          error:
            `El importe saldria ${calculado}, que pasa de ${ENTEROS_IMPORTE} ` +
            `digitos enteros y no cabe. Revisa el metrado y el precio.`,
        };
      }
      datos["parcial"] = calculado;
    }
  }

  if (campos.modalidad !== undefined) {
    datos["modalidad"] = campos.modalidad;

    /**
     * Al pasar a alcance se limpian LAS TRES cifras, no solo el importe.
     *
     * Antes solo se anulaba `parcial`, y el metrado y el precio quedaban
     * dentro. Bastaba volver a precios unitarios para que el recalculo los
     * multiplicara y resucitara un importe que la fila no debe tener.
     */
    if (campos.modalidad === "ALCANCE") {
      datos["parcial"] = null;
      datos["metrado"] = null;
      datos["precioUnitario"] = null;
    }
  }

  if (Object.keys(datos).length === 0) return { ok: true };

  /**
   * Queda marcada como tocada a mano.
   *
   * Una partida importada y despues corregida ya no coincide con ningun
   * archivo: si se reimporta el Excel, esa correccion se pierde y nadie la
   * echa de menos hasta que el total no cuadra. Con esta marca, el
   * importador puede avisar de cuantas correcciones va a barrer ANTES de
   * hacerlo.
   */
  datos["editadaAMano"] = true;

  await prisma.wbsItem.update({ where: { id: partidaId }, data: datos });

  await auditar({
    sesion,
    projectId: partida.projectId,
    entidadId: partidaId,
    accion: "UPDATE",
    antes: {
      codigo: partida.codigoPartida,
      descripcion: partida.descripcion,
      unidad: partida.unidad,
      metrado: partida.metrado?.toString() ?? null,
      precioUnitario: partida.precioUnitario?.toString() ?? null,
      parcial: partida.parcial?.toString() ?? null,
    },
    despues: datos,
  });

  return { ok: true };
}

export async function eliminarPartida(
  sesion: SesionActiva,
  partidaId: string,
): Promise<Resultado> {
  if (!puede(sesion, "partida:eliminar")) {
    return { ok: false, error: "No tienes permiso para eliminar partidas." };
  }

  const ctx = await contextoEditable(sesion, partidaId);
  if (!ctx.ok) return ctx;
  const { partida } = ctx;

  const hijos = await prisma.wbsItem.count({ where: { parentId: partidaId } });

  if (hijos > 0) {
    // Borrar en cascada dejaria desaparecer partidas con importe sin que
    // nadie lo pida. Se exige vaciar el capitulo primero.
    return {
      ok: false,
      error: `"${partida.codigoPartida}" contiene ${hijos} partida(s). Eliminalas antes, o el presupuesto perderia importes sin aviso.`,
    };
  }

  /**
   * Lo demas que sujeta a una partida, y que no eran las hijas.
   *
   * En el esquema hay CINCO relaciones `Restrict` hacia `WbsItem` y aqui solo
   * se comprobaba la primera. Las otras cuatro no daban un mensaje: daban un
   * choque contra la clave ajena que nadie recogia, y una Server Action que
   * revienta se ve como «This page couldn't load», sin traza y sin decir que
   * la partida tenia dinero comprometido.
   *
   * No se borra en cascada a proposito: son compromisos con terceros —una
   * orden a un proveedor, un adicional aprobado— y quitarlos es una decision
   * de quien los firmo, no un efecto secundario de limpiar el presupuesto.
   */
  const sujeciones: [string, number][] = [
    [
      "está imputada en una orden de compra",
      await prisma.ordenImputacion.count({ where: { wbsItemId: partidaId } }),
    ],
    [
      "está incluida en un encargo a un proveedor",
      await prisma.encargoPartida.count({ where: { wbsItemId: partidaId } }),
    ],
    [
      "figura en una línea de un movimiento presupuestal",
      await prisma.movimientoLinea.count({ where: { wbsItemId: partidaId } }),
    ],
    [
      "está repartida en un presupuesto meta",
      await prisma.metaItemPartida.count({ where: { wbsItemId: partidaId } }),
    ],
  ];

  const sujeta = sujeciones.filter(([, n]) => n > 0);

  if (sujeta.length > 0) {
    return {
      ok: false,
      error:
        `"${partida.codigoPartida}" no se puede eliminar porque ` +
        sujeta.map(([motivo]) => motivo).join(", y ") +
        ". Quítala de ahí primero.",
    };
  }

  await prisma.wbsItem.delete({ where: { id: partidaId } });

  await auditar({
    sesion,
    projectId: partida.projectId,
    entidadId: partidaId,
    accion: "DELETE",
    antes: {
      codigo: partida.codigoPartida,
      descripcion: partida.descripcion,
      parcial: partida.parcial?.toString() ?? null,
    },
  });

  return { ok: true };
}

export interface NuevaPartida {
  codigoPartida: string;
  descripcion: string;
  unidad?: string | null;
  metrado?: string | null;
  precioUnitario?: string | null;
  /**
   * El capitulo del que cuelga, ELEGIDO en una lista.
   *
   * Antes la jerarquia solo se podia teclear: se deducia del codigo, y quien
   * escribia tenia que saber que "2.1" cuelga del capitulo 2.0 aunque acabara
   * de crear el 4.0. Ahora se elige, y el codigo se propone desde el capitulo
   * con `siguienteCodigoHijo`.
   *
   * Es opcional porque el importador y las partidas nacidas de un adicional
   * siguen entrando sin el. Cuando viene, se EXIGE que coincida con el padre
   * que dice el codigo: no manda uno sobre el otro, tienen que decir lo mismo.
   */
  parentId?: string | null;
  /**
   * Como esta contratada, DICHA al crearla.
   *
   * Faltaba: toda partida nacia a precios unitarios y para dejarla a suma
   * alzada habia que crearla y cambiarla despues en la tabla. Y no era solo
   * un paso de mas: al crearla se calculaba el importe como metrado x precio,
   * que es exactamente lo que una suma alzada NO hace.
   */
  modalidad?: ModalidadPartida;
  /**
   * El importe cerrado, para las de suma alzada.
   *
   * En precios unitarios no se manda: sale de multiplicar. Aqui es el precio
   * pactado por todo el alcance, y el metrado que lo acompane es referencial.
   */
  parcial?: string | null;
  /**
   * Si es capitulo o partida, DICHO, no deducido.
   *
   * Antes solo se deducia: sin cifras, capitulo. Y era una trampa cara. Al
   * construir un presupuesto a mano lo natural es teclear primero la lista de
   * partidas y poner los precios despues —o pedirlos al proveedor—, y cada una
   * de esas filas nacia CAPITULO para siempre: `actualizarPartida` no toca
   * `tipo`, asi que sus celdas de unidad, metrado y precio quedaban vacias y
   * NO editables, sin ninguna via en la interfaz para arreglarlo. Habia que
   * borrar la fila y rehacerla, y nadie avisaba.
   *
   * Se deja opcional para no romper a quien ya llamaba sin decirlo: si no
   * viene, se deduce como siempre.
   */
  tipo?: WbsType;
}

/**
 * Si un decimal NO cabe en su columna.
 *
 * `normalizarDecimal` ajusta los DECIMALES y nunca la parte entera, asi que
 * un metrado de once digitos pasaba todas las validaciones y reventaba contra
 * la base. Y lo peor no es el valor tecleado sino el CALCULADO: metrado y
 * precio pueden caber cada uno y su producto no.
 *
 * Los topes salen del esquema: metrado y precioUnitario son Decimal(14,4)
 * —diez enteros—; parcial es Decimal(14,2) —doce—.
 */
function noCabe(valor: string, enteros: number): boolean {
  const entera = (valor.replace("-", "").split(".")[0] ?? "").replace(/^0+/, "");
  return entera.length > enteros;
}

const ENTEROS_METRADO = 10;
const ENTEROS_PRECIO = 10;
const ENTEROS_IMPORTE = 12;

export async function crearPartida(
  sesion: SesionActiva,
  obraId: string,
  nueva: NuevaPartida,
): Promise<Resultado<{ id: string }>> {
  if (!puede(sesion, "partida:crear")) {
    return { ok: false, error: "No tienes permiso para crear partidas." };
  }

  const obra = await prisma.project.findFirst({
    where: { id: obraId, companyId: sesion.companyId },
    select: { id: true, estado: true, archivadaEn: true },
  });
  if (!obra) return { ok: false, error: "Obra no encontrada." };

  const noAdmite = motivoNoAdmiteCambios(obra);
  if (noAdmite) return { ok: false, error: noAdmite };

  const congelada = await prisma.baseline.findFirst({
    where: { projectId: obraId, aprobadaAt: { not: null } },
    select: { version: true },
  });
  if (congelada) {
    return {
      ok: false,
      error: `El presupuesto esta congelado (linea base v${congelada.version}).`,
    };
  }

  const codigo = nueva.codigoPartida.trim();
  if (!/^\d+(\.\d+)*$/.test(codigo)) {
    return {
      ok: false,
      error: "El codigo debe ser numeros separados por punto, como 4.3 o 01.02.01.",
    };
  }

  // La descripcion y la unidad se recortan al guardar; el codigo era el unico
  // que iba crudo contra su VarChar(32). Recortarlo NO vale: el codigo decide
  // de quien cuelga la partida, y un codigo a medias colgaria de otro sitio.
  if (codigo.length > LARGO_MAXIMO_CODIGO) {
    return {
      ok: false,
      error:
        `El codigo no puede pasar de ${LARGO_MAXIMO_CODIGO} caracteres, y "${codigo}" ` +
        `tiene ${codigo.length}.`,
    };
  }

  const descripcion = nueva.descripcion.trim();
  if (descripcion === "") {
    return { ok: false, error: "La descripcion es obligatoria." };
  }

  const existentes = await prisma.wbsItem.findMany({
    where: { projectId: obraId },
    select: {
      id: true,
      codigoPartida: true,
      orden: true,
      parentId: true,
      tipo: true,
    },
  });

  if (existentes.some((e) => e.codigoPartida === codigo)) {
    return { ok: false, error: `Ya existe una partida con el codigo ${codigo}.` };
  }

  const codigos = new Set([...existentes.map((e) => e.codigoPartida), codigo]);
  const codigoDelPadre = codigoPadre(codigo, codigos);
  const padre = codigoDelPadre
    ? (existentes.find((e) => e.codigoPartida === codigoDelPadre) ?? null)
    : null;

  /**
   * Si se dijo de que capitulo cuelga, tiene que coincidir con el que dice el
   * codigo. No se elige uno de los dos: se exige que digan lo mismo.
   *
   * Aqui conviven tres representaciones del arbol —`parentId` da los
   * subtotales de capitulo, el codigo da el total de la obra por `aportantes`,
   * y `nivel` con `orden` dibujan la tabla—. Dejar que dos apunten a sitios
   * distintos no da error: descuadra el presupuesto en una pantalla y no en
   * la otra, que es la peor forma de estar mal. La pantalla propone el codigo
   * con `siguienteCodigoHijo`, asi que llegar aqui con los dos en desacuerdo
   * significa que alguien lo edito a mano.
   */
  if (nueva.parentId) {
    const elegido = existentes.find((e) => e.id === nueva.parentId);

    if (!elegido) {
      return { ok: false, error: "El capitulo elegido no existe en esta obra." };
    }
    if (elegido.tipo !== "CAPITULO") {
      return {
        ok: false,
        error:
          `"${elegido.codigoPartida}" no es un capitulo. Colgar una partida de otra ` +
          "partida con importe haria desaparecer el importe de esa partida del total.",
      };
    }
    if (padre?.id !== elegido.id) {
      return {
        ok: false,
        error:
          `El codigo ${codigo} no cuelga de "${elegido.codigoPartida}", sino de ` +
          `"${codigoDelPadre ?? "la raiz"}". Corrige el codigo o elige el otro capitulo.`,
      };
    }
  }

  const metrado = nueva.metrado ? normalizarDecimal(nueva.metrado, 4) : null;
  const precioUnitario = nueva.precioUnitario
    ? normalizarDecimal(nueva.precioUnitario, 4)
    : null;

  if (nueva.metrado && metrado === null) {
    return { ok: false, error: "El metrado no es un numero valido." };
  }
  if (nueva.precioUnitario && precioUnitario === null) {
    return { ok: false, error: "El precio unitario no es un numero valido." };
  }
  if (metrado && noCabe(metrado, ENTEROS_METRADO)) {
    return {
      ok: false,
      error: `El metrado no puede pasar de ${ENTEROS_METRADO} digitos enteros.`,
    };
  }
  if (precioUnitario && noCabe(precioUnitario, ENTEROS_PRECIO)) {
    return {
      ok: false,
      error: `El precio unitario no puede pasar de ${ENTEROS_PRECIO} digitos enteros.`,
    };
  }

  /**
   * El importe depende de COMO este contratada, no solo de las cifras.
   *
   * En precios unitarios sale de multiplicar. En suma alzada es un precio
   * cerrado que se teclea, y multiplicar ahi seria inventarse un importe que
   * nadie pacto. Y una fila de alcance no lleva importe: el suyo vive en su
   * partida padre, y ponerselo la haria CUBRIR a ese padre en `aportantes`,
   * borrando su precio del costo directo.
   */
  const modalidadPedida = nueva.modalidad;
  const importeCerrado = nueva.parcial ? normalizarDecimal(nueva.parcial, 2) : null;

  if (nueva.parcial && importeCerrado === null) {
    return { ok: false, error: "El importe no es un numero valido." };
  }

  const parcial =
    modalidadPedida === "ALCANCE"
      ? null
      : modalidadPedida === "SUMA_ALZADA"
        ? importeCerrado
        : metrado && precioUnitario
          ? multiplicar(metrado, precioUnitario, 2)
          : null;

  /**
   * El importe puede no caber aunque quepan sus dos operandos.
   *
   * Es el caso que ninguna validacion por campo detecta: un metrado de diez
   * digitos y un precio de cinco caben cada uno en su columna, y su producto
   * de quince no cabe en la del importe. La cifra imposible la fabrica el
   * servidor, no quien teclea.
   */
  if (parcial && noCabe(parcial, ENTEROS_IMPORTE)) {
    return {
      ok: false,
      error:
        `El importe sale de ${parcial}, que pasa de ${ENTEROS_IMPORTE} digitos ` +
        `enteros y no cabe. Revisa el metrado y el precio.`,
    };
  }

  // Lo que diga quien la crea; si no dice nada, se deduce como siempre: sin
  // cifras es un capitulo que agrupa, con cifras es una partida.
  //
  // La deduccion sola no basta porque al teclear un presupuesto se escriben
  // primero las filas y despues los precios, y asi todas nacerian capitulo
  // sin vuelta atras.
  const tipo: WbsType =
    nueva.tipo ?? (metrado || precioUnitario ? "PARTIDA" : "CAPITULO");

  // Un capitulo es un titulo: su importe lo calcula la suma de lo que cuelga.
  // Aceptar cifras aqui crearia un capitulo con importe propio, y `aportantes`
  // decidiria entonces que el capitulo cuenta y sus hijas no, borrando el
  // importe de estas sin un solo error.
  if (tipo === "CAPITULO" && (metrado || precioUnitario || importeCerrado)) {
    return {
      ok: false,
      error:
        "Un capitulo no lleva metrado ni precio: su importe es la suma de las " +
        "partidas que cuelgan de el.",
    };
  }

  if (tipo === "CAPITULO" && modalidadPedida) {
    return {
      ok: false,
      error: "Un capitulo no tiene modalidad: su importe es la suma de sus partidas.",
    };
  }

  if (modalidadPedida === "SUMA_ALZADA" && importeCerrado === null) {
    return {
      ok: false,
      error:
        "Una partida a suma alzada necesita su importe cerrado: es el precio " +
        "pactado por todo el alcance, y no sale de multiplicar el metrado.",
    };
  }

  const profundidades = calcularProfundidades([...codigos]);

  /**
   * Se coloca detras de la ULTIMA de sus hermanas, no detras de su padre.
   *
   * Con `padre.orden + 1` cada fila nueva se metia la primera del capitulo, y
   * teclear 2.1, 2.2 y 2.3 seguidas las dejaba al reves. Nadie escribe un
   * presupuesto de abajo arriba.
   *
   * Las hermanas se buscan por `parentId` y no por el prefijo del codigo,
   * porque el codigo admite convenciones donde "7.02.01" es hija de
   * "7.02.00" pese a tener los mismos segmentos.
   */
  const hermanas = padre
    ? existentes.filter((e) => e.parentId === padre.id)
    : existentes.filter((e) => e.parentId === null);

  const ultima = hermanas.length
    ? Math.max(...hermanas.map((h) => h.orden))
    : (padre?.orden ?? Math.max(0, ...existentes.map((e) => e.orden)));

  const orden = ultima + 1;

  const creada = await prisma.$transaction(async (tx) => {
    // Se abre hueco en la numeracion para no dejar dos partidas con el
    // mismo orden, que las mostraria en un orden impredecible.
    await tx.wbsItem.updateMany({
      where: { projectId: obraId, orden: { gte: orden } },
      data: { orden: { increment: 1 } },
    });

    return tx.wbsItem.create({
      data: {
        projectId: obraId,
        parentId: padre?.id ?? null,
        codigoPartida: codigo,
        tipo,
        ...(modalidadPedida ? { modalidad: modalidadPedida } : {}),
        descripcion: descripcion.slice(0, 500),
        nivel: profundidades.get(codigo) ?? 0,
        orden,
        // Nacio aqui, no de un archivo. Es lo que hace que el importador
        // avise antes de barrerla en un reemplazo: esta partida no esta en
        // ningun Excel y borrarla la pierde para siempre.
        origen: "MANUAL",
        unidad: nueva.unidad?.trim() ? nueva.unidad.trim().slice(0, 20) : null,
        metrado,
        precioUnitario,
        parcial,
      },
      select: { id: true },
    });
  });

  await auditar({
    sesion,
    projectId: obraId,
    entidadId: creada.id,
    accion: "CREATE",
    despues: { codigo, descripcion, metrado, precioUnitario, parcial },
  });

  return { ok: true, datos: { id: creada.id } };
}


/**
 * Cierra los huecos de la numeracion del presupuesto.
 *
 * Borrar el capitulo 1 no renumera nada: quedan 2, 3, 4. Esto los vuelve a
 * dejar 1, 2, 3, y lo mismo con las partidas de cada capitulo.
 *
 * Es la operacion mas delicada del presupuesto y por eso va cerrada por todos
 * lados. La jerarquia sale del TEXTO del codigo (`codigoPadre`), asi que
 * cambiar un codigo cambia quien cubre a quien en el reparto del costo
 * directo: renumerar mal no da un error, MUEVE DINERO. La red es la
 * comparacion de `sumarHojas` antes y despues, y es innegociable.
 */
export async function renumerarPartidas(
  sesion: SesionActiva,
  obraId: string,
): Promise<Resultado<{ cambiadas: number }>> {
  if (!puede(sesion, "partida:editar")) {
    return { ok: false, error: "No tienes permiso para editar partidas." };
  }

  const obra = await prisma.project.findFirst({
    where: { id: obraId, companyId: sesion.companyId },
    select: { id: true, estado: true, archivadaEn: true },
  });
  if (!obra) return { ok: false, error: "Obra no encontrada." };

  const noAdmite = motivoNoAdmiteCambios(obra);
  if (noAdmite) return { ok: false, error: noAdmite };

  /**
   * Ninguna revision, ni congelada ni en borrador.
   *
   * La congelada es evidente: sus `BaselineItem` guardan el codigo como acta
   * de lo que se firmo y no se tocan. La de BORRADOR es el fallo silencioso
   * mas caro: si no se arrastrara y alguien la aprobara despues, cada partida
   * quedaria con base 0,00 y el presupuesto vigente mentiria entero. Y no
   * existe forma de descartar un borrador, asi que prohibir es mas honesto
   * que arrastrar una copia que el esquema llama inmutable.
   */
  const revision = await prisma.baseline.findFirst({
    where: { projectId: obraId },
    select: { version: true, aprobadaAt: true },
    orderBy: { version: "desc" },
  });

  if (revision) {
    return {
      ok: false,
      error:
        revision.aprobadaAt === null
          ? `Hay una revision v${revision.version} en borrador. Renumerar ahora la dejaria con importes que no corresponden.`
          : `El presupuesto esta congelado (linea base v${revision.version}): los codigos ya estan citados en ella.`,
    };
  }

  const partidas = await prisma.wbsItem.findMany({
    where: { projectId: obraId },
    select: {
      id: true,
      codigoPartida: true,
      parentId: true,
      orden: true,
      parcial: true,
    },
    orderBy: { orden: "asc" },
  });

  /**
   * El tipo de cada fila, que decide si su importe cuenta.
   *
   * La aplicacion ANULA el importe de los capitulos antes de repartir el costo
   * directo (`listarPartidas`, `presupuesto-obra`, revisiones y movimientos lo
   * hacen los seis igual). Una red que sumara las filas tal cual estaria
   * sumando un arbol distinto del que se lee en pantalla, y un capitulo con
   * importe propio la cegaba entera.
   */
  const tipos = new Map(
    (
      await prisma.wbsItem.findMany({
        where: { projectId: obraId },
        select: { id: true, tipo: true },
      })
    ).map((p) => [p.id, p.tipo]),
  );

  if (partidas.length === 0) {
    return { ok: false, error: "Esta obra no tiene partidas que renumerar." };
  }

  /**
   * Los dos arboles tienen que decir lo mismo ANTES de tocar nada.
   *
   * Se renumera siguiendo `parentId` —el que se ve en la tabla— pero el dinero
   * lo reparte el CODIGO. Mientras coincidan, renumerar es presentacion pura.
   * Cuando discrepan —pasa en presupuestos importados a los que despues se les
   * anadieron capitulos, o al teclear "3.02" antes de que exista "3"— cualquier
   * renumeracion es una apuesta. Se niega y se dice QUE fila no cuadra, en vez
   * de arreglarla por cuenta propia.
   */
  const codigosActuales = new Set(partidas.map((p) => p.codigoPartida));
  const idPorCodigo = new Map(partidas.map((p) => [p.codigoPartida, p.id]));

  for (const p of partidas) {
    const porCodigo = codigoPadre(p.codigoPartida, codigosActuales);
    const esperado = porCodigo === null ? null : (idPorCodigo.get(porCodigo) ?? null);

    if (esperado !== p.parentId) {
      const dondeEsta = partidas.find((o) => o.id === p.parentId)?.codigoPartida;
      return {
        ok: false,
        error:
          `No se puede renumerar: "${p.codigoPartida}" figura dentro de ` +
          `"${dondeEsta ?? "la raiz"}", pero su codigo dice que cuelga de ` +
          `"${porCodigo ?? "la raiz"}". Corrige esa partida primero: ` +
          `renumerar con esa discrepancia moveria dinero de sitio.`,
      };
    }
  }

  const { cambios, problema } = calcularRenumeracion(
    partidas.map((p) => ({
      id: p.id,
      codigo: p.codigoPartida,
      parentId: p.parentId,
      orden: p.orden,
    })),
  );

  if (problema) return { ok: false, error: problema };
  if (cambios.size === 0) {
    return { ok: true, datos: { cambiadas: 0 } };
  }

  /**
   * La red: renumerar es una operacion de PRESENTACION y no puede mover un sol.
   *
   * `sumarHojas` decide que partida cuenta y cual queda cubierta por una
   * descendiente costeada. Se renumera siguiendo `parentId` —el arbol que se
   * ve— pero el dinero lo reparte el CODIGO, y en un presupuesto importado los
   * dos arboles pueden discrepar. Si discrepan, esto lo caza aqui.
   */
  const importes = partidas.map((p) => ({
    id: p.id,
    codigo: p.codigoPartida,
    // Capitulos anulados, el mismo criterio que aplican las otras seis
    // llamadas del sistema. Sin esto la red suma otro arbol.
    parcial:
      tipos.get(p.id) === "PARTIDA" ? (p.parcial?.toString() ?? null) : null,
  }));

  /**
   * Lo que no puede cambiar no es el total: es QUIEN CUENTA.
   *
   * Comparar un escalar deja pasar dos cambios de cobertura que se compensen
   * —una partida que empieza a contar y otra que deja de hacerlo por el mismo
   * importe—, y tambien deja pasar que el dinero cambie de capitulo mientras
   * la obra suma igual. `aportantes` devuelve las filas que de verdad entran
   * en el costo directo; si ese conjunto cambia, no es una renumeracion.
   */
  const renumerado = importes.map((n) => ({
    ...n,
    codigo: cambios.get(n.id) ?? n.codigo,
  }));

  const cuentanAntes = new Set(aportantes(importes).map((n) => n.id));
  const cuentanDespues = new Set(aportantes(renumerado).map((n) => n.id));

  const mismosQueCuentan =
    cuentanAntes.size === cuentanDespues.size &&
    [...cuentanAntes].every((id) => cuentanDespues.has(id));

  if (!mismosQueCuentan) {
    return {
      ok: false,
      error:
        "No se puede renumerar: cambiaria que partidas cuentan en el costo " +
        "directo. Renumerar solo puede cambiar los numeros, nunca quien " +
        "aporta el dinero.",
    };
  }

  const totalAntes = sumarHojas(importes);
  const totalDespues = sumarHojas(
    importes.map((n) => ({
      codigo: cambios.get(n.id) ?? n.codigo,
      parcial: n.parcial,
    })),
  );

  if (totalAntes !== totalDespues) {
    return {
      ok: false,
      error:
        `No se puede renumerar: el costo directo pasaria de ${totalAntes} a ` +
        `${totalDespues}. En esta obra el arbol que se ve y el que dicen los ` +
        `codigos no coinciden, y cerrar los huecos moveria dinero de sitio.`,
    };
  }

  const mapeos = await prisma.mapeoTareaPartida.findMany({
    where: { projectId: obraId },
    select: { id: true, codigoPartida: true },
  });

  const nuevoPorCodigo = new Map<string, string>();
  for (const p of partidas) {
    const nuevo = cambios.get(p.id);
    if (nuevo) nuevoPorCodigo.set(p.codigoPartida, nuevo);
  }

  /**
   * Un mapeo colgado no se puede arrastrar: se resucitaria sobre otra partida.
   *
   * Si una fila del mapeo apunta a un codigo que ya no existe —porque esa
   * partida se borro— y la renumeracion le da ESE codigo a otra distinta, el
   * avance de la tarea empezaria a valorizar contra una partida que nunca
   * cubrio, sin que nada avise. Es un problema previo a la renumeracion, y se
   * dice en vez de heredarlo.
   */
  const colgados = mapeos.filter((m) => !codigosActuales.has(m.codigoPartida));

  if (colgados.length > 0) {
    const cuales = [...new Set(colgados.map((m) => m.codigoPartida))].slice(0, 3);
    return {
      ok: false,
      error:
        `No se puede renumerar: el cronograma sigue enlazado a ${colgados.length} ` +
        `partida(s) que ya no existen (${cuales.join(", ")}). Renumerar les daria ` +
        `esos codigos a otras partidas y el avance valorizaria donde no debe.`,
    };
  }

  /**
   * Se pasan TODAS las filas del mapeo por las dos fases, no solo las que
   * cambian: `@@unique([projectId, uid, codigoPartida])` tambien choca contra
   * una fila que NO se mueve y que ya ocupa el codigo de destino.
   */
  const mapeosAMover = mapeos;

  await prisma.$transaction(
    async (tx) => {
      /**
       * Dos fases, porque MariaDB no tiene restricciones diferidas.
       *
       * `@@unique([projectId, codigoPartida])` revienta a mitad del camino: al
       * cerrar huecos el 3.0 pasa a 2.0 mientras el 2.0 todavia existe. Se
       * escribe primero a un codigo imposible —lleva "#", que el formato de
       * codigo no admite— y despues al definitivo.
       */
      /**
       * La foto se leyo FUERA de la transaccion.
       *
       * Si mientras tanto alguien creo, borro o renombro una partida, el plan
       * calculado ya no describe esta obra: aplicarlo dejaria filas fuera del
       * arbol o le daria a una el codigo de otra. Se comprueba aqui dentro,
       * antes de la primera escritura, y se aborta entero.
       */
      const ahora = await tx.wbsItem.findMany({
        where: { projectId: obraId },
        select: { id: true, codigoPartida: true },
      });

      const movida =
        ahora.length !== partidas.length ||
        ahora.some((f) => idPorCodigo.get(f.codigoPartida) !== f.id);

      if (movida) {
        throw new Error(
          "AVISO: el presupuesto cambio mientras se renumeraba. No se ha " +
            "tocado nada; vuelve a intentarlo.",
        );
      }

      let n = 0;
      for (const id of cambios.keys()) {
        await tx.wbsItem.update({
          where: { id },
          data: { codigoPartida: `#${n++}` },
        });
      }

      for (const [id, nuevo] of cambios) {
        await tx.wbsItem.update({
          where: { id },
          // Renumerada es tocada a mano: si se reimporta el Excel, el aviso de
          // reemplazo debe contar estas filas como trabajo que se perderia.
          data: { codigoPartida: nuevo, editadaAMano: true },
        });
      }

      // Lo mismo con el mapeo del cronograma, que tiene su propio indice unico
      // y es lo que convierte el avance de una tarea en dinero de una partida.
      let m = 0;
      for (const mapeo of mapeosAMover) {
        await tx.mapeoTareaPartida.update({
          where: { id: mapeo.id },
          data: { codigoPartida: `#${m++}` },
        });
      }

      for (const mapeo of mapeosAMover) {
        await tx.mapeoTareaPartida.update({
          where: { id: mapeo.id },
          data: {
            // Las que no cambian vuelven a su mismo codigo: han pasado por la
            // fase temporal solo para no chocar con las que si cambian.
            codigoPartida:
              nuevoPorCodigo.get(mapeo.codigoPartida) ?? mapeo.codigoPartida,
          },
        });
      }
    },
    { timeout: 60_000 },
  );

  await auditar({
    sesion,
    projectId: obraId,
    entidadId: obraId,
    accion: "UPDATE",
    antes: { renumeracion: "cerrar huecos", costoDirecto: totalAntes },
    despues: {
      cambios: Object.fromEntries(
        partidas
          .filter((p) => cambios.has(p.id))
          .map((p) => [p.codigoPartida, cambios.get(p.id)!]),
      ),
      mapeosArrastrados: mapeosAMover.length,
      costoDirecto: totalDespues,
    },
  });

  return { ok: true, datos: { cambiadas: cambios.size } };
}
