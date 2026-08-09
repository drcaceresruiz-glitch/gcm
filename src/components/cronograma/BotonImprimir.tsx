"use client";

import { Printer } from "lucide-react";

/**
 * Imprimir o guardar como PDF.
 *
 * Es lo unico de la pagina del informe que necesita JavaScript, y son tres
 * lineas: el resto se calcula en el servidor. Un generador de PDF propio
 * exigiria un navegador sin ventana en el servidor, y este despliegue no
 * puede correr binarios compilados —el mismo muro que dejo fuera al motor de
 * Prisma—. El dialogo del navegador ya trae «Guardar como PDF».
 */
export function BotonImprimir() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-white"
      style={{ backgroundColor: "var(--color-marca-600)" }}
    >
      <Printer className="size-4" aria-hidden="true" />
      Imprimir / Guardar PDF
    </button>
  );
}
