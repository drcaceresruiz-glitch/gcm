import "server-only";
import { prisma } from "@/lib/prisma";
import { puede } from "@/lib/rbac";
import type { SesionActiva } from "@/services/sesion.service";
import { metaQueManda } from "@/services/meta.service";
import { aplicarImportacion } from "@/services/importacion.service";
import type { FilaImportada, Modalidad } from "@/lib/excel-presupuesto";
import {
  generarContractual,
  type LineaReal,
  type ResultadoContractual,
} from "@/lib/contractual-desde-meta";
import { multiplicar } from "@/lib/decimal";
import { alcanzaObra } from "@/lib/alcance-obras";

/**
 * Generar el presupuesto contractual a partir del real.
 *
 * El calculo vive en `lib/contractual-desde-meta` y la escritura la hace
 * `aplicarImportacion`, la misma que usa el importador de Excel. Aqui no se
 * duplica ninguna de las dos: este servicio solo LEE la meta, la traduce y
 * encadena las piezas.
 *
 * Reutilizar `aplicarImportacion` no es pereza: trae de balde todas sus
 * guardas —obra cerrada, linea base ya aprobada, partidas en ejecucion que
 * desapareceran, la transaccion y el apunte de auditoria—, y son justo las
 * que protegen un presupuesto que ya se esta ejecutando.
 */

export interface PreviaContractual {
  metaVersion: number;
  metaAprobada: boolean;
  resultado: ResultadoContractual;
  /**
   * Las lineas del real, tal cual entran al calculo.
   *
   * Viajan a la pantalla para que pueda recalcular EN VIVO lo que pasaria al
   * mover un recargo, llamando a la MISMA `generarContractual` que corre
   * aqui. Si la vista previa tuviera su propia formula, el numero que se ve
   * antes de confirmar y el que se guarda despues podrian no coincidir, y ese
   * numero es el margen de la obra.
   *
   * Son datos de entrada, no cifras de dinero calculadas: lo que se guarda al
   * confirmar se vuelve a calcular en el servidor, desde la base.
   */
  reales: LineaReal[];
  /**
   * Los gastos generales que la meta preve, para poder decir AQUI si el
   * recargo los cubre.
   *
   * Es el momento en que se decide el margen, y hasta ahora se decidia a
   * ciegas: el recargo se elegia mirando solo las partidas, y si no llegaba
   * para pagar al residente eso no se veia hasta la pantalla de la meta, con
   * el contractual ya generado.
   */
  /**
   * TODO lo que la obra va a costar: costo directo -incluidas las lineas sin
   * codigo- mas los gastos generales.
   *
   * Es lo que hay que cubrir, y no coincide con `resultado.totalReal`: ese
   * suma solo las lineas CON codigo, que son las unicas que se recargan. La
   * diferencia entre los dos es exactamente el dinero que la bolsa tiene que
   * pagar sin que nadie lo haya facturado linea a linea.
   */
  costoTotalMeta: string;
  /// Los costos propios de la meta: lo que cuesta y el contrato no desglosa.
  costoPropioMeta: string;
}

export type ResultadoPrevia =
  | { ok: true; previa: PreviaContractual }
  | { ok: false; error: string };


/**
 * La vista previa: que saldria, sin escribir nada.
 *
 * Es de solo lectura a proposito. Un presupuesto contractual es lo que se
 * firma con el cliente: tiene que poder mirarse entero, con sus avisos y su
 * bolsa, antes de que exista.
 */
