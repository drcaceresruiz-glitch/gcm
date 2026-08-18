import { restar, esPositivo } from "@/lib/decimal";

/**
 * Los gastos generales que duran mas que la obra.
 *
 * Un gasto VARIABLE se presupuesta como `monto mensual x meses`, y esos meses
 * se escriben a mano en el Excel. Nada comprobaba que tuvieran algo que ver
 * con el plazo real: un residente a ocho meses en una obra de trece dias
 * entraba sin una sola queja, y de ahi salian los 125.700 de gastos generales
 * sobre un costo directo de 15.478.
 *
 * NO se bloquea. Una linea puede durar legitimamente mas que la obra —una
 * carta fianza que se mantiene despues de entregar, un alquiler con preaviso—
 * y el sistema no puede decidirlo por el jefe de obra. Pero tiene que decirlo:
 * la diferencia entre «lo puse a proposito» y «copie la plantilla» es lo que
 * separa una meta util de una cifra inventada.
 *
 * Los FIJO no se miran: por definicion el plazo no los mueve.
 */

export interface LineaConPlazo {
  concepto: string;
  /// "VARIABLE" | "FIJO". Solo se miran las variables.
  tipo: string;
  /// Meses que presupuesta esta linea. null en las fijas.
  meses: string | null;
}

export interface LineaLarga {
  concepto: string;
  meses: string;
  /// Meses que se pasa del plazo de la obra.
  exceso: string;
}

/**
 * Que lineas se pasan del plazo, y cuanto.
 *
 * `mesesObra` sale de las fechas de la obra —las que se fijaron al crearla—,
 * asi que esta comparacion no depende de que nadie teclee un plazo.
 */
export function lineasMasLargasQueLaObra(
  lineas: readonly LineaConPlazo[],
  mesesObra: string,
): LineaLarga[] {
  // Sin plazo de obra no hay contra que comparar. Devolver todo como "largo"
  // seria peor que callarse: un aviso que salta siempre deja de leerse.
  if (!esPositivo(mesesObra)) return [];

  const largas: LineaLarga[] = [];

  for (const linea of lineas) {
    if (linea.tipo !== "VARIABLE" || linea.meses === null) continue;

    const exceso = restar(linea.meses, mesesObra, 2);
    if (exceso === null || !esPositivo(exceso)) continue;

    largas.push({ concepto: linea.concepto, meses: linea.meses, exceso });
  }

  return largas;
}


export interface MesesAjustados {
  /// Indice de la linea en la lista que se paso, para poder casarlas.
  indice: number;
  /// Meses que tenia.
  antes: string;
  /// Meses que le tocan segun el plazo de la obra.
  despues: string;
}

/**
 * Reescala los meses de las lineas VARIABLES al plazo real de la obra.
 *
 * Conserva la PROPORCION entre lineas en vez de poner el mismo numero en
 * todas: si el almacenero llevaba 6 de los 8 meses del ejemplo, con una obra
 * de 2 meses le tocan 1,5. Nadie esta en obra todo el plazo, y esa forma es
 * justo lo que la plantilla enseña.
 *
 * El plazo de referencia es el MAYOR de los meses presupuestados: es el que
 * hacia de «plazo de obra» implicito cuando se escribieron a mano.
 *
 * Es la misma regla que usa la plantilla al generarse, y vive aqui para que
 * no haya dos copias: la que propone el Excel y la que corrige la pantalla
 * tienen que dar el mismo numero.
 */
export function mesesAjustadosAlPlazo(
  lineas: readonly LineaConPlazo[],
  mesesObra: string,
): MesesAjustados[] {
  const obra = Number(mesesObra);
  if (!Number.isFinite(obra) || obra <= 0) return [];

  const variables = lineas
    .map((l, indice) => ({ l, indice }))
    .filter((x) => x.l.tipo === "VARIABLE" && x.l.meses !== null);

  const plazoAsumido = Math.max(
    ...variables.map((x) => Number(x.l.meses) || 0),
    0,
  );
  if (plazoAsumido <= 0) return [];

  const ajustes: MesesAjustados[] = [];

  for (const { l, indice } of variables) {
    const antes = Number(l.meses);
    if (!Number.isFinite(antes)) continue;

    // Nunca cero: una linea de cero meses no cuesta nada y desaparece de la
    // suma sin que nadie la haya quitado.
    const crudo = (obra * antes) / plazoAsumido;
    const despues = Math.max(0.01, Math.round(crudo * 100) / 100);

    if (despues === antes) continue;

    ajustes.push({
      indice,
      antes: antes.toFixed(2),
      despues: despues.toFixed(2),
    });
  }

  return ajustes;
}
