import { AlertTriangle, HandCoins } from "lucide-react";
import type { ComprometidoPorPartida } from "@/services/ordenes.service";
import type { PresupuestoVigente } from "@/services/movimientos.service";
import { esNegativo, restar, sumar } from "@/lib/decimal";
import { soles } from "@/utils/formato";

/**
 * El COMPROMETIDO: lo que ya se pacto con proveedores.
 *
 * Puesto solo, un total comprometido no dice nada. Lo que responde a la
 * pregunta real —«¿me estoy pasando?»— es ponerlo al lado del vigente de cada
 * partida y ensenar el saldo. Por eso esta tabla solo aparece entera cuando
 * hay linea base: sin ella no hay vigente contra el que comparar.
 *
 * Ninguna de las dos cifras cuenta dinero que la obra vaya a recuperar, que
 * es lo que las hace comparables. El vigente es presupuesto SIN IGV. El
 * comprometido es el importe IMPUTABLE de cada orden: el neto en las que
 * llevan IGV —credito fiscal, no costo— y el total en las de retencion de
 * renta, donde lo retenido se paga igual, solo que a SUNAT.
 *
 * Decir «todo sin IGV» era comodo y falso: en una orden con retencion no hay
 * IGV que quitar, y la cifra que cuenta es el total.
 */

interface Props {
  comprometido: ComprometidoPorPartida[];
  /// null si la obra no tiene linea base aprobada.
  presupuesto: PresupuestoVigente | null;
  totalOrdenes: number;
}

export function PanelComprometido({
  comprometido,
  presupuesto,
  totalOrdenes,
}: Props) {
  const total = sumar(comprometido.map((c) => c.comprometido));

  if (totalOrdenes === 0) return null;

  const porId = new Map(comprometido.map((c) => [c.wbsItemId, c.comprometido]));

  // Solo las partidas con algo comprometido. El presupuesto entero ya se ve
  // en la obra; aqui la pregunta es donde se ha pedido.
  const filas = (presupuesto?.partidas ?? [])
    .filter((p) => porId.has(p.wbsItemId))
    .map((p) => {
      const suyo = porId.get(p.wbsItemId) ?? "0.00";
      return {
        codigo: p.codigoPartida,
        descripcion: p.descripcion,
        vigente: p.vigente,
        comprometido: suyo,
        // Con el `restar` de decimal, que es el unico de la aplicacion desde
        // que existe: este componente traia su propia copia.
        saldo: restar(p.vigente, suyo) ?? "0.00",
      };
    });

  // Comprometido contra partidas que el presupuesto vigente no conoce: pasa
  // si se imputo a una partida y despues desaparecio. Se avisa en vez de
  // dejar que el total de la tabla no cuadre con el total de arriba.
  const enTabla = sumar(filas.map((f) => f.comprometido));
  const huerfano = restar(total, enTabla) ?? "0.00";
  const excedidas = filas.filter((f) => esNegativo(f.saldo));

  return (
    <section className="space-y-4">
      <div
        className="flex flex-wrap items-baseline justify-between gap-3 rounded-xl border p-4"
        style={{
          borderColor: "var(--borde)",
          backgroundColor: "var(--superficie)",
        }}
      >
        <div>
          <p className="inline-flex items-center gap-2 text-xs opacity-60">
            <HandCoins className="size-4" aria-hidden="true" />
            Comprometido con proveedores
          </p>
          <p className="mt-1 text-2xl font-semibold tabular-nums">
            {soles(total)}
          </p>
          <p className="mt-0.5 text-xs opacity-60">
            Sin IGV. Solo órdenes aprobadas: un borrador todavía no compromete
            a nadie, y una anulada dejó de hacerlo.
          </p>
        </div>
      </div>

      {excedidas.length > 0 && (
        <div
          className="flex items-start gap-3 rounded-xl border p-4"
          style={{
            borderColor: "var(--color-alerta)",
            backgroundColor:
              "color-mix(in oklab, var(--color-alerta) 12%, transparent)",
          }}
        >
          <AlertTriangle className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
          <div>
            <h2 className="text-sm font-semibold">
              {excedidas.length === 1
                ? "Una partida ya está comprometida por encima de su presupuesto"
                : `${excedidas.length} partidas están comprometidas por encima de su presupuesto`}
            </h2>
            <p className="mt-1 max-w-2xl text-sm text-pretty">
              No es un error del sistema: se pidió más de lo presupuestado. Se
              corrige con una reconversión que traiga presupuesto de otra
              partida, o con un adicional si no hay de donde sacarlo.
            </p>
          </div>
        </div>
      )}

      {!presupuesto ? (
        <p
          className="rounded-xl border border-dashed p-6 text-center text-sm text-pretty opacity-70"
          style={{ borderColor: "var(--borde)" }}
        >
          Sin línea base aprobada no hay presupuesto vigente contra el que
          comparar, así que solo se puede enseñar el total. Las órdenes se
          registran igual: pedir a un proveedor no exige tener el presupuesto
          congelado.
        </p>
      ) : (
        <>
          {!esCeroTexto(huerfano) && (
            <p
              className="rounded-lg px-3 py-2 text-sm"
              style={{
                backgroundColor:
                  "color-mix(in oklab, var(--color-alerta) 15%, transparent)",
              }}
            >
              Hay {soles(huerfano)} comprometidos contra partidas que ya no
              están en el presupuesto vigente. Cuentan en el total pero no
              aparecen en la tabla.
            </p>
          )}

          <TablaComprometido filas={filas} />
        </>
      )}
    </section>
  );
}

