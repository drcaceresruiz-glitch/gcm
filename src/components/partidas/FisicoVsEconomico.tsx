import { soles } from "@/utils/formato";
import { PUNTOS_DE_AVISO } from "@/lib/fisico-vs-economico";
import type { CruceDeObra } from "@/services/fisico-economico.service";

/**
 * Cuanto se ha avanzado contra cuanto se ha gastado, capitulo a capitulo.
 *
 * La lectura util no es cada porcentaje por separado sino la DISTANCIA entre
 * los dos: un capitulo al 30% de obra con el 70% del dinero comprometido esta
 * quemando presupuesto antes de producir, y eso no se ve en ningun total.
 */
export function FisicoVsEconomico({ cruce }: { cruce: CruceDeObra }) {
  const conDato = cruce.capitulos.filter((c) => c.fisico !== null);
  if (conDato.length === 0) return null;

  const avisan = conDato.filter((c) => c.avisa);

  return (
    <section id="avance-contra-gasto" className="space-y-3">
      <div>
        <h2 className="text-lg font-semibold">Avance contra gasto</h2>
        <p className="mt-0.5 max-w-3xl text-sm text-pretty opacity-70">
          Cuánto se ha ejecutado de cada capítulo y cuánto de su dinero está ya
          comprometido con proveedores: encargos vigentes al precio del
          contratista, más las órdenes sueltas aprobadas. Lo que importa es la
          diferencia:
          gastar más deprisa de lo que se avanza se ve aquí antes que en el saldo.
        </p>
      </div>

      {avisan.length > 0 && (
        <p
          className="rounded-lg border p-3 text-sm"
          style={{
            borderColor: "var(--color-alerta)",
            backgroundColor:
              "color-mix(in srgb, var(--color-alerta) 8%, transparent)",
          }}
        >
          {avisan.length === 1
            ? `En ${avisan[0]!.nombre} el gasto va por delante del avance.`
            : `En ${avisan.length} capítulos el gasto va por delante del avance.`}{" "}
          Puede ser normal si hay acopios o adelantos a proveedor; si no los hay,
          es sobrecosto que todavía no ha aflorado.
        </p>
      )}

      <div
        className="overflow-x-auto rounded-lg border"
        style={{ borderColor: "var(--borde)" }}
      >
        <table className="w-full text-sm">
          <thead style={{ backgroundColor: "var(--superficie)" }}>
            <tr className="text-left text-xs opacity-70">
              <th className="px-3 py-2 font-medium">Capítulo</th>
              <th className="px-3 py-2 text-right font-medium">Presupuesto</th>
              <th
                className="px-3 py-2 text-right font-medium"
                title="Encargos vigentes al precio del contratista, más las órdenes sueltas aprobadas. Distinto del «Costo real (AC)» del EVM, que solo cuenta órdenes ya aprobadas."
              >
                Comprometido
              </th>
              <th className="px-3 py-2 text-right font-medium">Avance</th>
              <th className="px-3 py-2 text-right font-medium">Gasto</th>
              <th className="px-3 py-2 text-right font-medium">Distancia</th>
            </tr>
          </thead>
          <tbody>
            {cruce.capitulos.map((c) => {
              const brecha =
                c.fisico !== null && c.economico !== null
                  ? c.economico - c.fisico
                  : null;
              return (
                <tr
                  key={c.codigo}
                  className="border-t"
                  style={{ borderColor: "var(--borde)" }}
                >
                  <td className="px-3 py-1.5">
                    <span className="opacity-60">{c.codigo} </span>
                    {c.nombre}
                    {/* Se dice SIEMPRE que hay parte sin medir: un porcentaje
                        que no declara sobre cuanto se calculo se lee como si
                        cubriera el capitulo entero. */}
                    {Number(c.sinMedir) > 0 && (
                      <span className="ml-2 text-[11px] opacity-60">
                        ({soles(c.sinMedir)} sin tarea enlazada, fuera del cálculo)
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-1.5 text-right tabular-nums opacity-80">
                    {soles(c.presupuesto)}
                  </td>
                  <td className="px-3 py-1.5 text-right tabular-nums opacity-80">
                    {soles(c.gastado)}
                  </td>
                  <td className="px-3 py-1.5 text-right tabular-nums">
                    {c.fisico === null ? (
                      <span className="opacity-40">—</span>
                    ) : (
                      `${c.fisico.toFixed(1)}%`
                    )}
                  </td>
                  <td className="px-3 py-1.5 text-right tabular-nums">
                    {c.economico === null ? (
                      <span className="opacity-40">—</span>
                    ) : (
                      `${c.economico.toFixed(1)}%`
                    )}
                  </td>
                  <td
                    className="px-3 py-1.5 text-right font-medium tabular-nums"
                    style={
                      brecha === null
                        ? { opacity: 0.4 }
                        : brecha > PUNTOS_DE_AVISO
                          ? { color: "var(--color-peligro)" }
                          : brecha < -PUNTOS_DE_AVISO
                            ? { color: "var(--color-exito)" }
                            : { opacity: 0.5 }
                    }
                  >
                    {brecha === null
                      ? "—"
                      : `${brecha > 0 ? "+" : ""}${brecha.toFixed(1)}`}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="text-xs opacity-60">
        {/* La cobertura no es un detalle tecnico: decide cuanto vale la tabla
            de arriba. Con el 30% enlazado, estos porcentajes describen un
            tercio de la obra. */}
        Calculado sobre el {cruce.coberturaPct.toFixed(0)}% del presupuesto, que es
        lo que tiene tarea de cronograma enlazada
        {cruce.partidasSinTarea > 0 &&
          ` (${cruce.partidasSinTarea} partida(s) sin enlazar)`}
        . Una partida sin enlazar no cuenta como 0% de avance: queda fuera.
        {cruce.sinPermisoDeCosto &&
          " No tienes permiso para ver órdenes, así que la columna de gasto está vacía."}
      </p>
    </section>
  );
}
