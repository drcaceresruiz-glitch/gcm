import "server-only";
import ExcelJS from "exceljs";

import { nombreDeArchivo } from "@/lib/nombre-archivo";
import { puede } from "@/lib/rbac";
import { obtenerObra } from "@/services/obras.service";
import {
  ordenesParaExportar,
  type FiltrosOrdenes,
  type OrdenResumen,
} from "@/services/ordenes.service";
import type { SesionActiva } from "@/services/sesion.service";

/**
 * Las ordenes de compra de una obra en hoja de calculo.
 *
 * DOS HOJAS, y la segunda es la que de verdad hacia falta. La primera es la
 * lista de ordenes, una por fila, como en pantalla. La segunda abre cada orden
 * en sus IMPUTACIONES —una fila por partida— porque eso es lo que se cruza con
 * el presupuesto para saber cuanto lleva comprometido cada partida, y en
 * pantalla vive dentro de la tarjeta de cada orden, donde no se puede sumar
 * ni ordenar.
 *
 * Lo que sale es lo que se esta mirando: los mismos filtros de la pantalla,
 * sin paginar. Y las cifras entran como NUMERO, que es la diferencia entre una
 * hoja con la que se trabaja y una foto de la pantalla.
 */

export type ResultadoExcel =
  | { ok: true; bytes: Uint8Array; nombre: string }
  | { ok: false; estado: 403 | 404; error: string };

const VERDE = "FF0D5C56";
const DINERO = '"S/" #,##0.00';
const FECHA = "dd/mm/yyyy";

const ESTADO: Record<string, string> = {
  BORRADOR: "Borrador",
  APROBADA: "Aprobada",
  ANULADA: "Anulada",
};

function numero(valor: string | null | undefined): number | null {
  if (valor === null || valor === undefined) return null;
  const n = Number(valor);
  return Number.isFinite(n) ? n : null;
}

export async function generarOrdenesExcel(
  sesion: SesionActiva,
  obraId: string,
  filtros: FiltrosOrdenes,
): Promise<ResultadoExcel> {
  if (!puede(sesion, "orden:leer")) {
    return { ok: false, estado: 403, error: "Sin permiso." };
  }

  // Ata la obra a la empresa de quien mira, como toda lectura de obra. El
  // alcance por obra lo pone `ordenesParaExportar`, igual que la lista.
  const obra = await obtenerObra(sesion, obraId);
  if (!obra) return { ok: false, estado: 404, error: "Obra no encontrada." };

  const { filas, truncado } = await ordenesParaExportar(sesion, obraId, filtros);

  return {
    ok: true,
    bytes: new Uint8Array(await componer(obra.nombreObra, filas, truncado)),
    nombre: nombreDeArchivo({
      ambito: obra.nombreObra,
      documento: "ordenes-de-compra",
      fecha: new Date(),
      extension: "xlsx",
    }),
  };
}

function cabecera(hoja: ExcelJS.Worksheet, titulos: string[]): void {
  const fila = hoja.addRow(titulos);
  fila.eachCell((celda) => {
    celda.font = { bold: true, color: { argb: "FFFFFFFF" } };
    celda.fill = { type: "pattern", pattern: "solid", fgColor: { argb: VERDE } };
  });
  hoja.views = [{ state: "frozen", ySplit: fila.number }];
  // El autofiltro sobre la cabecera: una lista de ordenes se lee filtrando por
  // proveedor o por estado, y ponerlo aqui ahorra hacerlo a mano cada vez.
  hoja.autoFilter = {
    from: { row: fila.number, column: 1 },
    to: { row: fila.number, column: titulos.length },
  };
}

async function componer(
  nombreObra: string,
  filas: readonly OrdenResumen[],
  truncado: boolean,
): Promise<ArrayBuffer> {
  const libro = new ExcelJS.Workbook();
  libro.creator = "GCM";

  // ---- Hoja 1: una fila por orden ----------------------------------------

  const hoja = libro.addWorksheet("Órdenes");
  hoja.columns = [
    { width: 14 }, { width: 12 }, { width: 12 }, { width: 30 }, { width: 14 },
    { width: 46 }, { width: 18 }, { width: 14 }, { width: 14 }, { width: 12 },
    { width: 14 }, { width: 14 }, { width: 14 }, { width: 16 }, { width: 18 },
  ];

  cabecera(hoja, [
    "Número", "Fecha", "Estado", "Proveedor", "RUC", "Descripción",
    "Referencia", "Tipo", "Encargo", "Impuesto", "Subtotal S/",
    "Descuento S/", "Neto S/", "Total S/", "Imputable S/",
  ]);

  for (const o of filas) {
    const fila = hoja.addRow([
      o.numero,
      o.fecha,
      ESTADO[o.estado] ?? o.estado,
      o.proveedor.razonSocial,
      o.proveedor.ruc,
      o.descripcion,
      o.referencia ?? "",
      o.tipo,
      // El numero del encargo, no su id: es lo que la gente dice en voz alta.
      o.encargo ? `E-${o.encargo.numero}` : "",
      o.tipoImpuesto,
      numero(o.subtotal),
      numero(o.descuentoComercial),
      numero(o.neto),
      numero(o.total),
      // La cifra contra la que cuenta la orden. Es la que hay que sumar para
      // reconstruir el comprometido, y por eso va aunque se repita con alguna
      // de las de al lado segun el impuesto.
      numero(o.imputable),
    ]);

    fila.getCell(2).numFmt = FECHA;
    for (let c = 11; c <= 15; c++) fila.getCell(c).numFmt = DINERO;
  }

  // ---- Hoja 2: una fila por imputacion ------------------------------------

  const detalle = libro.addWorksheet("Imputaciones");
  detalle.columns = [
    { width: 14 }, { width: 12 }, { width: 12 }, { width: 30 },
    { width: 16 }, { width: 46 }, { width: 16 },
  ];

  cabecera(detalle, [
    "Orden", "Fecha", "Estado", "Proveedor", "Partida", "Descripción de la partida",
    "Importe S/",
  ]);

  for (const o of filas) {
    for (const i of o.imputaciones) {
      const fila = detalle.addRow([
        o.numero,
        o.fecha,
        ESTADO[o.estado] ?? o.estado,
        o.proveedor.razonSocial,
        i.codigoPartida,
        i.descripcion,
        numero(i.importe),
      ]);
      fila.getCell(2).numFmt = FECHA;
      fila.getCell(7).numFmt = DINERO;
    }
  }

  // ---- El pie que confiesa lo que falta -----------------------------------

  if (truncado) {
    for (const h of [hoja, detalle]) {
      h.addRow([]);
      const fila = h.addRow([
        "Esta exportación está recortada: la obra tiene más órdenes de las que " +
          "caben en un archivo. Acota con los filtros de la pantalla —por fechas, " +
          "por proveedor o por estado— y vuelve a descargar.",
      ]);
      fila.getCell(1).font = { bold: true, color: { argb: "FFB00020" } };
    }
  }

  const pie = hoja.addRow([]);
  pie.getCell(1).value = `Obra: ${nombreObra} · ${filas.length} orden(es)`;

  return libro.xlsx.writeBuffer() as Promise<ArrayBuffer>;
}
