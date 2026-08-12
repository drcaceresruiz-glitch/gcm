import "server-only";

import { prisma } from "@/lib/prisma";
import { env } from "@/lib/env";
import { FLUJOS_RESTRICCION } from "@/lib/lookahead";
import {
  acotarPorTope,
  claveDeAviso,
  diaDeClave,
  repartirAvisos,
  textoAviso,
  textoAvisoSms,
  MAX_SMS_POR_PASADA,
  MAX_SMS_POR_PERSONA_DIA,
  type EncargoDirecto,
  type Gastado,
  type Lote,
  type MotivoAviso,
  type Persona,
  type SuscripcionResuelta,
} from "@/lib/avisos";
import { PRIORIDAD_AVISO } from "@/lib/sms-cola";
import { enviarSms } from "@/services/sms.service";
import { enviarCorreo, correoRestricciones } from "@/services/mailer.service";
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
 * El reparto de un evento, ya con los topes de SMS aplicados.
 *
 * Se calcula UNA vez para los tres canales y no uno por canal, porque el tope
 * de SMS no se puede decidir mirando solo los SMS: lo que no cabe se convierte
 * en correo, y para saber si ese correo ya iba a salir hay que tener delante
 * el reparto entero.
 */
export async function repartoDeAviso(args: {
  projectId: string;
  evento: EventoAviso;
  motivos: readonly MotivoAviso[];
  resueltas: readonly SuscripcionResuelta[];
  /// Tope diario de SMS de esta obra. Lo dice `AjustesAvisosObra.maxSmsDia`.
  maxSmsDia: number;
  dia: string;
  /// Lo que le toca a alguien por haberse hecho cargo, no por estar suscrito.
  directos?: readonly EncargoDirecto[];
}): Promise<Lote[]> {
  const crudo = repartirAvisos(
    args.resueltas,
    args.motivos,
    args.evento,
    args.directos ?? [],
  );
  if (crudo.length === 0) return [];

  const gastado = await gastoDeSmsHoy(args.projectId, args.dia);

  const { lotes, degradados, descartados } = acotarPorTope(crudo, gastado, {
    porPersonaDia: MAX_SMS_POR_PERSONA_DIA,
    porObraDia: args.maxSmsDia,
    porPasada: MAX_SMS_POR_PASADA,
  });

  // Se dice, no se calla. Un aviso que se degrado a correo llego igual; uno
  // que se descarto NO llego a nadie, y esa persona figura en la pantalla como
  // si cubriera un flujo.
  if (descartados.length > 0) {
    console.warn(
      `[avisos] ${descartados.length} destinatario(s) sin ningun canal en ${args.projectId}: ` +
        descartados.map((d) => `${d.clave}(${d.motivo})`).join(", "),
    );
  }
  if (degradados.length > 0) {
    console.info(
      `[avisos] ${degradados.length} SMS pasaron a correo por tope en ${args.projectId}`,
    );
  }

  return lotes;
}

/**
 * Entrega los lotes de UN canal, con la reserva que impide repetir.
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
export async function despacharLotes(args: {
  contexto: ContextoAviso;
  evento: EventoAviso;
  todos: readonly Lote[];
  canal: CanalAviso;
  /// El dia, para las claves de lo que se repite (recordatorio, resumen).
  dia: string;
  /// Tope de entregas de esta tanda. Sin el, el de `MAX_POR_TANDA`.
  tope?: number;
  /// Que hacer con cada destinatario. Devuelve si de verdad salio.
  entregar: (persona: Persona, motivos: MotivoAviso[]) => Promise<boolean>;
}): Promise<number> {
  const { contexto, evento, canal, dia, entregar } = args;

  const lotes = args.todos
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
 * Cuantos correos se permiten DENTRO de una accion de servidor.
 *
 * Seis. `enviarCorreo` es sincrono y sin cola: cada uno es una conversacion
 * SMTP entera, y LiteSpeed corta lo lento. Los suscriptores tipicos de una
 * obra son dos o tres, asi que este techo casi nunca se toca; cuando se toca,
 * lo que sobra no se pierde —el resumen del dia lo recoge, y el aviso in-app
 * ya salio—.
 *
 * El reloj no usa este tope: alli manda `MAX_CORREOS_POR_PASADA`, que es mucho
 * mayor porque nadie esta esperando delante de una pantalla.
 */
