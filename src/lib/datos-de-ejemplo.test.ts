import { describe, expect, it } from "vitest";

import {
  origenDeEjemplo,
  pareceContractualDeEjemplo,
  pareceMetaDeEjemplo,
} from "@/lib/datos-de-ejemplo";
import { TOTAL_EJEMPLO } from "@/lib/plantilla-presupuesto";
import {
  TOTAL_COSTO_EJEMPLO,
} from "@/lib/plantilla-meta";

/**
 * El caso real del 19/08: una obra entera cargada con las filas de ejemplo de
 * las plantillas. Contractual 18.509, meta 15.478 y 125.700 de gastos
 * generales, con una bolsa operativa de -119.892 que no significaba nada.
 *
 * Las cifras se toman de las plantillas y NO se copian aqui a mano: si alguien
 * cambia un ejemplo, la deteccion lo sigue sin que nadie se acuerde de esta
 * prueba.
 */

describe("reconocer los datos de ejemplo de las plantillas", () => {
  it("caza el presupuesto contractual de ejemplo", () => {
    expect(pareceContractualDeEjemplo(TOTAL_EJEMPLO)).toBe(true);
  });

  it("caza la meta de ejemplo por su costo directo", () => {
    expect(
      pareceMetaDeEjemplo({
        costoDirectoMeta: TOTAL_COSTO_EJEMPLO,
      }),
    ).toBe(true);
  });

  it("una obra de verdad no salta", () => {
    // El control que impide que el aviso salga siempre: sin esto, una funcion
    // que devolviera true a todo pasaria las tres pruebas de arriba.
    expect(
      origenDeEjemplo({
        costoDirectoContractual: "735255.61",
        costoDirectoMeta: "612000.00",
      }),
    ).toEqual({ contractual: false, meta: false, hay: false });
  });

  it("distingue cual de los dos viene del ejemplo", () => {
    // El consejo cambia: si solo el contractual es de ejemplo hay que rehacer
    // el presupuesto; si solo la meta, basta con volver a cargarla.
    expect(
      origenDeEjemplo({
        costoDirectoContractual: TOTAL_EJEMPLO,
        costoDirectoMeta: "612000.00",
      }),
    ).toEqual({ contractual: true, meta: false, hay: true });
  });

  it("el caso completo: la obra entera es la plantilla", () => {
    expect(
      origenDeEjemplo({
        costoDirectoContractual: TOTAL_EJEMPLO,
        costoDirectoMeta: TOTAL_COSTO_EJEMPLO,
      }),
    ).toEqual({ contractual: true, meta: true, hay: true });
  });
});
