"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  CheckCircle2,
  LoaderCircle,
  MessageSquare,
  RefreshCw,
  Smartphone,
  RotateCcw,
  Ban,
  Trash2,
  Download,
} from "lucide-react";
import {
  accionVincularEmisor,
  accionCambiarEstadoEmisor,
  accionEliminarEmisor,
  type EstadoConfiguracion,
} from "@/app/(dashboard)/empresa/configuracion/acciones";
import { Tarjeta, SeccionTarjeta } from "@/components/ui/Tarjeta";
import type { EmisorLista } from "@/services/emisor-sms.service";
import type { EstadoEmisor } from "@/lib/emisor-sms";

/**
 * Los telefonos que mandan los SMS de la empresa.
 *
 * GCM no manda los SMS: los manda un movil con la app de `movil/emisor-sms`,
 * que pregunta a GCM cada veinte segundos y usa su propia SIM. Aqui se le da
 * permiso a ese telefono y se le quita.
 */

/**
 * De donde se baja el instalador del emisor.
 *
 * Es una release de etiqueta fija —la publica el flujo `apk-emisor-sms`—, asi
 * que la direccion no cambia aunque se recompile. Va aqui como constante y no
 * en la configuracion porque HOY el APK es el mismo para todas las empresas: es
 * la aplicacion de GCM, no la de la constructora. Si algun dia cada cliente
 * quiere la suya, esto pasa a ser un campo de empresa.
 */
const URL_INSTALADOR =
  "https://github.com/drcaceresruiz-glitch/gcm/releases/latest/download/emisor-sms.apk";

/** Como se pinta cada estado. Color e icono juntos, nunca el color solo. */
const ESTADOS: Record<
  EstadoEmisor,
  { texto: string; color: string; ayuda: string }
> = {
  vivo: {
    texto: "Preguntando",
    color: "var(--color-exito)",
    ayuda: "Ha preguntado hace menos de dos minutos. Los SMS salen.",
  },
  dormido: {
    texto: "Sin noticias",
    color: "var(--color-alerta)",
    ayuda:
      "Lleva más de dos minutos sin preguntar. Suele ser el ahorro de batería de Android: quítaselo en ese teléfono.",
  },
  nunca: {
    texto: "Sin estrenar",
    color: "var(--texto-suave)",
    ayuda:
      "Todavía no ha preguntado ni una vez. Falta pegarle el token en la app y darle a Encender.",
  },
};

function Avisos({ estado }: { estado: EstadoConfiguracion }) {
  return (
    <>
      {estado.error && (
        <p
          role="alert"
          className="flex items-start gap-2 text-sm"
          style={{ color: "var(--color-peligro)" }}
        >
          <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <span>{estado.error}</span>
        </p>
      )}

      {estado.ok && (
        <p
          role="status"
          className="flex items-start gap-2 text-sm"
          style={{ color: "var(--color-exito)" }}
        >
          <CheckCircle2 className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <span>{estado.ok}</span>
        </p>
      )}
    </>
  );
}

function BotonEnviar({ children }: { children: React.ReactNode }) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
      style={{ backgroundColor: "var(--color-marca-600)" }}
    >
      {pending && (
        <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
      )}
      {children}
    </button>
  );
}

