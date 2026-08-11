import { describe, expect, it } from "vitest";
import { canalesAProbar } from "./sms";

describe("canalesAProbar", () => {
  it("prefiere la cola cuando estan las dos", () => {
    // La linea de la empresa antes que la de un tercero.
    expect(canalesAProbar({ cola: true, pasarela: true })).toEqual([
      "cola",
      "pasarela",
    ]);
  });

  it("deja la pasarela detras de la cola, no fuera", () => {
    // El caso que motivo todo esto: con la cola encendida, un encolado
    // fallido dejaba la obra sin SMS porque nunca se probaba json.pe. Tener
    // los dos canales tiene que significar dos intentos, no uno.
    const canales = canalesAProbar({ cola: true, pasarela: true });
    expect(canales).toContain("pasarela");
    expect(canales.indexOf("cola")).toBeLessThan(canales.indexOf("pasarela"));
  });

  it("usa la pasarela sola si no hay cola", () => {
    expect(canalesAProbar({ cola: false, pasarela: true })).toEqual([
      "pasarela",
    ]);
  });

  it("usa la cola sola si no hay pasarela", () => {
    expect(canalesAProbar({ cola: true, pasarela: false })).toEqual(["cola"]);
  });

  it("no devuelve ninguno cuando no hay nada configurado", () => {
    // No es un error: quedan el correo y el codigo dictado en pantalla.
    expect(canalesAProbar({ cola: false, pasarela: false })).toEqual([]);
  });
});
