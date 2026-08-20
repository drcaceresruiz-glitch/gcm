"use client";

import { useActionState } from "react";

import {
  accionGenerarContractual,
  type EstadoContractual,
} from "@/app/(dashboard)/obras/[id]/contractual/acciones";

/**
 * El segundo paso: confirmar.
 *
 * La casilla de reemplazo va SIN marcar y el boton lo dice en numeros. Borrar
 * el arbol de partidas de una obra no se puede deshacer con el boton de
 * atras, asi que se pide un gesto deliberado y no un clic de mas.
 */
export function ConfirmarContractual({
  obraId,
  partidas,
}: {
  obraId: string;
  partidas: number;
}) {
  const [estado, accion, pendiente] = useActionState<EstadoContractual, FormData>(
    accionGenerarContractual,
    {},
  );

  return (
    <form action={accion} className="space-y-3 rounded-lg border bg-slate-50 p-4">
      <input type="hidden" name="obraId" value={obraId} />

      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" name="reemplazar" className="mt-1" />
        <span>
          Reemplazar las partidas que ya tenga la obra. Marcalo solo si sabes
          que hay: las partidas escritas a mano no estan en ningun archivo del
          que se puedan recuperar.
        </span>
      </label>

      {estado.error && (
        <p className="text-sm text-red-700" role="alert">
          {estado.error}
        </p>
      )}

      <button
        type="submit"
        disabled={pendiente || partidas === 0}
        className="rounded bg-emerald-700 px-4 py-2 text-white disabled:opacity-50"
      >
        {pendiente
          ? "Generando..."
          : `Generar el contractual con ${partidas} partida(s)`}
      </button>
    </form>
  );
}
