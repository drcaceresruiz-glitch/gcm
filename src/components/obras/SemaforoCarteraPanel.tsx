import Link from "next/link";
import type { SemaforoCartera } from "@/services/gerencia.service";
import { COLOR_SEMAFORO } from "@/lib/tablero";

/**
 * Version compacta del semaforo de `/gerencia` para el panel de empresa.
 *
 * `/gerencia` ya tiene el detalle completo -partidas criticas por obra, con
 * enlace directo a cada una-, y este no lo repite: aqui solo va el punto de
 * color y el SPI por duracion, de un vistazo, con un enlace a la pantalla
 * completa. Dos copias del mismo detalle envejecerian distinto.
 */
export function SemaforoCarteraPanel({ semaforo }: { semaforo: SemaforoCartera }) {
  if (semaforo.obras.length === 0) return null;

  return (
    <div
      className="elevacion-1 rounded-xl border p-4"
      style={{ borderColor: "var(--borde)", backgroundColor: "var(--superficie)" }}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold">Salud de la cartera</h3>
        {/* Solo tiene sentido enlazar al detalle si hay alguna critica que
            mirar: sin ninguna, «Gerencia» ya se llega por el lateral. */}
        {semaforo.criticasAtrasadas > 0 && (
          <Link
            href="/gerencia"
            className="text-xs font-medium underline-offset-2 hover:underline"
          >
            Ver detalle en Gerencia →
          </Link>
        )}
      </div>

      <p className="mt-0.5 text-xs opacity-70">
        SPI por duración: cuánto va cada obra de avance real sobre el
        planeado, por plazo, no por dinero.
      </p>

      <ul className="mt-3 flex flex-wrap gap-2">
        {semaforo.obras.map((o) => (
          <li key={o.obraId}>
            <Link
              href={`/obras/${o.obraId}/cronograma`}
              className="inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs"
              style={{ borderColor: "var(--borde)" }}
            >
              <span
                aria-hidden="true"
                className="size-2 shrink-0 rounded-full"
                style={{
                  backgroundColor: o.semaforo ? COLOR_SEMAFORO[o.semaforo] : "var(--borde)",
                }}
              />
              <span className="max-w-40 truncate font-medium">{o.obraNombre}</span>
              <span className="opacity-60 tabular-nums">
                {o.sinCronograma || o.spiPorDuracion === null
                  ? "sin datos"
                  : o.spiPorDuracion.toFixed(2)}
              </span>
            </Link>
          </li>
        ))}
      </ul>

      {/* Mismo aviso honesto que `/gerencia`: un recorte que no se dice se
          lee como que no hay nada que mirar. */}
      {semaforo.obrasVivas > semaforo.obras.length && (
        <p className="mt-2 text-xs" style={{ color: "var(--color-alerta)" }}>
          Se muestran {semaforo.obras.length} de {semaforo.obrasVivas} obras
          vivas. El resto no esta evaluado aqui —
          <Link href="/gerencia" className="underline">
            ver la cartera completa
          </Link>
          .
        </p>
      )}
    </div>
  );
}
