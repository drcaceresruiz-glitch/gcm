"use client";

import { useState, useTransition } from "react";
import {
  CircleCheck,
  CircleDashed,
  Ban,
  RefreshCw,
  LoaderCircle,
  CalendarPlus,
} from "lucide-react";
import { Chip, type TonoChip } from "@/components/ui/Chip";
import { FLUJOS_RESTRICCION } from "@/lib/lookahead";
import { PanelComprometer } from "@/components/lookahead/PanelComprometer";
import {
  accionSincronizar,
  accionAlternarRestriccion,
} from "@/app/(dashboard)/obras/[id]/lookahead/acciones";
import type { EstadoLookahead } from "@/generated/prisma/enums";
import type { LookaheadDatos } from "@/services/lookahead.service";

/**
 * La matriz del Lookahead: tareas de la ventana (filas) x los 7 flujos de
 * restriccion (columnas de checkbox) + el semaforo de confiabilidad. Marcar una
 * restriccion dispara la accion de servidor, que recalcula el estado y revalida.
 */

const TONO_ESTADO: Record<EstadoLookahead, TonoChip> = {
  LISTO: "exito",
  PENDIENTE: "alerta",
  BLOQUEADO: "peligro",
};

const ETIQUETA_ESTADO: Record<EstadoLookahead, string> = {
  LISTO: "Listo",
  PENDIENTE: "Pendiente",
  BLOQUEADO: "Bloqueado",
};

const ICONO_ESTADO = {
  LISTO: CircleCheck,
  PENDIENTE: CircleDashed,
  BLOQUEADO: Ban,
} as const;

const ETIQUETA_FLUJO = new Map(
  FLUJOS_RESTRICCION.map((f) => [f.tipo, f.etiqueta]),
);

