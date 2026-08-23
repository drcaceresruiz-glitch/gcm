"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { LoaderCircle, X } from "lucide-react";
import { Mascota } from "@/components/ui/Mascota";
import { accionConversacionReciente } from "@/app/(dashboard)/asistente/acciones";
import { Asistente } from "@/components/asistente/Asistente";
import type { MensajeAgenteResumen } from "@/services/agente-conversacion.service";

/**
 * El lanzador flotante del asistente: una burbuja fija en la esquina,
 * visible en cualquier pantalla del area privada, que abre el chat sin
 * salir de donde estabas -mismo patron que "Dormi" en drcaceresruiz.com,
 * no un widget inventado aparte.
 *
 * Usa la mascota de GCM (el maestro de obra de `public/mascota/`, ya
 * usada en otras pantallas) en vez de un modelo 3D: dos intentos con
 * modelos gratuitos de internet -un astronauta, despues un obrero
 * generico- no se parecian al personaje que la empresa ya tiene.
 *
 * La conversacion inicial NO viaja con cada pagina -eso pagaria esta
 * consulta en TODA el area privada, la abra alguien o no-. Se pide una
 * sola vez, la primera vez que alguien hace clic.
 */
export function LanzadorAsistente() {
  const pathname = usePathname();
  const [abierto, setAbierto] = useState(false);
  const [cargando, setCargando] = useState(false);
  const [conversacion, setConversacion] = useState<{
    id: string;
    mensajes: MensajeAgenteResumen[];
  } | null>(null);
  const [yaCargada, setYaCargada] = useState(false);
  const [activo, setActivo] = useState(false);

  // La pagina dedicada ya muestra el mismo chat a pantalla completa: la
  // burbuja encima seria un duplicado flotando sobre si mismo.
  if (pathname?.startsWith("/asistente")) return null;

  async function abrir() {
    setAbierto(true);
    if (yaCargada) return;
    setCargando(true);
    const r = await accionConversacionReciente();
    setConversacion(r);
    setYaCargada(true);
    setCargando(false);
  }

  return (
    <>
      {abierto && (
        <div
          className="elevacion-3 fixed right-4 bottom-24 z-50 flex max-h-[70vh] w-[380px] max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-xl border"
          style={{ borderColor: "var(--borde)", backgroundColor: "var(--superficie)" }}
          role="dialog"
          aria-label="Asistente"
        >
          <div
            className="flex shrink-0 items-center justify-between gap-2 border-b px-4 py-2"
            style={{ borderColor: "var(--borde)" }}
          >
            <div className="flex items-center gap-2">
              <Mascota pose={activo ? "pensando" : "sonriendo"} alto={40} />
              <span className="text-sm font-medium">Asistente</span>
            </div>
            <button
              type="button"
              onClick={() => setAbierto(false)}
              aria-label="Cerrar el asistente"
              className="rounded-lg p-1.5 opacity-70 hover:opacity-100"
            >
              <X className="size-4" aria-hidden="true" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-4">
            {cargando ? (
              <p className="flex items-center gap-2 text-sm opacity-70">
                <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
                Cargando…
              </p>
            ) : (
              <Asistente conversacionInicial={conversacion} alCambiarActividad={setActivo} />
            )}
          </div>
        </div>
      )}

      <button
        type="button"
        onClick={() => (abierto ? setAbierto(false) : void abrir())}
        aria-label={abierto ? "Cerrar el asistente" : "Abrir el asistente"}
        className="elevacion-3 fixed right-4 bottom-4 z-50 flex size-16 items-center justify-center overflow-hidden rounded-full"
        style={{ backgroundColor: "var(--superficie)" }}
      >
        {abierto ? (
          <X className="size-6 opacity-70" aria-hidden="true" />
        ) : (
          <Mascota pose="saludando" alto={64} className="translate-y-2" />
        )}
      </button>
    </>
  );
}
