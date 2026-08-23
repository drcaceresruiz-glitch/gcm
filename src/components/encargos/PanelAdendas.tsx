"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { AlertCircle, Check, LoaderCircle, Plus, X } from "lucide-react";

import {
  accionRegistrarAdenda,
  accionResolverAdenda,
  type EstadoAdenda,
} from "@/app/(dashboard)/obras/[id]/proveedores/acciones-adendas";
import type { AdendasDelEncargo } from "@/services/adendas.service";
import { soles } from "@/utils/formato";

/**
 * Los adicionales y deductivos de un contratista, con su circuito de firmas.
 *
 * QUIEN PIDE NO FIRMA, y la pantalla lo hace evidente: quien solo tiene
 * `adenda:crear` ve el formulario y NO ve los botones de aprobar. No es una
 * comodidad -el servicio lo rechaza igual-, es que un boton que siempre
 * responde «no tienes permiso» enseña a ignorar los avisos.
 *
 * EL SIGNO NO SE TECLEA. Se elige «Adicional» o «Deductivo» y el importe va
 * siempre en positivo: pedir un menos delante es como alguien registra un
 * adicional de -8.000 sin darse cuenta, y esa cifra va directa al
 * comprometido de la obra.
 */

function Guardar({ texto, peligro }: { texto: string; peligro?: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
      style={{
        backgroundColor: peligro ? "var(--color-peligro)" : "var(--color-marca-600)",
      }}
    >
      {pending && <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />}
      {texto}
    </button>
  );
}

function Aviso({ estado }: { estado: EstadoAdenda }) {
  if (!estado.error) return null;
  return (
    <p
      className="flex items-start gap-2 rounded-lg p-2 text-sm"
      style={{
        color: "var(--color-peligro)",
        backgroundColor: "color-mix(in oklab, var(--color-peligro) 15%, transparent)",
      }}
    >
      <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      {estado.error}
    </p>
  );
}

const ETIQUETA: Record<string, string> = {
  PENDIENTE: "Pendiente de firma",
  APROBADA: "Aprobada",
  RECHAZADA: "Rechazada",
};

