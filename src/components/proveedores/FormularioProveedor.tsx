"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { AlertCircle, LoaderCircle } from "lucide-react";
import {
  accionGuardarProveedor,
  type EstadoProveedor,
} from "@/app/(dashboard)/empresa/proveedores/acciones";
import type { ProveedorResumen } from "@/services/proveedores.service";
import { CampoTexto } from "@/components/auth/CampoTexto";

/**
 * Alta y edicion de un proveedor. El mismo formulario para las dos cosas: los
 * campos son identicos y mantener dos copias solo garantiza que se separen.
 *
 * Los datos bancarios estan aqui y no en cada orden, aunque el papel los
 * repita en todas: son del proveedor, y tenerlos en un solo sitio evita que
 * media obra se pague a una cuenta que ya cambio.
 */

interface Props {
  /// null para dar de alta; con datos, se edita ese.
  proveedor: ProveedorResumen | null;
  onCerrar: () => void;
}

export function FormularioProveedor({ proveedor, onCerrar }: Props) {
  const [estado, accion] = useActionState<EstadoProveedor, FormData>(
    accionGuardarProveedor,
    {},
  );

  return (
    <form
      action={accion}
      // `key` fuerza a React a rehacer los campos al pasar de un proveedor a
      // otro: sin esto, editar uno y despues otro dejaria los valores del
      // primero, porque son campos no controlados.
      key={proveedor?.id ?? "nuevo"}
      className="rounded-xl border p-5"
      style={{
        borderColor: "var(--color-marca-600)",
        backgroundColor: "var(--superficie)",
      }}
      noValidate
    >
      {proveedor && (
        <input type="hidden" name="proveedorId" value={proveedor.id} />
      )}

      <h2 className="text-sm font-semibold">
        {proveedor ? `Editar ${proveedor.razonSocial}` : "Nuevo proveedor"}
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

      <div className="mt-4 grid gap-4 sm:grid-cols-3">
        <div className="sm:col-span-2">
          <CampoTexto
            id="razonSocial"
            name="razonSocial"
            type="text"
            etiqueta="Razon social o nombre"
            defaultValue={proveedor?.razonSocial ?? ""}
            ayuda="Tal como debe salir en la orden."
          />
        </div>
        <CampoTexto
          id="ruc"
          name="ruc"
          type="text"
          inputMode="numeric"
          etiqueta="RUC"
          defaultValue={proveedor?.ruc ?? ""}
          ayuda="11 digitos. Empieza por 20 si es empresa y por 10 si es persona natural."
        />
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-3">
        <CampoTexto
          id="contactoNombre"
          name="contactoNombre"
          type="text"
          etiqueta="Contacto"
          defaultValue={proveedor?.contactoNombre ?? ""}
        />
        <CampoTexto
          id="contactoTelefono"
          name="contactoTelefono"
          type="text"
          inputMode="tel"
          etiqueta="Telefono"
          defaultValue={proveedor?.contactoTelefono ?? ""}
        />
        <CampoTexto
          id="email"
          name="email"
          type="email"
          etiqueta="Correo"
          defaultValue={proveedor?.email ?? ""}
        />
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <CampoTexto
          id="cuentaBancaria"
          name="cuentaBancaria"
          type="text"
          etiqueta="Cuenta bancaria"
          defaultValue={proveedor?.cuentaBancaria ?? ""}
          ayuda="La de depositos. Es donde se le paga."
        />
        <CampoTexto
          id="cci"
          name="cci"
          type="text"
          etiqueta="CCI"
          defaultValue={proveedor?.cci ?? ""}
          ayuda="Cuenta interbancaria, para transferencias desde otro banco."
        />
      </div>

      <div className="mt-5 flex flex-wrap gap-2">
        <BotonGuardar edicion={proveedor !== null} />
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
      {pending ? "Guardando..." : edicion ? "Guardar cambios" : "Crear proveedor"}
    </button>
  );
}
