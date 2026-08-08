import { Diamond, Flag } from "lucide-react";
import type { CronogramaVigente } from "@/services/cronograma.service";
import { fechaCronograma } from "@/utils/fechas";
import { decimal } from "@/utils/formato";

type Fila = CronogramaVigente["tareas"][number];

/**
 * El cronograma tal como lo lee el residente: una fila por tarea, con el plan
 * a la izquierda y el avance a la derecha.
 *
 * Las dos barras van superpuestas y no una al lado de la otra: lo que se
 * mira de un vistazo no es cuanto lleva cada tarea, sino si va por delante o
 * por detras de lo previsto, y eso solo se ve comparando en el mismo eje.
 */
export function TablaCronograma({ tareas }: { tareas: Fila[] }) {
  return (
    <div
      className="overflow-x-auto rounded-lg border"
      style={{ borderColor: "var(--borde)" }}
    >
      <table className="w-full min-w-[58rem] text-sm">
        <caption className="sr-only">
          Tareas del cronograma con su avance planeado y real
        </caption>
        <thead>
          <tr
            className="text-left text-xs uppercase"
            style={{ backgroundColor: "color-mix(in oklab, var(--borde) 40%, transparent)" }}
          >
            <th scope="col" className="px-3 py-2 font-medium">Codigo</th>
            <th scope="col" className="px-3 py-2 font-medium">Tarea</th>
            <th scope="col" className="px-3 py-2 font-medium">Comienzo</th>
            <th scope="col" className="px-3 py-2 font-medium">Fin</th>
            <th scope="col" className="px-3 py-2 text-right font-medium">Dias</th>
            <th scope="col" className="px-3 py-2 font-medium">Avance</th>
            <th scope="col" className="px-3 py-2 text-right font-medium">Desfase</th>
          </tr>
        </thead>
        <tbody>
          {tareas.map((t) => (
            <tr
              key={t.uid}
              className="border-t"
              style={{
                borderColor: "var(--borde)",
                backgroundColor: t.esResumen
                  ? "color-mix(in oklab, var(--color-marca-500) 7%, transparent)"
                  : undefined,
              }}
            >
              <td className="px-3 py-1.5 font-mono text-xs whitespace-nowrap">
                {t.codigo ?? ""}
              </td>

              <td
                className={`px-3 py-1.5 ${t.esResumen ? "font-semibold" : ""}`}
                // La sangria sale del nivel de esquema y no del codigo: en el
                // archivo real "7.3.1" es hermana de "7.3", no su hija.
                style={{ paddingLeft: `${0.75 + (t.nivel - 1) * 0.85}rem` }}
              >
                <span className="flex items-center gap-1.5">
                  {t.esHito && (
                    <Diamond
                      className="size-3 shrink-0"
                      style={{ color: "var(--color-marca-600)" }}
                      aria-label="Hito"
                    />
                  )}
                  {t.esCritico && !t.esHito && (
                    <Flag
                      className="size-3 shrink-0"
                      style={{ color: "var(--color-peligro)" }}
                      aria-label="En la ruta critica"
                    />
                  )}
                  <span>{t.nombre}</span>
                </span>
              </td>

              <td className="px-3 py-1.5 whitespace-nowrap opacity-70">
                {fechaCronograma(t.inicio)}
              </td>
              <td className="px-3 py-1.5 whitespace-nowrap opacity-70">
                {fechaCronograma(t.fin)}
              </td>
              <td className="px-3 py-1.5 text-right tabular-nums whitespace-nowrap">
                {decimal(t.duracionDias)}
              </td>

              <td className="px-3 py-1.5">
                <BarraAvance
                  planeado={t.porcentajePlaneado}
                  real={t.porcentajeReal}
                  reportado={t.avance !== null}
                />
              </td>

              <td className="px-3 py-1.5 text-right font-medium tabular-nums whitespace-nowrap">
                <Desfase valor={t.desfase} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * Planeado y real en el mismo eje.
 *
 * El planeado va como una marca fina sobre la barra en vez de como una
 * segunda barra: es una referencia, no una magnitud que competir. Asi la
 * lectura es «la barra llega o no llega a la marca».
 */
function BarraAvance({
  planeado,
  real,
  reportado,
}: {
  planeado: string;
  real: string;
  /// Lo reporto obra. Si no, la cifra es la que traia el archivo de Project.
  reportado: boolean;
}) {
  const acotar = (v: string) => Math.min(100, Math.max(0, Number(v) || 0));
  const p = acotar(planeado);
  const r = acotar(real);

  return (
    <span className="flex items-center gap-2">
      <span
        className="relative block h-2 w-28 shrink-0 overflow-hidden rounded-full"
        style={{ backgroundColor: "color-mix(in oklab, var(--borde) 70%, transparent)" }}
        role="img"
        aria-label={`Real ${r}% sobre un plan de ${p}%`}
      >
        <span
          className="absolute inset-y-0 left-0 rounded-full"
          style={{
            width: `${r}%`,
            backgroundColor:
              r + 0.001 >= p ? "var(--color-exito)" : "var(--color-alerta)",
          }}
        />
        {/* La marca del plan se dibuja encima, para que se vea aunque la
            barra ya la haya pasado. */}
        <span
          className="absolute inset-y-0 w-0.5"
          style={{ left: `calc(${p}% - 1px)`, backgroundColor: "var(--texto)" }}
        />
      </span>

      <span className="tabular-nums" style={{ opacity: reportado ? 1 : 0.6 }}>
        {decimal(real, "")}%
      </span>
    </span>
  );
}

function Desfase({ valor }: { valor: string }) {
  const n = Number(valor) || 0;
  const signo = n > 0 ? "+" : "";

  return (
    <span
      style={{
        color:
          n < 0
            ? "var(--color-peligro)"
            : n > 0
              ? "var(--color-exito)"
              : undefined,
        opacity: n === 0 ? 0.5 : 1,
      }}
    >
      {signo}
      {decimal(valor, "")}%
    </span>
  );
}
