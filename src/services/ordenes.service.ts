import "server-only";
import { prisma } from "@/lib/prisma";
import { puede } from "@/lib/rbac";
import { esPositivo, sumar } from "@/lib/decimal";
import {
  calcularCascadaOrden,
  descuadreDelReparto,
  importeDeOrden,
  importeImputable,
  permisoParaEliminar,
  sumarLineas,
  type TipoImpuesto,
} from "@/lib/ordenes";
import {
  contarPaginas,
  normalizarPagina,
  saltar,
  POR_PAGINA,
  type Pagina,
} from "@/lib/paginacion";
import type { SesionActiva } from "@/services/sesion.service";
import type {
  EstadoOrden,
  OrigenRegistro,
  TipoOrden,
} from "@/generated/prisma/enums";
import type { Prisma } from "@/generated/prisma/client";

/**
 * Ordenes de compra y de servicio.
 *
 * De aqui sale el COMPROMETIDO: lo que ya se pacto con proveedores aunque
 * todavia no se haya recibido ni pagado.
 *
 * SE MIDE CONTRA EL IMPORTE IMPUTABLE, que no siempre es el neto. La regla la
 * fija `lib/ordenes.importeImputable` y depende del impuesto de la orden:
 *
 *   - Con IGV: cuenta el NETO. El IGV que factura el proveedor es credito
 *     fiscal y no costo de obra; repartir el total inflaria la obra con
 *     dinero que se recupera.
 *   - Con retencion de renta, o sin impuesto: cuenta el TOTAL. Ahi no hay
 *     nada que recuperar —lo retenido se paga igual, solo que a SUNAT en vez
 *     de al proveedor—, asi que descontarlo dejaria fuera un 8% de dinero
 *     realmente comprometido.
 *
 * De ahi que decir «el comprometido va sin IGV» sea correcto solo para las
 * ordenes con IGV. En las demas no hay IGV que quitar y la cifra es el total.
 *
 * Dos reglas gobiernan el modulo, y las dos se comprueban al APROBAR, que es
 * cuando la orden empieza a contar:
 *
 *   1. La suma de las imputaciones es igual al importe imputable. Sin eso, el
 *      comprometido de las partidas no cuadra con lo que se pidio de verdad.
 *   2. La suma de las lineas que no son agrupadoras es igual al subtotal. Las
 *      ordenes reales abren cada bloque con una linea que repite la suma de
 *      sus hijas, y contarla otra vez duplica el importe.
 */


export interface LineaEntrada {
  esAgrupador: boolean;
  nivel?: number;
  cantidad?: string;
  unidad?: string;
  descripcion: string;
  precioUnitario?: string;
  importe: string;
}

export interface ImputacionEntrada {
  wbsItemId: string;
  importe: string;
}

export interface DatosOrden {
  proveedorId: string;
  numero: string;
  tipo: TipoOrden;
  fecha: string;
  descripcion: string;
  referencia?: string;
  formaPago?: string;
  observaciones?: string;
  /// El subtotal se toma de las lineas cuando las hay. Las ordenes
  /// historicas se cargan solo por cabecera, y entonces se indica aqui.
  subtotal?: string;
  descuentoComercial?: string;
  /// Que impuesto lleva. Si no viene, se hereda del proveedor.
  tipoImpuesto?: TipoImpuesto;
  /// Fraccion: "0.18". La traduccion desde porcentaje vive en la frontera.
  porcentajeIgv: string;
  lineas: LineaEntrada[];
  imputaciones: ImputacionEntrada[];
  /// Guardar las partidas imputadas como habituales de este proveedor en
  /// esta obra, para que la proxima orden las traiga puestas.
  recordarPartidas?: boolean;
}

export type ResultadoOrden =
  | { ok: true; id: string; numero: string }
  | { ok: false; error: string };

/** Comprobaciones baratas sobre lo que llego, antes de tocar la base. */
function validarEntrada(datos: DatosOrden): string | null {
  if (!datos.numero.trim()) return "Indica el numero de la orden.";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(datos.fecha)) {
    return "Indica la fecha del documento.";
  }
  if (!datos.descripcion.trim()) {
    return "Indica de que es la orden, como aparece en el documento.";
  }
  if (!datos.proveedorId) return "Elige el proveedor.";

  if (datos.lineas.length === 0 && !datos.subtotal) {
    return "Una orden sin lineas necesita al menos su subtotal.";
  }

  if (datos.imputaciones.length === 0) {
    return "Indica contra que partidas se imputa la orden.";
  }

  const partidas = datos.imputaciones.map((i) => i.wbsItemId);
  if (new Set(partidas).size !== partidas.length) {
    return "Hay dos imputaciones sobre la misma partida. Junta los importes en una.";
  }

  return null;
}

