"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { AlertCircle, Check, LoaderCircle, Plus, X } from "lucide-react";

import {
  accionResolverDeduccion,
  accionSolicitarDeduccion,
  type EstadoDeduccionUI,
} from "@/app/(dashboard)/obras/[id]/meta/acciones-deducciones";
import type { DeduccionFila } from "@/services/deducciones.service";
import type { ResumenDeducciones } from "@/lib/deducciones";
import { soles } from "@/utils/formato";

/**
 * Deducir un costo propio de la meta congelada, con sus dos firmas.
 *
 * PEDIDO ASI: «que el residente y/o el administrador de la obra pueda
 * solicitar deducir monto de los gastos generales, se le presenta al gerente
 * general y si este lo aprueba perfecto, se hacen todos los ajustes».
 *
 * LA META NO SE TOCA, Y LA PANTALLA LO ENSEÑA. Cada línea dice lo
 * presupuestado, lo ya deducido y lo que queda. Es la misma forma que las
 * adendas -contratado, adendas, vigente- y por el mismo motivo: si la cifra
 * de origen desapareciera, nadie podría saber después si el alquiler siempre
 * valió eso o si se recortó a mitad de obra para cuadrar la bolsa.
 *
 * QUIEN PIDE NO FIRMA, y se ve: quien solo tiene `deduccion:solicitar` ve el
 * formulario y no ve los botones de aprobar. No es una comodidad -el servicio
 * lo rechaza igual-, es que un botón que siempre responde «no tienes permiso»
 * enseña a ignorar los avisos.
 */

export interface LineaPropia {
  id: string;
  descripcion: string;
  /// Lo que la meta presupuestó. Congelado.
  presupuestado: string;
  /// Lo ya deducido y firmado.
  deducido: string;
  /// Lo que queda: presupuestado menos deducido.
  queda: string;
}

function Guardar({ texto, peligro }: { texto: string; peligro?: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
      style={{
        backgroundColor: peligro ? "var(--color-peligro)" : "var(--color-marca-600)",
      }}
    >
      {pending && <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />}
      {texto}
    </button>
  );
}

function Aviso({ estado }: { estado: EstadoDeduccionUI }) {
  if (!estado.error) return null;
  return (
    <p
      className="flex items-start gap-2 rounded-lg p-2 text-sm"
      style={{
        color: "var(--color-peligro)",
        backgroundColor: "color-mix(in oklab, var(--color-peligro) 15%, transparent)",
      }}
    >
      <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      {estado.error}
    </p>
  );
}

const ETIQUETA: Record<string, string> = {
  PENDIENTE: "Pendiente de firma",
  APROBADA: "Aprobada",
  RECHAZADA: "Rechazada",
};

