"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { LoaderCircle } from "lucide-react";
import {
  accionConfigurarDiaCorte,
  type EstadoDiaCorte,
} from "@/app/(dashboard)/obras/[id]/cronograma/acciones";

/**
 * Configura el dia de corte semanal de la obra: el dia en que se espera el
 * reporte de avance (cadencia Last Planner). Un select que se guarda al vuelo,
 * como el resto de controles pequenos de la obra.
 */
const DIAS: { valor: number; etiqueta: string }[] = [
  { valor: 1, etiqueta: "Lunes" },
  { valor: 2, etiqueta: "Martes" },
  { valor: 3, etiqueta: "Miércoles" },
  { valor: 4, etiqueta: "Jueves" },
  { valor: 5, etiqueta: "Viernes" },
  { valor: 6, etiqueta: "Sábado" },
  { valor: 7, etiqueta: "Domingo" },
];

export function DiaCorteSemanal({
  obraId,
  diaActual,
}: {
  obraId: string;
  diaActual: number;
}) {
  const [estado, accion] = useActionState<EstadoDiaCorte, FormData>(
    accionConfigurarDiaCorte,
    {},
  );

  return (
    <form action={accion} className="flex flex-wrap items-center gap-2 text-xs">
      <input type="hidden" name="obraId" value={obraId} />
      <label className="opacity-70">Día de corte</label>
      {/* `key` fuerza remontar el select cuando cambia el dia guardado, para que
          tras guardar refleje el valor nuevo (un select no controlado no se
          reajusta solo al revalidar). */}
      <select
        key={diaActual}
        name="dia"
        defaultValue={diaActual}
        className="rounded-lg border px-2 py-1 text-xs"
        style={{ borderColor: "var(--borde)", backgroundColor: "var(--fondo)" }}
      >
        {DIAS.map((d) => (
          <option key={d.valor} value={d.valor}>
            {d.etiqueta}
          </option>
        ))}
      </select>
      <Guardar />
      {estado.error && (
        <span style={{ color: "var(--color-peligro)" }}>{estado.error}</span>
      )}
      {estado.ok && <span style={{ color: "var(--color-exito)" }}>Guardado</span>}
    </form>
  );
}

function Guardar() {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex items-center gap-1 rounded-lg border px-2.5 py-1 text-xs font-medium disabled:opacity-60"
      style={{ borderColor: "var(--borde)" }}
    >
      {pending && <LoaderCircle className="size-3 animate-spin" aria-hidden="true" />}
      Guardar
    </button>
  );
}
