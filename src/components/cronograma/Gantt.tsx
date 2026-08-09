"use client";

import { useMemo, useState } from "react";
import { ChevronRight, ChevronDown, Diamond } from "lucide-react";
import {
  rangoGantt,
  geometriaBarra,
  posicionDia,
  marcasCalendario,
  filasVisibles,
  resumenesPlegables,
  type TareaGantt,
} from "@/lib/gantt";
import { fechaCorta } from "@/utils/fechas";

/**
 * El diagrama de Gantt de la obra.
 *
 * Nombres a la izquierda —fijos, con sangria y plegado por capitulo— y la
 * linea de tiempo a la derecha, que se desplaza en horizontal. Cada barra cae
 * en su fecha y se llena segun el %real; las de la ruta critica van en rojo,
 * los hitos son rombos, y una linea vertical marca la fecha de corte.
 *
 * Es HTML posicionado, no una libreria: cien barras y un calendario caben de
 * sobra sin virtualizar, y asi el relleno de avance y el tooltip son dos
 * `div`, no un motor de dibujo.
 */

const ALTO_FILA = 30;
const ANCHO_NOMBRES = 300;

export function Gantt({
  tareas,
  fechaCorte,
}: {
  tareas: TareaGantt[];
  fechaCorte: Date;
}) {
  const [colapsados, setColapsados] = useState<Set<number>>(new Set());

  const rango = useMemo(() => rangoGantt(tareas), [tareas]);
  const plegables = useMemo(() => resumenesPlegables(tareas), [tareas]);
  const visibles = useMemo(
    () => filasVisibles(tareas, colapsados),
    [tareas, colapsados],
  );

  if (!rango) {
    return (
      <p className="text-sm opacity-70">
        El cronograma no tiene tareas con fechas que dibujar.
      </p>
    );
  }

  // Pixeles por dia, adaptado al plazo: un mes se ve holgado, dos anos caben
  // sin hacer scroll infinito. Se acota para que ni una barra desaparezca ni
  // el diagrama mida kilometros.
  const pxDia = Math.max(4, Math.min(20, Math.round(900 / rango.totalDias)));
  const anchoTiempo = (rango.totalDias + 1) * pxDia;

  const marcas = marcasCalendario(rango);
  const xCorte = posicionDia(fechaCorte, rango) * pxDia;

  function alternar(uid: number) {
    setColapsados((previo) => {
      const copia = new Set(previo);
      if (copia.has(uid)) copia.delete(uid);
      else copia.add(uid);
      return copia;
    });
  }

  return (
    <div>
      <Leyenda />

      <div
        className="overflow-x-auto rounded-xl border"
        style={{ borderColor: "var(--borde)" }}
      >
        <div style={{ minWidth: ANCHO_NOMBRES + anchoTiempo }}>
          {/* Cabecera: el calendario, pegado arriba al desplazar vertical. */}
          <div
            className="sticky top-0 z-20 flex border-b"
            style={{
              height: ALTO_FILA,
              borderColor: "var(--borde)",
              backgroundColor: "var(--superficie)",
            }}
          >
            <div
              className="sticky left-0 z-10 shrink-0 border-r px-3 text-xs font-medium"
              style={{
                width: ANCHO_NOMBRES,
                borderColor: "var(--borde)",
                backgroundColor: "var(--superficie)",
                lineHeight: `${ALTO_FILA}px`,
              }}
            >
              Tarea
            </div>
            <div className="relative" style={{ width: anchoTiempo }}>
              {marcas.map((m, i) => (
                <span
                  key={i}
                  className="absolute text-xs opacity-60"
                  style={{
                    left: m.x * pxDia + 2,
                    lineHeight: `${ALTO_FILA}px`,
                    fontWeight: m.inicioDeMes ? 600 : 400,
                  }}
                >
                  {m.etiqueta}
                </span>
              ))}
            </div>
          </div>

          {/* Filas. El fondo de rayas de calendario y la linea de corte se
              pintan detras de cada fila para que crucen todo el alto. */}
          <div className="relative">
            {visibles.map((t) => (
              <Fila
                key={t.uid}
                tarea={t}
                rango={rango}
                pxDia={pxDia}
                anchoTiempo={anchoTiempo}
                marcas={marcas}
                plegable={plegables.has(t.uid)}
                colapsado={colapsados.has(t.uid)}
                onAlternar={() => alternar(t.uid)}
              />
            ))}

            {/* La linea de corte cruza todas las filas visibles. */}
            {xCorte >= 0 && xCorte <= anchoTiempo && (
              <div
                className="pointer-events-none absolute top-0 z-10 w-0.5"
                style={{
                  left: ANCHO_NOMBRES + xCorte,
                  height: visibles.length * ALTO_FILA,
                  backgroundColor: "var(--color-peligro)",
                  opacity: 0.5,
                }}
                aria-hidden="true"
              />
            )}
          </div>
        </div>
      </div>

      <p className="mt-2 text-xs opacity-60">
        La linea roja marca la fecha de corte ({fechaCorta(fechaCorte)}). El
        relleno de cada barra es su avance real.
      </p>
    </div>
  );
}

