"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import Link from "next/link";
import { LoaderCircle, Send, AlertCircle, Check, X } from "lucide-react";
import {
  accionEnviarMensajeAsistente,
  accionEstadoDeTurno,
  accionConfirmarPropuesta,
} from "@/app/(dashboard)/asistente/acciones";
import { SIN_PROVEEDOR_ACTIVO } from "@/lib/agente-conversacion";
import type { MensajeAgenteResumen } from "@/services/agente-conversacion.service";

/**
 * El chat con el asistente de IA — Fase 2a, solo lectura.
 *
 * Cada mensaje del asistente se manda a `after()` en el servidor y este
 * componente SONDEA su estado cada 2 segundos hasta que termina —mismo
 * patrón que `ProbarSms.tsx`—, con un tope de espera del lado del
 * cliente: si el barrido del servidor tarda, aquí no se espera para
 * siempre.
 */

/// Cuanto se espera una respuesta antes de decir que esta tardando de mas.
/// El turno en si puede seguir corriendo -esto no lo cancela-, solo deja
/// de sondear en el navegador.
const ESPERA_MAXIMA_MS = 90_000;

function BotonEnviar({ esperandoRespuesta }: { esperandoRespuesta: boolean }) {
  const { pending } = useFormStatus();
  const ocupado = pending || esperandoRespuesta;
  return (
    <button
      type="submit"
      disabled={ocupado}
      className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
      style={{ backgroundColor: "var(--color-marca-600)" }}
    >
      {ocupado ? (
        <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
      ) : (
        <Send className="size-4" aria-hidden="true" />
      )}
      Enviar
    </button>
  );
}

function TarjetaConfirmacion({
  mensajeId,
  onResuelto,
}: {
  mensajeId: string;
  onResuelto: (contenido: string) => void;
}) {
  const [resolviendo, setResolviendo] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function resolver(decision: "confirmar" | "cancelar") {
    setResolviendo(true);
    setError(null);
    const r = await accionConfirmarPropuesta(mensajeId, decision);
    setResolviendo(false);
    if (!r.ok) {
      setError(r.error);
      return;
    }
    onResuelto(r.contenido);
  }

  return (
    <div className="mt-2 flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={() => resolver("confirmar")}
        disabled={resolviendo}
        className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium text-white disabled:opacity-60"
        style={{ backgroundColor: "var(--color-marca-600)" }}
      >
        {resolviendo ? (
          <LoaderCircle className="size-3.5 animate-spin" aria-hidden="true" />
        ) : (
          <Check className="size-3.5" aria-hidden="true" />
        )}
        Confirmar
      </button>
      <button
        type="button"
        onClick={() => resolver("cancelar")}
        disabled={resolviendo}
        className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium disabled:opacity-60"
        style={{ borderColor: "var(--borde)" }}
      >
        <X className="size-3.5" aria-hidden="true" />
        Cancelar
      </button>
      {error && (
        <span className="w-full text-xs" style={{ color: "var(--color-peligro)" }}>
          {error}
        </span>
      )}
    </div>
  );
}

