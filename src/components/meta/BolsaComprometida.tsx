import { AlertTriangle } from "lucide-react";

import type { BolsaComprometida as Cuentas } from "@/lib/bolsa-comprometida";
import { esCero, esNegativo, esPositivo } from "@/lib/decimal";
import { soles } from "@/utils/formato";

/**
 * La segunda bolsa: la que queda cuando se miran los contratos firmados.
 *
 * RESPONDE A UNA PREGUNTA DE OBRA: «el contratista se percata de alcances que
 * no estaban en su orden y me genera un adicional; como lo registro para que
 * reste de la bolsa operativa».
 *
 * Va al lado de la prevista y NO la sustituye, y esa es la decision. Si el
 * adicional bajara la bolsa prevista, el plan se habria reescrito para
 * encajar con la realidad y la desviacion desapareceria: siempre pareceria
 * que la obra va justa. Congelada la prevista, la diferencia entre las dos ES
 * la desviacion, y se puede señalar quien se la comio.
 */
export function BolsaComprometida({
  cuentas,
  obraId,
}: {
  cuentas: Cuentas;
  obraId: string;
}) {
  const { prevista, desviacionTotal, comprometida, frentes, pendienteDeFirma } =
    cuentas;

  const sinContratos = frentes.length === 0;
  const seDesvia = !esCero(desviacionTotal);
  const enRojo = esNegativo(comprometida);

  /// De peor a mejor: quien mira esto busca al que se la come, no un listado.
  const ordenados = [...frentes]
    .filter((f) => !esCero(f.desviacion))
    .sort((a, b) => Number(b.desviacion) - Number(a.desviacion));

  return (
    <section
      className="rounded-xl border p-4"
      style={{ borderColor: "var(--borde)", backgroundColor: "var(--superficie)" }}
    >
      <h2 className="text-sm font-semibold">Con los contratos ya firmados</h2>
      <p className="mt-0.5 max-w-2xl text-sm opacity-70">
        La bolsa de arriba es el plan y no se toca nunca: es contra ella contra
        la que se mide la desviación. Esta es la que queda de verdad una vez
        contados los contratos con sus adendas aprobadas.
      </p>

      <dl className="mt-3 space-y-1 text-sm">
        <div className="flex items-baseline justify-between gap-4">
          <dt>Bolsa prevista</dt>
          <dd className="tabular-nums">{soles(prevista)}</dd>
        </div>

        {seDesvia && (
          <div className="flex items-baseline justify-between gap-4">
            <dt>
              {esPositivo(desviacionTotal)
                ? "− Se paga de más que en la meta"
                : "+ Se cerró por debajo de la meta"}
            </dt>
            <dd className="tabular-nums">
              {soles(
                esPositivo(desviacionTotal)
                  ? desviacionTotal
                  : desviacionTotal.replace("-", ""),
              )}
            </dd>
          </div>
        )}

        <div
          className="mt-1 flex items-baseline justify-between gap-4 border-t pt-2 text-base font-semibold"
          style={{
            borderColor: "var(--borde)",
            ...(enRojo ? { color: "var(--color-peligro)" } : {}),
          }}
        >
          <dt>
            Bolsa comprometida
            <span className="ml-2 text-sm font-normal opacity-60">
              lo que queda de verdad
            </span>
          </dt>
          <dd className="tabular-nums">{soles(comprometida)}</dd>
        </div>
      </dl>

      {sinContratos && (
        <p className="mt-2 text-sm opacity-60">
          Todavía no hay contratos firmados, así que las dos cifras son la
          misma.
        </p>
      )}

      {ordenados.length > 0 && (
        <div className="mt-3 border-t pt-3" style={{ borderColor: "var(--borde)" }}>
          {/* «La bolsa bajó 8.000» no mueve a nadie; «el frente E-004 de
              Estructuras SAC se llevó 8.000» sí. */}
          <p className="text-xs uppercase opacity-60">De dónde sale</p>
          <ul className="mt-1 space-y-1 text-sm">
            {ordenados.map((f) => (
              <li key={f.encargoId} className="flex items-baseline justify-between gap-4">
                <span className="min-w-0 truncate">
                  E-{String(f.numero).padStart(3, "0")} · {f.proveedor}
                  <span className="ml-1 opacity-60">{f.descripcion}</span>
                </span>
                <span
                  className="shrink-0 tabular-nums"
                  style={
                    esPositivo(f.desviacion)
                      ? { color: "var(--color-peligro)" }
                      : { color: "var(--color-exito)" }
                  }
                >
                  {esPositivo(f.desviacion) ? "−" : "+"}
                  {soles(f.desviacion.replace("-", ""))}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {!esCero(pendienteDeFirma) && (
        <p
          className="mt-3 flex items-start gap-2 rounded-lg p-2 text-sm"
          style={{
            backgroundColor:
              "color-mix(in oklab, var(--color-alerta) 15%, transparent)",
          }}
        >
          <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <span>
            Hay <strong>{soles(pendienteDeFirma)}</strong> en adendas esperando
            la firma de gerencia. No están descontados arriba —hasta que se
            firman no son un compromiso—, pero es lo que puede pasar si se
            aprueban todas.{" "}
            <a
              href={`/obras/${obraId}/proveedores`}
              className="underline underline-offset-2"
            >
              Verlas
            </a>
          </span>
        </p>
      )}
    </section>
  );
}
