"use client";

import { useActionState, useEffect, useState } from "react";
import { useFormStatus } from "react-dom";
import { AlertCircle, Check, LoaderCircle, Pencil, Plus, Trash2, X } from "lucide-react";

import {
  accionAnadirLineaMeta,
  accionEditarLineaMeta,
  accionEliminarLineaMeta,
  type EstadoLinea,
} from "@/app/(dashboard)/obras/[id]/meta/acciones-lineas";
import type { LineaDeLaMeta } from "@/services/meta-edicion.service";
import { soles } from "@/utils/formato";

/**
 * El borrador de la meta, corregible linea a linea.
 *
 * Hasta ahora la meta solo entraba por Excel: un precio mal tecleado obligaba
 * a rehacer la plantilla y volver a subirla, perdiendo por el camino los
 * recargos ya ajustados. Aqui se corrige lo que sea sin salir de la pantalla.
 *
 * Se edita UNA fila a la vez, y a proposito. Una tabla entera de campos
 * abiertos invita a tocar diez cosas y guardar sin releer ninguna, y esto es
 * el costo de la obra. Abrir una fila obliga a mirar esa fila.
 *
 * El importe no se teclea cuando hay metrado y precio: lo calcula el
 * servidor, con la misma regla que la formula del Excel.
 */
