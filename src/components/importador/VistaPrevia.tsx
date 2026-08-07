import { AlertTriangle, XCircle } from "lucide-react";
import type { ResultadoAnalisis } from "@/lib/excel-presupuesto";
import { soles, decimal, metrado as fmtMetrado } from "@/utils/formato";

/** Se muestran las primeras filas; el resto se importa igual. */
const MAXIMO_VISIBLE = 80;

export function VistaPrevia({ analisis }: { analisis: ResultadoAnalisis }) {
  const conAviso = analisis.filas.filter((f) => f.aviso);
  const visibles = analisis.filas.slice(0, MAXIMO_VISIBLE);
  const ocultas = analisis.filas.length - visibles.length;

  return (
    <div className="space-y-5">
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Resumen etiqueta="Capitulos" valor={String(analisis.totalCapitulos)} />
        <Resumen etiqueta="Partidas" valor={String(analisis.totalPartidas)} />
        <Resumen etiqueta="Presupuesto" valor={soles(analisis.montoTotal)} destacado />
        <Resumen
          etiqueta="Incidencias"
          valor={String(analisis.errores.length)}
          peligro={analisis.errores.length > 0}
        />
      </dl>

      {analisis.gruposRepetidos.length > 0 && (
        <section
          className="rounded-lg border p-4"
          style={{
            borderColor: "var(--color-alerta)",
            backgroundColor: "color-mix(in oklab, var(--color-alerta) 12%, transparent)",
          }}
        >
          <h3 className="flex items-center gap-2 text-sm font-semibold">
            <AlertTriangle className="size-4" aria-hidden="true" />
            Hay {analisis.gruposRepetidos.length} grupo(s) de partidas con el
            mismo importe repetido
          </h3>

          <p className="mt-2 text-sm">
            Varias partidas seguidas muestran exactamente el mismo importe y el
            mismo precio unitario. Suele ocurrir cuando en Excel se arrastra la
            formula del subtotal sin ajustar la fila a la que apunta: todas
            acaban mostrando el importe de la primera.
          </p>

          <dl className="mt-3 grid gap-3 sm:grid-cols-2">
            <div
              className="rounded-lg border p-3"
              style={{ borderColor: "var(--borde)", backgroundColor: "var(--superficie)" }}
            >
              <dt className="text-xs opacity-60">Sumando todas las filas</dt>
              <dd className="mt-0.5 text-lg font-semibold tabular-nums">
                {soles(analisis.montoTotal)}
              </dd>
            </div>
            <div
              className="rounded-lg border p-3"
              style={{ borderColor: "var(--borde)", backgroundColor: "var(--superficie)" }}
            >
              <dt className="text-xs opacity-60">
                Contando una vez cada grupo repetido
              </dt>
              <dd className="mt-0.5 text-lg font-semibold tabular-nums">
                {soles(analisis.montoSinRepetidos)}
              </dd>
            </div>
          </dl>

          <p className="mt-3 text-sm">
            <strong>Compara ambas cifras con el total de tu Excel</strong> para
            saber cual corresponde. Se importaran los importes tal como estan en
            el archivo; las filas afectadas quedan marcadas para que puedas
            revisarlas y corregirlas despues.
          </p>

          <ul className="mt-3 max-h-40 space-y-1 overflow-y-auto text-sm">
            {analisis.gruposRepetidos.slice(0, 12).map((g, i) => (
              <li key={i} className="flex flex-wrap gap-x-2">
                <span className="font-mono text-xs opacity-60">
                  Filas {g.filas[0]}&ndash;{g.filas.at(-1)}
                </span>
                <span>
                  {g.filas.length} partidas con {soles(g.importe)} cada una
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {analisis.filasTextoOmitidas > 0 && (
        <p className="text-xs opacity-60">
          Se omitieron {analisis.filasTextoOmitidas} fila(s) de texto sin codigo
          (notas, subtitulos o clausulas del contrato).
        </p>
      )}

      {analisis.errores.length > 0 && (
        <section
          className="rounded-lg border p-4"
          style={{
            borderColor: "var(--color-peligro)",
            backgroundColor: "color-mix(in oklab, var(--color-peligro) 8%, transparent)",
          }}
        >
          <h3 className="flex items-center gap-2 text-sm font-semibold">
            <XCircle className="size-4" aria-hidden="true" />
            {analisis.errores.length} fila(s) no se importaran
          </h3>
          <p className="mt-1 text-xs opacity-70">
            Corrige estas filas en tu Excel y vuelve a subirlo. El resto si se
            importara.
          </p>
          <ul className="mt-3 max-h-52 space-y-1.5 overflow-y-auto text-sm">
            {analisis.errores.map((e, i) => (
              <li key={i} className="flex gap-2">
                <span className="shrink-0 font-mono text-xs opacity-60">
                  Fila {e.fila}
                </span>
                <span>{e.mensaje}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {conAviso.length > 0 && (
        <section
          className="rounded-lg border p-4"
          style={{
            borderColor: "var(--color-alerta)",
            backgroundColor: "color-mix(in oklab, var(--color-alerta) 10%, transparent)",
          }}
        >
          <h3 className="flex items-center gap-2 text-sm font-semibold">
            <AlertTriangle className="size-4" aria-hidden="true" />
            {conAviso.length} aviso(s)
          </h3>
          <p className="mt-1 text-xs opacity-70">
            Estas filas si se importan, pero conviene revisarlas.
          </p>
          <ul className="mt-3 max-h-40 space-y-1.5 overflow-y-auto text-sm">
            {conAviso.slice(0, 30).map((f) => (
              <li key={f.codigo} className="flex gap-2">
                <span className="shrink-0 font-mono text-xs opacity-60">
                  Fila {f.fila}
                </span>
                <span>{f.aviso}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <TablaPrevia filas={visibles} ocultas={ocultas} />
    </div>
  );
}

function Resumen({
  etiqueta,
  valor,
  destacado,
  peligro,
}: {
  etiqueta: string;
  valor: string;
  destacado?: boolean;
  peligro?: boolean;
}) {
  return (
    <div
      className="rounded-lg border p-3"
      style={{ borderColor: "var(--borde)", backgroundColor: "var(--superficie)" }}
    >
      <dt className="text-xs opacity-60">{etiqueta}</dt>
      <dd
        className={`mt-0.5 tabular-nums ${destacado ? "text-lg font-semibold" : "text-base font-medium"}`}
        style={peligro ? { color: "var(--color-peligro)" } : undefined}
      >
        {valor}
      </dd>
    </div>
  );
}

function TablaPrevia({
  filas,
  ocultas,
}: {
  filas: ResultadoAnalisis["filas"];
  ocultas: number;
}) {
  return (
    <div>
      <h3 className="mb-2 text-sm font-semibold">Partidas detectadas</h3>

      {/* El desbordamiento se contiene aqui: en movil la tabla se desplaza
          en horizontal sin romper el ancho de la pagina. */}
      <div
        className="overflow-x-auto rounded-lg border"
        style={{ borderColor: "var(--borde)" }}
      >
        <table className="w-full min-w-[46rem] text-sm">
          <caption className="sr-only">
            Vista previa de las partidas que se importaran
          </caption>
          <thead>
            <tr
              className="text-left text-xs uppercase"
              style={{ backgroundColor: "color-mix(in oklab, var(--borde) 40%, transparent)" }}
            >
              <th scope="col" className="px-3 py-2 font-medium">Codigo</th>
              <th scope="col" className="px-3 py-2 font-medium">Descripcion</th>
              <th scope="col" className="px-3 py-2 font-medium">Und.</th>
              <th scope="col" className="px-3 py-2 text-right font-medium">Metrado</th>
              <th scope="col" className="px-3 py-2 text-right font-medium">P. Unitario</th>
              <th scope="col" className="px-3 py-2 text-right font-medium">Parcial</th>
            </tr>
          </thead>
          <tbody>
            {filas.map((f) => {
              const esCapitulo = f.tipo === "CAPITULO";
              return (
                <tr
                  key={`${f.fila}-${f.codigo}`}
                  className="border-t"
                  style={{
                    borderColor: "var(--borde)",
                    backgroundColor: esCapitulo
                      ? "color-mix(in oklab, var(--color-marca-500) 7%, transparent)"
                      : undefined,
                  }}
                >
                  <td className="px-3 py-1.5 font-mono text-xs whitespace-nowrap">
                    {f.codigo}
                  </td>
                  <td
                    className={`px-3 py-1.5 ${esCapitulo ? "font-semibold" : ""}`}
                    style={{ paddingLeft: `${0.75 + f.nivel * 0.85}rem` }}
                  >
                    {f.descripcion}
                  </td>
                  <td className="px-3 py-1.5 whitespace-nowrap opacity-70">
                    {f.unidad ?? ""}
                  </td>
                  <td className="px-3 py-1.5 text-right tabular-nums whitespace-nowrap">
                    {f.metrado ? fmtMetrado(f.metrado, "") : ""}
                  </td>
                  <td className="px-3 py-1.5 text-right tabular-nums whitespace-nowrap">
                    {f.precioUnitario ? decimal(f.precioUnitario, "") : ""}
                  </td>
                  <td className="px-3 py-1.5 text-right font-medium tabular-nums whitespace-nowrap">
                    {f.parcial ? soles(f.parcial, "") : ""}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {ocultas > 0 && (
        <p className="mt-2 text-xs opacity-60">
          Se muestran las primeras {MAXIMO_VISIBLE} filas. Las {ocultas}{" "}
          restantes tambien se importaran.
        </p>
      )}
    </div>
  );
}
