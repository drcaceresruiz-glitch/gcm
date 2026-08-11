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
import type {
  CanalAviso,
  EventoAviso,
  TipoRestriccion,
} from "@/generated/prisma/enums";

/**
 * El despacho de avisos: quien recibe que, y la reserva que impide repetir.
 *
 * Va en su propio archivo y no en `avisos.service` por una diferencia que
 * importa: aquello es configuracion y exige sesion y permiso; esto lo llama
 * una accion que ya paso su puerta, o el reloj, que no tiene sesion ninguna.
 * Mezclarlos obligaria a inventar una sesion falsa para el cron, que es como
 * se cuelan los agujeros.
 */

export interface ContextoAviso {
  companyId: string;
  projectId: string;
}

/// Cuantos avisos se despachan de una vez por canal, pase lo que pase. Un
/// lote absurdo —alguien analiza doscientas tareas— no puede alargar sin
/// limite la operacion que lo pidio.
const MAX_POR_TANDA = 200;

/**
 * Reparte un evento por UN canal y entrega lo que toque.
 *
 * El orden es lo unico que importa aqui, y es este:
 *
 *   1. reservar la clave en `envios_aviso`
 *   2. solo si la reserva entro, entregar
 *   3. anotar si salio
 *
 * La reserva va ANTES de entregar porque es lo unico que impide mandar dos
 * veces lo mismo: si dos pasadas del cron se solapan, o si una accion se
 * reintenta, la segunda choca contra el indice unico y se calla. Comprobar
 * antes con un `findFirst` no valdria: entre la lectura y la escritura cabe
 * la otra pasada.
 */
export async function despacharPorCanal(args: {
  contexto: ContextoAviso;
  evento: EventoAviso;
  motivos: readonly MotivoAviso[];
  resueltas: readonly SuscripcionResuelta[];
  canal: CanalAviso;
  /// El dia, para las claves de lo que se repite (recordatorio, resumen).
  dia: string;
  /// Tope de entregas de esta tanda. Sin el, el de `MAX_POR_TANDA`.
  tope?: number;
  /// Que hacer con cada destinatario. Devuelve si de verdad salio.
  entregar: (persona: Persona, motivos: MotivoAviso[]) => Promise<boolean>;
}): Promise<number> {
  const { contexto, evento, motivos, resueltas, canal, dia, entregar } = args;
  if (motivos.length === 0) return 0;

  const lotes = repartirAvisos(resueltas, motivos, evento)
    .filter((l) => l.canal === canal)
    .slice(0, Math.min(args.tope ?? MAX_POR_TANDA, MAX_POR_TANDA));

  let entregados = 0;

  for (const lote of lotes) {
    const clave = claveDeAviso(
      evento,
      anclaDe(lote.motivos),
      lote.persona.clave,
      dia,
    );

    let reserva: { id: string };
    try {
      reserva = await prisma.envioAviso.create({
        data: {
          companyId: contexto.companyId,
          projectId: contexto.projectId,
          evento,
          canal,
          userId: idDeUsuario(lote.persona),
          contactoId: idDeContacto(lote.persona),
          clave,
          destino: destinoDe(lote.persona, canal),
          // Optimista: se corrige justo debajo si no salio. Nunca al reves,
          // porque lo que no se puede es dejar de reservar.
          enviado: false,
        },
        select: { id: true },
      });
    } catch {
      // Ya estaba reservado: este aviso ya se dio. No es un error.
      continue;
    }

    let salio = false;
    try {
      salio = await entregar(lote.persona, lote.motivos);
    } catch (e) {
      console.error(`[avisos] Fallo al entregar por ${canal}:`, e);
    }

    await prisma.envioAviso
      .update({
        where: { id: reserva.id },
        data: { enviado: salio, motivo: salio ? null : "no-salio" },
      })
      .catch(() => {
        /* Anotar el resultado no puede tumbar la pasada. */
      });

    if (salio) entregados += 1;
  }

  return entregados;
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
    const ajustes = await prisma.ajustesAvisosObra.findUnique({
      where: { projectId: contexto.projectId },
      select: { activo: true },
    });
    // Sin fila, la obra nunca lo configuro: se avisa igual, con los valores
    // por defecto. Lo que apaga es haberlo apagado a mano.
    if (ajustes && !ajustes.activo) return { creados: 0 };

    const resueltas = await suscripcionesResueltas(contexto.projectId);
    if (resueltas.length === 0) return { creados: 0 };

    const creados = await despacharPorCanal({
      contexto,
      evento,
      motivos,
      resueltas,
      canal: "APP",
      dia: diaDeClave(new Date()),
      entregar: async (persona, suyos) => {
        const userId = idDeUsuario(persona);
        // Solo los usuarios de GCM tienen bandeja. `canalesEfectivos` ya lo
        // filtra; esto es la red por si algun dia deja de hacerlo.
        if (userId === null) return false;

        const texto = textoAviso(evento, suyos);
        await prisma.aviso.create({
          data: {
            companyId: contexto.companyId,
            projectId: contexto.projectId,
            userId,
            evento,
            titulo: texto.titulo.slice(0, 200),
            cuerpo: texto.cuerpo.slice(0, 400),
            camino: "/lookahead",
          },
        });
        return true;
      },
    });

    return { creados };
  } catch (e) {
    console.error("[avisos] No se pudo avisar:", e);
    return { creados: 0 };
  }
}

// ---------------------------------------------------------------------------

/// La clave de deduplicacion tiene que ser la MISMA para el mismo conjunto de
/// motivos, venga en el orden que venga.
function anclaDe(motivos: readonly MotivoAviso[]): string {
  return motivos
    .map((m) => `${m.uid}:${m.tipo}`)
    .sort()
    .join(",");
}

/// "u:<id>" -> "<id>". Null para quien no es usuario de GCM.
function idDeUsuario(persona: Persona): string | null {
  return persona.clave.startsWith("u:") ? persona.clave.slice(2) : null;
}

/// "c:<id>" -> "<id>". Null para quien si es usuario de GCM.
function idDeContacto(persona: Persona): string | null {
  return persona.clave.startsWith("c:") ? persona.clave.slice(2) : null;
}

/// A donde fue, para poder responder "¿le llego?" sin reconstruirlo.
function destinoDe(persona: Persona, canal: CanalAviso): string {
  const valor =
    canal === "CORREO"
      ? persona.email
      : canal === "SMS"
        ? persona.celular
        : persona.clave;
  return (valor ?? persona.clave).slice(0, 150);
}

/**
 * Las suscripciones de una obra con sus personas ya resueltas.
 *
 * El rol se resuelve contra la membresia DE ESTA OBRA y no contra el rol de
 * empresa: un residente puede llevar una obra y solo mirar otra, y avisarle de
 * la que no lleva es ruido que ademas le ensena cosas que no le tocan.
 */
export async function suscripcionesResueltas(
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

  if (suscripciones.length === 0) return [];

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
        // Lo normalizo quien lo dio de alta y no hay a quien pedirle que se
        // verifique: si hay numero, sirve.
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
 * no en `lookahead.service` porque el nombre solo hace falta para redactar.
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
    // Que una tarea quede lista no cuelga de un flujo, pero `MotivoAviso`
    // necesita uno. Da igual cual: `seFiltraPorFlujo` no filtra el evento
    // LISTA y su texto no menciona flujos.
    listas: listas.map((uid) => ({
      uid,
      tarea: como(uid),
      tipo: "INFORMACION" as TipoRestriccion,
      diasAbierta: 0,
    })),
  };
}
