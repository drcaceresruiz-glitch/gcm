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
  requisitosParaCerrar,
  puedeCerrar,
  obraAdmiteCambios,
  motivoNoAdmiteCambios,
  OBRA_CERRADA,
  OBRA_ARCHIVADA,
  OBRA_PARALIZADA,
  ESTADOS_OBRA_CON_EXPOSICION,
} from "@/lib/obras";

describe("una obra cerrada no admite cambios", () => {
  it("solo CERRADA cierra la puerta del todo; PARALIZADA la cierra a medias", () => {
    expect(obraAdmiteCambios({ estado: "PLANIFICACION" })).toBe(true);
    expect(obraAdmiteCambios({ estado: "EN_EJECUCION" })).toBe(true);
    expect(obraAdmiteCambios({ estado: "PARALIZADA" })).toBe(false);
    expect(obraAdmiteCambios({ estado: "CERRADA" })).toBe(false);
  });

  it("PARALIZADA bloquea por defecto, pero admite la excepcion explicita", () => {
    // Decidido el 22 de agosto de 2026: PARALIZADA no es todo-o-nada. El
    // default (sin opciones) bloquea, como cualquier escritura que "abre"
    // trabajo nuevo; las pocas que "cierran" lo que ya estaba en curso piden
    // `{ permiteEnParalizada: true }` explicitamente.
    expect(motivoNoAdmiteCambios({ estado: "PARALIZADA" })).toBe(OBRA_PARALIZADA);
    expect(
      motivoNoAdmiteCambios({ estado: "PARALIZADA" }, { permiteEnParalizada: true }),
    ).toBeNull();
    expect(
      obraAdmiteCambios({ estado: "PARALIZADA" }, { permiteEnParalizada: true }),
    ).toBe(true);
  });

  it("de cerrada solo se sale reabriendo, y siempre hacia en ejecucion", () => {
    // Decidido a proposito el 21 de agosto de 2026, con permiso propio
    // (`obra:reabrir`, innegociable) y confirmacion en pantalla — no es
    // que la puerta se abriera sola. Nunca vuelve a planificacion ni a
    // paralizada: la obra ya tuvo gasto real.
    expect(transicionesDeObra("CERRADA")).toEqual(["EN_EJECUCION"]);
    expect(puedeTransicionarObra("CERRADA", "EN_EJECUCION")).toBe(true);
    expect(puedeTransicionarObra("CERRADA", "PLANIFICACION")).toBe(false);
    expect(puedeTransicionarObra("CERRADA", "PARALIZADA")).toBe(false);
  });
});

describe("ESTADOS_OBRA_CON_EXPOSICION: que obras cuentan para dinero y plazo", () => {
  it("en ejecucion y paralizada cuentan; planificacion y cerrada no", () => {
    // Unificado el 22 de agosto de 2026: paralizar bloquea trabajo NUEVO,
    // no borra la deuda ni mueve la fecha fin, asi que sigue contando.
    expect(ESTADOS_OBRA_CON_EXPOSICION).toEqual(["EN_EJECUCION", "PARALIZADA"]);
    expect(ESTADOS_OBRA_CON_EXPOSICION).not.toContain("PLANIFICACION");
    expect(ESTADOS_OBRA_CON_EXPOSICION).not.toContain("CERRADA");
  });
});

describe("una copia restaurada de un respaldo tampoco admite cambios", () => {
  const archivada = { estado: "CERRADA", archivadaEn: new Date("2026-08-12") };

  it("la marca de archivada cierra la puerta por si sola", () => {
    // Aunque el estado fuera uno que si admite cambios. Es la segunda vuelta
    // de llave: si algun dia se relajara la regla de CERRADA, una copia de
    // auditoria tiene que seguir congelada.
    expect(
      obraAdmiteCambios({
        estado: "EN_EJECUCION",
        archivadaEn: new Date("2026-08-12"),
      }),
    ).toBe(false);
  });

  it("y lo explica como copia, no como obra cerrada", () => {
    // Los dos casos se leen distinto a proposito: quien esta mirando un
    // respaldo tiene que saber que lo que ve no es la obra.
    expect(motivoNoAdmiteCambios(archivada)).toBe(OBRA_ARCHIVADA);
    expect(motivoNoAdmiteCambios({ estado: "CERRADA" })).toBe(OBRA_CERRADA);
  });

  it("sin marca y con estado vivo, no hay motivo", () => {
    expect(motivoNoAdmiteCambios({ estado: "EN_EJECUCION" })).toBeNull();
    expect(
      motivoNoAdmiteCambios({ estado: "EN_EJECUCION", archivadaEn: null }),
    ).toBeNull();
  });
});

