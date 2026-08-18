import { Mail, MessageCircle, Paperclip, Smartphone } from "lucide-react";

import type { MensajeEnHistorial } from "@/services/mensajes-contratista.service";

/**
 * Lo que se le ha escrito a este contratista.
 *
 * ES LA RAZON DE SER DEL MODULO: sirve para decir «te avise el martes» cuando
 * el contratista dice que no se entero. Por eso ensena tambien lo que NO
 * salio: un intento fallido es informacion, y esconderlo daria a entender que
 * nunca se intento.
 *
 * WhatsApp aparece siempre como «preparado» y no como enviado, porque GCM no
 * lo manda: lo prepara y lo manda la persona. Decir otra cosa seria prometer
 * una entrega que nadie ha comprobado.
 */

const CANALES = {
  CORREO: { rotulo: "Correo", Icono: Mail },
  SMS: { rotulo: "SMS", Icono: Smartphone },
  WHATSAPP: { rotulo: "WhatsApp", Icono: MessageCircle },
} as const;

function cuando(fecha: Date): string {
  return new Intl.DateTimeFormat("es-PE", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(fecha);
}

function Estado({ mensaje }: { mensaje: MensajeEnHistorial }) {
  if (mensaje.canal === "WHATSAPP") {
    return (
      <span className="text-xs opacity-60" title="GCM no envía WhatsApp: lo manda la persona">
        Preparado
      </span>
    );
  }

  if (mensaje.enviado) {
    return (
      <span className="text-xs" style={{ color: "var(--color-exito)" }}>
        {mensaje.canal === "SMS" ? "Encolado" : "Enviado"}
      </span>
    );
  }

  return (
    <span className="text-xs" style={{ color: "var(--color-peligro)" }}>
      No salió{mensaje.motivo ? ` (${mensaje.motivo})` : ""}
    </span>
  );
}

export function HistorialMensajes({ mensajes }: { mensajes: MensajeEnHistorial[] }) {
  if (mensajes.length === 0) {
    return (
      <p className="rounded-lg border border-dashed p-6 text-center text-sm opacity-60"
         style={{ borderColor: "var(--borde)" }}>
        Todavía no se le ha escrito nada desde GCM.
      </p>
    );
  }

  return (
    <ul className="space-y-3">
      {mensajes.map((m) => {
        const { rotulo, Icono } = CANALES[m.canal];

        return (
          <li
            key={m.id}
            className="rounded-lg border p-3"
            style={{ borderColor: "var(--borde)", backgroundColor: "var(--superficie)" }}
          >
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs opacity-70">
              <span className="inline-flex items-center gap-1 font-medium">
                <Icono className="size-3.5" aria-hidden="true" />
                {rotulo}
              </span>
              <span>{m.destino}</span>
              <span>{cuando(m.cuando)}</span>
              <Estado mensaje={m} />
            </div>

            {m.asunto && <p className="mt-2 text-sm font-medium">{m.asunto}</p>}

            <p className="mt-1 text-sm whitespace-pre-wrap">{m.cuerpo}</p>

            {m.adjuntos.length > 0 && (
              <p className="mt-2 inline-flex items-center gap-1 text-xs opacity-60">
                <Paperclip className="size-3" aria-hidden="true" />
                {m.adjuntos.map((a) => a.nombre).join(", ")}
              </p>
            )}

            <p className="mt-2 text-xs opacity-60">
              {m.enviadoPor}
              {m.obra ? ` — ${m.obra}` : ""}
            </p>
          </li>
        );
      })}
    </ul>
  );
}
