"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { obtenerSesion } from "@/services/sesion.service";
import { puede } from "@/lib/rbac";
import {
  analizarProjectXml,
  type ResultadoAnalisisCronograma,
} from "@/lib/msproject-xml";
import { analizarCronogramaExcel } from "@/lib/excel-cronograma";
import {
  importarCronograma,
  reemplazarCronograma,
  type EnRiesgoPorReemplazoCronograma,
} from "@/services/cronograma.service";
import {
  convertirAXml,
  esConvertible,
  puedeConvertirProject,
  SIN_CONVERSOR,
} from "@/services/mpp.service";

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

/**
 * El Excel se limita mas bajo, como el del presupuesto: un cronograma de mil
 * filas no llega a un mega, y aceptar mas solo abre la puerta a que alguien
 * suba otra cosa con extension cambiada.
 */
const TAMANO_MAXIMO_EXCEL = 8 * 1024 * 1024;

// `.pod` es ProjectLibre: el planificador que no tiene licencia de MS Project
// guarda en el, y el servidor ya sabe convertirlo (ver `mpp.service`).
const EXTENSIONES_PROJECT = [".xml", ".mpp", ".pod"];
const EXTENSIONES_EXCEL = [".xlsx", ".xlsm"];
const EXTENSIONES = [...EXTENSIONES_PROJECT, ...EXTENSIONES_EXCEL];

function esExcel(nombre: string): boolean {
  return EXTENSIONES_EXCEL.some((e) => nombre.toLowerCase().endsWith(e));
}

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

  // El `.xml` ya viene listo; los binarios —`.mpp` y `.pod`— pasan por MPXJ.
  if (!esConvertible(archivo.name)) {
    return { ok: true, xml: contenido };
  }

  const convertido = await convertirAXml(contenido, archivo.name);
  return convertido.ok
    ? { ok: true, xml: convertido.xml }
    : { ok: false, error: convertido.error };
}

/**
 * Analiza el archivo, venga de donde venga.
 *
 * Es el unico sitio que sabe que hay dos formatos. Los dos lectores devuelven
 * el MISMO `ResultadoAnalisisCronograma`, asi que a partir de aqui —vista
 * previa, servicio, base de datos— nadie se entera de por donde entro el plan.
 *
 * El try/catch no filtra nada: un archivo corrupto no debe revelar detalles
 * de la libreria ni del servidor.
 */
async function analizarArchivo(
  archivo: File,
): Promise<{ ok: true; analisis: ResultadoAnalisisCronograma } | { ok: false; error: string }> {
  if (esExcel(archivo.name)) {
    try {
      return { ok: true, analisis: await analizarCronogramaExcel(await archivo.arrayBuffer()) };
    } catch {
      return {
        ok: false,
        error:
          "No se pudo leer el Excel. Comprueba que sea un archivo valido y que no este protegido con contrasena.",
      };
    }
  }

  const contenido = await comoXml(archivo);
  if (!contenido.ok) return { ok: false, error: contenido.error };

  try {
    return { ok: true, analisis: await analizarProjectXml(contenido.xml) };
  } catch {
    return {
      ok: false,
      error:
        "No se pudo leer el archivo. Comprueba que sea el XML que exporta MS Project.",
    };
  }
}

export interface EstadoAnalisisCronograma {
  analisis?: ResultadoAnalisisCronograma;
  nombreArchivo?: string;
  error?: string;
}

type Validacion = { ok: true; archivo: File } | { ok: false; error: string };