export async function crearOrden(
  sesion: SesionActiva,
  obraId: string,
  datos: DatosOrden,
  origen: OrigenRegistro = "MANUAL",
): Promise<ResultadoOrden> {
  if (!puede(sesion, "orden:crear")) {
    return { ok: false, error: "No tienes permiso para registrar ordenes." };
  }

  const errorEntrada = validarEntrada(datos);
  if (errorEntrada) return { ok: false, error: errorEntrada };

  const numero = datos.numero.trim().slice(0, 30);

  /**
   * El proveedor se busca ANTES de calcular nada, y no con el resto de
   * comprobaciones contra la base, porque de el sale que impuesto lleva la
   * orden. Y el impuesto no es un adorno del final: decide si el total se
   * suma o se eleva, y contra que cifra se reparte el comprometido.
   */
  const proveedor = await prisma.proveedor.findFirst({
    where: { id: datos.proveedorId, companyId: sesion.companyId },
    select: {
      id: true,
      activo: true,
      razonSocial: true,
      tipoImpuesto: true,
    },
  });
  if (!proveedor) return { ok: false, error: "Proveedor no encontrado." };
  if (!proveedor.activo) {
    return {
      ok: false,
      error: `"${proveedor.razonSocial}" esta desactivado. Vuelve a activarlo si le vas a comprar.`,
    };
  }

  // --- Importes, con la aritmetica exacta ---------------------------------
  const lineas: { entrada: LineaEntrada; importe: string }[] = [];
  for (const linea of datos.lineas) {
    const importe = importeDeOrden(linea.importe);
    if (importe === null) {
      return {
        ok: false,
        error: `El importe "${linea.importe}" no es valido. Las ordenes no llevan importes en negativo.`,
      };
    }
    lineas.push({ entrada: linea, importe });
  }

  // El subtotal sale de las lineas cuando las hay, y solo se acepta a mano
  // en las ordenes de cabecera. Asi una orden con detalle no puede declarar
  // un subtotal que sus propias lineas desmientan.
  const subtotal =
    lineas.length > 0
      ? sumarLineas(
          lineas.map((l) => ({
            esAgrupador: l.entrada.esAgrupador,
            importe: l.importe,
          })),
        )
      : importeDeOrden(datos.subtotal ?? "");

  if (subtotal === null) {
    return { ok: false, error: "El subtotal no es un numero valido." };
  }

  const descuento = importeDeOrden(datos.descuentoComercial ?? "0") ?? "0.00";
  // Se hereda del proveedor salvo que la orden diga otra cosa: quien factura
  // factura siempre, y acertar esto a mano en cada orden seria pedir el
  // error.
  const tipoImpuesto = datos.tipoImpuesto ?? proveedor.tipoImpuesto;
  const cascada = calcularCascadaOrden({
    subtotal,
    descuentoComercial: descuento,
    tipoImpuesto,
    porcentajeIgv: datos.porcentajeIgv,
  });

  // Contra que cifra cuenta la orden. Con IGV es el neto, porque el impuesto
  // se recupera; con retencion de renta es el total, porque no se recupera.
  const imputable = importeImputable({ tipoImpuesto, ...cascada });

  if (!esPositivo(cascada.neto)) {
    return {
      ok: false,
      error: `El neto de la orden sale en ${cascada.neto}. Revisa el subtotal y el descuento comercial.`,
    };
  }

  const imputaciones: { wbsItemId: string; importe: string }[] = [];
  for (const imputacion of datos.imputaciones) {
    const importe = importeDeOrden(imputacion.importe);
    if (importe === null) {
      return {
        ok: false,
        error: `El importe imputado "${imputacion.importe}" no es valido.`,
      };
    }
    imputaciones.push({ wbsItemId: imputacion.wbsItemId, importe });
  }

  // La invariante. Se comprueba ya al guardar el borrador, aunque se vuelva a
  // comprobar al aprobar: descubrirlo al final obligaria a rehacer el reparto
  // entero sin tener delante las cifras.
  const descuadre = descuadreDelReparto(
    imputable,
    imputaciones.map((i) => i.importe),
  );

  if (descuadre !== null) {
    // Se dice de que lado falta, no solo que no cuadra: con varias partidas
    // delante, "faltan 1,980.00" es accionable. Y se nombra la cifra contra
    // la que hay que cuadrar, que no es la misma en los dos impuestos:
    // repartir el total en una orden con IGV es el error mas probable, y
    // repartir el neto en una con retencion lo es en la otra direccion.
    const sobra = esPositivo(descuadre);
    const magnitud = sobra ? descuadre : descuadre.slice(1);

    const explicacion =
      tipoImpuesto === "IGV"
        ? "el neto de la orden, SIN IGV, porque el IGV se recupera"
        : "el total de la orden, retencion incluida, porque la retencion no se recupera";

    return {
      ok: false,
      error: `El reparto entre partidas suma ${sumar(imputaciones.map((i) => i.importe))} y hay que repartir ${imputable}: ${sobra ? "sobran" : "faltan"} ${magnitud}. Se imputa ${explicacion}.`,
    };
  }

  // --- Comprobaciones contra la base --------------------------------------
  const obra = await prisma.project.findFirst({
    where: { id: obraId, companyId: sesion.companyId },
    select: { id: true },
  });
  if (!obra) return { ok: false, error: "Obra no encontrada." };

  /**
   * El numero repetido se comprueba aqui para decir QUE orden lo ocupa.
   *
   * Es tambien lo que impide que las dos vias de carga se pisen: da igual que
   * la orden entrara tecleada o desde un archivo, el numero identifica el
   * documento y la clave unica de la base lo cierra por debajo. El importador
   * topa con esto mismo, y por eso tiene que ensenar lo que ya existe en vez
   * de insertarlo otra vez.
   */
  const ocupado = await prisma.ordenCompra.findFirst({
    where: { companyId: sesion.companyId, numero },
    select: { id: true, descripcion: true, estado: true },
  });

  if (ocupado) {
    return {
      ok: false,
      error: `La orden ${numero} ya existe ("${ocupado.descripcion}", ${ocupado.estado.toLowerCase()}). Cada numero identifica un documento.`,
    };
  }

  // Las partidas imputadas tienen que ser de ESTA obra y llevar importe
  // propio. Una de alcance no lo tiene: su dinero vive en la partida padre,
  // y comprometer contra ella dejaria el gasto colgando de nada.
  const partidas = await prisma.wbsItem.findMany({
    where: {
      id: { in: imputaciones.map((i) => i.wbsItemId) },
      projectId: obraId,
    },
    select: { id: true, codigoPartida: true, tipo: true, modalidad: true },
  });
  const porId = new Map(partidas.map((p) => [p.id, p]));

  for (const imputacion of imputaciones) {
    const partida = porId.get(imputacion.wbsItemId);
    if (!partida) {
      return {
        ok: false,
        error: "Una de las partidas imputadas no existe en esta obra.",
      };
    }
    if (partida.tipo !== "PARTIDA") {
      return {
        ok: false,
        error: `"${partida.codigoPartida}" es un capitulo. El gasto se imputa a las partidas, no a los capitulos.`,
      };
    }
    if (partida.modalidad === "ALCANCE") {
      return {
        ok: false,
        error: `"${partida.codigoPartida}" solo detalla el alcance de otra partida y no lleva importe propio. Imputa a la partida padre.`,
      };
    }
  }

  const texto = (v: string | undefined, largo: number) =>
    v?.trim() ? v.trim().slice(0, largo) : null;

  const creada = await prisma.$transaction(async (tx) => {
    const orden = await tx.ordenCompra.create({
      data: {
        companyId: sesion.companyId,
        projectId: obraId,
        proveedorId: proveedor.id,
        numero,
        tipo: datos.tipo,
        estado: "BORRADOR",
        origen,
        fecha: new Date(datos.fecha),
        referencia: texto(datos.referencia, 60),
        descripcion: datos.descripcion.trim().slice(0, 255),
        formaPago: texto(datos.formaPago, 5000),
        observaciones: texto(datos.observaciones, 5000),
        subtotal: cascada.subtotal,
        descuentoComercial: cascada.descuentoComercial,
        tipoImpuesto,
        neto: cascada.neto,
        impuesto: cascada.impuesto,
        total: cascada.total,
        lineas: {
          create: lineas.map((l, i) => ({
            orden: i,
            nivel: l.entrada.nivel ?? 0,
            esAgrupador: l.entrada.esAgrupador,
            cantidad: l.entrada.cantidad || null,
            unidad: texto(l.entrada.unidad, 20),
            descripcion: l.entrada.descripcion.trim(),
            precioUnitario: l.entrada.precioUnitario || null,
            importe: l.importe,
          })),
        },
        imputaciones: { create: imputaciones },
      },
      select: { id: true, numero: true },
    });

    /**
     * Se recuerdan las partidas para este proveedor en esta obra.
     *
     * `createMany` con `skipDuplicates` y no un borrado previo: la intencion
     * es ANADIR a lo que ya se sabe, no sustituirlo. Una orden pequena de un
     * proveedor que normalmente hace cinco partidas no debe reducir su lista
     * a la unica que trajo esta vez.
     */
    if (datos.recordarPartidas) {
      await tx.proveedorPartida.createMany({
        data: imputaciones.map((i) => ({
          proveedorId: proveedor.id,
          wbsItemId: i.wbsItemId,
        })),
        skipDuplicates: true,
      });
    }

    await tx.auditLog.create({
      data: {
        companyId: sesion.companyId,
        userId: sesion.userId,
        projectId: obraId,
        entidad: "OrdenCompra",
        entidadId: orden.id,
        accion: "CREATE",
        despues: {
          numero: orden.numero,
          proveedor: proveedor.razonSocial,
          tipo: datos.tipo,
          origen,
          tipoImpuesto,
          neto: cascada.neto,
          impuesto: cascada.impuesto,
          total: cascada.total,
          lineas: lineas.length,
          imputaciones: imputaciones.length,
        },
      },
    });

    return orden;
  });

  return { ok: true, id: creada.id, numero: creada.numero };
}

