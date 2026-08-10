"use client";

import { useRef, useState } from "react";
import type { DatosCurva } from "@/services/cronograma.service";
import { ExportarCurva } from "@/components/cronograma/ExportarCurva";
import { fechaCorta, fechaCronograma, fechaLarga } from "@/utils/fechas";
import { decimal } from "@/utils/formato";
import { textoRitmo } from "@/lib/curva-s";

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
 *
 * El cursor vertical se arrastra y va cantando el valor de cada linea en esa
 * fecha. Es lo que convierte el grafico en algo que se consulta —«el 12 de
 * septiembre deberia ir por el 60%»— y no solo en una silueta que se mira.
 */

const ANCHO = 760;
const MARGEN = { arriba: 16, derecha: 20, abajo: 34, izquierda: 46 };
const DIA_MS = 86400000;

// La linea REAL va en un naranja fijo de alto contraste (no depende del tema):
// es la serie que mas importa leer de un vistazo y debe destacar sobre
// cualquier fondo, claro u oscuro.
const NARANJA_REAL = "#ea580c";

type Rango = "semana" | "mes" | "todo" | "personalizado";

interface Punto {
  fecha: Date;
  valor: number;
}

/**
 * Fondos entre los que elegir.
 *
 * No es solo estetica: el fondo elegido viaja al PNG y al PDF, que es donde
 * de verdad importa. «Sin fondo» da una imagen transparente, util para pegarla
 * sobre una diapositiva; pero sobre el fondo oscuro de WhatsApp el texto
 * desaparece, y por eso no es el que viene puesto.
 *
 * Los que fijan `tinta` traen su propio color de texto: si no, al elegir un
 * fondo oscuro estando en tema claro, el grafico saldria negro sobre negro.
 */
const FONDOS = [
  { id: "papel", etiqueta: "Papel", color: "var(--superficie)", tinta: null },
  { id: "blanco", etiqueta: "Blanco", color: "#ffffff", tinta: "#12232e" },
  { id: "crema", etiqueta: "Crema", color: "#fbf7ef", tinta: "#3d3524" },
  { id: "oscuro", etiqueta: "Oscuro", color: "#101b26", tinta: "#e8eef3" },
  {
    id: "marca",
    etiqueta: "Marca",
    color: "color-mix(in oklab, var(--color-marca-600) 14%, var(--superficie))",
    tinta: null,
  },
  { id: "sin", etiqueta: "Sin fondo", color: null, tinta: null },
] as const;

type IdFondo = (typeof FONDOS)[number]["id"];

