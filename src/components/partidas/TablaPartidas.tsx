import type { PartidaFila } from "@/services/obras.service";
import { soles, decimal, metrado as fmtMetrado } from "@/utils/formato";

/**
 * Arbol de partidas en forma de tabla.
 *
 * Los capitulos muestran el subtotal de todo lo que cuelga de ellos, no un
 * valor propio: un capitulo no tiene precio, tiene contenido.
 */
export function TablaPartidas({ filas }: { filas: PartidaFila[] }) {
  return (
    // El desbordamiento se contiene aqui dentro: en movil la tabla se
    // desplaza en horizontal sin arrastrar el ancho de toda la pagina.
    <div
      className="overflow-x-auto rounded-xl border"
      style={{ borderColor: "var(--borde)" }}
    >
      <table className="w-full min-w-[48rem] text-sm">
        <caption className="sr-only">
          Presupuesto por partidas, agrupado en capitulos
        </caption>
        <thead>
          <tr
            className="text-left text-xs uppercase"
            style={{
              backgroundColor: "color-mix(in oklab, var(--borde) 40%, transparent)",
            }}
          >
            <th scope="col" className="px-3 py-2.5 font-medium">Codigo</th>
            <th scope="col" className="px-3 py-2.5 font-medium">Descripcion</th>
            <th scope="col" className="px-3 py-2.5 font-medium">Und.</th>
            <th scope="col" className="px-3 py-2.5 text-right font-medium">Metrado</th>
            <th scope="col" className="px-3 py-2.5 text-right font-medium">P. Unitario</th>
            <th scope="col" className="px-3 py-2.5 text-right font-medium">Parcial</th>
          </tr>
        </thead>
        <tbody>
          {filas.map((f) => {
            const esCapitulo = f.tipo === "CAPITULO";
            return (
              <tr
                key={f.id}
                className="border-t"
                style={{
                  borderColor: "var(--borde)",
                  backgroundColor: esCapitulo
                    ? "color-mix(in oklab, var(--color-marca-500) 7%, transparent)"
                    : undefined,
                }}
              >
                <td className="px-3 py-2 font-mono text-xs whitespace-nowrap">
                  {f.codigoPartida}
                </td>
                <td
                  className={`px-3 py-2 ${esCapitulo ? "font-semibold" : ""}`}
                  style={{ paddingLeft: `${0.75 + f.nivel * 0.9}rem` }}
                >
                  {f.descripcion}
                </td>
                <td className="px-3 py-2 whitespace-nowrap opacity-70">
                  {f.unidad ?? ""}
                </td>
                <td className="px-3 py-2 text-right tabular-nums whitespace-nowrap">
                  {f.metrado ? fmtMetrado(f.metrado, "") : ""}
                </td>
                <td className="px-3 py-2 text-right tabular-nums whitespace-nowrap">
                  {f.precioUnitario ? decimal(f.precioUnitario, "") : ""}
                </td>
                <td
                  className={`px-3 py-2 text-right tabular-nums whitespace-nowrap ${esCapitulo ? "font-semibold" : ""}`}
                >
                  {f.parcial ? soles(f.parcial, "") : ""}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
