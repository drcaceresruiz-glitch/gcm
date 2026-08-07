"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { obtenerSesion } from "@/services/sesion.service";
import { analizarExcel, type ResultadoAnalisis } from "@/lib/excel-presupuesto";
import { aplicarImportacion } from "@/services/importacion.service";

/**
 * Flujo en dos pasos: analizar y luego confirmar.
 *
 * El archivo se envia dos veces, y es deliberado. La alternativa seria
 * guardar el analisis en el servidor entre un paso y otro, lo que obliga a
 * almacenar archivos ajenos, limpiarlos despues y arrastrar estado de
 * sesion. Analizar dos veces cuesta milisegundos y deja al servidor sin
 * nada que custodiar.
 */

const TAMANO_MAXIMO = 8 * 1024 * 1024;
const EXTENSIONES = [".xlsx", ".xlsm"];

export interface EstadoAnalisis {
  analisis?: ResultadoAnalisis;
  nombreArchivo?: string;
  error?: string;
}

type Validacion = { ok: true; archivo: File } | { ok: false; error: string };

function validarArchivo(archivo: unknown): Validacion {
  if (!(archivo instanceof File) || archivo.size === 0) {
    return { ok: false, error: "Selecciona un archivo de Excel." };
  }

  const nombre = archivo.name.toLowerCase();
  if (!EXTENSIONES.some((e) => nombre.endsWith(e))) {
    return {
      ok: false,
      error: "Formato no admitido. Guarda tu presupuesto como .xlsx desde Excel.",
    };
  }

  if (archivo.size > TAMANO_MAXIMO) {
    const mb = (archivo.size / 1024 / 1024).toFixed(1);
    return { ok: false, error: `El archivo pesa ${mb} MB y el limite son 8 MB.` };
  }

  return { ok: true, archivo };
}

export async function accionAnalizar(
  _previo: EstadoAnalisis,
  datos: FormData,
): Promise<EstadoAnalisis> {
  const sesion = await obtenerSesion();
  if (!sesion) redirect("/login");

  const validacion = validarArchivo(datos.get("archivo"));
  if (!validacion.ok) return { error: validacion.error };

  try {
    const analisis = await analizarExcel(await validacion.archivo.arrayBuffer());
    return { analisis, nombreArchivo: validacion.archivo.name };
  } catch {
    // No se expone el error interno: un archivo corrupto no debe revelar
    // detalles de la libreria ni del servidor.
    return {
      error:
        "No se pudo leer el archivo. Comprueba que sea un Excel valido y que no este protegido con contrasena.",
    };
  }
}

export interface EstadoImportacion {
  error?: string;
}

export async function accionImportar(
  _previo: EstadoImportacion,
  datos: FormData,
): Promise<EstadoImportacion> {
  const sesion = await obtenerSesion();
  if (!sesion) redirect("/login");

  const obraId = String(datos.get("obraId") ?? "");
  if (!obraId) return { error: "Falta la obra de destino." };

  const validacion = validarArchivo(datos.get("archivo"));
  if (!validacion.ok) return { error: validacion.error };

  let analisis: ResultadoAnalisis;
  try {
    analisis = await analizarExcel(await validacion.archivo.arrayBuffer());
  } catch {
    return { error: "No se pudo leer el archivo." };
  }

  if (analisis.filas.length === 0) {
    return { error: "El archivo no contiene ninguna partida valida." };
  }

  const resultado = await aplicarImportacion(
    sesion,
    obraId,
    analisis.filas,
    datos.get("reemplazar") === "on",
  );

  if (!resultado.ok) return { error: resultado.error };

  revalidatePath(`/obras/${obraId}`);
  redirect(`/obras/${obraId}?importadas=${resultado.partidas}`);
}
