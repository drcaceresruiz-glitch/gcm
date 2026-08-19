"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { obtenerSesion } from "@/services/sesion.service";
import {
  guardarRemitente,
  cambiarEstadoRemitente,
  cambiarLecturaRespuestas,
  probarRemitente,
} from "@/services/remitente-correo.service";
import { hayBuzonCompartido } from "@/services/mailer.service";

/**
 * Acciones del buzon propio de la empresa.
 *
 * En su propio archivo y no junto a las del emisor de SMS porque aqui pasa una
 * CONTRASENA por el formulario: tenerlas separadas hace obvio de un vistazo
 * cual es el archivo que la maneja, y que no se cuele en un `console.log` de
 * depuracion puesto para otra cosa.
 *
 * Todo el criterio —permiso, validacion, cifrado— vive en el servicio. La
 * comprobacion se repite alli y no solo en la pagina porque una accion de
 * servidor es un endpoint invocable sin haber pintado nunca la pantalla.
 */

export interface EstadoRemitente {
  error?: string;
  ok?: string;
}

export async function accionGuardarRemitente(
  _previo: EstadoRemitente,
  datos: FormData,
): Promise<EstadoRemitente> {
  const sesion = await obtenerSesion();
  if (!sesion) redirect("/login");

  const r = await guardarRemitente(sesion, {
    host: String(datos.get("host") ?? ""),
    puerto: String(datos.get("puerto") ?? ""),
    usuario: String(datos.get("usuario") ?? ""),
    // NO se recorta ni se normaliza: una contrasena puede empezar o terminar
    // con espacio a proposito, y «limpiarla» aqui daria un fallo de
    // autenticacion imposible de entender desde la pantalla.
    clave: String(datos.get("clave") ?? ""),
    remitenteNombre: String(datos.get("remitenteNombre") ?? ""),
    remitenteCorreo: String(datos.get("remitenteCorreo") ?? ""),
  });

  if (!r.ok) return { error: r.error };

  revalidatePath("/empresa/configuracion");
  return { ok: "Buzón guardado. Pruébalo para confirmar que sale el correo." };
}

export async function accionProbarRemitente(
  _previo: EstadoRemitente,
): Promise<EstadoRemitente> {
  const sesion = await obtenerSesion();
  if (!sesion) redirect("/login");

  const r = await probarRemitente(sesion);
  revalidatePath("/empresa/configuracion");

  return r.ok
    ? { ok: `Correo de prueba enviado a ${sesion.email}. Míralo para confirmar que llegó.` }
    : { error: r.error };
}

export async function accionCambiarLecturaRespuestas(
  _previo: EstadoRemitente,
  datos: FormData,
): Promise<EstadoRemitente> {
  const sesion = await obtenerSesion();
  if (!sesion) redirect("/login");

  const leer = datos.get("leer") === "1";
  const r = await cambiarLecturaRespuestas(sesion, leer);
  if (!r.ok) return { error: r.error };

  revalidatePath("/empresa/configuracion");

  return {
    ok: leer
      ? "Listo. Las respuestas de los contratistas aparecerán dentro de la obra. La primera lectura tarda unos minutos."
      : "GCM deja de mirar tu buzón. Las respuestas seguirán llegando ahí, pero ya no entrarán en la aplicación.",
  };
}

export async function accionCambiarEstadoRemitente(
  _previo: EstadoRemitente,
  datos: FormData,
): Promise<EstadoRemitente> {
  const sesion = await obtenerSesion();
  if (!sesion) redirect("/login");

  const activo = datos.get("activo") === "1";
  const r = await cambiarEstadoRemitente(sesion, activo);
  if (!r.ok) return { error: r.error };

  revalidatePath("/empresa/configuracion");

  // Que pasa al apagarlo depende de si esta instalacion tiene buzon
  // compartido. En la version instalable no lo hay, y decir que «sale por el
  // compartido» dejaria creer que el informe salio cuando no sale nada.
  if (!activo && !hayBuzonCompartido()) {
    return {
      ok: "Apagado. Esta instalación no tiene otro buzón, así que hasta que lo enciendas no saldrá ningún correo.",
    };
  }

  return {
    ok: activo
      ? "El correo vuelve a salir desde tu buzón."
      : "Apagado. El correo sale por el buzón compartido de esta instalación.",
  };
}
