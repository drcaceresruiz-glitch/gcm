"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ArrowLeftRight,
  CalendarClock,
  CalendarRange,
  ClipboardList,
  FileClock,
  Handshake,
  HardHat,
  Table2,
  Truck,
} from "lucide-react";

/**
 * Las secciones de una obra, en dos niveles.
 *
 * Existian como botones en la portada de la obra, asi que para ir de las
 * ordenes a los movimientos habia que volver primero. Al vivir en el layout se
 * quedan puestas en todas las subrutas.
 *
 * Empezaron siendo cuatro en una fila y acabaron siendo OCHO que se
 * desplazaban en horizontal. Una fila con desplazamiento esconde lo que no
 * cabe sin decir que existe: en un movil se veian tres pestanas y media, y las
 * otras cuatro y media no estaban en ninguna parte para quien no supiera
 * arrastrar. Ahora hay una fila de GRUPOS —siempre visible entera, tres
 * entradas cortas— y debajo las secciones del grupo que se este mirando, dos o
 * tres. Ninguna de las dos filas necesita desplazarse.
 *
 * El precio es un clic de mas para cruzar de un grupo a otro. Se paga donde
 * toca: dentro del ciclo diario —Lookahead y Plan Semanal, que son el mismo
 * grupo— se sigue navegando de un clic.
 */

const ICONOS = {
  presupuesto: Table2,
  cronograma: CalendarClock,
  lookahead: CalendarRange,
  planSemanal: ClipboardList,
  personal: HardHat,
  revisiones: FileClock,
  movimientos: ArrowLeftRight,
  proveedores: Handshake,
  ordenes: Truck,
} as const;

/**
 * Los tres grupos, en orden.
 *
 * PLAN es lo que se decide antes y cambia poco —cuanto cuesta, cuando toca y
 * contra que linea base se mide—. EJECUCION es lo que se toca esta semana.
 * COMPRAS es a quien se le pide y que se le pide.
 */
export const GRUPOS_OBRA = [
  { clave: "plan", titulo: "Plan" },
  { clave: "ejecucion", titulo: "Ejecución" },
  { clave: "compras", titulo: "Compras" },
] as const;

export type GrupoObra = (typeof GRUPOS_OBRA)[number]["clave"];

export interface Pestana {
  href: string;
  etiqueta: string;
  clave: keyof typeof ICONOS;
  grupo: GrupoObra;
}

export function PestanasObra({
  pestanas,
  raiz,
}: {
  pestanas: Pestana[];
  /// `/obras/[id]`. Hace falta aparte porque es prefijo de todas las demas.
  raiz: string;
}) {
  const ruta = usePathname();

  // La portada solo esta activa en su ruta exacta; las demas, tambien en lo
  // que cuelga de ellas, para que `/ordenes/nueva` mantenga Ordenes marcada.
  const esActiva = (href: string) =>
    href === raiz ? ruta === raiz : ruta.startsWith(href);

  const grupos = GRUPOS_OBRA.map((g) => ({
    ...g,
    pestanas: pestanas.filter((p) => p.grupo === g.clave),
  })).filter((g) => g.pestanas.length > 0);

  // El grupo de la pantalla en la que se esta. En una subruta que no es
  // pestana —`/editar`— no hay ninguna activa: se cae al primer grupo, que
  // siempre existe si hay pestanas.
  const grupoActivo =
    grupos.find((g) => g.pestanas.some((p) => esActiva(p.href)))?.clave ??
    grupos[0]?.clave;

  // Mirar OTRO grupo sin salir de donde estas: se elige el grupo y sus
  // secciones aparecen debajo, pero la pagina no cambia hasta que se pulsa
  // una. La eleccion se guarda junto a la ruta en la que se hizo, asi que al
  // navegar deja de valer sola y vuelve a mandar el grupo de la pagina nueva
  // —sin efectos ni sincronizaciones que se puedan desalinear—.
  const [eleccion, setEleccion] = useState<{
    grupo: GrupoObra;
    ruta: string;
  } | null>(null);

  const mostrado =
    eleccion && eleccion.ruta === ruta ? eleccion.grupo : grupoActivo;

  const visibles = grupos.find((g) => g.clave === mostrado)?.pestanas ?? [];

  if (grupos.length === 0) return null;

  return (
    <nav aria-label="Secciones de la obra" className="space-y-2">
      {/* Con un solo grupo la fila de grupos no separa nada y sobra. */}
      {grupos.length > 1 && (
        <div
          className="flex flex-wrap gap-1 border-b pb-2"
          style={{ borderColor: "var(--borde)" }}
        >
          {grupos.map((g) => {
            const abierto = g.clave === mostrado;
            const contieneLaPagina = g.clave === grupoActivo;

            return (
              <button
                key={g.clave}
                type="button"
                onClick={() => setEleccion({ grupo: g.clave, ruta })}
                aria-pressed={abierto}
                className="rounded-lg px-3 py-1.5 text-sm font-semibold"
                style={{
                  backgroundColor: abierto
                    ? "color-mix(in oklab, var(--color-marca-500) 14%, transparent)"
                    : "transparent",
                  color: abierto ? "var(--color-marca-700)" : undefined,
                  opacity: abierto ? 1 : 0.65,
                }}
              >
                {g.titulo}
                {/* Un punto en el grupo donde esta la pagina abierta: al
                    curiosear otro grupo hay que poder ver de donde se vino. */}
                {contieneLaPagina && !abierto && (
                  <>
                    <span
                      aria-hidden="true"
                      className="ml-1.5 inline-block size-1.5 rounded-full align-middle"
                      style={{ backgroundColor: "var(--color-marca-600)" }}
                    />
                    {/* El punto es color: sin texto no existe para quien usa
                        lector de pantalla. Va dentro del boton para que forme
                        parte de su nombre accesible. */}
                    <span className="sr-only">
                      (aqui esta la seccion abierta)
                    </span>
                  </>
                )}
              </button>
            );
          })}
        </div>
      )}

      <ul
        className="flex flex-wrap gap-1 border-b"
        style={{ borderColor: "var(--borde)" }}
      >
        {visibles.map((p) => {
          const activa = esActiva(p.href);
          const Icono = ICONOS[p.clave];

          return (
            <li key={p.href}>
              <Link
                href={p.href}
                aria-current={activa ? "page" : undefined}
                className="-mb-px flex items-center gap-2 border-b-2 px-3 py-2.5 text-sm font-medium whitespace-nowrap"
                style={{
                  borderColor: activa
                    ? "var(--color-marca-600)"
                    : "transparent",
                  opacity: activa ? 1 : 0.65,
                }}
              >
                <Icono className="size-4 shrink-0" aria-hidden="true" />
                {p.etiqueta}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
