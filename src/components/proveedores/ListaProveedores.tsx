"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Building2,
  FileText,
  Mail,
  Pencil,
  Phone,
  Plus,
  Send,
  Users,
} from "lucide-react";
import type { ProveedorResumen } from "@/services/proveedores.service";
import {
  ROTULO_CONTRATO,
  type EstadoContrato,
} from "@/lib/semaforo-contratista";
import { FormularioProveedor } from "@/components/proveedores/FormularioProveedor";
import { BotonEstadoProveedor } from "@/components/proveedores/BotonEstadoProveedor";

/**
 * El catalogo, con el alta y la edicion en la misma pantalla.
 *
 * Se edita en linea y no en otra ruta porque dar de alta proveedores es algo
 * que se hace en rafagas —llegan cinco ordenes nuevas y hay que meter tres
 * proveedores— y en ese momento perder la lista de vista para volver a ella
 * despues sobra.
 */

interface Props {
  /// Los de esta pagina.
  proveedores: ProveedorResumen[];
  /// Cuantos hay en total. El recuento se saca de aqui y no de la longitud
  /// de la lista: rotular «12 proveedores» estando en la pagina 2 de 40
  /// seria falso, y ademas cambiaria al pasar de pagina.
  total: number;
  verTodos: boolean;
  puedeCrear: boolean;
  puedeEditar: boolean;
  /// Escribirle es OTRO permiso que editar su ficha: mandar un correo con el
  /// membrete de la empresa a alguien de fuera no se deshace.
  puedeContactar: boolean;
  /// Estado de contrato por id de proveedor, en la obra elegida. `null` cuando
  /// no se eligio ninguna: entonces la columna no se pinta.
  semaforo: Record<string, EstadoContrato> | null;
}

