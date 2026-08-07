"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { AlertCircle, LoaderCircle, ShieldCheck } from "lucide-react";
import { accionCambiarClave, type EstadoFormulario } from "@/app/(auth)/acciones";
import { CampoTexto } from "@/components/auth/CampoTexto";

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
      {pending ? "Guardando..." : "Cambiar contrasena"}
    </button>
  );
}

export function FormularioCambioClave({ obligatorio }: { obligatorio: boolean }) {
  const [estado, accion] = useActionState<EstadoFormulario, FormData>(
    accionCambiarClave,
    {},
  );

  return (
    <form action={accion} className="space-y-4" noValidate>
      {obligatorio && (
        <div
          role="status"
          className="flex items-start gap-2 rounded-lg px-3 py-2 text-sm"
          style={{
            backgroundColor:
              "color-mix(in oklab, var(--color-alerta) 20%, transparent)",
          }}
        >
          <ShieldCheck className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <span>
            Es tu primer ingreso. Define una contrasena propia para continuar.
          </span>
        </div>
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

      <CampoTexto
        id="claveActual"
        name="claveActual"
        type="password"
        etiqueta="Contrasena actual"
        autoComplete="current-password"
        required
        autoFocus
      />

      <CampoTexto
        id="claveNueva"
        name="claveNueva"
        type="password"
        etiqueta="Nueva contrasena"
        autoComplete="new-password"
        ayuda="Minimo 10 caracteres."
        required
        minLength={10}
      />

      <CampoTexto
        id="confirmacion"
        name="confirmacion"
        type="password"
        etiqueta="Repite la nueva contrasena"
        autoComplete="new-password"
        required
      />

      <BotonEnviar />

      <p className="text-xs opacity-60">
        Al cambiarla se cerraran todas tus sesiones abiertas y deberas ingresar
        de nuevo.
      </p>
    </form>
  );
}
