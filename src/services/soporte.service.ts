import "server-only";

import { prisma } from "@/lib/prisma";
import { puede } from "@/lib/rbac";
import { env } from "@/lib/env";
import { parsearOperadores } from "@/lib/operador";
import { enviarCorreo, correoNuevoMensajeSoporte } from "@/services/mailer.service";
import type { DireccionSoporte } from "@/generated/prisma/enums";
import type { SesionActiva } from "@/services/sesion.service";

/**
 * El canal de soporte: un hilo continuo de mensajes entre el operador de
 * GCM y UNA constructora.
 *
 * Es la primera pieza del sistema que se lee y se escribe legitimamente
 * desde LOS DOS LADOS de la pared operador/empresa —`operador.service.ts`
 * declara que "no entra en los datos de un cliente"; esto es la excepcion
 * deliberada, correspondencia y no datos de obra ni de presupuesto—.
 *
 * A PROPOSITO hay funciones SEPARADAS y EXPLICITAS por lado, nunca una
 * sola funcion con una rama interna que decida el permiso segun
 * `esOperador`: mezclar dos autorizaciones distintas en una misma funcion
 * es el tipo de bug caro que este proyecto ya evita en otros sitios (dos
 * definiciones de lo mismo que se desalinean). El lado empresa se gatea
 * con `puede(sesion, "soporte:usar")` y actua sobre `sesion.companyId`;
 * el lado operador se gatea con `sesion.esOperador` y recibe el
 * `empresaId` de forma explicita, nunca implicita.
 *
 * Un solo hilo por empresa, sin estado de ticket (abierto/cerrado/
 * prioridad): el hallazgo que lo pidio queria poder hablar con el
 * cliente, no un helpdesk completo.
 */

/// Igual que `MAX_HISTORIAL` en `mensajes-contratista.service.ts`: es una
/// ficha reciente, no un archivo entero.
const MAX_HISTORIAL = 50;

/// Un mensaje de soporte es texto simple, sin adjuntos ni formato: no hay
/// limite de canal (SMS, WhatsApp) que lo acote como a
/// `mensajes-contratista.service.ts`, pero si un tope contra el abuso.
const MAX_CUERPO = 4000;

function quien(sesion: SesionActiva): string {
  return `${sesion.nombres} ${sesion.apellidos}`.trim().slice(0, 150);
}

export interface MensajeSoporteResumen {
  id: string;
  direccion: DireccionSoporte;
  cuerpo: string;
  autorNombre: string;
  createdAt: Date;
  /// Si YA lo leyo el lado que lo esta consultando ahora. Un mensaje
  /// propio siempre cuenta como leido -no tiene sentido marcarse a uno
  /// mismo como pendiente-.
  leido: boolean;
}

export type ResultadoSoporte = { ok: true } | { ok: false; error: string };

type ResultadoValidacionCuerpo =
  | { ok: true; texto: string }
  | { ok: false; error: string };

function validarCuerpo(cuerpo: string): ResultadoValidacionCuerpo {
  const texto = cuerpo.trim();
  if (!texto) return { ok: false, error: "El mensaje está vacío." };
  if (texto.length > MAX_CUERPO) {
    return { ok: false, error: `El mensaje no puede pasar de ${MAX_CUERPO} caracteres.` };
  }
  return { ok: true, texto };
}

/// Nunca deja que un aviso por correo tumbe la escritura del mensaje: el
/// mensaje ya quedo guardado, y esto es un recordatorio best-effort, no
/// el canal en si.
async function avisarOperadores(companyId: string): Promise<void> {
  const operadores = parsearOperadores(env.GCM_OPERADORES);
  if (operadores.length === 0) return;

  const empresa = await prisma.company
    .findUnique({ where: { id: companyId }, select: { razonSocial: true } })
    .catch(() => null);

  const correo = correoNuevoMensajeSoporte({
    paraOperador: true,
    constructora: empresa?.razonSocial ?? "una constructora",
    ruta: `/operador/${companyId}`,
  });

  await Promise.all(
    operadores.map((email) =>
      enviarCorreo({ ...correo, para: email }).catch(() => {}),
    ),
  );
}

async function avisarEmpresa(companyId: string): Promise<void> {
  const admins = await prisma.user
    .findMany({
      where: { companyId, role: "ADMIN", estado: "ACTIVO" },
      select: { email: true },
    })
    .catch(() => []);
  if (admins.length === 0) return;

  const correo = correoNuevoMensajeSoporte({
    paraOperador: false,
    constructora: "",
    ruta: "/empresa/soporte",
  });

  await Promise.all(
    admins.map((a) => enviarCorreo({ ...correo, para: a.email }).catch(() => {})),
  );
}

// ---------------------------------------------------------------------------
// Lado empresa
// ---------------------------------------------------------------------------

/**
 * El hilo de soporte de la empresa de quien pregunta, mas reciente al
 * final. De paso marca como leidos por la empresa los mensajes del
 * operador que faltaban -bulk-update al abrir, mismo patron que
 * `marcarAvisosLeidos`-.
 */
