"use client";

import { useActionState } from "react";
import { LoaderCircle, TriangleAlert } from "lucide-react";

import {
  accionDecidirGastosGenerales,
  type EstadoCriterio,
} from "@/app/(dashboard)/obras/[id]/criterio/acciones";

/**
 * Los dos caminos, cada uno con su consecuencia escrita.
 *
 * Son dos botones grandes y no un interruptor con una etiqueta: un `switch`
 * se pulsa sin leer, y esto decide como se lee el margen de la obra entera.
 * Cada opcion dice QUE PASA si la eliges, no solo lo que activa.
 */
export function ElegirCriterio({
  obraId,
  actual,
  puedeEditar,
}: {
  obraId: string;
  /// null = todavia sin decidir.
  actual: boolean | null;
  puedeEditar: boolean;
}) {
  const [estado, enviar, pendiente] = useActionState<EstadoCriterio, FormData>(
    accionDecidirGastosGenerales,
    {},
  );

  if (!puedeEditar) {
    return (
      <p className="rounded-lg border border-dashed px-4 py-3 text-sm opacity-70">
        No tienes permiso para cambiar el criterio de la obra. Pídeselo a quien
        administre la constructora.
      </p>
    );
  }

  return (
    <form action={enviar} className="space-y-3">
      <input type="hidden" name="obraId" value={obraId} />

      {estado.error && (
        <p
          role="alert"
          className="flex items-start gap-2 rounded-lg px-4 py-3 text-sm"
          style={{
            backgroundColor:
              "color-mix(in oklab, var(--color-peligro) 15%, transparent)",
          }}
        >
          <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
          {estado.error}
        </p>
      )}

      <Opcion
        valor="no"
        titulo="NO entran en la bolsa"
        seleccionada={actual === false}
        pendiente={pendiente}
        detalle="La bolsa operativa es sólo la de producción: lo que se gana ejecutando por debajo de la meta. Los gastos generales se siguen cargando y se ven aparte, con su aviso de sobrecosto si la obra se atrasa, pero no son dinero que la obra pueda gastar."
      />

      <Opcion
        valor="si"
        titulo="SÍ entran en la bolsa"
        seleccionada={actual === true}
        pendiente={pendiente}
        detalle="La bolsa suma producción y plazo: lo ahorrado en gastos generales cuenta como margen disponible. Elige esto sólo si en tu contrato la obra gestiona también esa partida."
      />
    </form>
  );
}

function Opcion({
  valor,
  titulo,
  detalle,
  seleccionada,
  pendiente,
}: {
  valor: "si" | "no";
  titulo: string;
  detalle: string;
  seleccionada: boolean;
  pendiente: boolean;
}) {
  return (
    <button
      type="submit"
      name="incluir"
      value={valor}
      disabled={pendiente}
      className="flex w-full items-start gap-3 rounded-lg border p-4 text-left transition hover:bg-accent disabled:opacity-60"
      style={
        seleccionada
          ? { borderColor: "var(--color-marca-600)", borderWidth: 2 }
          : undefined
      }
    >
      {pendiente ? (
        <LoaderCircle className="mt-0.5 size-4 shrink-0 animate-spin" aria-hidden />
      ) : null}
      <span>
        <span className="block font-medium">
          {titulo}
          {seleccionada && (
            <span className="ml-2 text-xs font-normal opacity-60">
              (el actual)
            </span>
          )}
        </span>
        <span className="mt-0.5 block text-sm opacity-70">{detalle}</span>
      </span>
    </button>
  );
}
