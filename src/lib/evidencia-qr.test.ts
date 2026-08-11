import { describe, it, expect } from "vitest";
import {
  enlaceEvidencia,
  enPaginas,
  normalizarModo,
  POR_PAGINA,
} from "./evidencia-qr";

describe("normalizarModo", () => {
  it("por defecto, UN codigo para toda la obra", () => {
    // El grano fino se pidio y luego se descarto al ver la cuenta: 20 tareas
    // x 7 flujos son 140 stickers. Si esto vuelve a ser "tarea", alguien
    // acabara imprimiendo una resma.
    expect(normalizarModo(undefined)).toBe("obra");
    expect(normalizarModo(null)).toBe("obra");
    expect(normalizarModo("")).toBe("obra");
  });

  it("acepta los dos granos finos cuando se piden", () => {
    expect(normalizarModo("tarea")).toBe("tarea");
    expect(normalizarModo("restriccion")).toBe("restriccion");
  });

  it("cualquier otra cosa cae en obra, no revienta", () => {
    expect(normalizarModo("cualquiera")).toBe("obra");
    expect(normalizarModo("TAREA")).toBe("obra");
  });
});

describe("enlaceEvidencia", () => {
  const base = "https://gcm.drcaceresruiz.com";

  it("el de la obra lleva a la puerta del pase, no a una pantalla de dentro", () => {
    // Lo escanea el personal de campo, que NO es usuario de GCM: si apuntara
    // a `/obras/...` acabaria en el login, delante de una clave que nadie le
    // ha dado.
    expect(enlaceEvidencia(base, "obra1", { obra: true })).toBe(
      "https://gcm.drcaceresruiz.com/pase/obra1",
    );
  });

  it("por tarea apunta al Lookahead con el uid", () => {
    expect(enlaceEvidencia(base, "obra1", { uid: 42 })).toBe(
      "https://gcm.drcaceresruiz.com/obras/obra1/lookahead?tarea=42",
    );
  });

  it("por restriccion apunta al Lookahead con el id", () => {
    expect(enlaceEvidencia(base, "obra1", { restriccionId: "rst9" })).toBe(
      "https://gcm.drcaceresruiz.com/obras/obra1/lookahead?evidencia=rst9",
    );
  });

  it("quita la barra final de la base para no dejar una doble", () => {
    expect(enlaceEvidencia(`${base}/`, "obra1", { uid: 7 })).toBe(
      "https://gcm.drcaceresruiz.com/obras/obra1/lookahead?tarea=7",
    );
    expect(enlaceEvidencia(`${base}///`, "obra1", { uid: 7 })).not.toContain(
      "//obras",
    );
  });

  it("escapa el id de la restriccion", () => {
    expect(
      enlaceEvidencia(base, "obra1", { restriccionId: "a b&c" }),
    ).toContain("evidencia=a%20b%26c");
  });

  it("el enlace es a la app normal, nunca a una ruta publica de fotos", () => {
    // Si esto cambia, un QR pegado en una columna se vuelve una puerta
    // trasera a la evidencia de la obra.
    const enlace = enlaceEvidencia(base, "obra1", { uid: 1 });
    expect(enlace).toContain("/obras/obra1/lookahead");
    expect(enlace).not.toContain("/api/evidencia");
  });
});

describe("enPaginas", () => {
  it("reparte en paginas del tamano pedido", () => {
    expect(enPaginas([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
  });

  it("una pagina exacta no deja una vacia detras", () => {
    expect(enPaginas([1, 2, 3, 4], 2)).toEqual([[1, 2], [3, 4]]);
  });

  it("sin codigos no hay ninguna pagina", () => {
    expect(enPaginas([], 12)).toEqual([]);
  });

  it("cabe todo en una si el tamano no tiene sentido", () => {
    expect(enPaginas([1, 2], 0)).toEqual([[1, 2]]);
    expect(enPaginas([], 0)).toEqual([]);
  });

  it("cada modo reparte una cantidad razonable por A4", () => {
    // El de la obra va SOLO en su hoja: se pega en la caseta y tiene que
    // leerse de lejos.
    expect(POR_PAGINA.obra).toBe(1);
    expect(POR_PAGINA.tarea).toBeGreaterThan(1);
    expect(POR_PAGINA.restriccion).toBeGreaterThan(POR_PAGINA.tarea);
  });
});
