import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { POR_PAGINA } from "@/lib/paginacion";

/**
 * Paginacion de una lista.
 *
 * La pagina viaja en la URL para que el enlace se pueda compartir y para que
 * recargar no devuelva a la primera. Los demas parametros vigentes
 * —`?todos=1`, los avisos de `?creada=`— se arrastran: perderlos al pasar de
 * pagina reiniciaria el filtro que el usuario acaba de poner.
 */

interface Props {
  pagina: number;
  totalPaginas: number;
  total: number;
  porPagina?: number;
  /// Que se esta contando, en plural: «ordenes», «proveedores».
  etiqueta: string;
  /// El resto de la query. Se admite `undefined` para poder pasar
  /// directamente los `searchParams` de la pagina sin limpiarlos antes.
  params?: Record<string, string | undefined>;
}

export function Paginacion({
  pagina,
  totalPaginas,
  total,
  porPagina = POR_PAGINA,
  etiqueta,
  params = {},
}: Props) {
  // Con una sola pagina no hay nada que decidir, y el rotulo de «1 de 1»
  // solo anade ruido a una lista corta.
  if (totalPaginas <= 1) return null;

  const desde = (pagina - 1) * porPagina + 1;
  const hasta = Math.min(pagina * porPagina, total);

  function href(destino: number): string {
    const query = new URLSearchParams();

    for (const [clave, valor] of Object.entries(params)) {
      if (clave !== "p" && valor !== undefined) query.set(clave, valor);
    }

    query.set("p", String(destino));
    return `?${query.toString()}`;
  }

  return (
    <nav
      aria-label={`Paginacion de ${etiqueta}`}
      className="flex flex-wrap items-center justify-between gap-3 print:hidden"
    >
      <p className="text-sm opacity-70 tabular-nums">
        {desde}&ndash;{hasta} de {total} {etiqueta}
      </p>

      <div className="flex items-center gap-2">
        <Salto
          href={href(pagina - 1)}
          activo={pagina > 1}
          etiqueta="Pagina anterior"
        >
          <ChevronLeft className="size-4" aria-hidden="true" />
          <span className="hidden sm:inline">Anterior</span>
        </Salto>

        <span className="text-sm opacity-70 tabular-nums" aria-current="page">
          {pagina} de {totalPaginas}
        </span>

        <Salto
          href={href(pagina + 1)}
          activo={pagina < totalPaginas}
          etiqueta="Pagina siguiente"
        >
          <span className="hidden sm:inline">Siguiente</span>
          <ChevronRight className="size-4" aria-hidden="true" />
        </Salto>
      </div>
    </nav>
  );
}

/**
 * En los extremos se pinta un `span` y no un enlace desactivado: un `<a>` sin
 * destino sigue recibiendo el foco del teclado y no lleva a ninguna parte.
 */
function Salto({
  href,
  activo,
  etiqueta,
  children,
}: {
  href: string;
  activo: boolean;
  etiqueta: string;
  children: React.ReactNode;
}) {
  const clases =
    "inline-flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-sm";

  if (!activo) {
    return (
      <span
        aria-hidden="true"
        className={`${clases} opacity-35`}
        style={{ borderColor: "var(--borde)" }}
      >
        {children}
      </span>
    );
  }

  return (
    <Link
      href={href}
      aria-label={etiqueta}
      className={clases}
      style={{ borderColor: "var(--borde)" }}
    >
      {children}
    </Link>
  );
}