describe("requisitos para poner una obra en marcha", () => {
  const completa = {
    partidas: 313,
    tieneMeta: true,
    presupuestoCongelado: true,
    tieneCronograma: true,
    tieneLineaBase: true,
  };

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

  /**
   * LA SECUENCIA, pedida asi por el usuario mirando la pantalla: «¿cómo me va
   * a pedir cargar el cronograma sin antes decidir la revisión del
   * presupuesto, sin ser aprobado y congelado? Quiero que todo tenga una
   * secuencia lógica, ordenada».
   *
   * Hasta el 24 de agosto de 2026 se podia poner una obra en ejecucion sin
   * meta y con el presupuesto todavia en borrador, y nada lo decia: los
   * requisitos solo miraban partidas, cronograma y la linea base DEL
   * CRONOGRAMA. El orden de la lista ES la secuencia del riel.
   */
  it("los requisitos salen en el orden del trabajo", () => {
    const vacia = {
      partidas: 0,
      tieneMeta: false,
      presupuestoCongelado: false,
      tieneCronograma: false,
      tieneLineaBase: false,
    };

    expect(requisitosParaEjecutar(vacia).map((r) => r.clave)).toEqual([
      "presupuesto",
      "meta",
      "linea_base_presupuesto",
      "cronograma",
    ]);
  });

  it("sin meta se avisa: sin ella no hay bolsa que vigilar", () => {
    const faltan = requisitosParaEjecutar({ ...completa, tieneMeta: false });

    expect(faltan.map((r) => r.clave)).toEqual(["meta"]);
    // Se avisa, no se bloquea: en obra real a veces se arranca antes que el
    // papeleo, y un muro solo consigue que se trabaje fuera del sistema.
    expect(puedeArrancar(faltan)).toBe(true);
    expect(faltan[0]?.consecuencia).toContain("bolsa");
  });

  it("con el presupuesto sin congelar se avisa antes de arrancar", () => {
    const faltan = requisitosParaEjecutar({
      ...completa,
      presupuestoCongelado: false,
    });

    expect(faltan.map((r) => r.clave)).toEqual(["linea_base_presupuesto"]);
    expect(puedeArrancar(faltan)).toBe(true);
    // Nombra CUAL de las dos lineas base: en GCM hay dos y se llaman igual.
    expect(faltan[0]?.falta).toContain("contractual");
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
    expect(faltan.some((r) => r.clave === "linea_base_cronograma")).toBe(false);
  });

  it("con cronograma pero sin congelar, se avisa de la linea base", () => {
    const faltan = requisitosParaEjecutar({ ...completa, tieneLineaBase: false });
    expect(puedeArrancar(faltan)).toBe(true);
    expect(faltan.map((r) => r.clave)).toEqual(["linea_base_cronograma"]);
  });

  it("acumula lo bloqueante y lo que solo avisa", () => {
    const faltan = requisitosParaEjecutar({
      partidas: 0,
      tieneMeta: true,
      presupuestoCongelado: true,
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
      tieneMeta: false,
      presupuestoCongelado: false,
      tieneCronograma: false,
      tieneLineaBase: false,
    })) {
      expect(r.consecuencia.length).toBeGreaterThan(30);
    }
  });
});

describe("requisitos para cerrar una obra", () => {
  const sinNada = {
    valorizacionesPendientes: 0,
    movimientosBorrador: 0,
    pendientesCriticos: 0,
  };

  it("sin nada pendiente, se puede cerrar", () => {
    const faltan = requisitosParaCerrar(sinNada);
    expect(faltan).toEqual([]);
    expect(puedeCerrar(faltan)).toBe(true);
  });

  it("con saldo por pagar, NO se puede cerrar", () => {
    const faltan = requisitosParaCerrar({ ...sinNada, valorizacionesPendientes: 2 });
    expect(puedeCerrar(faltan)).toBe(false);
    expect(faltan[0]?.clave).toBe("valorizaciones");
    expect(faltan[0]?.bloqueante).toBe(true);
    expect(faltan[0]?.falta).toContain("2 encargos");
  });

  it("con un movimiento en borrador, NO se puede cerrar", () => {
    const faltan = requisitosParaCerrar({ ...sinNada, movimientosBorrador: 1 });
    expect(puedeCerrar(faltan)).toBe(false);
    expect(faltan[0]?.clave).toBe("movimientos_borrador");
    expect(faltan[0]?.falta).toContain("un movimiento");
  });

  it("con pendientes criticos del tablero, se avisa pero SI se deja cerrar", () => {
    // Esta lista es "informa, no bloquea" tambien aqui: la misma doctrina
    // que ya tiene `lib/pendientes.ts`.
    const faltan = requisitosParaCerrar({ ...sinNada, pendientesCriticos: 3 });
    expect(puedeCerrar(faltan)).toBe(true);
    expect(faltan[0]?.clave).toBe("pendientes_criticos");
    expect(faltan[0]?.bloqueante).toBe(false);
  });

  it("acumula lo bloqueante y lo que solo avisa, bloqueantes primero", () => {
    const faltan = requisitosParaCerrar({
      valorizacionesPendientes: 1,
      movimientosBorrador: 1,
      pendientesCriticos: 1,
    });
    expect(faltan.map((r) => r.clave)).toEqual([
      "valorizaciones",
      "movimientos_borrador",
      "pendientes_criticos",
    ]);
    expect(puedeCerrar(faltan)).toBe(false);
  });

  it("cada requisito dice que se rompe, no solo que falta", () => {
    for (const r of requisitosParaCerrar({
      valorizacionesPendientes: 1,
      movimientosBorrador: 1,
      pendientesCriticos: 1,
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

  it("cerrada solo se reabre hacia en ejecucion, nunca a planificacion", () => {
    expect(transicionesDeObra("CERRADA")).toEqual(["EN_EJECUCION"]);
    expect(puedeTransicionarObra("CERRADA", "EN_EJECUCION")).toBe(true);
    expect(puedeTransicionarObra("CERRADA", "PLANIFICACION")).toBe(false);
    expect(puedeTransicionarObra("CERRADA", "PARALIZADA")).toBe(false);
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

  it("el verbo del boton distingue arrancar, reanudar y reabrir", () => {
    expect(etiquetaTransicionObra("PLANIFICACION", "EN_EJECUCION")).toBe("Iniciar ejecucion");
    expect(etiquetaTransicionObra("PARALIZADA", "EN_EJECUCION")).toBe("Reanudar");
    expect(etiquetaTransicionObra("CERRADA", "EN_EJECUCION")).toBe("Reabrir");
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
