"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Search, X } from "lucide-react";

/**
 * Buscar en el catalogo por nombre, RUC o telefono, y separar por rol.
 *
 * Calcado de `components/ordenes/FiltrosOrdenes`, y a proposito: es el mismo
 * problema resuelto en la misma aplicacion, y dos buscadores que se comportan
 * distinto en la misma pantalla son un fallo de trato, no una variante.
 *
 * Todo vive en la URL y nada en estado de cliente: el filtro sobrevive a
 * cambiar de pagina, el enlace se puede compartir y recargar no lo pierde. La
 * pantalla es de servidor y lee estos mismos parametros, asi que no hay dos
 * copias del filtro que puedan discrepar.
 */

const ROLES = [
  { valor: "CONTRATISTA", etiqueta: "Contratistas" },
  { valor: "PROVEEDOR", etiqueta: "Proveedores" },
] as const;

export function FiltroProveedores({
  obras,
}: {
  obras: { id: string; nombre: string }[];
}) {
  const router = useRouter();
  const params = useSearchParams();

  const valor = (clave: string) => params.get(clave) ?? "";
  const hayFiltro = ["q", "rol", "obra"].some((c) => params.get(c));

  function aplicar(clave: string, nuevo: string) {
    const query = new URLSearchParams(params.toString());

    if (nuevo) query.set(clave, nuevo);
    else query.delete(clave);

    // A la pagina 1. Buscar desde la pagina 3 dejaria una lista vacia que
    // parece un error, cuando lo que pasa es que el resultado cabe en una.
    query.delete("p");

    // El aviso de «guardado» es de un solo uso: no debe reaparecer al buscar.
    query.delete("guardado");

    router.push(`?${query.toString()}`);
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <label className="relative">
        <span className="sr-only">Buscar contratista o proveedor</span>
        <Search
          className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 opacity-50"
          aria-hidden="true"
        />
        <input
          type="search"
          defaultValue={valor("q")}
          placeholder="Nombre, RUC o teléfono"
          onChange={(e) => aplicar("q", e.target.value)}
          className="w-64 rounded-lg border py-2 pr-3 pl-8 text-sm"
          style={{ borderColor: "var(--borde)", backgroundColor: "var(--fondo)" }}
        />
      </label>

      <select
        value={valor("rol")}
        onChange={(e) => aplicar("rol", e.target.value)}
        aria-label="Filtrar por lo que hace"
        className="rounded-lg border px-3 py-2 text-sm"
        style={{ borderColor: "var(--borde)", backgroundColor: "var(--fondo)" }}
      >
        <option value="">Todos</option>
        {ROLES.map((r) => (
          <option key={r.valor} value={r.valor}>
            {r.etiqueta}
          </option>
        ))}
      </select>

      {/* Elegir obra NO filtra la lista: enciende la columna de contrato. Sin
          obra no se pinta, porque «tiene contrato» solo significa algo
          referido a una obra concreta. */}
      {obras.length > 0 && (
        <select
          value={valor("obra")}
          onChange={(e) => aplicar("obra", e.target.value)}
          aria-label="Ver el estado de contrato en una obra"
          className="rounded-lg border px-3 py-2 text-sm"
          style={{ borderColor: "var(--borde)", backgroundColor: "var(--fondo)" }}
        >
          <option value="">Ver contrato en… (elige obra)</option>
          {obras.map((o) => (
            <option key={o.id} value={o.id}>
              {o.nombre}
            </option>
          ))}
        </select>
      )}

      {hayFiltro && (
        <button
          type="button"
          onClick={() => router.push("?")}
          className="inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-2 text-xs"
          style={{ borderColor: "var(--borde)" }}
        >
          <X className="size-3.5" aria-hidden="true" />
          Quitar filtros
        </button>
      )}
    </div>
  );
}
