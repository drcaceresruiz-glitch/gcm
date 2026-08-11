import "server-only";

import { prisma } from "@/lib/prisma";
import { puede } from "@/lib/rbac";
import { ETIQUETA_ROL, ROLES } from "@/lib/rbac";
import { FLUJOS_RESTRICCION } from "@/lib/lookahead";
import {
  canalesEfectivos,
  validarContacto,
  validarSuscripcion,
  type Canales,
  type DatosContacto,
  type Momentos,
  type Persona,
} from "@/lib/avisos";
import { motivoSiObraCerrada } from "@/services/obra-abierta";
import type { Role, TipoRestriccion } from "@/generated/prisma/enums";
import type { CanalAviso } from "@/generated/prisma/enums";
import type { SesionActiva } from "@/services/sesion.service";

/**
 * Quien se entera de las restricciones de una obra.
 *
 * GCM ya sabia, con dias de antelacion, que a una tarea le falta el plano; lo
 * que no hacia era decirlo. Aqui se configura a QUIEN se le dice, DE QUE y POR
 * DONDE. El envio en si no vive en este archivo: lo hace el reloj, que deriva
 * de las tablas del Lookahead lo que toca avisar.
 *
 * Manda `lookahead:gestionar` y no un permiso propio. Es la misma decision, y
 * por el mismo motivo, que la pantalla de Personal de la obra: quien analiza
 * las restricciones es quien sabe quien responde de cada flujo, y "cada
 * permiso nuevo hay que concederlo empresa por empresa, y uno que en la
 * practica siempre acompana a otro solo sirve para que un dia falte".
 *
 * Lo que si hay que decir en voz alta: esto abre un canal de salida de
 * informacion de obra hacia fuera —un contacto externo recibe nombres de
 * tareas por correo—. Por eso cada alta se audita.
 */

export type ResultadoAviso = { ok: true } | { ok: false; error: string };

function quien(sesion: SesionActiva): string {
  return `${sesion.nombres} ${sesion.apellidos}`.trim().slice(0, 150);
}

/// Los ajustes por defecto de una obra que aun no los ha tocado. Se devuelven
/// tal cual en vez de crear la fila al leer: leer no debe escribir.
const AJUSTES_POR_DEFECTO = {
  activo: true,
  diasRecordatorio: 3,
  horaResumen: 7,
  maxSmsDia: 20,
};

// ---------------------------------------------------------------------------
// Lectura
// ---------------------------------------------------------------------------

export interface SuscripcionVista {
  id: string;
  tipo: TipoRestriccion | null;
  canales: Canales;
  momentos: Momentos;
}

/// Lo que una persona RECIBIRIA de verdad, ya pasado por `canalesEfectivos`.
/// La pantalla ensena esto y no lo pedido: "pediste SMS pero su celular no
/// esta verificado, le llegara por correo".
export interface Efectivo {
  canales: CanalAviso[];
  sinCanal: boolean;
}

export interface FilaPersona {
  clave: string;
  id: string;
  nombre: string;
  detalle: string | null;
  email: string | null;
  celular: string | null;
  celularUtil: boolean;
  suscripciones: SuscripcionVista[];
  efectivo: Efectivo;
}

export interface FilaRol {
  rol: Role;
  etiqueta: string;
  cuantos: number;
  suscripciones: SuscripcionVista[];
}

export interface ImplicadosObra {
  ajustes: typeof AJUSTES_POR_DEFECTO;
  /// Los usuarios con membresia en la obra.
  usuarios: FilaPersona[];
  /// Los cinco roles, con a cuanta gente alcanzan en ESTA obra.
  roles: FilaRol[];
  /// La gente de fuera.
  externos: FilaPersona[];
  /**
   * Los 7 flujos con a cuanta gente avisa cada uno.
   *
   * Es la vista que hace ver de un golpe que MATERIALES no tiene a nadie
   * detras, que es justo el caso que hay que ver: un flujo sin destinatarios
   * es una restriccion que se abre y de la que no se entera nadie.
   */
  porFlujo: {
    tipo: TipoRestriccion;
    etiqueta: string;
    descripcion: string;
    destinatarios: number;
  }[];
  puedeConfigurar: boolean;
}

/**
 * Todo lo que la pantalla de avisos de una obra necesita.
 *
 * Null sin permiso de lectura: la pantalla no se pinta en vez de ensenar una
 * caja vacia que parece rota.
 */
