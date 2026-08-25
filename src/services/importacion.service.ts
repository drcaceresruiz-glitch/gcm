import "server-only";
import { codigoDeFallo, motivoSiFalla } from "@/lib/fallo-de-base";
import { prisma } from "@/lib/prisma";
import { puede } from "@/lib/rbac";
import {
  codigoPadre,
  sumarHojas,
  calcularProfundidades,
} from "@/lib/jerarquia-partidas";
import { motivoSiObraCerrada } from "@/services/obra-abierta";
import { partidasEnEjecucionQueDesaparecen } from "@/services/partidas-en-ejecucion";
import type { FilaImportada } from "@/lib/excel-presupuesto";
import type { SesionActiva } from "@/services/sesion.service";
import { alcanzaObra } from "@/lib/alcance-obras";

/**
 * Escritura del presupuesto importado.
 *
 * El analisis del Excel vive en `@/lib/excel-presupuesto`: es logica pura y
 * se prueba sin base de datos ni servidor. Aqui solo queda lo que toca
 * datos, que es donde importan los permisos y el aislamiento por empresa.
 */

export type ResultadoImportacion =
  | { ok: true; capitulos: number; partidas: number; montoTotal: string }
  | { ok: false; error: string };

/**
 * Lo que un reemplazo destruiria y ningun archivo puede devolver.
 *
 * Las partidas importadas se pueden barrer sin drama: el Excel las vuelve a
 * traer. Las creadas a mano y las importadas que alguien corrigio despues no
 * existen en ninguna otra parte.
 *
 * Sin esto, la confirmacion de reemplazo solo puede decir "se borraran 360
 * partidas", que se lee como rutina y esconde que dentro van doce que costo
 * una tarde teclear.
 */
export interface EnRiesgoPorReemplazo {
  /// Creadas a mano: no estan en ningun archivo.
  creadasAMano: { codigo: string; descripcion: string }[];
  /// Importadas pero corregidas despues: el archivo las trae, con los
  /// valores viejos.
  corregidasAMano: { codigo: string; descripcion: string }[];
  /// Las lineas que de verdad llevan dinero. Es lo que se cuenta al hablar
  /// de «partidas» en el resto de la pantalla.
  totalPartidas: number;
  /// Los titulos que las agrupan. Se cuentan APARTE y no se suman: llamar
  /// «partidas» a las seis filas del arbol cuando cuatro llevan importe hace
  /// que la misma pantalla diga 6 en un sitio y 4 en el de al lado.
  totalCapitulos: number;
}

export async function analizarRiesgoDeReemplazo(
  sesion: SesionActiva,
  obraId: string,
): Promise<EnRiesgoPorReemplazo> {
  const vacio = {
    creadasAMano: [],
    corregidasAMano: [],
    totalPartidas: 0,
    totalCapitulos: 0,
  };

  // El alcance por obra. Ver la regla 4 en `gcm-limites-de-capas`.
  if (!alcanzaObra(sesion, obraId)) return vacio;

  // Esta funcion solo ANALIZA (partida:leer): la pantalla entera exige
  // meta:leer, mas floja, porque ver la vista previa no es importar nada
  // todavia. El boton que si importa esta oculto sin `partida:importar`
  // (`ConfirmarContractual`), y `aplicarImportacion` lo vuelve a exigir
  // aqui debajo: los servicios son la frontera real, y una ruta nueva
  // podria llamar a esto sin pasar por la pantalla.
  if (!puede(sesion, "partida:leer")) return vacio;

  // El alcance por obra, con la MISMA respuesta que «no tienes permiso»: las
  // dos dicen «esto no es para ti» y distinguirlas ya seria contar algo. Ver
  // la regla 4 en `gcm-limites-de-capas`.
  if (!alcanzaObra(sesion, obraId)) return vacio;

  const items = await prisma.wbsItem.findMany({
    where: {
      projectId: obraId,
      project: { companyId: sesion.companyId },
    },
    orderBy: { orden: "asc" },
    select: {
      codigoPartida: true,
      descripcion: true,
      origen: true,
      editadaAMano: true,
      tipo: true,
    },
  });

  const aviso = (i: (typeof items)[number]) => ({
    codigo: i.codigoPartida,
    descripcion: i.descripcion,
  });

  return {
    creadasAMano: items.filter((i) => i.origen === "MANUAL").map(aviso),
    // Solo las importadas: una creada a mano ya se cuenta arriba, y contarla
    // dos veces inflaria el aviso y le quitaria credibilidad.
    corregidasAMano: items
      .filter((i) => i.origen === "IMPORTADO" && i.editadaAMano)
      .map(aviso),
    totalPartidas: items.filter((i) => i.tipo === "PARTIDA").length,
    totalCapitulos: items.filter((i) => i.tipo === "CAPITULO").length,
  };
}

