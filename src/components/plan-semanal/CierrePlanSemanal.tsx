"use client";

import { useState, useTransition } from "react";
import { Check, LoaderCircle } from "lucide-react";
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

  function set(id: string, cambios: Partial<Fila>) {
    setFilas((p) => p.map((f) => (f.id === id ? { ...f, ...cambios } : f)));
  }

  function cerrar() {
    setError(null);
    iniciar(async () => {
      const r = await accionCerrarPlanSemanal(
        obraId,
        planId,
        filas.map((f) => ({
          compromisoId: f.id,
          cumplido: f.cumplido,
          causa: f.cumplido ? null : f.causa,
          nota: f.nota.trim() || null,
          porcentajeReal:
            f.uid !== null ? (f.porcentajeReal.trim() || null) : null,
          cantidadEjec: f.cantidadEjec.trim() || null,
        })),
      );
      if (!r.ok) setError(r.error ?? "No se pudo cerrar la semana.");
      // En exito, revalidatePath repinta la pagina ya cerrada.
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
          return (
          <li
            key={f.id}
            className="rounded-lg border p-2.5 text-sm"
            style={{ borderColor: "var(--borde)" }}
          >
            <div className="flex flex-wrap items-center gap-3">
              <label className="inline-flex items-center gap-1.5">
                <input
                  type="checkbox"
                  checked={f.cumplido}
                  onChange={(e) => set(f.id, { cumplido: e.target.checked })}
                />
                <span>Cumplido</span>
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
            {/* Cumplido y sin porcentaje: NO se registrara avance fisico. Se
                dice, en vez de inventar un 100 como se hacia antes —que daba
                por terminada una tarea de tres semanas por haber cumplido el
                tramo de una, y falsificaba la curva S—. */}
            {f.uid !== null && f.cumplido && !f.porcentajeReal.trim() && (
              <p className="mt-1.5 text-xs" style={{ color: "var(--color-alerta)" }}>
                Sin <strong>% alcanzado</strong> no se registrará avance físico de
                esta tarea. Cuenta para el PPC igual. Escribe el acumulado si
                quieres que la curva S lo recoja.
              </p>
            )}

            {!f.cumplido && (
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
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={cerrar}
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
