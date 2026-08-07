import { redirect } from "next/navigation";
import { obtenerSesion } from "@/services/sesion.service";

export default async function Home() {
  const sesion = await obtenerSesion();

  if (!sesion) redirect("/login");
  redirect(sesion.mustChangePassword ? "/cambiar-clave" : "/panel");
}
