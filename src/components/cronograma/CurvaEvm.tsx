"use client";

import { useRef, useState } from "react";
import type { PuntoEvm } from "@/services/evm.service";
import { fechaCorta, fechaCronograma } from "@/utils/fechas";
import { soles } from "@/utils/formato";

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
 * El cursor vertical se arrastra igual que en la curva de avance y va cantando
 * las tres cifras en soles de esa fecha. Las dos curvas se manejan identico a
 * proposito: una linea que en un grafico se mueve y en el de al lado no, se
 * lee como averia.
 */

const ANCHO = 760;
const ALTO = 300;
const MARGEN = { arriba: 16, derecha: 20, abajo: 34, izquierda: 64 };
const DIA_MS = 86400000;

// Una fecha "10/08/2026" a 11px ocupa unas 66 unidades del viewBox. Si el
// centro de la etiqueta del corte queda a menos que esto de la del inicio o la
// del fin, se encimarian: la del corte se oculta (la fecha igual se lee en la
// franja del cursor, que arranca en el corte).
const HUECO_ETIQUETA = 90;

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
  const [cursor, setCursor] = useState<Date | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

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

  // Etiquetas del eje X: inicio, corte y fin. La del CORTE se oculta si no le
  // cabe la fecha entera sin pisar a las de los extremos (obra recien empezada
  // o por terminar); su fecha igual se lee en la franja del cursor.
  const xIni = x(inicio);
  const xCorte = x(fechaCorte);
  const xFin = x(fin);
  const ticksX: {
    fecha: Date;
    anchor: "start" | "middle" | "end";
    label: boolean;
  }[] = [
    { fecha: inicio, anchor: "start", label: true },
    {
      fecha: fechaCorte,
      anchor: "middle",
      label: xCorte - xIni >= HUECO_ETIQUETA && xFin - xCorte >= HUECO_ETIQUETA,
    },
    { fecha: fin, anchor: "end", label: true },
  ];

  // El cursor arranca en la fecha de corte, que es donde estaba la linea fija
  // antes de poder moverla.
  const fechaCursor = cursor ?? fechaCorte;
  const finEv = cortesEv[cortesEv.length - 1]?.fecha ?? fechaCorte;

  const lectura = {
    pv: valorEn(planPv, fechaCursor),
    // Mas alla del ultimo corte medido no hay ganado: no se extrapola.
    ev:
      fechaCursor.getTime() <= finEv.getTime()
        ? valorEn(cortesEv, fechaCursor)
        : null,
    ac: costoEn(costoAc, fechaCursor, fechaCorte, inicio, verCosto),
  };

  function fechaDesdePuntero(clientX: number): Date | null {
    const svg = svgRef.current;
    if (!svg) return null;

    const caja = svg.getBoundingClientRect();
    if (caja.width === 0) return null;

    // De pixeles de pantalla a unidades del viewBox, que es lo unico que se
    // mantiene estable cuando el grafico se reescala en movil.
    const enViewBox = ((clientX - caja.left) / caja.width) * ANCHO;
    const fraccion = (enViewBox - MARGEN.izquierda) / anchoUtil;

    return new Date(t0 + Math.min(1, Math.max(0, fraccion)) * span);
  }

  return (
    <div>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${ANCHO} ${ALTO}`}
        className="h-auto w-full touch-none"
        role="img"
        aria-label={`Curva de valor ganado en soles, de ${fechaCorta(inicio)} a ${fechaCorta(fin)}.`}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          setCursor(fechaDesdePuntero(e.clientX));
        }}
        onPointerMove={(e) => {
          if (e.buttons > 0 || e.pointerType === "mouse") {
            setCursor(fechaDesdePuntero(e.clientX));
          }
        }}
        onPointerLeave={() => setCursor(null)}
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

        {/* El cursor: la vertical que se arrastra. Arranca en el corte. */}
        <g>
          <line
            x1={x(fechaCursor)}
            x2={x(fechaCursor)}
            y1={MARGEN.arriba}
            y2={ALTO - MARGEN.abajo}
            stroke="var(--color-marca-600)"
            strokeWidth={2}
            strokeDasharray="4 3"
          />
          {lectura.pv !== null && (
            <circle cx={x(fechaCursor)} cy={y(lectura.pv)} r={4} fill="var(--texto)" />
          )}
          {lectura.ev !== null && (
            <circle
              cx={x(fechaCursor)}
              cy={y(lectura.ev)}
              r={4}
              fill="var(--color-marca-600)"
            />
          )}
          {lectura.ac !== null && (
            <circle
              cx={x(fechaCursor)}
              cy={y(lectura.ac)}
              r={4}
              fill="var(--color-peligro)"
            />
          )}
        </g>
      </svg>

      {/* La franja de lectura: las tres cifras en la fecha del cursor. */}
      <div
        className="mt-2 flex flex-wrap items-center gap-x-5 gap-y-2 rounded-lg border p-3 text-sm"
        style={{ borderColor: "var(--borde)" }}
      >
        <span className="font-semibold">{fechaCronograma(fechaCursor)}</span>

        <Cifra color="var(--color-marca-600)">
          Ganado{" "}
          <strong className="tabular-nums">
            {lectura.ev === null ? "sin medir" : soles(lectura.ev.toFixed(2))}
          </strong>
        </Cifra>

        <Cifra color="var(--texto)" punteada>
          Planeado{" "}
          <strong className="tabular-nums">
            {lectura.pv === null ? "—" : soles(lectura.pv.toFixed(2))}
          </strong>
        </Cifra>

        {verCosto && (
          <Cifra color="var(--color-peligro)">
            Costo{" "}
            <strong className="tabular-nums">
              {lectura.ac === null ? "sin ordenes" : soles(lectura.ac.toFixed(2))}
            </strong>
          </Cifra>
        )}

        <span className="ml-auto text-xs opacity-60">
          Arrastra sobre el grafico para leer cualquier fecha
        </span>
      </div>
    </div>
  );
}

/**
 * Valor de una serie en una fecha, interpolando entre los puntos que la
 * rodean. Devuelve null fuera del tramo cubierto: extrapolar seria inventar.
 */
function valorEn(puntos: readonly PuntoEvm[], fecha: Date): number | null {
  if (puntos.length === 0) return null;

  const t = fecha.getTime();
  const primero = puntos[0]!;
  const ultimo = puntos[puntos.length - 1]!;

  if (t < primero.fecha.getTime() || t > ultimo.fecha.getTime()) return null;

  for (let i = 1; i < puntos.length; i++) {
    const a = puntos[i - 1]!;
    const b = puntos[i]!;
    if (t > b.fecha.getTime()) continue;

    const tramo = b.fecha.getTime() - a.fecha.getTime();
    if (tramo <= 0) return b.valor;

    const f = (t - a.fecha.getTime()) / tramo;
    return a.valor + (b.valor - a.valor) * f;
  }

  return ultimo.valor;
}

/**
 * El costo comprometido a una fecha. NO se interpola: el AC es un escalon, el
 * valor a cualquier fecha es el de la ultima orden aprobada hasta entonces.
 * Antes de la primera orden el comprometido es cero de verdad; mas alla del
 * corte no se afirma nada.
 */
function costoEn(
  costoAc: readonly PuntoEvm[],
  fecha: Date,
  fechaCorte: Date,
  inicio: Date,
  verCosto: boolean,
): number | null {
  if (!verCosto || costoAc.length === 0) return null;

  const t = fecha.getTime();
  if (t > fechaCorte.getTime() || t < inicio.getTime()) return null;

  let valor = 0;
  for (const p of costoAc) {
    if (p.fecha.getTime() > t) break;
    valor = p.valor;
  }
  return valor;
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

function Cifra({
  color,
  punteada,
  children,
}: {
  color: string;
  punteada?: boolean;
  children: React.ReactNode;
}) {
  return (
    <span className="inline-flex items-center gap-2">
      <span
        className="inline-block w-7 shrink-0 rounded-full"
        style={{
          height: 5,
          ...(punteada
            ? {
                backgroundImage: `repeating-linear-gradient(to right, ${color} 0 7px, transparent 7px 12px)`,
              }
            : { backgroundColor: color }),
        }}
        aria-hidden="true"
      />
      <span>{children}</span>
    </span>
  );
}
