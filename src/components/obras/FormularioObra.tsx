"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { AlertCircle, HardHat, LoaderCircle } from "lucide-react";
import {
  accionCrearObra,
  type EstadoObra,
} from "@/app/(dashboard)/obras/nueva/acciones";
import { CampoTexto } from "@/components/auth/CampoTexto";

/**
 * Alta de una obra.
 *
 * Solo el nombre y las dos fechas son obligatorios: una obra se abre en
 * cuanto se sabe cuando empieza y cuando deberia acabar, y el resto —codigo,
 * cliente, ubicacion— se conoce a veces mas tarde.
 */

const ESTADOS = [
  { valor: "PLANIFICACION", etiqueta: "Planificacion" },
  { valor: "EN_EJECUCION", etiqueta: "En ejecucion" },
  { valor: "PARALIZADA", etiqueta: "Paralizada" },
  { valor: "CERRADA", etiqueta: "Cerrada" },
] as const;

export function FormularioObra({ fechaHoy }: { fechaHoy: string }) {
  const [estado, accion] = useActionState<EstadoObra, FormData>(
    accionCrearObra,
    {},
  );

  return (
    <form action={accion} className="max-w-2xl space-y-8">
      <Bloque titulo="Identificacion">
        <CampoTexto
          id="nombreObra"
          name="nombreObra"
          etiqueta="Nombre de la obra"
          required
          maxLength={255}
          autoFocus
        />
        <CampoTexto
          id="codigoObra"
          name="codigoObra"
          etiqueta="Codigo"
          maxLength={40}
          ayuda="Opcional, pero no se puede repetir dentro de la empresa. Sirve para nombrarla en corto."
        />
        <CampoTexto
          id="cliente"
          name="cliente"
          etiqueta="Cliente"
          maxLength={200}
        />
        <CampoTexto
          id="ubicacion"
          name="ubicacion"
          etiqueta="Ubicacion"
          maxLength={255}
        />
      </Bloque>

      <Bloque
        titulo="Plazo"
        nota="De aqui sale el avance de calendario que se ve en el panel."
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <CampoTexto
            id="fechaInicio"
            name="fechaInicio"
            etiqueta="Fecha de inicio"
            type="date"
            defaultValue={fechaHoy}
            required
          />
          <CampoTexto
            id="fechaFinProgramada"
            name="fechaFinProgramada"
            etiqueta="Fecha de fin programada"
            type="date"
            required
          />
        </div>
      </Bloque>

      <Bloque titulo="Estado">
        <div className="space-y-1.5">
          <label htmlFor="estado" className="block text-sm font-medium">
            Estado inicial
          </label>
          <select
            id="estado"
            name="estado"
            defaultValue="PLANIFICACION"
            className="w-full rounded-lg border px-3 py-2 text-sm outline-none"
            style={{
              borderColor: "var(--borde)",
              backgroundColor: "var(--fondo)",
            }}
          >
            {ESTADOS.map((e) => (
              <option key={e.valor} value={e.valor}>
                {e.etiqueta}
              </option>
            ))}
          </select>
          <p className="text-xs opacity-60">
            Lo normal es abrirla en planificacion y pasarla a ejecucion cuando
            arranque.
          </p>
        </div>
      </Bloque>

      {estado.error && (
        <p
          role="alert"
          className="flex items-start gap-2 rounded-lg px-3 py-2 text-sm"
          style={{
            backgroundColor:
              "color-mix(in oklab, var(--color-peligro) 15%, transparent)",
          }}
        >
          <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <span>{estado.error}</span>
        </p>
      )}

      <BotonCrear />
    </form>
  );
}

function BotonCrear() {
  const { pending } = useFormStatus();

  return (
    <div className="space-y-2">
      <button
        type="submit"
        disabled={pending}
        className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
        style={{ backgroundColor: "var(--color-marca-600)" }}
      >
        {pending ? (
          <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
        ) : (
          <HardHat className="size-4" aria-hidden="true" />
        )}
        {pending ? "Creando..." : "Crear la obra"}
      </button>
      <p className="text-xs opacity-60">
        Al crearla se abre vacia: el paso siguiente es cargarle el presupuesto.
      </p>
    </div>
  );
}

function Bloque({
  titulo,
  nota,
  children,
}: {
  titulo: string;
  nota?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">{titulo}</h2>
        {nota && <p className="mt-0.5 text-sm opacity-70">{nota}</p>}
      </div>
      {children}
    </section>
  );
}
