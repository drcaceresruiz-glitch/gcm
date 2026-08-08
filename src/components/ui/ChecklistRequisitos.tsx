"use client";

import { CheckCircle2, Circle } from "lucide-react";

/**
 * Semaforo de requisitos minimos para poder crear algo.
 *
 * Se pinta al lado del formulario y se actualiza en vivo: cada requisito pasa
 * de gris a verde en cuanto se cumple, y arriba se ve cuantos van. La idea es
 * que quien crea sepa que le falta sin tener que enviar y leer un error, y que
 * el boton de crear solo se habilite cuando todos esten en verde.
 *
 * Reutilizable: recibe la lista ya evaluada. Quien lo usa decide QUE es un
 * requisito —reusando las mismas validaciones puras que el servidor, para que
 * el semaforo no diga verde donde el servidor diria que no—.
 */

export interface Requisito {
  etiqueta: string;
  cumplido: boolean;
}

/** Util para el formulario: ¿estan todos en verde? */
export function todosCumplidos(requisitos: Requisito[]): boolean {
  return requisitos.every((r) => r.cumplido);
}

export function ChecklistRequisitos({
  requisitos,
  titulo = "Para poder crear",
}: {
  requisitos: Requisito[];
  titulo?: string;
}) {
  const cumplidos = requisitos.filter((r) => r.cumplido).length;
  const total = requisitos.length;
  const completo = cumplidos === total;

  return (
    <div
      className="elevacion-1 rounded-xl border p-4"
      style={{
        // El marco se pone verde cuando todo esta listo: un cambio de estado
        // que se ve de reojo, sin tener que leer el contador.
        borderColor: completo ? "var(--color-exito)" : "var(--borde)",
        backgroundColor: "var(--superficie)",
      }}
    >
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-semibold">{titulo}</p>
        <span
          className="rounded-full px-2 py-0.5 text-xs font-medium tabular-nums"
          style={{
            backgroundColor: completo
              ? "color-mix(in oklab, var(--color-exito) 18%, transparent)"
              : "color-mix(in oklab, var(--borde) 40%, transparent)",
            color: completo ? "var(--color-exito)" : "var(--texto)",
          }}
        >
          {cumplidos}/{total}
        </span>
      </div>

      <ul className="mt-3 space-y-2">
        {requisitos.map((r) => (
          <li key={r.etiqueta} className="flex items-start gap-2 text-sm">
            {r.cumplido ? (
              <CheckCircle2
                className="mt-0.5 size-4 shrink-0"
                style={{ color: "var(--color-exito)" }}
                aria-hidden="true"
              />
            ) : (
              <Circle
                className="mt-0.5 size-4 shrink-0 opacity-40"
                aria-hidden="true"
              />
            )}
            <span className={r.cumplido ? "" : "opacity-70"}>{r.etiqueta}</span>
          </li>
        ))}
      </ul>

      <p className="mt-3 border-t pt-2 text-xs opacity-60" style={{ borderColor: "var(--borde)" }}>
        {completo
          ? "Listo para crear. El resto de datos se puede completar despues."
          : "Completa lo que falta para habilitar el boton de crear."}
      </p>
    </div>
  );
}