/**
 * Traduce un fallo de la base a algo que un jefe de obra pueda leer.
 *
 * EXISTE POR UN FALLO REAL del 20/08/2026: una importacion desde la plantilla
 * oficial murio y el usuario vio «Esta pantalla no se pudo cargar». El error
 * subia sin capturar desde la insercion hasta el limite de Next, asi que la
 * unica pista era un codigo interno. Una pantalla rota no dice que arreglar
 * en el Excel; un mensaje si.
 *
 * La lectura del codigo vive en `lib/fallo-de-base` desde que el alta de
 * usuarios resulto tener el mismo hueco. Los MENSAJES se quedan aqui: un
 * catalogo compartido acabaria diciendo «hay un valor duplicado» donde este
 * puede decir en que columna del Excel mirar.
 */
export function motivoDeFalloAlGuardar(e: unknown): string {
  const codigo = codigoDeFallo(e);

  // Comun a todos: la importacion es UNA transaccion. Decirlo importa tanto
  // como el motivo, porque lo primero que teme quien ve un error es haber
  // dejado el presupuesto a medias.
  const intacto =
    "No se cargo ninguna partida: la importacion entera se deshace si algo " +
    "falla, asi que la obra quedo como estaba.";

  switch (codigo) {
    case "P2000":
      return (
        "Hay un texto mas largo de lo que admite el sistema. Los topes son: " +
        "unidad 20 caracteres, codigo 32 y descripcion 500. Revisa sobre todo " +
        `la columna de unidad, que suele llevar alcance en vez de abreviatura. ${intacto}`
      );
    case "P2002":
      return `Hay un codigo de partida repetido en el archivo. ${intacto}`;
    case "P2003":
      return (
        "Hay una partida que cuelga de un capitulo que el archivo no trae. " +
        `Comprueba que cada codigo tenga su padre (para 1.2.1 hacen falta 1 y 1.2). ${intacto}`
      );
    case "P2028":
      return (
        "La importacion tardo demasiado y se cancelo. Vuelve a intentarlo; si " +
        `se repite, parte el presupuesto en dos archivos. ${intacto}`
      );
    default:
      return `No se pudo guardar el presupuesto. ${intacto}`;
  }
}