// ---------------------------------------------------------------------------
// Aprobacion y anulacion
// ---------------------------------------------------------------------------

/** Se lanza dentro de la transaccion; se traduce a un error legible fuera. */
class FalloOrden extends Error {}

export type ResultadoSimple =
  | { ok: true; numero: string }
  | { ok: false; error: string };

/**
 * Aprueba una orden: a partir de aqui cuenta en el comprometido.
 *
 * Se vuelven a comprobar las dos reglas contra lo que hay GUARDADO, no contra
 * lo que dijo el formulario: entre el borrador y la aprobacion pudo editarse
 * cualquier cosa.
 *
 * A diferencia de aprobar una linea base o un movimiento, esto SI se puede
 * deshacer: una orden aprobada se anula. Cancelar un pedido a un proveedor es
 * corriente y el sistema tiene que admitirlo sin obligar a inventar un
 * documento de signo contrario.
 */
export async function aprobarOrden(
  sesion: SesionActiva,
  ordenId: string,
): Promise<ResultadoSimple> {
  if (!puede(sesion, "orden:aprobar")) {
    return { ok: false, error: "No tienes permiso para aprobar ordenes." };
  }

  const aprobadaPor = `${sesion.nombres} ${sesion.apellidos} (${sesion.email})`
    .trim()
    .slice(0, 150);

  try {
    const numero = await prisma.$transaction(async (tx) => {
      const orden = await tx.ordenCompra.findFirst({
        where: { id: ordenId, company: { id: sesion.companyId } },
        select: {
          id: true,
          projectId: true,
          numero: true,
          estado: true,
          subtotal: true,
          tipoImpuesto: true,
          neto: true,
          total: true,
          lineas: { select: { esAgrupador: true, importe: true } },
          imputaciones: { select: { importe: true } },
        },
      });

      if (!orden) throw new FalloOrden("Orden no encontrada.");
      if (orden.estado === "APROBADA") {
        throw new FalloOrden(`La orden ${orden.numero} ya estaba aprobada.`);
      }
      if (orden.estado === "ANULADA") {
        throw new FalloOrden(
          `La orden ${orden.numero} esta anulada. Registra una nueva en su lugar.`,
        );
      }

      // Regla 1: el reparto suma el importe imputable, que no es el neto en
      // las ordenes con retencion. Se recalcula desde lo guardado y no se
      // confia en lo que dijo el formulario.
      const imputable = importeImputable({
        tipoImpuesto: orden.tipoImpuesto,
        neto: orden.neto.toString(),
        total: orden.total.toString(),
      });

      const descuadre = descuadreDelReparto(
        imputable,
        orden.imputaciones.map((i) => i.importe.toString()),
      );
      if (descuadre !== null) {
        throw new FalloOrden(
          `El reparto entre partidas no cuadra: hay que repartir ${imputable} y difiere en ${descuadre}. Corrigelo antes de aprobar.`,
        );
      }

      // Regla 2: las lineas que llevan dinero suman el subtotal. Solo aplica
      // si la orden tiene detalle; las historicas se cargan por cabecera.
      if (orden.lineas.length > 0) {
        const deLineas = sumarLineas(
          orden.lineas.map((l) => ({
            esAgrupador: l.esAgrupador,
            importe: l.importe.toString(),
          })),
        );

        if (deLineas !== orden.subtotal.toString()) {
          throw new FalloOrden(
            `Las lineas suman ${deLineas} y el subtotal dice ${orden.subtotal.toString()}. Revisa que las lineas que solo repiten el total de su bloque esten marcadas como agrupadoras.`,
          );
        }
      }

      // La condicion sobre el estado cierra la carrera de dos pulsaciones: la
      // segunda no encuentra fila que cambiar.
      const { count } = await tx.ordenCompra.updateMany({
        where: { id: orden.id, estado: "BORRADOR" },
        data: { estado: "APROBADA", aprobadaAt: new Date(), aprobadaPor },
      });
      if (count === 0) {
        throw new FalloOrden(`La orden ${orden.numero} ya estaba aprobada.`);
      }

      await tx.auditLog.create({
        data: {
          companyId: sesion.companyId,
          userId: sesion.userId,
          projectId: orden.projectId,
          entidad: "OrdenCompra",
          entidadId: orden.id,
          accion: "APPROVE",
          antes: { estado: "BORRADOR" },
          despues: {
            numero: orden.numero,
            estado: "APROBADA",
            aprobadaPor,
            /**
             * Lo que se compromete es el IMPUTABLE, no el neto.
             *
             * En una orden con retencion de renta lo que cuenta contra el
             * presupuesto es el total, no el neto: el impuesto retenido se
             * paga igual, solo que a SUNAT en vez de al proveedor. Anotar el
             * neto subestimaba el apunte un 8% justo en esas ordenes.
             *
             * No afectaba a ninguna cifra de control —esas salen de
             * `OrdenImputacion`, no del registro—, pero un historial que no
             * cuadra con la realidad no sirve para auditar nada.
             */
            comprometido: imputable,
            neto: orden.neto.toString(),
          },
        },
      });

      return orden.numero;
    });

    return { ok: true, numero };
  } catch (e) {
    if (e instanceof FalloOrden) return { ok: false, error: e.message };
    throw e;
  }
}

