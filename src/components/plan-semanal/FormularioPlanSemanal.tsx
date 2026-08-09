"use client";

import { useState, useTransition } from "react";
import { Plus, Trash2, LoaderCircle } from "lucide-react";
import { accionGuardarCompromisos } from "@/app/(dashboard)/obras/[id]/plan-semanal/acciones";

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
  inicial: { uid: number | null; descripcion: string; metaPorcentaje: string | null }[];
}) {
  const [items, setItems] = useState<Item[]>(() =>
    inicial.map((c, i) => ({
      key: `i${i}`,
      uid: c.uid,
      descripcion: c.descripcion,
      meta: c.metaPorcentaje ?? "",
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
      { key: nuevaKey(), uid, descripcion: `${t.codigo ? `${t.codigo} ` : ""}${t.nombre}`, meta: "" },
    ]);
    setUidSel("");
    setOk(false);
  }

  function agregarLibre() {
    const d = libre.trim();
    if (!d) return;
    setItems((p) => [...p, { key: nuevaKey(), uid: null, descripcion: d, meta: "" }]);
    setLibre("");
    setOk(false);
  }

  function quitar(key: string) {
    setItems((p) => p.filter((it) => it.key !== key));
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
              const deSemana = tareas.filter((t) => t.enSemana);
              const adelantar = tareas.filter((t) => !t.enSemana && !t.conRestriccion);
              const restringidas = tareas.filter((t) => !t.enSemana && t.conRestriccion);
              return (
                <>
                  {deSemana.length > 0 && (
                    <optgroup label="De esta semana">
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
                    <optgroup label="Con restriccion (predecesora pendiente)">
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
          Anadir tarea
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
          Anadir libre
        </button>
      </div>

      {items.length === 0 ? (
        <p className="text-sm opacity-60">
          Aun no hay compromisos. Anade tareas o lineas libres para esta semana.
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
