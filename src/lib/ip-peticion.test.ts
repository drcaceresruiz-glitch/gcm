import { describe, expect, it } from "vitest";

import { ipDeLaPeticion } from "./ip-peticion";

/** Un `Headers` de mentira, que es todo lo que necesita la funcion. */
function cabeceras(valores: Record<string, string>) {
  return {
    get: (nombre: string) => valores[nombre.toLowerCase()] ?? null,
  };
}

describe("ipDeLaPeticion", () => {
  it("con un solo proxy toma la unica entrada", () => {
    expect(ipDeLaPeticion(cabeceras({ "x-forwarded-for": "203.0.113.7" }))).toBe(
      "203.0.113.7",
    );
  });

  // ESTA es la prueba que da sentido al cambio. Quien ataca manda la cabecera
  // ya escrita para repartirse entre IP inventadas y esquivar el limite de
  // fallos; el proxy añade la suya A LA DERECHA. Leyendo la primera se le hace
  // caso al atacante.
  it("ignora las entradas que trae el cliente y se queda con la del proxy", () => {
    const conSuplantacion = cabeceras({
      "x-forwarded-for": "1.2.3.4, 5.6.7.8, 203.0.113.7",
    });

    expect(ipDeLaPeticion(conSuplantacion)).toBe("203.0.113.7");
  });

  it("no se deja engañar aunque el cliente mande la cabecera vacia por delante", () => {
    expect(
      ipDeLaPeticion(cabeceras({ "x-forwarded-for": " , ,203.0.113.7" })),
    ).toBe("203.0.113.7");
  });

  it("con un CDN delante se salta la entrada que puso el CDN", () => {
    const dosSaltos = cabeceras({
      "x-forwarded-for": "1.2.3.4, 203.0.113.7, 198.51.100.1",
    });

    expect(ipDeLaPeticion(dosSaltos, 2)).toBe("203.0.113.7");
  });

  it("si vienen menos entradas de las esperadas coge la mas fiable que haya", () => {
    expect(ipDeLaPeticion(cabeceras({ "x-forwarded-for": "203.0.113.7" }), 2)).toBe(
      "203.0.113.7",
    );
  });

  it("cae en x-real-ip cuando no hay lista", () => {
    expect(ipDeLaPeticion(cabeceras({ "x-real-ip": "203.0.113.7" }))).toBe(
      "203.0.113.7",
    );
  });

  // Sin cabeceras no se puede atribuir nada, y `auth.service` prefiere dejar
  // pasar a cortarle el acceso a todo el mundo porque falte una cabecera.
  it("sin ninguna cabecera no inventa una IP", () => {
    expect(ipDeLaPeticion(cabeceras({}))).toBeUndefined();
    expect(ipDeLaPeticion(cabeceras({ "x-forwarded-for": "  " }))).toBeUndefined();
  });
});