export function CurvaS({
  datos,
  obraId,
  nombreObra,
  totalTareas,
  totalCriticas,
}: {
  datos: DatosCurva;
  obraId: string;
  nombreObra: string;
  totalTareas: number;
  totalCriticas: number;
}) {
  const [rango, setRango] = useState<Rango>("todo");
  const [ampliada, setAmpliada] = useState(false);
  const [cursor, setCursor] = useState<Date | null>(null);
  const [manual, setManual] = useState<{ desde: string; hasta: string } | null>(null);
  const [fondoId, setFondoId] = useState<IdFondo>("papel");
  const svgRef = useRef<SVGSVGElement>(null);

  const fondo = FONDOS.find((f) => f.id === fondoId) ?? FONDOS[0];
  const tinta = fondo.tinta ?? "var(--texto)";
  const rejilla = fondo.tinta
    ? `color-mix(in oklab, ${fondo.tinta} 28%, transparent)`
    : "var(--borde)";

  if (datos.cortes.length === 0 || datos.plan.length === 0 || !datos.inicio || !datos.fin) {
    return null;
  }

  const ultimoCorte = datos.cortes[datos.cortes.length - 1]!;
  const ventana = calcularVentana(rango, manual, datos.inicio, datos.fin, ultimoCorte.fecha);
  const { desde, hasta } = ventana;

  // La linea real se dibuja por SEMANAS cuando hay muestreo semanal (cadencia);
  // si no, por corte cargado (comportamiento previo). Son {fecha, valor} en
  // ambos casos, asi que el resto del trazado no cambia.
  const serieRealBase: Punto[] =
    datos.realSemanal.length > 0
      ? datos.realSemanal
      : datos.cortes.map((c) => ({ fecha: c.fecha, valor: Number(c.real) || 0 }));
  // La linea real arranca en el INICIO de obra (0%). Sin este ancla, con un
  // solo corte medido la serie tiene un unico punto y no se dibuja ninguna
  // linea —solo un punto suelto—; anclando en el inicio se traza continua desde
  // el 0% del primer dia hasta el ultimo corte.
  const serieReal: Punto[] =
    serieRealBase.length > 0 &&
    serieRealBase[0]!.fecha.getTime() > datos.inicio.getTime()
      ? [{ fecha: datos.inicio, valor: 0 }, ...serieRealBase]
      : serieRealBase;
  const finReal = serieReal[serieReal.length - 1]?.fecha ?? ultimoCorte.fecha;

  const plan = recortar(datos.plan, desde, hasta);
  const proyeccion = recortar(datos.proyeccion, desde, hasta);
  const cortes = datos.cortes.filter((c) => c.fecha >= desde && c.fecha <= hasta);

  // La linea real puede tener MUY pocos puntos (ancla al inicio + corte). En
  // ventanas estrechas (Semana) un filtro seco puede dejar un unico punto y no
  // dibujar ninguna linea; se recorta interpolando los bordes para que siempre
  // trace mientras la serie cubra la ventana.
  const reales: Punto[] = recortarConBordes(serieReal, desde, hasta);
  // Los circulos marcan SOLO mediciones reales (no el ancla ni los bordes
  // interpolados), para no aparentar una medida donde no la hubo.
  const realesMedidos: Punto[] = serieRealBase.filter(
    (p) => p.fecha >= desde && p.fecha <= hasta,
  );

  // Ampliar = ajustar el eje vertical a lo que hay. Con las dos lineas al 10%
  // y el eje hasta 100, el 90% del grafico esta vacio y las curvas se pisan.
  const valores = [...plan, ...proyeccion, ...reales].map((p) => p.valor);
  const maximo = ampliada
    ? Math.min(100, Math.max(5, Math.max(0, ...valores) * 1.15))
    : 100;

  const alto = ampliada ? 380 : 300;
  const anchoUtil = ANCHO - MARGEN.izquierda - MARGEN.derecha;
  const altoUtil = alto - MARGEN.arriba - MARGEN.abajo;

  const t0 = desde.getTime();
  const span = Math.max(DIA_MS, hasta.getTime() - t0);

  const x = (f: Date) => MARGEN.izquierda + ((f.getTime() - t0) / span) * anchoUtil;
  const y = (v: number) =>
    MARGEN.arriba + altoUtil - (Math.min(maximo, Math.max(0, v)) / maximo) * altoUtil;

  const trazo = (puntos: Punto[]) =>
    puntos.map((p) => `${x(p.fecha).toFixed(1)},${y(p.valor).toFixed(1)}`).join(" ");

  const marcas = ampliada
    ? [0, maximo / 4, maximo / 2, (maximo * 3) / 4, maximo]
    : [0, 25, 50, 75, 100];

  const atrasado = Number(ultimoCorte.desfase) < 0;
  const ticks = calcularTicks(desde, hasta);

  // El cursor arranca en la fecha de corte, que es donde estaba la linea fija
  // antes de poder moverla.
  const fechaCursor = cursor ?? ultimoCorte.fecha;
  const dentro = fechaCursor >= desde && fechaCursor <= hasta;

  const lectura = {
    plan: valorEn(datos.plan, fechaCursor),
    real:
      fechaCursor.getTime() <= finReal.getTime()
        ? valorEn(serieReal, fechaCursor)
        : null,
    proyeccion:
      fechaCursor.getTime() >= finReal.getTime()
        ? valorEn(datos.proyeccion, fechaCursor)
        : null,
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
    <figure className="m-0">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Grupo>
          <Opcion activa={rango === "semana"} onClick={() => { setRango("semana"); setManual(null); }}>
            Semana
          </Opcion>
          <Opcion activa={rango === "mes"} onClick={() => { setRango("mes"); setManual(null); }}>
            Mes
          </Opcion>
          <Opcion activa={rango === "todo"} onClick={() => { setRango("todo"); setManual(null); }}>
            Todo el plazo
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

        <span className="flex items-center gap-1.5">
          <span className="text-xs opacity-70">Fondo</span>
          {FONDOS.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setFondoId(f.id)}
              aria-pressed={fondoId === f.id}
              title={
                f.id === "sin"
                  ? "Sin fondo: la imagen sale transparente. Sobre fondo oscuro el texto puede perderse."
                  : f.etiqueta
              }
              className="size-6 rounded-md border"
              style={{
                borderColor:
                  fondoId === f.id ? "var(--color-marca-600)" : "var(--borde)",
                borderWidth: fondoId === f.id ? 2 : 1,
                // El transparente se dibuja con el tablero de ajedrez con que
                // se representa siempre, para que se entienda sin leer nada.
                background:
                  f.color ??
                  "repeating-conic-gradient(color-mix(in oklab, var(--borde) 60%, transparent) 0% 25%, transparent 0% 50%) 0 0 / 8px 8px",
              }}
            >
              <span className="sr-only">{f.etiqueta}</span>
            </button>
          ))}
        </span>

        <label className="flex items-center gap-1.5 text-xs">
          <span className="opacity-70">Del</span>
          <input
            type="date"
            value={iso(desde)}
            min={iso(datos.inicio)}
            max={iso(datos.fin)}
            onChange={(e) => {
              setManual({ desde: e.target.value, hasta: iso(hasta) });
              setRango("personalizado");
            }}
            className="rounded-lg border px-2 py-1 text-xs"
            style={{ borderColor: "var(--borde)", backgroundColor: "var(--fondo)" }}
          />
          <span className="opacity-70">al</span>
          <input
            type="date"
            value={iso(hasta)}
            min={iso(datos.inicio)}
            max={iso(datos.fin)}
            onChange={(e) => {
              setManual({ desde: iso(desde), hasta: e.target.value });
              setRango("personalizado");
            }}
            className="rounded-lg border px-2 py-1 text-xs"
            style={{ borderColor: "var(--borde)", backgroundColor: "var(--fondo)" }}
          />
        </label>
      </div>

      <svg
        ref={svgRef}
        viewBox={`0 0 ${ANCHO} ${alto}`}
        className="h-auto w-full touch-none"
        role="img"
        aria-label={`Curva de avance. Al corte del ${fechaLarga(ultimoCorte.fecha)}, planeado ${decimal(ultimoCorte.planeado)}% y real ${decimal(ultimoCorte.real)}%.`}
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
        // `color` gobierna todo lo que usa `currentColor`, que es como el
        // grafico sigue al tema. Al elegir un fondo con tinta propia se
        // sustituye aqui, y con eso el texto no queda negro sobre negro.
        style={{ color: tinta }}
      >
        {/* El fondo va DENTRO del SVG y no en el contenedor: asi viaja al PNG
            y al PDF, que es donde de verdad hace falta. */}
        {fondo.color && <rect width="100%" height="100%" fill={fondo.color} />}

        {marcas.map((v) => (
          <g key={v}>
            <line
              x1={MARGEN.izquierda}
              x2={ANCHO - MARGEN.derecha}
              y1={y(v)}
              y2={y(v)}
              stroke={rejilla}
              strokeWidth={1}
            />
            <text
              x={MARGEN.izquierda - 8}
              y={y(v) + 4}
              textAnchor="end"
              fontSize={12}
              fontWeight={600}
              fill="currentColor"
              opacity={0.7}
            >
              {v.toFixed(maximo < 20 ? 1 : 0)}%
            </text>
          </g>
        ))}

        {ticks.map((t) => (
          <g key={t.fecha.getTime()}>
            <line
              x1={x(t.fecha)}
              x2={x(t.fecha)}
              y1={alto - MARGEN.abajo}
              y2={alto - MARGEN.abajo + 4}
              stroke={rejilla}
              strokeWidth={1}
            />
            {t.etiqueta && (
              <text
                x={x(t.fecha)}
                y={alto - MARGEN.abajo + 17}
                textAnchor="middle"
                fontSize={11}
                fontWeight={600}
                fill="currentColor"
                opacity={0.7}
              >
                {t.etiqueta}
              </text>
            )}
          </g>
        ))}

        <polyline
          points={trazo(plan)}
          fill="none"
          stroke={tinta}
          strokeWidth={3.5}
          strokeDasharray="8 5"
          strokeLinecap="round"
          opacity={0.75}
        />

        {proyeccion.length > 1 && (
          <polyline
            points={trazo(proyeccion)}
            fill="none"
            stroke={atrasado ? "var(--color-peligro)" : "var(--color-exito)"}
            strokeWidth={3.5}
            strokeDasharray="2 6"
            strokeLinecap="round"
          />
        )}

        {/* El real: linea CONTINUA en naranja de alto contraste, del inicio de
            obra (0%) al ultimo corte medido. No pasa del corte: mas alla no se
            ha medido nada (de ahi sigue la proyeccion). */}
        <polyline
          points={trazo(reales)}
          fill="none"
          stroke={NARANJA_REAL}
          strokeWidth={4.5}
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {realesMedidos.map((p) => (
          <circle
            key={p.fecha.getTime()}
            cx={x(p.fecha)}
            cy={y(p.valor)}
            r={5}
            fill={NARANJA_REAL}
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
            r={4}
            fill={fondo.color ?? "var(--superficie)"}
            stroke={tinta}
            strokeWidth={2}
            opacity={0.8}
          />
        ))}

        {dentro && (
          <g>
            <line
              x1={x(fechaCursor)}
              x2={x(fechaCursor)}
              y1={MARGEN.arriba}
              y2={alto - MARGEN.abajo}
              stroke="var(--color-marca-600)"
              strokeWidth={2}
              strokeDasharray="4 3"
            />
            {lectura.plan !== null && (
              <circle cx={x(fechaCursor)} cy={y(lectura.plan)} r={4} fill={tinta} />
            )}
            {lectura.real !== null && (
              <circle cx={x(fechaCursor)} cy={y(lectura.real)} r={4} fill={NARANJA_REAL} />
            )}
            {lectura.proyeccion !== null && (
              <circle
                cx={x(fechaCursor)}
                cy={y(lectura.proyeccion)}
                r={4}
                fill={atrasado ? "var(--color-peligro)" : "var(--color-exito)"}
              />
            )}
          </g>
        )}
      </svg>

      <figcaption className="mt-3 space-y-2">
        <div
          className="flex flex-wrap items-center gap-x-5 gap-y-2 rounded-lg border p-3 text-sm"
          style={{ borderColor: "var(--borde)" }}
        >
          <span className="font-semibold">{fechaCronograma(fechaCursor)}</span>

          <Leyenda color={NARANJA_REAL} grosor={5}>
            Real{" "}
            <strong className="tabular-nums">
              {lectura.real === null ? "sin medir" : `${lectura.real.toFixed(1)}%`}
            </strong>
          </Leyenda>

          <Leyenda color="var(--texto)" punteada grosor={5}>
            Planeado{" "}
            <strong className="tabular-nums">
              {lectura.plan === null ? "—" : `${lectura.plan.toFixed(1)}%`}
            </strong>
          </Leyenda>

          {lectura.proyeccion !== null && (
            <Leyenda
              color={atrasado ? "var(--color-peligro)" : "var(--color-exito)"}
              punteada
              grosor={5}
            >
              Proyección{" "}
              <strong className="tabular-nums">{lectura.proyeccion.toFixed(1)}%</strong>
            </Leyenda>
          )}

          <span className="ml-auto text-xs opacity-60">
            Arrastra sobre el gráfico para leer cualquier fecha
          </span>
        </div>

        <p className="text-sm">
          Al corte del <strong>{fechaCorta(ultimoCorte.fecha)}</strong>: real{" "}
          <strong>{decimal(ultimoCorte.real)}%</strong> sobre un plan de{" "}
          <strong>{decimal(ultimoCorte.planeado)}%</strong>,{" "}
          <strong style={{ color: atrasado ? "var(--color-peligro)" : "var(--color-exito)" }}>
            {Number(ultimoCorte.desfase) > 0 ? "+" : ""}
            {decimal(ultimoCorte.desfase)}%
          </strong>{" "}
          respecto al plan. Ritmo actual:{" "}
          <strong>{textoRitmo(datos.factor)}%</strong> de lo previsto.{" "}
          {datos.terminoProyectado ? (
            <>
              A este paso la obra terminaría el{" "}
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

        <dl className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
          <Dato etiqueta="Avance real" valor={`${decimal(ultimoCorte.real)}%`} destacado />
          <Dato etiqueta="Planeado" valor={`${decimal(ultimoCorte.planeado)}%`} />
          <Dato
            etiqueta="Desfase"
            valor={`${Number(ultimoCorte.desfase) > 0 ? "+" : ""}${decimal(ultimoCorte.desfase)}%`}
            color={atrasado ? "var(--color-peligro)" : "var(--color-exito)"}
          />
          <Dato etiqueta="Ritmo" valor={`${textoRitmo(datos.factor)}%`} />
          <Dato
            etiqueta="Término proyectado"
            valor={
              datos.terminoProyectado
                ? fechaCorta(datos.terminoProyectado)
                : "fuera de plazo"
            }
            color={
              datos.terminoProyectado && datos.terminoProyectado <= datos.fin
                ? "var(--color-exito)"
                : "var(--color-peligro)"
            }
          />
          <Dato
            etiqueta="Plazo"
            valor={`${fechaCorta(datos.inicio)} a ${fechaCorta(datos.fin)}`}
          />
          <Dato etiqueta="Tareas" valor={String(totalTareas)} />
          <Dato etiqueta="Ruta crítica" valor={`${totalCriticas} tareas`} />
          <Dato etiqueta="Cortes cargados" valor={String(datos.cortes.length)} />
        </dl>

        <p className="text-xs opacity-60">
          Los círculos huecos son el «% Planeado» que trae el archivo en cada
          corte. La línea de puntos es ese mismo plan reconstruido día a día
          para poder dibujarlo entero, así que pueden no coincidir del todo: son
          dos formas de repartir el mismo trabajo en el tiempo.
        </p>

        <ExportarCurva
          obraId={obraId}
          grafico={svgRef}
          resumen={{
            obra: nombreObra,
            corte: fechaCorta(ultimoCorte.fecha),
            planeado: decimal(ultimoCorte.planeado),
            real: decimal(ultimoCorte.real),
            desfase: `${Number(ultimoCorte.desfase) > 0 ? "+" : ""}${decimal(ultimoCorte.desfase)}`,
            ritmo: `${textoRitmo(datos.factor)}%`,
            termino: datos.terminoProyectado
              ? fechaCorta(datos.terminoProyectado)
              : `no se llega al 100% antes del ${fechaCorta(datos.fin)}`,
          }}
        />
      </figcaption>
    </figure>
  );
}

