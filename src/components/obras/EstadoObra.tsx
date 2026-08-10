"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { AlertCircle, LoaderCircle, Play, Pause, Lock } from "lucide-react";
import {
  accionCambiarEstadoObra,
  type RespuestaEdicion,
} from "@/app/(dashboard)/obras/[id]/acciones";
import {
  transicionesDeObra,
  etiquetaTransicionObra,
  ETIQUETA_ESTADO_OBRA,
  TONO_ESTADO_OBRA,
  type EstadoObra as Estado,
} from "@/lib/obras";
import { Chip } from "@/components/ui/Chip";

/**
 * El estado de la obra y los pasos que puede dar desde el.
 *
 * Se muestra el estado actual como chip y, al lado, un boton por cada
 * transicion permitida —"Iniciar ejecucion", "Paralizar", "Reanudar",
 * "Cerrar obra"—. Cerrar pide confirmacion: cerrada es terminal, no se
 * reabre. Que aparezcan solo las transiciones validas es la misma regla que
 * el servidor aplica; aqui solo se dibuja.
 */
export function EstadoObra({
  obraId,
  estado,
  puedeEditar,
}: {
  obraId: string;
  estado: Estado;
  puedeEditar: boolean;
}) {
  const [respuesta, accion] = useActionState<RespuestaEdicion, FormData>(
    accionCambiarEstadoObra,
    { ok: true },
  );

  const transiciones = transicionesDeObra(estado);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Chip tono={TONO_ESTADO_OBRA[estado]}>{ETIQUETA_ESTADO_OBRA[estado]}</Chip>

      {puedeEditar &&
        transiciones.map((destino) => (
          <form key={destino} action={accion}>
            <input type="hidden" name="id" value={obraId} />
            <input type="hidden" name="estado" value={destino} />
            <BotonTransicion desde={estado} hacia={destino} />
          </form>
        ))}

      {estado === "CERRADA" && (
        <span className="inline-flex items-center gap-1 text-xs opacity-60">
          <Lock className="size-3.5" aria-hidden="true" />
          Cerrada: no admite más cambios.
        </span>
      )}

      {!respuesta.ok && respuesta.error && (
        <span
          role="alert"
          className="inline-flex items-center gap-1.5 text-xs"
          style={{ color: "var(--color-peligro)" }}
        >
          <AlertCircle className="size-3.5 shrink-0" aria-hidden="true" />
          {respuesta.error}
        </span>
      )}
    </div>
  );
}

function BotonTransicion({ desde, hacia }: { desde: Estado; hacia: Estado }) {
  const { pending } = useFormStatus();
  const etiqueta = etiquetaTransicionObra(desde, hacia);
  const cerrar = hacia === "CERRADA";

  const Icono = hacia === "PARALIZADA" ? Pause : cerrar ? Lock : Play;

  return (
    <button
      type="submit"
      disabled={pending}
      onClick={(e) => {
        // Cerrar es terminal: se confirma para que no se dispare por inercia.
        if (cerrar && !window.confirm("¿Cerrar la obra? Una vez cerrada no se puede reabrir.")) {
          e.preventDefault();
        }
      }}
      className="inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-medium disabled:opacity-60"
      style={{
        borderColor: cerrar ? "var(--color-peligro)" : "var(--borde)",
        color: cerrar ? "var(--color-peligro)" : undefined,
      }}
    >
      {pending ? (
        <LoaderCircle className="size-3.5 animate-spin" aria-hidden="true" />
      ) : (
        <Icono className="size-3.5" aria-hidden="true" />
      )}
      {etiqueta}
    </button>
  );
}
