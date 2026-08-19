"use client";

import { useSyncExternalStore } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowRight, TriangleAlert } from "lucide-react";
import type { PasoSiguiente as Paso } from "@/lib/siguiente-paso";

/**
 * El anclaje de continuidad: que toca ahora en esta obra, con su boton.
 *
 * Sucede a `AvisoCriterio` —retirado en este mismo cambio—, que hacia esto
 * mismo para un unico caso: la decision de los gastos generales. Se pinta
 * arriba de TODAS las pantallas de la obra porque su gracia es justo esa: que
 * siga ahi cuando te desvias a mirar otra cosa. Que paso toca lo decide
 * `lib/siguiente-paso`; aqui solo se pinta.
 *
 * ES CLIENTE POR DOS COSAS QUE EL SERVIDOR NO PUEDE HACER:
 *
 * 1. **Se esconde cuando ya estas en la pantalla del paso.** Un cartel que
 *    dice «carga el presupuesto» mientras cargas el presupuesto es ruido, y
 *    encima te roba la primera linea de la pantalla en la que estas
 *    trabajando. Un layout de Next no conoce la ruta; `usePathname` si.
 * 2. **Se puede aplazar.** Ver abajo.
 *
 * APLAZAR, Y HASTA DONDE. Una sugerencia se quita con «Ahora no» y no vuelve
 * en lo que dure la pestana (`sessionStorage`, no `localStorage`: aplazar es
 * «ahora no», no «nunca mas», y una decision de hace tres semanas no deberia
 * seguir tapando un paso del alta sin que nadie recuerde haberlo escondido).
 * Lo BLOQUEANTE no se aplaza: no es una sugerencia de secuencia sino una
 * cifra que no se puede leer hasta que alguien decida, y esconderlo dejaria
 * el margen mudo sin decir por que. Es el comportamiento que ya tenia el
 * aviso del criterio y no se cambia de tapadillo.
 */

/**
 * El aplazamiento, como almacen externo.
 *
 * `useSyncExternalStore` y no un `useState` con efecto por dos motivos: el
 * linter prohibe llamar a `setState` dentro de un efecto, y sobre todo porque
 * en las navegaciones dentro de la obra —que son de cliente— el valor se lee
 * en el primer render y lo aplazado NO PARPADEA. Solo puede verse un instante
 * en una recarga completa, donde el servidor no tiene forma de saberlo.
 *
 * Los oyentes se avisan a mano porque `sessionStorage` no notifica sus propios
 * cambios: el evento `storage` del navegador solo salta en las OTRAS pestanas.
 */
const oyentes = new Set<() => void>();

function suscribir(oyente: () => void): () => void {
  oyentes.add(oyente);
  return () => {
    oyentes.delete(oyente);
  };
}

function leerAplazado(llave: string): boolean {
  try {
    return sessionStorage.getItem(llave) !== null;
  } catch {
    // Navegador con el almacen capado: se pinta. Perder la sugerencia es peor
    // que no poder aplazarla.
    return false;
  }
}

function aplazarPaso(llave: string): void {
  try {
    sessionStorage.setItem(llave, "1");
  } catch {
    // Da igual que no se pueda guardar: lo que importa es que desaparezca
    // ahora, y el aviso a los oyentes se manda igual.
  }
  for (const oyente of oyentes) oyente();
}

export function PasoSiguiente({
  obraId,
  paso,
}: {
  obraId: string;
  paso: Paso;
}) {
  const bloqueante = paso.gravedad === "bloqueante";
  const pathname = usePathname();
  const destino = `/obras/${obraId}${paso.camino}`;
  const llave = `gcm_paso_aplazado:${obraId}:${paso.clave}`;

  const aplazado = useSyncExternalStore(
    suscribir,
    () => leerAplazado(llave),
    // En el servidor nada esta aplazado: no hay pestana todavia.
    () => false,
  );

  // Ya estas donde te mandaba: no interrumpir lo que se esta haciendo.
  if (pathname === destino || pathname.startsWith(`${destino}/`)) return null;
  if (aplazado && !bloqueante) return null;

  return (
    <div
      className="flex flex-wrap items-center justify-between gap-3 rounded-lg px-4 py-3 text-sm print:hidden"
      style={
        bloqueante
          ? {
              backgroundColor:
                "color-mix(in oklab, var(--color-peligro) 15%, transparent)",
            }
          : {
              backgroundColor: "var(--superficie)",
              border: "1px solid var(--borde)",
            }
      }
    >
      <p className="flex items-start gap-2">
        {bloqueante && (
          <TriangleAlert
            className="mt-0.5 size-4 shrink-0"
            aria-hidden="true"
          />
        )}
        <span>
          <strong>{paso.titulo}:</strong>{" "}
          <span className={bloqueante ? undefined : "opacity-80"}>
            {paso.consecuencia}
          </span>
        </span>
      </p>

      <span className="flex shrink-0 items-center gap-1">
        {/* Aplazar va ANTES del boton principal y en tono menor: se ve, no
            compite. La autonomia se respeta ofreciendola, no escondiendola. */}
        {!bloqueante && (
          <button
            type="button"
            onClick={() => aplazarPaso(llave)}
            className="rounded-lg px-3 py-2 text-sm opacity-60 hover:opacity-100"
          >
            Ahora no
          </button>
        )}

        <Link
          href={destino}
          className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-white"
          style={{ backgroundColor: "var(--color-marca-600)" }}
        >
          {paso.accion}
          <ArrowRight className="size-4" aria-hidden="true" />
        </Link>
      </span>
    </div>
  );
}
