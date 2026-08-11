import { tokenDeCabecera } from "@/lib/sms-cola";
import {
  emisorAutorizado,
  hayColaSms,
  recogerPendientes,
  confirmarEnviados,
} from "@/services/sms-cola.service";

/**
 * La cola de SMS, vista desde el telefono emisor.
 *
 * Es la unica ruta de GCM pensada para una maquina y no para una persona: la
 * consulta MacroDroid o Tasker en el movil de la empresa, cada ~20 segundos.
 *
 * - `GET`  devuelve lo que haya que mandar y lo marca como prestado.
 * - `POST` confirma que salio, con `{"enviados": ["id", ...]}`.
 *
 * Se identifica con `Authorization: Bearer <SMS_COLA_TOKEN>`, nunca por
 * parametro en la URL: los servidores escriben las URL en su log de accesos,
 * y ahi el secreto quedaria en claro para siempre.
 *
 * Cuando no hay cola configurada responde 404 y no 401: sin token en el
 * servidor no hay nada que autorizar, y un 401 invitaria a seguir probando
 * credenciales contra algo que no existe.
 */

/// Nunca cacheada: dos peticiones seguidas tienen que dar cosas distintas.
export const dynamic = "force-dynamic";

function autorizado(peticion: Request): boolean {
  return emisorAutorizado(tokenDeCabecera(peticion.headers.get("authorization")));
}

export async function GET(peticion: Request) {
  if (!hayColaSms()) return new Response("No disponible", { status: 404 });
  if (!autorizado(peticion)) return new Response("No autorizado", { status: 401 });

  const mensajes = await recogerPendientes();

  return Response.json(
    { mensajes },
    {
      headers: {
        // Que ningun intermediario guarde esto: lleva codigos en claro.
        "Cache-Control": "no-store",
      },
    },
  );
}

export async function POST(peticion: Request) {
  if (!hayColaSms()) return new Response("No disponible", { status: 404 });
  if (!autorizado(peticion)) return new Response("No autorizado", { status: 401 });

  let cuerpo: unknown;
  try {
    cuerpo = await peticion.json();
  } catch {
    return new Response("Cuerpo ilegible", { status: 400 });
  }

  const enviados = (cuerpo as { enviados?: unknown })?.enviados;
  if (!Array.isArray(enviados) || enviados.some((id) => typeof id !== "string")) {
    return new Response("Se esperaba {\"enviados\": [\"id\", ...]}", {
      status: 400,
    });
  }

  const confirmados = await confirmarEnviados(enviados as string[]);

  return Response.json(
    { confirmados },
    { headers: { "Cache-Control": "no-store" } },
  );
}
