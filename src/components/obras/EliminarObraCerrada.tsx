"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { AlertCircle, LoaderCircle, Trash2 } from "lucide-react";

import {
  accionEliminarObraCerrada,
  type RespuestaEdicion,
} from "@/app/(dashboard)/obras/[id]/acciones";

/**
 * Eliminar DEFINITIVAMENTE una obra cerrada.
 *
 * En dos pasos y con formulario, no con un `window.confirm`: es el patron de
 * la casa para lo irreversible, y aqui ademas hace falta teclear dos cosas.
 *
 * Las dos comprobaciones cubren fallos distintos y por eso van las dos. El
 * nombre exacto convierte un clic accidental en un acto deliberado —hay que
 * leer que obra es—. La contrasena cubre el caso real de una oficina: la
 * sesion abierta y el ordenador sin bloquear.
 *
 * Nada de esto MANDA: el servicio lo vuelve a comprobar todo, y ademas exige
 * un respaldo reciente, que es la puerta que esta pantalla no puede abrir.
 */
export function EliminarObraCerrada({
  obraId,
  nombre,
  hayRespaldo,
}: {
  obraId: string;
  nombre: string;
  hayRespaldo: boolean;
}) {
  const [estado, accion] = useActionState<RespuestaEdicion, FormData>(
    accionEliminarObraCerrada,
    { ok: true },
  );
  const [abierto, setAbierto] = useState(false);

  if (!abierto) {
    return (
      <div className="mt-4">
        <button
          type="button"
          onClick={() => setAbierto(true)}
          className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs"
          style={{
            borderColor: "var(--color-peligro)",
            color: "var(--color-peligro)",
          }}
        >
          <Trash2 className="size-3.5" aria-hidden="true" />
          Eliminar la obra definitivamente
        </button>
      </div>
    );
  }

  return (
    <form
      action={accion}
      className="mt-4 space-y-3 rounded-lg border p-3"
      style={{ borderColor: "var(--color-peligro)" }}
    >
      <input type="hidden" name="id" value={obraId} />

      <p className="text-xs">
        Se elimina <strong>{nombre}</strong> con todo lo que cuelga de ella:
        presupuesto, ordenes de compra, cronograma, avances, plan semanal,
        encargos y fotos. <strong>No se puede deshacer.</strong> Despues solo
        quedara el respaldo que hayas descargado, y el apunte en la auditoria de
        que fuiste tu quien la borro.
      </p>

      {!hayRespaldo && (
        <p
          className="rounded-lg px-3 py-2 text-xs"
          style={{
            backgroundColor:
              "color-mix(in oklab, var(--color-alerta) 18%, transparent)",
          }}
        >
          No consta un respaldo reciente de esta obra. Descargalo primero: el
          servidor no dejara borrarla sin el.
        </p>
      )}

      <label className="block text-xs">
        <span className="opacity-70">
          Escribe el nombre exacto de la obra para confirmar:
        </span>
        <input
          name="nombre"
          required
          autoComplete="off"
          placeholder={nombre}
          className="mt-1 w-full rounded-lg border px-2 py-1.5 text-xs"
          style={{ borderColor: "var(--borde)" }}
        />
      </label>

      <label className="block text-xs">
        <span className="opacity-70">Tu contrasena:</span>
        <input
          name="clave"
          type="password"
          required
          autoComplete="current-password"
          className="mt-1 w-full rounded-lg border px-2 py-1.5 text-xs"
          style={{ borderColor: "var(--borde)" }}
        />
      </label>

      {!estado.ok && estado.error && (
        <p
          role="alert"
          className="flex items-start gap-2 rounded-lg px-3 py-2 text-xs"
          style={{
            backgroundColor:
              "color-mix(in oklab, var(--color-peligro) 15%, transparent)",
          }}
        >
          <AlertCircle className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
          <span>{estado.error}</span>
        </p>
      )}

      <div className="flex items-center gap-2">
        <Confirmar />
        <button
          type="button"
          onClick={() => setAbierto(false)}
          className="rounded-lg border px-3 py-1.5 text-xs"
          style={{ borderColor: "var(--borde)" }}
        >
          Cancelar
        </button>
      </div>
    </form>
  );
}

function Confirmar() {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs text-white disabled:opacity-60"
      style={{ backgroundColor: "var(--color-peligro)" }}
    >
      {pending ? (
        <LoaderCircle className="size-3.5 animate-spin" aria-hidden="true" />
      ) : (
        <Trash2 className="size-3.5" aria-hidden="true" />
      )}
      Eliminar definitivamente
    </button>
  );
}
