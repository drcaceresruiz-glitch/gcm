"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { AlertCircle, CheckCircle2, LoaderCircle, Mail, Send } from "lucide-react";

import { Tarjeta, SeccionTarjeta } from "@/components/ui/Tarjeta";
import { haceCuanto } from "@/utils/fechas";
import {
  accionGuardarRemitente,
  accionProbarRemitente,
  accionCambiarEstadoRemitente,
  accionCambiarLecturaRespuestas,
  type EstadoRemitente,
} from "@/app/(dashboard)/empresa/configuracion/acciones-remitente";
import type { RemitenteEnPantalla } from "@/services/remitente-correo.service";

/**
 * Desde que buzon sale el correo de esta constructora.
 *
 * LO QUE PASA SIN CONFIGURARLO DEPENDE DE LA INSTALACION, y por eso no se da
 * por hecho en ningun texto:
 *
 * - **Con buzon compartido** (la version web, donde GCM opera el servidor):
 *   el correo sale igual por una direccion tecnica. Poner el propio es una
 *   mejora —lo que ve quien recibe y a donde va la respuesta—, no un
 *   requisito.
 * - **Sin buzon compartido** (la version instalable, donde GCM vende el
 *   programa y no opera nada): NO SALE NI UN CORREO hasta que la constructora
 *   ponga el suyo. Deja de ser una mejora y pasa a ser el unico camino.
 *
 * Decirle a la segunda que «sale por el buzon compartido de GCM» seria
 * prometer un servicio que ahi no existe, y ademas dejaria creer que el
 * informe llego cuando no salio.
 *
 * LA CONTRASENA NUNCA VUELVE A LA PANTALLA. El campo nace vacio incluso
 * cuando hay una guardada, y vacio significa «conserva la que ya estaba». Si
 * viajara de vuelta acabaria en el HTML del formulario y en el historial del
 * navegador.
 */

function Boton({
  children,
  variante = "principal",
}: {
  children: React.ReactNode;
  variante?: "principal" | "suave";
}) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-60"
      style={
        variante === "principal"
          ? { backgroundColor: "var(--color-marca-600)", color: "white" }
          : { border: "1px solid var(--borde)" }
      }
    >
      {pending && <LoaderCircle className="size-4 animate-spin" aria-hidden />}
      {children}
    </button>
  );
}

