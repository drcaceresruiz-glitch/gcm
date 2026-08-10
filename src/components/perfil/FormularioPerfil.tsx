"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { AlertCircle, CheckCircle2, Clock, LoaderCircle } from "lucide-react";
import {
  accionGuardarCelular,
  accionSolicitarCambio,
  accionCancelarSolicitud,
  type EstadoPerfil,
} from "@/app/(dashboard)/perfil/acciones";
import type { Perfil } from "@/services/perfil.service";
import { TIPOS_DOC, ETIQUETA_TIPO_DOC } from "@/lib/perfil";
import { CampoTexto } from "@/components/auth/CampoTexto";
import { Tarjeta, SeccionTarjeta } from "@/components/ui/Tarjeta";
import { FotoPerfil } from "@/components/perfil/FotoPerfil";

/**
 * El perfil de la persona, en tres bloques con reglas distintas:
 *
 *  - Telefono: se guarda directo.
 *  - Identidad (nombres, apellidos, cargo, documento): se SOLICITA; un ADMIN
 *    aprueba. Mientras hay una solicitud viva, los campos se bloquean y se
 *    muestra su estado con un boton para retirarla.
 *  - Solo lectura: correo, rol y la empresa. No se tocan desde aqui.
 */
export function FormularioPerfil({ perfil }: { perfil: Perfil }) {
  const hayPendiente = perfil.pendiente !== null;

  return (
    <div className="max-w-2xl space-y-6">
      <Tarjeta>
        <SeccionTarjeta
          titulo="Foto"
          nota="Opcional. Es lo único, junto al teléfono, que se guarda al instante."
          primera
        >
          <FotoPerfil
            nombre={`${perfil.nombres} ${perfil.apellidos}`.trim()}
            fotoActual={perfil.fotoPerfil}
          />
        </SeccionTarjeta>
      </Tarjeta>

      <BloqueTelefono celular={perfil.celular} />

      {hayPendiente ? (
        <SolicitudPendiente perfil={perfil} />
      ) : (
        <BloqueIdentidad perfil={perfil} />
      )}

      <BloqueSoloLectura perfil={perfil} />
    </div>
  );
}

// --- Telefono: libre --------------------------------------------------------

function BloqueTelefono({ celular }: { celular: string | null }) {
  const [estado, accion] = useActionState<EstadoPerfil, FormData>(
    accionGuardarCelular,
    {},
  );

  return (
    <form action={accion}>
      <Tarjeta>
        <SeccionTarjeta
          titulo="Teléfono"
          nota="Es el único dato que se guarda al instante, sin aprobación."
          primera
        >
          <CampoTexto
            id="celular"
            name="celular"
            etiqueta="Celular"
            type="tel"
            defaultValue={celular ?? ""}
            maxLength={30}
          />
        </SeccionTarjeta>

        <Avisos estado={estado} />

        <div className="mt-6 border-t pt-5" style={{ borderColor: "var(--borde)" }}>
          <Boton>Guardar teléfono</Boton>
        </div>
      </Tarjeta>
    </form>
  );
}

// --- Identidad: requiere aprobacion ----------------------------------------

function BloqueIdentidad({ perfil }: { perfil: Perfil }) {
  const [estado, accion] = useActionState<EstadoPerfil, FormData>(
    accionSolicitarCambio,
    {},
  );

  return (
    <form action={accion}>
      <Tarjeta>
        <SeccionTarjeta
          titulo="Datos de identidad"
          nota="Cambiarlos requiere que un administrador lo apruebe: son los que quedan escritos en las órdenes y movimientos que ya firmaste."
          primera
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <CampoTexto
              id="nombres"
              name="nombres"
              etiqueta="Nombres"
              defaultValue={perfil.nombres}
              maxLength={100}
            />
            <CampoTexto
              id="apellidos"
              name="apellidos"
              etiqueta="Apellidos"
              defaultValue={perfil.apellidos}
              maxLength={100}
            />
          </div>

          <CampoTexto
            id="cargo"
            name="cargo"
            etiqueta="Cargo"
            ayuda="Puede quedar vacío."
            defaultValue={perfil.cargo ?? ""}
            maxLength={100}
          />

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label htmlFor="tipoDoc" className="block text-sm font-medium">
                Tipo de documento
              </label>
              <select
                id="tipoDoc"
                name="tipoDoc"
                defaultValue={perfil.tipoDoc}
                className="w-full rounded-lg border px-3 py-2 text-sm outline-none"
                style={{ borderColor: "var(--borde)", backgroundColor: "var(--fondo)" }}
              >
                {/* Si el valor actual no es uno de los conocidos, se ofrece
                    igual para no perderlo al abrir el desplegable. */}
                {!TIPOS_DOC.includes(perfil.tipoDoc as (typeof TIPOS_DOC)[number]) && (
                  <option value={perfil.tipoDoc}>{perfil.tipoDoc}</option>
                )}
                {TIPOS_DOC.map((t) => (
                  <option key={t} value={t}>
                    {ETIQUETA_TIPO_DOC[t]}
                  </option>
                ))}
              </select>
            </div>

            <CampoTexto
              id="numDoc"
              name="numDoc"
              etiqueta="Número de documento"
              defaultValue={perfil.numDoc}
              maxLength={20}
            />
          </div>

          <div className="space-y-1.5">
            <label htmlFor="motivo" className="block text-sm font-medium">
              Motivo <span className="font-normal opacity-60">(opcional)</span>
            </label>
            <textarea
              id="motivo"
              name="motivo"
              rows={3}
              placeholder="Por qué pides el cambio. Ayuda a quien lo aprueba."
              className="w-full rounded-lg border px-3 py-2 text-sm outline-none"
              style={{ borderColor: "var(--borde)", backgroundColor: "var(--fondo)" }}
            />
          </div>
        </SeccionTarjeta>

        <Avisos estado={estado} />

        <div className="mt-6 border-t pt-5" style={{ borderColor: "var(--borde)" }}>
          <Boton>Solicitar cambio</Boton>
        </div>
      </Tarjeta>
    </form>
  );
}

