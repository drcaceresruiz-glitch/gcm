"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { obtenerSesion } from "@/services/sesion.service";
import {
  colocarTarjetas,
  type ColocacionTarjeta,
} from "@/services/tablero-semanal.service";

/**
 * Colocar las tarjetas del tablero.
 *
 * El formulario manda TODAS las tarjetas de la semana en un solo envio, con
 * los campos nombrados `dia:<id>`, `fin:<id>`, `prov:<id>` y `color:<id>`. Se
 * recorre el FormData buscando los `dia:`, y de ahi salen los ids: asi no hace
 * falta un campo oculto con la lista, que es una cosa mas que puede quedar
 * desincronizada con las filas que se pintaron.
 */

export interface EstadoTablero {
  error?: string;
}

/** "" o basura -> null. El servicio vuelve a validar el rango. */
function leerDia(valor: FormDataEntryValue | null): number | null {
  const n = Number(String(valor ?? "").trim());
  return Number.isInteger(n) && n >= 1 && n <= 7 ? n : null;
}

function leerTexto(valor: FormDataEntryValue | null): string | null {
  const t = String(valor ?? "").trim();
  return t === "" ? null : t;
}

export async function accionColocarTarjetas(
  _previo: EstadoTablero,
  datos: FormData,
): Promise<EstadoTablero> {
  const sesion = await obtenerSesion();
  if (!sesion) redirect("/login");

  const obraId = String(datos.get("obraId") ?? "");
  const planId = String(datos.get("planId") ?? "");
  if (!obraId || !planId) return { error: "Falta la semana." };

  const tarjetas: ColocacionTarjeta[] = [];

  for (const clave of datos.keys()) {
    if (!clave.startsWith("dia:")) continue;
    const compromisoId = clave.slice(4);

    const diaInicio = leerDia(datos.get(clave));
    const diaFin = leerDia(datos.get(`fin:${compromisoId}`));

    tarjetas.push({
      compromisoId,
      diaInicio,
      // Sin dia de inicio no hay tramo que cerrar: un fin suelto dejaria una
      // tarjeta con final y sin principio, que el tablero no sabe pintar.
      diaFin: diaInicio === null ? null : (diaFin ?? diaInicio),
      proveedorId: leerTexto(datos.get(`prov:${compromisoId}`)),
      color: leerTexto(datos.get(`color:${compromisoId}`)),
    });
  }

  if (tarjetas.length === 0) return { error: "No hay tarjetas que colocar." };

  const resultado = await colocarTarjetas(sesion, obraId, planId, tarjetas);
  if (!resultado.ok) return { error: resultado.error };

  revalidatePath(`/obras/${obraId}/plan-semanal/${planId}/tablero`);
  revalidatePath(`/obras/${obraId}/plan-semanal/${planId}`);
  return {};
}
