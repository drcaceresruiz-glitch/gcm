import "server-only";

import { prisma } from "@/lib/prisma";
import { puede } from "@/lib/rbac";
import { alcanzaObra } from "@/lib/alcance-obras";
import { normalizarCelular, normalizarEmail } from "@/lib/contacto";
import { PRIORIDAD_AVISO } from "@/lib/sms-cola";
import {
  MAX_ASUNTO,
  MAX_CUERPO,
  textoSmsAlContratista,
  validarAdjuntos,
  type AdjuntoPropuesto,
  type Firma,
} from "@/lib/mensaje-contratista";
import { correoAlContratista, enviarCorreo, type Adjunto } from "./mailer.service";
import { enviarSms, hayCanalSms } from "./sms.service";
import type { SesionActiva } from "./sesion.service";

/**
 * Escribirle a un contratista desde GCM, y dejar constancia.
 *
 * TRES CANALES QUE NO SON EL MISMO, y la pantalla no puede fingir que si:
 *
 * - **Correo**: lo manda GCM. Es el unico que lleva adjuntos.
 * - **SMS**: lo ENCOLA GCM. Sale de un telefono con una SIM de la empresa, asi
 *   que se dice «encolado» y no «recibido».
 * - **WhatsApp**: GCM **no manda nada**. Prepara el texto y lo abre en el
 *   WhatsApp de la persona. Se registra como preparado, nunca como enviado.
 *
 * Todo queda en `MensajeContratista`, que es la respuesta a «¿le avisamos de
 * esto?» cuando el contratista dice que no se enteró.
 */

/// Cuanto historial se ensena de una vez. Es una ficha, no un archivo.
export const MAX_HISTORIAL = 50;

export type Canal = "CORREO" | "SMS" | "WHATSAPP";

export type ResultadoMensaje =
  | { ok: true; canal: Canal; destino: string; encolado?: boolean }
  | { ok: false; error: string };

export interface ContratistaParaEscribir {
  id: string;
  razonSocial: string;
  email: string | null;
  celular: string | null;
  /// Lo que hay en la ficha aunque no sea un celular valido. Sin esto, un
  /// telefono fijo se ve como «sin telefono», que es mentira y manda a la
  /// gente a la ficha a arreglar lo que ya esta puesto.
  telefonoEnFicha: string | null;
  obra: { id: string; nombre: string } | null;
  hayCanalSms: boolean;
  /// El correo de quien escribe, que es el «Responder a» por defecto.
  respuestaPorDefecto: string;
  /**
   * Con que se FIRMA el mensaje: la constructora que escribe, no el
   * contratista que lo recibe.
   *
   * Esta aqui explicitamente porque confundirlo es facil —en esta pantalla
   * hay dos razones sociales y las dos son «la empresa» de alguien— y el
   * sintoma no seria un error sino un SMS que le llega a la ferreteria
   * firmado por la ferreteria.
   */
  firmaEmpresa: string;
}

function nombreDe(sesion: SesionActiva): string {
  return `${sesion.nombres} ${sesion.apellidos}`.trim() || sesion.email;
}

/**
 * Lo que la pantalla necesita para dejar escribir.
 *
 * Devuelve `null` cuando no hay permiso o el contratista no es de esta
 * empresa: las dos cosas se responden igual —no existe— para no confirmar la
 * existencia de un id ajeno a quien lo prueba.
 */
