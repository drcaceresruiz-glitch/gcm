"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { obtenerSesion } from "@/services/sesion.service";
import {
  anadirLineaAMeta,
  editarLineaDeMeta,
  eliminarLineaDeMeta,
  moverLineaDeMeta,
} from "@/services/meta-edicion.service";

/**
 * Corregir la meta linea a linea, sin volver al Excel.
 *
 * Los importes que llegan por el formulario son datos que esta persona ya
 * podia escribir en la plantilla —un metrado, un precio—, no cifras
 * calculadas: el parcial NO se acepta cuando hay metrado y precio, se vuelve
 * a multiplicar en el servidor. Es la misma regla que la formula del Excel, y
 * lo que impide que alguien cambie el importe de una linea editando la
 * pagina.
 */

export interface EstadoLinea {
  error?: string;
  /// Paso algo que hay que contar aunque la operacion saliera bien: hoy, que
  /// una partida perdio su importe al convertirse en capitulo.
  aviso?: string;
  /// true solo tras guardar. Es lo que cierra la fila en la pantalla: sin
  /// esto, el formulario se cerraba tambien al fallar y el error no se veia.
  ok?: true;
}

const texto = (datos: FormData, campo: string) => String(datos.get(campo) ?? "");

export async function accionEditarLineaMeta(
  _previo: EstadoLinea,
  datos: FormData,
): Promise<EstadoLinea> {
  const sesion = await obtenerSesion();
  if (!sesion) redirect("/login");

  const obraId = texto(datos, "obraId");
  const lineaId = texto(datos, "lineaId");
  if (!obraId || !lineaId) return { error: "Falta la línea a corregir." };

  const r = await editarLineaDeMeta(sesion, obraId, lineaId, {
    descripcion: texto(datos, "descripcion"),
    unidad: texto(datos, "unidad"),
    metrado: texto(datos, "metrado"),
    precioUnitario: texto(datos, "precioUnitario"),
    parcial: texto(datos, "parcial"),
  });
  if (!r.ok) return { error: r.error };

  revalidatePath(`/obras/${obraId}/meta`);
  revalidatePath(`/obras/${obraId}/contractual`);
  return { ok: true };
}

export async function accionAnadirLineaMeta(
  _previo: EstadoLinea,
  datos: FormData,
): Promise<EstadoLinea> {
  const sesion = await obtenerSesion();
  if (!sesion) redirect("/login");

  const obraId = texto(datos, "obraId");
  if (!obraId) return { error: "Falta la obra." };

  const r = await anadirLineaAMeta(sesion, obraId, {
    codigoRef: texto(datos, "codigoRef"),
    descripcion: texto(datos, "descripcion"),
    unidad: texto(datos, "unidad"),
    metrado: texto(datos, "metrado"),
    precioUnitario: texto(datos, "precioUnitario"),
    parcial: texto(datos, "parcial"),
  });
  if (!r.ok) return { error: r.error };

  revalidatePath(`/obras/${obraId}/meta`);
  revalidatePath(`/obras/${obraId}/contractual`);
  return { ok: true };
}

export async function accionEliminarLineaMeta(
  _previo: EstadoLinea,
  datos: FormData,
): Promise<EstadoLinea> {
  const sesion = await obtenerSesion();
  if (!sesion) redirect("/login");

  const obraId = texto(datos, "obraId");
  const lineaId = texto(datos, "lineaId");
  if (!obraId || !lineaId) return { error: "Falta la línea a quitar." };

  const r = await eliminarLineaDeMeta(sesion, obraId, lineaId);
  if (!r.ok) return { error: r.error };

  revalidatePath(`/obras/${obraId}/meta`);
  revalidatePath(`/obras/${obraId}/contractual`);
  return { ok: true };
}

/**
 * Mover una linea del borrador dentro del arbol.
 *
 * Las cuatro direcciones van por la MISMA accion y no por cuatro: lo unico que
 * cambia entre ellas es una palabra, y cuatro acciones gemelas se
 * desincronizan a la primera guarda que se añada en una y se olvide en las
 * otras tres.
 *
 * El aviso NO es un error: cuando una partida con importe pasa a ser capitulo
 * pierde su cifra —un capitulo vale la suma de los suyos— y eso hay que
 * decirlo, pero el movimiento se hizo y la pantalla ya se repinto.
 */
export async function accionMoverLineaMeta(
  _previo: EstadoLinea,
  datos: FormData,
): Promise<EstadoLinea> {
  const sesion = await obtenerSesion();
  if (!sesion) redirect("/login");

  const obraId = texto(datos, "obraId");
  const lineaId = texto(datos, "lineaId");
  const direccion = texto(datos, "direccion");
  if (!obraId || !lineaId) return { error: "Falta la línea a mover." };

  // La direccion viene del formulario: se compara contra la lista cerrada en
  // vez de confiar en el texto, que es la regla de la casa para todo lo que
  // llega de fuera.
  const valida = (["subir", "bajar", "sangrar", "quitar-sangria"] as const).find(
    (d) => d === direccion,
  );
  if (!valida) return { error: "Esa forma de mover no existe." };

  const r = await moverLineaDeMeta(sesion, obraId, lineaId, valida);
  if (!r.ok) return { error: r.error };

  revalidatePath(`/obras/${obraId}/meta`);
  revalidatePath(`/obras/${obraId}/contractual`);
  return r.aviso ? { ok: true, aviso: r.aviso } : { ok: true };
}
