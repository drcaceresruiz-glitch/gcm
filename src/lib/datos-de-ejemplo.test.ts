import { describe, expect, it } from "vitest";

import {
  origenDeEjemplo,
  pareceContractualDeEjemplo,
  pareceMetaDeEjemplo,
} from "@/lib/datos-de-ejemplo";
import {
  COSTO_PROPIO_EJEMPLO,
  TOTAL_CONTRACTUAL_EJEMPLO,
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
    expect(pareceContractualDeEjemplo(TOTAL_CONTRACTUAL_EJEMPLO)).toBe(true);
  });

  it("caza la meta de ejemplo sumando sus dos mitades", () => {
    // Partidas mas costos propios. Mirar solo el costo directo dejaria de
    // reconocerla: los sueldos son el 92 % del total del ejemplo.
    expect(
      pareceMetaDeEjemplo({
        costoDirectoMeta: "11358.00",
        costoPropioMeta: COSTO_PROPIO_EJEMPLO,
      }),
    ).toBe(true);
  });

  it("y no la caza si solo coincide una de las dos", () => {
    expect(
      pareceMetaDeEjemplo({
        costoDirectoMeta: "11358.00",
        costoPropioMeta: "0.00",
      }),
    ).toBe(false);
  });

  it("una obra de verdad no salta", () => {
    // El control que impide que el aviso salga siempre: sin esto, una funcion
    // que devolviera true a todo pasaria las tres pruebas de arriba.
    expect(
      origenDeEjemplo({
        costoDirectoContractual: "735255.61",
        costoDirectoMeta: "612000.00",
        costoPropioMeta: "48000.00",
      }),
    ).toEqual({ contractual: false, meta: false, hay: false });
  });

  it("distingue cual de los dos viene del ejemplo", () => {
    // El consejo cambia: si solo el contractual es de ejemplo hay que rehacer
    // el presupuesto; si solo la meta, basta con volver a cargarla.
    expect(
      origenDeEjemplo({
        costoDirectoContractual: TOTAL_CONTRACTUAL_EJEMPLO,
        costoDirectoMeta: "612000.00",
        costoPropioMeta: "48000.00",
      }),
    ).toEqual({ contractual: true, meta: false, hay: true });
  });

  it("el caso completo: la obra entera es la plantilla", () => {
    expect(
      origenDeEjemplo({
        costoDirectoContractual: TOTAL_CONTRACTUAL_EJEMPLO,
        costoDirectoMeta: "11358.00",
        costoPropioMeta: COSTO_PROPIO_EJEMPLO,
      }),
    ).toEqual({ contractual: true, meta: true, hay: true });
  });
});
