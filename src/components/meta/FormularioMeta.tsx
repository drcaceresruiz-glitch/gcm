"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { AlertCircle, Download, LoaderCircle, Upload } from "lucide-react";

import {
  accionImportarMeta,
  type EstadoMeta,
} from "@/app/(dashboard)/obras/[id]/meta/acciones";
import { CampoTexto } from "@/components/auth/CampoTexto";

/**
 * Carga del presupuesto meta desde el Excel de la plantilla.
 *
 * El MODO se elige aqui y queda fijo para esta version: cambiarlo con datos
 * dentro obligaria a decidir que se hace con lo cargado, y la respuesta
 * honesta suele ser que se pierde. Por eso se explica al elegir, no despues.
 */

const MODOS = [
  {
    valor: "PARTIDA",
    titulo: "Partida por partida",
    ayuda:
      "La meta espeja los códigos del contrato. La bolsa sale por partida: se ve exactamente cuál se come el margen.",
  },
  {
    valor: "CAPITULO",
    titulo: "Por capítulo",
    ayuda:
      "La meta lleva una cifra por capítulo. Más rápido de cargar; la bolsa sale por capítulo, no por partida.",
  },
] as const;

function Boton() {
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
        <Upload className="size-4" aria-hidden="true" />
      )}
      {pending ? "Cargando…" : "Cargar meta"}
    </button>
  );
}

export function FormularioMeta({
  obraId,
  fechaHoy,
  mesesSugeridos,
}: {
  obraId: string;
  fechaHoy: string;
  /// Meses entre las fechas de la obra. Se PROPONE, no se impone: lo que se
  /// paga por mes puede presupuestarse para un plazo distinto del contractual.
  mesesSugeridos: string;
}) {
  const [estado, accion] = useActionState<EstadoMeta, FormData>(
    accionImportarMeta,
    {},
  );

  return (
    <form action={accion} className="space-y-5">
      <input type="hidden" name="obraId" value={obraId} />

      {estado.error && (
        <p
          role="alert"
          className="flex items-start gap-2 rounded-lg px-4 py-3 text-sm"
          style={{
            backgroundColor:
              "color-mix(in oklab, var(--color-peligro) 15%, transparent)",
          }}
        >
          <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          {estado.error}
        </p>
      )}

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">
          ¿Con qué detalle se compara?
        </legend>
        <p className="text-xs opacity-70">
          Queda fijo para esta versión. Para cambiarlo se crea una versión
          nueva de la meta.
        </p>

        {MODOS.map((m, i) => (
          <label
            key={m.valor}
            className="flex cursor-pointer items-start gap-3 rounded-lg border p-3"
            style={{ borderColor: "var(--borde)" }}
          >
            <input
              type="radio"
              name="modo"
              value={m.valor}
              defaultChecked={i === 0}
              className="mt-1"
            />
            <span>
              <span className="block text-sm font-medium">{m.titulo}</span>
              <span className="block text-xs text-pretty opacity-70">
                {m.ayuda}
              </span>
            </span>
          </label>
        ))}
      </fieldset>

      {/* NO se piden ni la fecha ni el plazo: el sistema YA los sabe. La
          fecha es hoy y el plazo sale de las fechas de la obra, fijadas al
          crearla. Pedirlos era hacer teclear un dato que el sistema tenia
          delante, y encima dejaba que no coincidiera con la obra. Se guardan
          igual, congelados en esta version: es lo que permite ver la
          desviacion si el cronograma se estira despues. */}
      <p className="rounded-lg border border-dashed px-4 py-3 text-sm opacity-80">
        Esta meta se fija a <strong>{fechaHoy}</strong>, con un plazo
        comprometido de <strong>{mesesSugeridos} meses</strong>, que es el
        plazo de la obra.
      </p>
      <input type="hidden" name="fechaMeta" value={fechaHoy} />
      <input type="hidden" name="mesesPlazo" value={mesesSugeridos} />

      <div className="space-y-1.5">
        <label htmlFor="archivo" className="block text-sm font-medium">
          Archivo de Excel
        </label>
        <input
          id="archivo"
          name="archivo"
          type="file"
          accept=".xlsx,.xlsm,.xls"
          required
          className="w-full rounded-lg border px-3 py-2 text-sm"
          style={{ borderColor: "var(--borde)" }}
        />
        <p className="text-xs opacity-70">
          La hoja «Costo Directo» del libro, con las fórmulas ya hechas.
        </p>
      </div>

      <CampoTexto
        id="notas"
        name="notas"
        type="text"
        etiqueta="Notas (opcional)"
        placeholder="Qué cambió respecto de la versión anterior"
      />

      <div className="flex flex-wrap items-center gap-3">
        <Boton />
        <a
          href={`/plantilla-meta?meses=${mesesSugeridos}`}
          className="inline-flex items-center gap-2 text-sm font-medium underline"
        >
          <Download className="size-4" aria-hidden="true" />
          Descargar la plantilla
        </a>
      </div>
    </form>
  );
}
