"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CalendarPlus, LoaderCircle } from "lucide-react";
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
  const [pendiente, iniciar] = useTransition();

  function crear() {
    setError(null);
    iniciar(async () => {
      const r = await accionCrearPlanSemanal(obraId, fecha);
      if (r.ok) router.push(`/obras/${obraId}/plan-semanal/${r.id}`);
      else setError(r.error ?? "No se pudo crear la semana.");
    });
  }

  return (
    <div className="flex flex-wrap items-end gap-2">
      <label className="text-xs">
        <span className="block opacity-70">Semana que cierra el</span>
        <input
          type="date"
          value={fecha}
          onChange={(e) => setFecha(e.target.value)}
          className="mt-1 rounded-lg border px-2 py-1.5 text-sm"
          style={{ borderColor: "var(--borde)", backgroundColor: "var(--fondo)" }}
        />
      </label>
      <button
        type="button"
        onClick={crear}
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
    </div>
  );
}
