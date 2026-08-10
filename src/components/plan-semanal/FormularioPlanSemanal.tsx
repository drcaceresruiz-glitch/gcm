"use client";

import { useState, useTransition } from "react";
import { Plus, Trash2, LoaderCircle } from "lucide-react";
import { accionGuardarCompromisos } from "@/app/(dashboard)/obras/[id]/plan-semanal/acciones";
import type { EstadoLookahead } from "@/generated/prisma/enums";

/**
 * Planificar la semana: elegir tareas del cronograma (por uid) y/o anadir
 * lineas libres. Se guarda la lista completa (reemplaza), como el frente de un
 * encargo. Solo mientras la semana esta abierta.
 */

interface Item {
  key: string;
  uid: number | null;
  descripcion: string;
  meta: string;
  /// El PTS por cantidad: cuanto se compromete y en que unidad.
  cantidad: string;
  unidad: string;
  /// Trazabilidad al Lookahead. Viaja de ida y vuelta para no perderse al
  /// guardar (planificar REEMPLAZA la semana entera).
  lookaheadTaskId: string | null;
}

interface TareaOpcion {
  uid: number;
  codigo: string | null;
  nombre: string;
  /// Programada dentro de la semana del corte.
  enSemana: boolean;
  /// Tiene una predecesora pendiente (se puede adelantar igual, con aviso).
  conRestriccion: boolean;
  /// Texto de la restriccion, si la hay.
  restriccion: string | null;
  /// LISTO = sus 7 flujos del Lookahead estan resueltos.
  estadoLookahead: EstadoLookahead | null;
  cantidadSugerida: string | null;
  unidadSugerida: string | null;
}