export function EmisoresSms({
  emisores,
  direccionCola,
}: {
  emisores: EmisorLista[];
  direccionCola: string;
}) {
  const router = useRouter();
  const [vinculo, vincular] = useActionState<EstadoConfiguracion, FormData>(
    accionVincularEmisor,
    {},
  );
  const [cambio, cambiar] = useActionState<EstadoConfiguracion, FormData>(
    accionCambiarEstadoEmisor,
    {},
  );
  const [borrado, borrar] = useActionState<EstadoConfiguracion, FormData>(
    accionEliminarEmisor,
    {},
  );

  const activos = emisores.filter((e) => e.activo).length;

  // El estado se calcula al pintar la pagina, asi que no cambia solo. Quien
  // acaba de configurar el telefono se quedaba mirando «Sin estrenar» sin
  // saber si habia funcionado, y no tiene por que adivinar que hay que
  // recargar.
  const sinEstrenar = emisores.some((e) => e.activo && e.estado === "nunca");

  return (
    <Tarjeta>
      <SeccionTarjeta
        primera
        titulo="Teléfono que envía los SMS"
        nota="GCM no manda los SMS: los manda un móvil tuyo, con su propia SIM y la aplicación del emisor instalada. Aquí le das permiso."
      >
        {activos === 0 && (
          <p
            className="flex items-start gap-2 rounded-lg px-3 py-2 text-sm"
            style={{
              backgroundColor:
                "color-mix(in oklab, var(--color-alerta) 15%, transparent)",
            }}
          >
            <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <span>
              No hay ningún teléfono vinculado. Los códigos de acceso y los del
              pase de obra saldrán solo por correo.
            </span>
          </p>
        )}

        {emisores.length > 0 && (
          <ul className="space-y-2">
            {emisores.map((e) => (
              <Fila key={e.id} emisor={e} cambiar={cambiar} borrar={borrar} />
            ))}
          </ul>
        )}

        {sinEstrenar && (
          <button
            type="button"
            onClick={() => router.refresh()}
            className="inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs"
            style={{ borderColor: "var(--borde)" }}
          >
            <RefreshCw className="size-3.5" aria-hidden="true" />
            Comprobar de nuevo
          </button>
        )}

        <Avisos estado={cambio} />
        <Avisos estado={borrado} />
      </SeccionTarjeta>

      <SeccionTarjeta
        titulo="Vincular un teléfono"
        nota="Te daremos un token. Se pega UNA vez en la aplicación del móvil, junto con la dirección de aquí abajo."
      >
        <div className="space-y-1">
          <p className="text-xs font-medium">Dirección para la aplicación</p>
          <code
            className="block rounded-lg p-2 text-xs break-all"
            style={{ backgroundColor: "var(--fondo)" }}
          >
            {direccionCola}
          </code>
          <p className="text-xs opacity-60">
            Es la misma para todos los teléfonos. Lo que distingue a tu empresa
            es el token, no la dirección.
          </p>
        </div>

        <form action={vincular} className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <Campo
              id="etiqueta"
              nombre="etiqueta"
              etiqueta="Nombre del teléfono"
              ayuda="Para reconocerlo: «el de la caseta»."
              requerido
            />
            <Campo
              id="numero"
              nombre="numero"
              etiqueta="Número de la SIM (opcional)"
              ayuda="Solo para saber qué aparato es."
              tipo="tel"
            />
          </div>

          <BotonEnviar>Vincular</BotonEnviar>
        </form>

        <Avisos estado={vinculo} />

        {vinculo.token && <TokenNuevo token={vinculo.token} />}

        {/* El enlace, no «pidesela a quien administra GCM». Quien instala esto
            lo hace DESDE EL TELEFONO: se abre esta pantalla en el movil, o se
            manda esta direccion por WhatsApp, y se descarga ahi mismo. */}
        <div className="space-y-1">
          <p className="text-xs font-medium">La aplicación para ese teléfono</p>
          <a
            href={URL_INSTALADOR}
            className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-medium"
            style={{ borderColor: "var(--borde)" }}
          >
            <Download className="size-3.5" aria-hidden="true" />
            Descargar el instalador (.apk)
          </a>
          <p className="text-xs opacity-60">
            Ábrelo en el propio teléfono. Android avisará de que viene de un
            origen desconocido: hay que permitirlo esa vez. No está en Google
            Play porque Play reserva el permiso de enviar SMS para la
            aplicación de mensajes del teléfono.
          </p>
        </div>
      </SeccionTarjeta>
    </Tarjeta>
  );
}

