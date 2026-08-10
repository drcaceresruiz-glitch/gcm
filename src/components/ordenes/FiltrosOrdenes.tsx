"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Search, X } from "lucide-react";

/**
 * Filtros del historial de ordenes.
 *
 * Todo vive en la URL y nada en estado de cliente: asi el filtro sobrevive a
 * cambiar de pagina, el enlace se puede compartir y recargar no lo pierde. La
 * pantalla es de servidor y lee estos mismos parametros, de modo que no hay
 * dos copias del filtro que puedan discrepar.
 */

interface Props {
  proveedores: { id: string; razonSocial: string }[];
}

const ESTADOS = [
  { valor: "BORRADOR", etiqueta: "Borrador" },
  { valor: "APROBADA", etiqueta: "Aprobada" },
  { valor: "ANULADA", etiqueta: "Anulada" },
] as const;

export function FiltrosOrdenes({ proveedores }: Props) {
  const router = useRouter();
  const params = useSearchParams();

  const valor = (clave: string) => params.get(clave) ?? "";

  const hayFiltro = ["q", "proveedor", "desde", "hasta", "estado"].some((c) =>
    params.get(c),
  );

  function aplicar(clave: string, nuevo: string) {
    const query = new URLSearchParams(params.toString());

    if (nuevo) query.set(clave, nuevo);
    else query.delete(clave);

    // Se vuelve a la pagina 1: la 3 del listado sin filtrar casi nunca existe
    // despues de filtrar, y quedaria una lista vacia que parece un error.
    query.delete("p");

    // Los avisos de un solo uso no deben reaparecer al tocar un filtro.
    for (const aviso of ["creada", "aprobada", "anulada", "eliminada"]) {
      query.delete(aviso);
    }

    router.push(`?${query.toString()}`);
  }

  function limpiar() {
    router.push("?");
  }

  return (
    <div
      className="rounded-xl border p-3"
      style={{ borderColor: "var(--borde)" }}
    >
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-56 flex-1">
          <label htmlFor="filtro-q" className="mb-1 block text-xs opacity-70">
            Buscar
          </label>
          <div className="relative">
            <Search
              className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 opacity-50"
              aria-hidden="true"
            />
            <input
              id="filtro-q"
              type="text"
              defaultValue={valor("q")}
              placeholder="Número, descripción o referencia"
              // Al soltar Enter o salir del campo, no en cada tecla: cada
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

        <Campo etiqueta="Proveedor" id="filtro-proveedor">
          <select
            id="filtro-proveedor"
            value={valor("proveedor")}
            onChange={(e) => aplicar("proveedor", e.target.value)}
            className="rounded-lg border px-2 py-1.5 text-sm"
            style={{
              borderColor: "var(--borde)",
              backgroundColor: "var(--fondo)",
            }}
          >
            <option value="">Todos</option>
            {proveedores.map((p) => (
              <option key={p.id} value={p.id}>
                {p.razonSocial}
              </option>
            ))}
          </select>
        </Campo>

        <Campo etiqueta="Desde" id="filtro-desde">
          <input
            id="filtro-desde"
            type="date"
            value={valor("desde")}
            onChange={(e) => aplicar("desde", e.target.value)}
            className="rounded-lg border px-2 py-1.5 text-sm"
            style={{
              borderColor: "var(--borde)",
              backgroundColor: "var(--fondo)",
            }}
          />
        </Campo>

        <Campo etiqueta="Hasta" id="filtro-hasta">
          <input
            id="filtro-hasta"
            type="date"
            value={valor("hasta")}
            onChange={(e) => aplicar("hasta", e.target.value)}
            className="rounded-lg border px-2 py-1.5 text-sm"
            style={{
              borderColor: "var(--borde)",
              backgroundColor: "var(--fondo)",
            }}
          />
        </Campo>

        <Campo etiqueta="Estado" id="filtro-estado">
          <select
            id="filtro-estado"
            value={valor("estado")}
            onChange={(e) => aplicar("estado", e.target.value)}
            className="rounded-lg border px-2 py-1.5 text-sm"
            style={{
              borderColor: "var(--borde)",
              backgroundColor: "var(--fondo)",
            }}
          >
            <option value="">Todos</option>
            {ESTADOS.map((e) => (
              <option key={e.valor} value={e.valor}>
                {e.etiqueta}
              </option>
            ))}
          </select>
        </Campo>

        {hayFiltro && (
          <button
            type="button"
            onClick={limpiar}
            className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm"
            style={{ borderColor: "var(--borde)" }}
          >
            <X className="size-3.5" aria-hidden="true" />
            Limpiar
          </button>
        )}
      </div>
    </div>
  );
}

function Campo({
  etiqueta,
  id,
  children,
}: {
  etiqueta: string;
  id: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-xs opacity-70">
        {etiqueta}
      </label>
      {children}
    </div>
  );
}
