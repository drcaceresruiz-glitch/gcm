import { describe, expect, it } from "vitest";

import {
  CAMPOS_EXCEL,
  huecosQueRellenar,
  leerFila,
} from "./proveedores-excel";

describe("leerFila", () => {
  it("acepta una fila con solo RUC y razón social", () => {
    const r = leerFila({ ruc: "20552103816", razonSocial: "ACME S.A.C." });

    expect(r).toEqual({
      ok: true,
      datos: { ruc: "20552103816", razonSocial: "ACME S.A.C." },
    });
  });

  // El archivo se llena en tandas: en obra casi nunca se tienen los datos
  // bancarios el día que se da de alta a alguien.
  it("no exige nada más que eso", () => {
    const r = leerFila({
      ruc: "20552103816",
      razonSocial: "ACME S.A.C.",
      banco: "",
      email: "   ",
    });

    expect(r.ok && Object.keys(r.datos)).toEqual(["ruc", "razonSocial"]);
  });

  it("limpia el RUC de guiones y espacios", () => {
    const r = leerFila({ ruc: " 20-552103816 ", razonSocial: "ACME" });

    expect(r.ok && r.datos.ruc).toBe("20552103816");
  });

  it("rechaza el RUC que no tiene once cifras, diciendo cuál", () => {
    const r = leerFila({ ruc: "123", razonSocial: "ACME" });

    expect(r.ok).toBe(false);
    expect(!r.ok && r.motivo).toContain("123");
  });

  it("una fila entera vacía se descarta sin ruido", () => {
    expect(leerFila({})).toEqual({ ok: false, motivo: "fila vacía" });
  });

  // Quien rellena el Excel escribe «Corriente», no «CORRIENTE». Devolverle el
  // archivo por la caja de las letras es hacerle perder el tiempo.
  it("acepta las listas escritas como sea", () => {
    const r = leerFila({
      ruc: "20552103816",
      razonSocial: "ACME",
      tipoCuenta: "corriente",
      rol: "Contratista",
      monedaCuenta: "pen",
    });

    expect(r.ok && r.datos.tipoCuenta).toBe("CORRIENTE");
    expect(r.ok && r.datos.rol).toBe("CONTRATISTA");
    expect(r.ok && r.datos.monedaCuenta).toBe("PEN");
  });

  it("ignora un valor de lista que no existe en vez de guardar basura", () => {
    const r = leerFila({
      ruc: "20552103816",
      razonSocial: "ACME",
      tipoCuenta: "PLAZO FIJO",
    });

    expect(r.ok && r.datos.tipoCuenta).toBeUndefined();
  });
});

describe("huecosQueRellenar — rellena huecos y NUNCA pisa", () => {
  const delExcel = {
    ruc: "20552103816",
    razonSocial: "ACME S.A.C.",
    contactoTelefono: "999888777",
    email: "nuevo@ejemplo.com",
    banco: "BBVA",
  };

  it("rellena lo que estaba vacío", () => {
    const cambios = huecosQueRellenar(
      { razonSocial: "ACME S.A.C.", contactoTelefono: null, email: "", banco: undefined },
      delExcel,
    );

    expect(cambios).toEqual({
      contactoTelefono: "999888777",
      email: "nuevo@ejemplo.com",
      banco: "BBVA",
    });
  });

  // LA REGLA. Un Excel viejo no puede hacer retroceder un dato que alguien
  // corrigió a mano en la aplicación.
  it("NO pisa lo que ya tiene valor, aunque el Excel traiga otro", () => {
    const cambios = huecosQueRellenar(
      {
        razonSocial: "ACME S.A.C.",
        contactoTelefono: "987654321",
        email: "viejo@ejemplo.com",
        banco: "BCP",
      },
      delExcel,
    );

    expect(cambios).toEqual({});
  });

  it("un espacio en blanco guardado cuenta como hueco", () => {
    const cambios = huecosQueRellenar({ banco: "   " }, delExcel);

    expect(cambios.banco).toBe("BBVA");
  });

  it("el RUC nunca se toca: es la identidad", () => {
    const cambios = huecosQueRellenar({}, delExcel);

    expect(cambios).not.toHaveProperty("ruc");
  });

  it("sin nada que rellenar devuelve vacío, y eso es «sin cambios»", () => {
    expect(huecosQueRellenar({ razonSocial: "X" }, { ruc: "1", razonSocial: "Y" })).toEqual(
      {},
    );
  });
});

describe("la plantilla y la lectura no se pueden separar", () => {
  // Si alguien añade una columna a `CAMPOS_EXCEL` y se olvida de leerla, esto
  // falla. Es la única garantía real de que «la plantilla se actualiza sola».
  it("todo campo de la plantilla se lee al importar", () => {
    const fila = Object.fromEntries(
      CAMPOS_EXCEL.map((c) => [c.clave, c.opciones ? c.opciones[0] : "dato"]),
    );
    fila.ruc = "20552103816";
    fila.razonSocial = "ACME";

    const r = leerFila(fila);
    expect(r.ok).toBe(true);

    for (const campo of CAMPOS_EXCEL) {
      expect(r.ok && r.datos[campo.clave]).toBeDefined();
    }
  });

  it("y todo campo leído se puede rellenar salvo el RUC", () => {
    const delExcel = Object.fromEntries(
      CAMPOS_EXCEL.map((c) => [c.clave, c.opciones ? c.opciones[0] : "dato"]),
    ) as never;

    const cambios = huecosQueRellenar({}, delExcel);

    for (const campo of CAMPOS_EXCEL) {
      if (campo.clave === "ruc") continue;
      expect(cambios).toHaveProperty(campo.clave);
    }
  });
});
