import "server-only";
import {
  LineCapStyle,
  PDFDocument,
  StandardFonts,
  rgb,
  type PDFFont,
  type PDFImage,
  type PDFPage,
} from "pdf-lib";

import type { ElementoPdf, OpcionesPdf, PaginaPdf, TintaPdf } from "@/lib/informe-pdf";
import { aWinAnsi } from "@/lib/pdf-texto";
import { encajarEnCaja } from "@/lib/imagen";

/**
 * El pintor: convierte paginas de elementos en un PDF de verdad.
 *
 * Vive aparte desde que hay mas de un documento que pintar -el informe al
 * corte, y los presupuestos-. Antes era el cuerpo de `generarInformePdf`, y
 * copiarlo para el segundo documento habria dejado dos paletas y dos formas
 * de dibujar un anillo: la primera vez que alguien corrigiera un color,
 * corregiria solo una mitad del sistema.
 *
 * La division es la de siempre: la maquetacion (pura, probada, en `lib/`)
 * decide QUE cae y DONDE, sin nombrar un color; aqui se decide COMO se ve.
 *
 * `pdf-lib` y no Chromium sin ventana, que es lo que este hosting no puede
 * correr: es JavaScript puro y escribe el archivo objeto a objeto.
 */

const NEGRO = rgb(0.11, 0.15, 0.2);
const GRIS = rgb(0.42, 0.48, 0.51);
const RAYA = rgb(0.85, 0.89, 0.9);
const FONDO_CABECERA = rgb(0.93, 0.96, 0.96);
/// El mismo naranja #ea580c de la curva en pantalla, y el gris del plan.
const REAL = rgb(0.918, 0.345, 0.047);
const PLAN = rgb(0.45, 0.5, 0.54);

/**
 * Las tintas por su papel, que es lo unico que la maquetacion sabe nombrar.
 *
 * Este es el UNICO sitio del sistema donde un papel se convierte en un color.
 * Los valores estan elegidos para PAPEL BLANCO, con los contrastes que se
 * midieron al disenar las hojas: el gris del plan a 3.25:1, el rojo de
 * critico a 5.92:1, y el ambar de severidad media en su version oscura de
 * 5.35:1, porque el amarillo puro a 7 puntos no se lee impreso.
 */
export const TINTAS: Record<TintaPdf, ReturnType<typeof rgb>> = {
  tinta: NEGRO,
  "tinta-suave": GRIS,
  linea: RAYA,
  marca: REAL,
  plan: PLAN,
  exito: rgb(0.122, 0.518, 0.251),
  alerta: rgb(0.561, 0.384, 0.063),
  peligro: rgb(0.698, 0.231, 0.157),
};

/// Cuantos tramos rectos aproximan una vuelta entera del anillo. Con 96 el
/// borde ya no se ve poligonal ni a la maxima ampliacion de un visor.
const TRAMOS_POR_VUELTA = 96;

export interface Fuentes {
  normal: PDFFont;
  negrita: PDFFont;
}

/**
 * Las catorce fuentes estandar del PDF: no se incrustan, asi que no pesan, y
 * cubren el castellano entero. Lo que no cubren lo sanea `aWinAnsi` antes de
 * llegar aqui —si no, un emoji en el nombre de una tarea LANZA y no hay
 * documento—.
 */
export async function cargarFuentes(pdf: PDFDocument): Promise<Fuentes> {
  const [normal, negrita] = await Promise.all([
    pdf.embedFont(StandardFonts.Helvetica),
    pdf.embedFont(StandardFonts.HelveticaBold),
  ]);
  return { normal, negrita };
}

/** Medir texto con la fuente real, que es lo que la maquetacion necesita. */
export function medidorCon(fuentes: Fuentes) {
  return (texto: string, tamano: number) =>
    fuentes.normal.widthOfTextAtSize(aWinAnsi(texto), tamano);
}

