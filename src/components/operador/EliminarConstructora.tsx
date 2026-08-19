"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, LoaderCircle, Trash2 } from "lucide-react";

import { accionEliminarConstructora } from "@/app/(dashboard)/operador/acciones";

/**
 * Eliminar DEFINITIVAMENTE una constructora entera.
 *
 * Es el borrado de una obra multiplicado por todas sus obras, mas su gente,
 * sus proveedores y sus archivos. Sigue el patron de la casa para lo
 * irreversible —dos pasos, formulario, razon social tecleada y contrasena—,
 * el mismo de `EliminarObraCerrada`.
 *
 * Nada de esto MANDA: el servicio lo vuelve a comprobar todo, y ademas exige
 * dos cosas que esta pantalla no puede abrir —la empresa congelada y una
 * exportacion reciente—. Lo que si hace la pantalla es DECIRLAS antes, para
 * que nadie teclee su contrasena para nada.
 */
export function EliminarConstructora({
  empresaId,
  razonSocial,
  obras,
  usuarios,
  motivoQueLoImpide,
}: {
  empresaId: string;
  razonSocial: string;
  obras: number;
  usuarios: number;
  /// Por que no se puede todavia, dicho por el SERVICIO. `null` = se puede.
  motivoQueLoImpide: string | null;
}) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [escrita, setEscrita] = useState("");
  const [clave, setClave] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pendiente, iniciar] = useTransition();

  function borrar() {
    setError(null);
    iniciar(async () => {
      const r = await accionEliminarConstructora(empresaId, {
        razonSocialEscrita: escrita,
        clave,
      });
      if (r.ok) router.push("/operador");
      else setError(r.error);
    });
  }

  if (!abierto) {
    return (
      <div>
        <button
          type="button"
          onClick={() => setAbierto(true)}
          className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs"
          style={{
            borderColor: "var(--color-peligro)",
            color: "var(--color-peligro)",
          }}
        >
          <Trash2 className="size-3.5" aria-hidden="true" />
          Eliminar esta constructora definitivamente
        </button>
      </div>
    );
  }

  return (
    <div
      className="space-y-3 rounded-lg border p-4"
      style={{ borderColor: "var(--color-peligro)" }}
    >
      <p className="text-sm text-pretty">
        Se elimina <strong>{razonSocial}</strong> con todo lo suyo:{" "}
        <strong>{obras} obra(s)</strong> con su presupuesto, cronograma,
        avances, órdenes, encargos y pagos; sus <strong>{usuarios}</strong>{" "}
        usuario(s); sus proveedores; y sus fotos y comprobantes del disco.{" "}
        <strong>No se puede deshacer.</strong>
      </p>

      <p className="text-sm opacity-80 text-pretty">
        Después solo quedará el archivo de migración que se haya descargado, y
        la constancia de que fuiste tú quien la borró: la auditoría, los
        recibos de sus respaldos y el de su exportación sobreviven a propósito.
      </p>

      {/* El motivo del SERVICIO, no una version parecida escrita aqui. */}
      {motivoQueLoImpide ? (
        <p
          className="flex items-start gap-2 text-sm"
          style={{ color: "var(--color-alerta)" }}
        >
          <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <span className="text-pretty">{motivoQueLoImpide}</span>
        </p>
      ) : (
        <>
          <label className="block text-xs">
            <span className="opacity-70">
              Escribe la razón social exacta para confirmar
            </span>
            <input
              value={escrita}
              onChange={(e) => setEscrita(e.target.value)}
              placeholder={razonSocial}
              autoComplete="off"
              className="mt-1 w-full rounded-lg border px-2.5 py-2 text-sm"
              style={{
                borderColor: "var(--borde)",
                backgroundColor: "var(--fondo)",
              }}
            />
          </label>

          <label className="block text-xs">
            <span className="opacity-70">Tu contraseña</span>
            <input
              value={clave}
              onChange={(e) => setClave(e.target.value)}
              type="password"
              autoComplete="current-password"
              className="mt-1 w-full max-w-sm rounded-lg border px-2.5 py-2 text-sm"
              style={{
                borderColor: "var(--borde)",
                backgroundColor: "var(--fondo)",
              }}
            />
          </label>
        </>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={borrar}
          disabled={
            pendiente ||
            motivoQueLoImpide !== null ||
            escrita.trim() === "" ||
            clave === ""
          }
          className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
          style={{ backgroundColor: "var(--color-peligro)" }}
        >
          {pendiente && (
            <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
          )}
          Eliminar definitivamente
        </button>
        <button
          type="button"
          onClick={() => {
            setAbierto(false);
            setEscrita("");
            setClave("");
            setError(null);
          }}
          className="text-sm opacity-70 underline"
        >
          Cancelar
        </button>
        {error && (
          <span className="text-sm" style={{ color: "var(--color-peligro)" }}>
            {error}
          </span>
        )}
      </div>
    </div>
  );
}
