"use client";

import { useMemo, useState } from "react";
import { ChevronRight, ChevronDown, Diamond } from "lucide-react";
import {
  rangoGantt,
  geometriaBarra,
  posicionDia,
  filasVisibles,
  resumenesPlegables,
  flechasDeDependencia,
  barraLineaBase,
  type DependenciaGantt,
  type EnlaceGantt,
  type RangoGantt,
  type TareaBase,
  type TareaGantt,
} from "@/lib/gantt";
import { fechaCorta } from "@/utils/fechas";

/**
 * El diagrama de Gantt de la obra.
 *
 * Nombres a la izquierda —fijos, con sangria y plegado por capitulo— y la
 * linea de tiempo a la derecha, que se desplaza en horizontal. Cabecera de dos
 * niveles (rango de semana o mes arriba, dia o semana abajo), columnas
 * sombreadas para apoyar la vista, barras redondeadas que se llenan segun el
 * %real, criticas en rojo, hitos en rombo y una linea vertical en el corte.
 *
 * Es HTML posicionado, no una libreria: cien barras y un calendario caben de
 * sobra sin virtualizar. La geometria (posicion y ancho de cada barra) vive en
 * `@/lib/gantt` y se prueba; el calendario de dos niveles es presentacion y se
 * arma aqui.
 */

const ALTO_FILA = 34;
const ANCHO_NOMBRES = 300;
const ALTO_CABECERA = 44;
const DIA_MS = 24 * 60 * 60 * 1000;

const INICIAL_DIA = ["D", "L", "M", "M", "J", "V", "S"];
const MES_CORTO = [
  "ENE", "FEB", "MAR", "ABR", "MAY", "JUN",
  "JUL", "AGO", "SEP", "OCT", "NOV", "DIC",
];

interface Banda {
  x: number;
  ancho: number;
  etiqueta: string;
  par: boolean;
}
interface Tick {
  x: number;
  etiqueta: string;
  finDeSemana: boolean;
}

function diasUTC(desde: Date, hasta: Date): number {
  const a = Date.UTC(desde.getUTCFullYear(), desde.getUTCMonth(), desde.getUTCDate());
  const b = Date.UTC(hasta.getUTCFullYear(), hasta.getUTCMonth(), hasta.getUTCDate());
  return Math.round((b - a) / DIA_MS);
}

/**
 * Cuantas bandas y cuantos ticks como mucho, pase lo que pase con las fechas.
 *
 * El mismo tope y por la misma razon que `TOPE_MARCAS` en `lib/gantt`: los dos
 * ejes se recorren de banda en banda y de tick en tick, asi que sin tope el
 * coste lo fija el PLAZO y no el tamaño del cronograma. Con una tarea de 1900
 * a 9999 —un año mal tecleado— salian noventa y siete mil bandas y cuatrocientos
 * mil ticks, y el Gantt tardaba 10 s en dibujarse con dos tareas dentro
 * (medido el 25/08/2026). El paso se ensancha en vez de multiplicarse las
 * rayitas; un plazo normal no lo nota.
 */
const TOPE_BANDAS = 120;
const TOPE_TICKS = 400;

