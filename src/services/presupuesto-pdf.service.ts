import "server-only";
import { PDFDocument } from "pdf-lib";

import { nombreDeArchivo } from "@/lib/nombre-archivo";
import { A4_VERTICAL, paginasDelPresupuesto } from "@/lib/presupuesto-pdf";
import { aWinAnsi } from "@/lib/pdf-texto";
import type { SesionActiva } from "@/services/sesion.service";
import {
  cargarFuentes,
  medidorCon,
  pintarDocumento,
} from "@/services/pdf-pintor.service";
import {
  datosDelPresupuesto,
  type DocumentoPresupuesto,
} from "@/services/presupuesto-documento.service";

/**
 * Los presupuestos en PAPEL: contractual, meta y la comparativa.
 *
 * QUE dice cada uno no se decide aqui: eso es `presupuesto-documento.service`,
 * que es tambien de donde saca sus cifras el Excel. Aqui solo se pinta.
 *
 * El contractual es el UNICO que puede salir de la empresa, y por eso es el
 * unico que no lleva ni una cifra de costo: ni el real, ni el recargo, ni la
 * bolsa, ni los gastos generales. Los otros dos van rotulados como internos,
 * en rojo y en la primera linea, para que no se manden por descuido.
 *
 * La maquetacion vive en `lib/presupuesto-pdf` -pura y probada- y el pintor
 * en `pdf-pintor.service`, el mismo que dibuja el informe al corte: no hay
 * dos paletas ni dos formas de dibujar una tabla.
 */

export type { DocumentoPresupuesto };

export type ResultadoPdf =
  | { ok: true; bytes: Uint8Array; nombre: string }
  | { ok: false; estado: 403 | 404; error: string };

export async function generarPresupuestoPdf(
  sesion: SesionActiva,
  obraId: string,
  documento: DocumentoPresupuesto,
): Promise<ResultadoPdf> {
  const r = await datosDelPresupuesto(sesion, obraId, documento);
  if (!r.ok) return r;

  const { datos, nombreObra } = r;

  const pdf = await PDFDocument.create();
  pdf.setTitle(`${datos.titulo} - ${aWinAnsi(nombreObra)}`);
  pdf.setCreator("GCM");

  const fuentes = await cargarFuentes(pdf);
  const paginas = paginasDelPresupuesto(
    datos,
    A4_VERTICAL,
    medidorCon(fuentes),
    documento === "comparativa",
  );

  const marca = datos.soloInterno ? "DOCUMENTO INTERNO · no enviar al cliente" : "";
  pintarDocumento(
    pdf,
    paginas,
    A4_VERTICAL,
    fuentes,
    (indice, total) =>
      `${aWinAnsi(nombreObra)}${marca ? ` · ${marca}` : ""} · Página ${indice + 1} de ${total}`,
  );

  return {
    ok: true,
    bytes: await pdf.save(),
    // La obra PRIMERO y el documento despues: al ordenar la carpeta por
    // nombre quedan juntos los papeles de una misma obra, que es como se
    // buscan. Al reves quedarian juntos todos los contractuales de obras
    // distintas, que no le sirve a nadie.
    nombre: nombreDeArchivo({
      ambito: nombreObra,
      documento,
      fecha: new Date(),
      extension: "pdf",
    }),
  };
}