/**
 * Borra una orden. Solo BORRADOR y ANULADA.
 *
 * Ninguna de las dos cuenta en el comprometido —`obtenerComprometido` solo
 * suma las APROBADAS—, asi que borrarlas **no revierte nada**: ya valian
 * cero. Lo unico que se pierde es el registro, y por eso el `AuditLog` se
 * escribe ANTES de borrar, con las cifras dentro: la orden desaparece de la
 * lista pero queda rastro de que existio y de quien la quito.
 *
 * Una APROBADA no se borra: se anula, que revierte el comprometido igual y
 * conserva la orden con su motivo. Es la regla del modulo —«anular no es
 * borrar»— y aqui se sostiene.
 *
 * El permiso depende del estado: descartar un borrador es parte de
 * redactarlo (`orden:crear`), pero purgar una anulada es un acto destructivo
 * sobre el ciclo de vida de la orden (`orden:anular`).
 */
export async function eliminarOrden(
  sesion: SesionActiva,
  ordenId: string,
): Promise<{ ok: true; numero: string } | { ok: false; error: string }> {
  const orden = await prisma.ordenCompra.findFirst({
    where: { id: ordenId, companyId: sesion.companyId },
    select: {
      id: true,
      projectId: true,
      numero: true,
      estado: true,
      tipo: true,
      tipoImpuesto: true,
      neto: true,
      impuesto: true,
      total: true,
      motivoAnulado: true,
      proveedor: { select: { razonSocial: true, ruc: true } },
    },
  });

  if (!orden) return { ok: false, error: "Orden no encontrada." };

  // La regla vive en `lib/ordenes` para poder probarla sin base de datos.
  const permiso = permisoParaEliminar(orden.estado);

  if (permiso === null) {
    return {
      ok: false,
      error: `La orden ${orden.numero} esta aprobada y no se puede borrar. Anulala: deja de contar en el comprometido y se conserva con su motivo.`,
    };
  }

  if (!puede(sesion, permiso)) {
    return {
      ok: false,
      error:
        orden.estado === "BORRADOR"
          ? "No tienes permiso para eliminar borradores de orden."
          : "No tienes permiso para eliminar ordenes anuladas.",
    };
  }

  await prisma.$transaction(async (tx) => {
    // Primero la auditoria y despues el borrado: al reves, si el borrado
    // fallara despues de auditar quedaria un registro de algo que sigue ahi.
    // En este orden, dentro de la transaccion, o se guardan las dos o ninguna.
    await tx.auditLog.create({
      data: {
        companyId: sesion.companyId,
        userId: sesion.userId,
        projectId: orden.projectId,
        entidad: "OrdenCompra",
        entidadId: orden.id,
        accion: "DELETE",
        antes: {
          numero: orden.numero,
          estado: orden.estado,
          tipo: orden.tipo,
          proveedor: orden.proveedor.razonSocial,
          ruc: orden.proveedor.ruc,
          tipoImpuesto: orden.tipoImpuesto,
          neto: orden.neto.toString(),
          impuesto: orden.impuesto.toString(),
          total: orden.total.toString(),
          motivoAnulado: orden.motivoAnulado,
        },
      },
    });

    // Las lineas y las imputaciones se van con ella por la cascada del
    // esquema. Las partidas no se tocan: la relacion desde la imputacion es
    // Restrict justamente para que borrar una orden no arrastre presupuesto.
    await tx.ordenCompra.delete({ where: { id: orden.id } });
  });

  return { ok: true, numero: orden.numero };
}

