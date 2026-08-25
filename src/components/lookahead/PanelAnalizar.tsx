"use client";

import { useState, useTransition } from "react";
import { LoaderCircle, X } from "lucide-react";
import { FLUJOS_RESTRICCION, type ModoFlujos } from "@/lib/lookahead";
import {
  accionFijarFlujos,
  accionSinRestricciones,
} from "@/app/(dashboard)/obras/[id]/lookahead/acciones";
import type { TipoRestriccion } from "@/generated/prisma/enums";
import type { ResultadoAnalisis } from "@/services/lookahead.service";
import { useMotivoSinEscritura } from "@/components/obras/EscrituraDeLaObra";

/**
 * Decir QUE flujos de restriccion aplican a las tareas elegidas.
 *
 * Es el corazon del cambio: antes toda tarea nacia con las siete puestas y
 * nadie las habia elegido. Ahora las siete son el CHECKLIST de preguntas y
 * aqui se responde cuales de ellas son un problema real en esta tarea.
 *
 * Se despliega bajo la matriz y no en un dialogo, igual que
 * `PanelComprometer`: no hay componente modal en el proyecto y en un movil de
 * obra un panel que empuja la pagina se maneja mejor que una ventana flotante.
 *
 * "No le aplica ninguna" es un BOTON aparte y no la lista vacia del mismo
 * boton. Es la respuesta mas frecuente y la que el usuario final pidio por su
 * nombre; esconderla detras de "no marques nada y guarda" la haria parecer un
 * olvido en vez de una decision.
 */

const MOTIVO: Record<string, string> = {
  resuelta: "ya estaba levantada",
  "con-fotos": "tiene fotos de evidencia",
  "con-datos": "tiene una nota o un documento",
};

