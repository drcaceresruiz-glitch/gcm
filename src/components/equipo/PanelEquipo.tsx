"use client";

import { useState, useTransition } from "react";
import { ShieldCheck, UserMinus, UserPlus } from "lucide-react";
import { Tarjeta, SeccionTarjeta } from "@/components/ui/Tarjeta";
import { Nota } from "@/components/ui/Nota";
import { Chip } from "@/components/ui/Chip";
import {
  accionAsignarAObra,
  accionQuitarDeObra,
} from "@/app/(dashboard)/obras/[id]/equipo/acciones";
import type { MiembroObra } from "@/services/equipo.service";
import { useMotivoSinEscritura } from "@/components/obras/EscrituraDeLaObra";

/**
 * Quien trabaja en esta obra.
 *
 * Una sola lista con todo el personal activo de la empresa y su estado, en
 * vez de dos tablas: la pregunta real es «quien esta y quien falta», y
 * cruzar dos listas a ojo es justo lo que no debe pedirse.
 *
 * El orden pone arriba a los asignados. Es el equipo de la obra; el resto es
 * de donde se saca a quien falte.
 */
export function PanelEquipo({
  obraId,
  personas,
}: {
  obraId: string;
  personas: MiembroObra[];
}) {
  const [error, setError] = useState<string | null>(null);
  const [enCurso, setEnCurso] = useState<string | null>(null);
  const [, iniciar] = useTransition();

  function cambiar(userId: string, asignar: boolean) {
    setError(null);
    setEnCurso(userId);

    iniciar(async () => {
      const r = asignar
        ? await accionAsignarAObra(obraId, userId)
        : await accionQuitarDeObra(obraId, userId);

      setEnCurso(null);
      if (!r.ok) setError(r.error);
    });
  }

  /*
   * DOS interruptores, y no uno, porque las dos mitades del boton no son la
   * misma regla en el servidor: `asignarAObra` usa el criterio estricto
   * -asignar a alguien es abrir trabajo nuevo- y `quitarDeObra` pasa
   * `{ permiteEnParalizada: true }`, porque sacar a alguien de una obra parada
   * es justo lo que hay que poder hacer mientras dure la parada.
   *
   * Con un solo interruptor, el estricto habria escondido «Quitar de la obra»
   * en una obra PARALIZADA: una funcion que existe y que ademas es la que mas
   * falta hace ahi.
   */
  const sinAsignar = useMotivoSinEscritura() !== null;
  const sinQuitar =
    useMotivoSinEscritura({ permiteEnParalizada: true }) !== null;

  // Los que ya lo ven todo van al final: no hay nada que decidir sobre ellos.
  const orden = [...personas].sort((a, b) => {
    if (a.veTodo !== b.veTodo) return a.veTodo ? 1 : -1;
    if (a.asignado !== b.asignado) return a.asignado ? -1 : 1;
    return a.nombre.localeCompare(b.nombre, "es");
  });

  const asignados = orden.filter((p) => p.asignado && !p.veTodo).length;

  return (
    <Tarjeta>
      <SeccionTarjeta
        primera
        titulo="Equipo de la obra"
        nota={
          asignados === 1
            ? "1 persona tiene esta obra asignada."
            : `${asignados} personas tienen esta obra asignada.`
        }
      >
        <p className="text-sm opacity-70">
          Quien no esté asignado <strong>no ve esta obra</strong>: no le
          aparece en el panel, no puede abrirla y no puede escribir en ella
          aunque tenga el enlace. El administrador de la empresa las ve todas
          sin necesidad de asignación.
        </p>

        {error && <Nota tono="peligro">{error}</Nota>}

        <ul className="divide-y" style={{ borderColor: "var(--borde)" }}>
          {orden.map((p) => (
            <li
              key={p.userId}
              className="flex flex-wrap items-center justify-between gap-3 py-3"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{p.nombre}</p>
                <p className="truncate text-xs opacity-70">
                  {p.email} · {p.etiquetaRol}
                </p>
              </div>

              {p.veTodo ? (
                <Chip tono="neutro" icono={ShieldCheck}>
                  Ve todas las obras
                </Chip>
              ) : (p.asignado ? sinQuitar : sinAsignar) ? null : (
                <button
                  type="button"
                  disabled={enCurso === p.userId}
                  onClick={() => cambiar(p.userId, !p.asignado)}
                  className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs disabled:opacity-50"
                  style={{ borderColor: "var(--borde)" }}
                >
                  {p.asignado ? (
                    <>
                      <UserMinus className="size-3.5" aria-hidden="true" />
                      Quitar de la obra
                    </>
                  ) : (
                    <>
                      <UserPlus className="size-3.5" aria-hidden="true" />
                      Asignar a la obra
                    </>
                  )}
                </button>
              )}
            </li>
          ))}
        </ul>

        {orden.length === 0 && (
          <p className="text-sm opacity-70">
            No hay usuarios activos en la empresa.
          </p>
        )}
      </SeccionTarjeta>
    </Tarjeta>
  );
}
