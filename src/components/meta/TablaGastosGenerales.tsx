import { soles } from "@/utils/formato";
import { sumar } from "@/lib/decimal";
import type { GastoGeneralDeLaMeta } from "@/services/meta.service";

/**
 * El desglose de gastos generales de la meta.
 *
 * Separa FIJOS de VARIABLES porque no son lo mismo y la diferencia se paga en
 * dinero: los fijos son los que ya estan comprados —una carta fianza, una
 * poliza— y los variables se pagan por mes, asi que cada mes de atraso los
 * vuelve a cobrar. Esa es la cifra del pie: lo que cuesta estirarse un mes,
 * que no se recupera trabajando mejor, solo terminando antes.
 *
 * Va debajo de la bolsa y no dentro: la bolsa se mira siempre; esto, cuando
 * alguien quiere saber de donde sale el numero.
 */
export function TablaGastosGenerales({
  gastos,
}: {
  gastos: readonly GastoGeneralDeLaMeta[];
}) {
  if (gastos.length === 0) return null;

  const variables = gastos.filter((g) => g.tipo === "VARIABLE");
  const fijos = gastos.filter((g) => g.tipo === "FIJO");

  const total = (lista: readonly GastoGeneralDeLaMeta[]) =>
    sumar(lista.map((g) => g.montoTotal));

  /// Lo que cuesta CADA MES de atraso: la suma de los mensuales, no de los
  /// totales. Es la unica cifra de la tabla que no es un acumulado.
  const porMes = sumar(
    variables.map((g) => g.montoMensual).filter((m): m is string => m !== null),
  );

  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-sm font-semibold">Gastos generales de la meta</h2>
        <p className="mt-1 max-w-2xl text-sm text-pretty opacity-70">
          Lo que la obra cuesta sin ser una partida. No se le desglosa al
          cliente —el contrato los reconoce englobados— pero se pagan igual, y
          por eso salen de la bolsa.
        </p>
      </div>

      <div
        className="overflow-x-auto rounded-xl border"
        style={{ borderColor: "var(--borde)" }}
      >
        <table className="w-full text-sm">
          <thead>
            <tr
              className="text-left text-xs uppercase opacity-60"
              style={{ borderBottom: "1px solid var(--borde)" }}
            >
              <th className="p-2">Concepto</th>
              <th className="p-2 text-right">Mensual</th>
              <th className="p-2 text-right">Meses</th>
              <th className="p-2 text-right">Importe</th>
            </tr>
          </thead>

          <tbody>
            {variables.length > 0 && (
              <tr style={{ backgroundColor: "var(--superficie)" }}>
                <td className="p-2 text-xs font-semibold uppercase opacity-70" colSpan={3}>
                  Variables · crecen con el plazo
                </td>
                <td className="p-2 text-right font-semibold tabular-nums">
                  {soles(total(variables))}
                </td>
              </tr>
            )}
            {variables.map((g) => (
              <tr
                key={`v-${g.concepto}`}
                style={{ borderTop: "1px solid var(--borde)" }}
              >
                <td className="p-2">{g.concepto}</td>
                <td className="p-2 text-right tabular-nums">
                  {g.montoMensual ? soles(g.montoMensual) : ""}
                </td>
                <td className="p-2 text-right tabular-nums">{g.meses ?? ""}</td>
                <td className="p-2 text-right tabular-nums">{soles(g.montoTotal)}</td>
              </tr>
            ))}

            {fijos.length > 0 && (
              <tr style={{ backgroundColor: "var(--superficie)" }}>
                <td className="p-2 text-xs font-semibold uppercase opacity-70" colSpan={3}>
                  Fijos · no dependen del plazo
                </td>
                <td className="p-2 text-right font-semibold tabular-nums">
                  {soles(total(fijos))}
                </td>
              </tr>
            )}
            {fijos.map((g) => (
              <tr key={`f-${g.concepto}`} style={{ borderTop: "1px solid var(--borde)" }}>
                <td className="p-2">{g.concepto}</td>
                <td className="p-2 text-right opacity-40">—</td>
                <td className="p-2 text-right opacity-40">—</td>
                <td className="p-2 text-right tabular-nums">{soles(g.montoTotal)}</td>
              </tr>
            ))}
          </tbody>

          <tfoot>
            <tr style={{ borderTop: "2px solid var(--borde)" }}>
              <td className="p-2 font-semibold" colSpan={3}>
                Total de gastos generales
              </td>
              <td className="p-2 text-right font-semibold tabular-nums">
                {soles(total(gastos))}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      {variables.length > 0 && (
        <p className="text-sm text-pretty opacity-70">
          Cada mes de atraso cuesta{" "}
          <strong className="tabular-nums">{soles(porMes)}</strong> solo en
          gastos generales. No se recupera trabajando mejor: solo terminando
          antes.
        </p>
      )}
    </section>
  );
}
