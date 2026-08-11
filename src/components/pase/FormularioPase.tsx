"use client";

import { useState, useTransition } from "react";
import { KeyRound, LoaderCircle, Smartphone } from "lucide-react";
import {
  accionPedirCodigo,
  accionVerificarCodigo,
  accionOtroContacto,
} from "@/app/(pase)/pase/[obraId]/acciones";

/**
 * La puerta del personal de campo: identificarse y teclear el codigo.
 *
 * Dos pasos en una sola pantalla, con el paso decidido EN EL SERVIDOR
 * (`hayCodigoPendiente`) y no aqui: si lo decidiera el navegador, recargar la
 * pagina —lo mas normal del mundo cuando el dato movil falla— devolveria al
 * primer paso con el codigo ya gastado.
 *
 * Un solo campo para identificarse, sin preguntar si es correo o celular: lo
 * decide la arroba. En obra, un campo menos es un error menos.
 */
export function FormularioPase({
  obraId,
  obra,
  conCodigoPendiente,
}: {
  obraId: string;
  /// Nombre de la obra: lo primero que confirma que se escaneo el QR correcto.
  obra: string;
  conCodigoPendiente: boolean;
}) {
  const [contacto, setContacto] = useState("");
  const [codigo, setCodigo] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pendiente, iniciar] = useTransition();

  /**
   * Si ya se pidio el codigo en ESTA pantalla.
   *
   * Se pasa al segundo paso SIEMPRE que la peticion salga bien, exista el
   * contacto o no. Es lo que sostiene el silencio deliberado del servicio: si
   * la pantalla avanzara solo cuando el contacto existe, avanzar o no seria
   * la respuesta que el servicio se cuida de no dar, y cualquiera con el QR
   * de la caseta podria averiguar quien trabaja en la obra probando numeros.
   *
   * Por lo mismo NO se resuelve redirigiendo y dejando que el servidor decida
   * con `hayCodigoPendiente`: eso mira si hay codigo, o sea, delata.
   */
  const [pedido, setPedido] = useState(false);
  const enPasoDelCodigo = conCodigoPendiente || pedido;

  function pedir() {
    setError(null);
    iniciar(async () => {
      const r = await accionPedirCodigo(obraId, contacto);
      if (r.ok) setPedido(true);
      else setError(r.error);
    });
  }

  function verificar() {
    setError(null);
    iniciar(async () => {
      // Si acierta no vuelve: la accion redirige a la pantalla de carga.
      const r = await accionVerificarCodigo(obraId, codigo);
      if (!r.ok) setError(r.error);
    });
  }

  return (
    <div className="flex flex-1 flex-col justify-center">
      <header className="mb-6">
        <p className="text-xs uppercase tracking-wide opacity-60">
          Evidencia de obra
        </p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">{obra}</h1>
      </header>

      <div
        className="rounded-xl border p-5 shadow-sm"
        style={{
          borderColor: "var(--borde)",
          backgroundColor: "var(--superficie)",
        }}
      >
        {enPasoDelCodigo ? (
          <form
            action={verificar}
            className="space-y-4"
            // El teclado numerico y el autocompletado del SMS del sistema
            // ahorran el paso de copiar y pegar con las manos ocupadas.
          >
            <div>
              <h2 className="flex items-center gap-2 text-base font-semibold">
                <KeyRound className="size-4 opacity-70" aria-hidden="true" />
                Escribe tu código
              </h2>
              <p className="mt-1 text-sm opacity-70">
                Si estás registrado en esta obra, te lo acabamos de enviar por
                SMS y por correo; puede tardar un minuto. También puede
                dictártelo quien lleva la obra.
              </p>
            </div>

            <input
              value={codigo}
              onChange={(e) => setCodigo(e.target.value)}
              inputMode="numeric"
              autoComplete="one-time-code"
              autoFocus
              placeholder="000000"
              aria-label="Código de acceso"
              className="w-full rounded-lg border px-3 py-3 text-center text-2xl tracking-[0.4em] tabular-nums"
              style={{
                borderColor: "var(--borde)",
                backgroundColor: "var(--fondo)",
              }}
            />

            <button
              type="submit"
              disabled={pendiente || !codigo.trim()}
              className="flex min-h-14 w-full items-center justify-center gap-2 rounded-lg text-base font-medium text-white disabled:opacity-60"
              style={{ backgroundColor: "var(--color-marca-600)" }}
            >
              {pendiente && (
                <LoaderCircle className="size-5 animate-spin" aria-hidden="true" />
              )}
              Entrar
            </button>

            <button
              type="button"
              onClick={() => iniciar(async () => void accionOtroContacto(obraId))}
              disabled={pendiente}
              className="w-full py-2 text-sm underline opacity-70"
            >
              Me equivoqué de número o correo
            </button>
          </form>
        ) : (
          <form action={pedir} className="space-y-4">
            <div>
              <h2 className="flex items-center gap-2 text-base font-semibold">
                <Smartphone className="size-4 opacity-70" aria-hidden="true" />
                Identifícate
              </h2>
              <p className="mt-1 text-sm opacity-70">
                Escribe el celular o el correo con el que te dieron de alta en
                esta obra. Te enviaremos un código.
              </p>
            </div>

            <input
              value={contacto}
              onChange={(e) => setContacto(e.target.value)}
              autoFocus
              placeholder="987654321 o tu@correo.com"
              aria-label="Celular o correo"
              className="w-full rounded-lg border px-3 py-3 text-base"
              style={{
                borderColor: "var(--borde)",
                backgroundColor: "var(--fondo)",
              }}
            />

            <button
              type="submit"
              disabled={pendiente || !contacto.trim()}
              className="flex min-h-14 w-full items-center justify-center gap-2 rounded-lg text-base font-medium text-white disabled:opacity-60"
              style={{ backgroundColor: "var(--color-marca-600)" }}
            >
              {pendiente && (
                <LoaderCircle className="size-5 animate-spin" aria-hidden="true" />
              )}
              Enviarme el código
            </button>

          </form>
        )}

        {error && (
          <p
            role="alert"
            className="mt-4 text-sm"
            style={{ color: "var(--color-peligro)" }}
          >
            {error}
          </p>
        )}
      </div>

      <p className="mt-6 text-center text-xs opacity-60">
        Este acceso sirve solo para adjuntar fotos de esta obra.
      </p>
    </div>
  );
}
