import { tokenDeCabecera } from "@/lib/sms-cola";
import {
  resolverAlcance,
  recogerPendientes,
  confirmarEnviados,
} from "@/services/sms-cola.service";
import type { AlcanceCola } from "@/lib/emisor-sms";

/**
 * La cola de SMS, vista desde el telefono emisor.
 *
 * Es la unica ruta de GCM pensada para una maquina y no para una persona: la
 * consulta la app de `movil/emisor-sms` en el movil de la empresa, cada ~20
 * segundos.
 *
 * - `GET`  devuelve lo que haya que mandar y lo marca como prestado.
 * - `POST` confirma que salio, con `{"enviados": ["id", ...]}`.
 *
 * Se identifica con `Authorization: Bearer <token>`, nunca por parametro en
 * la URL: los servidores escriben las URL en su log de accesos, y ahi el
 * secreto quedaria en claro para siempre.
 *
 * **El token decide DE QUE EMPRESA son los mensajes.** No hay ningun
 * parametro que lo diga, y no puede haberlo: si la empresa viajara en la
 * peticion, cualquier emisor podria pedir la cola de otra constructora.
 *
 * Responde 401 a todo lo que no case, sin distinguir entre «no hay token»,
 * «el token no existe» y «ese emisor esta revocado». Antes habia un 404 para
 * el caso de no tener cola configurada; ya no aplica, porque la ruta existe
 * siempre y quien decide es la credencial.
 */

/// Nunca cacheada: dos peticiones seguidas tienen que dar cosas distintas.
export const dynamic = "force-dynamic";

async function alcanceDe(peticion: Request): Promise<AlcanceCola | null> {
  return resolverAlcance(tokenDeCabecera(peticion.headers.get("authorization")));
}

export async function GET(peticion: Request) {
  const alcance = await alcanceDe(peticion);
  if (!alcance) return new Response("No autorizado", { status: 401 });

  const mensajes = await recogerPendientes(alcance);

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
  const alcance = await alcanceDe(peticion);
  if (!alcance) return new Response("No autorizado", { status: 401 });

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

  // El MISMO alcance con el que se recogieron: confirmar tiene que estar tan
  // acotado como pedir, o un emisor podria hacer desaparecer de la cola los
  // mensajes de otra empresa sin haberlos mandado.
  const confirmados = await confirmarEnviados(alcance, enviados as string[]);

  return Response.json(
    { confirmados },
    { headers: { "Cache-Control": "no-store" } },
  );
}
