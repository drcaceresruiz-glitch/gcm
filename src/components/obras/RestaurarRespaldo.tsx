"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { AlertCircle, ArchiveRestore, CheckCircle2 } from "lucide-react";

import type { InformeRestauracion } from "@/services/restauracion.service";

/**
 * Recargar el respaldo de una obra borrada.
 *
 * No hay confirmacion en dos pasos porque esto NO destruye nada: crea una
 * copia archivada aparte. Lo que si se comprueba antes de escribir una fila es
 * la firma del archivo, la huella de cada entrada y que el respaldo salga de
 * esta misma empresa.
 *
 * SE ENVIA CON `fetch` A UNA RUTA, no con una accion de servidor, y es lo
 * mismo que hace la importacion de una constructora: una accion tiene tope de
 * cuerpo (24 MB) y el respaldo de una obra con fotos lo pasa. Antes la
 * pantalla decia 40 MB y los archivos de 25 morian sin llegar a ese mensaje.
 */
export function RestaurarRespaldo() {
  const router = useRouter();
  const [trabajando, setTrabajando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [informe, setInforme] = useState<InformeRestauracion | null>(null);

  async function enviar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setInforme(null);
    setTrabajando(true);

    try {
      const r = await fetch("/empresa/archivo/restaurar", {
        method: "POST",
        body: new FormData(e.currentTarget),
      });

      if (!r.ok) {
        // El texto lo escribio el servicio. Inventar otro aqui seria explicar
        // de dos maneras distintas la misma negativa.
        setError(await r.text());
        return;
      }

      setInforme((await r.json()) as InformeRestauracion);
      // La obra nueva ya existe en el servidor; esto trae la pantalla al dia.
      router.refresh();
    } catch {
      setError(
        "Se cortó la subida. Si el archivo es grande y la conexión va justa, vuelve a intentarlo: no se ha escrito nada.",
      );
    } finally {
      setTrabajando(false);
    }
  }

  return (
    <form onSubmit={enviar} className="space-y-4">
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

      {error && (
        <p
          role="alert"
          className="flex items-start gap-2 rounded-lg px-3 py-2 text-sm text-pretty"
          style={{
            backgroundColor:
              "color-mix(in oklab, var(--color-peligro) 15%, transparent)",
          }}
        >
          <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          {error}
        </p>
      )}

      {informe && (
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
              Restaurada <strong>{informe.nombreObra}</strong> con{" "}
              {informe.filas} filas, como copia de solo lectura.
            </span>
          </p>

          {informe.avisos.length > 0 && (
            <ul className="ml-6 list-disc space-y-1 text-xs">
              {informe.avisos.map((a) => (
                <li key={a}>{a}</li>
              ))}
            </ul>
          )}

          <Link
            href={`/obras/${informe.obraId}`}
            className="ml-6 inline-block text-sm font-medium underline"
          >
            Abrir la copia
          </Link>
        </div>
      )}
    </form>
  );
}
