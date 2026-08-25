import "server-only";

import { prisma } from "@/lib/prisma";
import { puede } from "@/lib/rbac";
import { sumar } from "@/lib/decimal";
import { bacDeObra } from "@/services/presupuesto-obra";
import { metricasEvm, valorDeAvance, type MetricasEvm } from "@/lib/evm";
import { cobertura } from "@/lib/mapeo-partidas";
import { datosCurvaS } from "@/services/cronograma.service";
import type { SesionActiva } from "@/services/sesion.service";
import { alcanzaObra } from "@/lib/alcance-obras";

/**
 * Valor ganado (EVM) de una obra.
 *
 * Junta las tres piezas que ya viven en el sistema:
 *   - BAC = presupuesto vigente (suma de parciales).
 *   - EV/PV = ese presupuesto por el %avance —real y planeado— del cronograma.
 *     El %avance se pondera por DURACION, que es lo unico que trae el archivo;
 *     cuando el mapeo tarea-partida pase del 60% se podra pesar por dinero y la
 *     cifra afinara, pero la formula del EVM no cambia.
 *   - AC = comprometido en ordenes aprobadas. Es "comprometido, no devengado":
 *     puede sesgar el CPI a la baja al principio, porque se compromete antes de
 *     ejecutar. Solo se ve con permiso de ordenes; sin el, el EVM se queda en
 *     su mitad de PLAZO.
 *
 *     OJO: el AC cuenta TODAS las ordenes aprobadas —sueltas y contra
 *     encargo— y NO es el «Comprometido» de las pantallas, que desde la
 *     decision del 18/08 suma encargos vigentes + ordenes sueltas. Aqui el
 *     monto de un encargo no entra a proposito: es promesa de costo, no costo
 *     formalizado, y meterlo hundiria el CPI el dia de la firma sin que se
 *     haya movido un ladrillo. El costo del encargo entra al AC a medida que
 *     sus ordenes lo formalizan.
 *
 * La aritmetica esta en `@/lib/evm` (pura, probada); aqui solo se traen los
 * datos y se cruzan.
 */

export interface PuntoEvm {
  fecha: Date;
  valor: number;
}

export interface DatosEvm {
  bac: string;
  /// De que se compone el BAC, para poder explicarlo en pantalla: el
  /// presupuesto contratado y los adicionales aprobados encima.
  baseBac: string;
  ajustesBac: string;
  fechaCorte: Date;
  /// Se puede ver el costo (AC/CPI/CV): exige permiso de ordenes.
  verCosto: boolean;
  /// 0..100. Cuanto del presupuesto tiene ya el mapeo tarea-partida. Decide si
  /// se puede afinar a ponderacion por dinero (compuerta en 60%).
  coberturaMapeo: number;
  metricas: MetricasEvm;
  /// El valor planeado dia a dia, para la curva.
  planPv: PuntoEvm[];
  /// El valor ganado en cada corte medido.
  cortesEv: PuntoEvm[];
  /// El costo real acumulado por fecha de orden. Vacio sin permiso de ordenes.
  costoAc: PuntoEvm[];
  /// La version de cronograma que hace de linea base (contra la que se mide el
  /// PV/SPI) y cuando se fijo. null si la obra aun no ha fijado una: entonces el
  /// PV cae al % del archivo del corte vigente.
  lineaBase: { version: number; fijadaEn: Date | null } | null;
  inicio: Date | null;
  fin: Date | null;
}

