"use client";

import Link from "next/link";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { ArrowLeft, Printer } from "lucide-react";
import { MODOS_CODIGO, type ModoCodigo } from "@/lib/evidencia-qr";

/**
 * Los controles de la hoja de codigos, que NO salen impresos.
 *
 * Como la barra de impresion de las ordenes: el PDF lo compone el navegador
 * con "Guardar como PDF". Aqui no hay nada que generar en el servidor.
 *
 * El modo viaja en la URL y no en un estado local para que la hoja se pueda
 * compartir por enlace y para que el boton de atras del navegador haga lo que
 * uno espera.
 */

const ETIQUETA_MODO: Record<ModoCodigo, string> = {
  obra: "Uno para toda la obra",
  tarea: "Uno por tarea",
  restriccion: "Uno por restricción",
};

const AYUDA_MODO: Record<ModoCodigo, string> = {
  obra:
    "Un solo código, para pegar en la caseta. Al escanearlo se abre un menú donde se elige el frente y la restricción desde el propio teléfono. Es el que conviene casi siempre.",
  tarea:
    "Un código por frente de trabajo, para pegarlo donde se trabaja. Al escanearlo se abre esa tarea con las restricciones que le apliquen.",
  restriccion:
    "Un código por cada restricción: cae directo en su panel. Solo se imprimen las que de verdad aplican, así que tiene sentido para un frente concreto y por poco tiempo.",
};

export function BarraCodigos({
  obraId,
  modo,
  total,
}: {
  obraId: string;
  modo: ModoCodigo;
  total: number;
}) {
  const router = useRouter();
  const ruta = usePathname();
  const parametros = useSearchParams();

  function cambiarModo(nuevo: ModoCodigo) {
    // Se conserva el resto de la consulta (la ventana de semanas), que es lo
    // que decide QUE tareas salen en la hoja.
    const p = new URLSearchParams(parametros.toString());
    p.set("por", nuevo);
    router.push(`${ruta}?${p.toString()}`);
  }

  return (
    <div className="mx-auto mb-6 w-full max-w-[210mm] space-y-3 print:hidden">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link
          href={`/obras/${obraId}/lookahead`}
          className="inline-flex items-center gap-1.5 text-sm opacity-70 hover:opacity-100"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          Volver al Lookahead
        </Link>

        <button
          type="button"
          onClick={() => window.print()}
          disabled={total === 0}
          className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
          style={{ backgroundColor: "var(--color-marca-600)" }}
        >
          <Printer className="size-4" aria-hidden="true" />
          Imprimir o guardar como PDF
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        {MODOS_CODIGO.map((m) => (
          <label key={m} className="inline-flex items-center gap-1.5 text-sm">
            <input
              type="radio"
              name="por"
              checked={modo === m}
              onChange={() => cambiarModo(m)}
              style={{ accentColor: "var(--color-marca-600)" }}
            />
            {ETIQUETA_MODO[m]}
          </label>
        ))}
      </div>

      <p className="text-xs opacity-70">{AYUDA_MODO[modo]}</p>

      {/* Cuantos van a salir, ANTES de mandar a imprimir. Es la diferencia
          entre una hoja y catorce, y en papel no hay deshacer. */}
      <p className="text-xs">
        Se imprimirán <strong className="tabular-nums">{total}</strong>{" "}
        código(s)
        {total > 30 && (
          <span style={{ color: "var(--color-alerta)" }}>
            {" "}— son muchos para pegar y mantener. Con{" "}
            <strong>uno para toda la obra</strong> basta en casi todos los casos.
          </span>
        )}
        .
      </p>
    </div>
  );
}
