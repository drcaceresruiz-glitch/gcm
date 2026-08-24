import "server-only";
import { PDFDocument } from "pdf-lib";
import { documentoDelInforme, fechaCsv } from "@/lib/informe-documento";
import type { DatosCsvInforme } from "@/lib/informe-documento";
import { hojaDashboard } from "@/lib/informe-hoja-dashboard";
import { hojasBitacora, type DatosBitacora } from "@/lib/informe-hoja-bitacora";
import { hojaCronograma } from "@/lib/informe-hoja-cronograma";
import { hojaControl } from "@/lib/informe-hoja-control";
import {
  SECCIONES_INFORME,
  type SeccionInformeClave,
} from "@/lib/plantilla-informe";
import { A4_APAISADO, paginasDelInforme } from "@/lib/informe-pdf";
import {
  cargarFuentes,
  medidorCon,
  pintarDocumento,
} from "@/services/pdf-pintor.service";
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
  /**
   * Que hojas lleva este informe. Sin ella salen todas, que es como se
   * comportaba antes de que se pudiera elegir.
   */
  seleccion?: {
    incluidas: readonly SeccionInformeClave[];
    apagadas: readonly SeccionInformeClave[];
  },
): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(`Informe de obra - ${aWinAnsi(d.obra)}`);
  pdf.setCreator("GCM");

  const fuentes = await cargarFuentes(pdf);
  const medir = medidorCon(fuentes);

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

  /**
   * El control economico va detras del cronograma: primero como va la obra,
   * luego cuando pasa cada cosa, y despues cuanto cuesta. Es la hoja que GCM
   * aporta y que el informe del cliente no tenia.
   */
  const control = hojaControl(
    {
      obra: d.obra,
      empresa: d.empresa,
      fechaCorte: d.fechaCorte,
      real: d.real,
      economia: d.economia ?? null,
      // Sin cruce -o sin permiso de ordenes- el bloque no se pinta y la hoja
      // queda como estaba. Ver `CapituloDeLaBrecha`.
      cruce: d.cruce ?? undefined,
      lastPlanner: d.lastPlanner,
    },
    A4_APAISADO,
    medir,
  );

  /// Sin seleccion, todas: es como se comportaba antes de poder elegir.
  const incluidas = seleccion?.incluidas ?? SECCIONES_INFORME;
  const lleva = (s: SeccionInformeClave) => incluidas.includes(s);

  /**
   * El resumen va SIEMPRE y no se puede apagar.
   *
   * Lleva el avance y las alertas de atraso. Un informe del que se puede
   * quitar el atraso no es un informe: quien lo recibe no tiene forma de
   * saber que se lo quitaron.
   */
  const paginas = [
    hojaDashboard(d, A4_APAISADO, medir),
    ...(lleva("cronograma") ? cronograma : []),
    ...(lleva("control") ? control : []),
    ...(lleva("tablas") ? paginasDelInforme(
      secciones,
      `Informe de obra — ${d.obra}`,
      `${d.empresa}${d.ubicacion ? ` · ${d.ubicacion}` : ""} · Corte del ${fechaCsv(d.fechaCorte)}`,
      A4_APAISADO,
      medir,
    ) : []),
    ...(lleva("bitacora") ? hojasDeLaBitacora : []),
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
    o.margen + fuentes.negrita.widthOfTextAtSize(aWinAnsi(tituloPrimeraPagina), 18);
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

  pintarDocumento(
    pdf,
    paginas,
    o,
    fuentes,
    (indice, total) => {
      /**
       * El pie CONFIESA lo que no lleva.
       *
       * Un informe recortado que no lo dice es indistinguible de uno completo
       * para quien lo recibe, y ahi es donde una preferencia se convierte en
       * una omision. Se dice el numero, no la lista: la lista no cabe y el
       * numero ya basta para preguntar.
       */
      const omitidas = seleccion?.apagadas.length ?? 0;
      const nota =
        omitidas > 0
          ? ` · ${omitidas} sección(es) omitida(s) por configuración`
          : "";
      return `${aWinAnsi(d.obra)} · Corte ${fechaCsv(d.fechaCorte)} · Generado por ${aWinAnsi(d.generadoPor)}${nota} · Página ${indice + 1} de ${total}`;
    },
    {
      imagenes,
      marcaPrimeraPagina: grafico
        ? (hoja) =>
            hoja.drawImage(grafico.img, {
              x: o.ancho - o.margen - grafico.ancho,
              y: o.alto - o.margen - grafico.alto,
              width: grafico.ancho,
              height: grafico.alto,
            })
        : undefined,
    },
  );

  return pdf.save();
}