export async function datosEvm(
  sesion: SesionActiva,
  obraId: string,
): Promise<DatosEvm | null> {
  if (!puede(sesion, "cronograma:leer")) return null;

  // El alcance por obra, con la MISMA respuesta que «no tienes permiso»: las
  // dos dicen «esto no es para ti» y distinguirlas ya seria contar algo. Ver
  // la regla 4 en `gcm-limites-de-capas`.
  if (!alcanzaObra(sesion, obraId)) return null;

  const verCosto = puede(sesion, "orden:leer");
  const deLaObra = { projectId: obraId, project: { companyId: sesion.companyId } };

  const [curva, presupuesto, items, enlaces, imputaciones] = await Promise.all([
    datosCurvaS(sesion, obraId),
    // El BAC: base con la regla de hojas MAS los adicionales aprobados.
    bacDeObra(obraId),
    // Estas filas ya solo alimentan la cobertura del mapeo.
    prisma.wbsItem.findMany({
      where: { ...deLaObra },
      select: { codigoPartida: true, parcial: true },
    }),
    prisma.mapeoTareaPartida.findMany({
      where: { projectId: obraId },
      select: { uid: true, codigoPartida: true },
    }),
    verCosto
      ? prisma.ordenImputacion.findMany({
          where: {
            ordenCompra: {
              projectId: obraId,
              companyId: sesion.companyId,
              estado: "APROBADA",
            },
          },
          select: {
            importe: true,
            ordenCompra: { select: { fecha: true } },
          },
        })
      : Promise.resolve([]),
  ]);

  // Sin cortes no hay avance que valorar: la pantalla lo dice y no inventa un
  // EVM sobre cero.
  if (curva.cortes.length === 0) return null;

  // El BAC lo resuelve `bacDeObra`, que arregla dos cosas de golpe: cuenta el
  // presupuesto UNA vez (regla de hojas) y suma los adicionales aprobados,
  // que antes quedaban fuera mientras su gasto SI contaba en el AC.
  const bac = presupuesto.bac;

  const ultimo = curva.cortes[curva.cortes.length - 1]!;
  // El punto ACTUAL: el ultimo avance semanal de GCM (o el ultimo corte si aun
  // no hay avances). Asi el EVM avanza sin reimportar. El PV es el plan
  // (congelado si hay linea base) a esa misma fecha; el EV, el % real medido.
  const actual = curva.puntoActual ?? {
    fecha: ultimo.fecha,
    real: Number(ultimo.real),
    planeado: curva.planeadoBaseEnCorte ?? Number(ultimo.planeado),
  };
  const pv = valorDeAvance(bac, actual.planeado);
  const ev = valorDeAvance(bac, actual.real);

  // AC total a la fecha: todo lo comprometido y aprobado. Es acumulado por
  // definicion —una orden aprobada sigue comprometida—.
  const acTotal = verCosto
    ? sumar(imputaciones.map((i) => i.importe.toString()))
    : null;

  const metricas = metricasEvm({ bac, pv, ev, ac: acTotal });

  // Cobertura del mapeo, para el aviso de "por duracion vs por dinero".
  const partidas = items.map((i) => ({
    codigo: i.codigoPartida,
    descripcion: "",
    parcial: i.parcial?.toString() ?? null,
  }));
  const cob = cobertura(enlaces, partidas);

  // Series de la curva.
  const planPv: PuntoEvm[] = curva.plan.map((p) => ({
    fecha: p.fecha,
    valor: Number(valorDeAvance(bac, p.valor)),
  }));
  // La serie de valor ganado sale del real SEMANAL (avanza con GCM); si aun no
  // hay muestreo semanal, cae a los cortes importados.
  const cortesEv: PuntoEvm[] =
    curva.realSemanal.length > 0
      ? curva.realSemanal.map((p) => ({
          fecha: p.fecha,
          valor: Number(valorDeAvance(bac, p.valor)),
        }))
      : curva.cortes.map((c) => ({
          fecha: c.fecha,
          valor: Number(valorDeAvance(bac, Number(c.real))),
        }));

  // AC acumulado por fecha de orden: se agrupan las imputaciones por su fecha,
  // se ordenan y se van sumando. Con una sola orden es un escalon; con varias,
  // la escalera del gasto comprometido.
  const costoAc: PuntoEvm[] = [];
  if (verCosto && imputaciones.length > 0) {
    const porFecha = new Map<number, string[]>();
    for (const i of imputaciones) {
      const t = i.ordenCompra.fecha.getTime();
      porFecha.set(t, [...(porFecha.get(t) ?? []), i.importe.toString()]);
    }
    let acumulado = "0.00";
    for (const t of [...porFecha.keys()].sort((a, b) => a - b)) {
      acumulado = sumar([acumulado, ...porFecha.get(t)!]);
      costoAc.push({ fecha: new Date(t), valor: Number(acumulado) });
    }
  }

  return {
    bac,
    baseBac: presupuesto.base,
    ajustesBac: presupuesto.ajustes,
    fechaCorte: actual.fecha,
    verCosto,
    coberturaMapeo: cob.porcentaje,
    metricas,
    planPv,
    cortesEv,
    costoAc,
    lineaBase: curva.lineaBase,
    inicio: curva.inicio,
    fin: curva.fin,
  };
}