function validarArchivo(archivo: unknown): Validacion {
  if (!(archivo instanceof File) || archivo.size === 0) {
    return { ok: false, error: "Selecciona el cronograma." };
  }

  const nombre = archivo.name.toLowerCase();

  if (!EXTENSIONES.some((e) => nombre.endsWith(e))) {
    return {
      ok: false,
      error:
        "Formato no admitido. Sube el .mpp de MS Project, el .pod de " +
        "ProjectLibre, su exportacion a .xml, o el Excel de la plantilla (.xlsx).",
    };
  }

  // Se rechaza aqui y no despues de subirlo: decirle a alguien que su archivo
  // no vale cuando ya ha esperado a que suban 8 MB es peor que no aceptarlo.
  if (esConvertible(nombre) && !puedeConvertirProject()) {
    return { ok: false, error: SIN_CONVERSOR };
  }

  const tope = esExcel(nombre) ? TAMANO_MAXIMO_EXCEL : TAMANO_MAXIMO;
  if (archivo.size > tope) {
    const mb = (archivo.size / 1024 / 1024).toFixed(1);
    const topeMb = Math.round(tope / 1024 / 1024);
    return { ok: false, error: `El archivo pesa ${mb} MB y el limite son ${topeMb} MB.` };
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

  const leido = await analizarArchivo(validacion.archivo);
  if (!leido.ok) return { error: leido.error };

  return { analisis: leido.analisis, nombreArchivo: validacion.archivo.name };
}

export interface EstadoImportacionCronograma {
  error?: string;
  /**
   * El corte ya estaba y el archivo trae OTRO plan. No se ha escrito nada:
   * hace falta que alguien vea lo que se lleva por delante y lo acepte.
   */
  riesgo?: EnRiesgoPorReemplazoCronograma;
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

  // Se vuelve a analizar en el servidor: la vista previa del navegador es
  // solo para mirar, y estas son las tareas que se guardan.
  const leido = await analizarArchivo(validacion.archivo);
  if (!leido.ok) return { error: leido.error };

  // El servicio vuelve a comprobar el permiso y el aislamiento por empresa.
  const resultado = await importarCronograma(
    sesion,
    obraId,
    leido.analisis,
    validacion.archivo.name,
  );

  if (!resultado.ok) return { error: resultado.error };

  /**
   * Mismo corte, plan distinto: NO se ha escrito nada todavia.
   *
   * Se devuelve el riesgo a la pantalla en vez de redirigir, porque lo que
   * viene despues destruye y quien lo autorice tiene que verlo antes.
   */
  if ("requiereConfirmacion" in resultado) {
    return { riesgo: resultado.riesgo };
  }

  revalidatePath(`/obras/${obraId}/cronograma`);

  // Si el corte ya estaba cargado CON EL MISMO PLAN no se creo nada, y la
  // pantalla lo dice en vez de fingir una importacion que no ha ocurrido.
  const estado = resultado.yaEstaba ? "repetido" : "cargado";
  redirect(`/obras/${obraId}/cronograma?${estado}=${resultado.version}`);
}

/**
 * Segundo paso del reemplazo: aplicar lo que la pantalla ya enseño.
 *
 * Va aparte de `accionImportar` a proposito. Que reemplazar tenga su propia
 * accion —y su propia casilla de confirmacion— impide que un reintento del
 * primer envio acabe reescribiendo un corte sin que nadie lo pidiera.
 */
export async function accionReemplazar(
  _previo: EstadoImportacionCronograma,
  datos: FormData,
): Promise<EstadoImportacionCronograma> {
  const sesion = await obtenerSesion();
  if (!sesion) redirect("/login");

  if (!puede(sesion, "cronograma:importar")) {
    return { error: "No tienes permiso para importar el cronograma." };
  }

  const obraId = String(datos.get("obraId") ?? "");
  if (!obraId) return { error: "Falta la obra de destino." };

  if (datos.get("confirmado") !== "si") {
    return { error: "Marca la casilla para confirmar que quieres reemplazar el corte." };
  }

  const validacion = validarArchivo(datos.get("archivo"));
  if (!validacion.ok) return { error: validacion.error };

  // Se reanaliza en el servidor, igual que al importar: lo que se guarda sale
  // de aqui y no de lo que el navegador diga haber visto.
  const leido = await analizarArchivo(validacion.archivo);
  if (!leido.ok) return { error: leido.error };

  const resultado = await reemplazarCronograma(
    sesion,
    obraId,
    leido.analisis,
    validacion.archivo.name,
  );

  if (!resultado.ok) return { error: resultado.error };

  revalidatePath(`/obras/${obraId}/cronograma`);
  redirect(`/obras/${obraId}/cronograma?reemplazado=${resultado.version}`);
}
