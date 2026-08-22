"use client";

import { useActionState, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import {
  AlertCircle,
  CheckCircle2,
  ExternalLink,
  LoaderCircle,
  Bot,
  Search,
  Send,
  Star,
  Trash2,
} from "lucide-react";

import { Tarjeta, SeccionTarjeta } from "@/components/ui/Tarjeta";
import { haceCuanto } from "@/utils/fechas";
import { SERVICIOS_IA_CONOCIDOS } from "@/lib/proveedor-ia";
import {
  accionGuardarProveedorIa,
  accionProbarProveedorIa,
  accionActivarProveedorIa,
  accionEliminarProveedorIa,
  accionDetectarModelos,
  type EstadoProveedorIa,
} from "@/app/(dashboard)/empresa/configuracion/ia/acciones-ia";
import type { ProveedorIaResumen } from "@/services/agente-ia.service";

/**
 * Los proveedores de IA que esta empresa guardo, con su propia clave.
 *
 * SOLO LA INFRAESTRUCTURA DE CREDENCIALES: guardar, probar y elegir cual
 * esta activo. El agente conversacional que las usa todavia no existe —eso
 * es otra entrega—, asi que esta pantalla no promete un chat, solo deja
 * lista y probada de verdad la clave que el agente usara el dia que llegue.
 *
 * LA CLAVE NUNCA VUELVE A LA PANTALLA, mismo criterio que el buzon de
 * correo propio: el campo nace vacio incluso al editar, y vacio significa
 * «conserva la que ya estaba».
 */

function Boton({
  children,
  variante = "principal",
}: {
  children: React.ReactNode;
  variante?: "principal" | "suave" | "peligro";
}) {
  const { pending } = useFormStatus();

  const estilo =
    variante === "principal"
      ? { backgroundColor: "var(--color-marca-600)", color: "white" }
      : variante === "peligro"
        ? { borderColor: "var(--color-peligro)", color: "var(--color-peligro)" }
        : { borderColor: "var(--borde)" };

  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium disabled:opacity-60"
      style={{ border: variante === "principal" ? "none" : "1px solid", ...estilo }}
    >
      {pending && <LoaderCircle className="size-3.5 animate-spin" aria-hidden />}
      {children}
    </button>
  );
}

function Mensaje({ estado }: { estado: EstadoProveedorIa }) {
  if (!estado.error && !estado.ok) return null;

  const malo = Boolean(estado.error);
  return (
    <p
      className="mt-3 flex items-start gap-2 rounded-lg px-3 py-2 text-sm"
      style={{
        backgroundColor: `color-mix(in oklab, ${
          malo ? "var(--color-peligro)" : "var(--color-marca-500)"
        } 14%, transparent)`,
      }}
    >
      {malo ? (
        <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
      ) : (
        <CheckCircle2 className="mt-0.5 size-4 shrink-0" aria-hidden />
      )}
      <span className="text-pretty">{estado.error ?? estado.ok}</span>
    </p>
  );
}

function EstadoPrueba({ proveedor }: { proveedor: ProveedorIaResumen }) {
  if (proveedor.verificadoAt) {
    return (
      <span style={{ color: "var(--color-exito)" }}>
        Probado {haceCuanto(proveedor.verificadoAt)} y funcionó.
      </span>
    );
  }
  if (proveedor.ultimoError) {
    return (
      <span style={{ color: "var(--color-peligro)" }}>
        Con error
        {proveedor.ultimoErrorAt && ` (${haceCuanto(proveedor.ultimoErrorAt)})`}:{" "}
        {proveedor.ultimoError}
      </span>
    );
  }
  return <span className="opacity-70">Guardado pero sin probar todavía.</span>;
}

