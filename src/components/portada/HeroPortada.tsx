"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { ChevronLeft, ChevronRight } from "lucide-react";
import {
  DIAPOSITIVAS_PORTADA,
  type DiapositivaPortada,
} from "@/lib/portada";

/**
 * El carrusel de la portada: frases de la filosofia de la casa sobre fotos de
 * obra, con fundido cruzado cada seis segundos.
 *
 * Decisiones que no son capricho:
 * - TODAS las diapositivas estan montadas siempre y solo cambia la opacidad:
 *   es lo que hace el fundido cruzado de verdad (la que entra aparece sobre
 *   la que sale). Montar/desmontar daria un parpadeo en blanco.
 * - La foto que falta NO rompe nada: si `public/portada/N.jpg` no existe, la
 *   diapositiva sale sobre el degradado de marca. Asi las frases pueden vivir
 *   antes que las fotos.
 * - Con `prefers-reduced-motion` no hay avance automatico: las flechas y los
 *   puntos siguen funcionando. Un carrusel que gira solo es justo lo que esa
 *   preferencia pide evitar.
 * - Tocar una flecha o un punto REINICIA el reloj: si el usuario acaba de
 *   elegir una frase, el automatico no se la quita a mitad de lectura.
 */

const INTERVALO_MS = 6000;

export function HeroPortada({
  diapositivas = DIAPOSITIVAS_PORTADA,
  className = "",
}: {
  diapositivas?: readonly DiapositivaPortada[];
  className?: string;
}) {
  const [indice, setIndice] = useState(0);
  // Las fotos que no cargaron, para no volver a intentarlas y dejar el fondo
  // degradado en su lugar.
  const [caidas, setCaidas] = useState<ReadonlySet<string>>(new Set());
  // El reloj se reinicia cambiando esta señal; asi la navegacion manual no
  // compite con el avance automatico.
  const [reloj, setReloj] = useState(0);
  const total = diapositivas.length;

  const quieto = useRef(false);
  useEffect(() => {
    quieto.current = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
  }, []);

  useEffect(() => {
    if (total < 2 || quieto.current) return;
    const id = setInterval(
      () => setIndice((i) => (i + 1) % total),
      INTERVALO_MS,
    );
    return () => clearInterval(id);
  }, [total, reloj]);

  if (total === 0) return null;

  const ir = (destino: number) => {
    setIndice(((destino % total) + total) % total);
    setReloj((r) => r + 1);
  };

  return (
    <section
      aria-roledescription="carrusel"
      aria-label="Frases de la filosofia Lean sobre fotos de obra"
      className={`relative h-full w-full overflow-hidden ${className}`}
      style={{
        // El fondo de reserva: si la foto falta o aun esta cargando, la frase
        // vive sobre la marca en vez de sobre un hueco negro.
        background:
          "linear-gradient(135deg, var(--color-marca-700, #0d5c56) 0%, #10222e 60%, #0b141c 100%)",
      }}
    >
      {diapositivas.map((d, i) => {
        const activa = i === indice;
        return (
          <figure
            key={d.imagen}
            aria-hidden={!activa}
            className="absolute inset-0 m-0 transition-opacity duration-1000 ease-in-out"
            style={{ opacity: activa ? 1 : 0 }}
          >
            {!caidas.has(d.imagen) && (
              <Image
                src={d.imagen}
                alt=""
                fill
                sizes="(min-width: 1024px) 60vw, 100vw"
                className="object-cover"
                priority={i === 0}
                onError={() =>
                  setCaidas((prev) => new Set(prev).add(d.imagen))
                }
              />
            )}

            {/* El velo: la foto se oscurece para que el blanco del texto lea
                siempre, salga la foto que salga. */}
            <div
              aria-hidden="true"
              className="absolute inset-0"
              style={{
                background:
                  "linear-gradient(to top, rgba(6,12,18,0.72) 0%, rgba(6,12,18,0.45) 45%, rgba(6,12,18,0.55) 100%)",
              }}
            />

            <figcaption className="absolute inset-0 flex items-center justify-center px-12 sm:px-16">
              <blockquote className="max-w-2xl text-center">
                <p className="text-2xl leading-snug font-bold text-balance text-white drop-shadow-md sm:text-3xl lg:text-4xl">
                  &laquo;{d.frase}&raquo;
                </p>
                {d.autor && (
                  <footer className="mt-4 text-sm font-medium tracking-wide text-white/70">
                    {d.autor}
                  </footer>
                )}
              </blockquote>
            </figcaption>
          </figure>
        );
      })}

      {total > 1 && (
        <>
          <Flecha lado="izquierda" onClick={() => ir(indice - 1)} />
          <Flecha lado="derecha" onClick={() => ir(indice + 1)} />

          <div
            className="absolute inset-x-0 bottom-5 flex justify-center gap-2"
            role="tablist"
            aria-label="Elegir diapositiva"
          >
            {diapositivas.map((d, i) => (
              <button
                key={d.imagen}
                type="button"
                role="tab"
                aria-selected={i === indice}
                aria-label={`Diapositiva ${i + 1} de ${total}`}
                onClick={() => ir(i)}
                className="rounded-full transition-all duration-300"
                style={{
                  width: i === indice ? 22 : 8,
                  height: 8,
                  backgroundColor:
                    i === indice ? "#fff" : "rgba(255,255,255,0.45)",
                }}
              />
            ))}
          </div>
        </>
      )}
    </section>
  );
}

function Flecha({
  lado,
  onClick,
}: {
  lado: "izquierda" | "derecha";
  onClick: () => void;
}) {
  const Icono = lado === "izquierda" ? ChevronLeft : ChevronRight;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={lado === "izquierda" ? "Frase anterior" : "Frase siguiente"}
      className={`absolute top-1/2 -translate-y-1/2 rounded-full p-2 text-white/70 transition-colors hover:bg-white/10 hover:text-white ${
        lado === "izquierda" ? "left-2 sm:left-4" : "right-2 sm:right-4"
      }`}
    >
      <Icono className="size-7" aria-hidden="true" strokeWidth={2.5} />
    </button>
  );
}
