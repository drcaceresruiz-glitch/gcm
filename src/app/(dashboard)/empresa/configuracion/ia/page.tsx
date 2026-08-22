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
 * SOLO LA INFRAESTRUCTURA DE CREDENCIALES. El agente conversacional que las
 * usaria —chat, herramientas, turnos— todavia no existe: ver
 * `docs/PENDIENTES.md`, seccion 6b, para la arquitectura pre-conversada y
 * lo que sigue pendiente.
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
          La clave con la que GCM llamará a un proveedor de inteligencia
          artificial en tu nombre. Todavía no hay ningún agente conversacional
          que la use: esto solo deja la conexión lista y probada de verdad
          para cuando lo haya.
        </p>
      </div>

      <ProveedoresIa proveedores={proveedores} hayLlave={hayLlaveDeCifrado()} />
    </div>
  );
}
