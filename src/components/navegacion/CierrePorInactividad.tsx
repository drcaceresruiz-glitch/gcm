"use client";

import { useEffect, useRef } from "react";
import { accionCerrarSesion } from "@/app/(auth)/acciones";

/**
 * Cierra la sesion tras un rato sin actividad.
 *
 * La frontera real es el servidor —la sesion caduca por inactividad alli, y
 * cualquier peticion posterior manda a login—. Esto es lo que falta cuando la
 * pestana queda ABIERTA y quieta: sin peticiones, nada la sacaria hasta que
 * alguien pase por delante y toque algo. Aqui, pasado el mismo tiempo sin que
 * el usuario mueva raton, teclee o toque la pantalla, se cierra sola.
 *
 * El mismo umbral que el servidor (30 min). Se pone un poco por encima para
 * que sea el servidor quien mande y no haya una carrera entre los dos.
 */

const INACTIVIDAD_MS = 30 * 60 * 1000 + 5000;

/// Los eventos que cuentan como "sigue ahi".
const EVENTOS = ["mousemove", "mousedown", "keydown", "scroll", "touchstart"] as const;

export function CierrePorInactividad() {
  const temporizador = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const reiniciar = () => {
      if (temporizador.current) clearTimeout(temporizador.current);
      temporizador.current = setTimeout(() => {
        // La server action borra la fila de sesion y redirige a /login.
        void accionCerrarSesion();
      }, INACTIVIDAD_MS);
    };

    // Reiniciar el contador en cada actividad, pero como mucho una vez cada
    // pocos segundos: sin este freno, un raton en movimiento reprogramaria el
    // temporizador cientos de veces por segundo.
    let ultimo = 0;
    const alHaberActividad = () => {
      const ahora = Date.now();
      if (ahora - ultimo < 5000) return;
      ultimo = ahora;
      reiniciar();
    };

    for (const e of EVENTOS) {
      window.addEventListener(e, alHaberActividad, { passive: true });
    }
    reiniciar();

    return () => {
      if (temporizador.current) clearTimeout(temporizador.current);
      for (const e of EVENTOS) {
        window.removeEventListener(e, alHaberActividad);
      }
    };
  }, []);

  return null;
}
