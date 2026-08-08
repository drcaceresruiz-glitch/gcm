"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ChevronDown, ChevronUp, History, CheckCheck, Info } from "lucide-react";
import type { ActividadReciente as Entrada } from "@/services/actividad.service";
import { haceCuanto, fechaHora } from "@/utils/fechas";

/**
 * Lo ultimo que ha pasado en la empresa, en linea de tiempo.
 *
 * Sale de `AuditLog`, que se venia escribiendo desde el primer dia sin que
 * ninguna pantalla lo leyera. No cuesta ninguna tabla nueva.
 *
 * Colapsable y con «leido»/«no leido» son preferencias de quien mira, no
 * datos de la obra -igual que las columnas del presupuesto o los capitulos
 * contraidos-, asi que viven en `localStorage` y no en la base. Marcar como
 * leido no borra nada: solo guarda el instante en que se pulso, y todo lo
 * anterior a ese instante deja de contar como nuevo.
 */

const CLAVE_COLAPSADA = "gcm:actividad-colapsada";
const CLAVE_ULTIMA_LEIDA = "gcm:actividad-ultima-leida";

export function ActividadReciente({ entradas }: { entradas: Entrada[] }) {
  const [colapsada, setColapsada] = useState(false);
  const [ultimaLeida, setUltimaLeida] = useState<string | null>(null);
  const [listo, setListo] = useState(false);

  /**
   * Restaura lo guardado. En un efecto y no en el estado inicial porque
   * `localStorage` no existe en el servidor: leerlo ahi romperia la
   * hidratacion.
   */
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setColapsada(localStorage.getItem(CLAVE_COLAPSADA) === "1");
    setUltimaLeida(localStorage.getItem(CLAVE_ULTIMA_LEIDA));
    setListo(true);
  }, []);

  useEffect(() => {
    if (listo) localStorage.setItem(CLAVE_COLAPSADA, colapsada ? "1" : "0");
  }, [colapsada, listo]);

  useEffect(() => {
    if (!listo) return;
    if (ultimaLeida) localStorage.setItem(CLAVE_ULTIMA_LEIDA, ultimaLeida);
    else localStorage.removeItem(CLAVE_ULTIMA_LEIDA);
  }, [ultimaLeida, listo]);

  if (entradas.length === 0) return null;

  // `cuando` llega como `Date` y lo guardado en localStorage como texto ISO:
  // compararlos con `>` sin normalizar coacciona el Date a numero y el texto
  // a NaN, y la comparacion sale siempre falsa. Por eso los dos pasan por
  // `.getTime()`.
  //
  // Antes de montar no se sabe todavia que hay leido y que no: se cuenta
  // todo como leido para no pintar un badge que un instante despues
  // desaparece. `listo` es justo la bandera para eso.
  const marca: Date | null = listo
    ? ultimaLeida
      ? new Date(ultimaLeida)
      : null
    : (entradas[0]?.cuando ?? null);

  const esPosterior = (cuando: Date) => !marca || cuando.getTime() > marca.getTime();

  const noLeidas = listo ? entradas.filter((e) => esPosterior(e.cuando)).length : 0;

  return (
    <section
      className="elevacion-1 rounded-xl border p-5"
      style={{
        borderColor: "var(--borde)",
        backgroundColor: "var(--superficie)",
      }}
    >
      <div className="flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => setColapsada((previo) => !previo)}
          aria-expanded={!colapsada}
          aria-controls="lista-actividad-reciente"
          className="flex items-center gap-2 text-sm font-semibold"
        >
          <History className="size-4 shrink-0 opacity-70" aria-hidden="true" />
          Actividad reciente
          {noLeidas > 0 && (
            <span
              className="rounded-full px-1.5 py-0.5 text-xs font-semibold text-white"
              style={{ backgroundColor: "var(--color-marca-500)" }}
            >
              {noLeidas}
            </span>
          )}
          {colapsada ? (
            <ChevronDown className="size-4 shrink-0 opacity-60" aria-hidden="true" />
          ) : (
            <ChevronUp className="size-4 shrink-0 opacity-60" aria-hidden="true" />
          )}
        </button>

        {noLeidas > 0 && (
          <button
            type="button"
            // "Marcar como leido" guarda el instante mas reciente de la
            // lista actual: todo lo que ya se ve deja de contar como nuevo,
            // y lo que llegue despues de este momento SI lo hara.
            onClick={() =>
              setUltimaLeida(entradas[0] ? entradas[0].cuando.toISOString() : null)
            }
            className="flex shrink-0 items-center gap-1.5 text-xs font-medium opacity-70 hover:opacity-100"
          >
            <CheckCheck className="size-3.5 shrink-0" aria-hidden="true" />
            Marcar como leido
          </button>
        )}
      </div>

      {!colapsada && (
        <ul
          id="lista-actividad-reciente"
          className="relative mt-4 space-y-3 pl-0.5"
        >
          {/* La linea continua de la cronologia, detras de los puntos. */}
          <div
            className="absolute top-1 bottom-1 left-[7px] w-px"
            style={{ backgroundColor: "var(--borde)" }}
            aria-hidden="true"
          />

          {entradas.map((e) => {
            const esNueva = listo && esPosterior(e.cuando);

            return (
              <li
                key={e.id}
                className="relative flex items-start gap-2.5 text-sm"
              >
                <span
                  aria-hidden="true"
                  className="relative z-10 mt-1.5 size-3.5 shrink-0 rounded-full border-2"
                  style={{
                    backgroundColor: "var(--superficie)",
                    borderColor: colorDelTono(e.tono),
                  }}
                />

                <div className="min-w-0">
                  <p
                    className={esNueva ? "font-semibold text-pretty" : "text-pretty"}
                  >
                    {e.texto}
                    {e.obra && (
                      <Link
                        href={`/obras/${e.obra.id}`}
                        className="ml-1.5 underline opacity-70 hover:opacity-100"
                      >
                        {e.obra.nombre}
                      </Link>
                    )}
                  </p>

                  {/* La fecha exacta va en el `title`: en pantalla se lee
                      mejor «hace 2 h», pero para una auditoria hace falta el
                      momento. */}
                  <p className="text-xs opacity-70" title={fechaHora(e.cuando)}>
                    {haceCuanto(e.cuando)}
                    {e.autor && ` · ${e.autor}`}
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {colapsada && (
        <p className="mt-1.5 flex items-center gap-1.5 text-xs opacity-60">
          <Info className="size-3 shrink-0" aria-hidden="true" />
          Contraida. Pulsa el titulo para volver a verla.
        </p>
      )}
    </section>
  );
}

function colorDelTono(tono: Entrada["tono"]): string {
  switch (tono) {
    case "exito":
      return "var(--color-exito)";
    case "peligro":
      return "var(--color-peligro)";
    case "alerta":
      return "var(--color-alerta)";
    case "curso":
      return "var(--color-marca-500)";
    default:
      return "var(--borde)";
  }
}
