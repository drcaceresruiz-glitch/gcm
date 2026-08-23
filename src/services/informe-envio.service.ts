import "server-only";
import { prisma } from "@/lib/prisma";
import { componerInforme } from "./informe.service";
import { correoInformeObra, enviarCorreo } from "./mailer.service";
import { generarInformePdf } from "./informe-pdf.service";
import { bytesDelLogo } from "./logo.service";
import { eleccionDeInforme } from "./plantilla-informe.service";
import { generarCsv } from "@/lib/csv";
import {
  filasDelInformeCsv,
  nombreArchivoInforme,
  nombreArchivoInformeCsv,
  fechaCsv,
} from "@/lib/informe-csv";
import { resumenParaCorreo } from "@/lib/informe-correo";
import { analizarDestinatarios } from "@/lib/destinatarios";
import type { SesionActiva } from "./sesion.service";

/**
 * Enviar el informe de obra por correo, con los datos completos adjuntos.
 *
 * TODO se arma en el servidor: las cifras del cuerpo y el adjunto salen de
 * `componerInforme`, la misma funcion que alimenta la pantalla. El envio de la
 * curva, que es anterior, recibe las cifras del NAVEGADOR en campos ocultos
 * del formulario; aqui no, y no es un detalle de estilo: un correo que sale de
 * GCM hacia el cliente con cifras que vinieron del navegador es un correo cuyo
 * contenido puede no corresponder con lo que el sistema sabe.
 *
 * Se manda uno a uno, nunca con todos en el "para": la lista de un informe
 * puede llevar al cliente y al contratista, y ninguno tiene por que ver al
 * otro.
 */

/// Lo que se puede escribir en la nota del remitente. Da para un parrafo, que
/// es lo que cabe en un correo que ya lleva el informe adjunto.
export const MAX_NOTA = 500;

export type ResultadoEnvioInforme =
  | { ok: true; enviados: number; total: number; archivo: string }
  | { ok: false; error: string };

export async function enviarInformePorCorreo(
  sesion: SesionActiva,
  obraId: string,
  datos: { corteISO?: string; para: string; nota?: string },
): Promise<ResultadoEnvioInforme> {
  const destinos = analizarDestinatarios(datos.para);
  if (!destinos.ok) return { ok: false, error: destinos.error };

  // El permiso lo comprueba `componerInforme`: enviar el informe por correo es
  // sacarlo de la aplicacion, y no puede ser mas facil que verlo dentro.
  const informe = await componerInforme(sesion, obraId, datos.corteISO);

  if (informe.estado === "sin-permiso") {
    return { ok: false, error: "No tienes permiso para ver este cronograma." };
  }
  if (informe.estado === "sin-obra") {
    return { ok: false, error: "Obra no encontrada." };
  }
  if (informe.estado === "sin-cronograma") {
    return { ok: false, error: "La obra todavía no tiene cronograma cargado." };
  }

  const d = informe.datos;
  const resumen = resumenParaCorreo(d);
  const generadoEl = new Date();

  const archivoPdf = nombreArchivoInforme(d.obra, d.fechaCorte, "pdf");
  const archivoCsv = nombreArchivoInformeCsv(d.obra, d.fechaCorte);

  // Los DOS: el PDF es el informe para leer y archivar, el CSV es el mismo
  // contenido para cruzarlo con lo de cada uno. Quien recibe el correo no
  // tiene por que saber cual necesita antes de abrirlo.
  const logo = await bytesDelLogo(sesion.companyId);
  // El informe que se manda lleva las MISMAS hojas que el que se descarga:
  // dos versiones del mismo documento seria lo peor de las dos opciones.
  const seleccion = await eleccionDeInforme(sesion, obraId);
  const pdf = await generarInformePdf(d, generadoEl, logo, undefined, seleccion);
  const csv = generarCsv(filasDelInformeCsv(d, generadoEl));

  const cuerpo = correoInformeObra({
    obra: d.obra,
    corte: fechaCsv(d.fechaCorte),
    estado: resumen.estado,
    cifras: resumen.cifras,
    ppc: resumen.ppc,
    masGraves: resumen.masGraves,
    gravesOmitidas: resumen.gravesOmitidas,
    nota: datos.nota?.trim().slice(0, MAX_NOTA) || undefined,
    remitente: d.generadoPor,
    adjunto: archivoPdf,
    adjuntoDatos: archivoCsv,
  });

  const adjuntos = [
    {
      nombre: archivoPdf,
      contenido: Buffer.from(pdf).toString("base64"),
      tipo: "application/pdf",
    },
    {
      nombre: archivoCsv,
      contenido: Buffer.from(csv, "utf8").toString("base64"),
      tipo: "text/csv; charset=utf-8",
    },
  ];

  const resultados = await Promise.all(
    destinos.lista.map((para) =>
      // Con `companyId` para que lleve el logo: este correo va al cliente y a
      // los contratistas, y es de la constructora, no de GCM.
      enviarCorreo({ ...cuerpo, para, adjuntos, companyId: sesion.companyId }),
    ),
  );
  const enviados = resultados.filter((r) => r.enviado).length;

  if (enviados === 0) {
    return {
      ok: false,
      error:
        "No se pudo enviar el correo. Puede que el servidor de correo no esté configurado.",
    };
  }

  // Queda constancia de que el informe salio de la empresa, a quien y con que
  // fecha de corte. Es la pregunta que se hace despues —«¿quien le mando esto
  // al cliente?»— y sin esto no tiene respuesta.
  //
  // La accion es CREATE y la entidad "EnvioInforme" porque `AuditAction` no
  // tiene un valor para «envio» y anadirlo exige una migracion. Se crea un
  // envio: no es una violencia sobre el vocabulario, y evita que la
  // trazabilidad espere a una migracion.
  await prisma.auditLog.create({
    data: {
      companyId: sesion.companyId,
      userId: sesion.userId,
      projectId: obraId,
      entidad: "EnvioInforme",
      entidadId: obraId,
      accion: "CREATE",
      despues: {
        corte: d.fechaCorte.toISOString().slice(0, 10),
        para: destinos.lista,
        enviados,
        archivos: [archivoPdf, archivoCsv],
      },
    },
  });

  return {
    ok: true,
    enviados,
    total: destinos.lista.length,
    archivo: archivoPdf,
  };
}