export function FormularioPlanSemanal({
  obraId,
  planId,
  tareas,
  inicial,
}: {
  obraId: string;
  planId: string;
  tareas: TareaOpcion[];
  inicial: {
    uid: number | null;
    descripcion: string;
    metaPorcentaje: string | null;
    cantidadPlan: string | null;
    unidad: string | null;
    lookaheadTaskId: string | null;
  }[];
}) {
  const [items, setItems] = useState<Item[]>(() =>
    inicial.map((c, i) => ({
      key: `i${i}`,
      uid: c.uid,
      descripcion: c.descripcion,
      meta: c.metaPorcentaje ?? "",
      cantidad: c.cantidadPlan ?? "",
      unidad: c.unidad ?? "",
      lookaheadTaskId: c.lookaheadTaskId,
    })),
  );
  const [uidSel, setUidSel] = useState("");
  const [libre, setLibre] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState(false);
  const [pendiente, iniciar] = useTransition();

  const nuevaKey = () => `n${Math.random().toString(36).slice(2)}`;

  function agregarTarea() {
    const uid = Number(uidSel);
    if (!Number.isSafeInteger(uid)) return;
    const t = tareas.find((x) => x.uid === uid);
    if (!t) return;
    if (items.some((it) => it.uid === uid)) return; // no duplicar la misma tarea
    setItems((p) => [
      ...p,
      {
        key: nuevaKey(),
        uid,
        descripcion: `${t.codigo ? `${t.codigo} ` : ""}${t.nombre}`,
        meta: "",
        // La partida mapeada propone la cantidad; si no se puede, queda vacio.
        cantidad: t.cantidadSugerida ?? "",
        unidad: t.unidadSugerida ?? "",
        lookaheadTaskId: null,
      },
    ]);
    setUidSel("");
    setOk(false);
  }

  function agregarLibre() {
    const d = libre.trim();
    if (!d) return;
    setItems((p) => [
      ...p,
      {
        key: nuevaKey(),
        uid: null,
        descripcion: d,
        meta: "",
        cantidad: "",
        unidad: "",
        lookaheadTaskId: null,
      },
    ]);
    setLibre("");
    setOk(false);
  }

  function quitar(key: string) {
    setItems((p) => p.filter((it) => it.key !== key));
    setOk(false);
  }

  function cambiarCampo(key: string, campo: "cantidad" | "unidad", valor: string) {
    setItems((p) => p.map((it) => (it.key === key ? { ...it, [campo]: valor } : it)));
    setOk(false);
  }

  function cambiarMeta(key: string, meta: string) {
    // La meta es un porcentaje: se topa en 100 al teclear. Deja pasar lo demas
    // (vacio, decimales a medio escribir) y el servidor valida el resto.
    const n = Number(meta.replace(",", "."));
    const v = Number.isFinite(n) && n > 100 ? "100" : meta;
    setItems((p) => p.map((it) => (it.key === key ? { ...it, meta: v } : it)));
    setOk(false);
  }

  function guardar() {
    setOk(false);
    setError(null);
    iniciar(async () => {
      const r = await accionGuardarCompromisos(
        obraId,
        planId,
        items.map((it) => ({
          uid: it.uid,
          descripcion: it.descripcion,
          metaPorcentaje: it.meta.trim() || null,
          // Se reenvian siempre: al reemplazar la semana, lo que no viaja se
          // pierde. Vacio se manda como null (borrar a proposito).
          cantidadPlan: it.cantidad.trim() || null,
          unidad: it.unidad.trim() || null,
          lookaheadTaskId: it.lookaheadTaskId,
        })),
      );
      if (r.ok) setOk(true);
      else setError(r.error ?? "No se pudo guardar.");
    });
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-2">
        <label className="text-xs">
          <span className="block opacity-70">Tarea del cronograma</span>
          <select
            value={uidSel}
            onChange={(e) => setUidSel(e.target.value)}
            className="mt-1 max-w-xs rounded-lg border px-2 py-1.5 text-sm"
            style={{ borderColor: "var(--borde)", backgroundColor: "var(--fondo)" }}
          >
            <option value="">— elegir —</option>
            {(() => {
              const etiqueta = (t: TareaOpcion) =>
                `${t.codigo ? `${t.codigo} ` : ""}${t.nombre}`;
              // Lo LISTO del Lookahead va primero: es lo unico que, segun Last
              // Planner, deberia comprometerse. El resto sigue disponible.
              const listas = tareas.filter((t) => t.estadoLookahead === "LISTO");
              const resto = tareas.filter((t) => t.estadoLookahead !== "LISTO");
              const deSemana = resto.filter((t) => t.enSemana);
              const adelantar = resto.filter((t) => !t.enSemana && !t.conRestriccion);
              const restringidas = resto.filter((t) => !t.enSemana && t.conRestriccion);
              return (
                <>
                  {listas.length > 0 && (
                    <optgroup label="Listas (Lookahead)">
                      {listas.map((t) => (
                        <option key={t.uid} value={t.uid}>{etiqueta(t)}</option>
                      ))}
                    </optgroup>
                  )}
                  {deSemana.length > 0 && (
                    <optgroup label="De esta semana (sin liberar)">
                      {deSemana.map((t) => (
                        <option key={t.uid} value={t.uid}>{etiqueta(t)}</option>
                      ))}
                    </optgroup>
                  )}
                  {adelantar.length > 0 && (
                    <optgroup label="Se pueden adelantar">
                      {adelantar.map((t) => (
                        <option key={t.uid} value={t.uid}>{etiqueta(t)}</option>
                      ))}
                    </optgroup>
                  )}
                  {restringidas.length > 0 && (
                    <optgroup label="Con restricción (predecesora pendiente)">
                      {restringidas.map((t) => (
                        <option key={t.uid} value={t.uid}>
                          {etiqueta(t)} — ⚠ {t.restriccion}
                        </option>
                      ))}
                    </optgroup>
                  )}
                </>
              );
            })()}
          </select>
        </label>
        <button
          type="button"
          onClick={agregarTarea}
          className="inline-flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-xs font-medium"
          style={{ borderColor: "var(--borde)" }}
        >
          <Plus className="size-3.5" aria-hidden="true" />
          Añadir tarea
        </button>

        <label className="min-w-48 flex-1 text-xs">
          <span className="block opacity-70">Compromiso libre</span>
          <input
            value={libre}
            onChange={(e) => setLibre(e.target.value)}
            placeholder="Trabajo que no es una tarea de Project"
            className="mt-1 w-full rounded-lg border px-2 py-1.5 text-sm"
            style={{ borderColor: "var(--borde)", backgroundColor: "var(--fondo)" }}
          />
        </label>
        <button
          type="button"
          onClick={agregarLibre}
          className="inline-flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-xs font-medium"
          style={{ borderColor: "var(--borde)" }}
        >
          <Plus className="size-3.5" aria-hidden="true" />
          Añadir libre
        </button>
      </div>

      {items.length === 0 ? (
        <p className="text-sm opacity-60">
          Aún no hay compromisos. Añade tareas o líneas libres para esta semana.
        </p>
      ) : (
        <ul className="space-y-1.5">
          {items.map((it) => (
            <li
              key={it.key}
              className="flex flex-wrap items-center gap-2 rounded-lg border p-2 text-sm"
              style={{ borderColor: "var(--borde)" }}
            >
              <span className="flex-1">
                {it.uid !== null && (
                  <span className="mr-1 text-xs opacity-50">[tarea]</span>
                )}
                {it.descripcion}
              </span>
              <label className="text-xs opacity-70">
                cant.
                <input
                  value={it.cantidad}
                  onChange={(e) => cambiarCampo(it.key, "cantidad", e.target.value)}
                  inputMode="decimal"
                  placeholder="0.00"
                  title="Cantidad comprometida. Usa punto decimal (12.5)."
                  className="ml-1 w-20 rounded border px-1.5 py-1 text-xs tabular-nums"
                  style={{ borderColor: "var(--borde)", backgroundColor: "var(--fondo)" }}
                />
              </label>
              <label className="text-xs opacity-70">
                und.
                <input
                  value={it.unidad}
                  onChange={(e) => cambiarCampo(it.key, "unidad", e.target.value)}
                  maxLength={20}
                  placeholder="m2"
                  title="Unidad de medida"
                  className="ml-1 w-16 rounded border px-1.5 py-1 text-xs"
                  style={{ borderColor: "var(--borde)", backgroundColor: "var(--fondo)" }}
                />
              </label>
              <label className="text-xs opacity-70">
                meta
                <input
                  value={it.meta}
                  onChange={(e) => cambiarMeta(it.key, e.target.value)}
                  inputMode="decimal"
                  placeholder="0-100"
                  title="Porcentaje de 0 a 100"
                  className="ml-1 w-16 rounded border px-1.5 py-1 text-xs tabular-nums"
                  style={{ borderColor: "var(--borde)", backgroundColor: "var(--fondo)" }}
                />
              </label>
              <button
                type="button"
                onClick={() => quitar(it.key)}
                aria-label="Quitar compromiso"
                className="rounded p-1 opacity-60 hover:opacity-100"
              >
                <Trash2 className="size-4" aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={guardar}
          disabled={pendiente}
          className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-white disabled:opacity-60"
          style={{ backgroundColor: "var(--color-marca-600)" }}
        >
          {pendiente && <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />}
          Guardar compromisos
        </button>
        {ok && <span className="text-sm" style={{ color: "var(--color-exito)" }}>Guardado</span>}
        {error && <span className="text-sm" style={{ color: "var(--color-peligro)" }}>{error}</span>}
      </div>
    </div>
  );
}
