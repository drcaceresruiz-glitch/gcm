"use client";

import { Tarjeta, SeccionTarjeta } from "@/components/ui/Tarjeta";
import { HiloSoporte } from "@/components/soporte/HiloSoporte";
import { accionEscribirSoporte } from "@/app/(dashboard)/empresa/soporte/acciones";
import type { MensajeSoporteResumen } from "@/services/soporte.service";

export function SoporteEmpresa({
  mensajes,
}: {
  mensajes: MensajeSoporteResumen[];
}) {
  return (
    <Tarjeta>
      <SeccionTarjeta primera titulo="Conversación con soporte">
        <HiloSoporte
          mensajes={mensajes}
          miDireccion="DE_LA_EMPRESA"
          accion={accionEscribirSoporte}
          vacio="Todavía no escribiste a soporte. Cuéntanos qué necesitas."
        />
      </SeccionTarjeta>
    </Tarjeta>
  );
}
