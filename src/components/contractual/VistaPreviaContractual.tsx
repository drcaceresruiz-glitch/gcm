"use client";

import { useMemo, useState } from "react";

import {
  generarContractual,
  type LineaReal,
} from "@/lib/contractual-desde-meta";
import { dividir, esCero, esNegativo, esPositivo, multiplicar, restar } from "@/lib/decimal";
import { soles } from "@/utils/formato";
import { ConfirmarContractual, type Riesgo } from "./ConfirmarContractual";

/**
 * La vista previa del contractual, con los recargos editables y la bolsa
 * recalculandose en vivo.
 *
 * Este es el momento en que se decide el margen de la obra: cuanto se le carga
 * al cliente sobre lo que de verdad cuesta construir. Hasta ahora ese numero
 * llegaba desde una columna del Excel y aqui solo se podia mirar; para
 * cambiarlo habia que rehacer la plantilla y volver a subirla, sin ver el
 * efecto hasta el final.
 *
 * **El calculo es LA MISMA funcion que corre en el servidor** —
 * `generarContractual`, pura y sin base de datos—. No hay una formula «de
 * pantalla» y otra «de verdad»: si las hubiera, el numero que se ve antes de
 * confirmar y el que queda guardado podrian no coincidir, y ese numero es el
 * margen.
 *
 * Lo que se envia al confirmar son los PORCENTAJES, no los importes. El dinero
 * lo vuelve a calcular el servidor desde la base, igual que antes.
 */
