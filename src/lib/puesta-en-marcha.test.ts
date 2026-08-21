import { describe, it, expect } from "vitest";
import {
  pasosDePuestaEnMarcha,
  siguientePasoDeEmpresa,
  type EstadoPreliminares,
  type PuedeEnEmpresa,
} from "./puesta-en-marcha";

const NADA: EstadoPreliminares = {
  logo: false,
  contratistas: false,
  equipo: false,
  obras: false,
  presupuesto: false,
};

const TODO: EstadoPreliminares = {
  logo: true,
  contratistas: true,
  equipo: true,
  obras: true,
  presupuesto: true,
};

const PUEDE_TODO: PuedeEnEmpresa = {
  empresa: true,
  contratistas: true,
  equipo: true,
  obras: true,
};

const PUEDE_NADA: PuedeEnEmpresa = {
  empresa: false,
  contratistas: false,
  equipo: false,
  obras: false,
};

describe("la puesta en marcha de una constructora", () => {
  it("con todo cargado ya no sugiere nada", () => {
    expect(siguientePasoDeEmpresa(TODO, PUEDE_TODO)).toBeNull();
  });

  /**
   * El orden no es cosmetico: los datos y el logo salen en los documentos que
   * generan los demas pasos, y sin obra no hay donde cargar un presupuesto.
   */
  it("recorre los pasos en el orden del trabajo real", () => {
    const estado = { ...NADA };
    const vistos: string[] = [];

    for (const clave of [
      "logo",
      "contratistas",
      "equipo",
      "obras",
      "presupuesto",
    ] as const) {
      vistos.push(siguientePasoDeEmpresa(estado, PUEDE_TODO)!.clave);
      estado[clave] = true;
    }

    expect(vistos).toEqual([
      "puesta-logo",
      "puesta-contratistas",
      "puesta-equipo",
      "puesta-obras",
      "puesta-presupuesto",
    ]);
    expect(siguientePasoDeEmpresa(estado, PUEDE_TODO)).toBeNull();
  });

  it("no propone un paso a quien no puede darlo", () => {
    expect(siguientePasoDeEmpresa(NADA, PUEDE_NADA)).toBeNull();
  });

  /** Quien solo puede crear obras ve SU paso, no el primero de la lista. */
  it("salta los pasos sin permiso y ofrece el que si", () => {
    const paso = siguientePasoDeEmpresa(NADA, { ...PUEDE_NADA, obras: true });
    expect(paso?.clave).toBe("puesta-obras");
  });

  it("la guia lista los cinco pasos con su estado", () => {
    const lista = pasosDePuestaEnMarcha({ ...NADA, logo: true });

    expect(lista).toHaveLength(5);
    expect(lista[0]!.hecho).toBe(true);
    expect(lista.slice(1).every((p) => !p.hecho)).toBe(true);
  });

  /**
   * Los dos pasos que se cargan por Excel llevan su plantilla EN LA GUIA. El
   * primer dia es justo cuando nadie sabe que existe, y casi todos los fallos
   * del importador nacen del archivo.
   */
  it("los pasos que se importan ofrecen su plantilla", () => {
    const porClave = new Map(
      pasosDePuestaEnMarcha(NADA).map((p) => [p.paso.clave, p.paso]),
    );

    expect(porClave.get("puesta-contratistas")?.plantilla?.href).toBe(
      "/empresa/proveedores/plantilla",
    );
    expect(porClave.get("puesta-presupuesto")?.plantilla?.href).toBe(
      "/plantilla-meta",
    );
    expect(porClave.get("puesta-equipo")?.plantilla).toBeNull();
  });

  /**
   * Ninguno bloquea. Una constructora a medio configurar funciona, solo rinde
   * menos: es la linea de `lib/pendientes` —informa, no bloquea— y si alguno
   * naciera «bloqueante» el anclaje dejaria de poder apartarse.
   */
  it("ningun paso de la puesta en marcha bloquea", () => {
    for (const { paso } of pasosDePuestaEnMarcha(NADA)) {
      expect(paso.gravedad, paso.clave).toBe("sugerencia");
    }
  });

  /**
   * `nombre` y `titulo` NO son lo mismo, y confundirlos ya paso una vez.
   *
   * `titulo` va redactado en falta —«Falta el logo»— porque el anclaje solo
   * lo pinta cuando el paso esta pendiente. La guia enseña TODOS los pasos,
   * asi que usa `nombre`, en neutro. Con la constructora ya montada la
   * pantalla llego a decir «5 de 5 pasos dados» encabezando cinco titulos que
   * decian que faltaba todo.
   */
  it("cada paso tiene un nombre neutro distinto de su titulo en falta", () => {
    for (const { paso } of pasosDePuestaEnMarcha(NADA)) {
      expect(paso.nombre.length, paso.clave).toBeGreaterThan(0);
      expect(paso.nombre, paso.clave).not.toBe(paso.titulo);
      // Lo que delata a un `nombre` copiado del `titulo`: los tres arranques
      // en falta que usan los titulos de esta lista.
      expect(paso.nombre.toLowerCase(), paso.clave).not.toMatch(
        /^(falta|todav[ií]a no|eres la [úu]nica)/,
      );
    }
  });

  /** El anclaje se esconde comparando el camino: uno vacio seria prefijo de todo. */
  it("todos los caminos son absolutos y no vacios", () => {
    for (const { paso } of pasosDePuestaEnMarcha(NADA)) {
      expect(paso.camino.startsWith("/"), paso.clave).toBe(true);
    }
  });
});
