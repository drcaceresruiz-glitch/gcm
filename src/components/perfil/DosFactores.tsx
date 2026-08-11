"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import {
  AlertCircle,
  BadgeCheck,
  CheckCircle2,
  LoaderCircle,
  Mail,
  MessageSquare,
  ShieldCheck,
  ShieldOff,
} from "lucide-react";
import {
  accionCambiarDosFactores,
  accionCambiarCanal2FA,
  accionVerificarCelularPedir,
  accionVerificarCelularConfirmar,
  type EstadoPerfil,
} from "@/app/(dashboard)/perfil/acciones";
import { Tarjeta, SeccionTarjeta } from "@/components/ui/Tarjeta";
import { LONGITUD_CODIGO, type Canal2FA } from "@/lib/dosFactores";

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

/** Los avisos de una acción. Mismo formato que el resto del perfil. */
function Avisos({ estado }: { estado: EstadoPerfil }) {
  return (
    <>
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
    </>
  );
}

export function DosFactores({
  activo,
  email,
  canal,
  celular,
  celularVerificado,
  smsDisponible,
}: {
  activo: boolean;
  email: string;
  canal: Canal2FA;
  celular: string | null;
  celularVerificado: boolean;
  smsDisponible: boolean;
}) {
  const [estado, accion] = useActionState<EstadoPerfil, FormData>(
    accionCambiarDosFactores,
    {},
  );

  const destino = canal === "SMS" && celular ? `al ${celular}` : `a ${email}`;

  return (
    <div className="space-y-6">
      <Tarjeta>
        <SeccionTarjeta
          primera
          titulo="Verificación en dos pasos"
          nota={`Al entrar te pediremos, además de la clave, un código de ${LONGITUD_CODIGO} cifras que enviamos ${destino}. Así, quien averigüe tu clave tampoco entra.`}
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

          <Avisos estado={estado} />

          <form action={accion}>
            <input type="hidden" name="activo" value={activo ? "no" : "si"} />
            <Boton activo={activo} />
          </form>

          {!activo && (
            <p className="text-xs opacity-60">
              Antes de activarla, comprueba que recibes el código donde has
              elegido. Si te quedas sin acceso, un administrador tendrá que
              apagártela.
            </p>
          )}
        </SeccionTarjeta>
      </Tarjeta>

      <ElegirCanal
        canal={canal}
        email={email}
        celular={celular}
        celularVerificado={celularVerificado}
        smsDisponible={smsDisponible}
      />
    </div>
  );
}

/**
 * Por dónde llega el código: correo o SMS, uno de los dos.
 *
 * El SMS solo se puede elegir con el celular verificado, y la tarjeta lo
 * explica en vez de limitarse a deshabilitar el botón: un control apagado sin
 * motivo se lee como que la aplicación está rota.
 */
function ElegirCanal({
  canal,
  email,
  celular,
  celularVerificado,
  smsDisponible,
}: {
  canal: Canal2FA;
  email: string;
  celular: string | null;
  celularVerificado: boolean;
  smsDisponible: boolean;
}) {
  const [estado, accion] = useActionState<EstadoPerfil, FormData>(
    accionCambiarCanal2FA,
    {},
  );

  const puedeSms = smsDisponible && Boolean(celular) && celularVerificado;

  return (
    <Tarjeta>
      <SeccionTarjeta
        primera
        titulo="Por dónde te llega el código"
        nota="Uno de los dos, no los dos a la vez."
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <OpcionCanal
            icono={<Mail className="size-4 shrink-0" aria-hidden="true" />}
            titulo="Correo"
            detalle={email}
            elegido={canal === "CORREO"}
            accion={accion}
            valor="CORREO"
          />

          <OpcionCanal
            icono={
              <MessageSquare className="size-4 shrink-0" aria-hidden="true" />
            }
            titulo="SMS"
            detalle={celular ?? "Sin celular guardado"}
            elegido={canal === "SMS"}
            accion={accion}
            valor="SMS"
            bloqueado={!puedeSms}
          />
        </div>

        <Avisos estado={estado} />

        {!smsDisponible ? (
          <p className="text-xs opacity-60">
            Esta instalación no tiene ahora mismo por dónde enviar SMS. Habla
            con el administrador.
          </p>
        ) : !celular ? (
          <p className="text-xs opacity-60">
            Guarda tu celular más arriba para poder recibir el código por SMS.
          </p>
        ) : !celularVerificado ? (
          <VerificarCelular celular={celular} />
        ) : (
          <p
            className="flex items-center gap-1.5 text-xs"
            style={{ color: "var(--color-exito)" }}
          >
            <BadgeCheck className="size-3.5 shrink-0" aria-hidden="true" />
            Celular verificado.
          </p>
        )}
      </SeccionTarjeta>
    </Tarjeta>
  );
}

