"use client";

import Link from "next/link";
import {
  TrendingUp,
  CalendarClock,
  Bell,
  Wallet,
  AlertTriangle,
  Link2,
  Layers,
  FileText,
  ClipboardCheck,
  Telescope,
  Ban,
  Gauge,
  ListChecks,
  TriangleAlert,
  Info,
  CircleCheck,
  ArrowRight,
  Maximize2,
} from "lucide-react";
import type { DefinicionModulo, ModuloTablero } from "@/lib/tablero";
import { resumirPendientes } from "@/lib/pendientes";
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
import { ETIQUETA_CNC, MINIMO_PARA_PARETO } from "@/lib/plan-semanal";
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
    case "recordatorios":
      // Igual que "ordenes": null es "sin permiso o modulo apagado", no
      // "sin recordatorios". Una lista vacia SI se pinta, en verde.
      return datos.recordatorios !== null;
    case "ppc":
    case "causas":
      return datos.planSemanal !== null;
    case "confiabilidad":
      return datos.lookahead !== null;
    case "liberacion":
      // Sin ningun flujo con casos no se pinta: un modulo con siete ceros
      // diria que todo se libera al instante, que es lo contrario de "aun no
      // hay con que responder".
      return (
        datos.liberacion !== null && datos.liberacion.flujos.length > 0
      );
    case "valorGanado":
      return datos.valorGanado !== null;
    case "pendientes":
      // Con la obra al dia se pinta igual, en verde: es la unica forma de
      // que "no hay nada" signifique algo. Si desapareciera cuando todo esta
      // bien, nadie sabria si esta al dia o si el modulo se rompio.
      return true;
    default:
      // Plazo y presupuesto salen de la propia obra: siempre hay algo.
      return true;
  }
}

/**
 * El contenido de un modulo, elegido por su clave.
 *
 * `ampliado` cambia dos cosas: la caja pierde la altura fija —en el modal
 * tiene todo el sitio que quiera— y no repite la cabecera, que el modal ya
 * pinta con su boton de cerrar.
 */