/**
 * Anula una orden. Deja de contar en el comprometido, pero no se borra.
 *
 * El motivo es obligatorio: dentro de seis meses, "por que se anulo la 00117"
 * es una pregunta que alguien hara, y la respuesta tiene que estar aqui y no
 * en la memoria de quien la anulo.
 */
export async function anularOrden(
  sesion: SesionActiva,
  ordenId: string,
  motivo: string,
): Promise<ResultadoSimple> {
  if (!puede(sesion, "orden:anular")) {
    return { ok: false, error: "No tienes permiso para anular ordenes." };
  }

  if (!motivo.trim()) {
    return { ok: false, error: "Explica por que se anula la orden." };
  }

  const anuladaPor = `${sesion.nombres} ${sesion.apellidos} (${sesion.email})`
    .trim()
    .slice(0, 150);

  const orden = await prisma.ordenCompra.findFirst({
    where: { id: ordenId, companyId: sesion.companyId },
    select: {
      id: true, projectId: true, numero: true, estado: true,
      // El total y el tipo de impuesto hacen falta para saber cuanto se
      // libera de verdad: en una orden con retencion no es el neto.
      neto: true, total: true, tipoImpuesto: true,
    },
  });

  if (!orden) return { ok: false, error: "Orden no encontrada." };
  if (orden.estado === "ANULADA") {
    return { ok: false, error: `La orden ${orden.numero} ya estaba anulada.` };
  }

  const imputable = importeImputable({
    tipoImpuesto: orden.tipoImpuesto,
    neto: orden.neto.toString(),
    total: orden.total.toString(),
  });

  await prisma.$transaction(async (tx) => {
    await tx.ordenCompra.update({
      where: { id: orden.id },
      data: {
        estado: "ANULADA",
        anuladaAt: new Date(),
        anuladaPor,
        motivoAnulado: motivo.trim().slice(0, 5000),
      },
    });

    await tx.auditLog.create({
      data: {
        companyId: sesion.companyId,
        userId: sesion.userId,
        projectId: orden.projectId,
        entidad: "OrdenCompra",
        entidadId: orden.id,
        accion: "UPDATE",
        antes: { estado: orden.estado },
        despues: {
          numero: orden.numero,
          estado: "ANULADA",
          anuladaPor,
          motivo: motivo.trim(),
          // Se deja constancia de cuanto dejo de estar comprometido: es la
          // cifra que cambia en el control al anular. Y es el IMPUTABLE, no el
          // neto: en una orden con retencion lo comprometido era el total, asi
          // que anotar el neto decia que se libera un 8% menos de lo que de
          // verdad se libera.
          liberado: orden.estado === "APROBADA" ? imputable : "0.00",
        },
      },
    });
  });

  return { ok: true, numero: orden.numero };
}

