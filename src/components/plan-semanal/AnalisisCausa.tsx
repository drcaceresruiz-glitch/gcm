"use client";

import { useState, useTransition } from "react";
import { Microscope, TriangleAlert, CircleCheck } from "lucide-react";
import { ETIQUETA_CNC } from "@/lib/plan-semanal";
import type { CausaNoCumplimiento } from "@/generated/prisma/enums";
import {
  accionAbrirAnalisis,
  accionCerrarAnalisis,
} from "@/app/(dashboard)/obras/[id]/plan-semanal/acciones";
import { useMotivoSinEscritura } from "@/components/obras/EscrituraDeLaObra";

/**
 * El analisis de causa raiz, pegado al Pareto.
 *
 * Va aqui y no en una pantalla propia porque el Pareto es la PRUEBA: el
 * grafico dice que MATERIALES se repite y justo debajo esta donde se explica
 * por que y que se va a hacer. Separarlos obligaria a recordar la cifra
 * mientras se navega, y nadie lo hace.
 */

export interface CausaPendiente {
  causa: CausaNoCumplimiento;
  veces: number;
  semanas: number;
}

export interface AnalisisEnCurso {
  id: string;
  causa: CausaNoCumplimiento;
  porQue: string;
  accion: string;
  responsable: string | null;
  cerrado: boolean;
}

export function AnalisisCausa({
  obraId,
  pendientes,
  analisis,
  puedeGestionar,
}: {
  obraId: string;
  pendientes: CausaPendiente[];
  analisis: AnalisisEnCurso[];
  puedeGestionar: boolean;
}) {
  const [abriendo, setAbriendo] = useState<CausaNoCumplimiento | null>(null);
  const [porQue, setPorQue] = useState("");
  const [accion, setAccion] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pendiente, empezar] = useTransition();

  /*
   * En una obra que no admite cambios no se ofrece: `abrirAnalisis` lo
   * rechaza, y un boton que siempre falla invita a probar. El motivo se
   * explica una vez por pantalla, no en cada control.
   * Mismas opciones que el servidor: sin excepciones.
   * Va DESPUES del ultimo hook: un `return` por delante de una llamada a
   * un hook cambia el orden entre renders y React lo prohibe.
   */
  const sinEscritura = useMotivoSinEscritura() !== null;
  if (sinEscritura) return null;

  const abiertos = analisis.filter((a) => !a.cerrado);
  const cerrados = analisis.filter((a) => a.cerrado);

  // Ni causas que analizar ni analisis que ensenar: no se pinta nada. Un
  // recuadro vacio en cada obra nueva ensena a saltarselo.
  if (pendientes.length === 0 && analisis.length === 0) return null;

  function guardar(causa: CausaNoCumplimiento) {
    setError(null);
    empezar(async () => {
      const r = await accionAbrirAnalisis(obraId, { causa, porQue, accion });
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setAbriendo(null);
      setPorQue("");
      setAccion("");
    });
  }

  return (
    <section
      className="rounded-xl border p-4"
      style={{ borderColor: "var(--borde)", backgroundColor: "var(--superficie)" }}
    >
      <h3 className="flex items-center gap-2 text-sm font-semibold">
        <Microscope className="size-4" aria-hidden="true" />
        Causa raíz
      </h3>

      {pendientes.length > 0 && (
        <ul className="mt-3 space-y-2">
          {pendientes.map((p) => (
            <li
              key={p.causa}
              className="rounded-lg border p-3 text-sm"
              style={{ borderColor: "var(--color-peligro)" }}
            >
              <p className="flex items-start gap-2">
                <TriangleAlert
                  className="mt-0.5 size-4 shrink-0"
                  style={{ color: "var(--color-peligro)" }}
                  aria-hidden="true"
                />
                <span>
                  <strong>{ETIQUETA_CNC[p.causa]}</strong> falló {p.veces} veces
                  en {p.semanas} semanas distintas. Eso ya no es un mal día.
                </span>
              </p>

              {puedeGestionar && abriendo !== p.causa && (
                <button
                  type="button"
                  onClick={() => {
                    setAbriendo(p.causa);
                    setError(null);
                  }}
                  className="mt-2 rounded-lg border px-3 py-1.5 text-xs font-medium"
                  style={{ borderColor: "var(--borde)" }}
                >
                  Analizar por qué
                </button>
              )}

              {abriendo === p.causa && (
                <div className="mt-3 space-y-2">
                  <label className="block text-xs font-medium">
                    ¿Por qué se repite?
                    <textarea
                      value={porQue}
                      onChange={(e) => setPorQue(e.target.value)}
                      rows={2}
                      placeholder="El proveedor entrega los viernes y hormigonamos los jueves"
                      className="mt-1 w-full rounded-lg border p-2 text-sm"
                      style={{ borderColor: "var(--borde)" }}
                    />
                  </label>
                  <label className="block text-xs font-medium">
                    ¿Qué se va a hacer?
                    <textarea
                      value={accion}
                      onChange={(e) => setAccion(e.target.value)}
                      rows={2}
                      placeholder="Adelantar el pedido al lunes anterior"
                      className="mt-1 w-full rounded-lg border p-2 text-sm"
                      style={{ borderColor: "var(--borde)" }}
                    />
                  </label>

                  {error && (
                    <p className="text-xs" style={{ color: "var(--color-peligro)" }}>
                      {error}
                    </p>
                  )}

                  <div className="flex gap-2">
                    <button
                      type="button"
                      disabled={pendiente}
                      onClick={() => guardar(p.causa)}
                      className="rounded-lg px-3 py-1.5 text-xs font-medium text-white disabled:opacity-60"
                      style={{ backgroundColor: "var(--color-marca-600)" }}
                    >
                      {pendiente ? "Guardando…" : "Guardar análisis"}
                    </button>
                    <button
                      type="button"
                      onClick={() => setAbriendo(null)}
                      className="rounded-lg border px-3 py-1.5 text-xs"
                      style={{ borderColor: "var(--borde)" }}
                    >
                      Cancelar
                    </button>
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {abiertos.length > 0 && (
        <ul className="mt-3 space-y-2">
          {abiertos.map((a) => (
            <li
              key={a.id}
              className="rounded-lg border p-3 text-sm"
              style={{ borderColor: "var(--borde)" }}
            >
              <p className="font-medium">{ETIQUETA_CNC[a.causa]}</p>
              <p className="mt-1 opacity-80">{a.porQue}</p>
              <p className="mt-1">
                <span className="opacity-60">Acción: </span>
                {a.accion}
                {a.responsable && (
                  <span className="opacity-60"> · {a.responsable}</span>
                )}
              </p>
              {puedeGestionar && (
                <button
                  type="button"
                  disabled={pendiente}
                  onClick={() =>
                    empezar(async () => {
                      await accionCerrarAnalisis(obraId, a.id);
                    })
                  }
                  className="mt-2 rounded-lg border px-3 py-1.5 text-xs disabled:opacity-60"
                  style={{ borderColor: "var(--borde)" }}
                >
                  Dar por resuelto
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {cerrados.length > 0 && (
        <details className="mt-3">
          <summary className="cursor-pointer text-xs opacity-70">
            {cerrados.length} resuelto{cerrados.length === 1 ? "" : "s"}
          </summary>
          <ul className="mt-2 space-y-1 text-xs">
            {cerrados.map((a) => (
              <li key={a.id} className="flex items-start gap-2">
                <CircleCheck className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
                <span>
                  <strong>{ETIQUETA_CNC[a.causa]}</strong> — {a.accion}
                </span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}
