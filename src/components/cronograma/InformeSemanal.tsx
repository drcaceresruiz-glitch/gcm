import type { DatosCurva, PeriodoInforme } from "@/services/cronograma.service";
import {
  capitulosDelInforme,
  type AlertaAtraso,
  type Capitulo,
  type PartidaActiva,
} from "@/lib/control-avance";
import {
  ETIQUETA_CNC,
  PPC_OBJETIVO,
  bandaDePpc,
  filasDeParetoAcumulado,
  type FilaPareto,
  type PuntoPpc,
} from "@/lib/plan-semanal";
import type { CausaNoCumplimiento } from "@/generated/prisma/enums";
import { fechaCorta, fechaEje, fechaLarga } from "@/utils/fechas";
import { decimal } from "@/utils/formato";
import { GaleriaEvidencia } from "@/components/evidencia/GaleriaEvidencia";
import type { FotoResumen } from "@/services/evidencia.service";

/**
 * El informe semanal de obra, en una pagina.
 *
 * Reproduce la primera pagina del informe que la obra ya entrega al cliente:
 * avance real contra planeado, curva S, alertas de atraso, control de
 * capitulos y las partidas vivas de la semana. Ese documento se tomo como
 * especificacion del modulo entero, asi que esto es el cierre del circulo:
 * lo que antes se montaba a mano sale ahora del cronograma cargado.
 *
 * Esta pensado para PAPEL. No lleva ni un control ni un solo byte de
 * JavaScript: todo se calcula en el servidor y se dibuja en SVG, de modo que
 * «Guardar como PDF» del navegador produce el documento tal cual. Un
 * generador de PDF en servidor exigiria un navegador sin ventana, y este
 * despliegue no puede correr binarios compilados.
 */

export interface DatosInforme {
  empresa: string;
  obra: string;
  ubicacion: string | null;
  fechaCorte: Date;
  version: number;
  importadoPor: string;
  /// Lo que dice el propio archivo del proyecto entero, para poder contrastar.
  planeadoProject: string | null;
  realProject: string | null;
  /**
   * Las tres cifras de cabecera, YA MEDIDAS A `fechaCorte` por el servicio.
   *
   * Antes se sacaban aqui del ultimo punto de `curva.cortes`, o sea de la
   * ultima importacion de MS Project, y por eso el informe se quedaba clavado
   * en la fecha del XML por mucho avance que entrara despues. Que vengan
   * calculadas es lo que permite emitir el informe de CUALQUIER semana: para
   * una pasada se miden solo los reportes que existian entonces.
   */
  real: string;
  planeado: string;
  desviacion: string;
  /// Lo que se movio entre el corte anterior y este.
  periodo: PeriodoInforme;
  curva: DatosCurva;
  capitulos: Capitulo[];
  alertas: AlertaAtraso[];
  activas: PartidaActiva[];
  /// Fotos de cada partida activa, por su uid. Es lo que convierte el informe
  /// de cifras en algo que ensena lo que se hizo.
  fotosPorUid: Record<number, FotoResumen[]>;
  /// Null cuando quien mira no tiene permiso de plan semanal: el informe sale
  /// igual, sin ese bloque, en vez de fallar entero.
  lastPlanner: DatosLastPlanner | null;
  generadoPor: string;
}

/// Lo que el bloque Last Planner necesita, ya medido a la fecha del informe.
export interface DatosLastPlanner {
  semana: {
    numero: number;
    cerrada: boolean;
    total: number;
    cumplidos: number;
    ppc: number | null;
  } | null;
  compromisos: {
    descripcion: string;
    cumplido: boolean | null;
    causa: CausaNoCumplimiento | null;
    notaCierre: string | null;
  }[];
  tendencia: PuntoPpc[];
  pareto: FilaPareto[];
}

const COLOR_BANDA_INFORME = {
  bueno: "var(--color-exito)",
  flojo: "var(--color-alerta)",
  malo: "var(--color-peligro)",
} as const;

