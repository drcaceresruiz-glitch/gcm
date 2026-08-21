import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { obtenerSesion } from "@/services/sesion.service";
import { rutaSiguienteSegura } from "@/lib/siguiente";
import { FormularioLogin } from "@/components/auth/FormularioLogin";

export const metadata: Metadata = { title: "Ingresar" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{
    cambio?: string;
    recuperada?: string;
    codigo?: string;
    siguiente?: string;
  }>;
}) {
  const { cambio, recuperada, codigo, siguiente } = await searchParams;
  const destino = rutaSiguienteSegura(siguiente);

  // Si ya hay sesion no tiene sentido mostrar el formulario. Tambien aqui hay
  // que respetar `siguiente`: es el caso de quien llega con la pestana ya
  // logueada a un enlace de correo con sesion todavia viva.
  const sesion = await obtenerSesion();
  if (sesion) {
    redirect(sesion.mustChangePassword ? "/cambiar-clave" : (destino ?? "/panel"));
  }

  return (
    <FormularioLogin
      avisoCambio={cambio === "ok"}
      avisoRecuperada={recuperada === "ok"}
      avisoCodigo={codigo === "expirado"}
      siguiente={destino}
    />
  );
}
