"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { AlertCircle, CheckCircle2, LoaderCircle } from "lucide-react";

import {
  ETIQUETA_PLANTILLA,
  ETIQUETA_SECCION,
  EXPLICACION_PLANTILLA,
  EXPLICACION_SECCION,
  PLANTILLAS_INFORME,
  SECCIONES_INFORME,
  type PlantillaInforme,
  type SeccionInformeClave,
} from "@/lib/plantilla-informe";

export interface EstadoPlantilla {
  error?: string;
  ok?: string;
}

/**
 * Elegir que lleva el informe de obra.
 *
 * Sirve para los dos niveles con el mismo componente: la empresa fija su
 * defecto y la obra puede pisarlo. Lo unico que cambia es que la obra tiene
 * ademas la opcion de HEREDAR, que es lo que hacen todas hasta que alguien
 * decide otra cosa.
 *
 * El resumen no aparece entre los interruptores, y no es un olvido: lleva el
 * avance y las alertas de atraso, y un informe del que se puede quitar el
 * atraso no es un informe. Se dice en la pantalla en vez de dejar al usuario
 * buscando el interruptor que falta.
 */
export function ElegirPlantillaInforme({
  accion,
  plantillaActual,
  apagadasActuales,
  puedeHeredar,
  heredado,
  obraId,
}: {
  accion: (
    previo: EstadoPlantilla,
    datos: FormData,
  ) => Promise<EstadoPlantilla>;
  plantillaActual: PlantillaInforme | null;
  apagadasActuales: readonly SeccionInformeClave[];
  /// Solo la obra puede volver a heredar de la empresa.
  puedeHeredar: boolean;
  /// Que se aplica ahora mismo si esta obra hereda, para poder decirlo.
  heredado?: { plantilla: PlantillaInforme; apagadas: number };
  /// Solo en la de la obra: la accion necesita saber cual.
  obraId?: string;
}) {
  const [estado, enviar] = useActionState<EstadoPlantilla, FormData>(accion, {});
  const [plantilla, setPlantilla] = useState<string>(
    plantillaActual ?? (puedeHeredar ? "" : "COMPLETA"),
  );

  return (
    <form action={enviar} className="space-y-4">
      {obraId && <input type="hidden" name="obraId" value={obraId} />}
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
          {estado.error}
        </p>
      )}

      {estado.ok && (
        <p
          role="status"
          className="flex items-start gap-2 rounded-lg px-3 py-2 text-sm"
          style={{
            backgroundColor:
              "color-mix(in oklab, var(--color-exito) 15%, transparent)",
          }}
        >
          <CheckCircle2 className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          {estado.ok}
        </p>
      )}

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">Plantilla</legend>

        {puedeHeredar && (
          <label
            className="flex cursor-pointer items-start gap-3 rounded-lg border p-3"
            style={{ borderColor: "var(--borde)" }}
          >
            <input
              type="radio"
              name="plantilla"
              value=""
              checked={plantilla === ""}
              onChange={() => setPlantilla("")}
              className="mt-1"
            />
            <span>
              <span className="block text-sm font-medium">
                La que use la constructora
              </span>
              <span className="block text-xs text-pretty opacity-70">
                {heredado
                  ? `Ahora mismo: ${ETIQUETA_PLANTILLA[heredado.plantilla]}${
                      heredado.apagadas > 0
                        ? `, con ${heredado.apagadas} sección(es) apagada(s)`
                        : ""
                    }.`
                  : "Lo que esté configurado en la empresa."}
              </span>
            </span>
          </label>
        )}

        {PLANTILLAS_INFORME.map((p) => (
          <label
            key={p}
            className="flex cursor-pointer items-start gap-3 rounded-lg border p-3"
            style={{ borderColor: "var(--borde)" }}
          >
            <input
              type="radio"
              name="plantilla"
              value={p}
              checked={plantilla === p}
              onChange={() => setPlantilla(p)}
              className="mt-1"
            />
            <span>
              <span className="block text-sm font-medium">
                {ETIQUETA_PLANTILLA[p]}
              </span>
              <span className="block text-xs text-pretty opacity-70">
                {EXPLICACION_PLANTILLA[p]}
              </span>
            </span>
          </label>
        ))}
      </fieldset>

      {/* Los interruptores solo tienen sentido si esta pantalla decide algo:
          heredando, lo que se apague aqui no se aplicaria a nada. */}
      {plantilla !== "" && (
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">Secciones</legend>
          <p className="text-xs text-pretty opacity-70">
            Apaga las que no quieras, encima de la plantilla. El{" "}
            <strong>resumen</strong> no se puede apagar: lleva el avance y las
            alertas de atraso, y sin eso el informe deja de serlo. El pie del
            documento dice cuántas secciones se omitieron.
          </p>

          {SECCIONES_INFORME.map((s) => (
            <label
              key={s}
              className="flex cursor-pointer items-start gap-3 rounded-lg border p-3"
              style={{ borderColor: "var(--borde)" }}
            >
              <input
                type="checkbox"
                name="apagadas"
                value={s}
                defaultChecked={apagadasActuales.includes(s)}
                className="mt-1"
              />
              <span>
                <span className="block text-sm font-medium">
                  Apagar: {ETIQUETA_SECCION[s]}
                </span>
                <span className="block text-xs text-pretty opacity-70">
                  {EXPLICACION_SECCION[s]}
                </span>
              </span>
            </label>
          ))}
        </fieldset>
      )}

      <BotonGuardar />
    </form>
  );
}

function BotonGuardar() {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
      style={{ backgroundColor: "var(--color-marca-600)" }}
    >
      {pending && <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />}
      Guardar
    </button>
  );
}
