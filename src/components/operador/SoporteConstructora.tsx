"use client";

import { HiloSoporte } from "@/components/soporte/HiloSoporte";
import { accionEscribirSoportePorOperador } from "@/app/(dashboard)/operador/acciones";
import type { MensajeSoporteResumen } from "@/services/soporte.service";

/** El hilo de soporte de UNA constructora, visto desde el operador. */
export function SoporteConstructora({
  empresaId,
  mensajes,
}: {
  empresaId: string;
  mensajes: MensajeSoporteResumen[];
}) {
  return (
    <section
      className="space-y-3 rounded-lg border p-4"
      style={{ borderColor: "var(--borde)" }}
    >
      <div>
        <h3 className="text-base font-semibold">Soporte</h3>
        <p className="mt-0.5 text-sm opacity-70 text-pretty">
          Correspondencia directa con esta constructora.
        </p>
      </div>

      <HiloSoporte
        mensajes={mensajes}
        miDireccion="DEL_OPERADOR"
        accion={accionEscribirSoportePorOperador}
        vacio="Todavía no hay ningún mensaje con esta constructora."
        camposOcultos={{ empresaId }}
      />
    </section>
  );
}
