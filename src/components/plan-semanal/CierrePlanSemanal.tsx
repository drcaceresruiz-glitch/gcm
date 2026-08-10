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
  /// uid de la tarea del cronograma; null si es una linea libre (no propaga avance).
  uid: number | null;
  cumplido: boolean;
  causa: CausaNoCumplimiento;
  nota: string;
  /// % alcanzado (acumulado 0-100) de la tarea; se propaga a su avance al cerrar.
  porcentajeReal: string;
  /// Cuanto se ejecuto, en la unidad del compromiso. Solo se pide si se
  /// comprometio por cantidad.
  cantidadEjec: string;
  cantidadPlan: string | null;
  unidad: string | null;
}

export function CierrePlanSemanal({
  obraId,
  planId,
  compromisos,
}: {
  obraId: string;
  planId: string;
  compromisos: {
    id: string;
    descripcion: string;
    uid: number | null;
    metaPorcentaje: string | null;
    cumplido: boolean | null;
    causa: CausaNoCumplimiento | null;
    notaCierre: string | null;
    porcentajeReal: string | null;
    cantidadPlan: string | null;
    unidad: string | null;
    cantidadEjec: string | null;
  }[];
}) {
  const [filas, setFilas] = useState<Fila[]>(() =>
    compromisos.map((c) => ({
      id: c.id,
      descripcion: c.descripcion,
      uid: c.uid,
      // Restaura lo YA guardado: al reabrir una semana no se pierde nada. Si el
      // compromiso nunca se evaluo (cumplido null), recien ahi arranca SIN
      // tildar —dar por cumplido por defecto inflaba el PPC y tildaba hasta
      // tareas al 0%—.
      cumplido: c.cumplido ?? false,
      causa: c.causa ?? "PRERREQUISITO",
      nota: c.notaCierre ?? "",
      // % alcanzado: lo ya registrado por este plan al reabrir; si no, la meta
      // como punto de partida editable.
      porcentajeReal: c.porcentajeReal ?? c.metaPorcentaje ?? "",
      // Lo ya anotado al cerrar; si no, se arranca de lo comprometido, que es
      // la respuesta mas probable ("se hizo lo previsto") y se corrige encima.
      cantidadEjec: c.cantidadEjec ?? c.cantidadPlan ?? "",
      cantidadPlan: c.cantidadPlan,
      unidad: c.unidad,
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
          porcentajeReal:
            f.uid !== null ? (f.porcentajeReal.trim() || null) : null,
          cantidadEjec: f.cantidadEjec.trim() || null,
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
              {/* Solo si se comprometio por cantidad: preguntar "cuantos m2"
                  donde no se pacto ninguna cantidad no significa nada. */}
              {f.cantidadPlan !== null && (
                <label className="inline-flex items-center gap-1 text-xs opacity-80">
                  ejecutado
                  <input
                    value={f.cantidadEjec}
                    onChange={(e) => set(f.id, { cantidadEjec: e.target.value })}
                    inputMode="decimal"
                    title={`Cantidad ejecutada de ${f.cantidadPlan} ${f.unidad ?? ""} comprometidos`}
                    className="w-20 rounded border px-1.5 py-1 text-xs tabular-nums"
                    style={{ borderColor: "var(--borde)", backgroundColor: "var(--fondo)" }}
                  />
                  <span className="opacity-60">
                    / {f.cantidadPlan} {f.unidad ?? ""}
                  </span>
                </label>
              )}
              {f.uid !== null && (
                <label className="inline-flex items-center gap-1 text-xs opacity-80">
                  % alcanzado
                  <input
                    type="number"
                    min={0}
                    max={100}
                    step="0.01"
                    value={f.porcentajeReal}
                    onChange={(e) => set(f.id, { porcentajeReal: e.target.value })}
                    title="Avance acumulado de la tarea (0-100)"
                    className="w-16 rounded border px-1.5 py-1 text-xs tabular-nums"
                    style={{ borderColor: "var(--borde)", backgroundColor: "var(--fondo)" }}
                  />
                </label>
              )}
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
