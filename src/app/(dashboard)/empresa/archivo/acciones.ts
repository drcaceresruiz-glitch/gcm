"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { obtenerSesion } from "@/services/sesion.service";
import {
  restaurarObra,
  type InformeRestauracion,
} from "@/services/restauracion.service";

export interface RespuestaRestauracion {
  ok: boolean;
  error?: string;
  informe?: InformeRestauracion;
}

/// 40 MB. Un respaldo sin fotos de una obra real pesa 40 KB; con fotos puede
/// crecer, y por encima de esto no cabe en una accion de servidor.
const TOPE = 40 * 1024 * 1024;

/**
 * Recarga el respaldo de una obra.
 *
 * En UN paso y no en dos como el importador de Excel, a proposito: el
 * importador REEMPLAZA el presupuesto y por eso hay que ver antes lo que se va
 * a perder. Esto no reemplaza nada —crea una copia archivada aparte—, asi que
 * el segundo viaje del archivo solo anadiria espera. Lo que si se comprueba
 * antes de escribir una sola fila es la firma, la huella de cada entrada y que
 * el respaldo sea de esta empresa.
 */
export async function accionRestaurarObra(
  _previo: RespuestaRestauracion,
  datos: FormData,
): Promise<RespuestaRestauracion> {
  const sesion = await obtenerSesion();
  if (!sesion) redirect("/login");

  const archivo = datos.get("respaldo");

  if (!(archivo instanceof File) || archivo.size === 0) {
    return { ok: false, error: "Elige el archivo .zip del respaldo." };
  }

  if (archivo.size > TOPE) {
    return {
      ok: false,
      error: `El archivo pesa ${(archivo.size / 1024 / 1024).toFixed(1)} MB y el tope son 40 MB.`,
    };
  }

  try {
    const r = await restaurarObra(
      sesion,
      Buffer.from(await archivo.arrayBuffer()),
    );

    if (!r.ok) return { ok: false, error: r.error };

    revalidatePath("/panel");
    return { ok: true, informe: r.datos };
  } catch (e) {
    console.error("[restauracion] fallo no previsto", e);
    return {
      ok: false,
      error:
        "No se pudo restaurar. Si el archivo es el correcto y vuelve a fallar, " +
        "avisa: puede haber quedado una obra a medias.",
    };
  }
}
