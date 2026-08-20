import { describe, expect, it } from "vitest";
import { analizarProjectXml } from "@/lib/msproject-xml";
import { edtDesdePresupuesto } from "@/lib/edt-desde-presupuesto";
import {
  diasADuracionIso,
  generarProjectXml,
} from "@/lib/msproject-xml-escribir";

/**
 * IDA Y VUELTA: lo que GCM escribe, GCM lo tiene que poder leer.
 *
 * Es el mismo contrato que protege a la plantilla de Excel contra su
 * importador, y aqui importa mas: el archivo sale de GCM, pasa por
 * ProjectLibre y vuelve. Si el escritor y el lector se separan, el sintoma no
 * es un error sino un cronograma que entra a medias.
 */

/// Codigos CON punto, como los presupuestos reales: el lector exige al menos
/// uno para separar el codigo del nombre. Ver `nombreConCodigo`.
const PRESUPUESTO = [
  { id: "a", codigoPartida: "1.0", descripcion: "ESTRUCTURAS", parentId: null, orden: 0, parcial: null },
  { id: "b", codigoPartida: "1.1", descripcion: "Zapatas", parentId: "a", orden: 1, parcial: "1000.00" },
  { id: "c", codigoPartida: "1.2", descripcion: "Columnas & vigas", parentId: "a", orden: 2, parcial: "2000.00" },
  { id: "d", codigoPartida: "2.0", descripcion: "INSTALACIONES", parentId: null, orden: 3, parcial: "5000.00" },
  { id: "e", codigoPartida: "2.1", descripcion: "Incluye tableros", parentId: "d", orden: 4, parcial: null },
];

/**
 * El lector recibe BYTES, no texto: es lo que llega de una subida. Se codifica
 * aqui para que el viaje de ida y vuelta sea el de verdad y no uno mas comodo.
 */
function leer() {
  return analizarProjectXml(
    new TextEncoder().encode(xml()).buffer as ArrayBuffer,
  );
}

function xml() {
  return generarProjectXml({
    nombreObra: "OBRA DE PRUEBA",
    fechaCorte: "2026-08-20",
    inicioObra: "2026-09-01",
    finObra: "2026-11-28",
    diasPlazo: 64,
    minutosPorDia: 480,
    filas: edtDesdePresupuesto(PRESUPUESTO),
  });
}

describe("generarProjectXml", async () => {
  it("el lector de GCM lo lee sin una sola incidencia", async () => {
    const r = await leer();

    expect(r.errores).toEqual([]);
    expect(r.tareas.length).toBeGreaterThan(0);
  });

  it("recupera la fecha de corte, que es lo que identifica la version", async () => {
    expect((await leer()).fechaCorte).toBe("2026-08-20");
  });

  /**
   * La fila del proyecto se descarta por su nivel: no es una partida de obra.
   * Lo que baja son las cinco filas de la EDT menos el alcance sin cifra.
   */
  it("la fila del proyecto no entra como tarea", async () => {
    const r = await leer();

    expect(r.tareas.some((t) => t.nombre.includes("OBRA DE PRUEBA"))).toBe(false);
  });

  it("el codigo vuelve separado del nombre, no pegado", async () => {
    const r = await leer();

    const zapatas = r.tareas.find((t) => t.codigo === "1.1");
    expect(zapatas?.nombre).toBe("Zapatas");
  });

  /**
   * EL NIVEL, que es donde se cruzan las dos convenciones. Aqui el proyecto es
   * el 0 y los capitulos el 1; en la plantilla de Excel el 1 es la obra y los
   * capitulos bajan al 2. Desplazar de mas mete todo dentro del primer
   * capitulo.
   */
  it("los capitulos vuelven en el nivel 1, sin desplazar", async () => {
    const r = await leer();

    expect(r.tareas.find((t) => t.codigo === "1.0")?.nivel).toBe(1);
    expect(r.tareas.find((t) => t.codigo === "1.1")?.nivel).toBe(2);
  });

  /**
   * El `&` de «Columnas & vigas» viene del presupuesto, que escribe una
   * persona. Sin escapar, el XML no abre en ningun sitio.
   */
  it("un ampersand en el nombre no rompe el archivo", async () => {
    const r = await leer();

    expect(r.errores).toEqual([]);
    expect(r.tareas.find((t) => t.codigo === "1.2")?.nombre).toBe("Columnas & vigas");
  });

  it("ninguna tarea vuelve como hito", async () => {
    expect((await leer()).tareas.some((t) => t.esHito)).toBe(false);
  });

  /**
   * El capitulo a suma alzada lleva el dinero, asi que es hoja y baja; su
   * subpartida de alcance describe el precio y no baja. Es la regla de
   * `edt-desde-presupuesto`, y aqui se comprueba que sobrevive al viaje.
   */
  it("respeta quien es hoja segun el dinero", async () => {
    const r = await leer();

    expect(r.tareas.some((t) => t.codigo === "2.0")).toBe(true);
    expect(r.tareas.some((t) => t.codigo === "2.1")).toBe(false);
  });
});

/**
 * La duracion es la unica cuenta del archivo, y va por la JORNADA.
 *
 * Si el escritor y el lector no usaran la misma, el plazo cambiaria solo al
 * ir y volver, que es el tipo de error que nadie mira porque el archivo abre
 * igual de bien.
 */
describe("diasADuracionIso", async () => {
  it("convierte por la jornada, no por 24 horas", async () => {
    expect(diasADuracionIso(1, 480)).toBe("PT8H0M0S");
    expect(diasADuracionIso(64, 480)).toBe("PT512H0M0S");
  });

  it("aguanta jornadas que no son de ocho horas", async () => {
    // El sabado de CRIOCORD son cinco horas.
    expect(diasADuracionIso(2, 300)).toBe("PT10H0M0S");
  });

  it("y duraciones con decimales, que las hay", async () => {
    expect(diasADuracionIso(8.8, 480)).toBe("PT70H24M0S");
  });

  it("la duracion del plazo sobrevive al viaje de ida y vuelta", async () => {
    const r = await leer();
    // Todas salen con el plazo entero como marcador.
    for (const t of r.tareas) {
      expect(t.duracionDias).toBe("64.00");
    }
  });
});
