"use client";

import { useState, useTransition } from "react";
import { Check, LoaderCircle, TriangleAlert } from "lucide-react";
import { accionCerrarPlanSemanal } from "@/app/(dashboard)/obras/[id]/plan-semanal/acciones";
import {
  CAUSAS_CNC,
  ETIQUETA_CNC,
  construirFilasCierre,
  type CompromisoDeCierre,
  type FilaCierre,
} from "@/lib/plan-semanal";
import {
  BotonEvidencia,
  PanelEvidencia,
} from "@/components/evidencia/PanelEvidencia";
import { accionSubirEvidencia } from "@/app/(dashboard)/obras/[id]/evidencia/acciones";
import type { FotoResumen } from "@/services/evidencia.service";
import type { CausaNoCumplimiento } from "@/generated/prisma/enums";
import { cumplidoPorCantidad, cumplidoAlCerrar } from "@/lib/cierre-cantidad";
import { esPositivo } from "@/lib/decimal";

/**
 * Cerrar la semana: por cada compromiso, cumplido si/no; si no, su causa (CNC)
 * y una nota. Al cerrar sale el PPC. Un no cumplido exige causa —es lo que hace
 * util el cierre—.
 */

/// La fila editable vive en `@/lib/plan-semanal`, con sus pruebas: lo que
/// decide que se conserva al cambiar los compromisos bajo los pies es
/// aritmetica, no interfaz.
type Fila = FilaCierre;

/**
 * Las fotos NO entran en `Fila`: esa es la parte editable, que se manda al
 * cerrar. La evidencia se sube por su propia accion y llega ya guardada desde
 * el servidor, asi que se lee de las props —y por eso la foto recien subida
 * aparece sola cuando la accion repinta la pantalla—.
 */

/// Lo que llega del servidor, mas las fotos (que no se editan aqui).
type CompromisoProp = CompromisoDeCierre & { fotos: FotoResumen[] };