/** Cero de verdad, no "no es un numero". */
function esCeroTexto(valor: string): boolean {
  return valor === "0.00";
}

interface Fila {
  codigo: string;
  descripcion: string;
  vigente: string;
  comprometido: string;
  saldo: string;
}

/**
 * Vigente, comprometido y saldo por partida.
 *
 * El saldo es la columna que se mira: dice cuanto queda por comprometer antes
 * de pasarse. En negativo significa que ya se pidio de mas.
 */
function TablaComprometido({ filas }: { filas: Fila[] }) {
  if (filas.length === 0) {
    return (
      <p
        className="rounded-xl border border-dashed p-6 text-center text-sm opacity-70"
        style={{ borderColor: "var(--borde)" }}
      >
        Ninguna orden aprobada ha tocado todavía una partida del presupuesto.
      </p>
    );
  }

  return (
    <div
      className="overflow-x-auto rounded-xl border"
      style={{ borderColor: "var(--borde)" }}
    >
      <table className="w-full min-w-[44rem] text-sm">
        <caption className="sr-only">
          Presupuesto vigente, importe comprometido con proveedores y saldo
          disponible de cada partida con órdenes
        </caption>

        <thead>
          <tr
            className="text-left text-xs uppercase"
            style={{
              backgroundColor:
                "color-mix(in oklab, var(--borde) 40%, transparent)",
            }}
          >
            <th scope="col" className="px-3 py-2 font-medium">Código</th>
            <th scope="col" className="px-3 py-2 font-medium">Descripción</th>
            <th scope="col" className="px-3 py-2 text-right font-medium">Vigente</th>
            <th scope="col" className="px-3 py-2 text-right font-medium">Comprometido</th>
            <th scope="col" className="px-3 py-2 text-right font-medium">Saldo</th>
          </tr>
        </thead>
        <tbody>
          {filas.map((f) => {
            const excedida = esNegativo(f.saldo);

            return (
              <tr key={f.codigo} className="border-t" style={{ borderColor: "var(--borde)" }}>
                <th scope="row" className="px-3 py-2 text-left font-medium whitespace-nowrap">
                  {f.codigo}
                </th>
                <td className="px-3 py-2">{f.descripcion}</td>
                <td className="px-3 py-2 text-right tabular-nums whitespace-nowrap opacity-70">
                  {soles(f.vigente)}
                </td>
                <td className="px-3 py-2 text-right font-medium tabular-nums whitespace-nowrap">
                  {soles(f.comprometido)}
                </td>
                <td
                  className="px-3 py-2 text-right font-medium tabular-nums whitespace-nowrap"
                  style={{ color: excedida ? "var(--color-alerta)" : undefined }}
                >
                  {soles(f.saldo)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
