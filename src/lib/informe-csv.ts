import type { CeldaCsv } from "./csv";
import {
  documentoDelInforme,
  nombreArchivoInforme,
  type DatosCsvInforme,
} from "./informe-documento";

/**
 * El informe al corte, aplanado a filas de hoja de calculo.
 *
 * QUE dice el informe lo decide `informe-documento`, que es tambien de donde
 * come el PDF. Aqui solo se convierte esa estructura en filas: titulo, fila de
 * cabecera y datos, con una linea en blanco entre bloques —que es lo que deja
 * seleccionar una tabla suelta en Excel con Ctrl+Mayus+flecha sin arrastrar la
 * de al lado—.
 */

// Se reexportan para no obligar a media aplicacion a cambiar de import cuando
// la estructura se mudo de aqui a `informe-documento`.
export { nombreArchivoInforme };
export {
  fechaCsv,
  type CurvaCsv,
  type DatosCsvInforme,
  type LastPlannerCsv,
  type PeriodoCsv,
} from "./informe-documento";

/// El nombre del archivo de hoja de calculo. La regla entera esta en
/// `nombreArchivoInforme`, compartida con el PDF.
export function nombreArchivoInformeCsv(obra: string, fechaCorte: Date): string {
  return nombreArchivoInforme(obra, fechaCorte, "csv");
}

/// Una fila nueva cada vez, no una constante compartida: la misma referencia
/// repetida por todo el documento es una mina para el primero que necesite
/// retocar una separacion.
const vacia = (): CeldaCsv[] => [];

export function filasDelInformeCsv(
  d: DatosCsvInforme,
  generadoEl: Date,
): CeldaCsv[][] {
  const filas: CeldaCsv[][] = [];

  for (const seccion of documentoDelInforme(d, generadoEl)) {
    // La portada abre el archivo: no lleva linea en blanco delante.
    if (filas.length > 0) filas.push(vacia());
    filas.push([seccion.titulo]);

    if (seccion.clase === "nota") {
      filas.push([seccion.texto]);
      continue;
    }

    if (seccion.clase === "datos") {
      if (seccion.cabecera) filas.push([...seccion.cabecera]);
      for (const [concepto, valor] of seccion.filas) filas.push([concepto, valor]);
      continue;
    }

    if (seccion.filas.length === 0) {
      filas.push([seccion.siNoHay]);
      continue;
    }

    filas.push([...seccion.cabeceras]);
    for (const fila of seccion.filas) filas.push([...fila]);
  }

  return filas;
}