function OpcionCanal({
  icono,
  titulo,
  detalle,
  elegido,
  valor,
  accion,
  bloqueado = false,
}: {
  icono: React.ReactNode;
  titulo: string;
  detalle: string;
  elegido: boolean;
  valor: Canal2FA;
  accion: (datos: FormData) => void;
  bloqueado?: boolean;
}) {
  return (
    <form action={accion}>
      <input type="hidden" name="canal" value={valor} />
      <button
        type="submit"
        disabled={elegido || bloqueado}
        aria-pressed={elegido}
        className="w-full rounded-xl border p-3 text-left disabled:cursor-default"
        style={{
          borderColor: elegido ? "var(--color-marca-600)" : "var(--borde)",
          borderWidth: elegido ? 2 : 1,
          opacity: bloqueado ? 0.5 : 1,
          backgroundColor: elegido
            ? "color-mix(in oklab, var(--color-marca-500) 8%, transparent)"
            : "transparent",
        }}
      >
        <span className="flex items-center gap-2 text-sm font-medium">
          {icono}
          {titulo}
          {elegido && (
            <CheckCircle2
              className="size-4"
              style={{ color: "var(--color-marca-600)" }}
              aria-label="En uso"
            />
          )}
        </span>
        <span className="mt-0.5 block truncate text-xs opacity-70">
          {detalle}
        </span>
      </button>
    </form>
  );
}

/** Pedir el código y escribirlo, para dar el celular por bueno. */
function VerificarCelular({ celular }: { celular: string }) {
  const [pedido, pedir] = useActionState<EstadoPerfil, FormData>(
    accionVerificarCelularPedir,
    {},
  );
  const [confirmado, confirmar] = useActionState<EstadoPerfil, FormData>(
    accionVerificarCelularConfirmar,
    {},
  );

  return (
    <div
      className="space-y-3 rounded-xl border p-3"
      style={{ borderColor: "var(--borde)" }}
    >
      <p className="text-xs opacity-70">
        Para recibir el código por SMS hay que comprobar que el {celular} es
        tuyo. Un dígito mal escrito te dejaría fuera de tu cuenta sin ningún
        aviso, y por eso no basta con haberlo guardado.
      </p>

      <Avisos estado={pedido} />

      <form action={pedir}>
        <button
          type="submit"
          className="rounded-lg border px-3 py-1.5 text-xs font-medium"
          style={{ borderColor: "var(--borde)" }}
        >
          Enviarme un código
        </button>
      </form>

      <form action={confirmar} className="flex flex-wrap items-end gap-2">
        <div className="space-y-1">
          <label htmlFor="codigo-celular" className="block text-xs font-medium">
            Código recibido
          </label>
          <input
            id="codigo-celular"
            name="codigo"
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={12}
            className="w-36 rounded-lg border px-3 py-2 text-center font-mono tracking-[0.3em]"
            style={{
              borderColor: "var(--borde)",
              backgroundColor: "var(--fondo)",
            }}
          />
        </div>
        <button
          type="submit"
          className="rounded-lg px-3 py-2 text-xs font-medium text-white"
          style={{ backgroundColor: "var(--color-marca-600)" }}
        >
          Verificar
        </button>
      </form>

      <Avisos estado={confirmado} />
    </div>
  );
}
