"use client";

import { useState, useTransition } from "react";
import { BellRing, Plus, Trash2, TriangleAlert, UserPlus } from "lucide-react";
import { Tarjeta, SeccionTarjeta } from "@/components/ui/Tarjeta";
import { Chip } from "@/components/ui/Chip";
import { FLUJOS_RESTRICCION } from "@/lib/lookahead";
import {
  accionGuardarAjustes,
  accionGuardarSuscripcion,
  accionBorrarSuscripcion,
  accionAltaContacto,
  accionBajaContacto,
} from "@/app/(dashboard)/obras/[id]/personal/acciones-avisos";
import type { ImplicadosObra, SuscripcionVista } from "@/services/avisos.service";
import type { CanalAviso, Role, TipoRestriccion } from "@/generated/prisma/enums";

/**
 * A quien se avisa de las restricciones de esta obra.
 *
 * Vive en la pantalla de Personal y no en una pestana propia porque es la
 * misma pregunta: quien es quien en esta obra. Alli estan los que suben fotos;
 * aqui, los que tienen que enterarse de lo que falta.
 *
 * Regla de la casa para un panel de ajustes: cada opcion dice a que afecta y
 * que se rompe si se apaga. Un panel que solo enumera interruptores obliga a
 * probar para entender.
 */

const ETIQUETA_CANAL: Record<CanalAviso, string> = {
  APP: "GCM",
  CORREO: "correo",
  SMS: "SMS",
};

const ETIQUETA_FLUJO = new Map(
  FLUJOS_RESTRICCION.map((f) => [f.tipo, f.etiqueta]),
);

const MOMENTOS = [
  { clave: "alAbrir", etiqueta: "Al abrirse" },
  { clave: "alRecordar", etiqueta: "Recordatorio" },
  { clave: "alQuedarLista", etiqueta: "Al quedar lista" },
  { clave: "enResumen", etiqueta: "Resumen diario" },
] as const;

type Resultado = { ok: boolean; error?: string };
type Correr = (accion: () => Promise<Resultado>) => void;