const MAX_CORREOS_EN_ACCION = 6;

/**
 * Avisa de unos hechos por los tres canales. **NUNCA lanza.**
 *
 * Se llama FUERA de la transaccion de la operacion que lo origino y con su
 * propio try/catch, por la misma razon por la que `enviarCorreo` se traga sus
 * fallos: un aviso perdido es un incordio, pero una restriccion que no se
 * guardo por culpa de un aviso es un dato falso.
 *
 * El SMS sale por la cola —que es un INSERT, no una llamada— asi que aqui es
 * barato. El correo no, y por eso lleva su propio techo.
 */
export async function avisarDeHechos(
  contexto: ContextoAviso,
  evento: EventoAviso,
  motivos: readonly MotivoAviso[],
): Promise<{ app: number; correos: number; sms: number }> {
  const nada = { app: 0, correos: 0, sms: 0 };
  if (motivos.length === 0) return nada;

  try {
    const [ajustes, obra] = await Promise.all([
      prisma.ajustesAvisosObra.findUnique({
        where: { projectId: contexto.projectId },
        select: { activo: true, maxSmsDia: true },
      }),
      prisma.project.findUnique({
        where: { id: contexto.projectId },
        select: { nombreObra: true },
      }),
    ]);

    // Sin fila, la obra nunca lo configuro: se avisa igual, con los valores
    // por defecto. Lo que apaga es haberlo apagado a mano.
    if (ajustes && !ajustes.activo) return nada;
    if (!obra) return nada;

    const resueltas = await suscripcionesResueltas(contexto.projectId);
    if (resueltas.length === 0) return nada;

    const dia = diaDeClave(new Date());
    const todos = await repartoDeAviso({
      projectId: contexto.projectId,
      evento,
      motivos,
      resueltas,
      maxSmsDia: ajustes?.maxSmsDia ?? 20,
      dia,
    });
    if (todos.length === 0) return nada;

    const comun = { contexto, evento, todos, dia };

    const app = await despacharLotes({
      ...comun,
      canal: "APP",
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

    const sms = await despacharLotes({
      ...comun,
      canal: "SMS",
      entregar: (persona, suyos) =>
        entregarSms(contexto, obra.nombreObra, persona, suyos),
    });

    const correos = await despacharLotes({
      ...comun,
      canal: "CORREO",
      tope: MAX_CORREOS_EN_ACCION,
      entregar: (persona, suyos) =>
        entregarCorreo(contexto, obra.nombreObra, evento, persona, suyos),
    });

    return { app, correos, sms };
  } catch (e) {
    console.error("[avisos] No se pudo avisar:", e);
    return nada;
  }
}

/**
 * El SMS de un aviso.
 *
 * Va con `PRIORIDAD_AVISO`, la mas baja: un codigo de acceso caduca a los diez
 * minutos y este no caduca nunca, asi que si coinciden en la cola el codigo
 * pasa primero. Y con `projectId`, sin el cual el tope diario por obra no se
 * podria contar.
 */
export async function entregarSms(
  contexto: ContextoAviso,
  nombreObra: string,
  persona: Persona,
  motivos: MotivoAviso[],
): Promise<boolean> {
  if (!persona.celular) return false;

  const { enviado } = await enviarSms(
    contexto.companyId,
    persona.celular,
    textoAvisoSms(nombreObra, motivos),
    { projectId: contexto.projectId, prioridad: PRIORIDAD_AVISO },
  );
  return enviado;
}

/// Cuantas filas de tarea caben en un correo antes de resumir ("y otras 30").
const MAX_LINEAS_CORREO = 25;

/** El correo de un aviso. Este SI lleva enlace, al contrario que el SMS. */
export async function entregarCorreo(
  contexto: ContextoAviso,
  nombreObra: string,
  evento: EventoAviso,
  persona: Persona,
  motivos: MotivoAviso[],
): Promise<boolean> {
  if (!persona.email) return false;

  const texto = textoAviso(evento, motivos);
  const enlace = `${env.APP_URL.replace(/\/$/, "")}/obras/${contexto.projectId}/lookahead`;

  const { enviado } = await enviarCorreo({
    para: persona.email,
    ...correoRestricciones({
      nombre: persona.nombre,
      obra: nombreObra,
      titulo: texto.titulo,
      cuerpo: texto.cuerpo,
      lineas: motivos.slice(0, MAX_LINEAS_CORREO).map((m) => ({
        tarea: m.tarea,
        flujo: etiquetaDeFlujo(m.tipo),
        dias: m.diasAbierta,
      })),
      masCuantas: Math.max(0, motivos.length - MAX_LINEAS_CORREO),
      enlace,
    }),
  });
  return enviado;
}

const ETIQUETAS = new Map(FLUJOS_RESTRICCION.map((f) => [f.tipo, f.etiqueta]));

/** El nombre del flujo tal como se ve en la matriz, no el del enum. */
export function etiquetaDeFlujo(tipo: TipoRestriccion): string {
  return ETIQUETAS.get(tipo) ?? tipo;
}

/**
 * Cuantos SMS de aviso lleva hoy esta obra, y cuantos cada persona.
 *
 * Se cuenta sobre `EnvioAviso` y no sobre `MensajeSms` a proposito: alli esta
 * la clave de la PERSONA, y el tope por persona es el que de verdad importa
 * —el cuarto SMS del dia ya no informa, entrena a ignorarlos—. `MensajeSms`
 * solo tiene el numero, y un numero no dice a quien pertenece.
 */
async function gastoDeSmsHoy(projectId: string, dia: string): Promise<Gastado> {
  const desde = new Date(`${dia}T00:00:00`);

  const enviados = await prisma.envioAviso.findMany({
    where: { projectId, canal: "SMS", enviado: true, createdAt: { gte: desde } },
    select: { userId: true, contactoId: true },
  });

  const porPersona = new Map<string, number>();
  for (const e of enviados) {
    const clave = e.userId
      ? `u:${e.userId}`
      : e.contactoId
        ? `c:${e.contactoId}`
        : null;
    if (!clave) continue;
    porPersona.set(clave, (porPersona.get(clave) ?? 0) + 1);
  }

  return { porPersona, porObra: enviados.length };
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
 * Todas las personas alcanzables de una obra, indexadas por su clave.
 *
 * Sirve para los ENCARGOS DIRECTOS: la restriccion guarda solo el id de quien
 * se hizo cargo, y para escribirle hacen falta su correo, su celular y si
 * tiene bandeja. `suscripcionesResueltas` no vale aqui —solo resuelve a quien
 * tiene suscripcion, y el responsable puede no tener ninguna: ese es
 * precisamente el caso que esto viene a cubrir—.
 *
 * Un usuario desactivado no sale: sigue en la obra pero ya no trabaja aqui.
 */
export async function personasPorClave(
  projectId: string,
): Promise<Map<string, Persona>> {
  const [miembros, contactos] = await Promise.all([
    prisma.projectMembership.findMany({
      where: { projectId, user: { estado: "ACTIVO" } },
      select: {
        user: {
          select: {
            id: true,
            nombres: true,
            apellidos: true,
            email: true,
            celular: true,
            celularVerificadoAt: true,
          },
        },
      },
    }),
    prisma.contactoAviso.findMany({
      where: { projectId, activo: true },
      select: { id: true, nombre: true, email: true, celular: true },
    }),
  ]);

  const mapa = new Map<string, Persona>();

  for (const m of miembros) {
    mapa.set(`u:${m.user.id}`, {
      clave: `u:${m.user.id}`,
      nombre: `${m.user.nombres} ${m.user.apellidos}`.trim(),
      email: m.user.email,
      celular: m.user.celular,
      celularUtil: m.user.celularVerificadoAt !== null,
      tieneBandeja: true,
    });
  }

  for (const c of contactos) {
    mapa.set(`c:${c.id}`, {
      clave: `c:${c.id}`,
      nombre: c.nombre,
      email: c.email,
      celular: c.celular,
      // Lo normalizo quien lo dio de alta y no hay a quien pedirle que se
      // verifique: si hay numero, sirve.
      celularUtil: c.celular !== null,
      tieneBandeja: false,
    });
  }

  return mapa;
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
