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
export interface Riesgo {
  creadasAMano: { codigo: string; descripcion: string }[];
  corregidasAMano: { codigo: string; descripcion: string }[];
  totalPartidas: number;
}

export function ConfirmarContractual({
  obraId,
  partidas,
  riesgo,
  puedeGenerar,
  recargos,
}: {
  obraId: string;
  partidas: number;
  riesgo: Riesgo;
  /// El servidor exige `partida:importar` para el POST, no `meta:leer` que
  /// ya exige la pantalla entera: sin el, mostrar el boton solo lleva a un
  /// rechazo silencioso al pulsarlo.
  puedeGenerar: boolean;
  /**
   * Los recargos que se han movido en la vista previa, o null si ninguno.
   *
   * Son PORCENTAJES, no importes: se guardan en la meta antes de generar y el
   * dinero lo recalcula el servidor desde la base. Ver el comentario largo de
   * la accion, que es donde vive esa regla.
   */
  recargos?: Readonly<Record<string, string>> | null;
}) {
  const [estado, accion, pendiente] = useActionState<EstadoContractual, FormData>(
    accionGenerarContractual,
    {},
  );

  if (!puedeGenerar) {
    return (
      <p className="rounded-lg border bg-slate-50 p-4 text-sm text-slate-600">
        Puedes ver esta vista previa, pero no tienes permiso para generar el
        contractual.
      </p>
    );
  }

  return (
    <form action={accion} className="space-y-3 rounded-lg border bg-slate-50 p-4">
      <input type="hidden" name="obraId" value={obraId} />
      {recargos && (
        <input type="hidden" name="recargos" value={JSON.stringify(recargos)} />
      )}

      {recargos && (
        <p className="text-sm text-slate-700">
          Se guardarán también los {Object.keys(recargos).length} recargo(s) que
          has cambiado, en el presupuesto meta.
        </p>
      )}

      {riesgo.totalPartidas > 0 && (
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" name="reemplazar" className="mt-1" />
          <span>
            Reemplazar las {riesgo.totalPartidas} partidas que ya tiene la obra.
            {riesgo.creadasAMano.length > 0 && (
              <strong className="block text-amber-800">
                {riesgo.creadasAMano.length} se escribieron a mano y no estan en
                ningun archivo: si las reemplazas, no hay de donde volver a
                sacarlas ({riesgo.creadasAMano
                  .slice(0, 5)
                  .map((p) => p.codigo)
                  .join(", ")}
                {riesgo.creadasAMano.length > 5 ? "..." : ""}).
              </strong>
            )}
            {riesgo.corregidasAMano.length > 0 && (
              <span className="block text-slate-600">
                Otras {riesgo.corregidasAMano.length} se importaron y se
                corrigieron despues: volverian a los valores calculados.
              </span>
            )}
          </span>
        </label>
      )}

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
