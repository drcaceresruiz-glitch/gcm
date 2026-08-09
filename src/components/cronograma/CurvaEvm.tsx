import type { PuntoEvm } from "@/services/evm.service";
import { fechaCorta } from "@/utils/fechas";

/**
 * La curva del valor ganado en DINERO: las tres lineas del EVM sobre un mismo
 * eje de soles.
 *
 * La curva de avance ya cuenta plan y real en PORCENTAJE. Esta cuenta lo que
 * aquella no puede: el COSTO. Poner AC (lo comprometido) junto a EV (lo ganado)
 * en la misma escala es lo que hace ver de un vistazo si se esta gastando por
 * encima de lo producido —la distancia vertical entre las dos lineas es la
 * variacion de costo—.
 *
 * - PV (plan): de puntos, de principio a fin. Cuanto deberias llevar ganado.
 * - EV (ganado): continua, hasta el corte. Presupuesto por el avance real.
 * - AC (costo): escalonada, hasta el corte. Comprometido acumulado por fecha de
 *   orden; es un escalon porque el gasto salta con cada orden aprobada. Solo
 *   con permiso de ordenes.
 *
 * Estatica a proposito: sin cursor ni rangos. Para leer fecha a fecha esta la
 * curva de avance; esta es la foto del costo contra lo ganado.
 */

const ANCHO = 760;
const ALTO = 300;
const MARGEN = { arriba: 16, derecha: 20, abajo: 34, izquierda: 64 };
const DIA_MS = 86400000;

