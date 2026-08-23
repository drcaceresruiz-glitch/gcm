import "server-only";

import { prisma } from "@/lib/prisma";
import { puede } from "@/lib/rbac";
import { esCero, normalizarDecimal, sumar } from "@/lib/decimal";
import {
  bolsaComprometida,
  type BolsaComprometida,
  type FrenteContratado,
} from "@/lib/bolsa-comprometida";
import { importeDeFrente } from "@/lib/encargos";
import { codigoDeFallo } from "@/lib/fallo-de-base";
import { montoVigente, resumenAdendas, type ResumenAdendas } from "@/lib/adendas";
import { motivoSiObraCerrada } from "@/services/obra-abierta";
import type { SesionActiva } from "@/services/sesion.service";
import type { EstadoAdenda } from "@/generated/prisma/enums";

/**
 * Adicionales y deductivos del contratista, con su circuito de dos firmas.
 *
 * QUIEN PIDE NO FIRMA. El residente esta en obra y es quien se percata de que
 * faltaba alcance: la registra y con eso queda PENDIENTE. La firma que suelta
 * el dinero es de gerencia (`adenda:aprobar`), porque sale del margen de la
 * obra. Son dos permisos distintos a proposito, y esa separacion es la razon
 * de ser del circuito: si el mismo que pide aprueba, el circuito no existe.
 *
 * La aritmetica vive en `@/lib/adendas`, pura y con pruebas. Aqui solo queda
 * lo que toca datos: permisos, aislamiento por empresa y las guardas de
 * estado.
 */

function quien(sesion: SesionActiva): string {
  return `${sesion.nombres} ${sesion.apellidos}`.trim().slice(0, 150);
}

export interface AdendaFila {
  id: string;
  numero: number;
  fecha: Date;
  importe: string;
  concepto: string;
  motivo: string;
  referencia: string | null;
  estado: EstadoAdenda;
  registradaPor: string;
  resueltaAt: Date | null;
  resueltaPor: string | null;
  motivoRechazo: string | null;
}

export interface AdendasDelEncargo {
  filas: AdendaFila[];
  resumen: ResumenAdendas;
  /// Lo firmado mas las adendas APROBADAS. Es contra esto contra lo que se
  /// valoriza de aqui en adelante.
  montoVigente: string;
}

const SIN_ADENDAS: AdendasDelEncargo = {
  filas: [],
  resumen: resumenAdendas([]),
  montoVigente: "0.00",
};

/**
 * Las adendas de un encargo, con sus cuentas.
 *
 * `encargo:leer` y no un permiso propio: quien puede ver el contrato puede
 * ver como ha cambiado. Esconder las adendas a quien ve el monto seria
 * enseñarle una cifra sin su explicacion.
 */
export async function adendasDelEncargo(
  sesion: SesionActiva,
  obraId: string,
  encargoId: string,
): Promise<AdendasDelEncargo> {
  if (!puede(sesion, "encargo:leer")) return SIN_ADENDAS;

  const encargo = await prisma.encargoProveedor.findFirst({
    // El filtro por empresa sale de la SESION, no de la peticion: es lo que
    // impide leer el contrato de otra constructora cambiando el id.
    where: {
      id: encargoId,
      projectId: obraId,
      project: { companyId: sesion.companyId },
    },
    select: { montoContratado: true },
  });
  if (!encargo) return SIN_ADENDAS;

  const filas = await prisma.adendaEncargo.findMany({
    where: { encargoId },
    orderBy: { numero: "asc" },
  });

  const contadas = filas.map((a) => ({
    importe: a.importe.toString(),
    estado: a.estado,
  }));

  return {
    filas: filas.map((a) => ({
      id: a.id,
      numero: a.numero,
      fecha: a.fecha,
      // A texto, nunca a `number`: es dinero.
      importe: a.importe.toString(),
      concepto: a.concepto,
      motivo: a.motivo,
      referencia: a.referencia,
      estado: a.estado,
      registradaPor: a.registradaPor,
      resueltaAt: a.resueltaAt,
      resueltaPor: a.resueltaPor,
      motivoRechazo: a.motivoRechazo,
    })),
    resumen: resumenAdendas(contadas),
    montoVigente: montoVigente(
      encargo.montoContratado.toString(),
      contadas.filter((a) => a.estado === "APROBADA"),
    ),
  };
}

