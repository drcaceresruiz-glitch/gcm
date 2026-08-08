"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import Link from "next/link";
import { AlertCircle, LoaderCircle, MailCheck } from "lucide-react";
import {
  accionSolicitarEnlace,
  type EstadoSolicitud,
} from "@/app/(auth)/recuperar-clave/acciones";
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
      {pending ? "Enviando..." : "Enviar enlace"}
    </button>
  );
}

export function FormularioRecuperacion() {
  const [estado, accion] = useActionState<EstadoSolicitud, FormData>(
    accionSolicitarEnlace,
    {},
  );

  // El acuse no dice si la cuenta existe. Es a proposito: si dijera "no hay
  // cuenta con ese correo", cualquiera podria ir probando direcciones hasta
  // saber quien trabaja aqui.
  if (estado.enviado) {
    return (
      <div className="space-y-4 text-center">
        <MailCheck
          className="mx-auto size-9"
          style={{ color: "var(--color-exito)" }}
          aria-hidden="true"
        />
        <p className="text-sm">
          Si ese correo tiene una cuenta activa, le acaba de llegar un enlace
          para elegir clave nueva.
        </p>
        <p className="text-xs opacity-60">
          Caduca en una hora y sirve una sola vez. Revisa tambien la carpeta de
          correo no deseado.
        </p>
        <Link
          href="/login"
          className="inline-block text-sm font-medium underline"
        >
          Volver a ingresar
        </Link>
      </div>
    );
  }

  return (
    <form action={accion} className="space-y-4" noValidate>
      <p className="text-sm opacity-70">
        Escribe tu correo y te enviamos un enlace para elegir una clave nueva.
      </p>

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
        id="email"
        name="email"
        type="email"
        etiqueta="Correo electronico"
        autoComplete="username"
        required
        autoFocus
        inputMode="email"
      />

      <BotonEnviar />

      <p className="text-center">
        <Link href="/login" className="text-sm underline opacity-70">
          Volver a ingresar
        </Link>
      </p>
    </form>
  );
}
