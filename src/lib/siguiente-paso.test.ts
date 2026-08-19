import { describe, it, expect } from "vitest";
import {
  siguientePaso,
  type EstadoAlta,
  type PuedeHacer,
  type AvisosVivos,
} from "./siguiente-paso";

/**
 * El anclaje de continuidad de la obra.
 *
 * Lo que hay que vigilar aqui no es el texto sino EL ORDEN y las puertas: un
 * paso que se cuela por delante de otro convierte el anclaje en ruido, y un
 * paso propuesto a quien no puede darlo es peor todavia —no se quita ni
 * haciendo la tarea—.
 */

const ALTA_COMPLETA: EstadoAlta = {
  presupuesto: true,
  cronograma: true,
  equipo: true,
  lineaBase: true,
};

const TODO: PuedeHacer = {
  presupuesto: true,
  cronograma: true,
  equipo: true,
  lineaBase: true,
  lookahead: true,
  planSemanal: true,
};

const NADA: PuedeHacer = {
  presupuesto: false,
  cronograma: false,
  equipo: false,
  lineaBase: false,
  lookahead: false,
  planSemanal: false,
};

const EN_PAZ: AvisosVivos = { restriccionesVencidas: 0, semanasSinCerrar: 0 };

describe("el paso siguiente de la obra", () => {
  it("con la obra al dia y sin nada vencido, no sugiere nada", () => {
    expect(siguientePaso(ALTA_COMPLETA, false, TODO, EN_PAZ)).toBeNull();
  });

  it("el criterio bloqueante va por delante de todo el alta", () => {
    const sinNada: EstadoAlta = {
      presupuesto: false,
      cronograma: false,
      equipo: false,
      lineaBase: false,
    };

    const paso = siguientePaso(sinNada, true, TODO, {
      restriccionesVencidas: 9,
      semanasSinCerrar: 9,
    });

    expect(paso?.clave).toBe("criterio");
    expect(paso?.gravedad).toBe("bloqueante");
  });

  /**
   * El orden del alta no es cosmetico: el cronograma sin presupuesto no tiene
   * dinero que ponderar, y congelar la linea base antes de tener las dos
   * cosas congela un plan incompleto.
   */
  it("recorre el alta en el orden del trabajo real", () => {
    const estado: EstadoAlta = {
      presupuesto: false,
      cronograma: false,
      equipo: false,
      lineaBase: false,
    };
    const vistos: string[] = [];

    for (const paso of ["presupuesto", "cronograma", "equipo", "lineaBase"] as const) {
      const siguiente = siguientePaso(estado, false, TODO, EN_PAZ);
      vistos.push(siguiente!.clave);
      estado[paso] = true;
    }

    expect(vistos).toEqual([
      "alta-presupuesto",
      "alta-cronograma",
      "alta-equipo",
      "alta-linea-base",
    ]);
    // Y al terminar el alta ya no queda nada que sugerir.
    expect(siguientePaso(estado, false, TODO, EN_PAZ)).toBeNull();
  });

  it("no propone un paso a quien no puede darlo", () => {
    const sinNada: EstadoAlta = {
      presupuesto: false,
      cronograma: false,
      equipo: false,
      lineaBase: false,
    };

    expect(siguientePaso(sinNada, false, NADA, EN_PAZ)).toBeNull();
  });

  /**
   * Quien solo puede asignar equipo ve SU paso, no el primero de la lista.
   * Sin esto, el anclaje se quedaria mudo para media plantilla.
   */
  it("salta los pasos que no puede dar y ofrece el que si", () => {
    const sinNada: EstadoAlta = {
      presupuesto: false,
      cronograma: false,
      equipo: false,
      lineaBase: false,
    };

    const paso = siguientePaso(
      sinNada,
      false,
      { ...NADA, equipo: true },
      EN_PAZ,
    );

    expect(paso?.clave).toBe("alta-equipo");
  });

  it("con el alta hecha, recuerda lo que vencio", () => {
    const paso = siguientePaso(ALTA_COMPLETA, false, TODO, {
      restriccionesVencidas: 3,
      semanasSinCerrar: 1,
    });

    expect(paso?.clave).toBe("restricciones-vencidas");
    expect(paso?.titulo).toContain("3 restricciones");
  });

  it("singular y plural, que se leen en la cabecera de cada pantalla", () => {
    const una = siguientePaso(ALTA_COMPLETA, false, TODO, {
      restriccionesVencidas: 1,
      semanasSinCerrar: 0,
    });
    expect(una?.titulo).toBe("1 restricción con la fecha ya pasada");

    const semana = siguientePaso(ALTA_COMPLETA, false, TODO, {
      restriccionesVencidas: 0,
      semanasSinCerrar: 1,
    });
    expect(semana?.titulo).toBe("1 semana sin cerrar con el corte ya pasado");
  });

  /**
   * El anclaje se esconde cuando ya estas en la pantalla del paso, y eso lo
   * decide comparando `camino`. Uno vacio seria prefijo de TODAS las rutas de
   * la obra y el anclaje no aparecería nunca.
   */
  it("ningun paso tiene el camino vacio", () => {
    const casos: PasoPosible[] = [
      [{ ...ALTA_COMPLETA }, true, EN_PAZ],
      [{ ...ALTA_COMPLETA, presupuesto: false }, false, EN_PAZ],
      [{ ...ALTA_COMPLETA, cronograma: false }, false, EN_PAZ],
      [{ ...ALTA_COMPLETA, equipo: false }, false, EN_PAZ],
      [{ ...ALTA_COMPLETA, lineaBase: false }, false, EN_PAZ],
      [ALTA_COMPLETA, false, { restriccionesVencidas: 1, semanasSinCerrar: 0 }],
      [ALTA_COMPLETA, false, { restriccionesVencidas: 0, semanasSinCerrar: 1 }],
    ];

    for (const [alta, criterio, avisos] of casos) {
      const paso = siguientePaso(alta, criterio, TODO, avisos);
      expect(paso, JSON.stringify(alta)).not.toBeNull();
      expect(paso!.camino.startsWith("/"), paso!.clave).toBe(true);
    }
  });
});

type PasoPosible = [EstadoAlta, boolean, AvisosVivos];