/** Bandas del nivel superior: semanas en plazo corto, meses en el largo. */
function calcularBandas(rango: RangoGantt, porMeses: boolean): Banda[] {
  const inicio = new Date(
    Date.UTC(rango.inicio.getUTCFullYear(), rango.inicio.getUTCMonth(), rango.inicio.getUTCDate()),
  );
  const bandas: Banda[] = [];

  const pasoMeses = Math.max(1, Math.ceil(rango.totalDias / 30.44 / TOPE_BANDAS));
  const pasoSemanas = Math.max(1, Math.ceil(rango.totalDias / 7 / TOPE_BANDAS));

  if (porMeses) {
    const cursor = new Date(Date.UTC(inicio.getUTCFullYear(), inicio.getUTCMonth(), 1));
    let i = 0;
    while (diasUTC(rango.inicio, cursor) <= rango.totalDias) {
      const fin = new Date(
        Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + pasoMeses, 1),
      );
      const x = Math.max(0, diasUTC(rango.inicio, cursor));
      const xFin = Math.min(rango.totalDias + 1, diasUTC(rango.inicio, fin));
      bandas.push({
        x,
        ancho: xFin - x,
        etiqueta: `${MES_CORTO[cursor.getUTCMonth()]} ${String(cursor.getUTCFullYear()).slice(2)}`,
        par: i % 2 === 0,
      });
      cursor.setUTCMonth(cursor.getUTCMonth() + pasoMeses);
      i++;
    }
  } else {
    // Semanas de lunes a domingo.
    const cursor = new Date(inicio);
    cursor.setUTCDate(cursor.getUTCDate() - ((cursor.getUTCDay() + 6) % 7));
    let i = 0;
    while (diasUTC(rango.inicio, cursor) <= rango.totalDias) {
      const fin = new Date(cursor);
      fin.setUTCDate(fin.getUTCDate() + 7 * pasoSemanas - 1);
      const x = Math.max(0, diasUTC(rango.inicio, cursor));
      const xFin = Math.min(rango.totalDias + 1, diasUTC(rango.inicio, cursor) + 7 * pasoSemanas);
      bandas.push({
        x,
        ancho: xFin - x,
        etiqueta: `${String(cursor.getUTCDate()).padStart(2, "0")}/${String(cursor.getUTCMonth() + 1).padStart(2, "0")} – ${String(fin.getUTCDate()).padStart(2, "0")}/${String(fin.getUTCMonth() + 1).padStart(2, "0")}`,
        par: i % 2 === 0,
      });
      cursor.setUTCDate(cursor.getUTCDate() + 7 * pasoSemanas);
      i++;
    }
  }

  return bandas;
}

/** Nivel inferior: dias en plazo corto, comienzos de semana en el largo. */
function calcularTicks(rango: RangoGantt, porMeses: boolean): Tick[] {
  const ticks: Tick[] = [];

  if (porMeses) {
    const cursor = new Date(
      Date.UTC(rango.inicio.getUTCFullYear(), rango.inicio.getUTCMonth(), rango.inicio.getUTCDate()),
    );
    cursor.setUTCDate(cursor.getUTCDate() - ((cursor.getUTCDay() + 6) % 7));
    const paso = Math.max(1, Math.ceil(rango.totalDias / 7 / TOPE_TICKS));
    while (diasUTC(rango.inicio, cursor) <= rango.totalDias) {
      const x = diasUTC(rango.inicio, cursor);
      if (x >= 0) {
        ticks.push({ x, etiqueta: String(cursor.getUTCDate()).padStart(2, "0"), finDeSemana: false });
      }
      cursor.setUTCDate(cursor.getUTCDate() + 7 * paso);
    }
  } else {
    for (let dia = 0; dia <= rango.totalDias; dia++) {
      const f = new Date(rango.inicio.getTime() + dia * DIA_MS);
      const dow = f.getUTCDay();
      ticks.push({
        x: dia,
        etiqueta: INICIAL_DIA[dow]!,
        finDeSemana: dow === 0 || dow === 6,
      });
    }
  }

  return ticks;
}

