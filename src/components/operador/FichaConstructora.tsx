"use client";

import { useState, useTransition } from "react";
import { LoaderCircle, Search } from "lucide-react";
import {
  accionEditarConstructora,
  accionConsultarRucEmpresa,
} from "@/app/(dashboard)/operador/acciones";

/**
 * Corregir los datos de una constructora, desde el area del operador.
 *
 * PARA ARREGLAR UN ALTA, no para administrar al cliente. Su admin sigue
 * editando lo suyo en `/empresa`; esto existe porque un RUC mal tecleado que
 * el cliente no sepa corregir no tenia ninguna salida.
 *
 * El RUC y la razon social se dejan tocar a proposito (lo decidio el usuario
 * el 19/08/2026), y por eso la pantalla AVISA de lo que arrastra en vez de
 * limitarse a guardar: el RUC identifica a la empresa en documentos ya
 * emitidos.
 */

export interface DatosFicha {
  razonSocial: string;
  ruc: string;
  direccion: string;
  telefono: string;
  email: string;
}

export function FichaConstructora({
  empresaId,
  inicial,
  esLaPropia,
  congelada,
}: {
  empresaId: string;
  inicial: DatosFicha;
  /// La del propio operador. Se puede editar —es una empresa como otra— pero
  /// se avisa, porque es la que sostiene su propia sesion.
  esLaPropia: boolean;
  /// En migracion: el servicio lo rechaza igual, pero decirlo aqui evita el
  /// viaje y explica por que.
  congelada: boolean;
}) {
  const [f, setF] = useState(inicial);
  const [error, setError] = useState<string | null>(null);
  const [guardado, setGuardado] = useState(false);
  const [avisoRuc, setAvisoRuc] = useState<string | null>(null);
  const [pendiente, iniciar] = useTransition();
  const [buscando, buscar] = useTransition();

  const set = (campo: keyof DatosFicha, valor: string) => {
    setGuardado(false);
    setF((p) => ({ ...p, [campo]: valor }));
  };

  /// Lo tecleado difiere de lo guardado. Sin esto, el boton invita a guardar
  /// lo mismo que ya hay y cada pulsacion deja un apunte de auditoria que no
  /// cambio nada.
  const cambiado = (Object.keys(inicial) as (keyof DatosFicha)[]).some(
    (k) => f[k].trim() !== inicial[k].trim(),
  );
  const cambiaLaIdentificacion =
    f.ruc.trim() !== inicial.ruc.trim() ||
    f.razonSocial.trim() !== inicial.razonSocial.trim();

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
        setGuardado(false);
      } else {
        setAvisoRuc(
          // `sin_token` y `demasiadas` traen su propio texto, y el segundo
          // ademas dice cuanto esperar. Solo el caso «no lo encontro» se
          // reescribe aqui, porque el del servicio es mas seco.
          r.motivo === "sin_token" || r.motivo === "demasiadas"
            ? r.detalle
            : "No se encontró ese RUC. Escribe la razón social a mano.",
        );
      }
    });
  }

  function guardar() {
    setError(null);
    setGuardado(false);
    iniciar(async () => {
      const r = await accionEditarConstructora(empresaId, {
        razonSocial: f.razonSocial,
        ruc: f.ruc,
        direccion: f.direccion,
        telefono: f.telefono,
        email: f.email,
      });
      if (r.ok) setGuardado(true);
      else setError(r.error);
    });
  }

  const campo = "mt-1 w-full rounded-lg border px-2.5 py-2 text-sm";
  const estiloCampo = {
    borderColor: "var(--borde)",
    backgroundColor: "var(--fondo)",
  };

  return (
    <section
      className="space-y-3 rounded-lg border p-4"
      style={{ borderColor: "var(--borde)" }}
    >
      <div>
        <h3 className="text-base font-semibold">Datos de la constructora</h3>
        <p className="mt-0.5 text-sm opacity-70 text-pretty">
          Para corregir un alta. Su administrador edita estos mismos datos
          dentro de su empresa; lo que cambies aquí lo verá él.
        </p>
      </div>

      {congelada && (
        <p className="text-sm" style={{ color: "var(--color-alerta)" }}>
          Está congelada por una migración en curso: sus datos están viajando a
          otra instalación y no se pueden cambiar a medias. Termina la migración
          o descongélala primero.
        </p>
      )}

      <div className="flex flex-wrap items-end gap-2">
        <label className="text-xs">
          <span className="opacity-70">RUC</span>
          <input
            value={f.ruc}
            onChange={(e) => set("ruc", e.target.value)}
            inputMode="numeric"
            maxLength={11}
            disabled={congelada}
            className={`${campo} w-44 tabular-nums`}
            style={estiloCampo}
          />
        </label>
        <button
          type="button"
          onClick={consultarRuc}
          disabled={buscando || congelada || f.ruc.trim().length !== 11}
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
        <span className="opacity-70">Razón social</span>
        <input
          value={f.razonSocial}
          onChange={(e) => set("razonSocial", e.target.value)}
          maxLength={200}
          disabled={congelada}
          className={campo}
          style={estiloCampo}
        />
      </label>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-xs">
          <span className="opacity-70">Dirección</span>
          <input
            value={f.direccion}
            onChange={(e) => set("direccion", e.target.value)}
            maxLength={255}
            disabled={congelada}
            className={campo}
            style={estiloCampo}
          />
        </label>
        <label className="block text-xs">
          <span className="opacity-70">Teléfono</span>
          <input
            value={f.telefono}
            onChange={(e) => set("telefono", e.target.value)}
            maxLength={30}
            disabled={congelada}
            className={campo}
            style={estiloCampo}
          />
        </label>
        <label className="block text-xs sm:col-span-2">
          <span className="opacity-70">Correo de la empresa</span>
          <input
            value={f.email}
            onChange={(e) => set("email", e.target.value)}
            maxLength={150}
            disabled={congelada}
            className={campo}
            style={estiloCampo}
          />
        </label>
      </div>

      {/* Se avisa de lo que arrastra ANTES de guardar, no despues. El RUC y la
          razon social son como se identifica a la empresa en lo ya emitido. */}
      {cambiaLaIdentificacion && !congelada && (
        <p className="text-sm text-pretty" style={{ color: "var(--color-alerta)" }}>
          Vas a cambiar cómo se identifica esta constructora. Las órdenes,
          valorizaciones e informes ya emitidos siguen con el dato anterior:
          asegúrate de que es una corrección y no otra empresa.
          {esLaPropia && " Además, es tu propia empresa."}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={guardar}
          disabled={pendiente || congelada || !cambiado}
          className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
          style={{ backgroundColor: "var(--color-marca-600)" }}
        >
          {pendiente && (
            <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
          )}
          Guardar cambios
        </button>
        {guardado && (
          <span className="text-sm" style={{ color: "var(--color-exito)" }}>
            Guardado.
          </span>
        )}
        {error && (
          <span className="text-sm" style={{ color: "var(--color-peligro)" }}>
            {error}
          </span>
        )}
      </div>
    </section>
  );
}
