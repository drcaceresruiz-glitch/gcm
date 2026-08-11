import "server-only";

import { prisma } from "@/lib/prisma";
import { env } from "@/lib/env";
import {
  GRACIA_PRESTAMO_SEGUNDOS,
  MAXIMO_ENTREGAS,
  MAXIMO_POR_ENTREGA,
  caducidadDeMensaje,
  tokenValido,
} from "@/lib/sms-cola";

/**
 * La cola de SMS: GCM deja los mensajes y el telefono emisor los recoge.
 *
 * Por que al reves de lo obvio: json.pe tampoco enviaba desde la nube —salia
 * del movil Android de la empresa con su app instalada—, y el usuario quiere
 * usar su propia linea sin depender de un tercero. Construir esa app es otro
 * producto: Android restringe el permiso de enviar SMS, y lo dificil no es
 * mandar el mensaje sino mantener la app viva contra el gestor de bateria de
 * cada fabricante. Invirtiendo el sentido, el lado del telefono es
 * configuracion de MacroDroid o Tasker —que ya existen y ya resolvieron eso—
 * y aqui no hay una linea de codigo movil que mantener.
 *
 * LO QUE HAY QUE SABER ANTES DE ACTIVARLO, sin adornos: por esta cola viajan
 * los codigos del pase EN CLARO, porque hay que poder mandarlos. Quien
 * obtenga `SMS_COLA_TOKEN` lee los codigos del personal antes que ellos. Lo
 * unico que lo acota es que el texto se borra en cuanto sale, que caduca a
 * los diez minutos y que el codigo en si dura eso y admite tres intentos.
 * Es el punto debil del diseno y no conviene olvidarlo.
 */

export interface MensajePendiente {
  id: string;
  numero: string;
  texto: string;
}

/**
 * Cuanto tiene que medir el secreto para que la cola se encienda.
 *
 * La comprobacion vive AQUI y no en `env.ts` a proposito: alli tumbaria el
 * arranque de toda la aplicacion por una funcion opcional. Aqui, un token
 * corto deja la cola apagada —la ruta responde 404, los codigos siguen
 * saliendo por correo y por pantalla— y avisa en el log. Lo que NO puede
 * pasar es que un secreto debil quede protegiendo una cola con codigos en
 * claro sin que nadie se entere.
 */
const LARGO_MINIMO_TOKEN = 32;

export function hayColaSms(): boolean {
  const token = env.SMS_COLA_TOKEN;
  if (!token) return false;

  if (token.length < LARGO_MINIMO_TOKEN) {
    console.error(
      `[sms-cola] SMS_COLA_TOKEN mide ${token.length} caracteres y hacen falta ` +
        `${LARGO_MINIMO_TOKEN}. La cola queda APAGADA: los codigos saldran por ` +
        `correo o los dictara el residente.`,
    );
    return false;
  }

  return true;
}

/** Comprueba la credencial del emisor. */
export function emisorAutorizado(token: string | null): boolean {
  // `hayColaSms` primero: con un token demasiado corto no se autoriza a
  // nadie, ni siquiera a quien lo acierte.
  if (!token || !hayColaSms() || !env.SMS_COLA_TOKEN) return false;
  return tokenValido(token, env.SMS_COLA_TOKEN);
}

/** Deja un SMS en la cola. Nunca lanza. */
export async function encolarSms(
  numero: string,
  texto: string,
): Promise<boolean> {
  try {
    const ahora = new Date();
    await prisma.mensajeSms.create({
      data: {
        numero: numero.slice(0, 20),
        texto: texto.slice(0, 320),
        expiraAt: caducidadDeMensaje(ahora),
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
export async function recogerPendientes(): Promise<MensajePendiente[]> {
  const ahora = new Date();

  await purgar(ahora);

  const limitePrestamo = new Date(
    ahora.getTime() - GRACIA_PRESTAMO_SEGUNDOS * 1000,
  );

  // Las mismas condiciones que `sePuedeOfrecer`, dichas en SQL. La version
  // pura existe para poder probarlas; esta, para no traerse la cola entera.
  const pendientes = await prisma.mensajeSms.findMany({
    where: {
      enviadoAt: null,
      expiraAt: { gt: ahora },
      entregas: { lt: MAXIMO_ENTREGAS },
      OR: [{ tomadoAt: null }, { tomadoAt: { lte: limitePrestamo } }],
    },
    orderBy: { createdAt: "asc" },
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
 * El emisor confirma que los SMS salieron de la SIM.
 *
 * Se vacia el texto en el acto: a partir de aqui la fila sirve para saber que
 * salio, no para saber que decia. Es lo que reduce la ventana en la que un
 * codigo esta legible en la base a los segundos que tarda el telefono.
 *
 * Devuelve cuantos se marcaron, que puede ser menos de los pedidos si alguno
 * ya habia caducado.
 */
export async function confirmarEnviados(ids: string[]): Promise<number> {
  if (ids.length === 0) return 0;

  const { count } = await prisma.mensajeSms.updateMany({
    where: { id: { in: ids.slice(0, 50) }, enviadoAt: null },
    data: { enviadoAt: new Date(), texto: "" },
  });

  return count;
}

/**
 * Borra lo que ya no sirve.
 *
 * Los caducados se van enteros: llevan un codigo en claro que ya no vale
 * para nada, asi que conservarlos es todo riesgo y ningun dato. Los enviados
 * se conservan un dia sin texto, que es lo que permite responder a «¿salio
 * el SMS de fulano?» sin guardar lo que decia.
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
