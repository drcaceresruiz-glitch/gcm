import "server-only";

import { prisma } from "@/lib/prisma";
import { env } from "@/lib/env";
import { hashToken } from "@/lib/tokens";
import {
  GRACIA_PRESTAMO_SEGUNDOS,
  MAXIMO_ENTREGAS,
  MAXIMO_POR_ENTREGA,
  PRIORIDAD_CODIGO,
  caducidadDeMensaje,
  tokenValido,
} from "@/lib/sms-cola";
import type { AlcanceCola } from "@/lib/emisor-sms";

/**
 * La cola de SMS: GCM deja los mensajes y el telefono emisor los recoge.
 *
 * Por que al reves de lo obvio: json.pe tampoco enviaba desde la nube —salia
 * del movil Android de la empresa con su app instalada—, y el usuario quiere
 * usar su propia linea sin depender de un tercero. Invirtiendo el sentido, el
 * lado del telefono es una app que pregunta cada veinte segundos, y aqui no
 * hay que mantener nada movil.
 *
 * **LA COLA ES POR EMPRESA.** Hasta el 12 de agosto de 2026 era una sola para
 * toda la plataforma, con un unico token de entorno. Con una constructora daba
 * igual; con dos, el telefono de una habria recogido y mandado los codigos de
 * la otra. Cada empresa tiene ahora sus emisores y solo ve sus mensajes.
 *
 * LO QUE HAY QUE SABER, sin adornos: por esta cola viajan los codigos EN
 * CLARO, porque hay que poder mandarlos, y desde que existe el segundo factor
 * por SMS eso incluye los codigos de acceso. Quien obtenga el token de un
 * emisor lee los codigos de esa empresa antes que sus duenos. Lo unico que lo
 * acota es que el texto se borra en cuanto sale y que caduca a los diez
 * minutos. Es el punto debil del diseno y no conviene olvidarlo.
 */

export interface MensajePendiente {
  id: string;
  numero: string;
  texto: string;
}

/**
 * A quien sirve el token que acaba de presentarse, o null si no sirve a nadie.
 *
 * Busca por HASH sobre un indice unico, igual que las sesiones. Aqui no hace
 * falta comparar en tiempo constante como en `tokenValido`: el hash de 32
 * bytes no filtra el secreto por lo que tarde la consulta.
 *
 * El respaldo del token de entorno se comprueba DESPUES, y solo si ningun
 * emisor casa: mientras una empresa no tenga el suyo, su cola la sigue
 * sirviendo el telefono de siempre. Ver `AlcanceCola`.
 */
export async function resolverAlcance(
  token: string | null,
): Promise<AlcanceCola | null> {
  if (!token) return null;

  const emisor = await prisma.emisorSms.findFirst({
    where: { tokenHash: hashToken(token), activo: true, company: { activa: true } },
    select: { id: true, companyId: true },
  });

  if (emisor) {
    return { tipo: "empresa", companyId: emisor.companyId, emisorId: emisor.id };
  }

  const global = env.SMS_COLA_TOKEN;
  if (global && global.length >= 32 && tokenValido(token, global)) {
    return { tipo: "respaldo" };
  }

  return null;
}

/**
 * Que mensajes alcanza este emisor.
 *
 * El respaldo alcanza a las empresas que **todavia no tienen emisor propio**.
 * Es lo que hace que encender esto no deje a nadie sin SMS ni un minuto: el
 * telefono de siempre sigue sirviendo hasta que cada empresa registra el suyo,
 * y en ese momento deja de alcanzarla.
 */
function filtroDelAlcance(alcance: AlcanceCola) {
  return alcance.tipo === "empresa"
    ? { companyId: alcance.companyId }
    : { company: { emisoresSms: { none: { activo: true } } } };
}

/** Si esta empresa tiene por donde sacar un SMS. */
export async function hayColaSms(companyId: string): Promise<boolean> {
  const propio = await prisma.emisorSms.count({
    where: { companyId, activo: true },
  });
  if (propio > 0) return true;

  const global = env.SMS_COLA_TOKEN;
  return Boolean(global && global.length >= 32);
}

/**
 * Deja un SMS en la cola de su empresa. Nunca lanza.
 *
 * `prioridad` por defecto es la del CODIGO, no la del aviso: quien encole algo
 * nuevo y se olvide de decirlo se lleva el trato preferente, que es el fallo
 * inofensivo. Ver `PRIORIDAD_CODIGO` en @/lib/sms-cola.
 *
 * `projectId` es opcional porque no todo SMS sale de una obra —un codigo de
 * acceso a GCM no—, pero cuando sale de una hay que decirlo: el tope diario de
 * SMS por obra no se puede calcular sin eso.
 */
export async function encolarSms(
  companyId: string,
  numero: string,
  texto: string,
  opciones?: { projectId?: string | null; prioridad?: number },
): Promise<boolean> {
  try {
    const ahora = new Date();
    await prisma.mensajeSms.create({
      data: {
        companyId,
        numero: numero.slice(0, 20),
        texto: texto.slice(0, 320),
        expiraAt: caducidadDeMensaje(ahora),
        projectId: opciones?.projectId ?? null,
        prioridad: opciones?.prioridad ?? PRIORIDAD_CODIGO,
      },
    });
    return true;
  } catch (e) {
    // Igual que el envio directo: un fallo aqui no puede tumbar la operacion
    // que lo pidio. Quedan el correo y el codigo dictado en pantalla.
    console.error("[sms-cola] No se pudo encolar:", e);
    return false;
  }
}