// ---------------------------------------------------------------------------
// Consulta
// ---------------------------------------------------------------------------

export interface ComprometidoPorPartida {
  wbsItemId: string;
  comprometido: string;
}

/**
 * Lo comprometido con proveedores, por partida.
 *
 * Solo cuentan las APROBADAS: un borrador todavia no es un compromiso con
 * nadie, y una anulada dejo de serlo. Ese filtro es la definicion de la
 * columna, no una optimizacion.
 *
 * Devuelve el IMPORTE IMPUTABLE de cada orden, que es el neto en las que
 * llevan IGV y el total en las de retencion o sin impuesto. No es «sin IGV» a
 * secas: eso solo describe al primer caso. Lo que tienen en comun las tres
 * reglas es que ninguna cuenta dinero que la obra vaya a recuperar.
 */
export async function obtenerComprometido(
  sesion: SesionActiva,
  obraId: string,
): Promise<ComprometidoPorPartida[]> {
  if (!puede(sesion, "orden:leer")) return [];

  const porPartida = await prisma.ordenImputacion.groupBy({
    by: ["wbsItemId"],
    where: {
      ordenCompra: {
        projectId: obraId,
        estado: "APROBADA",
        company: { id: sesion.companyId },
      },
    },
    _sum: { importe: true },
  });

  // `_sum` es null cuando no hay filas, y `sumar` no lo tolera. Ademas
  // normaliza a dos decimales: Prisma devuelve "10000" y no "10000.00".
  return porPartida.map((p) => ({
    wbsItemId: p.wbsItemId,
    comprometido: sumar([p._sum.importe?.toString() ?? "0"]),
  }));
}

export interface OrdenResumen {
  id: string;
  numero: string;
  tipo: TipoOrden;
  estado: EstadoOrden;
  origen: OrigenRegistro;
  fecha: Date;
  descripcion: string;
  referencia: string | null;
  formaPago: string | null;
  proveedor: { id: string; razonSocial: string; ruc: string };
  subtotal: string;
  descuentoComercial: string;
  tipoImpuesto: TipoImpuesto;
  neto: string;
  impuesto: string;
  total: string;
  /// La cifra contra la que cuenta esta orden: el neto con IGV, el total con
  /// retencion. Se calcula aqui para que ninguna pantalla tenga que repetir
  /// la regla y equivocarse.
  imputable: string;
  aprobadaAt: Date | null;
  aprobadaPor: string | null;
  anuladaAt: Date | null;
  motivoAnulado: string | null;
  totalLineas: number;
  imputaciones: { codigoPartida: string; descripcion: string; importe: string }[];
}

/**
 * Los proveedores que TIENEN ordenes en esta obra, para el desplegable del
 * filtro.
 *
 * No es el catalogo entero a proposito: ofrecer proveedores que nunca
 * trabajaron aqui solo produce filtros que devuelven cero, y en una empresa
 * con cien proveedores el desplegable seria inservible.
 */
export async function listarProveedoresConOrdenes(
  sesion: SesionActiva,
  obraId: string,
): Promise<{ id: string; razonSocial: string }[]> {
  if (!puede(sesion, "orden:leer")) return [];

  const filas = await prisma.ordenCompra.findMany({
    where: { projectId: obraId, companyId: sesion.companyId },
    distinct: ["proveedorId"],
    select: { proveedor: { select: { id: true, razonSocial: true } } },
    orderBy: { proveedor: { razonSocial: "asc" } },
  });

  return filas.map((f) => f.proveedor);
}

/**
 * Cuantas ordenes tiene la obra, SIN filtrar.
 *
 * Existe aparte del total que devuelve `listarOrdenes` porque aquel cuenta lo
 * que pasa el filtro, y hay cosas que no pueden depender de la busqueda: el
 * panel del comprometido se esconde cuando la obra no tiene ninguna orden, y
 * con el total filtrado desaparecia al escribir algo que no coincide, como si
 * el comprometido se hubiera esfumado.
 */
export async function contarOrdenesDeObra(
  sesion: SesionActiva,
  obraId: string,
): Promise<number> {
  if (!puede(sesion, "orden:leer")) return 0;

  return prisma.ordenCompra.count({
    where: { projectId: obraId, companyId: sesion.companyId },
  });
}

export interface FiltrosOrdenes {
  pagina?: string;
  porPagina?: number;
  /// Texto libre sobre numero, descripcion y referencia.
  q?: string;
  proveedorId?: string;
  /// "YYYY-MM-DD". Una fecha concreta es `desde` = `hasta`.
  desde?: string;
  hasta?: string;
  estado?: string;
}

/** Fecha de filtro, o undefined si no es una fecha utilizable. Lo que no se
 *  entiende se ignora en vez de romper: viene de la URL. */
function fechaFiltro(valor: string | undefined): Date | undefined {
  if (!valor || !/^\d{4}-\d{2}-\d{2}$/.test(valor)) return undefined;
  const fecha = new Date(`${valor}T00:00:00Z`);
  return Number.isNaN(fecha.getTime()) ? undefined : fecha;
}

