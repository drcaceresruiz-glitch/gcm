"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { AlertCircle, LoaderCircle, Lock } from "lucide-react";
import {
  accionAprobarOrden,
  type EstadoOrden,
} from "@/app/(dashboard)/obras/[id]/ordenes/acciones";

/**
 * Aprobar una orden: a partir de aqui cuenta en el comprometido.
 *
 * La confirmacion ensena el NETO y el total por separado, con el neto
 * destacado. Es el punto donde mas facil resulta confundirlos, porque el
 * total es la cifra que se le paga al proveedor y el neto es la que consume
 * presupuesto.
 *
 * A diferencia de aprobar una linea base, esto se puede deshacer: la orden se
 * anula. Por eso la confirmacion es de un paso y no de dos.
 */

interface Props {
  obraId: string;
  ordenId: string;
  numero: string;
  proveedor: string;
  /// Ya formateados por quien renderiza, que es un componente de servidor.
  neto: string;
  total: string;
}

export function BotonAprobarOrden({
  obraId,
  ordenId,
  numero,
  proveedor,
  neto,
  total,
}: Props) {
  const [estado, accion] = useActionState<EstadoOrden, FormData>(
    accionAprobarOrden,
    {},
  );
  const [confirmando, setConfirmando] = useState(false);

  if (!confirmando) {
    return (
      <div className="space-y-2">
        <button
          type="button"
          onClick={() => setConfirmando(true)}
          className="inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm font-medium"
          style={{ borderColor: "var(--borde)" }}
        >
          <Lock className="size-4" aria-hidden="true" />
          Aprobar
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
        borderColor: "var(--color-alerta)",
        backgroundColor:
          "color-mix(in oklab, var(--color-alerta) 10%, transparent)",
      }}
    >
      <input type="hidden" name="obraId" value={obraId} />
      <input type="hidden" name="ordenId" value={ordenId} />

      <h4 className="text-sm font-semibold">Vas a aprobar la orden {numero}</h4>
      <p className="mt-0.5 text-sm opacity-80">{proveedor}</p>

      <dl className="mt-3 space-y-1 text-sm">
        <div className="flex justify-between gap-4">
          <dt className="font-medium">Compromete contra el presupuesto</dt>
          <dd className="font-semibold tabular-nums">{neto}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="opacity-70">Se le pagará al proveedor</dt>
          <dd className="tabular-nums opacity-70">{total}</dd>
        </div>
      </dl>

      <p className="mt-2 text-xs opacity-70">
        La diferencia es el IGV, que es crédito fiscal y se recupera: por eso
        no consume presupuesto de obra.
      </p>

      {estado.error && (
        <div className="mt-3">
          <Aviso mensaje={estado.error} />
        </div>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        <BotonConfirmar numero={numero} />
        <button
          type="button"
          onClick={() => setConfirmando(false)}
          className="rounded-lg border px-4 py-2 text-sm font-medium"
          style={{ borderColor: "var(--borde)" }}
        >
          Cancelar
        </button>
      </div>
    </form>
  );
}

function BotonConfirmar({ numero }: { numero: string }) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
      style={{ backgroundColor: "var(--color-marca-600)" }}
    >
      {pending ? (
        <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
      ) : (
        <Lock className="size-4" aria-hidden="true" />
      )}
      {pending ? "Aprobando..." : `Sí, aprobar la ${numero}`}
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
