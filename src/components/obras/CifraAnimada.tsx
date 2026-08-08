"use client";

import { useEffect, useRef, useState } from "react";
import { soles } from "@/utils/formato";

/**
 * Una cifra que cuenta desde cero hasta su valor al aparecer.
 *
 * El movimiento no es adorno: hace que la vista se pose en las cifras de
 * control al abrir el panel, que es justo lo primero que hay que mirar.
 *
 * **El texto final lo compone el servidor** y llega ya formateado. Aqui solo
 * se anima la subida y en el ultimo fotograma se pinta ese texto tal cual:
 * asi los importes no pasan por coma flotante ni por otro formateador que
 * pudiera redondear distinto que `soles()`.
 *
 * El paso intermedio se formatea con un booleano y no con una funcion: una
 * funcion definida en la pagina del servidor no puede cruzar al cliente, y
 * este componente lo es. `soles()` es pura y no le importa desde que lado se
 * la llame, asi que se importa aqui directamente en vez de recibirla.
 */

interface Props {
  /// El valor numerico al que se sube. Solo gobierna la animacion.
  hasta: number;
  /// Lo que se muestra al terminar, ya formateado por el servidor.
  texto: string;
  /// Si el paso intermedio se formatea como moneda o como numero llano.
  moneda?: boolean;
}

const DURACION_MS = 900;

export function CifraAnimada({ hasta, texto, moneda }: Props) {
  const [valor, setValor] = useState(hasta);
  const [animando, setAnimando] = useState(false);
  const cuadro = useRef<number | null>(null);

  useEffect(() => {
    // Quien pidio menos animacion en su sistema ve la cifra final y ya. La
    // regla global de `globals.css` acorta transiciones, pero esto es un
    // bucle de JavaScript y hay que comprobarlo aqui.
    const sinMovimiento = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;

    if (sinMovimiento || hasta === 0) return;

    // El arranque va DENTRO del primer fotograma y no en el cuerpo del
    // efecto: cambiar el estado ahi encadena un renderizado extra antes de
    // pintar. `requestAnimationFrame` es el sistema externo con el que este
    // componente se sincroniza, y su callback es el sitio correcto.
    let inicio: number | null = null;

    const paso = (ahora: number) => {
      if (inicio === null) {
        inicio = ahora;
        setAnimando(true);
      }

      const avance = Math.min(1, (ahora - inicio) / DURACION_MS);

      // Desaceleracion al final: sube rapido y se posa, en vez de frenar en
      // seco, que es lo que hace que parezca un contador y no un salto.
      const suavizado = 1 - Math.pow(1 - avance, 3);
      setValor(hasta * suavizado);

      if (avance < 1) {
        cuadro.current = requestAnimationFrame(paso);
      } else {
        setAnimando(false);
      }
    };

    cuadro.current = requestAnimationFrame(paso);

    return () => {
      if (cuadro.current !== null) cancelAnimationFrame(cuadro.current);
    };
  }, [hasta]);

  // Terminada la animacion manda el texto del servidor, no lo que calculo
  // este componente.
  if (!animando) return <>{texto}</>;

  return <>{moneda ? soles(valor.toFixed(2)) : Math.round(valor).toString()}</>;
}
