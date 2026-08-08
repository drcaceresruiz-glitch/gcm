import type { PuntoCurva } from "@/lib/curva-s";
import { fechaEje, fechaLarga } from "@/utils/fechas";
import { decimal } from "@/utils/formato";

/**
 * La curva de avance, dibujada a mano en SVG.
 *
 * Sin libreria de graficos, y a proposito. Los colores salen de las variables
 * del tema, asi que el grafico repinta solo al cambiar de tema o de paleta;
 * una libreria traeria su propio sistema de color y habria que reconciliarlo.
 * Ademas se renderiza en el servidor, sin JavaScript en el cliente.
 *
 * Las dos lineas se calculan igual —ponderadas por duracion, en
 * `lib/curva-s`—, de modo que la distancia entre ellas es la unica lectura
 * que importa: cuanto se va por detras del plan.
 */

const ANCHO = 720;
const ALTO = 260;
const MARGEN = { arriba: 12, derecha: 16, abajo: 28, izquierda: 38 };

export function CurvaS({ serie }: { serie: PuntoCurva[] }) {
  if (serie.length === 0) return null;

  const anchoUtil = ANCHO - MARGEN.izquierda - MARGEN.derecha;
  const altoUtil = ALTO - MARGEN.arriba - MARGEN.abajo;

  // Con un solo corte no hay recta que trazar: el punto se pone en el centro
  // para que no quede pegado al eje.
  const x = (i: number) =>
    serie.length === 1
      ? MARGEN.izquierda + anchoUtil / 2
      : MARGEN.izquierda + (i / (serie.length - 1)) * anchoUtil;

  const y = (valor: string) =>
    MARGEN.arriba + altoUtil - (Math.min(100, Math.max(0, Number(valor) || 0)) / 100) * altoUtil;

  const linea = (campo: "planeado" | "real") =>
    serie.map((p, i) => `${x(i)},${y(p[campo])}`).join(" ");

  const ultimo = serie[serie.length - 1]!;
  const atrasado = Number(ultimo.desfase) < 0;

  return (
    <figure className="m-0">
      <svg
        viewBox={`0 0 ${ANCHO} ${ALTO}`}
        className="h-auto w-full"
        role="img"
        aria-label={`Curva de avance. Al corte del ${fechaLarga(ultimo.fecha)}, planeado ${decimal(ultimo.planeado)}% y real ${decimal(ultimo.real)}%.`}
      >
        {/* Rejilla cada 25%. Es la referencia que permite leer una altura sin
            perseguir el eje con el dedo. */}
        {[0, 25, 50, 75, 100].map((v) => (
          <g key={v}>
            <line
              x1={MARGEN.izquierda}
              x2={ANCHO - MARGEN.derecha}
              y1={y(String(v))}
              y2={y(String(v))}
              stroke="var(--borde)"
              strokeWidth={1}
            />
            <text
              x={MARGEN.izquierda - 6}
              y={y(String(v)) + 3}
              textAnchor="end"
              fontSize={10}
              fill="currentColor"
              opacity={0.6}
            >
              {v}%
            </text>
          </g>
        ))}

        {/* El area entre las dos lineas: es el atraso, y verlo como superficie
            dice mas que comparar dos alturas. */}
        <polygon
          points={`${linea("planeado")} ${[...serie].reverse().map((p, i) => `${x(serie.length - 1 - i)},${y(p.real)}`).join(" ")}`}
          fill={atrasado ? "var(--color-peligro)" : "var(--color-exito)"}
          opacity={0.12}
        />

        <polyline
          points={linea("planeado")}
          fill="none"
          stroke="var(--texto)"
          strokeWidth={2}
          strokeDasharray="5 4"
          opacity={0.75}
        />
        <polyline
          points={linea("real")}
          fill="none"
          stroke="var(--color-marca-600)"
          strokeWidth={2.5}
        />

        {serie.map((p, i) => (
          <g key={p.version}>
            <circle cx={x(i)} cy={y(p.real)} r={3.5} fill="var(--color-marca-600)" />
            <text
              x={x(i)}
              y={ALTO - 8}
              textAnchor="middle"
              fontSize={10}
              fill="currentColor"
              opacity={0.6}
            >
              {fechaEje(p.fecha)}
            </text>
          </g>
        ))}
      </svg>

      <figcaption className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
        <span className="inline-flex items-center gap-1.5">
          <span
            className="inline-block h-0.5 w-5"
            style={{ backgroundColor: "var(--color-marca-600)" }}
            aria-hidden="true"
          />
          Real {decimal(ultimo.real)}%
        </span>
        <span className="inline-flex items-center gap-1.5 opacity-75">
          <span
            className="inline-block h-0.5 w-5"
            style={{
              backgroundImage:
                "repeating-linear-gradient(to right, var(--texto) 0 5px, transparent 5px 9px)",
            }}
            aria-hidden="true"
          />
          Planeado {decimal(ultimo.planeado)}%
        </span>
        <span
          className="font-medium tabular-nums"
          style={{ color: atrasado ? "var(--color-peligro)" : "var(--color-exito)" }}
        >
          {Number(ultimo.desfase) > 0 ? "+" : ""}
          {decimal(ultimo.desfase)}% respecto al plan
        </span>
      </figcaption>
    </figure>
  );
}
