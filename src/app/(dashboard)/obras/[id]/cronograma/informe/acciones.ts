"use server";

import { redirect } from "next/navigation";
import { obtenerSesion } from "@/services/sesion.service";
import { enviarInformePorCorreo } from "@/services/informe-envio.service";
import { enviarInformePorSms } from "@/services/informe-sms.service";

export interface RespuestaEnvioInforme {
  ok: boolean;
  error?: string;
  mensaje?: string;
}

/**
 * Envia el informe por correo.
 *
 * La accion solo resuelve la sesion y traduce el resultado: quien decide es el
 * servicio, que es donde estan el permiso, la composicion del informe y el
 * apunte de auditoria.
 *
 * Del formulario NO viene ni una cifra: solo la obra, el corte, los
 * destinatarios y la nota. Las cifras del correo las mide el servidor, para
 * que un correo firmado por GCM no pueda decir algo que GCM no sabe.
 *
 * No hay `revalidatePath`: enviar un correo no cambia nada de la pantalla.
 */
export async function accionEnviarInforme(
  _previo: RespuestaEnvioInforme,
  datos: FormData,
): Promise<RespuestaEnvioInforme> {
  const sesion = await obtenerSesion();
  if (!sesion) redirect("/login");

  const obraId = String(datos.get("obraId") ?? "");
  if (!obraId) return { ok: false, error: "Falta la obra." };

  const corte = String(datos.get("corte") ?? "").trim();

  const r = await enviarInformePorCorreo(sesion, obraId, {
    corteISO: corte || undefined,
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

/**
 * Envia el resumen del informe por SMS.
 *
 * Mismo reparto que el correo: aqui solo la sesion y la traduccion del
 * resultado; el permiso, el texto de 160 caracteres y la auditoria los pone el
 * servicio. Del formulario no viene ni una cifra, solo los numeros.
 */
export async function accionEnviarInformeSms(
  _previo: RespuestaEnvioInforme,
  datos: FormData,
): Promise<RespuestaEnvioInforme> {
  const sesion = await obtenerSesion();
  if (!sesion) redirect("/login");

  const obraId = String(datos.get("obraId") ?? "");
  if (!obraId) return { ok: false, error: "Falta la obra." };

  const corte = String(datos.get("corte") ?? "").trim();

  const r = await enviarInformePorSms(sesion, obraId, {
    corteISO: corte || undefined,
    numeros: String(datos.get("numeros") ?? ""),
  });

  if (!r.ok) return { ok: false, error: r.error };

  // Se dice ENCOLADO y no «recibido»: el SMS sale de un telefono con su SIM y
  // nadie puede prometer la entrega. Prometerla en la pantalla del residente
  // seria mentir.
  return {
    ok: true,
    mensaje:
      r.enviados === r.total
        ? `Encolado para ${r.enviados} celular(es).`
        : `Encolado para ${r.enviados} de ${r.total}. Revisa los numeros que fallaron.`,
  };
}