export function VistaPreviaContractual({
  obraId,
  reales,
  riesgo,
  puedeGenerar,
  puedeAjustar,
  motivoNoAjustable,
  gastosGeneralesPrevistos,
}: {
  obraId: string;
  reales: LineaReal[];
  riesgo: Riesgo;
  puedeGenerar: boolean;
  /// Solo sobre una meta en borrador y con permiso para cambiarla.
  puedeAjustar: boolean;
  /// Por que no se puede tocar, cuando no se puede. Se dice en vez de dejar
  /// unos campos apagados sin explicacion.
  motivoNoAjustable: string | null;
  /// Lo que la meta preve gastar en estructura. "0.00" si no lo trae.
  gastosGeneralesPrevistos: string;
}) {
  /// Codigo de capitulo -> porcentaje tecleado. Solo los que se han tocado.
  const [tocados, setTocados] = useState<Record<string, string>>({});

  const capitulos = useMemo(
    () => reales.filter((l) => l.tipo === "CAPITULO" && l.codigo),
    [reales],
  );

  /**
   * Las lineas con los recargos de ahora mismo.
   *
   * Un campo vacio NO es un cero: es «este capitulo no lleva recargo propio y
   * hereda el de su padre», que es justo lo que significa un null en el
   * calculo. Convertirlo en cero cambiaria el resultado en silencio.
   */
  const conAjustes = useMemo<LineaReal[]>(
    () =>
      reales.map((l) => {
        if (l.codigo === null || !(l.codigo in tocados)) return l;
        const crudo = tocados[l.codigo]!.trim();
        return { ...l, porcentajeRecargo: crudo === "" ? null : crudo };
      }),
    [reales, tocados],
  );

  const original = useMemo(() => generarContractual(reales), [reales]);
  const resultado = useMemo(() => generarContractual(conAjustes), [conAjustes]);

  const hayCambios = Object.keys(tocados).length > 0;
  const cambio = hayCambios && resultado.bolsa !== original.bolsa;

  /**
   * Lo que queda DESPUES de pagar la estructura.
   *
   * La bolsa mide lo que dejan las partidas; el residente, el maestro y las
   * polizas se pagan igual. Si el recargo no llega para cubrirlos, la obra
   * pierde dinero aunque todas las partidas cuadren, y ese es justo el
   * momento -este, antes de confirmar- en el que se puede corregir.
   */
  const hayGastos = !esCero(gastosGeneralesPrevistos);
  const queda = restar(resultado.bolsa, gastosGeneralesPrevistos) ?? resultado.bolsa;
  const noCubre = hayGastos && esNegativo(queda);

  /**
   * El recargo UNIFORME mas bajo que cubre toda la estructura.
   *
   * Si la obra no puede gastar de los gastos generales -porque son de la
   * empresa y no suyos-, el recargo no se elige a ojo: tiene que salir de la
   * cuenta. Con un recargo igual en todos los capitulos, el contractual es
   * `costo x (1 + r)` y la bolsa es `costo x r`, asi que para cubrir la
   * estructura hace falta `r >= gastos / costo`.
   *
   * Se redondea HACIA ARRIBA al centesimo: un recargo redondeado a la baja
   * deja la obra corta por unos soles, que es exactamente lo que se intenta
   * evitar.
   */
  const recargoMinimo = useMemo(() => {
    if (!hayGastos || !esPositivo(resultado.totalReal)) return null;
    const proporcion = dividir(gastosGeneralesPrevistos, resultado.totalReal, 6);
    if (proporcion === null) return null;
    const enPorciento = multiplicar(proporcion, "100", 4);
    if (enPorciento === null) return null;
    const n = Number(enPorciento);
    if (!Number.isFinite(n)) return null;
    return (Math.ceil(n * 100) / 100).toFixed(2);
  }, [hayGastos, gastosGeneralesPrevistos, resultado.totalReal]);

  /// Igualar todos los capitulos al minimo. Es un punto de partida, no una
  /// orden: despues se puede subir el de un capitulo y bajar el de otro.
  const igualarAlMinimo = () => {
    if (recargoMinimo === null) return;
    setTocados(
      Object.fromEntries(capitulos.map((c) => [c.codigo!, recargoMinimo])),
    );
  };

  const partidas = resultado.lineas.filter((l) => l.tipo === "PARTIDA");

  return (
    <div className="space-y-6">
      <section className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-lg border p-4">
          <p className="text-xs uppercase text-slate-500">Real (lo que cuesta)</p>
          <p className="text-lg font-semibold">{soles(resultado.totalReal)}</p>
        </div>
        <div className="rounded-lg border p-4">
          <p className="text-xs uppercase text-slate-500">
            Contractual (lo que se cobra)
          </p>
          <p className="text-lg font-semibold">{soles(resultado.totalContractual)}</p>
        </div>
        <div className="rounded-lg border border-emerald-300 bg-emerald-50 p-4">
          <p className="text-xs uppercase text-emerald-700">Bolsa operativa</p>
          <p className="text-lg font-semibold text-emerald-800">
            {soles(resultado.bolsa)}
          </p>
          {/* Solo cuando de verdad cambia: repetir la cifra de antes cuando es
              la misma es ruido, y aqui el ruido tapa lo unico que importa. */}
          {cambio && (
            <p className="mt-1 text-xs text-emerald-900">
              Antes: {soles(original.bolsa)}
            </p>
          )}
        </div>
      </section>

      {hayGastos && (
        <section
          className="rounded-lg border p-4"
          style={{
            borderColor: noCubre ? "var(--color-peligro)" : "var(--borde)",
          }}
        >
          <div className="flex flex-wrap items-baseline justify-between gap-3 text-sm">
            <span className="text-slate-600">
              Gastos generales previstos en la meta
            </span>
            <span className="tabular-nums">− {soles(gastosGeneralesPrevistos)}</span>
          </div>
          <div className="mt-2 flex flex-wrap items-baseline justify-between gap-3 border-t pt-2 font-semibold">
            <span>Queda después de la estructura</span>
            <span
              className="tabular-nums"
              style={noCubre ? { color: "var(--color-peligro)" } : undefined}
            >
              {soles(queda)}
            </span>
          </div>

          {noCubre ? (
            <p
              className="mt-2 text-sm text-pretty"
              style={{ color: "var(--color-peligro)" }}
            >
              <strong>El recargo no cubre la estructura.</strong> Con estos
              porcentajes la obra pierde {soles(queda).replace("-", "")} aunque
              todas las partidas cuadren: el residente, el maestro y las
              pólizas se pagan igual. Sube el recargo, recorta gastos
              generales, o asúmelo a sabiendas.
            </p>
          ) : (
            <p className="mt-2 text-sm text-slate-600">
              El recargo cubre los gastos generales y deja esto para la obra.
            </p>
          )}

          {/* La cuenta, no el ojo. Si la obra no puede gastar de los gastos
              generales, el recargo minimo es un dato, no una intuicion. */}
          {recargoMinimo !== null && (
            <div className="mt-3 flex flex-wrap items-center gap-3 border-t pt-3 text-sm">
              <span>
                Recargo mínimo para cubrir toda la estructura:{" "}
                <strong className="tabular-nums">{recargoMinimo} %</strong>
              </span>
              {puedeAjustar && (
                <button
                  type="button"
                  onClick={igualarAlMinimo}
                  className="rounded-lg border px-3 py-1 text-sm font-medium"
                  style={{ borderColor: "var(--borde)" }}
                >
                  Igualar todos los capítulos a {recargoMinimo} %
                </button>
              )}
            </div>
          )}
        </section>
      )}

      <section className="space-y-3">
        <div>
          <h2 className="text-sm font-semibold">Recargo por capítulo</h2>
          <p className="mt-1 max-w-2xl text-sm text-slate-600">
            {puedeAjustar
              ? "Es lo que se le carga al cliente sobre el costo real de cada capítulo. Muévelo y mira cómo cambia la bolsa: nada se guarda hasta que confirmes abajo."
              : (motivoNoAjustable ??
                "Los recargos vienen del Excel del presupuesto meta.")}
          </p>
        </div>

        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {capitulos.map((c) => {
            const valor = c.codigo! in tocados
              ? tocados[c.codigo!]!
              : (c.porcentajeRecargo ?? "");
            return (
              <label
                key={c.codigo}
                className="flex items-center gap-3 rounded-lg border p-3 text-sm"
              >
                <span className="min-w-0 flex-1 truncate" title={c.descripcion}>
                  <span className="font-medium">{c.codigo}</span>{" "}
                  <span className="text-slate-600">{c.descripcion}</span>
                </span>
                <span className="flex shrink-0 items-center gap-1">
                  <input
                    type="text"
                    inputMode="decimal"
                    value={valor}
                    disabled={!puedeAjustar}
                    onChange={(e) =>
                      setTocados((t) => ({ ...t, [c.codigo!]: e.target.value }))
                    }
                    className="w-20 rounded border px-2 py-1 text-right tabular-nums disabled:bg-slate-100 disabled:text-slate-500"
                    aria-label={`Recargo del capítulo ${c.codigo}`}
                  />
                  <span className="text-slate-500">%</span>
                </span>
              </label>
            );
          })}
        </div>
      </section>

      {resultado.avisos.length > 0 && (
        <section className="space-y-3">
          {resultado.avisos.map((a) => (
            <div
              key={a.motivo}
              className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm"
            >
              <p className="font-semibold text-amber-900">
                {a.codigos.length} linea(s) &middot; {soles(a.importe)}
              </p>
              <p className="text-amber-900">{a.mensaje}</p>
              <p className="mt-1 text-xs text-slate-600">{a.codigos.join(", ")}</p>
            </div>
          ))}
        </section>
      )}

      <ConfirmarContractual
        obraId={obraId}
        partidas={partidas.length}
        riesgo={riesgo}
        puedeGenerar={puedeGenerar}
        // Solo lo tocado. Mandar los que no se han cambiado seria reescribir
        // en la meta valores que nadie pidio tocar.
        recargos={hayCambios ? tocados : null}
      />

      <section>
        <h2 className="mb-2 text-sm font-semibold uppercase text-slate-500">
          Detalle
        </h2>
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
              <tr>
                <th className="p-2">Item</th>
                <th className="p-2">Descripcion</th>
                <th className="p-2 text-right">Metrado</th>
                <th className="p-2 text-right">P. contractual</th>
                <th className="p-2 text-right">Recargo</th>
                <th className="p-2 text-right">Parcial</th>
              </tr>
            </thead>
            <tbody>
              {resultado.lineas.map((l) => (
                <tr
                  key={l.codigo}
                  className={l.tipo === "CAPITULO" ? "bg-slate-50 font-semibold" : ""}
                >
                  <td className="p-2">{l.codigo}</td>
                  <td className="p-2">{l.descripcion}</td>
                  <td className="p-2 text-right">{l.metrado ?? ""}</td>
                  <td className="p-2 text-right">{l.precioUnitario ?? ""}</td>
                  <td className="p-2 text-right">
                    {l.porcentajeAplicado ? `${l.porcentajeAplicado}%` : ""}
                  </td>
                  <td className="p-2 text-right">
                    {l.parcial ? soles(l.parcial) : ""}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
