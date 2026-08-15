import { describe, expect, it } from "vitest";

import { analizarCronogramaExcel } from "@/lib/excel-cronograma";
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
