"use client";

import { useState, useTransition } from "react";
import { AlertCircle, LoaderCircle, Trash2 } from "lucide-react";
import { accionEliminarPlanSemanal } from "@/app/(dashboard)/obras/[id]/plan-semanal/acciones";
import { useMotivoSinEscritura } from "@/components/obras/EscrituraDeLaObra";

/**
 * Elimina una semana entera para rehacerla si se creo por error o quedo mal
 * planteada. Pide confirmar en dos pasos (es destructivo y no reversible) y, al
 * borrar, la accion redirige a la lista. Sirve tanto para una semana abierta
 * como cerrada; el aviso cambia porque una cerrada ya cuenta en el PPC historico.
 */
export function BotonEliminarPlan({
  obraId,
  planId,
  numero,
  cerrada,
}: {
  obraId: string;
  planId: string;
  numero: number;
  cerrada?: boolean;
}) {
  const [abierto, setAbierto] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendiente, iniciar] = useTransition();

  /*
   * En una obra que no admite cambios no se ofrece: `eliminarPlanSemanal` lo
   * rechaza, y un boton que siempre falla invita a probar. El motivo se
   * explica una vez por pantalla, no en cada control.
   * Mismas opciones que el servidor: sin excepciones.
   * Va DESPUES del ultimo hook: un `return` por delante de una llamada a
   * un hook cambia el orden entre renders y React lo prohibe.
   */
  const sinEscritura = useMotivoSinEscritura() !== null;
  if (sinEscritura) return null;

  function eliminar() {
    setError(null);
    iniciar(async () => {
      // Si sale bien, la accion redirige y no volvemos aqui; solo llega respuesta
      // cuando hay error.
      const r = await accionEliminarPlanSemanal(obraId, planId);
      if (r && !r.ok) setError(r.error ?? "No se pudo eliminar.");
    });
  }

  if (!abierto) {
    return (
      <button
        type="button"
        onClick={() => setAbierto(true)}
        className="inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-medium"
        style={{ borderColor: "var(--borde)", color: "var(--color-peligro)" }}
      >
        <Trash2 className="size-3.5" aria-hidden="true" />
        Eliminar
      </button>
    );
  }

  return (
    <div
      className="w-full rounded-lg border p-4"
      style={{
        borderColor: "var(--color-peligro)",
        backgroundColor: "color-mix(in oklab, var(--color-peligro) 10%, transparent)",
      }}
    >
      <h4 className="text-sm font-semibold">Eliminar la semana {numero}</h4>
      <p className="mt-1 text-sm text-pretty opacity-80">
        {cerrada
          ? "Esta semana ya está cerrada y cuenta en el PPC histórico y el Pareto: al eliminarla, esos gráficos dejarán de incluirla. Se borran sus compromisos. Solo queda en la auditoría."
          : "Se borran la semana y todos sus compromisos. Podrás crearla de nuevo. Solo queda en la auditoría."}
      </p>

      {error && (
        <p
          role="alert"
          className="mt-3 flex items-start gap-2 rounded-lg px-3 py-2 text-sm"
          style={{ backgroundColor: "color-mix(in oklab, var(--color-peligro) 15%, transparent)" }}
        >
          <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <span>{error}</span>
        </p>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={eliminar}
          disabled={pendiente}
          className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
          style={{ backgroundColor: "var(--color-peligro)" }}
        >
          {pendiente ? (
            <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
          ) : (
            <Trash2 className="size-4" aria-hidden="true" />
          )}
          {pendiente ? "Eliminando..." : "Sí, eliminar"}
        </button>
        <button
          type="button"
          onClick={() => {
            setAbierto(false);
            setError(null);
          }}
          disabled={pendiente}
          className="rounded-lg border px-4 py-2 text-sm font-medium disabled:opacity-60"
          style={{ borderColor: "var(--borde)" }}
        >
          Cancelar
        </button>
      </div>
    </div>
  );
}
