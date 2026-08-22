import type { PuntoPpc, FilaPareto } from "@/lib/plan-semanal";
import {
  ETIQUETA_CNC,
  PPC_OBJETIVO,
  CORTE_PARETO,
  bandaDePpc,
  filasDeParetoAcumulado,
} from "@/lib/plan-semanal";
import { fechaCorta } from "@/utils/fechas";

/**
 * Los dos KPI del Last Planner: la TENDENCIA del PPC por semana y el PARETO de
 * causas de no cumplimiento. SVG/HTML a mano, colores del tema (como el resto
 * de los graficos de la app).
 */

const COLOR_BANDA = {
  bueno: "var(--color-exito)",
  flojo: "var(--color-alerta)",
  malo: "var(--color-peligro)",
} as const;

export function GraficosPpc({
  tendencia,
  pareto,
}: {
  tendencia: PuntoPpc[];
  pareto: FilaPareto[];
}) {
  if (tendencia.length === 0 && pareto.length === 0) return null;

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {/* `id` para poder enlazar aqui desde el modulo "PPC (Last Planner)"
          del tablero, mismo criterio que el Pareto de al lado. */}
      <div
        id="ppc-tendencia"
        className="scroll-mt-20 rounded-xl border p-4"
        style={{ borderColor: "var(--borde)", backgroundColor: "var(--superficie)" }}
      >
        <h3 className="text-sm font-semibold">PPC por semana</h3>
        <p className="mb-2 text-xs opacity-60">
          Qué parte de lo prometido se cumplió. La raya es el objetivo del{" "}
          {PPC_OBJETIVO}%.
        </p>
        <Tendencia puntos={tendencia} />
      </div>
      {/* `id` para poder enlazar aqui desde el panel «Que falta»: cuando el
          PPC baja, lo unico que dice POR QUE es este Pareto, y aterrizar en la
          lista de semanas obliga a bajar a buscarlo. `scroll-mt-20` deja sitio
          para la cabecera fija. */}
      <div
        id="pareto"
        className="scroll-mt-20 rounded-xl border p-4"
        style={{ borderColor: "var(--borde)", backgroundColor: "var(--superficie)" }}
      >
        <h3 className="text-sm font-semibold">Causas de no cumplimiento</h3>
        <p className="mb-2 text-xs opacity-60">
          De mayor a menor, con el acumulado: las marcadas suman el{" "}
          {CORTE_PARETO}% de los fallos.
        </p>
        <Pareto filas={pareto} />
      </div>
    </div>
  );
}

/**
 * El PPC por semana, EN BARRAS.
 *
 * Era una linea con puntos, y una linea afirma algo que no es cierto: que
 * entre dos semanas hay valores intermedios. El PPC es un dato discreto que
 * existe una vez por semana, al cerrar. En barras se lee lo que es —mediciones
 * sueltas— y cada una puede llevar su cifra encima, que es lo que la gente
 * busca al mirar este grafico.
 *
 * El color sale de `bandaDePpc`, los mismos umbrales con los que el panel «Que
 * falta» decide si alarmarse. Si el grafico pintara en rojo lo que el panel
 * llama aceptable, uno de los dos sobraria.
 */
function Tendencia({ puntos }: { puntos: PuntoPpc[] }) {
  if (puntos.length === 0) {
    return (
      <p className="text-sm opacity-60">
        Aún no hay semanas cerradas. El PPC aparece al cerrar la primera: una
        semana abierta todavía no dice nada.
      </p>
    );
  }

  const ANCHO = 380;
  const ALTO = 190;
  const M = { arriba: 18, derecha: 12, abajo: 30, izquierda: 32 };
  const anchoUtil = ANCHO - M.izquierda - M.derecha;
  const altoUtil = ALTO - M.arriba - M.abajo;

  const y = (v: number) =>
    M.arriba + altoUtil - (Math.min(100, Math.max(0, v)) / 100) * altoUtil;

  // Ancho de barra proporcional, con tope: con dos semanas, dos barras de
  // media caja de ancho parecen un grafico roto.
  const paso = anchoUtil / puntos.length;
  const ancho = Math.min(44, paso * 0.6);

  const media = puntos.reduce((s, p) => s + p.ppc, 0) / puntos.length;

  return (
    <>
      <svg
        viewBox={`0 0 ${ANCHO} ${ALTO}`}
        className="h-auto w-full"
        role="img"
        aria-label={`PPC de ${puntos.length} semana(s) cerrada(s)`}
        style={{ color: "var(--texto)" }}
      >
        {[0, 50, 100].map((v) => (
          <g key={v}>
            <line
              x1={M.izquierda}
              x2={ANCHO - M.derecha}
              y1={y(v)}
              y2={y(v)}
              stroke="var(--borde)"
              strokeWidth={1}
            />
            <text
              x={M.izquierda - 6}
              y={y(v) + 4}
              textAnchor="end"
              fontSize={10}
              fill="currentColor"
              opacity={0.6}
            >
              {v}%
            </text>
          </g>
        ))}

        {/* El objetivo, por debajo de las barras: una barra que lo supera lo
            tapa, y se ve de un vistazo quien llega y quien no. */}
        <line
          x1={M.izquierda}
          x2={ANCHO - M.derecha}
          y1={y(PPC_OBJETIVO)}
          y2={y(PPC_OBJETIVO)}
          stroke="var(--color-exito)"
          strokeWidth={1}
          strokeDasharray="4 3"
          opacity={0.7}
        />

        {puntos.map((p, i) => {
          const cx = M.izquierda + paso * i + paso / 2;
          const alto = Math.max(1, y(0) - y(p.ppc));
          return (
            <g key={i}>
              <rect
                x={cx - ancho / 2}
                y={y(p.ppc)}
                width={ancho}
                height={alto}
                rx={2}
                fill={COLOR_BANDA[bandaDePpc(p.ppc)]}
              />
              <text
                x={cx}
                y={y(p.ppc) - 5}
                textAnchor="middle"
                fontSize={10}
                fontWeight={600}
                fill="currentColor"
              >
                {Math.round(p.ppc)}%
              </text>
              {/* La fecha, solo si caben. Con muchas semanas se rotularian
                  unas encima de otras y no se leeria ninguna. Se recorta el
                  ano: en el eje anterior salia «15/08/20», partido a la mitad
                  por el borde de la caja. */}
              {paso >= 32 && (
                <text
                  x={cx}
                  y={ALTO - M.abajo + 14}
                  textAnchor="middle"
                  fontSize={9}
                  fill="currentColor"
                  opacity={0.6}
                >
                  {fechaCorta(p.fecha).slice(0, 5)}
                </text>
              )}
            </g>
          );
        })}
      </svg>

      <p className="mt-1 text-xs opacity-70">
        Media de {puntos.length}{" "}
        {puntos.length === 1 ? "semana cerrada" : "semanas cerradas"}:{" "}
        <strong className="tabular-nums">{Math.round(media)}%</strong>
      </p>
    </>
  );
}

