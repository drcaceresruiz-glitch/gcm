import { describe, it, expect } from "vitest";
import {
  success,
  failure,
  tryCatch,
  map,
  mapError,
  andThen,
  unwrap,
  unwrapOr,
  unwrapOrElse,
  toNull,
  toUndefined,
} from "./result";

describe("Result", () => {
  describe("success / failure", () => {
    it("crea un resultado exitoso", () => {
      const result = success(42);
      expect(result).toEqual({ ok: true, value: 42 });
    });

    it("crea un resultado fallido", () => {
      const result = failure("error");
      expect(result).toEqual({ ok: false, error: "error" });
    });
  });

  describe("tryCatch", () => {
    it("captura un exito", () => {
      const result = tryCatch(() => 10 + 10);
      expect(result).toEqual({ ok: true, value: 20 });
    });

    it("captura un error con mensaje personalizado", () => {
      const result = tryCatch(() => {
        throw new Error("boom");
      }, "falló");
      expect(result).toEqual({ ok: false, error: "boom" });
    });

    it("usa mensaje por defecto si no es Error", () => {
      const result = tryCatch(() => {
        throw "string error";
      }, "operación fallida");
      expect(result).toEqual({ ok: false, error: "operación fallida" });
    });
  });

  describe("map", () => {
    it("transforma el valor exitoso", () => {
      const result = map(success(5), (x) => x * 2);
      expect(result).toEqual({ ok: true, value: 10 });
    });

    it("no transforma si es error", () => {
      const result = map(failure("err"), (x: number) => x * 2);
      expect(result).toEqual({ ok: false, error: "err" });
    });
  });

  describe("mapError", () => {
    it("transforma el error", () => {
      const result = mapError(failure("db_err"), (e) => `Error: ${e}`);
      expect(result).toEqual({ ok: false, error: "Error: db_err" });
    });

    it("no transforma si es exito", () => {
      const result = mapError(success(42), (e: string) => `Error: ${e}`);
      expect(result).toEqual({ ok: true, value: 42 });
    });
  });

  describe("andThen", () => {
    it("encadena operaciones exitosas", () => {
      const result = andThen(success(5), (x) => success(x * 2));
      expect(result).toEqual({ ok: true, value: 10 });
    });

    it("propaga el primer error", () => {
      const result = andThen(failure("primero"), (x: number) => success(x * 2));
      expect(result).toEqual({ ok: false, error: "primero" });
    });

    it("propaga el segundo error", () => {
      const result = andThen(success(5), () => failure("segundo"));
      expect(result).toEqual({ ok: false, error: "segundo" });
    });
  });

  describe("unwrap", () => {
    it("devuelve el valor exitoso", () => {
      expect(unwrap(success(42))).toBe(42);
    });

    it("lanza si es error", () => {
      expect(() => unwrap(failure("mal"))).toThrow("mal");
    });
  });

  describe("unwrapOr", () => {
    it("devuelve el valor si es exito", () => {
      expect(unwrapOr(success(42), 0)).toBe(42);
    });

    it("devuelve el default si es error", () => {
      expect(unwrapOr(failure("err"), 99)).toBe(99);
    });
  });

  describe("unwrapOrElse", () => {
    it("devuelve el valor si es exito", () => {
      expect(unwrapOrElse(success(42), () => 0)).toBe(42);
    });

    it("computa el default si es error", () => {
      let llamado = false;
      const result = unwrapOrElse(failure("err"), () => {
        llamado = true;
        return 99;
      });
      expect(llamado).toBe(true);
      expect(result).toBe(99);
    });
  });

  describe("toNull / toUndefined", () => {
    it("toNull convierte a null", () => {
      expect(toNull(success(42))).toBe(42);
      expect(toNull(failure("err"))).toBeNull();
    });

    it("toUndefined convierte a undefined", () => {
      expect(toUndefined(success(42))).toBe(42);
      expect(toUndefined(failure("err"))).toBeUndefined();
    });
  });
});
