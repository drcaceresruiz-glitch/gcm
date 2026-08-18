"use client";

import { useActionState, useMemo, useRef, useState } from "react";
import { LoaderCircle, Save, TriangleAlert, CircleCheck } from "lucide-react";
import {
  accionGuardarParte,
  type EstadoParte,
} from "@/app/(dashboard)/obras/[id]/avance/acciones";
import type { GrupoParte } from "@/lib/parte-diario";
import { conSignoFijo } from "@/lib/redondeo";

/**
 * El barrido del dia: todas las tareas abiertas, una casilla cada una, un solo
 * envio.
 *
 * Dos cosas que parecen de estilo y no lo son:
 *
 * 1. **Las casillas nacen VACIAS.** El porcentaje de hoy se ensena al lado, en
 *    texto. Prellenarlas seria poner un valor por defecto en cien campos, y de
 *    ahi vino el peor defecto que ha tenido este sistema: escribir 100% donde
 *    nadie escribio nada, que falsificaba la curva S al alza.
 * 2. **No hay «marcar todas».** Rellenar cien tareas de golpe es exactamente lo
 *    que no debe poder hacerse sin haberlas mirado.
 *
 * Y una de ergonomia que pesa mas que las dos: esto se rellena a teclado, de
 * arriba abajo, con el movil o el portatil apoyado en cualquier sitio. Por eso
 * ENTER salta a la casilla siguiente en vez de enviar el formulario, que es lo
 * que hacia antes: a media captura de cien tareas, un Enter de reflejo
 * guardaba lo que llevaras escrito y recargaba la pantalla.
 */