export function PanelAvisos({
  obraId,
  datos,
}: {
  obraId: string;
  datos: ImplicadosObra;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pendiente, iniciar] = useTransition();
  const { puedeConfigurar } = datos;

  const correr: Correr = (accion) => {
    setError(null);
    iniciar(async () => {
      const r = await accion();
      if (!r.ok) setError(r.error ?? "No se pudo guardar.");
    });
  };

  const sinCubrir = datos.porFlujo.filter((f) => f.destinatarios === 0);

  return (
    <Tarjeta>
      <SeccionTarjeta
        primera
        titulo="Avisos de restricciones"
        nota="Quién se entera de que a una tarea le falta algo, y por dónde. Lo que no se avisa a tiempo termina siendo un compromiso incumplido."
      >
        {error && (
          <p
            className="rounded-lg border px-3 py-2 text-sm"
            style={{ borderColor: "var(--color-peligro)" }}
          >
            {error}
          </p>
        )}

        {/* Lo primero que hay que ver: un flujo sin nadie detras es una
            restriccion que se abre y de la que no se entera nadie. */}
        {sinCubrir.length > 0 && (
          <p
            className="flex items-start gap-2 rounded-lg border px-3 py-2 text-sm"
            style={{ borderColor: "var(--color-alerta)" }}
          >
            <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <span>
              Nadie recibe avisos de{" "}
              <strong>{sinCubrir.map((f) => f.etiqueta).join(", ")}</strong>. Si
              se abre una restricción de esos flujos, no se enterará nadie.
            </span>
          </p>
        )}

        <Ajustes
          obraId={obraId}
          ajustes={datos.ajustes}
          puedeConfigurar={puedeConfigurar}
          pendiente={pendiente}
          onCorrer={correr}
        />
      </SeccionTarjeta>

      <SeccionTarjeta
        titulo="Personas de la obra"
        nota="Las que ya tienen cuenta en GCM. El aviso dentro de la aplicación solo les llega a ellas."
      >
        {datos.usuarios.length === 0 ? (
          <p className="text-sm opacity-70">
            Esta obra no tiene a nadie asignado todavía.
          </p>
        ) : (
          <ul className="space-y-3">
            {datos.usuarios.map((p) => (
              <FilaDestinatario
                key={p.clave}
                obraId={obraId}
                nombre={p.nombre}
                detalle={p.detalle}
                suscripciones={p.suscripciones}
                efectivo={p.efectivo}
                sujeto={{ userId: p.id }}
                puedeConfigurar={puedeConfigurar}
                pendiente={pendiente}
                onCorrer={correr}
                avisoContacto={
                  !p.celularUtil && p.celular
                    ? "Su celular no está verificado: lo que pidas por SMS le llegará por correo."
                    : null
                }
              />
            ))}
          </ul>
        )}
      </SeccionTarjeta>

      <SeccionTarjeta
        titulo="Por cargo"
        nota="El aviso sigue al puesto y no a la persona: si cambias de residente, lo recibe el nuevo sin tocar nada."
      >
        <ul className="space-y-3">
          {datos.roles.map((r) => (
            <FilaDestinatario
              key={r.rol}
              obraId={obraId}
              nombre={r.etiqueta}
              detalle={
                r.cuantos === 1
                  ? "1 persona en esta obra"
                  : `${r.cuantos} personas en esta obra`
              }
              suscripciones={r.suscripciones}
              efectivo={null}
              sujeto={{ rol: r.rol }}
              puedeConfigurar={puedeConfigurar}
              pendiente={pendiente}
              onCorrer={correr}
              avisoContacto={
                r.cuantos === 0
                  ? "Nadie tiene este cargo en la obra: por ahora no le llega a nadie."
                  : null
              }
            />
          ))}
        </ul>
      </SeccionTarjeta>

      <SeccionTarjeta
        titulo="Gente de fuera"
        nota="El proveedor que trae el fierro, el proyectista que responde la RFI. Reciben avisos pero NO entran en GCM."
      >
        <AltaContacto
          obraId={obraId}
          puedeConfigurar={puedeConfigurar}
          pendiente={pendiente}
          onCorrer={correr}
        />

        {datos.externos.length === 0 ? (
          <p className="text-sm opacity-70">
            Todavía no hay nadie de fuera en la lista.
          </p>
        ) : (
          <ul className="space-y-3">
            {datos.externos.map((p) => (
              <FilaDestinatario
                key={p.clave}
                obraId={obraId}
                nombre={p.nombre}
                detalle={p.detalle}
                suscripciones={p.suscripciones}
                efectivo={p.efectivo}
                sujeto={{ contactoId: p.id }}
                puedeConfigurar={puedeConfigurar}
                pendiente={pendiente}
                onCorrer={correr}
                avisoContacto={null}
                onBaja={() => correr(() => accionBajaContacto(obraId, p.id))}
              />
            ))}
          </ul>
        )}
      </SeccionTarjeta>
    </Tarjeta>
  );
}

// ---------------------------------------------------------------------------

function Ajustes({
  obraId,
  ajustes,
  puedeConfigurar,
  pendiente,
  onCorrer,
}: {
  obraId: string;
  ajustes: ImplicadosObra["ajustes"];
  puedeConfigurar: boolean;
  pendiente: boolean;
  onCorrer: Correr;
}) {
  const [v, setV] = useState(ajustes);

  return (
    <div className="rounded-lg border p-3" style={{ borderColor: "var(--borde)" }}>
      <label className="flex items-start gap-2.5 text-sm">
        <input
          type="checkbox"
          checked={v.activo}
          disabled={!puedeConfigurar}
          onChange={(e) => setV({ ...v, activo: e.target.checked })}
          className="mt-0.5 size-4"
          style={{ accentColor: "var(--color-marca-600)" }}
        />
        <span>
          <strong>Avisar de las restricciones de esta obra</strong>
          <span className="block text-xs opacity-70">
            Apagado, la configuración se conserva pero no sale ningún aviso.
          </span>
        </span>
      </label>

      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        <Numero
          etiqueta="Insistir cada"
          sufijo="días"
          valor={v.diasRecordatorio}
          min={1}
          max={30}
          nota="Cada N días, no todos los días: un recordatorio diario se ignora a la semana."
          disabled={!puedeConfigurar}
          onChange={(n) => setV({ ...v, diasRecordatorio: n })}
        />
        <Numero
          etiqueta="Resumen a las"
          sufijo="h"
          valor={v.horaResumen}
          min={0}
          max={23}
          nota="Hora de Perú. Un repaso al día de todo lo que sigue esperando."
          disabled={!puedeConfigurar}
          onChange={(n) => setV({ ...v, horaResumen: n })}
        />
        <Numero
          etiqueta="Tope de SMS al día"
          sufijo=""
          valor={v.maxSmsDia}
          min={0}
          max={100}
          nota="El SMS sale de la SIM de la empresa y se paga. Pasado el tope, el aviso llega por correo."
          disabled={!puedeConfigurar}
          onChange={(n) => setV({ ...v, maxSmsDia: n })}
        />
      </div>

      {puedeConfigurar && (
        <button
          type="button"
          disabled={pendiente}
          onClick={() => onCorrer(() => accionGuardarAjustes(obraId, v))}
          className="mt-3 rounded-lg px-3 py-1.5 text-sm font-medium text-white disabled:opacity-60"
          style={{ backgroundColor: "var(--color-marca-600)" }}
        >
          Guardar ajustes
        </button>
      )}
    </div>
  );
}

