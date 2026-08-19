import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { cifrar, descifrar, hayLlaveDeCifrado, olvidarLlave } from "./secreto";

/**
 * El unico secreto de GCM que se guarda para PODER RECUPERARLO.
 *
 * Lo que se vigila aqui no es que AES funcione —eso es de Node— sino las tres
 * decisiones que lo rodean: que sin llave no se guarde nada en claro, que una
 * fila manipulada no descifre, y que nunca lance. Las tres son la diferencia
 * entre degradar al buzon compartido y mandar una contrasena a un servidor
 * equivocado o tumbar el envio.
 */

const FRASE = "una frase larga de prueba para derivar la llave";

function conLlave(valor: string | undefined) {
  if (valor === undefined) delete process.env["CORREO_CLAVE_CIFRADO"];
  else process.env["CORREO_CLAVE_CIFRADO"] = valor;
  olvidarLlave();
}

beforeEach(() => conLlave(FRASE));
afterAll(() => conLlave(undefined));

describe("guardar un secreto recuperable", () => {
  it("lo cifrado se descifra igual", () => {
    const guardado = cifrar("clave-del-buzon-2026");
    expect(guardado).not.toBeNull();
    expect(descifrar(guardado!)).toBe("clave-del-buzon-2026");
  });

  /** Si el mismo texto diera siempre lo mismo, la base delataria quien repite clave. */
  it("dos cifrados del mismo texto son distintos", () => {
    expect(cifrar("misma")).not.toBe(cifrar("misma"));
  });

  it("lo guardado no contiene el texto en claro", () => {
    const guardado = cifrar("clave-del-buzon-2026")!;
    expect(guardado).not.toContain("clave-del-buzon");
    expect(guardado.startsWith("v1$")).toBe(true);
  });

  /**
   * El fallo seguro: sin llave no se guarda NADA. Si `cifrar` devolviera el
   * texto tal cual «por no perderlo», la contrasena del buzon de un cliente
   * acabaria en claro en la base el dia que alguien despliegue sin la
   * variable.
   */
  it("sin llave configurada no cifra, en vez de guardar en claro", () => {
    conLlave(undefined);
    expect(hayLlaveDeCifrado()).toBe(false);
    expect(cifrar("clave-del-buzon-2026")).toBeNull();
  });

  it("sin llave tampoco descifra lo que se cifro con ella", () => {
    const guardado = cifrar("clave-del-buzon-2026")!;
    conLlave(undefined);
    expect(descifrar(guardado)).toBeNull();
  });

  it("con OTRA llave no descifra, y no lanza", () => {
    const guardado = cifrar("clave-del-buzon-2026")!;
    conLlave("otra frase completamente distinta");
    expect(descifrar(guardado)).toBeNull();
  });

  /**
   * AES-GCM va autenticado: tocar un byte invalida la etiqueta. Sin esto se
   * descifraria basura y esa basura acabaria viajando a un servidor SMTP.
   */
  it("una fila manipulada no descifra", () => {
    const partes = cifrar("clave-del-buzon-2026")!.split("$");
    const datos = Buffer.from(partes[3]!, "base64");
    datos[0] = datos[0]! ^ 0xff;
    partes[3] = datos.toString("base64");

    expect(descifrar(partes.join("$"))).toBeNull();
  });

  it("un formato que no reconoce no lanza, devuelve null", () => {
    for (const basura of ["", "v1$solo-dos", "v2$a$b$c", "cualquier cosa"]) {
      expect(descifrar(basura), basura).toBeNull();
    }
  });
});
