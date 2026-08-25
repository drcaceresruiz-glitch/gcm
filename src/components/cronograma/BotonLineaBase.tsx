"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { AlertCircle, Flag, LoaderCircle } from "lucide-react";
import {
  accionMarcarLineaBase,
  type EstadoLineaBase,
} from "@/app/(dashboard)/obras/[id]/cronograma/acciones";
import { Explicacion } from "@/components/ui/Explicacion";
import { CONGELAR_CRONOGRAMA } from "@/lib/explicaciones";
import { useMotivoSinEscritura } from "@/components/obras/EscrituraDeLaObra";

/**
 * Fijar (o re-fijar) una version del cronograma como linea base.
 *
 * La confirmacion es en dos pasos y con la version delante, no un `confirm()`
 * del navegador: cambia la referencia contra la que se mide el EVM, y quien lo
 * pulsa debe leer que version esta fijando. Re-fijable a proposito —al reves
 * que la del presupuesto—: fijar otra version limpia la anterior.
 *
 * Un solo componente cubre los tres casos: el corte que YA es base (muestra el
 * distintivo), el que se puede fijar (boton), y el resto para quien no tiene
 * permiso (no pinta nada).
 */
export function BotonLineaBase({
  obraId,
  cronogramaId,
  version,
  fecha,
  esActual,
  puedeFijar,
}: {
  obraId: string;
  cronogramaId: string;
  version: number;
  fecha: string;
  esActual: boolean;
  puedeFijar: boolean;
}) {
  const [estado, accion] = useActionState<EstadoLineaBase, FormData>(
    accionMarcarLineaBase,
    {},
  );
  const [confirmando, setConfirmando] = useState(false);

  if (esActual) {
    return (
      <span
        className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium"
        style={{
          color: "var(--color-marca-600)",
          backgroundColor: "color-mix(in oklab, var(--color-marca-600) 15%, transparent)",
        }}
      >
        <Flag className="size-3" aria-hidden="true" />
        Línea base
      </span>
    );
  }

  if (!puedeFijar) return null;

  if (!confirmando) {
    return (
      <span className="inline-flex flex-col items-start gap-1">
        <button
          type="button"
          onClick={() => setConfirmando(true)}
          className="inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-medium"
          style={{ borderColor: "var(--borde)" }}
        >
          <Flag className="size-3.5" aria-hidden="true" />
          Fijar como línea base
        </button>
        {estado.error && <Aviso mensaje={estado.error} />}
      </span>
    );
  }

  return (
    <form
      action={accion}
      className="w-full rounded-lg border p-3"
      style={{
        borderColor: "var(--color-marca-600)",
        backgroundColor: "color-mix(in oklab, var(--color-marca-600) 8%, transparent)",
      }}
    >
      <input type="hidden" name="obraId" value={obraId} />
      <input type="hidden" name="cronogramaId" value={cronogramaId} />

      <p className="text-sm">
        Fijar la <strong>v{version}</strong> ({fecha}) como línea base. El{" "}
        <strong>PV y el SPI</strong> del valor ganado pasarán a medirse contra
        esta versión. Si ya había otra base, deja de serlo.
      </p>

      {/* La explicacion completa, plegada. Quien ya sabe lo que hace no la
          abre; quien no, no tiene que ir a buscarla a otra pantalla. */}
      <div className="mt-3">
        <Explicacion texto={CONGELAR_CRONOGRAMA} />
      </div>

      {estado.error && (
        <div className="mt-2">
          <Aviso mensaje={estado.error} />
        </div>
      )}

      <div className="mt-3 flex flex-wrap gap-2">
        <BotonConfirmar version={version} />
        <button
          type="button"
          onClick={() => setConfirmando(false)}
          className="rounded-lg border px-3 py-1.5 text-sm font-medium"
          style={{ borderColor: "var(--borde)" }}
        >
          Cancelar
        </button>
      </div>
    </form>
  );
}

function BotonConfirmar({ version }: { version: number }) {
  const { pending } = useFormStatus();

  /*
   * En una obra que no admite cambios no se ofrece: `marcarLineaBase` lo
   * rechaza, y un boton que siempre falla invita a probar. El motivo se
   * explica una vez por pantalla, no en cada control.
   * Mismas opciones que el servidor: sin excepciones.
   * Va DESPUES del ultimo hook: un `return` por delante de una llamada a
   * un hook cambia el orden entre renders y React lo prohibe.
   */
  const sinEscritura = useMotivoSinEscritura() !== null;
  if (sinEscritura) return null;

  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium text-white disabled:opacity-60"
      style={{ backgroundColor: "var(--color-marca-600)" }}
    >
      {pending ? (
        <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
      ) : (
        <Flag className="size-4" aria-hidden="true" />
      )}
      {pending ? "Fijando..." : `Fijar la v${version}`}
    </button>
  );
}

function Aviso({ mensaje }: { mensaje: string }) {
  return (
    <p
      role="alert"
      className="flex items-start gap-2 rounded-lg px-3 py-2 text-sm"
      style={{
        backgroundColor: "color-mix(in oklab, var(--color-peligro) 15%, transparent)",
      }}
    >
      <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      <span>{mensaje}</span>
    </p>
  );
}
