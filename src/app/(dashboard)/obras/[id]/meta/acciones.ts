"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { obtenerSesion } from "@/services/sesion.service";
import { puede } from "@/lib/rbac";
import { analizarExcel } from "@/lib/excel-presupuesto";
import { esPositivo, normalizarDecimal } from "@/lib/decimal";
import {
  aprobarMeta,
  crearMeta,
  eliminarBorrador,
  type EntradaItemMeta,
} from "@/services/meta.service";
import type { ModoMeta } from "@/lib/bolsa";

/**
 * Carga del presupuesto meta desde el Excel de la plantilla.
 *
 * UNA sola hoja y UNA sola lectura. Hasta el 23 de agosto de 2026 el libro
 * traia dos —costo directo y gastos generales— y se leian por separado;
 * media meta guardada, el costo directo sin sus sueldos, daba una bolsa que
 * exageraba justo en lo que faltaba. Y eso fue lo que paso: el total de la
 * segunda hoja llegaba en cero al guardar.
 *
 * Los sueldos, alquileres y polizas son ahora filas de la misma hoja, sin
 * Item. No hay dos cuentas que puedan discrepar porque no hay dos cuentas.
 */

const EXTENSIONES = [".xlsx", ".xlsm", ".xls"];
const LIMITE_BYTES = 8 * 1024 * 1024;

const MODOS: ModoMeta[] = ["PARTIDA", "CAPITULO", "FRENTE"];

export interface EstadoMeta {
  error?: string;
}

type Validacion = { ok: true; archivo: File } | { ok: false; error: string };

function validarArchivo(archivo: unknown): Validacion {
  if (!(archivo instanceof File) || archivo.size === 0) {
    return { ok: false, error: "Selecciona el archivo de Excel de la meta." };
  }

  const nombre = archivo.name.toLowerCase();
  if (!EXTENSIONES.some((e) => nombre.endsWith(e))) {
    return {
      ok: false,
      error: `El archivo tiene que ser de Excel (${EXTENSIONES.join(", ")}).`,
    };
  }

  if (archivo.size > LIMITE_BYTES) {
    const mb = (archivo.size / 1024 / 1024).toFixed(1);
    return { ok: false, error: `El archivo pesa ${mb} MB y el limite son 8 MB.` };
  }

  return { ok: true, archivo };
}

