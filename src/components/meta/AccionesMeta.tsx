"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { AlertCircle, LoaderCircle, Lock, Trash2 } from "lucide-react";

import {
  accionAprobarMeta,
  accionEliminarBorradorMeta,
  type EstadoMeta,
} from "@/app/(dashboard)/obras/[id]/meta/acciones";

/**
 * Congelar y descartar un borrador de meta.
 *
 * Los dos van juntos porque son las dos salidas del mismo estado: un borrador
 * o se aprueba o se rehace. Aprobar no se deshace, asi que el boton lo dice
 * antes de pulsarlo y no despues.
 */

function Enviar({
  etiqueta,
  icono: Icono,
  peligro,
  confirmacion,
}: {
  etiqueta: string;
  icono: typeof Lock;
  peligro?: boolean;
  confirmacion: string;
}) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      onClick={(e) => {
        if (!confirm(confirmacion)) e.preventDefault();
      }}
      className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium disabled:opacity-60"
      style={{
        borderColor: peligro ? "var(--color-peligro)" : "var(--borde)",
        color: peligro ? "var(--color-peligro)" : undefined,
      }}
    >
      {pending ? (
        <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
      ) : (
        <Icono className="size-4" aria-hidden="true" />
      )}
      {etiqueta}
    </button>
  );
}

export function AccionesMeta({
  obraId,
  metaId,
  version,
  puedeAprobar,
  puedeEliminar,
}: {
  obraId: string;
  metaId: string;
  version: number;
  puedeAprobar: boolean;
  puedeEliminar: boolean;
}) {
  const [aprobar, accionAprobar] = useActionState<EstadoMeta, FormData>(
    accionAprobarMeta,
    {},
  );
  const [borrar, accionBorrar] = useActionState<EstadoMeta, FormData>(
    accionEliminarBorradorMeta,
    {},
  );

  const error = aprobar.error ?? borrar.error;

  return (
    <div className="space-y-3">
      {error && (
        <p
          role="alert"
          className="flex items-start gap-2 rounded-lg px-4 py-3 text-sm"
          style={{
            backgroundColor:
              "color-mix(in oklab, var(--color-peligro) 15%, transparent)",
          }}
        >
          <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          {error}
        </p>
      )}

      <div className="flex flex-wrap gap-3">
        {puedeAprobar && (
          <form action={accionAprobar}>
            <input type="hidden" name="obraId" value={obraId} />
            <input type="hidden" name="metaId" value={metaId} />
            <Enviar
              etiqueta={`Aprobar v${version}`}
              icono={Lock}
              confirmacion={
                `Aprobar la meta v${version} la congela y no se puede deshacer. ` +
                `A partir de ahí, cambiarla exige crear una versión nueva. ¿Continuar?`
              }
            />
          </form>
        )}

        {puedeEliminar && (
          <form action={accionBorrar}>
            <input type="hidden" name="obraId" value={obraId} />
            <input type="hidden" name="metaId" value={metaId} />
            <Enviar
              etiqueta="Descartar borrador"
              icono={Trash2}
              peligro
              confirmacion={
                `Se eliminará el borrador v${version} con todas sus líneas, ` +
                `sueldos y pólizas incluidos. ¿Continuar?`
              }
            />
          </form>
        )}
      </div>
    </div>
  );
}
