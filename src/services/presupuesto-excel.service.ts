import "server-only";
import ExcelJS from "exceljs";

import { nombreDeArchivo } from "@/lib/nombre-archivo";
import type { DatosPresupuesto } from "@/lib/presupuesto-pdf";
import type { SesionActiva } from "@/services/sesion.service";
import {
  datosDelPresupuesto,
  type DocumentoPresupuesto,
} from "@/services/presupuesto-documento.service";

/**
 * Los presupuestos en hoja de calculo.
 *
 * MISMAS cifras que el PDF, y no por disciplina sino por construccion: las dos
 * salen de `presupuesto-documento.service`. Lo unico que cambia es el envase.
 *
 * POR QUE HACE FALTA, si ya hay PDF. Un PDF se lee y se firma; un Excel se
 * TRABAJA —se filtra, se ordena, se cruza con la valorizacion del cliente, se
 * le añade una columna al lado—. Lo pidio el usuario el 10 de agosto de 2026 y
 * hasta hoy solo salian en Excel la propuesta comercial y el informe semanal
 * en CSV.
 *
 * LAS CIFRAS ENTRAN COMO NUMERO, no como texto. Es toda la diferencia entre
 * una hoja con la que se puede trabajar y una foto del PDF: una columna de
 * texto no se suma, y quien la recibe acaba retecleandola.
 */

export type ResultadoExcel =
  | { ok: true; bytes: Uint8Array; nombre: string }
  | { ok: false; estado: 403 | 404; error: string };

/// El verde de la marca, el mismo que la propuesta comercial en Excel.
const VERDE = "FF0D5C56";

const METRADO = "#,##0.0000";
/// El simbolo va DENTRO del formato: la celda sigue siendo un numero y suma,
/// pero se lee con su moneda.
const DINERO = '"S/" #,##0.00';

/// Excel quiere numeros, no cadenas: si entra "1,234.56" como texto ni suma ni
/// aplica el formato. Lo que no sea numero se deja en blanco.
function numero(valor: string | null | undefined): number | null {
  if (valor === null || valor === undefined) return null;
  const n = Number(valor);
  return Number.isFinite(n) ? n : null;
}

export async function generarPresupuestoExcel(
  sesion: SesionActiva,
  obraId: string,
  documento: DocumentoPresupuesto,
): Promise<ResultadoExcel> {
  const r = await datosDelPresupuesto(sesion, obraId, documento);
  if (!r.ok) return r;

  const { datos, nombreObra } = r;

  return {
    ok: true,
    bytes: new Uint8Array(await componer(datos, documento === "comparativa")),
    nombre: nombreDeArchivo({
      ambito: nombreObra,
      documento,
      fecha: new Date(),
      extension: "xlsx",
    }),
  };
}

async function componer(
  datos: DatosPresupuesto,
  conComparativa: boolean,
): Promise<ArrayBuffer> {
  const libro = new ExcelJS.Workbook();
  libro.creator = "GCM";

  const hoja = libro.addWorksheet("Presupuesto");
  hoja.columns = [
    { width: 14 },
    { width: 58 },
    { width: 8 },
    { width: 12 },
    { width: 14 },
    { width: 16 },
    ...(conComparativa ? [{ width: 16 }, { width: 16 }] : []),
  ];

  const titulo = (valor: string, tamano: number) => {
    const fila = hoja.addRow([valor]);
    fila.getCell(1).font = { bold: true, size: tamano };
  };

  titulo(datos.empresa.toUpperCase(), 14);
  if (datos.ruc) hoja.addRow(["RUC " + datos.ruc]);

  hoja.addRow([]);
  titulo(datos.titulo, 12);
  hoja.addRow([datos.subtitulo]);

  /**
   * El rotulo de interno, arriba del todo y en rojo.
   *
   * El PDF lo estampa en diagonal sobre cada pagina; una hoja de calculo no
   * tiene donde estamparlo, asi que va donde se lee primero. Sin esto, la meta
   * y la comparativa —que llevan el costo y el margen— saldrian de la empresa
   * con el mismo aspecto que el contractual, que si es para el cliente.
   */
  if (datos.soloInterno) {
    const fila = hoja.addRow(["DOCUMENTO INTERNO — no enviar al cliente"]);
    fila.getCell(1).font = { bold: true, size: 12, color: { argb: "FFB00020" } };
  }

  hoja.addRow([]);
  hoja.addRow(["Obra:", datos.obra]);
  if (datos.ubicacion) hoja.addRow(["Ubicación:", datos.ubicacion]);
  if (datos.programa) hoja.addRow(["Programa:", datos.programa]);
  if (datos.residente) {
    hoja.addRow([
      "Residente:",
      datos.residente.colegiatura
        ? `${datos.residente.nombre} · CIP ${datos.residente.colegiatura}`
        : datos.residente.nombre,
    ]);
  }

  hoja.addRow([]);

  const cabecera = hoja.addRow([
    "Ítem",
    "Descripción",
    "Und.",
    "Metrado",
    "P. Unit. S/",
    conComparativa ? "Contractual S/" : "Parcial S/",
    ...(conComparativa ? ["Meta S/", "Bolsa S/"] : []),
  ]);

  cabecera.eachCell((celda) => {
    celda.font = { bold: true, color: { argb: "FFFFFFFF" } };
    celda.fill = { type: "pattern", pattern: "solid", fgColor: { argb: VERDE } };
  });

  // La cabecera se queda a la vista al bajar por un presupuesto de cientos de
  // partidas: sin esto no se sabe que columna es cual.
  hoja.views = [{ state: "frozen", ySplit: cabecera.number }];

  for (const l of datos.lineas) {
    const contractual = numero(l.parcial);
    const meta = numero(l.parcialOtro);

    const fila = hoja.addRow([
      l.codigo ?? "",
      l.descripcion,
      l.unidad ?? "",
      numero(l.metrado),
      numero(l.precioUnitario),
      contractual,
      ...(conComparativa
        ? [
            meta,
            // La bolsa de la linea se calcula aqui y no se trae hecha: en una
            // hoja de calculo la resta de dos columnas tiene que cuadrar con
            // las columnas que se ven, y una linea sin las dos cifras no tiene
            // bolsa que ensenar —no tiene bolsa CERO, que es otra cosa—.
            contractual !== null && meta !== null ? contractual - meta : null,
          ]
        : []),
    ]);

    // Un capitulo se resalta, igual que en el papel.
    if (l.tipo === "CAPITULO") {
      fila.eachCell((celda) => {
        celda.font = { bold: true };
      });
    }

    fila.getCell(4).numFmt = METRADO;
    for (let c = 5; c <= (conComparativa ? 8 : 6); c++) fila.getCell(c).numFmt = DINERO;
  }

  hoja.addRow([]);

  const columnaTotal = conComparativa ? 8 : 6;
  for (const t of datos.totales) {
    const fila = hoja.addRow([]);
    fila.getCell(columnaTotal - 1).value = t.etiqueta;
    fila.getCell(columnaTotal).value = numero(t.importe);
    fila.getCell(columnaTotal).numFmt = DINERO;
    fila.getCell(columnaTotal - 1).font = { bold: t.destacado ?? false };
    fila.getCell(columnaTotal).font = { bold: t.destacado ?? false };
  }

  return libro.xlsx.writeBuffer() as Promise<ArrayBuffer>;
}
