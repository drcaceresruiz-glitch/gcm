"use client";

import { useState } from "react";
import type { DatosCurva } from "@/services/cronograma.service";
import { fechaCronograma, fechaEje, fechaLarga } from "@/utils/fechas";
import { decimal } from "@/utils/formato";

/**
 * La curva de avance, dibujada a mano en SVG.
 *
 * Sin libreria de graficos, y a proposito. Los colores salen de las variables
 * del tema, asi que el grafico repinta solo al cambiar de tema o de paleta;
 * una libreria traeria su propio sistema de color y habria que reconciliarlo.
 *
 * Tres series, y cada una dice algo distinto:
 * - PLANEADO: continuo, de principio a fin de obra. Es la S de verdad, la que
 *   sale de repartir cada tarea a lo largo de sus dias.
 * - REAL: solo hasta la fecha de corte. Nunca se dibuja mas alla: mas alla no
 *   se ha medido nada.
 * - PROYECCION: desde el corte hasta el final, al ritmo que se lleva. Va
 *   punteada porque es una estimacion, no una medida.
 */

const ANCHO = 760;
const MARGEN = { arriba: 14, derecha: 18, abajo: 30, izquierda: 44 };

type Rango = "todo" | "mes";

export function CurvaS({ datos }: { datos: DatosCurva }) {
  const [rango, setRango] = useState<Rango>("todo");
  const [ampliada, setAmpliada] = useState(false);

  if (datos.cortes.length === 0 || datos.plan.length === 0 || !datos.inicio || !datos.fin) {
    return null;
  }

  const ultimoCorte = datos.cortes[datos.cortes.length - 1]!;

  // El "mes" se cuenta hacia atras desde la fecha de corte y no desde hoy: es
  // la ultima foto real que existe, y encuadrar en una fecha sin datos
  // dejaria el grafico vacio.
  const desde =
    rango === "mes"
      ? new Date(Math.max(datos.inicio.getTime(), ultimoCorte.fecha.getTime() - 30 * 86400000))
      : datos.inicio;

  const hasta = rango === "mes" ? ultimoCorte.fecha : datos.fin;

  const plan = recortar(datos.plan, desde, hasta);
  const proyeccion = rango === "mes" ? [] : recortar(datos.proyeccion, desde, hasta);
  const cortes = datos.cortes.filter(
    (c) => c.fecha >= desde && c.fecha <= hasta,
  );

  // Ampliar = ajustar el eje vertical a lo que hay. Con las dos lineas al 10%
  // y el eje hasta 100, el 90% del grafico esta vacio y las curvas se pisan.
  const valores = [
    ...plan.map((p) => p.valor),
    ...proyeccion.map((p) => p.valor),
    ...cortes.map((c) => Number(c.real) || 0),
  ];
  const maximo = ampliada ? Math.min(100, Math.max(5, Math.max(...valores) * 1.15)) : 100;

  const alto = ampliada ? 340 : 260;
  const anchoUtil = ANCHO - MARGEN.izquierda - MARGEN.derecha;
  const altoUtil = alto - MARGEN.arriba - MARGEN.abajo;

  const t0 = desde.getTime();
  const span = Math.max(1, hasta.getTime() - t0);

  const x = (f: Date) => MARGEN.izquierda + ((f.getTime() - t0) / span) * anchoUtil;
  const y = (v: number) =>
    MARGEN.arriba + altoUtil - (Math.min(maximo, Math.max(0, v)) / maximo) * altoUtil;

  const trazo = (puntos: { fecha: Date; valor: number }[]) =>
    puntos.map((p) => `${x(p.fecha).toFixed(1)},${y(p.valor).toFixed(1)}`).join(" ");

  const marcas = ampliada
    ? [0, maximo / 4, maximo / 2, (maximo * 3) / 4, maximo]
    : [0, 25, 50, 75, 100];

  const atrasado = Number(ultimoCorte.desfase) < 0;

  return (
    <figure className="m-0">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Grupo>
          <Opcion activa={rango === "todo"} onClick={() => setRango("todo")}>
            Todo el plazo
          </Opcion>
          <Opcion activa={rango === "mes"} onClick={() => setRango("mes")}>
            Ultimo mes
          </Opcion>
        </Grupo>

        <Grupo>
          <Opcion activa={!ampliada} onClick={() => setAmpliada(false)}>
            Escala 0-100
          </Opcion>
          <Opcion activa={ampliada} onClick={() => setAmpliada(true)}>
            Ampliar
          </Opcion>
        </Grupo>
      </div>

      <svg
        viewBox={`0 0 ${ANCHO} ${alto}`}
        className="h-auto w-full"
        role="img"
        aria-label={`Curva de avance. Al corte del ${fechaLarga(ultimoCorte.fecha)}, planeado ${decimal(ultimoCorte.planeado)}% y real ${decimal(ultimoCorte.real)}%.`}
      >
        {marcas.map((v) => (
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
              x={MARGEN.izquierda - 6}
              y={y(v) + 3}
              textAnchor="end"
              fontSize={10}
              fill="currentColor"
              opacity={0.6}
            >
              {v.toFixed(maximo < 20 ? 1 : 0)}%
            </text>
          </g>
        ))}

        {/* La fecha de corte: separa lo medido de lo estimado. */}
        <line
          x1={x(ultimoCorte.fecha)}
          x2={x(ultimoCorte.fecha)}
          y1={MARGEN.arriba}
          y2={alto - MARGEN.abajo}
          stroke="var(--color-marca-600)"
          strokeWidth={1}
          strokeDasharray="2 3"
          opacity={0.5}
        />

        <polyline
          points={trazo(plan)}
          fill="none"
          stroke="var(--texto)"
          strokeWidth={2}
          strokeDasharray="5 4"
          opacity={0.7}
        />

        {proyeccion.length > 1 && (
          <polyline
            points={trazo(proyeccion)}
            fill="none"
            stroke={atrasado ? "var(--color-peligro)" : "var(--color-exito)"}
            strokeWidth={2}
            strokeDasharray="2 4"
          />
        )}

        {/* El real se traza uniendo los cortes: son las unicas fechas en las
            que de verdad se ha medido algo. */}
        <polyline
          points={cortes.map((c) => `${x(c.fecha).toFixed(1)},${y(Number(c.real) || 0).toFixed(1)}`).join(" ")}
          fill="none"
          stroke="var(--color-marca-600)"
          strokeWidth={2.5}
        />

        {cortes.map((c) => (
          <circle
            key={c.version}
            cx={x(c.fecha)}
            cy={y(Number(c.real) || 0)}
            r={3.5}
            fill="var(--color-marca-600)"
          />
        ))}

        {/* El "% Planeado" que trae el propio archivo, en las fechas donde
            existe. La linea de puntos es el plan RECONSTRUIDO repartiendo cada
            tarea dia a dia; estos circulos huecos son lo que dice Project. Se
            dibujan para que la diferencia entre ambos se vea en vez de quedar
            escondida: son dos formas distintas de repartir el mismo plan. */}
        {cortes.map((c) => (
          <circle
            key={`plan-${c.version}`}
            cx={x(c.fecha)}
            cy={y(Number(c.planeado) || 0)}
            r={3}
            fill="none"
            stroke="var(--texto)"
            strokeWidth={1.5}
            opacity={0.7}
          />
        ))}

        {etiquetasDeEje(desde, hasta).map((f) => (
          <text
            key={f.getTime()}
            x={x(f)}
            y={alto - 8}
            textAnchor="middle"
            fontSize={10}
            fill="currentColor"
            opacity={0.6}
          >
            {fechaEje(f)}
          </text>
        ))}
      </svg>

      <figcaption className="mt-2 space-y-1.5 text-xs">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
          <Leyenda color="var(--color-marca-600)">
            Real {decimal(ultimoCorte.real)}%
          </Leyenda>
          <Leyenda color="var(--texto)" punteada>
            Planeado {decimal(ultimoCorte.planeado)}%
          </Leyenda>
          {proyeccion.length > 1 && (
            <Leyenda
              color={atrasado ? "var(--color-peligro)" : "var(--color-exito)"}
              punteada
            >
              Proyeccion al ritmo actual
            </Leyenda>
          )}
          <span
            className="font-medium tabular-nums"
            style={{ color: atrasado ? "var(--color-peligro)" : "var(--color-exito)" }}
          >
            {Number(ultimoCorte.desfase) > 0 ? "+" : ""}
            {decimal(ultimoCorte.desfase)}% respecto al plan
          </span>
        </div>

        <p className="opacity-60">
          Los circulos huecos son el «% Planeado» que trae el archivo en cada
          corte. La linea de puntos es ese mismo plan reconstruido dia a dia
          para poder dibujarlo entero, asi que pueden no coincidir del todo:
          son dos formas de repartir el mismo trabajo en el tiempo.
        </p>

        <p className="opacity-70">
          Ritmo actual: <strong>{(datos.factor * 100).toFixed(0)}%</strong> de lo
          previsto.{" "}
          {datos.terminoProyectado ? (
            <>
              A este paso la obra terminaria el{" "}
              <strong>{fechaCronograma(datos.terminoProyectado)}</strong>, frente al{" "}
              {fechaCronograma(datos.fin)} programado.
            </>
          ) : (
            <>
              A este paso <strong>no se llega al 100% dentro del plazo</strong>,
              que acaba el {fechaCronograma(datos.fin)}.
            </>
          )}
        </p>
      </figcaption>
    </figure>
  );
}

