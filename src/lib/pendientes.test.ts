import { describe, it, expect } from "vitest";
import {
  pendientesDeObra,
  resumirPendientes,
  type ConteoPendientes,
} from "./pendientes";

/** Una obra sin nada pendiente. Cada prueba enciende solo lo suyo. */
function limpio(cambios: Partial<ConteoPendientes> = {}): ConteoPendientes {
  return {
    tareasEmpezadasSinAvance: 0,
    semanasSinPorcentaje: 0,
    lookaheadSinAnalizar: 0,
    confiabilidadMostrada: null,
    tareasProximasBloqueadas: 0,
    diasVentana: 14,
    tareasProximasSinCobertura: 0,
    partidasSobregiradas: 0,
    ppcUltimo: null,
    ppcAnterior: null,
    coberturaMapeo: null,
    ...cambios,
  };
}

const claves = (c: Partial<ConteoPendientes>) =>
  pendientesDeObra(limpio(c)).map((p) => p.clave);

describe("pendientesDeObra", () => {
  it("una obra al dia no tiene NADA pendiente", () => {
    // Un panel que nunca esta vacio ensena a ignorarlo.
    expect(pendientesDeObra(limpio())).toEqual([]);
  });

  it("no inventa pendientes con los datos aun sin cargar", () => {
    // Obra recien creada: sin PPC, sin cobertura, sin confiabilidad. Nada de
    // eso es un pendiente, es que todavia no hay obra que medir.
    expect(claves({ ppcUltimo: null, coberturaMapeo: null })).toEqual([]);
  });

  describe("entradas", () => {
    it("avisa de tareas empezadas sin avance, y dice que la curva las cuenta a cero", () => {
      const [p] = pendientesDeObra(limpio({ tareasEmpezadasSinAvance: 3 }));
      expect(p?.clave).toBe("avance-sin-reportar");
      expect(p?.gravedad).toBe("critica");
      expect(p?.titulo).toContain("3 tareas empezaron");
      expect(p?.consecuencia).toContain("curva S");
    });

    it("concuerda en singular", () => {
      const [p] = pendientesDeObra(limpio({ tareasEmpezadasSinAvance: 1 }));
      expect(p?.titulo).toContain("1 tarea empezo");
      expect(p?.titulo).not.toContain("tareas");
    });

    it("las semanas cerradas sin % son aviso, no critica", () => {
      // El PPC de esas semanas es correcto; lo que falta es el avance fisico.
      const [p] = pendientesDeObra(limpio({ semanasSinPorcentaje: 2 }));
      expect(p?.clave).toBe("cierre-sin-porcentaje");
      expect(p?.gravedad).toBe("aviso");
    });
  });

  describe("procesos", () => {
    it("la tarea que arranca sin nadie contratado es critica", () => {
      const [p] = pendientesDeObra(
        limpio({ tareasProximasSinCobertura: 2, diasVentana: 7 }),
      );
      expect(p?.clave).toBe("sin-cobertura");
      expect(p?.gravedad).toBe("critica");
      expect(p?.titulo).toContain("7 dias");
      expect(p?.camino).toBe("/proveedores");
    });

    it("el lookahead sin analizar explica que la confiabilidad miente", () => {
      const [p] = pendientesDeObra(
        limpio({ lookaheadSinAnalizar: 12, confiabilidadMostrada: 40 }),
      );
      expect(p?.consecuencia).toContain("40%");
      expect(p?.gravedad).toBe("aviso");
    });

    it("sin confiabilidad conocida, el texto no queda cojo", () => {
      const [p] = pendientesDeObra(
        limpio({ lookaheadSinAnalizar: 5, confiabilidadMostrada: null }),
      );
      expect(p?.consecuencia).not.toContain("Ahora mismo muestra");
    });
  });

  describe("salidas", () => {
    it("el sobregiro propone las dos salidas reales", () => {
      const [p] = pendientesDeObra(limpio({ partidasSobregiradas: 4 }));
      expect(p?.clave).toBe("sobregiro");
      expect(p?.consecuencia).toContain("adicional");
      expect(p?.consecuencia).toContain("reconvertir");
    });

    it("un PPC bajo es critica", () => {
      const [p] = pendientesDeObra(limpio({ ppcUltimo: 55 }));
      expect(p?.clave).toBe("ppc-bajo");
      expect(p?.gravedad).toBe("critica");
    });

    it("un PPC bueno pero que CAE se avisa igual", () => {
      // 82% esta bien; venir de 95% es la senal.
      const [p] = pendientesDeObra(limpio({ ppcUltimo: 82, ppcAnterior: 95 }));
      expect(p?.clave).toBe("ppc-bajo");
      expect(p?.gravedad).toBe("aviso");
      expect(p?.consecuencia).toContain("95%");
    });

    it("un PPC bueno que sube no es pendiente", () => {
      expect(claves({ ppcUltimo: 88, ppcAnterior: 80 })).toEqual([]);
    });

    it("la cobertura del mapeo solo avisa por debajo del 60", () => {
      expect(claves({ coberturaMapeo: 40 })).toEqual(["mapeo-incompleto"]);
      expect(claves({ coberturaMapeo: 75 })).toEqual([]);
    });
  });

  describe("orden", () => {
    it("lo critico va primero, y dentro, entradas antes que salidas", () => {
      // Una entrada mala invalida todo lo que se calcula debajo, asi que se
      // lee antes que el indicador que ya salio contaminado.
      const orden = claves({
        partidasSobregiradas: 9, // critica, salidas
        tareasEmpezadasSinAvance: 1, // critica, entradas
        tareasProximasBloqueadas: 2, // critica, procesos
        coberturaMapeo: 30, // aviso, salidas
      });
      expect(orden).toEqual([
        "avance-sin-reportar",
        "restricciones-sin-liberar",
        "sobregiro",
        "mapeo-incompleto",
      ]);
    });

    it("a igual gravedad y bloque, primero lo que afecta a mas", () => {
      const orden = claves({
        tareasProximasBloqueadas: 2,
        tareasProximasSinCobertura: 8,
      });
      expect(orden[0]).toBe("sin-cobertura");
    });
  });

  it("cada pendiente dice DONDE se arregla", () => {
    // Un aviso sin salida es solo una queja.
    const todos = pendientesDeObra(
      limpio({
        tareasEmpezadasSinAvance: 1,
        semanasSinPorcentaje: 1,
        lookaheadSinAnalizar: 1,
        tareasProximasBloqueadas: 1,
        tareasProximasSinCobertura: 1,
        partidasSobregiradas: 1,
        ppcUltimo: 50,
        coberturaMapeo: 10,
      }),
    );
    expect(todos).toHaveLength(8);
    for (const p of todos) {
      expect(p.camino.startsWith("/")).toBe(true);
      expect(p.consecuencia.length).toBeGreaterThan(20);
    }
  });
});

describe("resumirPendientes", () => {
  it("cuenta criticas y avisos por separado", () => {
    const lista = pendientesDeObra(
      limpio({ partidasSobregiradas: 1, coberturaMapeo: 20 }),
    );
    expect(resumirPendientes(lista)).toEqual({
      criticas: 1,
      avisos: 1,
      total: 2,
    });
  });

  it("sin pendientes, todo a cero", () => {
    expect(resumirPendientes([])).toEqual({ criticas: 0, avisos: 0, total: 0 });
  });
});
