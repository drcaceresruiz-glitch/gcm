"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import {
  AlertCircle,
  CheckCircle2,
  LoaderCircle,
  ShieldCheck,
  ShieldOff,
} from "lucide-react";
import {
  accionCambiarDosFactores,
  type EstadoPerfil,
} from "@/app/(dashboard)/perfil/acciones";
import { Tarjeta, SeccionTarjeta } from "@/components/ui/Tarjeta";

function Boton({ activo }: { activo: boolean }) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-60"
      style={
        activo
          ? { borderWidth: 1, borderColor: "var(--borde)" }
          : { backgroundColor: "var(--color-marca-600)", color: "#fff" }
      }
    >
      {pending ? (
        <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
      ) : activo ? (
        <ShieldOff className="size-4" aria-hidden="true" />
      ) : (
        <ShieldCheck className="size-4" aria-hidden="true" />
      )}
      {activo ? "Desactivar" : "Activar"}
    </button>
  );
}

export function DosFactores({
  activo,
  email,
}: {
  activo: boolean;
  email: string;
}) {
  const [estado, accion] = useActionState<EstadoPerfil, FormData>(
    accionCambiarDosFactores,
    {},
  );

  return (
    <Tarjeta>
      <SeccionTarjeta
        primera
        titulo="Verificación en dos pasos"
        nota={`Al entrar te pediremos, además de la clave, un código de seis cifras que enviamos a ${email}. Así, quien averigüe tu clave tampoco entra sin tu correo.`}
      >
        <p
          className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm"
          style={{
            backgroundColor: activo
              ? "color-mix(in oklab, var(--color-exito) 15%, transparent)"
              : "color-mix(in oklab, var(--color-alerta) 15%, transparent)",
          }}
        >
          {activo ? (
            <ShieldCheck className="size-4 shrink-0" aria-hidden="true" />
          ) : (
            <ShieldOff className="size-4 shrink-0" aria-hidden="true" />
          )}
          {activo ? "Activada" : "Desactivada"}
        </p>

        {estado.error && (
          <p
            role="alert"
            className="flex items-start gap-2 text-sm"
            style={{ color: "var(--color-peligro)" }}
          >
            <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <span>{estado.error}</span>
          </p>
        )}

        {estado.ok && (
          <p
            role="status"
            className="flex items-start gap-2 text-sm"
            style={{ color: "var(--color-exito)" }}
          >
            <CheckCircle2 className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <span>{estado.ok}</span>
          </p>
        )}

        <form action={accion}>
          <input type="hidden" name="activo" value={activo ? "no" : "si"} />
          <Boton activo={activo} />
        </form>

        {!activo && (
          <p className="text-xs opacity-60">
            Antes de activarla, comprueba que recibes correo en esa dirección.
            Si te quedas sin acceso al buzón, un administrador tendrá que
            apagártela.
          </p>
        )}
      </SeccionTarjeta>
    </Tarjeta>
  );
}
