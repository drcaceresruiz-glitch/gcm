import "server-only";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { documentoDelInforme, fechaCsv } from "@/lib/informe-documento";
import type { DatosCsvInforme } from "@/lib/informe-documento";
import { A4_APAISADO, paginasDelInforme } from "@/lib/informe-pdf";
import { aWinAnsi } from "@/lib/pdf-texto";

/**
 * El informe de obra en PDF, generado en el servidor.
 *
 * Se dijo aqui mismo que un PDF de servidor era imposible en este hosting. Lo
 * imposible es CHROMIUM SIN VENTANA —binarios compilados, el mismo muro que
 * dejo fuera al motor nativo de Prisma—, no un PDF: `pdf-lib` es JavaScript
 * puro y escribe el archivo objeto a objeto. Y como el build de Next empaqueta
 * en modo `standalone`, la libreria viaja dentro del despliegue sin tener que
 * instalar nada en el servidor.
 *
 * Sale del MISMO `documentoDelInforme` que la hoja de calculo, asi que el PDF
 * adjunto y el CSV adjunto no pueden decir cosas distintas.
 *
 * Fuentes estandar (Helvetica) y no una empotrada: las catorce de serie no
 * pesan nada porque no se incrustan, y cubren el castellano entero. Lo que no
 * cubren lo sanea `aWinAnsi` antes de llegar aqui —si no, un emoji en el
 * nombre de una tarea LANZA y no hay informe—.
 */

const NEGRO = rgb(0.11, 0.15, 0.2);
const GRIS = rgb(0.42, 0.48, 0.51);
const RAYA = rgb(0.85, 0.89, 0.9);
const FONDO_CABECERA = rgb(0.93, 0.96, 0.96);
/// El mismo naranja #ea580c de la curva en pantalla, y el gris del plan.
const REAL = rgb(0.918, 0.345, 0.047);
const PLAN = rgb(0.45, 0.5, 0.54);

export async function generarInformePdf(
  d: DatosCsvInforme,
  generadoEl: Date,
): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(`Informe de obra - ${aWinAnsi(d.obra)}`);
  pdf.setCreator("GCM");

  const normal = await pdf.embedFont(StandardFonts.Helvetica);
  const negrita = await pdf.embedFont(StandardFonts.HelveticaBold);

  const medir = (texto: string, tamano: number) =>
    normal.widthOfTextAtSize(aWinAnsi(texto), tamano);

  const secciones = documentoDelInforme(d, generadoEl);
  const paginas = paginasDelInforme(
    secciones,
    `Informe de obra — ${d.obra}`,
    `${d.empresa}${d.ubicacion ? ` · ${d.ubicacion}` : ""} · Corte del ${fechaCsv(d.fechaCorte)}`,
    A4_APAISADO,
    medir,
  );

  const o = A4_APAISADO;

  paginas.forEach((pagina, indice) => {
    const hoja = pdf.addPage([o.ancho, o.alto]);

    for (const e of pagina.elementos) {
      if (e.tipo === "fondo") {
        hoja.drawRectangle({
          x: e.x,
          y: e.y,
          width: e.ancho,
          height: e.alto,
          color: FONDO_CABECERA,
        });
        continue;
      }

      if (e.tipo === "linea") {
        hoja.drawLine({
          start: { x: e.x1, y: e.y1 },
          end: { x: e.x2, y: e.y2 },
          thickness: 0.5,
          color: RAYA,
        });
        continue;
      }

      if (e.tipo === "trazo") {
        // El real en naranja y mas grueso: es el mismo naranja de alto
        // contraste que usa la curva en pantalla, para que el papel y la
        // aplicacion no parezcan dos sistemas distintos.
        hoja.drawLine({
          start: { x: e.x1, y: e.y1 },
          end: { x: e.x2, y: e.y2 },
          thickness: e.papel === "real" ? 1.6 : 0.9,
          color: e.papel === "real" ? REAL : PLAN,
        });
        continue;
      }

      hoja.drawText(e.texto, {
        x: e.x,
        y: e.y,
        size: e.tam,
        font: e.negrita ? negrita : normal,
        color: e.gris ? GRIS : NEGRO,
      });
    }

    // El pie va aqui y no en el lienzo porque necesita saber cuantas paginas
    // hay EN TOTAL, y eso no se sabe hasta haberlas repartido todas.
    const pie = `${aWinAnsi(d.obra)} · Corte ${fechaCsv(d.fechaCorte)} · Generado por ${aWinAnsi(d.generadoPor)} · Página ${indice + 1} de ${paginas.length}`;
    hoja.drawText(aWinAnsi(pie), {
      x: o.margen,
      y: o.margen,
      size: 7,
      font: normal,
      color: GRIS,
    });
  });

  return pdf.save();
}
