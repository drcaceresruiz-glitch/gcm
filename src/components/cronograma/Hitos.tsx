import { fechaCorta } from "@/utils/fechas";
import type { FilaHito } from "@/lib/hitos";

/**
 * Los hitos del cronograma y su desvio contra la linea base.
 *
 * Los hitos ya vienen marcados en cada tarea (`esHito`). Aqui solo se pintan:
 * su fecha vigente, la de la base y cuantos dias se ha movido cada uno. El
 * cruce y el estado se calculan en `@/lib/hitos` (logica pura, probada).
 *
 * Sin base fijada no hay columna de desvio: no habria contra que medir, y una
 * columna de guiones solo estorbaria.
 */
export function Hitos({ filas, hayBase }: { filas: FilaHito[]; hayBase: boolean }) {
  if (filas.length === 0) {
    return (
      <p className="text-sm opacity-70">
        El cronograma no trae hitos marcados. En MS Project, marca las tareas
        clave como hito (Milestone) y vuelve a exportarlo.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left" style={{ borderColor: "var(--borde)" }}>
            <th className="py-2 pr-3 font-medium opacity-70">Hito</th>
            <th className="py-2 px-3 font-medium opacity-70">Fecha</th>
            {hayBase && <th className="py-2 px-3 font-medium opacity-70">Base</th>}
            {hayBase && <th className="py-2 px-3 font-medium opacity-70">Desvio</th>}
            <th className="py-2 pl-3 font-medium opacity-70">Estado</th>
          </tr>
        </thead>
        <tbody>
          {filas.map((f) => (
            <tr key={f.uid} className="border-b" style={{ borderColor: "var(--borde)" }}>
              <td className="py-2 pr-3">{f.nombre}</td>
              <td className="py-2 px-3 whitespace-nowrap tabular-nums">
                {fechaCorta(f.finVigente)}
              </td>
              {hayBase && (
                <td className="py-2 px-3 whitespace-nowrap tabular-nums opacity-70">
                  {f.finBase ? fechaCorta(f.finBase) : "—"}
                </td>
              )}
              {hayBase && (
                <td className="py-2 px-3 whitespace-nowrap tabular-nums">
                  <Desvio dias={f.desviacionDias} />
                </td>
              )}
              <td className="py-2 pl-3">
                <Estado estado={f.estado} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** El desvio en dias: rojo si se corrio a mas tarde, verde si se adelanto. */
function Desvio({ dias }: { dias: number | null }) {
  if (dias === null) return <span className="opacity-40">—</span>;
  if (dias === 0) return <span className="opacity-70">0 d</span>;

  const color = dias > 0 ? "var(--color-peligro)" : "var(--color-exito)";
  return (
    <span style={{ color }}>
      {dias > 0 ? "+" : ""}
      {dias} d
    </span>
  );
}

function Estado({ estado }: { estado: FilaHito["estado"] }) {
  const mapa = {
    cumplido: { txt: "Cumplido", color: "var(--color-exito)" },
    en_plazo: { txt: "En plazo", color: "var(--texto)" },
    vencido: { txt: "Vencido", color: "var(--color-peligro)" },
  } as const;

  const { txt, color } = mapa[estado];

  return (
    <span
      className="inline-block rounded-full px-2 py-0.5 text-xs font-medium"
      style={{
        color,
        backgroundColor: `color-mix(in oklab, ${color} 15%, transparent)`,
      }}
    >
      {txt}
    </span>
  );
}