export async function hiloDeSoporte(
  sesion: SesionActiva,
): Promise<MensajeSoporteResumen[]> {
  if (!puede(sesion, "soporte:usar")) return [];

  const filas = await prisma.mensajeSoporte.findMany({
    where: { companyId: sesion.companyId },
    orderBy: { createdAt: "desc" },
    take: MAX_HISTORIAL,
    select: {
      id: true,
      direccion: true,
      cuerpo: true,
      autorNombre: true,
      createdAt: true,
      leidoPorEmpresaAt: true,
    },
  });

  const sinLeer = filas
    .filter((f) => f.direccion === "DEL_OPERADOR" && f.leidoPorEmpresaAt === null)
    .map((f) => f.id);
  if (sinLeer.length > 0) {
    await prisma.mensajeSoporte.updateMany({
      where: { id: { in: sinLeer }, companyId: sesion.companyId },
      data: { leidoPorEmpresaAt: new Date() },
    });
  }

  return filas
    .map((f) => ({
      id: f.id,
      direccion: f.direccion,
      cuerpo: f.cuerpo,
      autorNombre: f.autorNombre,
      createdAt: f.createdAt,
      leido: f.direccion === "DE_LA_EMPRESA" || f.leidoPorEmpresaAt !== null,
    }))
    // Cronologico, el mas antiguo primero: se lee como una conversacion.
    .reverse();
}

/** Escribe al soporte de GCM desde la empresa. */
export async function escribirSoporte(
  sesion: SesionActiva,
  cuerpo: string,
): Promise<ResultadoSoporte> {
  if (!puede(sesion, "soporte:usar")) {
    return { ok: false, error: "No tienes permiso para escribir a soporte." };
  }

  const v = validarCuerpo(cuerpo);
  if (!v.ok) return v;

  await prisma.mensajeSoporte.create({
    data: {
      companyId: sesion.companyId,
      direccion: "DE_LA_EMPRESA",
      cuerpo: v.texto,
      autorNombre: quien(sesion),
      autorUserId: sesion.userId,
    },
  });

  await avisarOperadores(sesion.companyId);

  return { ok: true };
}

/** Cuantos mensajes del operador sigue sin leer la empresa. Para un badge. */
export async function contarSoporteSinLeer(sesion: SesionActiva): Promise<number> {
  if (!puede(sesion, "soporte:usar")) return 0;

  return prisma.mensajeSoporte.count({
    where: {
      companyId: sesion.companyId,
      direccion: "DEL_OPERADOR",
      leidoPorEmpresaAt: null,
    },
  });
}

// ---------------------------------------------------------------------------
// Lado operador
// ---------------------------------------------------------------------------

/** El hilo de soporte de UNA empresa, visto por el operador. */
export async function hiloDeSoportePorOperador(
  sesion: SesionActiva,
  empresaId: string,
): Promise<MensajeSoporteResumen[]> {
  if (!sesion.esOperador) return [];

  const filas = await prisma.mensajeSoporte.findMany({
    where: { companyId: empresaId },
    orderBy: { createdAt: "desc" },
    take: MAX_HISTORIAL,
    select: {
      id: true,
      direccion: true,
      cuerpo: true,
      autorNombre: true,
      createdAt: true,
      leidoPorOperadorAt: true,
    },
  });

  const sinLeer = filas
    .filter((f) => f.direccion === "DE_LA_EMPRESA" && f.leidoPorOperadorAt === null)
    .map((f) => f.id);
  if (sinLeer.length > 0) {
    await prisma.mensajeSoporte.updateMany({
      where: { id: { in: sinLeer }, companyId: empresaId },
      data: { leidoPorOperadorAt: new Date() },
    });
  }

  return filas
    .map((f) => ({
      id: f.id,
      direccion: f.direccion,
      cuerpo: f.cuerpo,
      autorNombre: f.autorNombre,
      createdAt: f.createdAt,
      leido: f.direccion === "DEL_OPERADOR" || f.leidoPorOperadorAt !== null,
    }))
    .reverse();
}

/** Escribe a una empresa desde el area del operador. */
export async function escribirSoportePorOperador(
  sesion: SesionActiva,
  empresaId: string,
  cuerpo: string,
): Promise<ResultadoSoporte> {
  if (!sesion.esOperador) {
    return { ok: false, error: "Esta acción es solo para quien opera GCM." };
  }

  const v = validarCuerpo(cuerpo);
  if (!v.ok) return v;

  const empresa = await prisma.company.findUnique({
    where: { id: empresaId },
    select: { id: true },
  });
  if (!empresa) return { ok: false, error: "Constructora no encontrada." };

  await prisma.mensajeSoporte.create({
    data: {
      companyId: empresaId,
      direccion: "DEL_OPERADOR",
      cuerpo: v.texto,
      autorNombre: quien(sesion),
      autorUserId: sesion.userId,
    },
  });

  await avisarEmpresa(empresaId);

  return { ok: true };
}

/**
 * Cuantos mensajes sin leer tiene el operador, por empresa.
 *
 * UNA sola consulta para toda la lista de `/operador`, no una por fila:
 * mismo criterio de coste que `respuestasPorContratista`.
 */
export async function contadorSoportePorEmpresa(
  sesion: SesionActiva,
): Promise<Map<string, number>> {
  if (!sesion.esOperador) return new Map();

  const filas = await prisma.mensajeSoporte.groupBy({
    by: ["companyId"],
    where: { direccion: "DE_LA_EMPRESA", leidoPorOperadorAt: null },
    _count: { _all: true },
  });

  return new Map(filas.map((f) => [f.companyId, f._count._all]));
}
