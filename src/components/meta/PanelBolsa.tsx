import Link from "next/link";
import { AlertTriangle, CalendarClock, Info, Lock } from "lucide-react";

import { soles } from "@/utils/formato";
import { fechaCorta } from "@/utils/fechas";
import { esNegativo, esPositivo } from "@/lib/decimal";
import {
} from "@/lib/bolsa";
import { origenDeEjemplo } from "@/lib/datos-de-ejemplo";
import { BotonAjustarMeses } from "@/components/meta/BotonAjustarMeses";
import type { ComparacionMeta } from "@/services/meta.service";

/**
 * La cascada de la bolsa de la obra.
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

export function PanelBolsa({
  c,
  obraId,
}: {
  c: ComparacionMeta;
  obraId: string;
}) {
  const { bolsa, meta, desfase, plazo } = c;
  const negativa = esNegativo(bolsa.bolsaTotal);
  const ejemplo = origenDeEjemplo(bolsa);

  return (
    <section className="space-y-5">
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-lg font-semibold">
          Bolsa de la obra
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
          etiqueta="Costo directo contractual"
          nota="las partidas del contrato, sin gastos generales"
          valor={bolsa.costoDirectoContractual}
        />
        <Fila
          etiqueta="Costo directo meta"
          nota="lo que planeamos gastar en esas partidas"
          valor={bolsa.costoDirectoMeta}
        />


        <div
          className="my-1 border-t"
          style={{ borderColor: "var(--borde)" }}
          aria-hidden="true"
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
          <span>
            Bolsa
            <span className="ml-2 text-sm font-normal opacity-60">
              lo que la obra puede gestionar
            </span>
          </span>
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


      {c.lineasLargas.length > 0 && (
        <Aviso
          tono="alerta"
          icono={CalendarClock}
          titulo={`${c.lineasLargas.length} gasto(s) general(es) duran mas que la obra`}
        >
          La obra son {c.mesesObra} meses y estas lineas presupuestan mas:{" "}
          {c.lineasLargas
            .map((l) => `${l.concepto} (${l.meses} meses, ${l.exceso} de mas)`)
            .join("; ")}
          . Los meses se escriben a mano en el Excel y nada los ata al plazo
          real, asi que suelen venir de la plantilla sin ajustar. Si es a
          proposito —una fianza que sigue viva tras entregar— dejalo; si no,
          corrige los meses y vuelve a cargar. O ajustalos aqui mismo:
          {!meta.aprobada && (
            <BotonAjustarMeses obraId={obraId} metaId={meta.id} />
          )}
        </Aviso>
      )}

      {ejemplo.hay && (
        <Aviso
          tono="peligro"
          icono={AlertTriangle}
          titulo="Estas cifras son las de EJEMPLO de la plantilla, no las de tu obra"
        >
          {ejemplo.contractual && ejemplo.meta
            ? "El presupuesto contractual y la meta coinciden al céntimo con las filas de ejemplo que trae la plantilla. "
            : ejemplo.contractual
              ? "El presupuesto contractual coincide al céntimo con las partidas de ejemplo de su plantilla. "
              : "La meta coincide al céntimo con las filas de ejemplo de su plantilla. "}
          Se cargaron sin borrarlas, y GCM las acepto como validas. Los dos
          ejemplos estan pensados para obras de tamano distinto, asi que
          compararlos da un margen que no significa nada. Borra las filas de
          ejemplo del Excel, vuelve a cargarlo y esta pantalla dira la verdad.
        </Aviso>
      )}


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
          {meta.baselineVersion ?? "—"}). El contrato subió y la meta no incluye lo
          que cuesta construir ese trabajo. Crea una versión nueva de la meta
          para volver a comparar de verdad.
        </Aviso>
      )}

    </section>
  );
}
