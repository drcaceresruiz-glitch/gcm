"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { AlertCircle, LoaderCircle } from "lucide-react";
import {
  accionGuardarEmpresa,
  type EstadoEmpresa,
} from "@/app/(dashboard)/empresa/datos/acciones";
import type { DatosEmpresa } from "@/services/empresa.service";
import { CampoTexto } from "@/components/auth/CampoTexto";
import { Tarjeta, SeccionTarjeta } from "@/components/ui/Tarjeta";

/**
 * Los datos que encabezan y firman las ordenes.
 *
 * Se agrupan en tres bloques con el mismo criterio: identificacion (quien es
 * la empresa), contacto (por donde le responde el proveedor) y documento (lo
 * que sale impreso y no se sabria de otro modo). El ultimo lleva su
 * explicacion a la vista, porque nadie adivina que un campo llamado
 * "observaciones" acaba en un papel que sale a un tercero.
 */

interface Props {
  empresa: DatosEmpresa;
  soloLectura: boolean;
}

export function FormularioEmpresa({ empresa, soloLectura }: Props) {
  const [estado, accion] = useActionState<EstadoEmpresa, FormData>(
    accionGuardarEmpresa,
    {},
  );

  return (
    <form action={accion} className="max-w-2xl">
      <Tarjeta>
      <Bloque titulo="Identificación" primera>
        <CampoTexto
          id="razonSocial"
          name="razonSocial"
          etiqueta="Razón social"
          defaultValue={empresa.razonSocial}
          disabled={soloLectura}
          required
          maxLength={200}
        />

        <div className="space-y-1.5">
          <span className="block text-sm font-medium">RUC</span>
          <p className="rounded-lg border px-3 py-2 font-mono text-sm opacity-70"
            style={{ borderColor: "var(--borde)" }}>
            {empresa.ruc}
          </p>
          <p className="text-xs opacity-60">
            No se edita desde aquí: identifica a la empresa y ya figura
            impreso en las órdenes emitidas.
          </p>
        </div>
      </Bloque>

      <Bloque
        titulo="Contacto"
        nota="Sale en la cabecera de cada orden. Es por donde el proveedor responde."
      >
        <CampoTexto
          id="direccion"
          name="direccion"
          etiqueta="Dirección"
          defaultValue={empresa.direccion ?? ""}
          disabled={soloLectura}
          maxLength={255}
        />
        <CampoTexto
          id="telefono"
          name="telefono"
          etiqueta="Teléfono"
          defaultValue={empresa.telefono ?? ""}
          disabled={soloLectura}
          maxLength={30}
        />
        <CampoTexto
          id="email"
          name="email"
          type="email"
          etiqueta="Correo"
          defaultValue={empresa.email ?? ""}
          disabled={soloLectura}
          maxLength={150}
        />
      </Bloque>

      <Bloque
        titulo="Firma de las órdenes"
        nota="Va sobre la línea de firma del documento que recibe el proveedor."
      >
        <CampoTexto
          id="representanteLegal"
          name="representanteLegal"
          etiqueta="Quien firma"
          ayuda="Nombre completo, como debe leerse en el papel."
          defaultValue={empresa.representanteLegal ?? ""}
          disabled={soloLectura}
          maxLength={150}
        />
        <CampoTexto
          id="cargoRepresentante"
          name="cargoRepresentante"
          etiqueta="Cargo"
          ayuda="Por ejemplo: Gerente General."
          defaultValue={empresa.cargoRepresentante ?? ""}
          disabled={soloLectura}
          maxLength={100}
        />
      </Bloque>

      <Bloque
        titulo="Condiciones al pie"
        nota="Texto fijo que se repite al final de TODAS las órdenes."
      >
        <div className="space-y-1.5">
          <label htmlFor="observacionesOrden" className="block text-sm font-medium">
            Observaciones
          </label>
          <textarea
            id="observacionesOrden"
            name="observacionesOrden"
            rows={4}
            defaultValue={empresa.observacionesOrden ?? ""}
            disabled={soloLectura}
            className="w-full rounded-lg border px-3 py-2 text-sm outline-none"
            style={{
              borderColor: "var(--borde)",
              backgroundColor: "var(--fondo)",
            }}
          />
          <p className="text-xs opacity-60">
            Son las condiciones que la empresa impone en todos sus pedidos —de
            quién es el riesgo del traslado, por ejemplo—. Cada orden puede
            añadir las suyas encima sin tocar estas.
          </p>
        </div>
      </Bloque>

      {estado.error && (
        <p
          role="alert"
          className="mt-6 flex items-start gap-2 rounded-lg px-4 py-3 text-sm"
          style={{
            backgroundColor:
              "color-mix(in oklab, var(--color-peligro) 15%, transparent)",
          }}
        >
          <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <span>{estado.error}</span>
        </p>
      )}

      {!soloLectura && (
        <div
          className="mt-8 border-t pt-5"
          style={{ borderColor: "var(--borde)" }}
        >
          <BotonGuardar />
        </div>
      )}
      </Tarjeta>
    </form>
  );
}

/** Delega en la seccion compartida, para que este formulario y el de alta de
 *  obra se vean iguales sin repetir el marcado en los dos. */
function Bloque({
  titulo,
  nota,
  primera,
  children,
}: {
  titulo: string;
  nota?: string;
  primera?: boolean;
  children: React.ReactNode;
}) {
  return (
    <SeccionTarjeta titulo={titulo} nota={nota} primera={primera}>
      {children}
    </SeccionTarjeta>
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
      {pending && (
        <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
      )}
      {pending ? "Guardando..." : "Guardar cambios"}
    </button>
  );
}
