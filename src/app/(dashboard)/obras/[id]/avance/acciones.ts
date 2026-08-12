"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { obtenerSesion } from "@/services/sesion.service";
import { registrarAvancesEnLote } from "@/services/cronograma.service";
import type { EntradaParte } from "@/lib/parte-diario";

export interface EstadoParte {
  ok?: boolean;
  error?: string;
  mensaje?: string;
}

/**
 * Guarda el parte del dia entero: una peticion para todas las tareas.
 *
 * Las casillas viajan como `avance-<uid>`, y las vacias llegan igual que las
 * llenas. Aqui NO se filtran: quien decide que una casilla vacia no escribe
 * nada es `validarLoteAvance`, que es logica pura y esta probada. Filtrar
 * tambien aqui seria tener la regla en dos sitios, y el dia que cambiara una
 * cambiaria solo la mitad del sistema.
 */
export async function accionGuardarParte(
  _previo: EstadoParte,
  datos: FormData,
): Promise<EstadoParte> {
  const sesion = await obtenerSesion();
  if (!sesion) redirect("/login");

  const obraId = String(datos.get("obraId") ?? "");
  if (!obraId) return { ok: false, error: "Falta la obra." };

  const entradas: EntradaParte[] = [];
  for (const [campo, valor] of datos.entries()) {
    if (!campo.startsWith("avance-")) continue;
    const uid = Number(campo.slice("avance-".length));
    if (!Number.isSafeInteger(uid)) continue;
    entradas.push({ uid, porcentaje: String(valor) });
  }

  const resultado = await registrarAvancesEnLote(sesion, obraId, {
    fecha: String(datos.get("fecha") ?? ""),
    entradas,
  });

  if (!resultado.ok) return { ok: false, error: resultado.error };

  if (resultado.escritas === 0) {
    // No es un fallo, pero decirle «guardado» a quien no escribio nada le haria
    // creer que reporto la obra entera.
    return { ok: true, mensaje: "No escribiste ningún porcentaje: no se guardó nada." };
  }

  // El parte mueve la curva S, el informe y el panel de «Qué falta», asi que se
  // repintan las tres pantallas donde eso se ve.
  revalidatePath(`/obras/${obraId}/avance`);
  revalidatePath(`/obras/${obraId}/cronograma`);
  revalidatePath(`/obras/${obraId}`);

  return { ok: true, mensaje: `Parte guardado: ${resultado.escritas} tarea(s).` };
}
