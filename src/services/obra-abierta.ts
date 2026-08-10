import "server-only";

import { prisma } from "@/lib/prisma";
import { obraAdmiteCambios, OBRA_CERRADA } from "@/lib/obras";
import type { SesionActiva } from "@/services/sesion.service";

/**
 * La guarda de "obra cerrada", en un solo sitio.
 *
 * Hasta el 10 de agosto de 2026 la pantalla decia "Cerrada: no admite mas
 * cambios" y no era verdad: `CERRADA` solo impedia cambiar de estado. En una
 * obra cerrada se seguia pudiendo importar presupuesto, editar partidas, crear
 * ordenes de compra, registrar avance y cerrar semanas. El cartel era una
 * etiqueta, no una regla.
 *
 * Vive en su propio modulo y no en `obras.service` para que cualquier servicio
 * pueda usarla sin arrastrar el resto: `ordenes`, `plan-semanal` o `revisiones`
 * importando `obras.service` crearia dependencias cruzadas entre modulos que
 * hoy no se conocen entre si.
 *
 * Cuesta UNA consulta por escritura. Se acepta: las escrituras son escasas
 * comparadas con las lecturas, ya hacen varias consultas cada una, y la
 * alternativa —confiar en que cada servicio se acuerde de pedir el estado en
 * su propio `select`— es justo el tipo de disciplina que falla en cuanto
 * alguien anade un servicio nuevo.
 *
 * Devuelve el mensaje de error, o `null` si la obra admite cambios. Se
 * devuelve el texto y no un booleano para que ningun servicio se invente su
 * propia forma de explicarlo.
 */
export async function motivoSiObraCerrada(
  sesion: SesionActiva,
  obraId: string,
): Promise<string | null> {
  const obra = await prisma.project.findFirst({
    // El filtro por empresa va aqui tambien: una obra de otro cliente no
    // existe, y responder "cerrada" o "abierta" sobre ella ya seria contar
    // algo que no le corresponde a quien pregunta.
    where: { id: obraId, companyId: sesion.companyId },
    select: { estado: true },
  });

  // La obra inexistente NO se trata aqui: cada servicio ya comprueba que
  // existe y tiene su propio mensaje. Inventar uno distinto desde la guarda
  // solo confundiria sobre que fallo.
  if (!obra) return null;

  return obraAdmiteCambios(obra.estado) ? null : OBRA_CERRADA;
}
