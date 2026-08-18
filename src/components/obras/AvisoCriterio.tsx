import Link from "next/link";
import { ArrowRight, TriangleAlert } from "lucide-react";

/**
 * El paso que falta antes de seguir con la obra, con su boton.
 *
 * Se pinta ARRIBA de todo el contenido de la obra y en todas sus pantallas,
 * porque no es un aviso de una seccion: es una decision que condiciona como se
 * lee el dinero en todas ellas.
 *
 * Lleva boton y no solo texto. El panel de empresa ya aprendio esta leccion
 * —«un aviso que no dice donde se arregla obliga a buscarlo, y entonces se
 * ignora»— y dentro de la obra no habia ningun equivalente: al abrir una obra
 * se cae directamente en el presupuesto, sin nada que diga que toca ahora.
 */
export function AvisoCriterio({ obraId }: { obraId: string }) {
  return (
    <div
      className="flex flex-wrap items-center justify-between gap-3 rounded-lg px-4 py-3 text-sm print:hidden"
      style={{
        backgroundColor:
          "color-mix(in oklab, var(--color-peligro) 15%, transparent)",
      }}
    >
      <p className="flex items-start gap-2">
        <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
        <span>
          <strong>Falta decidir una cosa antes de seguir:</strong> si los gastos
          generales cuentan en la bolsa de esta obra. Hasta que lo elijas, el
          margen que se calcule no sería fiable.
        </span>
      </p>

      <Link
        href={`/obras/${obraId}/criterio`}
        className="inline-flex shrink-0 items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-white"
        style={{ backgroundColor: "var(--color-marca-600)" }}
      >
        Decidir ahora
        <ArrowRight className="size-4" aria-hidden="true" />
      </Link>
    </div>
  );
}
