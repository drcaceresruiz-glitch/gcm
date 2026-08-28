"use client";

import { useActionState } from "react";
import { AlertCircle, Check } from "lucide-react";

import {
  accionFijarInterrupcion,
  accionMarcarOrigen,
  type EstadoEstudio,
} from "@/app/(dashboard)/obras/[id]/investigacion/acciones";

/**
 * Preparar la obra como instrumento: el punto de interrupcion y el origen de
 * cada semana.
 *
 * Las dos cosas que decide esta pantalla no cambian ni un dato de la obra;
 * cambian como se CLASIFICAN sus datos en un estudio. Y por eso se guardan en
 * el sistema en vez de escribirse en la hoja de calculo del investigador:
 * asi la clasificacion es la misma en todas las descargas, se puede auditar, y
 * dos personas que exporten el mismo dia obtienen exactamente lo mismo.
 */

export interface SemanaEnPantalla {
  id: string;
  numero: number;
  indice: number;
  fechaCorte: string;
  fase: "PRE" | "POST" | "SIN_CLASIFICAR";
  origenDatos: "GESTIONADO" | "RECONSTRUIDO";
  compromisos: number;
  ppc: number | null;
}

const COLOR_FASE: Record<SemanaEnPantalla["fase"], string> = {
  PRE: "var(--color-alerta)",
  POST: "var(--color-exito)",
  SIN_CLASIFICAR: "var(--borde)",
};

