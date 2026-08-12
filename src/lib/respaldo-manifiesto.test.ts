import { describe, expect, it } from "vitest";

import {
  canonicalizar,
  claveDeRespaldo,
  firmar,
  firmaValida,
  revisarManifiesto,
  sha256Hex,
  TIPO_RESPALDO,
  type Manifiesto,
} from "@/lib/respaldo-manifiesto";
import { FORMATO_RESPALDO } from "@/lib/respaldo-esquema";

const SECRETO = "secreto-de-prueba-sin-ningun-valor-0123456789abcdef";
const EMPRESA = "cmsj93uj200000kpbstai3bk5";
const OTRA_EMPRESA = "cmsjuo34l00ae3de1d47c0851fa10";

function manifiesto(cambios: Partial<Manifiesto> = {}): Manifiesto {
  return {
    tipo: TIPO_RESPALDO,
    version: FORMATO_RESPALDO,
    empresa: { id: EMPRESA, razonSocial: "LARQUITECTURA STUDIO SAC", ruc: "20601689988" },
    obra: {
      id: "obra-1",
      nombreObra: "CRIOCORD",
      correlativo: "OB-000001",
      codigoObra: null,
      estado: "CERRADA",
    },
    generado: { at: "2026-08-12T14:03:11.482Z", por: "Dr. Caceres", userId: "u1" },
    contenido: { evidencia: "incluida" },
    tablas: [{ tabla: "wbs_items", filas: 348 }],
    entradas: [{ nombre: "datos/wbs_items.ndjson", bytes: 148233, sha256: "ab".repeat(32) }],
    ...cambios,
  };
}

function firmado(m: Manifiesto, empresa = EMPRESA) {
  const json = canonicalizar(m);
  return { json, firma: firmar(json, claveDeRespaldo(SECRETO, empresa)) };
}

describe("el manifiesto se firma sobre bytes estables", () => {
  it("el mismo manifiesto da siempre el mismo texto", () => {
    // Si el orden de las claves variara, la firma no cuadraria consigo misma.
    const a = canonicalizar({ b: 1, a: { d: 2, c: 3 } });
    const b = canonicalizar({ a: { c: 3, d: 2 }, b: 1 });
    expect(a).toBe(b);
  });

  it("y una firma correcta se acepta", () => {
    const { json, firma } = firmado(manifiesto());
    expect(firmaValida(json, firma, claveDeRespaldo(SECRETO, EMPRESA))).toBe(true);
  });
});

describe("lo que el respaldo tiene que rechazar", () => {
  it("un solo byte cambiado en el manifiesto", () => {
    const m = manifiesto();
    const { firma } = firmado(m);
    const alterado = canonicalizar({ ...m, obra: { ...m.obra, nombreObra: "CRIOCORE" } });
    const r = revisarManifiesto(alterado, firma, SECRETO, EMPRESA);
    expect(r.ok).toBe(false);
  });

  it("un importe tocado dentro de una entrada", () => {
    // El hash de cada entrada viaja DENTRO del manifiesto firmado, asi que
    // cambiar un archivo del zip invalida el conjunto.
    const m = manifiesto();
    const { firma } = firmado(m);
    const conOtroHash = canonicalizar({
      ...m,
      entradas: [{ ...m.entradas[0]!, sha256: "cd".repeat(32) }],
    });
    expect(revisarManifiesto(conOtroHash, firma, SECRETO, EMPRESA).ok).toBe(false);
  });

  it("un respaldo de OTRA empresa", () => {
    // Es la decision 4 del usuario: solo se restaura donde se genero.
    const { json, firma } = firmado(manifiesto());
    const r = revisarManifiesto(json, firma, SECRETO, OTRA_EMPRESA);
    expect(r.ok).toBe(false);
  });

  it("y no cuenta cual de las dos cosas fallo", () => {
    // Distinguir "firma mala" de "otra empresa" le diria a quien prueba un
    // archivo ajeno por donde seguir intentandolo.
    const { json, firma } = firmado(manifiesto());
    const ajeno = revisarManifiesto(json, firma, SECRETO, OTRA_EMPRESA);
    const roto = revisarManifiesto(json, "00".repeat(32), SECRETO, EMPRESA);
    expect(ajeno.ok).toBe(false);
    expect(roto.ok).toBe(false);
    if (!ajeno.ok && !roto.ok) expect(ajeno.error).toBe(roto.error);
  });

  it("una firma con longitud rara, sin reventar", () => {
    const { json } = firmado(manifiesto());
    expect(revisarManifiesto(json, "abc", SECRETO, EMPRESA).ok).toBe(false);
    expect(revisarManifiesto(json, "", SECRETO, EMPRESA).ok).toBe(false);
  });

  it("un formato mas nuevo que el que esta app sabe leer", () => {
    // Adivinar un formato futuro no se puede hacer de forma segura.
    const m = manifiesto({ version: FORMATO_RESPALDO + 1 });
    const { json, firma } = firmado(m);
    const r = revisarManifiesto(json, firma, SECRETO, EMPRESA);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("mas nueva");
  });

  it("un zip que no es un respaldo de obra", () => {
    const m = manifiesto({ tipo: "otra.cosa" as typeof TIPO_RESPALDO });
    const { json, firma } = firmado(m);
    expect(revisarManifiesto(json, firma, SECRETO, EMPRESA).ok).toBe(false);
  });
});

describe("lo que si pasa", () => {
  it("un respaldo intacto de la propia empresa", () => {
    const { json, firma } = firmado(manifiesto());
    const r = revisarManifiesto(json, firma, SECRETO, EMPRESA);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.manifiesto.obra.nombreObra).toBe("CRIOCORD");
  });

  it("y el hash de una entrada es el del contenido", () => {
    expect(sha256Hex("hola")).toBe(sha256Hex(Buffer.from("hola", "utf8")));
    expect(sha256Hex("hola")).not.toBe(sha256Hex("hola "));
  });
});
