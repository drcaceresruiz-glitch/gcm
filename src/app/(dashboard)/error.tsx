"use client";

import { PantallaError } from "@/components/ui/PantallaError";

/**
 * Frontera de error del area privada.
 *
 * Recoge lo que falle en cualquier pantalla de dentro que no tenga una
 * frontera mas cercana. Al estar por DEBAJO del layout del panel, la
 * cabecera, la navegacion y el pie siguen ahi: se puede ir a otro sitio sin
 * recargar.
 *
 * NO recoge los fallos del propio layout del panel —una frontera nunca atrapa
 * lo que revienta por encima de ella—. De eso se encarga `app/error.tsx`, y
 * es importante porque ese layout consulta la base en cada carga (avisos,
 * solicitudes, logo).
 */
export default function ErrorDelPanel({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <PantallaError error={error} reset={reset} volverA="/panel" />;
}
