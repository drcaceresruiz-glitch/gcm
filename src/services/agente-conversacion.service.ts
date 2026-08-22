import "server-only";

import { after } from "next/server";
import { prisma } from "@/lib/prisma";
import { puede } from "@/lib/rbac";
import { SIN_PROVEEDOR_ACTIVO } from "@/lib/agente-conversacion";
import {
  conversar,
  configuracionProveedorActivo,
  type HerramientaAgente,
} from "@/services/agente-ia.service";
import { listarObras, obtenerResumenEmpresa } from "@/services/obras.service";
import {
  semaforoDeCartera,
  sobregiroProyectadoDeCartera,
  confiabilidadDeCartera,
} from "@/services/gerencia.service";
import type { SesionActiva } from "@/services/sesion.service";
import type { RolAgente } from "@/generated/prisma/enums";

/**
 * El agente conversacional — Fase 2a, SOLO LECTURA.
 *
 * Un turno con tool-use puede tardar 10-30s: no puede correr sincrono
 * dentro de un Server Action ocupando uno de los 20 Entry Processes de
 * este hosting. El patron es el de `ProbarSms.tsx`
 * (`src/app/(dashboard)/empresa/configuracion/acciones.ts`): una accion
 * crea la fila y devuelve su id de inmediato; el cliente sondea otra
 * accion cada pocos segundos hasta que termina. Aqui la ejecucion real se
 * dispara con `after()` de Next, dentro de la MISMA Server Action que ya
 * tiene la sesion -`obtenerSesion()` exige `cookies()` de una peticion
 * real, asi que no hay forma de reconstruirla en un worker desconectado-.
 *
 * NADA de escritura en esta entrega: las herramientas de abajo son todas
 * de lectura, ya pagadas -no hacen ninguna consulta que la pantalla no
 * haga ya-. Herramientas que creen o cambien datos, con su patron de
 * proponer-y-confirmar, quedan para la Fase 2b.
 */

const MAX_MENSAJE = 4000;
/// Tope de vueltas de herramienta por turno. Si el modelo no llega a una
/// respuesta de texto en este numero de idas y vueltas, se corta y se
/// explica -nunca un bucle silencioso pagando llamadas sin fin-.
const MAX_VUELTAS = 6;

const SISTEMA = [
  "Eres el asistente de GCM (Gestión en Construcción Moderna), una app de gestión de obras de construcción.",
  "Respondes preguntas sobre la cartera de obras de quien te escribe, usando SOLO las herramientas disponibles.",
  "Nunca inventes cifras: si una herramienta no trae un dato, dilo en vez de adivinar.",
  "Si una herramienta devuelve vacío o dice que no hay permiso, explícalo con naturalidad, no como un error técnico.",
  "Sé breve y concreto. Responde en español.",
].join(" ");

// ---------------------------------------------------------------------------
// Las herramientas — envoltorios delgados sobre servicios que ya existen
// ---------------------------------------------------------------------------

