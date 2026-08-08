"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { AlertCircle, LoaderCircle, ShieldCheck } from "lucide-react";
import {
  accionVerificarCodigo,
  accionCancelarCodigo,
  type EstadoFormulario,
} from "@/app/(auth)/acciones";
import { LONGITUD_CODIGO } from "@/lib/dosFactores";

function BotonEnviar() {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className="flex w-full items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium text-white disabled:opacity-60"
      style={{ backgroundColor: "var(--color-marca-600)" }}
    >
      {pending && (
        <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
      )}
      {pending ? "Comprobando..." : "Entrar"}
    </button>
  );
}

export function FormularioCodigo({ minutos }: { minutos: number }) {
  const [estado, accion] = useActionState<EstadoFormulario, FormData>(
    accionVerificarCodigo,
    {},
  );

  return (
    <div className="space-y-4">
      <div className="text-center">
        <ShieldCheck
          className="mx-auto size-9"
          style={{ color: "var(--color-marca-500)" }}
          aria-hidden="true"
        />
        <p className="mt-2 text-sm">
          Te enviamos un codigo de {LONGITUD_CODIGO} cifras a tu correo.
        </p>
        <p className="mt-1 text-xs opacity-60">
          Caduca en {minutos} minutos.
        </p>
      </div>

      <form action={accion} className="space-y-4" noValidate>
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

        <div className="space-y-1.5">
          <label htmlFor="codigo" className="block text-sm font-medium">
            Codigo
          </label>
          {/* `inputMode` numerico saca el teclado de cifras en el movil, que
              es donde se teclea esto casi siempre. `one-time-code` deja que
              el sistema lo ofrezca desde la notificacion del correo. */}
          <input
            id="codigo"
            name="codigo"
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={12}
            required
            autoFocus
            className="w-full rounded-lg border px-3 py-2.5 text-center font-mono text-2xl tracking-[0.4em] outline-none"
            style={{
              borderColor: "var(--borde)",
              backgroundColor: "var(--fondo)",
            }}
          />
        </div>

        <BotonEnviar />
      </form>

      {/* Formulario aparte: anidar formularios no es HTML valido. */}
      <form action={accionCancelarCodigo} className="text-center">
        <button type="submit" className="text-sm underline opacity-70">
          Cancelar y volver a ingresar
        </button>
      </form>
    </div>
  );
}
