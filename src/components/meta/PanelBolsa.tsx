import { AlertTriangle, CalendarClock, Info, Lock } from "lucide-react";

import { soles } from "@/utils/formato";
import { fechaCorta } from "@/utils/fechas";
import { esNegativo, esPositivo } from "@/lib/decimal";
import type { ComparacionMeta } from "@/services/meta.service";

/**
 * La cascada de la bolsa operativa.
 *
 * El orden de las filas ES el argumento: contractual, meta, y de ahi las dos
 * bolsas por separado. La utilidad va DESPUES de la bolsa total y con su
 * propia etiqueta, para que no se lea como parte de ella: es el resultado
 * esperado, no dinero disponible.
 */

function Fila({
  etiqueta,
  valor,
  nota,
  fuerte,
  sangrado,
}: {
  etiqueta: string;
  valor: string;
  nota?: string;
  fuerte?: boolean;
  sangrado?: boolean;
}) {
  return (
    <div
      className={`flex items-baseline justify-between gap-4 py-2 ${
        fuerte ? "font-semibold" : ""
      }`}
    >
      <span className={sangrado ? "pl-4 text-sm opacity-80" : "text-sm"}>
        {etiqueta}
        {nota && <span className="ml-2 text-xs opacity-60">{nota}</span>}
      </span>
      <span className="tabular-nums">{soles(valor)}</span>
    </div>
  );
}

function Aviso({
  tono,
  icono: Icono,
  titulo,
  children,
}: {
  tono: "alerta" | "peligro";
  icono: typeof AlertTriangle;
  titulo: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className="flex items-start gap-3 rounded-lg px-4 py-3 text-sm"
      style={{
        backgroundColor: `color-mix(in oklab, var(--color-${tono}) 15%, transparent)`,
      }}
    >
      <Icono className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      <div>
        <p className="font-medium">{titulo}</p>
        <p className="mt-0.5 text-pretty opacity-80">{children}</p>
      </div>
    </div>
  );
}

export function PanelBolsa({ c }: { c: ComparacionMeta }) {
  const { bolsa, meta, desfase, plazo } = c;
  const negativa = esNegativo(bolsa.bolsaTotal);

  return (
    <section className="space-y-5">
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-lg font-semibold">
          Bolsa operativa
          <span className="ml-2 text-sm font-normal opacity-70">
            meta v{meta.version} · {fechaCorta(meta.fechaMeta)}
          </span>
        </h2>
        <span className="flex items-center gap-1.5 text-xs opacity-70">
          {meta.aprobada ? (
            <>
              <Lock className="size-3.5" aria-hidden="true" />
              Congelada por {meta.aprobadaPor}
            </>
          ) : (
            "Borrador: todavía se puede rehacer"
          )}
        </span>
      </header>

      <div
        className="rounded-xl border p-5"
        style={{ borderColor: "var(--borde)" }}
      >
        <Fila
          etiqueta="Presupuesto contractual vigente"
          nota="lo que paga el cliente"
          valor={bolsa.costoDirectoContractual}
        />
        <Fila
          etiqueta="Presupuesto meta"
          nota="lo que nos comprometemos a gastar"
          valor={bolsa.costoDirectoMeta}
        />

        <div
          className="my-1 border-t"
          style={{ borderColor: "var(--borde)" }}
          aria-hidden="true"
        />

        <Fila
          etiqueta="Bolsa de producción"
          nota="se gana ejecutando por debajo de la meta"
          valor={bolsa.bolsaProduccion}
          sangrado
        />
        <Fila
          etiqueta="Bolsa de plazo"
          nota="solo existe si se termina antes"
          valor={bolsa.bolsaPlazo}
          sangrado
        />

        <div
          className="my-1 border-t-2"
          style={{ borderColor: "var(--borde)" }}
          aria-hidden="true"
        />

        <div
          className="flex items-baseline justify-between gap-4 py-2 text-lg font-semibold"
          style={negativa ? { color: "var(--color-peligro)" } : undefined}
        >
          <span>Bolsa operativa</span>
          <span className="tabular-nums">{soles(bolsa.bolsaTotal)}</span>
        </div>

        {/* La utilidad va DEBAJO de la bolsa y separada. Es el punto que mas
            se malinterpreta de toda la pantalla: no es dinero disponible. */}
        <div
          className="mt-3 border-t pt-3"
          style={{ borderColor: "var(--borde)" }}
        >
          <Fila
            etiqueta="Utilidad contractual"
            nota="resultado esperado, no gastable"
            valor={bolsa.utilidadContractual}
          />
          <Fila
            etiqueta="Margen esperado"
            nota="bolsa + utilidad"
            valor={bolsa.margenEsperado}
            fuerte
          />
        </div>
      </div>

      {esPositivo(bolsa.contractualSinMeta) && (
        <Aviso
          tono="alerta"
          icono={AlertTriangle}
          titulo={`${soles(bolsa.contractualSinMeta)} del contrato no tienen línea en la meta`}
        >
          Esa parte aparece dentro de la bolsa, pero no es margen: es gasto que
          nadie ha presupuestado todavía. Descontándola, la bolsa de producción
          real es de {soles(bolsa.bolsaProduccionCubierta)}.
        </Aviso>
      )}

      {desfase.hay && (
        <Aviso
          tono="peligro"
          icono={Info}
          titulo={`La bolsa exagera en ${soles(desfase.importe)}`}
        >
          Se aprobaron {desfase.movimientos} movimiento(s) después de fijar
          esta meta (v{meta.version} se fijó contra la línea base v
          {meta.baselineVersion}). El contrato subió y la meta no incluye lo
          que cuesta construir ese trabajo. Crea una versión nueva de la meta
          para volver a comparar de verdad.
        </Aviso>
      )}

      {plazo.hay && (
        <Aviso
          tono="alerta"
          icono={CalendarClock}
          titulo={`El cronograma va ${plazo.desviacion} meses por encima del plazo de la meta`}
        >
          La meta presupuestó {plazo.mesesMeta} meses de gastos generales y el
          cronograma dice {plazo.mesesProgramados}. A {soles(plazo.costeMensual)}{" "}
          por mes, son {soles(plazo.sobrecosto)} de sostenimiento que la meta no
          contempla. Este sobrecosto no se recupera trabajando mejor: solo
          terminando antes.
        </Aviso>
      )}
    </section>
  );
}
