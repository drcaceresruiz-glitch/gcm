"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { obtenerSesion } from "@/services/sesion.service";
import { puede } from "@/lib/rbac";
import {
  analizarProjectXml,
  type ResultadoAnalisisCronograma,
} from "@/lib/msproject-xml";
import { importarCronograma } from "@/services/cronograma.service";
import { convertirMppAXml, puedeConvertirMpp } from "@/services/mpp.service";

/**
 * Flujo en dos pasos: analizar y luego confirmar.
 *
 * El archivo se envia dos veces, y es deliberado, igual que en el importador
 * del presupuesto. La alternativa seria guardar el analisis en el servidor
 * entre un paso y otro, lo que obliga a almacenar archivos ajenos, limpiarlos
 * despues y arrastrar estado de sesion. Analizar dos veces cuesta
 * milisegundos y deja al servidor sin nada que custodiar.
 *
 * El servidor REANALIZA y usa sus propias tareas: la vista previa del
 * navegador es solo para mirar.
 */

/**
 * El .mpp de CRIOCORD pesa 8 MB y su XML sale de 445 KB. El limite se fija
 * con holgura sobre el XML, que es lo unico que se acepta aqui.
 */
const TAMANO_MAXIMO = 20 * 1024 * 1024;

const EXTENSIONES = [".xml", ".mpp"];

/**
 * Deja el contenido en XML, convirtiendo antes si hace falta.
 *
 * El .mpp es binario y propietario; lo convierte MPXJ en el servidor. Si el
 * servidor no puede —en desarrollo no hay Java—, se dice y se pide el .xml,
 * que sigue funcionando igual. Nunca se falla en silencio ni se intenta leer
 * un binario como si fuera XML.
 */
async function comoXml(
  archivo: File,
): Promise<{ ok: true; xml: ArrayBuffer } | { ok: false; error: string }> {
  const contenido = await archivo.arrayBuffer();

  if (!archivo.name.toLowerCase().endsWith(".mpp")) {
    return { ok: true, xml: contenido };
  }

  const convertido = await convertirMppAXml(contenido, archivo.name);
  return convertido.ok
    ? { ok: true, xml: convertido.xml }
    : { ok: false, error: convertido.error };
}

export interface EstadoAnalisisCronograma {
  analisis?: ResultadoAnalisisCronograma;
  nombreArchivo?: string;
  error?: string;
}

type Validacion = { ok: true; archivo: File } | { ok: false; error: string };

function validarArchivo(archivo: unknown): Validacion {
  if (!(archivo instanceof File) || archivo.size === 0) {
    return { ok: false, error: "Selecciona el cronograma de MS Project." };
  }

  const nombre = archivo.name.toLowerCase();

  if (!EXTENSIONES.some((e) => nombre.endsWith(e))) {
    return {
      ok: false,
      error: "Formato no admitido. Sube el .mpp de MS Project o su exportacion a .xml.",
    };
  }

  // Se rechaza aqui y no despues de subirlo: decirle a alguien que su archivo
  // no vale cuando ya ha esperado a que suban 8 MB es peor que no aceptarlo.
  if (nombre.endsWith(".mpp") && !puedeConvertirMpp()) {
    return {
      ok: false,
      error:
        "Este servidor no puede convertir archivos .mpp. Exporta el cronograma " +
        "a XML desde MS Project (Archivo > Guardar como > XML) y sube ese archivo.",
    };
  }

  if (archivo.size > TAMANO_MAXIMO) {
    const mb = (archivo.size / 1024 / 1024).toFixed(1);
    return { ok: false, error: `El archivo pesa ${mb} MB y el limite son 20 MB.` };
  }

  return { ok: true, archivo };
}

export async function accionAnalizar(
  _previo: EstadoAnalisisCronograma,
  datos: FormData,
): Promise<EstadoAnalisisCronograma> {
  const sesion = await obtenerSesion();
  if (!sesion) redirect("/login");

  // Se exige el permiso ya para ANALIZAR, y no solo para guardar. Analizar
  // consume memoria y CPU del servidor con un archivo que trae el usuario:
  // dejarselo hacer a cualquiera con sesion abierta —un consultor de solo
  // lectura, por ejemplo— regala esa capacidad sin ninguna razon.
  if (!puede(sesion, "cronograma:importar")) {
    return { error: "No tienes permiso para importar el cronograma." };
  }

  const validacion = validarArchivo(datos.get("archivo"));
  if (!validacion.ok) return { error: validacion.error };

  const contenido = await comoXml(validacion.archivo);
  if (!contenido.ok) return { error: contenido.error };

  try {
    const analisis = await analizarProjectXml(contenido.xml);
    return { analisis, nombreArchivo: validacion.archivo.name };
  } catch {
    // No se expone el error interno: un archivo corrupto no debe revelar
    // detalles de la libreria ni del servidor.
    return {
      error:
        "No se pudo leer el archivo. Comprueba que sea el XML que exporta MS Project.",
    };
  }
}

export interface EstadoImportacionCronograma {
  error?: string;
}

export async function accionImportar(
  _previo: EstadoImportacionCronograma,
  datos: FormData,
): Promise<EstadoImportacionCronograma> {
  const sesion = await obtenerSesion();
  if (!sesion) redirect("/login");

  // Antes de tocar el archivo, como en `accionAnalizar`: convertir un .mpp
  // LANZA UN PROCESO JAVA, y eso no puede dispararlo quien no puede importar.
  if (!puede(sesion, "cronograma:importar")) {
    return { error: "No tienes permiso para importar el cronograma." };
  }

  const obraId = String(datos.get("obraId") ?? "");
  if (!obraId) return { error: "Falta la obra de destino." };

  const validacion = validarArchivo(datos.get("archivo"));
  if (!validacion.ok) return { error: validacion.error };

  // Se vuelve a convertir y a analizar en el servidor: la vista previa del
  // navegador es solo para mirar, y estas son las tareas que se guardan.
  const contenido = await comoXml(validacion.archivo);
  if (!contenido.ok) return { error: contenido.error };

  let analisis: ResultadoAnalisisCronograma;
  try {
    analisis = await analizarProjectXml(contenido.xml);
  } catch {
    return { error: "No se pudo leer el archivo." };
  }

  // El servicio vuelve a comprobar el permiso y el aislamiento por empresa.
  const resultado = await importarCronograma(
    sesion,
    obraId,
    analisis,
    validacion.archivo.name,
  );

  if (!resultado.ok) return { error: resultado.error };

  revalidatePath(`/obras/${obraId}/cronograma`);

  // Si el corte ya estaba cargado no se creo nada, y la pantalla lo dice en
  // vez de fingir una importacion que no ha ocurrido.
  const estado = resultado.yaEstaba ? "repetido" : "cargado";
  redirect(`/obras/${obraId}/cronograma?${estado}=${resultado.version}`);
}
