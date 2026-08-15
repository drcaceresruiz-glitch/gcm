import ExcelJS from "exceljs";

import { HOJA_CRONOGRAMA } from "@/lib/excel-cronograma";

/**
 * La plantilla del CRONOGRAMA, generada desde codigo.
 *
 * Mismo trato que las otras dos: no es un archivo suelto en `public/`, se
 * construye aqui con las convenciones que sabe leer `analizarCronogramaExcel`,
 * y un test de ida y vuelta impide que plantilla e importador diverjan. Una
 * plantilla que el propio sistema no puede importar es peor que ninguna.
 *
 * Los ejemplos ensenan las cuatro cosas que se preguntan al abrirla: que la
 * jerarquia la manda el NIVEL y no el codigo, que el ID no se renumera nunca
 * —el avance de obra se guarda contra el—, que la duracion se escribe y no se
 * deduce de las fechas, y que un hito es sencillamente una fila de cero dias.
 *
 * Las cifras de los ejemplos cuadran entre si: los porcentajes de los
 * capitulos son la ponderacion real por duracion de sus partidas, y el de la
 * obra la de las cinco hojas. El test lo fija, para que nadie los toque a ojo
 * y deje la plantilla ensenando una aritmetica que no se sostiene.
 */

const FILA_CABECERA = 6;

const CABECERAS = [
  "N°",
  "ID",
  "Nivel",
  "Código",
  "Actividad",
  "Inicio",
  "Fin",
  "Días",
  "% Planeado",
  "% Avance",
  "Depende de",
] as const;

export interface FilaCronogramaEjemplo {
  n: number;
  id: number;
  nivel: number;
  codigo: string;
  actividad: string;
  inicio: string;
  fin: string;
  dias: number;
  planeado: number;
  avance: number;
  depende: string;
}

/** La obra del ejemplo y su corte. El test los fija. */
export const OBRA_EJEMPLO = "Edificio multifamiliar Los Robles";
export const FECHA_CORTE_EJEMPLO = "2026-08-14";
export const MINUTOS_POR_DIA_EJEMPLO = 480;

/**
 * Las ocho filas de ejemplo.
 *
 * Cuadran a proposito: los capitulos 1.0 y 2.0 duran 10 y 60 dias, que suman
 * los 70 de la obra, y son contiguos. El planeado del capitulo 2.0 es la
 * ponderacion por duracion de sus tres partidas —(30x100 + 30x50 + 0x0) / 60
 * = 75— y el de la obra, la de sus cinco hojas: 5500/70 = 78.57.
 *
 * La fila 8 es el hito: cero dias y la misma fecha de inicio y de fin. No
 * lleva ninguna marca, porque el hito se deriva de la duracion.
 */
export const FILAS_EJEMPLO: readonly FilaCronogramaEjemplo[] = [
  { n: 1, id: 1, nivel: 1, codigo: "", actividad: OBRA_EJEMPLO,
    inicio: "2026-06-01", fin: "2026-09-04", dias: 70, planeado: 78.57, avance: 72.14, depende: "" },
  { n: 2, id: 2, nivel: 2, codigo: "1.0", actividad: "OBRAS PROVISIONALES Y TRABAJOS PRELIMINARES",
    inicio: "2026-06-01", fin: "2026-06-12", dias: 10, planeado: 100, avance: 100, depende: "" },
  { n: 3, id: 3, nivel: 3, codigo: "1.1", actividad: "Cartel de identificación de obra 3.60 × 2.40 m",
    inicio: "2026-06-01", fin: "2026-06-02", dias: 2, planeado: 100, avance: 100, depende: "" },
  { n: 4, id: 4, nivel: 3, codigo: "1.2", actividad: "Cerco provisional de obra con paneles metálicos",
    inicio: "2026-06-03", fin: "2026-06-12", dias: 8, planeado: 100, avance: 100, depende: "3" },
  { n: 5, id: 5, nivel: 2, codigo: "2.0", actividad: "ESTRUCTURAS",
    inicio: "2026-06-15", fin: "2026-09-04", dias: 60, planeado: 75, avance: 67.5, depende: "" },
  { n: 6, id: 6, nivel: 3, codigo: "2.1", actividad: "Concreto premezclado f'c = 210 kg/cm² en columnas",
    inicio: "2026-06-15", fin: "2026-07-24", dias: 30, planeado: 100, avance: 100, depende: "4" },
  { n: 7, id: 7, nivel: 3, codigo: "2.2", actividad: "Acero de refuerzo fy = 4200 kg/cm², habilitado y colocado",
    inicio: "2026-07-27", fin: "2026-09-04", dias: 30, planeado: 50, avance: 35, depende: "6FC" },
  { n: 8, id: 8, nivel: 3, codigo: "2.3", actividad: "Losa del último techo vaciada",
    inicio: "2026-09-04", fin: "2026-09-04", dias: 0, planeado: 0, avance: 0, depende: "7" },
] as const;

