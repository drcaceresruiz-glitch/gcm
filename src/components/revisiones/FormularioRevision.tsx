"use client";

import { useActionState, useMemo, useState } from "react";
import { useFormStatus } from "react-dom";
import { AlertCircle, LoaderCircle, Table2 } from "lucide-react";
import {
  accionCrearRevision,
  type EstadoRevision,
} from "@/app/(dashboard)/obras/[id]/revisiones/acciones";
import { calcularCascadaComercial, porcentajeAFraccion } from "@/lib/presupuesto";
import { sumar } from "@/lib/decimal";
import { CampoTexto } from "@/components/auth/CampoTexto";
import { CuadroCascadaComercial } from "@/components/revisiones/CuadroCascadaComercial";

/**
 * Alta de una revision del presupuesto.
 *
 * La cascada se recalcula mientras se escribe. No es adorno: los
 * porcentajes son la diferencia entre 735 mil y 919 mil, y quien crea la
 * revision tiene que ver esa cifra ANTES de guardarla, porque despues es
 * el numero contra el que se medira toda la obra.
 *
 * El calculo del navegador y el del servidor son el mismo `calcularCascada`
 * sobre el mismo costo directo, asi que la vista previa no puede
 * discrepar de lo que se guarda.
 */

export interface ValoresIniciales {
  /// En porcentaje legible ("12"), ya convertidos por quien renderiza.
  gastosGenerales: string;
  utilidad: string;
  igv: string;
  tipoCambio: string;
  clausulas: string;
}

interface Props {
  obraId: string;
  fechaHoy: string;
  costoDirecto: string;
  descuentos: string;
  totalPartidas: number;
  iniciales: ValoresIniciales;
  /// Version de la ultima revision, si la hay: la nueva sera la siguiente.
  ultimaVersion: number | null;
}

