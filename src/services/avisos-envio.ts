import "server-only";

import { prisma } from "@/lib/prisma";
import {
  claveDeAviso,
  diaDeClave,
  repartirAvisos,
  textoAviso,
  type MotivoAviso,
  type Persona,
  type SuscripcionResuelta,
} from "@/lib/avisos";
import type { EventoAviso, TipoRestriccion } from "@/generated/prisma/enums";

/**
 * El despacho de avisos DENTRO de GCM.
 *
 * Va en su propio archivo y no en `avisos.service` por una diferencia que
 * importa: aquello es configuracion y exige sesion y permiso; esto lo llama
 * una accion que ya paso su puerta, o —mas adelante— el reloj, que no tiene
 * sesion ninguna. Mezclarlos obligaria a inventar una sesion falsa para el
 * cron, que es como se cuelan los agujeros.
 *
 * Aqui solo se escribe la campanita. El correo y el SMS no salen de una
 * peticion del usuario: `enviarCorreo` es sincrono y sin cola, y treinta
 * correos dentro de una accion de servidor la dejarian colgada hasta que
 * LiteSpeed la corte. Eso lo hara el reloj, por lotes.
 */

/// Cuantos avisos se escriben de una vez, pase lo que pase. Un lote absurdo
/// —alguien analiza doscientas tareas— no puede alargar la accion que lo pidio.
const MAX_AVISOS_POR_TANDA = 200;

export interface ContextoAviso {
  companyId: string;
  projectId: string;
}

/**
 * Escribe los avisos in-app de unos hechos. **NUNCA lanza.**
 *
 * Se llama FUERA de la transaccion de la operacion que lo origino y con su
 * propio try/catch, por la misma razon por la que `enviarCorreo` se traga sus
 * fallos: un aviso perdido es un incordio, pero una restriccion que no se
 * guardo por culpa de un aviso es un dato falso.
 */
export async function avisarEnApp(
  contexto: ContextoAviso,
  evento: EventoAviso,
  motivos: readonly MotivoAviso[],
): Promise<{ creados: number }> {
  if (motivos.length === 0) return { creados: 0 };

  try {
    return await despachar(contexto, evento, motivos);
  } catch (e) {
    console.error("[avisos] No se pudo avisar:", e);
    return { creados: 0 };
  }
}

async function despachar(
  contexto: ContextoAviso,
  evento: EventoAviso,
  motivos: readonly MotivoAviso[],
): Promise<{ creados: number }> {
  const { companyId, projectId } = contexto;

  const ajustes = await prisma.ajustesAvisosObra.findUnique({
    where: { projectId },
    select: { activo: true },
  });
  // Sin fila, la obra nunca configuro nada: se avisa igual, con los valores
  // por defecto. Lo que apaga es haberlo apagado a mano.
  if (ajustes && !ajustes.activo) return { creados: 0 };

  const resueltas = await suscripcionesResueltas(projectId);
  if (resueltas.length === 0) return { creados: 0 };

  // El reparto agrupa por persona: quien tiene seis restricciones recibe UN
  // aviso, no seis.
  const lotes = repartirAvisos(resueltas, motivos, evento).filter(
    (l) => l.canal === "APP",
  );
  if (lotes.length === 0) return { creados: 0 };

  const dia = diaDeClave(new Date());
  let creados = 0;

  for (const lote of lotes.slice(0, MAX_AVISOS_POR_TANDA)) {
    // Solo los usuarios de GCM tienen bandeja. `canalesEfectivos` ya lo
    // filtra, pero el id hace falta para escribir la fila.
    const userId = idDeUsuario(lote.persona);
    if (userId === null) continue;

    const texto = textoAviso(evento, lote.motivos);
    const ancla = lote.motivos
      .map((m) => `${m.uid}:${m.tipo}`)
      .sort()
      .join(",");
    const clave = claveDeAviso(evento, ancla, lote.persona.clave, dia);

    try {
      // La reserva va ANTES de escribir el aviso: es lo unico que impide que
      // el mismo aviso salga dos veces si la accion se reintenta o si dos
      // pasadas se solapan. El unico de la base es quien decide, no un `find`
      // previo, que tendria carrera.
      await prisma.envioAviso.create({
        data: {
          companyId,
          projectId,
          evento,
          canal: "APP",
          userId,
          clave,
          destino: userId,
          enviado: true,
        },
      });
    } catch {
      // Ya estaba: este aviso ya se le dio. No es un error.
      continue;
    }

    await prisma.aviso.create({
      data: {
        companyId,
        projectId,
        userId,
        evento,
        titulo: texto.titulo.slice(0, 200),
        cuerpo: texto.cuerpo.slice(0, 400),
        camino: "/lookahead",
      },
    });
    creados += 1;
  }

  return { creados };
}

/// "u:<id>" -> "<id>". Null para quien no es usuario de GCM.
function idDeUsuario(persona: Persona): string | null {
  return persona.clave.startsWith("u:") ? persona.clave.slice(2) : null;
}