const INSTRUCCIONES: readonly (readonly [string, string])[] = [
  ["Cómo llenar esta plantilla", ""],
  ["", ""],
  [
    "1. Fecha de corte",
    "Escríbela arriba, al lado de «Fecha de corte:», como AAAA-MM-DD. Es la fecha a la que están referidos los avances, y lo único que el sistema no puede importar sin ella.",
  ],
  [
    "2. Nivel: quién cuelga de quién",
    "Es la columna que manda. Nivel 1 es la obra entera y va en la PRIMERA fila, una sola vez. Nivel 2 son los capítulos. Nivel 3 en adelante, las partidas. El nivel no puede saltar de 1 a 3.",
  ],
  [
    "3. El código NO agrupa",
    "El código es solo una etiqueta que se imprime. En un cronograma real «7.3.1» es hermana de «7.3», no su hija. Si quieres que una partida cuelgue de un capítulo, lo que cambias es el Nivel.",
  ],
  [
    "4. ID: no lo cambies nunca",
    "Es el número con el que el sistema reconoce cada actividad semana tras semana. El avance que se reporta desde obra se guarda contra él. Si insertas una actividad nueva, dale un ID nuevo; si renumeras los viejos, el avance ya reportado salta a otra partida. El N° sí puedes rehacerlo: solo ordena.",
  ],
  [
    "5. Días: se escriben, no se restan",
    "Escribe la duración en días de trabajo. El sistema no la calcula restando las fechas: una partida de un día puede abarcar tres días naturales por el calendario. Admite decimales (8.8).",
  ],
  [
    "6. Hitos",
    "Un hito es una fila con Días = 0 y la misma fecha de inicio y de fin. No hay que marcarlo de ninguna otra manera. Mira la fila 2.3 del ejemplo.",
  ],
  [
    "7. % Planeado",
    "Es dónde debería ir la actividad a la fecha de corte, según el plan. Los CAPÍTULOS también lo llevan: el sistema lee el del capítulo tal cual, para que las cifras coincidan con el informe que ya entregas. Si lo dejas vacío, se calcula repartiendo la duración entre el inicio y el fin, y te avisa.",
  ],
  [
    "8. % Avance",
    "Lo que llevas ejecutado. Solo siembra la PRIMERA importación: a partir de ahí manda el avance que se reporte dentro de GCM, y este archivo deja de mandar sobre él.",
  ],
  [
    "9. Depende de",
    "Opcional. Escribe el ID de la actividad anterior: «6». Puedes precisar tipo y desfase —«6FC+2»— y separar varias con punto y coma.",
  ],
  [
    "10. Ruta crítica y holgura",
    "Este archivo no las trae, y el sistema no se las inventa: las actividades entran sin ruta crítica y con la holgura marcada como NO INFORMADA. Si necesitas ruta crítica, importa el XML de MS Project.",
  ],
  [
    "11. Filas ocultas",
    "Una fila oculta en Excel NO se importa: es la forma habitual de dejar una actividad fuera de alcance sin borrarla. El sistema te dirá cuántas dejó fuera.",
  ],
  [
    "12. Puedes renombrar las columnas",
    "El sistema reconoce los títulos habituales: N°/Ítem, ID/UID, Nivel/Esquema, Código/WBS, Actividad/Descripción/Partida, Inicio/Comienzo, Fin/Término, Días/Duración, % Planeado/% Programado, % Avance/% Real. También puedes añadir filas de título encima de la tabla.",
  ],
];

const VERDE = "FF0D5C56";
const VERDE_SUAVE = "FFE8F0EF";

