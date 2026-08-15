"use client";

import { useEffect } from "react";
import { useEtiquetas } from "@/components/navegacion/EtiquetasContexto";

/**
 * Publica una etiqueta dinamica para la miga de pan.
 *
 * No pinta nada: es un mensajero. Se renderiza desde un componente SERVIDOR
 * que ya tiene el dato —el layout de la obra, la pagina de una semana— y le
 * pasa el valor por prop, tal cual, sin volver a consultar nada.
 *
 * En un `useEffect` y no directo en el render: escribir estado ajeno durante
 * el render de otro componente es lo que React llama out-of-order update y
 * avisa en consola. El efecto corre justo despues de pintar, que es antes de
 * que nadie lo note.
 */
export function PublicarEtiqueta({
  clave,
  valor,
}: {
  clave: string;
  valor: string;
}) {
  const { fijar } = useEtiquetas();

  useEffect(() => {
    fijar(clave, valor);
  }, [clave, valor, fijar]);

  return null;
}
