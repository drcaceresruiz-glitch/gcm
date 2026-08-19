import { tokenDeCabecera, tokenValido } from "@/lib/sms-cola";
import { env } from "@/lib/env";
import { pasadaDelReloj } from "@/services/avisos-reloj";
import {
  pasadaDeCorreoEntrante,
  type ResumenCorreoEntrante,
} from "@/services/correo-entrante.service";

/**
 * El reloj de GCM, visto desde el cron.
 *
 * Lo llama una linea de cron de cPanel cada cinco minutos. De aqui salen los
 * dos avisos que no provoca nadie pulsando nada: el recordatorio de lo que
 * lleva dias sin levantarse y el repaso del dia.
 *
 * Es la segunda ruta de GCM pensada para una maquina, y sigue las mismas
 * reglas que la de la cola de SMS, por las mismas razones:
 *
 * - `Authorization: Bearer <token>`, **nunca por parametro en la URL**: los
 *   servidores escriben las URL en su log de accesos, y ahi el secreto
 *   quedaria en claro para siempre. Tampoco va escrito en la linea del cron:
 *   cPanel la muestra en pantalla y `ps` la ensena a cualquiera con shell. Va
 *   en un archivo de curl con permisos 600 —ver `scripts/avisos.sh`—.
 * - Solo `POST`. Un `GET` lo dispara cualquier cosa que precargue enlaces, y
 *   esto manda correos de verdad.
 * - 401 a todo lo que no case, sin distinguir entre «no hay token», «no
 *   coincide» y «no hay token configurado en el servidor».
 *
 * Si `AVISOS_CRON_TOKEN` no esta puesto, responde 401 SIEMPRE. Nunca abierta
 * por defecto: una ruta que se abre sola cuando falta una variable es la forma
 * mas educada de dejar un agujero.
 */

/// Nunca cacheada: cada pasada tiene que mirar la base de nuevo.
export const dynamic = "force-dynamic";

export async function POST(peticion: Request) {
  const esperado = env.AVISOS_CRON_TOKEN;
  if (!esperado) return new Response("No autorizado", { status: 401 });

  const recibido = tokenDeCabecera(peticion.headers.get("authorization"));
  if (recibido === null || !tokenValido(recibido, esperado)) {
    return new Response("No autorizado", { status: 401 });
  }

  const resumen = await pasadaDelReloj();

  /**
   * Y DESPUES, la lectura de buzones.
   *
   * En este orden y en su propio `try/catch`, las dos cosas a proposito: una
   * conversacion IMAP con un servidor lento puede tardar lo que quiera, y los
   * avisos —que son lo unico que de verdad no puede fallar— ya salieron.
   *
   * Si revienta, se dice en el cuerpo y el resto de la respuesta sigue siendo
   * valida. Nunca al reves.
   */
  let correo: ResumenCorreoEntrante;
  try {
    correo = await pasadaDeCorreoEntrante();
  } catch (e) {
    correo = {
      ok: false,
      buzones: 0,
      respuestas: 0,
      ignorados: 0,
      siguiente: null,
      cortadaPorTiempo: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }

  // 200 aunque la pasada falle: el cuerpo lo dice, y un 500 haria que `curl
  // -f` se callara justo cuando hay algo que contar.
  return Response.json(
    { ...resumen, correoEntrante: correo },
    { headers: { "Cache-Control": "no-store" } },
  );
}