const HERRAMIENTAS: HerramientaAgente[] = [
  {
    nombre: "listar_obras",
    descripcion:
      "Lista las obras de la cartera, opcionalmente filtradas por texto (nombre o código) o por estado (PLANIFICACION, EN_EJECUCION, PARALIZADA, CERRADA). Úsala primero cuando la pregunta sea sobre una obra en particular, para saber su nombre exacto.",
    esquema: {
      type: "object",
      properties: {
        q: { type: "string", description: "Texto libre sobre nombre o código de obra." },
        estado: {
          type: "string",
          enum: ["PLANIFICACION", "EN_EJECUCION", "PARALIZADA", "CERRADA"],
        },
      },
    },
    ejecutar: async (sesion, args) => {
      const a = (args ?? {}) as { q?: string; estado?: string };
      return listarObras(sesion, { q: a.q, estado: a.estado, porPagina: 20 });
    },
  },
  {
    nombre: "resumen_empresa",
    descripcion:
      "Resumen de toda la cartera: cuántas obras hay y, si hay exactamente una en ejecución, su presupuesto y comprometido. Para preguntas generales sobre el estado de la empresa.",
    esquema: { type: "object", properties: {} },
    ejecutar: async (sesion) => obtenerResumenEmpresa(sesion),
  },
  {
    nombre: "semaforo_cartera",
    descripcion:
      "El semáforo de partidas críticas de toda la cartera: cuántas partidas de la ruta crítica van atrasadas, en qué obras, y el SPI por duración de cada una.",
    esquema: { type: "object", properties: {} },
    ejecutar: async (sesion) => semaforoDeCartera(sesion),
  },
  {
    nombre: "sobregiro_cartera",
    descripcion:
      "Qué obras se están comprometiendo más rápido de lo que avanzan -sobregiro proyectado-, comparando el avance físico contra lo comprometido sobre presupuesto.",
    esquema: { type: "object", properties: {} },
    ejecutar: async (sesion) => sobregiroProyectadoDeCartera(sesion),
  },
  {
    nombre: "confiabilidad_cartera",
    descripcion:
      "El PPC (porcentaje del plan cumplido) de la última semana cerrada de cada obra, para saber qué tan confiable está siendo el plan semanal.",
    esquema: { type: "object", properties: {} },
    ejecutar: async (sesion) => confiabilidadDeCartera(sesion),
  },
];

// ---------------------------------------------------------------------------
// Lo que usa la pantalla
// ---------------------------------------------------------------------------

export interface MensajeAgenteResumen {
  id: string;
  rol: RolAgente;
  contenido: string;
  terminado: boolean;
  error: string | null;
  createdAt: Date;
}

function mapearMensaje(f: {
  id: string;
  rol: RolAgente;
  contenido: string;
  terminadoAt: Date | null;
  error: string | null;
  iniciadoAt: Date;
}): MensajeAgenteResumen {
  return {
    id: f.id,
    rol: f.rol,
    contenido: f.contenido,
    terminado: f.terminadoAt !== null,
    error: f.error,
    createdAt: f.iniciadoAt,
  };
}

/** El historial de una conversación, la más antigua primero. */
export async function historialDeConversacion(
  sesion: SesionActiva,
  conversacionId: string,
): Promise<MensajeAgenteResumen[]> {
  if (!puede(sesion, "agente_ia:usar")) return [];

  const conv = await prisma.conversacionAgente.findFirst({
    where: { id: conversacionId, companyId: sesion.companyId, userId: sesion.userId },
    select: { id: true },
  });
  if (!conv) return [];

  const filas = await prisma.mensajeAgente.findMany({
    where: { conversacionId },
    orderBy: { iniciadoAt: "asc" },
    select: {
      id: true,
      rol: true,
      contenido: true,
      terminadoAt: true,
      error: true,
      iniciadoAt: true,
    },
  });

  return filas.map(mapearMensaje);
}

/**
 * La conversación más reciente de quien pregunta, si tiene alguna.
 *
 * Una sola conversación "activa" por usuario basta para esta entrega —no
 * hay todavía un archivo navegable de varias, ver el comentario de
 * arriba—.
 */
export async function conversacionReciente(
  sesion: SesionActiva,
): Promise<{ id: string; mensajes: MensajeAgenteResumen[] } | null> {
  if (!puede(sesion, "agente_ia:usar")) return null;

  const conv = await prisma.conversacionAgente.findFirst({
    where: { companyId: sesion.companyId, userId: sesion.userId },
    orderBy: { createdAt: "desc" },
    select: { id: true },
  });
  if (!conv) return null;

  return { id: conv.id, mensajes: await historialDeConversacion(sesion, conv.id) };
}

export type ResultadoTurno =
  | { ok: true; conversacionId: string; mensajeAsistenteId: string }
  | { ok: false; error: string };

/**
 * Manda un mensaje al asistente: crea la fila del usuario y la del
 * asistente (vacía, `terminadoAt: null`) y devuelve el id de esta última
 * DE INMEDIATO, antes de que el proveedor conteste. La ejecución real
 * sigue en `after()` — ver el comentario de cabecera.
 */
