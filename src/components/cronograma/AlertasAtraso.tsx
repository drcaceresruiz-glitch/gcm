import { AlertTriangle, CheckCircle2, Flag, CalendarX } from "lucide-react";
import type { AlertaAtraso, Severidad } from "@/lib/control-avance";
import { Chip } from "@/components/ui/Chip";

/**
 * Porcentaje sin ceros de relleno: "95%" y no "95.00%".
 *
 * En un listado de avisos, dos decimales que casi siempre son cero solo
 * alargan la linea y hacen mas dificil comparar de un vistazo.
 */
function pct(valor: string): string {
  const n = Number(valor);
  if (!Number.isFinite(n)) return "—";
  return `${Number.isInteger(n) ? n : n.toFixed(1)}%`;
}

/**
 * Las partidas que estan frenando la obra.
 *
 * Solo hojas, y ordenadas por lo que importan y no por el tamano del
 * porcentaje: una partida critica atrasada cinco puntos empuja la fecha de
 * termino de toda la obra, y una de dos dias al 50% no.
 *
 * Se muestran las primeras y se cuenta el resto. Un listado de sesenta avisos
 * ensena a ignorarlo, y entonces se pierde tambien el que importaba.
 */

const VISIBLES = 12;

const TONO: Record<Severidad, "peligro" | "alerta" | "neutro"> = {
  alta: "peligro",
  media: "alerta",
  baja: "neutro",
};

/**
 * NUNCA «critica» para la severidad.
 *
 * En obra, «critica» significa «en la ruta critica», que es otra cosa y ya
 * tiene su propia marca en cada fila. Usar la misma palabra para el nivel de
 * aviso hacia leer «esta en la ruta critica» donde solo ponia «urgente», y de
 * hecho salia en dos partidas que no lo estaban.
 */
const ETIQUETA: Record<Severidad, string> = {
  alta: "Urgente",
  media: "Atencion",
  baja: "Leve",
};

export function AlertasAtraso({ alertas }: { alertas: AlertaAtraso[] }) {
  if (alertas.length === 0) {
    return (
      <p className="flex items-center gap-2 text-sm">
        <CheckCircle2
          className="size-4 shrink-0"
          style={{ color: "var(--color-exito)" }}
          aria-hidden="true"
        />
        Ninguna partida va por detras del plan.
      </p>
    );
  }

  const visibles = alertas.slice(0, VISIBLES);
  const altas = alertas.filter((a) => a.severidad === "alta").length;

  return (
    <div className="space-y-3">
      <p className="text-sm">
        <strong>{alertas.length}</strong> partida(s) por detras del plan
        {altas > 0 && (
          <>
            ,{" "}
            <strong style={{ color: "var(--color-peligro)" }}>
              {altas} urgente{altas === 1 ? "" : "s"}
            </strong>
          </>
        )}
        . Cada una dice por que.
      </p>

      <ul className="space-y-2">
        {visibles.map((a) => (
          <li
            key={a.uid}
            className="flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-lg border px-3 py-2 text-sm"
            style={{
              borderColor:
                a.severidad === "alta" ? "var(--color-peligro)" : "var(--borde)",
              backgroundColor:
                a.severidad === "alta"
                  ? "color-mix(in oklab, var(--color-peligro) 7%, transparent)"
                  : undefined,
            }}
          >
            <Chip tono={TONO[a.severidad]} icono={AlertTriangle}>
              {ETIQUETA[a.severidad]}
            </Chip>

            <span className="min-w-0 flex-1">
              {a.codigo && (
                <span className="mr-2 font-mono text-xs opacity-60">{a.codigo}</span>
              )}
              {a.nombre}
            </span>

            {a.esCritico && (
              <span
                className="inline-flex items-center gap-1 text-xs"
                style={{ color: "var(--color-peligro)" }}
              >
                <Flag className="size-3.5" aria-hidden="true" />
                Ruta critica
              </span>
            )}

            {a.vencida && (
              <span
                className="inline-flex items-center gap-1 text-xs"
                style={{ color: "var(--color-peligro)" }}
              >
                <CalendarX className="size-3.5" aria-hidden="true" />
                Fecha vencida
              </span>
            )}

            <span className="tabular-nums whitespace-nowrap">
              <span className="opacity-60">va</span>{" "}
              <strong>{pct(a.real)}</strong>{" "}
              <span className="opacity-60">de</span> {pct(a.planeado)}
            </span>

            <span
              className="font-semibold tabular-nums whitespace-nowrap"
              style={{ color: "var(--color-peligro)" }}
              title="Trabajo pendiente para ponerse al dia, en dias de esta partida"
            >
              {a.diasAtraso} d
            </span>

            {a.motivo && (
              <span className="w-full text-xs opacity-70">{a.motivo}.</span>
            )}
          </li>
        ))}
      </ul>

      {alertas.length > visibles.length && (
        <p className="text-xs opacity-60">
          Y {alertas.length - visibles.length} mas, con menos peso. Estan todas
          en la tabla de tareas, con su desfase.
        </p>
      )}

      <p className="text-xs opacity-60">
        Los dias son lo que falta por ejecutar de cada partida traducido a su
        propia duracion: asi un 10% de una partida de veinte dias pesa mas que
        un 40% de una de dos, que es como se decide a que atender primero.
      </p>
    </div>
  );
}
