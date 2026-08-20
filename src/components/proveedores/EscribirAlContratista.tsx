"use client";

import { useActionState, useMemo, useState } from "react";
import { LoaderCircle, Mail, MessageCircle, Paperclip, Send, Smartphone } from "lucide-react";

import { Nota } from "@/components/ui/Nota";
import {
  MAX_ASUNTO,
  MAX_CUERPO,
  MIMES_ADJUNTO,
  textoSmsAlContratista,
  textoWhatsAppAlContratista,
} from "@/lib/mensaje-contratista";
import { MAX_SMS } from "@/lib/texto-sms";
import type { PlantillaEnPantalla } from "@/services/plantillas-mensaje.service";
import { enlaceWhatsApp } from "@/lib/whatsapp";
import {
  accionEscribirAlContratista,
  type RespuestaMensaje,
} from "@/app/(dashboard)/empresa/proveedores/[proveedorId]/mensajes/acciones";

type Canal = "CORREO" | "SMS" | "WHATSAPP";

export interface DatosContratista {
  id: string;
  razonSocial: string;
  email: string | null;
  celular: string | null;
  telefonoEnFicha: string | null;
  obra: { id: string; nombre: string } | null;
  hayCanalSms: boolean;
  respuestaPorDefecto: string;
  /// Si GCM recoge las respuestas. Cambia el campo «Responder a» por la
  /// promesa de que la respuesta aparecera aqui, que solo es cierta con esto.
  respuestasEnGcm: boolean;
  firmaEmpresa: string;
}

/**
 * Escribirle a un contratista por el canal que se elija.
 *
 * LOS TRES CANALES NO SE PARECEN, y la pantalla no lo disimula: el correo lo
 * manda GCM y admite adjuntos; el SMS lo encola GCM y se ve ANTES de mandarlo,
 * porque cabe lo que cabe; y el WhatsApp no lo manda GCM en absoluto —se
 * prepara el texto y lo abre la persona en su telefono—.
 *
 * Cuando un canal no se puede usar se dice QUE falta y DONDE se arregla, en
 * vez de ensenar un boton apagado: un boton muerto sin explicacion se lee como
 * una funcion rota. Es la misma regla del envio del informe por SMS.
 */
