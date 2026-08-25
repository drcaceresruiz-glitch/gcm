"use client";

import { useActionState, useOptimistic } from "react";
import { LoaderCircle, Play, Undo2 } from "lucide-react";

import {
  accionMarcarEnEjecucion,
  type EstadoMarcha,
} from "@/app/(dashboard)/obras/[id]/kanban/acciones";
import { useMotivoSinEscritura } from "@/components/obras/EscrituraDeLaObra";

/**
 * Mover la tarjeta entre «Comprometida» y «En ejecución».
 *
 * Va DENTRO de la tarjeta y no en un menu aparte: es la unica accion del
 * tablero, se usa a diario y desde el movil, y esconderla detras de un clic
 * mas la convertiria en algo que nadie marca —y entonces la columna estaria
 * siempre vacia y mentiria—.
 *
 * El texto cambia AL TOCAR, no cuando el servidor responde
 * (`useOptimistic`): en una obra con señal mala, esperar el viaje completo
 * —guardar y volver a traer el tablero entero via `revalidatePath`— para ver
 * el propio clic reflejado se siente como que no funciono, e invita a tocar
 * dos veces. Si el servidor rechaza el cambio, `useOptimistic` deshace sola
 * el texto en cuanto la transicion termina y el error queda a la vista.
 *
 * `stopPropagation` porque la tarjeta entera es un enlace: sin eso, marcar
 * el arranque te sacaba de la pantalla.
 */
export function BotonEnEjecucion({
  obraId,
  compromisoId,
  enMarcha,
}: {
  obraId: string;
  compromisoId: string;
  enMarcha: boolean;
}) {
  const [estado, enviarBase, pendiente] = useActionState<EstadoMarcha, FormData>(
    accionMarcarEnEjecucion,
    {},
  );
  const [enMarchaOptimista, marcarOptimista] = useOptimistic(
    enMarcha,
    (_actual, siguiente: boolean) => siguiente,
  );

  /*
   * En una obra que no admite cambios no se ofrece: `marcarEnEjecucion` lo
   * rechaza, y un boton que siempre falla invita a probar. El motivo se
   * explica una vez por pantalla, no en cada control.
   * Mismas opciones que el servidor: sin excepciones.
   * Va DESPUES del ultimo hook: un `return` por delante de una llamada a
   * un hook cambia el orden entre renders y React lo prohibe.
   */
  const sinEscritura = useMotivoSinEscritura() !== null;
  if (sinEscritura) return null;

  function enviar(datos: FormData) {
    marcarOptimista(!enMarcha);
    enviarBase(datos);
  }

  return (
    <form
      action={enviar}
      onClick={(e) => e.stopPropagation()}
      className="mt-2"
    >
      <input type="hidden" name="compromisoId" value={compromisoId} />
      <input type="hidden" name="obraId" value={obraId} />
      <input type="hidden" name="enMarcha" value={enMarcha ? "no" : "si"} />

      {estado.error && (
        <p role="alert" className="mb-1 opacity-80">
          {estado.error}
        </p>
      )}

      <button
        type="submit"
        disabled={pendiente}
        className="inline-flex items-center gap-1.5 rounded border px-2 py-1 transition hover:bg-accent disabled:opacity-60"
      >
        {pendiente ? (
          <LoaderCircle className="size-3 animate-spin" aria-hidden />
        ) : enMarchaOptimista ? (
          <Undo2 className="size-3" aria-hidden />
        ) : (
          <Play className="size-3" aria-hidden />
        )}
        {enMarchaOptimista ? "Aún no empezó" : "Empezó en obra"}
      </button>
    </form>
  );
}
