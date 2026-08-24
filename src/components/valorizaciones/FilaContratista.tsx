"use client";

import { useState, useTransition } from "react";
import { CalendarClock, Paperclip } from "lucide-react";
import { Chip } from "@/components/ui/Chip";
import { Nota } from "@/components/ui/Nota";
import { fechaCorta } from "@/utils/fechas";
import { soles } from "@/utils/formato";
import {
  accionFijarCadencia,
  accionRegistrarPago,
} from "@/app/(dashboard)/obras/[id]/valorizaciones/acciones";
import type { FilaValorizacion } from "@/services/pagos.service";
import { esCero, restar } from "@/lib/decimal";
import { useMotivoSinEscritura } from "@/components/obras/EscrituraDeLaObra";

/**
 * Un contratista en el panel de valorizaciones.
 *
 * Las TRES cifras van juntas y rotuladas, nunca sueltas: el monto contratado
 * es SU precio —no el presupuesto de la obra—, el valorizado es lo que ha
 * avanzado y el pagado es lo que ya salio de caja. Vistas por separado
 * cualquiera de las tres se confunde con «el costo de la partida».
 */
export function FilaContratista({
  obraId,
  fila,
  puedeGestionar,
  hoyISO,
}: {
  obraId: string;
  fila: FilaValorizacion;
  puedeGestionar: boolean;
  hoyISO: string;
}) {
  const [abierto, setAbierto] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hecho, setHecho] = useState<string | null>(null);
  const [pendiente, iniciar] = useTransition();

  /**
   * Si el contrato se movio despues de firmarse. Ver abajo.
   *
   * SE COMPARA RESTANDO, no con `!==`. Estaba con `!==` y por eso la pantalla
   * ensenaba «Contratado 92.000 / Vigente 92.000» en encargos SIN ninguna
   * adenda, contra lo que dice su propio comentario de tres lineas mas abajo.
   *
   * Los dos numeros son la misma plata escrita distinto: `montoVigente` sale
   * de `sumar()`, que normaliza a dos decimales, y `montoContratado` viene
   * crudo del `Decimal` de Prisma, que se come los ceros del final. «92000»
   * y «92000.00» son textos distintos y el mismo dinero.
   *
   * Es la regla numero uno del proyecto: el dinero se compara con
   * `esCero(restar(a, b))`, nunca por igualdad de su representacion.
   */
  const conAdendas = !esCero(restar(fila.montoVigente, fila.montoContratado) ?? "0");

  const adelantado = fila.porPagar.trim().startsWith("-");

  /*
   * En una obra cerrada no se registra un pago ni se cambia la cadencia. Es
   * la misma regla que ya aplica `registrarPago` en el servidor, y sin
   * opciones porque el servicio tampoco las pasa.
   *
   * Sin cartel en cada fila: lo pone una sola vez la pantalla, arriba.
   */
  const sePuedeEscribir = useMotivoSinEscritura() === null;

  function pagar(datos: FormData) {
    setError(null);
    setHecho(null);
    iniciar(async () => {
      const r = await accionRegistrarPago(obraId, fila.encargoId, datos);
      if (r.ok) {
        setAbierto(false);
        setHecho("Pago registrado.");
      } else {
        setError(r.error);
      }
    });
  }

  function cadencia(datos: FormData) {
    setError(null);
    setHecho(null);
    const crudo = String(datos.get("dias") ?? "").trim();
    // Vacio = quitar el override y volver a heredar la obra.
    const dias = crudo === "" ? null : Number(crudo);

    iniciar(async () => {
      const r = await accionFijarCadencia(obraId, fila.encargoId, dias);
      if (r.ok) setHecho("Cadencia guardada.");
      else setError(r.error);
    });
  }

  return (
    <li className="space-y-3 py-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium">
            E-{String(fila.numero).padStart(3, "0")} · {fila.contratista}
          </p>
          <p className="truncate text-xs opacity-70">{fila.descripcion}</p>
        </div>

        {fila.cadencia.vencida ? (
          <Chip tono="peligro" icono={CalendarClock}>
            Valorización pendiente ·{" "}
            {fila.cadencia.diasDeRetraso === 1
              ? "1 día"
              : `${fila.cadencia.diasDeRetraso} días`}
          </Chip>
        ) : fila.cadencia.proxima ? (
          <Chip tono="neutro" icono={CalendarClock}>
            Próxima: {fechaCorta(fila.cadencia.proxima)}
          </Chip>
        ) : (
          <Chip tono="exito">Sin fechas pendientes</Chip>
        )}
      </div>

      {/* Las cifras, rotuladas. «Contratado» dice SU PRECIO en el propio
          rotulo: es la confusion que mas cuesta en esta pantalla. */}
      <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs sm:grid-cols-4">
        <div>
          <dt className="opacity-60">
            {conAdendas ? "Contratado (al firmar)" : "Contratado (su precio)"}
          </dt>
          <dd className="font-medium">{soles(fila.montoContratado)}</dd>
        </div>
        {/*
          El VIGENTE solo aparece si difiere: enseñar dos veces la misma cifra
          -«contratado 50.000 / vigente 50.000»- es ruido en una tabla que ya
          tiene cuatro columnas. Cuando difiere hay que verlo, porque es lo
          que de verdad se le paga y lo que explica que el valorizado pase del
          contrato original.
        */}
        {conAdendas && (
          <div>
            <dt className="opacity-60">Vigente (con adendas)</dt>
            <dd className="font-medium">{soles(fila.montoVigente)}</dd>
          </div>
        )}
        <div>
          <dt className="opacity-60">Valorizado ({fila.porcentaje}%)</dt>
          <dd className="font-medium">{soles(fila.valorizado)}</dd>
        </div>
        <div>
          <dt className="opacity-60">Pagado</dt>
          <dd className="font-medium">{soles(fila.pagado)}</dd>
        </div>
        {/* Un «por pagar» NEGATIVO no es un error: es que se pago por
            adelantado, que en obra pasa constantemente. Se dice con palabras
            porque «-S/ 12,500.75» se lee como una deuda al reves. */}
        <div>
          <dt className="opacity-60">
            {adelantado ? "Pagado por adelantado" : "Por pagar"}
          </dt>
          <dd className="font-medium">
            {soles(adelantado ? fila.porPagar.replace("-", "") : fila.porPagar)}
          </dd>
        </div>
      </dl>

      <p className="text-xs opacity-60">
        {fila.etiquetaCadencia}
        {fila.ultimaValorizacion
          ? ` · última valorización ${fechaCorta(fila.ultimaValorizacion)}`
          : " · sin valorizar todavía"}
      </p>

      {error && <Nota tono="peligro">{error}</Nota>}
      {hecho && <Nota tono="exito">{hecho}</Nota>}

      {puedeGestionar && sePuedeEscribir && (
        <div className="flex flex-wrap items-end gap-4">
          <button
            type="button"
            onClick={() => setAbierto((v) => !v)}
            className="rounded-lg border px-3 py-1.5 text-xs"
            style={{ borderColor: "var(--borde)" }}
          >
            {abierto ? "Cancelar" : "Registrar pago"}
          </button>

          {/* La cadencia propia vive AQUI, al lado del contratista, y no en
              una pantalla de ajustes: es un dato suyo, y separarlo obligaria
              a recordar de quien se estaba hablando. */}
          <form action={cadencia} className="flex items-end gap-2">
            <label className="text-xs">
              <span className="block opacity-60">Cada N días</span>
              <input
                name="dias"
                type="number"
                min={1}
                max={365}
                defaultValue={fila.heredaCadencia ? "" : undefined}
                placeholder="hereda la obra"
                className="mt-0.5 w-32 rounded-lg border px-2 py-1"
                style={{ borderColor: "var(--borde)" }}
              />
            </label>
            <button
              type="submit"
              disabled={pendiente}
              className="rounded-lg border px-3 py-1.5 text-xs disabled:opacity-50"
              style={{ borderColor: "var(--borde)" }}
            >
              Guardar cadencia
            </button>
          </form>
        </div>
      )}

      {abierto && puedeGestionar && sePuedeEscribir && (
        <form
          action={pagar}
          className="grid gap-3 rounded-lg border p-3 sm:grid-cols-2"
          style={{ borderColor: "var(--borde)" }}
        >
          <label className="text-xs">
            <span className="block opacity-60">Monto pagado</span>
            <input
              name="monto"
              required
              inputMode="decimal"
              className="mt-0.5 w-full rounded-lg border px-2 py-1"
              style={{ borderColor: "var(--borde)" }}
            />
          </label>

          <label className="text-xs">
            <span className="block opacity-60">Fecha del pago</span>
            <input
              name="fecha"
              type="date"
              required
              max={hoyISO}
              defaultValue={hoyISO}
              className="mt-0.5 w-full rounded-lg border px-2 py-1"
              style={{ borderColor: "var(--borde)" }}
            />
          </label>

          <label className="text-xs sm:col-span-2">
            <span className="block opacity-60">Nota (opcional)</span>
            <input
              name="nota"
              className="mt-0.5 w-full rounded-lg border px-2 py-1"
              style={{ borderColor: "var(--borde)" }}
            />
          </label>

          <label className="text-xs sm:col-span-2">
            <span className="flex items-center gap-1.5 opacity-60">
              <Paperclip className="size-3.5" aria-hidden="true" />
              Comprobante: PDF o imagen, hasta 8 MB
            </span>
            <input
              name="comprobante"
              type="file"
              accept="application/pdf,image/jpeg,image/png,image/webp"
              className="mt-0.5 w-full text-xs"
            />
          </label>

          <div className="sm:col-span-2">
            <button
              type="submit"
              disabled={pendiente}
              className="rounded-lg px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
              style={{ backgroundColor: "var(--color-marca-600)" }}
            >
              {pendiente ? "Registrando…" : "Registrar el pago"}
            </button>
            <p className="mt-1.5 text-xs opacity-60">
              Un pago no se edita después: queda como registro. Si el importe
              sale mal, se registra el ajuste.
            </p>
          </div>
        </form>
      )}
    </li>
  );
}