function Fila({
  proveedor,
  probar,
  activar,
  eliminar,
}: {
  proveedor: ProveedorIaResumen;
  probar: (datos: FormData) => void;
  activar: (datos: FormData) => void;
  eliminar: (datos: FormData) => void;
}) {
  const [confirmando, setConfirmando] = useState(false);

  return (
    <li
      className="rounded-xl border p-3"
      style={{ borderColor: "var(--borde)" }}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-sm font-medium">
            <Bot className="size-4 shrink-0 opacity-70" aria-hidden />
            {proveedor.nombre}
            {proveedor.activo && (
              <span
                className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium"
                style={{
                  backgroundColor:
                    "color-mix(in oklab, var(--color-marca-500) 16%, transparent)",
                  color: "var(--color-marca-600)",
                }}
              >
                <Star className="size-3" aria-hidden />
                Activo
              </span>
            )}
          </p>
          <p className="mt-1 text-xs opacity-60">
            {proveedor.tipo} · {proveedor.modelo}
            {proveedor.urlBase && ` · ${proveedor.urlBase}`}
          </p>
          <p className="mt-1 text-xs">
            <EstadoPrueba proveedor={proveedor} />
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <form action={probar}>
            <input type="hidden" name="id" value={proveedor.id} />
            <Boton variante="suave">
              <Send className="size-3.5" aria-hidden />
              Probar
            </Boton>
          </form>

          {!proveedor.activo && (
            <form
              action={activar}
              title={
                proveedor.verificadoAt
                  ? undefined
                  : "Pruébalo primero: solo se puede activar un proveedor ya verificado."
              }
            >
              <input type="hidden" name="id" value={proveedor.id} />
              <Boton variante="suave">
                <Star className="size-3.5" aria-hidden />
                Activar
              </Boton>
            </form>
          )}

          {confirmando ? (
            <form action={eliminar} className="flex items-center gap-1.5">
              <input type="hidden" name="id" value={proveedor.id} />
              <span className="text-xs opacity-70">¿Seguro?</span>
              <Boton variante="peligro">Sí, eliminar</Boton>
              <button
                type="button"
                onClick={() => setConfirmando(false)}
                className="rounded-lg border px-2.5 py-1.5 text-xs"
                style={{ borderColor: "var(--borde)" }}
              >
                No
              </button>
            </form>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmando(true)}
              aria-label={`Eliminar ${proveedor.nombre}`}
              className="inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs"
              style={{ borderColor: "var(--borde)" }}
            >
              <Trash2 className="size-3.5" aria-hidden />
              Eliminar
            </button>
          )}
        </div>
      </div>
    </li>
  );
}

function BotonDetectar({
  detectando,
  onClick,
}: {
  detectando: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={detectando}
      className="mt-2 inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium disabled:opacity-60"
      style={{ borderColor: "var(--borde)" }}
    >
      {detectando ? (
        <LoaderCircle className="size-3.5 animate-spin" aria-hidden />
      ) : (
        <Search className="size-3.5" aria-hidden />
      )}
      {detectando ? "Detectando…" : "Detectar modelos"}
    </button>
  );
}

/**
 * El bloque del modelo: por defecto se detecta EN VIVO contra el
 * proveedor -nunca un catalogo fijo dentro de GCM, que se desactualizaria
 * el dia que saquen un modelo nuevo-, con un campo de texto libre como
 * salida de emergencia para lo que la deteccion no cubra (un proveedor sin
 * `/models`, un modelo tan nuevo que el proveedor mismo no lo lista
 * todavia, o un endpoint propio).
 */
