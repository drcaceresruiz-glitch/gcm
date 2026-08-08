"use client";

import { useEffect, useState } from "react";
import { Clock } from "lucide-react";

/**
 * Fecha y hora actuales de Peru, en la cabecera, siempre visibles.
 *
 * Se fuerza `timeZone: "America/Lima"` a proposito: sin eso, la hora que
 * saldria seria la del reloj del navegador de quien mira, y para una obra en
 * Peru vista desde otro huso horario eso es exactamente la hora incorrecta.
 * Peru no tiene horario de verano, asi que UTC-5 es fijo todo el ano.
 *
 * Tiene que ser un componente de cliente y con el reloj arrancando en
 * `useEffect`: el servidor no puede pintar «ahora» sin que se quede
 * desactualizado en cuanto llega a la pantalla, y si lo pintara en el primer
 * renderizado del cliente, ese primer renderizado no coincidiria con el que
 * mando el servidor y saltaria un aviso de hidratacion. Empezar en `null` y
 * rellenar despues de montar evita las dos cosas.
 */

/// Con dia de la semana y ano: para cuando hay sitio de sobra.
const FORMATO_COMPLETO = new Intl.DateTimeFormat("es-PE", {
  timeZone: "America/Lima",
  weekday: "short",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

/// Sin ellos: en un telefono angosto, la version completa no cabe junto al
/// logo y el boton del menu, y hay que elegir que se sacrifica.
const FORMATO_COMPACTO = new Intl.DateTimeFormat("es-PE", {
  timeZone: "America/Lima",
  day: "2-digit",
  month: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});

export function RelojPeru() {
  const [ahora, setAhora] = useState<Date | null>(null);

  useEffect(() => {
    // "ahora" no se puede conocer en el servidor; sincronizarlo tras montar,
    // y no en el primer renderizado, es justo lo que evita el desajuste de
    // hidratacion.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setAhora(new Date());
    // Cada 15 s: de sobra para que el minuto nunca se quede atrasado, sin
    // despertar el componente a cada segundo sin necesidad -esto no es un
    // cronometro-.
    const id = setInterval(() => setAhora(new Date()), 15_000);
    return () => clearInterval(id);
  }, []);

  if (!ahora) return null;

  return (
    <p
      className="elevacion-1 flex shrink-0 items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-semibold tabular-nums"
      style={{ borderColor: "var(--borde)", backgroundColor: "var(--superficie)" }}
      title="Hora de Peru (UTC-5)"
    >
      <Clock
        className="size-3.5 shrink-0"
        style={{ color: "var(--color-marca-500)" }}
        aria-hidden="true"
      />
      {/* En capitalizarlo se nota que "mar." de martes que da Intl sale en
          minuscula, y en una cabecera queda mejor con mayuscula inicial. */}
      <span className="hidden capitalize sm:inline">
        {FORMATO_COMPLETO.format(ahora)}
      </span>
      <span className="capitalize sm:hidden">
        {FORMATO_COMPACTO.format(ahora)}
      </span>
    </p>
  );
}
