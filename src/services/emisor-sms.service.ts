import "server-only";

import { prisma } from "@/lib/prisma";
import { puede } from "@/lib/rbac";
import { generateToken, hashToken } from "@/lib/tokens";
import { normalizarCelular } from "@/lib/contacto";
import {
  estadoDelEmisor,
  validarEtiquetaEmisor,
  type EstadoEmisor,
} from "@/lib/emisor-sms";
import type { SesionActiva } from "@/services/sesion.service";

/**
 * Los telefonos que mandan los SMS de una empresa.
 *
 * Cada empresa vincula los suyos y solo ve los suyos. Antes habia un unico
 * token de entorno para toda la plataforma, lo que significaba que la segunda
 * constructora habria compartido telefono emisor con la primera —y los
 * codigos de acceso de una habrian salido por el movil de la otra—.
 *
 * Todo lo de aqui exige `configuracion:editar`, que es INNEGOCIABLE: quien
 * puede vincular un emisor puede leer los codigos de acceso de toda su
 * empresa, asi que no es un ajuste, es una llave.
 */

export type ResultadoEmisor = { ok: true } | { ok: false; error: string };

/// Lo que devuelve vincular: el token en claro, que solo se ve UNA vez.
export type ResultadoVinculo =
  | { ok: true; token: string }
  | { ok: false; error: string };

export interface EmisorLista {
  id: string;
  etiqueta: string;
  numero: string | null;
  activo: boolean;
  /// Vivo, dormido o todavia sin estrenar. Es la pregunta util.
  estado: EstadoEmisor;
  ultimaConsultaAt: Date | null;
  vinculadoPor: string;
  createdAt: Date;
}

function quien(sesion: SesionActiva): string {
  return `${sesion.nombres} ${sesion.apellidos}`.trim().slice(0, 150);
}

/** Los emisores de la empresa, con su estado calculado. */
export async function listarEmisores(
  sesion: SesionActiva,
): Promise<EmisorLista[]> {
  if (!puede(sesion, "configuracion:editar")) return [];

  const ahora = new Date();
  const filas = await prisma.emisorSms.findMany({
    where: { companyId: sesion.companyId },
    orderBy: [{ activo: "desc" }, { createdAt: "asc" }],
    select: {
      id: true,
      etiqueta: true,
      numero: true,
      activo: true,
      ultimaConsultaAt: true,
      vinculadoPor: true,
      createdAt: true,
    },
  });

  return filas.map((f) => ({
    ...f,
    estado: estadoDelEmisor(f.ultimaConsultaAt, ahora),
  }));
}

/**
 * Vincula un telefono y devuelve su token, en claro y por unica vez.
 *
 * El token se genera aqui y **solo se guarda su hash**, como las sesiones y
 * los codigos del pase. Si se pierde, no hay forma de recuperarlo: se revoca
 * ese emisor y se vincula otro. Es incomodo a proposito —un secreto que se
 * puede volver a mirar acaba copiado en un correo—.
 */
export async function vincularEmisor(
  sesion: SesionActiva,
  datos: { etiqueta: string; numero: string },
): Promise<ResultadoVinculo> {
  if (!puede(sesion, "configuracion:editar")) {
    return {
      ok: false,
      error: "No tienes permiso para configurar el envío de SMS.",
    };
  }

  const v = validarEtiquetaEmisor(datos.etiqueta);
  if (!v.ok) return { ok: false, error: v.error };

  // El numero es informativo: sirve para saber que aparato es sin ir a
  // buscarlo. Se normaliza igual, para que no acabe siendo texto libre.
  const bruto = datos.numero.trim();
  let numero: string | null = null;
  if (bruto !== "") {
    numero = normalizarCelular(bruto);
    if (!numero) {
      return {
        ok: false,
        error: "El celular debe tener nueve cifras y empezar por 9.",
      };
    }
  }

  const token = generateToken();

  const emisor = await prisma.emisorSms.create({
    data: {
      companyId: sesion.companyId,
      etiqueta: v.etiqueta,
      numero,
      tokenHash: hashToken(token),
      vinculadoPor: quien(sesion),
    },
    select: { id: true },
  });

  await prisma.auditLog.create({
    data: {
      companyId: sesion.companyId,
      userId: sesion.userId,
      entidad: "EmisorSms",
      entidadId: emisor.id,
      accion: "CREATE",
      // El token NUNCA se audita, igual que no se auditan las claves.
      despues: { etiqueta: v.etiqueta, numero },
    },
  });

  return { ok: true, token };
}

