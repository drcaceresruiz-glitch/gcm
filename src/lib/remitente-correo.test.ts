import { describe, it, expect } from "vitest";
import {
  cabeceraRemitente,
  seguroSegunPuerto,
  validarRemitente,
  type DatosRemitente,
} from "./remitente-correo";

const BUENO: DatosRemitente = {
  host: "mail.constructora.pe",
  puerto: "465",
  usuario: "obras@constructora.pe",
  clave: "secreta",
  remitenteNombre: "CONSTRUCTORA X SAC",
  remitenteCorreo: "obras@constructora.pe",
};

describe("el buzon propio de una constructora", () => {
  it("acepta una configuracion completa", () => {
    const r = validarRemitente(BUENO, true);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.datos.puerto).toBe(465);
      expect(r.datos.seguro).toBe(true);
    }
  });

  /**
   * El error de tecleo mas probable: pegar la URL del webmail en vez del
   * nombre del servidor. Sin este aviso, el fallo aparece como un error de
   * conexion opaco media hora despues.
   */
  it("rechaza un host pegado con protocolo y lo explica", () => {
    const r = validarRemitente({ ...BUENO, host: "https://mail.constructora.pe/" }, true);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("sin https://");
  });

  it("exige la clave al crear pero no al editar", () => {
    const sinClave = { ...BUENO, clave: "" };
    expect(validarRemitente(sinClave, true).ok).toBe(false);
    expect(validarRemitente(sinClave, false).ok).toBe(true);
  });

  it("rechaza un puerto que no es un puerto", () => {
    for (const puerto of ["0", "70000", "abc", "", "465.5"]) {
      expect(validarRemitente({ ...BUENO, puerto }, true).ok, puerto).toBe(false);
    }
  });

  it("rechaza un correo de remitente que no lo parece", () => {
    const r = validarRemitente({ ...BUENO, remitenteCorreo: "obras arroba x" }, true);
    expect(r.ok).toBe(false);
  });

  it("normaliza el host a minusculas y sin espacios", () => {
    const r = validarRemitente({ ...BUENO, host: "  MAIL.Constructora.PE " }, true);
    expect(r.ok && r.datos.host).toBe("mail.constructora.pe");
  });

  /**
   * El puerto manda sobre el modo, en vez de preguntarlo aparte: 465 es TLS
   * directo y 587 STARTTLS. Preguntarlo seria pedir que se acierte una
   * casilla que el puerto ya determina.
   */
  it("el modo de conexion sale del puerto", () => {
    expect(seguroSegunPuerto(465)).toBe(true);
    expect(seguroSegunPuerto(587)).toBe(false);
    expect(seguroSegunPuerto(25)).toBe(false);
  });

  /**
   * Una razon social con coma parte la cabecera en dos direcciones si el
   * nombre no va entre comillas, y el envio se rechaza.
   */
  it("entrecomilla el nombre para que una coma no parta la cabecera", () => {
    expect(cabeceraRemitente("CONSTRUCTORA X, S.A.C.", "obras@x.pe")).toBe(
      '"CONSTRUCTORA X, S.A.C." <obras@x.pe>',
    );
  });

  it("quita las comillas del nombre para no romper la cabecera", () => {
    expect(cabeceraRemitente('EL "GRUPO" SAC', "a@x.pe")).toBe(
      '"EL GRUPO SAC" <a@x.pe>',
    );
  });
});
