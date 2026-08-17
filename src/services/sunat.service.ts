import "server-only";
import { env } from "@/lib/env";
import { leerRazonSocial, leerTexto } from "@/lib/sunat";

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

/**
 * apis.net.pe migro a decolecta y el dominio antiguo ya no atiende estas
 * consultas: devuelve 401 aunque el token sea bueno, que se lee como "token
 * caducado" y manda a mirar donde no es. El token se genera en
 * `decolecta.com/profile` y la documentacion vive en
 * `decolecta.gitbook.io/docs`.
 */
const URL_BASE = "https://api.decolecta.com/v1/sunat/ruc";

/** Cinco segundos: si tarda mas, es mas rapido teclear el nombre. */
const TIEMPO_LIMITE_MS = 5000;

export type ConsultaRuc =
  | { ok: true; razonSocial: string; direccion?: string; estado?: string }
  | { ok: false; motivo: "sin_token" | "no_encontrado" | "fallo"; detalle: string };

/** POST con `{ruc}`, y la respuesta envuelta en `data`. */
const URL_JSONPE = "https://api.json.pe/api/ruc";

/**
 * A quien se le pregunta, y como.
 *
 * Manda el token que haya: **json.pe primero si esta configurado**, y si no,
 * decolecta. No se apaga ninguno al añadir el otro —es la misma regla que rige
 * los canales de SMS— para que cambiar de proveedor no exija tocar codigo ni
 * deje el formulario mudo mientras tanto.
 *
 * Los dos piden `Bearer`, pero no se parecen en nada mas: uno es GET con el
 * numero en la URL y el otro POST con el numero en el cuerpo.
 */
function aQuienSePregunta(
  ruc: string,
): { url: string; init: RequestInit } | null {
  if (env.JSONPE_TOKEN) {
    return {
      url: URL_JSONPE,
      init: {
        method: "POST",
        headers: {
          Authorization: `Bearer ${env.JSONPE_TOKEN}`,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({ ruc }),
      },
    };
  }

  if (env.DECOLECTA_TOKEN) {
    return {
      url: `${URL_BASE}?numero=${ruc}`,
      init: {
        headers: {
          Authorization: `Bearer ${env.DECOLECTA_TOKEN}`,
          Accept: "application/json",
        },
      },
    };
  }

  return null;
}

export async function consultarRuc(ruc: string): Promise<ConsultaRuc> {
  const limpio = ruc.trim();

  if (!/^\d{11}$/.test(limpio)) {
    return { ok: false, motivo: "fallo", detalle: "El RUC son 11 digitos." };
  }

  const destino = aQuienSePregunta(limpio);

  if (!destino) {
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
    const respuesta = await fetch(destino.url, {
      ...destino.init,
      signal: AbortSignal.timeout(TIEMPO_LIMITE_MS),
      // No se cachea: un RUC puede cambiar de razon social, y el dato lo
      // valida una persona antes de guardarlo.
      cache: "no-store",
    });

    // 422 es como decolecta rechaza un RUC que no existe o no es valido; el
    // 404 se acepta tambien por si vuelve a cambiar.
    if (respuesta.status === 404 || respuesta.status === 422) {
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
        // Sin decir «por hoy»: el plan gratuito de json.pe tiene tope MENSUAL,
        // y prometer que manana vuelve a funcionar seria mentir.
        detalle:
          "Se agoto la cuota de consultas a SUNAT. Escribe la razon social a mano.",
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
