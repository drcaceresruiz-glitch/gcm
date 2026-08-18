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
