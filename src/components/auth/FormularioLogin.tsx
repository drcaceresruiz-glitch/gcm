"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import Link from "next/link";
import { AlertCircle, LoaderCircle } from "lucide-react";
import { accionIniciarSesion, type EstadoFormulario } from "@/app/(auth)/acciones";
import { CampoTexto } from "@/components/auth/CampoTexto";

function BotonEnviar() {
  // useFormStatus lee el estado del formulario padre: da el indicador de
  // carga sin necesidad de gestionar estado propio.
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
      {pending ? "Verificando..." : "Ingresar"}
    </button>
  );
}

export function FormularioLogin({
  avisoCambio,
  avisoRecuperada,
  avisoCodigo,
}: {
  avisoCambio?: boolean;
  avisoRecuperada?: boolean;
  avisoCodigo?: boolean;
}) {
  const [estado, accion] = useActionState<EstadoFormulario, FormData>(
    accionIniciarSesion,
    {},
  );

  return (
    <form action={accion} className="space-y-4" noValidate>
      {avisoCodigo && (
        <p
          role="status"
          className="rounded-lg px-3 py-2 text-sm"
          style={{
            backgroundColor:
              "color-mix(in oklab, var(--color-alerta) 15%, transparent)",
          }}
        >
          El código caducó o se agotaron los intentos. Ingresa otra vez para
          pedir uno nuevo.
        </p>
      )}

      {avisoRecuperada && (
        <p
          role="status"
          className="rounded-lg px-3 py-2 text-sm"
          style={{
            backgroundColor:
              "color-mix(in oklab, var(--color-exito) 15%, transparent)",
          }}
        >
          Clave restablecida. Ingresa con la nueva.
        </p>
      )}

      {avisoCambio && (
        <p
          role="status"
          className="rounded-lg px-3 py-2 text-sm"
          style={{ backgroundColor: "color-mix(in oklab, var(--color-exito) 15%, transparent)" }}
        >
          Contraseña actualizada. Ingresa con la nueva.
        </p>
      )}

      {estado.error && (
        // role="alert" hace que el lector de pantalla lo anuncie de inmediato.
        <p
          role="alert"
          className="flex items-start gap-2 rounded-lg px-3 py-2 text-sm"
          style={{ backgroundColor: "color-mix(in oklab, var(--color-peligro) 15%, transparent)" }}
        >
          <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <span>{estado.error}</span>
        </p>
      )}

      <CampoTexto
        id="email"
        name="email"
        type="email"
        etiqueta="Correo electrónico"
        autoComplete="username"
        required
        autoFocus
        inputMode="email"
      />

      <CampoTexto
        id="clave"
        name="clave"
        type="password"
        etiqueta="Contraseña"
        autoComplete="current-password"
        required
      />

      <BotonEnviar />

      <p className="text-center">
        <Link
          href="/recuperar-clave"
          className="text-sm underline opacity-70"
        >
          Olvidé mi contraseña
        </Link>
      </p>
    </form>
  );
}
