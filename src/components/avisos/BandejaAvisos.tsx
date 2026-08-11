"use client";

import { useTransition } from "react";
import Link from "next/link";
import { BellRing, CircleCheck, Clock, Inbox } from "lucide-react";
import { fechaCorta } from "@/utils/fechas";
import { accionMarcarLeidos } from "@/app/(dashboard)/avisos/acciones";
import type { AvisoBandeja } from "@/services/avisos-bandeja";
import type { EventoAviso } from "@/generated/prisma/enums";

/**
 * La lista de avisos de una persona.
 *
 * Dos decisiones heredadas del panel «Que falta», y por las mismas razones:
 *
 * - **Nada parpadea.** Lo que parpadea se ignora a los tres dias y molesta
 *   desde el primero. Lo no leido se distingue con una barra de color y con
 *   estar arriba, no con movimiento.
 * - **Cada linea dice la CONSECUENCIA y lleva su enlace.** Un aviso del que no
 *   se puede salir a arreglar la cosa es solo una queja.
 */

const ICONO: Record<EventoAviso, typeof BellRing> = {
  ABRIR: BellRing,
  RECORDAR: Clock,
  LISTA: CircleCheck,
  RESUMEN: Inbox,
};

const COLOR: Record<EventoAviso, string> = {
  ABRIR: "var(--color-marca-500)",
  RECORDAR: "var(--color-alerta)",
  LISTA: "var(--color-exito)",
  RESUMEN: "var(--color-marca-500)",
};

export function BandejaAvisos({ avisos }: { avisos: AvisoBandeja[] }) {
  const [pendiente, iniciar] = useTransition();
  const sinLeer = avisos.filter((a) => !a.leido).length;

  if (avisos.length === 0) {
    return (
      <p className="text-sm opacity-70">
        No tienes ningún aviso. Aparecerán aquí cuando alguien te asigne un
        flujo de restricciones en la pantalla de <strong>Personal</strong> de una
        obra.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {sinLeer > 0 && (
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-sm">
            <strong className="tabular-nums">{sinLeer}</strong> sin leer
          </span>
          <button
            type="button"
            disabled={pendiente}
            onClick={() => iniciar(async () => void (await accionMarcarLeidos()))}
            className="text-sm underline opacity-70 hover:opacity-100 disabled:opacity-40"
          >
            Marcar todo como leído
          </button>
        </div>
      )}

      <ul className="space-y-2">
        {avisos.map((a) => {
          const Icono = ICONO[a.evento];
          return (
            <li
              key={a.id}
              className="flex items-start gap-3 rounded-lg border p-3"
              style={{
                borderColor: a.leido ? "var(--borde)" : COLOR[a.evento],
                // Lo no leido se apoya en un lavado muy suave, no en un color
                // plano: una lista entera en color deja de senalar nada.
                backgroundColor: a.leido
                  ? undefined
                  : `color-mix(in oklab, ${COLOR[a.evento]} 6%, transparent)`,
              }}
            >
              <Icono
                className="mt-0.5 size-4 shrink-0"
                style={{ color: COLOR[a.evento] }}
                aria-hidden="true"
              />

              <div className="min-w-0 flex-1">
                <Link
                  href={a.camino}
                  onClick={() =>
                    iniciar(async () => void (await accionMarcarLeidos([a.id])))
                  }
                  className="text-sm font-medium underline decoration-transparent underline-offset-2 hover:decoration-inherit"
                >
                  {a.titulo}
                </Link>
                <p className="text-xs opacity-70">{a.cuerpo}</p>
                <p className="mt-1 text-xs opacity-50">
                  {a.obra} · {fechaCorta(a.createdAt)}
                </p>
              </div>

              {!a.leido && (
                <button
                  type="button"
                  disabled={pendiente}
                  onClick={() =>
                    iniciar(async () => void (await accionMarcarLeidos([a.id])))
                  }
                  className="shrink-0 text-xs underline opacity-60 hover:opacity-100 disabled:opacity-40"
                >
                  Leído
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