export function Gantt({
  tareas,
  fechaCorte,
  dependencias = [],
  lineaBase = [],
}: {
  tareas: TareaGantt[];
  fechaCorte: Date;
  /// Los enlaces del cronograma. Vacio en una obra sin red de precedencias
  /// —un plan venido de Excel no la trae— y entonces no se dibuja ninguno.
  dependencias?: DependenciaGantt[];
  /// Las tareas de la version fijada como linea base. Vacio si no hay.
  lineaBase?: TareaBase[];
}) {
  const [colapsados, setColapsados] = useState<Set<number>>(new Set());

  /**
   * La fila señalada con el raton o el teclado, por uid.
   *
   * Es lo que hace legible el diagrama: por defecto solo se pintan los enlaces
   * de la ruta critica —los que explican la fecha final—, y los demas se piden
   * fila a fila. Con 76 enlaces sobre 106 tareas, pintarlos todos a la vez es
   * una maraña que nadie mira.
   */
  const [señalada, setSeñalada] = useState<number | null>(null);

  const rango = useMemo(() => rangoGantt(tareas), [tareas]);
  const plegables = useMemo(() => resumenesPlegables(tareas), [tareas]);
  const visibles = useMemo(() => filasVisibles(tareas, colapsados), [tareas, colapsados]);

  // El capitulo es el nivel inmediatamente bajo el mas alto: se marca con banda.
  const nivelCapitulo = useMemo(() => {
    if (tareas.length === 0) return 2;
    return Math.min(...tareas.map((t) => t.nivel)) + 1;
  }, [tareas]);

  const porMeses = (rango?.totalDias ?? 0) > 75;
  const pxDia = rango ? Math.max(4, Math.min(22, Math.round(1000 / rango.totalDias))) : 12;

  const bandas = useMemo(
    () => (rango ? calcularBandas(rango, porMeses) : []),
    [rango, porMeses],
  );
  const ticks = useMemo(
    () => (rango ? calcularTicks(rango, porMeses) : []),
    [rango, porMeses],
  );

  const flechas = useMemo(
    () => (rango ? flechasDeDependencia(dependencias, visibles, rango) : []),
    [dependencias, visibles, rango],
  );

  const basePorUid = useMemo(
    () => new Map(lineaBase.map((t) => [t.uid, t])),
    [lineaBase],
  );

  if (!rango) {
    return (
      <p className="text-sm opacity-70">
        El cronograma no tiene tareas con fechas que dibujar.
      </p>
    );
  }

  const anchoTiempo = (rango.totalDias + 1) * pxDia;
  const xCorte = posicionDia(fechaCorte, rango) * pxDia;
  const altoCuerpo = visibles.length * ALTO_FILA;

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
        className="elevacion-1 overflow-x-auto rounded-xl border"
        style={{ borderColor: "var(--borde)" }}
      >
        <div style={{ minWidth: ANCHO_NOMBRES + anchoTiempo }}>
          {/* ---- Cabecera de dos niveles ---- */}
          <div
            className="sticky top-0 z-30 flex"
            style={{ height: ALTO_CABECERA }}
          >
            <div
              className="sticky left-0 z-10 flex shrink-0 items-end border-r border-b px-3 pb-1.5 text-xs font-semibold tracking-wide uppercase"
              style={{
                width: ANCHO_NOMBRES,
                borderColor: "var(--borde)",
                backgroundColor: "var(--superficie)",
                opacity: 0.85,
              }}
            >
              Tarea
            </div>
            <div
              className="relative border-b"
              style={{ width: anchoTiempo, borderColor: "var(--borde)", backgroundColor: "var(--superficie)" }}
            >
              {/* Nivel 1: semanas o meses */}
              {bandas.map((b, i) => (
                <div
                  key={i}
                  className="absolute top-0 flex items-center justify-center overflow-hidden border-r text-xs font-medium whitespace-nowrap"
                  style={{
                    left: b.x * pxDia,
                    width: b.ancho * pxDia,
                    height: ALTO_CABECERA / 2,
                    borderColor: "var(--borde)",
                    backgroundColor: b.par
                      ? "color-mix(in oklab, var(--color-marca-500) 12%, var(--superficie))"
                      : "color-mix(in oklab, var(--color-marca-500) 5%, var(--superficie))",
                  }}
                >
                  {b.ancho * pxDia > 34 ? b.etiqueta : ""}
                </div>
              ))}
              {/* Nivel 2: dias o comienzos de semana */}
              {ticks.map((t, i) => (
                <div
                  key={i}
                  className="absolute flex items-center justify-center text-[10px] tabular-nums opacity-55"
                  style={{
                    left: t.x * pxDia,
                    top: ALTO_CABECERA / 2,
                    width: porMeses ? undefined : pxDia,
                    height: ALTO_CABECERA / 2,
                  }}
                >
                  {porMeses || pxDia >= 12 ? t.etiqueta : ""}
                </div>
              ))}
            </div>
          </div>

          {/* ---- Cuerpo ---- */}
          <div className="relative">
            {/* Columnas sombreadas de fondo: fin de semana (corto) o bandas
                alternas (largo), cruzando todas las filas. */}
            <div
              className="pointer-events-none absolute top-0 z-0"
              style={{ left: ANCHO_NOMBRES, width: anchoTiempo, height: altoCuerpo }}
              aria-hidden="true"
            >
              {porMeses
                ? bandas
                    .filter((b) => b.par)
                    .map((b, i) => (
                      <div
                        key={i}
                        className="absolute top-0 h-full"
                        style={{
                          left: b.x * pxDia,
                          width: b.ancho * pxDia,
                          backgroundColor: "color-mix(in oklab, var(--texto) 4%, transparent)",
                        }}
                      />
                    ))
                : ticks
                    .filter((t) => t.finDeSemana)
                    .map((t, i) => (
                      <div
                        key={i}
                        className="absolute top-0 h-full"
                        style={{
                          left: t.x * pxDia,
                          width: pxDia,
                          backgroundColor: "color-mix(in oklab, var(--texto) 5%, transparent)",
                        }}
                      />
                    ))}
            </div>

            {visibles.map((t, idx) => (
              <Fila
                key={t.uid}
                tarea={t}
                indice={idx}
                rango={rango}
                pxDia={pxDia}
                anchoTiempo={anchoTiempo}
                esCapitulo={t.nivel <= nivelCapitulo && t.esResumen}
                plegable={plegables.has(t.uid)}
                colapsado={colapsados.has(t.uid)}
                onAlternar={() => alternar(t.uid)}
                base={barraLineaBase(basePorUid.get(t.uid), rango)}
                onSeñalar={() => setSeñalada(t.uid)}
                onSoltar={() => setSeñalada((s) => (s === t.uid ? null : s))}
              />
            ))}

            {/* Las flechas, por encima de las barras y sin robar el raton: el
                clic del plegado tiene que seguir llegando a la fila. */}
            {flechas.length > 0 && (
              <Flechas
                flechas={flechas}
                señalada={señalada}
                pxDia={pxDia}
                izquierda={ANCHO_NOMBRES}
                ancho={anchoTiempo}
                alto={altoCuerpo}
              />
            )}

            {/* Linea de corte, sobre las barras. */}
            {xCorte >= 0 && xCorte <= anchoTiempo && (
              <div
                className="pointer-events-none absolute top-0 z-20"
                style={{ left: ANCHO_NOMBRES + xCorte, height: altoCuerpo }}
                aria-hidden="true"
              >
                <div
                  className="h-full"
                  style={{ width: 2, backgroundColor: "var(--color-peligro)", opacity: 0.65 }}
                />
              </div>
            )}
          </div>
        </div>
      </div>

      <p className="mt-2 text-xs opacity-60">
        La línea roja marca el corte ({fechaCorta(fechaCorte)}). El relleno de
        cada barra es su avance real; el número al final, el porcentaje.
      </p>
    </div>
  );
}