export async function iniciarTurno(
  sesion: SesionActiva,
  conversacionId: string | null,
  mensaje: string,
): Promise<ResultadoTurno> {
  if (!puede(sesion, "agente_ia:usar")) {
    return { ok: false, error: "No tienes permiso para usar el asistente." };
  }

  const texto = mensaje.trim();
  if (!texto) return { ok: false, error: "Escribe algo primero." };
  if (texto.length > MAX_MENSAJE) {
    return { ok: false, error: `El mensaje no puede pasar de ${MAX_MENSAJE} caracteres.` };
  }

  // Si el id no es una conversacion propia -ajena, borrada, inventada- se
  // abre una nueva en silencio, nunca se falla: es mejor perder el hilo
  // que dejar un mensaje sin donde ir.
  const propia = conversacionId
    ? await prisma.conversacionAgente.findFirst({
        where: { id: conversacionId, companyId: sesion.companyId, userId: sesion.userId },
        select: { id: true },
      })
    : null;

  let convId = propia?.id ?? null;
  let mensajeAsistenteId = "";

  await prisma.$transaction(async (tx) => {
    if (!convId) {
      const nueva = await tx.conversacionAgente.create({
        data: { companyId: sesion.companyId, userId: sesion.userId },
        select: { id: true },
      });
      convId = nueva.id;
    }

    await tx.mensajeAgente.create({
      data: {
        conversacionId: convId,
        rol: "USUARIO",
        contenido: texto,
        terminadoAt: new Date(),
      },
    });

    const asistente = await tx.mensajeAgente.create({
      data: { conversacionId: convId, rol: "ASISTENTE", contenido: "", terminadoAt: null },
      select: { id: true },
    });
    mensajeAsistenteId = asistente.id;
  });

  const idConversacion = convId!;
  const idMensaje = mensajeAsistenteId;
  after(() => ejecutarTurno(sesion, idConversacion, idMensaje));

  return { ok: true, conversacionId: idConversacion, mensajeAsistenteId: idMensaje };
}

export interface EstadoTurno {
  contenido: string;
  terminado: boolean;
  error: string | null;
}

/** Lo que el cliente sondea cada pocos segundos, mismo patrón que `ProbarSms.tsx`. */
export async function estadoDeTurno(
  sesion: SesionActiva,
  mensajeAsistenteId: string,
): Promise<EstadoTurno | null> {
  if (!puede(sesion, "agente_ia:usar")) return null;

  const fila = await prisma.mensajeAgente.findFirst({
    where: {
      id: mensajeAsistenteId,
      conversacion: { companyId: sesion.companyId, userId: sesion.userId },
    },
    select: { contenido: true, terminadoAt: true, error: true },
  });
  if (!fila) return null;

  return { contenido: fila.contenido, terminado: fila.terminadoAt !== null, error: fila.error };
}

// ---------------------------------------------------------------------------
// La ejecución real — corre dentro de `after()`, nunca bloquea la respuesta
// ---------------------------------------------------------------------------

/// A partir de cuanto tiempo sin terminar se considera un turno muerto -el
/// proceso se reinicio a mitad de un `after()`, algo que un despliegue
/// puede provocar-. El sondeo del cliente ya tiene su propio tope de
/// espera (mismo patron que `ProbarSms.tsx`), asi que nadie se queda
/// mirando la pantalla esperando a este barrido: solo evita que la fila
/// se quede "pensando" para siempre en la base.
const TURNO_MUERTO_MS = 3 * 60 * 1000;

export interface ResumenBarridoTurnos {
  marcados: number;
}

