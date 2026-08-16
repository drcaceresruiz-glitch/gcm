"use client";

import { useState } from "react";

import type { PartidaFila } from "@/services/obras.service";
import { TablaPartidas } from "@/components/partidas/TablaPartidas";
import { NuevaFila, type OpcionCapitulo } from "@/components/partidas/NuevaFila";
import { CerrarHuecos } from "@/components/partidas/CerrarHuecos";

/**
 * La tabla y el alta, juntas, porque tienen que hablarse.
 *
 * Existe por una sola razon: pulsar el «+» de un capitulo tiene que abrir el
 * alta APUNTANDO A ESE CAPITULO. Con la tabla y el formulario como hermanos
 * sueltos bajo una pagina de servidor no hay donde guardar esa eleccion, y la
 * alternativa —pasarla por la URL— obliga a un viaje al servidor para algo que
 * no cambia ningun dato.
 *
 * El componente no sabe nada del presupuesto: solo sostiene a que capitulo se
 * quiere anadir. Todo lo demas sigue viviendo donde vivia.
 */
export function PanelPresupuesto({
  obraId,
  filas,
  editable,
  puedeCrear,
  codigoSugerido,
  capitulos,
  codigosUsados,
}: {
  obraId: string;
  filas: PartidaFila[];
  editable: boolean;
  puedeCrear: boolean;
  codigoSugerido: string;
  capitulos: OpcionCapitulo[];
  codigosUsados: string[];
}) {
  // El sello cambia en cada pulsacion para que pulsar dos veces seguidas el
  // mismo capitulo vuelva a abrir el alta.
  const [pedido, setPedido] = useState<{ capituloId: string; sello: number }>();

  return (
    <div className="space-y-4">
      <TablaPartidas
        obraId={obraId}
        filas={filas}
        editable={editable}
        onAnadirEn={
          puedeCrear && editable
            ? (capituloId) =>
                setPedido((p) => ({ capituloId, sello: (p?.sello ?? 0) + 1 }))
            : undefined
        }
      />

      {puedeCrear && editable && (
        <NuevaFila
          obraId={obraId}
          codigoSugerido={codigoSugerido}
          capitulos={capitulos}
          codigosUsados={codigosUsados}
          pedido={pedido}
        />
      )}

      {/* Debajo del alta y no arriba: se teclea mucho mas de lo que se
          renumera, y renumerar es una operacion de limpieza. */}
      {editable && <CerrarHuecos obraId={obraId} />}
    </div>
  );
}