/**
 * Las ordenes de la obra, filtradas y paginadas.
 *
 * Cada fila arrastra su reparto entre partidas, asi que una obra con
 * doscientas ordenes enviaba al navegador doscientos repartos anidados para
 * ensenar los primeros que caben en pantalla.
 *
 * El `total` es el de las ordenes QUE PASAN EL FILTRO, no el de la pagina ni
 * el de la obra entera: es lo que rotulan las pantallas y lo que da el numero
 * de paginas.
 *
 * El comprometido no sale de aqui —lo calcula `obtenerComprometido` con su
 * propia consulta sobre TODAS las aprobadas—, asi que ni paginar ni filtrar
 * pueden mover la cifra de control de la obra.
 */
export async function listarOrdenes(
  sesion: SesionActiva,
  obraId: string,
  opciones: FiltrosOrdenes = {},
): Promise<Pagina<OrdenResumen>> {
  const porPagina = opciones.porPagina ?? POR_PAGINA;

  if (!puede(sesion, "orden:leer")) {
    return { filas: [], total: 0, pagina: 1, totalPaginas: 1 };
  }

  const texto = opciones.q?.trim();
  const desde = fechaFiltro(opciones.desde);
  const hasta = fechaFiltro(opciones.hasta);

  const estado = (["BORRADOR", "APROBADA", "ANULADA"] as const).find(
    (e) => e === opciones.estado,
  );

  const where: Prisma.OrdenCompraWhereInput = {
    projectId: obraId,
    companyId: sesion.companyId,
    ...(opciones.proveedorId ? { proveedorId: opciones.proveedorId } : {}),
    ...(estado ? { estado } : {}),
    // `hasta` incluye el dia entero: la fecha es `@db.Date`, asi que basta con
    // comparar contra la medianoche de ese mismo dia.
    ...(desde || hasta
      ? { fecha: { ...(desde ? { gte: desde } : {}), ...(hasta ? { lte: hasta } : {}) } }
      : {}),
    ...(texto
      ? {
          OR: [
            { numero: { contains: texto } },
            { descripcion: { contains: texto } },
            { referencia: { contains: texto } },
          ],
        }
      : {}),
  };

  // El `count` usa el MISMO `where`: si contara el total sin filtrar, el
  // numero de paginas no corresponderia con lo que hay que recorrer.
  const total = await prisma.ordenCompra.count({ where });
  const totalPaginas = contarPaginas(total, porPagina);
  const pagina = normalizarPagina(opciones.pagina, totalPaginas);

  const filas = await prisma.ordenCompra.findMany({
    where,
    // Por fecha y no por numero: el correlativo de las ordenes reales no es
    // cronologico y ordenar por el mentiria sobre la secuencia.
    orderBy: [{ fecha: "desc" }, { createdAt: "desc" }],
    skip: saltar(pagina, porPagina),
    take: porPagina,
    select: {
      id: true, numero: true, tipo: true, estado: true, origen: true,
      fecha: true, descripcion: true, referencia: true, formaPago: true,
      subtotal: true, descuentoComercial: true, tipoImpuesto: true,
      neto: true, impuesto: true,
      total: true, aprobadaAt: true, aprobadaPor: true, anuladaAt: true,
      motivoAnulado: true,
      proveedor: { select: { id: true, razonSocial: true, ruc: true } },
      _count: { select: { lineas: true } },
      imputaciones: {
        select: {
          importe: true,
          partida: { select: { codigoPartida: true, descripcion: true } },
        },
      },
    },
  });

  const resumenes = filas.map((o) => ({
    id: o.id,
    numero: o.numero,
    tipo: o.tipo,
    estado: o.estado,
    origen: o.origen,
    fecha: o.fecha,
    descripcion: o.descripcion,
    referencia: o.referencia,
    formaPago: o.formaPago,
    proveedor: o.proveedor,
    subtotal: o.subtotal.toString(),
    descuentoComercial: o.descuentoComercial.toString(),
    tipoImpuesto: o.tipoImpuesto,
    neto: o.neto.toString(),
    impuesto: o.impuesto.toString(),
    total: o.total.toString(),
    imputable: importeImputable({
      tipoImpuesto: o.tipoImpuesto,
      neto: o.neto.toString(),
      total: o.total.toString(),
    }),
    aprobadaAt: o.aprobadaAt,
    aprobadaPor: o.aprobadaPor,
    anuladaAt: o.anuladaAt,
    motivoAnulado: o.motivoAnulado,
    totalLineas: o._count.lineas,
    imputaciones: o.imputaciones.map((i) => ({
      codigoPartida: i.partida.codigoPartida,
      descripcion: i.partida.descripcion,
      importe: i.importe.toString(),
    })),
  }));

  return { filas: resumenes, total, pagina, totalPaginas };
}

/**
 * Partidas habituales de cada proveedor en una obra.
 *
 * Se devuelven TODOS los proveedores de una vez, indexados por su id, porque
 * quien redacta una orden todavia no ha elegido proveedor: el formulario
 * necesita poder reaccionar en cuanto lo elija, sin otra ida al servidor.
 *
 * Son una ayuda, no un limite: la orden puede imputar a cualquier partida de
 * la obra.
 */
export async function obtenerPartidasHabituales(
  sesion: SesionActiva,
  obraId: string,
): Promise<Record<string, string[]>> {
  if (!puede(sesion, "orden:crear")) return {};

  const filas = await prisma.proveedorPartida.findMany({
    where: {
      proveedor: { companyId: sesion.companyId },
      // La obra sale de la partida, que es quien sabe a que proyecto va.
      partida: { projectId: obraId },
    },
    select: { proveedorId: true, wbsItemId: true },
  });

  const porProveedor: Record<string, string[]> = {};
  for (const fila of filas) {
    (porProveedor[fila.proveedorId] ??= []).push(fila.wbsItemId);
  }

  return porProveedor;
}