export function ModuloContenido({
  modulo,
  datos,
  ampliado = false,
}: {
  modulo: DefinicionModulo;
  datos: DatosTablero;
  ampliado?: boolean;
}) {
  const obraId = datos.obra.id;
  const acento = acentoDeModulo(modulo.clave, datos);

  return (
    <Caja ancho={modulo.ancho} acento={acento} ampliada={ampliado}>
      {!ampliado && <CabeceraModulo modulo={modulo} acento={acento} />}
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
      {modulo.clave === "liberacion" && datos.liberacion && (
        <Demora dem={datos.liberacion} obraId={obraId} />
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
      {modulo.clave === "pendientes" && (
        <Pendientes lista={datos.pendientes} obraId={obraId} />
      )}
      {modulo.clave === "ordenes" && datos.ordenes && (
        <Ordenes ordenes={datos.ordenes} obraId={obraId} />
      )}
      {modulo.clave === "recordatorios" && datos.recordatorios && (
        <Recordatorios lista={datos.recordatorios} obraId={obraId} />
      )}
    </Caja>
  );
}

/**
 * La caja comun, con ALTURA FIJA en la rejilla.
 *
 * Antes cada modulo media lo suyo y `auto-rows-fr` estiraba la fila entera a
 * la altura del mas largo: «Que falta», con cuatro avisos explicados, dejaba
 * al lado un «Avance fisico» que era un tercio de cifra y dos tercios de
 * aire. Con todas las cajas iguales la rejilla se lee como un tablero; lo que
 * no cabe (solo la lista de pendientes, en la practica) se desplaza dentro de
 * su caja, y el modal de ampliar sigue enseñandolo entero.
 *
 * El acento tiñe borde y lavado de fondo, con el mismo degradado diagonal que
 * las tarjetas de cifras del panel: un solo lenguaje visual.
 */
function Caja({
  ancho,
  acento,
  ampliada,
  children,
}: {
  ancho: 1 | 2;
  acento: string;
  ampliada: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      className={`elevacion-1 flex flex-col rounded-xl border p-3 ${
        ampliada ? "" : "h-[19rem] overflow-hidden"
      } ${ancho === 2 ? "sm:col-span-2 lg:col-span-2" : ""}`}
      style={{
        borderColor: `color-mix(in oklab, ${acento} 30%, var(--borde))`,
        backgroundColor: "var(--superficie)",
        backgroundImage: `linear-gradient(135deg, color-mix(in oklab, ${acento} 14%, var(--superficie)) 0%, var(--superficie) 60%)`,
      }}
    >
      {children}
    </div>
  );
}

/// El icono de cada modulo, en un solo sitio: lo usa la cabecera comun.
/// `satisfies` y no una anotacion: exige la entrada de CADA modulo del
/// catalogo y a la vez deja que la busqueda devuelva el icono sin `undefined`.
const ICONOS = {
  pendientes: ListChecks,
  avance: TrendingUp,
  curva: TrendingUp,
  plazo: CalendarClock,
  presupuesto: Wallet,
  valorGanado: Gauge,
  ppc: ClipboardCheck,
  confiabilidad: Telescope,
  liberacion: CalendarClock,
  causas: Ban,
  atrasos: AlertTriangle,
  criticas: Link2,
  capitulos: Layers,
  ordenes: FileText,
  recordatorios: Bell,
} satisfies Record<ModuloTablero, typeof Wallet>;

/**
 * La cabecera comun: icono, titulo, LA NOTA y la seña de que se amplia.
 *
 * La nota —que pregunta contesta el modulo— vivia solo en el modal y en el
 * configurador, o sea, donde ya no hace falta. Un tablero con catorce cifras
 * sin explicar se aprende o se ignora; con la explicacion debajo de cada
 * titulo, se lee. Y el icono de ampliar existe porque la caja SIEMPRE fue
 * pulsable y nada lo decia: una interaccion que no se anuncia no existe.
 */
function CabeceraModulo({
  modulo,
  acento,
}: {
  modulo: DefinicionModulo;
  acento: string;
}) {
  // La firma dice `string` (el contrato de `DefinicionModulo`), pero todo
  // modulo sale del catalogo, cuyo `satisfies` garantiza su entrada aqui.
  const Icono = ICONOS[modulo.clave as ModuloTablero];

  return (
    <header className="mb-1 flex items-start justify-between gap-2">
      <div className="min-w-0">
        <h3 className="flex items-center gap-1.5 text-xs font-semibold">
          <Icono
            className="size-3.5 shrink-0"
            style={{ color: acento }}
            aria-hidden="true"
          />
          {modulo.etiqueta}
        </h3>
        <p className="mt-0.5 text-xs opacity-55">{modulo.nota}</p>
      </div>
      <Maximize2
        className="size-3.5 shrink-0 opacity-35"
        aria-hidden="true"
      />
    </header>
  );
}

/// Umbrales del PPC y de la ventana lista, compartidos entre el cuerpo del
/// modulo y su acento: dos copias de un umbral terminan discrepando.
function semaforoPpc(ppc: number): Semaforo {
  return ppc >= 80 ? "verde" : ppc >= 60 ? "ambar" : "rojo";
}

function semaforoVentana(porcentaje: number): Semaforo {
  return porcentaje >= 70 ? "verde" : porcentaje >= 40 ? "ambar" : "rojo";
}

/**
 * El color que gobierna un modulo entero: borde, lavado de fondo e icono.
 *
 * Donde el dato ya trae un juicio —un semaforo, un sobregiro, un plazo
 * vencido— el modulo se viste con el: la rejilla se convierte en un mapa de
 * calor y lo que va mal se encuentra sin leer una sola cifra. Donde no hay
 * juicio que hacer (la curva, las ordenes), marca neutral: pintar de rojo lo
 * que no esta mal enseña a ignorar el rojo.
 */
function acentoDeModulo(
  clave: DefinicionModulo["clave"],
  datos: DatosTablero,
): string {
  const MARCA = "var(--color-marca-500)";

  switch (clave) {
    case "pendientes": {
      const { criticas, total } = resumirPendientes(datos.pendientes);
      if (criticas > 0) return COLOR_SEMAFORO.rojo;
      if (total > 0) return COLOR_SEMAFORO.ambar;
      return COLOR_SEMAFORO.verde;
    }
    case "recordatorios": {
      const lista = datos.recordatorios ?? [];
      if (lista.some((r) => r.vencida)) return COLOR_SEMAFORO.rojo;
      if (lista.length > 0) return COLOR_SEMAFORO.ambar;
      return COLOR_SEMAFORO.verde;
    }
    case "avance":
      return datos.cronograma
        ? COLOR_SEMAFORO[
            semaforoDesfase(redondearA(datos.cronograma.desfase, 1))
          ]
        : MARCA;
    case "plazo":
      return datos.plazo.restantes < 0 ? COLOR_SEMAFORO.rojo : MARCA;
    case "presupuesto":
      return datos.presupuesto.porcentaje > 100 ||
        datos.presupuesto.sobregiradas > 0
        ? COLOR_SEMAFORO.rojo
        : COLOR_SEMAFORO.verde;
    case "valorGanado": {
      const m = datos.valorGanado?.metricas;
      if (!m) return MARCA;
      // Manda el peor de los dos indices: un SPI holgado no compensa un CPI
      // en rojo, y al reves tampoco.
      const semaforos = [semaforoIndice(m.spi), semaforoIndice(m.cpi)].filter(
        (s): s is Semaforo => s !== null,
      );
      if (semaforos.includes("rojo")) return COLOR_SEMAFORO.rojo;
      if (semaforos.includes("ambar")) return COLOR_SEMAFORO.ambar;
      return semaforos.length > 0 ? COLOR_SEMAFORO.verde : MARCA;
    }
    case "ppc": {
      const ultima = datos.planSemanal?.ultima;
      return ultima
        ? COLOR_SEMAFORO[semaforoPpc(redondearA(ultima.ppc, 0))]
        : MARCA;
    }
    case "confiabilidad": {
      const lk = datos.lookahead;
      // Sin ventana o sin analisis no hay juicio todavia; el cuerpo ya lo
      // explica en neutro y el color no debe contradecirlo.
      if (!lk || lk.total === 0 || lk.sinAnalizar === lk.total) return MARCA;
      return COLOR_SEMAFORO[semaforoVentana(lk.porcentaje)];
    }
    case "atrasos": {
      const a = datos.cronograma?.atrasos;
      if (!a || a.total === 0) return COLOR_SEMAFORO.verde;
      return a.alta > 0 ? COLOR_SEMAFORO.rojo : COLOR_SEMAFORO.ambar;
    }
    case "criticas": {
      const c = datos.cronograma?.criticas;
      if (!c) return MARCA;
      return c.atrasados > 0 ? COLOR_SEMAFORO.rojo : COLOR_SEMAFORO.verde;
    }
    case "causas":
      // Ambar y no rojo: señala donde mirar, no una emergencia. El Pareto
      // siempre tiene un primer puesto; eso solo no es una crisis.
      return datos.planSemanal?.causaTop ? COLOR_SEMAFORO.ambar : MARCA;
    default:
      return MARCA;
  }
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
            {desfase === 0 ? "al día" : `${conSignoFijo(desfase, 1)} puntos`}
          </span>
        </p>
      </div>

      <BarraConMarca
        valor={crono.real}
        marca={crono.planeado}
        color={COLOR_SEMAFORO[semaforo]}
      />

      <EnlaceModulo href={`/obras/${obraId}/cronograma#curva-de-avance`}>
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
          Término proyectado {crono.curva.termino}
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
          Sin plan continuo: el corte no trae tareas con duración.
        </p>
      )}

      <EnlaceModulo href={`/obras/${obraId}/cronograma#curva-de-avance`}>
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
      aria-label="Curva de avance: plan, real y proyección, de inicio a fin de obra"
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

      <EnlaceModulo href={`/obras/${obraId}/ordenes#comprometido`}>
        Ver órdenes
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

      {/* EAC/VAC son proyeccion, no hecho: solo con base de costo (mismo
          candado que CPI, arriba). Es la cifra mas predictiva del sistema
          —cuanto va a costar la obra al final, si sigue asi— y ya estaba
          calculada; solo faltaba mostrarla aqui. */}
      {m.eac !== null && (
        <p className="mt-1 text-xs opacity-70">
          Terminaría en <strong>{soles(m.eac)}</strong>
          {m.vac !== null && Number(m.vac) !== 0 && (
            <span
              style={{
                color: Number(m.vac) > 0 ? "var(--color-exito)" : "var(--color-peligro)",
              }}
            >
              {" "}
              ({Number(m.vac) > 0 ? "+" : ""}
              {soles(m.vac)})
            </span>
          )}
          .
        </p>
      )}

      <EnlaceModulo href={`/obras/${obraId}/cronograma#valor-ganado`}>
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
  const href = `/obras/${obraId}/plan-semanal#ppc-tendencia`;

  if (!plan.ultima) {
    return (
      <>
        <p className="mt-2 text-sm opacity-60">
          {plan.abiertas > 0
            ? `${plan.abiertas === 1 ? "Una semana abierta" : `${plan.abiertas} semanas abiertas`} sin cerrar todavía.`
            : "Aún no hay ninguna semana cerrada."}
        </p>
        <p className="mt-1 text-xs opacity-50">
          El PPC aparece al cerrar la primera semana.
        </p>
        <EnlaceModulo href={href}>Ver plan semanal</EnlaceModulo>
      </>
    );
  }

  const ppc = redondearA(plan.ultima.ppc, 0);
  const semaforo = semaforoPpc(ppc);
  const delta = plan.anterior === null ? null : redondearA(ppc - plan.anterior, 0);

  return (
    <>
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
          Con una sola semana no hay tendencia: el PPC se lee comparándolo
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
 * Cuantas tareas de la ventana estan LISTAS: analizadas y sin ninguna
 * restriccion pendiente. Una tarea analizada a la que no le aplica ningun
 * flujo tambien esta lista; una que nadie ha mirado, no.
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
  // Misma ventana que esta tarjeta esta contando, y el ancla del resumen
  // de confiabilidad (`MatrizLookahead.tsx`): sin los dos, se aterriza en
  // el lookahead con la ventana por defecto, que puede no ser la que la
  // tarjeta esta describiendo.
  const href = `/obras/${obraId}/lookahead?semanas=${lk.semanas}#confiabilidad`;

  if (lk.total === 0) {
    return (
      <>
        <p className="mt-2 text-sm opacity-60">
          No hay tareas del cronograma en las próximas {lk.semanas} semanas.
        </p>
        <EnlaceModulo href={href}>Ver lookahead</EnlaceModulo>
      </>
    );
  }

  // Con la ventana entera sin analizar, el 0% no es una foto de la obra: es
  // que nadie ha usado la matriz todavia. Gritarlo en rojo junto a un avance
  // "al dia" se lee como catastrofe; se dice en neutro y se invita a empezar.
  //
  // El corte es "nadie ha analizado nada", no "cero restricciones resueltas":
  // desde que una tarea puede quedar lista sin ninguna restriccion, se puede
  // tener la ventana al 100% y cero resueltas, y con el corte viejo la
  // tarjeta habria dicho "aun sin analisis" encima de un trabajo terminado.
  if (lk.sinAnalizar === lk.total) {
    return (
      <>
        <p className="mt-2 text-sm opacity-60">
          Aún sin análisis de restricciones.
        </p>
        <p className="mt-1 text-xs opacity-50">
          {lk.total} {lk.total === 1 ? "tarea" : "tareas"} en la ventana de{" "}
          {lk.semanas} semanas. Entra y di qué flujos le aplican a cada una: el
          porcentaje aparecerá con la primera analizada.
        </p>
        <EnlaceModulo href={href}>Ver lookahead</EnlaceModulo>
      </>
    );
  }

  const semaforo = semaforoVentana(lk.porcentaje);

  return (
    <>
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

      {lk.sinAnalizar > 0 && (
        <p className="mt-1.5 text-xs" style={{ color: "var(--color-alerta)" }}>
          {lk.sinAnalizar} {lk.sinAnalizar === 1 ? "tarea" : "tareas"} sin
          analizar: el porcentaje las cuenta como no listas.
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
  // El ancla ya existe en GraficosPpc.tsx, construida a proposito para
  // poder enlazar aqui desde el panel: la usaba "Que falta", esta la
  // reusa igual.
  const href = `/obras/${obraId}/plan-semanal#pareto`;

  if (!plan.causaTop) {
    return (
      <>
        {/* Tres estados distintos y tres mensajes distintos. El tercero es el
            que faltaba: con pocos incumplimientos —o con todos de la misma
            causa— el «primer puesto» del Pareto no es un hallazgo, es el azar
            de la semana. Antes se pintaba igual, y un tablero que afirma cosas
            vacias enseña a no leerlo. */}
        <p className="mt-2 text-sm opacity-60">
          {plan.cerradas === 0
            ? "Aún no hay semanas cerradas."
            : plan.fallosConCausa === 0
              ? "Ningún incumplimiento con causa anotada."
              : `Todavía no hay suficiente para señalar una causa: ${plan.fallosConCausa} ${
                  plan.fallosConCausa === 1 ? "incumplimiento" : "incumplimientos"
                } con causa.`}
        </p>
        <p className="mt-1 text-xs opacity-50">
          {plan.fallosConCausa === 0
            ? "Sin causa, cerrar la semana no enseña nada."
            : `Hacen falta ${MINIMO_PARA_PARETO} y al menos dos causas distintas: con menos, el primer puesto lo decide el azar.`}
        </p>
        <EnlaceModulo href={href}>Ver causas</EnlaceModulo>
      </>
    );
  }

  const { causa, veces, porcentaje } = plan.causaTop;

  return (
    <>
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
      <div className="mt-2 flex items-end gap-1">
        <p className="text-2xl font-semibold tabular-nums">{atrasos.total}</p>
        <p className="pb-1 text-xs opacity-60">por detrás del plan</p>
      </div>

      <div className="mt-1 flex flex-wrap gap-1.5 text-xs">
        <Cuenta n={atrasos.alta} color="var(--color-peligro)" etiqueta="urgentes" />
        <Cuenta n={atrasos.media} color="var(--color-alerta)" etiqueta="atención" />
        <Cuenta n={atrasos.baja} color="var(--color-marca-500)" etiqueta="leves" />
      </div>

      {atrasos.primera && (
        <p className="mt-2 line-clamp-2 text-xs opacity-70">
          <span style={{ color: "var(--color-peligro)" }}>▸</span>{" "}
          {atrasos.primera.nombre} ({Math.abs(atrasos.primera.desfase).toFixed(0)}{" "}
          puntos por detrás del plan)
        </p>
      )}

      <EnlaceModulo href={`/obras/${obraId}/cronograma#que-frena-la-obra`}>
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
          {criticas.atrasoAcumulado.toFixed(0)} días de atraso acumulado en la
          cadena.
        </p>
      )}

      {criticas.proxima && (
        <p className="mt-2 line-clamp-2 text-xs opacity-70">
          Siguiente: {criticas.proxima.nombre} (fin {criticas.proxima.fin})
        </p>
      )}

      <EnlaceModulo href={`/obras/${obraId}/cronograma#ruta-critica`}>
        Ver cadena crítica
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
  /**
   * Si de verdad hay alguno por detras.
   *
   * El servicio ordena por desfase ascendente y se queda con tres, asi que
   * estos SON los mas atrasados: si ninguno de ellos baja de cero, ninguno del
   * resto lo hace tampoco.
   *
   * Hace falta porque la tarjeta se titulaba «Capitulos criticos» pasara lo
   * que pasara. En CRIOCORD, con la obra adelantada, listaba tres capitulos al
   * dia bajo un rotulo que anunciaba una crisis. Un tablero que da la alarma
   * cuando no hay nada ensena a ignorar la alarma.
   */
  const atrasados = crono.capitulos.filter((c) => c.desfase < 0).length;

  return (
    <>
      {crono.capitulos.length === 0 ? (
        <p className="mt-2 text-xs opacity-60">
          Ningún capítulo medible por ahora.
        </p>
      ) : (
        <>
          <p className="mt-1 text-xs opacity-60">
            {atrasados === 0
              ? "Ninguno va por detrás del plan. Estos son los de menor margen:"
              : `${atrasados} por detrás del plan:`}
          </p>
          <ul className="mt-1.5 space-y-1.5">
            {crono.capitulos.map((c) => {
              const semaforo: Semaforo = semaforoDesfase(c.desfase);
              return (
                <li key={c.nombre} className="text-xs">
                  <div className="flex items-center justify-between gap-2">
                    <span className="min-w-0 truncate opacity-80">
                      {c.codigo ? `${c.codigo} ` : ""}
                      {c.nombre}
                    </span>
                    {/* Un decimal, no cero: con `toFixed(0)` un +0.4 y un 0
                        exacto se leian igual —«+0»—, y la tarjeta entera
                        parecia decir que no pasa nada en ningun sitio. */}
                    <span
                      className="shrink-0 tabular-nums"
                      style={{ color: COLOR_SEMAFORO[semaforo] }}
                    >
                      {conSignoFijo(c.desfase, 1)}
                    </span>
                  </div>
                  {/* La barra es el AVANCE y la marca es el PLAN. Antes la
                      barra pintaba el avance con el color del desfase: dos
                      magnitudes en un solo trazo, y no se veia contra que se
                      comparaba. Con la marca se lee como en la tabla del
                      cronograma —la barra alcanza la marca o no—. */}
                  <div
                    className="relative mt-0.5 h-1.5 rounded-full"
                    style={{ backgroundColor: "var(--borde)" }}
                    title={`Real ${c.real.toFixed(1)}% · Plan ${c.planeado.toFixed(1)}%`}
                  >
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${Math.min(Math.max(c.real, 0), 100)}%`,
                        backgroundColor: COLOR_SEMAFORO[semaforo],
                      }}
                    />
                    <span
                      className="absolute -top-0.5 h-2.5 w-px"
                      style={{
                        left: `${Math.min(Math.max(c.planeado, 0), 100)}%`,
                        backgroundColor: "var(--texto)",
                        opacity: 0.55,
                      }}
                      aria-hidden="true"
                    />
                  </div>
                </li>
              );
            })}
          </ul>
        </>
      )}

      {/* A la seccion "Avance por capitulo" del cronograma, que es EXACTAMENTE
          esta misma lista con mas detalle -no al informe semanal: ese trae
          su propia tabla, filtrada por corte, no "los 3 mas desviados". */}
      <EnlaceModulo href={`/obras/${obraId}/cronograma#avance-por-capitulo`}>
        Ver capítulos
      </EnlaceModulo>
    </>
  );
}

// ---------------------------------------------------------------------------
// Ordenes de compra
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Que falta
// ---------------------------------------------------------------------------

/**
 * Lo que el residente tiene que completar, y que se rompe si no.
 *
 * Tres decisiones de forma:
 *
 * - **Nada parpadea.** Lo que parpadea se ignora a los tres dias y molesta
 *   desde el primero. La urgencia va en el ORDEN —lo critico arriba— y en el
 *   contador de la cabecera.
 * - **Color, icono y texto**, nunca color solo: quien no distingue el rojo
 *   del ambar tiene que poder leer lo mismo.
 * - **Cada linea lleva su enlace.** Un aviso del que no se puede salir a
 *   arreglar la cosa es solo una queja.
 */
function Pendientes({
  lista,
  obraId,
}: {
  lista: DatosTablero["pendientes"];
  obraId: string;
}) {
  const { criticas, total } = resumirPendientes(lista);

  if (total === 0) {
    return (
      <>
        <p
          className="mt-2 flex items-center gap-1.5 text-sm"
          style={{ color: "var(--color-exito)" }}
        >
          <CircleCheck className="size-4 shrink-0" aria-hidden="true" />
          Nada pendiente: la obra está al día.
        </p>
        <p className="mt-1 text-xs opacity-50">
          Se revisan los datos de campo, las restricciones de las próximas dos
          semanas y los indicadores.
        </p>
      </>
    );
  }

  return (
    <>
      <p className="text-xs tabular-nums opacity-70">
        {criticas > 0 && (
          <strong style={{ color: "var(--color-peligro)" }}>
            {criticas} urgente{criticas === 1 ? "" : "s"}
          </strong>
        )}
        {criticas > 0 && total > criticas && " · "}
        {total > criticas && `${total - criticas} por mirar`}
      </p>

      {/* La lista se desplaza DENTRO de la caja, que ahora mide lo mismo que
          las demas: era este modulo el que estiraba la fila entera hacia
          abajo. El modal de ampliar la sigue enseñando completa. */}
      <ul className="mt-2 min-h-0 flex-1 space-y-2 overflow-y-auto">
        {lista.map((p) => (
          <li key={p.clave} className="flex items-start gap-2">
            {p.gravedad === "critica" ? (
              <TriangleAlert
                className="mt-0.5 size-4 shrink-0"
                style={{ color: "var(--color-peligro)" }}
                aria-label="Urgente"
              />
            ) : (
              <Info
                className="mt-0.5 size-4 shrink-0"
                style={{ color: "var(--color-alerta)" }}
                aria-label="Por mirar"
              />
            )}
            <div className="min-w-0">
              <p className="text-sm font-medium">{p.titulo}</p>
              {/* La consecuencia es lo que mueve a alguien: "12 tareas sin
                  analizar" no significa nada hasta que se dice que por eso la
                  confiabilidad esta mintiendo. */}
              <p className="text-xs opacity-70">{p.consecuencia}</p>

              {/* Y la salida. Hasta el 12/08/2026 el enlace estaba escondido en
                  el titulo con `decoration-transparent`: no se veia que fuera
                  pulsable, asi que el panel se leia como una queja de la que no
                  se podia salir a arreglar nada. Ahora es una linea propia, con
                  color de enlace, flecha, y el texto de lo que hay que hacer
                  nombrando el boton de la pantalla de destino. */}
              <Link
                href={`/obras/${obraId}${p.camino}`}
                className="group mt-1 inline-flex items-start gap-1 text-xs font-medium underline decoration-dotted underline-offset-2 hover:decoration-solid"
                style={{ color: "var(--color-marca-600)" }}
              >
                <span>{p.accion}</span>
                <ArrowRight
                  className="mt-0.5 size-3 shrink-0 transition-transform group-hover:translate-x-0.5"
                  aria-hidden="true"
                />
              </Link>
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}

// ---------------------------------------------------------------------------
// Proximos recordatorios
// ---------------------------------------------------------------------------

/// "vence el 3 sep." leido en UTC, no en hora local: `fechaRecordatorio` es
/// un dia de calendario, y convertirlo a hora de Lima (UTC-5) lo correria un
/// dia hacia atras justo despues de medianoche.
const FORMATO_FECHA_RECORDATORIO = new Intl.DateTimeFormat("es-PE", {
  timeZone: "UTC",
  day: "numeric",
  month: "short",
});

function Recordatorios({
  lista,
  obraId,
}: {
  lista: NonNullable<DatosTablero["recordatorios"]>;
  obraId: string;
}) {
  if (lista.length === 0) {
    return (
      <p
        className="mt-2 flex items-center gap-1.5 text-sm"
        style={{ color: "var(--color-exito)" }}
      >
        <CircleCheck className="size-4 shrink-0" aria-hidden="true" />
        Sin recordatorios pendientes.
      </p>
    );
  }

  return (
    <ul className="mt-2 min-h-0 flex-1 space-y-2 overflow-y-auto">
      {lista.map((r) => (
        <li key={r.id} className="flex items-start gap-2">
          {r.vencida ? (
            <TriangleAlert
              className="mt-0.5 size-4 shrink-0"
              style={{ color: "var(--color-peligro)" }}
              aria-label="Vencida"
            />
          ) : (
            <CalendarClock
              className="mt-0.5 size-4 shrink-0"
              style={{ color: "var(--color-alerta)" }}
              aria-label="Con fecha"
            />
          )}
          <div className="min-w-0">
            <p className="text-sm font-medium">{r.titulo}</p>
            <p
              className="text-xs"
              style={{
                color: r.vencida ? "var(--color-peligro)" : undefined,
                opacity: r.vencida ? undefined : 0.7,
              }}
            >
              {r.vencida
                ? `Vencida — ${FORMATO_FECHA_RECORDATORIO.format(r.fechaRecordatorio)}`
                : `Vence el ${FORMATO_FECHA_RECORDATORIO.format(r.fechaRecordatorio)}`}
            </p>
            <Link
              href={`/obras/${obraId}/notas#nota-${r.id}`}
              className="group mt-1 inline-flex items-start gap-1 text-xs font-medium underline decoration-dotted underline-offset-2 hover:decoration-solid"
              style={{ color: "var(--color-marca-600)" }}
            >
              <span>Ver en Notas</span>
              <ArrowRight
                className="mt-0.5 size-3 shrink-0 transition-transform group-hover:translate-x-0.5"
                aria-hidden="true"
              />
            </Link>
          </div>
        </li>
      ))}
    </ul>
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
        <p className="mt-2 text-sm opacity-60">
          {ordenes.anuladas === 0
            ? "Aún no se ha emitido ninguna orden."
            : `Sin órdenes vivas (${ordenes.anuladas} ${ordenes.anuladas === 1 ? "anulada" : "anuladas"}).`}
        </p>
        <p className="mt-1 text-xs opacity-50">
          Una orden suelta suma al comprometido al aprobarse; emitida contra
          un encargo, formaliza lo que el encargo ya puso.
        </p>
        <EnlaceModulo href={`/obras/${obraId}/ordenes`}>
          Ver órdenes
        </EnlaceModulo>
      </>
    );
  }

  return (
    <>
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
        Ver órdenes
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

/** Cuanto tarda en liberarse cada flujo, de lo que mas frena hacia abajo. */
function Demora({
  dem,
  obraId,
}: {
  dem: NonNullable<DatosTablero["liberacion"]>;
  obraId: string;
}) {
  const peor = dem.flujos[0];

  return (
    <>
      {peor && (
        <p className="mt-1 text-2xl font-semibold tabular-nums">
          {peor.dias} <span className="text-base font-normal">días</span>
          <span className="ml-2 text-sm font-normal opacity-70">
            {peor.etiqueta}
          </span>
        </p>
      )}

      <ul className="mt-2 space-y-1 text-xs">
        {dem.flujos.slice(0, 4).map((f) => (
          <li key={f.tipo} className="flex items-baseline justify-between gap-2">
            <span className="truncate">{f.etiqueta}</span>
            <span className="shrink-0 tabular-nums opacity-70">
              {f.dias} d · mediana {f.mediana} · {f.casos}
            </span>
          </li>
        ))}
      </ul>

      {dem.ventana !== null && (
        <p className="mt-2 text-xs opacity-70">
          El flujo más lento pide una ventana de {dem.ventana}{" "}
          {dem.ventana === 1 ? "semana" : "semanas"}.
        </p>
      )}

      <EnlaceModulo href={`/obras/${obraId}/lookahead`}>
        Ver el Lookahead
      </EnlaceModulo>
    </>
  );
}