export async function aplicarImportacion(
  sesion: SesionActiva,
  obraId: string,
  filas: FilaImportada[],
  reemplazar: boolean,
): Promise<ResultadoImportacion> {
  if (!puede(sesion, "partida:importar")) {
    return { ok: false, error: "No tienes permiso para importar partidas." };
  }

  if (filas.length === 0) {
    return { ok: false, error: "No hay filas validas que importar." };
  }

  // El filtro por empresa sale de la sesion: es lo que impide cargar
  // partidas en una obra de otro cliente manipulando el identificador.
  const obra = await prisma.project.findFirst({
    where: { id: obraId, companyId: sesion.companyId },
    select: { id: true },
  });

  if (!obra) return { ok: false, error: "Obra no encontrada." };

  const cerrada = await motivoSiObraCerrada(sesion, obraId);
  if (cerrada) return { ok: false, error: cerrada };

  // Un presupuesto congelado no se toca. Cambiarlo invalidaria todos los
  // indicadores calculados contra el.
  const lineaBase = await prisma.baseline.findFirst({
    where: { projectId: obraId, aprobadaAt: { not: null } },
    select: { version: true },
  });

  if (lineaBase) {
    return {
      ok: false,
      error:
        `El presupuesto ya fue congelado (linea base v${lineaBase.version}). ` +
        `Los cambios posteriores deben registrarse como adicionales o deductivos.`,
    };
  }

  const existentes = await prisma.wbsItem.count({ where: { projectId: obraId } });

  if (existentes > 0 && !reemplazar) {
    return {
      ok: false,
      error: `Esta obra ya tiene ${existentes} partidas. Marca "reemplazar" para sustituirlas.`,
    };
  }

  const codigos = new Set(filas.map((f) => f.codigo));
  const montoTotal = sumarHojas(filas);

  /**
   * LO QUE YA SE ESTA EJECUTANDO NO SE PUEDE TIRAR.
   *
   * `eliminarPartida` ya se niega en seco a borrar una partida con avance
   * reportado, y sin segundo paso que valga: lo que se perderia no es una
   * referencia, es historia. Pero reemplazar el presupuesto borra TODAS las
   * partidas de golpe por otro camino, y hasta aqui no lo miraba.
   *
   * El motivo es de obra, no de programacion: si una partida se esta
   * ejecutando hay una cuadrilla trabajando y un contratista al que hay que
   * pagarle, y ese pago sale del presupuesto. Una partida en ejecucion sin
   * respaldo presupuestal es dinero que se debe y no esta en ninguna parte.
   *
   * Se comprueba en dos saltos, como en `eliminarPartida`: el avance no
   * cuelga de la partida por clave ajena, se ancla al `uid` de la tarea del
   * cronograma, y lo que las une es `MapeoTareaPartida` POR CODIGO.
   */
  if (existentes > 0) {
    const vivas = await partidasEnEjecucionQueDesaparecen(obraId, codigos);
    if (vivas.length > 0) {
      const lista = vivas.slice(0, 5).join(", ");
      const resto = vivas.length > 5 ? `, y ${vivas.length - 5} mas` : "";
      return {
        ok: false,
        error:
          `El archivo no trae ${vivas.length} partida(s) que YA SE ESTAN ` +
          `EJECUTANDO en obra: ${lista}${resto}. No se pueden borrar: hay ` +
          `trabajo hecho y un pago que sale de ellas. Anadelas al archivo con ` +
          `su codigo, o registra el cambio como adicional o deductivo.`,
      };
    }
  }

  // Orden de presentacion: el del documento original. Mas abajo se insertan
  // por niveles para que el padre exista antes que el hijo, pero ese orden
  // tecnico no debe filtrarse a la pantalla, o el arbol saldria con todos
  // los capitulos juntos y luego todas las partidas.
  const ordenOriginal = new Map(filas.map((f, i) => [f.codigo, i]));

  const profundidades = calcularProfundidades([...codigos]);

  const fallo = await motivoSiFalla(prisma.$transaction(async (tx) => {
    if (existentes > 0) {
      /**
       * Se borra de fuera hacia dentro: en cada vuelta se eliminan las
       * hojas, es decir las filas que no son padre de ninguna otra.
       *
       * La relacion padre-hijo tiene restriccion de integridad. Borrar "las
       * que tienen padre" y luego el resto no funciona con tres niveles:
       * dentro de una misma sentencia no hay garantia de que los nietos se
       * eliminen antes que sus padres. Tampoco sirve borrar por `nivel`,
       * porque un padre y su hijo pueden compartirlo.
       */
      for (let vuelta = 0; vuelta < 50; vuelta++) {
        const conHijos = await tx.wbsItem.findMany({
          where: { projectId: obraId, parentId: { not: null } },
          select: { parentId: true },
          distinct: ["parentId"],
        });

        const idsPadres = conHijos
          .map((c) => c.parentId)
          .filter((id): id is string => id !== null);

        const { count } = await tx.wbsItem.deleteMany({
          where: { projectId: obraId, id: { notIn: idsPadres } },
        });

        if (count === 0) break;
      }
    }

    // Se insertan por NIVELES de profundidad real, de menor a mayor: el padre
    // esta siempre en un nivel anterior, asi que su id ya se conoce cuando le
    // toca el turno al hijo.
    //
    // Antes se creaba FILA A FILA, y cada fila era un viaje a la base dentro de
    // la transaccion. Con las 348 partidas de una obra real eso se acercaba a
    // los cinco segundos que Prisma concede por defecto a una transaccion; al
    // pasarlos aborta con P2028 y revierte la importacion ENTERA, que es la peor
    // forma de fallar: el presupuesto es lo primero que carga una constructora.
    // Por niveles son tantas idas y venidas como profundidad tenga la EDT.
    const porNivel = new Map<number, FilaImportada[]>();
    for (const f of filas) {
      const nivel = profundidades.get(f.codigo) ?? 0;
      const grupo = porNivel.get(nivel);
      if (grupo) grupo.push(f);
      else porNivel.set(nivel, [f]);
    }

    const idPorCodigo = new Map<string, string>();

    for (const nivel of [...porNivel.keys()].sort((a, b) => a - b)) {
      const grupo = porNivel.get(nivel) ?? [];

      await tx.wbsItem.createMany({
        data: grupo.map((f) => {
          const padre = codigoPadre(f.codigo, codigos);
          return {
            projectId: obraId,
            parentId: padre ? (idPorCodigo.get(padre) ?? null) : null,
            codigoPartida: f.codigo,
            tipo: f.tipo,
            modalidad: f.modalidad,
            descripcion: f.descripcion.slice(0, 500),
            // Profundidad real en el arbol, no numero de segmentos del
            // codigo: es la que gobierna la sangria en pantalla.
            nivel,
            orden: ordenOriginal.get(f.codigo) ?? 0,
            // Vino de un archivo. Perderla en un reemplazo posterior no es
            // grave: el Excel la vuelve a traer. Lo que no vuelve es lo que
            // alguien tecleo o corrigio a mano, y por eso se distinguen.
            origen: "IMPORTADO" as const,
            unidad: f.unidad,
            metrado: f.metrado,
            precioUnitario: f.precioUnitario,
            parcial: f.parcial,
            // "YYYY-MM-DD" a medianoche UTC: es una columna `@db.Date` y el
            // dia no debe correrse por la zona horaria de Peru (mismo
            // patron que `cronograma-manual.service.ts`).
            fechaInicioPlan: f.fechaInicio ? new Date(`${f.fechaInicio}T00:00:00.000Z`) : null,
            fechaFinPlan: f.fechaFin ? new Date(`${f.fechaFin}T00:00:00.000Z`) : null,
          };
        }),
      });

      // `createMany` no devuelve los ids en MySQL/MariaDB, y el nivel siguiente
      // los necesita para apuntar a su padre. Se releen de una vez: una consulta
      // por nivel, no por fila. `@@unique([projectId, codigoPartida])` garantiza
      // que cada codigo case con una sola fila y el mapa no sea ambiguo.
      const creados = await tx.wbsItem.findMany({
        where: {
          projectId: obraId,
          codigoPartida: { in: grupo.map((f) => f.codigo) },
        },
        select: { id: true, codigoPartida: true },
      });
      for (const c of creados) idPorCodigo.set(c.codigoPartida, c.id);
    }

    await tx.auditLog.create({
      data: {
        companyId: sesion.companyId,
        userId: sesion.userId,
        projectId: obraId,
        entidad: "WbsItem",
        entidadId: obraId,
        accion: reemplazar && existentes > 0 ? "UPDATE" : "CREATE",
        despues: {
          origen: "importacion-excel",
          filas: filas.length,
          montoTotal,
          reemplazo: existentes > 0,
        },
      },
    });
  }, {
    // Prisma da cinco segundos por defecto, y esta transaccion es la unica del
    // sistema legitimamente larga: borra el presupuesto anterior por niveles e
    // inserta cientos de partidas. Pasarse significa P2028 y la importacion
    // revertida entera, asi que el techo se fija a proposito en vez de dejarlo
    // al azar del tamano del Excel.
    //
    // No es una invitacion a que tarde: la insercion por niveles de arriba la
    // deja en unos pocos viajes. Es el margen para un archivo grande o una base
    // cargada, no el presupuesto de tiempo esperado.
    timeout: 120_000,
    // Y esto es lo que espera a que haya conexion libre en el pool antes de
    // empezar a contar el tiempo de arriba. Bajo carga, sin este margen la
    // importacion falla antes de haber hecho nada.
    maxWait: 15_000,
  }), motivoDeFalloAlGuardar);

  if (fallo) return { ok: false, error: fallo };

  return {
    ok: true,
    capitulos: filas.filter((f) => f.tipo === "CAPITULO").length,
    partidas: filas.filter((f) => f.tipo === "PARTIDA").length,
    montoTotal,
  };
}
