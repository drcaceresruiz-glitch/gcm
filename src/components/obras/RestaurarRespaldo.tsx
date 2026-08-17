"use client";

import { useActionState } from "react";
import Link from "next/link";
import { AlertCircle, ArchiveRestore, CheckCircle2 } from "lucide-react";

import {
  accionRestaurarObra,
  type RespuestaRestauracion,
} from "@/app/(dashboard)/empresa/archivo/acciones";

const INICIAL: RespuestaRestauracion = { ok: false };

/**
 * Recargar el respaldo de una obra borrada.
 *
 * No hay confirmacion en dos pasos porque esto NO destruye nada: crea una
 * copia archivada aparte. Lo que si se comprueba antes de escribir una fila es
 * la firma del archivo, la huella de cada entrada y que el respaldo salga de
 * esta misma empresa.
 */
export function RestaurarRespaldo() {
  const [estado, enviar, trabajando] = useActionState(accionRestaurarObra, INICIAL);

  return (
    <form action={enviar} className="space-y-4">
      <label className="block text-sm">
        <span className="mb-1 block font-medium">Archivo del respaldo (.zip)</span>
        <input
          type="file"
          name="respaldo"
          accept=".zip,application/zip"
          required
          className="block w-full max-w-lg rounded border px-3 py-2 text-sm"
          style={{ borderColor: "var(--borde)", backgroundColor: "var(--fondo)" }}
        />
      </label>

      <button
        type="submit"
        disabled={trabajando}
        className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
        style={{ backgroundColor: "var(--color-marca)" }}
      >
        <ArchiveRestore className="size-4" aria-hidden="true" />
        {trabajando ? "Restaurando…" : "Restaurar la obra"}
      </button>

      {estado.error && (
        <p
          role="alert"
          className="flex items-start gap-2 rounded-lg px-3 py-2 text-sm text-pretty"
          style={{
            backgroundColor:
              "color-mix(in oklab, var(--color-peligro) 15%, transparent)",
          }}
        >
          <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          {estado.error}
        </p>
      )}

      {estado.ok && estado.informe && (
        <div
          role="status"
          className="space-y-2 rounded-lg px-3 py-3 text-sm"
          style={{
            backgroundColor:
              "color-mix(in oklab, var(--color-exito) 15%, transparent)",
          }}
        >
          <p className="flex items-start gap-2">
            <CheckCircle2 className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <span>
              Restaurada <strong>{estado.informe.nombreObra}</strong> con{" "}
              {estado.informe.filas} filas, como copia de solo lectura.
            </span>
          </p>

          {estado.informe.avisos.length > 0 && (
            <ul className="ml-6 list-disc space-y-1 text-xs">
              {estado.informe.avisos.map((a) => (
                <li key={a}>{a}</li>
              ))}
            </ul>
          )}

          <Link
            href={`/obras/${estado.informe.obraId}`}
            className="ml-6 inline-block text-sm font-medium underline"
          >
            Abrir la copia
          </Link>
        </div>
      )}
    </form>
  );
}