export function ParteDelDia({
  obraId,
  grupos,
  hoyIso,
}: {
  obraId: string;
  grupos: GrupoParte[];
  hoyIso: string;
}) {
  const [estado, enviar, pendiente] = useActionState<EstadoParte, FormData>(
    accionGuardarParte,
    {},
  );

  /// Solo para contar lo que se va a enviar. El valor que se guarda es el del
  /// propio campo.
  const [escritos, setEscritos] = useState<Record<number, string>>({});

  /// El orden de captura, aplanado: es el que sigue el salto con Enter.
  const orden = useMemo(
    () => grupos.flatMap((g) => g.filas.map((f) => f.uid)),
    [grupos],
  );

  const casillas = useRef(new Map<number, HTMLInputElement>());

  const cuantos = useMemo(
    () => Object.values(escritos).filter((v) => v.trim() !== "").length,
    [escritos],
  );

  /// Cuantas no se han reportado NUNCA y cuantas van por detras. Sale del
  /// mismo dato que ya se pinta por fila; arriba sirve para saber por donde
  /// empezar cuando la lista es larga.
  const resumen = useMemo(() => {
    const filas = grupos.flatMap((g) => g.filas);
    // Lo que se esta a punto de reportar FUERA del plan: se cuenta sobre lo
    // escrito, no sobre la lista entera. Que la obra tenga diez partidas sin
    // comprometer no importa mientras nadie reporte avance en ellas; lo que
    // hay que ver es que de las tres que estas mandando, dos no las prometio
    // nadie. Ahi es donde el PPC de la semana deja de significar algo.
    const conValor = filas.filter((f) => (escritos[f.uid] ?? "").trim() !== "");
    return {
      total: filas.length,
      nunca: filas.filter((f) => f.diasSinReportar === null).length,
      atrasadas: filas.filter((f) => Number(f.desfase) < 0).length,
      fueraDePlan: conValor.filter((f) => f.sinComprometer).length,
      conRestriccion: conValor.filter((f) => f.restriccionesAbiertas > 0).length,
    };
  }, [grupos, escritos]);

  function alTeclear(e: React.KeyboardEvent<HTMLInputElement>, uid: number) {
    if (e.key !== "Enter") return;
    // Sin esto, Enter envia el formulario: el comportamiento por defecto de un
    // input suelto dentro de un <form>.
    e.preventDefault();

    const i = orden.indexOf(uid);
    const siguiente = orden[i + 1];
    if (siguiente === undefined) {
      casillas.current.get(uid)?.blur();
      return;
    }
    const campo = casillas.current.get(siguiente);
    campo?.focus();
    campo?.select();
  }

  return (
    <form action={enviar} className="space-y-4">
      <input type="hidden" name="obraId" value={obraId} />

      <div
        className="sticky top-0 z-10 flex flex-wrap items-end justify-between gap-3 rounded-lg border p-3"
        style={{ borderColor: "var(--borde)", backgroundColor: "var(--fondo)" }}
      >
        <label className="text-xs">
          <span className="block opacity-70">Día del parte</span>
          {/* Una sola fecha para todo el parte: es un dia de obra, no cien
              reportes sueltos. Se puede retroceder —el caso de «lo dejo para el
              viernes»— pero nunca adelantar. */}
          <input
            type="date"
            name="fecha"
            defaultValue={hoyIso}
            max={hoyIso}
            required
            className="mt-1 rounded-lg border px-2 py-1.5 text-sm"
            style={{ borderColor: "var(--borde)", backgroundColor: "var(--fondo)" }}
          />
        </label>

        <p className="text-xs opacity-70">
          {resumen.total} {resumen.total === 1 ? "tarea" : "tareas"}
          {resumen.nunca > 0 && ` · ${resumen.nunca} sin reportar nunca`}
          {resumen.atrasadas > 0 && ` · ${resumen.atrasadas} por detrás del plan`}
        </p>
        {(resumen.fueraDePlan > 0 || resumen.conRestriccion > 0) && (
          <p className="text-xs" style={{ color: "var(--color-alerta)" }}>
            {resumen.fueraDePlan > 0 &&
              `${resumen.fueraDePlan} de las que estás reportando no las comprometió nadie esta semana.`}
            {resumen.fueraDePlan > 0 && resumen.conRestriccion > 0 && " "}
            {resumen.conRestriccion > 0 &&
              `${resumen.conRestriccion} avanza(n) con restricciones sin levantar.`}
          </p>
        )}

        <button
          type="submit"
          disabled={pendiente || cuantos === 0}
          className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
          style={{ backgroundColor: "var(--color-marca-600)" }}
        >
          {pendiente ? (
            <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
          ) : (
            <Save className="size-4" aria-hidden="true" />
          )}
          Guardar el parte ({cuantos})
        </button>
      </div>

      {estado.error && (
        <p
          className="flex items-start gap-2 rounded-lg border p-3 text-sm"
          style={{
            borderColor: "var(--color-peligro)",
            backgroundColor: "color-mix(in srgb, var(--color-peligro) 8%, transparent)",
          }}
        >
          <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          {/* Un valor malo no guarda NADA. Decirlo aqui evita que alguien crea
              que entraron las demas. */}
          <span>{estado.error} No se guardó ninguna tarea.</span>
        </p>
      )}

      {estado.ok && estado.mensaje && (
        <p
          className="flex items-center gap-2 rounded-lg border p-3 text-sm"
          style={{
            borderColor: "var(--color-exito)",
            backgroundColor: "color-mix(in srgb, var(--color-exito) 8%, transparent)",
          }}
        >
          <CircleCheck className="size-4 shrink-0" aria-hidden="true" />
          {estado.mensaje}
        </p>
      )}

      {/* UNA SOLA TABLA, con el capitulo como fila separadora.
          
          Antes cada capitulo abria su propia tabla con su propia cabecera: con
          cuatro tareas repartidas en dos capitulos salian dos juegos de
          «Partida · Hoy · Desfase · Sin reportar · Nuevo %», mas cabecera que
          datos. En una lista de cien filas y trece capitulos, eso son trece
          cabeceras entre medias y las columnas bailando de sitio. */}
      <div
        className="overflow-x-auto rounded-lg border"
        style={{ borderColor: "var(--borde)" }}
      >
        <table className="w-full text-sm">
          {/* `top-0`, NO `top-[73px]`.
              
              Los 73px se pusieron pensando en la cabecera de la app, pero el
              envoltorio de arriba lleva `overflow-x-auto` y eso lo convierte
              en su propio contenedor de scroll (`overflow-y` pasa a `auto`).
              El pegado se mide desde el borde de la TABLA, no de la ventana:
              la cabecera aparcaba 73px mas abajo de su sitio, justo encima de
              la primera fila, y con fondo opaco y z-5 la borraba de la vista.
              La partida 1.1 existia, se contaba y no se podia reportar. */}
          <thead className="sticky top-0 z-[5]" style={{ backgroundColor: "var(--superficie)" }}>
            <tr className="text-left text-xs opacity-70">
              <th className="px-3 py-2 font-medium">Partida</th>
              <th className="px-3 py-2 text-right font-medium">Hoy</th>
              <th className="px-3 py-2 text-right font-medium">Desfase</th>
              <th className="px-3 py-2 text-right font-medium">Sin reportar</th>
              <th className="px-3 py-2 text-right font-medium">Nuevo %</th>
            </tr>
          </thead>
          <tbody>
            {grupos.map((g) => (
              <Capitulo
                key={g.capitulo}
                grupo={g}
                escritos={escritos}
                setEscritos={setEscritos}
                casillas={casillas}
                alTeclear={alTeclear}
              />
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-xs opacity-60">
        Enter salta a la casilla siguiente. Lo que dejes en blanco no se guarda.
      </p>
    </form>
  );
}

function Capitulo({
  grupo,
  escritos,
  setEscritos,
  casillas,
  alTeclear,
}: {
  grupo: GrupoParte;
  escritos: Record<number, string>;
  setEscritos: React.Dispatch<React.SetStateAction<Record<number, string>>>;
  casillas: React.RefObject<Map<number, HTMLInputElement>>;
  alTeclear: (e: React.KeyboardEvent<HTMLInputElement>, uid: number) => void;
}) {
  return (
    <>
      <tr>
        <th
          colSpan={5}
          scope="colgroup"
          className="border-t px-3 py-1.5 text-left text-xs font-semibold"
          style={{
            borderColor: "var(--borde)",
            backgroundColor: "color-mix(in oklab, var(--borde) 25%, transparent)",
          }}
        >
          {grupo.capitulo}
        </th>
      </tr>
      {grupo.filas.map((f) => {
        const desfase = Number(f.desfase);
        return (
          <tr key={f.uid} className="border-t" style={{ borderColor: "var(--borde)" }}>
            <td className="px-3 py-1.5">
              {f.codigo && <span className="opacity-60">{f.codigo} </span>}
              {f.nombre}
              {f.esCritico && (
                <span
                  className="ml-2 rounded px-1 text-[10px] font-medium"
                  style={{
                    color: "var(--color-peligro)",
                    backgroundColor:
                      "color-mix(in srgb, var(--color-peligro) 12%, transparent)",
                  }}
                >
                  crítica
                </span>
              )}
              {/* El parte NUNCA discute la realidad: si la cuadrilla avanzo,
                  avanzo. Pero si nadie lo comprometio, el PPC de esa semana
                  no cubre este trabajo, y un PPC que no cubre lo que se hace
                  no mide confiabilidad. Se ensena; no se impide. */}
              {f.sinComprometer && (
                <span
                  className="ml-2 rounded px-1 text-[10px] font-medium"
                  style={{
                    color: "var(--color-alerta)",
                    backgroundColor:
                      "color-mix(in srgb, var(--color-alerta) 12%, transparent)",
                  }}
                  title="Ninguna semana abierta la comprometió: avanza fuera del plan y el PPC no la cuenta."
                >
                  sin comprometer
                </span>
              )}
              {f.restriccionesAbiertas > 0 && (
                <span
                  className="ml-2 rounded px-1 text-[10px] font-medium"
                  style={{
                    color: "var(--color-peligro)",
                    backgroundColor:
                      "color-mix(in srgb, var(--color-peligro) 12%, transparent)",
                  }}
                  title="Tiene restricciones sin levantar en el Lookahead."
                >
                  {f.restriccionesAbiertas} restricción
                  {f.restriccionesAbiertas === 1 ? "" : "es"}
                </span>
              )}
            </td>
            <td className="px-3 py-1.5 text-right tabular-nums opacity-70">
              {f.porcentajeActual}%
            </td>
            {/* Con signo: un «70.00» a secas no dice si va setenta puntos por
                delante o por detras del plan, que es justo lo que se pregunta
                quien esta a punto de escribir el avance. */}
            <td
              className="px-3 py-1.5 text-right tabular-nums"
              style={
                desfase < 0
                  ? { color: "var(--color-peligro)" }
                  : desfase > 0
                    ? { color: "var(--color-exito)" }
                    : { opacity: 0.5 }
              }
            >
              {conSignoFijo(desfase, 1)}
            </td>
            <td className="px-3 py-1.5 text-right tabular-nums opacity-70">
              {/* «Nunca» no es «hace mucho»: una tarea recien abierta no es una
                  abandonada. Se destaca porque es por donde hay que empezar. */}
              {f.diasSinReportar === null ? (
                <span style={{ color: "var(--color-alerta)" }}>nunca</span>
              ) : (
                `${f.diasSinReportar} d`
              )}
            </td>
            <td className="px-3 py-1.5 text-right">
              <input
                type="text"
                inputMode="decimal"
                name={`avance-${f.uid}`}
                value={escritos[f.uid] ?? ""}
                onChange={(e) =>
                  setEscritos((p) => ({ ...p, [f.uid]: e.target.value }))
                }
                onKeyDown={(e) => alTeclear(e, f.uid)}
                ref={(el) => {
                  if (el) casillas.current.set(f.uid, el);
                  else casillas.current.delete(f.uid);
                }}
                placeholder="—"
                aria-label={`Avance de ${f.nombre}`}
                className="w-20 rounded-lg border px-2 py-1 text-right text-sm"
                style={{
                  borderColor: "var(--borde)",
                  backgroundColor: "var(--fondo)",
                }}
              />
            </td>
          </tr>
        );
      })}
    </>
  );
}
