import { ArrowLeftRight, FileText, Lock, Minus, PenLine, Plus } from "lucide-react";
import type { MovimientoResumen } from "@/services/movimientos.service";
import type { TipoMovimiento } from "@/generated/prisma/enums";
import { esNegativo } from "@/lib/decimal";
import { soles } from "@/utils/formato";
import { fechaCorta, fechaHora } from "@/utils/fechas";
import { BotonAprobarMovimiento } from "@/components/movimientos/BotonAprobarMovimiento";
import { BotonEliminarBorrador } from "@/components/movimientos/BotonEliminarBorrador";

/**
 * Historial de movimientos, del mas reciente al mas antiguo.
 *
 * Cada movimiento se muestra con sus lineas desplegadas y no plegado tras
 * un total: el total de una reconversion es cero, asi que plegarla la
 * dejaria como «Movimiento 3 — 0,00» y habria que abrirla siempre para
 * saber que hizo. Lo que importa es de donde salio y adonde fue.
 */

const ETIQUETA: Record<TipoMovimiento, string> = {
  RECONVERSION: "Reconversion",
  ADICIONAL: "Adicional",
  DEDUCTIVO: "Deductivo",
};

const ICONO = {
  RECONVERSION: ArrowLeftRight,
  ADICIONAL: Plus,
  DEDUCTIVO: Minus,
} as const;

interface Props {
  movimientos: MovimientoResumen[];
  obraId: string;
  /// Aprobar es de ADMIN: incorpora el movimiento al vigente y es
  /// irreversible.
  puedeAprobar: boolean;
  /// Quien puede crear un borrador puede tambien descartarlo.
  puedeCrear: boolean;
}

