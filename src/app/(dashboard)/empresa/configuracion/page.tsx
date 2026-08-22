import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Bot, AlertCircle, CheckCircle2 } from "lucide-react";
import { obtenerSesion } from "@/services/sesion.service";
import { listarEmisores } from "@/services/emisor-sms.service";
import { puede } from "@/lib/rbac";
import { env } from "@/lib/env";
import { Volver } from "@/components/ui/Volver";
import { PanelAyuda } from "@/components/ui/PanelAyuda";
import { IlustracionDocumento } from "@/components/ui/IlustracionDocumento";
import { Tarjeta, SeccionTarjeta } from "@/components/ui/Tarjeta";
import { EmisoresSms } from "@/components/empresa/EmisoresSms";
import { RemitenteCorreo } from "@/components/empresa/RemitenteCorreo";
import { PlantillasMensaje } from "@/components/empresa/PlantillasMensaje";
import { VistaPreviaRoles } from "@/components/empresa/VistaPreviaRoles";
import { listarPlantillas } from "@/services/plantillas-mensaje.service";
import { leerRemitente } from "@/services/remitente-correo.service";
import { hayBuzonCompartido } from "@/services/mailer.service";
import { listarProveedoresIa } from "@/services/agente-ia.service";
import { hayLlaveDeCifrado } from "@/lib/secreto";

export const metadata: Metadata = { title: "Configuración" };

/**
 * El tablero de configuracion de la empresa.
 *
 * Una sola entrada en el menu, con secciones dentro. El desplegable de
 * empresa ya llego a tener siete entradas planas y hubo que agruparlo: lo que
 * se configure de aqui en adelante crece DENTRO de esta pagina, no al lado.
 *
 * Regla para lo que se anada: cada opcion tiene que decir a que afecta y que
 * se rompe si se apaga. Un panel de ajustes que solo enumera interruptores
 * obliga a probar para entender.
 */