export async function obtenerImplicados(
  sesion: SesionActiva,
  obraId: string,
): Promise<ImplicadosObra | null> {
  if (!puede(sesion, "lookahead:leer")) return null;

  const obra = await prisma.project.findFirst({
    where: { id: obraId, companyId: sesion.companyId },
    select: { id: true },
  });
  if (!obra) return null;

  const [ajustes, miembros, contactos, suscripciones] = await Promise.all([
    prisma.ajustesAvisosObra.findUnique({
      where: { projectId: obraId },
      select: {
        activo: true,
        diasRecordatorio: true,
        horaResumen: true,
        maxSmsDia: true,
      },
    }),
    prisma.projectMembership.findMany({
      where: { projectId: obraId },
      select: {
        role: true,
        user: {
          select: {
            id: true,
            nombres: true,
            apellidos: true,
            cargo: true,
            email: true,
            celular: true,
            celularVerificadoAt: true,
          },
        },
      },
    }),
    prisma.contactoAviso.findMany({
      where: { projectId: obraId, activo: true },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        nombre: true,
        empresa: true,
        cargo: true,
        email: true,
        celular: true,
      },
    }),
    prisma.suscripcionAviso.findMany({
      where: { projectId: obraId },
      orderBy: { createdAt: "asc" },
    }),
  ]);

  const vista = (s: (typeof suscripciones)[number]): SuscripcionVista => ({
    id: s.id,
    tipo: s.tipo,
    canales: { app: s.porApp, correo: s.porCorreo, sms: s.porSms },
    momentos: {
      alAbrir: s.alAbrir,
      alRecordar: s.alRecordar,
      alQuedarLista: s.alQuedarLista,
      enResumen: s.enResumen,
    },
  });

  const usuarios: FilaPersona[] = miembros.map((m) => {
    const u = m.user;
    const suyas = suscripciones.filter((s) => s.userId === u.id);
    const persona: Persona = {
      clave: `u:${u.id}`,
      nombre: `${u.nombres} ${u.apellidos}`.trim(),
      email: u.email,
      celular: u.celular,
      celularUtil: u.celularVerificadoAt !== null,
      tieneBandeja: true,
    };
    return {
      clave: persona.clave,
      id: u.id,
      nombre: persona.nombre,
      detalle: u.cargo ?? ETIQUETA_ROL[m.role],
      email: u.email,
      celular: u.celular,
      celularUtil: persona.celularUtil,
      suscripciones: suyas.map(vista),
      efectivo: efectivoDe(persona, suyas.map(vista)),
    };
  });

  const externos: FilaPersona[] = contactos.map((c) => {
    const suyas = suscripciones.filter((s) => s.contactoId === c.id);
    const persona: Persona = {
      clave: `c:${c.id}`,
      nombre: c.nombre,
      email: c.email,
      celular: c.celular,
      // Lo normalizo el residente al darlo de alta y no hay a quien pedirle
      // que se verifique: si hay numero, sirve.
      celularUtil: c.celular !== null,
      tieneBandeja: false,
    };
    return {
      clave: persona.clave,
      id: c.id,
      nombre: c.nombre,
      detalle: [c.cargo, c.empresa].filter(Boolean).join(" · ") || null,
      email: c.email,
      celular: c.celular,
      celularUtil: persona.celularUtil,
      suscripciones: suyas.map(vista),
      efectivo: efectivoDe(persona, suyas.map(vista)),
    };
  });

  const cuantosPorRol = new Map<Role, number>();
  for (const m of miembros) {
    cuantosPorRol.set(m.role, (cuantosPorRol.get(m.role) ?? 0) + 1);
  }

  const roles: FilaRol[] = ROLES.map((rol) => ({
    rol,
    etiqueta: ETIQUETA_ROL[rol],
    cuantos: cuantosPorRol.get(rol) ?? 0,
    suscripciones: suscripciones.filter((s) => s.rol === rol).map(vista),
  })).filter((r) => r.cuantos > 0 || r.suscripciones.length > 0);

  // Cuanta gente cubre cada flujo. Una suscripcion sin tipo cubre los siete.
  const porFlujo = FLUJOS_RESTRICCION.map((f) => {
    const alcanzan = suscripciones.filter(
      (s) => s.tipo === null || s.tipo === f.tipo,
    );
    const personas = new Set<string>();
    for (const s of alcanzan) {
      if (s.userId) personas.add(`u:${s.userId}`);
      else if (s.contactoId) personas.add(`c:${s.contactoId}`);
      else if (s.rol) {
        for (const m of miembros) {
          if (m.role === s.rol) personas.add(`u:${m.user.id}`);
        }
      }
    }
    return {
      tipo: f.tipo,
      etiqueta: f.etiqueta,
      descripcion: f.descripcion,
      destinatarios: personas.size,
    };
  });

  return {
    ajustes: ajustes ?? AJUSTES_POR_DEFECTO,
    usuarios,
    roles,
    externos,
    porFlujo,
    puedeConfigurar: puede(sesion, "lookahead:gestionar"),
  };
}

