import "server-only";
import { env } from "@/lib/env";

/**
 * Consulta de RUC contra SUNAT, a traves de apis.net.pe.
 *
 * SUNAT no publica una API abierta, asi que se pasa por un tercero. Eso trae
 * dos consecuencias que gobiernan todo este archivo.
 *
 * LA PRIMERA: esto puede fallar y no pasa nada. El servicio se cae, el token
 * caduca, se agota la cuota del dia. Dar de alta un proveedor NO puede
 * depender de eso: la consulta es una comodidad que ahorra teclear un nombre
 * largo, y el formulario funciona igual sin ella. Por eso nunca lanza; todos
 * los caminos devuelven un resultado que la pantalla sabe enseñar.
 *
 * LA SEGUNDA: el dato que llega es de fuera. Se valida la forma antes de
 * creerselo, y lo que devuelve solo RELLENA un campo que sigue siendo
 * editable. Nunca se guarda sin que alguien lo haya visto.
 */

const URL_BASE = "https://api.apis.net.pe/v2/sunat/ruc";

/** Cinco segundos: si tarda mas, es mas rapido teclear el nombre. */
const TIEMPO_LIMITE_MS = 5000;

export type ConsultaRuc =
  | { ok: true; razonSocial: string; direccion?: string; estado?: string }
  | { ok: false; motivo: "sin_token" | "no_encontrado" | "fallo"; detalle: string };

/**
 * El nombre del campo cambia entre versiones de la API: v2 devuelve
 * `razonSocial` y v1 devolvia `nombre`. Se aceptan los dos para que una
 * actualizacion del proveedor no rompa el autorrelleno en silencio.
 */
function leerRazonSocial(datos: unknown): string | null {
  if (typeof datos !== "object" || datos === null) return null;
  const registro = datos as Record<string, unknown>;

  for (const campo of ["razonSocial", "nombre", "razon_social"]) {
    const valor = registro[campo];
    if (typeof valor === "string" && valor.trim()) return valor.trim();
  }

  return null;
}

function leerTexto(datos: unknown, campo: string): string | undefined {
  if (typeof datos !== "object" || datos === null) return undefined;
  const valor = (datos as Record<string, unknown>)[campo];
  return typeof valor === "string" && valor.trim() ? valor.trim() : undefined;
}

export async function consultarRuc(ruc: string): Promise<ConsultaRuc> {
  const limpio = ruc.trim();

  if (!/^\d{11}$/.test(limpio)) {
    return { ok: false, motivo: "fallo", detalle: "El RUC son 11 digitos." };
  }

  if (!env.APIS_NET_PE_TOKEN) {
    return {
      ok: false,
      motivo: "sin_token",
      detalle:
        "La consulta a SUNAT no esta configurada. Escribe la razon social a mano.",
    };
  }

  try {
    // Se aborta a los cinco segundos: sin esto, una peticion colgada dejaria
    // el formulario esperando indefinidamente por un dato que es opcional.
    const respuesta = await fetch(`${URL_BASE}?numero=${limpio}`, {
      headers: {
        Authorization: `Bearer ${env.APIS_NET_PE_TOKEN}`,
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(TIEMPO_LIMITE_MS),
      // No se cachea: un RUC puede cambiar de razon social, y el dato lo
      // valida una persona antes de guardarlo.
      cache: "no-store",
    });

    if (respuesta.status === 404) {
      return {
        ok: false,
        motivo: "no_encontrado",
        detalle: `SUNAT no tiene ningun contribuyente con el RUC ${limpio}.`,
      };
    }

    if (respuesta.status === 401 || respuesta.status === 403) {
      return {
        ok: false,
        motivo: "fallo",
        detalle:
          "El token de consulta a SUNAT no es valido o caduco. Escribe la razon social a mano.",
      };
    }

    if (respuesta.status === 429) {
      return {
        ok: false,
        motivo: "fallo",
        detalle:
          "Se agoto la cuota de consultas a SUNAT por hoy. Escribe la razon social a mano.",
      };
    }

    if (!respuesta.ok) {
      return {
        ok: false,
        motivo: "fallo",
        detalle: `SUNAT respondio con un error (${respuesta.status}). Escribe la razon social a mano.`,
      };
    }

    const datos: unknown = await respuesta.json();
    const razonSocial = leerRazonSocial(datos);

    if (!razonSocial) {
      return {
        ok: false,
        motivo: "fallo",
        detalle:
          "La respuesta de SUNAT no traia la razon social. Escribela a mano.",
      };
    }

    return {
      ok: true,
      razonSocial,
      direccion: leerTexto(datos, "direccion"),
      estado: leerTexto(datos, "estado"),
    };
  } catch (error) {
    // Incluye el corte por tiempo limite. Se traga a proposito: esto no
    // puede tumbar un alta de proveedor.
    const esTiempo = error instanceof Error && error.name === "TimeoutError";

    return {
      ok: false,
      motivo: "fallo",
      detalle: esTiempo
        ? "SUNAT tardo demasiado en responder. Escribe la razon social a mano."
        : "No se pudo consultar a SUNAT. Escribe la razon social a mano.",
    };
  }
}
