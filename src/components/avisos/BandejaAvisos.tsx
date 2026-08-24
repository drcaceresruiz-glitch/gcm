"use client";

import { useTransition } from "react";
import Link from "next/link";
import {
  Banknote,
  BellRing,
  CalendarClock,
  CircleCheck,
  Clock,
  Diamond,
  Inbox,
  Mail,
  Wallet,
} from "lucide-react";
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
  // El rombo es como el Gantt dibuja un hito: sin barra, porque no dura.
  HITO_CERCA: Diamond,
  HITO_VENCIDO: Diamond,
  // El billete: lo que se espera es un corte de valorizacion, o sea dinero.
  VALORIZACION_PENDIENTE: Banknote,
  // El sobre: alguien de fuera escribio y hay algo que leer.
  RESPUESTA_CONTRATISTA: Mail,
  // El mismo icono que el widget de "proximos recordatorios" del tablero:
  // es la misma idea, una fecha que se queria recordar.
  NOTA_VENCIDA: CalendarClock,
  // La cartera: es el mismo icono con el que el panel de empresa rotula el
  // presupuesto, y aqui se habla justo de eso, de lo que queda para gastar.
  BOLSA_EN_RIESGO: Wallet,
  BOLSA_EN_ROJO: Wallet,
};

const COLOR: Record<EventoAviso, string> = {
  ABRIR: "var(--color-marca-500)",
  RECORDAR: "var(--color-alerta)",
  LISTA: "var(--color-exito)",
  RESUMEN: "var(--color-marca-500)",
  // «Se acerca» avisa, «vencido» ya duele: el color lo dice antes de leer.
  HITO_CERCA: "var(--color-alerta)",
  HITO_VENCIDO: "var(--color-peligro)",
  // Ambar y no rojo: AVISA, no bloquea. El rojo es para lo que ya duele.
  VALORIZACION_PENDIENTE: "var(--color-alerta)",
  // El color de la marca: es una novedad que atender, no un problema.
  RESPUESTA_CONTRATISTA: "var(--color-marca-500)",
  // Rojo, como HITO_VENCIDO: paso la fecha y sigue sin atenderse.
  NOTA_VENCIDA: "var(--color-peligro)",
  // Ambar mientras queda margen para renegociar, rojo cuando ya no queda: es
  // la misma pareja de HITO_CERCA y HITO_VENCIDO, y por el mismo motivo.
  BOLSA_EN_RIESGO: "var(--color-alerta)",
  BOLSA_EN_ROJO: "var(--color-peligro)",
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
