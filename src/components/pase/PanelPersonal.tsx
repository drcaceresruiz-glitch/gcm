"use client";

import { useState, useTransition } from "react";
import {
  Ban,
  Camera,
  KeyRound,
  LoaderCircle,
  RotateCcw,
  UserPlus,
} from "lucide-react";
import {
  accionCrearPase,
  accionCambiarEstadoPase,
  accionGenerarCodigo,
} from "@/app/(dashboard)/obras/[id]/personal/acciones";
import type { PaseLista } from "@/services/pase.service";

/**
 * El personal de campo que documenta sin ser usuario de GCM.
 *
 * Aqui se le da de alta, se le revoca y se le genera un codigo para dictarle.
 * Lo que NO hay es borrar: revocar deja sus fotos en pie con su autoria, y esa
 * autoria es justo lo que hace que la evidencia valga algo. Un pase borrado
 * dejaria fotos firmadas por un fantasma.
 */

const VACIO = {
  nombres: "",
  apellidos: "",
  cargo: "",
  empresa: "",
  celular: "",
  email: "",
};

export function PanelPersonal({
  obraId,
  pases,
}: {
  obraId: string;
  pases: PaseLista[];
}) {
  const [form, setForm] = useState(VACIO);
  const [abierto, setAbierto] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendiente, iniciar] = useTransition();

  // El codigo recien generado, para leerlo en voz alta. Vive solo en pantalla
  // y se pierde al recargar: no es un dato que haya que conservar.
  const [codigo, setCodigo] = useState<{ paseId: string; valor: string } | null>(
    null,
  );

  function crear() {
    setError(null);
    iniciar(async () => {
      const r = await accionCrearPase(obraId, form);
      if (r.ok) {
        setForm(VACIO);
        setAbierto(false);
      } else {
        setError(r.error);
      }
    });
  }

  function cambiarEstado(paseId: string, activo: boolean) {
    setError(null);
    iniciar(async () => {
      const r = await accionCambiarEstadoPase(obraId, paseId, activo);
      if (!r.ok) setError(r.error);
      else if (!activo) setCodigo(null);
    });
  }

  function generar(paseId: string) {
    setError(null);
    setCodigo(null);
    iniciar(async () => {
      const r = await accionGenerarCodigo(obraId, paseId);
      if (r.ok && r.codigo) setCodigo({ paseId, valor: r.codigo });
      else if (!r.ok) setError(r.error);
    });
  }

  const campo =
    "w-full rounded-lg border px-3 py-2 text-sm";
  const estiloCampo = {
    borderColor: "var(--borde)",
    backgroundColor: "var(--fondo)",
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold">Personal de campo</h2>
          <p className="mt-0.5 max-w-2xl text-sm opacity-70">
            Quien documenta en obra sin ser usuario de GCM. Se identifica con su
            celular o su correo, recibe un código y solo puede adjuntar fotos de
            esta obra.
          </p>
        </div>

        <button
          type="button"
          onClick={() => setAbierto((v) => !v)}
          aria-expanded={abierto}
          className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-white"
          style={{ backgroundColor: "var(--color-marca-600)" }}
        >
          <UserPlus className="size-4" aria-hidden="true" />
          Dar de alta
        </button>
      </div>

      {abierto && (
        <form
          action={crear}
          className="grid gap-3 rounded-xl border p-4 sm:grid-cols-2"
          style={{
            borderColor: "var(--borde)",
            backgroundColor: "var(--superficie)",
          }}
        >
          <label className="text-sm">
            <span className="mb-1 block opacity-70">Nombres</span>
            <input
              value={form.nombres}
              onChange={(e) => setForm({ ...form, nombres: e.target.value })}
              className={campo}
              style={estiloCampo}
            />
          </label>

          <label className="text-sm">
            <span className="mb-1 block opacity-70">Apellidos</span>
            <input
              value={form.apellidos}
              onChange={(e) => setForm({ ...form, apellidos: e.target.value })}
              className={campo}
              style={estiloCampo}
            />
          </label>

          <label className="text-sm">
            <span className="mb-1 block opacity-70">Cargo (opcional)</span>
            <input
              value={form.cargo}
              onChange={(e) => setForm({ ...form, cargo: e.target.value })}
              placeholder="Maestro de obra, capataz…"
              className={campo}
              style={estiloCampo}
            />
          </label>

          <label className="text-sm">
            <span className="mb-1 block opacity-70">Empresa (opcional)</span>
            <input
              value={form.empresa}
              onChange={(e) => setForm({ ...form, empresa: e.target.value })}
              className={campo}
              style={estiloCampo}
            />
          </label>

          <label className="text-sm">
            <span className="mb-1 block opacity-70">Celular</span>
            <input
              value={form.celular}
              onChange={(e) => setForm({ ...form, celular: e.target.value })}
              inputMode="numeric"
              placeholder="987654321"
              className={campo}
              style={estiloCampo}
            />
          </label>

          <label className="text-sm">
            <span className="mb-1 block opacity-70">Correo</span>
            <input
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              placeholder="nombre@correo.com"
              className={campo}
              style={estiloCampo}
            />
          </label>

          <p className="text-xs opacity-60 sm:col-span-2">
            Hace falta al menos uno de los dos: es por donde recibirá su código.
            Si no tiene ninguno, dale de alta con el celular de quien esté con
            él, o genérale el código aquí y díctaselo.
          </p>

          <div className="sm:col-span-2">
            <button
              type="submit"
              disabled={pendiente}
              className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
              style={{ backgroundColor: "var(--color-marca-600)" }}
            >
              {pendiente && (
                <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
              )}
              Guardar
            </button>
          </div>
        </form>
      )}

      {error && (
        <p role="alert" className="text-sm" style={{ color: "var(--color-peligro)" }}>
          {error}
        </p>
      )}

      {pases.length === 0 ? (
        <p className="text-sm opacity-70">
          Todavía no hay nadie con pase en esta obra. Quien tenga uno podrá
          escanear el código QR de la caseta y subir fotos desde su teléfono.
        </p>
      ) : (
        <ul className="space-y-2">
          {pases.map((p) => (
            <li
              key={p.id}
              className="rounded-lg border p-3"
              style={{
                borderColor: "var(--borde)",
                backgroundColor: "var(--superficie)",
                opacity: p.activo ? 1 : 0.6,
              }}
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium">
                    {p.nombres} {p.apellidos}
                    {!p.activo && (
                      <span className="ml-2 text-xs font-normal opacity-70">
                        · revocado
                      </span>
                    )}
                  </p>
                  <p className="text-xs opacity-70">
                    {[p.cargo, p.empresa].filter(Boolean).join(" · ") ||
                      "Sin cargo"}
                  </p>
                  <p className="mt-0.5 text-xs opacity-60">
                    {[p.celular, p.email].filter(Boolean).join(" · ")}
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {/* Las fotos aportadas son lo que dice si el pase sirve de
                      algo: sin esto, la lista es una guía de teléfonos. */}
                  <span
                    className="inline-flex items-center gap-1 text-xs tabular-nums opacity-70"
                    title={`${p.fotos} foto(s) aportadas`}
                  >
                    <Camera className="size-3.5" aria-hidden="true" />
                    {p.fotos}
                  </span>

                  {p.conAcceso && (
                    <span className="text-xs opacity-70">teléfono activo</span>
                  )}

                  {p.activo && (
                    <button
                      type="button"
                      onClick={() => generar(p.id)}
                      disabled={pendiente}
                      className="inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs disabled:opacity-60"
                      style={{ borderColor: "var(--borde)" }}
                    >
                      <KeyRound className="size-3.5" aria-hidden="true" />
                      Generar código
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => cambiarEstado(p.id, !p.activo)}
                    disabled={pendiente}
                    className="inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs disabled:opacity-60"
                    style={{ borderColor: "var(--borde)" }}
                  >
                    {p.activo ? (
                      <>
                        <Ban className="size-3.5" aria-hidden="true" />
                        Revocar
                      </>
                    ) : (
                      <>
                        <RotateCcw className="size-3.5" aria-hidden="true" />
                        Reactivar
                      </>
                    )}
                  </button>
                </div>
              </div>

              {codigo?.paseId === p.id && (
                <p
                  className="mt-3 rounded-lg p-3 text-sm"
                  style={{
                    backgroundColor:
                      "color-mix(in oklab, var(--color-marca-500) 12%, transparent)",
                  }}
                >
                  Código para dictarle:{" "}
                  <strong className="text-lg tracking-[0.3em] tabular-nums">
                    {codigo.valor}
                  </strong>
                  <span className="mt-1 block text-xs opacity-70">
                    Caduca en unos minutos y solo sirve una vez. También se le
                    envió por SMS y correo, si los tiene.
                  </span>
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
