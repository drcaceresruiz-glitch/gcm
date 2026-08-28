"use client";

import { useActionState } from "react";
import { AlertCircle, Check } from "lucide-react";

import {
  accionDeclararApertura,
  accionFijarInterrupcion,
  accionMarcarOrigen,
  accionSembrarPiloto,
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

export interface AnalisisEnPantalla {
  id: string;
  causa: string;
  registrado: string;
  aperturaDeclarada: string;
  cerrado: string;
}

/**
 * Fechar a mano la apertura de los analisis de causa raiz.
 *
 * SOLO SIRVE PARA LOS RECONSTRUIDOS, y por eso la tabla dice de donde viene
 * cada fecha. Un analisis registrado el dia que ocurrio no necesita nada: su
 * fecha de registro ES su apertura. Los que se cargan despues, al reconstruir
 * un periodo anterior, nacen todos con la fecha de hoy, y sin corregirla la
 * latencia de reaccion de ese tramo no significa nada.
 */
export function AnalisisDelEstudio({
  obraId,
  analisis,
}: {
  obraId: string;
  analisis: readonly AnalisisEnPantalla[];
}) {
  if (analisis.length === 0) {
    return (
      <section className="space-y-2">
        <h3 className="text-sm font-semibold">Análisis de causa raíz</h3>
        <p className="max-w-3xl text-sm text-pretty opacity-70">
          Esta obra todavía no tiene ninguno. Sin análisis no hay tasa de
          recurrencia ni latencia de reacción que medir: son la variable de
          aprendizaje organizacional.
        </p>
      </section>
    );
  }

  return (
    <section className="space-y-2">
      <h3 className="text-sm font-semibold">Análisis de causa raíz</h3>
      <p className="max-w-3xl text-sm text-pretty opacity-70">
        Si cargaste análisis de un periodo anterior, declara aquí{" "}
        <strong>cuándo se abrieron de verdad</strong>. Todos nacen con la fecha
        del día en que se escribieron, y la latencia de reacción se mide desde
        ahí: sin corregirla, ese tramo del estudio mide cuándo tecleaste, no
        cuándo reaccionó la obra. Déjala vacía en los que se registraron sobre
        la marcha.
      </p>

      <div
        className="overflow-x-auto rounded-xl border"
        style={{ borderColor: "var(--borde)" }}
      >
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left" style={{ backgroundColor: "var(--superficie)" }}>
              <th className="p-2 font-medium">Causa</th>
              <th className="p-2 font-medium">Registrado</th>
              <th className="p-2 font-medium">Cerrado</th>
              <th className="p-2 font-medium">Apertura real</th>
            </tr>
          </thead>
          <tbody>
            {analisis.map((a) => (
              <tr key={a.id} style={{ borderTop: "1px solid var(--borde)" }}>
                <td className="p-2 font-medium">{a.causa}</td>
                <td className="p-2 tabular-nums opacity-70">{a.registrado}</td>
                <td className="p-2 tabular-nums opacity-70">
                  {a.cerrado || <span className="opacity-60">sin cerrar</span>}
                </td>
                <td className="p-2">
                  <DeclararApertura obraId={obraId} analisis={a} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function DeclararApertura({
  obraId,
  analisis,
}: {
  obraId: string;
  analisis: AnalisisEnPantalla;
}) {
  const [estado, declarar] = useActionState<EstadoEstudio, FormData>(
    accionDeclararApertura,
    {},
  );

  return (
    <form action={declarar} className="flex items-center gap-2">
      <input type="hidden" name="obraId" value={obraId} />
      <input type="hidden" name="analisisId" value={analisis.id} />

      <input
        type="date"
        name="fecha"
        defaultValue={analisis.aperturaDeclarada}
        className="rounded border px-2 py-1 text-xs"
        style={{ borderColor: "var(--borde)", backgroundColor: "var(--fondo)" }}
      />

      <button
        type="submit"
        className="rounded border px-2 py-1 text-xs"
        style={{ borderColor: "var(--borde)" }}
      >
        guardar
      </button>

      {estado.error && (
        <span className="text-xs" style={{ color: "var(--color-peligro)" }}>
          {estado.error}
        </span>
      )}
      {estado.ok && <Check className="size-3.5 opacity-60" aria-hidden="true" />}
    </form>
  );
}

/**
 * La obra de ensayo: crearla, ir a ella o borrarla.
 *
 * Sirve para verificar el analisis estadistico ANTES de tener una obra real
 * midiendo. Los datos son simulados y deterministas: dos personas que la
 * generen obtienen la misma muestra, asi que un resultado del ensayo se puede
 * reproducir y discutir.
 *
 * SE DICE QUE SON SIMULADOS EN LA PROPIA TARJETA y el nombre de la obra
 * empieza por «PILOTO». Una obra de mentira que no se anuncia acaba en un
 * informe de gerencia.
 */
export function ObraDeEnsayo({
  existente,
}: {
  /// El id de la obra piloto si ya esta creada.
  existente: string | null;
}) {
  const [estado, sembrar] = useActionState<EstadoEstudio, FormData>(
    accionSembrarPiloto,
    {},
  );

  return (
    <section
      className="space-y-3 rounded-xl border p-5"
      style={{ borderColor: "var(--borde)" }}
    >
      <div>
        <h3 className="text-sm font-semibold">Obra de ensayo</h3>
        <p className="mt-1 max-w-3xl text-sm text-pretty opacity-70">
          Veinte semanas <strong>simuladas</strong> —diez antes de implantar y
          diez después— para probar el análisis estadístico completo antes de
          tener una obra real midiendo. Trae a propósito los casos incómodos:
          una semana sin restricciones, otra con una sola, tareas sin terminar
          y un análisis de causa raíz que no funcionó.
        </p>
        <p className="mt-1 max-w-3xl text-xs text-pretty opacity-60">
          Los datos son deterministas: se regenera siempre igual, así que un
          resultado del ensayo se puede reproducir. La obra se llama «PILOTO» y
          nace en planificación, para que no se confunda con una real.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        {existente && (
          <a
            href={`/obras/${existente}/investigacion`}
            className="text-sm font-medium underline underline-offset-2"
          >
            Ir a la obra de ensayo
          </a>
        )}

        <form action={sembrar} className="flex flex-wrap items-center gap-2">
          <button
            type="submit"
            name="accion"
            value="sembrar"
            className="rounded-lg border px-3 py-1.5 text-sm font-medium"
            style={{ borderColor: "var(--borde)" }}
          >
            {existente ? "Regenerar" : "Crear la obra de ensayo"}
          </button>

          {existente && (
            <button
              type="submit"
              name="accion"
              value="borrar"
              className="rounded-lg px-3 py-1.5 text-sm"
              style={{ color: "var(--color-peligro)" }}
            >
              Borrarla
            </button>
          )}
        </form>
      </div>

      {estado.error && (
        <p role="alert" className="text-sm" style={{ color: "var(--color-peligro)" }}>
          {estado.error}
        </p>
      )}
    </section>
  );
}
