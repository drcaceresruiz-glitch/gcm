import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { obtenerSesion } from "@/services/sesion.service";
import { FormularioLogin } from "@/components/auth/FormularioLogin";

export const metadata: Metadata = { title: "Ingresar" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ cambio?: string; recuperada?: string }>;
}) {
  // Si ya hay sesion no tiene sentido mostrar el formulario.
  const sesion = await obtenerSesion();
  if (sesion) {
    redirect(sesion.mustChangePassword ? "/cambiar-clave" : "/panel");
  }

  const { cambio, recuperada } = await searchParams;

  return (
    <FormularioLogin
      avisoCambio={cambio === "ok"}
      avisoRecuperada={recuperada === "ok"}
    />
  );
}
