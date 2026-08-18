"use client";

import { PantallaError } from "@/components/ui/PantallaError";

/**
 * Frontera de error de la raiz.
 *
 * Recoge lo que ninguna otra alcanza, y en particular **los fallos del layout
 * del area privada** —el que pinta la cabecera—: una frontera no atrapa lo
 * que revienta por encima de ella, asi que la de `(dashboard)` no puede
 * cubrir a su propio layout.
 *
 * Importa porque ese layout consulta la base en CADA carga: avisos sin leer,
 * solicitudes pendientes, foto de perfil y logo de la empresa. Un fallo ahi
 * dejaba toda la aplicacion en la pantalla negra de Next.
 *
 * Aqui ya no hay cabecera que conservar —la que fallo es ella—, asi que esto
 * se ve solo, y por eso el enlace lleva al panel: es la unica forma de volver
 * a montarla.
 */
export default function ErrorRaiz({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex min-h-dvh items-center justify-center p-6">
      <PantallaError error={error} reset={reset} volverA="/panel" />
    </div>
  );
}
