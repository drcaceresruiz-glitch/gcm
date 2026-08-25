import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { obtenerSesion } from "@/services/sesion.service";
import { puede } from "@/lib/rbac";
import { listarProveedoresIa } from "@/services/agente-ia.service";
import { hayLlaveDeCifrado } from "@/lib/secreto";
import { Volver } from "@/components/ui/Volver";
import { ProveedoresIa } from "@/components/empresa/ProveedoresIa";

export const metadata: Metadata = { title: "Proveedores de IA" };

/**
 * Donde cada empresa guarda su propio proveedor de IA, con su propia clave.
 *
 * Subpagina propia y no dentro de `/empresa/configuracion` a proposito:
 * a diferencia del buzon de correo (una fila fija), esto es una LISTA que
 * puede crecer, y mezclarla en la pantalla principal la haria sentir mas
 * larga de lo que ya esta.
 *
 * Y es donde se ARREGLA un asistente caido: el agente conversacional
 * (`/asistente`) llama al proveedor que esta activo aqui, con el modelo
 * que diga esta pantalla. Si el proveedor deja de responder —un modelo
 * saturado o retirado— se cambia el modelo, o se activa otro proveedor ya
 * probado, sin tocar codigo ni desplegar nada.
 */
export default async function ProveedoresIaPage() {
  const sesion = await obtenerSesion();
  if (!sesion) redirect("/login");

  if (!puede(sesion, "configuracion:editar")) redirect("/empresa/configuracion");

  const proveedores = await listarProveedoresIa(sesion);

  return (
    <div className="space-y-6">
      <Volver href="/empresa/configuracion">Volver a Configuración</Volver>

      <div>
        <h2 className="text-xl font-semibold tracking-tight">
          Proveedores de IA
        </h2>
        <p className="mt-1 max-w-2xl text-sm text-pretty opacity-70">
          La clave con la que GCM llama a un proveedor de inteligencia
          artificial en tu nombre. Es la que usa el asistente: si deja de
          responder, aquí se cambia el modelo o se activa otro proveedor ya
          probado.
        </p>
      </div>

      <ProveedoresIa proveedores={proveedores} hayLlave={hayLlaveDeCifrado()} />
    </div>
  );
}