export default async function ConfiguracionPage() {
  const sesion = await obtenerSesion();
  if (!sesion) redirect("/login");

  if (!puede(sesion, "configuracion:editar")) redirect("/panel");

  const [emisores, remitente, plantillas, proveedoresIa] = await Promise.all([
    listarEmisores(sesion),
    leerRemitente(sesion),
    listarPlantillas(sesion),
    listarProveedoresIa(sesion),
  ]);
  const proveedorIaActivo = proveedoresIa.find((p) => p.activo) ?? null;

  return (
    <div className="space-y-8">
      <div>
        <Volver href="/panel">Volver al panel</Volver>

        <h1 className="mt-3 text-2xl font-semibold tracking-tight">
          Configuración
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-pretty opacity-70">
          Lo que decide cómo funciona GCM para tu empresa. Solo lo ve quien
          administra.
        </p>
      </div>

      {/* El buzon propio va ARRIBA del emisor de SMS: el correo lo usa todo el
          mundo desde el primer dia y el SMS es opcional. Ancho completo,
          porque su formulario son seis campos. */}
      <RemitenteCorreo
        remitente={remitente}
        hayLlave={hayLlaveDeCifrado()}
        hayCompartido={hayBuzonCompartido()}
      />

      {/* Debajo del buzon y encima del emisor de SMS: es texto que se manda
          por cualquiera de los tres canales, asi que no cuelga de ninguno. */}
      <PlantillasMensaje plantillas={plantillas} />

      <div className="grid items-start gap-6 lg:grid-cols-[3fr_2fr]">
        {/* La direccion se calcula, no se escribe: si algun dia GCM vive en
            otro dominio, la pantalla seguiria dictando el viejo y nadie
            entenderia por que el telefono no pregunta. */}
        <EmisoresSms
          emisores={emisores}
          direccionCola={`${env.APP_URL.replace(/\/$/, "")}/api/sms/cola`}
        />

        <PanelAyuda
          ilustracion={<IlustracionDocumento />}
          puntos={[
            {
              titulo: "Sin teléfono vinculado no salen SMS",
              texto:
                "Los códigos de acceso y los del pase de obra llegarán solo por correo. Nadie se queda fuera, pero en obra el correo no se mira.",
            },
            {
              titulo: "El teléfono tiene que estar despierto",
              texto:
                "Android duerme la aplicación al apagar la pantalla si no se le quita el ahorro de batería. Si un teléfono aparece como dormido, es eso casi siempre.",
            },
            {
              titulo: "El token se ve una sola vez",
              texto:
                "Se guarda cifrado y no se puede volver a mirar. Si se pierde, se revoca ese teléfono y se vincula otro. Es incómodo a propósito.",
            },
            {
              titulo: "Quien tenga ese teléfono ve los códigos",
              texto:
                "Por la cola viajan en claro los códigos de acceso de tu gente, durante los segundos que tardan en salir. Guárdalo como las llaves de la obra.",
            },
          ]}
        />
      </div>

      {/* Al final: es la unica seccion de esta pagina que no hace falta
          tocar el primer dia, y la mas facil de dejar tal como esta. */}
      <VistaPreviaRoles activa={sesion.previsualizacionHabilitada} />

      {/* Subpagina propia (lista, puede crecer), pero YA NO discreta: desde
          que existe el Asistente (Fase 2a) esto deja de ser infraestructura
          sin consumidor -es lo que decide si el asistente puede responder o
          no-, asi que se anuncia lo que afecta, igual que cualquier otra
          tarjeta de esta pagina. */}
      <Tarjeta>
        <SeccionTarjeta
          primera
          titulo="Proveedores de IA"
          nota="La clave con la que el Asistente le pregunta a un proveedor de inteligencia artificial. Sin uno activo, el Asistente no puede responder."
        >
          <p className="flex items-start gap-2 text-sm opacity-70">
            <Bot className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            {proveedorIaActivo ? (
              <span className="text-pretty">
                <CheckCircle2
                  className="mr-1 inline size-4 align-text-bottom"
                  style={{ color: "var(--color-exito)" }}
                  aria-hidden="true"
                />
                Activo: <strong>{proveedorIaActivo.nombre}</strong>
                {proveedoresIa.length > 1 &&
                  ` (${proveedoresIa.length} proveedores guardados en total).`}
              </span>
            ) : proveedoresIa.length > 0 ? (
              <span className="text-pretty">
                <AlertCircle
                  className="mr-1 inline size-4 align-text-bottom"
                  style={{ color: "var(--color-alerta)" }}
                  aria-hidden="true"
                />
                {proveedoresIa.length} proveedor(es) guardado(s), pero ninguno
                activo — el Asistente no puede responder todavía.
              </span>
            ) : (
              <span className="text-pretty">
                <AlertCircle
                  className="mr-1 inline size-4 align-text-bottom"
                  style={{ color: "var(--color-alerta)" }}
                  aria-hidden="true"
                />
                Sin ningún proveedor configurado — el Asistente no puede
                responder todavía.
              </span>
            )}
          </p>

          <Link
            href="/empresa/configuracion/ia"
            className="mt-4 inline-flex items-center gap-2 rounded-lg border px-4 py-2 text-sm font-medium"
            style={{ borderColor: "var(--borde)" }}
          >
            Configurar proveedores de IA
          </Link>
        </SeccionTarjeta>
      </Tarjeta>

      {/* Herramienta de diagnostico, no un ajuste: por eso va aparte, al
          final del todo, y como enlace de texto y no como una tarjeta mas.
          Existe para contrastar los umbrales de lib/capacidad.ts contra
          semanas reales ya cerradas -ver el comentario de esa pantalla. */}
      <p className="text-xs opacity-60">
        <Link href="/empresa/configuracion/capacidad" className="underline">
          Historial de capacidad (diagnóstico)
        </Link>
      </p>
    </div>
  );
}