/**
 * El Pareto de causas, CON ACUMULADO.
 *
 * Era un ranking: decia cual falla mas, pero no cuantas causas hay que atacar.
 * Eso lo dice el acumulado —la regla 80/20—: las que hacen falta para llegar al
 * 80% de los fallos son la lista de trabajo, y el resto es cola.
 *
 * La curva del Pareto clasico no se puede trazar sobre barras HORIZONTALES, y
 * horizontales tienen que ser porque las etiquetas son largas («Prerrequisito /
 * tarea previa»). En su lugar cada barra lleva la MARCA de por donde va el
 * acumulado al llegar a ella, que es la misma informacion leida fila a fila.
 */
function Pareto({ filas }: { filas: FilaPareto[] }) {
  if (filas.length === 0) {
    return (
      <p className="text-sm opacity-60">
        Sin causas registradas todavía. Aparecen al cerrar una semana con algún
        compromiso incumplido.
      </p>
    );
  }

  const acumulado = filasDeParetoAcumulado(filas);
  const total = acumulado[acumulado.length - 1]?.acumulado ?? 0;
  const cuantasMandan = acumulado.filter((f) => f.dentroDel80).length;

  return (
    <>
      <ul className="space-y-2">
        {acumulado.map((f) => (
          <li key={f.causa} className="text-sm">
            <div className="flex items-center justify-between gap-2">
              <span className="min-w-0 truncate">
                {f.dentroDel80 && (
                  <span
                    className="mr-1.5 inline-block size-1.5 rounded-full align-middle"
                    style={{ backgroundColor: "var(--color-peligro)" }}
                    aria-hidden="true"
                  />
                )}
                {ETIQUETA_CNC[f.causa]}
              </span>
              <span className="shrink-0 tabular-nums opacity-70">
                {f.conteo} · {Math.round(f.porcentaje)}%
              </span>
            </div>
            <div
              className="relative mt-1 h-2 w-full overflow-hidden rounded-full"
              style={{
                backgroundColor: "color-mix(in oklab, var(--borde) 70%, transparent)",
              }}
              title={`Acumulado hasta aquí: ${Math.round(f.acumuladoPorcentaje)}%`}
            >
              <div
                className="h-full rounded-full"
                style={{
                  width: `${f.porcentaje}%`,
                  backgroundColor: f.dentroDel80
                    ? "var(--color-peligro)"
                    : "color-mix(in oklab, var(--color-peligro) 45%, transparent)",
                }}
              />
              <span
                className="absolute top-0 h-full w-px"
                style={{
                  left: `${Math.min(100, f.acumuladoPorcentaje)}%`,
                  backgroundColor: "var(--texto)",
                  opacity: 0.5,
                }}
                aria-hidden="true"
              />
            </div>
          </li>
        ))}
      </ul>

      <p className="mt-2 text-xs opacity-70">
        {total} {total === 1 ? "incumplimiento" : "incumplimientos"} con causa.
        {cuantasMandan < acumulado.length
          ? ` Atacando ${cuantasMandan} ${cuantasMandan === 1 ? "causa" : "causas"} se cubre el ${CORTE_PARETO}%.`
          : " Todavía no hay una causa que destaque sobre las demás."}
      </p>
    </>
  );
}
