"use client";

import { useMemo, useState } from "react";
import { FileSpreadsheet, Printer } from "lucide-react";
import {
  calcularCascadaComercial,
  fraccionAPorcentaje,
  parametrosDeImpuesto,
  porcentajeAFraccion,
  type TipoImpuestoContractual,
} from "@/lib/presupuesto";
import { aplicarDetalle, type NivelDetalle } from "@/lib/propuesta-detalle";
import type { Propuesta } from "@/services/propuesta.service";
import { DocumentoPropuesta } from "@/components/propuesta/DocumentoPropuesta";

/**
 * Que propuesta se emite, antes de imprimirla.
 *
 * Lo que se elige aqui es COMO SE PRESENTA el mismo presupuesto, no cuanto
 * cuesta: la forma de facturar, cuanto detalle se enseña y que textos se
 * añaden. Los porcentajes de gastos generales, utilidad y descuento NO se
 * tocan -vienen de la revision aprobada-, porque cambiarlos aqui produciria
 * un papel que contradice la linea base contra la que se mide la obra.
 *
 * La misma decision alimenta las tres salidas: lo que se ve, lo que se imprime
 * y lo que se descarga. El Excel se pide por POST con estas mismas opciones
 * para que los textos largos no tengan que caber en una URL.
 */

/// El IGV vigente en Peru. Solo se usa como punto de partida cuando la
/// revision se guardo sin IGV (un recibo por honorarios lo guarda en cero) y
/// ahora se quiere emitir con factura.
const IGV_POR_DEFECTO = "0.1800";

const DETALLES: { valor: NivelDetalle; texto: string; ayuda: string }[] = [
  {
    valor: "todo",
    texto: "Todo el detalle",
    ayuda: "Capítulos, partidas y subpartidas, como está el presupuesto.",
  },
  {
    valor: "partidas",
    texto: "Hasta partidas",
    ayuda: "Resume las subpartidas en el importe de su partida.",
  },
  {
    valor: "capitulos",
    texto: "Solo capítulos",
    ayuda: "Una línea por capítulo con su subtotal. El total no cambia.",
  },
];

export function PanelPropuesta({ propuesta }: { propuesta: Propuesta }) {
  const { porcentajes } = propuesta.revision;

  const [impuesto, setImpuesto] = useState<TipoImpuestoContractual>(
    propuesta.revision.tipoImpuesto,
  );
  const [asumida, setAsumida] = useState(propuesta.revision.retencionAsumida);
  const [igv, setIgv] = useState(
    Number(porcentajes.igv) > 0 ? porcentajes.igv : IGV_POR_DEFECTO,
  );
  const [detalle, setDetalle] = useState<NivelDetalle>("todo");
  const [presentacion, setPresentacion] = useState("");
  const [observaciones, setObservaciones] = useState("");

  const lineas = useMemo(
    () => aplicarDetalle(propuesta.lineas, detalle),
    [propuesta.lineas, detalle],
  );

  const cascada = useMemo(
    () =>
      calcularCascadaComercial({
        costoDirecto: propuesta.costoDirectoNeto,
        porcentajeGastosGenerales: porcentajes.gastosGenerales,
        porcentajeUtilidad: porcentajes.utilidad,
        porcentajeDescuento: porcentajes.descuento,
        ...parametrosDeImpuesto(impuesto, igv, asumida, porcentajes.retencion),
      }),
    [propuesta.costoDirectoNeto, porcentajes, impuesto, igv, asumida],
  );

  const vista = {
    lineas,
    cascada,
    impuesto,
    porcentajeIgv: igv,
    porcentajeRetencion: porcentajes.retencion,
    presentacion,
    observaciones,
  };

  return (
    <div className="py-2 print:py-0">
      <Controles
        obraId={propuesta.obra.id}
        revisionId={propuesta.revision.id}
        impuesto={impuesto}
        onImpuesto={setImpuesto}
        igv={igv}
        onIgv={setIgv}
        asumida={asumida}
        onAsumida={setAsumida}
        detalle={detalle}
        onDetalle={setDetalle}
        presentacion={presentacion}
        onPresentacion={setPresentacion}
        observaciones={observaciones}
        onObservaciones={setObservaciones}
      />

      <DocumentoPropuesta propuesta={propuesta} vista={vista} />
    </div>
  );
}

/**
 * Los controles, que NO salen impresos.
 *
 * El PDF lo compone el navegador con "Guardar como PDF": no hay nada que
 * generar en el servidor. El Excel si, y por eso va en un formulario POST con
 * las mismas opciones dentro: asi las observaciones pueden ser largas sin
 * tener que caber en una URL.
 */
