"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { AlertCircle, Ban, LoaderCircle } from "lucide-react";
import {
  accionAnularOrden,
  type EstadoOrden,
} from "@/app/(dashboard)/obras/[id]/ordenes/acciones";
import { useMotivoSinEscritura } from "@/components/obras/EscrituraDeLaObra";

/**
 * Anula una orden. No la borra.
 *
 * El motivo es obligatorio y por eso hay un campo, no un simple "confirmar":
 * dentro de seis meses "por que se anulo la 00117" es una pregunta que
 * alguien hara, y la respuesta tiene que estar en el sistema y no en la
 * memoria de quien la anulo.
 */

interface Props {
  obraId: string;
  ordenId: string;
  numero: string;
  neto: string;
  /// Si estaba aprobada, anularla libera presupuesto comprometido. Conviene
  /// decir cuanto: es la cifra que se va a mover en el control.
  aprobada?: boolean;
}

export function BotonAnularOrden({
  obraId,
  ordenId,
  numero,
  neto,
  aprobada,
}: Props) {
  const [estado, accion] = useActionState<EstadoOrden, FormData>(
    accionAnularOrden,
    {},
  );
  const [abierto, setAbierto] = useState(false);

  /*
   * En una obra cerrada, archivada o de una empresa congelada no se
   * ofrece: `anularOrden` lo rechaza en el servidor, y un boton que
   * siempre falla invita a probar. Va DESPUES de los hooks y antes de
   * cualquier rama: es lo primero que se decide, pero no puede
   * saltarse una llamada a un hook por el camino.
   */
  const sinEscritura = useMotivoSinEscritura() !== null;
  if (sinEscritura) return null;

  if (!abierto) {
    return (
      <div className="space-y-2">
        <button
          type="button"
          onClick={() => setAbierto(true)}
          className="inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm font-medium"
          style={{ borderColor: "var(--borde)" }}
        >
          <Ban className="size-4" aria-hidden="true" />
          Anular
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

      <h4 className="text-sm font-semibold">Anular la orden {numero}</h4>
      <p className="mt-1 text-sm text-pretty opacity-80">
        {aprobada
          ? `Deja de contar en el comprometido y libera ${neto} de presupuesto. La orden se conserva con este motivo.`
          : "La orden se conserva con este motivo, pero ya no se podrá aprobar."}
      </p>

      <div className="mt-3 space-y-1.5">
        <label htmlFor={`motivo-${ordenId}`} className="block text-sm font-medium">
          Motivo
        </label>
        <textarea
          id={`motivo-${ordenId}`}
          name="motivo"
          rows={2}
          className="w-full rounded-lg border px-3 py-2 text-sm outline-none"
          style={{ borderColor: "var(--borde)", backgroundColor: "var(--fondo)" }}
        />
        <p className="text-xs opacity-60">
          Obligatorio. Quien lea esto dentro de seis meses no estará en esta
          conversación.
        </p>
      </div>

      {estado.error && (
        <div className="mt-3">
          <Aviso mensaje={estado.error} />
        </div>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        <BotonConfirmar />
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

function BotonConfirmar() {
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
        <Ban className="size-4" aria-hidden="true" />
      )}
      {pending ? "Anulando..." : "Sí, anular"}
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
