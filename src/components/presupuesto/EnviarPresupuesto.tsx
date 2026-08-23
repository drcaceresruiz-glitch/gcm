"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { AlertCircle, CheckCircle2, LoaderCircle, Mail } from "lucide-react";

import {
  accionEnviarPresupuesto,
  type RespuestaEnvioPresupuesto,
} from "@/app/(dashboard)/obras/[id]/presupuesto-envio";

/**
 * Mandar el presupuesto al cliente.
 *
 * Solo el CONTRACTUAL, y no hay desplegable para elegir otro: el meta y la
 * comparativa llevan el costo y la bolsa, y un correo es la forma mas facil de
 * que salgan de la empresa por descuido. Que la eleccion no exista es la
 * proteccion; el servidor no acepta otro documento aunque se le pida.
 *
 * El formulario esta plegado hasta que se pide, mismo patron que paralizar o
 * arrancar la obra: mandar un presupuesto a un cliente es un acto
 * contractual, no un clic de paso.
 */
export function EnviarPresupuesto({ obraId }: { obraId: string }) {
  const [estado, accion] = useActionState<RespuestaEnvioPresupuesto, FormData>(
    accionEnviarPresupuesto,
    { ok: true },
  );
  const [abierto, setAbierto] = useState(false);

  if (!abierto) {
    return (
      <button
        type="button"
        onClick={() => setAbierto(true)}
        className="inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm font-medium"
        style={{ borderColor: "var(--borde)" }}
      >
        <Mail className="size-4" aria-hidden="true" />
        Enviar el contractual por correo
      </button>
    );
  }

  return (
    <form
      action={accion}
      className="space-y-3 rounded-xl border p-4"
      style={{ borderColor: "var(--borde)" }}
    >
      <input type="hidden" name="obraId" value={obraId} />

      <div>
        <h3 className="text-sm font-semibold">Enviar el presupuesto contractual</h3>
        <p className="mt-1 max-w-2xl text-sm text-pretty opacity-70">
          Va el PDF del contractual, sin ninguna cifra de costo. El presupuesto
          meta y la comparativa no se pueden mandar desde aquí: se descargan.
        </p>
      </div>

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
          {estado.error}
        </p>
      )}

      {estado.mensaje && (
        <p
          role="status"
          className="flex items-start gap-2 rounded-lg px-3 py-2 text-sm"
          style={{
            backgroundColor:
              "color-mix(in oklab, var(--color-exito) 15%, transparent)",
          }}
        >
          <CheckCircle2 className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          {estado.mensaje}
        </p>
      )}

      <label className="block text-sm">
        <span className="opacity-70">
          Para (separa varias direcciones con coma):
        </span>
        <input
          type="text"
          name="para"
          required
          placeholder="cliente@empresa.com, supervision@empresa.com"
          className="mt-1 w-full rounded-lg border px-3 py-2 text-sm"
          style={{ borderColor: "var(--borde)", backgroundColor: "var(--fondo)" }}
        />
      </label>

      <label className="block text-sm">
        <span className="opacity-70">Nota (opcional):</span>
        <textarea
          name="nota"
          rows={2}
          maxLength={500}
          className="mt-1 w-full rounded-lg border px-3 py-2 text-sm"
          style={{ borderColor: "var(--borde)", backgroundColor: "var(--fondo)" }}
        />
      </label>

      <div className="flex items-center gap-3">
        <BotonEnviar />
        <button
          type="button"
          onClick={() => setAbierto(false)}
          className="text-sm font-medium underline opacity-70"
        >
          Cancelar
        </button>
      </div>
    </form>
  );
}

function BotonEnviar() {
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
        <Mail className="size-4" aria-hidden="true" />
      )}
      {pending ? "Enviando…" : "Enviar"}
    </button>
  );
}