export function PanelDelEstudio({
  obraId,
  interrupcion,
  semanas,
  pre,
  post,
  reconstruidas,
  restricciones,
  restriccionesMedibles,
}: {
  obraId: string;
  interrupcion: string;
  semanas: readonly SemanaEnPantalla[];
  pre: number;
  post: number;
  reconstruidas: number;
  restricciones: number;
  restriccionesMedibles: number;
}) {
  const [estado, fijar] = useActionState<EstadoEstudio, FormData>(
    accionFijarInterrupcion,
    {},
  );

  return (
    <div className="space-y-6">
      <section
        className="space-y-4 rounded-xl border p-5"
        style={{ borderColor: "var(--borde)" }}
      >
        <div>
          <h3 className="text-sm font-semibold">Punto de interrupción</h3>
          <p className="mt-1 max-w-3xl text-sm text-pretty opacity-70">
            La semana en que esta obra empezó a gestionarse con GCM. De ella
            sale la clasificación <strong>PRE</strong> y <strong>POST</strong>{" "}
            de todos los datos exportados. La semana del punto de interrupción
            cuenta como POST: es la primera gestionada con la herramienta.
          </p>
        </div>

        <form action={fijar} className="flex flex-wrap items-end gap-3">
          <input type="hidden" name="obraId" value={obraId} />

          <div className="space-y-1.5">
            <label htmlFor="fecha" className="block text-sm font-medium">
              Fecha
            </label>
            <input
              id="fecha"
              name="fecha"
              type="date"
              defaultValue={interrupcion}
              className="rounded-lg border px-3 py-2 text-sm"
              style={{
                borderColor: "var(--borde)",
                backgroundColor: "var(--fondo)",
              }}
            />
          </div>

          <button
            type="submit"
            className="rounded-lg px-4 py-2 text-sm font-medium text-white"
            style={{ backgroundColor: "var(--color-marca-600)" }}
          >
            Guardar
          </button>

          <p className="text-xs opacity-60">
            Vacío = esta obra no participa en ningún estudio.
          </p>
        </form>

        {estado.error && (
          <p
            role="alert"
            className="flex items-center gap-2 text-sm"
            style={{ color: "var(--color-peligro)" }}
          >
            <AlertCircle className="size-4 shrink-0" aria-hidden="true" />
            {estado.error}
          </p>
        )}
        {estado.ok && (
          <p role="status" className="flex items-center gap-2 text-sm opacity-70">
            <Check className="size-4 shrink-0" aria-hidden="true" />
            Guardado. La serie se reclasificó entera.
          </p>
        )}

        <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
          <div>
            <dt className="opacity-60">Semanas PRE</dt>
            <dd className="text-lg font-semibold tabular-nums">{pre}</dd>
          </div>
          <div>
            <dt className="opacity-60">Semanas POST</dt>
            <dd className="text-lg font-semibold tabular-nums">{post}</dd>
          </div>
          <div>
            <dt className="opacity-60">Reconstruidas</dt>
            <dd className="text-lg font-semibold tabular-nums">{reconstruidas}</dd>
          </div>
          <div>
            <dt className="opacity-60">Restricciones medibles</dt>
            <dd className="text-lg font-semibold tabular-nums">
              {restriccionesMedibles}
              <span className="text-sm font-normal opacity-60">
                {" "}
                de {restricciones}
              </span>
            </dd>
          </div>
        </dl>

        {/* Lo que un jurado va a preguntar, dicho antes de que lo pregunte. */}
        <p className="max-w-3xl text-xs text-pretty opacity-60">
          «Restricciones medibles» son las que tienen fecha comprometida y fecha
          de resolución: solo esas entran en el cálculo del retraso. La
          diferencia con el total es la parte de la muestra que queda fuera, y
          conviene declararla.
        </p>
      </section>

      <section className="space-y-2">
        <h3 className="text-sm font-semibold">Semanas de la serie</h3>
        <p className="max-w-3xl text-sm text-pretty opacity-70">
          El índice numera por fecha de corte, no por el número del plan: si las
          semanas anteriores a la implantación se cargan después, reciben
          números altos con fechas antiguas y solo el índice ordena bien la
          serie. Marca como <strong>reconstruida</strong> cada semana cuyos
          datos vengan de actas o del cuaderno de obra en vez de haberse
          gestionado aquí.
        </p>

        <div
          className="overflow-x-auto rounded-xl border"
          style={{ borderColor: "var(--borde)" }}
        >
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left" style={{ backgroundColor: "var(--superficie)" }}>
                <th className="p-2 font-medium">Índice</th>
                <th className="p-2 font-medium">Plan</th>
                <th className="p-2 font-medium">Corte</th>
                <th className="p-2 font-medium">Fase</th>
                <th className="p-2 text-right font-medium">Compromisos</th>
                <th className="p-2 text-right font-medium">PPC</th>
                <th className="p-2 font-medium">Origen</th>
              </tr>
            </thead>
            <tbody>
              {semanas.length === 0 && (
                <tr>
                  <td className="p-3 opacity-70" colSpan={7}>
                    Esta obra todavía no tiene semanas planificadas.
                  </td>
                </tr>
              )}

              {semanas.map((s) => (
                <tr key={s.id} style={{ borderTop: "1px solid var(--borde)" }}>
                  <td className="p-2 tabular-nums">{s.indice}</td>
                  <td className="p-2 tabular-nums opacity-70">v{s.numero}</td>
                  <td className="p-2 tabular-nums">{s.fechaCorte}</td>
                  <td className="p-2">
                    <span
                      className="rounded px-2 py-0.5 text-xs font-medium"
                      style={{
                        backgroundColor: `color-mix(in oklab, ${COLOR_FASE[s.fase]} 20%, transparent)`,
                      }}
                    >
                      {s.fase === "SIN_CLASIFICAR" ? "sin clasificar" : s.fase}
                    </span>
                  </td>
                  <td className="p-2 text-right tabular-nums">{s.compromisos}</td>
                  <td className="p-2 text-right tabular-nums">
                    {s.ppc === null ? "" : `${s.ppc.toFixed(1)} %`}
                  </td>
                  <td className="p-2">
                    <CambiarOrigen obraId={obraId} semana={s} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

/**
 * El interruptor de una semana: gestionada o reconstruida.
 *
 * Un boton que dice a que se va a cambiar, y no una casilla: en una tabla de
 * treinta filas, una casilla marcada no distingue «esta semana es
 * reconstruida» de «acabo de tocarla sin querer».
 */
function CambiarOrigen({
  obraId,
  semana,
}: {
  obraId: string;
  semana: SemanaEnPantalla;
}) {
  const [estado, marcar] = useActionState<EstadoEstudio, FormData>(
    accionMarcarOrigen,
    {},
  );

  const reconstruida = semana.origenDatos === "RECONSTRUIDO";
  const destino = reconstruida ? "GESTIONADO" : "RECONSTRUIDO";

  return (
    <form action={marcar} className="flex items-center gap-2">
      <input type="hidden" name="obraId" value={obraId} />
      <input type="hidden" name="planId" value={semana.id} />
      <input type="hidden" name="origen" value={destino} />

      <span className="text-xs opacity-70">
        {reconstruida ? "reconstruida" : "gestionada"}
      </span>

      <button
        type="submit"
        className="rounded border px-2 py-0.5 text-xs"
        style={{ borderColor: "var(--borde)" }}
        title={`Marcar la semana ${semana.fechaCorte} como ${destino.toLowerCase()}`}
      >
        marcar {reconstruida ? "gestionada" : "reconstruida"}
      </button>

      {estado.error && (
        <span className="text-xs" style={{ color: "var(--color-peligro)" }}>
          {estado.error}
        </span>
      )}
    </form>
  );
}
