"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, CheckCircle2, LoaderCircle, RefreshCw } from "lucide-react";

import { accionSincronizarEdt } from "@/app/(dashboard)/obras/[id]/cronograma/acciones-manual";

/**
 * Poner la EDT al dia con el presupuesto.
 *
 * El presupuesto sigue vivo despues de generar la EDT. Esto reconcilia las dos
 * SIN borrar nada y sin tocar las fechas: lo unico que no sale del presupuesto
 * es el plan, y pisarlo borraria lo que alguien tecleo.
 */
export function SincronizarEdt({ obraId }: { obraId: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [hecho, setHecho] = useState<string | null>(null);
  const [sobrantes, setSobrantes] = useState<string[]>([]);
  const [yendo, ir] = useTransition();

  function sincronizar() {
    setError(null);
    setHecho(null);
    setSobrantes([]);

    ir(async () => {
      const r = await accionSincronizarEdt(obraId);

      if (!r.ok) {
        setError(r.error ?? "No se pudo sincronizar.");
        return;
      }

      const partes: string[] = [];
      if (r.altas) partes.push(`${r.altas} tarea(s) nueva(s)`);
      if (r.cambios) partes.push(`${r.cambios} ajuste(s)`);
      if (r.enlacesCreados) partes.push(`${r.enlacesCreados} enlace(s) puesto(s)`);
      if (r.enlacesRetirados) partes.push(`${r.enlacesRetirados} retirado(s)`);

      setHecho(
        partes.length > 0
          ? partes.join(", ")
          : "La EDT ya estaba al dia con el presupuesto.",
      );
      setSobrantes(r.sobrantes ?? []);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col items-center gap-2">
      <button
        type="button"
        onClick={sincronizar}
        disabled={yendo}
        className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium disabled:opacity-60"
        style={{ borderColor: "var(--borde)" }}
      >
        {yendo ? (
          <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
        ) : (
          <RefreshCw className="size-4" aria-hidden="true" />
        )}
        Poner la EDT al día con el presupuesto
      </button>

      <p className="max-w-prose text-center text-xs opacity-60">
        Trae las partidas nuevas y corrige nombres y jerarquía. No borra nada ni
        toca las fechas que ya tecleaste.
      </p>

      {error && (
        <p
          role="alert"
          className="flex max-w-prose items-start gap-2 text-sm"
          style={{ color: "var(--peligro)" }}
        >
          <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          {error}
        </p>
      )}

      {hecho && (
        <p className="flex items-start gap-2 text-sm">
          <CheckCircle2 className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          {hecho}
        </p>
      )}

      {sobrantes.length > 0 && (
        <p className="max-w-prose text-center text-xs" style={{ color: "var(--aviso)" }}>
          {sobrantes.length} tarea(s) del cronograma ya no están en el
          presupuesto y se dejaron al final, sin borrar:{" "}
          <span className="font-medium">{sobrantes.slice(0, 6).join(", ")}</span>
          {sobrantes.length > 6 ? `, y ${sobrantes.length - 6} más` : ""}.
        </p>
      )}
    </div>
  );
}
