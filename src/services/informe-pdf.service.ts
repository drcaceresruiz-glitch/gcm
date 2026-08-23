import "server-only";
import { LineCapStyle, PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { documentoDelInforme, fechaCsv } from "@/lib/informe-documento";
import type { DatosCsvInforme } from "@/lib/informe-documento";
import { hojaDashboard } from "@/lib/informe-hoja-dashboard";
import { hojasBitacora, type DatosBitacora } from "@/lib/informe-hoja-bitacora";
import { hojaCronograma } from "@/lib/informe-hoja-cronograma";
import { A4_APAISADO, paginasDelInforme, type TintaPdf } from "@/lib/informe-pdf";
import { aWinAnsi } from "@/lib/pdf-texto";
import { encajarEnCaja } from "@/lib/imagen";

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

/**
 * Las tintas por su papel, que es lo unico que la maquetacion sabe nombrar.
 *
 * Este es el unico sitio del informe donde un papel se convierte en un color.
 * Los valores no son los de pantalla sin mas: estan elegidos para PAPEL
 * BLANCO, con los contrastes que se midieron al disenar las hojas —el gris
 * del plan a 3.25:1, el rojo de critico a 5.92:1, y el ambar de severidad
 * media en su version oscura de 5.35:1, porque el amarillo puro a 7 puntos no
 * se lee impreso—.
 */
const TINTAS: Record<TintaPdf, ReturnType<typeof rgb>> = {
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

/// La caja donde cabe el logo, arriba a la derecha de la primera pagina.
/// Apaisada porque casi todos los logos de constructora lo son.
const CAJA_LOGO = { ancho: 110, alto: 30 };

export async function generarInformePdf(
  d: DatosCsvInforme,
  generadoEl: Date,
  /// El logo de la empresa, si lo tiene. Opcional a proposito: un informe sin
  /// logo es un informe; uno que revienta por no encontrarlo, no.
  logo?: { contenido: Buffer; mime: string } | null,
  /**
   * La bitacora fotografica, si quien llama la quiere y ha podido cargar las
   * fotos.
   *
   * Los dos datos viajan JUNTOS a proposito: las fotos por partida deciden que
   * se dibuja y los bytes son lo que se dibuja. Poder pasar uno sin el otro
   * seria poder pedir una bitacora que sale con seis marcos vacios.
   *
   * Opcional porque el informe tiene que salir igual sin ella: el envio por
   * correo, por ejemplo, no arrastra las fotos.
   */
  bitacora?: {
    fotosPorUid: DatosBitacora["fotosPorUid"];
    bytes: ReadonlyMap<string, { contenido: Buffer; mime: string }>;
  },
): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(`Informe de obra - ${aWinAnsi(d.obra)}`);
  pdf.setCreator("GCM");

  const normal = await pdf.embedFont(StandardFonts.Helvetica);
  const negrita = await pdf.embedFont(StandardFonts.HelveticaBold);

  const medir = (texto: string, tamano: number) =>
    normal.widthOfTextAtSize(aWinAnsi(texto), tamano);

  const secciones = documentoDelInforme(d, generadoEl);
  /**
   * La hoja de resumen va DELANTE de las tablas, no en lugar de ellas.
   *
   * Quien abre el informe quiere saber en dos segundos como va la obra; quien
   * lo audita quiere la cifra exacta. Las dos cosas salen del mismo
   * `DatosCsvInforme`, asi que no pueden contradecirse: la primera pagina es
   * la lectura rapida de lo que las siguientes detallan.
   */
  /**
   * La bitacora va al FINAL, despues de las tablas.
   *
   * Es el anexo: quien audita el informe quiere primero las cifras, y quien
   * solo quiere ver la obra va derecho a las fotos. Ponerla en medio parte la
   * lectura de las dos maneras a la vez.
   */
  const hojasDeLaBitacora = hojasBitacora(
    {
      obra: d.obra,
      empresa: d.empresa,
      fechaCorte: d.fechaCorte,
      activas: d.activas,
      fotosPorUid: bitacora?.fotosPorUid ?? {},
    },
    A4_APAISADO,
    medir,
  );

  /**
   * El cronograma va DESPUES del resumen y ANTES de las tablas: el resumen
   * dice como va la obra, el Gantt dice cuando pasa cada cosa, y las tablas
   * dan el detalle de las dos. Sin `tareas` -el informe se compone igual sin
   * ellas- simplemente no hay hoja.
   */
  const cronograma = d.tareas
    ? hojaCronograma(
        {
          obra: d.obra,
          empresa: d.empresa,
          fechaCorte: d.fechaCorte,
          tareas: d.tareas,
        },
        A4_APAISADO,
        medir,
      )
    : [];

  const paginas = [
    hojaDashboard(d, A4_APAISADO, medir),
    ...cronograma,
    ...paginasDelInforme(
      secciones,
      `Informe de obra — ${d.obra}`,
      `${d.empresa}${d.ubicacion ? ` · ${d.ubicacion}` : ""} · Corte del ${fechaCsv(d.fechaCorte)}`,
      A4_APAISADO,
      medir,
    ),
    ...hojasDeLaBitacora,
  ];

  const o = A4_APAISADO;

  /// El logo cae en la PRIMERA pagina, que desde la hoja de resumen ya no es
  /// la de las tablas: el hueco hay que medirlo contra el titulo de ESA hoja
  /// —el nombre de la obra a 18 puntos—, no contra el de las tablas. Medirlo
  /// contra el que no es deja el logo encima del nombre de la obra.
  const tituloPrimeraPagina = d.obra;

  /**
   * Cuanto sitio queda a la derecha del titulo.
   *
   * El titulo NO se recorta —es el dato— y un logo encima del titulo se lee
   * como documento roto. Asi que manda el hueco: el logo se encoge hasta lo
   * que sobre, y solo desaparece si no queda ni eso.
   *
   * La primera version de esto era un si/no —si el titulo pasaba de cierto
   * punto, no habia logo— y en la obra real de pruebas el logo no salia
   * NUNCA: «Informe de obra — LABORATORIO INSTITUTO DE CRIOPRESERVACION Y
   * TERAPIA CELULAR» ocupa unos 720 de los 842 puntos de ancho. Los nombres
   * de obra largos son la norma, no la excepcion.
   */
  const finDelTitulo =
    o.margen + negrita.widthOfTextAtSize(aWinAnsi(tituloPrimeraPagina), 18);
  const huecoDerecha = o.ancho - o.margen - finDelTitulo - 12;

  /// Por debajo de esto el logo es una mancha que no se reconoce: mejor nada.
  const ANCHO_MINIMO_LOGO = 34;

  /**
   * El logo, ya incrustado y con la medida a la que hay que dibujarlo.
   *
   * `encajarEnCaja` escala por el lado que toca antes el borde, asi que un
   * logo cuadrado y uno panoramico caben los dos SIN deformarse: la caja es
   * el limite, no la forma final. Dibujarlo con el ancho y el alto de la caja
   * lo estiraria, y este documento va al cliente.
   *
   * Se incrusta DESPUES de saber que cabe: incrustar y no dibujar deja la
   * imagen dentro del archivo engordandolo para nada.
   *
   * Se cae con null ante cualquier problema —formato que pdf-lib no traga,
   * bytes corruptos— porque el informe tiene que salir igual.
   */
  const grafico = await (async () => {
    if (!logo || huecoDerecha < ANCHO_MINIMO_LOGO) return null;
    try {
      const img =
        logo.mime === "image/png"
          ? await pdf.embedPng(logo.contenido)
          : await pdf.embedJpg(logo.contenido);

      const medida = encajarEnCaja(
        img.width,
        img.height,
        Math.min(CAJA_LOGO.ancho, huecoDerecha),
        CAJA_LOGO.alto,
      );
      return { img, ...medida };
    } catch {
      return null;
    }
  })();

  /// Incrustadas una sola vez, aunque una foto se repita en dos hojas. La que
  /// no se pueda leer se queda fuera y el informe sale igual, como el logo.
  const imagenes = new Map<string, Awaited<ReturnType<typeof pdf.embedPng>>>();
  for (const [clave, foto] of bitacora?.bytes ?? []) {
    try {
      imagenes.set(
        clave,
        foto.mime === "image/png"
          ? await pdf.embedPng(foto.contenido)
          : await pdf.embedJpg(foto.contenido),
      );
    } catch {
      // Una foto ilegible no tumba el informe.
    }
  }

  paginas.forEach((pagina, indice) => {
    const hoja = pdf.addPage([o.ancho, o.alto]);

    // Solo en la primera: es la portada del documento, y repetirlo en las
    // ocho paginas de un informe largo lo convierte en papel pintado.
    if (indice === 0 && grafico) {
      hoja.drawImage(grafico.img, {
        x: o.ancho - o.margen - grafico.ancho,
        y: o.alto - o.margen - grafico.alto,
        width: grafico.ancho,
        height: grafico.alto,
      });
    }

    for (const e of pagina.elementos) {
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
        // informe: simplemente no se dibuja. Mismo criterio que el logo.
        const img = imagenes.get(e.clave);
        if (img) {
          /**
           * La maquetacion da la CAJA; la proporcion la pone aqui.
           *
           * Es el mismo reparto que con el logo, y por el mismo motivo: solo
           * este modulo sabe cuantos pixeles mide la imagen de verdad. Una
           * foto de obra estirada para llenar su celda es una foto que
           * miente sobre lo que se ve en ella.
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
        color: e.tinta ? TINTAS[e.tinta] : e.gris ? GRIS : NEGRO,
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