// ---------------------------------------------------------------------------
// El documento
// ---------------------------------------------------------------------------

export interface LineaImpresa {
  nivel: number;
  esAgrupador: boolean;
  cantidad: string | null;
  unidad: string | null;
  descripcion: string;
  precioUnitario: string | null;
  importe: string;
}

export interface OrdenImpresa {
  emisor: {
    razonSocial: string;
    ruc: string;
    direccion: string | null;
    telefono: string | null;
    email: string | null;
    representanteLegal: string | null;
    cargoRepresentante: string | null;
    observacionesOrden: string | null;
  };
  obra: { nombreObra: string; cliente: string | null };
  numero: string;
  tipo: TipoOrden;
  tipoImpuesto: TipoImpuesto;
  estado: EstadoOrden;
  fecha: Date;
  descripcion: string;
  referencia: string | null;
  formaPago: string | null;
  observaciones: string | null;
  proveedor: {
    razonSocial: string;
    ruc: string;
    contactoNombre: string | null;
    contactoTelefono: string | null;
    email: string | null;
    banco: string | null;
    tipoCuenta: string | null;
    monedaCuenta: string | null;
    cuentaBancaria: string | null;
    cci: string | null;
  };
  lineas: LineaImpresa[];
  subtotal: string;
  descuentoComercial: string;
  neto: string;
  impuesto: string;
  total: string;
}

/**
 * Todo lo que lleva impreso el papel que se le manda al proveedor.
 *
 * Va en una consulta aparte de `listarOrdenes` porque pide cosas que el
 * listado no necesita —los datos del emisor, los bancarios del proveedor, el
 * detalle linea a linea— y cargarlas en cada fila de la tabla para usarlas en
 * una de cada cien seria pagar por adelantado algo que casi nunca se usa.
 *
 * Se puede imprimir en cualquier estado, tambien BORRADOR y ANULADA: hace
 * falta poder revisar antes de aprobar, y guardar copia de lo que se anulo.
 * Es el documento el que tiene que decir en cual esta, y por eso viaja
 * `estado` con el resto.
 */
export async function obtenerOrdenParaImpresion(
  sesion: SesionActiva,
  obraId: string,
  ordenId: string,
): Promise<OrdenImpresa | null> {
  if (!puede(sesion, "orden:leer")) return null;

  const orden = await prisma.ordenCompra.findFirst({
    // El companyId no es redundante con el id: sin el, un id adivinado de
    // otra empresa devolveria su orden entera, con sus datos bancarios.
    where: { id: ordenId, projectId: obraId, companyId: sesion.companyId },
    include: {
      company: true,
      project: { select: { nombreObra: true, cliente: true } },
      proveedor: true,
      lineas: { orderBy: { orden: "asc" } },
    },
  });

  if (!orden) return null;

  return {
    emisor: {
      razonSocial: orden.company.razonSocial,
      ruc: orden.company.ruc,
      direccion: orden.company.direccion,
      telefono: orden.company.telefono,
      email: orden.company.email,
      representanteLegal: orden.company.representanteLegal,
      cargoRepresentante: orden.company.cargoRepresentante,
      observacionesOrden: orden.company.observacionesOrden,
    },
    obra: {
      nombreObra: orden.project.nombreObra,
      cliente: orden.project.cliente,
    },
    numero: orden.numero,
    tipo: orden.tipo,
    tipoImpuesto: orden.tipoImpuesto,
    estado: orden.estado,
    fecha: orden.fecha,
    descripcion: orden.descripcion,
    referencia: orden.referencia,
    formaPago: orden.formaPago,
    observaciones: orden.observaciones,
    proveedor: {
      razonSocial: orden.proveedor.razonSocial,
      ruc: orden.proveedor.ruc,
      contactoNombre: orden.proveedor.contactoNombre,
      contactoTelefono: orden.proveedor.contactoTelefono,
      email: orden.proveedor.email,
      banco: orden.proveedor.banco,
      tipoCuenta: orden.proveedor.tipoCuenta,
      monedaCuenta: orden.proveedor.monedaCuenta,
      cuentaBancaria: orden.proveedor.cuentaBancaria,
      cci: orden.proveedor.cci,
    },
    // Los importes salen como cadena, sin tocar. Darles formato es cosa de
    // `utils/formato`, en el ultimo paso: aqui pasar por coma flotante seria
    // perder precision para ganar nada.
    lineas: orden.lineas.map((l) => ({
      nivel: l.nivel,
      esAgrupador: l.esAgrupador,
      cantidad: l.cantidad?.toString() ?? null,
      unidad: l.unidad,
      descripcion: l.descripcion,
      precioUnitario: l.precioUnitario?.toString() ?? null,
      importe: l.importe.toString(),
    })),
    subtotal: orden.subtotal.toString(),
    descuentoComercial: orden.descuentoComercial.toString(),
    neto: orden.neto.toString(),
    impuesto: orden.impuesto.toString(),
    total: orden.total.toString(),
  };
}
