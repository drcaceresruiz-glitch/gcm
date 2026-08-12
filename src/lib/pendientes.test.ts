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
    incumplidosSinRetomar: 0,
    incumplidosCronicos: 0,
    lookaheadSinAnalizar: 0,
    confiabilidadMostrada: null,
    tareasProximasBloqueadas: 0,
    restriccionesVencidas: 0,
    restriccionesSinResponsable: 0,
    tareasProximasSinAnalizar: 0,
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

  it("TODO pendiente dice donde se arregla y que hay que hacer alli", () => {
    // Un aviso del que no se puede salir a arreglar la cosa es solo una queja.
    // Este test enciende todas las reglas a la vez para que una nueva no se
    // pueda anadir sin su salida.
    const todos = pendientesDeObra(
      limpio({
        tareasEmpezadasSinAvance: 3,
        semanasSinPorcentaje: 1,
        lookaheadSinAnalizar: 18,
        confiabilidadMostrada: 24,
        tareasProximasBloqueadas: 1,
        tareasProximasSinAnalizar: 9,
        tareasProximasSinCobertura: 2,
        partidasSobregiradas: 4,
        incumplidosSinRetomar: 3,
        incumplidosCronicos: 1,
        restriccionesVencidas: 2,
        restriccionesSinResponsable: 5,
        ppcUltimo: 62,
        ppcAnterior: 100,
        coberturaMapeo: 40,
      }),
    );

    expect(todos.length).toBe(12);
    for (const p of todos) {
      expect(p.camino, p.clave).toMatch(/^\//);
      // En imperativo y con sustancia: "Ver" o "Ir" no dicen que hacer.
      expect(p.accion.length, p.clave).toBeGreaterThan(20);
    }
  });

  it("el enlace del Lookahead abre la ventana que el propio aviso anuncia", () => {
    // Si el texto dice "arrancan en 14 dias", la matriz tiene que abrirse con
    // dos semanas. Con tres, hay que buscar las tareas entre otras que no son.
    const [p] = pendientesDeObra(
      limpio({ tareasProximasSinAnalizar: 9, diasVentana: 14 }),
    );
    expect(p?.camino).toBe("/lookahead?semanas=2");

    // Se redondea hacia arriba: con 10 dias, una sola semana esconderia parte
    // de lo que el numero esta contando.
    const [q] = pendientesDeObra(
      limpio({ tareasProximasSinAnalizar: 9, diasVentana: 10 }),
    );
    expect(q?.camino).toBe("/lookahead?semanas=2");
  });

  it("el aviso de la ventana ENTERA no acota la ventana", () => {
    // Cuenta las tareas sin analizar de todo el Lookahead, no de los proximos
    // dias: acotarlo escondera parte de lo que el propio numero anuncia.
    const [p] = pendientesDeObra(limpio({ lookaheadSinAnalizar: 18 }));
    expect(p?.camino).toBe("/lookahead");
  });

  it("el PPC enlaza directo al Pareto, que es lo unico que dice por que", () => {
    const [p] = pendientesDeObra(limpio({ ppcUltimo: 62 }));
    expect(p?.camino).toBe("/plan-semanal#pareto");
    expect(p?.accion).toContain("Pareto");
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

    it("dice lo que importa: esto lo prometiste, fallo y sigue sin hacerse", () => {
      // El agujero de la seccion 6i: un compromiso incumplido se quedaba dentro
      // de una semana cerrada, y si su fecha ya paso desaparecia tambien del
      // Lookahead. No lo decia ninguna pantalla.
      const [p] = pendientesDeObra(limpio({ incumplidosSinRetomar: 3 }));
      expect(p?.clave).toBe("incumplidos-sin-retomar");
      expect(p?.titulo).toContain("3 tareas prometidas");
      expect(p?.consecuencia).toContain("Lookahead");
      expect(p?.accion).toContain("Viene de semanas anteriores");
    });

    it("lo cronico es critico; un fallo suelto solo es aviso", () => {
      // Tres semanas prometiendose y fallando no es un retraso: es que algo lo
      // impide, y hasta que se sepa el que volvera a fallar la cuarta.
      expect(
        pendientesDeObra(limpio({ incumplidosSinRetomar: 1 }))[0]?.gravedad,
      ).toBe("aviso");

      const [p] = pendientesDeObra(
        limpio({ incumplidosSinRetomar: 2, incumplidosCronicos: 1 }),
      );
      expect(p?.gravedad).toBe("critica");
      expect(p?.consecuencia).toContain("algo lo impide");
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

    it("la que arranca pronto sin analizar es critica, no un aviso mas", () => {
      const [p] = pendientesDeObra(
        limpio({ tareasProximasSinAnalizar: 3, diasVentana: 14 }),
      );
      expect(p?.clave).toBe("proximas-sin-analizar");
      expect(p?.gravedad).toBe("critica");
      expect(p?.titulo).toContain("14 dias");
      // Con la ventana acotada a esos mismos 14 dias: el enlace tiene que
      // abrir exactamente las tareas de las que habla el aviso.
      expect(p?.camino).toBe("/lookahead?semanas=2");
    });

    it("una promesa vencida es critica y tiene nombre y apellidos", () => {
      // «Algo no esta listo» es un estado; «dijiste que lo tendrias el jueves»
      // es una conversacion pendiente, y es la que destraba la obra.
      const [p] = pendientesDeObra(limpio({ restriccionesVencidas: 2 }));
      expect(p?.clave).toBe("restricciones-vencidas");
      expect(p?.gravedad).toBe("critica");
      expect(p?.consecuencia).toContain("alguien dijo que lo tendría");
      expect(p?.accion).toContain("fecha nueva");
    });

    it("sin responsable es AVISO: no hay cifra falsa, hay lista sin dueno", () => {
      const [p] = pendientesDeObra(limpio({ restriccionesSinResponsable: 5 }));
      expect(p?.clave).toBe("restricciones-sin-responsable");
      expect(p?.gravedad).toBe("aviso");
      expect(p?.consecuencia).toContain("da por hecho que la consigue otro");
    });

    it("vencidas y sin responsable son problemas DISTINTOS", () => {
      // Uno es «¿para cuando?» y el otro «¿quien?». Los resuelve gente
      // distinta, asi que juntarlos daria un texto que no lleva a nada.
      expect(
        claves({ restriccionesVencidas: 1, restriccionesSinResponsable: 1 }),
      ).toEqual(["restricciones-vencidas", "restricciones-sin-responsable"]);
    });

    it("'sin analizar' y 'sin liberar' son avisos DISTINTOS", () => {
      // Antes eran el mismo hueco contado dos veces: una tarea sin analizar
      // no tiene restricciones, asi que acusarla de tenerlas sin liberar era
      // un falso positivo, y encima con gravedad critica.
      expect(claves({ tareasProximasSinAnalizar: 2 })).toEqual([
        "proximas-sin-analizar",
      ]);
      expect(claves({ tareasProximasBloqueadas: 2 })).toEqual([
        "restricciones-sin-liberar",
      ]);
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

    it("NO dice «menos de la mitad» cuando es mas de la mitad", () => {
      // El defecto real de la primera obra: con 62% GCM afirmaba en pantalla
      // algo que sus propios numeros desmentian. Un panel que exagera una vez
      // deja de creerse tambien cuando dice algo grave.
      const [p] = pendientesDeObra(limpio({ ppcUltimo: 62 }));
      expect(p?.consecuencia).not.toContain("Menos de la mitad");
      expect(p?.consecuencia).toContain("6 de cada 10");
      expect(p?.gravedad).toBe("critica");
    });

    it("«menos de la mitad» solo por debajo del 50", () => {
      const [p] = pendientesDeObra(limpio({ ppcUltimo: 45 }));
      expect(p?.consecuencia).toContain("Menos de la mitad");

      const [q] = pendientesDeObra(limpio({ ppcUltimo: 50 }));
      expect(q?.consecuencia).not.toContain("Menos de la mitad");
    });

    it("no redondea al alza los «de cada 10»", () => {
      // 69% no son 7 de cada 10: seria el mismo defecto en pequeno.
      const [p] = pendientesDeObra(limpio({ ppcUltimo: 69 }));
      expect(p?.consecuencia).toContain("6 de cada 10");
    });

    it("un PPC bueno pero que CAE se avisa igual", () => {
      // 82% esta bien; venir de 95% es la senal.
      const [p] = pendientesDeObra(limpio({ ppcUltimo: 82, ppcAnterior: 95 }));
      expect(p?.clave).toBe("ppc-bajo");
      expect(p?.gravedad).toBe("aviso");
      expect(p?.consecuencia).toContain("95%");
      // Y sobre todo: no lo trata como si fuera malo, porque no lo es.
      expect(p?.consecuencia).not.toContain("Menos de la mitad");
      expect(p?.consecuencia).toContain("sigue siendo bueno");
    });

    it("un PPC bajo que ademas cae dice las dos cosas", () => {
      const [p] = pendientesDeObra(limpio({ ppcUltimo: 62, ppcAnterior: 71 }));
      expect(p?.consecuencia).toContain("6 de cada 10");
      expect(p?.consecuencia).toContain("71%");
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
        tareasProximasSinAnalizar: 1,
        tareasProximasSinCobertura: 1,
        partidasSobregiradas: 1,
        ppcUltimo: 50,
        coberturaMapeo: 10,
      }),
    );
    expect(todos).toHaveLength(9);
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
