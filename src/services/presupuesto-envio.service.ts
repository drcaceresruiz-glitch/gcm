import "server-only";

import { analizarDestinatarios } from "@/lib/destinatarios";
import { soles } from "@/utils/formato";
import { sumar } from "@/lib/decimal";
import { listarPartidas, obtenerObra } from "@/services/obras.service";
import { generarPresupuestoPdf } from "@/services/presupuesto-pdf.service";
import { correoPresupuestoContractual, enviarCorreo } from "@/services/mailer.service";
import { prisma } from "@/lib/prisma";
import type { SesionActiva } from "@/services/sesion.service";

/**
 * Enviar el presupuesto al cliente.
 *
 * **Solo el CONTRACTUAL sale por aqui, y no es un parametro.** El meta y la
 * comparativa llevan el costo real y la bolsa; un correo es la forma mas
 * facil de que eso salga de la empresa por descuido, y un descuido de estos
 * no se deshace. Quien los necesite los descarga y decide a mano que hace con
 * ellos.
 *
 * El correo no repite las cifras del PDF salvo el total, que es lo que se
 * lee sin abrir el adjunto. Y ese total lo mide el servidor: un correo
 * firmado por la constructora no puede decir una cifra que la constructora no
 * sabe.
 */

const MAX_NOTA = 500;

export type ResultadoEnvioPresupuesto =
  | { ok: true; enviados: number; total: number; archivo: string }
  | { ok: false; error: string };

export async function enviarPresupuestoPorCorreo(
  sesion: SesionActiva,
  obraId: string,
  datos: { para: string; nota?: string },
): Promise<ResultadoEnvioPresupuesto> {
  const destinos = analizarDestinatarios(datos.para);
  if (!destinos.ok) return { ok: false, error: destinos.error };

  // El permiso lo comprueba el generador: mandar el presupuesto fuera no
  // puede ser mas facil que verlo dentro.
  const pdf = await generarPresupuestoPdf(sesion, obraId, "contractual");
  if (!pdf.ok) return { ok: false, error: pdf.error };

  const [obra, arbol] = await Promise.all([
    obtenerObra(sesion, obraId),
    listarPartidas(sesion, obraId),
  ]);
  if (!obra) return { ok: false, error: "Obra no encontrada." };

  // Solo las hojas suman: un capitulo lleva la suma de lo que cuelga de el.
  const conHijas = new Set(arbol.filas.map((f) => f.parentId).filter(Boolean));
  const total = sumar(
    arbol.filas
      .filter((f) => !conHijas.has(f.id))
      .map((f) => f.parcial)
      .filter((p): p is string => p !== null),
  );

  const cuerpo = correoPresupuestoContractual({
    obra: obra.nombreObra,
    total: soles(total),
    nota: datos.nota?.trim().slice(0, MAX_NOTA) || undefined,
    remitente: `${sesion.nombres} ${sesion.apellidos}`.trim(),
    adjunto: pdf.nombre,
  });

  const adjuntos = [
    {
      nombre: pdf.nombre,
      contenido: Buffer.from(pdf.bytes).toString("base64"),
      tipo: "application/pdf",
    },
  ];

  const resultados = await Promise.all(
    destinos.lista.map((para) =>
      // Con `companyId` para que lleve el logo: este correo va al cliente y es
      // de la constructora, no de GCM.
      enviarCorreo({ ...cuerpo, para, adjuntos, companyId: sesion.companyId }),
    ),
  );
  const enviados = resultados.filter((r) => r.enviado).length;

  if (enviados === 0) {
    return {
      ok: false,
      error:
        "No se pudo enviar el correo. Puede que el servidor de correo no esté configurado.",
    };
  }

  /**
   * Queda apuntado, y con a quien.
   *
   * Un presupuesto que sale de la empresa es un acto contractual: meses
   * despues, «¿esa cifra se la mandamos?» tiene que poder responderse sin
   * buscar en el buzon de nadie.
   */
  await prisma.auditLog.create({
    data: {
      companyId: sesion.companyId,
      userId: sesion.userId,
      projectId: obraId,
      // Mismo criterio que el envio del informe: se apunta el ENVIO como
      // entidad propia en vez de esperar a una migracion del vocabulario.
      entidad: "EnvioPresupuesto",
      entidadId: obraId,
      accion: "CREATE",
      despues: { total, para: destinos.lista, enviados, archivo: pdf.nombre },
    },
  });

  return { ok: true, enviados, total: destinos.lista.length, archivo: pdf.nombre };
}
