import { describe, expect, it } from "vitest";
import {
  EXTENSIONES_CONVERTIBLES,
  SIN_CONVERSOR,
  esConvertible,
} from "@/services/mpp.service";

/**
 * Que formatos binarios acepta el importador del cronograma.
 *
 * Aqui no se prueba la conversion —eso necesita Java y MPXJ, que en desarrollo
 * no hay— sino la decision de QUE se manda a convertir, que es logica pura y
 * gobierna dos caminos: el rechazo temprano por formato y la ruta que sigue el
 * archivo dentro.
 */
describe("esConvertible", () => {
  it("acepta los dos binarios, con cualquier caja", () => {
    expect(esConvertible("plan.mpp")).toBe(true);
    expect(esConvertible("PLAN.MPP")).toBe(true);
    expect(esConvertible("plan.pod")).toBe(true);
    expect(esConvertible("Cronograma Obra.POD")).toBe(true);
  });

  it("no toca el XML ni el Excel, que ya se leen directamente", () => {
    for (const n of ["plan.xml", "plan.xlsx", "plan.xlsm"]) {
      expect(esConvertible(n)).toBe(false);
    }
  });

  /**
   * El nombre lo escribe quien sube el archivo. Que la extension aparezca
   * por el medio no debe colar: lo que decide es como TERMINA.
   */
  it("no se deja enganar por la extension en medio del nombre", () => {
    expect(esConvertible("plan.mpp.txt")).toBe(false);
    expect(esConvertible("informe-pod-2026.pdf")).toBe(false);
  });
});

/**
 * LA REGRESION QUE IMPIDE: el mensaje de «no puedo convertir» vivia duplicado
 * en dos sitios y solo uno nombraba los dos formatos. Al anadir `.pod` habria
 * quedado uno diciendo la mitad de la verdad.
 */
describe("el aviso de que falta el conversor", () => {
  it("nombra TODOS los formatos que se mandan a convertir", () => {
    for (const extension of EXTENSIONES_CONVERTIBLES) {
      expect(SIN_CONVERSOR).toContain(extension);
    }
  });

  it("y dice que hacer en su lugar, no solo que no se puede", () => {
    expect(SIN_CONVERSOR).toContain("XML");
    expect(SIN_CONVERSOR).toContain("ProjectLibre");
  });
});
