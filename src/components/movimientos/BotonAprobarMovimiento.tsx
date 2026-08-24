"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { AlertCircle, LoaderCircle, Lock } from "lucide-react";
import {
  accionAprobarMovimiento,
  type EstadoMovimiento,
} from "@/app/(dashboard)/obras/[id]/movimientos/acciones";
import { useMotivoSinEscritura } from "@/components/obras/EscrituraDeLaObra";

/**
 * Aprobar un movimiento presupuestal.
 *
 * Misma confirmacion en dos pasos que aprobar una revision, y por el mismo
 * motivo: es irreversible y mueve la cifra contra la que se mide la obra.
 * Aqui ademas nacen las partidas de un adicional, asi que la pulsacion
 * cambia el arbol del presupuesto y no solo un total.
 */

interface Props {
  obraId: string;
  movimientoId: string;
  numero: number;
  /// Ya formateados por quien renderiza, que es un componente de servidor.
  tipo: string;
  concepto: string;
  entradas: string;
  salidas: string;
  neto: string;
}

export function BotonAprobarMovimiento({
  obraId,
  movimientoId,
  numero,
  tipo,
  concepto,
  entradas,
  salidas,
  neto,
}: Props) {
  const [estado, accion] = useActionState<EstadoMovimiento, FormData>(
    accionAprobarMovimiento,
    {},
  );
  const [confirmando, setConfirmando] = useState(false);

  /*
   * En una obra que no admite cambios no se ofrece aprobar.
   * Mismas opciones que `aprobarMovimiento` en el servidor: una obra PARALIZADA
   * SI lo admite -cierra algo en curso, no abre trabajo nuevo-, asi que
   * esconderlo aqui seria quitar una funcion que existe.
   */
  const sinEscritura =
    useMotivoSinEscritura({ permiteEnParalizada: true }) !== null;
  if (sinEscritura) return null;

  if (!confirmando) {
    return (
      <div className="space-y-2">
        <button
          type="button"
          onClick={() => setConfirmando(true)}
          className="inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm font-medium"
          style={{ borderColor: "var(--borde)" }}
        >
          <Lock className="size-4" aria-hidden="true" />
          Aprobar
        </button>

        {estado.error && <Aviso mensaje={estado.error} />}
      </div>
    );
  }

  return (
    <form
      action={accion}
      className="w-full rounded-lg border p-4"
      style={{
        borderColor: "var(--color-alerta)",
        backgroundColor:
          "color-mix(in oklab, var(--color-alerta) 10%, transparent)",
      }}
    >
      <input type="hidden" name="obraId" value={obraId} />
      <input type="hidden" name="movimientoId" value={movimientoId} />

      <h4 className="text-sm font-semibold">
        Vas a aprobar el movimiento {numero}
      </h4>
      <p className="mt-0.5 text-sm opacity-80">
        {tipo} · {concepto}
      </p>

      <dl className="mt-3 space-y-1 text-sm">
        <div className="flex justify-between gap-4">
          <dt className="opacity-70">Entra</dt>
          <dd className="tabular-nums">{entradas}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="opacity-70">Sale</dt>
          <dd className="tabular-nums">{salidas}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="opacity-70">Efecto en el presupuesto</dt>
          <dd className="font-semibold tabular-nums">{neto}</dd>
        </div>
      </dl>

      <ul className="mt-3 list-disc space-y-1 pl-5 text-sm">
        <li>
          <strong>No se puede deshacer.</strong> Para corregir un movimiento
          aprobado hay que registrar otro de signo contrario.
        </li>
        <li>
          Pasa a contar en el <strong>presupuesto vigente</strong>, que es
          contra el que se miden los indicadores de costo.
        </li>
        <li>
          Si trae partidas nuevas, <strong>se crean ahora</strong> en el
          árbol del presupuesto.
        </li>
      </ul>

      {estado.error && (
        <div className="mt-3">
          <Aviso mensaje={estado.error} />
        </div>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        <BotonConfirmar numero={numero} />
        <button
          type="button"
          onClick={() => setConfirmando(false)}
          className="rounded-lg border px-4 py-2 text-sm font-medium"
          style={{ borderColor: "var(--borde)" }}
        >
          Cancelar
        </button>
      </div>
    </form>
  );
}

function BotonConfirmar({ numero }: { numero: number }) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
      style={{ backgroundColor: "var(--color-marca-600)" }}
    >
      {pending ? (
        <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
      ) : (
        <Lock className="size-4" aria-hidden="true" />
      )}
      {pending ? "Aprobando..." : `Sí, aprobar el ${numero}`}
    </button>
  );
}

function Aviso({ mensaje }: { mensaje: string }) {
  return (
    <p
      role="alert"
      className="flex items-start gap-2 rounded-lg px-3 py-2 text-sm"
      style={{
        backgroundColor:
          "color-mix(in oklab, var(--color-peligro) 15%, transparent)",
      }}
    >
      <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      <span>{mensaje}</span>
    </p>
  );
}
