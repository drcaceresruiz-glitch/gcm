"use client";

import { useActionState, useEffect, useState } from "react";
import { CheckCircle2, LoaderCircle, Send, XCircle } from "lucide-react";
import {
  accionEnviarSmsDePrueba,
  accionEstadoSmsDePrueba,
  type EstadoConfiguracion,
} from "@/app/(dashboard)/empresa/configuracion/acciones";
import { Nota } from "@/components/ui/Nota";

/**
 * Mandar un SMS de prueba y esperar la confirmacion.
 *
 * LO QUE HACE DISTINTO A ESTO de un simple «enviado»: no se cree su propio
 * encolado. Encolar solo prueba que GCM escribio en su tabla; el SMS puede no
 * salir nunca porque el telefono este dormido, sin saldo o sin permiso. Como
 * el emisor confirma cada mensaje que sale de la SIM, aqui se pregunta cada
 * tres segundos hasta que salga —y si no sale, se dice—.
 */

/// Cuanto se espera la confirmacion. El emisor pregunta cada 20 segundos, asi
/// que un minuto le da tres oportunidades antes de dar la prueba por perdida.
const ESPERA_MAXIMA_MS = 60_000;

export function ProbarSms({ hayCanal }: { hayCanal: boolean }) {
  const [estado, enviar, enviando] = useActionState<EstadoConfiguracion, FormData>(
    accionEnviarSmsDePrueba,
    {},
  );
  const [numero, setNumero] = useState("");
  const [salida, setSalida] = useState<"pendiente" | "salio" | "perdida" | null>(
    null,
  );

  // Se pregunta solo mientras haya una prueba en marcha. Al salir —o al
  // agotarse el minuto— se para: dejar un temporizador vivo toda la tarde
  // preguntando por algo que ya no cambia es gasto y nada mas.
  useEffect(() => {
    // Sin `mensajeId` no hay nada que seguir: es lo que pasa por la pasarela,
    // que acepta o rechaza en el acto y no deja rastro que consultar.
    if (!estado.mensajeId || salida === "salio" || salida === "perdida") return;

    const empezo = Date.now();
    const mensajeId = estado.mensajeId;

    const preguntar = async () => {
      const r = await accionEstadoSmsDePrueba(mensajeId);
      if (r === "salio" || r === "perdida") return setSalida(r);
      if (Date.now() - empezo > ESPERA_MAXIMA_MS) return setSalida("perdida");
      setSalida("pendiente");
    };

    void preguntar();
    const temporizador = setInterval(preguntar, 3000);

    return () => clearInterval(temporizador);
  }, [estado.mensajeId, salida]);

  return (
    <form
      action={(datos) => {
        setSalida(null);
        enviar(datos);
      }}
      className="space-y-2 rounded-lg border p-3"
      style={{ borderColor: "var(--borde)", backgroundColor: "var(--superficie)" }}
    >
      <p className="text-sm font-medium">Probar que los SMS salen</p>
      <p className="text-xs opacity-70">
        Manda un mensaje de verdad al celular que digas y espera a que tu
        teléfono confirme que salió. Gasta un SMS de la SIM.
      </p>

      <div className="flex flex-wrap items-end gap-2">
        <label className="text-xs">
          <span className="block opacity-70">Celular donde recibirlo</span>
          <input
            name="numero"
            type="tel"
            inputMode="tel"
            required
            value={numero}
            onChange={(e) => setNumero(e.target.value)}
            placeholder="987654321"
            className="mt-1 rounded-lg border px-3 py-2 text-sm"
            style={{ borderColor: "var(--borde)", backgroundColor: "var(--fondo)" }}
          />
        </label>

        <button
          type="submit"
          disabled={enviando || !hayCanal}
          className="flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          style={{ backgroundColor: "var(--color-marca-600)" }}
        >
          {enviando ? (
            <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
          ) : (
            <Send className="size-4" aria-hidden="true" />
          )}
          Enviar SMS de prueba
        </button>
      </div>

      {!hayCanal && (
        <p className="text-xs opacity-60">
          Primero vincula un teléfono aquí arriba: sin él no hay por dónde
          enviar.
        </p>
      )}

      {estado.error && <Nota tono="peligro">{estado.error}</Nota>}

      {/* Tres finales distintos, y ninguno miente. «Esperando» no es un exito
          a medias: es que GCM tiene el mensaje y el telefono todavia no lo ha
          mandado. */}
      {estado.ok && salida === "pendiente" && (
        <p className="flex items-center gap-2 text-sm">
          <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
          Esperando a que tu teléfono lo mande…
        </p>
      )}

      {salida === "salio" && (
        <p
          className="flex items-start gap-2 rounded-lg px-3 py-2 text-sm"
          role="status"
          style={{
            backgroundColor: "color-mix(in oklab, var(--color-exito) 15%, transparent)",
          }}
        >
          <CheckCircle2 className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <span>
            <b>Funciona.</b> Tu teléfono confirmó que el SMS salió de la SIM.
            Debería estar llegando al {numero}.
          </span>
        </p>
      )}

      {salida === "perdida" && (
        <p
          className="flex items-start gap-2 rounded-lg px-3 py-2 text-sm"
          role="status"
          style={{
            backgroundColor: "color-mix(in oklab, var(--color-alerta) 15%, transparent)",
          }}
        >
          <XCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <span>
            El mensaje sigue sin salir. Mira ese teléfono: que la aplicación
            esté encendida, que tenga saldo y que le hayas quitado el ahorro de
            batería.
          </span>
        </p>
      )}

      {estado.ok && salida === null && <Nota tono="exito">{estado.ok}</Nota>}
    </form>
  );
}
