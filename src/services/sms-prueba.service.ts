import "server-only";

import { prisma } from "@/lib/prisma";
import { puede } from "@/lib/rbac";
import { normalizarCelular } from "@/lib/contacto";
import { PRIORIDAD_AVISO } from "@/lib/sms-cola";
import { enviarSms } from "./sms.service";
import type { SesionActiva } from "./sesion.service";

/**
 * Mandar un SMS de prueba y decir si de verdad salio.
 *
 * Existe porque hasta ahora, terminada la configuracion, no habia forma de
 * saber si funcionaba salvo esperar a que alguien pidiera un codigo de acceso
 * de verdad —y descubrirlo entonces es descubrirlo tarde—.
 *
 * NO SE QUEDA EN «ENCOLADO», que es lo facil. Encolar solo prueba que GCM
 * escribio en su propia tabla; el SMS puede no salir nunca porque el telefono
 * este dormido, sin saldo o sin el permiso de enviar. Como el emisor confirma
 * cada mensaje que sale de la SIM (`enviadoAt`), aqui se espera esa
 * confirmacion y se enseña la diferencia entre «lo tenemos» y «salio».
 *
 * Por la pasarela no hay nada que esperar: json.pe acepta o rechaza en el acto
 * y no avisa despues. Ahi la prueba termina en «aceptado», que es todo lo que
 * ese canal permite saber.
 */

/**
 * El texto de la prueba, fijo.
 *
 * NO SIRVE PARA RECONOCER LA PRUEBA DESPUES, aunque lo pareciera: la cola
 * VACIA el texto al confirmar el envio —la fila queda para saber que salio, no
 * que decia—, asi que buscar por texto no encuentra jamas un mensaje ya
 * enviado, que es justo el que se quiere encontrar. Se sigue por su ID.
 *
 * Sin tildes y sin enlaces, como todos los SMS de GCM: una sola tilde baja el
 * limite de 160 caracteres a 70, y las operadoras marcan como spam los SMS con
 * URL.
 */
export const TEXTO_PRUEBA =
  "GCM: SMS de prueba. Si lees esto, el envio de mensajes ya funciona.";

export type ResultadoPrueba =
  | { ok: true; canal: "cola" | "pasarela"; mensajeId?: string }
  | { ok: false; error: string };

/// En que anda la prueba. `perdida` es no haber salido a tiempo, que es un
/// resultado y no un fallo de GCM: dice que mirar en el telefono.
export type EstadoPrueba = "pendiente" | "salio" | "perdida" | "ninguna";

export async function enviarSmsDePrueba(
  sesion: SesionActiva,
  numeroBruto: string,
): Promise<ResultadoPrueba> {
  // El mismo permiso que vincular el telefono: quien configura el canal es
  // quien lo prueba, y probar gasta un SMS de una SIM de verdad.
  if (!puede(sesion, "configuracion:editar")) {
    return { ok: false, error: "No tienes permiso para configurar el envío de SMS." };
  }

  const numero = normalizarCelular(numeroBruto);
  if (!numero) {
    return { ok: false, error: "El celular debe tener nueve cifras y empezar por 9." };
  }

  // Prioridad de aviso: una prueba no puede adelantar en la cola a un codigo
  // de acceso que caduca en diez minutos.
  const r = await enviarSms(sesion.companyId, numero, TEXTO_PRUEBA, {
    prioridad: PRIORIDAD_AVISO,
  });

  if (!r.enviado) {
    return {
      ok: false,
      error:
        r.motivo === "sin-canal"
          ? "Todavía no hay por dónde enviar: vincula el teléfono emisor aquí arriba."
          : "No se pudo dejar el mensaje para enviar. Inténtalo de nuevo en un momento.",
    };
  }

  await prisma.auditLog.create({
    data: {
      companyId: sesion.companyId,
      userId: sesion.userId,
      entidad: "EmisorSms",
      entidadId: sesion.companyId,
      accion: "CREATE",
      despues: { evento: "sms-de-prueba", numero, canal: r.encolado ? "cola" : "pasarela" },
    },
  });

  return {
    ok: true,
    canal: r.encolado ? "cola" : "pasarela",
    mensajeId: r.mensajeId,
  };
}

/**
 * Si esa prueba ya salio de la SIM.
 *
 * POR ID, no por texto. Buscarla por su texto era lo evidente y esta MAL: la
 * cola vacia el texto al confirmar, asi que el mensaje solo era localizable
 * mientras seguia sin enviarse. La prueba se quedaba eternamente en «pendiente»
 * y acababa dando por perdido un envio que habia funcionado —el peor de los
 * errores posibles aqui, porque manda a revisar un telefono que estaba bien—.
 *
 * Acotado por empresa aunque el ID sea unico: una accion de servidor es un
 * endpoint invocable con el identificador que sea.
 *
 * `perdida` es cuando el mensaje caduco sin salir. NO es un fallo de GCM y por
 * eso tiene nombre propio: dice que el telefono no lo recogio o no pudo
 * mandarlo, que es lo que hay que ir a mirar.
 */
export async function estadoSmsDePrueba(
  sesion: SesionActiva,
  mensajeId: string,
): Promise<EstadoPrueba> {
  if (!puede(sesion, "configuracion:editar")) return "ninguna";
  if (!mensajeId) return "ninguna";

  const mensaje = await prisma.mensajeSms.findFirst({
    where: { id: mensajeId, companyId: sesion.companyId },
    select: { enviadoAt: true, expiraAt: true },
  });

  if (!mensaje) return "ninguna";
  if (mensaje.enviadoAt) return "salio";

  return mensaje.expiraAt < new Date() ? "perdida" : "pendiente";
}
