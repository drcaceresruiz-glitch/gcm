"use client";

import { useState, useTransition } from "react";
import { Check, Copy, Link2, RefreshCcw } from "lucide-react";
import type { ResultadoEnlace } from "@/services/galeria.service";

/**
 * El enlace del cliente: encender, copiar, rotar, apagar.
 *
 * Solo lo ve quien tiene `galeria:publicar` (la pagina ni monta este panel
 * sin el permiso). La URL completa se arma aqui con `window.location.origin`
 * porque el servidor no tiene por que conocer el dominio con el que se entra.
 */
export function PanelEnlaceCliente({
  obraId,
  enlace,
  cuantasVisibles,
  accion,
}: {
  obraId: string;
  enlace: { slug: string; activo: boolean } | null;
  /// Para el aviso honesto: un enlace activo con cero fotos publicadas es
  /// una pagina vacia con membrete.
  cuantasVisibles: number;
  accion: (
    obraId: string,
    orden: "activar" | "desactivar" | "rotar",
  ) => Promise<ResultadoEnlace>;
}) {
  const [estado, setEstado] = useState(enlace);
  const [copiado, setCopiado] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendiente, iniciar] = useTransition();

  function ordenar(orden: "activar" | "desactivar" | "rotar") {
    setError(null);
    iniciar(async () => {
      const r = await accion(obraId, orden);
      if (r.ok) setEstado({ slug: r.slug, activo: r.activo });
      else setError(r.error);
    });
  }

  const url =
    estado && typeof window !== "undefined"
      ? `${window.location.origin}/galeria/${estado.slug}`
      : null;

  return (
    <section
      aria-label="Enlace para el cliente"
      className="rounded-xl border p-4"
      style={{
        borderColor: "var(--borde)",
        backgroundColor:
          "color-mix(in oklab, var(--color-marca-500) 6%, var(--superficie))",
      }}
    >
      <h2 className="flex items-center gap-2 text-sm font-semibold">
        <Link2 className="size-4 shrink-0" aria-hidden="true" />
        Enlace para el cliente
      </h2>
      <p className="mt-1 text-xs opacity-70">
        Una página de solo lectura, sin cuenta: enseña únicamente las fotos
        marcadas como visibles, con la fecha de cada una. Rotar el enlace
        invalida el anterior al instante.
      </p>

      {estado?.activo && url ? (
        <div className="mt-3 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <code
              className="min-w-0 flex-1 truncate rounded-lg border px-2.5 py-1.5 text-xs"
              style={{ borderColor: "var(--borde)", backgroundColor: "var(--fondo)" }}
              title={url}
            >
              {url}
            </code>
            <button
              type="button"
              onClick={() => {
                void navigator.clipboard.writeText(url).then(() => {
                  setCopiado(true);
                  window.setTimeout(() => setCopiado(false), 2000);
                });
              }}
              className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium text-white"
              style={{ backgroundColor: "var(--color-marca-600)" }}
            >
              {copiado ? (
                <Check className="size-3.5" aria-hidden="true" />
              ) : (
                <Copy className="size-3.5" aria-hidden="true" />
              )}
              {copiado ? "Copiado" : "Copiar"}
            </button>
          </div>

          {cuantasVisibles === 0 && (
            <p className="text-xs" style={{ color: "var(--color-alerta)" }}>
              El enlace está activo pero ninguna foto está marcada como
              visible: el cliente vería una página vacía. Publica alguna con
              el ojo de cada foto.
            </p>
          )}

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={pendiente}
              onClick={() => {
                // Rotar deja sin acceso a quien tenga el enlace viejo; es
                // exactamente para eso, pero conviene decirlo antes.
                if (
                  window.confirm(
                    "¿Generar un enlace nuevo? El actual dejará de funcionar al instante.",
                  )
                ) {
                  ordenar("rotar");
                }
              }}
              className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs disabled:opacity-60"
              style={{ borderColor: "var(--borde)" }}
            >
              <RefreshCcw className="size-3.5" aria-hidden="true" />
              Rotar enlace
            </button>
            <button
              type="button"
              disabled={pendiente}
              onClick={() => ordenar("desactivar")}
              className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs disabled:opacity-60"
              style={{ borderColor: "var(--borde)", color: "var(--color-peligro)" }}
            >
              Apagar el enlace
            </button>
          </div>
        </div>
      ) : (
        <div className="mt-3">
          <button
            type="button"
            disabled={pendiente}
            onClick={() => ordenar("activar")}
            className="inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium text-white disabled:opacity-60"
            style={{ backgroundColor: "var(--color-marca-600)" }}
          >
            <Link2 className="size-4" aria-hidden="true" />
            Activar el enlace del cliente
          </button>
          <p className="mt-1.5 text-xs opacity-60">
            Activarlo no publica ninguna foto por sí solo: cada una se marca
            visible a mano, con el ojo.
          </p>
        </div>
      )}

      {error && (
        <p role="alert" className="mt-2 text-xs" style={{ color: "var(--color-peligro)" }}>
          {error}
        </p>
      )}
    </section>
  );
}
