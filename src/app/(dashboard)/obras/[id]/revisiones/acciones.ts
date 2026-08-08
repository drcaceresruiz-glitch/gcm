"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { obtenerSesion } from "@/services/sesion.service";
import { aprobarRevision, crearRevision } from "@/services/revisiones.service";
import { porcentajeAFraccion } from "@/lib/presupuesto";
import { esNegativo, esPositivo, normalizarDecimal, sumar } from "@/lib/decimal";

/**
 * Alta de revisiones del presupuesto.
 *
 * Aqui vive la traduccion entre dos vocabularios. El formulario habla en
 * porcentaje ("12") porque es lo que se lee en un presupuesto y lo que el
 * cliente dicta por telefono; el dominio calcula con fracciones ("0.1200")
 * porque es lo que multiplica la cascada. Convertir en la frontera evita
 * que el numero ambiguo circule por dentro del sistema.
 */

export interface EstadoRevision {
  error?: string;
}

type Lectura = { ok: true; valor: string } | { ok: false; error: string };

function leerPorcentaje(crudo: string, etiqueta: string): Lectura {
  if (crudo === "") return { ok: false, error: `Indica ${etiqueta}.` };

  const fraccion = porcentajeAFraccion(crudo);
  if (fraccion === null) {
    return {
      ok: false,
      error: `El porcentaje de ${etiqueta} no es un numero valido.`,
    };
  }

  // Fuera del rango 0-100 casi siempre hay un cero de mas, o una fraccion
  // escrita donde se esperaba un porcentaje. Con un 1200 % de utilidad la
  // cascada no falla: devuelve un presupuesto trece veces mayor.
  const excedeCien = esPositivo(sumar([fraccion, "-1"], 4));
  if (esNegativo(fraccion) || excedeCien) {
    return {
      ok: false,
      error: `El porcentaje de ${etiqueta} debe estar entre 0 y 100.`,
    };
  }

  return { ok: true, valor: fraccion };
}

/** Fecha de calendario. El desfase de zona horaria lo evita el servicio. */
function leerFecha(crudo: string): Lectura {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(crudo)) {
    return { ok: false, error: "Indica la fecha de la revision." };
  }

  if (Number.isNaN(new Date(crudo).getTime())) {
    return { ok: false, error: "Esa fecha no existe en el calendario." };
  }

  return { ok: true, valor: crudo };
}

export async function accionCrearRevision(
  _previo: EstadoRevision,
  datos: FormData,
): Promise<EstadoRevision> {
  const sesion = await obtenerSesion();
  if (!sesion) redirect("/login");

  const obraId = String(datos.get("obraId") ?? "");
  if (!obraId) return { error: "Falta la obra." };

  const texto = (campo: string) => String(datos.get(campo) ?? "").trim();

  const fecha = leerFecha(texto("fechaRevision"));
  if (!fecha.ok) return { error: fecha.error };

  const gastosGenerales = leerPorcentaje(
    texto("porcentajeGastosGenerales"),
    "gastos generales",
  );
  if (!gastosGenerales.ok) return { error: gastosGenerales.error };

  const utilidad = leerPorcentaje(texto("porcentajeUtilidad"), "utilidad");
  if (!utilidad.ok) return { error: utilidad.error };

  const igv = leerPorcentaje(texto("porcentajeIgv"), "IGV");
  if (!igv.ok) return { error: igv.error };

  // El tipo de cambio es opcional: sin el, la comparacion entre revisiones
  // se muestra solo en soles.
  let tipoCambio: string | null = null;
  const tipoCambioCrudo = texto("tipoCambio");
  if (tipoCambioCrudo !== "") {
    tipoCambio = normalizarDecimal(tipoCambioCrudo, 4);
    if (tipoCambio === null || !esPositivo(tipoCambio)) {
      return { error: "El tipo de cambio no es un numero valido." };
    }
  }

  const resultado = await crearRevision(sesion, obraId, {
    fechaRevision: fecha.valor,
    porcentajeGastosGenerales: gastosGenerales.valor,
    porcentajeUtilidad: utilidad.valor,
    porcentajeIgv: igv.valor,
    tipoCambio,
    clausulas: texto("clausulas") || null,
    notas: texto("notas") || null,
  });

  if (!resultado.ok) return { error: resultado.error };

  // La cabecera de la obra muestra la version de la linea base.
  revalidatePath(`/obras/${obraId}`);
  revalidatePath(`/obras/${obraId}/revisiones`);
  redirect(`/obras/${obraId}/revisiones?creada=${resultado.version}`);
}

/**
 * Aprobar congela el presupuesto y no se puede deshacer, asi que la accion
 * no acepta nada que se pueda escribir: solo los dos identificadores. El
 * permiso y la comprobacion de que sea la ultima revision se resuelven en
 * el servicio, que es la frontera real.
 */
export async function accionAprobarRevision(
  _previo: EstadoRevision,
  datos: FormData,
): Promise<EstadoRevision> {
  const sesion = await obtenerSesion();
  if (!sesion) redirect("/login");

  const obraId = String(datos.get("obraId") ?? "");
  const revisionId = String(datos.get("revisionId") ?? "");
  if (!obraId || !revisionId) return { error: "Falta la revision a aprobar." };

  const resultado = await aprobarRevision(sesion, revisionId);
  if (!resultado.ok) return { error: resultado.error };

  // La obra pasa a mostrar la linea base congelada y a bloquear la edicion.
  revalidatePath(`/obras/${obraId}`);
  revalidatePath(`/obras/${obraId}/revisiones`);
  redirect(`/obras/${obraId}/revisiones?aprobada=${resultado.version}`);
}
