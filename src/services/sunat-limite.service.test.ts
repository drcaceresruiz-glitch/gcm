import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * El freno de frecuencia de la consulta de RUC.
 *
 * La cuenta en si ya la prueba `lib/limitador.test.ts`. Lo que se sostiene
 * AQUI es el enganche, que es donde puede fallar el orden:
 *
 *  - que el freno vaya ANTES de mirar si hay token, o una instalacion sin
 *    configurar no ejercitaria el limite nunca;
 *  - que el techo de la INSTALACION corte aunque cada empresa vaya sobrada;
 *  - y que una empresa gastada no deje sin consultar a las demas.
 *
 * Los limitadores son de modulo, asi que cada caso reimporta el servicio con
 * `resetModules` para empezar con los contadores a cero. Sin eso, el primer
 * caso se llevaria el cupo de los siguientes y el fichero contaria una
 * historia distinta segun el orden.
 */

/// Sin `JSONPE_TOKEN` ni `DECOLECTA_TOKEN`, que es como corre la bateria: la
/// consulta contesta `sin_token` SIN salir a la red. Eso hace de testigo — si
/// una llamada devuelve `sin_token` es que paso el freno.
async function cargar() {
  vi.resetModules();
  const { consultarRuc } = await import("@/services/sunat.service");
  return consultarRuc;
}

const RUC = "20123456789";

beforeEach(() => {
  vi.resetModules();
});

describe("el freno va antes que todo lo demas", () => {
  it("una empresa puede consultar diez veces por minuto", async () => {
    const consultarRuc = await cargar();

    for (let i = 0; i < 10; i++) {
      const r = await consultarRuc(RUC, "emp-1");
      expect(r.ok).toBe(false);
      // Paso el freno y murio mas adelante, por falta de token.
      if (!r.ok) expect(r.motivo).toBe("sin_token");
    }

    const onceava = await consultarRuc(RUC, "emp-1");
    expect(onceava.ok).toBe(false);
    if (!onceava.ok) {
      expect(onceava.motivo).toBe("demasiadas");
      // Y dice cuanto esperar: un «no» sin plazo se lee como una averia.
      expect(onceava.detalle).toMatch(/Espera \d+ s/);
    }
  });

  /**
   * La razon de que el freno este por delante de la comprobacion del token:
   * sin configurar, la consulta no sale a la red pero el contador tiene que
   * correr igual. Si no, un bucle podria girar semanas en vacio y empezar a
   * salir de golpe el dia que se ponga el token.
   */
  it("y cuenta aunque no haya token configurado", async () => {
    const consultarRuc = await cargar();

    for (let i = 0; i < 10; i++) await consultarRuc(RUC, "emp-1");
    const r = await consultarRuc(RUC, "emp-1");

    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motivo).toBe("demasiadas");
  });

  it("un RUC mal escrito ni siquiera gasta cupo", async () => {
    const consultarRuc = await cargar();

    for (let i = 0; i < 20; i++) await consultarRuc("123", "emp-1");

    // Las veinte se rechazaron por formato, antes del freno: sigue habiendo
    // cupo. Comprobar el formato primero es gratis y no sale a la red.
    const r = await consultarRuc(RUC, "emp-1");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motivo).toBe("sin_token");
  });
});

describe("los dos techos", () => {
  it("una empresa gastada no deja sin consultar a otra", async () => {
    const consultarRuc = await cargar();

    for (let i = 0; i < 11; i++) await consultarRuc(RUC, "emp-1");
    const gastada = await consultarRuc(RUC, "emp-1");
    expect(gastada.ok).toBe(false);
    if (!gastada.ok) expect(gastada.motivo).toBe("demasiadas");

    // La vecina empieza limpia.
    const otra = await consultarRuc(RUC, "emp-2");
    expect(otra.ok).toBe(false);
    if (!otra.ok) expect(otra.motivo).toBe("sin_token");
  });

  /**
   * El techo de la INSTALACION, que es el unico numero que ve el proveedor:
   * el detras de la IP del hosting. Con cada empresa dentro de su limite, la
   * suma seguiria pudiendo tumbarla.
   */
  it("y con muchas empresas a la vez corta el techo global", async () => {
    const consultarRuc = await cargar();

    // Cuarenta consultas repartidas entre ocho empresas: cinco cada una, muy
    // por debajo de su limite de diez.
    for (let i = 0; i < 40; i++) {
      const r = await consultarRuc(RUC, `emp-${i % 8}`);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.motivo).toBe("sin_token");
    }

    // La siguiente cae aunque su empresa solo lleve cinco.
    const r = await consultarRuc(RUC, "emp-nueva");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motivo).toBe("demasiadas");
  });

  /// Sin empresa —si algun dia alguien llama sin pasarla— sigue contando el
  /// techo global. Es el que protege la IP, y no puede depender de que quien
  /// llama se acuerde.
  it("sin empresa sigue aplicando el techo de la instalacion", async () => {
    const consultarRuc = await cargar();

    for (let i = 0; i < 40; i++) await consultarRuc(RUC);
    const r = await consultarRuc(RUC);

    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motivo).toBe("demasiadas");
  });
});
