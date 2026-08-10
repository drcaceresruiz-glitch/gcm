"use client";

import { useEffect } from "react";

/**
 * Red de seguridad para el revelado de contenido de React 19.
 *
 * En React 19.2 lo que llega por streaming no se muestra en el acto: `$RC` lo
 * marca, lo mete en una cola global `$RB`, y programa el revelado de verdad
 * —`$RV`— con `requestAnimationFrame`. Y `requestAnimationFrame` NO corre en
 * una pestana en segundo plano. Resultado: quien abre GCM en una pestana de
 * fondo se queda con el esqueleto de carga para siempre, porque el revelado
 * nunca se dispara. Paso en produccion el 10 de agosto de 2026 y obligo a
 * apagar los `loading.tsx`. Con este vigia vuelven.
 *
 * `setInterval` y `visibilitychange` SI corren en segundo plano —estrangulados,
 * pero corren—, asi que drenan la cola cuando el `requestAnimationFrame` no
 * puede. En primer plano no hacen nada: React revela solo y la cola queda
 * vacia, asi que `drenar` no encuentra que mover.
 *
 * Va en el layout, FUERA del limite de suspension, asi que hidrata aunque la
 * pagina siga suspendida —que es exactamente la condicion en la que hace
 * falta—. Y se confirmo que la hidratacion del armazon si ocurre en una
 * pestana de fondo; lo unico que se quedaba parado era el revelado. No pinta
 * nada.
 */
export function RescateRevelado() {
  useEffect(() => {
    // `$RB` (la cola) y `$RV` (el revelado) son globales del runtime de React.
    // Se comprueban en CADA llamada: el runtime puede no haberlos definido
    // todavia cuando esto monta, y el streaming puede anadir mas a la cola
    // despues del primer drenaje.
    function drenar() {
      const w = window as unknown as {
        $RB?: unknown[];
        $RV?: (cola: unknown[]) => void;
      };
      try {
        if (w.$RB && w.$RB.length > 0 && typeof w.$RV === "function") {
          w.$RV(w.$RB);
        }
      } catch {
        // Un fallo drenando no debe tumbar la pagina: el peor caso es que se
        // quede el esqueleto, que es justo lo que ya pasaba sin esto.
      }
    }

    drenar();
    const tic = setInterval(drenar, 400);
    document.addEventListener("visibilitychange", drenar);

    // El contenido de estas pantallas llega de una vez; a los 20 segundos ya
    // no va a llegar nada nuevo y sondear cada 400 ms deja de tener sentido.
    // El oyente de visibilidad se queda hasta desmontar, por si la pestana
    // vuelve al frente mas tarde.
    const cese = setTimeout(() => clearInterval(tic), 20_000);

    return () => {
      clearInterval(tic);
      clearTimeout(cese);
      document.removeEventListener("visibilitychange", drenar);
    };
  }, []);

  return null;
}
