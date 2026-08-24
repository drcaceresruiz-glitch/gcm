import "server-only";

import { prisma } from "@/lib/prisma";
import { puede } from "@/lib/rbac";
import {
  deducidoPorItem,
  importeVigenteDeLinea,
  resumenDeducciones,
  validarDeduccion,
  type DeduccionContada,
  type ResumenDeducciones,
} from "@/lib/deducciones";
import { normalizarDecimal } from "@/lib/decimal";
import { motivoSiObraCerrada } from "@/services/obra-abierta";
import { metaQueManda } from "@/services/meta.service";
import { codigoDeFallo } from "@/lib/fallo-de-base";
import type { EstadoDeduccion } from "@/generated/prisma/enums";
import type { SesionActiva } from "@/services/sesion.service";

/**
 * Deducir un costo propio de la meta congelada, con dos firmas.
 *
 * PEDIDO ASI: «que el residente y/o el administrador de la obra pueda
 * solicitar deducir monto de los gastos generales, se le presenta al gerente
 * general y si este lo aprueba perfecto, se hacen todos los ajustes».
 *
 * Es el MISMO circuito de la adenda, y se escribe igual a proposito -mismos
 * estados, misma condicion de estado en el WHERE, mismo mensaje cuando otro se
 * adelanta-: dos circuitos de dos firmas que se leen distinto acaban
 * comportandose distinto en los bordes, y los bordes de estos dos son los
 * mismos.
 *
 * La razon de que sea una tabla aparte y no una edicion de la meta vive en
 * `lib/deducciones.ts`, junto a las reglas. En una linea: la meta se congela
 * para poder ver la desviacion, y bajarla dejaria la bolsa subiendo sola y sin
 * rastro de que alguien lo decidio.
 */

function quien(sesion: SesionActiva): string {
  return `${sesion.nombres} ${sesion.apellidos}`.trim().slice(0, 150);
}

export interface DeduccionFila {
  id: string;
  numero: number;
  metaItemId: string;
  /// La linea de la que se deduce, para no tener que cruzarla en la pantalla.
  linea: string;
  importe: string;
  motivo: string;
  estado: EstadoDeduccion;
  solicitadaPor: string;
  createdAt: Date;
  resueltaAt: Date | null;
  resueltaPor: string | null;
  motivoRechazo: string | null;
}

export interface DeduccionesDeLaMeta {
  filas: DeduccionFila[];
  resumen: ResumenDeducciones;
  /// Cuanto se ha deducido de cada linea, por id de item. Es lo que la bolsa
  /// necesita para restar sin tocar la meta.
  porItem: Map<string, string>;
}

const SIN_DEDUCCIONES: DeduccionesDeLaMeta = {
  filas: [],
  resumen: resumenDeducciones([]),
  porItem: new Map(),
};

/**
 * Las deducciones de la meta que manda hoy.
 *
 * `meta:leer` y no un permiso propio: quien puede ver la bolsa tiene que poder
 * ver por que subio. Enseñar una bolsa mas alta sin decir que hay una
 * deduccion detras seria enseñar la cifra sin su explicacion, que es el mismo
 * criterio con el que las adendas se ven con `encargo:leer`.
 */
export async function deduccionesDeLaMeta(
  sesion: SesionActiva,
  obraId: string,
): Promise<DeduccionesDeLaMeta> {
  if (!puede(sesion, "meta:leer")) return SIN_DEDUCCIONES;

  const meta = await metaQueManda(sesion.companyId, obraId);
  if (!meta) return SIN_DEDUCCIONES;

  return deduccionesDeMeta(sesion.companyId, meta.id);
}

/**
 * Lo mismo a partir del id de la meta, SIN SESION.
 *
 * La usa `comparacionDeObra`, que ya resolvio la meta y la empresa y corre
 * tambien desde el reloj de avisos. Ver la nota de aquella: el nucleo sin
 * sesion existe para que el aviso lea la MISMA cifra que la pantalla.
 */
