"use client";

import { useActionState, useRef, useEffect } from "react";
import { useFormStatus } from "react-dom";
import { LoaderCircle, Send } from "lucide-react";
import { haceCuanto } from "@/utils/fechas";
import type { MensajeSoporteResumen } from "@/services/soporte.service";

/**
 * El hilo de soporte, compartido por los dos lados (empresa y operador).
 *
 * Un solo componente de presentacion para las dos pantallas: la unica
 * diferencia real entre "lo que ve la empresa" y "lo que ve el operador"
 * es cual `direccion` se pinta a la derecha (la propia) y a que Server
 * Action va el formulario — todo lo demas (burbujas, orden cronologico,
 * el textarea) es identico.
 */

export interface EstadoSoporteForm {
  error?: string;
  ok?: string;
}

function Boton() {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
      style={{ backgroundColor: "var(--color-marca-600)" }}
    >
      {pending ? (
        <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
      ) : (
        <Send className="size-4" aria-hidden="true" />
      )}
      Enviar
    </button>
  );
}

export function HiloSoporte({
  mensajes,
  miDireccion,
  accion,
  vacio,
  camposOcultos,
}: {
  mensajes: MensajeSoporteResumen[];
  /// Cual `direccion` es "yo" en esta pantalla: decide que burbuja va a la
  /// derecha.
  miDireccion: "DEL_OPERADOR" | "DE_LA_EMPRESA";
  accion: (previo: EstadoSoporteForm, datos: FormData) => Promise<EstadoSoporteForm>;
  vacio: string;
  /// Datos extra que el formulario necesita mandar (p.ej. el id de la
  /// empresa, del lado operador). El lado empresa no necesita ninguno: su
  /// ambito ya sale de la sesion.
  camposOcultos?: Record<string, string>;
}) {
  const [estado, enviar] = useActionState(accion, {});
  const formRef = useRef<HTMLFormElement>(null);

  // El textarea se vacia solo tras un envio que salio bien; si fallo, se
  // deja el texto puesto para no perder lo que se escribio.
  useEffect(() => {
    if (estado.ok) formRef.current?.reset();
  }, [estado.ok]);

  return (
    <div className="space-y-4">
      {mensajes.length === 0 ? (
        <p className="text-sm opacity-70">{vacio}</p>
      ) : (
        <ul className="space-y-3">
          {mensajes.map((m) => {
            const esMio = m.direccion === miDireccion;
            return (
              <li
                key={m.id}
                className={`flex ${esMio ? "justify-end" : "justify-start"}`}
              >
                <div
                  className="max-w-[85%] rounded-xl px-3 py-2 text-sm text-pretty"
                  style={{
                    backgroundColor: esMio
                      ? "var(--color-marca-600)"
                      : "var(--superficie)",
                    color: esMio ? "white" : undefined,
                    border: esMio ? "none" : "1px solid var(--borde)",
                  }}
                >
                  <p className="whitespace-pre-wrap">{m.cuerpo}</p>
                  <p className="mt-1 text-xs opacity-70">
                    {m.autorNombre} · {haceCuanto(m.createdAt)}
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <form ref={formRef} action={enviar} className="space-y-2">
        {camposOcultos &&
          Object.entries(camposOcultos).map(([nombre, valor]) => (
            <input key={nombre} type="hidden" name={nombre} value={valor} />
          ))}
        <textarea
          name="cuerpo"
          rows={3}
          required
          maxLength={4000}
          placeholder="Escribe tu mensaje…"
          className="w-full rounded-lg border px-3 py-2 text-sm"
          style={{ borderColor: "var(--borde)", backgroundColor: "var(--fondo)" }}
        />
        <div className="flex flex-wrap items-center gap-3">
          <Boton />
          {estado.error && (
            <span className="text-sm" style={{ color: "var(--color-peligro)" }}>
              {estado.error}
            </span>
          )}
        </div>
      </form>
    </div>
  );
}
