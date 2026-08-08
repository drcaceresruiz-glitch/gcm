import { FileText, SearchX } from "lucide-react";
import type { OrdenResumen } from "@/services/ordenes.service";
import { TarjetaOrden } from "@/components/ordenes/TarjetaOrden";

/**
 * Las ordenes de la obra, de la mas reciente a la mas antigua POR FECHA.
 *
 * No por numero: el correlativo de las ordenes reales no es cronologico —hay
 * una de mayo con el 00121, posterior a una de julio con el 00113— y ordenar
 * por el mentiria sobre la secuencia.
 */

interface Props {
  ordenes: OrdenResumen[];
  obraId: string;
  puedeAprobar: boolean;
  puedeAnular: boolean;
  puedeEliminar: boolean;
  /// true cuando hay algun filtro puesto. Cambia el vacio: no es lo mismo
  /// «esta obra no tiene ordenes» que «ninguna coincide con la busqueda».
  filtrado: boolean;
}

export function HistorialOrdenes({
  ordenes,
  obraId,
  puedeAprobar,
  puedeAnular,
  puedeEliminar,
  filtrado,
}: Props) {
  if (ordenes.length === 0) {
    return filtrado ? (
      <div
        className="rounded-xl border border-dashed p-10 text-center"
        style={{ borderColor: "var(--borde)" }}
      >
        <SearchX className="mx-auto size-8 opacity-40" aria-hidden="true" />
        <p className="mt-3 text-sm opacity-70">
          Ninguna orden coincide con los filtros.
        </p>
      </div>
    ) : (
      <div
        className="rounded-xl border border-dashed p-10 text-center"
        style={{ borderColor: "var(--borde)" }}
      >
        <FileText className="mx-auto size-8 opacity-40" aria-hidden="true" />
        <p className="mt-3 text-sm opacity-70">
          Esta obra no tiene ordenes registradas.
        </p>
        <p className="mx-auto mt-1 max-w-lg text-sm text-pretty opacity-60">
          Una orden reparte su importe entre las partidas a las que carga, y
          al aprobarse pasa a contar como comprometido contra ellas.
        </p>
      </div>
    );
  }

  return (
    <ul className="space-y-4">
      {ordenes.map((o) => (
        <li key={o.id}>
          <TarjetaOrden
            orden={o}
            obraId={obraId}
            puedeAprobar={puedeAprobar}
            puedeAnular={puedeAnular}
            puedeEliminar={puedeEliminar}
          />
        </li>
      ))}
    </ul>
  );
}