function Fila({
  tarea,
  rango,
  pxDia,
  anchoTiempo,
  marcas,
  plegable,
  colapsado,
  onAlternar,
}: {
  tarea: TareaGantt;
  rango: ReturnType<typeof rangoGantt> & object;
  pxDia: number;
  anchoTiempo: number;
  marcas: ReturnType<typeof marcasCalendario>;
  plegable: boolean;
  colapsado: boolean;
  onAlternar: () => void;
}) {
  const b = geometriaBarra(tarea, rango);
  const izquierda = b.x * pxDia;
  const ancho = b.ancho * pxDia;
  const real = Number(tarea.porcentajeReal) || 0;
  const plan = Number(tarea.porcentajePlaneado) || 0;

  const color = tarea.esCritico ? "var(--color-peligro)" : "var(--color-marca-500)";

  const tooltip = `${tarea.codigo ? tarea.codigo + " " : ""}${tarea.nombre}\n${fechaCorta(tarea.inicio)} – ${fechaCorta(tarea.fin)}\nReal ${real.toFixed(0)}% · Plan ${plan.toFixed(0)}%${tarea.esCritico ? "\nRuta critica" : ""}`;

  return (
    <div
      className="flex"
      style={{ height: ALTO_FILA, borderColor: "var(--borde)" }}
    >
      {/* Nombre, fijo a la izquierda al desplazar en horizontal. */}
      <div
        className="sticky left-0 z-10 flex shrink-0 items-center gap-1 border-r border-b px-2"
        style={{
          width: ANCHO_NOMBRES,
          paddingLeft: 8 + (tarea.nivel - 1) * 14,
          borderColor: "var(--borde)",
          backgroundColor: "var(--superficie)",
        }}
      >
        {plegable ? (
          <button
            type="button"
            onClick={onAlternar}
            aria-label={colapsado ? "Desplegar" : "Plegar"}
            className="shrink-0 rounded p-0.5 opacity-70 hover:opacity-100"
          >
            {colapsado ? (
              <ChevronRight className="size-3.5" aria-hidden="true" />
            ) : (
              <ChevronDown className="size-3.5" aria-hidden="true" />
            )}
          </button>
        ) : (
          <span className="w-4 shrink-0" aria-hidden="true" />
        )}
        <span
          className={`truncate text-xs ${tarea.esResumen ? "font-semibold" : ""}`}
          title={`${tarea.codigo ? tarea.codigo + " " : ""}${tarea.nombre}`}
        >
          {tarea.codigo && (
            <span className="opacity-60 tabular-nums">{tarea.codigo} </span>
          )}
          {tarea.nombre}
        </span>
      </div>

      {/* Carril de tiempo. */}
      <div
        className="relative border-b"
        style={{ width: anchoTiempo, borderColor: "var(--borde)" }}
        title={tooltip}
      >
        {/* Rayas de calendario, tenues, para poder seguir una barra hasta su
            fecha sin perder la vista. */}
        {marcas.map((m, i) => (
          <span
            key={i}
            className="absolute inset-y-0 w-px"
            style={{
              left: m.x * pxDia,
              backgroundColor: "var(--borde)",
              opacity: m.inicioDeMes ? 0.7 : 0.35,
            }}
            aria-hidden="true"
          />
        ))}

        {tarea.esHito ? (
          <Rombo left={izquierda} color={color} />
        ) : tarea.esResumen ? (
          <BarraResumen left={izquierda} ancho={ancho} />
        ) : (
          <BarraTarea
            left={izquierda}
            ancho={ancho}
            relleno={b.relleno * pxDia}
            color={color}
          />
        )}
      </div>
    </div>
  );
}

/** La barra de una tarea de trabajo: fondo tenue = plan; relleno = avance real. */
function BarraTarea({
  left,
  ancho,
  relleno,
  color,
}: {
  left: number;
  ancho: number;
  relleno: number;
  color: string;
}) {
  return (
    <div
      className="absolute top-1/2 -translate-y-1/2 overflow-hidden rounded"
      style={{
        left,
        width: ancho,
        height: 14,
        backgroundColor: `color-mix(in oklab, ${color} 22%, transparent)`,
        border: `1px solid color-mix(in oklab, ${color} 45%, transparent)`,
      }}
    >
      <div
        className="h-full rounded-l"
        style={{ width: relleno, backgroundColor: color }}
      />
    </div>
  );
}

/** El resumen de un capitulo: una barra fina que abarca a sus hijas. */
function BarraResumen({ left, ancho }: { left: number; ancho: number }) {
  return (
    <div
      className="absolute top-1/2 -translate-y-1/2 rounded-sm"
      style={{
        left,
        width: ancho,
        height: 7,
        backgroundColor: "var(--texto)",
        opacity: 0.55,
      }}
    />
  );
}

/** Un hito: un rombo en su fecha, sin duracion. */
function Rombo({ left, color }: { left: number; color: string }) {
  return (
    <Diamond
      className="absolute top-1/2 size-3.5 -translate-x-1/2 -translate-y-1/2"
      style={{ left, color, fill: color }}
      aria-hidden="true"
    />
  );
}

function Leyenda() {
  return (
    <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs opacity-70">
      <Muestra color="var(--color-marca-500)" etiqueta="Tarea" />
      <Muestra color="var(--color-peligro)" etiqueta="Ruta critica" />
      <span className="inline-flex items-center gap-1.5">
        <Diamond
          className="size-3"
          style={{ color: "var(--color-marca-500)", fill: "var(--color-marca-500)" }}
          aria-hidden="true"
        />
        Hito
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span
          className="inline-block h-3 w-1 rounded"
          style={{ backgroundColor: "var(--texto)", opacity: 0.55 }}
          aria-hidden="true"
        />
        Capitulo
      </span>
    </div>
  );
}

function Muestra({ color, etiqueta }: { color: string; etiqueta: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        className="inline-block h-3 w-5 rounded"
        style={{ backgroundColor: color }}
        aria-hidden="true"
      />
      {etiqueta}
    </span>
  );
}
