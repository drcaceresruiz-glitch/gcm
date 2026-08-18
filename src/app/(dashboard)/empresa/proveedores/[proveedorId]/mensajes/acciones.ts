"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { obtenerSesion } from "@/services/sesion.service";
import {
  escribirAlContratista,
  type Canal,
} from "@/services/mensajes-contratista.service";
import { validarAdjuntos, type AdjuntoPropuesto } from "@/lib/mensaje-contratista";

export interface RespuestaMensaje {
  ok: boolean;
  error?: string;
  mensaje?: string;
}

/// Los archivos que vienen del formulario, ya leidos.
type AdjuntoConContenido = AdjuntoPropuesto & { contenido: string };

/**
 * Lee los adjuntos del formulario.
 *
 * SE VALIDA ANTES DE LEER EL CONTENIDO. Al reves, cinco archivos de veinte
 * megas se cargarian enteros en memoria para decir despues que no cabian, y
 * este hosting anda justo de ella: es lo que ya tumbo una vez la pantalla del
 * Lookahead.
 */
async function leerAdjuntos(
  datos: FormData,
): Promise<{ ok: true; adjuntos: AdjuntoConContenido[] } | { ok: false; error: string }> {
  const archivos = datos
    .getAll("adjuntos")
    .filter((a): a is File => a instanceof File && a.size > 0);

  if (archivos.length === 0) return { ok: true, adjuntos: [] };

  const propuestos: AdjuntoPropuesto[] = archivos.map((a) => ({
    nombre: a.name,
    tipo: a.type,
    tamano: a.size,
  }));

  const validacion = validarAdjuntos(propuestos);
  if (!validacion.ok) return { ok: false, error: validacion.error };

  const adjuntos: AdjuntoConContenido[] = [];
  for (const archivo of archivos) {
    adjuntos.push({
      nombre: archivo.name,
      tipo: archivo.type,
      tamano: archivo.size,
      contenido: Buffer.from(await archivo.arrayBuffer()).toString("base64"),
    });
  }

  return { ok: true, adjuntos };
}

function canalDe(valor: FormDataEntryValue | null): Canal | null {
  return valor === "CORREO" || valor === "SMS" || valor === "WHATSAPP" ? valor : null;
}

export async function accionEscribirAlContratista(
  _previo: RespuestaMensaje,
  datos: FormData,
): Promise<RespuestaMensaje> {
  const sesion = await obtenerSesion();
  if (!sesion) redirect("/login");

  const proveedorId = String(datos.get("proveedorId") ?? "").trim();
  if (!proveedorId) return { ok: false, error: "Falta el contratista." };

  const canal = canalDe(datos.get("canal"));
  if (!canal) return { ok: false, error: "Elige por dónde mandarlo." };

  // Los adjuntos solo tienen sentido en el correo. Leerlos igualmente para
  // luego tirarlos seria gastar memoria en balde.
  const adjuntos =
    canal === "CORREO" ? await leerAdjuntos(datos) : ({ ok: true, adjuntos: [] } as const);
  if (!adjuntos.ok) return { ok: false, error: adjuntos.error };

  const obraId = String(datos.get("obraId") ?? "").trim() || null;

  const r = await escribirAlContratista(sesion, {
    proveedorId,
    obraId,
    canal,
    asunto: String(datos.get("asunto") ?? ""),
    cuerpo: String(datos.get("cuerpo") ?? ""),
    respuestaA: String(datos.get("respuestaA") ?? ""),
    adjuntos: adjuntos.adjuntos,
  });

  // El historial esta en esta misma pantalla: sin esto, se acaba de mandar un
  // mensaje y la lista de abajo sigue sin ensenarlo.
  //
  // VA ANTES DE MIRAR SI SALIO, y no es un detalle de orden. Un intento
  // fallido TAMBIEN se apunta —«se intento y no salio» es informacion—, asi
  // que si se revalidara solo en el camino bueno, la pantalla diria «todavia
  // no se le ha escrito nada» justo despues de haber apuntado el intento.
  // Paso al probarlo con el SMTP sin configurar.
  revalidatePath(`/empresa/proveedores/${proveedorId}/mensajes`);

  if (!r.ok) return { ok: false, error: r.error };

  if (r.canal === "CORREO") {
    return { ok: true, mensaje: `Correo enviado a ${r.destino}.` };
  }

  if (r.canal === "SMS") {
    // «Encolado» y no «recibido»: el SMS sale de un telefono con su SIM y
    // nadie puede prometer la entrega.
    return { ok: true, mensaje: `SMS encolado para ${r.destino}.` };
  }

  return {
    ok: true,
    mensaje: "Apuntado en el historial. Ábrelo ahora en WhatsApp para mandarlo.",
  };
}
