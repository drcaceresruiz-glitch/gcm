import { soles } from "@/utils/formato";
import type { LineaBolsa, SenalBolsa } from "@/lib/bolsa";

/**
 * La bolsa linea a linea.
 *
 * La columna que decide la lectura es la SENAL, no el importe: una linea
 * `sin_meta` tiene una bolsa grande y positiva y aun asi es un problema, no
 * un logro. Pintarlas igual que las favorables era el error facil.
 */

const SENALES: Record<SenalBolsa, { texto: string; color: string }> = {
  favorable: { texto: "Favorable", color: "var(--color-exito)" },
  ajustada: { texto: "Ajustada", color: "var(--texto-suave)" },
  excedida: { texto: "Excedida", color: "var(--color-peligro)" },
  sin_meta: { texto: "Sin meta", color: "var(--color-alerta)" },
};

export function TablaBolsa({ lineas }: { lineas: readonly LineaBolsa[] }) {
  if (lineas.length === 0) return null;

  return (
    <section className="space-y-3">
      <h2 className="text-lg font-semibold">Detalle por línea</h2>

      {/* El desbordamiento se queda DENTRO de su caja: en un movil la tabla
          se desplaza sola sin arrastrar la pagina entera. */}
      <div
        className="overflow-x-auto rounded-xl border"
        style={{ borderColor: "var(--borde)" }}
      >
        <table className="w-full min-w-[46rem] text-sm">
          <thead>
            <tr
              className="border-b text-left"
              style={{ borderColor: "var(--borde)" }}
            >
              <th className="px-4 py-3 font-medium">Código</th>
              <th className="px-4 py-3 font-medium">Descripción</th>
              <th className="px-4 py-3 text-right font-medium">Contractual</th>
              <th className="px-4 py-3 text-right font-medium">Meta</th>
              <th className="px-4 py-3 text-right font-medium">Bolsa</th>
              <th className="px-4 py-3 font-medium">Señal</th>
            </tr>
          </thead>
          <tbody>
            {lineas.map((l, i) => {
              const senal = SENALES[l.senal];
              return (
                <tr
                  key={`${l.codigo ?? "propia"}-${i}`}
                  className="border-b last:border-0"
                  style={{ borderColor: "var(--borde)" }}
                >
                  <td className="px-4 py-2.5 tabular-nums opacity-80">
                    {l.codigo ?? "—"}
                  </td>
                  <td className="px-4 py-2.5">
                    {l.descripcion}
                    {l.propia && (
                      <span className="ml-2 text-xs opacity-60">
                        propia de la meta
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums">
                    {soles(l.contractual)}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums">
                    {soles(l.meta)}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums font-medium">
                    {soles(l.bolsa)}
                  </td>
                  <td className="px-4 py-2.5">
                    <span
                      className="text-xs font-medium"
                      style={{ color: senal.color }}
                    >
                      {senal.texto}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
