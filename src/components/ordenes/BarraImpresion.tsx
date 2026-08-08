"use client";

import Link from "next/link";
import { ArrowLeft, Printer } from "lucide-react";

/**
 * Los controles de la pantalla, que NO salen impresos.
 *
 * El boton solo llama a `window.print()`: el PDF lo compone el navegador con
 * "Guardar como PDF" en el dialogo de impresion. No hay nada que generar en
 * el servidor ni ningun archivo que descargar.
 */

export function BarraImpresion({ obraId }: { obraId: string }) {
  return (
    <div className="mx-auto mb-6 flex w-full max-w-[210mm] items-center justify-between gap-4 print:hidden">
      <Link
        href={`/obras/${obraId}/ordenes`}
        className="inline-flex items-center gap-1.5 text-sm opacity-70 hover:opacity-100"
      >
        <ArrowLeft className="size-4" aria-hidden="true" />
        Volver a las ordenes
      </Link>

      <button
        type="button"
        onClick={() => window.print()}
        className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-white"
        style={{ backgroundColor: "var(--color-marca-600)" }}
      >
        <Printer className="size-4" aria-hidden="true" />
        Imprimir o guardar como PDF
      </button>
    </div>
  );
}
