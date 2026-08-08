"use client";

import { useState } from "react";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import {
  AlertCircle,
  ArrowRight,
  Check,
  CheckCircle2,
  LoaderCircle,
  X,
} from "lucide-react";
import {
  accionResolver,
  type EstadoBandeja,
} from "@/app/(dashboard)/empresa/solicitudes/acciones";
import type { SolicitudRevision } from "@/services/perfil.service";
import { haceCuanto, fechaHora } from "@/utils/fechas";
import { Tarjeta } from "@/components/ui/Tarjeta";

/**
 * La bandeja del ADMIN: cada solicitud con el antes y el despues de cada
 * campo, y aprobar o rechazar. Rechazar exige motivo.
 */
export function BandejaSolicitudes({
  solicitudes,
}: {
  solicitudes: SolicitudRevision[];
}) {
  if (solicitudes.length === 0) {
    return (
      <div
        className="rounded-xl border border-dashed p-10 text-center"
        style={{ borderColor: "var(--borde)" }}
      >
        <p className="text-sm opacity-70">No hay solicitudes pendientes.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {solicitudes.map((s) => (
        <Fila key={s.id} solicitud={s} />
      ))}
    </div>
  );
}

function Fila({ solicitud }: { solicitud: SolicitudRevision }) {
  const [estado, accion] = useActionState<EstadoBandeja, FormData>(
    accionResolver,
    {},
  );
  const [rechazando, setRechazando] = useState(false);

  return (
    <Tarjeta>
      <div className="p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-sm font-semibold">{solicitud.solicitante}</h2>
          <p className="text-xs opacity-60" title={fechaHora(solicitud.createdAt)}>
            {haceCuanto(solicitud.createdAt)}
          </p>
        </div>

        <ul className="mt-3 space-y-1.5 text-sm">
          {solicitud.cambios.map((c) => (
            <li key={c.campo} className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className="opacity-70">{c.campo}:</span>
              <span className="line-through opacity-60">{c.antes}</span>
              <ArrowRight className="size-3.5 shrink-0 opacity-50" aria-hidden="true" />
              <span className="font-medium">{c.despues}</span>
            </li>
          ))}
        </ul>

        {solicitud.motivo && (
          <p className="mt-3 rounded-lg border px-3 py-2 text-xs opacity-80"
            style={{ borderColor: "var(--borde)" }}>
            <span className="opacity-60">Motivo: </span>
            {solicitud.motivo}
          </p>
        )}

        {estado.error && (
          <p
            role="alert"
            className="mt-3 flex items-start gap-2 rounded-lg px-3 py-2 text-sm"
            style={{ backgroundColor: "color-mix(in oklab, var(--color-peligro) 15%, transparent)" }}
          >
            <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <span>{estado.error}</span>
          </p>
        )}

        {estado.ok && (
          <p
            role="status"
            className="mt-3 flex items-start gap-2 rounded-lg px-3 py-2 text-sm"
            style={{ backgroundColor: "color-mix(in oklab, var(--color-exito) 15%, transparent)" }}
          >
            <CheckCircle2 className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <span>{estado.ok}</span>
          </p>
        )}

        {/* Una vez resuelta, se retira la botonera: la fila se va en el
            proximo refresco, pero mientras tanto no debe poder resolverse dos
            veces. */}
        {!estado.ok && (
          <form action={accion} className="mt-4">
            <input type="hidden" name="id" value={solicitud.id} />

            {rechazando ? (
              <div className="space-y-2">
                <label htmlFor={`motivo-${solicitud.id}`} className="block text-xs opacity-70">
                  Motivo del rechazo (obligatorio)
                </label>
                <textarea
                  id={`motivo-${solicitud.id}`}
                  name="motivoRechazo"
                  rows={2}
                  required
                  className="w-full rounded-lg border px-3 py-2 text-sm outline-none"
                  style={{ borderColor: "var(--borde)", backgroundColor: "var(--fondo)" }}
                />
                <div className="flex gap-2">
                  <BotonEnviar
                    decision="rechazar"
                    className="text-white"
                    color="var(--color-peligro)"
                  >
                    <X className="size-4" aria-hidden="true" />
                    Confirmar rechazo
                  </BotonEnviar>
                  <button
                    type="button"
                    onClick={() => setRechazando(false)}
                    className="rounded-lg border px-3 py-2 text-sm"
                    style={{ borderColor: "var(--borde)" }}
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex gap-2">
                <BotonEnviar
                  decision="aprobar"
                  className="text-white"
                  color="var(--color-marca-600)"
                >
                  <Check className="size-4" aria-hidden="true" />
                  Aprobar
                </BotonEnviar>
                <button
                  type="button"
                  onClick={() => setRechazando(true)}
                  className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm"
                  style={{ borderColor: "var(--borde)" }}
                >
                  <X className="size-4" aria-hidden="true" />
                  Rechazar
                </button>
              </div>
            )}
          </form>
        )}
      </div>
    </Tarjeta>
  );
}

/**
 * Boton de envio que ademas fija que `decision` viaja en el formulario.
 *
 * Un `<button name="decision" value="...">` solo manda su valor si es el que
 * dispara el submit, que es justo lo que hace falta: aprobar y rechazar
 * comparten formulario pero mandan decisiones distintas.
 */
function BotonEnviar({
  decision,
  color,
  className,
  children,
}: {
  decision: "aprobar" | "rechazar";
  color: string;
  className?: string;
  children: React.ReactNode;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      name="decision"
      value={decision}
      disabled={pending}
      className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-60 ${className ?? ""}`}
      style={{ backgroundColor: color }}
    >
      {pending && <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />}
      {children}
    </button>
  );
}
