import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { obtenerSesion } from "@/services/sesion.service";
import { listarEmisores } from "@/services/emisor-sms.service";
import { puede } from "@/lib/rbac";
import { env } from "@/lib/env";
import { Volver } from "@/components/ui/Volver";
import { PanelAyuda } from "@/components/ui/PanelAyuda";
import { IlustracionDocumento } from "@/components/ui/IlustracionDocumento";
import { EmisoresSms } from "@/components/empresa/EmisoresSms";
import { RemitenteCorreo } from "@/components/empresa/RemitenteCorreo";
import { PlantillasMensaje } from "@/components/empresa/PlantillasMensaje";
import { listarPlantillas } from "@/services/plantillas-mensaje.service";
import { leerRemitente } from "@/services/remitente-correo.service";
import { hayBuzonCompartido } from "@/services/mailer.service";
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

  const [emisores, remitente, plantillas] = await Promise.all([
    listarEmisores(sesion),
    leerRemitente(sesion),
    listarPlantillas(sesion),
  ]);

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
    </div>
  );
}