/**
 * Una cifra de la cabecera.
 *
 * El degradado va del color propio del dato a la superficie de la tarjeta, en
 * una diagonal: asi la cifra queda sobre la parte mas saturada y la etiqueta
 * sobre la mas clara, que es lo que le da el contraste. Cuando el dato no
 * tiene color propio se tine con el de marca, para que la rejilla se lea como
 * un bloque y no como nueve cajas sueltas.
 *
 * La sombra se proyecta a la derecha y abajo, con el borde superior claro:
 * es lo que hace que la tarjeta parezca levantada y no pegada.
 */
function Dato({
  etiqueta,
  valor,
  destacado,
  color,
}: {
  etiqueta: string;
  valor: string;
  destacado?: boolean;
  color?: string;
}) {
  const tinte = color ?? "var(--color-marca-600)";

  return (
    <div
      className="rounded-xl border px-3 py-2.5"
      style={{
        borderColor: `color-mix(in oklab, ${tinte} 35%, var(--borde))`,
        backgroundImage: `linear-gradient(135deg, color-mix(in oklab, ${tinte} 18%, var(--superficie)) 0%, var(--superficie) 75%)`,
        boxShadow:
          "3px 4px 10px -2px color-mix(in oklab, #000 35%, transparent), inset 0 1px 0 color-mix(in oklab, #fff 25%, transparent)",
      }}
    >
      <dt className="text-xs font-medium opacity-75">{etiqueta}</dt>
      <dd
        className={`mt-0.5 tabular-nums ${destacado ? "text-xl font-bold" : "text-base font-bold"}`}
        style={color ? { color } : undefined}
      >
        {valor}
      </dd>
    </div>
  );
}