function Burbuja({
  mensaje,
  onPropuestaResuelta,
}: {
  mensaje: MensajeAgenteResumen;
  onPropuestaResuelta: (id: string, contenido: string) => void;
}) {
  const esUsuario = mensaje.rol === "USUARIO";
  const pensando = !esUsuario && !mensaje.terminado;

  return (
    <li className={`flex ${esUsuario ? "justify-end" : "justify-start"}`}>
      <div
        className="max-w-[85%] rounded-xl px-3 py-2 text-sm text-pretty"
        style={{
          backgroundColor: esUsuario ? "var(--color-marca-600)" : "var(--superficie)",
          color: esUsuario ? "white" : undefined,
          border: esUsuario ? "none" : "1px solid var(--borde)",
        }}
      >
        {pensando ? (
          <p className="flex items-center gap-2 opacity-70">
            <LoaderCircle className="size-3.5 animate-spin" aria-hidden="true" />
            Pensando…
          </p>
        ) : mensaje.error ? (
          <p className="flex items-start gap-2" style={{ color: "var(--color-peligro)" }}>
            <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <span>
              {mensaje.error}
              {mensaje.error === SIN_PROVEEDOR_ACTIVO && (
                <>
                  {" "}
                  <Link href="/empresa/configuracion/ia" className="underline">
                    Ir a Configuración →
                  </Link>
                </>
              )}
            </span>
          </p>
        ) : (
          <>
            <p className="whitespace-pre-wrap">{mensaje.contenido}</p>
            {mensaje.propuestaPendiente && (
              <TarjetaConfirmacion
                mensajeId={mensaje.id}
                onResuelto={(contenido) => onPropuestaResuelta(mensaje.id, contenido)}
              />
            )}
          </>
        )}
      </div>
    </li>
  );
}