export async function deduccionesDeMeta(
  companyId: string,
  presupuestoMetaId: string,
): Promise<DeduccionesDeLaMeta> {
  const filas = await prisma.deduccionCostoPropio.findMany({
    // La empresa se repite aqui aunque quien llama ya resolvio la meta contra
    // ella: el filtro va donde SE LEE, no donde se leyo antes. Es la regla que
    // se salto `sobregiroProyectadoDeCartera` hasta ayer.
    where: { presupuestoMetaId, project: { companyId } },
    orderBy: { numero: "asc" },
    select: {
      id: true,
      numero: true,
      metaItemId: true,
      importe: true,
      motivo: true,
      estado: true,
      solicitadaPor: true,
      createdAt: true,
      resueltaAt: true,
      resueltaPor: true,
      motivoRechazo: true,
      item: { select: { descripcion: true } },
    },
  });

  const contadas: DeduccionContada[] = filas.map((d) => ({
    metaItemId: d.metaItemId,
    // A texto en la frontera, nunca a `number`: es dinero.
    importe: d.importe.toString(),
    estado: d.estado,
  }));

  return {
    filas: filas.map((d) => ({
      id: d.id,
      numero: d.numero,
      metaItemId: d.metaItemId,
      linea: d.item.descripcion,
      importe: d.importe.toString(),
      motivo: d.motivo,
      estado: d.estado,
      solicitadaPor: d.solicitadaPor,
      createdAt: d.createdAt,
      resueltaAt: d.resueltaAt,
      resueltaPor: d.resueltaPor,
      motivoRechazo: d.motivoRechazo,
    })),
    resumen: resumenDeducciones(contadas),
    porItem: deducidoPorItem(contadas),
  };
}

export interface DatosDeduccion {
  metaItemId: string;
  importe: string;
  motivo: string;
}

export type ResultadoDeduccion =
  | { ok: true; numero: number }
  | { ok: false; error: string };

/**
 * Pedir la deduccion. Nace PENDIENTE, siempre.
 *
 * No hay atajo para crearla ya aprobada ni aunque quien la pida tenga
 * `deduccion:aprobar`: el circuito son dos firmas y una de ellas se daria por
 * puesta. Quien tenga los dos permisos la pide y la firma en dos actos, y el
 * rastro dice que fue la misma persona -que es justo lo que alguien querria
 * poder auditar-. Igual que en las adendas.
 */
