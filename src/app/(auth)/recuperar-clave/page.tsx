import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { obtenerSesion } from "@/services/sesion.service";
import { FormularioRecuperacion } from "@/components/auth/FormularioRecuperacion";

export const metadata: Metadata = { title: "Recuperar clave" };

/**
 * Pedir el enlace de recuperacion. Ruta publica: quien llega aqui es
 * justamente quien no puede entrar.
 */
export default async function RecuperarClavePage() {
  // Con sesion abierta esto no pinta nada: el cambio de clave normal esta en
  // el perfil y pide la actual, que es mas seguro.
  if (await obtenerSesion()) redirect("/panel");

  return <FormularioRecuperacion />;
}