/**
 * Revoca o devuelve el acceso de un emisor.
 *
 * Revocar no borra la fila: queda para saber que ese telefono existio, quien
 * lo puso y cuando. Lo que deja de valer en el acto es su token.
 */
export async function cambiarEstadoEmisor(
  sesion: SesionActiva,
  emisorId: string,
  activo: boolean,
): Promise<ResultadoEmisor> {
  if (!puede(sesion, "configuracion:editar")) {
    return {
      ok: false,
      error: "No tienes permiso para configurar el envío de SMS.",
    };
  }

  const { count } = await prisma.emisorSms.updateMany({
    where: { id: emisorId, companyId: sesion.companyId },
    data: { activo },
  });
  if (count === 0) return { ok: false, error: "Teléfono no encontrado." };

  await prisma.auditLog.create({
    data: {
      companyId: sesion.companyId,
      userId: sesion.userId,
      entidad: "EmisorSms",
      entidadId: emisorId,
      accion: "UPDATE",
      despues: { evento: activo ? "reactivar" : "revocar" },
    },
  });

  return { ok: true };
}

/**
 * Borrar un telefono de la lista, revocado o no.
 *
 * EL ESQUEMA DECIA «revocar no borra: la fila queda para saber que existio y
 * quien lo puso», y era razonable mientras hubiera dos o tres. Con el uso real
 * la lista crece cada vez que se pierde un token, y una lista interminable de
 * telefonos muertos esconde al que importa —el que esta vivo—.
 *
 * La trazabilidad NO se pierde: se muda al registro de auditoria, que es su
 * sitio. Por eso el apunte guarda la etiqueta, el numero y quien lo vinculo:
 * borrada la fila, esa sigue siendo la unica forma de responder «¿que telefono
 * mandaba los SMS en agosto?».
 *
 * No hace falta borrar nada mas: `MensajeSms` no apunta al emisor —solo lleva
 * `companyId`—, asi que aqui no queda ningun mensaje huerfano.
 */
export async function eliminarEmisor(
  sesion: SesionActiva,
  emisorId: string,
): Promise<ResultadoEmisor> {
  if (!puede(sesion, "configuracion:editar")) {
    return {
      ok: false,
      error: "No tienes permiso para configurar el envío de SMS.",
    };
  }

  // Se lee ANTES de borrar: despues ya no hay de donde sacar la etiqueta ni
  // quien lo puso, y el apunte de auditoria se quedaria en un identificador.
  const emisor = await prisma.emisorSms.findFirst({
    where: { id: emisorId, companyId: sesion.companyId },
    select: {
      etiqueta: true,
      numero: true,
      activo: true,
      vinculadoPor: true,
      ultimaConsultaAt: true,
    },
  });
  if (!emisor) return { ok: false, error: "Teléfono no encontrado." };

  // Acotado por empresa tambien al borrar, no solo al leer: la accion es un
  // endpoint invocable sin haber pintado jamas esta pantalla.
  await prisma.emisorSms.deleteMany({
    where: { id: emisorId, companyId: sesion.companyId },
  });

  await prisma.auditLog.create({
    data: {
      companyId: sesion.companyId,
      userId: sesion.userId,
      entidad: "EmisorSms",
      entidadId: emisorId,
      accion: "DELETE",
      antes: {
        etiqueta: emisor.etiqueta,
        numero: emisor.numero,
        activo: emisor.activo,
        vinculadoPor: emisor.vinculadoPor,
        ultimaConsulta: emisor.ultimaConsultaAt?.toISOString() ?? null,
      },
    },
  });

  return { ok: true };
}
