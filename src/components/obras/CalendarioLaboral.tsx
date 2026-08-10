"use client";

import { useState, useTransition } from "react";
import { LoaderCircle } from "lucide-react";
import { NOMBRE_DIA, horasPorSemana, type DiaLaboral } from "@/lib/calendario";
import { accionGuardarCalendario } from "@/app/(dashboard)/obras/[id]/editar/acciones";

/**
 * El regimen laboral de la obra.
 *
 * No todas trabajan igual: una edificacion urbana va de lunes a sabado, una
 * obra vial de turno corrido puede ir los siete dias. Antes esto estaba fijo
 * en el codigo y no habia donde cambiarlo.
 */
export function CalendarioLaboral({
  obraId,
  inicial,
}: {
  obraId: string;
  inicial: DiaLaboral[];
}) {
  const [dias, setDias] = useState<DiaLaboral[]>(inicial);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState(false);
  const [pendiente, iniciar] = useTransition();

  function set(diaSemana: number, cambios: Partial<DiaLaboral>) {
    setDias((p) =>
      p.map((d) => (d.diaSemana === diaSemana ? { ...d, ...cambios } : d)),
    );
    setOk(false);
  }

  function guardar() {
    setError(null);
    setOk(false);
    iniciar(async () => {
      const r = await accionGuardarCalendario(obraId, dias);
      if (r.ok) setOk(true);
      else setError(r.error);
    });
  }

  const total = horasPorSemana(dias);

  return (
    <div className="space-y-3">
      <ul className="space-y-1.5">
        {dias.map((d) => (
          <li
            key={d.diaSemana}
            className="flex flex-wrap items-center gap-3 rounded-lg border p-2.5 text-sm"
            style={{ borderColor: "var(--borde)" }}
          >
            {/* El label entero es tocable, no solo la casilla. */}
            <label className="flex min-h-9 flex-1 items-center gap-2.5">
              <input
                type="checkbox"
                checked={d.laborable}
                onChange={(e) => set(d.diaSemana, { laborable: e.target.checked })}
                className="size-4"
                style={{ accentColor: "var(--color-exito)" }}
              />
              <span className={d.laborable ? "font-medium" : "opacity-60"}>
                {NOMBRE_DIA[d.diaSemana]}
              </span>
            </label>

            {d.laborable ? (
              <label className="flex items-center gap-1.5 text-xs opacity-80">
                <input
                  value={d.horas}
                  onChange={(e) => set(d.diaSemana, { horas: e.target.value })}
                  inputMode="decimal"
                  aria-label={`Horas del ${NOMBRE_DIA[d.diaSemana]?.toLowerCase()}`}
                  className="w-16 rounded border px-1.5 py-1 text-xs tabular-nums"
                  style={{
                    borderColor: "var(--borde)",
                    backgroundColor: "var(--fondo)",
                  }}
                />
                horas
              </label>
            ) : (
              <span className="text-xs opacity-50">descanso</span>
            )}
          </li>
        ))}
      </ul>

      <p className="text-sm">
        <strong className="tabular-nums">{total}</strong> horas a la semana
      </p>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={guardar}
          disabled={pendiente}
          className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-white disabled:opacity-60"
          style={{ backgroundColor: "var(--color-marca-600)" }}
        >
          {pendiente && (
            <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
          )}
          Guardar calendario
        </button>
        {ok && (
          <span className="text-sm" style={{ color: "var(--color-exito)" }}>
            Guardado
          </span>
        )}
        {error && (
          <span className="text-sm" style={{ color: "var(--color-peligro)" }}>
            {error}
          </span>
        )}
      </div>
    </div>
  );
}