export async function solicitarDeduccion(
  sesion: SesionActiva,
  obraId: string,
  datos: DatosDeduccion,
): Promise<ResultadoDeduccion> {
  if (!puede(sesion, "deduccion:solicitar")) {
    return {
      ok: false,
      error: "No tienes permiso para pedir deducciones de costos propios.",
    };
  }

  const cerrada = await motivoSiObraCerrada(sesion, obraId);
  if (cerrada) return { ok: false, error: cerrada };

  const meta = await metaQueManda(sesion.companyId, obraId);
  if (!meta) {
    return {
      ok: false,
      error: "Esta obra todavía no tiene presupuesto meta del que deducir.",
    };
  }

  /*
   * SOLO SOBRE UNA META APROBADA.
   *
   * Mientras la meta es borrador se corrige la meta y ya esta: pedirle firma a
   * gerencia para bajar un numero que quien lo pide puede editar el mismo
   * seria un tramite sin contenido. La deduccion existe porque la meta esta
   * congelada.
   */
  if (meta.aprobadaAt === null) {
    return {
      ok: false,
      error:
        "El presupuesto meta todavía es un borrador: corrige el costo propio " +
        "directamente en la meta. Las deducciones existen para cuando la meta " +
        "ya está congelada y no se puede tocar.",
    };
  }

  // El item tiene que ser de ESTA meta, no del que llegue en la peticion.
  const item = await prisma.presupuestoMetaItem.findFirst({
    where: {
      id: datos.metaItemId,
      presupuestoMetaId: meta.id,
      meta: { project: { companyId: sesion.companyId } },
    },
    select: { id: true, codigoRef: true, descripcion: true, parcial: true },
  });
  if (!item) {
    return { ok: false, error: "Esa línea no es del presupuesto meta vigente." };
  }

  const yaDeducido = await deduccionesDeMeta(sesion.companyId, meta.id);

  const problema = validarDeduccion(
    {
      codigoRef: item.codigoRef,
      descripcion: item.descripcion,
      presupuestado: item.parcial?.toString() ?? "0.00",
      deducido: yaDeducido.porItem.get(item.id) ?? "0.00",
    },
    { importe: datos.importe, motivo: datos.motivo },
  );
  if (problema) return { ok: false, error: problema };

  const importe = normalizarDecimal(datos.importe, 2)!;

  try {
    const creada = await prisma.$transaction(async (tx) => {
      // El correlativo, DENTRO de la transaccion y sobre el maximo actual.
      // Dos altas a la vez no pueden llevarse el mismo numero: la unicidad
      // (projectId, numero) rechaza a la segunda y todo se deshace.
      const ultima = await tx.deduccionCostoPropio.aggregate({
        where: { projectId: obraId },
        _max: { numero: true },
      });
      const numero = (ultima._max.numero ?? 0) + 1;

      const d = await tx.deduccionCostoPropio.create({
        data: {
          projectId: obraId,
          presupuestoMetaId: meta.id,
          metaItemId: item.id,
          numero,
          importe,
          motivo: datos.motivo.trim(),
          solicitadaPor: quien(sesion),
        },
        select: { id: true, numero: true },
      });

      await tx.auditLog.create({
        data: {
          companyId: sesion.companyId,
          userId: sesion.userId,
          projectId: obraId,
          entidad: "DeduccionCostoPropio",
          entidadId: d.id.slice(0, 40),
          accion: "CREATE",
          despues: {
            numero: d.numero,
            linea: item.descripcion,
            importe,
            estado: "PENDIENTE",
          },
        },
      });

      return d;
    });

    return { ok: true, numero: creada.numero };
  } catch (e) {
    // El correlativo se lo llevo otro. Es TRANSITORIO: al reintentar, el
    // siguiente numero esta libre. Se invita a repetir en vez de sugerir que
    // el dato esta mal.
    if (codigoDeFallo(e) === "P2002") {
      return {
        ok: false,
        error:
          "Otra persona acaba de pedir una deducción en esta obra y se llevó " +
          "el número. Vuelve a guardar: no se ha perdido nada.",
      };
    }
    throw e;
  }
}

export interface DatosResolucionDeduccion {
  aprobar: boolean;
  /// Obligatorio al rechazar. Un «no» sin motivo deja a quien lo pidio sin
  /// saber si insistir con otra cifra o buscar el dinero en otro sitio.
  motivoRechazo?: string | null;
}

class YaResuelta extends Error {}

/**
 * La segunda firma: aprobar o rechazar.
 *
 * IRREVERSIBLE, igual que aprobar una adenda o un movimiento presupuestal. Una
 * deduccion aprobada se corrige con una version nueva de la meta, no
 * desaprobandola: si se pudiera desaprobar, la bolsa de la obra podria bajar
 * sin que quedara rastro de que alguna vez subio, y esa es exactamente la
 * cifra que se mira para saber si la obra se esta yendo.
 */