/** Pinta los elementos de UNA pagina sobre la hoja ya creada. */
export function pintarElementos(
  hoja: PDFPage,
  elementos: readonly ElementoPdf[],
  fuentes: Fuentes,
  imagenes: ReadonlyMap<string, PDFImage> = new Map(),
): void {
  for (const e of elementos) {
    if (e.tipo === "fondo") {
      hoja.drawRectangle({
        x: e.x,
        y: e.y,
        width: e.ancho,
        height: e.alto,
        color: e.tinta ? TINTAS[e.tinta] : FONDO_CABECERA,
      });
      continue;
    }

    if (e.tipo === "linea") {
      hoja.drawLine({
        start: { x: e.x1, y: e.y1 },
        end: { x: e.x2, y: e.y2 },
        thickness: e.grosor ?? 0.5,
        color: e.tinta ? TINTAS[e.tinta] : RAYA,
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

    if (e.tipo === "arco") {
      /**
       * El anillo se dibuja como tramos rectos gruesos, no con una curva de
       * Bezier.
       *
       * `pdf-lib` sabe dibujar circulos enteros, pero no un TRAMO de anillo,
       * que es justo lo que hace falta para pintar «el 11 % de la vuelta».
       * Aproximarlo con segmentos de punta redonda da un borde limpio, no
       * depende de que el visor interprete bien un `path` y se prueba
       * contando elementos en vez de mirando un PDF.
       *
       * Los angulos llegan en grados horarios desde las 12 —como se lee un
       * porcentaje— y aqui se convierten al convenio de la trigonometria.
       */
      const arco = Math.abs(e.hasta - e.desde);
      const tramos = Math.max(2, Math.ceil((arco / 360) * TRAMOS_POR_VUELTA));
      const punto = (grados: number) => {
        const rad = ((90 - grados) * Math.PI) / 180;
        return {
          x: e.cx + e.radio * Math.cos(rad),
          y: e.cy + e.radio * Math.sin(rad),
        };
      };
      for (let i = 0; i < tramos; i += 1) {
        const a = e.desde + ((e.hasta - e.desde) * i) / tramos;
        const b = e.desde + ((e.hasta - e.desde) * (i + 1)) / tramos;
        hoja.drawLine({
          start: punto(a),
          end: punto(b),
          thickness: e.grosor,
          color: TINTAS[e.tinta],
          lineCap: LineCapStyle.Round,
        });
      }
      continue;
    }

    if (e.tipo === "imagen") {
      // Una foto que no se pudo incrustar no deja hueco ni rompe el
      // documento: simplemente no se dibuja. Mismo criterio que el logo.
      const img = imagenes.get(e.clave);
      if (img) {
        /**
         * La maquetacion da la CAJA; la proporcion la pone aqui.
         *
         * Solo este modulo sabe cuantos pixeles mide la imagen de verdad. Una
         * foto de obra estirada para llenar su celda es una foto que miente
         * sobre lo que se ve en ella.
         */
        const medida = encajarEnCaja(img.width, img.height, e.ancho, e.alto);
        hoja.drawImage(img, {
          x: e.x + (e.ancho - medida.ancho) / 2,
          y: e.y + (e.alto - medida.alto) / 2,
          width: medida.ancho,
          height: medida.alto,
        });
      }
      continue;
    }

    hoja.drawText(e.texto, {
      x: e.x,
      y: e.y,
      size: e.tam,
      font: e.negrita ? fuentes.negrita : fuentes.normal,
      color: e.tinta ? TINTAS[e.tinta] : e.gris ? GRIS : NEGRO,
    });
  }
}

/**
 * Pinta un documento entero, con su pie en cada pagina.
 *
 * El pie se escribe AQUI y no en la maquetacion porque necesita saber cuantas
 * paginas hay EN TOTAL, y eso no se sabe hasta haberlas repartido todas.
 */
export function pintarDocumento(
  pdf: PDFDocument,
  paginas: readonly PaginaPdf[],
  o: OpcionesPdf,
  fuentes: Fuentes,
  pie: (indice: number, total: number) => string,
  opciones: {
    imagenes?: ReadonlyMap<string, PDFImage>;
    /// Se dibuja solo en la primera pagina: repetirlo en las ocho de un
    /// documento largo lo convierte en papel pintado.
    marcaPrimeraPagina?: (hoja: PDFPage) => void;
  } = {},
): void {
  paginas.forEach((pagina, indice) => {
    const hoja = pdf.addPage([o.ancho, o.alto]);

    if (indice === 0 && opciones.marcaPrimeraPagina) {
      opciones.marcaPrimeraPagina(hoja);
    }

    pintarElementos(hoja, pagina.elementos, fuentes, opciones.imagenes);

    hoja.drawText(aWinAnsi(pie(indice, paginas.length)), {
      x: o.margen,
      y: o.margen,
      size: 7,
      font: fuentes.normal,
      color: GRIS,
    });
  });
}
