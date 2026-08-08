import Link from "next/link";
import { redirect } from "next/navigation";
import { HardHat, KeyRound, LogOut, ShieldCheck } from "lucide-react";
import { obtenerSesion } from "@/services/sesion.service";
import { puede } from "@/lib/rbac";
import { accionCerrarSesion } from "@/app/(auth)/acciones";

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

  return (
    <div className="flex min-h-dvh flex-col">
      <header
        className="sticky top-0 z-10 border-b"
        style={{
          borderColor: "var(--borde)",
          backgroundColor: "var(--superficie)",
        }}
      >
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <div className="flex items-center gap-2.5">
            <div
              className="flex size-8 shrink-0 items-center justify-center rounded-lg"
              style={{ backgroundColor: "var(--color-marca-500)" }}
            >
              <HardHat className="size-4 text-white" aria-hidden="true" />
            </div>
            <span className="font-semibold">GCM</span>
          </div>

          <div className="flex items-center gap-3">
            <div className="hidden text-right sm:block">
              <p className="text-sm leading-tight font-medium">
                {sesion.nombres} {sesion.apellidos}
              </p>
              <p className="text-xs leading-tight opacity-60">{sesion.role}</p>
            </div>

            {puede(sesion, "permiso:leer") && (
              <Link
                href="/empresa/permisos"
                className="flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-sm"
                style={{ borderColor: "var(--borde)" }}
              >
                <ShieldCheck className="size-4" aria-hidden="true" />
                <span className="hidden sm:inline">Permisos</span>
              </Link>
            )}

            {/* La pantalla existia desde el modulo 0 pero no estaba
                enlazada: la unica forma de llegar era escribir la direccion
                de memoria. Nadie cambia una contrasena asi. */}
            <Link
              href="/cambiar-clave"
              className="flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-sm"
              style={{ borderColor: "var(--borde)" }}
            >
              <KeyRound className="size-4" aria-hidden="true" />
              <span className="hidden sm:inline">Cambiar clave</span>
            </Link>

            <form action={accionCerrarSesion}>
              <button
                type="submit"
                className="flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-sm"
                style={{ borderColor: "var(--borde)" }}
              >
                <LogOut className="size-4" aria-hidden="true" />
                <span className="hidden sm:inline">Salir</span>
              </button>
            </form>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6">
        {children}
      </main>
    </div>
  );
}
