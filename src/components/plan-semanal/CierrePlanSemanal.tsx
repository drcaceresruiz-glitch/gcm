"use client";

import { useState, useTransition } from "react";
import { Check, LoaderCircle } from "lucide-react";
import { accionCerrarPlanSemanal } from "@/app/(dashboard)/obras/[id]/plan-semanal/acciones";
import { CAUSAS_CNC, ETIQUETA_CNC } from "@/lib/plan-semanal";
import type { CausaNoCumplimiento } from "@/generated/prisma/enums";

/**
 * Cerrar la semana: por cada compromiso, cumplido si/no; si no, su causa (CNC)
 * y una nota. Al cerrar sale el PPC. Un no cumplido exige causa —es lo que hace
 * util el cierre—.
 */

interface Fila {
  id: string;
  descripcion: string;
  cumplido: boolean;
  causa: CausaNoCumplimiento;
  nota: string;
}

export function CierrePlanSemanal({
  obraId,
  planId,
  compromisos,
}: {
  obraId: string;
  planId: string;
  compromisos: { id: string; descripcion: string }[];
}) {
  const [filas, setFilas] = useState<Fila[]>(() =>
    compromisos.map((c) => ({
      id: c.id,
      descripcion: c.descripcion,
      // Arranca SIN tildar: el residente marca solo lo que de verdad se cumplio.
      // Dar por cumplido por defecto inflaba el PPC y tildaba hasta tareas al 0%.
      cumplido: false,
      causa: "PRERREQUISITO",
      nota: "",
    })),
  );
  const [error, setError] = useState<string | null>(null);
  const [pendiente, iniciar] = useTransition();

  function set(id: string, cambios: Partial<Fila>) {
    setFilas((p) => p.map((f) => (f.id === id ? { ...f, ...cambios } : f)));
  }

  function cerrar() {
    setError(null);
    iniciar(async () => {
      const r = await accionCerrarPlanSemanal(
        obraId,
        planId,
        filas.map((f) => ({
          compromisoId: f.id,
          cumplido: f.cumplido,
          causa: f.cumplido ? null : f.causa,
          nota: f.nota.trim() || null,
        })),
      );
      if (!r.ok) setError(r.error ?? "No se pudo cerrar la semana.");
      // En exito, revalidatePath repinta la pagina ya cerrada.
    });
  }

  if (compromisos.length === 0) {
    return <p className="text-sm opacity-60">Anade compromisos antes de cerrar la semana.</p>;
  }

  return (
    <div className="space-y-3">
      <ul className="space-y-2">
        {filas.map((f) => (
          <li
            key={f.id}
            className="rounded-lg border p-2.5 text-sm"
            style={{ borderColor: "var(--borde)" }}
          >
            <div className="flex flex-wrap items-center gap-3">
              <label className="inline-flex items-center gap-1.5">
                <input
                  type="checkbox"
                  checked={f.cumplido}
                  onChange={(e) => set(f.id, { cumplido: e.target.checked })}
                />
                <span>Cumplido</span>
              </label>
              <span className="flex-1">{f.descripcion}</span>
            </div>
            {!f.cumplido && (
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <select
                  value={f.causa}
                  onChange={(e) => set(f.id, { causa: e.target.value as CausaNoCumplimiento })}
                  className="rounded-lg border px-2 py-1 text-xs"
                  style={{ borderColor: "var(--borde)", backgroundColor: "var(--fondo)" }}
                >
                  {CAUSAS_CNC.map((c) => (
                    <option key={c} value={c}>
                      {ETIQUETA_CNC[c]}
                    </option>
                  ))}
                </select>
                <input
                  value={f.nota}
                  onChange={(e) => set(f.id, { nota: e.target.value })}
                  placeholder="Nota (opcional)"
                  className="min-w-40 flex-1 rounded-lg border px-2 py-1 text-xs"
                  style={{ borderColor: "var(--borde)", backgroundColor: "var(--fondo)" }}
                />
              </div>
            )}
          </li>
        ))}
      </ul>
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={cerrar}
          disabled={pendiente}
          className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-white disabled:opacity-60"
          style={{ backgroundColor: "var(--color-marca-600)" }}
        >
          {pendiente ? (
            <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
          ) : (
            <Check className="size-4" aria-hidden="true" />
          )}
          Cerrar la semana
        </button>
        {error && <span className="text-sm" style={{ color: "var(--color-peligro)" }}>{error}</span>}
      </div>
    </div>
  );
}
