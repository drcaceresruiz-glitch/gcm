import Link from "next/link";
import { Ban, FileText, Lock, PenLine, Printer, Truck } from "lucide-react";
import type { OrdenResumen } from "@/services/ordenes.service";
import { soles } from "@/utils/formato";
import { fechaCorta, fechaHora } from "@/utils/fechas";
import { BotonAprobarOrden } from "@/components/ordenes/BotonAprobarOrden";
import { BotonAnularOrden } from "@/components/ordenes/BotonAnularOrden";

/**
 * Las ordenes de la obra, de la mas reciente a la mas antigua POR FECHA.
 *
 * No por numero: el correlativo de las ordenes reales no es cronologico —hay
 * una de mayo con el 00121, posterior a una de julio con el 00113— y ordenar
 * por el mentiria sobre la secuencia.
 */

const ETIQUETA_ESTADO = {
  BORRADOR: "Borrador",
  APROBADA: "Aprobada",
  ANULADA: "Anulada",
} as const;

interface Props {
  ordenes: OrdenResumen[];
  obraId: string;
  puedeAprobar: boolean;
  puedeAnular: boolean;
}

export function HistorialOrdenes({
  ordenes,
  obraId,
  puedeAprobar,
  puedeAnular,
}: Props) {
  return (
    <section>
      <h2 className="mb-3 text-lg font-semibold">Ordenes</h2>

      {ordenes.length === 0 ? (
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
      ) : (
        <ul className="space-y-4">
          {ordenes.map((o) => (
            <li key={o.id}>
              <Tarjeta
                orden={o}
                obraId={obraId}
                puedeAprobar={puedeAprobar}
                puedeAnular={puedeAnular}
              />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function Tarjeta({
  orden: o,
  obraId,
  puedeAprobar,
  puedeAnular,
}: {
  orden: OrdenResumen;
  obraId: string;
  puedeAprobar: boolean;
  puedeAnular: boolean;
}) {
  const anulada = o.estado === "ANULADA";

  return (
    <article
      className="rounded-xl border"
      style={{
        borderColor: "var(--borde)",
        backgroundColor: "var(--superficie)",
        opacity: anulada ? 0.65 : 1,
      }}
    >
      <header
        className="flex flex-wrap items-start justify-between gap-3 border-b px-4 py-3"
        style={{ borderColor: "var(--borde)" }}
      >
        <div className="min-w-0">
          <h3 className="inline-flex items-center gap-2 text-sm font-semibold">
            <Truck className="size-4 shrink-0 opacity-70" aria-hidden="true" />
            {o.numero}
            <span className="font-normal opacity-70">
              · {o.tipo === "COMPRA" ? "Compra" : "Servicio"}
            </span>
          </h3>
          <p className="mt-0.5 text-sm opacity-80">{o.descripcion}</p>
          <p className="mt-0.5 text-xs opacity-60">
            {o.proveedor.razonSocial} · RUC {o.proveedor.ruc} ·{" "}
            {fechaCorta(o.fecha)}
            {o.referencia && ` · ${o.referencia}`}
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-3">
          {/* Se imprime en cualquier estado: un borrador hay que poder
              revisarlo antes de aprobarlo, y el documento lleva su propio
              sello diciendo que todavia no vale. */}
          <Link
            href={`/obras/${obraId}/ordenes/${o.id}/imprimir`}
            className="inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium"
            style={{ borderColor: "var(--borde)" }}
          >
            <Printer className="size-3.5" aria-hidden="true" />
            Imprimir
          </Link>

          <Estado estado={o.estado} />
        </div>
      </header>

      <ul className="divide-y" style={{ borderColor: "var(--borde)" }}>
        {o.imputaciones.map((i) => (
          <li
            key={i.codigoPartida}
            className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-4 py-2 text-sm"
            style={{ borderColor: "var(--borde)" }}
          >
            <span className="min-w-0">
              <span className="font-medium">{i.codigoPartida}</span>
              <span className="ml-2 opacity-70">{i.descripcion}</span>
            </span>
            <span className="shrink-0 font-medium tabular-nums">
              {soles(i.importe)}
            </span>
          </li>
        ))}
      </ul>

      <div className="border-t px-4 py-3" style={{ borderColor: "var(--borde)" }}>
        <dl className="flex flex-wrap gap-x-6 gap-y-1 text-xs">
          <Dato etiqueta="Subtotal" valor={soles(o.subtotal)} />
          {o.descuentoComercial !== "0" && o.descuentoComercial !== "0.00" && (
            <Dato etiqueta="Descuento" valor={soles(o.descuentoComercial)} />
          )}
          <Dato
            etiqueta="Neto"
            valor={soles(o.neto)}
            fuerte={o.tipoImpuesto === "IGV"}
          />
          {o.tipoImpuesto !== "NINGUNO" && (
            <Dato
              etiqueta={o.tipoImpuesto === "IGV" ? "IGV" : "Retencion"}
              valor={soles(o.impuesto)}
            />
          )}
          <Dato
            etiqueta="Total"
            valor={soles(o.total)}
            fuerte={o.tipoImpuesto !== "IGV"}
          />
        </dl>

        <p className="mt-1 text-xs opacity-60">
          {o.tipoImpuesto === "IGV"
            ? `Compromete el neto: ${soles(o.neto)}. El IGV es credito fiscal, no costo de obra.`
            : `Compromete el total: ${soles(o.total)}. La retencion no se recupera, asi que si es costo de obra.`}
          {o.totalLineas > 0 && ` · ${o.totalLineas} lineas de detalle`}
          {o.origen === "IMPORTADO" && " · cargada desde archivo"}
        </p>

        {o.formaPago && (
          <p className="mt-2 text-sm text-pretty opacity-70">
            <span className="font-medium opacity-80">Forma de pago: </span>
            {o.formaPago}
          </p>
        )}

        {anulada ? (
          <p className="mt-2 text-xs opacity-70">
            Anulada{o.anuladaAt && ` el ${fechaHora(o.anuladaAt)}`}.
            {o.motivoAnulado && ` Motivo: ${o.motivoAnulado}`}
          </p>
        ) : o.estado === "APROBADA" ? (
          <div className="mt-2 space-y-2">
            <p className="text-xs opacity-70">
              Aprobada
              {o.aprobadaAt && ` el ${fechaHora(o.aprobadaAt)}`}
              {o.aprobadaPor && ` por ${o.aprobadaPor}`}.
            </p>
            {puedeAnular && (
              <BotonAnularOrden
                obraId={obraId}
                ordenId={o.id}
                numero={o.numero}
                neto={soles(o.neto)}
                aprobada
              />
            )}
          </div>
        ) : (
          (puedeAprobar || puedeAnular) && (
            <div className="mt-3 flex flex-wrap items-start gap-2">
              {puedeAprobar && (
                <BotonAprobarOrden
                  obraId={obraId}
                  ordenId={o.id}
                  numero={o.numero}
                  proveedor={o.proveedor.razonSocial}
                  neto={soles(o.neto)}
                  total={soles(o.total)}
                />
              )}
              {puedeAnular && (
                <BotonAnularOrden
                  obraId={obraId}
                  ordenId={o.id}
                  numero={o.numero}
                  neto={soles(o.neto)}
                />
              )}
            </div>
          )
        )}
      </div>
    </article>
  );
}

function Dato({
  etiqueta,
  valor,
  fuerte,
}: {
  etiqueta: string;
  valor: string;
  fuerte?: boolean;
}) {
  return (
    <div>
      <dt className="inline opacity-60">{etiqueta} </dt>
      <dd className={`inline tabular-nums ${fuerte ? "font-semibold" : ""}`}>
        {valor}
      </dd>
    </div>
  );
}

function Estado({ estado }: { estado: OrdenResumen["estado"] }) {
  const Icono =
    estado === "APROBADA" ? Lock : estado === "ANULADA" ? Ban : PenLine;

  const color =
    estado === "APROBADA"
      ? "var(--color-exito)"
      : estado === "ANULADA"
        ? "var(--color-peligro)"
        : "var(--color-alerta)";

  return (
    <span
      className="inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium"
      style={{
        backgroundColor: `color-mix(in oklab, ${color} 18%, transparent)`,
      }}
    >
      <Icono className="size-3.5" aria-hidden="true" />
      {ETIQUETA_ESTADO[estado]}
    </span>
  );
}