export async function previsualizarContractual(
  sesion: SesionActiva,
  obraId: string,
): Promise<ResultadoPrevia> {
  if (!puede(sesion, "meta:leer")) {
    return { ok: false, error: "No tienes permiso para ver el presupuesto meta." };
  }

  // El alcance por obra, con la MISMA respuesta que «no tienes permiso»: las
  // dos dicen «esto no es para ti» y distinguirlas ya seria contar algo. Ver
  // la regla 4 en `gcm-limites-de-capas`.
  if (!alcanzaObra(sesion, obraId)) return { ok: false, error: "No tienes permiso para ver el presupuesto meta." };

  const obra = await prisma.project.findFirst({
    where: { id: obraId, companyId: sesion.companyId },
    select: { id: true },
  });
  if (!obra) return { ok: false, error: "Obra no encontrada." };

  const meta = await metaQueManda(sesion.companyId, obraId);
  if (!meta) {
    return {
      ok: false,
      error:
        "Esta obra todavia no tiene presupuesto meta. Cargalo primero: el " +
        "contractual sale de el.",
    };
  }

  const items = await prisma.presupuestoMetaItem.findMany({
    where: { presupuestoMetaId: meta.id },
    orderBy: { orden: "asc" },
  });

  const reales: LineaReal[] = items.map((i) => ({
    codigo: i.codigoRef,
    descripcion: i.descripcion,
    tipo: i.tipo === "CAPITULO" ? "CAPITULO" : "PARTIDA",
    nivel: i.nivel,
    orden: i.orden,
    unidad: i.unidad,
    metrado: i.metrado?.toString() ?? null,
    precioUnitario: i.precioUnitario?.toString() ?? null,
    parcial: i.parcial?.toString() ?? null,
    porcentajeRecargo: i.porcentajeRecargo?.toString() ?? null,
    // Mismo criterio que el resto del proyecto para leer un `@db.Date` de
    // vuelta como "YYYY-MM-DD" (`edt.service.ts`, `cronograma-manual.service.ts`).
    fechaInicio: i.fechaInicioPlan?.toISOString().slice(0, 10) ?? null,
    fechaFin: i.fechaFinPlan?.toISOString().slice(0, 10) ?? null,
  }));

  return {
    ok: true,
    previa: {
      metaVersion: meta.version,
      metaAprobada: meta.aprobadaAt !== null,
      resultado: generarContractual(reales),
      reales,
      costoTotalMeta: meta.costoTotal.toString(),
      costoPropioMeta: meta.costoPropio.toString(),
    },
  };
}

/**
 * Como esta contratada cada linea del contractual que se genera.
 *
 * Si el importe es metrado x precio, son precios unitarios. Si el importe
 * esta cerrado y no se descompone, es suma alzada. Es el mismo criterio que
 * usa el importador de Excel; aqui se puede decidir sin adivinar porque el
 * calculo acaba de construir la linea.
 */
function modalidadDe(l: {
  metrado: string | null;
  precioUnitario: string | null;
  parcial: string | null;
}): Modalidad {
  if (l.metrado !== null && l.precioUnitario !== null) {
    const calculado = multiplicar(l.metrado, l.precioUnitario, 2);
    if (calculado !== null && calculado === l.parcial) return "PRECIOS_UNITARIOS";
    return "SUMA_ALZADA";
  }
  if (l.parcial !== null) return "SUMA_ALZADA";
  return "ALCANCE";
}

/**
 * Escribe el contractual generado como el arbol de partidas de la obra.
 *
 * `reemplazar` viaja tal cual hasta `aplicarImportacion`: sin el, la
 * importacion se niega si la obra ya tiene partidas. No se decide aqui, se
 * pregunta a quien pulsa el boton.
 */
export async function generarContractualDesdeReal(
  sesion: SesionActiva,
  obraId: string,
  reemplazar: boolean,
) {
  const previa = await previsualizarContractual(sesion, obraId);
  if (!previa.ok) return previa;

  const filas: FilaImportada[] = previa.previa.resultado.lineas.map((l, i) => ({
    // El numero de fila es para que una persona localice la linea. Aqui no hay
    // Excel del que salga, asi que se numera el orden en que se genero.
    fila: i + 1,
    codigo: l.codigo,
    tipo: l.tipo,
    modalidad: l.tipo === "CAPITULO" ? "PRECIOS_UNITARIOS" : modalidadDe(l),
    descripcion: l.descripcion,
    nivel: l.nivel,
    unidad: l.unidad,
    metrado: l.metrado,
    precioUnitario: l.precioUnitario,
    parcial: l.parcial,
    // El recargo es del presupuesto real y ya se aplico: en el contractual no
    // queda nada que recargar, y arrastrarlo invitaria a aplicarlo dos veces.
    porcentajeRecargo: null,
      descuentoContratista: null,
      ggContratista: null,
      utilidadContratista: null,
    fechaInicio: l.fechaInicio,
    fechaFin: l.fechaFin,
  }));

  return aplicarImportacion(sesion, obraId, filas, reemplazar);
}
