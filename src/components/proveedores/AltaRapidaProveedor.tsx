"use client";

import { useRef, useState, useTransition } from "react";
import { LoaderCircle, Search, X } from "lucide-react";

import { Nota } from "@/components/ui/Nota";
import {
  accionConsultarRuc,
  accionCrearProveedorEnLinea,
} from "@/app/(dashboard)/empresa/proveedores/acciones";
import type { ProveedorOpcion } from "@/components/proveedores/FormularioEncargo";

/**
 * Dar de alta un contratista SIN salir del encargo.
 *
 * Antes de esto, «Crear proveedor» era un enlace a otra pestaña. El problema
 * no era el clic: el formulario del encargo vive en estado de cliente —las
 * partidas marcadas, sus fracciones, el monto pactado—, asi que al volver
 * habia que acordarse de recargar para que el proveedor nuevo apareciera en
 * el desplegable, y recargar es justo lo que borra todo lo tecleado. Se
 * llegaba con el contratista creado y el frente por rehacer.
 *
 * PIDE LO MINIMO Y LO DICE. Razon social y RUC son lo unico obligatorio;
 * telefono y correo se ofrecen porque sin ellos no se le puede escribir
 * despues. El resto —cuentas, detraccion, forma de pago— se completa en el
 * catalogo cuando toque, y la pantalla lo advierte en vez de dejar creer que
 * la ficha esta terminada.
 */
export function AltaRapidaProveedor({
  onCreado,
  onCerrar,
}: {
  onCreado: (proveedor: ProveedorOpcion) => void;
  onCerrar: () => void;
}) {
  const [ruc, setRuc] = useState("");
  const [razonSocial, setRazonSocial] = useState("");
  const [rol, setRol] = useState("CONTRATISTA");
  const [telefono, setTelefono] = useState("");
  const [email, setEmail] = useState("");

  const [consulta, setConsulta] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [consultando, iniciarConsulta] = useTransition();
  const [guardando, iniciarGuardado] = useTransition();

  /// El ultimo RUC consultado, para no repetir la peticion a SUNAT mientras
  /// se teclea. Es la misma disciplina que el formulario del catalogo.
  const consultado = useRef<string | null>(null);

  function consultarSiCompleto(valor: string) {
    const limpio = valor.trim();
    if (!/^\d{11}$/.test(limpio)) return;
    if (consultado.current === limpio) return;

    consultado.current = limpio;
    setConsulta(null);

    iniciarConsulta(async () => {
      const r = await accionConsultarRuc(limpio);
      if (r.ok) {
        setConsulta(`SUNAT: ${r.razonSocial}`);
        // No se pisa lo que ya haya escrito: puede ser un nombre comercial
        // mas util que el de SUNAT.
        if (!razonSocial.trim()) setRazonSocial(r.razonSocial);
      } else {
        // Que SUNAT no conteste no puede impedir dar de alta: el campo sigue
        // siendo editable a mano.
        setConsulta(r.detalle);
      }
    });
  }

  function guardar() {
    setError(null);

    if (!/^\d{11}$/.test(ruc.trim())) {
      return setError("El RUC son 11 dígitos, sin espacios ni guiones.");
    }
    if (!razonSocial.trim()) {
      return setError("Falta la razón social.");
    }

    iniciarGuardado(async () => {
      const r = await accionCrearProveedorEnLinea({
        ruc,
        razonSocial,
        rol,
        contactoTelefono: telefono,
        email,
      });

      if (!r.ok) return setError(r.error);
      onCreado(r.proveedor);
    });
  }

  const campo = {
    className: "mt-1 w-full rounded-lg border px-3 py-2 text-sm",
    style: { borderColor: "var(--borde)", backgroundColor: "var(--fondo)" },
  };

  return (
    <div
      className="mt-3 space-y-3 rounded-lg border p-4"
      style={{
        borderColor: "var(--color-marca-600)",
        backgroundColor: "var(--superficie)",
      }}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold">Nuevo contratista</h3>
          <p className="mt-0.5 text-xs opacity-70">
            Se da de alta en el catálogo de la empresa y queda elegido aquí
            mismo. No se pierde nada de lo que ya marcaste.
          </p>
        </div>
        <button
          type="button"
          onClick={onCerrar}
          aria-label="Cerrar el alta"
          className="rounded-lg border p-1.5"
          style={{ borderColor: "var(--borde)" }}
        >
          <X className="size-4" aria-hidden="true" />
        </button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-xs">
          <span className="block opacity-70">RUC</span>
          <div className="relative">
            <input
              value={ruc}
              inputMode="numeric"
              maxLength={11}
              placeholder="20123456789"
              onChange={(e) => {
                const v = e.target.value.replace(/\D/g, "");
                setRuc(v);
                consultarSiCompleto(v);
              }}
              {...campo}
            />
            {consultando && (
              <LoaderCircle
                className="absolute top-1/2 right-3 size-4 -translate-y-1/2 animate-spin"
                aria-hidden="true"
              />
            )}
          </div>
          {consulta && (
            <span className="mt-1 flex items-start gap-1 opacity-70">
              <Search className="mt-0.5 size-3 shrink-0" aria-hidden="true" />
              {consulta}
            </span>
          )}
        </label>

        <label className="block text-xs">
          <span className="block opacity-70">Razón social</span>
          <input
            value={razonSocial}
            onChange={(e) => setRazonSocial(e.target.value)}
            placeholder="Se rellena sola al escribir el RUC"
            {...campo}
          />
        </label>

        <label className="block text-xs">
          <span className="block opacity-70">Rol</span>
          <select value={rol} onChange={(e) => setRol(e.target.value)} {...campo}>
            {/* CONTRATISTA por defecto: se esta repartiendo un frente de obra,
                no comprando material. */}
            <option value="CONTRATISTA">Contratista</option>
            <option value="PROVEEDOR">Proveedor</option>
            <option value="AMBOS">Ambos</option>
          </select>
        </label>

        <label className="block text-xs">
          <span className="block opacity-70">Teléfono (opcional)</span>
          <input
            value={telefono}
            onChange={(e) => setTelefono(e.target.value)}
            placeholder="987654321"
            {...campo}
          />
        </label>

        <label className="block text-xs sm:col-span-2">
          <span className="block opacity-70">Correo (opcional)</span>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="contacto@empresa.pe"
            {...campo}
          />
        </label>
      </div>

      <p className="text-xs opacity-60">
        Con esto basta para asignarle el frente. Las cuentas bancarias y la
        detracción se completan después en Empresa → Proveedores; hasta
        entonces no se le puede emitir una orden de pago.
      </p>

      {error && <Nota tono="peligro">{error}</Nota>}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={guardar}
          disabled={guardando}
          className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          style={{ backgroundColor: "var(--color-marca-600)" }}
        >
          {guardando && (
            <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
          )}
          Crear y elegir
        </button>

        <button
          type="button"
          onClick={onCerrar}
          className="rounded-lg border px-4 py-2 text-sm font-medium"
          style={{ borderColor: "var(--borde)" }}
        >
          Cancelar
        </button>
      </div>
    </div>
  );
}
