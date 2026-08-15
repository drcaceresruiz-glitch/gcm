"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronRight } from "lucide-react";

import { migasDeRuta } from "@/lib/migas";
import { useEtiquetas } from "@/components/navegacion/EtiquetasContexto";

/**
 * La miga de pan del area privada. Se monta UNA vez, en el layout raiz.
 *
 * GCM no tenia ninguna: la orientacion se sostenia sobre el riel de
 * secciones de la obra —que dice QUE seccion esta abierta, no la cadena que
 * lleva hasta ella— y sobre un «Volver» propio de cada pantalla, que en una
 * ruta de cuatro niveles deja dos flechas de vuelta apuntando a sitios
 * distintos.
 *
 * Con una sola miga no hay nada que orientar —ya lo dice el titulo de la
 * pantalla— y pintarla seria ruido antes que ayuda.
 */
export function Migas() {
  const pathname = usePathname();
  const { etiquetas } = useEtiquetas();
  const migas = migasDeRuta(pathname, etiquetas);

  if (migas.length < 2) return null;

  return (
    <nav aria-label="Ruta" className="border-b print:hidden" style={{ borderColor: "var(--borde)" }}>
      <div className="mx-auto max-w-7xl px-4 py-2 sm:px-6">
        <ol className="flex flex-wrap items-center gap-1 text-sm">
          {migas.map((m, i) => (
            <li key={`${m.texto}-${i}`} className="flex items-center gap-1">
              {i > 0 && (
                <ChevronRight
                  className="size-3.5 shrink-0 opacity-40"
                  aria-hidden="true"
                />
              )}
              {m.href ? (
                <Link
                  href={m.href}
                  className="truncate opacity-70 hover:opacity-100 hover:underline"
                >
                  {m.texto}
                </Link>
              ) : (
                <span aria-current="page" className="truncate font-medium">
                  {m.texto}
                </span>
              )}
            </li>
          ))}
        </ol>
      </div>
    </nav>
  );
}