export function MatrizLookahead({
  obraId,
  datos,
  fechaProximoCorte,
}: {
  obraId: string;
  datos: LookaheadDatos;
  /// Fecha ISO del corte que se abriria si no hay ninguna semana abierta.
  fechaProximoCorte: string;
}) {
  const [pendiente, iniciar] = useTransition();
  const [elegidas, setElegidas] = useState<Set<number>>(new Set());
  const [abrirPanel, setAbrirPanel] = useState(false);
  const {
    filas,
    confiabilidad: conf,
    pendientesDeSincronizar,
    puedeGestionar,
    semanasAbiertas,
    puedeComprometer,
  } = datos;

  function alternarEleccion(uid: number) {
    setElegidas((p) => {
      const s = new Set(p);
      if (s.has(uid)) s.delete(uid);
      else s.add(uid);
      return s;
    });
    setAbrirPanel(false);
  }

  // Atajo del Last Planner: lo normal es comprometer todo lo que quedo listo.
  const listasSinComprometer = filas.filter(
    (f) => f.estado === "LISTO" && f.comprometida.length === 0,
  );
  function elegirListas() {
    setElegidas(new Set(listasSinComprometer.map((f) => f.uid)));
    setAbrirPanel(false);
  }

  const seleccionadas = filas
    .filter((f) => elegidas.has(f.uid))
    .map((f) => ({
      uid: f.uid,
      nombre: `${f.codigo ? `${f.codigo} ` : ""}${f.nombre}`,
      lista: f.estado === "LISTO",
    }));

  function alternar(restriccionId: string, resuelta: boolean) {
    iniciar(async () => {
      await accionAlternarRestriccion(obraId, restriccionId, resuelta);
    });
  }

  function sincronizar() {
    iniciar(async () => {
      await accionSincronizar(obraId);
    });
  }

  if (filas.length === 0) {
    return (
      <p className="text-sm opacity-60">
        No hay tareas del cronograma en la ventana de las proximas 3 semanas.
        Cuando el cronograma programe trabajo en ese rango, aparecera aqui.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      {/* Resumen de confiabilidad + sincronizar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="text-sm">
            Confiabilidad:{" "}
            <strong className="tabular-nums">
              {conf.listas}/{conf.total}
            </strong>{" "}
            listas <span className="opacity-60">({conf.porcentaje}%)</span>
          </span>
          <div
            className="h-2 w-32 overflow-hidden rounded-full"
            style={{ backgroundColor: "var(--borde)" }}
          >
            <div
              className="h-full rounded-full"
              style={{
                width: `${conf.porcentaje}%`,
                backgroundColor: "var(--color-exito)",
              }}
            />
          </div>
        </div>

        {puedeGestionar && pendientesDeSincronizar > 0 && (
          <button
            type="button"
            onClick={sincronizar}
            disabled={pendiente}
            className="inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium text-white disabled:opacity-60"
            style={{ backgroundColor: "var(--color-marca-600)" }}
          >
            {pendiente ? (
              <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
            ) : (
              <RefreshCw className="size-4" aria-hidden="true" />
            )}
            Sincronizar ventana ({pendientesDeSincronizar})
          </button>
        )}
      </div>

      {/* Llevar al PTS: aparece solo cuando hay algo elegido. */}
      {puedeComprometer && (elegidas.size > 0 || listasSinComprometer.length > 0) && (
        <div className="flex flex-wrap items-center gap-3">
          {elegidas.size > 0 ? (
            <>
              <button
                type="button"
                onClick={() => setAbrirPanel(true)}
                className="inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium text-white"
                style={{ backgroundColor: "var(--color-marca-600)" }}
              >
                <CalendarPlus className="size-4" aria-hidden="true" />
                Comprometer al PTS ({elegidas.size})
              </button>
              <button
                type="button"
                onClick={() => setElegidas(new Set())}
                className="text-sm opacity-70 underline"
              >
                Quitar seleccion
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={elegirListas}
              className="text-sm underline"
            >
              Elegir las {listasSinComprometer.length} listas sin comprometer
            </button>
          )}
        </div>
      )}

      {abrirPanel && seleccionadas.length > 0 && (
        <PanelComprometer
          obraId={obraId}
          seleccionadas={seleccionadas}
          semanasAbiertas={semanasAbiertas}
          fechaProximoCorte={fechaProximoCorte}
          // La seleccion se limpia al CERRAR, no al comprometer: si se limpiara
          // antes, el panel se quedaria sin tareas y se desmontaria llevandose
          // el aviso de "listo, N comprometidas" sin que diera tiempo a leerlo.
          onCerrar={() => {
            setAbrirPanel(false);
            setElegidas(new Set());
          }}
        />
      )}

      {/* Matriz. Scroll horizontal propio: son 7 columnas de restriccion. */}
      <div
        className="overflow-x-auto rounded-lg border"
        style={{ borderColor: "var(--borde)" }}
      >
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr style={{ backgroundColor: "var(--superficie)" }}>
              <th
                className="sticky left-0 z-10 px-3 py-2 text-left font-medium"
                style={{ backgroundColor: "var(--superficie)" }}
              >
                Tarea
              </th>
              {FLUJOS_RESTRICCION.map((f) => (
                <th
                  key={f.tipo}
                  className="px-2 py-2 text-center font-medium"
                  title={`${f.etiqueta}: ${f.descripcion}`}
                >
                  {f.etiqueta}
                </th>
              ))}
              <th className="px-3 py-2 text-center font-medium">Estado</th>
            </tr>
          </thead>
          <tbody>
            {filas.map((fila) => (
              <tr
                key={fila.uid}
                className="border-t"
                style={{ borderColor: "var(--borde)" }}
              >
                <td
                  className="sticky left-0 z-10 px-3 py-2"
                  style={{ backgroundColor: "var(--fondo)" }}
                >
                  <div className="flex items-start gap-2">
                    {puedeComprometer && (
                      <input
                        type="checkbox"
                        checked={elegidas.has(fila.uid)}
                        onChange={() => alternarEleccion(fila.uid)}
                        aria-label={`Elegir ${fila.nombre} para el Plan Semanal`}
                        className="mt-0.5 size-4 shrink-0"
                        style={{ accentColor: "var(--color-marca-600)" }}
                      />
                    )}
                    <div className="min-w-0">
                      <div
                        className="max-w-xs truncate font-medium"
                        title={fila.nombre}
                      >
                        {fila.codigo ? `${fila.codigo} ` : ""}
                        {fila.nombre}
                      </div>
                      {!fila.sincronizada && (
                        <div className="text-xs opacity-60">Sin analizar</div>
                      )}
                      {fila.comprometida.length > 0 && (
                        <div className="text-xs opacity-70">
                          En{" "}
                          {fila.comprometida
                            .map((c) => `S-${c.numero}`)
                            .join(", ")}
                        </div>
                      )}
                    </div>
                  </div>
                </td>

                {fila.restricciones.map((c) => (
                  <td key={c.tipo} className="px-2 py-2 text-center">
                    <input
                      type="checkbox"
                      checked={c.resuelta}
                      disabled={
                        !puedeGestionar ||
                        !fila.sincronizada ||
                        c.id === null ||
                        pendiente
                      }
                      onChange={(e) => {
                        if (c.id) alternar(c.id, e.target.checked);
                      }}
                      aria-label={`${ETIQUETA_FLUJO.get(c.tipo) ?? c.tipo} de ${fila.nombre}`}
                      className="size-4"
                      style={{ accentColor: "var(--color-exito)" }}
                    />
                  </td>
                ))}

                <td className="px-3 py-2 text-center">
                  <Chip tono={TONO_ESTADO[fila.estado]} icono={ICONO_ESTADO[fila.estado]}>
                    {ETIQUETA_ESTADO[fila.estado]}
                  </Chip>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-xs opacity-60">
        Marca cada restriccion cuando quede resuelta. Cuando las 7 estan
        resueltas, la tarea pasa a <strong>Lista</strong> y podra comprometerse
        en el Plan Semanal.
      </p>
    </div>
  );
}
