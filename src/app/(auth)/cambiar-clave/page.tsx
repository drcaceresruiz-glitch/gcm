import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { obtenerSesion } from "@/services/sesion.service";
import { FormularioCambioClave } from "@/components/auth/FormularioCambioClave";

export const metadata: Metadata = { title: "Cambiar contrasena" };

export default async function CambiarClavePage() {
  const sesion = await obtenerSesion();
  if (!sesion) redirect("/login");

  return <FormularioCambioClave obligatorio={sesion.mustChangePassword} />;
}
