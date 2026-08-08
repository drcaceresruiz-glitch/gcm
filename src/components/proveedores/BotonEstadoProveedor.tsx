"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { AlertCircle, LoaderCircle, Power } from "lucide-react";
import {
  accionCambiarEstadoProveedor,
  type EstadoProveedor,
} from "@/app/(dashboard)/empresa/proveedores/acciones";

/**
 * Activa o desactiva un proveedor. Nunca lo borra.
 *
 * Desactivar solo lo saca de los desplegables de ordenes nuevas; sus ordenes
 * siguen enteras, porque son historia de la obra y tienen que seguir diciendo
 * a quien se le compro.
 *
 * Se pide confirmacion solo al desactivar a alguien que ya tiene ordenes: es
 * el caso en que la accion sorprende, porque quien la pulsa puede estar
 * pensando en "borrarlo de la lista".
 */

interface Props {
  proveedorId: string;
  razonSocial: string;
  activo: boolean;
  totalOrdenes: number;
}

export function BotonEstadoProveedor({
  proveedorId,
  razonSocial,
  activo,
  totalOrdenes,
}: Props) {
  const [estado, accion] = useActionState<EstadoProveedor, FormData>(
    accionCambiarEstadoProveedor,
    {},
  );
  const [confirmando, setConfirmando] = useState(false);

  const necesitaConfirmar = activo && totalOrdenes > 0;

  return (
    <div className="space-y-2">
      {confirmando ? (
        <form
          action={accion}
          className="flex flex-wrap items-center gap-2 rounded-lg p-2"
          style={{
            backgroundColor:
              "color-mix(in oklab, var(--color-alerta) 12%, transparent)",
          }}
        >
          <input type="hidden" name="proveedorId" value={proveedorId} />
          <input type="hidden" name="activo" value="false" />

          <span className="text-sm">
            {razonSocial} tiene{" "}
            {totalOrdenes === 1 ? "1 orden" : `${totalOrdenes} ordenes`}. Se
            conservan; solo deja de aparecer al crear ordenes nuevas.
          </span>

          <BotonConfirmar activo={false} />

          <button
            type="button"
            onClick={() => setConfirmando(false)}
            className="rounded-lg border px-3 py-1.5 text-sm font-medium"
            style={{ borderColor: "var(--borde)" }}
          >
            Cancelar
          </button>
        </form>
      ) : necesitaConfirmar ? (
        <button
          type="button"
          onClick={() => setConfirmando(true)}
          className="inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-sm font-medium"
          style={{ borderColor: "var(--borde)" }}
        >
          <Power className="size-3.5" aria-hidden="true" />
          Desactivar
        </button>
      ) : (
        <form action={accion}>
          <input type="hidden" name="proveedorId" value={proveedorId} />
          <input type="hidden" name="activo" value={activo ? "false" : "true"} />
          <BotonConfirmar activo={!activo} directo />
        </form>
      )}

      {estado.error && (
        <p
          role="alert"
          className="flex items-start gap-2 rounded-lg px-3 py-2 text-sm"
          style={{
            backgroundColor:
              "color-mix(in oklab, var(--color-peligro) 15%, transparent)",
          }}
        >
          <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <span>{estado.error}</span>
        </p>
      )}
    </div>
  );
}

function BotonConfirmar({
  activo,
  directo,
}: {
  /// El estado al que se va, no el actual.
  activo: boolean;
  /// true cuando no hubo paso de confirmacion: el boton dice la accion
  /// entera en vez de un "si" que ya no tiene pregunta delante.
  directo?: boolean;
}) {
  const { pending } = useFormStatus();

  const etiqueta = directo
    ? activo
      ? "Activar"
      : "Desactivar"
    : activo
      ? "Si, activar"
      : "Si, desactivar";

  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-sm font-medium disabled:opacity-60"
      style={{ borderColor: "var(--borde)" }}
    >
      {pending ? (
        <LoaderCircle className="size-3.5 animate-spin" aria-hidden="true" />
      ) : (
        <Power className="size-3.5" aria-hidden="true" />
      )}
      {pending ? "Guardando..." : etiqueta}
    </button>
  );
}