export function EscribirAlContratista({
  contratista,
  plantillas,
}: {
  contratista: DatosContratista;
  /// Los mensajes que la empresa repite. Vacio si no ha guardado ninguno, y
  /// entonces el desplegable no se pinta.
  plantillas: PlantillaEnPantalla[];
}) {
  const [canal, setCanal] = useState<Canal>(contratista.email ? "CORREO" : "WHATSAPP");
  const [cuerpo, setCuerpo] = useState("");
  const [asunto, setAsunto] = useState("");
  const [estado, enviar, enviando] = useActionState<RespuestaMensaje, FormData>(
    accionEscribirAlContratista,
    { ok: false },
  );

  const firma = useMemo(
    () => ({ empresa: contratista.firmaEmpresa, obra: contratista.obra?.nombre ?? null }),
    [contratista.firmaEmpresa, contratista.obra?.nombre],
  );

  // Se calcula igual aunque el canal sea otro: es lo que deja ver el coste de
  // cambiar a SMS sin tener que cambiar y volver.
  const sms = useMemo(
    () => (cuerpo.trim() ? textoSmsAlContratista(firma, cuerpo) : ""),
    [firma, cuerpo],
  );
  const paraWhatsApp = useMemo(
    () =>
      enlaceWhatsApp(
        textoWhatsAppAlContratista(firma, cuerpo || ""),
        contratista.celular ?? contratista.telefonoEnFicha,
      ),
    [firma, cuerpo, contratista.celular, contratista.telefonoEnFicha],
  );

  const aceptados = [...MIMES_ADJUNTO.keys()].join(",");

  const canales: { id: Canal; rotulo: string; Icono: typeof Mail }[] = [
    { id: "CORREO", rotulo: "Correo", Icono: Mail },
    { id: "SMS", rotulo: "SMS", Icono: Smartphone },
    { id: "WHATSAPP", rotulo: "WhatsApp", Icono: MessageCircle },
  ];

  return (
    <form
      action={enviar}
      className="space-y-4 rounded-lg border p-4"
      style={{ borderColor: "var(--borde)", backgroundColor: "var(--superficie)" }}
    >
      <input type="hidden" name="proveedorId" value={contratista.id} />
      <input type="hidden" name="obraId" value={contratista.obra?.id ?? ""} />
      <input type="hidden" name="canal" value={canal} />

      <div className="flex flex-wrap gap-2" role="group" aria-label="Por dónde mandarlo">
        {canales.map(({ id, rotulo, Icono }) => (
          <button
            key={id}
            type="button"
            onClick={() => setCanal(id)}
            aria-pressed={canal === id}
            className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium"
            style={{
              borderColor: canal === id ? "var(--color-marca-600)" : "var(--borde)",
              color: canal === id ? "var(--color-marca-600)" : undefined,
            }}
          >
            <Icono className="size-4" aria-hidden="true" />
            {rotulo}
          </button>
        ))}
      </div>

      {canal === "CORREO" && !contratista.email && (
        <Nota tono="peligro">
          {contratista.razonSocial} no tiene correo en su ficha. Añádelo en el
          catálogo de proveedores y vuelve.
        </Nota>
      )}

      {canal === "SMS" && !contratista.celular && (
        <Nota tono="peligro">
          {contratista.telefonoEnFicha
            ? `«${contratista.telefonoEnFicha}» no es un celular de nueve cifras, así que no se le puede mandar un SMS. Por WhatsApp sí puedes escribirle.`
            : `${contratista.razonSocial} no tiene celular en su ficha. Añádelo en el catálogo de proveedores.`}
        </Nota>
      )}

      {canal === "SMS" && contratista.celular && !contratista.hayCanalSms && (
        <Nota tono="peligro">
          Esta empresa todavía no tiene teléfono emisor, así que GCM no puede
          enviar SMS. El texto de abajo está listo para copiarlo mientras tanto.
          Se vincula en Empresa → Configuración.
        </Nota>
      )}

      {/* Las plantillas de la empresa. Solo se pinta si hay alguna: un
          desplegable vacio es una promesa incumplida.

          COPIA Y NO BLOQUEA: al elegir una, su texto entra en los campos y
          sigue siendo editable. Lo que se manda es lo que la persona ve antes
          de pulsar, no lo que diga la plantilla. */}
      {plantillas.length > 0 && (
        <label className="block text-xs">
          <span className="block opacity-70">
            Usar una plantilla <span className="opacity-60">(luego la puedes cambiar)</span>
          </span>
          <select
            value=""
            onChange={(e) => {
              const p = plantillas.find((x) => x.id === e.target.value);
              if (!p) return;
              setCuerpo(p.cuerpo);
              if (p.asunto) setAsunto(p.asunto);
            }}
            className="mt-1 w-full max-w-sm rounded-lg border px-2 py-1.5 text-sm"
            style={{ borderColor: "var(--borde)", backgroundColor: "var(--fondo)" }}
          >
            <option value="">Escribir desde cero</option>
            {plantillas.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nombre}
              </option>
            ))}
          </select>
        </label>
      )}

      {canal === "CORREO" && (
        <label className="block text-xs">
          <span className="block opacity-70">Asunto</span>
          <input
            name="asunto"
            type="text"
            maxLength={MAX_ASUNTO}
            required
            value={asunto}
            onChange={(e) => setAsunto(e.target.value)}
            placeholder="Falta el plano de la zona 1"
            className="mt-1 w-full rounded-lg border px-3 py-2 text-sm"
            style={{ borderColor: "var(--borde)", backgroundColor: "var(--fondo)" }}
          />
        </label>
      )}

      <label className="block text-xs">
        <span className="block opacity-70">Mensaje</span>
        <textarea
          name="cuerpo"
          rows={5}
          required
          maxLength={MAX_CUERPO}
          value={cuerpo}
          onChange={(e) => setCuerpo(e.target.value)}
          placeholder="Mañana no hay agua en la obra, no programen vaciado."
          className="mt-1 w-full rounded-lg border px-3 py-2 text-sm"
          style={{ borderColor: "var(--borde)", backgroundColor: "var(--fondo)" }}
        />
      </label>

      {canal === "CORREO" && (
        <>
          <label className="block text-xs">
            <span className="block opacity-70">
              <Paperclip className="mr-1 inline size-3" aria-hidden="true" />
              Adjuntos (opcional)
            </span>
            <input
              name="adjuntos"
              type="file"
              multiple
              accept={aceptados}
              className="mt-1 w-full rounded-lg border px-3 py-2 text-sm"
              style={{ borderColor: "var(--borde)", backgroundColor: "var(--fondo)" }}
            />
            <span className="mt-1 block opacity-60">
              PDF, imágenes, hojas de cálculo y documentos de Word. Hasta 5 MB
              cada uno y 10 MB entre todos.
            </span>
          </label>

          {contratista.respuestasEnGcm ? (
            /* Con GCM leyendo el buzón no hay nada que elegir: la respuesta
               tiene que volver al buzón de la empresa, que es el único que
               GCM puede abrir. Dejar el campo dejaría desviarla a un correo
               personal y romper la función sin que se note. */
            <p
              className="rounded-lg border p-3 text-xs"
              style={{ borderColor: "var(--borde)" }}
            >
              Cuando conteste, <strong>su respuesta aparecerá aquí</strong>, en
              el historial de este contratista
              {contratista.obra ? " y en la obra" : ""}. Te avisará la
              campanita.
            </p>
          ) : (
            <label className="block text-xs">
              <span className="block opacity-70">Responder a</span>
              <input
                name="respuestaA"
                type="email"
                defaultValue={contratista.respuestaPorDefecto}
                placeholder={contratista.respuestaPorDefecto}
                className="mt-1 w-full rounded-lg border px-3 py-2 text-sm"
                style={{ borderColor: "var(--borde)", backgroundColor: "var(--fondo)" }}
              />
              <span className="mt-1 block opacity-60">
                A dónde le llega la respuesta cuando conteste. Si lo dejas
                vacío, va a tu correo. GCM no la recoge: para que aparezca
                dentro de la obra hay que activar la lectura del buzón en
                Empresa → Configuración.
              </span>
            </label>
          )}
        </>
      )}

      {canal === "SMS" && (
        <div className="rounded-lg border p-3" style={{ borderColor: "var(--borde)" }}>
          <p className="mb-1 text-xs opacity-70">Le llegará esto:</p>
          <p className="font-mono text-xs break-words">{sms || "—"}</p>
          <p className="mt-2 text-xs opacity-60">
            {sms.length} de {MAX_SMS} caracteres. Va sin tildes y sin enlaces a
            propósito: una sola tilde baja el límite a 70, y las operadoras
            marcan como spam los SMS con enlaces.
          </p>
        </div>
      )}

      {canal === "WHATSAPP" && (
        <Nota tono="exito">
          GCM no manda WhatsApp: prepara el texto y lo abres tú desde el tuyo.
          Al darle a «Apuntar y abrir» queda registrado en el historial y se
          abre WhatsApp con el mensaje escrito.
        </Nota>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={
            enviando ||
            (canal === "CORREO" && !contratista.email) ||
            (canal === "SMS" && (!contratista.celular || !contratista.hayCanalSms))
          }
          className="flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          style={{ backgroundColor: "var(--color-marca-600)" }}
        >
          {enviando ? (
            <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
          ) : (
            <Send className="size-4" aria-hidden="true" />
          )}
          {canal === "WHATSAPP" ? "Apuntar y abrir" : "Enviar"}
        </button>

        {canal === "WHATSAPP" && cuerpo.trim() && (
          <a
            href={paraWhatsApp}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-lg border px-4 py-2 text-sm font-medium"
            style={{ borderColor: "var(--borde)" }}
          >
            <MessageCircle className="size-4" aria-hidden="true" />
            Abrir WhatsApp
          </a>
        )}
      </div>

      {estado.error && <Nota tono="peligro">{estado.error}</Nota>}
      {estado.ok && estado.mensaje && <Nota tono="exito">{estado.mensaje}</Nota>}
    </form>
  );
}
