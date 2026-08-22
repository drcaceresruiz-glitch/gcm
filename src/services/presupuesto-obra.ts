import "server-only";

import { prisma } from "@/lib/prisma";
import { sumar } from "@/lib/decimal";
import { sumarHojas, type NodoImporte } from "@/lib/jerarquia-partidas";
import { filtroDeObras, type ConAlcance } from "@/lib/alcance-obras";
import type { ProjectState } from "@/generated/prisma/enums";

/**
 * El costo directo de una obra, contado UNA sola vez.
 *
 * Existe porque el sistema tenia dos definiciones distintas de "presupuesto
 * total" conviviendo, y una de ellas estaba mal:
 *
 *   - La correcta (`sumarHojas`) la usaban el importador, la pantalla de
 *     partidas y las revisiones.
 *   - La equivocada, `SUM(parcial) WHERE tipo = "PARTIDA"`, la usaban el
 *     **BAC del valor ganado**, el tablero, la cartera de obras y la
 *     cobertura de encargos.
 *
 * Filtrar por `tipo` NO protege del doble conteo: `clasificarCodigo`
 * (`@/lib/excel-presupuesto`) marca como PARTIDA cualquier fila con importe
 * propio, incluidas las cabeceras de grupo a suma alzada que ademas tienen
 * hijas costeadas —"7.02.00 REDES DE DESAGUE" y sus partidas—. Sumar ambas
 * cuenta el mismo dinero dos veces: en el presupuesto real de CRIOCORD eso
 * inflaba el total de 754 mil a 1,8 millones.
 *
 * El dano no era cosmetico. El BAC inflado sube `EV = BAC x %`, con lo que
 * **el CPI parecia ahorro**, el EAC se distorsionaba y el saldo del tablero
 * mostraba dinero que no existia. Y no daba ningun sintoma, porque el SPI y
 * el % de avance son ratios sobre el mismo BAC y salian iguales.
 *
 * Se calcula en memoria y no con un `SUM` de la base a proposito: decidir
 * que fila aporta depende del ARBOL de codigos, y eso SQL no lo sabe. Es mas
 * caro que un agregado, y es el precio de que la cifra sea cierta.
 */

export interface TotalObra {
  /// Suma de las hojas costeadas. Nunca cuenta un ancestro y su descendiente.
  costoDirecto: string;
  /// Cuantas filas son de tipo PARTIDA (no cuantas aportan).
  partidas: number;
}

const VACIO: TotalObra = { costoDirecto: "0.00", partidas: 0 };

/**
 * Convierte las filas de una obra al formato que entiende `sumarHojas`.
 *
 * Los capitulos se anulan ANTES de resolver la jerarquia, igual que hacen
 * `listarPartidas` y `obtenerPresupuestoVigente`: un capitulo con importe
 * —que la interfaz todavia permite escribir— entraria como aportante y la
 * suma dejaria de cuadrar con la linea base.
 */
function aNodos(
  filas: readonly { codigoPartida: string; tipo: string; parcial: unknown }[],
): NodoImporte[] {
  return filas.map((f) => ({
    codigo: f.codigoPartida,
    parcial: f.tipo === "PARTIDA" ? (f.parcial?.toString() ?? null) : null,
  }));
}

/** El costo directo de varias obras de una vez. */
export async function totalesPorObra(
  obraIds: readonly string[],
): Promise<Map<string, TotalObra>> {
  const salida = new Map<string, TotalObra>();
  if (obraIds.length === 0) return salida;

  const filas = await prisma.wbsItem.findMany({
    where: { projectId: { in: [...obraIds] } },
    select: { projectId: true, codigoPartida: true, tipo: true, parcial: true },
  });

  const porObra = new Map<string, typeof filas>();
  for (const f of filas) {
    const acumulado = porObra.get(f.projectId) ?? [];
    acumulado.push(f);
    porObra.set(f.projectId, acumulado);
  }

  // Se responde por TODAS las obras pedidas, tambien por las que no tienen
  // ninguna partida: quien llama espera una entrada por obra y un `undefined`
  // le obligaria a repetir el `?? 0` en cada sitio.
  for (const id of obraIds) {
    const suyas = porObra.get(id);
    if (!suyas) {
      salida.set(id, VACIO);
      continue;
    }
    salida.set(id, {
      costoDirecto: sumarHojas(aNodos(suyas)),
      partidas: suyas.filter((f) => f.tipo === "PARTIDA").length,
    });
  }

  return salida;
}

/** El costo directo de una obra. */
export async function totalDeObra(obraId: string): Promise<TotalObra> {
  return (await totalesPorObra([obraId])).get(obraId) ?? VACIO;
}

