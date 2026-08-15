import { CalendarCheck, PackageCheck } from "lucide-react";

import type { Inventario, TasaLiberacion } from "@/lib/indicadores-lps";

/**
 * Los dos indicadores del Lookahead que la reunion semanal necesita mirar
 * ANTES de comprometer nada.
 *
 * Van juntos porque contestan la misma pregunta desde dos lados: si el trabajo
 * llega listo. El SWI dice cuanto hay listo sin prometer —el plan B cuando
 * algo se cae—; la tasa dice si las promesas de liberar se cumplen, que es lo
 * que hace que mañana haya SWI.
 *
 * Los dos pueden no tener valor, y entonces NO se pinta un cero: se dice que
 * no se puede saber. Un cero en estos dos sitios asusta sin motivo y hace que
 * la gente deje de mirarlos.
 */

function Tarjeta({
  icono: Icono,
  titulo,
  valor,
  unidad,
  pie,
  aviso,
}: {
  icono: typeof PackageCheck;
  titulo: string;
  valor: string;
  unidad?: string;
  pie: string;
  aviso?: string;
}) {
  return (
    <div
      className="flex-1 rounded-xl border p-4"
      style={{ borderColor: "var(--borde)" }}
    >
      <p className="flex items-center gap-2 text-xs font-medium tracking-wide uppercase opacity-70">
        <Icono className="size-3.5" aria-hidden="true" />
        {titulo}
      </p>
      <p className="mt-2 text-2xl font-semibold tabular-nums">
        {valor}
        {unidad && <span className="ml-1 text-base font-normal opacity-70">{unidad}</span>}
      </p>
      <p className="mt-1 text-xs text-pretty opacity-70">{pie}</p>
      {aviso && (
        <p className="mt-2 text-xs text-pretty" style={{ color: "var(--color-alerta)" }}>
          {aviso}
        </p>
      )}
    </div>
  );
}

export function PanelIndicadores({
  inventario,
  tasa,
}: {
  inventario: Inventario;
  tasa: TasaLiberacion | null;
}) {
  return (
    <section className="flex flex-col gap-4 sm:flex-row">
      <Tarjeta
        icono={PackageCheck}
        titulo="Trabajo ejecutable (SWI)"
        valor={String(inventario.disponibles)}
        unidad={inventario.disponibles === 1 ? "tarea" : "tareas"}
        pie={
          inventario.listas === 0
            ? `Ninguna tarea lista todavía, de ${inventario.total} en la ventana.`
            : `Listas y sin comprometer, de ${inventario.listas} listas en la ventana.`
        }
        aviso={
          inventario.listas > 0 && inventario.disponibles === 0
            ? "Sin colchón: si mañana se cae una tarea no hay con qué sustituirla."
            : undefined
        }
      />

      <Tarjeta
        icono={CalendarCheck}
        titulo="Liberadas a tiempo"
        valor={tasa?.porcentaje === null || !tasa ? "—" : String(tasa.porcentaje)}
        unidad={tasa?.porcentaje === null || !tasa ? undefined : "%"}
        pie={
          !tasa || tasa.porcentaje === null
            ? "Todavía no hay ninguna promesa cuya fecha haya llegado."
            : `${tasa.aTiempo} a tiempo de ${tasa.medidas} promesas cumplidas su plazo` +
              (tasa.enPlazo > 0 ? `; ${tasa.enPlazo} aún en plazo.` : ".")
        }
        aviso={
          // El contador que impide leer un 100 % sobre cuatro promesas como si
          // fuera un 100 % de verdad.
          tasa && tasa.sinPromesa > tasa.medidas
            ? `${tasa.sinPromesa} restricciones sin fecha prometida: el porcentaje se apoya en pocas.`
            : undefined
        }
      />
    </section>
  );
}
