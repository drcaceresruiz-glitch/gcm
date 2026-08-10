"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { AlertCircle, LoaderCircle } from "lucide-react";
import {
  accionFijarClave,
  type EstadoNuevaClave,
} from "@/app/(auth)/recuperar-clave/acciones";
import { CampoTexto } from "@/components/auth/CampoTexto";
import { AVISO_CLAVE } from "@/lib/claves";

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
      {pending ? "Guardando..." : "Guardar clave nueva"}
    </button>
  );
}

export function FormularioNuevaClave({ token }: { token: string }) {
  const [estado, accion] = useActionState<EstadoNuevaClave, FormData>(
    accionFijarClave,
    {},
  );

  return (
    <form action={accion} className="space-y-4" noValidate>
      {/* El token viaja en el cuerpo y no solo en la URL: asi la accion lo
          recibe sin depender de que el enlace siga intacto en la barra. */}
      <input type="hidden" name="token" value={token} />

      <p className="text-sm opacity-70">
        Elige tu clave nueva. Al guardarla se cerrarán todas las sesiones
        abiertas.
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
        id="claveNueva"
        name="claveNueva"
        type="password"
        etiqueta="Clave nueva"
        autoComplete="new-password"
        ayuda={AVISO_CLAVE}
        required
        autoFocus
      />

      <CampoTexto
        id="confirmacion"
        name="confirmacion"
        type="password"
        etiqueta="Repite la clave nueva"
        autoComplete="new-password"
        required
      />

      <BotonEnviar />
    </form>
  );
}
