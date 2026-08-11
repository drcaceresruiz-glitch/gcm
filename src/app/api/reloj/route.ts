import { tokenDeCabecera, tokenValido } from "@/lib/sms-cola";
import { env } from "@/lib/env";
import { pasadaDelReloj } from "@/services/avisos-reloj";

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

  // 200 aunque la pasada falle: el cuerpo lo dice, y un 500 haria que `curl
  // -f` se callara justo cuando hay algo que contar.
  return Response.json(resumen, {
    headers: { "Cache-Control": "no-store" },
  });
}
