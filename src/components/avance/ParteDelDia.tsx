"use client";

import { useActionState, useMemo, useState } from "react";
import { LoaderCircle, Save, TriangleAlert, CircleCheck } from "lucide-react";
import {
  accionGuardarParte,
  type EstadoParte,
} from "@/app/(dashboard)/obras/[id]/avance/acciones";
import type { GrupoParte } from "@/lib/parte-diario";

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

  /// Solo para contar lo que se va a enviar y poder vaciarlo al guardar. El
  /// valor que se guarda es el del propio campo.
  const [escritos, setEscritos] = useState<Record<number, string>>({});

  const cuantos = useMemo(
    () => Object.values(escritos).filter((v) => v.trim() !== "").length,
    [escritos],
  );

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

      {grupos.map((g) => (
        <section key={g.capitulo}>
          <h3 className="mb-1 text-sm font-semibold opacity-80">{g.capitulo}</h3>
          <div
            className="overflow-x-auto rounded-lg border"
            style={{ borderColor: "var(--borde)" }}
          >
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs opacity-70">
                  <th className="px-3 py-2 font-medium">Partida</th>
                  <th className="px-3 py-2 text-right font-medium">Hoy</th>
                  <th className="px-3 py-2 text-right font-medium">Desfase</th>
                  <th className="px-3 py-2 text-right font-medium">Sin reportar</th>
                  <th className="px-3 py-2 text-right font-medium">Nuevo %</th>
                </tr>
              </thead>
              <tbody>
                {g.filas.map((f) => (
                  <tr
                    key={f.uid}
                    className="border-t"
                    style={{ borderColor: "var(--borde)" }}
                  >
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
                    </td>
                    <td className="px-3 py-1.5 text-right tabular-nums opacity-70">
                      {f.porcentajeActual}%
                    </td>
                    <td
                      className="px-3 py-1.5 text-right tabular-nums"
                      style={
                        Number(f.desfase) < 0 ? { color: "var(--color-peligro)" } : undefined
                      }
                    >
                      {f.desfase}
                    </td>
                    <td className="px-3 py-1.5 text-right tabular-nums opacity-70">
                      {/* «Nunca» no es «hace mucho»: una tarea recien abierta no
                          es una abandonada. */}
                      {f.diasSinReportar === null ? "nunca" : `${f.diasSinReportar} d`}
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
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ))}
    </form>
  );
}
