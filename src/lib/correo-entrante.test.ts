import { describe, expect, it } from "vitest";

import {
  cuerpoEntrante,
  decidirEmparejado,
  dominioDe,
  mensajeIdDeHilo,
  nuevoTokenDeHilo,
  tokensEnCabeceras,
  MAX_CUERPO_ENTRANTE,
} from "./correo-entrante";

/**
 * A que obra pertenece un correo entrante.
 *
 * Es la unica decision delicada de toda la funcionalidad y por eso vive en un
 * modulo puro: aqui se puede escribir a mano el caso que en un buzon de verdad
 * habria que provocar. Equivocarse mete la conversacion de un contratista en
 * la obra de otro, y eso se lee como un compromiso que nadie adquirio.
 */

const TOKEN = "a".repeat(32);
const OTRO = "b".repeat(32);

describe("el token del hilo", () => {
  it("es largo y no se repite", () => {
    const uno = nuevoTokenDeHilo();
    const dos = nuevoTokenDeHilo();

    expect(uno).toMatch(/^[0-9a-f]{32}$/);
    expect(uno).not.toBe(dos);
  });

  it("se compone en un Message-ID con sus angulos", () => {
    expect(mensajeIdDeHilo(TOKEN, "obra.pe")).toBe(`<gcm.${TOKEN}@obra.pe>`);
  });
});

describe("el dominio con el que se firma", () => {
  it("sale de una direccion a secas", () => {
    expect(dominioDe("obras@constructora.pe")).toBe("constructora.pe");
  });

  /**
   * EL CASO QUE IMPORTA. En cuanto la empresa tiene buzon propio, el remitente
   * se escribe `"Razon Social" <correo@dominio>`. Sin leer los angulos no
   * habria dominio, ni `Message-ID`, y las respuestas de esa constructora no
   * se emparejarian con nada —callando—.
   */
  it("sale tambien de un remitente con nombre delante", () => {
    expect(dominioDe('"CONSTRUCTORA X, S.A.C." <obras@constructora.pe>')).toBe(
      "constructora.pe",
    );
  });

  it("da null cuando no hay direccion que valga", () => {
    expect(dominioDe("no-es-un-correo")).toBeNull();
    expect(dominioDe("")).toBeNull();
  });
});

describe("los tokens que vienen en las cabeceras", () => {
  it("los saca de In-Reply-To", () => {
    expect(tokensEnCabeceras(`<gcm.${TOKEN}@obra.pe>`, null)).toEqual([TOKEN]);
  });

  /**
   * Hay clientes que al responder dentro de un hilo largo dejan `In-Reply-To`
   * apuntando al ultimo mensaje —que no es el nuestro— y solo conservan el
   * nuestro en `References`. Mirar solo la primera perderia esas respuestas.
   */
  it("los saca tambien de References", () => {
    expect(
      tokensEnCabeceras("<algo@otro.com>", `<x@y.com> <gcm.${TOKEN}@obra.pe>`),
    ).toEqual([TOKEN]);
  });

  it("no repite el que aparece en las dos", () => {
    const cabecera = `<gcm.${TOKEN}@obra.pe>`;
    expect(tokensEnCabeceras(cabecera, cabecera)).toEqual([TOKEN]);
  });

  it("ignora los Message-ID que no son de GCM", () => {
    expect(
      tokensEnCabeceras("<CAF=abc123@mail.gmail.com>", "<otro@correo.com>"),
    ).toEqual([]);
  });

  it("aguanta que no venga ninguna cabecera", () => {
    expect(tokensEnCabeceras(null, null)).toEqual([]);
    expect(tokensEnCabeceras(undefined, undefined)).toEqual([]);
  });
});

