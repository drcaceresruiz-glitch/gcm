import "server-only";

import { prisma } from "@/lib/prisma";
import { montoVigente } from "@/lib/adendas";
import {
  resumirComprometido,
  type EncargoDelComprometido,
  type ResumenComprometido,
} from "@/lib/encargos";
import type { Prisma } from "@/generated/prisma/client";
import type { SesionActiva } from "@/services/sesion.service";

/**
 * EL UNICO SITIO donde se lee de la base que esta comprometido.
 *
 *     encargos VIGENTES (su monto VIGENTE, repartido entre sus partidas)
 *   + ordenes SUELTAS aprobadas (las que no cuelgan de ningun encargo)
 *
 * Una orden emitida CONTRA un encargo no suma: su dinero ya lo puso el monto
 * del encargo, y contarla ademas seria contar el mismo compromiso dos veces.
 * Quien la excluye es el `encargoId: null` de la consulta; no es una
 * optimizacion, es la regla.
 *
 * POR QUE ESTO EXISTE. El 23 de agosto de 2026 el tablero de una obra decia
 * «Comprometido S/ 0,00 de S/ 740,00 - saldo disponible S/ 740,00» teniendo
 * un contratista con 735 firmados y 740 ya pagados. No fue un error de
 * cuentas: habia CINCO lecturas distintas del comprometido esparcidas por
 * `tablero.service`, `obras.service` (tres) y `gerencia.service`, y cuando el
 * encargo paso a ser el contrato marco solo se actualizaron algunas. La del
 * tablero se quedo contando ordenes de compra, y esa obra no tenia ninguna.
 *
 * Un saldo que dice que hay dinero libre cuando ya se gasto no parece roto,
 * parece una buena noticia. Por eso ahora todas pasan por aqui: la unica
 * forma de que dos pantallas no discrepen es que no haya dos lecturas.
 *
 * VIGENTE Y NO CONTRATADO. Se suman las adendas APROBADAS: un adicional
 * firmado por gerencia es dinero que ya se le debe al contratista y estaba
 * quedandose fuera de todas estas cifras. Una adenda PENDIENTE no entra
 * -gerencia todavia puede rechazarla-; lo que puede pasar si se aprueban
 * todas se enseña aparte, en la bolsa comprometida de la meta.
 *
 * La aritmetica no esta aqui sino en `lib/encargos.ts`, pura y probada. Aqui
 * solo se traen las filas.
 */

/** Un encargo vigente, ya con sus adendas sumadas y listo para repartir. */
export interface EncargoComprometido extends EncargoDelComprometido {
  projectId: string;
}

/** Una orden suelta aprobada, agrupada por la partida a la que imputa. */
export interface SueltaComprometida {
  /// El id de la partida. Se llama `clave` porque asi lo espera el reparto.
  clave: string;
  /// La obra de la partida, o null si la partida ya no se puede leer.
  projectId: string | null;
  importe: string;
}

export interface FilasDelComprometido {
  encargos: EncargoComprometido[];
  sueltas: SueltaComprometida[];
  /**
   * El parcial de cada partida tocada, para poder medir el sobregiro. Una
   * partida ausente de este mapa es una que no se pudo leer, y sobre esas no
   * se afirma nada.
   */
  parcialDePartida: Map<string, string>;
  /**
   * De que obra es cada partida tocada. Lo necesitan las pantallas de cartera
   * para repartir el sobregiro entre obras.
   */
  obraDePartida: Map<string, string>;
}

/**
 * Las filas del comprometido de un ambito de obras.
 *
 * `obras` es el filtro de OBRAS -no de ordenes ni de encargos-, y siempre se
 * le añade el `companyId` de la sesion donde se lee. Esa distincion tuvo su
 * incidente: al esparcir un `{ companyId }` pensado para obras dentro del
 * filtro de `OrdenCompra`, el `id` pasaba a significar el de la ORDEN y la
 * consulta no fallaba -devolvia cero, y un comprometido de 0,00 es
 * perfectamente creible en pantalla-.
 *
 * NO comprueba permisos: cada servicio que llama ya tiene los suyos y son
 * distintos segun la pantalla. Lo que si aplica siempre es la empresa.
 */
