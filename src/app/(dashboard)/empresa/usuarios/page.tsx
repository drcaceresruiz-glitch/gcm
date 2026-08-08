import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { obtenerSesion } from "@/services/sesion.service";
import { listarUsuarios } from "@/services/usuarios.service";
import { puede } from "@/lib/rbac";
import { Volver } from "@/components/ui/Volver";
import { GestorUsuarios } from "@/components/usuarios/GestorUsuarios";

export const metadata: Metadata = { title: "Usuarios" };

/**
 * Gestion de usuarios de la empresa.
 *
 * Hasta ahora los usuarios solo nacian del seed: los cinco permisos
 * `usuario:*` estaban en la matriz sin pantalla que los usara. Aqui se abren
 * el alta, la edicion, el activar/desactivar y el reseteo de clave.
 */
export default async function UsuariosPage() {
  const sesion = await obtenerSesion();
  if (!sesion) redirect("/login");

  // La frontera real: sin leer usuarios no hay pantalla que ver.
  if (!puede(sesion, "usuario:leer")) redirect("/panel");

  const usuarios = await listarUsuarios(sesion);

  return (
    <div className="space-y-8">
      <div>
        <Volver href="/panel">Volver al panel</Volver>

        <h1 className="mt-3 text-2xl font-semibold tracking-tight">Usuarios</h1>
        <p className="mt-1 max-w-2xl text-sm text-pretty opacity-70">
          Las personas de tu empresa. Cada una nace con un rol, que trae sus
          permisos ya configurados, y una clave temporal que cambiara al entrar.
        </p>
      </div>

      <GestorUsuarios usuarios={usuarios} />
    </div>
  );
}