export function HistorialMovimientos({
  movimientos,
  obraId,
  puedeAprobar,
  puedeCrear,
}: Props) {
  return (
    <section>
      <h2 className="mb-3 text-lg font-semibold">Movimientos</h2>

      {movimientos.length === 0 ? (
        <div
          className="rounded-xl border border-dashed p-10 text-center"
          style={{ borderColor: "var(--borde)" }}
        >
          <FileText className="mx-auto size-8 opacity-40" aria-hidden="true" />
          <p className="mt-3 text-sm opacity-70">
            Esta obra no tiene ningun movimiento presupuestal.
          </p>
          <p className="mx-auto mt-1 max-w-lg text-sm text-pretty opacity-60">
            Una reconversion mueve dinero entre partidas y suma cero; un
            adicional aumenta el presupuesto aprobado y un deductivo lo
            reduce. Los tres van encima de la linea base, que no se toca.
          </p>
        </div>
      ) : (
        <ul className="space-y-4">
          {movimientos.map((m) => (
            <li key={m.id}>
              <Tarjeta
                movimiento={m}
                obraId={obraId}
                puedeAprobar={puedeAprobar}
                puedeCrear={puedeCrear}
              />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function Tarjeta({
  movimiento: m,
  obraId,
  puedeAprobar,
  puedeCrear,
}: {
  movimiento: MovimientoResumen;
  obraId: string;
  puedeAprobar: boolean;
  puedeCrear: boolean;
}) {
  const Icono = ICONO[m.tipo];

  return (
    <article
      className="rounded-xl border"
      style={{ borderColor: "var(--borde)", backgroundColor: "var(--superficie)" }}
    >
      <header
        className="flex flex-wrap items-start justify-between gap-3 border-b px-4 py-3"
        style={{ borderColor: "var(--borde)" }}
      >
        <div>
          <h3 className="inline-flex items-center gap-2 text-sm font-semibold">
            <Icono className="size-4 shrink-0 opacity-70" aria-hidden="true" />
            Movimiento {m.numero} · {ETIQUETA[m.tipo]}
          </h3>
          <p className="mt-0.5 text-sm opacity-80">{m.concepto}</p>
          <p className="mt-0.5 text-xs opacity-60">
            {fechaCorta(m.fecha)}
            {m.referencia && ` · ${m.referencia}`}
          </p>
        </div>

        <Estado aprobado={m.aprobado} />
      </header>

      <ul className="divide-y" style={{ borderColor: "var(--borde)" }}>
        {m.lineas.map((linea, i) => (
          <li
            key={`${m.id}-${i}`}
            className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-4 py-2 text-sm"
            style={{ borderColor: "var(--borde)" }}
          >
            <span className="min-w-0">
              <span className="font-medium">{linea.codigoPartida}</span>
              {linea.esNueva && (
                <span
                  className="ml-2 rounded-full px-1.5 py-0.5 text-[10px] font-medium"
                  style={{
                    backgroundColor:
                      "color-mix(in oklab, var(--color-marca-500) 18%, transparent)",
                  }}
                >
                  partida nueva
                </span>
              )}
              <span className="ml-2 opacity-70">{linea.descripcion}</span>
            </span>

            <span
              className="shrink-0 font-medium tabular-nums"
              style={{
                color: esNegativo(linea.importe)
                  ? "var(--color-alerta)"
                  : "var(--color-exito)",
              }}
            >
              {soles(linea.importe)}
            </span>
          </li>
        ))}
      </ul>

      <div
        className="border-t px-4 py-3"
        style={{ borderColor: "var(--borde)" }}
      >
        <dl className="flex flex-wrap gap-x-6 gap-y-1 text-xs">
          <div>
            <dt className="inline opacity-60">Entradas </dt>
            <dd className="inline tabular-nums">{soles(m.totalEntradas)}</dd>
          </div>
          <div>
            <dt className="inline opacity-60">Salidas </dt>
            <dd className="inline tabular-nums">{soles(m.totalSalidas)}</dd>
          </div>
          <div>
            <dt className="inline opacity-60">Neto </dt>
            <dd className="inline font-medium tabular-nums">
              {soles(m.importeNeto)}
            </dd>
          </div>
        </dl>

        <p className="mt-2 text-sm text-pretty opacity-70">
          <span className="font-medium opacity-80">Motivo: </span>
          {m.motivo}
        </p>

        {m.aprobado ? (
          <p className="mt-2 text-xs opacity-70">
            Aprobado
            {m.aprobadoAt && ` el ${fechaHora(m.aprobadoAt)}`}
            {m.aprobadoPor && ` por ${m.aprobadoPor}`}. Para corregirlo hay
            que registrar otro de signo contrario.
          </p>
        ) : (
          (puedeAprobar || puedeCrear) && (
            <div className="mt-3 flex flex-wrap items-start gap-2">
              {puedeAprobar && (
                <BotonAprobarMovimiento
                  obraId={obraId}
                  movimientoId={m.id}
                  numero={m.numero}
                  tipo={ETIQUETA[m.tipo]}
                  concepto={m.concepto}
                  entradas={soles(m.totalEntradas)}
                  salidas={soles(m.totalSalidas)}
                  neto={soles(m.importeNeto)}
                />
              )}

              {puedeCrear && (
                <BotonEliminarBorrador
                  obraId={obraId}
                  movimientoId={m.id}
                  numero={m.numero}
                />
              )}
            </div>
          )
        )}
      </div>
    </article>
  );
}

/** Un borrador todavia no ajusta nada; un aprobado ya cuenta en el vigente. */
function Estado({ aprobado }: { aprobado: boolean }) {
  const Icono = aprobado ? Lock : PenLine;

  return (
    <span
      className="inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium"
      style={{
        backgroundColor: aprobado
          ? "color-mix(in oklab, var(--color-exito) 18%, transparent)"
          : "color-mix(in oklab, var(--color-alerta) 18%, transparent)",
      }}
    >
      <Icono className="size-3.5" aria-hidden="true" />
      {aprobado ? "Aprobado" : "Borrador"}
    </span>
  );
}
