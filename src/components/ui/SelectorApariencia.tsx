"use client";

import { useEffect, useState } from "react";
import { Check, Monitor, Moon, Sun } from "lucide-react";
import {
  aplicarApariencia,
  COOKIE_PALETA,
  COOKIE_TEMA,
  ETIQUETA_PALETA,
  leerCookie,
  MUESTRA_PALETA,
  PALETAS,
  TEMAS,
  paletaValida,
  temaValido,
  type Paleta,
  type Tema,
} from "@/lib/tema";

/**
 * Elegir tema y paleta.
 *
 * No guarda nada en la base de datos: es una preferencia de quien mira, como
 * las columnas del presupuesto o los capitulos colapsados, y vive en una
 * cookie -no en `localStorage`, para que el servidor pueda leerla y pintar
 * el tema correcto desde la primera respuesta-. Aplicarlo es solo escribir
 * dos atributos en `<html>`; de traducirlos a color se encarga
 * `globals.css`.
 */

const ICONO_TEMA = { auto: Monitor, claro: Sun, oscuro: Moon } as const;

export function SelectorApariencia() {
  const [tema, setTema] = useState<Tema>("claro");
  const [paleta, setPaleta] = useState<Paleta>("teal");
  const [listo, setListo] = useState(false);

  /**
   * Lo guardado se lee al montar y no en el estado inicial: `document.cookie`
   * no existe en el servidor, y leerlo ahi romperia la hidratacion. El tema
   * ya esta APLICADO por el layout -que lo lee del lado del servidor- antes
   * de llegar aqui; esto solo pone los botones en su sitio.
   */
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTema(temaValido(leerCookie(COOKIE_TEMA)));
    setPaleta(paletaValida(leerCookie(COOKIE_PALETA)));
    setListo(true);
  }, []);

  function aplicarTema(nuevo: Tema) {
    setTema(nuevo);
    aplicarApariencia(nuevo, paleta);
  }

  function aplicarPaleta(nueva: Paleta) {
    setPaleta(nueva);
    aplicarApariencia(tema, nueva);
  }

  return (
    // El menu que lo contiene se cierra al pulsar cualquier opcion, que es lo
    // correcto para un enlace. Aqui no: elegir paleta es probar varias
    // seguidas, y cerrarse tras la primera obligaria a reabrirlo cada vez.
    <div className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
      <p className="mb-1.5 text-xs font-medium opacity-70">Apariencia</p>

      <div className="flex gap-1">
        {TEMAS.map((t) => {
          const Icono = ICONO_TEMA[t];
          const activo = listo && tema === t;

          return (
            <button
              key={t}
              type="button"
              onClick={() => aplicarTema(t)}
              aria-pressed={activo}
              title={t === "auto" ? "Según el sistema" : t}
              className="flex flex-1 items-center justify-center rounded-lg border py-1.5"
              style={{
                borderColor: activo ? "var(--color-marca-600)" : "var(--borde)",
                backgroundColor: activo
                  ? "color-mix(in oklab, var(--color-marca-500) 14%, transparent)"
                  : "transparent",
              }}
            >
              <Icono className="size-4" aria-hidden="true" />
              <span className="sr-only">{t}</span>
            </button>
          );
        })}
      </div>

      <p className="mt-2.5 mb-1.5 text-xs font-medium opacity-70">Color</p>

      <div className="flex flex-wrap gap-1.5">
        {PALETAS.map((p) => {
          const activa = listo && paleta === p;

          return (
            <button
              key={p}
              type="button"
              onClick={() => aplicarPaleta(p)}
              aria-pressed={activa}
              aria-label={ETIQUETA_PALETA[p]}
              title={ETIQUETA_PALETA[p]}
              className="flex size-7 items-center justify-center rounded-full border-2"
              style={{
                // La muestra lleva el color literal y no `var(--color-marca)`:
                // esa variable vale siempre lo de la paleta ACTIVA, asi que
                // las cinco muestras saldrian del mismo color.
                backgroundColor: MUESTRA_PALETA[p],
                borderColor: activa ? "var(--texto)" : "transparent",
              }}
            >
              {activa && (
                <Check className="size-3.5 text-white" aria-hidden="true" />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
