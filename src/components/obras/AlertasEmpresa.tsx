"use client";

import { useState } from "react";
import Link from "next/link";
import { AlertTriangle, X } from "lucide-react";
import type { AlertaEmpresa } from "@/services/obras.service";

/**
 * Donde se consulta el «N alerta(s)» de la tarjeta de Saldo.
 *
 * Antes ese texto solo contaba: para ver DE QUE obra era la alerta habia que
 * bajar a la rejilla y abrir, una por una, el globo de cada tarjeta a ver
 * cual tenia la insignia encendida. Este es el mismo globo de `FranjaObra`,
 * pero para la empresa entera y con enlace directo a la obra que corresponde
 * -que con una sola obra es un atajo, y con muchas es la unica forma de
 * encontrarla sin adivinar-.
 */
export function AlertasEmpresa({ alertas }: { alertas: AlertaEmpresa[] }) {
  const [abierto, setAbierto] = useState(false);

  if (alertas.length === 0) {
    return <span>Sin alertas</span>;
  }

  return (
    <span className="relative inline-block">
      <button
        type="button"
        onClick={() => setAbierto((previo) => !previo)}
        aria-expanded={abierto}
        aria-label={`Ver ${alertas.length} alerta(s) de la empresa`}
        className="underline decoration-dotted underline-offset-2"
        style={{ color: "var(--color-peligro)" }}
      >
        {alertas.length === 1 ? "1 alerta" : `${alertas.length} alertas`}
      </button>

      {abierto && (
        <div
          // `z-30`: por encima de cualquier control de la fila de filtros
          // que viene justo debajo, que es sobre lo que este globo se abre.
          // La franja de la propia tarjeta de obra usa z-10 porque abre
          // HACIA ARRIBA, lejos del contenido; este abre hacia abajo y
          // necesita ganarle a lo que tiene debajo.
          className="absolute left-0 top-full z-30 mt-2 w-80 rounded-xl border p-3 text-left shadow-lg"
          style={{
            borderColor: "var(--borde)",
            backgroundColor: "var(--superficie)",
          }}
        >
          <div className="flex items-start justify-between gap-2">
            <h4 className="text-sm font-semibold">Requiere atencion</h4>
            <button
              type="button"
              onClick={() => setAbierto(false)}
              aria-label="Cerrar"
              className="rounded p-0.5 opacity-60 hover:opacity-100"
            >
              <X className="size-3.5" aria-hidden="true" />
            </button>
          </div>

          <ul className="mt-2 space-y-2">
            {alertas.map((a, i) => (
              <li
                key={`${a.obraId}-${a.clave}-${i}`}
                className="flex items-start gap-2 text-xs"
              >
                <AlertTriangle
                  className="mt-0.5 size-3.5 shrink-0"
                  style={{ color: "var(--color-peligro)" }}
                  aria-hidden="true"
                />
                <span className="min-w-0">
                  <Link
                    href={`/obras/${a.obraId}`}
                    className="font-medium underline underline-offset-2"
                  >
                    {a.obraNombre}
                  </Link>
                  <span className="block opacity-70">{a.texto}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </span>
  );
}
