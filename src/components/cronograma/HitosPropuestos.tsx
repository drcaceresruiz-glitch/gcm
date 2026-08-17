"use client";

import { useState, useTransition } from "react";
import { Sparkles, TriangleAlert, Info, LoaderCircle, Check } from "lucide-react";
import type { Prediccion, Propuesta } from "@/lib/hitos-predictivos";
import {
  DIAS_ESTANCADA,
  RETRASO_CRITICO,
  CONVERGENCIA_MINIMA,
} from "@/lib/hitos-predictivos";
import { accionCrearHito } from "@/app/(dashboard)/obras/[id]/cronograma/acciones-hitos";

/**
 * Los hitos que GCM propone, y —igual de importante— lo que todavia no puede
 * predecir y por que.
 *
 * Nada de esto existe en el cronograma hasta que alguien pulsa «Aceptar»: una
 * propuesta es una fila de esta lista, no una tarea. Si naciera como tarea,
 * `esHito` la sacaria del avance ponderado y la curva se descuadraria sola.
 *
 * El bloque de abajo —lo que falta— no es relleno. Tres de las seis reglas no
 * pueden decir nada con los datos de una obra normal, y enseñar CON EL NUMERO
 * que les falta convierte la pantalla en la lista de lo que hay que completar
 * para que la obra se pueda predecir.
 */
export function HitosPropuestos({
  obraId,
  prediccion,
  puedeAceptar,
}: {
  obraId: string;
  prediccion: Prediccion;
  puedeAceptar: boolean;
}) {
  const [aceptados, setAceptados] = useState<Set<number>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [pendiente, iniciar] = useTransition();
  const [verHuecos, setVerHuecos] = useState(false);

  const pendientes = prediccion.propuestas.filter((p) => !aceptados.has(p.uid));

  function aceptar(p: Propuesta) {
    setError(null);
    iniciar(async () => {
      // Se crea una fila NUEVA con la fecha propuesta y anclada tras la
      // partida que la motiva. La tarea que disparo la propuesta no se toca:
      // sigue contando en el avance ponderado, que es lo que debe.
      const r = await accionCrearHito(obraId, {
        nombre: p.titulo,
        fecha: p.fechaSugerida,
        anclaCodigo: p.anclaCodigo,
        diasAviso: 7,
      });
      if (r.ok) setAceptados((s) => new Set(s).add(p.uid));
      else setError(r.error ?? "No se pudo crear el hito.");
    });
  }

  return (
    <div className="space-y-3">
      {pendientes.length === 0 ? (
        <p className="text-sm opacity-70">
          GCM no ve ahora mismo nada que proponer como hito.
        </p>
      ) : (
        <ul className="space-y-2">
          {pendientes.map((p) => {
            const grave = p.severidad === "urgente";
            return (
              <li
                key={`${p.regla}-${p.uid}`}
                className="rounded-lg border p-3"
                style={{
                  borderColor: grave ? "var(--color-peligro)" : "var(--borde)",
                }}
              >
                <div className="flex items-start gap-2">
                  {grave ? (
                    <TriangleAlert
                      className="mt-0.5 size-4 shrink-0"
                      style={{ color: "var(--color-peligro)" }}
                      aria-hidden="true"
                    />
                  ) : (
                    <Sparkles className="mt-0.5 size-4 shrink-0 opacity-60" aria-hidden="true" />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">{p.titulo}</p>
                    <p className="mt-0.5 text-sm opacity-75">{p.motivo}</p>
                    <p className="mt-1 text-xs opacity-55">
                      Fecha sugerida: {p.fechaSugerida} · criterio de GCM, no una
                      medición de esta obra
                    </p>
                  </div>

                  {puedeAceptar && (
                    <button
                      type="button"
                      onClick={() => aceptar(p)}
                      disabled={pendiente}
                      className="shrink-0 rounded-lg px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
                      style={{ backgroundColor: "var(--color-marca-600)" }}
                    >
                      {pendiente ? (
                        <LoaderCircle className="size-3.5 animate-spin" aria-hidden="true" />
                      ) : (
                        "Aceptar"
                      )}
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {aceptados.size > 0 && (
        <p className="flex items-center gap-1.5 text-xs opacity-70">
          <Check className="size-3.5" aria-hidden="true" />
          {aceptados.size} aceptada(s); ya están en la lista de hitos de arriba.
        </p>
      )}

      {error && (
        <p role="alert" className="text-sm" style={{ color: "var(--color-peligro)" }}>
          {error}
        </p>
      )}

      {prediccion.sinDato.length > 0 && (
        <div className="mt-3 border-t pt-3" style={{ borderColor: "var(--borde)" }}>
          <button
            type="button"
            onClick={() => setVerHuecos((v) => !v)}
            aria-expanded={verHuecos}
            className="flex items-center gap-1.5 text-xs font-medium opacity-75 hover:opacity-100"
          >
            <Info className="size-3.5" aria-hidden="true" />
            Lo que GCM todavía no puede predecir ({prediccion.sinDato.length})
          </button>

          {verHuecos && (
            <ul className="mt-2 space-y-2 text-xs opacity-75">
              {prediccion.sinDato.map((s) => (
                <li key={s.regla}>
                  <strong>{ETIQUETA[s.regla] ?? s.regla}:</strong> {s.falta}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <p className="text-xs opacity-55">
        Los umbrales son criterio de oficio, no medidos en esta obra:{" "}
        {DIAS_ESTANCADA} días sin avance, {RETRASO_CRITICO} puntos de retraso en
        la ruta crítica y {CONVERGENCIA_MINIMA} predecesoras para llamarlo punto
        de integración.
      </p>
    </div>
  );
}

const ETIQUETA: Record<string, string> = {
  estancamiento: "Estancamiento",
  holgura: "Holgura agotada",
  spi: "Retraso (SPI)",
  cpi: "Sobrecosto (CPI)",
  convergencia: "Puntos de integración",
  recursos: "Saturación de recursos",
};