/**
 * Entrega al emisor lo que haya que mandar, y lo marca como prestado.
 *
 * El prestamo NO es una entrega: si el telefono no confirma dentro de la
 * gracia, el mensaje vuelve a ofrecerse. Se prefiere mandar dos veces el
 * mismo codigo —que es el mismo, y no molesta a nadie— antes que perderlo.
 *
 * Aprovecha el paso para barrer lo que ya no sirve: sin cron para la logica
 * de la aplicacion, la limpieza tiene que colgar de algo que corra solo, y
 * esto corre cada pocos segundos.
 */
export async function recogerPendientes(
  alcance: AlcanceCola,
): Promise<MensajePendiente[]> {
  const ahora = new Date();

  await purgar(ahora);
  await anotarLatido(alcance, ahora);

  const limitePrestamo = new Date(
    ahora.getTime() - GRACIA_PRESTAMO_SEGUNDOS * 1000,
  );

  // Las mismas condiciones que `sePuedeOfrecer`, dichas en SQL, y ademas el
  // filtro de empresa. La version pura existe para poder probarlas; esta,
  // para no traerse la cola entera.
  const pendientes = await prisma.mensajeSms.findMany({
    where: {
      ...filtroDelAlcance(alcance),
      enviadoAt: null,
      expiraAt: { gt: ahora },
      entregas: { lt: MAXIMO_ENTREGAS },
      OR: [{ tomadoAt: null }, { tomadoAt: { lte: limitePrestamo } }],
    },
    // Primero lo urgente, y dentro de cada nivel lo mas antiguo. Un codigo de
    // acceso caduca a los diez minutos; un aviso de restriccion no caduca, asi
    // que puede esperar el siguiente sorbo de la cola.
    orderBy: [{ prioridad: "desc" }, { createdAt: "asc" }],
    take: MAXIMO_POR_ENTREGA,
    select: { id: true, numero: true, texto: true },
  });

  if (pendientes.length === 0) return [];

  await prisma.mensajeSms.updateMany({
    where: { id: { in: pendientes.map((m) => m.id) } },
    data: { tomadoAt: ahora, entregas: { increment: 1 } },
  });

  return pendientes;
}

/**
 * Deja constancia de que este telefono sigue preguntando.
 *
 * Es el unico modo de saber desde la aplicacion si el emisor esta vivo.
 * Android duerme la app cuando se apaga la pantalla si no se le quito el
 * ahorro de bateria, y entonces los codigos dejan de salir sin que nada
 * avise; con esto, la pantalla del administrador lo dice.
 */
async function anotarLatido(alcance: AlcanceCola, ahora: Date): Promise<void> {
  if (alcance.tipo !== "empresa") return;

  await prisma.emisorSms
    .update({
      where: { id: alcance.emisorId },
      data: { ultimaConsultaAt: ahora },
    })
    .catch(() => {
      // Que no se pueda anotar la hora no puede impedir que salgan los SMS.
    });
}

/**
 * El emisor confirma que los SMS salieron de la SIM.
 *
 * **El filtro de empresa NO es decorativo.** Sin el, el telefono de una
 * constructora podria marcar como enviados los mensajes de otra con solo
 * acertar sus identificadores, y esos codigos desaparecerian de la cola sin
 * haberse mandado: una denegacion de servicio silenciosa entre clientes. Tiene
 * que ser el MISMO alcance con el que se recogieron.
 *
 * Se vacia el texto en el acto: a partir de aqui la fila sirve para saber que
 * salio, no que decia.
 */
export async function confirmarEnviados(
  alcance: AlcanceCola,
  ids: string[],
): Promise<number> {
  if (ids.length === 0) return 0;

  const { count } = await prisma.mensajeSms.updateMany({
    where: {
      ...filtroDelAlcance(alcance),
      id: { in: ids.slice(0, 50) },
      enviadoAt: null,
    },
    data: { enviadoAt: new Date(), texto: "" },
  });

  return count;
}

/**
 * Borra lo que ya no sirve.
 *
 * **A proposito NO se filtra por empresa.** Cuelga del latido de cualquier
 * emisor porque este hosting no tiene cron para la logica de la aplicacion.
 * Si se filtrara, la basura de una empresa cuyo telefono esta apagado no se
 * limpiaria nunca, que es justo cuando mas se acumula.
 *
 * Los caducados se van enteros: llevan un codigo en claro que ya no vale para
 * nada, asi que conservarlos es todo riesgo y ningun dato. Los enviados se
 * conservan un dia sin texto, que es lo que permite responder a «¿salio el
 * SMS de fulano?» sin guardar lo que decia.
 */
async function purgar(ahora: Date): Promise<void> {
  const ayer = new Date(ahora.getTime() - 24 * 60 * 60_000);

  await prisma.mensajeSms
    .deleteMany({
      where: {
        OR: [
          { enviadoAt: null, expiraAt: { lte: ahora } },
          { enviadoAt: { lte: ayer } },
        ],
      },
    })
    .catch((e) => {
      // Que falle la limpieza no puede impedir que salgan los SMS.
      console.error("[sms-cola] No se pudo purgar:", e);
    });
}
