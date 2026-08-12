"use client";

import { useActionState, useState } from "react";
import { AlertCircle, CheckCircle2, LoaderCircle, Mail } from "lucide-react";
import {
  accionEnviarInforme,
  type RespuestaEnvioInforme,
} from "@/app/(dashboard)/obras/[id]/cronograma/informe/acciones";

/**
 * Enviar el informe por correo, desde la propia pantalla del informe.
 *
 * El formulario aparece solo al pulsar: es una accion ocasional y tenerlo
 * siempre desplegado empuja el informe hacia abajo, que es lo que se ha venido
 * a ver.
 *
 * Solo viaja lo que el usuario escribe. El corte va como fecha ISO —la del
 * informe que se esta mirando— para que el correo no pueda salir de otro dia,
 * pero las CIFRAS las mide el servidor: aqui no hay campos ocultos con
 * porcentajes.
 */
export function EnviarInforme({
  obraId,
  corteIso,
}: {
  obraId: string;
  corteIso: string;
}) {
  const [abierto, setAbierto] = useState(false);
  const [estado, enviar, enviando] = useActionState<RespuestaEnvioInforme, FormData>(
    accionEnviarInforme,
    { ok: false },
  );

  return (
    <div className="print:hidden">
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        aria-expanded={abierto}
        className="inline-flex items-center gap-2 rounded-lg border px-4 py-2 text-sm font-medium"
        style={{
          borderColor: abierto ? "var(--color-marca-600)" : "var(--borde)",
          color: abierto ? "var(--color-marca-600)" : undefined,
        }}
      >
        <Mail className="size-4" aria-hidden="true" />
        Enviar por correo
      </button>

      {abierto && (
        <form
          action={enviar}
          className="mt-3 space-y-3 rounded-lg border p-3"
          style={{
            borderColor: "var(--borde)",
            backgroundColor: "var(--superficie)",
          }}
        >
          <input type="hidden" name="obraId" value={obraId} />
          <input type="hidden" name="corte" value={corteIso} />

          <div className="flex flex-wrap items-end gap-3">
            <label className="min-w-64 flex-1 text-xs">
              <span className="block opacity-70">
                Para (varios correos separados por coma)
              </span>
              <input
                name="para"
                type="text"
                required
                placeholder="residente@obra.pe, cliente@empresa.pe"
                className="mt-1 w-full rounded-lg border px-3 py-2 text-sm"
                style={{
                  borderColor: "var(--borde)",
                  backgroundColor: "var(--fondo)",
                }}
              />
            </label>

            <label className="min-w-64 flex-1 text-xs">
              <span className="block opacity-70">Nota (opcional)</span>
              <input
                name="nota"
                type="text"
                maxLength={500}
                placeholder="Comentario para quien lo reciba"
                className="mt-1 w-full rounded-lg border px-3 py-2 text-sm"
                style={{
                  borderColor: "var(--borde)",
                  backgroundColor: "var(--fondo)",
                }}
              />
            </label>

            <button
              type="submit"
              disabled={enviando}
              className="flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
              style={{ backgroundColor: "var(--color-marca-600)" }}
            >
              {enviando && (
                <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
              )}
              Enviar
            </button>
          </div>

          <p className="text-xs opacity-60">
            Va el resumen en el cuerpo y dos adjuntos: el informe completo en
            PDF y los mismos datos en hoja de cálculo. Cada destinatario lo
            recibe por separado: nadie ve la lista de los demás.
          </p>

          {estado.error && <Nota tono="peligro">{estado.error}</Nota>}
          {estado.ok && estado.mensaje && (
            <Nota tono="exito">{estado.mensaje}</Nota>
          )}
        </form>
      )}
    </div>
  );
}

function Nota({
  tono,
  children,
}: {
  tono: "peligro" | "exito";
  children: React.ReactNode;
}) {
  const color = `var(--color-${tono})`;
  const Icono = tono === "exito" ? CheckCircle2 : AlertCircle;

  return (
    <p
      role="status"
      className="flex items-start gap-2 rounded-lg px-3 py-2 text-sm"
      style={{ backgroundColor: `color-mix(in oklab, ${color} 15%, transparent)` }}
    >
      <Icono className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      <span>{children}</span>
    </p>
  );
}
