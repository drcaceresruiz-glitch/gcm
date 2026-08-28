"use client";

import { useActionState, useEffect, useState } from "react";
import { useFormStatus } from "react-dom";
import { Handshake, LoaderCircle } from "lucide-react";

import { accionAjusteDelContratista } from "@/app/(dashboard)/obras/[id]/meta/acciones-lineas";
import { cascadaDelContratista } from "@/lib/cascada-contratista";
import { soles } from "@/utils/formato";

/**
 * Lo que cobra el contratista de un capitulo, editable desde la pantalla.
 *
 * ENSENA LA CASCADA ENTERA MIENTRAS SE ESCRIBE, y no solo el resultado: quien
 * rellena esto tiene la cotizacion en papel delante y lo que necesita es
 * comparar linea por linea. Si el total no cuadra con el del contratista, la
 * diferencia se ve al momento y no hay que rehacer la cuenta a mano.
 *
 * Los dos margenes van sobre el importe YA DESCONTADO, que es la convencion
 * del formato peruano. Se dice en la propia pantalla porque la otra forma
 * -encadenarlos- da una cifra parecida y equivocada, y quien lo teclea es
 * quien puede detectarlo.
 */

function Guardar() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium text-white disabled:opacity-60"
      style={{ backgroundColor: "var(--color-marca-600)" }}
    >
      {pending && <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />}
      Guardar
    </button>
  );
}

function Pct({
  etiqueta,
  nombre,
  valor,
  onChange,
}: {
  etiqueta: string;
  nombre: string;
  valor: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="block">
      <span className="block text-xs font-medium opacity-80">{etiqueta}</span>
      <span className="mt-1 flex items-center gap-1">
        <input
          name={nombre}
          value={valor}
          onChange={(e) => onChange(e.target.value)}
          inputMode="decimal"
          placeholder="0"
          className="w-20 rounded-lg border px-2 py-1 text-right text-sm tabular-nums"
          style={{ borderColor: "var(--borde)", background: "transparent" }}
        />
        <span className="text-sm opacity-60">%</span>
      </span>
    </label>
  );
}

export function AjusteDelContratista({
  obraId,
  lineaId,
  capitulo,
  cotizado,
  descuento,
  gastosGenerales,
  utilidad,
  alTerminar,
}: {
  obraId: string;
  lineaId: string;
  capitulo: string;
  /// Lo que suman las partidas del bloque en el papel del contratista.
  cotizado: string;
  descuento: string;
  gastosGenerales: string;
  utilidad: string;
  alTerminar: () => void;
}) {
  const [estado, enviar] = useActionState(accionAjusteDelContratista, {});
  const [d, setD] = useState(descuento);
  const [g, setG] = useState(gastosGenerales);
  const [u, setU] = useState(utilidad);

  useEffect(() => {
    if (estado.ok) alTerminar();
  }, [estado.ok, alTerminar]);

  // La cuenta se rehace en cada tecla: es lo que se compara con el papel.
  const c = cascadaDelContratista(cotizado, {
    descuento: d || null,
    gastosGenerales: g || null,
    utilidad: u || null,
  });

  return (
    <form
      action={enviar}
      className="space-y-3 rounded-xl border p-4"
      style={{ borderColor: "var(--borde)" }}
    >
      <input type="hidden" name="obraId" value={obraId} />
      <input type="hidden" name="lineaId" value={lineaId} />

      <div className="flex items-start gap-2">
        <Handshake className="mt-0.5 size-4 shrink-0 opacity-70" aria-hidden="true" />
        <div>
          <p className="text-sm font-semibold">Lo que cobra el contratista</p>
          <p className="text-xs text-pretty opacity-70">
            De <strong>{capitulo}</strong>. Se reparte entre sus partidas, así
            que lo que se valorice llegará al 100 % de lo pactado. No tiene nada
            que ver con el recargo que se le carga al cliente.
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <Pct etiqueta="Descuento" nombre="descuento" valor={d} onChange={setD} />
        <Pct etiqueta="Gastos generales" nombre="gastosGenerales" valor={g} onChange={setG} />
        <Pct etiqueta="Utilidad" nombre="utilidad" valor={u} onChange={setU} />
      </div>

      <dl
        className="rounded-lg px-3 py-2 text-sm tabular-nums"
        style={{ background: "color-mix(in oklab, var(--borde) 25%, transparent)" }}
      >
        {[
          ["Suma de sus partidas", c.cotizado, false],
          ["Descuento", c.descuento, false],
          ["Gastos generales", c.gastosGenerales, false],
          ["Utilidad", c.utilidad, false],
          // El total de SU cotizacion, que es lo mismo que se le paga. Se
          // rotula asi para que se compare con el papel sin dudar: la suma de
          // las partidas NO es lo que el contratista cotiza.
          ["Total de su cotización, a pagarle", c.aPagar, true],
        ].map(([rotulo, valor, fuerte]) => (
          <div
            key={rotulo as string}
            className="flex justify-between gap-4 py-0.5"
            style={fuerte ? { borderTop: "1px solid var(--borde)", marginTop: 4, paddingTop: 6 } : undefined}
          >
            <dt className={fuerte ? "font-semibold" : "opacity-70"}>{rotulo as string}</dt>
            <dd className={fuerte ? "font-semibold" : ""}>{soles(valor as string)}</dd>
          </div>
        ))}
      </dl>

      <p className="text-xs opacity-60">
        Los gastos generales y la utilidad se calculan sobre el importe ya
        descontado.
      </p>

      {estado.error && (
        <p className="text-sm" style={{ color: "var(--color-peligro)" }}>
          {estado.error}
        </p>
      )}

      <div className="flex items-center gap-2">
        <Guardar />
        <button
          type="button"
          onClick={alTerminar}
          className="rounded-lg px-3 py-1.5 text-sm opacity-70 hover:opacity-100"
        >
          Cancelar
        </button>
      </div>
    </form>
  );
}