function Mensaje({ estado }: { estado: EstadoRemitente }) {
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

export function RemitenteCorreo({
  remitente,
  hayLlave,
  hayCompartido,
}: {
  remitente: RemitenteEnPantalla | null;
  /// Sin llave de cifrado en el servidor no se puede guardar ninguna
  /// contrasena. Se dice en pantalla en vez de dejar que el formulario falle
  /// al guardar: el problema no lo puede arreglar quien lo esta leyendo.
  hayLlave: boolean;
  /// Si esta instalacion tiene un buzon al que caer. Cambia el tono entero de
  /// la seccion: mejora opcional o unico camino. Ver la cabecera.
  hayCompartido: boolean;
}) {
  const [guardado, guardar] = useActionState(accionGuardarRemitente, {});
  const [probado, probar] = useActionState(accionProbarRemitente, {});
  const [estado, cambiarEstado] = useActionState(
    accionCambiarEstadoRemitente,
    {},
  );
  const [lectura, cambiarLectura] = useActionState(
    accionCambiarLecturaRespuestas,
    {},
  );

  return (
    <Tarjeta>
      <SeccionTarjeta
        primera
        titulo="Desde qué buzón sale tu correo"
        nota={
          hayCompartido
            ? "El informe y los avisos salen desde una dirección técnica de esta instalación. Con tu buzón, el cliente los ve llegar desde tu constructora y la respuesta te llega a ti."
            : "Esta instalación no envía correo por su cuenta: el informe y los avisos salen desde el buzón que configures aquí, y solo desde él."
        }
      >
        <p className="flex items-start gap-2 text-sm opacity-70">
          <Mail className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span className="text-pretty">
            {remitente?.activo
              ? "Ahora mismo sale desde tu buzón."
              : hayCompartido
                ? "Ahora mismo sale por el buzón compartido de esta instalación."
                : "Ahora mismo no sale ningún correo. Ni el informe al cliente, ni los avisos, ni las claves temporales de tus usuarios: hasta que configures tu buzón hay que comunicarlas a mano."}
          </span>
        </p>
      </SeccionTarjeta>

      {!hayLlave && (
        <p
          className="mt-3 flex items-start gap-2 rounded-lg px-3 py-2 text-sm"
          style={{
            backgroundColor:
              "color-mix(in oklab, var(--color-alerta) 14%, transparent)",
          }}
        >
          <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span className="text-pretty">
            Esta instalación no tiene clave de cifrado configurada, así que no
            se puede guardar la contraseña de un buzón. Habla con quien
            administra el servidor.
          </span>
        </p>
      )}

      {remitente && (
        <div
          className="mt-4 rounded-lg border p-3 text-sm"
          style={{ borderColor: "var(--borde)" }}
        >
          <p className="flex flex-wrap items-center gap-2">
            <strong>{remitente.remitenteCorreo}</strong>
            <span className="opacity-70">
              · {remitente.host}:{remitente.puerto}
            </span>
          </p>

          {/* Configurado NO es lo mismo que funciona, y la diferencia se dice
              aqui: sin esto, el primer correo que falla es el que iba al
              cliente. */}
          <p className="mt-1 opacity-80">
            {!remitente.activo
              ? hayCompartido
                ? "Apagado: el correo sale por el buzón compartido."
                : "Apagado, y esta instalación no tiene otro: no sale ningún correo."
              : remitente.verificadoAt
                ? `Probado ${haceCuanto(remitente.verificadoAt)} y funcionó.`
                : "Guardado pero sin probar todavía."}
          </p>

          {remitente.ultimoError && (
            <p className="mt-1 opacity-80">
              Último fallo{" "}
              {remitente.ultimoErrorAt && haceCuanto(remitente.ultimoErrorAt)}:{" "}
              {remitente.ultimoError}
            </p>
          )}

          <div className="mt-3 flex flex-wrap gap-2">
            <form action={probar}>
              <Boton variante="suave">
                <Send className="size-4" aria-hidden />
                Enviar correo de prueba
              </Boton>
            </form>

            <form action={cambiarEstado}>
              <input
                type="hidden"
                name="activo"
                value={remitente.activo ? "0" : "1"}
              />
              <Boton variante="suave">
                {remitente.activo ? "Apagar" : "Encender"}
              </Boton>
            </form>
          </div>

          <Mensaje estado={probado} />
          <Mensaje estado={estado} />

          {/* LEER EL BUZON ES OTRO PERMISO, no una casilla mas del envio. Va
              en su propio bloque y apagado por defecto: haber configurado el
              envio dice «manda en mi nombre», no «lee mi correo». */}
          <div
            className="mt-4 rounded-lg border p-3"
            style={{ borderColor: "var(--borde)" }}
          >
            <p className="text-sm font-medium">
              Recoger las respuestas de los contratistas
            </p>
            <p className="mt-1 text-sm opacity-70 text-pretty">
              {remitente.leerRespuestas
                ? "GCM mira este buzón y pone dentro de la obra lo que responden los contratistas. Solo lee lo que contesta a un mensaje enviado desde GCM; el resto no lo toca ni lo guarda, y nunca marca ni borra nada."
                : "Ahora las respuestas llegan a tu buzón y ahí se quedan. Si lo enciendes, GCM las pondrá dentro de la obra, junto al mensaje que las provocó. Solo leerá lo que conteste a un mensaje suyo."}
            </p>

            {/* ENCENDIDO NO ES FUNCIONANDO, igual que configurado no es
                probado. Sin esto, un buzon que no se puede leer se ve
                exactamente igual que un buzon donde nadie ha contestado, y el
                unico rastro del fallo estaba en la consola del servidor. */}
            {remitente.leerRespuestas && (
              <p className="mt-2 flex items-start gap-2 text-sm">
                {remitente.lecturaError ? (
                  <>
                    <AlertCircle
                      className="mt-0.5 size-4 shrink-0"
                      style={{ color: "var(--color-alerta)" }}
                      aria-hidden
                    />
                    <span className="text-pretty">
                      <strong>No se está pudiendo leer el buzón</strong>
                      {remitente.lecturaErrorAt &&
                        ` (${haceCuanto(remitente.lecturaErrorAt)})`}
                      : {remitente.lecturaError}
                      <br />
                      <span className="opacity-70">
                        Mientras siga así, las respuestas se quedan en tu buzón
                        y no entran en la obra. Suele ser la contraseña
                        cambiada, o que el correo entrante de tu proveedor no
                        esté en el mismo servidor que el de salida.
                      </span>
                    </span>
                  </>
                ) : remitente.leidoHastaAt ? (
                  <span className="opacity-80">
                    Última lectura correcta {haceCuanto(remitente.leidoHastaAt)}.
                  </span>
                ) : (
                  <span className="opacity-80">
                    Encendido, pero todavía no se ha leído ninguna vez. La
                    primera pasada llega en unos minutos.
                  </span>
                )}
              </p>
            )}

            <form action={cambiarLectura} className="mt-2">
              <input
                type="hidden"
                name="leer"
                value={remitente.leerRespuestas ? "0" : "1"}
              />
              <Boton variante="suave">
                {remitente.leerRespuestas
                  ? "Dejar de recoger"
                  : "Recoger las respuestas"}
              </Boton>
            </form>

            <Mensaje estado={lectura} />
          </div>
        </div>
      )}

      <form action={guardar} className="mt-4 space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-sm">
            <span className="font-medium">Servidor de salida (SMTP)</span>
            <input
              name="host"
              defaultValue={remitente?.host ?? ""}
              placeholder="mail.tuempresa.pe"
              className="mt-1 w-full rounded-lg border px-3 py-2"
              style={{ borderColor: "var(--borde)" }}
            />
          </label>

          <label className="text-sm">
            <span className="font-medium">Puerto</span>
            <input
              name="puerto"
              defaultValue={remitente?.puerto ?? 465}
              inputMode="numeric"
              className="mt-1 w-full rounded-lg border px-3 py-2"
              style={{ borderColor: "var(--borde)" }}
            />
            <span className="mt-1 block text-xs opacity-70">
              465 es lo habitual. Con 587 se usa STARTTLS.
            </span>
          </label>

          <label className="text-sm">
            <span className="font-medium">Usuario</span>
            <input
              name="usuario"
              defaultValue={remitente?.usuario ?? ""}
              placeholder="obras@tuempresa.pe"
              className="mt-1 w-full rounded-lg border px-3 py-2"
              style={{ borderColor: "var(--borde)" }}
            />
          </label>

          <label className="text-sm">
            <span className="font-medium">Contraseña</span>
            <input
              name="clave"
              type="password"
              autoComplete="new-password"
              placeholder={remitente?.hayClave ? "Guardada — déjalo vacío para conservarla" : ""}
              className="mt-1 w-full rounded-lg border px-3 py-2"
              style={{ borderColor: "var(--borde)" }}
            />
          </label>

          <label className="text-sm">
            <span className="font-medium">Nombre que se verá</span>
            <input
              name="remitenteNombre"
              defaultValue={remitente?.remitenteNombre ?? ""}
              placeholder="CONSTRUCTORA X SAC"
              className="mt-1 w-full rounded-lg border px-3 py-2"
              style={{ borderColor: "var(--borde)" }}
            />
          </label>

          <label className="text-sm">
            <span className="font-medium">Dirección de envío</span>
            <input
              name="remitenteCorreo"
              defaultValue={remitente?.remitenteCorreo ?? ""}
              placeholder="obras@tuempresa.pe"
              className="mt-1 w-full rounded-lg border px-3 py-2"
              style={{ borderColor: "var(--borde)" }}
            />
            <span className="mt-1 block text-xs opacity-70">
              Casi siempre la misma que el usuario. Si no coinciden, muchos
              servidores rechazan el envío.
            </span>
          </label>
        </div>

        <Boton>{remitente ? "Guardar cambios" : "Guardar buzón"}</Boton>
        <Mensaje estado={guardado} />
      </form>
    </Tarjeta>
  );
}