export function Asistente({
  conversacionInicial,
}: {
  conversacionInicial: { id: string; mensajes: MensajeAgenteResumen[] } | null;
}) {
  const [mensajes, setMensajes] = useState<MensajeAgenteResumen[]>(
    conversacionInicial?.mensajes ?? [],
  );
  const [pendienteId, setPendienteId] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  // El ultimo mensajeAsistenteId para el que YA se agregaron las burbujas.
  // Aparte de `pendienteId` a proposito: `pendienteId` vuelve a `null` en
  // cuanto el turno termina, pero `estado.mensajeAsistenteId` (el de
  // `useActionState`) se queda IGUAL hasta el proximo envio. Comparar
  // contra `pendienteId` volvia a agregar el mismo par de burbujas cada
  // vez que el sondeo terminaba -un bucle sin fin, cazado probando en
  // vivo, no en las pruebas automatizadas-.
  const idAgregadoRef = useRef<string | null>(null);

  const [estado, enviar] = useActionState(accionEnviarMensajeAsistente, {});

  // `undefined` = usa lo que ya habia (el id derivado de `estado`/
  // `conversacionInicial`, como siempre); `null` = "Nueva conversación"
  // acaba de pedir que el PROXIMO envio abra una conversacion distinta.
  // Se limpia solo en cuanto ese envio realmente pasa -ver el efecto de
  // abajo-, para no quedar pisando el id real para siempre.
  const [conversacionForzada, setConversacionForzada] = useState<string | null | undefined>(
    undefined,
  );

  // Se deriva del ultimo resultado de la accion, sin estado propio: cada
  // envio devuelve el mismo id de conversacion una vez que existe, asi
  // que no hace falta sincronizarlo aparte.
  const conversacionId =
    conversacionForzada !== undefined
      ? conversacionForzada
      : (estado.conversacionId ?? conversacionInicial?.id ?? null);

  // Al llegar un id nuevo de turno, se añaden las dos burbujas -la del
  // usuario, ya completa, y la del asistente, vacia- y arranca el sondeo.
  useEffect(() => {
    if (!estado.mensajeAsistenteId || estado.mensajeAsistenteId === idAgregadoRef.current) {
      return;
    }
    idAgregadoRef.current = estado.mensajeAsistenteId;
    setConversacionForzada(undefined);

    const textoEnviado = formRef.current?.elements.namedItem("mensaje");
    const texto =
      textoEnviado instanceof HTMLTextAreaElement ? textoEnviado.value.trim() : "";

    setMensajes((previos) => [
      ...previos,
      {
        id: `local-${estado.mensajeAsistenteId}`,
        rol: "USUARIO",
        contenido: texto,
        terminado: true,
        error: null,
        createdAt: new Date(),
        propuestaPendiente: false,
      },
      {
        id: estado.mensajeAsistenteId!,
        rol: "ASISTENTE",
        contenido: "",
        terminado: false,
        error: null,
        createdAt: new Date(),
        propuestaPendiente: false,
      },
    ]);
    setPendienteId(estado.mensajeAsistenteId);
    formRef.current?.reset();
  }, [estado.mensajeAsistenteId]);

  // El sondeo en si: cada 2s hasta que termine, con tope de espera.
  useEffect(() => {
    if (!pendienteId) return;

    const empezo = Date.now();

    const preguntar = async () => {
      const r = await accionEstadoDeTurno(pendienteId);
      const agotado = Date.now() - empezo > ESPERA_MAXIMA_MS;

      if (!r) return; // conversacion ya no es propia o no existe: se deja de sondear en silencio

      if (r.terminado || agotado) {
        setMensajes((previos) =>
          previos.map((m) =>
            m.id === pendienteId
              ? {
                  ...m,
                  contenido: r.contenido,
                  terminado: true,
                  error:
                    r.error ??
                    (agotado && !r.terminado
                      ? "Esto está tardando más de lo normal. Puedes seguir esperando o intentar de nuevo."
                      : null),
                  propuestaPendiente: r.propuestaPendiente,
                }
              : m,
          ),
        );
        setPendienteId(null);
      }
    };

    void preguntar();
    const temporizador = setInterval(preguntar, 2000);
    return () => clearInterval(temporizador);
  }, [pendienteId]);

  // Al confirmar o cancelar una propuesta, la escritura real ya paso -es
  // una transaccion de Prisma, no una llamada al proveedor de IA-, asi que
  // se actualiza de una vez, sin sondeo.
  function alResolverPropuesta(id: string, contenido: string) {
    setMensajes((previos) =>
      previos.map((m) => (m.id === id ? { ...m, contenido, propuestaPendiente: false } : m)),
    );
  }

  const hayPropuestaPendiente = mensajes.some((m) => m.propuestaPendiente);

  // No borra nada de la base -las filas viejas se quedan, historicas,
  // igual que cualquier otro registro de GCM-: solo deja de mostrarlas y
  // hace que el proximo envio abra una conversacion nueva. Es lo mismo
  // que ya pasa sola al recargar la pagina despues de un rato, solo que
  // sin recargar.
  function nuevaConversacion() {
    setMensajes([]);
    setPendienteId(null);
    setConversacionForzada(null);
  }

  return (
    <div className="flex flex-col gap-4">
      {mensajes.length > 0 && (
        <button
          type="button"
          onClick={nuevaConversacion}
          className="self-start text-xs underline opacity-70"
        >
          Nueva conversación
        </button>
      )}

      {mensajes.length === 0 ? (
        <p className="text-sm opacity-70">
          Pregúntale por el semáforo de la cartera, qué obras se están
          sobregirando, o el PPC de la última semana.
        </p>
      ) : (
        <ul className="space-y-3">
          {mensajes.map((m) => (
            <Burbuja key={m.id} mensaje={m} onPropuestaResuelta={alResolverPropuesta} />
          ))}
        </ul>
      )}

      {hayPropuestaPendiente && (
        <p className="text-xs opacity-70">
          Resuelve la propuesta de arriba (Confirmar o Cancelar) antes de seguir.
        </p>
      )}

      <form ref={formRef} action={enviar} className="space-y-2">
        <input type="hidden" name="conversacionId" value={conversacionId ?? ""} />
        <textarea
          name="mensaje"
          rows={2}
          required
          disabled={pendienteId !== null || hayPropuestaPendiente}
          maxLength={4000}
          placeholder="Escribe tu pregunta…"
          className="w-full rounded-lg border px-3 py-2 text-sm disabled:opacity-60"
          style={{ borderColor: "var(--borde)", backgroundColor: "var(--fondo)" }}
        />
        <div className="flex flex-wrap items-center gap-3">
          <BotonEnviar esperandoRespuesta={pendienteId !== null || hayPropuestaPendiente} />
          {estado.error && (
            <span className="text-sm" style={{ color: "var(--color-peligro)" }}>
              {estado.error}
            </span>
          )}
        </div>
      </form>
    </div>
  );
}
