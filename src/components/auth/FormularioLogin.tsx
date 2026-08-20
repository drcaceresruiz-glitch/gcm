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

      {/**
        * ESE CORREO ABRE CUENTA EN VARIAS CONSTRUCTORAS.
        *
        * Solo se pinta cuando pasa, que es raro: hace falta la misma persona
        * con la MISMA clave en dos clientes de GCM. Quien tiene una sola
        * cuenta no ve esto nunca y entra en un paso, como siempre.
        *
        * Cada constructora es un boton de envio con `name="companyId"`: el
        * navegador manda el valor del boton pulsado, asi que el formulario se
        * reenvia con el correo y la clave que ya estan escritos —los campos no
        * se remontan— y sin una linea de estado propio. Funciona igual con
        * JavaScript desactivado.
        */}
      {estado.elegirEmpresa ? (
        <div
          className="space-y-2 rounded-lg border p-3"
          style={{ borderColor: "var(--borde)" }}
        >
          <p className="text-sm font-medium">¿En cuál entras?</p>
          <p className="text-sm opacity-70">
            Ese correo tiene cuenta en más de una constructora.
          </p>

          {estado.elegirEmpresa.map((e) => (
            <button
              key={e.companyId}
              type="submit"
              name="companyId"
              value={e.companyId}
              className="flex w-full items-center justify-between gap-2 rounded-lg border px-3 py-2.5 text-left text-sm font-medium"
              style={{ borderColor: "var(--borde)" }}
            >
              {e.razonSocial}
            </button>
          ))}
        </div>
      ) : (
        <BotonEnviar />
      )}

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
