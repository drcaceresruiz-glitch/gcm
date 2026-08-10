"use client";

import { useEffect, useRef, useState } from "react";
import { DIAPOSITIVAS_PORTADA } from "@/lib/portada";

/**
 * Una frase de la casa que va rotando, discreta, para la cabecera.
 *
 * Bebe de las MISMAS frases que la portada del login (`@/lib/portada`):
 * anadir una alla la hace aparecer aqui, y no hay dos listas que se
 * desincronicen.
 *
 * Rota mas despacio que el carrusel (10 s contra 6): en la cabecera se lee de
 * reojo mientras se trabaja, no en una pantalla de espera. El cambio es un
 * fundido de salida y entrada; con `prefers-reduced-motion` no rota y se
 * queda la primera frase, quieta.
 *
 * Sin `aria-live` a proposito: anunciar una frase decorativa cada diez
 * segundos convertiria el lector de pantalla en una radio.
 */

const CADA_MS = 10000;
const FUNDIDO_MS = 600;

export function FraseRotativa({ className = "" }: { className?: string }) {
  const [indice, setIndice] = useState(0);
  const [visible, setVisible] = useState(true);
  const total = DIAPOSITIVAS_PORTADA.length;

  const temporizador = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (total < 2) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const id = setInterval(() => {
      setVisible(false);
      temporizador.current = setTimeout(() => {
        setIndice((i) => (i + 1) % total);
        setVisible(true);
      }, FUNDIDO_MS);
    }, CADA_MS);

    return () => {
      clearInterval(id);
      if (temporizador.current) clearTimeout(temporizador.current);
    };
  }, [total]);

  const frase = DIAPOSITIVAS_PORTADA[indice];
  if (!frase) return null;

  return (
    <p
      className={`max-w-[64ch] truncate text-center text-xs italic transition-opacity ${className}`}
      style={{
        opacity: visible ? 0.55 : 0,
        transitionDuration: `${FUNDIDO_MS}ms`,
      }}
    >
      &laquo;{frase.frase}&raquo;
    </p>
  );
}