/** "YYYY-MM-DD" de una fecha de calendario guardada a medianoche UTC. */
function iso(f: Date): string {
  return f.toISOString().slice(0, 10);
}

function aFecha(texto: string): Date {
  return new Date(`${texto}T00:00:00Z`);
}

/**
 * La ventana de fechas que se dibuja.
 *
 * «Semana» y «mes» se cuentan hacia atras desde la FECHA DE CORTE y no desde
 * hoy: el corte es la ultima foto real que existe, y encuadrar en una fecha
 * sin datos dejaria el grafico vacio justo cuando se quiere mirar de cerca.
 */
function calcularVentana(
  rango: Rango,
  manual: { desde: string; hasta: string } | null,
  inicio: Date,
  fin: Date,
  corte: Date,
): { desde: Date; hasta: Date } {
  if (rango === "personalizado" && manual) {
    const d = aFecha(manual.desde);
    const h = aFecha(manual.hasta);
    // Si el usuario cruza las fechas se respeta el orden en vez de dibujar un
    // eje invertido, que se lee como si el tiempo fuera hacia atras.
    return d <= h ? { desde: d, hasta: h } : { desde: h, hasta: d };
  }

  if (rango === "semana") {
    return {
      desde: new Date(Math.max(inicio.getTime(), corte.getTime() - 6 * DIA_MS)),
      hasta: new Date(Math.min(fin.getTime(), corte.getTime() + DIA_MS)),
    };
  }

  if (rango === "mes") {
    return {
      desde: new Date(Math.max(inicio.getTime(), corte.getTime() - 29 * DIA_MS)),
      hasta: new Date(Math.min(fin.getTime(), corte.getTime() + DIA_MS)),
    };
  }

  return { desde: inicio, hasta: fin };
}

