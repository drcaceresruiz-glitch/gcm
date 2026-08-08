"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { AlertCircle, LoaderCircle, Trash2 } from "lucide-react";
import {
  accionEliminarObra,
  type RespuestaEdicion,
} from "@/app/(dashboard)/obras/[id]/acciones";

/**
 * Boton para eliminar una obra, solo visible en planificacion.
 *
 * La decision dura —que no tenga ordenes ni linea base— la toma el servicio;
 * aqui solo se pide confirmacion y, si el servidor rechaza, se muestra el
 * motivo. Al lograrlo, la accion redirige al panel: la obra ya no existe.
 */
export function EliminarObra({
  obraId,
  nombre,
}: {
  obraId: string;
  nombre: string;
}) {
  const [estado, accion] = useActionState<RespuestaEdicion, FormData>(
    accionEliminarObra,
    { ok: true },
  );

  return (
    <div className="mt-4">
      <form action={accion}>
        <input type="hidden" name="id" value={obraId} />
        <Boton nombre={nombre} />
      </form>

      {!estado.ok && estado.error && (
        <p
          role="alert"
          className="mt-2 flex items-start gap-2 rounded-lg px-3 py-2 text-xs"
          style={{
            backgroundColor:
              "color-mix(in oklab, var(--color-peligro) 15%, transparent)",
          }}
        >
          <AlertCircle className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
          <span>{estado.error}</span>
        </p>
      )}
    </div>
  );
}

function Boton({ nombre }: { nombre: string }) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      onClick={(e) => {
        if (
          !window.confirm(
            `Eliminar la obra "${nombre}"? Se borra junto con sus partidas. Esta accion no se puede deshacer.`,
          )
        ) {
          e.preventDefault();
        }
      }}
      className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs disabled:opacity-60"
      style={{ borderColor: "var(--color-peligro)", color: "var(--color-peligro)" }}
    >
      {pending ? (
        <LoaderCircle className="size-3.5 animate-spin" aria-hidden="true" />
      ) : (
        <Trash2 className="size-3.5" aria-hidden="true" />
      )}
      Eliminar obra
    </button>
  );
}
