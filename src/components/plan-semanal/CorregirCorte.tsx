"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CalendarCog, LoaderCircle } from "lucide-react";
import { accionCorregirFechaCorte } from "@/app/(dashboard)/obras/[id]/plan-semanal/acciones";

/**
 * Corrige el dia en que cierra una semana abierta.
 *
 * Hace falta porque el numero de una semana es el correlativo de creacion y no
 * mira la fecha: si se crea la Semana 3 con un corte anterior al de la Semana
 * 2, el rotulo queda cruzado y hasta ahora no habia forma de arreglarlo salvo
 * borrar y rehacer. Se cambia la FECHA y nunca el numero: el numero esta citado
 * en actas y correos.
 *
 * Va plegado tras un boton pequeno a proposito. Corregir el corte es raro; que
 * este siempre abierto invitaria a moverlo, y mover el corte de una semana en
 * marcha desordena lo que ya se comprometio contra el.
 */
export function CorregirCorte({
  obraId,
  planId,
  fechaCorte,
}: {
  obraId: string;
  planId: string;
  /// En ISO (YYYY-MM-DD), tal como lo espera el campo de fecha.
  fechaCorte: string;
}) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [fecha, setFecha] = useState(fechaCorte);
  const [error, setError] = useState<string | null>(null);
  const [pendiente, iniciar] = useTransition();

  function guardar() {
    setError(null);
    iniciar(async () => {
      const r = await accionCorregirFechaCorte(obraId, planId, fecha);
      if (r.ok) {
        setAbierto(false);
        router.refresh();
        return;
      }
      setError(r.error ?? "No se pudo cambiar la fecha.");
    });
  }

  if (!abierto) {
    return (
      <button
        type="button"
        onClick={() => setAbierto(true)}
        className="inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium"
        style={{ borderColor: "var(--borde)" }}
      >
        <CalendarCog className="size-3.5" aria-hidden="true" />
        Corregir el día de cierre
      </button>
    );
  }

  return (
    <div className="flex flex-wrap items-end gap-2">
      <label className="text-xs">
        <span className="block opacity-70">Cierra el</span>
        <input
          type="date"
          value={fecha}
          onChange={(e) => {
            setFecha(e.target.value);
            setError(null);
          }}
          className="mt-1 rounded-lg border px-2 py-1.5 text-sm"
          style={{ borderColor: "var(--borde)", backgroundColor: "var(--fondo)" }}
        />
      </label>
      <button
        type="button"
        onClick={guardar}
        disabled={pendiente || fecha === fechaCorte}
        className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-white disabled:opacity-60"
        style={{ backgroundColor: "var(--color-marca-600)" }}
      >
        {pendiente && (
          <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
        )}
        Guardar la fecha
      </button>
      <button
        type="button"
        onClick={() => {
          setAbierto(false);
          setFecha(fechaCorte);
          setError(null);
        }}
        className="rounded-lg border px-3 py-2 text-sm font-medium"
        style={{ borderColor: "var(--borde)" }}
      >
        Cancelar
      </button>
      {error && (
        <span className="text-sm" style={{ color: "var(--color-peligro)" }}>
          {error}
        </span>
      )}
    </div>
  );
}
