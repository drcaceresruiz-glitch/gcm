"use client";

import { useActionState, useState } from "react";
import { Download, FileUp, LoaderCircle, Upload } from "lucide-react";
import {
  accionImportarProveedores,
  type EstadoImportacion,
} from "@/app/(dashboard)/empresa/proveedores/acciones";
import { Nota } from "@/components/ui/Nota";

/**
 * Cargar el catalogo desde un Excel.
 *
 * LA ACLARACION DE QUE NO SE PISA NADA VA SIEMPRE VISIBLE, no escondida tras un
 * desplegable: es la unica pregunta que se hace quien va a subir por segunda
 * vez el mismo archivo, y si no la ve, no lo sube.
 */
export function ImportarProveedores() {
  const [abierto, setAbierto] = useState(false);
  const [estado, importar, importando] = useActionState<EstadoImportacion, FormData>(
    accionImportarProveedores,
    {},
  );

  return (
    <div className="print:hidden">
      <div className="flex flex-wrap items-center gap-2">
        <a
          href="/empresa/proveedores/plantilla"
          className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium"
          style={{ borderColor: "var(--borde)" }}
        >
          <Download className="size-4" aria-hidden="true" />
          Descargar plantilla
        </a>

        <button
          type="button"
          onClick={() => setAbierto((v) => !v)}
          aria-expanded={abierto}
          className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium"
          style={{
            borderColor: abierto ? "var(--color-marca-600)" : "var(--borde)",
            color: abierto ? "var(--color-marca-600)" : undefined,
          }}
        >
          <FileUp className="size-4" aria-hidden="true" />
          Importar Excel
        </button>
      </div>

      {abierto && (
        <form
          action={importar}
          className="mt-3 space-y-3 rounded-lg border p-3"
          style={{ borderColor: "var(--borde)", backgroundColor: "var(--superficie)" }}
        >
          {/* LA ACLARACION. Va aqui arriba y sin plegar. */}
          <div
            className="rounded-lg px-3 py-2 text-xs"
            style={{
              backgroundColor:
                "color-mix(in oklab, var(--color-marca-600) 10%, transparent)",
            }}
          >
            <p className="font-medium">Súbelo las veces que quieras: no se duplica nada.</p>
            <ul className="mt-1 list-disc space-y-0.5 pl-4 opacity-80">
              <li>
                Cada fila se busca por su <b>RUC</b>. Si ya existe, no se crea otra vez.
              </li>
              <li>
                Solo se rellenan los campos que estaban <b>vacíos</b>. Lo que ya
                tiene valor en GCM <b>no se toca</b>, aunque el Excel traiga otra cosa.
              </li>
              <li>
                Por eso <b>no sirve para corregir en masa</b>: para cambiar un dato
                ya cargado, edítalo en su ficha.
              </li>
              <li>
                Basta con <b>RUC y razón social</b>. El resto puede ir vacío y se
                completa después.
              </li>
            </ul>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <input
              type="file"
              name="archivo"
              accept=".xlsx"
              required
              className="text-sm"
            />
            <button
              type="submit"
              disabled={importando}
              className="flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
              style={{ backgroundColor: "var(--color-marca-600)" }}
            >
              {importando ? (
                <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
              ) : (
                <Upload className="size-4" aria-hidden="true" />
              )}
              Subir
            </button>
          </div>

          {estado.error && <Nota tono="peligro">{estado.error}</Nota>}

          {/* Se dice lo que paso con CADA grupo, no un «listo». «12 sin
              cambios» es informacion: dice que ese archivo ya estaba cargado. */}
          {estado.resumen && (
            <div className="space-y-2">
              <Nota tono="exito">
                {[
                  `${estado.resumen.creados} nuevo(s)`,
                  `${estado.resumen.completados} completado(s)`,
                  `${estado.resumen.sinCambios} sin cambios`,
                ].join(" · ")}
              </Nota>

              {estado.resumen.rechazos.length > 0 && (
                <div className="text-xs">
                  <p className="font-medium">
                    {estado.resumen.rechazos.length} fila(s) no entraron:
                  </p>
                  <ul className="mt-1 list-disc space-y-0.5 pl-4 opacity-80">
                    {estado.resumen.rechazos.slice(0, 20).map((r) => (
                      <li key={r.fila}>
                        Fila {r.fila}: {r.motivo}
                      </li>
                    ))}
                  </ul>
                  {estado.resumen.rechazos.length > 20 && (
                    <p className="mt-1 opacity-70">
                      …y {estado.resumen.rechazos.length - 20} más.
                    </p>
                  )}
                </div>
              )}

              {/* Estas SI se guardaron: el aviso es informativo, no un
                  rechazo. Sin esto, un texto que no cupo entero en su
                  columna se recortaba sin que nadie se enterara. */}
              {estado.resumen.avisos.length > 0 && (
                <div className="text-xs">
                  <p className="font-medium">
                    {estado.resumen.avisos.length} fila(s) se guardaron con algún dato recortado:
                  </p>
                  <ul className="mt-1 list-disc space-y-0.5 pl-4 opacity-80">
                    {estado.resumen.avisos.slice(0, 20).map((a) => (
                      <li key={a.fila}>
                        Fila {a.fila}: {a.motivo}
                      </li>
                    ))}
                  </ul>
                  {estado.resumen.avisos.length > 20 && (
                    <p className="mt-1 opacity-70">
                      …y {estado.resumen.avisos.length - 20} más.
                    </p>
                  )}
                </div>
              )}
            </div>
          )}
        </form>
      )}
    </div>
  );
}
