import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { obtenerSesion } from "@/services/sesion.service";
import { puede } from "@/lib/rbac";
import { conversacionReciente } from "@/services/agente-conversacion.service";
import { Tarjeta, SeccionTarjeta } from "@/components/ui/Tarjeta";
import { Asistente } from "@/components/asistente/Asistente";

export const metadata: Metadata = { title: "Asistente" };

/**
 * El agente de IA — Fase 2a, SOLO LECTURA.
 *
 * Responde con las mismas herramientas que ya existen —el semáforo de
 * partidas críticas, el sobregiro proyectado, la confiabilidad del plan
 * semanal—, con la sesión REAL de quien pregunta: nunca ve ni un dato al
 * que esa cuenta no llegue ya por su cuenta en otra pantalla. Todavía no
 * puede crear ni cambiar nada; eso es una entrega aparte, con su propio
 * patrón de proponer y confirmar.
 */
export default async function AsistentePage() {
  const sesion = await obtenerSesion();
  if (!sesion) redirect("/login");
  if (!puede(sesion, "agente_ia:usar")) redirect("/panel");

  const conversacion = await conversacionReciente(sesion);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Asistente</h1>
        <p className="mt-1 max-w-2xl text-sm text-pretty opacity-70">
          Pregúntale por el estado de tu cartera. Solo lee lo que ya
          verías en otras pantallas — todavía no puede crear ni cambiar
          nada.
        </p>
      </div>

      <Tarjeta>
        <SeccionTarjeta primera titulo="Conversación">
          <Asistente conversacionInicial={conversacion} />
        </SeccionTarjeta>
      </Tarjeta>
    </div>
  );
}