// --- Solicitud viva ---------------------------------------------------------

function SolicitudPendiente({ perfil }: { perfil: Perfil }) {
  const [estado, accion] = useActionState<EstadoPerfil, FormData>(
    accionCancelarSolicitud,
    {},
  );

  const p = perfil.pendiente!;

  // Los campos que la solicitud propone, con su valor. El cargo vacio (borrar)
  // se muestra como "(vacio)".
  const propuestos: { etiqueta: string; valor: string }[] = [];
  if (p.nombres !== null) propuestos.push({ etiqueta: "Nombres", valor: p.nombres });
  if (p.apellidos !== null) propuestos.push({ etiqueta: "Apellidos", valor: p.apellidos });
  if (p.cargo !== null) propuestos.push({ etiqueta: "Cargo", valor: p.cargo === "" ? "(vacío)" : p.cargo });
  if (p.tipoDoc !== null) propuestos.push({ etiqueta: "Tipo de documento", valor: p.tipoDoc });
  if (p.numDoc !== null) propuestos.push({ etiqueta: "Número de documento", valor: p.numDoc });

  return (
    <Tarjeta>
      <SeccionTarjeta titulo="Datos de identidad" primera>
        <div
          className="flex items-start gap-2 rounded-lg px-4 py-3 text-sm"
          style={{
            backgroundColor: "color-mix(in oklab, var(--color-alerta) 15%, transparent)",
          }}
        >
          <Clock className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <div>
            <p className="font-medium">Tienes una solicitud pendiente de aprobación.</p>
            <p className="mt-0.5 opacity-70">
              Tus datos siguen mostrando los valores actuales hasta que un
              administrador la apruebe.
            </p>
          </div>
        </div>

        <dl className="mt-4 space-y-2 text-sm">
          {propuestos.map((c) => (
            <div key={c.etiqueta} className="flex justify-between gap-4">
              <dt className="opacity-70">{c.etiqueta}</dt>
              <dd className="text-right font-medium">{c.valor}</dd>
            </div>
          ))}
          {p.motivo && (
            <div className="border-t pt-2" style={{ borderColor: "var(--borde)" }}>
              <dt className="opacity-70">Motivo</dt>
              <dd className="mt-0.5">{p.motivo}</dd>
            </div>
          )}
        </dl>
      </SeccionTarjeta>

      <Avisos estado={estado} />

      <form
        action={accion}
        className="mt-6 border-t pt-5"
        style={{ borderColor: "var(--borde)" }}
      >
        <input type="hidden" name="id" value={p.id} />
        <BotonSecundario>Retirar solicitud</BotonSecundario>
      </form>
    </Tarjeta>
  );
}

// --- Solo lectura -----------------------------------------------------------

function BloqueSoloLectura({ perfil }: { perfil: Perfil }) {
  return (
    <Tarjeta>
      <SeccionTarjeta
        titulo="Datos que no se editan aquí"
        nota="El correo es tu identificador de acceso; el rol y la empresa los gestiona un administrador."
        primera
      >
        <Dato etiqueta="Correo" valor={perfil.email} />
        <Dato etiqueta="Rol" valor={perfil.role} />
        <Dato etiqueta="Empresa" valor={perfil.razonSocial} />
        <Dato etiqueta="RUC" valor={perfil.ruc} mono />
      </SeccionTarjeta>
    </Tarjeta>
  );
}

function Dato({ etiqueta, valor, mono }: { etiqueta: string; valor: string; mono?: boolean }) {
  return (
    <div className="space-y-1.5">
      <span className="block text-sm font-medium">{etiqueta}</span>
      <p
        className={`rounded-lg border px-3 py-2 text-sm opacity-70 ${mono ? "font-mono" : ""}`}
        style={{ borderColor: "var(--borde)" }}
      >
        {valor}
      </p>
    </div>
  );
}

// --- Compartido -------------------------------------------------------------

function Avisos({ estado }: { estado: EstadoPerfil }) {
  if (estado.error) {
    return (
      <p
        role="alert"
        className="mt-6 flex items-start gap-2 rounded-lg px-4 py-3 text-sm"
        style={{ backgroundColor: "color-mix(in oklab, var(--color-peligro) 15%, transparent)" }}
      >
        <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
        <span>{estado.error}</span>
      </p>
    );
  }
  if (estado.ok) {
    return (
      <p
        role="status"
        className="mt-6 flex items-start gap-2 rounded-lg px-4 py-3 text-sm"
        style={{ backgroundColor: "color-mix(in oklab, var(--color-exito) 15%, transparent)" }}
      >
        <CheckCircle2 className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
        <span>{estado.ok}</span>
      </p>
    );
  }
  return null;
}

function Boton({ children }: { children: React.ReactNode }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
      style={{ backgroundColor: "var(--color-marca-600)" }}
    >
      {pending && <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />}
      {children}
    </button>
  );
}

function BotonSecundario({ children }: { children: React.ReactNode }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex items-center gap-2 rounded-lg border px-4 py-2 text-sm font-medium disabled:opacity-60"
      style={{ borderColor: "var(--borde)" }}
    >
      {pending && <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />}
      {children}
    </button>
  );
}
