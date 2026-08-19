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
  // Lo entrante no tiene estado de envio: no lo mando GCM, llego. Reusar
  // «Enviado» aqui diria que GCM mando un correo que escribio el contratista.
  if (mensaje.entrante) {
    return (
      <span className="text-xs" style={{ color: "var(--color-marca-600)" }}>
        Recibido
      </span>
    );
  }

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

  // Para poder decir «responde a lo del martes» cuando el mensaje original
  // esta entre los cargados. Si no esta, no se inventa nada: se calla.
  const porId = new Map(mensajes.map((m) => [m.id, m]));

  return (
    <ul className="space-y-3">
      {mensajes.map((m) => {
        const { rotulo, Icono } = CANALES[m.canal];
        const responde = m.enRespuestaA ? porId.get(m.enRespuestaA) : undefined;

        return (
          <li
            key={m.id}
            // La respuesta se sangra y cambia de fondo: en una lista larga hay
            // que distinguir de un vistazo lo que dijimos de lo que nos
            // dijeron, sin leer el estado de cada fila.
            className={`rounded-lg border p-3 ${m.entrante ? "ml-4 border-l-4" : ""}`}
            style={{
              borderColor: "var(--borde)",
              backgroundColor: m.entrante ? "var(--fondo)" : "var(--superficie)",
              ...(m.entrante ? { borderLeftColor: "var(--color-marca-500)" } : {}),
            }}
          >
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs opacity-70">
              <span className="inline-flex items-center gap-1 font-medium">
                <Icono className="size-3.5" aria-hidden="true" />
                {rotulo}
              </span>
              <span>{m.entrante ? `de ${m.enviadoPor}` : m.destino}</span>
              <span>{cuando(m.cuando)}</span>
              <Estado mensaje={m} />
            </div>

            {responde && (
              <p className="mt-1 text-xs opacity-60">
                Responde a lo enviado el {cuando(responde.cuando)}
              </p>
            )}

            {m.asunto && <p className="mt-2 text-sm font-medium">{m.asunto}</p>}

            <p className="mt-1 text-sm whitespace-pre-wrap">{m.cuerpo}</p>

            {m.adjuntos.length > 0 && (
              <p className="mt-2 inline-flex items-center gap-1 text-xs opacity-60">
                <Paperclip className="size-3" aria-hidden="true" />
                {m.adjuntos.map((a) => a.nombre).join(", ")}
              </p>
            )}

            {/* En lo entrante, quien escribe ya va arriba: repetirlo aqui
                sobraria. Lo que si importa es si se pudo atar a una obra —una
                respuesta sin obra vive solo en esta ficha, y hay que decirlo
                en vez de dejar creer que aparecera en el frente—. */}
            <p className="mt-2 text-xs opacity-60">
              {m.entrante
                ? (m.obra ?? "Sin obra: solo aparece en esta ficha")
                : `${m.enviadoPor}${m.obra ? ` — ${m.obra}` : ""}`}
            </p>
          </li>
        );
      })}
    </ul>
  );
}
