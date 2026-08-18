"use client";

import { useActionState } from "react";
import { LoaderCircle, Wand2, CheckCircle2, TriangleAlert } from "lucide-react";

import {
  accionAjustarMeses,
  type EstadoAjuste,
} from "@/app/(dashboard)/obras/[id]/meta/acciones";

/**
 * Corrige los meses desde el propio aviso.
 *
 * El aviso decia que cuatro lineas duraban mas que la obra y ahi acababa: para
 * arreglarlo habia que salir, abrir el Excel, corregir la columna y volver a
 * cargarlo entero. Un aviso que no se puede atender donde aparece acaba
 * siendo ruido.
 *
 * Solo se ofrece en BORRADOR. Una meta aprobada esta congelada, y el servicio
 * lo vuelve a comprobar: este boton no es la guarda, es el atajo.
 */
export function BotonAjustarMeses({
  obraId,
  metaId,
}: {
  obraId: string;
  metaId: string;
}) {
  const [estado, enviar, pendiente] = useActionState<EstadoAjuste, FormData>(
    accionAjustarMeses,
    {},
  );

  if (estado.hecho) {
    return (
      <p className="mt-2 flex items-start gap-2 text-sm font-medium">
        <CheckCircle2 className="mt-0.5 size-4 shrink-0" aria-hidden />
        {estado.hecho}
      </p>
    );
  }

  return (
    <form action={enviar} className="mt-3">
      <input type="hidden" name="metaId" value={metaId} />
      <input type="hidden" name="obraId" value={obraId} />

      {estado.error && (
        <p role="alert" className="mb-2 flex items-start gap-2 text-sm">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
          {estado.error}
        </p>
      )}

      <button
        type="submit"
        disabled={pendiente}
        className="inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm font-medium transition hover:bg-accent disabled:opacity-60"
      >
        {pendiente ? (
          <LoaderCircle className="size-4 animate-spin" aria-hidden />
        ) : (
          <Wand2 className="size-4" aria-hidden />
        )}
        Ajustar los meses al plazo de la obra
      </button>
    </form>
  );
}
