"use client";

import { useMemo, useState } from "react";

import {
  generarContractual,
  type LineaReal,
} from "@/lib/contractual-desde-meta";
import { codigoPadre } from "@/lib/jerarquia-partidas";
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
  costoTotalMeta,
  costoPropioMeta,
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
  /// TODO lo que la obra va a costar. Es contra esto contra lo que hay bolsa.
  costoTotalMeta: string;
  /// Los costos propios de la meta, que el contrato no desglosa.
  costoPropioMeta: string;
}) {
  /// Codigo de capitulo -> porcentaje tecleado. Solo los que se han tocado.
  const [tocados, setTocados] = useState<Record<string, string>>({});

  /// Que capitulos tienen sus partidas a la vista. Cerrado por defecto: quien
  /// solo quiere un margen por capitulo ve la pantalla de siempre.
  const [abiertos, setAbiertos] = useState<Record<string, boolean>>({});

  const capitulos = useMemo(
    () => reales.filter((l) => l.tipo === "CAPITULO" && l.codigo),
    [reales],
  );

  /**
   * Las partidas colgadas de cada capitulo.
   *
   * Se agrupa subiendo por `codigoPadre` -la MISMA funcion que usa
   * `generarContractual` para heredar el recargo- y no por el orden de las
   * filas. Si la pantalla agrupara de una forma y el calculo heredara de
   * otra, la pantalla estaria mintiendo justo donde se decide el margen.
   */
  const partidasDe = useMemo(() => {
    const conCodigo = reales.filter(
      (l): l is LineaReal & { codigo: string } => !!l.codigo,
    );
    const codigos = new Set(conCodigo.map((l) => l.codigo));
    const esCapitulo = new Set(
      conCodigo.filter((l) => l.tipo === "CAPITULO").map((l) => l.codigo),
    );

    const grupos = new Map<string, (LineaReal & { codigo: string })[]>();
    for (const l of conCodigo) {
      if (l.tipo === "CAPITULO") continue;

      // El capitulo ancestro mas cercano. `vistos` corta cualquier ciclo: un
      // codigo mal escrito no puede colgar la pantalla.
      let actual = codigoPadre(l.codigo, codigos);
      const vistos = new Set<string>();
      while (actual !== null && !vistos.has(actual) && !esCapitulo.has(actual)) {
        vistos.add(actual);
        actual = codigoPadre(actual, codigos);
      }
      if (actual === null) continue;

      const suyas = grupos.get(actual) ?? [];
      suyas.push(l);
      grupos.set(actual, suyas);
    }
    return grupos;
  }, [reales]);

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

  /**
   * Lo que hay escrito en la casilla de una linea.
   *
   * Lo tecleado manda sobre lo guardado, incluso si es cadena vacia: borrar
   * un recargo es una decision -«que herede»- y tiene que poder hacerse.
   */
  const valorDe = (l: LineaReal): string =>
    l.codigo !== null && l.codigo in tocados
      ? tocados[l.codigo]!
      : (l.porcentajeRecargo ?? "");

  const teclear = (codigo: string, valor: string) =>
    setTocados((t) => ({ ...t, [codigo]: valor }));

  const original = useMemo(() => generarContractual(reales), [reales]);
  const resultado = useMemo(() => generarContractual(conAjustes), [conAjustes]);

  /**
   * Que porcentaje acaba llevando cada linea, y de donde sale.
   *
   * No se deduce en la pantalla: se lee del resultado que YA calculo
   * `generarContractual`. Es lo que permite enseñar en gris lo que una
   * partida hereda sin arriesgarse a que la pantalla y el calculo discrepen.
   */
  const aplicadoPorCodigo = useMemo(
    () =>
      new Map(
        resultado.lineas.map((l) => [
          l.codigo,
          { pct: l.porcentajeAplicado, origen: l.codigoDelRecargo },
        ]),
      ),
    [resultado],
  );

  const hayCambios = Object.keys(tocados).length > 0;

  /**
   * LA BOLSA DE VERDAD: lo que se cobra menos TODO lo que hay que pagar.
   *
   * `resultado.bolsa` no sirve como titular, y es facil no darse cuenta:
   * `totalReal` suma solo las lineas CON codigo, que son las unicas que se
   * recargan. Queda fuera todo lo que se paga sin ser partida —el residente,
   * la camioneta, un andamio alquilado, las polizas— y con ello fuera la
   * bolsa sale de mas.
   *
   * Visto en una obra real: real 400, contractual 440, bolsa «40»… con 200 de
   * costos propios sin contar. La obra no ganaba 40, perdia 160.
   */
  const bolsaReal = restar(resultado.totalContractual, costoTotalMeta) ?? "0.00";
  const enPerdida = esNegativo(bolsaReal);

  /// La bolsa de ANTES de tocar los recargos, para poder ver el efecto de lo
  /// que se acaba de mover. Solo se enseña si de verdad cambio.
  const bolsaAntes = restar(original.totalContractual, costoTotalMeta) ?? "0.00";
  const cambio = hayCambios && bolsaReal !== bolsaAntes;

  /// Lo que no se recarga porque no tiene codigo -sueldos, alquileres,
  /// polizas-: la parte del costo que solo puede salir del recargo de las
  /// demas. Antes venia en dos trozos y uno de ellos llegaba en cero.
  const hayPropios = !esCero(costoPropioMeta);

  /**
   * El recargo UNIFORME mas bajo que cubre toda la estructura.
   *
   * Los costos propios no se recargan -no tienen capitulo al que colgarse-,
   * asi que el recargo no se elige a ojo: tiene que salir de la cuenta. Con
   * un recargo igual en todos los capitulos, el contractual es
   * `costo x (1 + r)` y la bolsa es `costo x r`, asi que para cubrir la
   * estructura hace falta `r >= propios / recargable`.
   *
   * Se redondea HACIA ARRIBA al centesimo: un recargo redondeado a la baja
   * deja la obra corta por unos soles, que es exactamente lo que se intenta
   * evitar.
   */
  const recargoMinimo = useMemo(() => {
    if (!esPositivo(resultado.totalReal)) return null;
    // Solo las lineas CON codigo se recargan, asi que el recargo tiene que
    // sacar de ellas TODO lo que cuesta la obra: r >= costoTotal/recargable - 1.
    const proporcion = dividir(costoTotalMeta, resultado.totalReal, 6);
    if (proporcion === null) return null;
    const enPorciento = multiplicar(proporcion, "100", 4);
    if (enPorciento === null) return null;
    const n = Number(enPorciento) - 100;
    if (!Number.isFinite(n) || n <= 0) return null;
    return (Math.ceil(n * 100) / 100).toFixed(2);
  }, [costoTotalMeta, resultado.totalReal]);

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
          <p className="text-xs uppercase text-slate-500">
            Costo total (lo que hay que pagar)
          </p>
          <p className="text-lg font-semibold">{soles(costoTotalMeta)}</p>
          {/* El desglose, porque la diferencia con «lo recargable» es justo lo
              que antes desaparecia de la cuenta. */}
          {hayPropios && (
            <p className="mt-1 text-xs text-slate-600">
              {soles(resultado.totalReal)} en partidas ·{" "}
              {soles(costoPropioMeta)} en costos propios (sueldos, alquileres,
              pólizas)
            </p>
          )}
        </div>
        <div className="rounded-lg border p-4">
          <p className="text-xs uppercase text-slate-500">
            Contractual (lo que se cobra)
          </p>
          <p className="text-lg font-semibold">{soles(resultado.totalContractual)}</p>
        </div>
        <div
          className={`rounded-lg border p-4 ${
            enPerdida ? "border-red-300 bg-red-50" : "border-emerald-300 bg-emerald-50"
          }`}
        >
          <p
            className={`text-xs uppercase ${enPerdida ? "text-red-700" : "text-emerald-700"}`}
          >
            {enPerdida ? "Pérdida" : "Bolsa operativa"}
          </p>
          <p
            className={`text-lg font-semibold ${
              enPerdida ? "text-red-800" : "text-emerald-800"
            }`}
          >
            {soles(bolsaReal)}
          </p>
          <p className={`mt-1 text-xs ${enPerdida ? "text-red-900" : "text-emerald-900"}`}>
            {enPerdida
              ? "Se cobra menos de lo que cuesta."
              : "Lo que queda después de pagarlo todo."}
          </p>
          {/* Solo cuando de verdad cambia: repetir la cifra de antes cuando es
              la misma es ruido, y aqui el ruido tapa lo unico que importa. */}
          {cambio && (
            <p className={`mt-1 text-xs ${enPerdida ? "text-red-900" : "text-emerald-900"}`}>
              Antes: {soles(bolsaAntes)}
            </p>
          )}
        </div>
      </section>

      {/*
        El aviso, cuando lo que se cobra no llega a lo que cuesta.
        Va aparte de la tarjeta porque ahi solo cabe la cifra, y lo que hace
        falta aqui es decir POR QUE y que se puede hacer.
      */}
      {enPerdida && (
        <section
          className="rounded-lg border p-4"
          style={{ borderColor: "var(--color-peligro)" }}
        >
          <p className="text-sm text-pretty" style={{ color: "var(--color-peligro)" }}>
            <strong>Con estos recargos la obra pierde dinero.</strong> Se cobra{" "}
            {soles(resultado.totalContractual)} y hay que pagar{" "}
            {soles(costoTotalMeta)}
            {hayPropios && (
              <>
                {" "}
                —de los que {soles(costoPropioMeta)} no se le factura al cliente
                linea a linea: los sueldos, alquileres y polizas salen del
                recargo del resto—
              </>
            )}
            . Sube el recargo, recorta costo, o asúmelo a sabiendas.
          </p>

          {recargoMinimo !== null && (
            <div className="mt-3 flex flex-wrap items-center gap-3 border-t pt-3 text-sm">
              <span>
                Recargo mínimo para cubrirlo todo:{" "}
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
          <h2 className="text-sm font-semibold">Recargo por capítulo y partida</h2>
          <p className="mt-1 max-w-2xl text-sm text-slate-600">
            {puedeAjustar
              ? "Es lo que se le carga al cliente sobre el costo real. Ponlo por capítulo, y abre «Por partida» cuando alguna lleve un margen distinto —una subcontrata ya cerrada no admite el mismo que la mano de obra propia—. Muévelo y mira cómo cambia la bolsa: nada se guarda hasta que confirmes abajo."
              : (motivoNoAjustable ??
                "Los recargos vienen del Excel del presupuesto meta.")}
          </p>
        </div>

        <div className="space-y-2">
          {capitulos.map((c) => {
            const codigo = c.codigo!;
            const suyas = partidasDe.get(codigo) ?? [];
            const abierto = abiertos[codigo] === true;
            /// Cuantas de sus partidas llevan uno propio. Se dice SIN abrir:
            /// si no, un recargo suelto queda escondido detras de un boton y
            /// el margen del capitulo se lee mal.
            const propios = suyas.filter((x) => valorDe(x) !== "").length;

            return (
              <div key={codigo} className="rounded-lg border">
                <div className="flex items-center gap-3 p-3 text-sm">
                  <span className="min-w-0 flex-1 truncate" title={c.descripcion}>
                    <span className="font-medium">{codigo}</span>{" "}
                    <span className="text-slate-600">{c.descripcion}</span>
                  </span>

                  {suyas.length > 0 && (
                    <button
                      type="button"
                      onClick={() =>
                        setAbiertos((a) => ({ ...a, [codigo]: !abierto }))
                      }
                      className="shrink-0 rounded border px-2 py-1 text-xs text-slate-600"
                      aria-expanded={abierto}
                    >
                      {abierto ? "Ocultar" : "Por partida"} ({suyas.length})
                      {propios > 0 && (
                        <span className="ml-1 font-semibold text-amber-700">
                          {" · "}
                          {propios} propio{propios === 1 ? "" : "s"}
                        </span>
                      )}
                    </button>
                  )}

                  <span className="flex shrink-0 items-center gap-1">
                    <input
                      type="text"
                      inputMode="decimal"
                      value={valorDe(c)}
                      disabled={!puedeAjustar}
                      onChange={(e) => teclear(codigo, e.target.value)}
                      className="w-20 rounded border px-2 py-1 text-right tabular-nums disabled:bg-slate-100 disabled:text-slate-500"
                      aria-label={`Recargo del capítulo ${codigo}`}
                    />
                    <span className="text-slate-500">%</span>
                  </span>
                </div>

                {abierto && (
                  <div className="space-y-1 border-t bg-slate-50 p-3">
                    {suyas.map((x) => {
                      const heredado = aplicadoPorCodigo.get(x.codigo);
                      return (
                        <label
                          key={x.codigo}
                          className="flex items-center gap-3 text-sm"
                        >
                          <span
                            className="min-w-0 flex-1 truncate"
                            title={x.descripcion}
                          >
                            <span className="font-medium">{x.codigo}</span>{" "}
                            <span className="text-slate-600">{x.descripcion}</span>
                          </span>
                          <span className="flex shrink-0 items-center gap-1">
                            <input
                              type="text"
                              inputMode="decimal"
                              value={valorDe(x)}
                              disabled={!puedeAjustar}
                              /* Vacio NO es cero: es «que herede». El
                                 marcador de posicion enseña en gris lo que se
                                 le aplicaria sin tocar nada. */
                              placeholder={
                                heredado?.origen != null &&
                                heredado.origen !== x.codigo &&
                                heredado.pct != null
                                  ? String(Number(heredado.pct))
                                  : "—"
                              }
                              onChange={(e) => teclear(x.codigo, e.target.value)}
                              className="w-20 rounded border bg-white px-2 py-1 text-right tabular-nums placeholder:text-slate-400 disabled:bg-slate-100 disabled:text-slate-500"
                              aria-label={`Recargo de la partida ${x.codigo}`}
                            />
                            <span className="text-slate-500">%</span>
                          </span>
                        </label>
                      );
                    })}
                    <p className="pt-1 text-xs text-slate-500">
                      En gris, lo que hereda del capítulo. Escribe solo las
                      que lleven un margen distinto. Un <strong>0</strong>{" "}
                      significa «esta entra a precio de costo», que no es lo
                      mismo que dejarla vacía.
                    </p>
                  </div>
                )}
              </div>
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