function CampoModelo({
  tipo,
  urlBase,
  leerApiKey,
}: {
  tipo: string;
  urlBase: string;
  leerApiKey: () => string;
}) {
  const [modelos, setModelos] = useState<string[] | null>(null);
  const [modeloElegido, setModeloElegido] = useState("");
  const [modoManual, setModoManual] = useState(false);
  const [detectando, setDetectando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function detectar() {
    const apiKey = leerApiKey();
    if (!apiKey) {
      setError("Escribe la clave de API primero.");
      return;
    }
    setDetectando(true);
    setError(null);
    const r = await accionDetectarModelos({ tipo, urlBase, apiKey });
    setDetectando(false);
    if (!r.ok) {
      setError(r.error);
      return;
    }
    setModelos(r.modelos);
    // A proposito NO se preselecciona el primero: la lista de un proveedor
    // puede traer modelos que no sirven para conversar (de imagen, de
    // incrustado, o alguno experimental que solo habla otro protocolo) —
    // preseleccionar cualquiera invita a guardar sin mirar. Que elija.
    setModeloElegido("");
    setModoManual(false);
  }

  const mostrarSelect = modelos !== null && modelos.length > 0 && !modoManual;

  return (
    <label className="text-sm sm:col-span-2">
      <span className="font-medium">Modelo</span>
      {mostrarSelect ? (
        <>
          <select
            name="modelo"
            required
            value={modeloElegido}
            onChange={(e) => setModeloElegido(e.target.value)}
            className="mt-1 w-full rounded-lg border px-3 py-2"
            style={{ borderColor: "var(--borde)" }}
          >
            <option value="" disabled>
              Elige uno — no todos sirven para conversar
            </option>
            {modelos!.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => setModoManual(true)}
            className="mt-1 text-xs underline opacity-70"
          >
            Escribirlo a mano
          </button>
        </>
      ) : (
        <>
          <input
            name="modelo"
            value={modeloElegido}
            onChange={(e) => setModeloElegido(e.target.value)}
            placeholder="claude-sonnet-5"
            className="mt-1 w-full rounded-lg border px-3 py-2"
            style={{ borderColor: "var(--borde)" }}
          />
          {modelos && modelos.length > 0 ? (
            <button
              type="button"
              onClick={() => setModoManual(false)}
              className="mt-2 text-xs underline opacity-70"
            >
              Usar la lista detectada ({modelos.length})
            </button>
          ) : (
            <BotonDetectar detectando={detectando} onClick={detectar} />
          )}
        </>
      )}
      {error && (
        <span className="mt-1 block text-xs" style={{ color: "var(--color-peligro)" }}>
          {error}
        </span>
      )}
    </label>
  );
}

function FormularioNuevo({ hayLlave }: { hayLlave: boolean }) {
  const [guardado, guardar] = useActionState(accionGuardarProveedorIa, {});
  const formRef = useRef<HTMLFormElement>(null);
  const [servicio, setServicio] = useState<string>(SERVICIOS_IA_CONOCIDOS[0].valor);
  const [urlBase, setUrlBase] = useState<string>(SERVICIOS_IA_CONOCIDOS[0].urlBase ?? "");

  const definicion =
    SERVICIOS_IA_CONOCIDOS.find((s) => s.valor === servicio) ?? SERVICIOS_IA_CONOCIDOS[0];
  const tipo = definicion.tipo;
  const pideUrlBase = tipo === "openai_compatible";

  function alCambiarServicio(valor: string) {
    setServicio(valor);
    const def = SERVICIOS_IA_CONOCIDOS.find((s) => s.valor === valor) ?? SERVICIOS_IA_CONOCIDOS[0];
    setUrlBase(def.urlBase ?? "");
  }

  function leerApiKey(): string {
    const campo = formRef.current?.elements.namedItem("apiKey");
    return campo instanceof HTMLInputElement ? campo.value : "";
  }

  return (
    <form ref={formRef} action={guardar} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm">
          <span className="font-medium">Servicio</span>
          <select
            value={servicio}
            onChange={(e) => alCambiarServicio(e.target.value)}
            className="mt-1 w-full rounded-lg border px-3 py-2"
            style={{ borderColor: "var(--borde)" }}
          >
            {SERVICIOS_IA_CONOCIDOS.map((s) => (
              <option key={s.valor} value={s.valor}>
                {s.etiqueta}
              </option>
            ))}
          </select>
          {/* El protocolo real -lo unico que el servidor conoce- viaja
              oculto: "gemini"/"groq"/"openrouter" son marcas de esta
              pantalla, no valores que `guardarProveedorIa` entienda. */}
          <input type="hidden" name="tipo" value={tipo} />
        </label>

        <label className="text-sm">
          <span className="font-medium">Nombre</span>
          <input
            name="nombre"
            placeholder="El de producción"
            className="mt-1 w-full rounded-lg border px-3 py-2"
            style={{ borderColor: "var(--borde)" }}
          />
          <span className="mt-1 block text-xs opacity-70">
            Para distinguirlo si guardas más de uno.
          </span>
        </label>

        {pideUrlBase && (
          <label className="text-sm sm:col-span-2">
            <span className="font-medium">URL base</span>
            <input
              name="urlBase"
              value={urlBase}
              onChange={(e) => setUrlBase(e.target.value)}
              placeholder="https://api.tuproveedor.com/v1"
              className="mt-1 w-full rounded-lg border px-3 py-2"
              style={{ borderColor: "var(--borde)" }}
            />
            <span className="mt-1 block text-xs opacity-70">
              Hasta antes de /chat/completions, sin barra al final. Precargada de fábrica;
              cámbiala si este servicio usa otra.
            </span>
          </label>
        )}

        <CampoModelo tipo={tipo} urlBase={urlBase} leerApiKey={leerApiKey} />

        <label className="text-sm">
          <span className="font-medium">Clave de API</span>
          <input
            name="apiKey"
            type="password"
            autoComplete="new-password"
            className="mt-1 w-full rounded-lg border px-3 py-2"
            style={{ borderColor: "var(--borde)" }}
          />
          {definicion.urlClaves && (
            <a
              href={definicion.urlClaves}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-1 inline-flex items-center gap-1 text-xs underline opacity-70"
            >
              Consigue tu clave de {definicion.etiqueta} aquí
              <ExternalLink className="size-3" aria-hidden />
            </a>
          )}
        </label>
      </div>

      <Boton>Guardar proveedor</Boton>
      {!hayLlave && (
        <p className="text-xs opacity-70">
          No se guardará hasta que el servidor tenga clave de cifrado configurada.
        </p>
      )}
      <Mensaje estado={guardado} />
    </form>
  );
}

export function ProveedoresIa({
  proveedores,
  hayLlave,
}: {
  proveedores: ProveedorIaResumen[];
  /// Sin llave de cifrado en el servidor no se puede guardar ninguna clave.
  /// Se dice en pantalla en vez de dejar que el formulario falle al
  /// guardar: el problema no lo puede arreglar quien lo esta leyendo.
  hayLlave: boolean;
}) {
  const [probado, probar] = useActionState<EstadoProveedorIa, FormData>(
    accionProbarProveedorIa,
    {},
  );
  const [activado, activar] = useActionState<EstadoProveedorIa, FormData>(
    accionActivarProveedorIa,
    {},
  );
  const [eliminado, eliminar] = useActionState<EstadoProveedorIa, FormData>(
    accionEliminarProveedorIa,
    {},
  );

  return (
    <Tarjeta>
      <SeccionTarjeta
        primera
        titulo="Proveedores de IA"
        nota="Cada empresa trae su propio proveedor y su propia clave: GCM no paga ni opera ningún servicio de IA compartido. Guarda uno o varios, pruébalo y activa el que quieras usar."
      >
        {!hayLlave && (
          <p
            className="flex items-start gap-2 rounded-lg px-3 py-2 text-sm"
            style={{
              backgroundColor:
                "color-mix(in oklab, var(--color-alerta) 14%, transparent)",
            }}
          >
            <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
            <span className="text-pretty">
              Esta instalación no tiene clave de cifrado configurada, así que
              no se puede guardar la clave de un proveedor. Habla con quien
              administra el servidor.
            </span>
          </p>
        )}

        {proveedores.length === 0 ? (
          <p className="text-sm opacity-70">
            Todavía no configuraste ningún proveedor de IA.
          </p>
        ) : (
          <ul className="space-y-2">
            {proveedores.map((p) => (
              <Fila
                key={p.id}
                proveedor={p}
                probar={probar}
                activar={activar}
                eliminar={eliminar}
              />
            ))}
          </ul>
        )}

        <Mensaje estado={probado} />
        <Mensaje estado={activado} />
        <Mensaje estado={eliminado} />
      </SeccionTarjeta>

      <SeccionTarjeta
        titulo="Añadir proveedor"
        nota="La clave se cifra al guardarla y no se vuelve a mostrar."
      >
        <FormularioNuevo hayLlave={hayLlave} />
      </SeccionTarjeta>
    </Tarjeta>
  );
}
