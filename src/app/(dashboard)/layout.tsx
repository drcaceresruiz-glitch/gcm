import Link from "next/link";
import { redirect } from "next/navigation";
import { HardHat } from "lucide-react";
import { obtenerSesion } from "@/services/sesion.service";
import { puede } from "@/lib/rbac";
import {
  Navegacion,
  type EnlaceEmpresa,
} from "@/components/navegacion/Navegacion";

/**
 * Area privada.
 *
 * Aqui SI se valida de verdad: `obtenerSesion` consulta la base en cada
 * peticion y comprueba que el token siga vigente y el usuario siga activo.
 * El middleware solo miro que existiera una cookie.
 */
export default async function DashboardLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const sesion = await obtenerSesion();
  if (!sesion) redirect("/login");

  // Nadie navega por el sistema con una clave temporal sin estrenar.
  if (sesion.mustChangePassword) redirect("/cambiar-clave");

  // Los permisos se resuelven aqui y no en el componente de navegacion: la
  // comprobacion se queda en el servidor y al cliente solo viaja la lista de
  // enlaces que esa persona puede ver.
  const enlaces = [
    puede(sesion, "proveedor:leer") && {
      href: "/empresa/proveedores",
      etiqueta: "Proveedores",
      clave: "proveedores",
    },
    puede(sesion, "orden:leer") && {
      href: "/empresa/formas-pago",
      etiqueta: "Formas de pago",
      clave: "formasPago",
    },
    puede(sesion, "empresa:editar") && {
      href: "/empresa/datos",
      etiqueta: "Datos de la empresa",
      clave: "empresa",
    },
    puede(sesion, "permiso:leer") && {
      href: "/empresa/permisos",
      etiqueta: "Permisos",
      clave: "permisos",
    },
  ].filter(Boolean) as EnlaceEmpresa[];

  return (
    <div className="flex min-h-dvh flex-col">
      {/* `print:hidden` es lo que permite que las pantallas que son
          documentos —la orden que se le manda al proveedor— salgan por la
          impresora sin la barra de navegacion encima. */}
      <header
        className="elevacion-1 sticky top-0 z-20 border-b print:hidden"
        style={{
          borderColor: "var(--borde)",
          backgroundColor: "var(--superficie)",
        }}
      >
        <div className="relative mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
          {/* El logotipo era un `div`. Convertirlo en enlace es lo que hace
              que se pueda volver al panel desde cualquier pantalla, que
              hasta ahora dependia de que cada pagina se escribiera el suyo. */}
          <Link href="/panel" className="flex items-center gap-2.5">
            <div
              className="flex size-8 shrink-0 items-center justify-center rounded-lg"
              style={{ backgroundColor: "var(--color-marca-500)" }}
            >
              <HardHat className="size-4 text-white" aria-hidden="true" />
            </div>
            <span className="font-semibold">GCM</span>
          </Link>

          <Navegacion
            empresa={enlaces}
            usuario={{
              nombre: `${sesion.nombres} ${sesion.apellidos}`,
              rol: sesion.role,
            }}
          />
        </div>
      </header>

      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6 print:max-w-none print:p-0">
        {children}
      </main>
    </div>
  );
}