export function InformeSemanal({ datos }: { datos: DatosInforme }) {
  const real = Number(datos.real);
  const planeado = Number(datos.planeado);
  const desviacion = Number(datos.desviacion);

  // La misma regla que usa la descarga en hoja de calculo: el papel y el
  // archivo tienen que listar los mismos capitulos.
  const capitulos = capitulosDelInforme(datos.capitulos);

  return (
    <article className="informe mx-auto max-w-[1180px] text-sm">
      <header
        className="flex flex-wrap items-start justify-between gap-4 border-b pb-4"
        style={{ borderColor: "var(--texto)" }}
      >
        <div>
          <p className="text-xs tracking-widest uppercase opacity-60">
            {datos.empresa}
          </p>
          <h1 className="mt-1 text-3xl font-light tracking-tight">{datos.obra}</h1>
          {datos.ubicacion && (
            <p className="mt-1 text-xs opacity-60">{datos.ubicacion}</p>
          )}
        </div>

        <dl className="text-right text-xs">
          <div className="flex justify-end gap-2">
            <dt className="opacity-60">Corte de control:</dt>
            <dd className="font-medium">{fechaLarga(datos.fechaCorte)}</dd>
          </div>
          <div className="mt-1 flex justify-end gap-2">
            <dt className="opacity-60">Cronograma:</dt>
            <dd className="font-medium">
              v{datos.version}, cargado por {datos.importadoPor}
            </dd>
          </div>
        </dl>
      </header>

      <div className="mt-5 grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.9fr)_minmax(0,1fr)]">
        <section>
          <Titulo>Avance de obra</Titulo>
          <div className="mt-3 flex justify-center">
            <Rosco real={real} />
          </div>

          <dl className="mt-3 grid grid-cols-2 gap-2 text-center">
            <div>
              <dd className="text-xl font-semibold tabular-nums">
                {decimal(String(planeado))}%
              </dd>
              <dt className="text-xs tracking-wider uppercase opacity-60">
                Planeado
              </dt>
            </div>
            <div>
              <dd
                className="text-xl font-semibold tabular-nums"
                style={{
                  color:
                    desviacion < 0 ? "var(--color-peligro)" : "var(--color-exito)",
                }}
              >
                {desviacion > 0 ? "+" : ""}
                {desviacion.toFixed(1)}%
              </dd>
              <dt className="text-xs tracking-wider uppercase opacity-60">
                Desviación
              </dt>
            </div>
          </dl>

          {/* Lo que dice Project por su cuenta, al lado y no en lugar de lo
              anterior: son dos formas de ponderar el mismo plan y esconder la
              diferencia seria justo lo que resta credibilidad al informe. */}
          {datos.planeadoProject !== null && (
            <p className="mt-3 text-center text-xs opacity-60">
              MS Project totaliza {decimal(datos.planeadoProject, "")}% planeado y{" "}
              {decimal(datos.realProject ?? "0", "")}% real con su propio método.
            </p>
          )}
        </section>

        <section>
          <Titulo>Curva S &mdash; proyeccion</Titulo>
          <CurvaEstatica curva={datos.curva} />
        </section>

        <section>
          <Titulo>Alertas de atraso</Titulo>
          {datos.alertas.length === 0 ? (
            <p className="mt-3 text-xs opacity-70">
              Ninguna partida va por detrás del plan.
            </p>
          ) : (
            <ul className="mt-3 space-y-2">
              {datos.alertas.slice(0, 4).map((a) => (
                <li
                  key={a.uid}
                  className="border-l-2 py-1 pl-3"
                  style={{
                    borderColor:
                      a.severidad === "alta"
                        ? "var(--color-peligro)"
                        : a.severidad === "media"
                          ? "var(--color-alerta)"
                          : "var(--borde)",
                  }}
                >
                  <p className="text-xs font-medium">
                    {a.codigo && <span className="mr-1">{a.codigo}</span>}
                    {a.nombre}
                  </p>
                  <p className="mt-1 flex items-baseline justify-between text-xs">
                    <span
                      className="tracking-wider uppercase"
                      style={{
                        color:
                          a.severidad === "alta"
                            ? "var(--color-peligro)"
                            : a.severidad === "media"
                              ? "var(--color-alerta)"
                              : undefined,
                        opacity: a.severidad === "baja" ? 0.6 : 1,
                      }}
                    >
                      {a.severidad === "alta"
                        ? "Urgente"
                        : a.severidad === "media"
                          ? "Atención"
                          : "Leve"}
                    </span>
                    <span className="font-semibold tabular-nums">
                      &minus;{a.diasAtraso} días
                    </span>
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.7fr)]">
        <section>
          <Titulo>Control de capítulos</Titulo>
          <ul className="mt-3 space-y-2.5">
            {capitulos.map((c) => (
              <li key={c.uid}>
                <div className="flex items-baseline justify-between gap-2 text-xs">
                  <span className="min-w-0 truncate font-medium">
                    {c.codigo && <span className="mr-1 opacity-60">{c.codigo}</span>}
                    {c.nombre}
                  </span>
                  <span className="shrink-0 tabular-nums">
                    <span className="opacity-60">P: {decimal(c.planeado, "")}%</span>{" "}
                    <strong
                      style={{
                        color:
                          Number(c.desfase) < 0
                            ? "var(--color-peligro)"
                            : "var(--color-exito)",
                      }}
                    >
                      R: {decimal(c.real, "")}%
                    </strong>
                  </span>
                </div>
                <BarraInforme planeado={c.planeado} real={c.real} />
              </li>
            ))}
          </ul>
        </section>

        <section>
          <Titulo>Partidas activas destacadas</Titulo>
          <table className="mt-3 w-full text-xs">
            <thead>
              <tr className="border-b" style={{ borderColor: "var(--borde)" }}>
                <th scope="col" className="pb-1 text-left font-normal opacity-60">Id</th>
                <th scope="col" className="pb-1 text-left font-normal opacity-60">Descripción de tarea</th>
                <th scope="col" className="pb-1 text-left font-normal opacity-60">Fechas</th>
                <th scope="col" className="pb-1 text-right font-normal opacity-60">% Plan</th>
                <th scope="col" className="pb-1 text-right font-normal opacity-60">% Real</th>
                <th scope="col" className="pb-1 text-left font-normal opacity-60">Fotos</th>
              </tr>
            </thead>
            <tbody>
              {datos.activas.slice(0, 10).map((p) => (
                <tr key={p.uid} className="border-b align-top" style={{ borderColor: "var(--borde)" }}>
                  <td className="py-1.5 tabular-nums opacity-50">{p.fila}</td>
                  <td className="py-1.5 pr-3">
                    {p.codigo && <span className="mr-1">{p.codigo}</span>}
                    {p.nombre}
                  </td>
                  <td className="py-1.5 whitespace-nowrap opacity-60">
                    {fechaEje(p.inicio)} &ndash; {fechaEje(p.fin)}
                  </td>
                  <td className="py-1.5 text-right tabular-nums opacity-70">
                    {decimal(p.porcentajePlaneado, "")}%
                  </td>
                  <td
                    className="py-1.5 text-right font-semibold tabular-nums"
                    style={{
                      color:
                        Number(p.desfase) < 0
                          ? "var(--color-peligro)"
                          : "var(--color-exito)",
                    }}
                  >
                    {decimal(p.porcentajeReal, "")}%
                  </td>
                  <td className="py-1.5">
                    {/* Miniaturas pequenas: el informe se imprime, y a size-20
                        una fila con fotos rompe la maqueta. `GaleriaEvidencia`
                        se calla solo si la partida no tiene ninguna. */}
                    <GaleriaEvidencia
                      fotos={datos.fotosPorUid[p.uid] ?? []}
                      tamano="size-12"
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {datos.activas.length === 0 && (
            <p className="mt-3 text-xs opacity-70">
              Ninguna partida en marcha en la semana del corte.
            </p>
          )}
        </section>
      </div>

      <SeccionPeriodo periodo={datos.periodo} hasta={datos.fechaCorte} />

      {datos.lastPlanner && <SeccionLastPlanner lp={datos.lastPlanner} />}

      <footer
        className="mt-8 border-t pt-3 text-center text-xs tracking-wider uppercase opacity-50"
        style={{ borderColor: "var(--borde)" }}
      >
        Informe generado el {fechaLarga(new Date())} por {datos.generadoPor} &middot;{" "}
        GCM &mdash; Gestión en Construcción Moderna
      </footer>
    </article>
  );
}

/**
 * Lo que se movio EN EL PERIODO.
 *
 * El informe daba solo acumulados —22.6% real sobre 13.06% planeado— y de un
 * informe periodico lo primero que se espera es que diga que paso en ese
 * periodo. Un acumulado no distingue una semana de mucho trabajo de una
 * parada: las dos suben el numero, una mas que otra, y para saberlo habia que
 * restar a mano contra el informe anterior.
 *
 * Se listan solo las tareas que SE MOVIERON. Una que sigue igual no es noticia
 * del periodo, y con cien filas la lista dejaria de leerse.
 */
function SeccionPeriodo({
  periodo,
  hasta,
}: {
  periodo: PeriodoInforme;
  hasta: Date;
}) {
  if (periodo.desde === null) {
    return null; // Primer informe de la obra: no hay periodo, hay un principio.
  }

  const ganado = Number(periodo.ganado);

  return (
    <section className="mt-6 break-inside-avoid">
      <Titulo>
        Avance del periodo &mdash; {fechaCorta(periodo.desde)} a{" "}
        {fechaCorta(hasta)}
      </Titulo>

      <div className="mt-3 grid gap-6 md:grid-cols-[220px_minmax(0,1fr)]">
        <div>
          <p
            className="text-4xl font-light tabular-nums"
            style={{
              color: ganado > 0 ? "var(--color-exito)" : "var(--texto)",
            }}
          >
            {decimal(periodo.ganado, "")}
          </p>
          <p className="text-xs tracking-widest uppercase opacity-60">
            puntos ganados
          </p>
          <p className="mt-1 text-xs opacity-70">
            Del {decimal(periodo.realAnterior, "")}% al{" "}
            {decimal(String(Number(periodo.realAnterior) + ganado), "")}% de obra
            ejecutada.
          </p>
          {periodo.tareas.length === 0 && (
            <p className="mt-2 text-xs" style={{ color: "var(--color-alerta)" }}>
              Ninguna partida registró avance en el periodo.
            </p>
          )}
        </div>

        {periodo.tareas.length > 0 && (
          <div>
            <p className="mb-2 text-xs opacity-60">
              {periodo.tareas.length}{" "}
              {periodo.tareas.length === 1 ? "partida avanzó" : "partidas avanzaron"}
            </p>
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b" style={{ borderColor: "var(--borde)" }}>
                  <th scope="col" className="pb-1 text-left font-normal opacity-60">
                    Partida
                  </th>
                  <th scope="col" className="pb-1 text-right font-normal opacity-60">
                    Antes
                  </th>
                  <th scope="col" className="pb-1 text-right font-normal opacity-60">
                    Ahora
                  </th>
                  <th scope="col" className="pb-1 text-right font-normal opacity-60">
                    Ganó
                  </th>
                </tr>
              </thead>
              <tbody>
                {periodo.tareas.slice(0, 12).map((t) => (
                  <tr key={t.uid} className="border-b" style={{ borderColor: "var(--borde)" }}>
                    <td className="py-1">
                      {t.codigo && <span className="opacity-50">{t.codigo} </span>}
                      {t.nombre}
                    </td>
                    <td className="py-1 text-right tabular-nums opacity-60">
                      {decimal(t.antes, "")}%
                    </td>
                    <td className="py-1 text-right tabular-nums">
                      {decimal(t.ahora, "")}%
                    </td>
                    <td
                      className="py-1 text-right font-semibold tabular-nums"
                      style={{ color: "var(--color-exito)" }}
                    >
                      +{decimal(t.delta, "")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {periodo.tareas.length > 12 && (
              <p className="mt-1 text-xs opacity-60">
                y {periodo.tareas.length - 12} más.
              </p>
            )}
          </div>
        )}
      </div>
    </section>
  );
}

/**
 * El bloque Last Planner del informe.
 *
 * Hasta el 12/08/2026 este documento no mencionaba el Last Planner: daba
 * avance fisico, curva S, capitulos y alertas —todo lo que se saca de un
 * cronograma— y ni una linea de PPC, causas o compromisos. En una herramienta
 * construida sobre Last Planner eso dejaba fuera justo lo que la distingue de
 * exportar el Gantt.
 *
 * Y no es un adorno: se puede ir al dia en la curva con un PPC del 50%. Cuando
 * pasa, significa que el ritmo tapa una planificacion que no se cumple, y eso
 * se paga mas adelante. Las dos cifras juntas cuentan la obra; cada una por su
 * lado, no.
 *
 * Va al final y no arriba a proposito: el cliente que recibe el papel busca
 * primero el avance, y quien dirige la obra lee esto.
 */
function SeccionLastPlanner({ lp }: { lp: DatosLastPlanner }) {
  const acumulado = filasDeParetoAcumulado(lp.pareto);
  const media =
    lp.tendencia.length > 0
      ? lp.tendencia.reduce((s, p) => s + p.ppc, 0) / lp.tendencia.length
      : null;

  return (
    <section className="mt-6 break-inside-avoid">
      <Titulo>Last Planner &mdash; confiabilidad de la planificación</Titulo>

      <div className="mt-3 grid gap-6 md:grid-cols-[220px_minmax(0,1fr)]">
        <div>
          {lp.semana ? (
            <>
              <p className="text-xs opacity-60">Semana {lp.semana.numero}</p>
              {lp.semana.ppc !== null ? (
                <>
                  <p
                    className="text-4xl font-light tabular-nums"
                    style={{ color: COLOR_BANDA_INFORME[bandaDePpc(lp.semana.ppc)] }}
                  >
                    {Math.round(lp.semana.ppc)}%
                  </p>
                  <p className="text-xs tracking-widest uppercase opacity-60">
                    PPC
                  </p>
                  <p className="mt-1 text-xs opacity-70">
                    {lp.semana.cumplidos} de {lp.semana.total} compromisos
                    cumplidos.
                  </p>
                </>
              ) : (
                /* Una semana abierta no tiene PPC: los compromisos aun no se
                   han evaluado, y un porcentaje a medias en un papel firmado
                   es peor que no ponerlo. */
                <p className="mt-1 text-sm opacity-70">
                  Semana sin cerrar: {lp.semana.total} compromisos a la espera
                  de evaluación. El PPC sale al cerrarla.
                </p>
              )}
            </>
          ) : (
            <p className="text-sm opacity-70">
              No hay una semana del plan que cierre en esta fecha.
            </p>
          )}

          {media !== null && (
            <p className="mt-3 text-xs opacity-70">
              Media histórica: <strong>{Math.round(media)}%</strong> en{" "}
              {lp.tendencia.length}{" "}
              {lp.tendencia.length === 1 ? "semana" : "semanas"} cerradas.
              {/* La referencia, para que el numero signifique algo a quien no
                  vive dentro del Last Planner. */}
              <span className="opacity-70"> Objetivo: {PPC_OBJETIVO}%.</span>
            </p>
          )}
        </div>

        <div>
          {acumulado.length > 0 ? (
            <>
              <p className="mb-2 text-xs opacity-60">
                Causas de no cumplimiento acumuladas hasta este corte
              </p>
              <ul className="space-y-1.5">
                {acumulado.slice(0, 6).map((f) => (
                  <li key={f.causa} className="text-xs">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="min-w-0 truncate">
                        {f.dentroDel80 && "▸ "}
                        {ETIQUETA_CNC[f.causa]}
                      </span>
                      <span className="shrink-0 tabular-nums opacity-70">
                        {f.conteo} · {Math.round(f.porcentaje)}%
                      </span>
                    </div>
                    <span
                      className="mt-0.5 block h-1 rounded-full"
                      style={{
                        width: `${f.porcentaje}%`,
                        backgroundColor: f.dentroDel80
                          ? "var(--color-peligro)"
                          : "color-mix(in oklab, var(--color-peligro) 45%, transparent)",
                      }}
                    />
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-xs opacity-60">
                ▸ Las marcadas suman el 80% de los incumplimientos: son las que
                hay que atacar.
              </p>
            </>
          ) : (
            <p className="text-xs opacity-70">
              Sin incumplimientos con causa registrada hasta este corte.
            </p>
          )}

          {/* Lo prometido y lo que fallo, con nombre. Es el detalle que
              convierte el PPC en una conversacion y no en una nota. */}
          {lp.compromisos.length > 0 && (
            <ul className="mt-4 space-y-1 text-xs">
              {lp.compromisos.map((c, i) => (
                <li key={i} className="flex items-start gap-2">
                  <span
                    className="mt-0.5 shrink-0 font-semibold"
                    style={{
                      color:
                        c.cumplido === true
                          ? "var(--color-exito)"
                          : c.cumplido === false
                            ? "var(--color-peligro)"
                            : "var(--texto)",
                    }}
                  >
                    {c.cumplido === true ? "✓" : c.cumplido === false ? "✗" : "·"}
                  </span>
                  <span className="min-w-0">
                    {c.descripcion}
                    {c.cumplido === false && c.causa && (
                      <span className="opacity-70">
                        {" "}
                        — {ETIQUETA_CNC[c.causa]}
                        {c.notaCierre ? `: ${c.notaCierre}` : ""}
                      </span>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}

function Titulo({ children }: { children: React.ReactNode }) {
  return (
    <h2
      className="border-b pb-1 text-xs font-semibold tracking-widest uppercase"
      style={{ borderColor: "var(--borde)" }}
    >
      {children}
    </h2>
  );
}

/**
 * El rosco del avance real.
 *
 * Un anillo y no una barra porque es la cifra que encabeza el informe y tiene
 * que leerse desde el otro lado de la mesa. Se dibuja con un `stroke-dasharray`
 * sobre un circulo: sin rutas, sin libreria y sin JavaScript.
 */
function Rosco({ real }: { real: number }) {
  const radio = 52;
  const circunferencia = 2 * Math.PI * radio;
  const pintado = (Math.min(100, Math.max(0, real)) / 100) * circunferencia;

  return (
    <svg viewBox="0 0 140 140" className="h-36 w-36" role="img"
      aria-label={`Avance real ${real.toFixed(1)} por ciento`}>
      <circle
        cx={70} cy={70} r={radio} fill="none"
        stroke="var(--borde)" strokeWidth={14}
      />
      <circle
        cx={70} cy={70} r={radio} fill="none"
        stroke="var(--color-marca-600)" strokeWidth={14} strokeLinecap="round"
        strokeDasharray={`${pintado} ${circunferencia - pintado}`}
        // Se arranca arriba y no a la derecha, que es donde empieza un circulo
        // SVG por defecto y se lee como si faltara un cuarto de vuelta.
        transform="rotate(-90 70 70)"
      />
      <text
        x={70} y={68} textAnchor="middle" fontSize={22} fontWeight={300}
        fill="var(--color-marca-600)"
      >
        {/* Un decimal, no entero: redondear 10.85 a "11%" lo hacia parecer
            identico al 11% que Project totaliza por su cuenta, y son cifras
            distintas —GCM pondera por duracion, Project por su metodo—.
            Ademas cuadra con la desviacion, que ya va a un decimal. */}
        {real.toFixed(1)}%
      </text>
      <text
        x={70} y={84} textAnchor="middle" fontSize={9}
        fill="currentColor" opacity={0.6} letterSpacing={2}
      >
        REAL
      </text>
    </svg>
  );
}

/** La misma curva de la pantalla, sin controles y con el eje del plazo entero. */
function CurvaEstatica({ curva }: { curva: DatosCurva }) {
  if (curva.plan.length === 0 || !curva.inicio || !curva.fin) {
    return <p className="mt-3 text-xs opacity-70">Sin curva todavía.</p>;
  }

  const ANCHO = 560;
  const ALTO = 210;
  const M = { arriba: 10, derecha: 12, abajo: 26, izquierda: 30 };

  const anchoUtil = ANCHO - M.izquierda - M.derecha;
  const altoUtil = ALTO - M.arriba - M.abajo;

  const t0 = curva.inicio.getTime();
  const span = Math.max(1, curva.fin.getTime() - t0);

  const x = (f: Date) => M.izquierda + ((f.getTime() - t0) / span) * anchoUtil;
  const y = (v: number) => M.arriba + altoUtil - (Math.min(100, Math.max(0, v)) / 100) * altoUtil;

  const trazo = (p: { fecha: Date; valor: number }[]) =>
    p.map((q) => `${x(q.fecha).toFixed(1)},${y(q.valor).toFixed(1)}`).join(" ");

  const reales = curva.cortes.map((c) => ({
    fecha: c.fecha,
    valor: Number(c.real) || 0,
  }));

  const etiquetas = [0, 0.25, 0.5, 0.75, 1].map(
    (f) => new Date(t0 + span * f),
  );

  return (
    <>
      <svg viewBox={`0 0 ${ANCHO} ${ALTO}`} className="mt-2 h-auto w-full" role="img"
        aria-label="Curva de avance planeado contra real">
        {[0, 25, 50, 75, 100].map((v) => (
          <g key={v}>
            <line
              x1={M.izquierda} x2={ANCHO - M.derecha} y1={y(v)} y2={y(v)}
              stroke="var(--borde)" strokeWidth={0.8}
            />
            <text x={M.izquierda - 5} y={y(v) + 3} textAnchor="end" fontSize={8}
              fill="currentColor" opacity={0.6}>
              {v}
            </text>
          </g>
        ))}

        <polyline points={trazo(curva.plan)} fill="none" stroke="var(--texto)"
          strokeWidth={1.6} strokeDasharray="4 3" opacity={0.6} />

        {curva.proyeccion.length > 1 && (
          <polyline points={trazo(curva.proyeccion)} fill="none"
            stroke="var(--color-exito)" strokeWidth={1.6} strokeDasharray="2 3" />
        )}

        <polyline points={trazo(reales)} fill="none"
          stroke="var(--color-marca-600)" strokeWidth={2.5} strokeLinecap="round" />

        {reales.map((p) => (
          <circle key={p.fecha.getTime()} cx={x(p.fecha)} cy={y(p.valor)} r={3}
            fill="var(--color-marca-600)" />
        ))}

        {etiquetas.map((f) => (
          <text key={f.getTime()} x={x(f)} y={ALTO - 8} textAnchor="middle"
            fontSize={8} fill="currentColor" opacity={0.6}>
            {fechaCorta(f)}
          </text>
        ))}
      </svg>

      <p className="mt-1 flex flex-wrap justify-center gap-4 text-xs opacity-70">
        <span>- - - Avance planeado</span>
        <span style={{ color: "var(--color-marca-600)" }}>&mdash; Avance real</span>
        <span style={{ color: "var(--color-exito)" }}>&middot;&middot;&middot; Proyección</span>
      </p>
    </>
  );
}

function BarraInforme({ planeado, real }: { planeado: string; real: string }) {
  const acotar = (v: string) => Math.min(100, Math.max(0, Number(v) || 0));
  const p = acotar(planeado);
  const r = acotar(real);

  return (
    <span
      className="relative mt-1 block h-1.5 w-full overflow-hidden rounded-full"
      style={{ backgroundColor: "color-mix(in oklab, var(--borde) 70%, transparent)" }}
    >
      <span
        className="absolute inset-y-0 left-0 rounded-full"
        style={{
          width: `${r}%`,
          backgroundColor: r + 0.001 >= p ? "var(--color-exito)" : "var(--color-alerta)",
        }}
      />
      <span
        className="absolute inset-y-0 w-0.5"
        style={{ left: `calc(${p}% - 1px)`, backgroundColor: "var(--texto)" }}
      />
    </span>
  );
}
