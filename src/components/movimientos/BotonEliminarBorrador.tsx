"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { AlertCircle, LoaderCircle, Trash2 } from "lucide-react";
import {
  accionEliminarBorrador,
  type EstadoMovimiento,
} from "@/app/(dashboard)/obras/[id]/movimientos/acciones";

/**
 * Descartar un borrador.
 *
 * Se confirma en un paso y no en dos, al reves que aprobar: un borrador no
 * ha ajustado nada todavia, asi que lo unico que se pierde es lo escrito.
 * Reservar la ceremonia para lo irreversible es lo que hace que se lea.
 */

interface Props {
  obraId: string;
  movimientoId: string;
  numero: number;
}

export function BotonEliminarBorrador({
  obraId,
  movimientoId,
  numero,
}: Props) {
  const [estado, accion] = useActionState<EstadoMovimiento, FormData>(
    accionEliminarBorrador,
    {},
  );
  const [confirmando, setConfirmando] = useState(false);

  return (
    <div className="space-y-2">
      {confirmando ? (
        <form action={accion} className="flex flex-wrap items-center gap-2">
          <input type="hidden" name="obraId" value={obraId} />
          <input type="hidden" name="movimientoId" value={movimientoId} />
          <input type="hidden" name="numero" value={numero} />

          <span className="text-sm">Se descarta el borrador {numero}.</span>

          <BotonConfirmar />

          <button
            type="button"
            onClick={() => setConfirmando(false)}
            className="rounded-lg border px-3 py-1.5 text-sm font-medium"
            style={{ borderColor: "var(--borde)" }}
          >
            Cancelar
          </button>
        </form>
      ) : (
        <button
          type="button"
          onClick={() => setConfirmando(true)}
          className="inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm font-medium"
          style={{ borderColor: "var(--borde)" }}
        >
          <Trash2 className="size-4" aria-hidden="true" />
          Eliminar
        </button>
      )}

      {estado.error && <Aviso mensaje={estado.error} />}
    </div>
  );
}

function BotonConfirmar() {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium text-white disabled:opacity-60"
      style={{ backgroundColor: "var(--color-peligro)" }}
    >
      {pending ? (
        <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
      ) : (
        <Trash2 className="size-4" aria-hidden="true" />
      )}
      {pending ? "Eliminando..." : "Si, eliminar"}
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
