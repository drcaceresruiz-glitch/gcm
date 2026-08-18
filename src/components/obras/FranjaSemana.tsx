import Link from "next/link";
import { CalendarClock, AlertTriangle } from "lucide-react";

import type { SemanaDeObra } from "@/services/plan-semanal.service";
import { bandaDePpc } from "@/lib/plan-semanal";
import { fechaCorta } from "@/utils/fechas";

/**
 * «Esta semana»: el estado del ritual semanal en todas las obras a la vez.
 *
 * El panel ya decia como va el DINERO y el PLAZO de cada obra, pero no que
 * toca hacer esta semana: para saber si una semana quedo sin cerrar habia que
 * entrar obra por obra. Es de empresa por la misma razon que los avisos —el
 * plan que se te pasa es el de la obra que no estas mirando—.
 *
 * Va en FRANJA a lo ancho y no en un carril lateral a proposito. La rejilla
 * del panel es `[210px_minmax(0,1fr)]` y el contenido central son las tarjetas
 * de obra a tres columnas: un tercer carril las estrecharia para repetir
 * ademas cosas que ya estan (las alertas viven en `ResumenEmpresaPanel`, y los
 * atajos son el propio `MenuObra` de la izquierda).
 *
 * NO pinta un PPC de la empresa. Cada obra lleva el suyo: promediar una obra
 * de tres compromisos con otra de cuarenta trata igual lo que no lo es.
 */

const TONO_PPC: Record<string, string> = {
  bueno: "text-emerald-700 dark:text-emerald-400",
  flojo: "text-amber-700 dark:text-amber-400",
  malo: "text-rose-700 dark:text-rose-400",
};

export function FranjaSemana({ semanas }: { semanas: SemanaDeObra[] }) {
  // Una constructora que todavia no usa el Last Planner no tiene ningun plan
  // abierto: la franja desaparece en vez de enseñar un vacio que no explica
  // nada. Es la misma regla que el resumen con la empresa vacia.
  if (semanas.length === 0) return null;

  return (
    <section
      aria-labelledby="franja-semana"
      className="rounded-lg border bg-card p-4"
    >
      <h2
        id="franja-semana"
        className="mb-3 flex items-center gap-2 text-sm font-semibold"
      >
        <CalendarClock className="size-4 opacity-70" aria-hidden />
        Esta semana
      </h2>

      <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
        {semanas.map((s) => (
          <li key={s.planId}>
            <Link
              href={`/obras/${s.obraId}/plan-semanal/${s.planId}`}
              className="flex h-full flex-col gap-1 rounded-md border p-3 text-sm transition hover:bg-accent"
            >
              <span className="flex items-center justify-between gap-2">
                <span className="truncate font-medium">{s.obra}</span>
                <span className="shrink-0 opacity-70">Semana {s.numero}</span>
              </span>

              <span className="flex items-center gap-1.5 text-xs opacity-80">
                {s.vencida && (
                  <AlertTriangle
                    className="size-3.5 shrink-0 text-amber-600 dark:text-amber-400"
                    aria-hidden
                  />
                )}
                {/* El corte es el dato que ordena el ritual: si ya paso, la
                    semana habia que haberla cerrado. */}
                <span>
                  {s.vencida ? "Corte vencido el " : "Corta el "}
                  {fechaCorta(s.fechaCorte)}
                </span>
              </span>

              <span className="mt-auto flex items-center justify-between gap-2 pt-1 text-xs">
                <span className="opacity-80">
                  {/* Sin compromisos no se dice «0 sin evaluar», que suena a
                      trabajo hecho: es que la semana esta vacia. */}
                  {s.total === 0
                    ? "Sin compromisos"
                    : `${s.sinEvaluar} sin evaluar de ${s.total}`}
                </span>

                {/* `null` es «no hay semana cerrada con que medir». Escribir
                    un 0 % ahi diria que se incumple todo. */}
                {s.ppcAnterior === null ? (
                  <span className="opacity-60">PPC —</span>
                ) : (
                  <span className={TONO_PPC[bandaDePpc(s.ppcAnterior)]}>
                    PPC {Math.round(s.ppcAnterior)}%
                  </span>
                )}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
