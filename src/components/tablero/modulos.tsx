"use client";

import {
  TrendingUp,
  CalendarClock,
  Wallet,
  AlertTriangle,
  Link2,
  Layers,
  FileText,
  ClipboardCheck,
  Telescope,
  Ban,
  Gauge,
} from "lucide-react";
import type { DefinicionModulo } from "@/lib/tablero";
import {
  COLOR_SEMAFORO,
  semaforoDesfase,
  semaforoIndice,
  type Semaforo,
} from "@/lib/tablero";
import { textoSinCosto } from "@/lib/evm";
import type {
  DatosTablero,
  DatosCronogramaTablero,
  DatosPlanSemanalTablero,
  DatosLookaheadTablero,
  PuntoMini,
} from "@/services/tablero.service";
import { ETIQUETA_CNC } from "@/lib/plan-semanal";
import { soles } from "@/utils/formato";
import { conSignoFijo, redondearA } from "@/lib/redondeo";
import { EnlaceModulo } from "@/components/tablero/Tablero";

/**
 * Cada modulo del tablero, elegido por su clave.
 *
 * Todos comparten la misma caja —titulo, cuerpo y enlace al pie— para que la
 * rejilla se lea como una rejilla y no como ocho recuadros distintos. El
 * ancho lo decide el catalogo: la curva ocupa dos columnas porque una linea
 * en una sola es ilegible.
 *
 * Que modulos llegan a pintarse lo decide antes `moduloConDatos`, aqui debajo.
 */

/**
 * Si un modulo tiene con que pintarse.
 *
 * Sin esto se dibujaba la CAJA VACIA: un recuadro con borde y nada dentro,
 * que no se lee como "aqui no hay datos" sino como "esto se ha roto". Pasaba
 * con quien no tiene permiso de ordenes, y volvio a pasar al apagar los
 * modulos de Last Planner.
 *
 * Vive aqui, pegado a las guardas de `ModuloContenido`, para que las dos no
 * puedan discrepar: si una dice que hay datos y la otra no los pinta, se
 * vuelve al recuadro vacio.
 */
export function moduloConDatos(
  clave: DefinicionModulo["clave"],
  datos: DatosTablero,
): boolean {
  switch (clave) {
    case "avance":
    case "curva":
    case "atrasos":
    case "criticas":
    case "capitulos":
      return datos.cronograma !== null;
    case "ordenes":
      return datos.ordenes !== null;
    case "ppc":
    case "causas":
      return datos.planSemanal !== null;
    case "confiabilidad":
      return datos.lookahead !== null;
    case "valorGanado":
      return datos.valorGanado !== null;
    default:
      // Plazo y presupuesto salen de la propia obra: siempre hay algo.
      return true;
  }
}

/** El contenido de un modulo, elegido por su clave. */
export function ModuloContenido({
  modulo,
  datos,
}: {
  modulo: DefinicionModulo;
  datos: DatosTablero;
}) {
  const obraId = datos.obra.id;

  return (
    <Caja ancho={modulo.ancho}>
      {modulo.clave === "avance" && datos.cronograma && (
        <Avance crono={datos.cronograma} obraId={obraId} />
      )}
      {modulo.clave === "curva" && datos.cronograma && (
        <Curva crono={datos.cronograma} obraId={obraId} />
      )}
      {modulo.clave === "plazo" && <Plazo datos={datos} obraId={obraId} />}
      {modulo.clave === "presupuesto" && (
        <Presupuesto datos={datos} obraId={obraId} />
      )}
      {modulo.clave === "valorGanado" && datos.valorGanado && (
        <ValorGanado vg={datos.valorGanado} obraId={obraId} />
      )}
      {modulo.clave === "ppc" && datos.planSemanal && (
        <Ppc plan={datos.planSemanal} obraId={obraId} />
      )}
      {modulo.clave === "confiabilidad" && datos.lookahead && (
        <Confiabilidad lk={datos.lookahead} obraId={obraId} />
      )}
      {modulo.clave === "causas" && datos.planSemanal && (
        <Causas plan={datos.planSemanal} obraId={obraId} />
      )}
      {modulo.clave === "atrasos" && datos.cronograma && (
        <Atrasos crono={datos.cronograma} obraId={obraId} />
      )}
      {modulo.clave === "criticas" && datos.cronograma && (
        <Criticas crono={datos.cronograma} obraId={obraId} />
      )}
      {modulo.clave === "capitulos" && datos.cronograma && (
        <Capitulos crono={datos.cronograma} obraId={obraId} />
      )}
      {modulo.clave === "ordenes" && datos.ordenes && (
        <Ordenes ordenes={datos.ordenes} obraId={obraId} />
      )}
    </Caja>
  );
}