/**
 * Las suscripciones de una obra con sus personas ya resueltas.
 *
 * El rol se resuelve contra la membresia DE ESTA OBRA y no contra el rol de
 * empresa: un residente puede llevar una obra y solo mirar otra, y avisarle de
 * la que no lleva es ruido que ademas le ensena cosas que no le tocan.
 */
async function suscripcionesResueltas(
  projectId: string,
): Promise<SuscripcionResuelta[]> {
  const [suscripciones, miembros, contactos] = await Promise.all([
    prisma.suscripcionAviso.findMany({ where: { projectId } }),
    prisma.projectMembership.findMany({
      where: { projectId },
      select: {
        role: true,
        user: {
          select: {
            id: true,
            nombres: true,
            apellidos: true,
            email: true,
            celular: true,
            celularVerificadoAt: true,
            estado: true,
          },
        },
      },
    }),
    prisma.contactoAviso.findMany({
      where: { projectId, activo: true },
      select: { id: true, nombre: true, email: true, celular: true },
    }),
  ]);

  // Un usuario desactivado no recibe nada: sigue en la obra pero ya no
  // trabaja aqui.
  const activos = miembros.filter((m) => m.user.estado === "ACTIVO");

  const personaDeUsuario = new Map<string, Persona>(
    activos.map((m) => [
      m.user.id,
      {
        clave: `u:${m.user.id}`,
        nombre: `${m.user.nombres} ${m.user.apellidos}`.trim(),
        email: m.user.email,
        celular: m.user.celular,
        celularUtil: m.user.celularVerificadoAt !== null,
        tieneBandeja: true,
      },
    ]),
  );

  const personaDeContacto = new Map<string, Persona>(
    contactos.map((c) => [
      c.id,
      {
        clave: `c:${c.id}`,
        nombre: c.nombre,
        email: c.email,
        celular: c.celular,
        celularUtil: c.celular !== null,
        tieneBandeja: false,
      },
    ]),
  );

  return suscripciones.flatMap((s) => {
    const personas: Persona[] = [];

    if (s.userId) {
      const p = personaDeUsuario.get(s.userId);
      if (p) personas.push(p);
    } else if (s.contactoId) {
      const p = personaDeContacto.get(s.contactoId);
      if (p) personas.push(p);
    } else if (s.rol) {
      for (const m of activos) {
        if (m.role !== s.rol) continue;
        const p = personaDeUsuario.get(m.user.id);
        if (p) personas.push(p);
      }
    }

    if (personas.length === 0) return [];

    return [
      {
        suscripcion: {
          id: s.id,
          userId: s.userId,
          rol: s.rol,
          contactoId: s.contactoId,
          tipo: s.tipo,
          canales: { app: s.porApp, correo: s.porCorreo, sms: s.porSms },
          momentos: {
            alAbrir: s.alAbrir,
            alRecordar: s.alRecordar,
            alQuedarLista: s.alQuedarLista,
            enResumen: s.enResumen,
          },
        },
        personas,
      },
    ];
  });
}

/**
 * Convierte los hechos crudos del Lookahead en motivos con nombre.
 *
 * Los nombres viven en el cronograma vigente y no en el Lookahead —que se
 * ancla por `uid` a proposito— asi que hay que ir a buscarlos. Se hace aqui y
 * no en `lookahead.service` porque el nombre solo hace falta para redactar el
 * aviso.
 */
export async function motivosDeHechos(
  projectId: string,
  abiertas: readonly { uid: number; tipo: TipoRestriccion }[],
  listas: readonly number[],
): Promise<{ abiertas: MotivoAviso[]; listas: MotivoAviso[] }> {
  const uids = [...new Set([...abiertas.map((a) => a.uid), ...listas])];
  if (uids.length === 0) return { abiertas: [], listas: [] };

  const cronograma = await prisma.cronograma.findFirst({
    where: { projectId },
    orderBy: [{ fechaCorte: "desc" }, { version: "desc" }],
    select: {
      tareas: {
        where: { uid: { in: uids } },
        select: { uid: true, codigo: true, nombre: true },
      },
    },
  });

  const nombre = new Map(
    (cronograma?.tareas ?? []).map((t) => [
      t.uid,
      `${t.codigo ? `${t.codigo} ` : ""}${t.nombre}`,
    ]),
  );
  const como = (uid: number) => nombre.get(uid) ?? `Tarea ${uid}`;

  return {
    abiertas: abiertas.map((a) => ({
      uid: a.uid,
      tarea: como(a.uid),
      tipo: a.tipo,
      diasAbierta: 0,
    })),
    // Que una tarea quede lista no cuelga de un flujo concreto, pero el
    // motivo necesita uno para agrupar. Se usa el primero de la matriz: el
    // texto de "quedo lista" no lo menciona.
    listas: listas.map((uid) => ({
      uid,
      tarea: como(uid),
      tipo: "INFORMACION" as TipoRestriccion,
      diasAbierta: 0,
    })),
  };
}
