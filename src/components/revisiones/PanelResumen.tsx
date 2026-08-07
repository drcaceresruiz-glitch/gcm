import { FileText, Lock, PenLine, TrendingDown, TrendingUp } from "lucide-react";
import type {
  ResumenPresupuesto,
  RevisionResumen,
} from "@/services/revisiones.service";
import { fraccionAPorcentaje } from "@/lib/presupuesto";
import { decimal, soles, tipoCambio } from "@/utils/formato";
import { fechaCorta } from "@/utils/fechas";
import { CuadroCascada } from "@/components/revisiones/CuadroCascada";

/**
 * Resumen del presupuesto: la revision vigente, su cascada, la diferencia
 * con la anterior y las clausulas de ejecucion.
 *
 * Reproduce el cuadro con el que el cliente cierra su Excel. La vigente es
 * la de version mas alta, que es como el servicio las devuelve.
 */

/** El valor absoluto de una diferencia con signo, para mostrarla junto a su
 *  etiqueta. Un «-33,527.00» bajo el rotulo «Reduccion» se lee dos veces. */
function magnitud(valor: string): string {
  return valor.startsWith("-") ? valor.slice(1) : valor;
}

function porcentajesLegibles(revision: RevisionResumen) {
  return {
    gastosGenerales: fraccionAPorcentaje(revision.porcentajes.gastosGenerales),
    utilidad: fraccionAPorcentaje(revision.porcentajes.utilidad),
    igv: fraccionAPorcentaje(revision.porcentajes.igv),
  };
}

export function PanelResumen({ resumen }: { resumen: ResumenPresupuesto }) {
  const [vigente] = resumen.revisiones;

  if (!vigente) {
    return (
      <div
        className="rounded-xl border border-dashed p-10 text-center"
        style={{ borderColor: "var(--borde)" }}
      >
        <FileText className="mx-auto size-8 opacity-40" aria-hidden="true" />
        <p className="mt-3 text-sm opacity-70">
          Todavia no hay ninguna revision del presupuesto.
        </p>
        <p className="mx-auto mt-1 max-w-md text-sm text-pretty opacity-60">
          Una revision congela el costo directo de hoy con sus porcentajes y
          su tipo de cambio, y es contra ella contra la que se miden despues
          el avance y la desviacion.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <section
        className="rounded-xl border"
        style={{ borderColor: "var(--borde)", backgroundColor: "var(--superficie)" }}
      >
        <header
          className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3"
          style={{ borderColor: "var(--borde)" }}
        >
          <div>
            <h2 className="text-sm font-semibold">
              Revision v{vigente.version}
            </h2>
            <p className="mt-0.5 text-xs opacity-60">
              {fechaCorta(vigente.fechaRevision)}
              {vigente.tipoCambio &&
                ` · Tipo de cambio ${tipoCambio(vigente.tipoCambio)}`}
            </p>
          </div>

          <Estado aprobada={vigente.aprobada} />
        </header>

        <div className="p-1.5">
          <CuadroCascada
            cascada={vigente.cascada}
            porcentajes={porcentajesLegibles(vigente)}
          />
        </div>
      </section>

      {resumen.comparacion && <Comparacion comparacion={resumen.comparacion} />}

      {vigente.clausulas && <Clausulas texto={vigente.clausulas} />}

      {resumen.revisiones.length > 1 && (
        <Historial revisiones={resumen.revisiones} />
      )}
    </div>
  );
}

/** Una revision en borrador todavia se puede rehacer; una aprobada, no. */
function Estado({ aprobada }: { aprobada: boolean }) {
  const Icono = aprobada ? Lock : PenLine;

  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium"
      style={{
        backgroundColor: aprobada
          ? "color-mix(in oklab, var(--color-exito) 18%, transparent)"
          : "color-mix(in oklab, var(--color-alerta) 18%, transparent)",
      }}
    >
      <Icono className="size-3.5" aria-hidden="true" />
      {aprobada ? "Aprobada y congelada" : "Borrador"}
    </span>
  );
}