/**
 * Las adendas de TODOS los encargos de una obra, por encargo.
 *
 * En una sola consulta y no una por encargo: la pantalla de proveedores lista
 * todos los frentes a la vez, y una consulta por fila es como una lista de
 * veinte contratistas se vuelve veinte viajes a la base.
 */
export async function adendasPorEncargo(
  sesion: SesionActiva,
  obraId: string,
): Promise<Map<string, { aprobadas: string[]; resumen: ResumenAdendas }>> {
  const vacio = new Map<string, { aprobadas: string[]; resumen: ResumenAdendas }>();
  if (!puede(sesion, "encargo:leer")) return vacio;

  const filas = await prisma.adendaEncargo.findMany({
    where: { projectId: obraId, project: { companyId: sesion.companyId } },
    select: { encargoId: true, importe: true, estado: true },
  });

  const porEncargo = new Map<string, { importe: string; estado: EstadoAdenda }[]>();
  for (const f of filas) {
    const suyas = porEncargo.get(f.encargoId) ?? [];
    suyas.push({ importe: f.importe.toString(), estado: f.estado });
    porEncargo.set(f.encargoId, suyas);
  }

  const salida = vacio;
  for (const [encargoId, suyas] of porEncargo) {
    salida.set(encargoId, {
      aprobadas: suyas.filter((a) => a.estado === "APROBADA").map((a) => a.importe),
      resumen: resumenAdendas(suyas),
    });
  }
  return salida;
}

// ---------------------------------------------------------------------------
// Escritura
// ---------------------------------------------------------------------------

export interface DatosAdenda {
  fecha: string;
  importe: string;
  concepto: string;
  motivo: string;
  referencia?: string | null;
}

export type ResultadoAdenda =
  | { ok: true; numero: number }
  | { ok: false; error: string };

/// Tope de un solo documento. No es una mania: una adenda de ocho cifras casi
/// siempre es un dedo de mas, y ese numero acabaria en el comprometido de la
/// obra.
const TOPE = 99_999_999;

function validar(datos: DatosAdenda): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(datos.fecha)) {
    return "Indica la fecha del documento de la adenda.";
  }

  const importe = normalizarDecimal(datos.importe, 2);
  if (importe === null) return "El importe de la adenda no es un numero.";

  /*
   * CERO NO VALE, y conviene decir por que en vez de dejarlo pasar: una
   * adenda de cero no cambia el contrato, asi que no es una adenda. Si lo que
   * se quiere es dejar constancia de un acuerdo sin efecto economico, eso es
   * una nota de la obra, no un documento que mueve el comprometido.
   */
  if (esCero(importe)) {
    return "Una adenda de cero no cambia el contrato. Usa un importe positivo (adicional) o negativo (deductivo).";
  }

  if (Math.abs(Number(importe)) > TOPE) {
    return `El importe de la adenda pasa de ${TOPE.toLocaleString("es-PE")}. Revisa la cifra.`;
  }

  if (!datos.concepto.trim()) return "Falta el concepto de la adenda.";
  if (!datos.motivo.trim()) {
    return "Falta el motivo: por que procede este adicional o deductivo.";
  }

  return null;
}

/**
 * Registrar una adenda. Nace PENDIENTE, siempre.
 *
 * No hay atajo para crearla ya aprobada ni aunque quien la registre tenga
 * `adenda:aprobar`: el circuito son dos firmas y una de ellas se daria por
 * puesta. Quien tenga los dos permisos la crea y la aprueba en dos actos, y
 * el rastro dice que fue la misma persona -que es justo lo que alguien
 * querria poder auditar-.
 */