export async function datosParaEscribir(
  sesion: SesionActiva,
  proveedorId: string,
  obraId?: string | null,
): Promise<ContratistaParaEscribir | null> {
  if (!puede(sesion, "proveedor:contactar")) return null;

  const proveedor = await prisma.proveedor.findFirst({
    where: { id: proveedorId, companyId: sesion.companyId },
    select: { id: true, razonSocial: true, email: true, contactoTelefono: true },
  });
  if (!proveedor) return null;

  // La obra se comprueba contra la MISMA empresa. Sin esto, un `?obra=` de
  // otra constructora firmaria el mensaje con el nombre de su obra.
  // OJO: la columna es `nombreObra`, no `nombre`. El `select` de Prisma no lo
  // caza en tiempo de tipos —esto paso el typecheck y reventaba al abrir la
  // pantalla—, asi que el nombre se renombra aqui para que el resto del
  // servicio hable de `nombre` a secas.
  // Y contra el ALCANCE, no solo contra la empresa: si no, un `?obra=` de una
  // obra propia pero no asignada revelaria su nombre a quien no la lleva.
  const fila =
    obraId && alcanzaObra(sesion, obraId)
      ? await prisma.project.findFirst({
          where: { id: obraId, companyId: sesion.companyId },
          select: { id: true, nombreObra: true },
        })
      : null;
  const obra = fila ? { id: fila.id, nombre: fila.nombreObra } : null;

  const empresa = await prisma.company.findUnique({
    where: { id: sesion.companyId },
    select: { razonSocial: true },
  });

  return {
    id: proveedor.id,
    razonSocial: proveedor.razonSocial,
    email: proveedor.email ? normalizarEmail(proveedor.email) : null,
    celular: proveedor.contactoTelefono
      ? normalizarCelular(proveedor.contactoTelefono)
      : null,
    telefonoEnFicha: proveedor.contactoTelefono,
    obra,
    hayCanalSms: await hayCanalSms(sesion.companyId),
    respuestaPorDefecto: sesion.email,
    firmaEmpresa: empresa?.razonSocial ?? "",
  };
}

export interface MensajeEnHistorial {
  id: string;
  canal: Canal;
  destino: string;
  asunto: string | null;
  cuerpo: string;
  adjuntos: { nombre: string; tamano: number }[];
  enviado: boolean;
  motivo: string | null;
  enviadoPor: string;
  cuando: Date;
  obra: string | null;
}

/**
 * Lo que se le ha escrito a este contratista.
 *
 * El nombre de la obra se resuelve aparte porque `projectId` no tiene clave
 * foranea —a proposito: el mensaje sobrevive al borrado de la obra—, asi que
 * puede apuntar a una que ya no esta. Cuando pasa, se dice.
 */
export async function historialDeContratista(
  sesion: SesionActiva,
  proveedorId: string,
): Promise<MensajeEnHistorial[]> {
  if (!puede(sesion, "proveedor:contactar")) return [];

  const filas = await prisma.mensajeContratista.findMany({
    where: { proveedorId, companyId: sesion.companyId },
    orderBy: { createdAt: "desc" },
    take: MAX_HISTORIAL,
  });

  const idsObra = [...new Set(filas.map((f) => f.projectId).filter((id) => id !== null))];
  const obras = idsObra.length
    ? await prisma.project.findMany({
        // El alcance se cruza en JS y no componiendo el filtro: las dos
        // claves serian `id` y la segunda pisaria a la primera, dejando ver
        // el historial de obras que no se llevan.
        where: {
          id: { in: idsObra.filter((id) => alcanzaObra(sesion, id)) },
          companyId: sesion.companyId,
        },
        select: { id: true, nombreObra: true },
      })
    : [];
  const nombreObra = new Map(obras.map((o) => [o.id, o.nombreObra]));

  return filas.map((f) => ({
    id: f.id,
    canal: f.canal as Canal,
    destino: f.destino,
    asunto: f.asunto,
    cuerpo: f.cuerpo,
    adjuntos: Array.isArray(f.adjuntos)
      ? (f.adjuntos as { nombre: string; tamano: number }[])
      : [],
    enviado: f.enviado,
    motivo: f.motivo,
    enviadoPor: f.enviadoPor,
    cuando: f.createdAt,
    obra: f.projectId ? (nombreObra.get(f.projectId) ?? "Una obra ya borrada") : null,
  }));
}

export interface DatosMensaje {
  proveedorId: string;
  obraId?: string | null;
  canal: Canal;
  asunto?: string;
  cuerpo: string;
  respuestaA?: string;
  adjuntos?: readonly (AdjuntoPropuesto & { contenido: string })[];
}

