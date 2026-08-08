"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import Link from "next/link";
import { AlertCircle, LoaderCircle, Pencil, Plus, Power, Receipt } from "lucide-react";
import {
  accionCambiarEstadoFormaPago,
  accionGuardarFormaPago,
  type EstadoFormaPago,
} from "@/app/(dashboard)/empresa/formas-pago/acciones";
import type { FormaPagoResumen } from "@/services/formas-pago.service";
import { CampoTexto } from "@/components/auth/CampoTexto";

/**
 * Catalogo de formas de pago, con el alta y la edicion en la misma pantalla.
 *
 * El texto se ensena entero y respetando sus saltos de linea: son tres o
 * cuatro tramos con condiciones, y resumirlos en una fila obligaria a abrir
 * cada uno para saber cual es cual.
 */

interface Props {
  formas: FormaPagoResumen[];
  verTodas: boolean;
  puedeEditar: boolean;
}

export function ListaFormasPago({ formas, verTodas, puedeEditar }: Props) {
  const [abierto, setAbierto] = useState<string | null>(null);

  const enEdicion =
    abierto && abierto !== "nueva"
      ? (formas.find((f) => f.id === abierto) ?? null)
      : null;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm opacity-70">
          {formas.length === 1 ? "1 forma de pago" : `${formas.length} formas de pago`}
          {!verTodas && " activas"}
        </p>

        <div className="flex flex-wrap items-center gap-3">
          <Link
            href={verTodas ? "/empresa/formas-pago" : "/empresa/formas-pago?todas=1"}
            className="text-sm font-medium underline opacity-70 hover:opacity-100"
          >
            {verTodas ? "Ver solo las activas" : "Ver tambien las desactivadas"}
          </Link>

          {puedeEditar && abierto !== "nueva" && (
            <button
              type="button"
              onClick={() => setAbierto("nueva")}
              className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-white"
              style={{ backgroundColor: "var(--color-marca-600)" }}
            >
              <Plus className="size-4" aria-hidden="true" />
              Nueva forma de pago
            </button>
          )}
        </div>
      </div>

      {(abierto === "nueva" || enEdicion) && (
        <Formulario forma={enEdicion} onCerrar={() => setAbierto(null)} />
      )}

      {formas.length === 0 ? (
        <div
          className="rounded-xl border border-dashed p-10 text-center"
          style={{ borderColor: "var(--borde)" }}
        >
          <Receipt className="mx-auto size-8 opacity-40" aria-hidden="true" />
          <p className="mt-3 text-sm opacity-70">
            Todavia no hay formas de pago guardadas.
          </p>
          <p className="mx-auto mt-1 max-w-lg text-sm text-pretty opacity-60">
            Las de las ordenes reales se repiten con pocas variantes: «50 %
            adelanto, 40 % contra instalacion, 10 % contra dossier». Guardarlas
            evita que cada orden acabe diciendo algo distinto de lo pactado.
          </p>
        </div>
      ) : (
        <ul className="space-y-2">
          {formas.map((f) => (
            <li
              key={f.id}
              className="flex flex-wrap items-start justify-between gap-3 rounded-xl border p-4"
              style={{
                borderColor:
                  abierto === f.id ? "var(--color-marca-600)" : "var(--borde)",
                backgroundColor: "var(--superficie)",
                opacity: f.activa ? 1 : 0.6,
              }}
            >
              <div className="min-w-0">
                <p className="text-sm font-medium">
                  {f.nombre}
                  {!f.activa && (
                    <span
                      className="ml-2 rounded-full px-2 py-0.5 text-[10px] font-medium"
                      style={{
                        backgroundColor:
                          "color-mix(in oklab, var(--color-alerta) 18%, transparent)",
                      }}
                    >
                      desactivada
                    </span>
                  )}
                </p>
                <p className="mt-1 text-sm whitespace-pre-line opacity-70">
                  {f.texto}
                </p>
              </div>

              {puedeEditar && (
                <div className="flex shrink-0 flex-wrap gap-2">
                  {abierto !== f.id && (
                    <button
                      type="button"
                      onClick={() => setAbierto(f.id)}
                      className="inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-sm font-medium"
                      style={{ borderColor: "var(--borde)" }}
                    >
                      <Pencil className="size-3.5" aria-hidden="true" />
                      Editar
                    </button>
                  )}
                  <BotonEstado id={f.id} activa={f.activa} />
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Formulario({
  forma,
  onCerrar,
}: {
  forma: FormaPagoResumen | null;
  onCerrar: () => void;
}) {
  const [estado, accion] = useActionState<EstadoFormaPago, FormData>(
    accionGuardarFormaPago,
    {},
  );

  return (
    <form
      action={accion}
      // Rehace los campos al pasar de una plantilla a otra: son no
      // controlados y si no conservarian los valores de la anterior.
      key={forma?.id ?? "nueva"}
      className="rounded-xl border p-5"
      style={{
        borderColor: "var(--color-marca-600)",
        backgroundColor: "var(--superficie)",
      }}
      noValidate
    >
      {forma && <input type="hidden" name="formaPagoId" value={forma.id} />}

      <h2 className="text-sm font-semibold">
        {forma ? `Editar «${forma.nombre}»` : "Nueva forma de pago"}
      </h2>

      {estado.error && (
        <p
          role="alert"
          className="mt-3 flex items-start gap-2 rounded-lg px-3 py-2 text-sm"
          style={{
            backgroundColor:
              "color-mix(in oklab, var(--color-peligro) 15%, transparent)",
          }}
        >
          <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <span>{estado.error}</span>
        </p>
      )}

      <div className="mt-4">
        <CampoTexto
          id="nombre"
          name="nombre"
          type="text"
          etiqueta="Nombre"
          defaultValue={forma?.nombre ?? ""}
          ayuda="Corto, es lo que se ve en el desplegable: «50/40/10 con dossier»."
        />
      </div>

      <div className="mt-4 space-y-1.5">
        <label htmlFor="texto" className="block text-sm font-medium">
          Texto
        </label>
        <textarea
          id="texto"
          name="texto"
          rows={4}
          defaultValue={forma?.texto ?? ""}
          className="w-full rounded-lg border px-3 py-2 text-sm outline-none"
          style={{ borderColor: "var(--borde)", backgroundColor: "var(--fondo)" }}
        />
        <p className="text-xs opacity-60">
          Tal como debe salir en la orden. Se copia y alli se puede ajustar.
        </p>
      </div>

      <div className="mt-5 flex flex-wrap gap-2">
        <BotonGuardar edicion={forma !== null} />
        <button
          type="button"
          onClick={onCerrar}
          className="rounded-lg border px-4 py-2 text-sm font-medium"
          style={{ borderColor: "var(--borde)" }}
        >
          Cancelar
        </button>
      </div>
    </form>
  );
}

function BotonGuardar({ edicion }: { edicion: boolean }) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex items-center gap-2 rounded-lg px-5 py-2.5 text-sm font-medium text-white disabled:opacity-60"
      style={{ backgroundColor: "var(--color-marca-600)" }}
    >
      {pending && (
        <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
      )}
      {pending ? "Guardando..." : edicion ? "Guardar cambios" : "Crear"}
    </button>
  );
}

/**
 * Activa o desactiva. No borra: las ordenes que la usaron guardan su propio
 * texto copiado, asi que borrarla no las cambiaria, pero si perderia el
 * rastro de por que media obra dice lo mismo.
 */
function BotonEstado({ id, activa }: { id: string; activa: boolean }) {
  const [estado, accion] = useActionState<EstadoFormaPago, FormData>(
    accionCambiarEstadoFormaPago,
    {},
  );

  return (
    <form action={accion}>
      <input type="hidden" name="formaPagoId" value={id} />
      <input type="hidden" name="activa" value={activa ? "false" : "true"} />
      <BotonAlternar activa={!activa} />
      {estado.error && (
        <p role="alert" className="mt-1 text-xs" style={{ color: "var(--color-peligro)" }}>
          {estado.error}
        </p>
      )}
    </form>
  );
}

function BotonAlternar({ activa }: { activa: boolean }) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-sm font-medium disabled:opacity-60"
      style={{ borderColor: "var(--borde)" }}
    >
      {pending ? (
        <LoaderCircle className="size-3.5 animate-spin" aria-hidden="true" />
      ) : (
        <Power className="size-3.5" aria-hidden="true" />
      )}
      {activa ? "Activar" : "Desactivar"}
    </button>
  );
}
