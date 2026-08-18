import Link from "next/link";
import { AlertTriangle, CheckCircle2, XCircle, Link2Off } from "lucide-react";

import type {
  KanbanDatos,
  TarjetaKanban,
  ColumnaKanban,
} from "@/services/kanban.service";
import { FLUJOS_RESTRICCION } from "@/lib/lookahead";
import { ETIQUETA_CNC } from "@/lib/plan-semanal";
import { fechaCorta } from "@/utils/fechas";

/**
 * El flujo del Last Planner en cinco columnas.
 *
 * DE LECTURA, y es una decision, no una carencia: cada movimiento entre
 * columnas es un acto con sus reglas y su permiso —analizar los flujos,
 * levantar una restriccion, comprometer al PTS, cerrar la semana— y todos
 * tienen ya su pantalla, con sus avisos y su registro. Un arrastrar y soltar
 * que dispare esas transiciones por detras las duplicaria en un sitio donde
 * no se ven las consecuencias. Aqui cada tarjeta ENLAZA a donde se actua.
 *
 * Ademas, el tablero semanal se hizo sin arrastrar y soltar a proposito, para
 * que funcione en el movil del residente. Este sigue el mismo criterio.
 */

const ETIQUETA_FLUJO = new Map(
  FLUJOS_RESTRICCION.map((f) => [f.tipo, f.etiqueta] as const),
);

/// El tono de cada columna. El rojo se reserva para lo que de verdad frena.
const TONO: Record<ColumnaKanban, string> = {
  SIN_ANALIZAR: "border-t-slate-400",
  CON_RESTRICCIONES: "border-t-rose-500",
  LISTA: "border-t-emerald-500",
  COMPROMETIDA: "border-t-sky-500",
  CERRADA: "border-t-slate-300",
};

export function TableroKanban({
  datos,
  obraId,
}: {
  datos: KanbanDatos;
  obraId: string;
}) {
  return (
    // Scroll horizontal en pantalla estrecha: cinco columnas no caben en un
    // movil, y apilarlas destruiria la lectura de izquierda a derecha, que es
    // justo lo que aporta el tablero.
    <div className="-mx-4 overflow-x-auto px-4 pb-2">
      <div className="grid min-w-[64rem] grid-cols-5 gap-3">
        {datos.columnas.map((col) => (
          <section
            key={col.clave}
            aria-labelledby={`col-${col.clave}`}
            className={`rounded-lg border border-t-4 bg-card p-3 ${TONO[col.clave]}`}
          >
            <h3 id={`col-${col.clave}`} className="text-sm font-semibold">
              {col.titulo}{" "}
              <span className="font-normal opacity-60">
                ({col.tarjetas.length})
              </span>
            </h3>
            <p className="mb-3 text-xs opacity-60">{col.pregunta}</p>

            {col.tarjetas.length === 0 ? (
              <p className="rounded border border-dashed p-3 text-xs opacity-50">
                Nada aquí.
              </p>
            ) : (
              <ul className="space-y-2">
                {col.tarjetas.map((t) => (
                  <li key={t.clave}>
                    <Tarjeta tarjeta={t} obraId={obraId} />
                  </li>
                ))}
              </ul>
            )}
          </section>
        ))}
      </div>
    </div>
  );
}

function Tarjeta({
  tarjeta: t,
  obraId,
}: {
  tarjeta: TarjetaKanban;
  obraId: string;
}) {
  /**
   * A donde se va a ACTUAR sobre esta tarjeta.
   *
   * Las del Lookahead abren su fila en la matriz —`?tarea=` es la misma
   * puerta que usan los codigos QR pegados en obra—; las comprometidas, su
   * semana del PTS. Una tarjeta que no lleva a ninguna parte obliga a buscar
   * la pantalla a mano, y entonces se deja de usar.
   */
  const destino = t.planId
    ? `/obras/${obraId}/plan-semanal/${t.planId}`
    : `/obras/${obraId}/lookahead?tarea=${t.uid}`;

  return (
    <Link
      href={destino}
      className="block rounded-md border bg-background p-2.5 text-xs transition hover:bg-accent"
    >
      <p className="font-medium">{t.nombre}</p>

      {(t.faseBloque || t.zona || t.codigo) && (
        <p className="mt-0.5 truncate opacity-60">
          {[t.codigo, t.faseBloque, t.zona].filter(Boolean).join(" · ")}
        </p>
      )}

      {t.proveedor && <p className="mt-1 opacity-80">{t.proveedor}</p>}

      {/* Cantidad ejecutada contra la planificada: el doble registro del PTS.
          Solo si hay plan, porque sin el la fraccion no significa nada. */}
      {t.cantidadPlan && (
        <p className="mt-1 opacity-80">
          {t.cantidadEjec ?? "0"} / {t.cantidadPlan} {t.unidad ?? ""}
        </p>
      )}

      {t.inicio && t.fin && (
        <p className="mt-1 opacity-60">
          {fechaCorta(t.inicio)} – {fechaCorta(t.fin)}
        </p>
      )}

      {t.semana !== null && (
        <p className="mt-1 opacity-60">Semana {t.semana}</p>
      )}

      {/* Etiquetas de bloqueo: una por flujo abierto, y en rojo la que ya
          incumplio su promesa de liberacion. */}
      {t.bloqueos.length > 0 && (
        <ul className="mt-2 flex flex-wrap gap-1">
          {t.bloqueos.map((b) => (
            <li
              key={b.tipo}
              className={`flex items-center gap-1 rounded px-1.5 py-0.5 ${
                b.vencida
                  ? "bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-200"
                  : "bg-muted"
              }`}
            >
              {b.vencida && <AlertTriangle className="size-3" aria-hidden />}
              {ETIQUETA_FLUJO.get(b.tipo) ?? b.tipo}
              {b.fechaCompromiso && ` · ${fechaCorta(b.fechaCompromiso)}`}
            </li>
          ))}
        </ul>
      )}

      {/* El resultado, solo en la ultima columna. `cumplido` es null mientras
          la semana no se cierra, y eso NO es un incumplimiento. */}
      {t.cumplido !== null && (
        <p
          className={`mt-2 flex items-center gap-1 font-medium ${
            t.cumplido
              ? "text-emerald-700 dark:text-emerald-400"
              : "text-rose-700 dark:text-rose-400"
          }`}
        >
          {t.cumplido ? (
            <CheckCircle2 className="size-3.5" aria-hidden />
          ) : (
            <XCircle className="size-3.5" aria-hidden />
          )}
          {t.cumplido ? "Cumplida" : (t.causa ? ETIQUETA_CNC[t.causa] : "No cumplida")}
        </p>
      )}

      {/* Un compromiso que no nacio del Lookahead: se prometio sin pasar por
          el analisis de restricciones. No es un error —a veces hay que
          hacerlo— pero conviene verlo.

          NO decir aqui «sin analizar»: es el nombre de la PRIMERA COLUMNA y
          significa otra cosa (una tarea que nadie ha mirado). Con ese texto,
          seis tarjetas de la derecha parecian estar en la columna de la
          izquierda. Solo se vio abriendo la pantalla. */}
      {t.libre && (
        <p className="mt-1.5 flex items-center gap-1 opacity-60">
          <Link2Off className="size-3" aria-hidden />
          No vino del Lookahead
        </p>
      )}
    </Link>
  );
}