function recortar(puntos: readonly Punto[], desde: Date, hasta: Date): Punto[] {
  return puntos.filter((p) => p.fecha >= desde && p.fecha <= hasta);
}

/**
 * Como `recortar`, pero garantiza continuidad: si la serie cubre el borde de la
 * ventana, anade un punto INTERPOLADO en `desde` y/o `hasta`. Asi una serie de
 * pocos puntos (la real) no queda reducida a uno solo —y sin linea— al hacer
 * zoom a una ventana estrecha. No extrapola: si el borde cae fuera del tramo
 * cubierto, `valorEn` devuelve null y no se anade.
 */
function recortarConBordes(serie: readonly Punto[], desde: Date, hasta: Date): Punto[] {
  const interior = serie.filter((p) => p.fecha >= desde && p.fecha <= hasta);
  const salida: Punto[] = [];

  const vDesde = valorEn(serie, desde);
  if (
    vDesde !== null &&
    (interior.length === 0 || interior[0]!.fecha.getTime() > desde.getTime())
  ) {
    salida.push({ fecha: desde, valor: vDesde });
  }
  salida.push(...interior);
  const vHasta = valorEn(serie, hasta);
  if (
    vHasta !== null &&
    (interior.length === 0 ||
      interior[interior.length - 1]!.fecha.getTime() < hasta.getTime())
  ) {
    salida.push({ fecha: hasta, valor: vHasta });
  }
  return salida;
}

