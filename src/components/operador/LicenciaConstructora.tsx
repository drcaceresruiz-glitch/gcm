"use client";

import { useState, useTransition } from "react";
import { LoaderCircle } from "lucide-react";
import { accionEditarLicencia } from "@/app/(dashboard)/operador/acciones";

/**
 * Registro MANUAL de licencia de una constructora: que plan tiene, hasta
 * cuando, y notas de pago. Sin ninguna pasarela de pago detras — solo deja
 * anotar lo que ya se sabe por fuera, porque hoy no hay ningun sitio donde
 * verlo sin preguntarle a quien vendio.
 *
 * A PROPOSITO no toca `activa`: una licencia vencida no suspende sola. Esta
 * pantalla no cobra ni bloquea, solo recuerda.
 */

export interface DatosLicenciaForm {
  modalidad: string;
  vence: string;
  notas: string;
}

export function LicenciaConstructora({
  empresaId,
  inicial,
}: {
  empresaId: string;
  inicial: DatosLicenciaForm;
}) {
  const [f, setF] = useState(inicial);
  const [error, setError] = useState<string | null>(null);
  const [guardado, setGuardado] = useState(false);
  const [pendiente, iniciar] = useTransition();

  const set = (campo: keyof DatosLicenciaForm, valor: string) => {
    setGuardado(false);
    setF((p) => ({ ...p, [campo]: valor }));
  };

  const cambiado = (Object.keys(inicial) as (keyof DatosLicenciaForm)[]).some(
    (k) => f[k].trim() !== inicial[k].trim(),
  );

  function guardar() {
    setError(null);
    setGuardado(false);
    iniciar(async () => {
      const r = await accionEditarLicencia(empresaId, f);
      if (r.ok) setGuardado(true);
      else setError(r.error);
    });
  }

  const campo = "mt-1 w-full rounded-lg border px-2.5 py-2 text-sm";
  const estiloCampo = {
    borderColor: "var(--borde)",
    backgroundColor: "var(--fondo)",
  };

  return (
    <section
      className="space-y-3 rounded-lg border p-4"
      style={{ borderColor: "var(--borde)" }}
    >
      <div>
        <h3 className="text-base font-semibold">Licencia</h3>
        <p className="mt-0.5 text-sm opacity-70 text-pretty">
          Registro manual, sin pasarela de pago: solo para anotar con qué
          plan y hasta cuándo, y no perder de vista cómo paga. No suspende
          nada por sí sola.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-xs">
          <span className="opacity-70">Plan / modalidad</span>
          <input
            value={f.modalidad}
            onChange={(e) => set("modalidad", e.target.value)}
            placeholder="Demo, Anual…"
            maxLength={30}
            className={campo}
            style={estiloCampo}
          />
        </label>
        <label className="block text-xs">
          <span className="opacity-70">Vence</span>
          <input
            type="date"
            value={f.vence}
            onChange={(e) => set("vence", e.target.value)}
            className={campo}
            style={estiloCampo}
          />
        </label>
        <label className="block text-xs sm:col-span-2">
          <span className="opacity-70">Notas de pago</span>
          <textarea
            value={f.notas}
            onChange={(e) => set("notas", e.target.value)}
            rows={3}
            className={campo}
            style={estiloCampo}
          />
        </label>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={guardar}
          disabled={pendiente || !cambiado}
          className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
          style={{ backgroundColor: "var(--color-marca-600)" }}
        >
          {pendiente && (
            <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
          )}
          Guardar cambios
        </button>
        {guardado && (
          <span className="text-sm" style={{ color: "var(--color-exito)" }}>
            Guardado.
          </span>
        )}
        {error && (
          <span className="text-sm" style={{ color: "var(--color-peligro)" }}>
            {error}
          </span>
        )}
      </div>
    </section>
  );
}
