"use client";

import { useActionState, useEffect, useState } from "react";
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
  Send,
} from "lucide-react";
import {
  mensajeDeVinculo,
  mensajeDelToken,
  pasosDeVinculo,
} from "@/lib/vinculo-emisor";
import { enlaceWhatsApp } from "@/lib/whatsapp";
import { haceCuanto } from "@/utils/fechas";
import { ProbarSms } from "@/components/empresa/ProbarSms";
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
  const hayActivos = emisores.some((e) => e.activo);

  // La pantalla se refresca sola mientras se mira. Antes el estado era una
  // FOTO del momento en que se pinto la pagina: quien acababa de configurar el
  // telefono se quedaba mirando «Sin estrenar» sin saber si habia funcionado,
  // y tenia que recargar para enterarse. Aqui la pregunta es «¿esta conectado
  // AHORA?», y una respuesta de hace cinco minutos no la contesta.
  //
  // Cada 15 segundos, que es menos que los 20 del emisor: asi el contador de
  // abajo se ve volver a cero. Y solo con la pestana a la vista, para no pedir
  // al servidor cada quince segundos toda la tarde por una pantalla que nadie
  // tiene delante.
  useEffect(() => {
    if (!hayActivos) return;

    const id = setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, 15_000);

    return () => clearInterval(id);
  }, [hayActivos, router]);

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

        {hayActivos && (
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => router.refresh()}
              className="inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs"
              style={{ borderColor: "var(--borde)" }}
            >
              <RefreshCw className="size-3.5" aria-hidden="true" />
              Comprobar ahora
            </button>
            <span className="text-xs opacity-60">
              {sinEstrenar
                ? "Esto se comprueba solo cada 15 segundos: si el teléfono está bien configurado, en menos de un minuto dirá «Preguntando»."
                : "Se comprueba solo cada 15 segundos. Mientras el contador vuelva a cero, la conexión está viva."}
            </span>
          </div>
        )}

        <Avisos estado={cambio} />
        <Avisos estado={borrado} />

        {/* Despues de configurar, la unica forma de saber que esto funciona era
            esperar a que alguien pidiera un codigo de verdad, y descubrirlo
            entonces es descubrirlo tarde. */}
        <ProbarSms hayCanal={hayActivos} />
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
              etiqueta="Celular de ese teléfono"
              ayuda="Las 9 cifras a las que llamarías, no el número largo de la tarjeta. Te preparamos el WhatsApp con los pasos y el token para ese número."
              tipo="tel"
            />
          </div>

          <BotonEnviar>Vincular</BotonEnviar>
        </form>

        <Avisos estado={vinculo} />

        {vinculo.token && (
          <TokenNuevo
            token={vinculo.token}
            numero={vinculo.numero ?? null}
            direccionCola={direccionCola}
          />
        )}

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
              <UltimaVezQuePregunto fecha={emisor.ultimaConsultaAt} />
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
 * Cuanto hace que ese telefono pregunto, contando en vivo.
 *
 * ES LA PRUEBA DE QUE LA CONEXION ESTA VIVA, y por eso corre sola: se mira la
 * pantalla y el numero sube —1 s, 2 s, 3 s— hasta que el telefono vuelve a
 * preguntar y cae a cero. Un rotulo quieto que diga «Preguntando» no distingue
 * un telefono conectado de la foto de uno que lo estuvo hace media hora.
 *
 * No se pinta hasta que el componente monta: el servidor y el navegador
 * calcularian «hace cuanto» en instantes distintos y React se quejaria de que
 * el HTML no coincide.
 */
function UltimaVezQuePregunto({ fecha }: { fecha: Date | null }) {
  const [texto, setTexto] = useState<string | null>(null);
  const instante = fecha ? new Date(fecha).getTime() : null;

  useEffect(() => {
    if (instante === null) return;

    const pintar = () => setTexto(haceCuanto(new Date(instante)));
    pintar();
    const id = setInterval(pintar, 1000);

    return () => clearInterval(id);
  }, [instante]);

  if (texto === null) return null;

  return <span className="font-normal opacity-70">· {texto}</span>;
}

/**
 * El token recien creado.
 *
 * Se ensena en grande y con el aviso de que no vuelve: no esta guardado en
 * ningun sitio del que se pueda sacar, solo su hash. Se prefiere la molestia
 * de revocar y volver a vincular antes que un secreto que se puede consultar
 * cuando se quiera —y que acabaria copiado en un correo—.
 */
function TokenNuevo({
  token,
  numero,
  direccionCola,
}: {
  token: string;
  numero: string | null;
  direccionCola: string;
}) {
  const datosDelVinculo = {
    direccionCola,
    urlInstalador: URL_INSTALADOR,
  };

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

      {/* Mandarselo AL TELEFONO, que es donde hace falta. Por WhatsApp y no por
          SMS por dos razones: para el primer telefono no hay canal de SMS —es
          justo lo que se esta creando— y un SMS con enlaces lo marcan como
          spam las operadoras. Lo manda quien administra desde su WhatsApp. */}
      {numero ? (
        <div className="space-y-1.5">
          <div className="flex flex-wrap gap-2">
            <a
              href={enlaceWhatsApp(mensajeDeVinculo(datosDelVinculo), numero)}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium text-white"
              style={{ backgroundColor: "var(--color-marca-600)" }}
            >
              <Send className="size-3.5" aria-hidden="true" />
              1. Enviar los pasos al {numero}
            </a>
            <a
              href={enlaceWhatsApp(mensajeDelToken(token), numero)}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-medium"
              style={{
                borderColor: "var(--color-marca-600)",
                color: "var(--color-marca-600)",
              }}
            >
              <Send className="size-3.5" aria-hidden="true" />
              2. Enviar solo el token
            </a>
          </div>
          {/* Son dos y hay que decir por que, o el segundo boton parece un
              error. WhatsApp copia el mensaje ENTERO: con el token dentro de
              los pasos, no hay forma de llevarse solo el token. */}
          <p className="text-xs opacity-60">
            Van en dos mensajes a propósito: en WhatsApp se copia el mensaje
            entero, así que el token viaja solo para poder copiarlo de un toque
            y pegarlo en la aplicación.
          </p>
        </div>
      ) : (
        <p className="text-xs opacity-60">
          No pusiste el celular de ese teléfono, así que no hay a dónde mandar
          los pasos. Copia el token de arriba y sigue la lista a mano, o revoca
          y vincula de nuevo poniendo el número.
        </p>
      )}

      <details className="text-xs">
        <summary className="cursor-pointer opacity-70">
          Ver los pasos en ese teléfono, uno a uno
        </summary>
        <ol className="mt-2 list-decimal space-y-1.5 pl-4">
          {pasosDeVinculo(datosDelVinculo).map((paso) => (
            <li key={paso} className="break-words">
              {paso}
            </li>
          ))}
        </ol>
      </details>
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
