import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { obtenerSesion } from "@/services/sesion.service";
import { listarSolicitudes } from "@/services/perfil.service";
import { puede } from "@/lib/rbac";
import { Volver } from "@/components/ui/Volver";
import { BandejaSolicitudes } from "@/components/perfil/BandejaSolicitudes";

export const metadata: Metadata = { title: "Solicitudes de perfil" };

/**
 * La bandeja del ADMIN para las solicitudes de cambio de perfil.
 *
 * Exige `usuario:editar`. Es la unica via, por ahora, en que ese permiso se
 * estrena: la gestion de usuarios completa (alta, baja, reset de clave) es su
 * propio modulo.
 */
export default async function SolicitudesPage() {
  const sesion = await obtenerSesion();
  if (!sesion) redirect("/login");

  // El middleware ya filtra la navegacion, pero la frontera real es esta.
  if (!puede(sesion, "usuario:editar")) redirect("/panel");

  const solicitudes = await listarSolicitudes(sesion);

  return (
    <div className="space-y-8">
      <div>
        <Volver href="/panel">Volver al panel</Volver>

        <h1 className="mt-3 text-2xl font-semibold tracking-tight">
          Solicitudes de perfil
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-pretty opacity-70">
          Cambios de identidad que piden los usuarios. Aprobar aplica los datos
          al instante; rechazar exige un motivo.
        </p>
      </div>

      <BandejaSolicitudes solicitudes={solicitudes} />
    </div>
  );
}
