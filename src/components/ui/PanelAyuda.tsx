import { Info } from "lucide-react";

/**
 * Columna de ayuda que acompana a un formulario de alta.
 *
 * Explica las decisiones que el formulario pide tomar, que es lo unico que
 * tiene sentido poner al lado de una pantalla donde todavia no hay nada que
 * medir. Nada de cifras de relleno: en un alta no existen.
 *
 * Es `aside` y no `section` porque acompana al formulario, no es contenido de
 * la pagina por derecho propio: un lector de pantalla lo anuncia como tal.
 */

export interface PuntoAyuda {
  titulo: string;
  texto: string;
}

export function PanelAyuda({
  puntos,
  ilustracion,
}: {
  puntos: PuntoAyuda[];
  ilustracion?: React.ReactNode;
}) {
  return (
    <aside
      aria-label="Ayuda"
      className="rounded-xl border p-5 print:hidden"
      style={{
        borderColor: "var(--borde)",
        // Un tono de marca muy diluido en vez de blanco: asi se distingue del
        // formulario y se lee como apoyo, no como otro bloque que rellenar.
        backgroundColor:
          "color-mix(in oklab, var(--color-marca-500) 6%, var(--superficie))",
      }}
    >
      {ilustracion && <div className="mb-5">{ilustracion}</div>}

      <h2 className="flex items-center gap-2 text-sm font-semibold">
        <Info className="size-4 shrink-0" aria-hidden="true" />
        Antes de empezar
      </h2>

      <dl className="mt-4 space-y-4">
        {puntos.map((p) => (
          <div key={p.titulo}>
            <dt className="text-sm font-medium">{p.titulo}</dt>
            <dd className="mt-0.5 text-sm text-pretty opacity-70">{p.texto}</dd>
          </div>
        ))}
      </dl>
    </aside>
  );
}