export interface BacObra {
  /// Contra lo que se mide: base mas ajustes aprobados.
  bac: string;
  /// El presupuesto del arbol vivo (lo contratado originalmente).
  base: string;
  /// Adicionales y deductivos aprobados. Cero si no hay linea base.
  ajustes: string;
  /// Si hay linea base aprobada. Sin ella no existe "por encima de la base".
  conLineaBase: boolean;
}

/**
 * El presupuesto contra el que se mide el valor ganado.
 *
 * Antes el BAC salia solo de `wbsItem.parcial`, o sea del presupuesto
 * CONTRATADO ORIGINAL. Y las partidas que nacen de un adicional se crean con
 * `parcial: null` a proposito —su dinero vive en la linea del movimiento—,
 * asi que no sumaban nada... mientras que el costo real (AC) SI contaba las
 * ordenes imputadas a esas mismas partidas.
 *
 * El efecto era perverso: **cada adicional aprobado metia gasto sin subir el
 * presupuesto de referencia, y el CPI se degradaba solo**. Cuanto mejor se
 * gestionaban los adicionales, peor se veia la obra.
 *
 * Ahora: la base (el arbol vivo, con la regla de hojas) mas los ajustes
 * aprobados de la linea base vigente. Los deductivos restan porque los
 * importes ya vienen con signo, y una reconversion suma cero por definicion
 * —mueve dinero de una partida a otra sin cambiar el total—.
 *
 * No se reutiliza `obtenerPresupuestoVigente` a proposito: aquella exige
 * `movimiento:leer` y lanza si no hay linea base, y el EVM lo mira gente que
 * solo tiene `cronograma:leer`. Aqui hace falta la CIFRA, no el detalle por
 * partida.
 */
export async function bacDeObra(obraId: string): Promise<BacObra> {
  const base = (await totalDeObra(obraId)).costoDirecto;

  // Solo la linea base APROBADA mas reciente: los movimientos de una revision
  // anterior ya no ajustan a la que esta en pie.
  const lineaBase = await prisma.baseline.findFirst({
    where: { projectId: obraId, aprobadaAt: { not: null } },
    orderBy: { version: "desc" },
    select: { id: true },
  });

  if (!lineaBase) {
    return { bac: base, base, ajustes: "0.00", conLineaBase: false };
  }

  const movidos = await prisma.movimientoLinea.aggregate({
    where: {
      movimiento: {
        projectId: obraId,
        baselineId: lineaBase.id,
        estado: "APROBADO",
      },
    },
    _sum: { importe: true },
  });

  const ajustes = sumar([movidos._sum.importe?.toString() ?? "0"]);

  return {
    bac: sumar([base, ajustes]),
    base,
    ajustes,
    conLineaBase: true,
  };
}

/**
 * El costo directo de las obras de una empresa, sumado.
 *
 * Se resuelve obra por obra y luego se suma, porque la regla de hojas es
 * por arbol: mezclar los codigos de dos obras haria que la "4.1" de una
 * pareciera hija de la "4" de la otra.
 *
 * `estado` acota la suma a las obras en ese estado (uno o varios); sin el,
 * entran todas. Existe porque el panel ensena solo lo que sigue teniendo
 * exposicion real —EN_EJECUCION y PARALIZADA—, mientras que la cartera
 * completa es cifra de presentacion.
 *
 * El sujeto trae su ALCANCE y es obligatorio, no opcional: quien solo
 * gestiona una obra no puede leer el presupuesto agregado de la cartera
 * entera ni siquiera sumado. Al ser obligatorio, `tsc` obliga a decidirlo en
 * cada sitio que llame aqui, hoy y el dia que aparezca el segundo.
 */
export async function totalDeEmpresa(
  sujeto: { companyId: string } & ConAlcance,
  estado?: ProjectState | readonly ProjectState[],
): Promise<string> {
  const filtroEstado = estado
    ? { estado: { in: Array.isArray(estado) ? [...estado] : [estado] } }
    : {};

  const obras = await prisma.project.findMany({
    where: {
      companyId: sujeto.companyId,
      ...filtroEstado,
      ...filtroDeObras(sujeto),
    },
    select: { id: true },
  });

  const totales = await totalesPorObra(obras.map((o) => o.id));
  return sumarHojas(
    [...totales.values()].map((t, i) => ({
      // Codigos irrepetibles y sin jerarquia entre si: cada obra ya viene
      // resuelta, aqui solo se suman importes que no se cubren unos a otros.
      codigo: `obra-${i}`,
      parcial: t.costoDirecto,
    })),
  );
}
