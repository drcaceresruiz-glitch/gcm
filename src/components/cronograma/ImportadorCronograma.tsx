"use client";

import { useRef, useState, useTransition } from "react";
import { AlertCircle, CalendarClock, LoaderCircle, Upload, X } from "lucide-react";
import type { ResultadoAnalisisCronograma } from "@/lib/msproject-xml";
import {
  accionAnalizar,
  accionImportar,
} from "@/app/(dashboard)/obras/[id]/cronograma/importar/acciones";
import { VistaPreviaCronograma } from "@/components/cronograma/VistaPreviaCronograma";
import { fechaLarga } from "@/utils/fechas";

interface Props {
  obraId: string;
  /// Fechas de corte ya cargadas, en texto "YYYY-MM-DD". Sirven para avisar
  /// antes de subir de que ese corte ya estaba.
  cortesCargados: string[];
  /// El servidor tiene Java y MPXJ, y puede convertir el .mpp por su cuenta.
  /// En desarrollo no los hay, y entonces solo se acepta el .xml.
  admiteMpp: boolean;
}

export function ImportadorCronograma({
  obraId,
  cortesCargados,
  admiteMpp,
}: Props) {
  const [archivo, setArchivo] = useState<File | null>(null);
  const [analisis, setAnalisis] = useState<ResultadoAnalisisCronograma | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pendiente, iniciarTransicion] = useTransition();
  const entradaArchivo = useRef<HTMLInputElement>(null);

  function limpiar() {
    setArchivo(null);
    setAnalisis(null);
    setError(null);
    if (entradaArchivo.current) entradaArchivo.current.value = "";
  }

  function alElegirArchivo(e: React.ChangeEvent<HTMLInputElement>) {
    const elegido = e.target.files?.[0] ?? null;
    setArchivo(elegido);
    setAnalisis(null);
    setError(null);
    if (!elegido) return;

    // Se analiza al instante: obligar a pulsar un boton extra solo para ver
    // el contenido del archivo es friccion sin ganancia.
    const datos = new FormData();
    datos.append("archivo", elegido);

    iniciarTransicion(async () => {
      const resultado = await accionAnalizar({}, datos);
      if (resultado.error) setError(resultado.error);
      else setAnalisis(resultado.analisis ?? null);
    });
  }

  function confirmar() {
    if (!archivo) return;

    const datos = new FormData();
    datos.append("archivo", archivo);
    datos.append("obraId", obraId);

    iniciarTransicion(async () => {
      // Si todo va bien la accion redirige y este componente se desmonta.
      const resultado = await accionImportar({}, datos);
      if (resultado?.error) setError(resultado.error);
    });
  }

  const hayTareas = (analisis?.tareas.length ?? 0) > 0;
  const corteRepetido =
    analisis?.fechaCorte !== undefined &&
    analisis?.fechaCorte !== null &&
    cortesCargados.includes(analisis.fechaCorte);

  const puedeImportar =
    hayTareas && !!analisis?.fechaCorte && !corteRepetido && !pendiente;

  return (
    <div className="space-y-6">
      <Seccion titulo="1. Elige el archivo">
        <p className="mt-1 text-sm opacity-70">
          {admiteMpp ? (
            <>
              El <strong>.mpp</strong> de MS Project directamente, o su
              exportacion a <strong>.xml</strong>. El .mpp lo convierte el
              servidor: el de esta obra tarda unos cinco segundos.
            </>
          ) : (
            <>
              El XML que exporta MS Project (Archivo &gt; Guardar como &gt;
              XML). Este servidor no puede convertir archivos .mpp.
            </>
          )}{" "}
          Se lee el plan tal como esta en el archivo: tareas, fechas,
          duraciones, predecesoras y el <strong>% Planeado</strong>, que no se
          calcula sino que se toma del campo personalizado, para que las cifras
          coincidan con tu informe.
        </p>

        <div className="mt-4">
          <label
            htmlFor="archivo"
            className="inline-flex cursor-pointer items-center gap-2 rounded-lg border px-4 py-2 text-sm font-medium"
            style={{ borderColor: "var(--borde)" }}
          >
            <Upload className="size-4" aria-hidden="true" />
            {archivo ? "Elegir otro archivo" : "Seleccionar archivo"}
          </label>
          <input
            ref={entradaArchivo}
            id="archivo"
            name="archivo"
            type="file"
            accept={admiteMpp ? ".mpp,.xml" : ".xml"}
            onChange={alElegirArchivo}
            className="sr-only"
          />

          {archivo && (
            <span className="ml-3 inline-flex items-center gap-1.5 text-sm">
              <CalendarClock className="size-4 shrink-0 opacity-60" aria-hidden="true" />
              <span className="break-all">{archivo.name}</span>
              <button
                type="button"
                onClick={limpiar}
                className="ml-1 rounded p-0.5 opacity-60 hover:opacity-100"
                aria-label="Quitar archivo"
              >
                <X className="size-3.5" aria-hidden="true" />
              </button>
            </span>
          )}
        </div>

        {pendiente && !analisis && (
          <p className="mt-3 flex items-center gap-2 text-sm opacity-70" role="status">
            <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
            {/* Convertir el .mpp tarda unos segundos, y un «leyendo...» que se
                queda quieto tanto rato parece que se colgo. */}
            {archivo?.name.toLowerCase().endsWith(".mpp")
              ? "Convirtiendo el archivo de MS Project..."
              : "Leyendo el archivo..."}
          </p>
        )}

        {error && (
          <p
            role="alert"
            className="mt-3 flex items-start gap-2 rounded-lg px-3 py-2 text-sm"
            style={{
              backgroundColor: "color-mix(in oklab, var(--color-peligro) 15%, transparent)",
            }}
          >
            <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <span>{error}</span>
          </p>
        )}
      </Seccion>

      {analisis && (
        <Seccion titulo="2. Revisa antes de cargar">
          <p className="mt-1 text-sm opacity-70">
            Nada se ha guardado todavia. Comprueba que el plazo y los
            porcentajes cuadran con tu informe.
          </p>

          <div className="mt-4">
            <VistaPreviaCronograma analisis={analisis} />
          </div>
        </Seccion>
      )}

      {hayTareas && (
        <Seccion titulo="3. Confirma">
          <p className="mt-1 text-sm opacity-70">
            Cada corte se guarda como una version nueva: no se pisa nada, y el
            avance que ya hayas reportado en GCM se mantiene.
          </p>

          {corteRepetido && analisis?.fechaCorte && (
            <div
              className="mt-3 flex items-start gap-2 rounded-lg p-3 text-sm"
              style={{
                backgroundColor: "color-mix(in oklab, var(--color-alerta) 15%, transparent)",
              }}
            >
              <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              <span>
                El corte del{" "}
                <strong>{fechaLarga(new Date(`${analisis.fechaCorte}T00:00:00Z`))}</strong>{" "}
                ya esta cargado. Para registrar uno nuevo, fija otra fecha de
                estado en MS Project y vuelve a exportar.
              </span>
            </div>
          )}

          <button
            type="button"
            onClick={confirmar}
            disabled={!puedeImportar}
            className="mt-4 flex items-center justify-center gap-2 rounded-lg px-5 py-2.5 text-sm font-medium text-white disabled:opacity-50"
            style={{ backgroundColor: "var(--color-marca-600)" }}
          >
            {pendiente && (
              <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
            )}
            {pendiente
              ? "Cargando..."
              : `Cargar ${analisis?.totalTareas ?? 0} tareas`}
          </button>

          {analisis && analisis.errores.length > 0 && (
            <p className="mt-2 text-xs opacity-70">
              Las {analisis.errores.length} tareas con incidencias quedaran
              fuera. Puedes cargar ahora y corregirlas despues, o arreglar el
              cronograma en Project y volver a exportarlo.
            </p>
          )}
        </Seccion>
      )}
    </div>
  );
}

function Seccion({
  titulo,
  children,
}: {
  titulo: string;
  children: React.ReactNode;
}) {
  return (
    <section
      className="rounded-xl border p-5"
      style={{ borderColor: "var(--borde)", backgroundColor: "var(--superficie)" }}
    >
      <h2 className="text-sm font-semibold">{titulo}</h2>
      {children}
    </section>
  );
}
