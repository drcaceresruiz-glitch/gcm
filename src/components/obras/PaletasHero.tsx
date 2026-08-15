"use client";

import { useEffect, useState } from "react";
import { Check } from "lucide-react";
import {
  aplicarApariencia,
  COOKIE_PALETA,
  COOKIE_TEMA,
  ETIQUETA_PALETA,
  leerCookie,
  MUESTRA_PALETA,
  PALETAS,
  paletaValida,
  temaValido,
  type Paleta,
} from "@/lib/tema";

/**
 * La fila de paletas del saludo: ocho puntos que repintan la casa entera.
 *
 * El selector completo (con tema claro/oscuro) sigue en el menu de la
 * cabecera; esto existe porque una preferencia que nadie descubre no es una
 * preferencia. En el sitio mas visto de la aplicacion, un clic ensena que
 * GCM se viste del color de CADA empresa —fondo y bordes incluidos, no solo
 * los botones—, y aplicarlo es instantaneo: dos atributos en `<html>` y el
 * CSS hace el resto.
 */
export function PaletasHero() {
  const [paleta, setPaleta] = useState<Paleta>("teal");
  const [listo, setListo] = useState(false);

  // Lo guardado se lee al montar, no en el estado inicial: `document.cookie`
  // no existe en el servidor y leerlo ahi romperia la hidratacion.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPaleta(paletaValida(leerCookie(COOKIE_PALETA)));
    setListo(true);
  }, []);

  function elegir(nueva: Paleta) {
    setPaleta(nueva);
    // El tema (claro/oscuro) se conserva tal cual: aqui solo se elige color.
    aplicarApariencia(temaValido(leerCookie(COOKIE_TEMA)), nueva);
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="text-xs opacity-55">Hazla tuya:</span>
      {PALETAS.map((p) => {
        const activa = listo && paleta === p;
        return (
          <button
            key={p}
            type="button"
            onClick={() => elegir(p)}
            aria-pressed={activa}
            aria-label={`Paleta ${ETIQUETA_PALETA[p]}`}
            title={ETIQUETA_PALETA[p]}
            className="flex size-5 items-center justify-center rounded-full border-2 transition-transform hover:scale-110"
            style={{
              // El color literal y no `var(--color-marca)`: esa variable vale
              // siempre lo de la paleta ACTIVA y los ocho saldrian iguales.
              backgroundColor: MUESTRA_PALETA[p],
              borderColor: activa ? "var(--texto)" : "transparent",
            }}
          >
            {activa && (
              <Check className="size-3 text-white" aria-hidden="true" strokeWidth={3} />
            )}
          </button>
        );
      })}
    </div>
  );
}
