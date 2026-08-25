"use client";

import { useState, useTransition } from "react";
import { LoaderCircle, LockOpen } from "lucide-react";
import { accionReabrirPlanSemanal } from "@/app/(dashboard)/obras/[id]/plan-semanal/acciones";
import { useMotivoSinEscritura } from "@/components/obras/EscrituraDeLaObra";

/** Reabre una semana cerrada para corregir compromisos o su evaluacion. */
export function BotonReabrir({ obraId, planId }: { obraId: string; planId: string }) {
  const [error, setError] = useState<string | null>(null);
  const [pendiente, iniciar] = useTransition();

  /*
   * En una obra que no admite cambios no se ofrece: `reabrirPlanSemanal` lo
   * rechaza, y un boton que siempre falla invita a probar. El motivo se
   * explica una vez por pantalla, no en cada control.
   * Mismas opciones que el servidor: sin excepciones.
   * Va DESPUES del ultimo hook: un `return` por delante de una llamada a
   * un hook cambia el orden entre renders y React lo prohibe.
   */
  const sinEscritura = useMotivoSinEscritura() !== null;
  if (sinEscritura) return null;

  function reabrir() {
    setError(null);
    iniciar(async () => {
      const r = await accionReabrirPlanSemanal(obraId, planId);
      if (!r.ok) setError(r.error ?? "No se pudo reabrir.");
    });
  }

  return (
    <span className="inline-flex items-center gap-2">
      <button
        type="button"
        onClick={reabrir}
        disabled={pendiente}
        className="inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-medium disabled:opacity-60"
        style={{ borderColor: "var(--borde)" }}
      >
        {pendiente ? (
          <LoaderCircle className="size-3.5 animate-spin" aria-hidden="true" />
        ) : (
          <LockOpen className="size-3.5" aria-hidden="true" />
        )}
        Reabrir
      </button>
      {error && (
        <span className="text-xs" style={{ color: "var(--color-peligro)" }}>
          {error}
        </span>
      )}
    </span>
  );
}