/**
 * Marcas del eje horizontal: SIEMPRE una por dia.
 *
 * Lo que cambia con el zoom es la etiqueta, no la marca. En una semana cabe
 * la fecha entera; en un mes solo el numero del dia; en el plazo completo se
 * etiqueta una de cada tantas. Etiquetarlas todas en un plazo largo las
 * amontona hasta volverlas ilegibles, que es lo contrario de informar.
 */
function calcularTicks(
  desde: Date,
  hasta: Date,
): { fecha: Date; etiqueta: string | null }[] {
  const dias = Math.max(1, Math.round((hasta.getTime() - desde.getTime()) / DIA_MS));

  // En plazos muy largos ni siquiera se pinta una marca por dia: se veria una
  // banda gris continua.
  const pasoMarca = dias > 120 ? Math.ceil(dias / 120) : 1;
  const cadaEtiqueta = dias <= 45 ? 1 : Math.ceil(dias / 8);

  const marcas: { fecha: Date; etiqueta: string | null }[] = [];

  for (let d = 0; d <= dias; d += pasoMarca) {
    const fecha = new Date(desde.getTime() + d * DIA_MS);
    const toca = d % cadaEtiqueta === 0;

    marcas.push({
      fecha,
      etiqueta: !toca
        ? null
        : dias <= 16
          ? `${fecha.getUTCDate()}/${fecha.getUTCMonth() + 1}`
          : dias <= 45
            ? String(fecha.getUTCDate())
            : `${String(fecha.getUTCDate()).padStart(2, "0")}/${String(fecha.getUTCMonth() + 1).padStart(2, "0")}`,
    });
  }

  return marcas;
}

/**
 * Valor de una serie en una fecha cualquiera, interpolando entre los puntos
 * que la rodean.
 *
 * Devuelve null fuera del tramo cubierto por la serie: extrapolar la linea
 * real mas alla del ultimo corte seria inventar una medicion.
 */
function valorEn(puntos: readonly Punto[], fecha: Date): number | null {
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
      className="px-3 py-1.5 text-xs font-semibold"
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
  grosor = 3,
  children,
}: {
  color: string;
  punteada?: boolean;
  grosor?: number;
  children: React.ReactNode;
}) {
  return (
    <span className="inline-flex items-center gap-2">
      <span
        className="inline-block w-7 shrink-0 rounded-full"
        style={{
          height: grosor,
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
