"use client";

import { useActionState, useRef, useState, useTransition } from "react";
import { useFormStatus } from "react-dom";
import { AlertCircle, LoaderCircle, Search } from "lucide-react";
import {
  accionConsultarRuc,
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

  const [ruc, setRuc] = useState(proveedor?.ruc ?? "");
  const [razonSocial, setRazonSocial] = useState(proveedor?.razonSocial ?? "");
  const [consulta, setConsulta] = useState<string | null>(null);
  const [consultando, iniciarConsulta] = useTransition();

  /// El ultimo RUC consultado. Evita repetir la peticion mientras se corrige
  /// otro campo, que gastaria cuota para nada.
  const consultado = useRef<string | null>(null);

  /**
   * Consulta SUNAT y rellena la razon social.
   *
   * NO pisa lo que ya haya escrito: si alguien tecleo el nombre y despues
   * completa el RUC, su texto manda. SUNAT devuelve la razon social formal,
   * que no siempre es como se conoce al proveedor en obra.
   */
  function consultarSiProcede(valor: string) {
    const limpio = valor.trim();
    if (!/^\d{11}$/.test(limpio)) return;
    if (consultado.current === limpio) return;

    consultado.current = limpio;
    setConsulta(null);

    iniciarConsulta(async () => {
      const resultado = await accionConsultarRuc(limpio);

      if (resultado.ok) {
        setConsulta(`SUNAT: ${resultado.razonSocial}`);
        if (!razonSocial.trim()) setRazonSocial(resultado.razonSocial);
      } else {
        // El fallo se cuenta pero no estorba: el campo sigue editable.
        setConsulta(resultado.detalle);
      }
    });
  }

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
        {/* El RUC va primero a proposito: es lo que se tiene delante en el
            papel, y al completarlo trae la razon social sola. */}
        <CampoTexto
          id="ruc"
          name="ruc"
          type="text"
          inputMode="numeric"
          etiqueta="RUC"
          value={ruc}
          onChange={(e) => {
            setRuc(e.target.value);
            consultarSiProcede(e.target.value);
          }}
          onBlur={(e) => consultarSiProcede(e.target.value)}
          ayuda="11 digitos. Al completarlo se busca la razon social en SUNAT."
        />

        <div className="sm:col-span-2">
          <CampoTexto
            id="razonSocial"
            name="razonSocial"
            type="text"
            etiqueta="Razon social o nombre"
            value={razonSocial}
            onChange={(e) => setRazonSocial(e.target.value)}
            ayuda="Tal como debe salir en la orden. Se puede corregir."
          />

          {(consultando || consulta) && (
            <p className="mt-1.5 flex items-start gap-1.5 text-xs opacity-70">
              {consultando ? (
                <>
                  <LoaderCircle className="mt-0.5 size-3 shrink-0 animate-spin" aria-hidden="true" />
                  Consultando SUNAT...
                </>
              ) : (
                <>
                  <Search className="mt-0.5 size-3 shrink-0" aria-hidden="true" />
                  {consulta}
                </>
              )}
            </p>
          )}
        </div>
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

      <div className="mt-4 grid gap-4 sm:grid-cols-3">
        <CampoTexto
          id="banco"
          name="banco"
          type="text"
          etiqueta="Banco"
          defaultValue={proveedor?.banco ?? ""}
          ayuda="BCP, BBVA, Interbank..."
        />
        <CampoSelect
          id="tipoCuenta"
          name="tipoCuenta"
          etiqueta="Tipo de cuenta"
          defaultValue={proveedor?.tipoCuenta ?? ""}
        >
          <option value="">Sin indicar</option>
          <option value="AHORROS">Ahorros</option>
          <option value="CORRIENTE">Corriente</option>
        </CampoSelect>
        <CampoSelect
          id="monedaCuenta"
          name="monedaCuenta"
          etiqueta="Moneda"
          defaultValue={proveedor?.monedaCuenta ?? ""}
        >
          <option value="">Sin indicar</option>
          <option value="PEN">Soles</option>
          <option value="USD">Dolares</option>
        </CampoSelect>
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <CampoTexto
          id="cuentaBancaria"
          name="cuentaBancaria"
          type="text"
          etiqueta="Numero de cuenta"
          defaultValue={proveedor?.cuentaBancaria ?? ""}
          ayuda="La de depositos. Es donde se le paga."
        />
        <CampoTexto
          id="cci"
          name="cci"
          type="text"
          etiqueta="CCI"
          defaultValue={proveedor?.cci ?? ""}
          ayuda="Interbancaria, para transferir desde otro banco. Lleva el banco codificado."
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

interface CampoSelectProps
  extends React.SelectHTMLAttributes<HTMLSelectElement> {
  etiqueta: string;
  ayuda?: string;
}

/** Version de CampoTexto para desplegables, con la misma accesibilidad. */
function CampoSelect({
  etiqueta,
  ayuda,
  id,
  children,
  ...props
}: CampoSelectProps) {
  const idAyuda = ayuda ? `${id}-ayuda` : undefined;

  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-sm font-medium">
        {etiqueta}
      </label>
      <select
        id={id}
        aria-describedby={idAyuda}
        className="w-full rounded-lg border px-3 py-2 text-sm outline-none"
        style={{ borderColor: "var(--borde)", backgroundColor: "var(--fondo)" }}
        {...props}
      >
        {children}
      </select>
      {ayuda && (
        <p id={idAyuda} className="text-xs opacity-60">
          {ayuda}
        </p>
      )}
    </div>
  );
}