export async function accionImportarMeta(
  _previo: EstadoMeta,
  datos: FormData,
): Promise<EstadoMeta> {
  const sesion = await obtenerSesion();
  if (!sesion) redirect("/login");

  // El permiso se comprueba ANTES de tocar el archivo: analizar un Excel de
  // 8 MB es trabajo, y no se le regala a quien no puede guardar el resultado.
  if (!puede(sesion, "meta:crear")) {
    return { error: "No tienes permiso para cargar el presupuesto meta." };
  }

  const obraId = String(datos.get("obraId") ?? "");
  if (!obraId) return { error: "Falta la obra." };

  const modoCrudo = String(datos.get("modo") ?? "");
  const modo = MODOS.find((m) => m === modoCrudo);
  if (!modo) return { error: "Elige con que detalle se compara la meta." };

  const mesesPlazo = normalizarDecimal(String(datos.get("mesesPlazo") ?? ""), 2);
  if (mesesPlazo === null || !esPositivo(mesesPlazo)) {
    return {
      error:
        "Indica el plazo en meses con el que presupuestas las lineas que se " +
        "pagan por mes.",
    };
  }

  const fechaMeta = String(datos.get("fechaMeta") ?? "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fechaMeta)) {
    return { error: "Indica la fecha de la meta." };
  }

  const validacion = validarArchivo(datos.get("archivo"));
  if (!validacion.ok) return { error: validacion.error };

  const contenido = await validacion.archivo.arrayBuffer();

  let costo;
  try {
    // `propiasDeLaMeta`: en la hoja de la meta, una fila con importe y sin
    // codigo no es una nota, es un costo real que el contrato no desglosa.
    // Ahi viven tambien el residente, la camioneta y las polizas.
    costo = await analizarExcel(contenido, { propiasDeLaMeta: true });
  } catch {
    // No se expone el error interno: un archivo corrupto no debe revelar
    // detalles de la libreria ni del servidor.
    return { error: "No se pudo leer el archivo. Comprueba que sea un Excel valido." };
  }

  if (costo.errores.length > 0) {
    const primero = costo.errores[0]!;
    return {
      error:
        `Hoja de costo directo, fila ${primero.fila}: ${primero.mensaje}` +
        (costo.errores.length > 1
          ? ` (y ${costo.errores.length - 1} error(es) mas)`
          : ""),
    };
  }


  if (costo.filas.length === 0) {
    return { error: "La hoja de costo directo no tiene ni una linea valida." };
  }

  /**
   * Las lineas del Excel, EN EL ORDEN DEL DOCUMENTO.
   *
   * Las que tienen codigo y las propias de la meta llegan en dos listas -son
   * cosas distintas para el importador-, pero en el papel iban entremezcladas
   * y asi es como su autor las lee. Se vuelven a unir por su numero de fila.
   */
  const enOrden = [
    ...costo.filas.map((f) => ({ fila: f.fila, conCodigo: f, propia: null })),
    ...costo.propiasDeLaMeta.map((p) => ({ fila: p.fila, conCodigo: null, propia: p })),
  ].sort((a, b) => a.fila - b.fila);

  const items: EntradaItemMeta[] = enOrden.map(({ conCodigo, propia }) => {
    if (propia !== null) {
      return {
        // Sin codigo: es lo que la marca como propia de la meta y lo que hace
        // que no aparezca en el contractual ni, por tanto, en el cronograma.
        codigoRef: null,
        descripcion: propia.descripcion,
        tipo: "PARTIDA" as const,
        nivel: 1,
        unidad: propia.unidad,
        metrado: propia.metrado,
        precioUnitario: propia.precioUnitario,
        parcial: propia.parcial,
        porcentajeRecargo: null,
        fechaInicio: null,
        fechaFin: null,
      };
    }

    const f = conCodigo!;
    return {
    // El codigo del Excel ES la referencia al contractual. Si no existe alla,
    // el calculo lo tratara como linea propia de la meta y lo dira: no hace
    // falta que el usuario marque nada.
    codigoRef: f.codigo,
    descripcion: f.descripcion,
    tipo: f.tipo,
    nivel: f.nivel,
    unidad: f.unidad,
    metrado: f.metrado,
    precioUnitario: f.precioUnitario,
    // Un capitulo es un titulo: no lleva importe propio y no suma.
    parcial: f.tipo === "CAPITULO" ? null : f.parcial,
    // El recargo solo lo llevan los capitulos, y es de donde saldra el
    // presupuesto contractual. Se perdia justo aqui: el importador ya lo
    // leia, pero este mapeo no lo copiaba y nunca llegaba a la base.
    porcentajeRecargo: f.porcentajeRecargo,
      fechaInicio: f.fechaInicio,
      fechaFin: f.fechaFin,
    };
  });

  const resultado = await crearMeta(sesion, obraId, {
    modo,
    fechaMeta,
    mesesPlazo,
    notas: String(datos.get("notas") ?? "").trim() || null,
    items,
  });

  if (!resultado.ok) return { error: resultado.error };

  revalidatePath(`/obras/${obraId}`);
  revalidatePath(`/obras/${obraId}/meta`);
  redirect(`/obras/${obraId}/meta?creada=${resultado.version}`);
}

/**
 * Congelar la meta no se deshace, asi que la accion no acepta nada que se
 * pueda escribir: solo los dos identificadores. El permiso y la comprobacion
 * de que sea la ultima version las resuelve el servicio, que es la frontera.
 */
export async function accionAprobarMeta(
  _previo: EstadoMeta,
  datos: FormData,
): Promise<EstadoMeta> {
  const sesion = await obtenerSesion();
  if (!sesion) redirect("/login");

  const obraId = String(datos.get("obraId") ?? "");
  const metaId = String(datos.get("metaId") ?? "");
  if (!obraId || !metaId) return { error: "Falta la meta a aprobar." };

  const resultado = await aprobarMeta(sesion, metaId);
  if (!resultado.ok) return { error: resultado.error };

  revalidatePath(`/obras/${obraId}`);
  revalidatePath(`/obras/${obraId}/meta`);
  redirect(`/obras/${obraId}/meta?aprobada=${resultado.version}`);
}

export async function accionEliminarBorradorMeta(
  _previo: EstadoMeta,
  datos: FormData,
): Promise<EstadoMeta> {
  const sesion = await obtenerSesion();
  if (!sesion) redirect("/login");

  const obraId = String(datos.get("obraId") ?? "");
  const metaId = String(datos.get("metaId") ?? "");
  if (!obraId || !metaId) return { error: "Falta la meta a eliminar." };

  const resultado = await eliminarBorrador(sesion, metaId);
  if (!resultado.ok) return { error: resultado.error };

  revalidatePath(`/obras/${obraId}`);
  revalidatePath(`/obras/${obraId}/meta`);
  redirect(`/obras/${obraId}/meta?eliminada=${resultado.version}`);
}
