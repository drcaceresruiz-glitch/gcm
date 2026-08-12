"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CalendarPlus, LoaderCircle, TriangleAlert } from "lucide-react";
import { accionCrearPlanSemanal } from "@/app/(dashboard)/obras/[id]/plan-semanal/acciones";

/**
 * Crea una semana nueva. La fecha viene propuesta al proximo dia de corte de la
 * obra; al crearla, navega directo a planificarla.
 */
export function NuevaSemana({
  obraId,
  fechaSugerida,
}: {
  obraId: string;
  fechaSugerida: string;
}) {
  const router = useRouter();
  const [fecha, setFecha] = useState(fechaSugerida);
  const [error, setError] = useState<string | null>(null);
  /// El aviso de numeracion, cuando la fecha deja el correlativo a contramano.
  const [aviso, setAviso] = useState<string | null>(null);
  const [pendiente, iniciar] = useTransition();

  function crear(confirmado = false) {
    setError(null);
    if (!confirmado) setAviso(null);

    iniciar(async () => {
      const r = await accionCrearPlanSemanal(obraId, fecha, confirmado);
      if (r.ok) {
        router.push(`/obras/${obraId}/plan-semanal/${r.id}`);
        return;
      }
      if ("requiereConfirmacion" in r) {
        setAviso(r.aviso);
        return;
      }
      setError(r.error ?? "No se pudo crear la semana.");
    });
  }

  // Cambiar la fecha invalida el aviso: hablaba de la anterior.
  function cambiarFecha(v: string) {
    setFecha(v);
    setAviso(null);
    setError(null);
  }

  return (
    <div className="flex flex-wrap items-end gap-2">
      <label className="text-xs">
        <span className="block opacity-70">Semana que cierra el</span>
        <input
          type="date"
          value={fecha}
          onChange={(e) => cambiarFecha(e.target.value)}
          className="mt-1 rounded-lg border px-2 py-1.5 text-sm"
          style={{ borderColor: "var(--borde)", backgroundColor: "var(--fondo)" }}
        />
      </label>
      <button
        type="button"
        onClick={() => crear()}
        disabled={pendiente}
        className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-white disabled:opacity-60"
        style={{ backgroundColor: "var(--color-marca-600)" }}
      >
        {pendiente ? (
          <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
        ) : (
          <CalendarPlus className="size-4" aria-hidden="true" />
        )}
        Nueva semana
      </button>
      {error && (
        <span className="text-sm" style={{ color: "var(--color-peligro)" }}>
          {error}
        </span>
      )}

      {/* El aviso de numeracion. Se AVISA y no se impide: quien esta en obra a
          veces necesita registrar una semana que se quedo sin meter, y
          prohibirselo no le ayuda. Ocupa toda la linea porque hay que leerlo
          entero antes de decidir. */}
      {aviso && (
        <div
          className="w-full rounded-lg border p-3 text-sm"
          style={{
            borderColor: "var(--color-alerta)",
            backgroundColor: "color-mix(in srgb, var(--color-alerta) 8%, transparent)",
          }}
        >
          <p className="flex items-start gap-2">
            <TriangleAlert
              className="mt-0.5 size-4 shrink-0"
              style={{ color: "var(--color-alerta)" }}
              aria-hidden="true"
            />
            <span>{aviso}</span>
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => crear(true)}
              disabled={pendiente}
              className="rounded-lg px-3 py-1.5 text-xs font-medium text-white disabled:opacity-60"
              style={{ backgroundColor: "var(--color-marca-600)" }}
            >
              Crearla igual
            </button>
            <button
              type="button"
              onClick={() => setAviso(null)}
              className="rounded-lg border px-3 py-1.5 text-xs font-medium"
              style={{ borderColor: "var(--borde)" }}
            >
              Cambiar la fecha
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
