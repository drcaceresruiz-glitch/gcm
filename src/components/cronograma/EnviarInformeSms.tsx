"use client";

import { useActionState, useState } from "react";
import { LoaderCircle, MessageSquare } from "lucide-react";
import { Nota } from "@/components/ui/Nota";
import {
  accionEnviarInformeSms,
  type RespuestaEnvioInforme,
} from "@/app/(dashboard)/obras/[id]/cronograma/informe/acciones";

/**
 * Mandar el resumen por SMS.
 *
 * SE ENSEÑA EL TEXTO EXACTO antes de mandarlo, con su cuenta de caracteres.
 * No es adorno: son 160 caracteres que van al cliente y no queda copia en
 * ningun buzon donde mirarlos despues. Y cuando la empresa todavia no tiene
 * telefono emisor, ese texto es lo unico util de esta caja —se copia y se manda
 * a mano—, asi que se enseña IGUAL en vez de esconder la funcion entera.
 *
 * El texto llega hecho del servidor. Si lo compusiera el navegador, un mensaje
 * firmado por GCM podria decir cifras que GCM no ha medido.
 */
export function EnviarInformeSms({
  obraId,
  corteIso,
  texto,
  hayCanal,
}: {
  obraId: string;
  corteIso: string;
  texto: string;
  hayCanal: boolean;
}) {
  const [abierto, setAbierto] = useState(false);
  const [estado, enviar, enviando] = useActionState<RespuestaEnvioInforme, FormData>(
    accionEnviarInformeSms,
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
        <MessageSquare className="size-4" aria-hidden="true" />
        Enviar por SMS
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

          <div>
            <span className="block text-xs opacity-70">Lo que se va a enviar</span>
            <p
              className="mt-1 rounded-lg border p-2 font-mono text-xs"
              style={{ borderColor: "var(--borde)", backgroundColor: "var(--fondo)" }}
            >
              {texto}
            </p>
            <p className="mt-1 text-xs opacity-60">
              {texto.length} de 160 caracteres. Sin tildes y sin enlaces a
              propósito: con una tilde el mensaje se parte en dos, y las
              operadoras marcan como spam los SMS con enlaces.
            </p>
          </div>

          {hayCanal ? (
            <div className="flex flex-wrap items-end gap-3">
              <label className="min-w-64 flex-1 text-xs">
                <span className="block opacity-70">
                  Celulares (separados por coma)
                </span>
                <input
                  name="numeros"
                  type="text"
                  inputMode="tel"
                  placeholder="987654321, 998877665"
                  required
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
          ) : (
            /* Se dice QUE falta y DONDE se arregla. Un boton apagado sin
               explicacion se lee como que la funcion esta rota. */
            <Nota tono="peligro">
              Esta empresa todavía no tiene teléfono emisor registrado, así que
              GCM no puede enviar SMS. Mientras tanto, el texto de arriba está
              listo para copiarlo. Se vincula en Empresa → Configuración.
            </Nota>
          )}

          {estado.error && <Nota tono="peligro">{estado.error}</Nota>}
          {estado.ok && estado.mensaje && <Nota tono="exito">{estado.mensaje}</Nota>}
        </form>
      )}
    </div>
  );
}