describe("a que se ata un correo entrante", () => {
  const hilos = new Map([[TOKEN, "msj-1"]]);
  const contratistasPorCorreo = new Map([["juan@ferreteria.pe", ["prov-1"]]]);

  it("el hilo manda: da la conversacion, y con ella la obra", () => {
    expect(
      decidirEmparejado({
        tokens: [TOKEN],
        remitente: "cualquiera@otro.com",
        hilos,
        contratistasPorCorreo,
      }),
    ).toEqual({ tipo: "hilo", mensajeId: "msj-1", token: TOKEN });
  });

  /**
   * UN TOKEN INVENTADO NO ABRE NADA. Cualquiera puede mandar un correo al
   * buzon de la constructora citando un `Message-ID` que se saque de la manga;
   * si eso emparejara, se podrian inyectar respuestas falsas en una obra. Por
   * eso el token es aleatorio de 16 bytes y solo vale si EXISTE.
   */
  it("un token que no existe no empareja, y se cae al remitente", () => {
    expect(
      decidirEmparejado({
        tokens: [OTRO],
        remitente: "juan@ferreteria.pe",
        hilos,
        contratistasPorCorreo,
      }),
    ).toEqual({ tipo: "contratista", proveedorId: "prov-1" });
  });

  /**
   * El mapa `hilos` lo construye el servicio acotado a UNA empresa. Un token
   * legitimo de otra constructora, por tanto, no esta aqui y no empareja:
   * el aislamiento no depende de esta funcion, pero se comprueba que la
   * funcion lo respeta.
   */
  it("un token de otra empresa no llega al mapa y no empareja", () => {
    expect(
      decidirEmparejado({
        tokens: [OTRO],
        remitente: "desconocido@ajeno.com",
        hilos,
        contratistasPorCorreo,
      }),
    ).toEqual({ tipo: "ninguno", motivo: "sin-hilo-ni-remitente" });
  });

  it("sin hilo, el remitente conocido lo deja en la ficha, sin obra", () => {
    expect(
      decidirEmparejado({
        tokens: [],
        remitente: "JUAN@Ferreteria.PE ",
        hilos,
        contratistasPorCorreo,
      }),
    ).toEqual({ tipo: "contratista", proveedorId: "prov-1" });
  });

  /**
   * DOS CONTRATISTAS CON EL MISMO CORREO pasa de verdad —dos empresas de un
   * mismo dueno— y elegir uno seria inventarse la mitad del dato. Se ignora, y
   * el correo sigue en el buzon para que lo lea una persona.
   */
  it("un remitente que vale para dos contratistas se ignora", () => {
    expect(
      decidirEmparejado({
        tokens: [],
        remitente: "juan@ferreteria.pe",
        hilos,
        contratistasPorCorreo: new Map([
          ["juan@ferreteria.pe", ["prov-1", "prov-2"]],
        ]),
      }),
    ).toEqual({ tipo: "ninguno", motivo: "remitente-ambiguo" });
  });

  it("sin hilo y sin remitente conocido, no se guarda nada", () => {
    expect(
      decidirEmparejado({
        tokens: [],
        remitente: "spam@ninguna-parte.com",
        hilos,
        contratistasPorCorreo,
      }),
    ).toEqual({ tipo: "ninguno", motivo: "sin-hilo-ni-remitente" });
  });

  it("aguanta un correo sin remitente", () => {
    expect(
      decidirEmparejado({
        tokens: [],
        remitente: null,
        hilos,
        contratistasPorCorreo,
      }),
    ).toEqual({ tipo: "ninguno", motivo: "sin-hilo-ni-remitente" });
  });
});

describe("el cuerpo que se guarda", () => {
  it("quita los retornos de carro del correo y los bordes", () => {
    expect(cuerpoEntrante("  hola\r\nque tal\r\n  ")).toBe("hola\nque tal");
  });

  it("recorta lo larguisimo y lo dice", () => {
    const largo = "x".repeat(MAX_CUERPO_ENTRANTE + 500);
    const salida = cuerpoEntrante(largo);

    expect(salida.length).toBeLessThan(largo.length);
    expect(salida.endsWith("[…]")).toBe(true);
  });

  it("no toca lo que cabe", () => {
    expect(cuerpoEntrante("corto")).toBe("corto");
  });
});
