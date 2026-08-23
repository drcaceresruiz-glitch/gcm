import "server-only";

import { puede } from "@/lib/rbac";
import { analizarExcel } from "@/lib/excel-presupuesto";
import { esPositivo, normalizarDecimal } from "@/lib/decimal";
import { crearMeta, type EntradaItemMeta } from "@/services/meta.service";
import type { SesionActiva } from "@/services/sesion.service";
import {
  MODOS,
  validarArchivoMeta,
} from "@/lib/meta-excel";

/**
 * Cargar el presupuesto meta desde el Excel de la plantilla.
 *
 * VIVE APARTE DE LA ACCION porque ya hay DOS sitios desde donde se hace: la
 * pantalla de la meta de una obra existente, y el alta de obra —donde se
 * puede adjuntar el Excel y crear la obra con su presupuesto de una vez—.
 * Copiar el mapeo en el segundo sitio habria sido tener dos lecturas del
 * mismo archivo que se desincronizan a la primera columna nueva, que es
 * exactamente el patron que costo caro con la hoja de gastos generales.
 *
 * NO redirige ni repinta: eso lo decide quien llama, porque cada camino
 * termina en un sitio distinto.
 */

/*
 * Se reexportan: quien carga una meta no tiene por que saber que la parte
 * pura vive en otro archivo. La razon de que viva alli es del CI, no suya
 * -ver la cabecera de `lib/meta-excel`-.
 */
export { mesesEntre, validarArchivoMeta, MODOS } from "@/lib/meta-excel";

export type ResultadoCarga =
  | { ok: true; version: number }
  | { ok: false; error: string };

export interface EntradaCargaMeta {
  archivo: unknown;
  modo: string;
  mesesPlazo: string;
  fechaMeta: string;
  notas?: string | null;
}

export async function cargarMetaDesdeExcel(
  sesion: SesionActiva,
  obraId: string,
  entrada: EntradaCargaMeta,
): Promise<ResultadoCarga> {
  // El permiso se comprueba ANTES de tocar el archivo: analizar un Excel de
  // 8 MB es trabajo, y no se le regala a quien no puede guardar el resultado.
  if (!puede(sesion, "meta:crear")) {
    return { ok: false, error: "No tienes permiso para cargar el presupuesto meta." };
  }

  const modo = MODOS.find((m) => m === entrada.modo);
  if (!modo) return { ok: false, error: "Elige con que detalle se compara la meta." };

  const mesesPlazo = normalizarDecimal(entrada.mesesPlazo, 2);
  if (mesesPlazo === null || !esPositivo(mesesPlazo)) {
    return {
      ok: false,
      error:
        "Indica el plazo en meses con el que presupuestas las lineas que se " +
        "pagan por mes.",
    };
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(entrada.fechaMeta)) {
    return { ok: false, error: "Indica la fecha de la meta." };
  }

  const validacion = validarArchivoMeta(entrada.archivo);
  if (!validacion.ok) return { ok: false, error: validacion.error };

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
    return {
      ok: false,
      error: "No se pudo leer el archivo. Comprueba que sea un Excel valido.",
    };
  }

  if (costo.errores.length > 0) {
    const primero = costo.errores[0]!;
    return {
      ok: false,
      error:
        `Hoja de costo directo, fila ${primero.fila}: ${primero.mensaje}` +
        (costo.errores.length > 1
          ? ` (y ${costo.errores.length - 1} error(es) mas)`
          : ""),
    };
  }

  if (costo.filas.length === 0) {
    return { ok: false, error: "La hoja de costo directo no tiene ni una linea valida." };
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
      // El codigo del Excel ES la referencia al contractual. Si no existe
      // alla, el calculo lo tratara como linea propia de la meta y lo dira:
      // no hace falta que el usuario marque nada.
      codigoRef: f.codigo,
      descripcion: f.descripcion,
      tipo: f.tipo,
      nivel: f.nivel,
      unidad: f.unidad,
      metrado: f.metrado,
      precioUnitario: f.precioUnitario,
      // Un capitulo es un titulo: no lleva importe propio y no suma.
      parcial: f.tipo === "CAPITULO" ? null : f.parcial,
      // El recargo puede venir en un capitulo o en una partida suelta; el
      // motor resuelve la precedencia. Se copia tal cual llego.
      porcentajeRecargo: f.porcentajeRecargo,
      fechaInicio: f.fechaInicio,
      fechaFin: f.fechaFin,
    };
  });

  const resultado = await crearMeta(sesion, obraId, {
    modo,
    fechaMeta: entrada.fechaMeta,
    mesesPlazo,
    notas: entrada.notas?.trim() || null,
    items,
  });

  if (!resultado.ok) return { ok: false, error: resultado.error };
  return { ok: true, version: resultado.version };
}
