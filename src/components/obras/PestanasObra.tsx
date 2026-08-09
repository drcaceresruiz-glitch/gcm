"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ArrowLeftRight,
  CalendarClock,
  ClipboardList,
  FileClock,
  Handshake,
  Table2,
  Truck,
} from "lucide-react";

/**
 * Las secciones de una obra.
 *
 * Existian como botones en la portada de la obra, asi que para ir de las
 * ordenes a los movimientos habia que volver primero. Al vivir en el layout
 * se quedan puestas en todas las subrutas.
 */

const ICONOS = {
  presupuesto: Table2,
  cronograma: CalendarClock,
  planSemanal: ClipboardList,
  revisiones: FileClock,
  movimientos: ArrowLeftRight,
  proveedores: Handshake,
  ordenes: Truck,
} as const;

export interface Pestana {
  href: string;
  etiqueta: string;
  clave: keyof typeof ICONOS;
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

  return (
    <nav
      aria-label="Secciones de la obra"
      // Se desplaza en horizontal en lugar de partirse en dos filas: con
      // cuatro pestanas cabe, pero el roadmap trae cronograma, avance,
      // indicadores y reportes, y una cabecera de tres filas en un movil se
      // come la pantalla antes de empezar a leer.
      className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0"
    >
      <ul
        className="flex min-w-max gap-1 border-b"
        style={{ borderColor: "var(--borde)" }}
      >
        {pestanas.map((p) => {
          // La portada solo esta activa en su ruta exacta; las demas, tambien
          // en lo que cuelga de ellas, para que `/ordenes/nueva` mantenga
          // Ordenes marcada.
          const activa =
            p.href === raiz ? ruta === raiz : ruta.startsWith(p.href);

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