export function PanelDeducciones({
  obraId,
  lineas,
  filas,
  resumen,
  metaAprobada,
  puedeSolicitar,
  puedeAprobar,
}: {
  obraId: string;
  /// Las líneas propias de la meta: de estas y solo de estas se puede deducir.
  lineas: readonly LineaPropia[];
  filas: readonly DeduccionFila[];
  resumen: ResumenDeducciones;
  /// Sobre un borrador no se pide firma: se corrige la meta y ya está.
  metaAprobada: boolean;
  puedeSolicitar: boolean;
  puedeAprobar: boolean;
}) {
  const [abierto, setAbierto] = useState(false);
  const [alta, accionSolicitar] = useActionState(accionSolicitarDeduccion, {});
  const [resolucion, accionResolver] = useActionState(accionResolverDeduccion, {});
  /// Qué deducción se está rechazando: el motivo solo se pide al decir que no.
  const [rechazando, setRechazando] = useState<string | null>(null);

  // Sin líneas propias no hay nada que deducir, y decirlo es más útil que
  // pintar un panel vacío con un botón que no lleva a ningún sitio.
  if (lineas.length === 0) return null;

  const conSaldo = lineas.filter((l) => Number(l.queda) > 0);
  const puedePedir = puedeSolicitar && metaAprobada && conSaldo.length > 0;

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Costos propios de la meta</h2>
          <p className="mt-0.5 max-w-2xl text-sm opacity-70">
            Sueldos, alquileres y pólizas: lo que la obra cuesta sin ser una
            partida. Si se decide gastar menos en alguno, ese dinero vuelve a
            la bolsa — pero lo firma gerencia, no se corrige la meta.
          </p>
        </div>
        {puedePedir && !abierto && (
          <button
            type="button"
            onClick={() => setAbierto(true)}
            className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm"
            style={{ borderColor: "var(--borde)" }}
          >
            <Plus className="size-4" aria-hidden="true" />
            Pedir una deducción
          </button>
        )}
      </div>

      {resumen.pendientes > 0 && (
        <p
          className="rounded-lg p-3 text-sm"
          style={{
            backgroundColor: "color-mix(in oklab, var(--color-alerta) 15%, transparent)",
          }}
        >
          {/* Con el importe dentro: «hay dos pendientes» no mueve a nadie,
              «hay 12.000 esperando tu firma» sí. Y a quien PUEDE firmar se le
              dice que es él y dónde están los botones. */}
          <strong>
            {resumen.pendientes} deducci{resumen.pendientes === 1 ? "ón" : "ones"} por{" "}
            {soles(resumen.importePendiente)}
          </strong>{" "}
          {puedeAprobar ? (
            <>
              {resumen.pendientes === 1 ? "espera tu firma" : "esperan tu firma"}.
              Cada una tiene su botón <strong>Aprobar</strong> aquí abajo.
            </>
          ) : (
            <>
              {resumen.pendientes === 1 ? "espera" : "esperan"} la firma de
              gerencia.
            </>
          )}{" "}
          Todavía no cuenta{resumen.pendientes === 1 ? "" : "n"} en la bolsa.
        </p>
      )}

      {/* Línea a línea: presupuestado, deducido y lo que queda. Las tres
          juntas, como en las adendas del contratista. */}
      <div
        className="overflow-x-auto rounded-xl border"
        style={{ borderColor: "var(--borde)" }}
      >
        <table className="w-full min-w-[34rem] text-sm">
          <thead>
            <tr
              className="border-b text-left"
              style={{ borderColor: "var(--borde)" }}
            >
              <th className="px-4 py-3 font-medium">Costo propio</th>
              <th className="px-4 py-3 text-right font-medium">Presupuestado</th>
              <th className="px-4 py-3 text-right font-medium">Deducido</th>
              <th className="px-4 py-3 text-right font-medium">Queda</th>
            </tr>
          </thead>
          <tbody>
            {lineas.map((l) => (
              <tr
                key={l.id}
                className="border-b last:border-0"
                style={{ borderColor: "var(--borde)" }}
              >
                <td className="px-4 py-2.5">{l.descripcion}</td>
                <td className="px-4 py-2.5 text-right tabular-nums opacity-70">
                  {soles(l.presupuestado)}
                </td>
                <td
                  className="px-4 py-2.5 text-right tabular-nums"
                  style={
                    Number(l.deducido) > 0
                      ? { color: "var(--color-exito)" }
                      : undefined
                  }
                >
                  {Number(l.deducido) > 0 ? `−${soles(l.deducido)}` : "—"}
                </td>
                <td className="px-4 py-2.5 text-right font-medium tabular-nums">
                  {soles(l.queda)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {!metaAprobada && puedeSolicitar && (
        <p className="text-sm opacity-70">
          El presupuesto meta todavía es un borrador: corrige el costo propio
          directamente en la meta. Las deducciones existen para cuando ya está
          congelada y no se puede tocar.
        </p>
      )}

      {abierto && puedePedir && (
        <form
          action={accionSolicitar}
          className="space-y-3 rounded-lg border p-4"
          style={{ borderColor: "var(--borde)" }}
        >
          <input type="hidden" name="obraId" value={obraId} />

          <Aviso estado={alta} />

          <label className="block text-sm">
            <span className="block opacity-70">De qué costo propio</span>
            <select
              name="metaItemId"
              required
              className="mt-1 w-full max-w-md rounded border px-2 py-1"
            >
              {conSaldo.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.descripcion} — quedan {soles(l.queda)}
                </option>
              ))}
            </select>
          </label>

          <label className="block text-sm">
            <span className="block opacity-70">Cuánto se va a dejar de gastar</span>
            <input
              name="importe"
              inputMode="decimal"
              required
              placeholder="8000.00"
              className="mt-1 w-36 rounded border px-2 py-1 text-right tabular-nums"
            />
          </label>

          <label className="block text-sm">
            <span className="block opacity-70">
              Qué no se va a gastar, y por qué se puede
            </span>
            <textarea
              name="motivo"
              required
              rows={2}
              placeholder="El andamio se devuelve en octubre y no en diciembre: la fachada se cierra antes."
              className="mt-1 w-full rounded border px-2 py-1"
            />
            {/* Esta frase es la mitad del circuito: una deducción no es
                dinero encontrado, es un compromiso de no gastarlo. */}
            <span className="mt-1 block text-xs opacity-60">
              Alguien tiene que poder comprobar después que de verdad no se
              gastó.
            </span>
          </label>

          <div className="flex items-center gap-2">
            <Guardar texto="Pedir y enviar a firma" />
            <button
              type="button"
              onClick={() => setAbierto(false)}
              className="rounded-lg border px-3 py-1.5 text-sm"
              style={{ borderColor: "var(--borde)" }}
            >
              Cancelar
            </button>
          </div>
        </form>
      )}

      <Aviso estado={resolucion} />

      {filas.length > 0 && (
        <ul className="space-y-2">
          {filas.map((d) => (
            <li
              key={d.id}
              className="rounded-lg border p-3 text-sm"
              style={{ borderColor: "var(--borde)" }}
            >
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="font-medium">
                  Deducción {d.numero} · {d.linea}
                </span>
                <span className="tabular-nums font-semibold">
                  −{soles(d.importe)}
                </span>
              </div>

              <p className="mt-0.5 text-xs opacity-70">
                {ETIQUETA[d.estado]} · la pidió {d.solicitadaPor}
                {d.resueltaPor && <> · firmó {d.resueltaPor}</>}
              </p>

              <p className="mt-1 text-sm opacity-80">{d.motivo}</p>

              {d.motivoRechazo && (
                <p className="mt-1 text-sm" style={{ color: "var(--color-peligro)" }}>
                  Rechazada: {d.motivoRechazo}
                </p>
              )}

              {d.estado === "PENDIENTE" && puedeAprobar && (
                <div className="mt-2 flex flex-wrap items-end gap-2 border-t pt-2">
                  <form action={accionResolver} className="flex items-center gap-2">
                    <input type="hidden" name="obraId" value={obraId} />
                    <input type="hidden" name="deduccionId" value={d.id} />
                    <input type="hidden" name="decision" value="APROBAR" />
                    <Guardar texto="Aprobar" />
                  </form>

                  {rechazando === d.id ? (
                    <form
                      action={accionResolver}
                      className="flex flex-wrap items-end gap-2"
                    >
                      <input type="hidden" name="obraId" value={obraId} />
                      <input type="hidden" name="deduccionId" value={d.id} />
                      <input type="hidden" name="decision" value="RECHAZAR" />
                      <label className="text-sm">
                        <span className="block opacity-70">
                          Motivo del rechazo
                        </span>
                        <input
                          name="motivoRechazo"
                          required
                          placeholder="El andamio se necesita hasta diciembre"
                          className="mt-1 w-72 rounded border px-2 py-1"
                        />
                      </label>
                      <Guardar texto="Rechazar" peligro />
                      <button
                        type="button"
                        onClick={() => setRechazando(null)}
                        className="rounded-lg border px-2 py-1.5 text-sm"
                        style={{ borderColor: "var(--borde)" }}
                      >
                        <X className="size-4" aria-hidden="true" />
                      </button>
                    </form>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setRechazando(d.id)}
                      className="rounded-lg border px-3 py-1.5 text-sm"
                      style={{ borderColor: "var(--borde)" }}
                    >
                      Rechazar
                    </button>
                  )}
                </div>
              )}

              {d.estado === "PENDIENTE" && !puedeAprobar && (
                <p className="mt-1 flex items-center gap-1 text-xs opacity-60">
                  <Check className="size-3" aria-hidden="true" />
                  Esperando la firma de gerencia.
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
