import "server-only";

import { prisma } from "@/lib/prisma";
import { motivoNoAdmiteCambios } from "@/lib/obras";
import { alcanzaObra, FUERA_DE_ALCANCE } from "@/lib/alcance-obras";
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
 *
 * ---
 *
 * **Y por eso mismo es tambien donde se comprueba el ACCESO a la obra.**
 *
 * La pregunta que contesta esta funcion no es «esta cerrada» sino «puede
 * este usuario cambiar algo aqui», y no tener la obra asignada es una
 * respuesta tan valida como tenerla cerrada. Al vivir aqui, las treinta
 * servicios que ya la llaman —setenta y seis escrituras— quedan cubiertos sin
 * tocar ni uno: la accion de servidor no pasa por el layout de la obra, asi
 * que sin esto un residente podia escribir en una obra ajena mandando su id,
 * aunque no pudiera verla en ninguna pantalla.
 *
 * El nombre se queda corto para lo que hace. Se mantiene porque renombrar
 * setenta y seis llamadas en la misma entrega que abre el alcance mezcla dos
 * cambios de naturaleza distinta en un solo diff.
 */
export async function motivoSiObraCerrada(
  sesion: SesionActiva,
  obraId: string,
  /// Se propaga tal cual a `motivoNoAdmiteCambios`: default restrictivo,
  /// solo las escrituras que "cierran" (no "abren") pasan
  /// `{ permiteEnParalizada: true }`. Ver el comentario de esa funcion.
  opciones: { permiteEnParalizada?: boolean } = {},
): Promise<string | null> {
  /**
   * Antes de consultar: el alcance viaja en la sesion y no cuesta nada.
   *
   * Se responde lo mismo exista la obra o no —y por eso va ANTES del
   * `findFirst`—: si contestara distinto, probar ids seria una forma de
   * averiguar que obras tiene la constructora.
   */
  if (!alcanzaObra(sesion, obraId)) return FUERA_DE_ALCANCE;

  const obra = await prisma.project.findFirst({
    // El filtro por empresa va aqui tambien: una obra de otro cliente no
    // existe, y responder "cerrada" o "abierta" sobre ella ya seria contar
    // algo que no le corresponde a quien pregunta.
    where: { id: obraId, companyId: sesion.companyId },
    // El estado de la EMPRESA viaja en la misma consulta, no en otra: esta
    // guarda corre en cada escritura y anadirle un viaje mas a la base seria
    // pagar setenta y seis veces por un dato que ya se esta trayendo.
    select: {
      estado: true,
      archivadaEn: true,
      company: { select: { enMigracionAt: true } },
    },
  });

  // La obra inexistente NO se trata aqui: cada servicio ya comprueba que
  // existe y tiene su propio mensaje. Inventar uno distinto desde la guarda
  // solo confundiria sobre que fallo.
  if (!obra) return null;

  return motivoNoAdmiteCambios(
    {
      estado: obra.estado,
      archivadaEn: obra.archivadaEn,
      empresaEnMigracion: obra.company.enMigracionAt !== null,
    },
    opciones,
  );
}