/** Llamado desde el cron de `/api/reloj`, en su propio try/catch. */
export async function barridoDeTurnosMuertos(): Promise<ResumenBarridoTurnos> {
  const limite = new Date(Date.now() - TURNO_MUERTO_MS);
  const { count } = await prisma.mensajeAgente.updateMany({
    where: { terminadoAt: null, iniciadoAt: { lt: limite } },
    data: {
      terminadoAt: new Date(),
      error: "Se interrumpió antes de terminar (el servidor se reinició). Intenta de nuevo.",
    },
  });
  return { marcados: count };
}

async function marcarError(mensajeAsistenteId: string, error: string): Promise<void> {
  await prisma.mensajeAgente.update({
    where: { id: mensajeAsistenteId },
    data: { terminadoAt: new Date(), error: error.slice(0, 500) },
  });
}

async function ejecutarTurno(
  sesion: SesionActiva,
  conversacionId: string,
  mensajeAsistenteId: string,
): Promise<void> {
  try {
    const config = await configuracionProveedorActivo(sesion.companyId);
    if (!config) {
      await marcarError(mensajeAsistenteId, SIN_PROVEEDOR_ACTIVO);
      return;
    }

    // El historial hasta ahora: incluye el mensaje del usuario que disparo
    // este turno (ya tiene terminadoAt), y excluye la propia fila vacia
    // que se esta rellenando -y cualquier otra que quedara a medias, que
    // no deberia existir pero no se confia en que nunca pase-.
    const historial = await prisma.mensajeAgente.findMany({
      where: {
        conversacionId,
        id: { not: mensajeAsistenteId },
        terminadoAt: { not: null },
      },
      orderBy: { iniciadoAt: "asc" },
      select: { rol: true, contenido: true },
    });

    let mensajes: unknown[] = historial.map((m) => ({
      role: m.rol === "USUARIO" ? "user" : "assistant",
      content: m.contenido,
    }));

    const herramientasUsadas: string[] = [];

    for (let vuelta = 0; vuelta < MAX_VUELTAS; vuelta++) {
      const r = await conversar(config.tipo, config, {
        mensajes,
        herramientas: HERRAMIENTAS,
        sistema: SISTEMA,
      });

      if ("ok" in r) {
        // r: { ok: false; error: string }
        await marcarError(mensajeAsistenteId, r.error);
        return;
      }

      if (r.tipo === "texto") {
        await prisma.mensajeAgente.update({
          where: { id: mensajeAsistenteId },
          data: {
            contenido: r.texto,
            terminadoAt: new Date(),
            ...(herramientasUsadas.length > 0 ? { herramientas: herramientasUsadas } : {}),
          },
        });
        return;
      }

      // r.tipo === "usar_herramientas"
      mensajes = [...mensajes, { role: "assistant", content: r.bruto }];

      const resultados = await Promise.all(
        r.llamadas.map(async (ll) => {
          herramientasUsadas.push(ll.nombre);
          const herramienta = HERRAMIENTAS.find((h) => h.nombre === ll.nombre);
          if (!herramienta) {
            return { toolUseId: ll.id, contenido: `Herramienta desconocida: ${ll.nombre}` };
          }
          try {
            const resultado = await herramienta.ejecutar(sesion, ll.args);
            return { toolUseId: ll.id, contenido: JSON.stringify(resultado ?? null) };
          } catch (e) {
            // Incluye SinPermisoError y cualquier otro fallo del servicio
            // real: se le devuelve al modelo como texto, para que lo
            // explique con naturalidad en vez de tumbar el turno.
            const msg = e instanceof Error ? e.message : "No se pudo completar.";
            return { toolUseId: ll.id, contenido: `Error: ${msg}` };
          }
        }),
      );

      mensajes = [
        ...mensajes,
        {
          role: "user",
          content: resultados.map((res) => ({
            type: "tool_result",
            tool_use_id: res.toolUseId,
            content: res.contenido,
          })),
        },
      ];
    }

    await marcarError(
      mensajeAsistenteId,
      "Se agotaron los intentos de consultar información sin llegar a una respuesta. Intenta de nuevo o hazla más simple.",
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Fallo inesperado.";
    await marcarError(mensajeAsistenteId, msg).catch(() => {});
  }
}