/**
 * Manda el mensaje y lo apunta.
 *
 * SE APUNTA AUNQUE NO SALGA, y es deliberado: «se intento y fallo» es
 * informacion, y si solo se guardaran los que salen, el historial diria que
 * nunca se intento avisar. Es la misma idea que `EnvioAviso`, que reserva
 * antes de entregar.
 */
export async function escribirAlContratista(
  sesion: SesionActiva,
  datos: DatosMensaje,
): Promise<ResultadoMensaje> {
  const contratista = await datosParaEscribir(sesion, datos.proveedorId, datos.obraId);
  if (!contratista) {
    return { ok: false, error: "No tienes permiso para escribir a este contratista." };
  }

  const cuerpo = datos.cuerpo.trim();
  if (!cuerpo) return { ok: false, error: "El mensaje está vacío." };
  if (cuerpo.length > MAX_CUERPO) {
    return { ok: false, error: `El mensaje no puede pasar de ${MAX_CUERPO} caracteres.` };
  }

  // QUIEN FIRMA es la constructora, NO el contratista. Aqui hay dos razones
  // sociales a mano y equivocarse no da ningun error: simplemente le llega al
  // contratista un SMS firmado con su propio nombre.
  const firma: Firma = {
    empresa: contratista.firmaEmpresa,
    obra: contratista.obra?.nombre ?? null,
  };

  const apuntar = (fila: {
    canal: Canal;
    destino: string;
    asunto: string | null;
    cuerpo: string;
    enviado: boolean;
    motivo?: string | null;
    respuestaA?: string | null;
    adjuntos?: { nombre: string; tamano: number }[];
  }) =>
    prisma.$transaction(async (tx) => {
      const mensaje = await tx.mensajeContratista.create({
        data: {
          companyId: sesion.companyId,
          proveedorId: contratista.id,
          projectId: contratista.obra?.id ?? null,
          canal: fila.canal,
          destino: fila.destino,
          asunto: fila.asunto,
          cuerpo: fila.cuerpo,
          adjuntos: fila.adjuntos?.length ? fila.adjuntos : undefined,
          respuestaA: fila.respuestaA ?? null,
          enviado: fila.enviado,
          motivo: fila.motivo ?? null,
          enviadoPor: nombreDe(sesion),
        },
      });

      // Ademas del historial, al libro de la empresa. Son dos preguntas
      // distintas: el historial responde «¿que le dijimos a este
      // contratista?» y la auditoria «¿quien escribio a gente de fuera hoy?»,
      // que es lo que mira un administrador.
      //
      // NO se copia el cuerpo: ya vive en la fila de arriba, y duplicar el
      // texto obligaria a acordarse de los dos sitios el dia que haya que
      // borrarlo. Aqui va lo justo para saber que preguntar.
      await tx.auditLog.create({
        data: {
          companyId: sesion.companyId,
          userId: sesion.userId,
          projectId: contratista.obra?.id ?? null,
          entidad: "MensajeContratista",
          entidadId: mensaje.id,
          accion: "CREATE",
          despues: {
            razonSocial: contratista.razonSocial,
            canal: fila.canal,
            destino: fila.destino,
            enviado: fila.enviado,
            ...(fila.motivo ? { motivo: fila.motivo } : {}),
          },
        },
      });

      return mensaje;
    });

  if (datos.canal === "CORREO") {
    if (!contratista.email) {
      return {
        ok: false,
        error:
          "Este contratista no tiene correo en su ficha. Añádelo en el catálogo de proveedores.",
      };
    }

    const asunto = (datos.asunto ?? "").trim();
    if (!asunto) return { ok: false, error: "Ponle un asunto al correo." };
    if (asunto.length > MAX_ASUNTO) {
      return { ok: false, error: `El asunto no puede pasar de ${MAX_ASUNTO} caracteres.` };
    }

    const propuestos = datos.adjuntos ?? [];
    const validacion = validarAdjuntos(propuestos);
    if (!validacion.ok) return { ok: false, error: validacion.error };

    // Vacio = el preconfigurado. Un «Responder a» que no es un correo es peor
    // que no ponerlo: la respuesta se pierde sin que nadie se entere.
    const respuestaA = datos.respuestaA?.trim()
      ? normalizarEmail(datos.respuestaA)
      : normalizarEmail(contratista.respuestaPorDefecto);
    if (datos.respuestaA?.trim() && !respuestaA) {
      return { ok: false, error: "El correo de respuesta no parece válido." };
    }

    const adjuntos: Adjunto[] = propuestos.map((a) => ({
      nombre: a.nombre,
      contenido: a.contenido,
      tipo: a.tipo,
    }));

    const cuerpoCorreo = correoAlContratista({
      contratista: contratista.razonSocial,
      obra: contratista.obra?.nombre ?? null,
      asunto,
      cuerpo,
      remitente: nombreDe(sesion),
      adjuntos: propuestos.map((a) => a.nombre),
    });

    const r = await enviarCorreo({
      ...cuerpoCorreo,
      para: contratista.email,
      adjuntos: adjuntos.length ? adjuntos : undefined,
      respuestaA: respuestaA ?? undefined,
      // Para que salga con el logo de la constructora: es un correo a alguien
      // de fuera y tiene que parecer de la empresa, no del sistema.
      companyId: sesion.companyId,
    });

    await apuntar({
      canal: "CORREO",
      destino: contratista.email,
      asunto,
      cuerpo,
      enviado: r.enviado,
      motivo: r.enviado ? null : "sin-smtp",
      respuestaA,
      adjuntos: propuestos.map((a) => ({ nombre: a.nombre, tamano: a.tamano })),
    });

    if (!r.enviado) {
      return {
        ok: false,
        error:
          "No se pudo enviar el correo. Puede que el servidor de correo no esté configurado.",
      };
    }

    return { ok: true, canal: "CORREO", destino: contratista.email };
  }

  if (datos.canal === "SMS") {
    if (!contratista.celular) {
      return {
        ok: false,
        error: contratista.telefonoEnFicha
          ? `«${contratista.telefonoEnFicha}» no es un celular peruano de nueve cifras, así que no se le puede mandar un SMS.`
          : "Este contratista no tiene celular en su ficha. Añádelo en el catálogo de proveedores.",
      };
    }

    // Se comprueba ANTES de llamar a `enviarSms`, que se traga el fallo: sin
    // esto la pantalla diria «enviado» sin decir que no habia por donde.
    if (!contratista.hayCanalSms) {
      return {
        ok: false,
        error:
          "Esta empresa todavía no tiene teléfono emisor, así que GCM no puede enviar SMS. Se vincula en Empresa → Configuración.",
      };
    }

    const texto = textoSmsAlContratista(firma, cuerpo);

    // Prioridad de aviso, nunca la del codigo: un mensaje a un contratista no
    // puede adelantar en la cola a un codigo de acceso que caduca en diez
    // minutos.
    const r = await enviarSms(sesion.companyId, contratista.celular, texto, {
      projectId: contratista.obra?.id ?? null,
      prioridad: PRIORIDAD_AVISO,
    });

    await apuntar({
      canal: "SMS",
      destino: contratista.celular,
      asunto: null,
      // Se guarda lo que SALIO, no lo que se tecleo: el SMS va sin tildes y
      // recortado a 160, y el historial tiene que poder decir que le llego.
      cuerpo: texto,
      enviado: r.enviado,
      motivo: r.enviado ? null : (r.motivo ?? "sin-canal"),
    });

    if (!r.enviado) {
      return { ok: false, error: "No se pudo dejar el mensaje para enviar. Inténtalo de nuevo." };
    }

    return { ok: true, canal: "SMS", destino: contratista.celular, encolado: true };
  }

  // WhatsApp. GCM NO envia: se apunta que se preparo, y lo manda la persona.
  // Por eso `enviado` queda en false con su motivo, y no es un fallo.
  const destino = contratista.celular ?? contratista.telefonoEnFicha ?? "";

  await apuntar({
    canal: "WHATSAPP",
    destino,
    asunto: null,
    cuerpo,
    enviado: false,
    motivo: "lo-manda-la-persona",
  });

  return { ok: true, canal: "WHATSAPP", destino };
}
