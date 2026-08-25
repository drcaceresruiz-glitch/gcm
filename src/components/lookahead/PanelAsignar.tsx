"use client";

import { useState, useTransition } from "react";
import { LoaderCircle, UserRoundCheck, X } from "lucide-react";
import { accionComprometerRestricciones } from "@/app/(dashboard)/obras/[id]/lookahead/acciones";
import type { PersonaAsignable } from "@/services/lookahead.service";
import { useMotivoSinEscritura } from "@/components/obras/EscrituraDeLaObra";

/**
 * A quien le toca levantar estas restricciones, y para cuando.
 *
 * Es el paso que faltaba para que el analisis de restricciones sea lo que el
 * Last Planner pide: una lista de *restriccion -> responsable -> fecha*. Sin
 * esas dos respuestas, marcar casillas no prepara nada.
 *
 * VA EN LOTE porque asignar de una en una a treinta filas no lo hace nadie.
 *
 * LA PROMESA SE REGISTRA, NO SE PIDE. En obra la promesa llega por telefono
 * —«el fierro lo tengo el jueves»— y quien la escribe es el residente. Esta
 * pantalla es para anotarla, no para sustituir esa conversacion: un sistema
 * donde se manda un correo y se espera es PEOR que una llamada.
 *
 * Los de la obra salen primero en la lista. Es doctrina, no orden alfabetico:
 * el responsable casi nunca deberia ser el proveedor, sino quien puede
 * levantarla dentro de la organizacion. El proveedor es a quien esa persona
 * persigue.
 */
export function PanelAsignar({
  obraId,
  restriccionIds,
  personas,
  fechaSugerida,
  cuantasTareas,
  onCerrar,
}: {
  obraId: string;
  /// Las restricciones ABIERTAS de las tareas elegidas.
  restriccionIds: string[];
  personas: PersonaAsignable[];
  /// El proximo corte semanal: la fecha que se propone sin teclear nada.
  fechaSugerida: string;
  cuantasTareas: number;
  onCerrar: () => void;
}) {
  const [responsable, setResponsable] = useState("");
  const [fecha, setFecha] = useState(fechaSugerida);
  const [error, setError] = useState<string | null>(null);
  const [hecho, setHecho] = useState<number | null>(null);
  const [pendiente, iniciar] = useTransition();

  /*
   * En una obra que no admite cambios no se ofrece: `comprometerRestricciones` lo
   * rechaza, y un boton que siempre falla invita a probar. El motivo se
   * explica una vez por pantalla, no en cada control.
   * Mismas opciones que el servidor: una obra PARALIZADA SI lo admite
   * -cierra algo en curso, no abre trabajo nuevo-.
   * Va DESPUES del ultimo hook: un `return` por delante de una llamada a
   * un hook cambia el orden entre renders y React lo prohibe.
   */
  const sinEscritura = useMotivoSinEscritura({ permiteEnParalizada: true }) !== null;
  if (sinEscritura) return null;

  const dentro = personas.filter((p) => !p.externo);
  const fuera = personas.filter((p) => p.externo);

  function guardar() {
    setError(null);
    iniciar(async () => {
      const r = await accionComprometerRestricciones(obraId, {
        ids: restriccionIds,
        responsable,
        fecha,
      });
      if (r.ok) setHecho(r.asignadas ?? 0);
      else setError(r.error ?? "No se pudo guardar.");
    });
  }

  return (
    <div
      className="rounded-xl border p-4"
      style={{ borderColor: "var(--borde)", backgroundColor: "var(--superficie)" }}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="flex items-center gap-2 text-sm font-semibold">
            <UserRoundCheck className="size-4" aria-hidden="true" />
            Asignar responsable y fecha
          </h3>
          <p className="mt-0.5 text-xs opacity-70">
            {restriccionIds.length} restricción
            {restriccionIds.length === 1 ? "" : "es"} sin levantar de{" "}
            {cuantasTareas} tarea{cuantasTareas === 1 ? "" : "s"}.
          </p>
        </div>
        <button
          type="button"
          onClick={onCerrar}
          aria-label="Cerrar"
          className="rounded-lg border p-1"
          style={{ borderColor: "var(--borde)" }}
        >
          <X className="size-4" aria-hidden="true" />
        </button>
      </div>

      {hecho !== null ? (
        <p className="mt-3 text-sm" style={{ color: "var(--color-exito)" }}>
          Listo: {hecho} restricción{hecho === 1 ? "" : "es"} con responsable y
          fecha. Ahora sí se puede decir quién iba a resolverlo.
        </p>
      ) : (
        <>
          <div className="mt-3 flex flex-wrap items-end gap-3">
            <label className="text-xs">
              <span className="block opacity-70">Le toca a</span>
              <select
                value={responsable}
                onChange={(e) => setResponsable(e.target.value)}
                className="mt-1 max-w-64 rounded-lg border px-2 py-1.5 text-sm"
                style={{
                  borderColor: "var(--borde)",
                  backgroundColor: "var(--fondo)",
                }}
              >
                <option value="">— sin asignar —</option>
                {dentro.length > 0 && (
                  <optgroup label="De la obra">
                    {dentro.map((p) => (
                      <option key={p.clave} value={p.clave}>
                        {p.nombre}
                        {p.detalle ? ` · ${p.detalle}` : ""}
                      </option>
                    ))}
                  </optgroup>
                )}
                {/* Los de fuera, DESPUES y en su propio grupo: se puede, pero
                    no es lo primero que se ofrece. */}
                {fuera.length > 0 && (
                  <optgroup label="De fuera de GCM">
                    {fuera.map((p) => (
                      <option key={p.clave} value={p.clave}>
                        {p.nombre}
                        {p.detalle ? ` · ${p.detalle}` : ""}
                      </option>
                    ))}
                  </optgroup>
                )}
              </select>
            </label>

            <label className="text-xs">
              <span className="block opacity-70">Lo tendrá el</span>
              <input
                type="date"
                value={fecha}
                onChange={(e) => setFecha(e.target.value)}
                className="mt-1 rounded-lg border px-2 py-1.5 text-sm"
                style={{
                  borderColor: "var(--borde)",
                  backgroundColor: "var(--fondo)",
                }}
              />
            </label>

            <button
              type="button"
              onClick={guardar}
              disabled={pendiente}
              className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-white disabled:opacity-60"
              style={{ backgroundColor: "var(--color-marca-600)" }}
            >
              {pendiente && (
                <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
              )}
              Guardar
            </button>
          </div>

          <p className="mt-2 text-xs opacity-60">
            La fecha viene propuesta al próximo corte semanal. Se puede dejar sin
            responsable o sin fecha: en obra se sabe antes «esto tiene que estar
            el jueves» que quién lo va a conseguir.
          </p>

          {error && (
            <p className="mt-2 text-sm" style={{ color: "var(--color-peligro)" }}>
              {error}
            </p>
          )}
        </>
      )}
    </div>
  );
}
