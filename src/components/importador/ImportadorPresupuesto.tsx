"use client";

import { useRef, useState, useTransition } from "react";
import {
  AlertCircle,
  FileSpreadsheet,
  LoaderCircle,
  Upload,
  X,
} from "lucide-react";
import type { ResultadoAnalisis } from "@/lib/excel-presupuesto";
import {
  accionAnalizar,
  accionImportar,
} from "@/app/(dashboard)/obras/[id]/importar/acciones";
import { VistaPrevia } from "@/components/importador/VistaPrevia";

interface Props {
  obraId: string;
  nombreObra: string;
  /// Cantidad de partidas que ya tiene la obra. Si hay, importar sustituye.
  partidasExistentes: number;
}

export function ImportadorPresupuesto({
  obraId,
  nombreObra,
  partidasExistentes,
}: Props) {
  const [archivo, setArchivo] = useState<File | null>(null);
  const [analisis, setAnalisis] = useState<ResultadoAnalisis | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmaReemplazo, setConfirmaReemplazo] = useState(false);
  const [pendiente, iniciarTransicion] = useTransition();
  const entradaArchivo = useRef<HTMLInputElement>(null);

  function limpiar() {
    setArchivo(null);
    setAnalisis(null);
    setError(null);
    setConfirmaReemplazo(false);
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
    if (confirmaReemplazo) datos.append("reemplazar", "on");

    iniciarTransicion(async () => {
      // Si todo va bien la accion redirige y este componente se desmonta.
      const resultado = await accionImportar({}, datos);
      if (resultado?.error) setError(resultado.error);
    });
  }

  const hayFilas = (analisis?.filas.length ?? 0) > 0;
  const requiereConfirmarReemplazo = partidasExistentes > 0;
  const puedeImportar =
    hayFilas && (!requiereConfirmarReemplazo || confirmaReemplazo) && !pendiente;

  return (
    <div className="space-y-6">
      <section
        className="rounded-xl border p-5"
        style={{ borderColor: "var(--borde)", backgroundColor: "var(--superficie)" }}
      >
        <h2 className="text-sm font-semibold">1. Elige el archivo</h2>
        <p className="mt-1 text-sm opacity-70">
          Un Excel (.xlsx) con las columnas de codigo, descripcion, unidad,
          metrado y precio unitario. Los titulos pueden variar: se reconocen
          las variantes habituales.
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
            accept=".xlsx,.xlsm"
            onChange={alElegirArchivo}
            className="sr-only"
          />

          {archivo && (
            <span className="ml-3 inline-flex items-center gap-1.5 text-sm">
              <FileSpreadsheet className="size-4 shrink-0 opacity-60" aria-hidden="true" />
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
            Leyendo el archivo...
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
      </section>

      {analisis && (
        <section
          className="rounded-xl border p-5"
          style={{ borderColor: "var(--borde)", backgroundColor: "var(--superficie)" }}
        >
          <h2 className="text-sm font-semibold">2. Revisa antes de cargar</h2>
          <p className="mt-1 text-sm opacity-70">
            Nada se ha guardado todavia. Comprueba que las cifras cuadran con
            tu presupuesto.
          </p>

          <div className="mt-4">
            <VistaPrevia analisis={analisis} />
          </div>
        </section>
      )}

      {hayFilas && (
        <section
          className="rounded-xl border p-5"
          style={{ borderColor: "var(--borde)", backgroundColor: "var(--superficie)" }}
        >
          <h2 className="text-sm font-semibold">3. Confirma</h2>

          {requiereConfirmarReemplazo && (
            <div
              className="mt-3 rounded-lg p-3"
              style={{
                backgroundColor: "color-mix(in oklab, var(--color-alerta) 15%, transparent)",
              }}
            >
              <label className="flex cursor-pointer items-start gap-2.5 text-sm">
                <input
                  type="checkbox"
                  checked={confirmaReemplazo}
                  onChange={(e) => setConfirmaReemplazo(e.target.checked)}
                  className="mt-0.5 size-4 shrink-0"
                />
                <span>
                  <strong>{nombreObra}</strong> ya tiene {partidasExistentes}{" "}
                  partidas. Entiendo que se <strong>borraran y seran
                  sustituidas</strong> por las {analisis?.filas.length} de este
                  archivo.
                </span>
              </label>
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
              : `Importar ${analisis?.totalPartidas ?? 0} partidas`}
          </button>

          {analisis && analisis.errores.length > 0 && (
            <p className="mt-2 text-xs opacity-70">
              Las {analisis.errores.length} filas con incidencias quedaran
              fuera. Puedes importar ahora y corregirlas despues, o arreglar el
              Excel y volver a subirlo.
            </p>
          )}
        </section>
      )}
    </div>
  );
}