/// La union de lo que le llegaria por todas sus suscripciones.
function efectivoDe(
  persona: Persona,
  suscripciones: readonly SuscripcionVista[],
): Efectivo {
  if (suscripciones.length === 0) {
    return { canales: [], sinCanal: false };
  }

  const pedidos: Canales = {
    app: suscripciones.some((s) => s.canales.app),
    correo: suscripciones.some((s) => s.canales.correo),
    sms: suscripciones.some((s) => s.canales.sms),
  };
  return canalesEfectivos(persona, pedidos);
}

// ---------------------------------------------------------------------------
// Escritura
// ---------------------------------------------------------------------------

/**
 * Permiso, obra abierta y obra de la empresa, en ese orden. Devuelve el motivo
 * si no se puede escribir, o null si via libre.
 */
async function puerta(
  sesion: SesionActiva,
  obraId: string,
): Promise<string | null> {
  if (!puede(sesion, "lookahead:gestionar")) {
    return "No tienes permiso para configurar los avisos de esta obra.";
  }
  const cerrada = await motivoSiObraCerrada(sesion, obraId);
  if (cerrada) return cerrada;

  const obra = await prisma.project.findFirst({
    where: { id: obraId, companyId: sesion.companyId },
    select: { id: true },
  });
  return obra ? null : "Obra no encontrada.";
}

export interface DatosAjustes {
  activo: boolean;
  diasRecordatorio: number;
  horaResumen: number;
  maxSmsDia: number;
}

/** Los ajustes de avisos de la obra. Se crean al guardarlos por primera vez. */
export async function guardarAjustes(
  sesion: SesionActiva,
  obraId: string,
  datos: DatosAjustes,
): Promise<ResultadoAviso> {
  const error = await puerta(sesion, obraId);
  if (error) return { ok: false, error };

  // Se acotan en vez de rechazar: son numeros de una pantalla y un valor raro
  // no puede tumbar la configuracion entera. Pero el tope de SMS SI se cierra
  // arriba, porque detras hay una SIM de verdad que se paga.
  const dias = Math.min(30, Math.max(1, Math.trunc(datos.diasRecordatorio)));
  const hora = Math.min(23, Math.max(0, Math.trunc(datos.horaResumen)));
  const maxSms = Math.min(100, Math.max(0, Math.trunc(datos.maxSmsDia)));

  const valores = {
    activo: datos.activo,
    diasRecordatorio: dias,
    horaResumen: hora,
    maxSmsDia: maxSms,
  };

  await prisma.$transaction(async (tx) => {
    await tx.ajustesAvisosObra.upsert({
      where: { projectId: obraId },
      create: { projectId: obraId, ...valores },
      update: valores,
    });
    await tx.auditLog.create({
      data: {
        companyId: sesion.companyId,
        userId: sesion.userId,
        projectId: obraId,
        entidad: "AjustesAvisosObra",
        entidadId: obraId,
        accion: "UPDATE",
        despues: valores,
      },
    });
  });

  return { ok: true };
}

export interface DatosNuevaSuscripcion {
  userId?: string | null;
  rol?: Role | null;
  contactoId?: string | null;
  tipo: TipoRestriccion | null;
  canales: Canales;
  momentos: Momentos;
}

/**
 * Da de alta o actualiza una regla de aviso.
 *
 * El sujeto se comprueba contra la obra, no se cree: un `userId` que llega del
 * cliente tiene que ser de alguien con membresia AQUI, y un `contactoId`, de
 * un contacto de ESTA obra. Sin eso, la pantalla de una obra podria suscribir
 * a alguien de otra empresa y mandarle nombres de tareas ajenas.
 */
export async function guardarSuscripcion(
  sesion: SesionActiva,
  obraId: string,
  datos: DatosNuevaSuscripcion,
): Promise<ResultadoAviso> {
  const error = await puerta(sesion, obraId);
  if (error) return { ok: false, error };

  const v = validarSuscripcion(datos);
  if (!v.ok) return { ok: false, error: v.error };

  if (datos.userId) {
    const miembro = await prisma.projectMembership.findFirst({
      where: { projectId: obraId, userId: datos.userId },
      select: { id: true },
    });
    if (!miembro) {
      return { ok: false, error: "Esa persona no está asignada a esta obra." };
    }
  }

  if (datos.contactoId) {
    const contacto = await prisma.contactoAviso.findFirst({
      where: { id: datos.contactoId, projectId: obraId, activo: true },
      select: { id: true },
    });
    if (!contacto) return { ok: false, error: "Contacto no encontrado." };
  }

  const valores = {
    projectId: obraId,
    userId: datos.userId ?? null,
    rol: datos.rol ?? null,
    contactoId: datos.contactoId ?? null,
    tipo: datos.tipo,
    porApp: datos.canales.app,
    porCorreo: datos.canales.correo,
    porSms: datos.canales.sms,
    alAbrir: datos.momentos.alAbrir,
    alRecordar: datos.momentos.alRecordar,
    alQuedarLista: datos.momentos.alQuedarLista,
    enResumen: datos.momentos.enResumen,
    creadoPor: quien(sesion),
  };

  await prisma.$transaction(async (tx) => {
    const creada = await tx.suscripcionAviso.create({
      data: valores,
      select: { id: true },
    });
    await tx.auditLog.create({
      data: {
        companyId: sesion.companyId,
        userId: sesion.userId,
        projectId: obraId,
        entidad: "SuscripcionAviso",
        entidadId: creada.id,
        accion: "CREATE",
        despues: {
          sujeto: datos.userId ?? datos.rol ?? datos.contactoId ?? null,
          tipo: datos.tipo,
          // Aplanado y no el objeto: `despues` es JSON de Prisma y una
          // interfaz sin indice de cadena no encaja ahi.
          app: datos.canales.app,
          correo: datos.canales.correo,
          sms: datos.canales.sms,
        },
      },
    });
  });

  return { ok: true };
}