export function PanelAdendas({
  obraId,
  encargoId,
  montoContratado,
  adendas,
  puedeRegistrar,
  puedeAprobar,
}: {
  obraId: string;
  encargoId: string;
  montoContratado: string;
  adendas: AdendasDelEncargo;
  puedeRegistrar: boolean;
  puedeAprobar: boolean;
}) {
  const [abierto, setAbierto] = useState(false);
  const [registro, accionRegistrar] = useActionState(accionRegistrarAdenda, {});
  const [resolucion, accionResolver] = useActionState(accionResolverAdenda, {});
  /// Que adenda se esta rechazando: el motivo solo se pide al decir que no.
  const [rechazando, setRechazando] = useState<string | null>(null);

  const { resumen, filas, montoVigente } = adendas;
  const hayCambios = filas.length > 0;

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold">Adendas del contrato</h3>
          <p className="mt-0.5 max-w-2xl text-sm opacity-70">
            Alcances que aparecieron después de firmar. Los registra obra y los
            firma gerencia: lo aprobado sale de la bolsa operativa.
          </p>
        </div>
        {puedeRegistrar && !abierto && (
          <button
            type="button"
            onClick={() => setAbierto(true)}
            className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm"
            style={{ borderColor: "var(--borde)" }}
          >
            <Plus className="size-4" aria-hidden="true" />
            Registrar adenda
          </button>
        )}
      </div>

      {/* Las tres cifras. El firmado se conserva SIEMPRE al lado del vigente:
          es lo que permite ver cuanto se movio el contrato. */}
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-lg border p-3" style={{ borderColor: "var(--borde)" }}>
          <p className="text-xs uppercase opacity-60">Contratado</p>
          <p className="text-base font-semibold tabular-nums">
            {soles(montoContratado)}
          </p>
        </div>
        <div className="rounded-lg border p-3" style={{ borderColor: "var(--borde)" }}>
          <p className="text-xs uppercase opacity-60">Adendas aprobadas</p>
          <p className="text-base font-semibold tabular-nums">
            {soles(resumen.neto)}
          </p>
          {(resumen.adicionales !== "0.00" || resumen.deductivos !== "0.00") && (
            <p className="mt-0.5 text-xs opacity-60">
              +{soles(resumen.adicionales)} · −{soles(resumen.deductivos)}
            </p>
          )}
        </div>
        <div
          className="rounded-lg border p-3"
          style={{ borderColor: "var(--color-marca-600)" }}
        >
          <p className="text-xs uppercase opacity-60">Vigente (lo que se paga)</p>
          <p className="text-base font-semibold tabular-nums">
            {soles(montoVigente)}
          </p>
        </div>
      </div>

      {resumen.pendientes > 0 && (
        <p
          className="rounded-lg p-3 text-sm"
          style={{
            backgroundColor: "color-mix(in oklab, var(--color-alerta) 15%, transparent)",
          }}
        >
          {/* «Hay tres pendientes» no mueve a nadie; «hay 30.000 esperando tu
              firma» sí. */}
          <strong>
            {resumen.pendientes} adenda{resumen.pendientes === 1 ? "" : "s"} por{" "}
            {soles(resumen.importePendiente)}
          </strong>{" "}
          {resumen.pendientes === 1 ? "espera" : "esperan"} la firma de gerencia.
          Todavía no cuenta{resumen.pendientes === 1 ? "" : "n"} en lo que se
          paga.
        </p>
      )}

      {abierto && puedeRegistrar && (
        <form
          action={accionRegistrar}
          className="space-y-3 rounded-lg border p-4"
          style={{ borderColor: "var(--borde)" }}
        >
          <input type="hidden" name="obraId" value={obraId} />
          <input type="hidden" name="encargoId" value={encargoId} />

          <Aviso estado={registro} />

          <fieldset className="flex flex-wrap items-center gap-4 text-sm">
            <legend className="sr-only">Clase de adenda</legend>
            <label className="flex items-center gap-2">
              <input type="radio" name="clase" value="ADICIONAL" defaultChecked />
              Adicional <span className="opacity-60">(cuesta más)</span>
            </label>
            <label className="flex items-center gap-2">
              <input type="radio" name="clase" value="DEDUCTIVO" />
              Deductivo <span className="opacity-60">(alcance que se le quita)</span>
            </label>
          </fieldset>

          <div className="flex flex-wrap gap-3">
            <label className="text-sm">
              <span className="block opacity-70">Importe (sin IGV)</span>
              <input
                name="importe"
                inputMode="decimal"
                required
                placeholder="8000.00"
                className="mt-1 w-36 rounded border px-2 py-1 text-right tabular-nums"
              />
            </label>
            <label className="text-sm">
              <span className="block opacity-70">Fecha del documento</span>
              <input
                name="fecha"
                type="date"
                required
                className="mt-1 rounded border px-2 py-1"
              />
            </label>
            <label className="text-sm">
              <span className="block opacity-70">Referencia (opcional)</span>
              <input
                name="referencia"
                placeholder="Carta 014-2026"
                className="mt-1 w-48 rounded border px-2 py-1"
              />
            </label>
          </div>

          <label className="block text-sm">
            <span className="block opacity-70">Concepto</span>
            <input
              name="concepto"
              required
              placeholder="Refuerzo de columnas no previsto en la orden"
              className="mt-1 w-full rounded border px-2 py-1"
            />
          </label>

          <label className="block text-sm">
            <span className="block opacity-70">
              Motivo — por qué procede
            </span>
            <textarea
              name="motivo"
              required
              rows={2}
              placeholder="El plano de detalle llegó después de emitida la orden de compra."
              className="mt-1 w-full rounded border px-2 py-1"
            />
          </label>

          <div className="flex items-center gap-2">
            <Guardar texto="Registrar y enviar a firma" />
            <button
              type="button"
              onClick={() => setAbierto(false)}
              className="rounded-lg border px-3 py-1.5 text-sm"
              style={{ borderColor: "var(--borde)" }}
            >
              Cancelar
            </button>
          </div>
        </form>
      )}

      <Aviso estado={resolucion} />

      {hayCambios ? (
        <ul className="space-y-2">
          {filas.map((a) => (
            <li
              key={a.id}
              className="rounded-lg border p-3 text-sm"
              style={{ borderColor: "var(--borde)" }}
            >
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="font-medium">
                  Adenda {a.numero} · {a.concepto}
                </span>
                <span className="tabular-nums font-semibold">
                  {soles(a.importe)}
                </span>
              </div>

              <p className="mt-0.5 text-xs opacity-70">
                {ETIQUETA[a.estado]} · registrada por {a.registradaPor}
                {a.referencia && <> · {a.referencia}</>}
                {a.resueltaPor && <> · firmó {a.resueltaPor}</>}
              </p>

              <p className="mt-1 text-sm opacity-80">{a.motivo}</p>

              {a.motivoRechazo && (
                <p className="mt-1 text-sm" style={{ color: "var(--color-peligro)" }}>
                  Rechazada: {a.motivoRechazo}
                </p>
              )}

              {a.estado === "PENDIENTE" && puedeAprobar && (
                <div className="mt-2 flex flex-wrap items-end gap-2 border-t pt-2">
                  <form action={accionResolver} className="flex items-center gap-2">
                    <input type="hidden" name="obraId" value={obraId} />
                    <input type="hidden" name="encargoId" value={encargoId} />
                    <input type="hidden" name="adendaId" value={a.id} />
                    <input type="hidden" name="decision" value="APROBAR" />
                    <Guardar texto="Aprobar" />
                  </form>

                  {rechazando === a.id ? (
                    <form
                      action={accionResolver}
                      className="flex flex-wrap items-end gap-2"
                    >
                      <input type="hidden" name="obraId" value={obraId} />
                      <input type="hidden" name="encargoId" value={encargoId} />
                      <input type="hidden" name="adendaId" value={a.id} />
                      <input type="hidden" name="decision" value="RECHAZAR" />
                      <label className="text-sm">
                        <span className="block opacity-70">
                          Motivo del rechazo
                        </span>
                        <input
                          name="motivoRechazo"
                          required
                          placeholder="Ese alcance ya estaba en la partida 3.2"
                          className="mt-1 w-72 rounded border px-2 py-1"
                        />
                      </label>
                      <Guardar texto="Rechazar" peligro />
                      <button
                        type="button"
                        onClick={() => setRechazando(null)}
                        className="rounded-lg border px-2 py-1.5 text-sm"
                        style={{ borderColor: "var(--borde)" }}
                      >
                        <X className="size-4" aria-hidden="true" />
                      </button>
                    </form>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setRechazando(a.id)}
                      className="rounded-lg border px-3 py-1.5 text-sm"
                      style={{ borderColor: "var(--borde)" }}
                    >
                      Rechazar
                    </button>
                  )}
                </div>
              )}

              {a.estado === "PENDIENTE" && !puedeAprobar && (
                <p className="mt-1 flex items-center gap-1 text-xs opacity-60">
                  <Check className="size-3" aria-hidden="true" />
                  Esperando la firma de gerencia.
                </p>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm opacity-60">
          Este contrato no tiene adendas: se paga lo que se firmó.
        </p>
      )}
    </section>
  );
}