/** Puntos dentro de la ventana, con los bordes incluidos. */
function recortar(
  puntos: readonly { fecha: Date; valor: number }[],
  desde: Date,
  hasta: Date,
): { fecha: Date; valor: number }[] {
  return puntos.filter((p) => p.fecha >= desde && p.fecha <= hasta);
}

/** Cinco fechas repartidas por el eje, siempre con los extremos. */
function etiquetasDeEje(desde: Date, hasta: Date): Date[] {
  const span = hasta.getTime() - desde.getTime();
  return [0, 0.25, 0.5, 0.75, 1].map((f) => new Date(desde.getTime() + span * f));
}

function Grupo({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="inline-flex overflow-hidden rounded-lg border"
      style={{ borderColor: "var(--borde)" }}
    >
      {children}
    </div>
  );
}

function Opcion({
  activa,
  onClick,
  children,
}: {
  activa: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={activa}
      className="px-3 py-1.5 text-xs font-medium"
      style={{
        backgroundColor: activa ? "var(--color-marca-600)" : "transparent",
        color: activa ? "#fff" : undefined,
        opacity: activa ? 1 : 0.75,
      }}
    >
      {children}
    </button>
  );
}

function Leyenda({
  color,
  punteada,
  children,
}: {
  color: string;
  punteada?: boolean;
  children: React.ReactNode;
}) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        className="inline-block h-0.5 w-5"
        style={
          punteada
            ? {
                backgroundImage: `repeating-linear-gradient(to right, ${color} 0 5px, transparent 5px 9px)`,
              }
            : { backgroundColor: color }
        }
        aria-hidden="true"
      />
      {children}
    </span>
  );
}
