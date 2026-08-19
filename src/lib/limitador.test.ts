import { describe, it, expect } from "vitest";

import { crearLimitador } from "@/lib/limitador";

/**
 * El limitador de frecuencia, probado sin relojes: la hora entra como
 * argumento, asi que aqui se puede saltar en el tiempo sin esperar.
 */

const T0 = 1_000_000;

describe("cuenta dentro de la ventana", () => {
  it("deja pasar hasta el maximo y corta el siguiente", () => {
    const l = crearLimitador({ maximo: 3, ventanaMs: 60_000 });

    expect(l.intentar("emp-1", T0).ok).toBe(true);
    expect(l.intentar("emp-1", T0 + 1).ok).toBe(true);
    expect(l.intentar("emp-1", T0 + 2).ok).toBe(true);

    const cuarto = l.intentar("emp-1", T0 + 3);
    expect(cuarto.ok).toBe(false);
  });

  it("y dice cuanto falta para el siguiente hueco", () => {
    const l = crearLimitador({ maximo: 2, ventanaMs: 60_000 });
    l.intentar("emp-1", T0);
    l.intentar("emp-1", T0 + 10_000);

    const r = l.intentar("emp-1", T0 + 20_000);

    expect(r.ok).toBe(false);
    // El mas viejo entro en T0 y caduca a los 60 s: faltan 40.
    if (!r.ok) expect(r.esperaSegundos).toBe(40);
  });

  /// Nunca «espera 0 segundos», que se lee como «ya puedes» y no es verdad.
  it("la espera nunca baja de un segundo", () => {
    const l = crearLimitador({ maximo: 1, ventanaMs: 60_000 });
    l.intentar("emp-1", T0);

    const r = l.intentar("emp-1", T0 + 59_999);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.esperaSegundos).toBe(1);
  });
});

describe("la ventana se desliza", () => {
  it("al caducar los viejos se vuelve a poder", () => {
    const l = crearLimitador({ maximo: 2, ventanaMs: 60_000 });
    l.intentar("emp-1", T0);
    l.intentar("emp-1", T0 + 1000);

    expect(l.intentar("emp-1", T0 + 2000).ok).toBe(false);
    // Pasado un minuto desde el primero, hay hueco otra vez.
    expect(l.intentar("emp-1", T0 + 61_000).ok).toBe(true);
  });

  /**
   * La razon de que la ventana sea deslizante y no por cubos: con cubos de un
   * minuto, el maximo al final de uno y el maximo al principio del siguiente
   * son el DOBLE en dos segundos sin pasarse de «N por minuto».
   */
  it("y no deja colar el doble en el cambio de minuto", () => {
    const l = crearLimitador({ maximo: 3, ventanaMs: 60_000 });

    // Tres al final del primer minuto.
    for (const t of [T0 + 57_000, T0 + 58_000, T0 + 59_000]) {
      expect(l.intentar("emp-1", t).ok).toBe(true);
    }
    // Y en cuanto empieza el siguiente, siguen contando: no hay borron.
    expect(l.intentar("emp-1", T0 + 61_000).ok).toBe(false);
  });

  /**
   * Quien insiste no puede congelar su propia ventana: cada rechazo tiene que
   * dejar apuntado lo ya podado, o la lista vieja se conservaria entera y el
   * hueco no llegaria nunca.
   */
  it("insistir no retrasa el desbloqueo", () => {
    const l = crearLimitador({ maximo: 1, ventanaMs: 10_000 });
    l.intentar("emp-1", T0);

    for (let t = T0 + 1000; t < T0 + 10_000; t += 1000) {
      expect(l.intentar("emp-1", t).ok).toBe(false);
    }
    expect(l.intentar("emp-1", T0 + 10_001).ok).toBe(true);
  });
});

describe("cada clave cuenta por su cuenta", () => {
  it("una empresa gastada no bloquea a otra", () => {
    const l = crearLimitador({ maximo: 1, ventanaMs: 60_000 });

    expect(l.intentar("emp-1", T0).ok).toBe(true);
    expect(l.intentar("emp-1", T0 + 1).ok).toBe(false);
    // La otra empieza limpia.
    expect(l.intentar("emp-2", T0 + 1).ok).toBe(true);
  });
});

describe("el mapa no crece sin fin", () => {
  it("al pasar del tope se olvida la mitad mas antigua", () => {
    const l = crearLimitador({ maximo: 5, ventanaMs: 60_000, maximasClaves: 10 });

    for (let i = 0; i < 11; i++) l.intentar(`c-${i}`, T0 + i);

    // Se tiraron 5 al pasar de 10, y quedo la que provoco la poda.
    expect(l.tamano()).toBeLessThanOrEqual(10);
    expect(l.tamano()).toBeGreaterThan(0);
  });

  /// Olvidar un contador solo deja pasar alguna consulta de mas: es el lado
  /// inofensivo del fallo, y conviene que sea ESE y no el contrario.
  it("y olvidar deja pasar, nunca bloquea", () => {
    const l = crearLimitador({ maximo: 1, ventanaMs: 60_000, maximasClaves: 2 });

    l.intentar("vieja", T0);
    l.intentar("b", T0 + 1);
    l.intentar("c", T0 + 2);

    expect(l.intentar("vieja", T0 + 3).ok).toBe(true);
  });
});