export function TablaMetaEditable({
  obraId,
  version,
  lineas,
  puedeEditar,
}: {
  obraId: string;
  version: number;
  lineas: readonly LineaDeLaMeta[];
  puedeEditar: boolean;
}) {
  const [editando, setEditando] = useState<string | null>(null);
  const [anadiendo, setAnadiendo] = useState(false);

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold">
            Líneas del borrador v{version}
          </h2>
          <p className="mt-1 max-w-2xl text-sm text-pretty opacity-70">
            {puedeEditar
              ? "Corrige aquí lo que haga falta: no hay que volver al Excel ni perder los recargos ya ajustados. Al aprobar la meta, esto queda congelado."
              : "Solo lectura: no tienes permiso para cambiar el presupuesto meta."}
          </p>
        </div>

        {puedeEditar && !anadiendo && (
          <button
            type="button"
            onClick={() => setAnadiendo(true)}
            className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium"
            style={{ borderColor: "var(--borde)" }}
          >
            <Plus className="size-4" aria-hidden="true" />
            Añadir una partida
          </button>
        )}
      </div>

      {anadiendo && (
        <FormularioLinea
          obraId={obraId}
          modo="anadir"
          alTerminar={() => setAnadiendo(false)}
        />
      )}

      <div
        className="overflow-x-auto rounded-xl border"
        style={{ borderColor: "var(--borde)" }}
      >
        <table className="w-full text-sm">
          <thead>
            <tr
              className="text-left text-xs uppercase opacity-60"
              style={{ borderBottom: "1px solid var(--borde)" }}
            >
              <th className="p-2">Código</th>
              <th className="p-2">Descripción</th>
              <th className="p-2">Und.</th>
              <th className="p-2 text-right">Metrado</th>
              <th className="p-2 text-right">P. unitario</th>
              <th className="p-2 text-right">Importe</th>
              {puedeEditar && <th className="p-2" />}
            </tr>
          </thead>

          <tbody>
            {lineas.map((l) =>
              editando === l.id ? (
                <tr key={l.id}>
                  <td colSpan={puedeEditar ? 7 : 6} className="p-0">
                    <FormularioLinea
                      obraId={obraId}
                      modo="editar"
                      linea={l}
                      alTerminar={() => setEditando(null)}
                    />
                  </td>
                </tr>
              ) : (
                <tr
                  key={l.id}
                  style={{
                    borderTop: "1px solid var(--borde)",
                    backgroundColor:
                      l.tipo === "CAPITULO" ? "var(--superficie)" : undefined,
                    fontWeight: l.tipo === "CAPITULO" ? 600 : undefined,
                  }}
                >
                  <td className="p-2 tabular-nums">
                    {l.codigoRef ?? (
                      // Sin codigo es un costo propio de la meta: no va al
                      // contrato ni al cronograma, y conviene que se vea.
                      <span className="text-xs opacity-60">propio</span>
                    )}
                  </td>
                  <td className="p-2">{l.descripcion}</td>
                  <td className="p-2">{l.unidad ?? ""}</td>
                  <td className="p-2 text-right tabular-nums">{l.metrado ?? ""}</td>
                  <td className="p-2 text-right tabular-nums">
                    {l.precioUnitario ?? ""}
                  </td>
                  <td className="p-2 text-right tabular-nums">
                    {l.parcial ? soles(l.parcial) : ""}
                  </td>
                  {puedeEditar && (
                    <td className="p-2">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          type="button"
                          onClick={() => setEditando(l.id)}
                          className="rounded p-1 opacity-70 hover:opacity-100"
                          aria-label={`Corregir ${l.descripcion}`}
                        >
                          <Pencil className="size-4" aria-hidden="true" />
                        </button>
                        {l.tipo !== "CAPITULO" && (
                          <BotonEliminar obraId={obraId} linea={l} />
                        )}
                      </div>
                    </td>
                  )}
                </tr>
              ),
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function Campo({
  nombre,
  etiqueta,
  valor,
  ancho,
  requerido,
}: {
  nombre: string;
  etiqueta: string;
  valor?: string | null;
  ancho: string;
  requerido?: boolean;
}) {
  return (
    <label className="block text-xs">
      <span className="opacity-70">{etiqueta}</span>
      <input
        type="text"
        name={nombre}
        defaultValue={valor ?? ""}
        required={requerido}
        inputMode={nombre === "descripcion" || nombre === "unidad" || nombre === "codigoRef" ? "text" : "decimal"}
        className={`mt-1 ${ancho} rounded-lg border px-2 py-1.5 text-sm`}
        style={{ borderColor: "var(--borde)", backgroundColor: "var(--fondo)" }}
      />
    </label>
  );
}

function FormularioLinea({
  obraId,
  modo,
  linea,
  alTerminar,
}: {
  obraId: string;
  modo: "editar" | "anadir";
  linea?: LineaDeLaMeta;
  alTerminar: () => void;
}) {
  const [estado, accion] = useActionState<EstadoLinea, FormData>(
    modo === "editar" ? accionEditarLineaMeta : accionAnadirLineaMeta,
    {},
  );

  // Se cierra SOLO si guardo. Cerrar siempre -que es lo que hacia al
  // principio- se lleva por delante el mensaje de error justo cuando hace
  // falta leerlo.
  useEffect(() => {
    if (estado.ok) alTerminar();
  }, [estado.ok, alTerminar]);

  return (
    <form
      action={accion}
      className="space-y-3 p-3"
      style={{ backgroundColor: "var(--superficie)" }}
    >
      <input type="hidden" name="obraId" value={obraId} />
      {linea && <input type="hidden" name="lineaId" value={linea.id} />}

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

      <div className="flex flex-wrap items-end gap-3">
        {modo === "anadir" && (
          <Campo
            nombre="codigoRef"
            etiqueta="Código (vacío = costo propio)"
            ancho="w-40"
          />
        )}
        {modo === "editar" && linea?.codigoRef && (
          <p className="text-xs opacity-70">
            Código <strong>{linea.codigoRef}</strong>
            <span className="block opacity-70">
              no se cambia: es la referencia contra el contrato
            </span>
          </p>
        )}

        <Campo
          nombre="descripcion"
          etiqueta="Descripción"
          valor={linea?.descripcion}
          ancho="w-72"
          requerido
        />
        <Campo nombre="unidad" etiqueta="Und." valor={linea?.unidad} ancho="w-20" />
        <Campo nombre="metrado" etiqueta="Metrado" valor={linea?.metrado} ancho="w-28" />
        <Campo
          nombre="precioUnitario"
          etiqueta="P. unitario"
          valor={linea?.precioUnitario}
          ancho="w-32"
        />
        {/* El importe solo se teclea en una suma alzada: con metrado y precio
            lo calcula el servidor, y escribirlo aqui no serviria de nada. */}
        <Campo
          nombre="parcial"
          etiqueta="Importe (solo si no hay metrado)"
          valor={linea?.metrado && linea?.precioUnitario ? "" : linea?.parcial}
          ancho="w-36"
        />
      </div>

      <div className="flex items-center gap-3">
        <BotonGuardar />
        <button
          type="button"
          onClick={alTerminar}
          className="inline-flex items-center gap-1.5 text-sm font-medium underline opacity-70"
        >
          <X className="size-3.5" aria-hidden="true" />
          Cancelar
        </button>
      </div>
    </form>
  );
}

function BotonGuardar() {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium text-white disabled:opacity-60"
      style={{ backgroundColor: "var(--color-marca-600)" }}
    >
      {pending ? (
        <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
      ) : (
        <Check className="size-4" aria-hidden="true" />
      )}
      Guardar
    </button>
  );
}

/**
 * Quitar una linea.
 *
 * Pide confirmacion en dos pasos y no con un `confirm()` del navegador: el
 * mismo patron de revelar que ya usan paralizar y arrancar, para que el gesto
 * sea deliberado sin sacar al usuario de la pagina.
 */
function BotonEliminar({
  obraId,
  linea,
}: {
  obraId: string;
  linea: LineaDeLaMeta;
}) {
  const [estado, accion] = useActionState<EstadoLinea, FormData>(
    accionEliminarLineaMeta,
    {},
  );
  const [seguro, setSeguro] = useState(false);

  if (!seguro) {
    return (
      <button
        type="button"
        onClick={() => setSeguro(true)}
        className="rounded p-1 opacity-70 hover:opacity-100"
        aria-label={`Quitar ${linea.descripcion}`}
      >
        <Trash2 className="size-4" aria-hidden="true" />
      </button>
    );
  }

  return (
    <form action={accion} className="flex items-center gap-2">
      <input type="hidden" name="obraId" value={obraId} />
      <input type="hidden" name="lineaId" value={linea.id} />
      {estado.error && (
        <span role="alert" className="text-xs" style={{ color: "var(--color-peligro)" }}>
          {estado.error}
        </span>
      )}
      <button
        type="submit"
        className="rounded px-2 py-1 text-xs font-medium text-white"
        style={{ backgroundColor: "var(--color-peligro)" }}
      >
        Quitar
      </button>
      <button
        type="button"
        onClick={() => setSeguro(false)}
        className="text-xs underline opacity-70"
      >
        No
      </button>
    </form>
  );
}