function Numero({
  etiqueta,
  sufijo,
  valor,
  min,
  max,
  nota,
  disabled,
  onChange,
}: {
  etiqueta: string;
  sufijo: string;
  valor: number;
  min: number;
  max: number;
  nota: string;
  disabled: boolean;
  onChange: (n: number) => void;
}) {
  return (
    <label className="block text-xs">
      <span className="block opacity-70">{etiqueta}</span>
      <span className="mt-1 flex items-center gap-1.5">
        <input
          type="number"
          value={valor}
          min={min}
          max={max}
          disabled={disabled}
          onChange={(e) => onChange(Number(e.target.value))}
          className="w-20 rounded-lg border px-2 py-1.5 text-sm tabular-nums"
          style={{ borderColor: "var(--borde)", backgroundColor: "var(--fondo)" }}
        />
        {sufijo && <span className="opacity-70">{sufijo}</span>}
      </span>
      <span className="mt-1 block opacity-60">{nota}</span>
    </label>
  );
}

// ---------------------------------------------------------------------------

type Sujeto = { userId: string } | { rol: Role } | { contactoId: string };

function FilaDestinatario({
  obraId,
  nombre,
  detalle,
  suscripciones,
  efectivo,
  sujeto,
  puedeConfigurar,
  pendiente,
  onCorrer,
  avisoContacto,
  onBaja,
}: {
  obraId: string;
  nombre: string;
  detalle: string | null;
  suscripciones: SuscripcionVista[];
  /// Null cuando el sujeto es un cargo: depende de cada persona que lo tenga.
  efectivo: { canales: CanalAviso[]; sinCanal: boolean } | null;
  sujeto: Sujeto;
  puedeConfigurar: boolean;
  pendiente: boolean;
  onCorrer: Correr;
  avisoContacto: string | null;
  onBaja?: () => void;
}) {
  const [abierto, setAbierto] = useState(false);

  return (
    <li className="rounded-lg border p-3" style={{ borderColor: "var(--borde)" }}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-medium">{nombre}</p>
          {detalle && <p className="text-xs opacity-70">{detalle}</p>}
          {avisoContacto && (
            <p className="mt-1 text-xs" style={{ color: "var(--color-alerta)" }}>
              {avisoContacto}
            </p>
          )}
        </div>

        <div className="flex items-center gap-2">
          {/* Lo que RECIBE de verdad, no lo que se pidio. */}
          {efectivo &&
            suscripciones.length > 0 &&
            (efectivo.sinCanal ? (
              <Chip tono="peligro">No le llega nada</Chip>
            ) : (
              <span className="text-xs opacity-70">
                Le llega por{" "}
                {efectivo.canales.map((c) => ETIQUETA_CANAL[c]).join(", ")}
              </span>
            ))}
          {onBaja && puedeConfigurar && (
            <button
              type="button"
              onClick={onBaja}
              disabled={pendiente}
              aria-label={`Dar de baja a ${nombre}`}
              className="rounded p-1 opacity-60 hover:opacity-100 disabled:opacity-40"
            >
              <Trash2 className="size-4" aria-hidden="true" />
            </button>
          )}
        </div>
      </div>

      {suscripciones.length > 0 && (
        <ul className="mt-2 space-y-1">
          {suscripciones.map((s) => (
            <li
              key={s.id}
              className="flex flex-wrap items-center gap-2 text-xs opacity-80"
            >
              <BellRing
                className="size-3.5 shrink-0 opacity-60"
                aria-hidden="true"
              />
              <span>
                {s.tipo === null
                  ? "Todos los flujos"
                  : (ETIQUETA_FLUJO.get(s.tipo) ?? s.tipo)}
              </span>
              <span className="opacity-60">·</span>
              <span>{canalesDe(s).join(", ")}</span>
              <span className="opacity-60">·</span>
              <span>{momentosDe(s).join(", ")}</span>
              {puedeConfigurar && (
                <button
                  type="button"
                  disabled={pendiente}
                  onClick={() =>
                    onCorrer(() => accionBorrarSuscripcion(obraId, s.id))
                  }
                  className="underline opacity-70 hover:opacity-100"
                >
                  quitar
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {puedeConfigurar && (
        <>
          <button
            type="button"
            onClick={() => setAbierto((p) => !p)}
            className="mt-2 inline-flex items-center gap-1.5 text-xs font-medium underline"
          >
            <Plus className="size-3.5" aria-hidden="true" />
            {abierto ? "Cancelar" : "Añadir un aviso"}
          </button>

          {abierto && (
            <FormularioSuscripcion
              obraId={obraId}
              sujeto={sujeto}
              pendiente={pendiente}
              onCorrer={onCorrer}
              onHecho={() => setAbierto(false)}
            />
          )}
        </>
      )}
    </li>
  );
}

function canalesDe(s: SuscripcionVista): string[] {
  const salida: string[] = [];
  if (s.canales.app) salida.push("en GCM");
  if (s.canales.correo) salida.push("correo");
  if (s.canales.sms) salida.push("SMS");
  return salida;
}

function momentosDe(s: SuscripcionVista): string[] {
  return MOMENTOS.filter((m) => s.momentos[m.clave]).map((m) => m.etiqueta);
}

// ---------------------------------------------------------------------------

function FormularioSuscripcion({
  obraId,
  sujeto,
  pendiente,
  onCorrer,
  onHecho,
}: {
  obraId: string;
  sujeto: Sujeto;
  pendiente: boolean;
  onCorrer: Correr;
  onHecho: () => void;
}) {
  const [tipo, setTipo] = useState<TipoRestriccion | "">("");
  const [canales, setCanales] = useState({ app: true, correo: true, sms: false });
  const [momentos, setMomentos] = useState({
    alAbrir: true,
    alRecordar: true,
    alQuedarLista: false,
    enResumen: true,
  });

  return (
    <div
      className="mt-2 space-y-3 rounded-lg border p-3"
      style={{ borderColor: "var(--borde)", backgroundColor: "var(--fondo)" }}
    >
      <label className="block text-xs">
        <span className="block opacity-70">De qué se le avisa</span>
        <select
          value={tipo}
          onChange={(e) => setTipo(e.target.value as TipoRestriccion | "")}
          className="mt-1 w-full max-w-sm rounded-lg border px-2 py-1.5 text-sm"
          style={{ borderColor: "var(--borde)", backgroundColor: "var(--fondo)" }}
        >
          <option value="">Todos los flujos</option>
          {FLUJOS_RESTRICCION.map((f) => (
            <option key={f.tipo} value={f.tipo}>
              {f.etiqueta} — {f.descripcion}
            </option>
          ))}
        </select>
      </label>

      <fieldset className="text-xs">
        <legend className="opacity-70">Por dónde</legend>
        <div className="mt-1 flex flex-wrap gap-4">
          <Casilla
            etiqueta="Dentro de GCM"
            valor={canales.app}
            onChange={(v) => setCanales({ ...canales, app: v })}
          />
          <Casilla
            etiqueta="Correo"
            valor={canales.correo}
            onChange={(v) => setCanales({ ...canales, correo: v })}
          />
          <Casilla
            etiqueta="SMS"
            valor={canales.sms}
            onChange={(v) => setCanales({ ...canales, sms: v })}
          />
        </div>
        {canales.sms && (
          <p className="mt-1 opacity-60">
            El SMS sale de la SIM de la empresa y se paga. Si se pasa del tope
            del día, el aviso llega por correo en vez de perderse.
          </p>
        )}
      </fieldset>

      <fieldset className="text-xs">
        <legend className="opacity-70">Cuándo</legend>
        <div className="mt-1 flex flex-wrap gap-4">
          {MOMENTOS.map((m) => (
            <Casilla
              key={m.clave}
              etiqueta={m.etiqueta}
              valor={momentos[m.clave]}
              onChange={(v) => setMomentos({ ...momentos, [m.clave]: v })}
            />
          ))}
        </div>
      </fieldset>

      <button
        type="button"
        disabled={pendiente}
        onClick={() =>
          onCorrer(async () => {
            const r = await accionGuardarSuscripcion(obraId, {
              ...sujeto,
              tipo: tipo === "" ? null : tipo,
              canales,
              momentos,
            });
            if (r.ok) onHecho();
            return r;
          })
        }
        className="rounded-lg px-3 py-1.5 text-sm font-medium text-white disabled:opacity-60"
        style={{ backgroundColor: "var(--color-marca-600)" }}
      >
        Añadir
      </button>
    </div>
  );
}

function Casilla({
  etiqueta,
  valor,
  onChange,
}: {
  etiqueta: string;
  valor: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex items-center gap-2">
      <input
        type="checkbox"
        checked={valor}
        onChange={(e) => onChange(e.target.checked)}
        className="size-4"
        style={{ accentColor: "var(--color-marca-600)" }}
      />
      {etiqueta}
    </label>
  );
}

// ---------------------------------------------------------------------------

function AltaContacto({
  obraId,
  puedeConfigurar,
  pendiente,
  onCorrer,
}: {
  obraId: string;
  puedeConfigurar: boolean;
  pendiente: boolean;
  onCorrer: Correr;
}) {
  const vacio = { nombre: "", empresa: "", cargo: "", celular: "", email: "" };
  const [abierto, setAbierto] = useState(false);
  const [d, setD] = useState(vacio);

  if (!puedeConfigurar) return null;

  if (!abierto) {
    return (
      <button
        type="button"
        onClick={() => setAbierto(true)}
        className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium"
        style={{ borderColor: "var(--borde)" }}
      >
        <UserPlus className="size-4" aria-hidden="true" />
        Añadir a alguien de fuera
      </button>
    );
  }

  return (
    <div
      className="space-y-3 rounded-lg border p-3"
      style={{ borderColor: "var(--borde)", backgroundColor: "var(--fondo)" }}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Campo
          etiqueta="Nombre"
          valor={d.nombre}
          onChange={(v) => setD({ ...d, nombre: v })}
        />
        <Campo
          etiqueta="Empresa"
          valor={d.empresa}
          onChange={(v) => setD({ ...d, empresa: v })}
        />
        <Campo
          etiqueta="Cargo"
          valor={d.cargo}
          onChange={(v) => setD({ ...d, cargo: v })}
        />
        <Campo
          etiqueta="Correo"
          valor={d.email}
          onChange={(v) => setD({ ...d, email: v })}
        />
        <Campo
          etiqueta="Celular"
          valor={d.celular}
          onChange={(v) => setD({ ...d, celular: v })}
        />
      </div>

      <p className="text-xs opacity-70">
        Hace falta <strong>al menos un correo o un celular</strong>: es por donde
        recibirá los avisos. Recibir no es entrar: esta persona no tendrá acceso
        a GCM ni verá nada más de la obra.
      </p>

      <div className="flex items-center gap-3">
        <button
          type="button"
          disabled={pendiente}
          onClick={() =>
            onCorrer(async () => {
              const r = await accionAltaContacto(obraId, d);
              if (r.ok) {
                setD(vacio);
                setAbierto(false);
              }
              return r;
            })
          }
          className="rounded-lg px-3 py-1.5 text-sm font-medium text-white disabled:opacity-60"
          style={{ backgroundColor: "var(--color-marca-600)" }}
        >
          Añadir
        </button>
        <button
          type="button"
          onClick={() => setAbierto(false)}
          className="text-sm opacity-70 underline"
        >
          Cancelar
        </button>
      </div>
    </div>
  );
}

function Campo({
  etiqueta,
  valor,
  onChange,
}: {
  etiqueta: string;
  valor: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="block text-xs">
      <span className="block opacity-70">{etiqueta}</span>
      <input
        value={valor}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full rounded-lg border px-2 py-1.5 text-sm"
        style={{ borderColor: "var(--borde)", backgroundColor: "var(--fondo)" }}
      />
    </label>
  );
}
