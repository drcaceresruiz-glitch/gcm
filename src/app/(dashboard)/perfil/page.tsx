import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { obtenerSesion } from "@/services/sesion.service";
import { obtenerPerfil } from "@/services/perfil.service";
import { Volver } from "@/components/ui/Volver";
import { FormularioPerfil } from "@/components/perfil/FormularioPerfil";

export const metadata: Metadata = { title: "Mi perfil" };

/**
 * El perfil de la persona que ha iniciado sesion.
 *
 * Los campos del `User` existian desde el primer dia pero no habia donde
 * verlos ni tocarlos: se rellenaban en el seed y ahi se quedaban. El telefono
 * se guarda directo; la identidad se solicita y la aprueba un ADMIN.
 */
export default async function PerfilPage() {
  const sesion = await obtenerSesion();
  if (!sesion) redirect("/login");

  const perfil = await obtenerPerfil(sesion);
  if (!perfil) notFound();

  return (
    <div className="space-y-8">
      <div>
        <Volver href="/panel">Volver al panel</Volver>

        <h1 className="mt-3 text-2xl font-semibold tracking-tight">Mi perfil</h1>
        <p className="mt-1 max-w-2xl text-sm text-pretty opacity-70">
          Tus datos. El telefono se guarda al instante; cambiar tu identidad
          requiere aprobacion de un administrador.
        </p>
      </div>

      <FormularioPerfil perfil={perfil} />
    </div>
  );
}
