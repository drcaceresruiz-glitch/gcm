"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { LoaderCircle, TriangleAlert, X } from "lucide-react";
import { fechaCorta } from "@/utils/fechas";
import { accionComprometerAlPts } from "@/app/(dashboard)/obras/[id]/lookahead/acciones";
import type { SemanaAbierta } from "@/services/plan-semanal.service";

/**
 * Llevar al Plan Semanal las tareas elegidas en el Lookahead.
 *
 * Se despliega bajo la matriz en vez de abrir un dialogo: no hay componente
 * modal en el proyecto y en un movil, en obra, un panel que empuja la pagina se
 * maneja mejor que una ventana flotante.
 *
 * El aviso de "esto no esta listo" no lo decide esta pantalla: se pide al
 * servidor sin confirmar, y si responde que hace falta, se muestra lo que el
 * mismo servidor devolvio y se repite la llamada ya confirmada.
 */

export interface TareaSeleccionada {
  uid: number;
  nombre: string;
  lista: boolean;
}

/// La forma la manda el servicio (`AvisoComprometer`): se copia aqui para no
/// arrastrar `server-only` al cliente, asi que los dos tienen que ir a la par.
interface Aviso {
  uid: number;
  nombre: string;
  semana?: number;
  cerrada?: boolean;
  cumplida?: boolean;
}

