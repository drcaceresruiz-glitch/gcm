import { describe, expect, it } from "vitest";
import { describirActividad, esActividadDeObra } from "@/lib/actividad";

describe("que cuenta como actividad de obra", () => {
  /**
   * Los ingresos se auditan y deben seguir auditandose, pero en un panel son
   * ruido: con cinco personas entrando cada manana taparian cualquier orden
   * aprobada.
   */
  it("descarta los ingresos y los cambios de clave", () => {
    for (const accion of [
      "LOGIN",
      "LOGIN_FAILED",
      "LOGOUT",
      "PASSWORD_CHANGE",
      "PASSWORD_RESET",
    ]) {
      expect(esActividadDeObra({ entidad: "User", accion })).toBe(false);
    }
  });

  it("conserva lo que se hace sobre la obra", () => {
    expect(
      esActividadDeObra({ entidad: "OrdenCompra", accion: "APPROVE" }),
    ).toBe(true);
  });
});

describe("describirActividad", () => {
  it("nombra la orden por su numero", () => {
    expect(
      describirActividad({
        entidad: "OrdenCompra",
        accion: "APPROVE",
        despues: { numero: "2026-07-00118", estado: "APROBADA" },
      }),
    ).toEqual({ texto: "Orden 2026-07-00118 aprobada", tono: "exito" });
  });

  /**
   * Anular no es una accion propia: se guarda como UPDATE con el estado nuevo
   * dentro. Sin mirar el `despues`, una anulacion se leeria como
   * «Orden modificada», que no dice lo que paso.
   */
  it("distingue anular de una modificacion cualquiera", () => {
    expect(
      describirActividad({
        entidad: "OrdenCompra",
        accion: "UPDATE",
        antes: { estado: "APROBADA" },
        despues: { numero: "00118", estado: "ANULADA" },
      }),
    ).toEqual({ texto: "Orden 00118 anulada", tono: "peligro" });

    expect(
      describirActividad({
        entidad: "Proveedor",
        accion: "UPDATE",
        antes: { razonSocial: "CABREJO" },
      }).texto,
    ).toBe("Proveedor CABREJO modificada");
  });

  it("saca el identificador tambien de `antes` cuando se borro algo", () => {
    expect(
      describirActividad({
        entidad: "MovimientoPresupuestal",
        accion: "DELETE",
        antes: { numero: 4, estado: "BORRADOR" },
      }),
    ).toEqual({ texto: "Movimiento 4 eliminada", tono: "peligro" });
  });

  it("nombra la obra por su nombre", () => {
    expect(
      describirActividad({
        entidad: "Project",
        accion: "CREATE",
        despues: { nombreObra: "CRIOCORD" },
      }).texto,
    ).toBe("Obra CRIOCORD registrada");
  });

  /**
   * Si la carga util no trae ninguna clave conocida, la frase se queda sin
   * nombre propio pero sigue siendo cierta. Inventarse un numero seria peor.
   */
  it("aguanta una carga util que no reconoce", () => {
    expect(
      describirActividad({
        entidad: "CompanyPermission",
        accion: "UPDATE",
        despues: { concedido: true },
      }).texto,
    ).toBe("Permisos modificada");
  });

  it("no revienta sin `antes` ni `despues`", () => {
    expect(describirActividad({ entidad: "WbsItem", accion: "CREATE" })).toEqual(
      { texto: "Presupuesto registrada", tono: "neutro" },
    );
  });
});