export async function crearAdenda(
  sesion: SesionActiva,
  obraId: string,
  encargoId: string,
  datos: DatosAdenda,
): Promise<ResultadoAdenda> {
  if (!puede(sesion, "adenda:crear")) {
    return { ok: false, error: "No tienes permiso para registrar adendas." };
  }

  const cerrada = await motivoSiObraCerrada(sesion, obraId);
  if (cerrada) return { ok: false, error: cerrada };

  const problema = validar(datos);
  if (problema) return { ok: false, error: problema };

  const encargo = await prisma.encargoProveedor.findFirst({
    where: {
      id: encargoId,
      projectId: obraId,
      project: { companyId: sesion.companyId },
    },
    select: { id: true, estado: true, numero: true },
  });
  if (!encargo) return { ok: false, error: "Encargo no encontrado." };

  if (encargo.estado === "ANULADO") {
    return {
      ok: false,
      error: "Un encargo anulado no admite adendas: no hay contrato que modificar.",
    };
  }

  const importe = normalizarDecimal(datos.importe, 2)!;

  try {
    const creada = await prisma.$transaction(async (tx) => {
      // El correlativo, DENTRO de la transaccion y sobre el maximo actual.
      // Dos altas a la vez no pueden llevarse el mismo numero: la unicidad
      // (encargoId, numero) rechaza a la segunda y todo se deshace.
      const ultima = await tx.adendaEncargo.aggregate({
        where: { encargoId },
        _max: { numero: true },
      });
      const numero = (ultima._max.numero ?? 0) + 1;

      const a = await tx.adendaEncargo.create({
        data: {
          encargoId,
          // Copia de la obra del encargo, ya comprobada arriba contra la
          // empresa de la sesion. No se toma de la peticion.
          projectId: obraId,
          numero,
          fecha: new Date(`${datos.fecha}T00:00:00.000Z`),
          importe,
          concepto: datos.concepto.trim().slice(0, 300),
          motivo: datos.motivo.trim(),
          referencia: datos.referencia?.trim().slice(0, 120) || null,
          registradaPor: quien(sesion),
        },
        select: { id: true, numero: true },
      });

      await tx.auditLog.create({
        data: {
          companyId: sesion.companyId,
          userId: sesion.userId,
          projectId: obraId,
          entidad: "AdendaEncargo",
          entidadId: a.id.slice(0, 40),
          accion: "CREATE",
          despues: {
            encargo: encargo.numero,
            numero: a.numero,
            importe,
            concepto: datos.concepto.trim(),
            estado: "PENDIENTE",
          },
        },
      });

      return a;
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
          "Otra persona acaba de registrar una adenda en este encargo y se llevo " +
          "el numero. Vuelve a guardar: no se ha perdido nada.",
      };
    }
    throw e;
  }
}

export interface DatosResolucion {
  aprobar: boolean;
  /// Obligatorio al rechazar. Un «no» sin motivo no sirve para negociar con
  /// el contratista despues.
  motivoRechazo?: string | null;
}

/**
 * La segunda firma: aprobar o rechazar.
 *
 * IRREVERSIBLE, igual que aprobar un movimiento presupuestal. Una adenda
 * aprobada se corrige con otra de signo contrario, no deshaciendola: si se
 * pudiera desaprobar, el comprometido de la obra podria bajar sin que quedara
 * rastro de que alguna vez subio, y esa es exactamente la cifra que se mira
 * para saber si la obra se esta yendo.
 */
