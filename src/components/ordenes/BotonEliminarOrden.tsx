"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { AlertCircle, LoaderCircle, Trash2 } from "lucide-react";
import {
  accionEliminarOrden,
  type EstadoOrden,
} from "@/app/(dashboard)/obras/[id]/ordenes/acciones";

/**
 * Borra una orden. Solo se ofrece en borradores y en anuladas.
 *
 * Ninguna de las dos cuenta en el comprometido, asi que borrarlas no revierte
 * nada. La diferencia esta en lo que se pierde, y por eso el aviso cambia:
 * un borrador no lo ha visto nadie, mientras que una anulada es historia de
 * la obra y puede tener un PDF circulando por correo.
 */

interface Props {
  obraId: string;
  ordenId: string;
  numero: string;
  anulada?: boolean;
}

export function BotonEliminarOrden({
  obraId,
  ordenId,
  numero,
  anulada,
}: Props) {
  const [estado, accion] = useActionState<EstadoOrden, FormData>(
    accionEliminarOrden,
    {},
  );
  const [abierto, setAbierto] = useState(false);

  if (!abierto) {
    return (
      <div className="space-y-2">
        <button
          type="button"
          onClick={() => setAbierto(true)}
          className="inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm font-medium"
          style={{ borderColor: "var(--borde)" }}
        >
          <Trash2 className="size-4" aria-hidden="true" />
          Eliminar
        </button>

        {estado.error && <Aviso mensaje={estado.error} />}
      </div>
    );
  }

  return (
    <form
      action={accion}
      className="w-full rounded-lg border p-4"
      style={{
        borderColor: "var(--color-peligro)",
        backgroundColor:
          "color-mix(in oklab, var(--color-peligro) 10%, transparent)",
      }}
    >
      <input type="hidden" name="obraId" value={obraId} />
      <input type="hidden" name="ordenId" value={ordenId} />

      <h4 className="text-sm font-semibold">
        {anulada ? `Eliminar la orden anulada ${numero}` : `Descartar el borrador ${numero}`}
      </h4>

      <p className="mt-1 text-sm text-pretty opacity-80">
        {anulada
          ? "Ya no contaba en el comprometido, así que no se revierte ninguna cifra. Pero la orden desaparece de la lista: solo quedará en la auditoría."
          : "Un borrador no compromete presupuesto, así que no hay nada que revertir."}
      </p>

      {estado.error && (
        <div className="mt-3">
          <Aviso mensaje={estado.error} />
        </div>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        <BotonConfirmar anulada={anulada} />
        <button
          type="button"
          onClick={() => setAbierto(false)}
          className="rounded-lg border px-4 py-2 text-sm font-medium"
          style={{ borderColor: "var(--borde)" }}
        >
          Cancelar
        </button>
      </div>
    </form>
  );
}

function BotonConfirmar({ anulada }: { anulada?: boolean }) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
      style={{ backgroundColor: "var(--color-peligro)" }}
    >
      {pending ? (
        <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
      ) : (
        <Trash2 className="size-4" aria-hidden="true" />
      )}
      {pending ? "Eliminando..." : anulada ? "Sí, eliminar" : "Sí, descartar"}
    </button>
  );
}

function Aviso({ mensaje }: { mensaje: string }) {
  return (
    <p
      role="alert"
      className="flex items-start gap-2 rounded-lg px-3 py-2 text-sm"
      style={{
        backgroundColor:
          "color-mix(in oklab, var(--color-peligro) 15%, transparent)",
      }}
    >
      <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      <span>{mensaje}</span>
    </p>
  );
}