export function CurvaEvm({
  planPv,
  cortesEv,
  costoAc,
  bac,
  inicio,
  fin,
  fechaCorte,
  verCosto,
}: {
  planPv: PuntoEvm[];
  cortesEv: PuntoEvm[];
  costoAc: PuntoEvm[];
  bac: number;
  inicio: Date | null;
  fin: Date | null;
  fechaCorte: Date;
  verCosto: boolean;
}) {
  if (planPv.length < 2 || !inicio || !fin) return null;

  const anchoUtil = ANCHO - MARGEN.izquierda - MARGEN.derecha;
  const altoUtil = ALTO - MARGEN.arriba - MARGEN.abajo;

  const t0 = inicio.getTime();
  const span = Math.max(DIA_MS, fin.getTime() - t0);

  // El techo del eje es el presupuesto —ahi acaba el plan—, salvo que el
  // comprometido ya lo haya rebasado: entonces manda el, para que la linea de
  // costo no se salga del cuadro justo cuando mas importa verla.
  const valores = [...planPv, ...cortesEv, ...costoAc].map((p) => p.valor);
  const yMax = Math.max(bac, ...valores, 1) * 1.05;

  const x = (f: Date) =>
    MARGEN.izquierda + ((f.getTime() - t0) / span) * anchoUtil;
  const y = (v: number) =>
    MARGEN.arriba + altoUtil - (Math.min(yMax, Math.max(0, v)) / yMax) * altoUtil;

  const trazo = (puntos: PuntoEvm[]) =>
    puntos.map((p) => `${x(p.fecha).toFixed(1)},${y(p.valor).toFixed(1)}`).join(" ");

  // AC escalonado: cada orden mantiene su nivel hasta que llega la siguiente.
  const escalones: string[] = [];
  costoAc.forEach((p, i) => {
    if (i === 0) escalones.push(`${x(p.fecha).toFixed(1)},${y(p.valor).toFixed(1)}`);
    else {
      const prev = costoAc[i - 1]!;
      escalones.push(`${x(p.fecha).toFixed(1)},${y(prev.valor).toFixed(1)}`);
      escalones.push(`${x(p.fecha).toFixed(1)},${y(p.valor).toFixed(1)}`);
    }
  });
  // El ultimo nivel se prolonga hasta el corte: sigue comprometido.
  if (costoAc.length > 0) {
    const ult = costoAc[costoAc.length - 1]!;
    escalones.push(`${x(fechaCorte).toFixed(1)},${y(ult.valor).toFixed(1)}`);
  }

  const marcasY = [0, yMax / 4, yMax / 2, (yMax * 3) / 4, yMax];

  // Etiquetas del eje X: inicio, corte y fin. La del CORTE se oculta si cae muy
  // cerca del inicio o del fin (obra recien empezada o por terminar) para que no
  // se encime con esas —la fecha del corte igual se lee arriba, en el texto—.
  // La linea vertical del corte se dibuja siempre.
  const xIni = x(inicio);
  const xCorte = x(fechaCorte);
  const xFin = x(fin);
  const GAP = 48;
  const ticksX: {
    fecha: Date;
    anchor: "start" | "middle" | "end";
    label: boolean;
  }[] = [
    { fecha: inicio, anchor: "start", label: true },
    {
      fecha: fechaCorte,
      anchor: "middle",
      label: xCorte - xIni >= GAP && xFin - xCorte >= GAP,
    },
    { fecha: fin, anchor: "end", label: true },
  ];

  return (
    <svg
      viewBox={`0 0 ${ANCHO} ${ALTO}`}
      className="h-auto w-full"
      role="img"
      aria-label={`Curva de valor ganado en soles, de ${fechaCorta(inicio)} a ${fechaCorta(fin)}.`}
      style={{ color: "var(--texto)" }}
    >
      {marcasY.map((v) => (
        <g key={v}>
          <line
            x1={MARGEN.izquierda}
            x2={ANCHO - MARGEN.derecha}
            y1={y(v)}
            y2={y(v)}
            stroke="var(--borde)"
            strokeWidth={1}
          />
          <text
            x={MARGEN.izquierda - 8}
            y={y(v) + 4}
            textAnchor="end"
            fontSize={11}
            fontWeight={600}
            fill="currentColor"
            opacity={0.7}
          >
            {solesCorto(v)}
          </text>
        </g>
      ))}

      {ticksX.map((t, i) => (
        <g key={i}>
          <line
            x1={x(t.fecha)}
            x2={x(t.fecha)}
            y1={ALTO - MARGEN.abajo}
            y2={ALTO - MARGEN.abajo + 4}
            stroke="var(--borde)"
            strokeWidth={1}
          />
          {t.label && (
            <text
              x={x(t.fecha)}
              y={ALTO - MARGEN.abajo + 17}
              textAnchor={t.anchor}
              fontSize={11}
              fontWeight={600}
              fill="currentColor"
              opacity={0.7}
            >
              {fechaCorta(t.fecha)}
            </text>
          )}
        </g>
      ))}

      {/* La vertical del corte: hasta aqui hay medido; mas alla, solo plan. */}
      <line
        x1={x(fechaCorte)}
        x2={x(fechaCorte)}
        y1={MARGEN.arriba}
        y2={ALTO - MARGEN.abajo}
        stroke="var(--color-marca-600)"
        strokeWidth={1.5}
        strokeDasharray="4 3"
        opacity={0.5}
      />

      {/* PV: el plan, de puntos, entero. */}
      <polyline
        points={trazo(planPv)}
        fill="none"
        stroke="var(--texto)"
        strokeWidth={3}
        strokeDasharray="8 5"
        strokeLinecap="round"
        opacity={0.7}
      />

      {/* AC: el costo comprometido, escalonado. */}
      {verCosto && escalones.length > 1 && (
        <polyline
          points={escalones.join(" ")}
          fill="none"
          stroke="var(--color-peligro)"
          strokeWidth={3}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      )}

      {/* EV: lo ganado, continua, hasta el corte. */}
      <polyline
        points={trazo(cortesEv)}
        fill="none"
        stroke="var(--color-marca-600)"
        strokeWidth={4}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {cortesEv.map((p) => (
        <circle
          key={p.fecha.getTime()}
          cx={x(p.fecha)}
          cy={y(p.valor)}
          r={4}
          fill="var(--color-marca-600)"
        />
      ))}
    </svg>
  );
}

/**
 * Soles abreviados para el eje: "S/ 1.2M", "S/ 120k", "S/ 500". El eje no
 * necesita el centimo, y un "S/ 735,255.61" repetido cinco veces solo estorba.
 */
function solesCorto(valor: number): string {
  if (valor >= 1_000_000) return `S/ ${(valor / 1_000_000).toFixed(1)}M`;
  if (valor >= 1_000) return `S/ ${Math.round(valor / 1_000)}k`;
  return `S/ ${Math.round(valor)}`;
}
