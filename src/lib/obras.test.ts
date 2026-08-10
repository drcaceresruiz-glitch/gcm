import { describe, expect, it } from "vitest";
import {
  estadoDeObra,
  fechaDeObra,
  validarObra,
  formatearCorrelativoObra,
  puedeTransicionarObra,
  transicionesDeObra,
  etiquetaTransicionObra,
  requisitosParaEjecutar,
  puedeArrancar,
  obraAdmiteCambios,
} from "@/lib/obras";

describe("una obra cerrada no admite cambios", () => {
  it("solo CERRADA cierra la puerta", () => {
    expect(obraAdmiteCambios("PLANIFICACION")).toBe(true);
    expect(obraAdmiteCambios("EN_EJECUCION")).toBe(true);
    expect(obraAdmiteCambios("PARALIZADA")).toBe(true);
    expect(obraAdmiteCambios("CERRADA")).toBe(false);
  });

  it("paralizada SI admite cambios: esta parada, no terminada", () => {
    // Una obra parada sigue teniendo papeleo pendiente que cerrar.
    expect(obraAdmiteCambios("PARALIZADA")).toBe(true);
  });

  it("y de cerrada no se vuelve: no hay reabrir", () => {
    // Si algun dia se anade, hay que decidirlo a proposito. Esta prueba esta
    // aqui para que ese cambio no pase inadvertido.
    expect(transicionesDeObra("CERRADA")).toEqual([]);
  });
});

describe("requisitos para poner una obra en marcha", () => {
  const completa = { partidas: 313, tieneCronograma: true, tieneLineaBase: true };

  it("una obra completa no tiene nada pendiente", () => {
    const faltan = requisitosParaEjecutar(completa);
    expect(faltan).toEqual([]);
    expect(puedeArrancar(faltan)).toBe(true);
  });

  it("sin partidas NO se puede arrancar", () => {
    // El caso real: una obra recien creada que podia pasar a ejecucion con el
    // presupuesto vacio y quedarse ahi con el BAC en cero.
    const faltan = requisitosParaEjecutar({ ...completa, partidas: 0 });
    expect(puedeArrancar(faltan)).toBe(false);
    expect(faltan[0]?.clave).toBe("presupuesto");
    expect(faltan[0]?.bloqueante).toBe(true);
  });

  it("sin cronograma se avisa, pero se deja arrancar", () => {
    const faltan = requisitosParaEjecutar({
      ...completa,
      tieneCronograma: false,
      tieneLineaBase: false,
    });
    expect(puedeArrancar(faltan)).toBe(true);
    expect(faltan.map((r) => r.clave)).toEqual(["cronograma"]);
  });

  it("sin cronograma NO se menciona la linea base", () => {
    // Decirle a alguien que no ha cargado el plan que ademas no lo ha
    // congelado es ruido: son la misma tarea pendiente.
    const faltan = requisitosParaEjecutar({
      ...completa,
      tieneCronograma: false,
      tieneLineaBase: false,
    });
    expect(faltan.some((r) => r.clave === "linea_base")).toBe(false);
  });

  it("con cronograma pero sin congelar, se avisa de la linea base", () => {
    const faltan = requisitosParaEjecutar({ ...completa, tieneLineaBase: false });
    expect(puedeArrancar(faltan)).toBe(true);
    expect(faltan.map((r) => r.clave)).toEqual(["linea_base"]);
  });

  it("acumula lo bloqueante y lo que solo avisa", () => {
    const faltan = requisitosParaEjecutar({
      partidas: 0,
      tieneCronograma: false,
      tieneLineaBase: false,
    });
    expect(faltan.map((r) => r.clave)).toEqual(["presupuesto", "cronograma"]);
    expect(puedeArrancar(faltan)).toBe(false);
  });

  it("cada requisito dice que se rompe, no solo que falta", () => {
    // Un aviso que solo nombra lo que falta no ayuda a decidir.
    for (const r of requisitosParaEjecutar({
      partidas: 0,
      tieneCronograma: false,
      tieneLineaBase: false,
    })) {
      expect(r.consecuencia.length).toBeGreaterThan(30);
    }
  });
});

