"use client";

import { useCallback, useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, ImageOff, X } from "lucide-react";
import { fechaHora } from "@/utils/fechas";
import type { FotoResumen } from "@/services/evidencia.service";

/**
 * Las fotos de un dato, en miniaturas, y su visor emergente.
 *
 * Abrir la foto en una pestana aparte sacaba a la gente de la obra: volvia a
 * la matriz perdiendo el sitio donde estaba, y en el movil una pestana nueva
 * es un viaje de ida. El visor se superpone y se cierra con Escape, tocando
 * fuera o con la X, y devuelve a la pantalla exactamente como estaba.
 *
 * La imagen se pide a `/api/evidencia/<id>`, que valida sesion, permiso y
 * empresa; no hay URL publica que adivinar. Por eso es un `<img>` normal y no
 * `next/image`: el optimizador no puede con una ruta que exige sesion.
 */
export function GaleriaEvidencia({
  fotos,
  tamano = "size-20",
}: {
  fotos: FotoResumen[];
  /// Clase de Tailwind con el lado de la miniatura.
  tamano?: string;
}) {
  /// Indice de la foto abierta en el visor; null = cerrado.
  const [abierta, setAbierta] = useState<number | null>(null);

  if (fotos.length === 0) return null;

  return (
    <>
      <ul className="flex flex-wrap gap-2">
        {fotos.map((f, i) => (
          <li key={f.id}>
            <Miniatura
              foto={f}
              tamano={tamano}
              onAbrir={() => setAbierta(i)}
            />
          </li>
        ))}
      </ul>

      {abierta !== null && fotos[abierta] && (
        <Visor
          fotos={fotos}
          indice={abierta}
          onIr={setAbierta}
          onCerrar={() => setAbierta(null)}
        />
      )}
    </>
  );
}

/** Pie de foto. Quien la subio y cuando es parte de la evidencia, no un adorno. */
function pieDeFoto(foto: FotoResumen): string {
  return `${foto.subidaPor} · ${fechaHora(foto.createdAt)}${
    foto.nota ? ` · ${foto.nota}` : ""
  }`;
}

function Miniatura({
  foto,
  tamano,
  onAbrir,
}: {
  foto: FotoResumen;
  tamano: string;
  onAbrir: () => void;
}) {
  // Purgada: el archivo ya no esta en el disco, pero el registro sobrevive. Se
  // dice, en vez de dejar una imagen rota o de esconderla como si nunca
  // hubiera existido.
  if (foto.purgada) {
    return (
      <div
        className={`flex ${tamano} flex-col items-center justify-center gap-1 rounded-lg border text-center text-[10px] opacity-60`}
        style={{ borderColor: "var(--borde)" }}
        title={`Purgada del disco · ${pieDeFoto(foto)}`}
      >
        <ImageOff className="size-5" aria-hidden="true" />
        <span>Purgada</span>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={onAbrir}
      title={pieDeFoto(foto)}
      aria-label={`Ver la foto: ${foto.nota ?? foto.nombreOriginal}`}
      className={`block ${tamano} overflow-hidden rounded-lg border`}
      style={{ borderColor: "var(--borde)" }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={`/api/evidencia/${foto.id}`}
        alt={foto.nota ?? foto.nombreOriginal}
        loading="lazy"
        className="size-full object-cover"
      />
    </button>
  );
}

/**
 * El visor: la foto a tamano completo sobre el resto de la pantalla.
 *
 * Las fotos purgadas no llegan aqui (su miniatura no abre nada), asi que el
 * visor siempre tiene algo que ensenar.
 */
function Visor({
  fotos,
  indice,
  onIr,
  onCerrar,
}: {
  fotos: FotoResumen[];
  indice: number;
  onIr: (i: number) => void;
  onCerrar: () => void;
}) {
  const foto = fotos[indice];
  // Solo se pasa entre las que se pueden ver: saltar a una purgada dejaria el
  // visor en blanco sin explicar por que.
  const visibles = fotos.filter((f) => !f.purgada);
  const hayVarias = visibles.length > 1;

  const mover = useCallback(
    (paso: number) => {
      const actual = visibles.findIndex((f) => f.id === fotos[indice]?.id);
      if (actual === -1) return;
      const siguiente =
        visibles[(actual + paso + visibles.length) % visibles.length];
      const enTodas = fotos.findIndex((f) => f.id === siguiente?.id);
      if (enTodas !== -1) onIr(enTodas);
    },
    [fotos, indice, visibles, onIr],
  );

  // Escape cierra y las flechas pasan de foto: con guantes y una pantalla
  // sucia, el teclado del portatil de obra suele ser mas fiable que el dedo.
  useEffect(() => {
    function alPulsar(e: KeyboardEvent) {
      if (e.key === "Escape") onCerrar();
      else if (e.key === "ArrowRight" && hayVarias) mover(1);
      else if (e.key === "ArrowLeft" && hayVarias) mover(-1);
    }
    document.addEventListener("keydown", alPulsar);
    // Mientras el visor esta abierto la pagina de atras no se desplaza: si no,
    // al cerrarlo uno aparece en otro sitio de la matriz.
    const overflowPrevio = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", alPulsar);
      document.body.style.overflow = overflowPrevio;
    };
  }, [hayVarias, mover, onCerrar]);

  if (!foto) return null;

  return (
    // El fondo entero cierra al tocarlo; el contenido de dentro no (detiene la
    // propagacion), para que no se cierre al intentar mirar la foto.
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Foto de evidencia"
      onClick={onCerrar}
      className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-3 p-4 print:hidden"
      style={{ backgroundColor: "rgb(0 0 0 / 0.85)" }}
    >
      <button
        type="button"
        onClick={onCerrar}
        aria-label="Cerrar"
        className="absolute right-3 top-3 rounded-lg p-2 text-white/80 hover:text-white"
      >
        <X className="size-6" aria-hidden="true" />
      </button>

      <div
        className="flex max-h-full w-full max-w-4xl flex-col items-center gap-3"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex w-full items-center justify-center gap-2">
          {hayVarias && (
            <button
              type="button"
              onClick={() => mover(-1)}
              aria-label="Foto anterior"
              className="shrink-0 rounded-full p-2 text-white/80 hover:text-white"
            >
              <ChevronLeft className="size-7" aria-hidden="true" />
            </button>
          )}

          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`/api/evidencia/${foto.id}`}
            alt={foto.nota ?? foto.nombreOriginal}
            className="max-h-[75vh] min-w-0 flex-1 rounded-lg object-contain"
          />

          {hayVarias && (
            <button
              type="button"
              onClick={() => mover(1)}
              aria-label="Foto siguiente"
              className="shrink-0 rounded-full p-2 text-white/80 hover:text-white"
            >
              <ChevronRight className="size-7" aria-hidden="true" />
            </button>
          )}
        </div>

        {/* El pie va SIEMPRE a la vista, no en un `title` que hay que
            descubrir: una foto sin quien y cuando no prueba nada. */}
        <p className="max-w-2xl text-center text-sm text-white/80">
          {pieDeFoto(foto)}
          {hayVarias && (
            <span className="ml-2 tabular-nums text-white/60">
              ({visibles.findIndex((f) => f.id === foto.id) + 1}/{visibles.length})
            </span>
          )}
        </p>

        <a
          href={`/api/evidencia/${foto.id}`}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="text-xs text-white/60 underline hover:text-white"
        >
          Abrir el original en otra pestaña
        </a>
      </div>
    </div>
  );
}