export function FormularioRevision({
  obraId,
  fechaHoy,
  costoDirecto,
  descuentos,
  totalPartidas,
  iniciales,
  ultimaVersion,
}: Props) {
  const [estado, accion] = useActionState<EstadoRevision, FormData>(
    accionCrearRevision,
    {},
  );

  const [gastosGenerales, setGastosGenerales] = useState(iniciales.gastosGenerales);
  const [utilidad, setUtilidad] = useState(iniciales.utilidad);
  const [igv, setIgv] = useState(iniciales.igv);
  const [descuento, setDescuento] = useState("0");
  const [tipoImpuesto, setTipoImpuesto] = useState<"IGV" | "RENTA" | "NINGUNO">(
    "IGV",
  );
  const [retencionAsumida, setRetencionAsumida] = useState(false);

  // Un porcentaje a medio escribir vale cero en la vista previa: la cifra
  // se corrige sola en cuanto el numero esta completo.
  const cascada = useMemo(
    () =>
      calcularCascadaComercial({
        // El MISMO neto que calcula el servidor: las partidas negativas del
        // presupuesto son costo directo, no descuento comercial. Si aqui se
        // usara el bruto, la vista previa mentiria sobre lo que se guarda.
        costoDirecto: sumar([costoDirecto, descuentos], 2),
        porcentajeGastosGenerales: porcentajeAFraccion(gastosGenerales) ?? "0",
        porcentajeUtilidad: porcentajeAFraccion(utilidad) ?? "0",
        porcentajeDescuento: porcentajeAFraccion(descuento) ?? "0",
        porcentajeIgv:
          tipoImpuesto === "IGV" ? (porcentajeAFraccion(igv) ?? "0") : "0",
        retencion:
          tipoImpuesto === "RENTA"
            ? {
                modo: retencionAsumida ? "SUMADA" : "DESCONTADA",
                porcentaje: "0.08",
              }
            : undefined,
      }),
    [
      costoDirecto,
      descuentos,
      gastosGenerales,
      utilidad,
      igv,
      descuento,
      tipoImpuesto,
      retencionAsumida,
    ],
  );

  const etiquetas = {
    gastosGenerales: gastosGenerales.trim() || "0",
    utilidad: utilidad.trim() || "0",
    descuento: descuento.trim() || "0",
    igv: igv.trim() || "0",
  };

  if (totalPartidas === 0) {
    return (
      <div
        className="rounded-xl border border-dashed p-8 text-center"
        style={{ borderColor: "var(--borde)" }}
      >
        <Table2 className="mx-auto size-8 opacity-40" aria-hidden="true" />
        <p className="mt-3 text-sm opacity-70">
          Esta obra no tiene partidas: no hay costo directo que congelar.
        </p>
        <p className="mt-1 text-sm opacity-60">
          Importa primero el presupuesto desde Excel.
        </p>
      </div>
    );
  }

  return (
    <form action={accion} className="grid gap-6 lg:grid-cols-2" noValidate>
      <input type="hidden" name="obraId" value={obraId} />

      <div className="space-y-4">
        {estado.error && (
          <p
            role="alert"
            className="flex items-start gap-2 rounded-lg px-3 py-2 text-sm"
            style={{
              backgroundColor:
                "color-mix(in oklab, var(--color-peligro) 15%, transparent)",
            }}
          >
            <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <span>{estado.error}</span>
          </p>
        )}

        <CampoTexto
          id="fechaRevision"
          name="fechaRevision"
          type="date"
          etiqueta="Fecha de la revisión"
          defaultValue={fechaHoy}
          ayuda="La del documento, no la de hoy si se carga después."
          required
        />

        <div className="grid gap-4 sm:grid-cols-3">
          <CampoTexto
            id="porcentajeGastosGenerales"
            name="porcentajeGastosGenerales"
            type="text"
            inputMode="decimal"
            etiqueta="Gastos generales %"
            value={gastosGenerales}
            onChange={(e) => setGastosGenerales(e.target.value)}
            required
          />
          <CampoTexto
            id="porcentajeUtilidad"
            name="porcentajeUtilidad"
            type="text"
            inputMode="decimal"
            etiqueta="Utilidad %"
            value={utilidad}
            onChange={(e) => setUtilidad(e.target.value)}
            required
          />
          <CampoTexto
            id="porcentajeIgv"
            name="porcentajeIgv"
            type="text"
            inputMode="decimal"
            etiqueta="IGV %"
            value={igv}
            onChange={(e) => setIgv(e.target.value)}
            required
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <CampoTexto
            id="porcentajeDescuento"
            name="porcentajeDescuento"
            type="text"
            inputMode="decimal"
            etiqueta="Descuento comercial %"
            value={descuento}
            onChange={(e) => setDescuento(e.target.value)}
            ayuda="Se resta del subtotal, después de gastos generales y utilidad."
          />

          <div>
            <label className="block text-sm font-medium" htmlFor="tipoImpuesto">
              Cómo se factura
            </label>
            <select
              id="tipoImpuesto"
              name="tipoImpuesto"
              className="mt-1 w-full rounded border p-2 text-sm"
              value={tipoImpuesto}
              onChange={(e) =>
                setTipoImpuesto(e.target.value as "IGV" | "RENTA" | "NINGUNO")
              }
            >
              <option value="IGV">Con IGV (factura)</option>
              <option value="RENTA">Recibo por honorarios (sin IGV)</option>
              <option value="NINGUNO">Sin impuesto</option>
            </select>
          </div>
        </div>

        {tipoImpuesto === "RENTA" && (
          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              name="retencionAsumida"
              className="mt-1"
              checked={retencionAsumida}
              onChange={(e) => setRetencionAsumida(e.target.checked)}
            />
            <span>
              Asumir la retención del 8 %: el precio sube para que, después de
              que el cliente retenga, quede limpio lo pactado. Sin marcar, el
              precio no cambia y abajo se lee cuánto queda.
            </span>
          </label>
        )}

        <CampoTexto
          id="tipoCambio"
          name="tipoCambio"
          type="text"
          inputMode="decimal"
          etiqueta="Tipo de cambio"
          defaultValue={iniciales.tipoCambio}
          ayuda="Opcional. Sin él, la diferencia entre revisiones solo sale en soles."
        />

        <CampoArea
          id="clausulas"
          name="clausulas"
          etiqueta="Cláusulas de ejecución"
          defaultValue={iniciales.clausulas}
          rows={5}
          ayuda="Alcance, forma de pago, garantía y vigencia pactados en esta revisión."
        />

        <CampoArea
          id="notas"
          name="notas"
          etiqueta="Notas internas"
          rows={2}
          ayuda="Opcional. Por qué se emite esta revisión."
        />
      </div>

      <div className="space-y-3">
        <div>
          <h2 className="text-sm font-semibold">
            Así quedará la revisión v{(ultimaVersion ?? 0) + 1}
          </h2>
          <p className="mt-1 text-sm opacity-70">
            Sobre el costo directo de las {totalPartidas} partidas que tiene
            hoy la obra.
          </p>
        </div>

        <div
          className="rounded-xl border p-1.5"
          style={{
            borderColor: "var(--borde)",
            backgroundColor: "var(--superficie)",
          }}
        >
          <CuadroCascadaComercial cascada={cascada} porcentajes={etiquetas} />
        </div>

        <BotonCrear />

        <p className="text-xs opacity-60">
          Se guarda una copia de las {totalPartidas} partidas tal como están
          ahora. Esa copia no cambia aunque después se edite el presupuesto.
        </p>
      </div>
    </form>
  );
}

function BotonCrear() {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className="flex w-full items-center justify-center gap-2 rounded-lg px-5 py-2.5 text-sm font-medium text-white disabled:opacity-60"
      style={{ backgroundColor: "var(--color-marca-600)" }}
    >
      {pending && (
        <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
      )}
      {pending ? "Creando revisión..." : "Crear revisión"}
    </button>
  );
}

interface CampoAreaProps
  extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  etiqueta: string;
  ayuda?: string;
}

/** Version de CampoTexto para texto largo: clausulas y notas. */
function CampoArea({ etiqueta, ayuda, id, ...props }: CampoAreaProps) {
  const idAyuda = ayuda ? `${id}-ayuda` : undefined;

  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-sm font-medium">
        {etiqueta}
      </label>
      <textarea
        id={id}
        aria-describedby={idAyuda}
        className="w-full rounded-lg border px-3 py-2 text-sm outline-none"
        style={{ borderColor: "var(--borde)", backgroundColor: "var(--fondo)" }}
        {...props}
      />
      {ayuda && (
        <p id={idAyuda} className="text-xs opacity-60">
          {ayuda}
        </p>
      )}
    </div>
  );
}