/** Quita una regla de aviso. */
export async function borrarSuscripcion(
  sesion: SesionActiva,
  obraId: string,
  id: string,
): Promise<ResultadoAviso> {
  const error = await puerta(sesion, obraId);
  if (error) return { ok: false, error };

  // Con `projectId` en el where y nunca por id suelto: el id llega del cliente.
  const { count } = await prisma.suscripcionAviso.deleteMany({
    where: { id, projectId: obraId },
  });
  if (count === 0) return { ok: false, error: "Esa regla ya no existe." };

  await prisma.auditLog.create({
    data: {
      companyId: sesion.companyId,
      userId: sesion.userId,
      projectId: obraId,
      entidad: "SuscripcionAviso",
      entidadId: id,
      accion: "DELETE",
    },
  });

  return { ok: true };
}

/**
 * Da de alta a alguien de FUERA de GCM.
 *
 * Se audita siempre, y no por formalidad: es el punto por el que salen nombres
 * de tareas de la obra hacia un correo que no controla la empresa. Que quede
 * escrito quien abrio ese canal y cuando.
 */
export async function altaContacto(
  sesion: SesionActiva,
  obraId: string,
  datos: DatosContacto,
): Promise<ResultadoAviso> {
  const error = await puerta(sesion, obraId);
  if (error) return { ok: false, error };

  const v = validarContacto(datos);
  if (!v.ok) return { ok: false, error: v.error };

  const repetido = await prisma.contactoAviso.findFirst({
    where: {
      projectId: obraId,
      OR: [
        ...(v.datos.email ? [{ email: v.datos.email }] : []),
        ...(v.datos.celular ? [{ celular: v.datos.celular }] : []),
      ],
    },
    select: { nombre: true },
  });
  if (repetido) {
    return {
      ok: false,
      error: `Ese contacto ya está en la obra como "${repetido.nombre}".`,
    };
  }

  await prisma.$transaction(async (tx) => {
    const creado = await tx.contactoAviso.create({
      data: { projectId: obraId, ...v.datos, creadoPor: quien(sesion) },
      select: { id: true },
    });
    await tx.auditLog.create({
      data: {
        companyId: sesion.companyId,
        userId: sesion.userId,
        projectId: obraId,
        entidad: "ContactoAviso",
        entidadId: creado.id,
        accion: "CREATE",
        despues: {
          nombre: v.datos.nombre,
          empresa: v.datos.empresa,
          email: v.datos.email,
          celular: v.datos.celular,
        },
      },
    });
  });

  return { ok: true };
}

/**
 * Da de baja a un contacto externo.
 *
 * No borra la fila: los avisos que ya se le mandaron tienen que seguir
 * teniendo a quien senalar. Sus suscripciones se van con el, que es lo que
 * corta el envio de verdad.
 */
export async function bajaContacto(
  sesion: SesionActiva,
  obraId: string,
  id: string,
): Promise<ResultadoAviso> {
  const error = await puerta(sesion, obraId);
  if (error) return { ok: false, error };

  const { count } = await prisma.contactoAviso.updateMany({
    where: { id, projectId: obraId, activo: true },
    data: { activo: false, bajaAt: new Date() },
  });
  if (count === 0) return { ok: false, error: "Contacto no encontrado." };

  await prisma.$transaction(async (tx) => {
    await tx.suscripcionAviso.deleteMany({
      where: { contactoId: id, projectId: obraId },
    });
    await tx.auditLog.create({
      data: {
        companyId: sesion.companyId,
        userId: sesion.userId,
        projectId: obraId,
        entidad: "ContactoAviso",
        entidadId: id,
        accion: "UPDATE",
        despues: { evento: "baja" },
      },
    });
  });

  return { ok: true };
}
