"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Search, X } from "lucide-react";
import { ETIQUETA_ESTADO_OBRA, ESTADOS_OBRA } from "@/lib/obras";

/**
 * Buscador y filtro del panel de obras.
 *
 * Con cincuenta obras, paginar solo reparte el problema en cinco paginas:
 * sigue sin poderse encontrar una. Buscar por nombre o codigo y filtrar por
 * estado es lo que responde a «que tengo en ejecucion ahora», y de paso
 * aparta las cerradas sin borrar nada.
 *
 * Como en las ordenes, todo vive en la URL: sobrevive al cambio de pagina, el
 * enlace se puede compartir y no hay estado de cliente que discrepe.
 */
export function FiltrosObras() {
  const router = useRouter();
  const params = useSearchParams();

  const valor = (clave: string) => params.get(clave) ?? "";
  const hayFiltro = ["q", "estado"].some((c) => params.get(c));

  function aplicar(clave: string, nuevo: string) {
    const query = new URLSearchParams(params.toString());

    if (nuevo) query.set(clave, nuevo);
    else query.delete(clave);

    // A la pagina 1: la 3 sin filtrar casi nunca existe despues de filtrar, y
    // quedaria una lista vacia que parece un error.
    query.delete("p");

    router.push(query.toString() ? `?${query.toString()}` : "?");
  }

  return (
    <div
      className="flex flex-wrap items-end gap-3 rounded-xl border p-3"
      style={{ borderColor: "var(--borde)" }}
    >
      <div className="min-w-56 flex-1">
        <label htmlFor="obras-q" className="mb-1 block text-xs opacity-70">
          Buscar
        </label>
        <div className="relative">
          <Search
            className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 opacity-50"
            aria-hidden="true"
          />
          <input
            id="obras-q"
            type="text"
            defaultValue={valor("q")}
            placeholder="Nombre o código de la obra"
            // Al pulsar Enter o al salir del campo, no en cada tecla: cada
            // cambio es una navegacion y una consulta al servidor.
            onKeyDown={(e) => {
              if (e.key === "Enter") aplicar("q", e.currentTarget.value);
            }}
            onBlur={(e) => {
              if (e.currentTarget.value !== valor("q")) {
                aplicar("q", e.currentTarget.value);
              }
            }}
            className="w-full rounded-lg border py-1.5 pr-3 pl-8 text-sm"
            style={{
              borderColor: "var(--borde)",
              backgroundColor: "var(--fondo)",
            }}
          />
        </div>
      </div>

      <div>
        <label htmlFor="obras-estado" className="mb-1 block text-xs opacity-70">
          Estado
        </label>
        <select
          id="obras-estado"
          value={valor("estado")}
          onChange={(e) => aplicar("estado", e.target.value)}
          className="rounded-lg border px-2 py-1.5 text-sm"
          style={{
            borderColor: "var(--borde)",
            backgroundColor: "var(--fondo)",
          }}
        >
          <option value="">Todos</option>
          {ESTADOS_OBRA.map((e) => (
            <option key={e} value={e}>
              {ETIQUETA_ESTADO_OBRA[e]}
            </option>
          ))}
        </select>
      </div>

      {hayFiltro && (
        <button
          type="button"
          onClick={() => router.push("?")}
          className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm"
          style={{ borderColor: "var(--borde)" }}
        >
          <X className="size-3.5" aria-hidden="true" />
          Limpiar
        </button>
      )}
    </div>
  );
}
