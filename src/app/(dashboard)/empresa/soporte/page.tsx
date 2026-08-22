import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { obtenerSesion } from "@/services/sesion.service";
import { puede } from "@/lib/rbac";
import { hiloDeSoporte } from "@/services/soporte.service";
import { Volver } from "@/components/ui/Volver";
import { SoporteEmpresa } from "@/components/empresa/SoporteEmpresa";

export const metadata: Metadata = { title: "Soporte" };

/**
 * Hablar directo con quien administra GCM.
 *
 * Un solo hilo continuo, no un sistema de tickets con estado: la pregunta
 * que contesta es "¿puedo escribirle a alguien?", no "¿cómo llevo el
 * seguimiento de un caso?". Vive dentro de la app —sin correo de por
 * medio salvo un aviso de "tienes un mensaje nuevo"— porque los dos lados
 * ya son usuarios de GCM, a diferencia de un contratista.
 */
export default async function SoportePage() {
  const sesion = await obtenerSesion();
  if (!sesion) redirect("/login");
  if (!puede(sesion, "soporte:usar")) redirect("/panel");

  const mensajes = await hiloDeSoporte(sesion);

  return (
    <div className="space-y-6">
      <Volver href="/panel">Volver al panel</Volver>

      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Soporte</h1>
        <p className="mt-1 max-w-2xl text-sm text-pretty opacity-70">
          Habla directo con quien administra GCM. Alguien lo lee y responde
          desde aquí mismo — no es un contestador automático.
        </p>
      </div>

      <SoporteEmpresa mensajes={mensajes} />
    </div>
  );
}
