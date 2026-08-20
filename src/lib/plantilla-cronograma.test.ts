import { describe, expect, it } from "vitest";

import { analizarCronogramaExcel } from "@/lib/excel-cronograma";
import { edtDesdePresupuesto } from "@/lib/edt-desde-presupuesto";
import {
  FECHA_CORTE_EJEMPLO,
  FILAS_EJEMPLO,
  MINUTOS_POR_DIA_EJEMPLO,
  OBRA_EJEMPLO,
  generarPlantillaCronograma,
} from "@/lib/plantilla-cronograma";

/**
 * El contrato de la plantilla: lo que GCM regala para descargar, GCM lo tiene
 * que poder importar limpio.
 *
 * Si alguien cambia las reglas del lector y la plantilla se queda atras, esto
 * es lo que revienta antes de llegar a produccion. Es la unica prueba que
 * ata los dos archivos, que se escribieron para encajar y no comparten codigo.
 */
describe("plantilla de cronograma", () => {
  it("se analiza sin un solo error", async () => {
    const buffer = await generarPlantillaCronograma();
    const r = await analizarCronogramaExcel(buffer);

    expect(r.errores).toEqual([]);
    expect(r.tareas).toHaveLength(FILAS_EJEMPLO.length);
  });

  it("lee el preambulo: obra, corte y jornada", async () => {
    const r = await analizarCronogramaExcel(await generarPlantillaCronograma());

    expect(r.fechaCorte).toBe(FECHA_CORTE_EJEMPLO);
    expect(r.minutosPorDia).toBe(MINUTOS_POR_DIA_EJEMPLO);
    // El nombre sale de la fila de nivel 1, no de la celda "Obra:", igual que
    // en MS Project sale de la primera fila real y no del titulo.
    expect(r.nombreProyecto).toBe(OBRA_EJEMPLO);
  });
});

describe("lo que la plantilla ensena sin decirlo", () => {
  it("deriva el hito de la duracion cero, sin que nadie lo marque", async () => {
    const r = await analizarCronogramaExcel(await generarPlantillaCronograma());

    expect(r.totalHitos).toBe(1);
    const hito = r.tareas.find((t) => t.esHito);
    expect(hito?.codigo).toBe("2.3");
    expect(hito?.inicio).toBe(hito?.fin);
  });

  /**
   * La obra y los dos capitulos son resumen; las cinco partidas no. Se deriva
   * de que la fila siguiente cuelgue mas adentro, y no de una casilla: un
   * booleano a mano que contradiga el nivel produce doble conteo silencioso
   * al ponderar por duracion, que filtra por `!esResumen`.
   */
  it("deriva que la obra y los capitulos son resumen", async () => {
    const r = await analizarCronogramaExcel(await generarPlantillaCronograma());

    expect(r.totalResumen).toBe(3);
    expect(r.tareas.filter((t) => t.esResumen).map((t) => t.uid)).toEqual([1, 2, 5]);
  });

  /**
   * El punto entero de este lector: un Excel no trae la red de precedencias
   * completa, asi que la ruta critica NO SE CONOCE. Se marca como no
   * informada en vez de deducirla, igual que el lector de MS Project se niega
   * a deducir `esCritico` de la holgura.
   */
  it("no se inventa la ruta critica ni la holgura", async () => {
    const r = await analizarCronogramaExcel(await generarPlantillaCronograma());

    expect(r.totalCriticas).toBe(0);
    expect(r.holgurasInferidas).toBe(r.tareas.length);
    expect(r.tareas.every((t) => !t.esCritico)).toBe(true);
    expect(r.tareas.every((t) => t.holguraInferida)).toBe(true);
    expect(r.tareas.every((t) => t.holguraDias === "0.00")).toBe(true);
  });

  it("lee los enlaces de la columna Depende de", async () => {
    const r = await analizarCronogramaExcel(await generarPlantillaCronograma());

    expect(r.dependenciasDescartadas).toBe(0);
    expect(r.dependencias).toContainEqual({
      tareaUid: 7,
      predecesoraUid: 6,
      tipo: "FC",
      desfaseDias: "0.00",
    });
  });

  /** El plazo sale de la fila de nivel 1, no de restar las fechas. */
  it("toma el plazo de la obra de su propia fila", async () => {
    const r = await analizarCronogramaExcel(await generarPlantillaCronograma());

    expect(r.duracionDias).toBe("70.00");
    expect(r.inicio).toBe("2026-06-01");
    expect(r.fin).toBe("2026-09-04");
  });
});

