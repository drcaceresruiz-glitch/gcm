"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { AlertCircle, LoaderCircle, ShieldCheck } from "lucide-react";
import {
  accionVerificarCodigo,
  accionCancelarCodigo,
  type EstadoFormulario,
} from "@/app/(auth)/acciones";
import { LONGITUD_CODIGO, type Canal2FA } from "@/lib/dosFactores";

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

export function FormularioCodigo({
  minutos,
  canal,
  destino,
  siguiente,
}: {
  minutos: number;
  canal: Canal2FA;
  /// Ya enmascarado por el servidor. Aqui no llega el dato entero.
  destino: string;
  /// Adonde volver tras entrar. Ver el comentario del mismo campo en
  /// `FormularioLogin`: viaja oculto porque el envio es un Server Action.
  siguiente?: string;
}) {
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
        {/* Se dice el destino, tapado. Quien cambio de canal hace un mes no
            tiene por que acordarse, y sin esto se queda mirando el buzon
            equivocado hasta que el codigo caduca. */}
        <p className="mt-2 text-sm">
          Te enviamos un código de {LONGITUD_CODIGO} cifras a{" "}
          {canal === "SMS" ? "tu celular" : "tu correo"}{" "}
          <span className="font-medium">{destino}</span>.
        </p>
        <p className="mt-1 text-xs opacity-60">
          Caduca en {minutos} minutos.
        </p>
      </div>

      <form action={accion} className="space-y-4" noValidate>
        {siguiente && <input type="hidden" name="siguiente" value={siguiente} />}

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
            Código
          </label>
          {/* `inputMode` numerico saca el teclado de cifras en el movil, que
              es donde se teclea esto casi siempre. `one-time-code` deja que
              el sistema lo ofrezca solo: con el SMS lo hace de verdad —iOS y
              Android leen el codigo de la notificacion—, con el correo
              depende del cliente. */}
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
