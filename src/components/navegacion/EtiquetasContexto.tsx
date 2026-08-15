"use client";

import { createContext, useCallback, useContext, useState } from "react";

/**
 * Las etiquetas dinamicas de la miga de pan («CRIOCORD», «Semana 3»...),
 * publicadas por quien las tiene y leidas por quien las pinta.
 *
 * El problema que resuelve: la miga se pinta UNA vez, arriba del todo, en el
 * layout raiz del area privada. Pero el nombre de la obra solo lo conoce el
 * layout de la obra —tras consultarlo—, y el numero de la semana solo lo
 * conoce su propia pagina. Pasarlo por props no funciona: el layout raiz esta
 * POR ENCIMA de esos segmentos y nunca ve sus `params`.
 *
 * La solucion es este contexto, montado una vez en la raiz. Quien tiene el
 * dato lo PUBLICA con `<PublicarEtiqueta>` al renderizarse; quien pinta la
 * miga lo LEE. Sin volver a consultar nada: el dato ya se pidio para pintar
 * el titulo de la pantalla, y aqui solo se reutiliza.
 */

interface EtiquetasContexto {
  etiquetas: Record<string, string>;
  fijar: (clave: string, valor: string) => void;
}

const Contexto = createContext<EtiquetasContexto | null>(null);

export function ProveedorEtiquetas({ children }: { children: React.ReactNode }) {
  const [etiquetas, setEtiquetas] = useState<Record<string, string>>({});

  // Solo crea un objeto nuevo si el valor de verdad cambio: sin esto, cada
  // render de la pagina volveria a publicar el mismo nombre y dispararia un
  // re-render de todo lo que lee el contexto, incluida la miga.
  const fijar = useCallback((clave: string, valor: string) => {
    setEtiquetas((previas) =>
      previas[clave] === valor ? previas : { ...previas, [clave]: valor },
    );
  }, []);

  return (
    <Contexto.Provider value={{ etiquetas, fijar }}>
      {children}
    </Contexto.Provider>
  );
}

export function useEtiquetas(): EtiquetasContexto {
  const ctx = useContext(Contexto);
  if (!ctx) {
    throw new Error("useEtiquetas se uso fuera de ProveedorEtiquetas.");
  }
  return ctx;
}
