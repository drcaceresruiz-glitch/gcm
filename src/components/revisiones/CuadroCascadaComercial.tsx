import type { CascadaComercial } from "@/lib/presupuesto";
import { esPositivo } from "@/lib/decimal";
import { Linea } from "@/components/revisiones/CuadroCascada";

/**
 * El cuadro de la cascada COMERCIAL, la que se entrega al cliente.
 *
 * Vive aparte de `CuadroCascada` porque el orden es distinto: alli el
 * descuento entra antes de los gastos generales; aqui va despues, sobre el
 * subtotal. Un solo cuadro para las dos obligaria a ordenar segun una bandera
 * y a leerlo con cuidado para saber que esta mirando uno.
 *
 * Las lineas que valen cero no se pintan: un descuento de 0,00 o una retencion
 * que no aplica son ruido que resta claridad a las que si cuentan.
 */
export function CuadroCascadaComercial({
  cascada,
  porcentajes,
}: {
  cascada: CascadaComercial;
  /// Porcentajes ya legibles ("12"), para etiquetar cada linea.
  porcentajes?: { gastosGenerales: string; utilidad: string; descuento: string; igv: string };
}) {
  const hayDescuento = esPositivo(cascada.descuento.replace("-", ""));
  const hayIgv = esPositivo(cascada.igv);
  const hayRetencion = esPositivo(cascada.retencionRenta);

  return (
    <dl className="text-sm">
      <Linea etiqueta="Costo directo" valor={cascada.costoDirecto} />
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
      <Linea etiqueta="Subtotal" valor={cascada.subtotal} separa />

      {hayDescuento && (
        <Linea
          etiqueta="Descuento comercial"
          sufijo={porcentajes && `${porcentajes.descuento} %`}
          valor={cascada.descuento}
        />
      )}

      <Linea etiqueta="Valor de venta" valor={cascada.valorVenta} separa destacado />

      {hayIgv && (
        <Linea
          etiqueta="IGV"
          sufijo={porcentajes && `${porcentajes.igv} %`}
          valor={cascada.igv}
        />
      )}

      <Linea etiqueta="Precio de venta" valor={cascada.precioVenta} fuerte />

      {hayRetencion && (
        <>
          <Linea
            etiqueta="Retención de renta"
            sufijo="8 %"
            valor={cascada.retencionRenta}
            separa
          />
          <Linea etiqueta="Neto a recibir" valor={cascada.netoARecibir} destacado />
        </>
      )}
    </dl>
  );
}