export async function resolverDeduccion(
  sesion: SesionActiva,
  obraId: string,
  deduccionId: string,
  datos: DatosResolucionDeduccion,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!puede(sesion, "deduccion:aprobar")) {
    return {
      ok: false,
      error:
        "No tienes permiso para aprobar deducciones. Quien pide el ajuste no " +
        "es quien lo firma: esa segunda firma es de gerencia.",
    };
  }

  const cerrada = await motivoSiObraCerrada(sesion, obraId);
  if (cerrada) return { ok: false, error: cerrada };

  const motivoRechazo = (datos.motivoRechazo ?? "").trim();
  if (!datos.aprobar && !motivoRechazo) {
    return {
      ok: false,
      error:
        "Para rechazar hace falta el motivo: es lo que le dice a quien lo " +
        "pidió si insistir con otra cifra o buscar el dinero en otro sitio.",
    };
  }

  const deduccion = await prisma.deduccionCostoPropio.findFirst({
    where: {
      id: deduccionId,
      projectId: obraId,
      // La empresa sale de la SESION y se aplica donde se lee.
      project: { companyId: sesion.companyId },
    },
    select: {
      id: true,
      numero: true,
      estado: true,
      importe: true,
      metaItemId: true,
      presupuestoMetaId: true,
      item: { select: { descripcion: true, parcial: true } },
    },
  });
  if (!deduccion) return { ok: false, error: "Deducción no encontrada." };

  if (deduccion.estado !== "PENDIENTE") {
    return {
      ok: false,
      error:
        `Esta deducción ya está ${deduccion.estado === "APROBADA" ? "aprobada" : "rechazada"} ` +
        "y no se puede volver a resolver.",
    };
  }

  /*
   * SE VUELVE A COMPROBAR EL TOPE AL FIRMAR, y no solo al pedir.
   *
   * Entre la peticion y la firma pueden pasar dias, y en medio pudo aprobarse
   * OTRA deduccion sobre la misma linea. Dos peticiones de 30.000 sobre un
   * alquiler de 40.000 pasan las dos la validacion del alta -cada una mira lo
   * aprobado en ese momento- y solo aqui se puede ver que juntas inventan
   * 20.000 de bolsa.
   */
  if (datos.aprobar) {
    const ya = await deduccionesDeMeta(
      sesion.companyId,
      deduccion.presupuestoMetaId,
    );
    const queda = importeVigenteDeLinea(
      deduccion.item.parcial?.toString() ?? "0.00",
      ya.porItem.get(deduccion.metaItemId) ?? "0.00",
    );
    const problema = validarDeduccion(
      {
        // Ya se comprobo al pedirla; aqui lo que importa es el tope.
        codigoRef: null,
        descripcion: deduccion.item.descripcion,
        presupuestado: queda,
        deducido: "0.00",
      },
      { importe: deduccion.importe.toString(), motivo: "comprobacion" },
    );
    if (problema) {
      return {
        ok: false,
        error:
          `${problema} Se aprobó otra deducción sobre esta misma línea ` +
          "mientras esta esperaba. Recházala y pide la que falte.",
      };
    }
  }

  try {
    await prisma.$transaction(async (tx) => {
      // La condicion de estado viaja en el WHERE, no solo en la comprobacion
      // de arriba: entre leer y escribir puede colarse otra firma, y sin esto
      // la segunda pisaria a la primera -y el rastro diria que aprobo quien
      // llego tarde-.
      const { count } = await tx.deduccionCostoPropio.updateMany({
        where: { id: deduccionId, estado: "PENDIENTE" },
        data: {
          estado: datos.aprobar ? "APROBADA" : "RECHAZADA",
          resueltaAt: new Date(),
          resueltaPor: quien(sesion),
          motivoRechazo: datos.aprobar ? null : motivoRechazo,
        },
      });
      if (count === 0) throw new YaResuelta();

      await tx.auditLog.create({
        data: {
          companyId: sesion.companyId,
          userId: sesion.userId,
          projectId: obraId,
          entidad: "DeduccionCostoPropio",
          entidadId: deduccion.id.slice(0, 40),
          accion: "UPDATE",
          antes: { estado: "PENDIENTE" },
          despues: {
            estado: datos.aprobar ? "APROBADA" : "RECHAZADA",
            numero: deduccion.numero,
            importe: deduccion.importe.toString(),
            linea: deduccion.item.descripcion,
            ...(datos.aprobar ? {} : { motivoRechazo }),
          },
        },
      });
    });
  } catch (e) {
    // Se avisa, NO se devuelve ok. Decir que si cuando la firma fue de otro
    // dejaria a quien pulso creyendo que aprobo el, y el rastro diria otra
    // cosa: en un circuito de dos firmas, quien firmo es el dato.
    if (e instanceof YaResuelta) {
      return {
        ok: false,
        error:
          "Otra persona acaba de resolver esta deducción. Recarga la página " +
          "para ver cómo quedó.",
      };
    }
    throw e;
  }

  return { ok: true };
}