export function PanelComprometer({
  obraId,
  seleccionadas,
  semanasAbiertas,
  fechaProximoCorte,
  onCerrar,
}: {
  obraId: string;
  seleccionadas: TareaSeleccionada[];
  semanasAbiertas: SemanaAbierta[];
  /// Fecha (ISO corta) de la semana que se abriria si no hay ninguna.
  fechaProximoCorte: string;
  /// Cierra el panel Y limpia la seleccion (por eso no se limpia al terminar:
  /// el aviso de exito tiene que poder leerse).
  onCerrar: () => void;
}) {
  const [planId, setPlanId] = useState<string>(semanasAbiertas[0]?.id ?? "");
  const [avisos, setAvisos] = useState<{
    noListas: Aviso[];
    sinAnalizar: Aviso[];
    enOtraSemana: Aviso[];
  } | null>(null);
  const [acepto, setAcepto] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hecho, setHecho] = useState<{
    planId: string;
    numero: number;
    agregados: number;
    omitidos: number;
  } | null>(null);
  const [pendiente, iniciar] = useTransition();

  const sinLiberar = seleccionadas.filter((t) => !t.lista).length;

  function comprometer(confirmado: boolean) {
    setError(null);
    iniciar(async () => {
      const r = await accionComprometerAlPts(obraId, {
        planId: planId || null,
        uids: seleccionadas.map((t) => t.uid),
        confirmado,
      });

      if (r.ok) {
        setHecho({
          planId: r.planId,
          numero: r.numero,
          agregados: r.agregados,
          omitidos: r.omitidos,
        });
        setAvisos(null);
        return;
      }
      if (r.requiereConfirmacion) {
        setAvisos(r.requiereConfirmacion);
        return;
      }
      setError(r.error ?? "No se pudo comprometer.");
    });
  }

  if (hecho) {
    return (
      <div
        className="rounded-lg border p-4 text-sm"
        style={{ borderColor: "var(--color-exito)" }}
      >
        <p>
          <strong>{hecho.agregados}</strong> tarea(s) comprometidas en la{" "}
          <strong>Semana {hecho.numero}</strong>
          {hecho.omitidos > 0 && (
            <> · {hecho.omitidos} ya estaba(n) en esa semana</>
          )}
          .
        </p>
        <div className="mt-2 flex flex-wrap gap-3">
          <Link
            href={`/obras/${obraId}/plan-semanal/${hecho.planId}`}
            className="font-medium underline"
          >
            Ver la semana
          </Link>
          <button type="button" onClick={onCerrar} className="opacity-70 underline">
            Seguir en el Lookahead
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      className="space-y-3 rounded-lg border p-4"
      style={{ borderColor: "var(--borde)", backgroundColor: "var(--superficie)" }}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold">
            Comprometer {seleccionadas.length} tarea(s) al Plan Semanal
          </h3>
          <p className="mt-0.5 text-sm opacity-70">
            La cantidad y la unidad se toman de la partida mapeada cuando se
            puede; se ajustan luego en la semana.
          </p>
        </div>
        <button
          type="button"
          onClick={onCerrar}
          aria-label="Cerrar"
          className="rounded p-1 opacity-60 hover:opacity-100"
        >
          <X className="size-4" aria-hidden="true" />
        </button>
      </div>

      <label className="block text-xs">
        <span className="block opacity-70">Semana destino</span>
        <select
          value={planId}
          onChange={(e) => setPlanId(e.target.value)}
          className="mt-1 w-full max-w-sm rounded-lg border px-2 py-1.5 text-sm"
          style={{ borderColor: "var(--borde)", backgroundColor: "var(--fondo)" }}
        >
          {semanasAbiertas.map((s) => (
            <option key={s.id} value={s.id}>
              Semana {s.numero} — cierra el {fechaCorta(s.fechaCorte)}
            </option>
          ))}
          <option value="">
            Crear la semana que cierra el {fechaCorta(new Date(fechaProximoCorte))}
          </option>
        </select>
      </label>

      {/* Lo que el SERVIDOR marco como riesgoso. No se decide aqui. */}
      {avisos && (
        <div
          className="space-y-2 rounded-lg border p-3 text-sm"
          style={{ borderColor: "var(--color-alerta)" }}
        >
          <p className="flex items-center gap-2 font-medium">
            <TriangleAlert className="size-4 shrink-0" aria-hidden="true" />
            Revisa antes de comprometer
          </p>
          {/* Dos listas y no una: "nadie la ha mirado" y "le falta levantar
              algo" se arreglan de forma distinta, y meterlas en el mismo saco
              hacia que el aviso mintiera sobre las que no tienen ninguna. */}
          {avisos.sinAnalizar.length > 0 && (
            <div>
              <p className="opacity-80">
                Nadie ha analizado sus restricciones ({avisos.sinAnalizar.length}):
              </p>
              <ul className="ml-4 list-disc opacity-70">
                {avisos.sinAnalizar.map((a) => (
                  <li key={a.uid}>{a.nombre}</li>
                ))}
              </ul>
            </div>
          )}
          {avisos.noListas.length > 0 && (
            <div>
              <p className="opacity-80">
                Sin liberar sus restricciones ({avisos.noListas.length}):
              </p>
              <ul className="ml-4 list-disc opacity-70">
                {avisos.noListas.map((a) => (
                  <li key={a.uid}>{a.nombre}</li>
                ))}
              </ul>
            </div>
          )}
          {/* Se separan porque son avisos OPUESTOS y antes decian lo mismo.
              Que una tarea siga viva en una semana en marcha es un solape que
              hay que resolver; que se cumpliera y se cerrara es volver a
              prometer trabajo ya hecho, y eso hunde el PPC de la semana que
              viene con un compromiso que nadie iba a ejecutar. */}
          {avisos.enOtraSemana.some((a) => a.cerrada && a.cumplida) && (
            <div>
              <p className="opacity-80">Ya se cumplieron y su semana está cerrada:</p>
              <ul className="ml-4 list-disc opacity-70">
                {avisos.enOtraSemana
                  .filter((a) => a.cerrada && a.cumplida)
                  .map((a) => (
                    <li key={a.uid}>
                      {a.nombre} — cumplida en la Semana {a.semana}
                    </li>
                  ))}
              </ul>
            </div>
          )}
          {avisos.enOtraSemana.some((a) => !(a.cerrada && a.cumplida)) && (
            <div>
              <p className="opacity-80">Ya comprometidas en otra semana:</p>
              <ul className="ml-4 list-disc opacity-70">
                {avisos.enOtraSemana
                  .filter((a) => !(a.cerrada && a.cumplida))
                  .map((a) => (
                    <li key={a.uid}>
                      {a.nombre} (Semana {a.semana}
                      {a.cerrada ? ", cerrada sin cumplirse" : ""})
                    </li>
                  ))}
              </ul>
            </div>
          )}
          <label className="flex items-start gap-2">
            <input
              type="checkbox"
              checked={acepto}
              onChange={(e) => setAcepto(e.target.checked)}
              className="mt-0.5 size-4"
            />
            <span>
              Entiendo el riesgo y las comprometo igual.
            </span>
          </label>
        </div>
      )}

      {!avisos && sinLiberar > 0 && (
        <p className="text-sm" style={{ color: "var(--color-alerta)" }}>
          {sinLiberar} de las elegidas aún no están listas: se pedirá confirmar.
        </p>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => comprometer(avisos !== null)}
          disabled={pendiente || (avisos !== null && !acepto)}
          className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-white disabled:opacity-60"
          style={{ backgroundColor: "var(--color-marca-600)" }}
        >
          {pendiente && (
            <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
          )}
          {avisos ? "Comprometer igual" : "Comprometer"}
        </button>
        <button type="button" onClick={onCerrar} className="text-sm opacity-70 underline">
          Cancelar
        </button>
        {error && (
          <span className="text-sm" style={{ color: "var(--color-peligro)" }}>
            {error}
          </span>
        )}
      </div>
    </div>
  );
}