function Fila({
  emisor,
  cambiar,
  borrar,
}: {
  emisor: EmisorLista;
  cambiar: (datos: FormData) => void;
  borrar: (datos: FormData) => void;
}) {
  const estado = ESTADOS[emisor.estado];

  // Borrar va en DOS pasos siempre, tambien sobre uno revocado. Es un boton
  // que vive al lado de «Revocar»/«Reactivar» y no se puede deshacer: un dedo
  // torpe en el telefono que SI manda los SMS deja la obra sin codigos.
  const [confirmando, setConfirmando] = useState(false);

  return (
    <li
      className="flex flex-wrap items-start justify-between gap-3 rounded-xl border p-3"
      style={{ borderColor: "var(--borde)", opacity: emisor.activo ? 1 : 0.6 }}
    >
      <div className="min-w-0">
        <p className="flex items-center gap-2 text-sm font-medium">
          <Smartphone className="size-4 shrink-0 opacity-70" aria-hidden="true" />
          {emisor.etiqueta}
          {emisor.numero && (
            <span className="font-normal opacity-60">{emisor.numero}</span>
          )}
        </p>

        {emisor.activo ? (
          <>
            <p
              className="mt-1 flex items-center gap-1.5 text-xs font-medium"
              style={{ color: estado.color }}
            >
              <MessageSquare className="size-3.5 shrink-0" aria-hidden="true" />
              {estado.texto}
            </p>
            <p className="mt-0.5 text-xs opacity-60">{estado.ayuda}</p>
          </>
        ) : (
          <p className="mt-1 text-xs opacity-60">
            Revocado. Su token ya no sirve.
          </p>
        )}

        <p className="mt-1 text-xs opacity-50">
          Vinculado por {emisor.vinculadoPor}
        </p>
      </div>

      <div className="flex items-center gap-2">
      <form action={cambiar}>
        <input type="hidden" name="id" value={emisor.id} />
        <input type="hidden" name="activo" value={emisor.activo ? "no" : "si"} />
        <button
          type="submit"
          className="inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs"
          style={{ borderColor: "var(--borde)" }}
        >
          {emisor.activo ? (
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
      </form>

      {confirmando ? (
        <form action={borrar} className="flex items-center gap-1.5">
          <input type="hidden" name="id" value={emisor.id} />
          <span className="text-xs opacity-70">¿Seguro?</span>
          <button
            type="submit"
            className="inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium"
            style={{
              borderColor: "var(--color-peligro)",
              color: "var(--color-peligro)",
            }}
          >
            Sí, eliminar
          </button>
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
          aria-label={`Eliminar ${emisor.etiqueta} de la lista`}
          className="inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs"
          style={{ borderColor: "var(--borde)" }}
        >
          <Trash2 className="size-3.5" aria-hidden="true" />
          Eliminar
        </button>
      )}
      </div>
    </li>
  );
}

/**
 * El token recien creado.
 *
 * Se ensena en grande y con el aviso de que no vuelve: no esta guardado en
 * ningun sitio del que se pueda sacar, solo su hash. Se prefiere la molestia
 * de revocar y volver a vincular antes que un secreto que se puede consultar
 * cuando se quiera —y que acabaria copiado en un correo—.
 */
function TokenNuevo({ token }: { token: string }) {
  return (
    <div
      className="space-y-2 rounded-xl border-2 p-3"
      style={{ borderColor: "var(--color-marca-600)" }}
    >
      <p className="text-xs font-medium">
        Pega esto en la aplicación del teléfono, junto con la dirección de GCM:
      </p>
      <code
        className="block rounded-lg p-2 text-xs break-all"
        style={{ backgroundColor: "var(--fondo)" }}
      >
        {token}
      </code>
      <p className="text-xs" style={{ color: "var(--color-alerta)" }}>
        No se puede volver a ver. Si lo pierdes, revoca ese teléfono y vincula
        otro.
      </p>
    </div>
  );
}

function Campo({
  id,
  nombre,
  etiqueta,
  ayuda,
  tipo = "text",
  requerido = false,
}: {
  id: string;
  nombre: string;
  etiqueta: string;
  ayuda: string;
  tipo?: string;
  requerido?: boolean;
}) {
  return (
    <div className="space-y-1">
      <label htmlFor={id} className="block text-sm font-medium">
        {etiqueta}
      </label>
      <input
        id={id}
        name={nombre}
        type={tipo}
        required={requerido}
        maxLength={80}
        className="w-full rounded-lg border px-3 py-2 text-sm"
        style={{
          borderColor: "var(--borde)",
          backgroundColor: "var(--fondo)",
        }}
      />
      <p className="text-xs opacity-60">{ayuda}</p>
    </div>
  );
}