function Controles(p: {
  obraId: string;
  revisionId: string;
  impuesto: TipoImpuestoContractual;
  onImpuesto: (v: TipoImpuestoContractual) => void;
  igv: string;
  onIgv: (v: string) => void;
  asumida: boolean;
  onAsumida: (v: boolean) => void;
  detalle: NivelDetalle;
  onDetalle: (v: NivelDetalle) => void;
  presentacion: string;
  onPresentacion: (v: string) => void;
  observaciones: string;
  onObservaciones: (v: string) => void;
}) {
  const ayuda = DETALLES.find((d) => d.valor === p.detalle)?.ayuda ?? "";

  return (
    <div className="mx-auto mb-6 w-full max-w-[210mm] print:hidden">
      <div
        className="rounded-xl border p-4"
        style={{ borderColor: "var(--borde)", backgroundColor: "var(--superficie)" }}
      >
        <p className="text-sm font-semibold">Antes de emitirla</p>
        <p className="mt-0.5 text-xs opacity-70">
          Se elige cómo se presenta el mismo presupuesto. Los gastos generales,
          la utilidad y el descuento vienen de la revisión y no se tocan aquí.
        </p>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="text-xs font-medium">Cómo se factura</span>
            <select
              value={p.impuesto}
              onChange={(e) =>
                p.onImpuesto(e.target.value as TipoImpuestoContractual)
              }
              className="mt-1 w-full rounded-lg border px-2 py-1.5 text-sm"
              style={{ borderColor: "var(--borde)" }}
            >
              <option value="IGV">Con IGV (factura)</option>
              <option value="RENTA">Recibo por honorarios (sin IGV)</option>
              <option value="NINGUNO">Sin impuesto</option>
            </select>
          </label>

          <label className="block">
            <span className="text-xs font-medium">Cuánto detalle</span>
            <select
              value={p.detalle}
              onChange={(e) => p.onDetalle(e.target.value as NivelDetalle)}
              className="mt-1 w-full rounded-lg border px-2 py-1.5 text-sm"
              style={{ borderColor: "var(--borde)" }}
            >
              {DETALLES.map((d) => (
                <option key={d.valor} value={d.valor}>
                  {d.texto}
                </option>
              ))}
            </select>
            <span className="mt-1 block text-xs opacity-70">{ayuda}</span>
          </label>

          {p.impuesto === "IGV" && (
            <label className="block">
              <span className="text-xs font-medium">IGV %</span>
              <input
                value={fraccionAPorcentaje(p.igv) ?? ""}
                onChange={(e) =>
                  p.onIgv(porcentajeAFraccion(e.target.value) ?? "0")
                }
                inputMode="decimal"
                className="mt-1 w-full rounded-lg border px-2 py-1.5 text-sm"
                style={{ borderColor: "var(--borde)" }}
              />
            </label>
          )}

          {p.impuesto === "RENTA" && (
            <label className="flex items-start gap-2 text-xs sm:col-span-2">
              <input
                type="checkbox"
                checked={p.asumida}
                onChange={(e) => p.onAsumida(e.target.checked)}
                className="mt-0.5"
              />
              <span>
                Asumir la retención: el precio sube para que, después de que el
                cliente retenga, quede limpio lo pactado. Sin marcar, el precio
                no cambia y abajo se lee cuánto queda.
              </span>
            </label>
          )}
        </div>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="text-xs font-medium">
              Presentación <span className="opacity-60">(opcional)</span>
            </span>
            <textarea
              value={p.presentacion}
              onChange={(e) => p.onPresentacion(e.target.value)}
              rows={3}
              placeholder="Párrafo de apertura, bajo los datos del cliente."
              className="mt-1 w-full rounded-lg border px-2 py-1.5 text-sm"
              style={{ borderColor: "var(--borde)" }}
            />
          </label>

          <label className="block">
            <span className="text-xs font-medium">
              Observaciones <span className="opacity-60">(opcional)</span>
            </span>
            <textarea
              value={p.observaciones}
              onChange={(e) => p.onObservaciones(e.target.value)}
              rows={3}
              placeholder="Van antes de la firma, junto a las condiciones."
              className="mt-1 w-full rounded-lg border px-2 py-1.5 text-sm"
              style={{ borderColor: "var(--borde)" }}
            />
          </label>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-end gap-3">
        {/* El Excel sale SIEMPRE con todo el detalle, aunque en pantalla se
            este viendo resumido: es el archivo con el que se trabaja. */}
        <form method="POST" action={`/obras/${p.obraId}/propuesta/excel`}>
          <input type="hidden" name="revisionId" value={p.revisionId} />
          <input type="hidden" name="impuesto" value={p.impuesto} />
          <input type="hidden" name="igv" value={p.igv} />
          <input type="hidden" name="asumida" value={String(p.asumida)} />
          <input type="hidden" name="presentacion" value={p.presentacion} />
          <input type="hidden" name="observaciones" value={p.observaciones} />
          <button
            type="submit"
            className="inline-flex items-center gap-2 rounded-lg border px-4 py-2 text-sm font-medium"
            style={{ borderColor: "var(--borde)" }}
          >
            <FileSpreadsheet className="size-4" aria-hidden="true" />
            Descargar Excel
          </button>
        </form>

        <button
          type="button"
          onClick={() => window.print()}
          className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-white"
          style={{ backgroundColor: "var(--color-marca-600)" }}
        >
          <Printer className="size-4" aria-hidden="true" />
          Imprimir o guardar como PDF
        </button>
      </div>
    </div>
  );
}
