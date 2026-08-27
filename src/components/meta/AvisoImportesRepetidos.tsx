import { TriangleAlert } from "lucide-react";

import type { RepetidosDeLaMeta } from "@/lib/repetidos-de-la-meta";
import { soles } from "@/utils/formato";

/**
 * Partidas seguidas que repiten el mismo importe.
 *
 * Es el sintoma de una formula arrastrada en el Excel: se copia una fila hacia
 * abajo sin ajustar las referencias y todas acaban mostrando el importe de la
 * primera. En un presupuesto que llego el 27 de agosto de 2026, cinco partidas
 * de equipamiento repetian 4.200 -una de ellas, 24 unidades a 4.200, con
 * subtotal de 4.200-, y la meta se cargo contando ese dinero cinco veces.
 *
 * EL AVISO NO CORRIGE NADA, y es deliberado: dos partidas pueden costar lo
 * mismo de forma legitima -dos puertas iguales, dos tramos del mismo muro-.
 * Se enseña lo que se ve, se pone cifra a lo que esta en juego, y decide una
 * persona. Corregir por cuenta propia el presupuesto de otro es peor que el
 * error que se intenta evitar.
 *
 * En AMARILLO y no en rojo: no hay nada roto ni nada que impida seguir. Hay
 * algo que mirar antes de congelar la meta.
 */
export function AvisoImportesRepetidos({
  repetidos,
}: {
  repetidos: RepetidosDeLaMeta;
}) {
  if (repetidos.grupos.length === 0) return null;

  const varios = repetidos.grupos.length > 1;

  return (
    <section
      role="alert"
      className="space-y-3 rounded-xl border p-4"
      style={{
        borderColor: "var(--color-alerta)",
        backgroundColor:
          "color-mix(in oklab, var(--color-alerta) 12%, transparent)",
      }}
    >
      <h2 className="flex items-center gap-2 text-sm font-semibold">
        <TriangleAlert className="size-4 shrink-0" aria-hidden="true" />
        {varios
          ? `${repetidos.grupos.length} grupos de partidas seguidas repiten el mismo importe`
          : "Hay partidas seguidas que repiten el mismo importe"}
      </h2>

      <p className="max-w-3xl text-sm text-pretty opacity-80">
        Suele venir de una fórmula arrastrada en el Excel: se copia una fila
        hacia abajo y todas acaban mostrando el importe de la primera. Si es
        eso, la meta está contando{" "}
        <strong>{soles(repetidos.deMasTotal)} de más</strong>. Si de verdad
        cuestan lo mismo, no hay nada que hacer y este aviso desaparece al
        corregir o al aprobar.
      </p>

      <ul className="space-y-2">
        {repetidos.grupos.map((g, i) => (
          <li
            key={i}
            className="rounded-lg px-3 py-2 text-sm"
            style={{ backgroundColor: "var(--superficie)" }}
          >
            <p className="font-medium">
              {g.descripciones.length} partidas a {soles(g.importe)} cada una
              <span className="font-normal opacity-70">
                {" "}
                — sobran {soles(g.deMas)} si fuera un arrastre
              </span>
            </p>
            <p className="mt-0.5 text-xs opacity-70">
              {/* Los codigos si los hay -son lo que ubica la partida en el
                  contrato-; si no, las descripciones, que es lo unico que
                  identifica una linea propia de la meta. */}
              {g.codigos.length > 0
                ? g.codigos.join(" · ")
                : g.descripciones.map((d) => d.slice(0, 40)).join(" · ")}
            </p>
          </li>
        ))}
      </ul>

      <p className="text-sm opacity-80">
        Compruébalo en tu Excel y, si sobra, corrígelo aquí abajo línea a
        línea: no hace falta volver a subir el archivo.
      </p>
    </section>
  );
}