describe("transiciones de estado de obra", () => {
  it("una obra avanza, no salta ni retrocede", () => {
    expect(transicionesDeObra("PLANIFICACION")).toEqual(["EN_EJECUCION", "CERRADA"]);
    expect(transicionesDeObra("EN_EJECUCION")).toEqual(["PARALIZADA", "CERRADA"]);
    expect(transicionesDeObra("PARALIZADA")).toEqual(["EN_EJECUCION", "CERRADA"]);
  });

  it("cerrada es terminal: no se sale de ella", () => {
    expect(transicionesDeObra("CERRADA")).toEqual([]);
    expect(puedeTransicionarObra("CERRADA", "EN_EJECUCION")).toBe(false);
    expect(puedeTransicionarObra("CERRADA", "PLANIFICACION")).toBe(false);
  });

  it("no se paraliza lo que no empezo, ni se vuelve a planificar", () => {
    expect(puedeTransicionarObra("PLANIFICACION", "PARALIZADA")).toBe(false);
    expect(puedeTransicionarObra("EN_EJECUCION", "PLANIFICACION")).toBe(false);
  });

  it("acepta las transiciones del ciclo de vida", () => {
    expect(puedeTransicionarObra("PLANIFICACION", "EN_EJECUCION")).toBe(true);
    expect(puedeTransicionarObra("EN_EJECUCION", "PARALIZADA")).toBe(true);
    expect(puedeTransicionarObra("PARALIZADA", "EN_EJECUCION")).toBe(true);
    expect(puedeTransicionarObra("PLANIFICACION", "CERRADA")).toBe(true);
  });

  it("un estado inventado no habilita ninguna transicion", () => {
    expect(transicionesDeObra("INVENTADO")).toEqual([]);
    expect(puedeTransicionarObra("INVENTADO", "CERRADA")).toBe(false);
  });

  it("el verbo del boton distingue arrancar de reanudar", () => {
    expect(etiquetaTransicionObra("PLANIFICACION", "EN_EJECUCION")).toBe("Iniciar ejecucion");
    expect(etiquetaTransicionObra("PARALIZADA", "EN_EJECUCION")).toBe("Reanudar");
    expect(etiquetaTransicionObra("EN_EJECUCION", "PARALIZADA")).toBe("Paralizar");
    expect(etiquetaTransicionObra("EN_EJECUCION", "CERRADA")).toBe("Cerrar obra");
  });
});

describe("formatearCorrelativoObra", () => {
  it("rellena con ceros a seis digitos", () => {
    expect(formatearCorrelativoObra(1)).toBe("OB-000001");
    expect(formatearCorrelativoObra(42)).toBe("OB-000042");
    expect(formatearCorrelativoObra(123456)).toBe("OB-123456");
  });

  /** El padding es justo para esto: ordenar como texto = ordenar como numero. */
  it("OB-000009 va antes que OB-000010 al ordenar", () => {
    const nueve = formatearCorrelativoObra(9);
    const diez = formatearCorrelativoObra(10);
    expect([diez, nueve].sort()).toEqual([nueve, diez]);
  });
});

describe("estadoDeObra", () => {
  it("acepta los estados del esquema", () => {
    expect(estadoDeObra("EN_EJECUCION")).toBe("EN_EJECUCION");
    expect(estadoDeObra("CERRADA")).toBe("CERRADA");
  });

  /** Viene de un desplegable: manipular la peticion no debe romper el alta. */
  it("cae en planificacion ante cualquier otra cosa", () => {
    expect(estadoDeObra(undefined)).toBe("PLANIFICACION");
    expect(estadoDeObra("")).toBe("PLANIFICACION");
    expect(estadoDeObra("BORRADO")).toBe("PLANIFICACION");
  });
});

describe("fechaDeObra", () => {
  it("lee lo que manda un input de tipo date", () => {
    expect(fechaDeObra("2026-08-01")?.toISOString()).toBe(
      "2026-08-01T00:00:00.000Z",
    );
  });

  it("rechaza lo que no es una fecha", () => {
    expect(fechaDeObra(undefined)).toBeNull();
    expect(fechaDeObra("")).toBeNull();
    expect(fechaDeObra("01/08/2026")).toBeNull();
    expect(fechaDeObra("2026-8-1")).toBeNull();
  });

  /**
   * `new Date("2026-02-31")` no falla: rueda al 3 de marzo. Sin comprobarlo,
   * una obra podria quedar con una fecha de inicio que nadie escribio.
   */
  it("rechaza los dias que no existen en vez de rodarlos", () => {
    expect(fechaDeObra("2026-02-31")).toBeNull();
    expect(fechaDeObra("2026-13-01")).toBeNull();
  });

  it("acepta el 29 de febrero de un bisiesto", () => {
    expect(fechaDeObra("2028-02-29")).not.toBeNull();
    expect(fechaDeObra("2026-02-29")).toBeNull();
  });
});

describe("validarObra", () => {
  const base = {
    nombreObra: "CRIOCORD",
    fechaInicio: "2026-08-01",
    fechaFinProgramada: "2026-10-22",
  };

  it("acepta una obra con nombre y plazo coherente", () => {
    const r = validarObra(base);

    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.plazo.inicio.toISOString().slice(0, 10)).toBe("2026-08-01");
      expect(r.plazo.fin.toISOString().slice(0, 10)).toBe("2026-10-22");
    }
  });

  it("exige el nombre", () => {
    const r = validarObra({ ...base, nombreObra: "   " });
    expect(r).toEqual({ ok: false, error: "Indica el nombre de la obra." });
  });

  it("exige las dos fechas", () => {
    expect(validarObra({ ...base, fechaInicio: "" }).ok).toBe(false);
    expect(validarObra({ ...base, fechaFinProgramada: "manana" }).ok).toBe(false);
  });

  /** Un plazo hacia atras da avances de calendario negativos o del 100 %. */
  it("rechaza que el fin sea anterior al inicio", () => {
    const r = validarObra({
      ...base,
      fechaInicio: "2026-10-22",
      fechaFinProgramada: "2026-08-01",
    });

    expect(r).toEqual({
      ok: false,
      error: "La fecha de fin no puede ser anterior a la de inicio.",
    });
  });

  it("admite una obra de un solo dia", () => {
    expect(
      validarObra({
        ...base,
        fechaInicio: "2026-08-01",
        fechaFinProgramada: "2026-08-01",
      }).ok,
    ).toBe(true);
  });
});
