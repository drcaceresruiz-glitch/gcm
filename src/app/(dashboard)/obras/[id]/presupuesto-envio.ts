"use server";

import { redirect } from "next/navigation";
import { obtenerSesion } from "@/services/sesion.service";
import { enviarPresupuestoPorCorreo } from "@/services/presupuesto-envio.service";

/**
 * Manda el presupuesto contractual por correo.
 *
 * Del formulario solo vienen los destinatarios y la nota. Ni una cifra: el
 * total del correo y el PDF adjunto los produce el servidor desde la base, de
 * modo que un correo firmado por la constructora no pueda decir un numero que
 * la constructora no tiene.
 *
 * No hay `revalidatePath`: mandar un correo no cambia nada de la pantalla.
 */
export interface RespuestaEnvioPresupuesto {
  ok: boolean;
  error?: string;
  mensaje?: string;
}

export async function accionEnviarPresupuesto(
  _previo: RespuestaEnvioPresupuesto,
  datos: FormData,
): Promise<RespuestaEnvioPresupuesto> {
  const sesion = await obtenerSesion();
  if (!sesion) redirect("/login");

  const obraId = String(datos.get("obraId") ?? "");
  if (!obraId) return { ok: false, error: "Falta la obra." };

  const r = await enviarPresupuestoPorCorreo(sesion, obraId, {
    para: String(datos.get("para") ?? ""),
    nota: String(datos.get("nota") ?? ""),
  });

  if (!r.ok) return { ok: false, error: r.error };

  return {
    ok: true,
    mensaje:
      r.enviados === r.total
        ? `Enviado a ${r.enviados} destinatario(s), con ${r.archivo} adjunto.`
        : `Enviado a ${r.enviados} de ${r.total}. Revisa las direcciones que fallaron.`,
  };
}