export async function filasDelComprometido(
  sesion: SesionActiva,
  obras: Prisma.ProjectWhereInput,
): Promise<FilasDelComprometido> {
  const deLaEmpresa: Prisma.ProjectWhereInput = {
    ...obras,
    companyId: sesion.companyId,
  };

  const [encargos, sueltas] = await Promise.all([
    prisma.encargoProveedor.findMany({
      where: {
        estado: "VIGENTE",
        // El encargo no lleva companyId propio: su empresa es la de su obra.
        project: deLaEmpresa,
      },
      select: {
        projectId: true,
        montoContratado: true,
        // Solo las APROBADAS. Ver la cabecera del archivo.
        adendas: { where: { estado: "APROBADA" }, select: { importe: true } },
        partidas: {
          select: {
            wbsItemId: true,
            fraccion: true,
            partida: { select: { parcial: true } },
          },
        },
      },
    }),

    prisma.ordenImputacion.groupBy({
      by: ["wbsItemId"],
      where: {
        ordenCompra: {
          estado: "APROBADA",
          encargoId: null,
          companyId: sesion.companyId,
          project: deLaEmpresa,
        },
      },
      _sum: { importe: true },
    }),
  ]);

  const parcialDePartida = new Map<string, string>();
  const obraDePartida = new Map<string, string>();

  // Las partidas de un encargo ya traen su parcial y su obra consigo: no hace
  // falta preguntarlas otra vez.
  const conEncargo: EncargoComprometido[] = encargos.map((e) => ({
    projectId: e.projectId,
    montoVigente: montoVigente(
      e.montoContratado.toString(),
      e.adendas.map((a) => ({ importe: a.importe.toString() })),
    ),
    partidas: e.partidas.map((p) => {
      const parcial = p.partida.parcial?.toString() ?? "0";
      parcialDePartida.set(p.wbsItemId, parcial);
      obraDePartida.set(p.wbsItemId, e.projectId);
      return {
        clave: p.wbsItemId,
        parcial,
        fraccion: p.fraccion.toString(),
      };
    }),
  }));

  // Las de las ordenes sueltas si hay que preguntarlas, pero solo las que no
  // hayan aparecido ya por un encargo.
  const porBuscar = sueltas
    .map((s) => s.wbsItemId)
    .filter((id) => !obraDePartida.has(id));

  if (porBuscar.length > 0) {
    const partidas = await prisma.wbsItem.findMany({
      // Tambien acotado a la empresa: el filtro se repite en cada capa donde
      // se lee, no se confia en que quien llama ya filtro bien mas arriba.
      where: {
        id: { in: porBuscar },
        project: { companyId: sesion.companyId },
      },
      select: { id: true, parcial: true, projectId: true },
    });
    for (const p of partidas) {
      parcialDePartida.set(p.id, p.parcial?.toString() ?? "0");
      obraDePartida.set(p.id, p.projectId);
    }
  }

  return {
    encargos: conEncargo,
    sueltas: sueltas.map((s) => ({
      clave: s.wbsItemId,
      projectId: obraDePartida.get(s.wbsItemId) ?? null,
      importe: s._sum.importe?.toString() ?? "0",
    })),
    parcialDePartida,
    obraDePartida,
  };
}

/**
 * El comprometido de UN ambito entero, sin separar por obra.
 *
 * Para las pantallas que enseñan una sola cifra: el tablero de una obra y el
 * total de la cabecera del panel de empresa.
 */
export async function comprometidoDelAmbito(
  sesion: SesionActiva,
  obras: Prisma.ProjectWhereInput,
): Promise<ResumenComprometido> {
  const filas = await filasDelComprometido(sesion, obras);
  return resumirComprometido(
    filas.encargos,
    filas.sueltas,
    filas.parcialDePartida,
  );
}

/**
 * El comprometido OBRA POR OBRA, desde una sola lectura.
 *
 * Las pantallas de cartera -la lista de obras, las alertas del panel, el
 * sobregiro proyectado de gerencia- necesitan la cifra de cada obra a la vez.
 * Repartir aqui, en memoria, evita una consulta por obra y garantiza que el
 * total de la cabecera y la suma de las filas salgan del mismo dato.
 */
export async function comprometidoPorObra(
  sesion: SesionActiva,
  obras: Prisma.ProjectWhereInput,
): Promise<Map<string, ResumenComprometido>> {
  const filas = await filasDelComprometido(sesion, obras);
  return repartirPorObra(filas);
}

/** El reparto por obra de unas filas ya leidas. Puro, para poder probarlo. */
export function repartirPorObra(
  filas: FilasDelComprometido,
): Map<string, ResumenComprometido> {
  const encargosDe = new Map<string, EncargoComprometido[]>();
  for (const e of filas.encargos) {
    const lista = encargosDe.get(e.projectId) ?? [];
    lista.push(e);
    encargosDe.set(e.projectId, lista);
  }

  const sueltasDe = new Map<string, SueltaComprometida[]>();
  for (const s of filas.sueltas) {
    // Una imputacion cuya partida no se pudo leer no se le cuelga a ninguna
    // obra: mejor que falte a que se le cargue a la equivocada.
    if (s.projectId === null) continue;
    const lista = sueltasDe.get(s.projectId) ?? [];
    lista.push(s);
    sueltasDe.set(s.projectId, lista);
  }

  const salida = new Map<string, ResumenComprometido>();
  for (const obraId of new Set([...encargosDe.keys(), ...sueltasDe.keys()])) {
    salida.set(
      obraId,
      resumirComprometido(
        encargosDe.get(obraId) ?? [],
        sueltasDe.get(obraId) ?? [],
        filas.parcialDePartida,
      ),
    );
  }

  return salida;
}
