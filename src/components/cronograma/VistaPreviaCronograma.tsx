import { AlertTriangle, XCircle } from "lucide-react";
import type { ResultadoAnalisisCronograma } from "@/lib/msproject-xml";
import { fechaCronograma, fechaLarga } from "@/utils/fechas";
import { decimal } from "@/utils/formato";

/** Se muestran las primeras filas; el resto se importa igual. */
const MAXIMO_VISIBLE = 80;

/**
 * Las fechas del analisis son texto "YYYY-MM-DD" a proposito: el lector no
 * construye ningun `Date` para no correr un dia el cronograma al formatearlo
 * en otra zona horaria. Aqui se ancla a medianoche UTC, que es lo que
 * `utils/fechas` sabe deshacer.
 */
function comoFecha(texto: string): Date {
  return new Date(`${texto}T00:00:00Z`);
}

export function VistaPreviaCronograma({
  analisis,
}: {
  analisis: ResultadoAnalisisCronograma;
}) {
  const conAviso = analisis.tareas.filter((t) => t.aviso);
  const visibles = analisis.tareas.slice(0, MAXIMO_VISIBLE);
  const ocultas = analisis.tareas.length - visibles.length;

  return (
    <div className="space-y-5">
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Resumen etiqueta="Tareas" valor={String(analisis.totalTareas)} destacado />
        <Resumen etiqueta="Hitos" valor={String(analisis.totalHitos)} />
        <Resumen
          etiqueta="Ruta crítica"
          valor={`${analisis.totalCriticas} tareas`}
        />
        <Resumen
          etiqueta="Incidencias"
          valor={String(analisis.errores.length)}
          peligro={analisis.errores.length > 0}
        />
      </dl>

      <dl className="grid gap-3 sm:grid-cols-3">
        <Resumen
          etiqueta="Fecha de corte"
          valor={analisis.fechaCorte ? fechaLarga(comoFecha(analisis.fechaCorte)) : "sin fecha"}
          peligro={!analisis.fechaCorte}
        />
        <Resumen
          etiqueta="Plazo"
          valor={
            analisis.inicio && analisis.fin
              ? `${fechaCronograma(comoFecha(analisis.inicio))} a ${fechaCronograma(comoFecha(analisis.fin))}`
              : "—"
          }
        />
        <Resumen
          etiqueta="Duración"
          valor={analisis.duracionDias ? `${decimal(analisis.duracionDias)} días` : "—"}
        />
      </dl>

      {!analisis.fechaCorte && (
        <Aviso peligro titulo="El archivo no trae fecha de estado">
          <p className="mt-1 text-sm">
            El <code>StatusDate</code> es la fecha a la que están referidos los
            avances, y es lo que identifica cada corte. Sin él no se puede
            importar: ponerle la fecha de hoy sería inventar el dato que
            después sitúa cada punto de la curva de avance.
          </p>
          <p className="mt-2 text-sm">
            En MS Project se fija en <strong>Proyecto &gt; Información del
            proyecto &gt; Fecha de estado</strong>, y luego vuelve a exportar.
          </p>
        </Aviso>
      )}

      {analisis.errores.length > 0 && (
        <Aviso
          peligro
          titulo={`${analisis.errores.length} tarea(s) no se importarán`}
          icono={<XCircle className="size-4" aria-hidden="true" />}
        >
          <p className="mt-1 text-xs opacity-70">
            El resto sí se importará.
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
        </Aviso>
      )}

      {conAviso.length > 0 && (
        <Aviso titulo={`${conAviso.length} aviso(s)`}>
          <p className="mt-1 text-xs opacity-70">
            Estas tareas sí se importan, pero conviene revisarlas.
          </p>
          <ul className="mt-3 max-h-40 space-y-1.5 overflow-y-auto text-sm">
            {conAviso.slice(0, 30).map((t) => (
              <li key={t.uid} className="flex gap-2">
                <span className="shrink-0 font-mono text-xs opacity-60">
                  Fila {t.fila}
                </span>
                <span>{t.aviso}</span>
              </li>
            ))}
          </ul>
        </Aviso>
      )}

      <p className="text-xs opacity-60">
        Se descartan {analisis.filasOmitidas} fila(s) que no son partidas de
        obra: la del proyecto, que es el total.
        {analisis.holgurasInferidas > 0 &&
          ` En ${analisis.holgurasInferidas} tareas el archivo no informa la holgura y se anota como cero.`}
        {analisis.dependenciasDescartadas > 0 &&
          ` Se descartan ${analisis.dependenciasDescartadas} enlace(s) que apuntan a una tarea que no está en el archivo.`}
      </p>

      <TablaPrevia tareas={visibles} ocultas={ocultas} />
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

function Aviso({
  titulo,
  peligro,
  icono,
  children,
}: {
  titulo: string;
  peligro?: boolean;
  icono?: React.ReactNode;
  children: React.ReactNode;
}) {
  const color = peligro ? "var(--color-peligro)" : "var(--color-alerta)";

  return (
    <section
      className="rounded-lg border p-4"
      style={{
        borderColor: color,
        backgroundColor: `color-mix(in oklab, ${color} 10%, transparent)`,
      }}
    >
      <h3 className="flex items-center gap-2 text-sm font-semibold">
        {icono ?? <AlertTriangle className="size-4" aria-hidden="true" />}
        {titulo}
      </h3>
      {children}
    </section>
  );
}

function TablaPrevia({
  tareas,
  ocultas,
}: {
  tareas: ResultadoAnalisisCronograma["tareas"];
  ocultas: number;
}) {
  return (
    <div>
      <h3 className="mb-2 text-sm font-semibold">Tareas detectadas</h3>

      {/* El desbordamiento se contiene aqui: en movil la tabla se desplaza
          en horizontal sin romper el ancho de la pagina. */}
      <div
        className="overflow-x-auto rounded-lg border"
        style={{ borderColor: "var(--borde)" }}
      >
        <table className="w-full min-w-[52rem] text-sm">
          <caption className="sr-only">
            Vista previa de las tareas que se importarán
          </caption>
          <thead>
            <tr
              className="text-left text-xs uppercase"
              style={{ backgroundColor: "color-mix(in oklab, var(--borde) 40%, transparent)" }}
            >
              <th scope="col" className="px-3 py-2 font-medium">Código</th>
              <th scope="col" className="px-3 py-2 font-medium">Tarea</th>
              <th scope="col" className="px-3 py-2 font-medium">Comienzo</th>
              <th scope="col" className="px-3 py-2 font-medium">Fin</th>
              <th scope="col" className="px-3 py-2 text-right font-medium">Días</th>
              <th scope="col" className="px-3 py-2 text-right font-medium">Planeado</th>
              <th scope="col" className="px-3 py-2 text-right font-medium">Real</th>
            </tr>
          </thead>
          <tbody>
            {tareas.map((t) => (
              <tr
                key={t.uid}
                className="border-t"
                style={{
                  borderColor: "var(--borde)",
                  backgroundColor: t.esResumen
                    ? "color-mix(in oklab, var(--color-marca-500) 7%, transparent)"
                    : undefined,
                }}
              >
                <td className="px-3 py-1.5 font-mono text-xs whitespace-nowrap">
                  {t.codigo ?? ""}
                </td>
                <td
                  className={`px-3 py-1.5 ${t.esResumen ? "font-semibold" : ""}`}
                  // La sangria sale del nivel de esquema, que es la unica
                  // fuente de jerarquia: el codigo es solo una etiqueta.
                  style={{ paddingLeft: `${0.75 + (t.nivel - 1) * 0.85}rem` }}
                >
                  {t.esHito && <span aria-hidden="true">◆ </span>}
                  {t.nombre}
                </td>
                <td className="px-3 py-1.5 whitespace-nowrap opacity-70">
                  {fechaCronograma(comoFecha(t.inicio))}
                </td>
                <td className="px-3 py-1.5 whitespace-nowrap opacity-70">
                  {fechaCronograma(comoFecha(t.fin))}
                </td>
                <td className="px-3 py-1.5 text-right tabular-nums whitespace-nowrap">
                  {decimal(t.duracionDias)}
                </td>
                <td className="px-3 py-1.5 text-right tabular-nums whitespace-nowrap">
                  {decimal(t.porcentajePlaneado, "")}%
                </td>
                <td className="px-3 py-1.5 text-right font-medium tabular-nums whitespace-nowrap">
                  {decimal(t.porcentajeArchivo, "")}%
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {ocultas > 0 && (
        <p className="mt-2 text-xs opacity-60">
          Se muestran las primeras {MAXIMO_VISIBLE} filas. Las {ocultas}{" "}
          restantes también se importarán.
        </p>
      )}
    </div>
  );
}
