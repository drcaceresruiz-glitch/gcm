"use client";

import { useEffect, useRef, useState } from "react";
import { DIAPOSITIVAS_PORTADA } from "@/lib/portada";

/**
 * Una frase de la casa que va rotando, para la cabecera.
 *
 * Bebe de las MISMAS frases que la portada del login (`@/lib/portada`):
 * anadir una alla la hace aparecer aqui, y no hay dos listas que se
 * desincronicen.
 *
 * Como se pinta (todo pedido por el usuario, y con motivo):
 * - COMPLETA: nada de recortarla con puntos suspensivos. La caja reserva dos
 *   lineas de alto fijo y la frase se reparte con `text-balance`; asi la mas
 *   larga cabe entera y la cabecera no cambia de alto al rotar.
 * - En el COLOR DE MARCA en vez de negrita a secas: sigue a la paleta y al
 *   tema que el usuario tenga elegidos (las variables cambian solas), con
 *   una sombra hacia abajo y a la derecha que la despega del fondo.
 * - El cambio es un desvanecimiento con una subida sutil: la que sale se
 *   funde y la que entra aparece elevandose.
 *
 * Rota mas despacio que el carrusel (10 s contra 6): en la cabecera se lee de
 * reojo mientras se trabaja. Con `prefers-reduced-motion` no rota y se queda
 * la primera frase, quieta.
 *
 * Sin `aria-live` a proposito: anunciar una frase decorativa cada diez
 * segundos convertiria el lector de pantalla en una radio.
 */

const CADA_MS = 10000;
const FUNDIDO_MS = 800;

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
      className={`flex h-9 max-w-2xl items-center justify-center overflow-hidden text-center text-sm leading-[1.125rem] font-semibold text-balance italic transition-[opacity,transform] ${className}`}
      style={{
        opacity: visible ? 1 : 0,
        transform: visible ? "none" : "translateY(5px)",
        transitionDuration: `${FUNDIDO_MS}ms`,
        color: "var(--color-marca-600)",
        textShadow:
          "1.5px 2.5px 3px color-mix(in oklab, #000 28%, transparent)",
      }}
    >
      &laquo;{frase.frase}&raquo;
    </p>
  );
}
