import type { PuntoPpc, FilaPareto } from "@/lib/plan-semanal";
import { ETIQUETA_CNC } from "@/lib/plan-semanal";
import { fechaCorta } from "@/utils/fechas";

/**
 * Los dos KPI del Last Planner: la TENDENCIA del PPC por semana y el PARETO de
 * causas de no cumplimiento. SVG/HTML a mano, colores del tema (como el resto
 * de los graficos de la app).
 */

const ANCHO = 380;
const ALTO = 200;
const M = { arriba: 12, derecha: 14, abajo: 28, izquierda: 34 };

export function GraficosPpc({
  tendencia,
  pareto,
}: {
  tendencia: PuntoPpc[];
  pareto: FilaPareto[];
}) {
  if (tendencia.length === 0 && pareto.length === 0) return null;

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div
        className="rounded-xl border p-4"
        style={{ borderColor: "var(--borde)", backgroundColor: "var(--superficie)" }}
      >
        <h3 className="mb-2 text-sm font-semibold">PPC por semana</h3>
        <Tendencia puntos={tendencia} />
      </div>
      {/* `id` para poder enlazar aqui desde el panel «Que falta»: cuando el
          PPC baja, lo unico que dice POR QUE es este Pareto, y aterrizar en la
          lista de semanas obliga a bajar a buscarlo. `scroll-mt-20` deja sitio
          para la cabecera fija. */}
      <div
        id="pareto"
        className="scroll-mt-20 rounded-xl border p-4"
        style={{ borderColor: "var(--borde)", backgroundColor: "var(--superficie)" }}
      >
        <h3 className="mb-2 text-sm font-semibold">Causas de no cumplimiento</h3>
        <Pareto filas={pareto} />
      </div>
    </div>
  );
}

function Tendencia({ puntos }: { puntos: PuntoPpc[] }) {
  if (puntos.length === 0) {
    return <p className="text-sm opacity-60">Aún no hay semanas cerradas.</p>;
  }

  const anchoUtil = ANCHO - M.izquierda - M.derecha;
  const altoUtil = ALTO - M.arriba - M.abajo;
  const n = puntos.length;
  const x = (i: number) =>
    M.izquierda + (n === 1 ? anchoUtil / 2 : (i / (n - 1)) * anchoUtil);
  const y = (v: number) =>
    M.arriba + altoUtil - (Math.min(100, Math.max(0, v)) / 100) * altoUtil;

  const traza = puntos.map((p, i) => `${x(i).toFixed(1)},${y(p.ppc).toFixed(1)}`).join(" ");

  return (
    <svg
      viewBox={`0 0 ${ANCHO} ${ALTO}`}
      className="h-auto w-full"
      role="img"
      aria-label="PPC por semana"
      style={{ color: "var(--texto)" }}
    >
      {[0, 50, 100].map((v) => (
        <g key={v}>
          <line
            x1={M.izquierda}
            x2={ANCHO - M.derecha}
            y1={y(v)}
            y2={y(v)}
            stroke="var(--borde)"
            strokeWidth={1}
          />
          <text x={M.izquierda - 6} y={y(v) + 4} textAnchor="end" fontSize={10} fill="currentColor" opacity={0.6}>
            {v}%
          </text>
        </g>
      ))}
      {/* Referencia habitual de buen PPC: 80%. */}
      <line
        x1={M.izquierda}
        x2={ANCHO - M.derecha}
        y1={y(80)}
        y2={y(80)}
        stroke="var(--color-exito)"
        strokeWidth={1}
        strokeDasharray="4 3"
        opacity={0.6}
      />
      {n > 1 && (
        <polyline
          points={traza}
          fill="none"
          stroke="var(--color-marca-600)"
          strokeWidth={3}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      )}
      {puntos.map((p, i) => (
        <g key={i}>
          <circle cx={x(i)} cy={y(p.ppc)} r={4} fill="var(--color-marca-600)" />
          <text
            x={x(i)}
            y={ALTO - M.abajo + 14}
            textAnchor="middle"
            fontSize={9}
            fill="currentColor"
            opacity={0.6}
          >
            {fechaCorta(p.fecha)}
          </text>
        </g>
      ))}
    </svg>
  );
}

function Pareto({ filas }: { filas: FilaPareto[] }) {
  if (filas.length === 0) {
    return <p className="text-sm opacity-60">Sin causas registradas todavía.</p>;
  }

  const max = Math.max(...filas.map((f) => f.conteo));

  return (
    <ul className="space-y-2">
      {filas.map((f) => (
        <li key={f.causa} className="text-sm">
          <div className="flex items-center justify-between gap-2">
            <span>{ETIQUETA_CNC[f.causa]}</span>
            <span className="tabular-nums opacity-70">{f.conteo}</span>
          </div>
          <div
            className="mt-1 h-2 w-full overflow-hidden rounded-full"
            style={{ backgroundColor: "color-mix(in oklab, var(--borde) 70%, transparent)" }}
          >
            <div
              className="h-full rounded-full"
              style={{ width: `${(f.conteo / max) * 100}%`, backgroundColor: "var(--color-peligro)" }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}