function pintarCabecera(fila: ExcelJS.Row, titulos: readonly string[]) {
  titulos.forEach((titulo, i) => {
    const celda = fila.getCell(i + 1);
    celda.value = titulo;
    celda.font = { bold: true, color: { argb: "FFFFFFFF" } };
    celda.fill = { type: "pattern", pattern: "solid", fgColor: { argb: VERDE } };
    // Las cinco primeras a la izquierda: son identificacion, no cifras.
    celda.alignment = { horizontal: i < 5 ? "left" : "center" };
  });
}

export async function generarPlantillaCronograma(): Promise<ArrayBuffer> {
  const libro = new ExcelJS.Workbook();
  libro.creator = "GCM";

  // PRIMERA, siempre: el lector toma `worksheets[0]`.
  const hoja = libro.addWorksheet(HOJA_CRONOGRAMA);
  hoja.columns = [
    { width: 8 }, { width: 8 }, { width: 7 }, { width: 12 }, { width: 52 },
    { width: 13 }, { width: 13 }, { width: 9 }, { width: 13 }, { width: 12 },
    { width: 16 },
  ];

  hoja.getCell("A1").value = "CRONOGRAMA DE OBRA";
  hoja.getCell("A1").font = { bold: true, size: 14 };
  hoja.getCell("A2").value =
    "El plan contra el que se mide el avance. Una fila por actividad, y el Nivel dice qué cuelga de qué.";
  hoja.getCell("A2").font = { italic: true, color: { argb: "FF667788" } };

  // El preambulo va en celdas etiquetadas, no en columnas: son datos del
  // documento entero y repetirlos en cada fila invitaria a contradecirlos.
  hoja.getCell("A3").value = "Obra:";
  hoja.getCell("A3").font = { bold: true };
  hoja.getCell("B3").value = OBRA_EJEMPLO;
  hoja.getCell("A4").value = "Fecha de corte:";
  hoja.getCell("A4").font = { bold: true };
  hoja.getCell("B4").value = FECHA_CORTE_EJEMPLO;
  hoja.getCell("A5").value = "Minutos por día:";
  hoja.getCell("A5").font = { bold: true };
  hoja.getCell("B5").value = MINUTOS_POR_DIA_EJEMPLO;

  pintarCabecera(hoja.getRow(FILA_CABECERA), CABECERAS);

  FILAS_EJEMPLO.forEach((f, i) => {
    const fila = hoja.getRow(FILA_CABECERA + 1 + i);
    fila.getCell(1).value = f.n;
    fila.getCell(2).value = f.id;
    fila.getCell(3).value = f.nivel;
    fila.getCell(4).value = f.codigo;
    fila.getCell(5).value = f.actividad;
    fila.getCell(6).value = f.inicio;
    fila.getCell(7).value = f.fin;
    fila.getCell(8).value = f.dias;
    fila.getCell(9).value = f.planeado;
    fila.getCell(10).value = f.avance;
    fila.getCell(11).value = f.depende;

    fila.getCell(8).numFmt = "#,##0.00";
    fila.getCell(9).numFmt = "#,##0.00";
    fila.getCell(10).numFmt = "#,##0.00";

    // La obra y los capitulos se sombrean. Aqui manda el NIVEL y no el
    // codigo, que es justo la leccion que la plantilla quiere ensenar.
    if (f.nivel <= 2) {
      for (let c = 1; c <= CABECERAS.length; c++) {
        fila.getCell(c).font = { bold: true };
        fila.getCell(c).fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: VERDE_SUAVE },
        };
      }
    }
  });

  const instrucciones = libro.addWorksheet("Instrucciones");
  instrucciones.columns = [{ width: 30 }, { width: 100 }];

  INSTRUCCIONES.forEach(([titulo, cuerpo], i) => {
    const fila = instrucciones.getRow(i + 1);
    fila.getCell(1).value = titulo;
    fila.getCell(1).font = { bold: true };
    fila.getCell(2).value = cuerpo;
    fila.getCell(2).alignment = { wrapText: true, vertical: "top" };
  });
  instrucciones.getRow(1).font = { bold: true, size: 13 };

  const salida = await libro.xlsx.writeBuffer();
  return new Uint8Array(salida as unknown as Uint8Array).buffer as ArrayBuffer;
}
