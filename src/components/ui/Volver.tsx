import Link from "next/link";
import { ArrowLeft } from "lucide-react";

/**
 * El enlace de vuelta, en un solo sitio.
 *
 * Estaba copiado en nueve pantallas con el mismo marcado, y aun asi
 * `/empresa/datos` se quedo sin el: es lo que pasa cuando cada pagina se
 * escribe el suyo. Va con `print:hidden` porque la orden que se le manda al
 * proveedor no lleva encima la navegacion.
 */
export function Volver({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className="inline-flex items-center gap-1.5 text-sm opacity-70 hover:opacity-100 print:hidden"
    >
      <ArrowLeft className="size-4" aria-hidden="true" />
      {children}
    </Link>
  );
}
