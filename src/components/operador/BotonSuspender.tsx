"use client";

import { useState, useTransition } from "react";
import { LoaderCircle } from "lucide-react";
import { accionAlternarConstructora } from "@/app/(dashboard)/operador/acciones";

/**
 * Suspender o reactivar a un cliente.
 *
 * Suspender deja fuera a TODA la constructora al instante, tambien a quien ya
 * estuviera dentro, asi que va en dos pasos como el borrado de una semana: un
 * clic pide confirmacion y el segundo ejecuta. Reactivar no la pide.
 */
export function BotonSuspender({
  empresaId,
  razonSocial,
  activa,
}: {
  empresaId: string;
  razonSocial: string;
  activa: boolean;
}) {
  const [confirmando, setConfirmando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendiente, iniciar] = useTransition();

  function alternar() {
    setError(null);
    iniciar(async () => {
      const r = await accionAlternarConstructora(empresaId, !activa);
      if (!r.ok) setError(r.error);
      setConfirmando(false);
    });
  }

  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      {error && (
        <span className="text-xs" style={{ color: "var(--color-peligro)" }}>
          {error}
        </span>
      )}

      {!activa ? (
        <button
          type="button"
          onClick={alternar}
          disabled={pendiente}
          className="inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium disabled:opacity-60"
          style={{ borderColor: "var(--borde)" }}
        >
          {pendiente && (
            <LoaderCircle className="size-3.5 animate-spin" aria-hidden="true" />
          )}
          Reactivar
        </button>
      ) : confirmando ? (
        <>
          <span className="text-xs opacity-70">
            Dejara fuera a todo {razonSocial}.
          </span>
          <button
            type="button"
            onClick={alternar}
            disabled={pendiente}
            className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-white disabled:opacity-60"
            style={{ backgroundColor: "var(--color-peligro)" }}
          >
            {pendiente && (
              <LoaderCircle className="size-3.5 animate-spin" aria-hidden="true" />
            )}
            Confirmar
          </button>
          <button
            type="button"
            onClick={() => setConfirmando(false)}
            className="text-xs opacity-70 underline"
          >
            Cancelar
          </button>
        </>
      ) : (
        <button
          type="button"
          onClick={() => setConfirmando(true)}
          className="rounded-lg border px-2.5 py-1.5 text-xs font-medium"
          style={{ borderColor: "var(--borde)" }}
        >
          Suspender
        </button>
      )}
    </div>
  );
}
