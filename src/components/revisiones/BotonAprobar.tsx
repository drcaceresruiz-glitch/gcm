"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { AlertCircle, Lock, LoaderCircle } from "lucide-react";
import {
  accionAprobarRevision,
  type EstadoRevision,
} from "@/app/(dashboard)/obras/[id]/revisiones/acciones";

/**
 * Aprobar la revision vigente.
 *
 * La confirmacion es en dos pasos y con las cifras delante, no un
 * `confirm()` del navegador. Congelar la linea base es un acto contractual
 * irreversible que ademas bloquea la edicion del presupuesto: quien lo
 * pulsa tiene que leer que version y que importe esta firmando, no
 * responder «aceptar» a un dialogo del sistema.
 */

interface Props {
  obraId: string;
  revisionId: string;
  version: number;
  /// Ya formateadas por quien renderiza, que es un componente de servidor.
  fecha: string;
  presupuesto: string;
}

export function BotonAprobar({
  obraId,
  revisionId,
  version,
  fecha,
  presupuesto,
}: Props) {
  const [estado, accion] = useActionState<EstadoRevision, FormData>(
    accionAprobarRevision,
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
          Aprobar y congelar
        </button>

        {estado.error && <Aviso mensaje={estado.error} />}
      </div>
    );
  }

  return (
    <form
      action={accion}
      className="rounded-lg border p-4"
      style={{
        borderColor: "var(--color-alerta)",
        backgroundColor: "color-mix(in oklab, var(--color-alerta) 10%, transparent)",
      }}
    >
      <input type="hidden" name="obraId" value={obraId} />
      <input type="hidden" name="revisionId" value={revisionId} />

      <h3 className="text-sm font-semibold">
        Vas a congelar la revisión v{version}
      </h3>

      <dl className="mt-3 space-y-1 text-sm">
        <div className="flex justify-between gap-4">
          <dt className="opacity-70">Fecha de la revisión</dt>
          <dd className="tabular-nums">{fecha}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="opacity-70">Presupuesto que se congela</dt>
          <dd className="font-semibold tabular-nums">{presupuesto}</dd>
        </div>
      </dl>

      <ul className="mt-3 list-disc space-y-1 pl-5 text-sm">
        <li>
          <strong>No se puede deshacer.</strong> Los indicadores de avance y
          costo se miden contra esta cifra; poder cambiarla después los
          invalidaría hacia atrás.
        </li>
        <li>
          La obra dejará de permitir <strong>editar partidas</strong> y de
          <strong>regenerar el contractual</strong> desde el real.
        </li>
        <li>
          Los cambios posteriores se registran como{" "}
          <strong>adicionales o reconversiones</strong> encima de esta linea
          base, que ya no se toca.
        </li>
      </ul>

      {estado.error && (
        <div className="mt-3">
          <Aviso mensaje={estado.error} />
        </div>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        <BotonConfirmar version={version} />
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

function BotonConfirmar({ version }: { version: number }) {
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
      {pending ? "Congelando..." : `Sí, congelar la v${version}`}
    </button>
  );
}

function Aviso({ mensaje }: { mensaje: string }) {
  return (
    <p
      role="alert"
      className="flex items-start gap-2 rounded-lg px-3 py-2 text-sm"
      style={{
        backgroundColor: "color-mix(in oklab, var(--color-peligro) 15%, transparent)",
      }}
    >
      <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      <span>{mensaje}</span>
    </p>
  );
}