function Comparacion({
  comparacion,
}: {
  comparacion: NonNullable<ResumenPresupuesto["comparacion"]>;
}) {
  const { anterior, actual, encarece } = comparacion;
  const Icono = encarece ? TrendingUp : TrendingDown;
  const color = encarece ? "var(--color-alerta)" : "var(--color-exito)";

  return (
    <section
      className="rounded-xl border"
      style={{ borderColor: "var(--borde)", backgroundColor: "var(--superficie)" }}
    >
      <h2
        className="border-b px-4 py-3 text-sm font-semibold"
        style={{ borderColor: "var(--borde)" }}
      >
        Diferencia con la revision anterior
      </h2>

      <dl className="space-y-2 p-4 text-sm">
        <div className="flex items-baseline justify-between gap-4">
          <dt className="opacity-70">
            v{anterior.version} · {fechaCorta(anterior.fechaRevision)}
          </dt>
          <dd className="tabular-nums">{soles(anterior.cascada.presupuesto)}</dd>
        </div>
        <div className="flex items-baseline justify-between gap-4">
          <dt className="opacity-70">
            v{actual.version} · {fechaCorta(actual.fechaRevision)}
          </dt>
          <dd className="tabular-nums">{soles(actual.cascada.presupuesto)}</dd>
        </div>

        <div
          className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-t pt-3"
          style={{ borderColor: "var(--borde)" }}
        >
          <dt
            className="inline-flex items-center gap-1.5 font-semibold"
            style={{ color }}
          >
            <Icono className="size-4" aria-hidden="true" />
            {encarece ? "El presupuesto sube" : "El presupuesto baja"}
          </dt>
          <dd className="tabular-nums" style={{ color }}>
            <span className="font-semibold">
              {soles(magnitud(comparacion.diferenciaSoles))}
            </span>
            {comparacion.diferenciaDolares && (
              <span className="ml-2 text-xs opacity-80">
                US$ {decimal(magnitud(comparacion.diferenciaDolares))}
              </span>
            )}
          </dd>
        </div>
      </dl>

      {!actual.tipoCambio && (
        <p className="px-4 pb-3 text-xs opacity-60">
          Sin tipo de cambio en la revision v{actual.version}, la diferencia
          solo se puede expresar en soles.
        </p>
      )}
    </section>
  );
}

/**
 * Clausulas de ejecucion: alcance, forma de pago, garantia, vigencia.
 *
 * Se muestran con los saltos de linea que escribio quien creo la revision.
 * La clausula de alcance es la que decide si un trabajo nuevo es adicional
 * o reconversion, asi que tiene que poder leerse tal cual se pacto.
 */
function Clausulas({ texto }: { texto: string }) {
  return (
    <section
      className="rounded-xl border"
      style={{ borderColor: "var(--borde)", backgroundColor: "var(--superficie)" }}
    >
      <h2
        className="border-b px-4 py-3 text-sm font-semibold"
        style={{ borderColor: "var(--borde)" }}
      >
        Clausulas de ejecucion
      </h2>
      <p className="px-4 py-3 text-sm whitespace-pre-line">{texto}</p>
    </section>
  );
}

function Historial({ revisiones }: { revisiones: RevisionResumen[] }) {
  return (
    <section>
      <h2 className="mb-3 text-lg font-semibold">Historial de revisiones</h2>

      <div
        className="overflow-x-auto rounded-xl border"
        style={{ borderColor: "var(--borde)" }}
      >
        <table className="w-full min-w-[38rem] text-sm">
          <caption className="sr-only">
            Todas las revisiones del presupuesto, de la mas reciente a la mas
            antigua
          </caption>
          <thead>
            <tr
              className="text-left text-xs uppercase"
              style={{
                backgroundColor: "color-mix(in oklab, var(--borde) 40%, transparent)",
              }}
            >
              <th scope="col" className="px-3 py-2 font-medium">Version</th>
              <th scope="col" className="px-3 py-2 font-medium">Fecha</th>
              <th scope="col" className="px-3 py-2 font-medium">Estado</th>
              <th scope="col" className="px-3 py-2 text-right font-medium">
                Costo directo
              </th>
              <th scope="col" className="px-3 py-2 text-right font-medium">
                Presupuesto
              </th>
            </tr>
          </thead>
          <tbody>
            {revisiones.map((r) => (
              <tr key={r.id} className="border-t" style={{ borderColor: "var(--borde)" }}>
                <th scope="row" className="px-3 py-2 text-left font-medium">
                  v{r.version}
                </th>
                <td className="px-3 py-2 whitespace-nowrap">
                  {fechaCorta(r.fechaRevision)}
                </td>
                <td className="px-3 py-2 text-xs opacity-70">
                  {r.aprobada ? "Congelada" : "Borrador"}
                </td>
                <td className="px-3 py-2 text-right tabular-nums whitespace-nowrap">
                  {soles(r.cascada.costoDirecto)}
                </td>
                <td className="px-3 py-2 text-right font-medium tabular-nums whitespace-nowrap">
                  {soles(r.cascada.presupuesto)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
