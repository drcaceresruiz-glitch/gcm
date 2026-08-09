"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { obtenerSesion } from "@/services/sesion.service";
import { registrarAvance, marcarLineaBase } from "@/services/cronograma.service";
import { enviarCorreo, correoCurvaAvance } from "@/services/mailer.service";
import { obtenerObra } from "@/services/obras.service";
import { puede } from "@/lib/rbac";

export interface RespuestaAvance {
  ok: boolean;
  error?: string;
  /// UID de la tarea reportada, para que la tabla sepa cual acaba de cambiar.
  uid?: number;
}

/**
 * Reporta el avance de una tarea desde la tabla del cronograma.
 *
 * No redirige: la tabla se queda donde esta y el usuario sigue reportando
 * otras filas. `revalidatePath` basta para que la pantalla se repinte con el
 * dato nuevo.
 */
export async function accionRegistrarAvance(
  _previo: RespuestaAvance,
  datos: FormData,
): Promise<RespuestaAvance> {
  const sesion = await obtenerSesion();
  if (!sesion) redirect("/login");

  const obraId = String(datos.get("obraId") ?? "");
  const uid = Number(datos.get("uid"));

  if (!obraId || !Number.isSafeInteger(uid)) {
    return { ok: false, error: "Falta la tarea o la obra." };
  }

  const resultado = await registrarAvance(sesion, obraId, {
    uid,
    porcentaje: String(datos.get("porcentaje") ?? ""),
    fecha: String(datos.get("fecha") ?? ""),
    nota: String(datos.get("nota") ?? ""),
  });

  if (!resultado.ok) return { ok: false, error: resultado.error, uid };

  revalidatePath(`/obras/${obraId}/cronograma`);
  return { ok: true, uid };
}

export interface EstadoLineaBase {
  ok?: boolean;
  error?: string;
}

/**
 * Fija una version del cronograma como linea base.
 *
 * Solo pasa los identificadores; el permiso y la validacion (que el corte sea
 * de la obra y la empresa) viven en el servicio. `revalidatePath` repinta la
 * pantalla con el distintivo nuevo y el EVM ya medido contra la base.
 */
export async function accionMarcarLineaBase(
  _previo: EstadoLineaBase,
  datos: FormData,
): Promise<EstadoLineaBase> {
  const sesion = await obtenerSesion();
  if (!sesion) redirect("/login");

  const obraId = String(datos.get("obraId") ?? "");
  const cronogramaId = String(datos.get("cronogramaId") ?? "");

  if (!obraId || !cronogramaId) {
    return { ok: false, error: "Falta la obra o el corte." };
  }

  const resultado = await marcarLineaBase(sesion, obraId, cronogramaId);
  if (!resultado.ok) return { ok: false, error: resultado.error };

  revalidatePath(`/obras/${obraId}/cronograma`);
  return { ok: true };
}

export interface RespuestaEnvio {
  ok: boolean;
  error?: string;
  mensaje?: string;
}

/// Un PNG del grafico a doble tamano ronda los 200 KB; el margen cubre
/// pantallas grandes sin dejar que se cuele un adjunto de varios megas.
const MAXIMO_IMAGEN = 2 * 1024 * 1024;

/**
 * Envia la curva de avance por correo, con el grafico adjunto.
 *
 * La imagen la genera el NAVEGADOR y viaja aqui en base64. Es lo unico que
 * cabe: producirla en el servidor exigiria un navegador sin ventana, y este
 * despliegue no puede correr binarios compilados —es el mismo motivo por el
 * que el cliente de Prisma va en JavaScript puro—.
 */
export async function accionEnviarCurva(
  _previo: RespuestaEnvio,
  datos: FormData,
): Promise<RespuestaEnvio> {
  const sesion = await obtenerSesion();
  if (!sesion) redirect("/login");

  const obraId = String(datos.get("obraId") ?? "");
  if (!obraId) return { ok: false, error: "Falta la obra." };

  // Se exige poder LEER el cronograma: enviarlo por correo es sacarlo de la
  // aplicacion, y no puede ser mas facil que verlo dentro.
  if (!puede(sesion, "cronograma:leer")) {
    return { ok: false, error: "No tienes permiso para ver este cronograma." };
  }

  const destinatarios = String(datos.get("para") ?? "")
    .split(/[,;\s]+/)
    .map((d) => d.trim())
    .filter(Boolean);

  if (destinatarios.length === 0) {
    return { ok: false, error: "Escribe al menos un correo de destino." };
  }

  // Validacion deliberadamente simple: lo que de verdad decide si una
  // direccion existe es el propio envio.
  const invalido = destinatarios.find((d) => !/^[^@\s]+@[^@\s.]+\.[^@\s]+$/.test(d));
  if (invalido) return { ok: false, error: `"${invalido}" no parece un correo valido.` };

  if (destinatarios.length > 10) {
    return { ok: false, error: "Como mucho diez destinatarios por envio." };
  }

  const imagen = String(datos.get("imagen") ?? "");
  if (!imagen) return { ok: false, error: "No se pudo preparar el grafico." };
  if (imagen.length > MAXIMO_IMAGEN) {
    return { ok: false, error: "El grafico ha salido demasiado grande." };
  }

  // Ademas de dar el nombre, es lo que confirma que la obra es de la empresa
  // de quien envia: sin esto, cambiando el identificador se podria sacar por
  // correo el nombre de una obra ajena.
  const obra = await obtenerObra(sesion, obraId);
  if (!obra) return { ok: false, error: "Obra no encontrada." };

  const cuerpo = correoCurvaAvance({
    obra: obra.nombreObra,
    corte: String(datos.get("corte") ?? ""),
    planeado: String(datos.get("planeado") ?? ""),
    real: String(datos.get("real") ?? ""),
    desfase: String(datos.get("desfase") ?? ""),
    ritmo: String(datos.get("ritmo") ?? ""),
    termino: String(datos.get("termino") ?? ""),
    nota: String(datos.get("nota") ?? "").trim().slice(0, 500) || undefined,
    remitente: `${sesion.nombres} ${sesion.apellidos}`.trim(),
  });

  const adjunto = {
    nombre: `curva-avance-${String(datos.get("corte") ?? "").replace(/\//g, "-")}.png`,
    contenido: imagen,
    tipo: "image/png",
  };

  // Se envia uno a uno y no con todos en el "para": asi ningun destinatario ve
  // la lista de los demas, que en un correo de obra puede incluir al cliente.
  const resultados = await Promise.all(
    destinatarios.map((para) => enviarCorreo({ ...cuerpo, para, adjuntos: [adjunto] })),
  );

  const enviados = resultados.filter((r) => r.enviado).length;

  if (enviados === 0) {
    return {
      ok: false,
      error:
        "No se pudo enviar el correo. Puede que el servidor de correo no este configurado.",
    };
  }

  return {
    ok: true,
    mensaje:
      enviados === destinatarios.length
        ? `Enviado a ${enviados} destinatario(s).`
        : `Enviado a ${enviados} de ${destinatarios.length}. Revisa las direcciones que fallaron.`,
  };
}
