"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Ban,
  ChevronDown,
  ChevronRight,
  Lock,
  PenLine,
  Printer,
  Truck,
} from "lucide-react";
import type { OrdenResumen } from "@/services/ordenes.service";
import { soles } from "@/utils/formato";
import { fechaCorta, fechaHora } from "@/utils/fechas";
import { Chip, type TonoChip } from "@/components/ui/Chip";
import { BotonAprobarOrden } from "@/components/ordenes/BotonAprobarOrden";
import { BotonAnularOrden } from "@/components/ordenes/BotonAnularOrden";
import { BotonEliminarOrden } from "@/components/ordenes/BotonEliminarOrden";

/**
 * Una orden en el historial.
 *
 * Las ANULADAS nacen plegadas: ya no cuentan para nada y ocupaban lo mismo
 * que una viva, empujando hacia abajo las que si importan. Interesa saber que
 * existieron y por que se anularon —eso queda en la cabecera—, no releerlas
 * enteras. Las demas siguen abiertas, que es como se consultan a diario.
 */

const ETIQUETA_ESTADO = {
  BORRADOR: "Borrador",
  APROBADA: "Aprobada",
  ANULADA: "Anulada",
} as const;

interface Props {
  orden: OrdenResumen;
  obraId: string;
  puedeAprobar: boolean;
  puedeAnular: boolean;
  puedeEliminar: boolean;
}

export function TarjetaOrden({
  orden: o,
  obraId,
  puedeAprobar,
  puedeAnular,
  puedeEliminar,
}: Props) {
  const anulada = o.estado === "ANULADA";
  const [abierta, setAbierta] = useState(!anulada);

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
        className="flex flex-wrap items-start justify-between gap-3 px-4 py-3"
        style={{
          borderColor: "var(--borde)",
          borderBottomWidth: abierta ? 1 : 0,
        }}
      >
        <div className="flex min-w-0 items-start gap-2">
          <button
            type="button"
            onClick={() => setAbierta((previo) => !previo)}
            aria-expanded={abierta}
            aria-label={`${abierta ? "Contraer" : "Desplegar"} la orden ${o.numero}`}
            className="mt-0.5 rounded p-0.5 hover:bg-[color-mix(in_oklab,var(--borde)_60%,transparent)]"
          >
            {abierta ? (
              <ChevronDown className="size-4" aria-hidden="true" />
            ) : (
              <ChevronRight className="size-4" aria-hidden="true" />
            )}
          </button>

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

            {/* Plegada, el motivo es lo unico que hay que poder leer de una
                anulada sin abrirla: es la razon de que siga ahi. */}
            {anulada && !abierta && o.motivoAnulado && (
              <p className="mt-1 text-xs opacity-70">
                Motivo: {o.motivoAnulado}
              </p>
            )}
          </div>
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

      {abierta && (
        <>
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

          <div
            className="border-t px-4 py-3"
            style={{ borderColor: "var(--borde)" }}
          >
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
                  etiqueta={o.tipoImpuesto === "IGV" ? "IGV" : "Retención"}
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
                ? `Compromete el neto: ${soles(o.neto)}. El IGV es crédito fiscal, no costo de obra.`
                : `Compromete el total: ${soles(o.total)}. La retención no se recupera, así que sí es costo de obra.`}
              {o.totalLineas > 0 && ` · ${o.totalLineas} líneas de detalle`}
              {o.origen === "IMPORTADO" && " · cargada desde archivo"}
            </p>

            {o.formaPago && (
              <p className="mt-2 text-sm text-pretty opacity-70">
                <span className="font-medium opacity-80">Forma de pago: </span>
                {o.formaPago}
              </p>
            )}

            {anulada ? (
              <div className="mt-2 space-y-2">
                <p className="text-xs opacity-70">
                  Anulada{o.anuladaAt && ` el ${fechaHora(o.anuladaAt)}`}.
                  {o.motivoAnulado && ` Motivo: ${o.motivoAnulado}`}
                </p>
                {puedeEliminar && (
                  <BotonEliminarOrden
                    obraId={obraId}
                    ordenId={o.id}
                    numero={o.numero}
                    anulada
                  />
                )}
              </div>
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
              (puedeAprobar || puedeAnular || puedeEliminar) && (
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
                  {puedeEliminar && (
                    <BotonEliminarOrden
                      obraId={obraId}
                      ordenId={o.id}
                      numero={o.numero}
                    />
                  )}
                </div>
              )
            )}
          </div>
        </>
      )}
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

  const tono: TonoChip =
    estado === "APROBADA"
      ? "exito"
      : estado === "ANULADA"
        ? "peligro"
        : "alerta";

  return (
    <Chip tono={tono} icono={Icono}>
      {ETIQUETA_ESTADO[estado]}
    </Chip>
  );
}