export function CierrePlanSemanal({
  obraId,
  planId,
  compromisos,
}: {
  obraId: string;
  planId: string;
  compromisos: CompromisoProp[];
}) {
  const [filas, setFilas] = useState<Fila[]>(() =>
    construirFilasCierre(compromisos),
  );

  /**
   * Los ids que se estan editando ahora mismo.
   *
   * ESTO NO ES UNA OPTIMIZACION, ES UN ARREGLO. Guardar la planificacion
   * borra los compromisos y los vuelve a crear (`deleteMany` + `createMany` en
   * `guardarCompromisos`), asi que despues de guardar los ids son OTROS.
   *
   * Y las dos cosas viven en la MISMA pantalla: arriba se planifica, abajo se
   * cierra. Con el estado congelado en el primer montaje, cualquiera que
   * ajustara los compromisos y cerrara la semana sin recargar mandaba ids que
   * ya no existian, y el servidor —con razon— respondia «Un compromiso
   * evaluado no pertenece a esta semana», un callejon sin salida del que no se
   * salia mas que recargando a ciegas.
   *
   * Se ajusta el estado DURANTE el render, que es como React admite responder
   * a un cambio de props sin un efecto de por medio (y sin chocar con la regla
   * que prohibe `setState` dentro de `useEffect`).
   */
  const idsDelServidor = compromisos.map((c) => c.id).join("|");
  const [idsVistos, setIdsVistos] = useState(idsDelServidor);
  if (idsVistos !== idsDelServidor) {
    setIdsVistos(idsDelServidor);
    setFilas((previas) => construirFilasCierre(compromisos, previas));
  }

  const [error, setError] = useState<string | null>(null);
  const [pendiente, iniciar] = useTransition();
  /// Compromiso con la evidencia abierta (uno a la vez).
  const [evidenciaEn, setEvidenciaEn] = useState<string | null>(null);
  /// Los cumplidos que se cerrarian sin mover la curva. El servidor los
  /// devuelve y hay que verlos antes de pasar.
  const [sinAvance, setSinAvance] = useState<
    { compromisoId: string; descripcion: string }[] | null
  >(null);

  function set(id: string, cambios: Partial<Fila>) {
    setFilas((p) => p.map((f) => (f.id === id ? { ...f, ...cambios } : f)));
  }

  function cerrar(confirmado = false) {
    setError(null);
    if (!confirmado) setSinAvance(null);

    iniciar(async () => {
      const r = await accionCerrarPlanSemanal(
        obraId,
        planId,
        filas.map((f) => {
          /**
           * La MISMA regla que la pantalla ensena y que el servicio aplica.
           * Si aqui se mandara la casilla a secas, un «30 de 120 m2, cumplido»
           * viajaria sin causa —el servidor la exige mirando lo ENVIADO, y
           * deriva despues—, y la semana quedaria guardada con un no cumplido
           * mudo, que es justo lo que el cierre existe para impedir.
           */
          const cumplido = cumplidoAlCerrar({
            marcado: f.cumplido,
            cantidadPlan: f.cantidadPlan,
            cantidadEjec: f.cantidadEjec.trim() || null,
          });
          return {
            compromisoId: f.id,
            cumplido,
            causa: cumplido ? null : f.causa,
            nota: f.nota.trim() || null,
            porcentajeReal:
              f.uid !== null ? (f.porcentajeReal.trim() || null) : null,
            cantidadEjec: f.cantidadEjec.trim() || null,
          };
        }),
        confirmado,
      );
      if (r.ok) return; // revalidatePath repinta la pagina ya cerrada.
      if ("requiereConfirmacion" in r) {
        setSinAvance(r.sinAvance);
        return;
      }
      setError(r.error ?? "No se pudo cerrar la semana.");
    });
  }

  if (compromisos.length === 0) {
    return <p className="text-sm opacity-60">Añade compromisos antes de cerrar la semana.</p>;
  }

  return (
    <div className="space-y-3">
      <ul className="space-y-2">
        {filas.map((f) => {
          const fotos = compromisos.find((c) => c.id === f.id)?.fotos ?? [];
          /**
           * Cuando hay cantidad comprometida, la casilla NO manda: lo decide lo
           * ejecutado. Se ensena deshabilitada con el resultado ya puesto, en
           * vez de dejar marcar algo que el servicio va a desmentir al guardar.
           *
           * `derivado` es null mientras no haya con que deducirlo —aun no se ha
           * escrito la cantidad—, y entonces manda la persona, como siempre.
           */
          const derivado = cumplidoPorCantidad(f.cantidadPlan, f.cantidadEjec);
          const cumplido = derivado ?? f.cumplido;
          const mandaLaCantidad =
            f.cantidadPlan !== null && esPositivo(f.cantidadPlan);
          return (
          <li
            key={f.id}
            className="rounded-lg border p-2.5 text-sm"
            style={{ borderColor: "var(--borde)" }}
          >
            <div className="flex flex-wrap items-center gap-3">
              <label
                className="inline-flex items-center gap-1.5"
                title={
                  derivado !== null
                    ? `Lo decide la cantidad: ${f.cantidadEjec} de ${f.cantidadPlan} ${f.unidad ?? ""}`
                    : undefined
                }
              >
                <input
                  type="checkbox"
                  checked={cumplido}
                  disabled={derivado !== null}
                  onChange={(e) => set(f.id, { cumplido: e.target.checked })}
                />
                <span className={derivado !== null ? "opacity-60" : undefined}>
                  Cumplido
                </span>
              </label>
              <span className="flex-1">{f.descripcion}</span>
              {/* Solo si se comprometio por cantidad: preguntar "cuantos m2"
                  donde no se pacto ninguna cantidad no significa nada. */}
              {f.cantidadPlan !== null && (
                <label className="inline-flex items-center gap-1 text-xs opacity-80">
                  ejecutado
                  <input
                    value={f.cantidadEjec}
                    onChange={(e) => set(f.id, { cantidadEjec: e.target.value })}
                    inputMode="decimal"
                    title={`Cantidad ejecutada de ${f.cantidadPlan} ${f.unidad ?? ""} comprometidos`}
                    className="w-20 rounded border px-1.5 py-1 text-xs tabular-nums"
                    style={{ borderColor: "var(--borde)", backgroundColor: "var(--fondo)" }}
                  />
                  <span className="opacity-60">
                    / {f.cantidadPlan} {f.unidad ?? ""}
                  </span>
                </label>
              )}
              {f.uid !== null && (
                <label className="inline-flex items-center gap-1 text-xs opacity-80">
                  % alcanzado
                  <input
                    type="number"
                    min={0}
                    max={100}
                    step="0.01"
                    value={f.porcentajeReal}
                    onChange={(e) => set(f.id, { porcentajeReal: e.target.value })}
                    title="Avance ACUMULADO de la tarea (0-100), no lo hecho esta semana"
                    className="w-16 rounded border px-1.5 py-1 text-xs tabular-nums"
                    style={{ borderColor: "var(--borde)", backgroundColor: "var(--fondo)" }}
                  />
                </label>
              )}
              {/* El clip va en la fila de arriba y no junto a la causa: si
                  colgara del bloque de causa, marcar "cumplido" escondera las
                  fotos ya subidas. La evidencia no puede desaparecer al
                  cambiar una casilla. */}
              <BotonEvidencia
                cantidad={fotos.length}
                abierto={evidenciaEn === f.id}
                etiqueta={f.descripcion}
                onClick={() =>
                  setEvidenciaEn((p) => (p === f.id ? null : f.id))
                }
              />
            </div>
            {/* Se dice en cuanto hay cantidad comprometida, no solo cuando ya
                se dedujo: quien va a escribir «119» tiene que saber ANTES que
                no le va a contar, y no descubrirlo al ver la casilla apagada. */}
            {mandaLaCantidad && (
              <p className="mt-1.5 text-xs opacity-70">
                Lo decide la <strong>cantidad ejecutada</strong>: {f.cantidadPlan}{" "}
                {f.unidad ?? ""} o más es cumplido. El corte es exacto — 119 de 120
                no lo es.
              </p>
            )}
            {/* Cumplido y sin porcentaje: NO se registrara avance fisico. Se
                dice, en vez de inventar un 100 como se hacia antes —que daba
                por terminada una tarea de tres semanas por haber cumplido el
                tramo de una, y falsificaba la curva S—. */}
            {f.uid !== null && cumplido && !f.porcentajeReal.trim() && (
              <p className="mt-1.5 text-xs" style={{ color: "var(--color-alerta)" }}>
                Sin <strong>% alcanzado</strong> no se registrará avance físico de
                esta tarea. Cuenta para el PPC igual. Escribe el acumulado si
                quieres que la curva S lo recoja.
              </p>
            )}

            {!cumplido && (
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <select
                  value={f.causa}
                  onChange={(e) => set(f.id, { causa: e.target.value as CausaNoCumplimiento })}
                  className="rounded-lg border px-2 py-1 text-xs"
                  style={{ borderColor: "var(--borde)", backgroundColor: "var(--fondo)" }}
                >
                  {CAUSAS_CNC.map((c) => (
                    <option key={c} value={c}>
                      {ETIQUETA_CNC[c]}
                    </option>
                  ))}
                </select>
                <input
                  value={f.nota}
                  onChange={(e) => set(f.id, { nota: e.target.value })}
                  placeholder="Nota (opcional)"
                  className="min-w-40 flex-1 rounded-lg border px-2 py-1 text-xs"
                  style={{ borderColor: "var(--borde)", backgroundColor: "var(--fondo)" }}
                />
              </div>
            )}

            {evidenciaEn === f.id && (
              <PanelEvidencia
                obraId={obraId}
                destino={{ compromisoId: f.id }}
                titulo={f.descripcion}
                fotos={fotos}
                // Quien puede cerrar la semana puede documentarla: esta
                // pantalla solo se pinta con `plan_semanal:gestionar`.
                puedeSubir
                accion={accionSubirEvidencia}
                onCerrar={() => setEvidenciaEn(null)}
              />
            )}
          </li>
          );
        })}
      </ul>
      {/* Los cumplidos que no dejarian rastro en la curva. Se AVISA y no se
          impide —a veces no se sabe el porcentaje, y bloquear el cierre por eso
          dejaria la semana sin PPC, que es peor—, pero hay que verlo: en
          CRIOCORD cinco compromisos asi dieron un PPC del 100% con la curva
          marcando esas partidas al 0% durante dias. */}
      {sinAvance && sinAvance.length > 0 && (
        <div
          className="rounded-lg border p-3 text-sm"
          style={{
            borderColor: "var(--color-alerta)",
            backgroundColor: "color-mix(in srgb, var(--color-alerta) 8%, transparent)",
          }}
        >
          <p className="flex items-start gap-2">
            <TriangleAlert
              className="mt-0.5 size-4 shrink-0"
              style={{ color: "var(--color-alerta)" }}
              aria-hidden="true"
            />
            <span>
              {sinAvance.length === 1
                ? "Vas a dar por cumplido 1 compromiso sin decir a qué % llegó su tarea:"
                : `Vas a dar por cumplidos ${sinAvance.length} compromisos sin decir a qué % llegaron sus tareas:`}
            </span>
          </p>
          <ul className="ml-6 mt-1 list-disc opacity-80">
            {sinAvance.map((s) => (
              <li key={s.compromisoId}>{s.descripcion}</li>
            ))}
          </ul>
          <p className="mt-2 opacity-80">
            El PPC contará el cumplimiento, pero <strong>la curva S no se moverá</strong>:
            para GCM esas tareas seguirán en el porcentaje que ya tenían, y el
            Lookahead las seguirá ofreciendo como trabajo por preparar.
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setSinAvance(null)}
              className="rounded-lg px-3 py-1.5 text-xs font-medium text-white"
              style={{ backgroundColor: "var(--color-marca-600)" }}
            >
              Escribir los porcentajes
            </button>
            <button
              type="button"
              onClick={() => cerrar(true)}
              disabled={pendiente}
              className="rounded-lg border px-3 py-1.5 text-xs font-medium disabled:opacity-60"
              style={{ borderColor: "var(--borde)" }}
            >
              Cerrar igual
            </button>
          </div>
        </div>
      )}

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => cerrar()}
          disabled={pendiente}
          className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-white disabled:opacity-60"
          style={{ backgroundColor: "var(--color-marca-600)" }}
        >
          {pendiente ? (
            <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
          ) : (
            <Check className="size-4" aria-hidden="true" />
          )}
          Cerrar la semana
        </button>
        {error && <span className="text-sm" style={{ color: "var(--color-peligro)" }}>{error}</span>}
      </div>
    </div>
  );
}
