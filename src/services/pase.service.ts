import "server-only";
import { timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { puede } from "@/lib/rbac";
import { isProduction } from "@/lib/env";
import { generateToken, hashToken, generateNumericCode } from "@/lib/tokens";
import {
  LONGITUD_CODIGO,
  VIGENCIA_CODIGO_MINUTOS,
  MAX_INTENTOS_CODIGO,
  MAX_CODIGOS_POR_VENTANA,
  VENTANA_CODIGOS_MINUTOS,
  VIGENCIA_PASE_DIAS,
  normalizarCodigo,
  reconocerContacto,
  validarAltaPase,
  nombreDePase,
  type DatosAltaPase,
} from "@/lib/pase";
import { enviarCorreo, correoCodigoAcceso } from "@/services/mailer.service";
import { enviarSms, textoCodigoPase } from "@/services/sms.service";
import type { SesionActiva } from "@/services/sesion.service";

/**
 * Pase de obra: quien documenta en campo sin ser usuario de GCM.
 *
 * Reglas que este servicio hace cumplir y nadie mas:
 *
 * - **Solo entra quien ya estaba registrado.** El codigo se envia unicamente
 *   a un contacto que el residente dio de alta en ESA obra. Si cualquiera
 *   pudiera teclear un numero y recibir codigo, el pase no valdria nada.
 * - **Nunca se dice si un contacto existe.** Pedir codigo responde igual
 *   exista o no, como ya hace `recuperacion.service`. Si no, la pantalla se
 *   convierte en un detector de quien trabaja en la obra.
 * - **Un pase alcanza UNA obra.** No hay forma de que toque otra: el
 *   `projectId` sale de la fila del pase, jamas de la peticion.
 * - **Un pase no es un usuario.** No tiene rol ni permisos, y lo unico que
 *   se le concede es adjuntar fotos. Por eso el tipo que devuelve no encaja
 *   con `SesionActiva` ni por accidente.
 */

const COOKIE_PASE = "gcm_pase";
const COOKIE_DESAFIO_PASE = "gcm_pase_codigo";

/**
 * Un pase con el telefono ya reconocido.
 *
 * Deliberadamente NO tiene `permisos`, `role` ni `userId`: si los tuviera,
 * encajaria por estructura en `puede()` y en cualquier servicio que espere
 * una sesion, y bastaria un descuido para que un pase entrara donde no debe.
 */
export interface PaseActivo {
  paseId: string;
  obraId: string;
  companyId: string;
  /// Nombre completo, tal como quedara firmando cada foto.
  nombre: string;
}

export type ResultadoPase = { ok: true } | { ok: false; error: string };

/// Lo que se devuelve al pedir codigo. `codigo` solo viaja cuando lo pide
/// quien gestiona la obra desde su pantalla (para dictarlo o mandarlo por
/// WhatsApp); en la pantalla publica JAMAS sale.
export type ResultadoCodigo =
  | { ok: true; codigo?: string; enviadoA?: string }
  | { ok: false; error: string };

function quien(sesion: SesionActiva): string {
  return `${sesion.nombres} ${sesion.apellidos}`.trim().slice(0, 150);
}

// ---------------------------------------------------------------------------
// Gestion: la hace un usuario de GCM con permiso sobre el Lookahead
// ---------------------------------------------------------------------------

export interface PaseLista {
  id: string;
  nombres: string;
  apellidos: string;
  cargo: string | null;
  empresa: string | null;
  celular: string | null;
  email: string | null;
  activo: boolean;
  createdAt: Date;
  /// Cuantas fotos lleva aportadas: es lo que dice si el pase sirve de algo.
  fotos: number;
  /// Si su telefono esta reconocido ahora mismo.
  conAcceso: boolean;
}

/** El personal con pase de una obra. Exige gestionar el Lookahead. */
export async function listarPases(
  sesion: SesionActiva,
  obraId: string,
): Promise<PaseLista[]> {
  if (!puede(sesion, "lookahead:gestionar")) return [];

  const ahora = new Date();
  const pases = await prisma.paseObra.findMany({
    where: { projectId: obraId, project: { companyId: sesion.companyId } },
    orderBy: [{ activo: "desc" }, { createdAt: "asc" }],
    select: {
      id: true, nombres: true, apellidos: true, cargo: true, empresa: true,
      celular: true, email: true, activo: true, createdAt: true,
      _count: { select: { fotos: true } },
      sesiones: { where: { expiresAt: { gt: ahora } }, select: { id: true }, take: 1 },
    },
  });

  return pases.map((p) => ({
    id: p.id,
    nombres: p.nombres,
    apellidos: p.apellidos,
    cargo: p.cargo,
    empresa: p.empresa,
    celular: p.celular,
    email: p.email,
    activo: p.activo,
    createdAt: p.createdAt,
    fotos: p._count.fotos,
    conAcceso: p.sesiones.length > 0,
  }));
}

export async function crearPase(
  sesion: SesionActiva,
  obraId: string,
  datos: DatosAltaPase,
): Promise<ResultadoPase> {
  if (!puede(sesion, "lookahead:gestionar")) {
    return { ok: false, error: "No tienes permiso para dar pases en esta obra." };
  }

  const obra = await prisma.project.findFirst({
    where: { id: obraId, companyId: sesion.companyId },
    select: { id: true },
  });
  if (!obra) return { ok: false, error: "Obra no encontrada." };

  const v = validarAltaPase(datos);
  if (!v.ok) return { ok: false, error: v.error };

  // El contacto no se puede repetir dentro de la obra: al pedir codigo se
  // busca POR contacto, y con dos filas iguales no se sabria de quien es.
  const repetido = await prisma.paseObra.findFirst({
    where: {
      projectId: obraId,
      OR: [
        ...(v.datos.email ? [{ email: v.datos.email }] : []),
        ...(v.datos.celular ? [{ celular: v.datos.celular }] : []),
      ],
    },
    select: { nombres: true, apellidos: true },
  });
  if (repetido) {
    return {
      ok: false,
      error: `Ese contacto ya lo tiene ${repetido.nombres} ${repetido.apellidos} en esta obra.`,
    };
  }

  const pase = await prisma.paseObra.create({
    data: {
      projectId: obraId,
      ...v.datos,
      creadoPor: quien(sesion),
    },
    select: { id: true },
  });

  await prisma.auditLog.create({
    data: {
      companyId: sesion.companyId,
      userId: sesion.userId,
      projectId: obraId,
      entidad: "PaseObra",
      entidadId: pase.id,
      accion: "CREATE",
      despues: {
        nombre: `${v.datos.nombres} ${v.datos.apellidos}`,
        celular: v.datos.celular,
        email: v.datos.email,
      },
    },
  });

  return { ok: true };
}

/**
 * Revoca (o devuelve) el acceso de un pase.
 *
 * Revocar NO borra: sus fotos siguen siendo evidencia y su autoria tiene que
 * poder rastrearse. Ademas se tiran sus sesiones, para que el telefono que ya
 * estaba reconocido deje de estarlo en el acto.
 */
export async function cambiarEstadoPase(
  sesion: SesionActiva,
  obraId: string,
  paseId: string,
  activo: boolean,
): Promise<ResultadoPase> {
  if (!puede(sesion, "lookahead:gestionar")) {
    return { ok: false, error: "No tienes permiso para gestionar los pases." };
  }

  const { count } = await prisma.paseObra.updateMany({
    where: {
      id: paseId,
      projectId: obraId,
      project: { companyId: sesion.companyId },
    },
    data: {
      activo,
      revocadoAt: activo ? null : new Date(),
      revocadoPor: activo ? null : quien(sesion),
    },
  });
  if (count === 0) return { ok: false, error: "Pase no encontrado." };

  if (!activo) {
    // Que deje de entrar YA, no cuando caduque su cookie.
    await prisma.sesionPase.deleteMany({ where: { paseId } });
    await prisma.codigoPase.deleteMany({ where: { paseId } });
  }

  await prisma.auditLog.create({
    data: {
      companyId: sesion.companyId,
      userId: sesion.userId,
      projectId: obraId,
      entidad: "PaseObra",
      entidadId: paseId,
      accion: "UPDATE",
      despues: { evento: activo ? "reactivar" : "revocar" },
    },
  });

  return { ok: true };
}

// ---------------------------------------------------------------------------
// Acceso: lo hace la propia persona desde su telefono
// ---------------------------------------------------------------------------

/**
 * El pase vigente de una obra, buscado por lo que la persona tecleo.
 *
 * Devuelve null tambien cuando existe pero esta revocado, o cuando la obra o
 * la empresa no admiten entrar. Todos esos casos se responden igual arriba.
 */
async function buscarPaseParaEntrar(obraId: string, entrada: string) {
  const contacto = reconocerContacto(entrada);
  if (!contacto) return null;

  return prisma.paseObra.findFirst({
    where: {
      projectId: obraId,
      activo: true,
      ...(contacto.tipo === "email"
        ? { email: contacto.valor }
        : { celular: contacto.valor }),
      project: { estado: { not: "CERRADA" }, company: { activa: true } },
    },
    select: {
      id: true, nombres: true, apellidos: true, email: true, celular: true,
    },
  });
}

/**
 * Crea el codigo y lo manda. Para la pantalla PUBLICA (`revelar: false`).
 *
 * Responde lo mismo exista o no el contacto: en la pantalla se dice «si estas
 * registrado, te llegara un codigo». Es la misma decision que ya tomo
 * `recuperacion.service`, y por lo mismo: si respondiera distinto, un
 * desconocido con el QR de la caseta podria averiguar quien trabaja alli.
 */
export async function solicitarCodigo(
  obraId: string,
  entrada: string,
): Promise<ResultadoCodigo> {
  const pase = await buscarPaseParaEntrar(obraId, entrada);

  // Silencio deliberado: se devuelve ok tanto si existe como si no.
  if (!pase) return { ok: true };

  const limite = await pasoElLimite(pase.id);
  if (limite) return { ok: true };

  const codigo = await sembrarCodigo(pase.id);
  await repartirCodigo(pase, codigo);

  return { ok: true };
}

/**
 * Manda el codigo por TODOS los caminos que el pase tenga abiertos.
 *
 * Por los dos a la vez y no por uno solo: el SMS de json.pe sale del telefono
 * de la obra, que puede estar apagado o sin saldo, y el correo puede tardar.
 * Mandar por ambos cuesta lo mismo y multiplica las probabilidades de que el
 * codigo llegue antes de que caduque.
 *
 * Ninguno de los dos lanza si falla: si no llega por ninguno, queda que el
 * residente lo genere en su pantalla y lo dicte.
 */
async function repartirCodigo(
  pase: { nombres: string; email: string | null; celular: string | null },
  codigo: string,
): Promise<{ porSms: boolean; porCorreo: boolean }> {
  const [sms, correo] = await Promise.all([
    pase.celular
      ? enviarSms(pase.celular, textoCodigoPase(codigo, VIGENCIA_CODIGO_MINUTOS))
      : Promise.resolve({ enviado: false }),
    pase.email
      ? enviarCorreo({
          para: pase.email,
          ...correoCodigoAcceso({
            nombre: pase.nombres,
            codigo,
            minutos: VIGENCIA_CODIGO_MINUTOS,
          }),
        })
      : Promise.resolve({ enviado: false }),
  ]);

  return { porSms: sms.enviado, porCorreo: correo.enviado };
}

/**
 * Genera un codigo y lo DEVUELVE, para que quien gestiona la obra se lo dicte
 * o se lo mande por WhatsApp. Es la via para quien no tiene correo.
 *
 * Exige permiso de gestion: aqui el codigo si sale en claro.
 */
export async function generarCodigoParaEntregar(
  sesion: SesionActiva,
  obraId: string,
  paseId: string,
): Promise<ResultadoCodigo> {
  if (!puede(sesion, "lookahead:gestionar")) {
    return { ok: false, error: "No tienes permiso para generar codigos." };
  }

  const pase = await prisma.paseObra.findFirst({
    where: {
      id: paseId,
      projectId: obraId,
      activo: true,
      project: { companyId: sesion.companyId },
    },
    select: { id: true, nombres: true, email: true, celular: true },
  });
  if (!pase) return { ok: false, error: "Pase no encontrado o revocado." };

  const codigo = await sembrarCodigo(pase.id);

  // Ademas de devolverlo para dictarlo, se intenta mandar por sus canales:
  // puede llegar antes de que el residente termine de escribir el WhatsApp.
  const repartido = await repartirCodigo(pase, codigo);
  const enviadoA = repartido.porSms
    ? (pase.celular ?? undefined)
    : repartido.porCorreo
      ? (pase.email ?? undefined)
      : undefined;

  await prisma.auditLog.create({
    data: {
      companyId: sesion.companyId,
      userId: sesion.userId,
      projectId: obraId,
      entidad: "PaseObra",
      entidadId: paseId,
      accion: "UPDATE",
      // El codigo NUNCA se audita, igual que no se auditan las claves.
      despues: {
        evento: "codigo_generado",
        porSms: repartido.porSms,
        porCorreo: repartido.porCorreo,
      },
    },
  });

  return { ok: true, codigo, enviadoA };
}

/** Demasiados codigos en poco rato. Frena el bombardeo de un buzon. */
async function pasoElLimite(paseId: string): Promise<boolean> {
  const desde = new Date(Date.now() - VENTANA_CODIGOS_MINUTOS * 60_000);
  const recientes = await prisma.codigoPase.count({
    where: { paseId, createdAt: { gt: desde } },
  });
  return recientes >= MAX_CODIGOS_POR_VENTANA;
}

/** Crea el desafio, deja la cookie y devuelve el codigo en claro. */
async function sembrarCodigo(paseId: string): Promise<string> {
  const token = generateToken();
  const codigo = generateNumericCode(LONGITUD_CODIGO);

  await prisma.codigoPase.create({
    data: {
      paseId,
      tokenHash: hashToken(token),
      codigoHash: hashToken(codigo),
      expiresAt: new Date(Date.now() + VIGENCIA_CODIGO_MINUTOS * 60_000),
    },
  });

  const almacen = await cookies();
  almacen.set(COOKIE_DESAFIO_PASE, token, {
    httpOnly: true,
    secure: isProduction,
    sameSite: "lax",
    path: "/",
    maxAge: VIGENCIA_CODIGO_MINUTOS * 60,
  });

  return codigo;
}

/**
 * Comprueba el codigo tecleado y, si acierta, reconoce el telefono.
 *
 * A diferencia del segundo factor de los usuarios, aqui SI se abre el acceso
 * en el mismo sitio: no hay clave previa ni un segundo paso que separar.
 */
export async function verificarCodigoPase(
  obraId: string,
  entrada: string,
  meta: { ip?: string; userAgent?: string } = {},
): Promise<ResultadoPase> {
  const almacen = await cookies();
  const token = almacen.get(COOKIE_DESAFIO_PASE)?.value;

  const CADUCADO = "El codigo caduco o ya no vale. Pide otro.";
  if (!token) return { ok: false, error: CADUCADO };

  const desafio = await prisma.codigoPase.findUnique({
    where: { tokenHash: hashToken(token) },
    select: {
      id: true,
      paseId: true,
      codigoHash: true,
      intentos: true,
      expiresAt: true,
      pase: {
        select: {
          id: true, projectId: true, activo: true,
          nombres: true, apellidos: true,
          project: { select: { companyId: true, estado: true } },
        },
      },
    },
  });

  if (!desafio || desafio.expiresAt <= new Date()) {
    await olvidarDesafioPase();
    return { ok: false, error: CADUCADO };
  }

  // El desafio es de ESTA obra, y el pase sigue sirviendo. Ambas cosas
  // pueden haber cambiado entre pedir el codigo y teclearlo.
  if (
    desafio.pase.projectId !== obraId ||
    !desafio.pase.activo ||
    desafio.pase.project.estado === "CERRADA"
  ) {
    await olvidarDesafioPase();
    return { ok: false, error: CADUCADO };
  }

  const esperado = Buffer.from(desafio.codigoHash, "hex");
  const recibido = Buffer.from(hashToken(normalizarCodigo(entrada)), "hex");

  // En tiempo constante, por lo mismo que en el segundo factor: comparar con
  // `===` tarda mas cuantas mas cifras coinciden, y ese tiempo permite ir
  // adivinando el codigo cifra a cifra.
  const acierta =
    esperado.length === recibido.length && timingSafeEqual(esperado, recibido);

  if (!acierta) {
    const intentos = desafio.intentos + 1;

    if (intentos >= MAX_INTENTOS_CODIGO) {
      await olvidarDesafioPase();
      return {
        ok: false,
        error: "Demasiados intentos. Pide un codigo nuevo.",
      };
    }

    await prisma.codigoPase.update({
      where: { id: desafio.id },
      data: { intentos },
    });

    const quedan = MAX_INTENTOS_CODIGO - intentos;
    return {
      ok: false,
      error: `Codigo incorrecto. Te quedan ${quedan} intento(s).`,
    };
  }

  // Acertado: el codigo se gasta y el telefono queda reconocido.
  await olvidarDesafioPase();

  const tokenSesion = generateToken();
  await prisma.sesionPase.create({
    data: {
      paseId: desafio.paseId,
      tokenHash: hashToken(tokenSesion),
      expiresAt: new Date(Date.now() + VIGENCIA_PASE_DIAS * 24 * 60 * 60_000),
      ip: meta.ip?.slice(0, 45) ?? null,
      userAgent: meta.userAgent?.slice(0, 255) ?? null,
    },
  });

  almacen.set(COOKIE_PASE, tokenSesion, {
    httpOnly: true,
    secure: isProduction,
    sameSite: "lax",
    path: "/",
    maxAge: VIGENCIA_PASE_DIAS * 24 * 60 * 60,
  });

  await prisma.auditLog.create({
    data: {
      companyId: desafio.pase.project.companyId,
      // Un pase no es un usuario: la columna queda vacia a proposito y el
      // rastro va en `despues`. `userId` no tiene clave foranea, asi que
      // esto es legitimo y no rompe nada.
      userId: null,
      projectId: obraId,
      entidad: "PaseObra",
      entidadId: desafio.paseId,
      accion: "LOGIN",
      despues: {
        evento: "acceso_con_codigo",
        nombre: nombreDePase(desafio.pase),
      },
      ip: meta.ip?.slice(0, 45) ?? null,
      userAgent: meta.userAgent?.slice(0, 255) ?? null,
    },
  });

  return { ok: true };
}

export async function olvidarDesafioPase(): Promise<void> {
  const almacen = await cookies();
  const token = almacen.get(COOKIE_DESAFIO_PASE)?.value;

  if (token) {
    await prisma.codigoPase
      .deleteMany({ where: { tokenHash: hashToken(token) } })
      .catch(() => {});
  }

  almacen.delete(COOKIE_DESAFIO_PASE);
}

/** Hay un codigo pedido y todavia sirve: decide que pantalla se pinta. */
export async function hayCodigoPendiente(): Promise<boolean> {
  const token = (await cookies()).get(COOKIE_DESAFIO_PASE)?.value;
  if (!token) return false;

  const desafio = await prisma.codigoPase.findUnique({
    where: { tokenHash: hashToken(token) },
    select: { expiresAt: true },
  });

  return Boolean(desafio && desafio.expiresAt > new Date());
}

/**
 * El pase de quien esta usando el telefono, o null.
 *
 * Se comprueba TODO en cada peticion —que el pase siga activo, que la obra
 * no este cerrada y que la empresa no este suspendida— porque la cookie dura
 * un ano: revocar a alguien tiene que echarlo al instante, no dentro de once
 * meses.
 */
export async function obtenerPase(obraId: string): Promise<PaseActivo | null> {
  const almacen = await cookies();
  const token = almacen.get(COOKIE_PASE)?.value;
  if (!token) return null;

  const sesion = await prisma.sesionPase.findUnique({
    where: { tokenHash: hashToken(token) },
    select: {
      id: true,
      expiresAt: true,
      pase: {
        select: {
          id: true, projectId: true, activo: true,
          nombres: true, apellidos: true,
          project: { select: { companyId: true, estado: true, company: { select: { activa: true } } } },
        },
      },
    },
  });

  if (!sesion) return null;

  const vale =
    sesion.expiresAt > new Date() &&
    sesion.pase.activo &&
    sesion.pase.projectId === obraId &&
    sesion.pase.project.estado !== "CERRADA" &&
    sesion.pase.project.company.activa;

  if (!vale) {
    // Solo se borra la fila si de verdad murio. Si lo que falla es que el
    // pase es de OTRA obra, la sesion sigue siendo buena para la suya.
    if (sesion.expiresAt <= new Date() || !sesion.pase.activo) {
      await prisma.sesionPase.delete({ where: { id: sesion.id } }).catch(() => {});
    }
    return null;
  }

  return {
    paseId: sesion.pase.id,
    obraId: sesion.pase.projectId,
    companyId: sesion.pase.project.companyId,
    nombre: nombreDePase(sesion.pase),
  };
}

export async function cerrarPase(): Promise<void> {
  const almacen = await cookies();
  const token = almacen.get(COOKIE_PASE)?.value;

  if (token) {
    await prisma.sesionPase
      .deleteMany({ where: { tokenHash: hashToken(token) } })
      .catch(() => {});
  }

  almacen.delete(COOKIE_PASE);
}
