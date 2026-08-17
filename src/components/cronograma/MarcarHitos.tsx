"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, Diamond, LoaderCircle, Trash2 } from "lucide-react";

import {
  accionCrearHito,
  accionEliminarHito,
} from "@/app/(dashboard)/obras/[id]/cronograma/acciones-hitos";

export interface HitoMarcado {
  uid: number;
  nombre: string;
  fecha: string;
  anclaCodigo: string | null;
  diasAviso: number;
}

/// Una partida o capitulo al que anclar el hito.
export interface AnclaPosible {
  codigo: string;
  nombre: string;
  nivel: number;
}

const VACIO = { nombre: "", fecha: "", anclaCodigo: "", diasAviso: "7" };

/**
 * Marcar los hitos de la obra sobre la EDT.
 *
 * Un hito es un acontecimiento —«fin de estructuras»—, no trabajo: dura cero
 * dias y no lleva dinero. Por eso se ANADE como fila nueva y nunca se convierte
 * una partida en hito: eso la sacaria de la valorizacion.
 *
 * El ancla es lo que le da sitio. Sin ella el hito vive al final del
 * cronograma; con ella se coloca detras de toda la rama de esa partida, y ahi
 * se queda por mucho que el presupuesto cambie.
 */
export function MarcarHitos({
  obraId,
  hitos,
  anclas,
  puedeEditar,
  puedeEliminar,
}: {
  obraId: string;
  hitos: HitoMarcado[];
  anclas: AnclaPosible[];
  puedeEditar: boolean;
  puedeEliminar: boolean;
}) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [campos, setCampos] = useState({ ...VACIO });
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [porConfirmar, setPorConfirmar] = useState<{ uid: number; texto: string } | null>(null);
  const [yendo, ir] = useTransition();

  if (!puedeEditar && hitos.length === 0) return null;

  function crear() {
    setError(null);
    setAviso(null);

    ir(async () => {
      const r = await accionCrearHito(obraId, {
        nombre: campos.nombre,
        fecha: campos.fecha,
        anclaCodigo: campos.anclaCodigo || null,
        diasAviso: Number(campos.diasAviso) || 0,
      });

      if (!r.ok) {
        setError(r.error ?? "No se pudo marcar el hito.");
        return;
      }

      setCampos({ ...VACIO });
      setAbierto(false);
      if (r.aviso) setAviso(r.aviso);
      router.refresh();
    });
  }

  function borrar(uid: number, confirmado = false) {
    setError(null);
    setPorConfirmar(null);

    ir(async () => {
      const r = await accionEliminarHito(obraId, uid, confirmado);

      if (!r.ok) {
        if (r.pideConfirmacion) {
          setPorConfirmar({ uid, texto: r.error ?? "" });
          return;
        }
        setError(r.error ?? "No se pudo borrar.");
        return;
      }
      router.refresh();
    });
  }

  return (
    <section className="mt-4">
      {hitos.length > 0 && (
        <ul className="mb-3 divide-y rounded-lg border" style={{ borderColor: "var(--borde)" }}>
          {hitos.map((h) => (
            <li key={h.uid} className="flex items-center gap-3 px-3 py-2 text-sm">
              <Diamond className="size-4 shrink-0 opacity-60" aria-hidden="true" />
              <span className="flex-1">
                {h.nombre}
                {h.anclaCodigo && (
                  <span className="ml-2 text-xs opacity-60">tras {h.anclaCodigo}</span>
                )}
              </span>
              <span className="tabular-nums opacity-70">{h.fecha}</span>
              <span className="text-xs opacity-50">avisa {h.diasAviso} d antes</span>
              {puedeEliminar && (
                <button
                  type="button"
                  onClick={() => borrar(h.uid)}
                  disabled={yendo}
                  aria-label={`Quitar el hito ${h.nombre}`}
                  className="rounded p-1 opacity-50 hover:opacity-100 disabled:opacity-30"
                >
                  <Trash2 className="size-4" aria-hidden="true" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {porConfirmar && (
        <div
          role="alert"
          className="mb-3 rounded-lg border p-3 text-sm"
          style={{ borderColor: "var(--peligro)" }}
        >
          <p className="mb-2">{porConfirmar.texto}</p>
          <button
            type="button"
            onClick={() => borrar(porConfirmar.uid, true)}
            className="rounded border px-2 py-1 text-xs font-medium"
            style={{ borderColor: "var(--peligro)", color: "var(--peligro)" }}
          >
            Borrarlo de todas formas
          </button>
          <button
            type="button"
            onClick={() => setPorConfirmar(null)}
            className="ml-2 text-xs underline"
          >
            Cancelar
          </button>
        </div>
      )}

      {puedeEditar && !abierto && (
        <button
          type="button"
          onClick={() => setAbierto(true)}
          className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium"
          style={{ borderColor: "var(--borde)" }}
        >
          <Diamond className="size-4" aria-hidden="true" />
          Marcar un hito
        </button>
      )}

      {puedeEditar && abierto && (
        <div className="rounded-lg border p-3" style={{ borderColor: "var(--borde)" }}>
          <p className="mb-3 text-xs opacity-70">
            Un hito es una fecha clave, no trabajo: dura cero días y no lleva
            importe. Si lo anclas a una partida, se coloca justo detrás de toda
            su rama y ahí se queda aunque el presupuesto cambie.
          </p>

          <div className="flex flex-wrap items-end gap-3">
            <label className="text-xs">
              <span className="mb-0.5 block font-medium opacity-70">Hito</span>
              <input
                value={campos.nombre}
                onChange={(e) => setCampos({ ...campos, nombre: e.target.value })}
                placeholder="Fin de estructuras"
                className="w-64 rounded border px-2 py-1.5 text-sm"
                style={{ borderColor: "var(--borde)", backgroundColor: "var(--fondo)" }}
              />
            </label>

            <label className="text-xs">
              <span className="mb-0.5 block font-medium opacity-70">Fecha</span>
              <input
                type="date"
                value={campos.fecha}
                onChange={(e) => setCampos({ ...campos, fecha: e.target.value })}
                className="w-40 rounded border px-2 py-1.5 text-sm"
                style={{ borderColor: "var(--borde)", backgroundColor: "var(--fondo)" }}
              />
            </label>

            <label className="text-xs">
              <span className="mb-0.5 block font-medium opacity-70">Va detrás de</span>
              <select
                value={campos.anclaCodigo}
                onChange={(e) => setCampos({ ...campos, anclaCodigo: e.target.value })}
                className="w-72 rounded border px-2 py-1.5 text-sm"
                style={{ borderColor: "var(--borde)", backgroundColor: "var(--fondo)" }}
              >
                <option value="">— al final del cronograma —</option>
                {anclas.map((a) => (
                  <option key={a.codigo} value={a.codigo}>
                    {" ".repeat((a.nivel - 1) * 3)}
                    {a.codigo} {a.nombre.slice(0, 40)}
                  </option>
                ))}
              </select>
            </label>

            <label className="text-xs">
              <span className="mb-0.5 block font-medium opacity-70">Avisar</span>
              <input
                inputMode="numeric"
                value={campos.diasAviso}
                onChange={(e) => setCampos({ ...campos, diasAviso: e.target.value })}
                className="w-20 rounded border px-2 py-1.5 text-sm"
                style={{ borderColor: "var(--borde)", backgroundColor: "var(--fondo)" }}
              />
              <span className="mt-0.5 block opacity-60">días antes</span>
            </label>
          </div>

          <div className="mt-3 flex items-center gap-3">
            <button
              type="button"
              onClick={crear}
              disabled={yendo}
              className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-white disabled:opacity-60"
              style={{ backgroundColor: "var(--primario)" }}
            >
              {yendo && <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />}
              Marcar el hito
            </button>
            <button
              type="button"
              onClick={() => {
                setAbierto(false);
                setCampos({ ...VACIO });
                setError(null);
              }}
              className="text-sm underline"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {error && (
        <p
          role="alert"
          className="mt-2 flex max-w-prose items-start gap-2 text-sm"
          style={{ color: "var(--peligro)" }}
        >
          <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          {error}
        </p>
      )}

      {aviso && <p className="mt-2 max-w-prose text-xs opacity-70">{aviso}</p>}
    </section>
  );
}