export function PanelAnalizar({
  obraId,
  uids,
  onCerrar,
}: {
  obraId: string;
  /// Las tareas elegidas en la matriz.
  uids: number[];
  /// Cierra el panel. La seleccion se limpia fuera, al cerrar y no al
  /// guardar: si se limpiara antes, el panel se quedaria sin tareas y se
  /// desmontaria llevandose el resultado sin que diera tiempo a leerlo.
  onCerrar: () => void;
}) {
  const [elegidos, setElegidos] = useState<Set<TipoRestriccion>>(new Set());
  const [modo, setModo] = useState<ModoFlujos>("reemplazar");
  const [hecho, setHecho] = useState<
    Extract<ResultadoAnalisis, { ok: true }> | null
  >(null);
  const [error, setError] = useState<string | null>(null);
  const [pendiente, iniciar] = useTransition();

  /*
   * En una obra que no admite cambios no se ofrece: `fijarFlujos` lo
   * rechaza, y un boton que siempre falla invita a probar. El motivo se
   * explica una vez por pantalla, no en cada control.
   * Mismas opciones que el servidor: sin excepciones.
   * Va DESPUES del ultimo hook: un `return` por delante de una llamada a
   * un hook cambia el orden entre renders y React lo prohibe.
   */
  const sinEscritura = useMotivoSinEscritura() !== null;
  if (sinEscritura) return null;

  function alternar(tipo: TipoRestriccion) {
    setElegidos((p) => {
      const s = new Set(p);
      if (s.has(tipo)) s.delete(tipo);
      else s.add(tipo);
      return s;
    });
  }

  function guardar(sinNinguna: boolean) {
    setError(null);
    iniciar(async () => {
      const r = sinNinguna
        ? await accionSinRestricciones(obraId, uids)
        : await accionFijarFlujos(obraId, uids, [...elegidos], modo);

      if (r.ok) setHecho(r);
      else setError(r.error);
    });
  }

  if (hecho) {
    return (
      <div
        className="rounded-lg border p-4 text-sm"
        style={{ borderColor: "var(--color-exito)" }}
      >
        <p>
          <strong>{hecho.tareas}</strong>{" "}
          {hecho.tareas === 1 ? "tarea analizada" : "tareas analizadas"}
          {hecho.creadas > 0 && <> · {hecho.creadas} restricción(es) añadida(s)</>}
          {hecho.borradas > 0 && <> · {hecho.borradas} retirada(s)</>}.
        </p>

        {/* Lo que NO se pudo quitar. Se dice siempre: quedarse callado aqui
            haria creer que la tarea quedo limpia cuando no lo esta. */}
        {hecho.conservadas.length > 0 && (
          <div className="mt-2">
            <p style={{ color: "var(--color-alerta)" }}>
              {hecho.conservadas.length} restricción(es) se conservaron porque
              tenían trabajo dentro: quitarlas habría tirado evidencia o el
              registro de quién las levantó.
            </p>
            <ul className="ml-4 mt-1 list-disc opacity-70">
              {hecho.conservadas.map((c) => (
                <li key={`${c.uid}-${c.tipo}`}>
                  {ETIQUETA.get(c.tipo) ?? c.tipo} ({MOTIVO[c.motivo] ?? c.motivo})
                </li>
              ))}
            </ul>
          </div>
        )}

        <button
          type="button"
          onClick={onCerrar}
          className="mt-3 text-sm font-medium underline"
        >
          Seguir en el Lookahead
        </button>
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
            Analizar {uids.length} {uids.length === 1 ? "tarea" : "tareas"}
          </h3>
          <p className="mt-0.5 max-w-prose text-sm opacity-70">
            Hazte las siete preguntas y marca solo los flujos que de verdad
            frenan este trabajo. Lo que marques queda como restricción por
            levantar; lo que no, deja de pedirse.
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

      <ul className="grid gap-1 sm:grid-cols-2">
        {FLUJOS_RESTRICCION.map((f) => (
          <li key={f.tipo}>
            {/* El label entero es tocable, no solo la casilla: en obra esto se
                usa con el dedo. */}
            <label className="flex min-h-11 items-start gap-2.5 py-1 text-sm">
              <input
                type="checkbox"
                checked={elegidos.has(f.tipo)}
                onChange={() => alternar(f.tipo)}
                className="mt-1 size-4 shrink-0"
                style={{ accentColor: "var(--color-marca-600)" }}
              />
              <span>
                <span className="font-medium">{f.etiqueta}</span>
                <span className="block text-xs opacity-60">{f.descripcion}</span>
              </span>
            </label>
          </li>
        ))}
      </ul>

      {/* Solo importa cuando alguna elegida ya tiene flujos: con tareas
          vacias los dos modos hacen lo mismo, y el selector seria ruido. */}
      <fieldset className="text-xs">
        <legend className="opacity-70">Si alguna ya tenía restricciones</legend>
        <div className="mt-1 flex flex-wrap gap-4">
          <label className="flex items-center gap-2">
            <input
              type="radio"
              name="modo-flujos"
              checked={modo === "reemplazar"}
              onChange={() => setModo("reemplazar")}
              className="size-4"
              style={{ accentColor: "var(--color-marca-600)" }}
            />
            Dejar solo estas
          </label>
          <label className="flex items-center gap-2">
            <input
              type="radio"
              name="modo-flujos"
              checked={modo === "agregar"}
              onChange={() => setModo("agregar")}
              className="size-4"
              style={{ accentColor: "var(--color-marca-600)" }}
            />
            Añadir a las que ya tienen
          </label>
        </div>
      </fieldset>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => guardar(false)}
          disabled={pendiente || elegidos.size === 0}
          className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-white disabled:opacity-60"
          style={{ backgroundColor: "var(--color-marca-600)" }}
        >
          {pendiente && (
            <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
          )}
          Guardar {elegidos.size > 0 && `(${elegidos.size})`}
        </button>

        <button
          type="button"
          onClick={() => guardar(true)}
          disabled={pendiente}
          className="rounded-lg border px-3 py-2 text-sm font-medium disabled:opacity-60"
          style={{ borderColor: "var(--borde)" }}
        >
          No les aplica ninguna
        </button>

        <button
          type="button"
          onClick={onCerrar}
          className="text-sm opacity-70 underline"
        >
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

const ETIQUETA = new Map(FLUJOS_RESTRICCION.map((f) => [f.tipo, f.etiqueta]));
