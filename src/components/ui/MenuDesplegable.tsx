"use client";

import { useEffect, useId, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";

/**
 * Desplegable de cabecera.
 *
 * Lo usan el menu de empresa, el de usuario y el selector de columnas del
 * presupuesto. Cierra con Escape y con un clic fuera: un menu que solo se
 * cierra volviendo a pulsar su boton se queda abierto tapando la pantalla en
 * cuanto el usuario hace otra cosa.
 */

interface Props {
  etiqueta: string;
  /// Se pinta a la izquierda del texto. Opcional: el menu de usuario lleva
  /// el nombre y no necesita icono.
  icono?: React.ReactNode;
  /// Oculta el texto por debajo de `sm`, para las cabeceras apretadas.
  etiquetaSoloEnAncho?: boolean;
  /// Por defecto se alinea a la derecha, que es donde viven las cabeceras.
  alineacion?: "izquierda" | "derecha";
  children: React.ReactNode;
}

export function MenuDesplegable({
  etiqueta,
  icono,
  etiquetaSoloEnAncho = false,
  alineacion = "derecha",
  children,
}: Props) {
  const [abierto, setAbierto] = useState(false);
  const contenedor = useRef<HTMLDivElement>(null);
  const idPanel = useId();

  useEffect(() => {
    if (!abierto) return;

    function alPulsarFuera(evento: MouseEvent) {
      if (!contenedor.current?.contains(evento.target as Node)) {
        setAbierto(false);
      }
    }

    function alTeclear(evento: KeyboardEvent) {
      if (evento.key === "Escape") setAbierto(false);
    }

    // En `pointerdown` y no en `click`: si se escucha el clic, pulsar sobre
    // el boton de otro desplegable lo abre y este lo cierra en el mismo
    // gesto, y el segundo menu parpadea.
    document.addEventListener("pointerdown", alPulsarFuera);
    document.addEventListener("keydown", alTeclear);

    return () => {
      document.removeEventListener("pointerdown", alPulsarFuera);
      document.removeEventListener("keydown", alTeclear);
    };
  }, [abierto]);

  return (
    <div className="relative" ref={contenedor}>
      <button
        type="button"
        onClick={() => setAbierto((previo) => !previo)}
        aria-expanded={abierto}
        aria-haspopup="menu"
        aria-controls={idPanel}
        className="flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-sm"
        style={{ borderColor: "var(--borde)" }}
      >
        {icono}
        <span className={etiquetaSoloEnAncho ? "hidden sm:inline" : undefined}>
          {etiqueta}
        </span>
        <ChevronDown
          className={`size-3.5 opacity-60 transition-transform ${abierto ? "rotate-180" : ""}`}
          aria-hidden="true"
        />
      </button>

      {abierto && (
        <div
          id={idPanel}
          role="menu"
          // Al pulsar una opcion el menu se cierra. Va aqui y no en cada
          // enlace para que valga tambien para los que se anadan despues.
          onClick={() => setAbierto(false)}
          className={`absolute z-20 mt-1 min-w-52 overflow-hidden rounded-xl border py-1 shadow-lg ${
            alineacion === "derecha" ? "right-0" : "left-0"
          }`}
          style={{
            borderColor: "var(--borde)",
            backgroundColor: "var(--superficie)",
          }}
        >
          {children}
        </div>
      )}
    </div>
  );
}
