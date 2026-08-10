"use client";

import { Search, SlidersHorizontal, X } from "lucide-react";
import { MenuDesplegable } from "@/components/ui/MenuDesplegable";
import type { ClaveColumna } from "@/components/partidas/columnas";
import { COLUMNAS } from "@/components/partidas/columnas";

/**
 * La barra de la tabla del presupuesto: buscar y elegir columnas.
 *
 * Se separa de `TablaPartidas` porque esa ya lleva el arbol, la edicion en
 * linea y el borrado; meterle ademas la barra la volvia ilegible.
 */

interface Props {
  consulta: string;
  onConsulta: (valor: string) => void;
  /**
   * Cuantas filas coinciden, o null si no hay busqueda.
   *
   * Se ensena el numero a secas y no «N de M»: el arbol tiene 348 filas
   * porque cuenta los capitulos, y la tarjeta de arriba dice «314 partidas».
   * Dos totales distintos para lo mismo en la misma pantalla obligan a
   * averiguar cual miente.
   */
  recuento: number | null;
  ocultas: Set<ClaveColumna>;
  onAlternarColumna: (clave: ClaveColumna) => void;
  todosColapsados: boolean;
  onAlternarTodos: () => void;
}

export function ControlesPartidas({
  consulta,
  onConsulta,
  recuento,
  ocultas,
  onAlternarColumna,
  todosColapsados,
  onAlternarTodos,
}: Props) {
  const opcionales = COLUMNAS.filter((c) => !c.fija);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="relative min-w-56 flex-1">
        <Search
          className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 opacity-50"
          aria-hidden="true"
        />
        {/* `text` y no `search`: con `search` el navegador pinta su propia
            aspa dentro del campo y quedan dos, la suya y la de al lado. */}
        <input
          type="text"
          value={consulta}
          onChange={(e) => onConsulta(e.target.value)}
          placeholder="Buscar por código o descripción"
          aria-label="Buscar en el presupuesto"
          className="w-full rounded-lg border py-1.5 pr-8 pl-8 text-sm"
          style={{
            borderColor: "var(--borde)",
            backgroundColor: "var(--fondo)",
          }}
        />
        {consulta !== "" && (
          <button
            type="button"
            onClick={() => onConsulta("")}
            aria-label="Limpiar la búsqueda"
            className="absolute top-1/2 right-2 -translate-y-1/2 rounded p-0.5 opacity-60 hover:opacity-100"
          >
            <X className="size-3.5" aria-hidden="true" />
          </button>
        )}
      </div>

      {recuento !== null && (
        <p className="text-sm whitespace-nowrap opacity-70" role="status">
          <span className="tabular-nums">{recuento}</span>
          {recuento === 1 ? " coincidencia" : " coincidencias"}
        </p>
      )}

      {/* Contraer capitulos no significa nada mientras se filtra: ahi manda
          la busqueda y el arbol se despliega solo. */}
      {recuento === null && (
        <button
          type="button"
          onClick={onAlternarTodos}
          className="rounded-lg border px-3 py-1.5 text-sm"
          style={{ borderColor: "var(--borde)" }}
        >
          {todosColapsados ? "Expandir todo" : "Contraer todo"}
        </button>
      )}

      <MenuDesplegable
        etiqueta="Columnas"
        icono={<SlidersHorizontal className="size-4" aria-hidden="true" />}
      >
        <p className="px-3 py-2 text-xs opacity-60">
          Código, descripción e importe no se ocultan.
        </p>
        {opcionales.map((c) => (
          <label
            key={c.clave}
            className="flex cursor-pointer items-center gap-2.5 px-3 py-2 text-sm hover:bg-[color-mix(in_oklab,var(--borde)_50%,transparent)]"
          >
            <input
              type="checkbox"
              checked={!ocultas.has(c.clave)}
              onChange={() => onAlternarColumna(c.clave)}
            />
            {c.etiqueta}
          </label>
        ))}
      </MenuDesplegable>
    </div>
  );
}