export function ListaProveedores({
  proveedores,
  total,
  verTodos,
  puedeCrear,
  puedeEditar,
  puedeContactar,
  semaforo,
}: Props) {
  /// null = cerrado; "nuevo" = alta; un id = editando ese proveedor.
  const [abierto, setAbierto] = useState<string | null>(null);

  const enEdicion =
    abierto && abierto !== "nuevo"
      ? (proveedores.find((p) => p.id === abierto) ?? null)
      : null;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm opacity-70">
          {total === 1 ? "1 proveedor" : `${total} proveedores`}
          {!verTodos && " activos"}
        </p>

        <div className="flex flex-wrap items-center gap-3">
          <Link
            href={
              verTodos
                ? "/empresa/proveedores"
                : "/empresa/proveedores?todos=1"
            }
            className="text-sm font-medium underline opacity-70 hover:opacity-100"
          >
            {verTodos ? "Ver solo los activos" : "Ver también los desactivados"}
          </Link>

          {puedeCrear && abierto !== "nuevo" && (
            <button
              type="button"
              onClick={() => setAbierto("nuevo")}
              className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-white"
              style={{ backgroundColor: "var(--color-marca-600)" }}
            >
              <Plus className="size-4" aria-hidden="true" />
              Nuevo proveedor
            </button>
          )}
        </div>
      </div>

      {(abierto === "nuevo" || enEdicion) && (
        <FormularioProveedor
          proveedor={enEdicion}
          onCerrar={() => setAbierto(null)}
        />
      )}

      {proveedores.length === 0 ? (
        <div
          className="rounded-xl border border-dashed p-10 text-center"
          style={{ borderColor: "var(--borde)" }}
        >
          <Users className="mx-auto size-8 opacity-40" aria-hidden="true" />
          <p className="mt-3 text-sm opacity-70">
            Todavía no hay proveedores.
          </p>
          <p className="mx-auto mt-1 max-w-md text-sm text-pretty opacity-60">
            Se dan de alta una vez y sirven para todas las obras. Cada orden de
            compra apunta a uno de ellos.
          </p>
        </div>
      ) : (
        <ul className="space-y-2">
          {proveedores.map((p) => (
            <li key={p.id}>
              <Fila
                proveedor={p}
                puedeEditar={puedeEditar}
                puedeContactar={puedeContactar}
                editando={abierto === p.id}
                onEditar={() => setAbierto(p.id)}
                contrato={semaforo?.[p.id] ?? null}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Fila({
  proveedor: p,
  puedeEditar,
  puedeContactar,
  editando,
  onEditar,
  contrato,
}: {
  proveedor: ProveedorResumen;
  puedeEditar: boolean;
  puedeContactar: boolean;
  editando: boolean;
  onEditar: () => void;
  /// null cuando no se eligio obra: entonces no se pinta nada, que es distinto
  /// de pintar «sin contrato».
  contrato: EstadoContrato | null;
}) {
  const rotulo = contrato ? ROTULO_CONTRATO[contrato] : null;

  return (
    <div
      className="flex flex-wrap items-start justify-between gap-3 rounded-xl border p-4"
      style={{
        borderColor: editando ? "var(--color-marca-600)" : "var(--borde)",
        backgroundColor: "var(--superficie)",
        opacity: p.activo ? 1 : 0.6,
      }}
    >
      <div className="min-w-0">
        <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
          <Building2 className="size-4 shrink-0 opacity-70" aria-hidden="true" />
          {p.razonSocial}
          {!p.activo && (
            <span
              className="rounded-full px-2 py-0.5 text-[10px] font-medium"
              style={{
                backgroundColor:
                  "color-mix(in oklab, var(--color-alerta) 18%, transparent)",
              }}
            >
              desactivado
            </span>
          )}

          {/* El color NUNCA va solo: lleva su palabra al lado. Un punto verde
              sin texto no se puede leer en blanco y negro ni con un lector de
              pantalla, y aqui decide si alguien esta contratado. */}
          {rotulo && (
            <span
              title={rotulo.ayuda}
              className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-medium"
              style={{
                color: rotulo.color,
                backgroundColor: `color-mix(in oklab, ${rotulo.color} 15%, transparent)`,
              }}
            >
              <span
                aria-hidden="true"
                className="size-1.5 rounded-full"
                style={{ backgroundColor: rotulo.color }}
              />
              {rotulo.texto}
            </span>
          )}
        </p>

        <p className="mt-0.5 text-xs opacity-60">
          RUC {p.ruc}
          {/* Los que empiezan por 10 son personas naturales. Se dice porque
              cambia como se les factura y como se les paga. */}
          {p.ruc.startsWith("10") && " · persona natural"}
          {p.contactoNombre && ` · ${p.contactoNombre}`}
        </p>

        {/* El telefono, como ENLACE. En el movil abre el marcador de una
            pulsacion; en un ordenador no hace nada y no estorba, asi que no
            hace falta detectar el dispositivo. */}
        {p.contactoTelefono && (
          <p className="mt-0.5 text-xs">
            <a
              href={`tel:${p.contactoTelefono.replace(/\s/g, "")}`}
              className="inline-flex items-center gap-1.5 underline underline-offset-2"
              style={{ color: "var(--color-marca-600)" }}
            >
              <Phone className="size-3" aria-hidden="true" />
              {p.contactoTelefono}
            </a>
          </p>
        )}

        {/* El correo se venia guardando desde siempre y no se ensenaba en
            ninguna pantalla: estaba en la ficha, en el Excel y en la base, y
            era invisible. Como enlace, ademas, abre el cliente de correo para
            lo que no da para un mensaje formal. */}
        {p.email && (
          <p className="mt-0.5 text-xs">
            <a
              href={`mailto:${p.email}`}
              className="inline-flex items-center gap-1.5 underline underline-offset-2"
              style={{ color: "var(--color-marca-600)" }}
            >
              <Mail className="size-3" aria-hidden="true" />
              {p.email}
            </a>
          </p>
        )}

        {(p.cuentaBancaria || p.banco) && (
          <p className="mt-0.5 text-xs opacity-60">
            {[
              p.banco,
              p.tipoCuenta === "AHORROS"
                ? "ahorros"
                : p.tipoCuenta === "CORRIENTE"
                  ? "corriente"
                  : null,
              p.monedaCuenta === "USD"
                ? "dólares"
                : p.monedaCuenta === "PEN"
                  ? "soles"
                  : null,
              p.cuentaBancaria,
            ]
              .filter(Boolean)
              .join(" · ")}
            {p.cci && ` · CCI ${p.cci}`}
          </p>
        )}

        <p className="mt-1 text-xs opacity-70">
          {p.totalOrdenes === 0
            ? "Sin órdenes todavía"
            : p.totalOrdenes === 1
              ? "1 orden"
              : `${p.totalOrdenes} órdenes`}
        </p>
      </div>

      {/* Escribir va SEPARADO de editar, y no es un detalle: el residente
          puede escribirle a un contratista pero no tocar su ficha, asi que
          colgar el boton de `puedeEditar` se lo habria escondido justo a
          quien mas lo necesita —el que esta en obra—. */}
      <div className="flex shrink-0 flex-wrap items-center gap-2">
        {/* Sus contratos, cruzando obras. Sin permiso de escribir ni de
            editar: mirar que se le ha encargado es lectura, y quien ve el
            catalogo ya llego hasta aqui. La pantalla acota por alcance lo
            que ensena. */}
        <Link
          href={`/empresa/proveedores/${p.id}/contratos`}
          className="inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-sm font-medium"
          style={{ borderColor: "var(--borde)" }}
        >
          <FileText className="size-3.5" aria-hidden="true" />
          Contratos
        </Link>

        {(puedeEditar || puedeContactar) && (
          <>
          {puedeContactar && (
            <Link
              href={`/empresa/proveedores/${p.id}/mensajes`}
              className="inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-sm font-medium"
              style={{ borderColor: "var(--borde)" }}
            >
              <Send className="size-3.5" aria-hidden="true" />
              Escribir
            </Link>
          )}

          {puedeEditar && !editando && (
            <button
              type="button"
              onClick={onEditar}
              className="inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-sm font-medium"
              style={{ borderColor: "var(--borde)" }}
            >
              <Pencil className="size-3.5" aria-hidden="true" />
              Editar
            </button>
          )}

          {puedeEditar && (
            <BotonEstadoProveedor
              proveedorId={p.id}
              razonSocial={p.razonSocial}
              activo={p.activo}
              totalOrdenes={p.totalOrdenes}
            />
          )}
          </>
        )}
      </div>
    </div>
  );
}
