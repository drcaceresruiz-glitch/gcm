"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { LoaderCircle, Search, TriangleAlert } from "lucide-react";
import { TIPOS_DOC, ETIQUETA_TIPO_DOC } from "@/lib/perfil";
import {
  accionAltaConstructora,
  accionConsultarRucEmpresa,
} from "@/app/(dashboard)/operador/acciones";

/**
 * Alta de una constructora cliente con su primer administrador.
 *
 * El ROL no se pregunta: el primero siempre es ADMIN. Una constructora cuyo
 * unico usuario fuera consultor naceria muerta, sin nadie que pudiera crear
 * obras ni dar de alta a nadie mas.
 */

const VACIO = {
  ruc: "",
  razonSocial: "",
  direccion: "",
  telefono: "",
  emailEmpresa: "",
  nombres: "",
  apellidos: "",
  email: "",
  tipoDoc: "DNI",
  numDoc: "",
  cargo: "",
  celular: "",
};

export function FormularioConstructora() {
  const [f, setF] = useState(VACIO);
  const [error, setError] = useState<string | null>(null);
  const [avisoRuc, setAvisoRuc] = useState<string | null>(null);
  const [hecho, setHecho] = useState<{
    razonSocial: string;
    email: string;
    claveTemporal: string;
    correoEnviado: boolean;
  } | null>(null);
  const [pendiente, iniciar] = useTransition();
  const [buscando, buscar] = useTransition();

  const set = (campo: keyof typeof VACIO, valor: string) =>
    setF((p) => ({ ...p, [campo]: valor }));

  function consultarRuc() {
    setAvisoRuc(null);
    buscar(async () => {
      const r = await accionConsultarRucEmpresa(f.ruc);
      if (r.ok) {
        setF((p) => ({
          ...p,
          razonSocial: r.razonSocial,
          direccion: r.direccion ?? p.direccion,
        }));
      } else {
        setAvisoRuc(
          r.motivo === "sin_token"
            ? "La consulta a SUNAT no esta configurada. Escribe la razon social a mano."
            : "No se encontro ese RUC. Escribe la razon social a mano.",
        );
      }
    });
  }

  function guardar() {
    setError(null);
    iniciar(async () => {
      const r = await accionAltaConstructora({
        empresa: {
          razonSocial: f.razonSocial,
          ruc: f.ruc,
          direccion: f.direccion,
          telefono: f.telefono,
          email: f.emailEmpresa,
        },
        admin: {
          nombres: f.nombres,
          apellidos: f.apellidos,
          email: f.email,
          tipoDoc: f.tipoDoc,
          numDoc: f.numDoc,
          cargo: f.cargo,
          celular: f.celular,
        },
      });

      if (r.ok) {
        setHecho({
          razonSocial: f.razonSocial,
          email: f.email,
          claveTemporal: r.claveTemporal,
          correoEnviado: r.correoEnviado,
        });
      } else {
        setError(r.error);
      }
    });
  }

  // La clave se ensena UNA vez y no se puede volver a ver: no se guarda en
  // claro en ningun sitio. Si se pierde, el invitado usa "olvide mi clave".
  if (hecho) {
    return (
      <div
        className="space-y-3 rounded-lg border p-4"
        style={{ borderColor: "var(--color-exito)" }}
      >
        <h3 className="text-base font-semibold">
          {hecho.razonSocial} ya esta dada de alta
        </h3>

        <div
          className="rounded-lg border p-3"
          style={{ borderColor: "var(--borde)", backgroundColor: "var(--fondo)" }}
        >
          <p className="text-xs opacity-70">Clave temporal de {hecho.email}</p>
          <p className="mt-1 font-mono text-lg font-semibold tracking-wider">
            {hecho.claveTemporal}
          </p>
          <p className="mt-2 text-xs opacity-70">
            Se ensena una sola vez. Al entrar, la aplicacion le obligara a
            cambiarla.
          </p>
        </div>

        {hecho.correoEnviado ? (
          <p className="text-sm" style={{ color: "var(--color-exito)" }}>
            Se le envio por correo.
          </p>
        ) : (
          <p
            className="flex items-start gap-2 text-sm"
            style={{ color: "var(--color-alerta)" }}
          >
            <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            No se pudo enviar el correo. Copia la clave y hazsela llegar tu.
          </p>
        )}

        <div className="flex flex-wrap gap-3 text-sm">
          <Link href="/operador" className="font-medium underline">
            Ver las constructoras
          </Link>
          <button
            type="button"
            onClick={() => {
              setF(VACIO);
              setHecho(null);
            }}
            className="opacity-70 underline"
          >
            Dar de alta otra
          </button>
        </div>
      </div>
    );
  }

  const campo =
    "mt-1 w-full rounded-lg border px-2.5 py-2 text-sm";
  const estiloCampo = {
    borderColor: "var(--borde)",
    backgroundColor: "var(--fondo)",
  };

  return (
    <div className="space-y-6">
      <section className="space-y-3">
        <h3 className="text-base font-semibold">La constructora</h3>

        <div className="flex flex-wrap items-end gap-2">
          <label className="text-xs">
            <span className="opacity-70">RUC</span>
            <input
              value={f.ruc}
              onChange={(e) => set("ruc", e.target.value)}
              inputMode="numeric"
              maxLength={11}
              placeholder="20601689988"
              className={`${campo} w-44 tabular-nums`}
              style={estiloCampo}
            />
          </label>
          <button
            type="button"
            onClick={consultarRuc}
            disabled={buscando || f.ruc.trim().length !== 11}
            className="inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-2 text-xs font-medium disabled:opacity-50"
            style={{ borderColor: "var(--borde)" }}
          >
            {buscando ? (
              <LoaderCircle className="size-3.5 animate-spin" aria-hidden="true" />
            ) : (
              <Search className="size-3.5" aria-hidden="true" />
            )}
            Buscar en SUNAT
          </button>
        </div>
        {avisoRuc && (
          <p className="text-xs" style={{ color: "var(--color-alerta)" }}>
            {avisoRuc}
          </p>
        )}

        <label className="block text-xs">
          <span className="opacity-70">Razon social</span>
          <input
            value={f.razonSocial}
            onChange={(e) => set("razonSocial", e.target.value)}
            maxLength={200}
            className={campo}
            style={estiloCampo}
          />
        </label>

        <div className="grid gap-3 sm:grid-cols-3">
          <label className="text-xs">
            <span className="opacity-70">Direccion</span>
            <input
              value={f.direccion}
              onChange={(e) => set("direccion", e.target.value)}
              maxLength={255}
              className={campo}
              style={estiloCampo}
            />
          </label>
          <label className="text-xs">
            <span className="opacity-70">Telefono</span>
            <input
              value={f.telefono}
              onChange={(e) => set("telefono", e.target.value)}
              maxLength={30}
              className={campo}
              style={estiloCampo}
            />
          </label>
          <label className="text-xs">
            <span className="opacity-70">Correo de la empresa</span>
            <input
              value={f.emailEmpresa}
              onChange={(e) => set("emailEmpresa", e.target.value)}
              maxLength={150}
              className={campo}
              style={estiloCampo}
            />
          </label>
        </div>
      </section>

      <section className="space-y-3">
        <h3 className="text-base font-semibold">Su primer administrador</h3>
        <p className="text-sm opacity-70">
          Sera ADMIN de su constructora y podra dar de alta al resto de su
          equipo. Recibira una clave temporal que tendra que cambiar al entrar.
        </p>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-xs">
            <span className="opacity-70">Nombres</span>
            <input
              value={f.nombres}
              onChange={(e) => set("nombres", e.target.value)}
              maxLength={100}
              className={campo}
              style={estiloCampo}
            />
          </label>
          <label className="text-xs">
            <span className="opacity-70">Apellidos</span>
            <input
              value={f.apellidos}
              onChange={(e) => set("apellidos", e.target.value)}
              maxLength={100}
              className={campo}
              style={estiloCampo}
            />
          </label>
        </div>

        <label className="block text-xs">
          <span className="opacity-70">Correo</span>
          <input
            value={f.email}
            onChange={(e) => set("email", e.target.value)}
            maxLength={150}
            className={campo}
            style={estiloCampo}
          />
          <span className="mt-1 block opacity-60">
            Cada usuario necesita un correo distinto en todo GCM.
          </span>
        </label>

        <div className="grid gap-3 sm:grid-cols-4">
          <label className="text-xs">
            <span className="opacity-70">Documento</span>
            <select
              value={f.tipoDoc}
              onChange={(e) => set("tipoDoc", e.target.value)}
              className={campo}
              style={estiloCampo}
            >
              {TIPOS_DOC.map((t) => (
                <option key={t} value={t}>
                  {ETIQUETA_TIPO_DOC[t]}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs">
            <span className="opacity-70">Numero</span>
            <input
              value={f.numDoc}
              onChange={(e) => set("numDoc", e.target.value)}
              maxLength={20}
              className={`${campo} tabular-nums`}
              style={estiloCampo}
            />
          </label>
          <label className="text-xs">
            <span className="opacity-70">Cargo</span>
            <input
              value={f.cargo}
              onChange={(e) => set("cargo", e.target.value)}
              maxLength={100}
              className={campo}
              style={estiloCampo}
            />
          </label>
          <label className="text-xs">
            <span className="opacity-70">Celular</span>
            <input
              value={f.celular}
              onChange={(e) => set("celular", e.target.value)}
              maxLength={30}
              className={campo}
              style={estiloCampo}
            />
          </label>
        </div>
      </section>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={guardar}
          disabled={pendiente}
          className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-white disabled:opacity-60"
          style={{ backgroundColor: "var(--color-marca-600)" }}
        >
          {pendiente && (
            <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
          )}
          Dar de alta
        </button>
        <Link href="/operador" className="text-sm opacity-70 underline">
          Cancelar
        </Link>
        {error && (
          <span className="text-sm" style={{ color: "var(--color-peligro)" }}>
            {error}
          </span>
        )}
      </div>
    </div>
  );
}