function Fila({
  tarea,
  indice,
  rango,
  pxDia,
  anchoTiempo,
  esCapitulo,
  plegable,
  colapsado,
  onAlternar,
  base,
  onSeñalar,
  onSoltar,
}: {
  tarea: TareaGantt;
  indice: number;
  rango: RangoGantt;
  pxDia: number;
  anchoTiempo: number;
  esCapitulo: boolean;
  plegable: boolean;
  colapsado: boolean;
  onAlternar: () => void;
  /// Donde estaba la tarea en la linea base, o null si no estaba en ella.
  base: { x: number; ancho: number } | null;
  onSeñalar: () => void;
  onSoltar: () => void;
}) {
  const b = geometriaBarra(tarea, rango);
  const izquierda = b.x * pxDia;
  const ancho = b.ancho * pxDia;
  const real = Number(tarea.porcentajeReal) || 0;
  const plan = Number(tarea.porcentajePlaneado) || 0;
  const color = tarea.esCritico ? "var(--color-peligro)" : "var(--color-marca-500)";

  // Zebra suave, para seguir la fila hasta su barra sin perder el renglon.
  const fondoFila = esCapitulo
    ? "color-mix(in oklab, var(--color-marca-500) 14%, var(--superficie))"
    : indice % 2 === 0
      ? "var(--superficie)"
      : "color-mix(in oklab, var(--texto) 3%, var(--superficie))";

  const tooltip = `${tarea.codigo ? tarea.codigo + " " : ""}${tarea.nombre}\n${fechaCorta(tarea.inicio)} – ${fechaCorta(tarea.fin)}\nReal ${real.toFixed(0)}% · Plan ${plan.toFixed(0)}%${tarea.esCritico ? "\nRuta crítica" : ""}`;

  return (
    <div
      className="relative z-10 flex"
      style={{ height: ALTO_FILA }}
      onMouseEnter={onSeñalar}
      onMouseLeave={onSoltar}
      // Con el teclado tambien: recorrer el Gantt tabulando tiene que enseñar
      // las mismas ataduras que pasar el raton.
      onFocus={onSeñalar}
      onBlur={onSoltar}
    >
      {/* Nombre */}
      <div
        className="sticky left-0 z-10 flex shrink-0 items-center gap-1 border-r border-b"
        style={{
          width: ANCHO_NOMBRES,
          paddingLeft: 8 + (tarea.nivel - 1) * 14,
          paddingRight: 8,
          borderColor: "var(--borde)",
          backgroundColor: fondoFila,
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
          className={`truncate text-xs ${esCapitulo ? "font-semibold" : tarea.esResumen ? "font-medium" : ""}`}
          title={`${tarea.codigo ? tarea.codigo + " " : ""}${tarea.nombre}`}
        >
          {tarea.codigo && (
            <span className="opacity-55 tabular-nums">{tarea.codigo} </span>
          )}
          {tarea.nombre}
        </span>
      </div>

      {/* Carril de tiempo */}
      <div
        className="relative border-b"
        style={{
          width: anchoTiempo,
          borderColor: "var(--borde)",
          backgroundColor: esCapitulo
            ? "color-mix(in oklab, var(--color-marca-500) 6%, transparent)"
            : undefined,
        }}
        title={tooltip}
      >
        {/* La linea base, DEBAJO de la barra viva y mas fina: se lee de un
            vistazo cuanto se ha corrido la tarea desde que se congelo el
            plan. Va primero para que la barra viva quede por encima. */}
        {base && !tarea.esHito && (
          <div
            className="absolute rounded-sm"
            style={{
              left: base.x * pxDia,
              width: base.ancho * pxDia,
              top: ALTO_FILA / 2 + 9,
              height: 4,
              backgroundColor: "color-mix(in oklab, var(--texto) 35%, transparent)",
            }}
            title={`Línea base: ${base.ancho} día(s)`}
          />
        )}

        {tarea.esHito ? (
          <Rombo left={izquierda} color={color} />
        ) : tarea.esResumen ? (
          <BarraResumen left={izquierda} ancho={ancho} />
        ) : (
          <BarraTarea
            left={izquierda}
            ancho={ancho}
            relleno={b.relleno * pxDia}
            real={real}
            color={color}
          />
        )}
      </div>
    </div>
  );
}

/** Barra de una tarea: fondo tenue = plan; relleno solido = %real; %al final. */
function BarraTarea({
  left,
  ancho,
  relleno,
  real,
  color,
}: {
  left: number;
  ancho: number;
  relleno: number;
  real: number;
  color: string;
}) {
  return (
    <>
      <div
        className="absolute top-1/2 -translate-y-1/2 overflow-hidden rounded-md shadow-sm"
        style={{
          left,
          width: ancho,
          height: 16,
          backgroundColor: `color-mix(in oklab, ${color} 20%, var(--superficie))`,
          border: `1px solid color-mix(in oklab, ${color} 50%, transparent)`,
        }}
      >
        <div
          className="h-full"
          style={{
            width: relleno,
            background: `linear-gradient(180deg, color-mix(in oklab, ${color} 88%, white) 0%, ${color} 100%)`,
          }}
        />
      </div>
      {/* El % al final de la barra, si cabe algo de sitio a la derecha. */}
      {ancho >= 22 && (
        <span
          className="absolute top-1/2 -translate-y-1/2 text-[10px] font-medium tabular-nums opacity-70"
          style={{ left: left + ancho + 4 }}
        >
          {real.toFixed(0)}%
        </span>
      )}
    </>
  );
}

/** El resumen de un capitulo: barra fina con remates, abarca a sus hijas. */
function BarraResumen({ left, ancho }: { left: number; ancho: number }) {
  return (
    <div
      className="absolute top-1/2 -translate-y-1/2"
      style={{ left, width: ancho, height: 10 }}
    >
      <div
        className="h-2 rounded-sm"
        style={{ backgroundColor: "var(--texto)", opacity: 0.6 }}
      />
      {/* Remates triangulares en las puntas, el gesto clasico del resumen. */}
      <span
        className="absolute top-2 left-0 size-0"
        style={{
          borderLeft: "4px solid transparent",
          borderRight: "4px solid transparent",
          borderTop: "5px solid var(--texto)",
          opacity: 0.6,
        }}
        aria-hidden="true"
      />
      <span
        className="absolute top-2 right-0 size-0"
        style={{
          borderLeft: "4px solid transparent",
          borderRight: "4px solid transparent",
          borderTop: "5px solid var(--texto)",
          opacity: 0.6,
        }}
        aria-hidden="true"
      />
    </div>
  );
}

/** Un hito: un rombo en su fecha, sin duracion. */
function Rombo({ left, color }: { left: number; color: string }) {
  return (
    <Diamond
      className="absolute top-1/2 size-4 -translate-x-1/2 -translate-y-1/2"
      style={{ left, color, fill: color }}
      aria-hidden="true"
    />
  );
}

function Leyenda() {
  return (
    <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs opacity-70">
      <Muestra color="var(--color-marca-500)" etiqueta="Tarea" />
      <Muestra color="var(--color-peligro)" etiqueta="Ruta crítica" />
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
          className="inline-block h-2 w-5 rounded-sm"
          style={{ backgroundColor: "var(--texto)", opacity: 0.6 }}
          aria-hidden="true"
        />
        Capítulo
      </span>
    </div>
  );
}

function Muestra({ color, etiqueta }: { color: string; etiqueta: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        className="inline-block h-3 w-6 rounded"
        style={{
          background: `linear-gradient(180deg, color-mix(in oklab, ${color} 88%, white), ${color})`,
        }}
        aria-hidden="true"
      />
      {etiqueta}
    </span>
  );
}

/**
 * Las flechas de dependencia, en una capa SVG sobre las barras.
 *
 * SVG y no divs: son polilineas con punta, y componerlas con cajas
 * posicionadas seria un tramo por segmento y una rotacion por punta.
 *
 * `pointer-events: none` es obligatorio, no cosmetico: sin el, la capa tapa
 * toda el area de tiempo y el clic del plegado deja de llegar a la fila.
 *
 * Lo que se ve por defecto son solo las CRITICAS, tenues. Al señalar una fila
 * se resaltan las suyas —de quien depende y a quien arrastra—, que es la
 * pregunta que se le hace a un Gantt cuando algo se mueve.
 */
function Flechas({
  flechas,
  señalada,
  pxDia,
  izquierda,
  ancho,
  alto,
}: {
  flechas: EnlaceGantt[];
  señalada: number | null;
  pxDia: number;
  izquierda: number;
  ancho: number;
  alto: number;
}) {
  const visibles = flechas.filter(
    (f) =>
      f.critica || f.tareaUid === señalada || f.predecesoraUid === señalada,
  );

  return (
    <svg
      className="pointer-events-none absolute top-0 z-20"
      style={{ left: izquierda, width: ancho, height: alto }}
      width={ancho}
      height={alto}
      aria-hidden="true"
    >
      <defs>
        <marker
          id="gantt-punta"
          viewBox="0 0 6 6"
          refX="5"
          refY="3"
          markerWidth="5"
          markerHeight="5"
          orient="auto-start-reverse"
        >
          <path d="M0,0 L6,3 L0,6 z" fill="context-stroke" />
        </marker>
      </defs>

      {visibles.map((f) => {
        const resaltada =
          f.tareaUid === señalada || f.predecesoraUid === señalada;
        const color = f.critica ? "var(--color-peligro)" : "var(--texto)";

        return (
          <polyline
            key={`${f.predecesoraUid}-${f.tareaUid}-${f.tipo}`}
            points={f.puntos
              .map((p) => `${p.x * pxDia},${p.y * ALTO_FILA}`)
              .join(" ")}
            fill="none"
            stroke={color}
            strokeWidth={resaltada ? 1.6 : 1}
            strokeOpacity={resaltada ? 0.9 : 0.35}
            markerEnd="url(#gantt-punta)"
          />
        );
      })}
    </svg>
  );
}