export async function resolverAdenda(
  sesion: SesionActiva,
  obraId: string,
  adendaId: string,
  datos: DatosResolucion,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!puede(sesion, "adenda:aprobar")) {
    return {
      ok: false,
      error:
        "No tienes permiso para aprobar adendas. Quien registra el adicional no " +
        "es quien lo firma: esa segunda firma es de gerencia.",
    };
  }

  const cerrada = await motivoSiObraCerrada(sesion, obraId);
  if (cerrada) return { ok: false, error: cerrada };

  const motivoRechazo = (datos.motivoRechazo ?? "").trim();
  if (!datos.aprobar && !motivoRechazo) {
    return {
      ok: false,
      error: "Para rechazar hace falta el motivo: es lo que se le responde al contratista.",
    };
  }

  const adenda = await prisma.adendaEncargo.findFirst({
    where: {
      id: adendaId,
      projectId: obraId,
      project: { companyId: sesion.companyId },
    },
    select: { id: true, numero: true, estado: true, importe: true, encargoId: true },
  });
  if (!adenda) return { ok: false, error: "Adenda no encontrada." };

  if (adenda.estado !== "PENDIENTE") {
    return {
      ok: false,
      error:
        `Esta adenda ya esta ${adenda.estado === "APROBADA" ? "aprobada" : "rechazada"} ` +
        "y no se puede volver a resolver. Para corregirla se registra otra adenda.",
    };
  }

  try {
    await prisma.$transaction(async (tx) => {
      // La condicion de estado viaja en el WHERE, no solo en la comprobacion
      // de arriba: entre leer y escribir puede colarse otra firma, y sin esto
      // la segunda pisaria a la primera -y el rastro diria que aprobo quien
      // llego tarde-.
      const { count } = await tx.adendaEncargo.updateMany({
        where: { id: adendaId, estado: "PENDIENTE" },
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
          entidad: "AdendaEncargo",
          entidadId: adenda.id.slice(0, 40),
          accion: "UPDATE",
          antes: { estado: "PENDIENTE" },
          despues: {
            estado: datos.aprobar ? "APROBADA" : "RECHAZADA",
            numero: adenda.numero,
            importe: adenda.importe.toString(),
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
          "Otra persona acaba de resolver esta adenda. Recarga la pagina para " +
          "ver como quedo.",
      };
    }
    throw e;
  }

  return { ok: true };
}

class YaResuelta extends Error {}


// ---------------------------------------------------------------------------
// La bolsa comprometida
// ---------------------------------------------------------------------------

/**
 * Cuanto queda de la bolsa una vez contados los contratos ya firmados.
 *
 * Cruza cada encargo con lo que la META preveia para SUS partidas. De la meta
 * y no del contractual: la bolsa mide lo que ibas a gastar contra lo que
 * cobras, y comparar el contrato del proveedor con el precio de venta mezcla
 * los dos lados.
 *
 * El cruce va por CODIGO -`WbsItem.codigoPartida` contra
 * `PresupuestoMetaItem.codigoRef`- y no por id, por el mismo motivo por el
 * que el mapeo del cronograma guarda el codigo: la meta se puede recargar
 * entera y los ids cambian, los codigos no.
 *
 * Devuelve `null` cuando no hay con que calcularlo -sin meta o sin
 * contractual-. Un cero diria «no te has desviado», que es lo contrario de
 * «no lo se».
 */
export async function bolsaComprometidaDeObra(
  sesion: SesionActiva,
  obraId: string,
  /// La bolsa prevista, que la calcula `compararConContractual`. Se recibe en
  /// vez de recalcularse para que las dos pantallas no puedan discrepar.
  prevista: string,
): Promise<BolsaComprometida | null> {
  if (!puede(sesion, "encargo:leer") || !puede(sesion, "meta:leer")) return null;

  const meta = await prisma.presupuestoMeta.findFirst({
    where: { projectId: obraId, project: { companyId: sesion.companyId } },
    orderBy: { version: "desc" },
    select: { id: true },
  });
  if (!meta) return null;

  const [items, encargos, adendas] = await Promise.all([
    prisma.presupuestoMetaItem.findMany({
      where: { presupuestoMetaId: meta.id, codigoRef: { not: null } },
      select: { codigoRef: true, parcial: true },
    }),
    prisma.encargoProveedor.findMany({
      // Los ANULADOS no cuentan: no hay contrato. Los CERRADOS si, porque su
      // dinero se gasto igual.
      where: { projectId: obraId, estado: { not: "ANULADO" } },
      orderBy: { numero: "asc" },
      select: {
        id: true,
        numero: true,
        descripcion: true,
        montoContratado: true,
        proveedor: { select: { razonSocial: true } },
        partidas: {
          select: {
            fraccion: true,
            partida: { select: { codigoPartida: true } },
          },
        },
      },
    }),
    prisma.adendaEncargo.findMany({
      where: { projectId: obraId, project: { companyId: sesion.companyId } },
      select: { encargoId: true, importe: true, estado: true },
    }),
  ]);

  const metaPorCodigo = new Map(
    items.map((i) => [i.codigoRef!, i.parcial?.toString() ?? "0.00"]),
  );

  const aprobadasPorEncargo = new Map<string, { importe: string }[]>();
  for (const a of adendas.filter((x) => x.estado === "APROBADA")) {
    const suyas = aprobadasPorEncargo.get(a.encargoId) ?? [];
    suyas.push({ importe: a.importe.toString() });
    aprobadasPorEncargo.set(a.encargoId, suyas);
  }

  const frentes: FrenteContratado[] = encargos.map((e) => ({
    encargoId: e.id,
    numero: e.numero,
    descripcion: e.descripcion,
    proveedor: e.proveedor.razonSocial,
    montoVigente: montoVigente(
      e.montoContratado.toString(),
      aprobadasPorEncargo.get(e.id) ?? [],
    ),
    // `importeDeFrente` reparte por la fraccion: una partida partida entre
    // dos contratistas no se cuenta entera en cada uno.
    previstoEnLaMeta: importeDeFrente(
      e.partidas.map((p) => ({
        parcial: metaPorCodigo.get(p.partida.codigoPartida) ?? "0.00",
        fraccion: p.fraccion.toString(),
      })),
    ),
  }));

  const pendiente = sumar(
    adendas.filter((a) => a.estado === "PENDIENTE").map((a) => a.importe.toString()),
  );

  return bolsaComprometida(prevista, frentes, pendiente);
}