/**
 * ---------------------------------------------------------------------------
 * LA PLANTILLA QUE SALE DEL PRESUPUESTO.
 *
 * Misma exigencia que la generica —el importador tiene que poder leerla— mas
 * las dos cosas que solo pasan aqui: que la fila de la obra encabece y todo
 * baje un nivel, y que las fechas salgan VACIAS.
 * ---------------------------------------------------------------------------
 */
describe("plantilla prellenada con el presupuesto", () => {
  /**
   * Un presupuesto con el caso dificil dentro: `2` es un capitulo a suma
   * alzada que LLEVA el importe y cuyas subpartidas son alcance sin cifra.
   * Quien aporta al dinero es el capitulo, asi que la hoja es el, no ellas.
   */
  const PRESUPUESTO = [
    { id: "a", codigoPartida: "1", descripcion: "ESTRUCTURAS", parentId: null, orden: 0, parcial: null },
    { id: "b", codigoPartida: "1.1", descripcion: "Zapatas", parentId: "a", orden: 1, parcial: "1000.00" },
    { id: "c", codigoPartida: "1.2", descripcion: "Columnas", parentId: "a", orden: 2, parcial: "2000.00" },
    { id: "d", codigoPartida: "2", descripcion: "INSTALACIONES", parentId: null, orden: 3, parcial: "5000.00" },
    { id: "e", codigoPartida: "2.1", descripcion: "Incluye tableros", parentId: "d", orden: 4, parcial: null },
  ];

  async function plantilla() {
    const filas = edtDesdePresupuesto(PRESUPUESTO);
    return generarPlantillaCronograma({
      nombreObra: "OBRA DE PRUEBA",
      fechaCorte: "2026-08-20",
      inicioObra: "2026-09-01",
      finObra: "2026-11-28",
      diasPlazo: 64,
      filas,
    });
  }

  it("el importador la lee sin una sola incidencia", async () => {
    const r = await analizarCronogramaExcel(await plantilla());

    expect(r.errores).toEqual([]);
    expect(r.tareas.length).toBeGreaterThan(0);
  });

  it("la obra encabeza, sola en el nivel 1", async () => {
    const r = await analizarCronogramaExcel(await plantilla());

    const nivel1 = r.tareas.filter((t) => t.nivel === 1);
    expect(nivel1).toHaveLength(1);
    expect(r.tareas[0]?.nombre).toContain("OBRA DE PRUEBA");
  });

  /**
   * El desplazamiento de nivel. Sin el, cada capitulo seria otra fila de nivel
   * 1 y la plantilla contradiria su propia instruccion 2.
   */
  it("los capitulos del presupuesto bajan al nivel 2", async () => {
    const r = await analizarCronogramaExcel(await plantilla());

    const estructuras = r.tareas.find((t) => t.codigo === "1");
    expect(estructuras?.nivel).toBe(2);
  });

  /**
   * Lo que de verdad se le pide a esta plantilla: traer la estructura y NO
   * inventar el plan.
   *
   * LA REGRESION QUE IMPIDE: la primera version dejaba las fechas en blanco
   * —«ya las pone el planificador»— y el importador, que las exige en TODAS
   * las filas incluidos los resumenes, rechazaba el archivo entero: cinco
   * errores y cero tareas.
   *
   * Y se rellenan con el PLAZO, no con un dia suelto: si inicio y fin
   * coincidieran la duracion seria cero, cada partida entraria como hito y
   * saldrian todas del avance ponderado sin dar un solo error.
   */
  it("todas las filas traen el plazo de la obra, y ninguna entra como hito", async () => {
    const r = await analizarCronogramaExcel(await plantilla());

    for (const t of r.tareas) {
      expect(t.inicio).toBe("2026-09-01");
      expect(t.fin).toBe("2026-11-28");
    }
    expect(r.tareas.some((t) => t.esHito)).toBe(false);
  });

  it("el capitulo a suma alzada baja como hoja, y su alcance no baja", async () => {
    const r = await analizarCronogramaExcel(await plantilla());

    // El dinero de "2" esta en el capitulo: es el quien se ejecuta.
    expect(r.tareas.some((t) => t.codigo === "2")).toBe(true);
    // "2.1" solo describe que incluye el precio: no es una tarea.
    expect(r.tareas.some((t) => t.codigo === "2.1")).toBe(false);
  });

  it("sin argumento sigue saliendo la generica de siempre", async () => {
    const r = await analizarCronogramaExcel(await generarPlantillaCronograma());

    expect(r.tareas.some((t) => t.nombre.includes(OBRA_EJEMPLO))).toBe(true);
  });
});
