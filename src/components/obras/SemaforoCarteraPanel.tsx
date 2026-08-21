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
 *
 * Las tarjetas de obra NO son enlaces, a proposito. La primera version
 * enlazaba cada una a `/obras/[id]/cronograma`, pero ahi vive OTRO SPI -el
 * de `PanelEvm.tsx`, ponderado por dinero, bajo la misma etiqueta corta
 * "SPI"- que casi nunca coincide con el «SPI por duracion» de aqui. El
 * enlace prometia una cosa y aterrizaba en otra parecida pero distinta,
 * que es exactamente el tipo de discrepancia que le hizo perder confianza
 * al usuario en la cifra. El unico enlace de este bloque va a `/gerencia`,
 * que es la unica pantalla que de verdad explica y detalla ESTE numero.
 */
export function SemaforoCarteraPanel({ semaforo }: { semaforo: SemaforoCartera }) {
  if (semaforo.obras.length === 0) return null;

  return (
    <div
      className="elevacion-1 rounded-xl border p-4"
      style={{ borderColor: "var(--borde)", backgroundColor: "var(--superficie)" }}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold">Salud de la cartera, por plazo</h3>
        <Link
          href="/gerencia"
          className="text-xs font-medium underline-offset-2 hover:underline"
        >
          Ver el detalle en Gerencia →
        </Link>
      </div>

      {/* La explicacion en lenguaje llano, no en la jerga del indice: el
          color es lo que se lee de un vistazo, y hay que decir que
          significa cada uno sin obligar a saber que es un SPI. */}
      <p className="mt-1 text-xs opacity-70">
        El color de cada obra según cómo va de <strong>plazo</strong> (no de
        dinero): <strong style={{ color: COLOR_SEMAFORO.verde }}>verde</strong>{" "}
        va al día,{" "}
        <strong style={{ color: COLOR_SEMAFORO.ambar }}>ámbar</strong> se
        está atrasando y{" "}
        <strong style={{ color: COLOR_SEMAFORO.rojo }}>rojo</strong> tiene
        partidas críticas atrasadas que corren la fecha de fin. El número es
        el índice exacto (1.00 = justo en el plan); «sin datos» es una obra
        que todavía no tiene cronograma cargado.
      </p>

      <ul className="mt-3 flex flex-wrap gap-2">
        {semaforo.obras.map((o) => (
          <li
            key={o.obraId}
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
          </li>
        ))}
      </ul>

      {/* Mismo aviso honesto que `/gerencia`: un recorte que no se dice se
          lee como que no hay nada que mirar. */}
      {semaforo.obrasVivas > semaforo.obras.length && (
        <p className="mt-2 text-xs" style={{ color: "var(--color-alerta)" }}>
          Se muestran {semaforo.obras.length} de {semaforo.obrasVivas} obras
          vivas. El resto no está evaluado aquí — ver la cartera completa en
          Gerencia.
        </p>
      )}
    </div>
  );
}