/**
 * La caja comun. `elevacion-1` y borde para que cada modulo se despegue del
 * fondo de la tarjeta ancha que los contiene, y `flex` en columna para que el
 * enlace del pie quede siempre abajo por muy distinto que sea el cuerpo.
 */
function Caja({
  ancho,
  children,
}: {
  ancho: 1 | 2;
  children: React.ReactNode;
}) {
  return (
    <div
      className={`elevacion-1 flex h-full flex-col rounded-xl border p-3 ${
        ancho === 2 ? "sm:col-span-2 lg:col-span-2" : ""
      }`}
      style={{
        borderColor: "var(--borde)",
        backgroundColor: "var(--superficie)",
      }}
    >
      {children}
    </div>
  );
}

function Titulo({
  icono: Icono,
  children,
}: {
  icono: typeof Wallet;
  children: React.ReactNode;
}) {
  return (
    <h3 className="flex items-center gap-1.5 text-xs font-medium opacity-70">
      <Icono
        className="size-3.5 shrink-0"
        style={{ color: "var(--color-marca-500)" }}
        aria-hidden="true"
      />
      {children}
    </h3>
  );
}

// ---------------------------------------------------------------------------
// Avance fisico
// ---------------------------------------------------------------------------

function Avance({
  crono,
  obraId,
}: {
  crono: DatosCronogramaTablero;
  obraId: string;
}) {
  // El semaforo y el texto se deciden sobre el desfase REDONDEADO al decimal
  // que se ensena: -0.04 puntos salia "-0.0 pts" en ambar, que es pintar de
  // aviso una diferencia que la propia cifra dice que no existe.
  const desfase = redondearA(crono.desfase, 1);
  const semaforo = semaforoDesfase(desfase);

  return (
    <>
      <Titulo icono={TrendingUp}>Avance fisico</Titulo>

      <div className="mt-2">
        <p
          className="text-2xl font-semibold tabular-nums"
          style={{ color: COLOR_SEMAFORO[semaforo] }}
        >
          {crono.real.toFixed(1)}%
        </p>
        <p className="text-xs opacity-60">
          Plan {crono.planeado.toFixed(1)}% ·{" "}
          <span style={{ color: COLOR_SEMAFORO[semaforo] }}>
            {desfase === 0 ? "al dia" : `${conSignoFijo(desfase, 1)} puntos`}
          </span>
        </p>
      </div>

      <BarraConMarca
        valor={crono.real}
        marca={crono.planeado}
        color={COLOR_SEMAFORO[semaforo]}
      />

      <EnlaceModulo href={`/obras/${obraId}/cronograma`}>
        Ver cronograma
      </EnlaceModulo>
    </>
  );
}

