import type { Cascada } from "@/lib/presupuesto";
import { esNegativo, esPositivo } from "@/lib/decimal";
import { soles } from "@/utils/formato";

/**
 * El cuadro de resumen final del presupuesto, tal como lo lee el cliente
 * en su Excel.
 *
 * Se respeta el orden y el vocabulario del documento original a proposito:
 * quien revisa esta pantalla tiene el Excel al lado y va comparando linea
 * por linea. Cambiar «Costo directo» por «Subtotal de partidas» obliga a
 * traducir mentalmente en cada revision.
 *
 * La linea destacada es PRESUPUESTO, sin IGV: es la cifra de control. El
 * IGV se muestra debajo porque hay que pagarlo, pero no es costo de obra,
 * es credito fiscal.
 */

interface Porcentajes {
  gastosGenerales: string;
  utilidad: string;
  igv: string;
}

interface Props {
  cascada: Cascada;
  /// Porcentajes ya legibles ("12"), para etiquetar cada linea.
  porcentajes?: Porcentajes;
}

export function CuadroCascada({ cascada, porcentajes }: Props) {
  // Una linea de descuentos en cero es ruido: solo se muestra si hay.
  const hayDescuentos =
    esNegativo(cascada.descuentos) || esPositivo(cascada.descuentos);

  return (
    <dl className="text-sm">
      <Linea etiqueta="Costo directo" valor={cascada.costoDirecto} />

      {hayDescuentos && (
        <Linea etiqueta="Descuentos" valor={cascada.descuentos} />
      )}

      <Linea etiqueta="Subtotal" valor={cascada.subtotal} separa />

      <Linea
        etiqueta="Gastos generales"
        sufijo={porcentajes && `${porcentajes.gastosGenerales} %`}
        valor={cascada.gastosGenerales}
      />
      <Linea
        etiqueta="Utilidad"
        sufijo={porcentajes && `${porcentajes.utilidad} %`}
        valor={cascada.utilidad}
      />

      <Linea
        etiqueta="Presupuesto"
        sufijo="sin IGV"
        valor={cascada.presupuesto}
        destacado
        separa
      />

      <Linea
        etiqueta="IGV"
        sufijo={porcentajes && `${porcentajes.igv} %`}
        valor={cascada.igv}
      />
      <Linea etiqueta="Total general" valor={cascada.totalGeneral} fuerte />
    </dl>
  );
}

interface LineaProps {
  etiqueta: string;
  valor: string;
  /// Matiz a la derecha de la etiqueta: el porcentaje aplicado, «sin IGV».
  sufijo?: string | false;
  /// Abre bloque: separa un total de las lineas que lo componen.
  separa?: boolean;
  /// La cifra de control.
  destacado?: boolean;
  fuerte?: boolean;
}

function Linea({
  etiqueta,
  valor,
  sufijo,
  separa,
  destacado,
  fuerte,
}: LineaProps) {
  return (
    <div
      className={`flex items-baseline justify-between gap-4 px-3 py-2 ${
        separa ? "mt-1 border-t" : ""
      }`}
      style={{
        borderColor: "var(--borde)",
        backgroundColor: destacado
          ? "color-mix(in oklab, var(--color-marca-500) 10%, transparent)"
          : undefined,
      }}
    >
      <dt className={destacado || fuerte ? "font-semibold" : ""}>
        {etiqueta}
        {sufijo && (
          <span className="ml-1.5 text-xs font-normal opacity-60">{sufijo}</span>
        )}
      </dt>
      <dd
        className={`shrink-0 tabular-nums ${
          destacado ? "text-base font-semibold" : fuerte ? "font-semibold" : ""
        }`}
      >
        {soles(valor)}
      </dd>
    </div>
  );
}
