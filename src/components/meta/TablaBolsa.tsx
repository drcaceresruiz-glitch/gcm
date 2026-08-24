import { soles } from "@/utils/formato";
import type { LineaBolsa, SenalBolsa } from "@/lib/bolsa";

/**
 * La bolsa linea a linea.
 *
 * La columna que decide la lectura es la SENAL, no el importe: una linea
 * `sin_meta` tiene una bolsa grande y positiva y aun asi es un problema, no
 * un logro. Pintarlas igual que las favorables era el error facil.
 *
 * La columna META es lo VIGENTE: lo presupuestado menos lo que gerencia ya
 * firmo que no se gastara. Cuando hay deduccion se enseñan las dos cifras, no
 * solo el resultado; la meta sigue congelada y esa resta es una decision con
 * firma, no una correccion del plan.
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
                    {/* Lo presupuestado se conserva al lado del vigente, igual
                        que el monto firmado al lado del vigente en un
                        contrato: si desapareciera, nadie podria saber despues
                        si el alquiler siempre valio eso o si se recorto a
                        mitad de obra para cuadrar la bolsa. Solo cuando
                        difieren: repetir la misma cifra dos veces es ruido. */}
                    {Number(l.deducido) > 0 && (
                      <span
                        className="block text-xs"
                        style={{ color: "var(--color-exito)" }}
                      >
                        {soles(l.metaPresupuestada)} − {soles(l.deducido)}
                      </span>
                    )}
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
