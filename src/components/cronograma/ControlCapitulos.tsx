import type { Capitulo } from "@/lib/control-avance";
import { decimal } from "@/utils/formato";

/**
 * Como va cada capitulo de la obra.
 *
 * Es la lectura que falta entre la curva —una sola cifra para toda la obra— y
 * la tabla de ciento y pico filas. Con trece barras se ve de un vistazo donde
 * esta el problema, que es la pregunta que se hace en una reunion de obra.
 *
 * Cada capitulo se pondera por la duracion de sus partidas, no por su numero:
 * un capitulo de veinte partidas cortas no vale mas que uno de tres largas.
 */
export function ControlCapitulos({ capitulos }: { capitulos: Capitulo[] }) {
  // Los capitulos de puros hitos se quedan fuera: su real ponderado sale cero
  // por construccion —los hitos no duran—, y junto a un planeado del 100%
  // describirian un atraso que no existe.
  const medibles = capitulos.filter((c) => c.medible);
  if (medibles.length === 0) return null;

  return (
    <div
      className="overflow-x-auto rounded-lg border"
      style={{ borderColor: "var(--borde)" }}
    >
      <table className="w-full min-w-[44rem] text-sm">
        <caption className="sr-only">Avance por capítulo</caption>
        <thead>
          <tr
            className="text-left text-xs uppercase"
            style={{ backgroundColor: "color-mix(in oklab, var(--borde) 40%, transparent)" }}
          >
            <th scope="col" className="px-3 py-2 font-medium">Capítulo</th>
            <th scope="col" className="px-3 py-2 font-medium">Avance</th>
            <th scope="col" className="px-3 py-2 text-right font-medium">Real</th>
            <th scope="col" className="px-3 py-2 text-right font-medium">Plan</th>
            <th scope="col" className="px-3 py-2 text-right font-medium">Desfase</th>
            <th scope="col" className="px-3 py-2 text-right font-medium">Partidas</th>
          </tr>
        </thead>
        <tbody>
          {medibles.map((c) => {
            const desfase = Number(c.desfase) || 0;
            const atrasado = desfase < 0;

            return (
              <tr key={c.uid} className="border-t" style={{ borderColor: "var(--borde)" }}>
                <td className="px-3 py-2">
                  <span className="font-medium">
                    {c.codigo && (
                      <span className="mr-2 font-mono text-xs opacity-60">{c.codigo}</span>
                    )}
                    {c.nombre}
                  </span>
                </td>

                <td className="px-3 py-2">
                  <Barra planeado={c.planeado} real={c.real} />
                </td>

                <td className="px-3 py-2 text-right font-semibold tabular-nums">
                  {decimal(c.real, "")}%
                </td>
                <td className="px-3 py-2 text-right tabular-nums opacity-70">
                  {decimal(c.planeado, "")}%
                </td>

                <td
                  className="px-3 py-2 text-right font-semibold tabular-nums"
                  style={{
                    color: atrasado
                      ? "var(--color-peligro)"
                      : desfase > 0
                        ? "var(--color-exito)"
                        : undefined,
                    opacity: desfase === 0 ? 0.5 : 1,
                  }}
                >
                  {desfase > 0 ? "+" : ""}
                  {decimal(c.desfase, "")}%
                </td>

                <td className="px-3 py-2 text-right text-xs whitespace-nowrap opacity-70">
                  {c.hojas}
                  {c.atrasadas > 0 && (
                    <span style={{ color: "var(--color-peligro)" }}>
                      {" "}
                      · {c.atrasadas} atrasada{c.atrasadas === 1 ? "" : "s"}
                    </span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** La misma lectura que en la tabla de tareas: la barra llega o no a la marca. */
function Barra({ planeado, real }: { planeado: string; real: string }) {
  const acotar = (v: string) => Math.min(100, Math.max(0, Number(v) || 0));
  const p = acotar(planeado);
  const r = acotar(real);

  return (
    <span
      className="relative block h-2.5 w-40 overflow-hidden rounded-full"
      style={{ backgroundColor: "color-mix(in oklab, var(--borde) 70%, transparent)" }}
      role="img"
      aria-label={`Real ${r.toFixed(1)}% sobre un plan de ${p.toFixed(1)}%`}
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