/** Barra de progreso con la marca del plan encima, como en la tarjeta de obra. */
function BarraConMarca({
  valor,
  marca,
  color,
}: {
  valor: number;
  marca: number;
  color: string;
}) {
  return (
    <div
      className="relative mt-2 h-2 overflow-hidden rounded-full"
      style={{ backgroundColor: "var(--borde)" }}
    >
      <div
        className="h-full rounded-full"
        style={{ width: `${Math.min(valor, 100)}%`, backgroundColor: color }}
      />
      <span
        aria-hidden="true"
        className="absolute inset-y-0 w-0.5"
        style={{
          left: `calc(${Math.min(Math.max(marca, 0), 100)}% - 1px)`,
          backgroundColor: "var(--texto)",
          opacity: 0.7,
        }}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Curva de avance en miniatura
// ---------------------------------------------------------------------------

function Curva({
  crono,
  obraId,
}: {
  crono: DatosCronogramaTablero;
  obraId: string;
}) {
  const { plan, real } = crono.curva;

  const ultimoReal =
    real.length > 0 ? real[real.length - 1]!.v.toFixed(1) : "0";

  return (
    <>
      <Titulo icono={TrendingUp}>Curva de avance</Titulo>

      <MiniCurva curva={crono.curva} />

      <div className="mt-1.5 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs opacity-70">
        <Trazo color="var(--color-marca-500)" etiqueta="Plan" />
        <Trazo color="var(--color-exito)" etiqueta="Real" />
        <Trazo color="var(--color-alerta)" etiqueta="Proy." discontinuo />
      </div>

      <p className="mt-1.5 text-xs opacity-70">
        Real <span className="font-semibold">{ultimoReal}%</span> a la fecha de
        corte.
      </p>

      {crono.curva.termino && crono.curva.diasDeMas !== null && (
        <p className="text-xs opacity-60">
          Termino proyectado {crono.curva.termino}
          {crono.curva.diasDeMas !== 0 && (
            <span
              style={{
                color:
                  crono.curva.diasDeMas > 0
                    ? "var(--color-peligro)"
                    : "var(--color-exito)",
              }}
            >
              {" "}
              ({crono.curva.diasDeMas > 0 ? "+" : ""}
              {crono.curva.diasDeMas} d)
            </span>
          )}
        </p>
      )}

      {plan.length === 0 && (
        <p className="mt-1 text-xs opacity-50">
          Sin plan continuo: el corte no trae tareas con duracion.
        </p>
      )}

      <EnlaceModulo href={`/obras/${obraId}/cronograma`}>
        Ver curva completa
      </EnlaceModulo>
    </>
  );
}

function Trazo({
  color,
  etiqueta,
  discontinuo,
}: {
  color: string;
  etiqueta: string;
  discontinuo?: boolean;
}) {
  return (
    <span className="inline-flex items-center gap-1">
      <span
        aria-hidden="true"
        className="inline-block h-0 w-3"
        style={{
          borderTop: `2px ${discontinuo ? "dashed" : "solid"} ${color}`,
        }}
      />
      {etiqueta}
    </span>
  );
}

/**
 * La curva en un SVG de 100x40 unidades, con `preserveAspectRatio=none` para
 * que estire a lo ancho del modulo. El eje Y se invierte —0% abajo, 100%
 * arriba— restando de la altura.
 */
function MiniCurva({ curva }: { curva: DatosCronogramaTablero["curva"] }) {
  const ALTO = 40;
  const y = (v: number) => ALTO - (v / 100) * ALTO;
  const punto = (p: PuntoMini) => `${p.t * 100},${y(p.v)}`;
  const linea = (puntos: readonly PuntoMini[]) => puntos.map(punto).join(" ");

  // El area bajo la linea real: cierra la poligonal contra el eje inferior
  // para que «lo ejecutado hasta hoy» se vea aunque sea poco, en vez de una
  // linea fina perdida en la esquina.
  const areaReal =
    curva.real.length > 1
      ? `${linea(curva.real)} ${curva.real[curva.real.length - 1]!.t * 100},${ALTO} ${curva.real[0]!.t * 100},${ALTO}`
      : "";

  return (
    <svg
      viewBox={`0 0 100 ${ALTO}`}
      preserveAspectRatio="none"
      className="mt-2 h-20 w-full"
      role="img"
      aria-label="Curva de avance: plan, real y proyeccion, de inicio a fin de obra"
    >
      {/* Rejilla ligera al 25/50/75% para dar referencia de altura. */}
      {[0.25, 0.5, 0.75].map((f) => (
        <line
          key={f}
          x1="0"
          x2="100"
          y1={ALTO - f * ALTO}
          y2={ALTO - f * ALTO}
          stroke="var(--borde)"
          strokeWidth="0.5"
          vectorEffect="non-scaling-stroke"
        />
      ))}

      {areaReal && (
        <polygon
          points={areaReal}
          fill="var(--color-exito)"
          opacity="0.14"
        />
      )}

      {/* La fecha de corte: a su izquierda esta lo MEDIDO (real), a su derecha
          lo ESTIMADO (proyeccion). El plan cruza toda la obra, de inicio a
          fin. */}
      {curva.plan.length > 0 && (
        <line
          x1={curva.tCorte * 100}
          x2={curva.tCorte * 100}
          y1="0"
          y2={ALTO}
          stroke="var(--texto)"
          strokeWidth="0.75"
          strokeDasharray="2 2"
          opacity="0.5"
          vectorEffect="non-scaling-stroke"
        />
      )}

      {curva.plan.length > 1 && (
        <polyline
          points={linea(curva.plan)}
          fill="none"
          stroke="var(--color-marca-500)"
          strokeWidth="2"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
      )}

      {curva.proyeccion.length > 1 && (
        <polyline
          points={linea(curva.proyeccion)}
          fill="none"
          stroke="var(--color-alerta)"
          strokeWidth="2"
          strokeDasharray="3 2"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
      )}

      {curva.real.length > 1 && (
        <polyline
          points={linea(curva.real)}
          fill="none"
          stroke="var(--color-exito)"
          strokeWidth="2.5"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
      )}

      {/* Solo los cortes MEDIDOS llevan punto —el (0,0) de anclaje no es un
          dato reportado, asi que se salta—. */}
      {curva.real.slice(1).map((p, i) => (
        <circle
          key={i}
          cx={p.t * 100}
          cy={y(p.v)}
          r="1.6"
          fill="var(--color-exito)"
          vectorEffect="non-scaling-stroke"
        />
      ))}
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Plazo
// ---------------------------------------------------------------------------

function Plazo({ datos, obraId }: { datos: DatosTablero; obraId: string }) {
  const { plazo } = datos;
  const vencido = plazo.restantes < 0;

  return (
    <>
      <Titulo icono={CalendarClock}>Plazo</Titulo>

      <div className="mt-2">
        <p className="text-2xl font-semibold tabular-nums">
          {vencido ? (
            <span style={{ color: "var(--color-peligro)" }}>
              +{Math.abs(plazo.restantes)} d
            </span>
          ) : (
            `${plazo.restantes} d`
          )}
        </p>
        <p className="text-xs opacity-60">
          {vencido
            ? "pasados del plazo de la obra"
            : "restantes del plazo de la obra"}
          {/* Los dias que de verdad se trabaja. Un plazo de 56 dias con 42
              laborables no da 56 jornadas de cuadrilla, y es sobre esas
              jornadas sobre las que se planifica. */}
          {!vencido && plazo.laborablesRestantes !== null && (
            <>
              {" · "}
              <strong className="tabular-nums">
                {plazo.laborablesRestantes}
              </strong>{" "}
              laborables
            </>
          )}
        </p>
      </div>

      <div
        className="relative mt-2 h-2 overflow-hidden rounded-full"
        style={{ backgroundColor: "var(--borde)" }}
      >
        <div
          className="h-full rounded-full"
          style={{
            width: `${Math.min(plazo.porcentaje, 100)}%`,
            backgroundColor: vencido
              ? "var(--color-peligro)"
              : "var(--color-marca-500)",
          }}
        />
      </div>

      <p className="mt-1.5 text-xs opacity-60">
        {plazo.inicio} – {plazo.fin}
      </p>

      {/* La discrepancia ficha↔cronograma, solo si la hay: de la ficha salen
          la barra y el aviso de vencido, asi que si difiere hay que verlo. */}
      {plazo.desvioFicha !== null &&
        Math.abs(plazo.desvioFicha) > 2 &&
        plazo.finCronograma && (
          <p
            className="mt-1 text-xs"
            style={{ color: "var(--color-alerta)" }}
          >
            El cronograma termina el {plazo.finCronograma} (
            {plazo.desvioFicha > 0 ? "+" : ""}
            {plazo.desvioFicha} d).
          </p>
        )}

      <EnlaceModulo href={`/obras/${obraId}`}>Ver obra</EnlaceModulo>
    </>
  );
}

// ---------------------------------------------------------------------------
// Presupuesto
// ---------------------------------------------------------------------------

function Presupuesto({
  datos,
  obraId,
}: {
  datos: DatosTablero;
  obraId: string;
}) {
  const { presupuesto } = datos;
  const pasado = presupuesto.porcentaje > 100;

  return (
    <>
      <Titulo icono={Wallet}>Presupuesto</Titulo>

      <div className="mt-2">
        <p className="text-lg font-semibold tabular-nums">
          {soles(presupuesto.saldo)}
        </p>
        <p className="text-xs opacity-60">saldo disponible</p>
      </div>

      <div
        className="mt-2 h-2 overflow-hidden rounded-full"
        style={{ backgroundColor: "var(--borde)" }}
      >
        <div
          className="h-full rounded-full"
          style={{
            width: `${Math.min(presupuesto.porcentaje, 100)}%`,
            backgroundColor: pasado
              ? "var(--color-peligro)"
              : "var(--color-exito)",
          }}
        />
      </div>

      <p className="mt-1.5 text-xs opacity-60">
        Comprometido {soles(presupuesto.comprometido)} de{" "}
        {soles(presupuesto.total)}
      </p>

      {presupuesto.sobregiradas > 0 && (
        <p className="mt-1 text-xs" style={{ color: "var(--color-peligro)" }}>
          {presupuesto.sobregiradas === 1
            ? "1 partida sobregirada"
            : `${presupuesto.sobregiradas} partidas sobregiradas`}
        </p>
      )}

      <EnlaceModulo href={`/obras/${obraId}/ordenes`}>
        Ver ordenes
      </EnlaceModulo>
    </>
  );
}

// ---------------------------------------------------------------------------
// Valor ganado (EVM) en resumen
// ---------------------------------------------------------------------------

/**
 * SPI y CPI de un vistazo: la unica cifra del tablero que junta plazo y
 * COSTO. Vivia escondida en Cronograma → EVM, y es justo la que un gerente
 * quiere ver al abrir el panel.
 *
 * Con la misma compuerta honesta del panel EVM: sin base de costo, el CPI no
 * se inventa —se explica el hueco con `textoSinCosto`—.
 */
function ValorGanado({
  vg,
  obraId,
}: {
  vg: NonNullable<DatosTablero["valorGanado"]>;
  obraId: string;
}) {
  const m = vg.metricas;
  const svNum = Number(m.sv);

  return (
    <>
      <Titulo icono={Gauge}>Valor ganado (EVM)</Titulo>

      <div className="mt-2 grid grid-cols-2 gap-2">
        <Indice etiqueta="SPI" nota="plazo" valor={m.spi} />
        <Indice etiqueta="CPI" nota="costo" valor={m.cpi} />
      </div>

      <p className="mt-2 text-xs opacity-70">
        SV{" "}
        <span
          className="font-semibold tabular-nums"
          style={{
            color:
              svNum === 0
                ? undefined
                : svNum > 0
                  ? "var(--color-exito)"
                  : "var(--color-peligro)",
          }}
        >
          {svNum > 0 ? "+" : ""}
          {soles(m.sv)}
        </span>{" "}
        al corte del {vg.corte}.
      </p>

      {m.cpi === null && m.motivoSinCosto !== null && (
        <p className="mt-1 text-xs opacity-50">
          {textoSinCosto(m.motivoSinCosto)}
        </p>
      )}

      <EnlaceModulo href={`/obras/${obraId}/cronograma`}>
        Ver EVM completo
      </EnlaceModulo>
    </>
  );
}

/** Un indice (SPI/CPI) con su semaforo, o un guion honesto si no lo hay. */
function Indice({
  etiqueta,
  nota,
  valor,
}: {
  etiqueta: string;
  nota: string;
  valor: number | null;
}) {
  const semaforo = semaforoIndice(valor);

  return (
    <div
      className="rounded-lg border px-2 py-1.5"
      style={{ borderColor: "var(--borde)" }}
    >
      <p className="text-xs opacity-60">
        {etiqueta} <span className="opacity-70">· {nota}</span>
      </p>
      <p
        className="text-lg font-semibold tabular-nums"
        style={semaforo ? { color: COLOR_SEMAFORO[semaforo] } : undefined}
      >
        {valor === null ? "—" : valor.toFixed(2)}
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// PPC: si se cumple lo prometido
// ---------------------------------------------------------------------------

/**
 * El PPC de la ultima semana CERRADA, con su tendencia.
 *
 * No es avance: es fiabilidad. Se puede ir al dia en la curva con un PPC del
 * 50% —el ritmo tapa una planificacion que no se cumple— y eso se paga mas
 * adelante, cuando ya no queda holgura que gastar.
 *
 * El umbral del 80% es el de la practica del Last Planner: por debajo, la
 * planificacion semanal no esta funcionando todavia.
 */
function Ppc({
  plan,
  obraId,
}: {
  plan: DatosPlanSemanalTablero;
  obraId: string;
}) {
  const href = `/obras/${obraId}/plan-semanal`;

  if (!plan.ultima) {
    return (
      <>
        <Titulo icono={ClipboardCheck}>PPC</Titulo>
        <p className="mt-2 text-sm opacity-60">
          {plan.abiertas > 0
            ? `${plan.abiertas === 1 ? "Una semana abierta" : `${plan.abiertas} semanas abiertas`} sin cerrar todavia.`
            : "Aun no hay ninguna semana cerrada."}
        </p>
        <p className="mt-1 text-xs opacity-50">
          El PPC aparece al cerrar la primera semana.
        </p>
        <EnlaceModulo href={href}>Ver plan semanal</EnlaceModulo>
      </>
    );
  }

  const ppc = redondearA(plan.ultima.ppc, 0);
  const semaforo: Semaforo = ppc >= 80 ? "verde" : ppc >= 60 ? "ambar" : "rojo";
  const delta = plan.anterior === null ? null : redondearA(ppc - plan.anterior, 0);

  return (
    <>
      <Titulo icono={ClipboardCheck}>PPC</Titulo>

      <div className="mt-2">
        <p
          className="text-2xl font-semibold tabular-nums"
          style={{ color: COLOR_SEMAFORO[semaforo] }}
        >
          {ppc}%
        </p>
        <p className="text-xs opacity-60">
          Semana {plan.ultima.numero} ({plan.ultima.fechaCorte})
          {delta !== null && (
            <>
              {" · "}
              <span
                style={{
                  color:
                    delta === 0
                      ? undefined
                      : delta > 0
                        ? "var(--color-exito)"
                        : "var(--color-peligro)",
                }}
              >
                {delta === 0 ? "igual" : `${conSignoFijo(delta, 0)} puntos`}
              </span>
            </>
          )}
        </p>
      </div>

      <BarraConMarca valor={ppc} marca={80} color={COLOR_SEMAFORO[semaforo]} />

      {plan.tendencia.length > 1 ? (
        <MiniBarras serie={plan.tendencia} umbral={80} />
      ) : (
        <p className="mt-2 text-xs opacity-50">
          Con una sola semana no hay tendencia: el PPC se lee comparandolo
          consigo mismo.
        </p>
      )}

      <EnlaceModulo href={href}>Ver plan semanal</EnlaceModulo>
    </>
  );
}

/**
 * La tendencia del PPC en barras, una por semana cerrada.
 *
 * Barras y no linea: son valores de periodos discretos —no hay PPC "entre"
 * dos semanas que interpolar— y ademas se distingue mejor cual cruza el
 * umbral.
 */
function MiniBarras({
  serie,
  umbral,
}: {
  serie: readonly number[];
  umbral: number;
}) {
  // Las ultimas doce como mucho: mas barras en este ancho serian rayas.
  const ultimas = serie.slice(-12);

  return (
    <div
      className="relative mt-2 flex h-10 items-end gap-0.5"
      role="img"
      aria-label={`Tendencia del PPC en las ultimas ${ultimas.length} semanas cerradas`}
    >
      <span
        aria-hidden="true"
        className="absolute inset-x-0 border-t border-dashed"
        style={{ bottom: `${umbral}%`, borderColor: "var(--borde)" }}
      />
      {ultimas.map((v, i) => (
        <span
          key={i}
          className="flex-1 rounded-t"
          style={{
            // Un minimo visible: una semana de PPC 0 es informacion, y sin
            // altura ninguna se leeria como "esa semana no existe".
            height: `${Math.max(4, v)}%`,
            backgroundColor:
              v >= umbral ? "var(--color-exito)" : "var(--color-alerta)",
            opacity: i === ultimas.length - 1 ? 1 : 0.45,
          }}
        />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Confiabilidad del Lookahead
// ---------------------------------------------------------------------------

/**
 * Cuantas tareas de la ventana estan LISTAS (sus 7 restricciones resueltas).
 *
 * Es el indicador que anticipa al PPC: lo que se compromete sin liberar es lo
 * que se incumple la semana que viene. Por eso vive al lado y no dentro del
 * Lookahead.
 */
function Confiabilidad({
  lk,
  obraId,
}: {
  lk: DatosLookaheadTablero;
  obraId: string;
}) {
  const href = `/obras/${obraId}/lookahead`;

  if (lk.total === 0) {
    return (
      <>
        <Titulo icono={Telescope}>Lookahead</Titulo>
        <p className="mt-2 text-sm opacity-60">
          No hay tareas del cronograma en las proximas {lk.semanas} semanas.
        </p>
        <EnlaceModulo href={href}>Ver lookahead</EnlaceModulo>
      </>
    );
  }

  // Sin UNA sola restriccion marcada, el 0% no es una foto de la obra: es que
  // nadie ha usado la matriz todavia. Gritarlo en rojo junto a un avance "al
  // dia" se lee como catastrofe; se dice en neutro y se invita a empezar.
  if (lk.restriccionesResueltas === 0) {
    return (
      <>
        <Titulo icono={Telescope}>Lookahead</Titulo>
        <p className="mt-2 text-sm opacity-60">
          Aun sin analisis de restricciones.
        </p>
        <p className="mt-1 text-xs opacity-50">
          {lk.total} {lk.total === 1 ? "tarea" : "tareas"} en la ventana de{" "}
          {lk.semanas} semanas. Entra y marca lo que ya este resuelto: el
          porcentaje aparecera con la primera restriccion.
        </p>
        <EnlaceModulo href={href}>Ver lookahead</EnlaceModulo>
      </>
    );
  }

  const semaforo: Semaforo =
    lk.porcentaje >= 70 ? "verde" : lk.porcentaje >= 40 ? "ambar" : "rojo";

  return (
    <>
      <Titulo icono={Telescope}>Lookahead</Titulo>

      <div className="mt-2">
        <p
          className="text-2xl font-semibold tabular-nums"
          style={{ color: COLOR_SEMAFORO[semaforo] }}
        >
          {lk.porcentaje}%
        </p>
        <p className="text-xs opacity-60">
          {lk.listas} de {lk.total} listas · ventana de {lk.semanas} semanas
        </p>
      </div>

      <div
        className="mt-2 h-2 overflow-hidden rounded-full"
        style={{ backgroundColor: "var(--borde)" }}
      >
        <div
          className="h-full rounded-full"
          style={{
            width: `${lk.porcentaje}%`,
            backgroundColor: COLOR_SEMAFORO[semaforo],
          }}
        />
      </div>

      {lk.sinSincronizar > 0 && (
        <p className="mt-1.5 text-xs" style={{ color: "var(--color-alerta)" }}>
          {lk.sinSincronizar}{" "}
          {lk.sinSincronizar === 1 ? "tarea" : "tareas"} sin analizar: el
          porcentaje las cuenta como no listas.
        </p>
      )}

      <EnlaceModulo href={href}>Ver lookahead</EnlaceModulo>
    </>
  );
}

// ---------------------------------------------------------------------------
// La causa que mas frena
// ---------------------------------------------------------------------------

/**
 * El primer puesto del Pareto de causas de no cumplimiento.
 *
 * Una sola causa y no la lista entera: el tablero sirve para decidir que se
 * ataca esta semana, y el Pareto completo esta a un clic. Cuenta TODAS las
 * semanas, no solo la ultima: lo que importa es lo que se repite.
 */
function Causas({
  plan,
  obraId,
}: {
  plan: DatosPlanSemanalTablero;
  obraId: string;
}) {
  const href = `/obras/${obraId}/plan-semanal`;

  if (!plan.causaTop) {
    return (
      <>
        <Titulo icono={Ban}>Causa que mas frena</Titulo>
        <p className="mt-2 text-sm opacity-60">
          {plan.cerradas === 0
            ? "Aun no hay semanas cerradas."
            : "Ningun incumplimiento con causa anotada."}
        </p>
        <p className="mt-1 text-xs opacity-50">
          Sin causa, cerrar la semana no ensena nada.
        </p>
        <EnlaceModulo href={href}>Ver causas</EnlaceModulo>
      </>
    );
  }

  const { causa, veces, porcentaje } = plan.causaTop;

  return (
    <>
      <Titulo icono={Ban}>Causa que mas frena</Titulo>

      <div className="mt-2">
        <p className="text-base font-semibold">{ETIQUETA_CNC[causa]}</p>
        <p className="text-xs opacity-60">
          {veces} {veces === 1 ? "vez" : "veces"} ·{" "}
          {redondearA(porcentaje, 0)}% de los {plan.fallosConCausa}{" "}
          incumplimientos con causa
        </p>
        {/* Junto al PPC, que solo cuenta semanas CERRADAS, este total parece
            contradecirlo. No es error: el Pareto suma tambien las abiertas a
            proposito, y hay que decirlo donde se lee. */}
        {plan.abiertas > 0 && (
          <p className="mt-0.5 text-xs opacity-50">
            Cuenta todas las semanas, incluidas las {plan.abiertas} abiertas.
          </p>
        )}
      </div>

      <div
        className="mt-2 h-2 overflow-hidden rounded-full"
        style={{ backgroundColor: "var(--borde)" }}
      >
        <div
          className="h-full rounded-full"
          style={{
            width: `${Math.min(100, porcentaje)}%`,
            backgroundColor: "var(--color-peligro)",
          }}
        />
      </div>

      <EnlaceModulo href={href}>Ver causas</EnlaceModulo>
    </>
  );
}

// ---------------------------------------------------------------------------
// Partidas atrasadas
// ---------------------------------------------------------------------------

function Atrasos({
  crono,
  obraId,
}: {
  crono: DatosCronogramaTablero;
  obraId: string;
}) {
  const { atrasos } = crono;

  return (
    <>
      <Titulo icono={AlertTriangle}>Partidas atrasadas</Titulo>

      <div className="mt-2 flex items-end gap-1">
        <p className="text-2xl font-semibold tabular-nums">{atrasos.total}</p>
        <p className="pb-1 text-xs opacity-60">por detras del plan</p>
      </div>

      <div className="mt-1 flex flex-wrap gap-1.5 text-xs">
        <Cuenta n={atrasos.alta} color="var(--color-peligro)" etiqueta="urgentes" />
        <Cuenta n={atrasos.media} color="var(--color-alerta)" etiqueta="atencion" />
        <Cuenta n={atrasos.baja} color="var(--color-marca-500)" etiqueta="leves" />
      </div>

      {atrasos.primera && (
        <p className="mt-2 line-clamp-2 text-xs opacity-70">
          <span style={{ color: "var(--color-peligro)" }}>▸</span>{" "}
          {atrasos.primera.nombre} ({Math.abs(atrasos.primera.desfase).toFixed(0)}{" "}
          puntos por detras del plan)
        </p>
      )}

      <EnlaceModulo href={`/obras/${obraId}/cronograma`}>
        Ver alertas
      </EnlaceModulo>
    </>
  );
}

function Cuenta({
  n,
  color,
  etiqueta,
}: {
  n: number;
  color: string;
  etiqueta: string;
}) {
  if (n === 0) return null;
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-1.5 py-0.5"
      style={{ backgroundColor: `color-mix(in oklab, ${color} 16%, transparent)` }}
    >
      <span className="font-semibold tabular-nums" style={{ color }}>
        {n}
      </span>
      <span className="opacity-70">{etiqueta}</span>
    </span>
  );
}

// ---------------------------------------------------------------------------
// Cadena critica
// ---------------------------------------------------------------------------

function Criticas({
  crono,
  obraId,
}: {
  crono: DatosCronogramaTablero;
  obraId: string;
}) {
  const { criticas } = crono;
  const enRojo = criticas.atrasados > 0;

  return (
    <>
      <Titulo icono={Link2}>Cadena critica</Titulo>

      <div className="mt-2 flex items-end gap-1">
        <p
          className="text-2xl font-semibold tabular-nums"
          style={enRojo ? { color: "var(--color-peligro)" } : undefined}
        >
          {criticas.atrasados}
        </p>
        <p className="pb-1 text-xs opacity-60">
          de {criticas.eslabones} tareas de la cadena atrasadas
        </p>
      </div>

      {criticas.atrasoAcumulado > 0 && (
        <p className="mt-1 text-xs" style={{ color: "var(--color-peligro)" }}>
          {criticas.atrasoAcumulado.toFixed(0)} dias de atraso acumulado en la
          cadena.
        </p>
      )}

      {criticas.proxima && (
        <p className="mt-2 line-clamp-2 text-xs opacity-70">
          Siguiente: {criticas.proxima.nombre} (fin {criticas.proxima.fin})
        </p>
      )}

      <EnlaceModulo href={`/obras/${obraId}/cronograma`}>
        Ver cadena critica
      </EnlaceModulo>
    </>
  );
}

// ---------------------------------------------------------------------------
// Capitulos
// ---------------------------------------------------------------------------

function Capitulos({
  crono,
  obraId,
}: {
  crono: DatosCronogramaTablero;
  obraId: string;
}) {
  return (
    <>
      <Titulo icono={Layers}>Capitulos criticos</Titulo>

      {crono.capitulos.length === 0 ? (
        <p className="mt-2 text-xs opacity-60">
          Ningun capitulo medible por ahora.
        </p>
      ) : (
        <ul className="mt-2 space-y-1.5">
          {crono.capitulos.map((c) => {
            const semaforo: Semaforo = semaforoDesfase(c.desfase);
            return (
              <li key={c.nombre} className="text-xs">
                <div className="flex items-center justify-between gap-2">
                  <span className="min-w-0 truncate opacity-80">
                    {c.codigo ? `${c.codigo} ` : ""}
                    {c.nombre}
                  </span>
                  <span
                    className="shrink-0 tabular-nums"
                    style={{ color: COLOR_SEMAFORO[semaforo] }}
                  >
                    {c.desfase >= 0 ? "+" : ""}
                    {c.desfase.toFixed(0)}
                  </span>
                </div>
                <div
                  className="mt-0.5 h-1 overflow-hidden rounded-full"
                  style={{ backgroundColor: "var(--borde)" }}
                >
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${Math.min(c.real, 100)}%`,
                      backgroundColor: COLOR_SEMAFORO[semaforo],
                    }}
                  />
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <EnlaceModulo href={`/obras/${obraId}/cronograma/informe`}>
        Ver informe
      </EnlaceModulo>
    </>
  );
}

// ---------------------------------------------------------------------------
// Ordenes de compra
// ---------------------------------------------------------------------------

function Ordenes({
  ordenes,
  obraId,
}: {
  ordenes: NonNullable<DatosTablero["ordenes"]>;
  obraId: string;
}) {
  // Sin ordenes vivas, la tabla de tres ceros gastaba una tarjeta entera en
  // decir "no hay nada" —y peor: "1 en total" con la unica anulada parecia
  // actividad—. Se dice en una frase.
  if (ordenes.aprobadas === 0 && ordenes.borradores === 0) {
    return (
      <>
        <Titulo icono={FileText}>Ordenes de compra</Titulo>
        <p className="mt-2 text-sm opacity-60">
          {ordenes.anuladas === 0
            ? "Aun no se ha emitido ninguna orden."
            : `Sin ordenes vivas (${ordenes.anuladas} ${ordenes.anuladas === 1 ? "anulada" : "anuladas"}).`}
        </p>
        <p className="mt-1 text-xs opacity-50">
          El comprometido del presupuesto sale de las ordenes aprobadas.
        </p>
        <EnlaceModulo href={`/obras/${obraId}/ordenes`}>
          Ver ordenes
        </EnlaceModulo>
      </>
    );
  }

  return (
    <>
      <Titulo icono={FileText}>Ordenes de compra</Titulo>

      <div className="mt-2 flex items-end gap-1">
        <p className="text-2xl font-semibold tabular-nums">{ordenes.total}</p>
        <p className="pb-1 text-xs opacity-60">en total</p>
      </div>

      <dl className="mt-2 space-y-1 text-xs">
        <Fila etiqueta="Aprobadas" valor={ordenes.aprobadas} color="var(--color-exito)" />
        <Fila etiqueta="Borradores" valor={ordenes.borradores} color="var(--color-alerta)" />
        <Fila etiqueta="Anuladas" valor={ordenes.anuladas} color="var(--color-peligro)" />
      </dl>

      <EnlaceModulo href={`/obras/${obraId}/ordenes`}>
        Ver ordenes
      </EnlaceModulo>
    </>
  );
}

function Fila({
  etiqueta,
  valor,
  color,
}: {
  etiqueta: string;
  valor: number;
  color: string;
}) {
  return (
    <div className="flex items-center justify-between">
      <dt className="flex items-center gap-1.5 opacity-70">
        <span
          aria-hidden="true"
          className="inline-block size-2 rounded-full"
          style={{ backgroundColor: color }}
        />
        {etiqueta}
      </dt>
      <dd className="font-semibold tabular-nums">{valor}</dd>
    </div>
  );
}
