import "server-only";

import { prisma } from "@/lib/prisma";
import { puede } from "@/lib/rbac";
import { motivoSiEmpresaEnMigracion } from "@/services/empresa-migracion.service";
import type { SesionActiva } from "@/services/sesion.service";

/**
 * Mensajes reutilizables para escribir a un contratista.
 *
 * Hermano de las formas de pago plantilla, y con el mismo reparto de permisos
 * que ya usa el modulo de mensajeria, que NO es el mismo para las dos cosas:
 *
 * - **Escribirlas** es configuracion de la empresa (`configuracion:editar`):
 *   es decidir como le habla la constructora a sus contratistas.
 * - **Usarlas** es de quien escribe (`proveedor:contactar`), que incluye al
 *   residente. El que esta en obra usa las plantillas; no las redacta.
 *
 * GCM no trae ninguna escrita. Una plantilla de fabrica sonaria a GCM y no a
 * la constructora, y ademas nadie la borraria: se quedaria ahi diciendo cosas
 * que esa empresa no dice.
 */

export interface PlantillaEnPantalla {
  id: string;
  nombre: string;
  asunto: string | null;
  cuerpo: string;
}

export type ResultadoPlantilla =
  | { ok: true; id: string }
  | { ok: false; error: string };

/// Los limites son los de las columnas, para que salten aqui con un mensaje
/// legible y no como un error de la base a mitad de la escritura.
const MAX_NOMBRE = 100;
const MAX_ASUNTO = 200;
const MAX_CUERPO = 5000;

/**
 * Las plantillas activas de la empresa.
 *
 * Las pide tanto la pantalla de configuracion como la de escribir, y por eso
 * acepta cualquiera de los dos permisos: negarle la lista a quien puede
 * escribir dejaria el desplegable vacio sin explicar por que.
 */
export async function listarPlantillas(
  sesion: SesionActiva,
): Promise<PlantillaEnPantalla[]> {
  if (
    !puede(sesion, "configuracion:editar") &&
    !puede(sesion, "proveedor:contactar")
  ) {
    return [];
  }

  return prisma.plantillaMensaje.findMany({
    where: { companyId: sesion.companyId, activa: true },
    orderBy: { nombre: "asc" },
    select: { id: true, nombre: true, asunto: true, cuerpo: true },
  });
}

export async function guardarPlantilla(
  sesion: SesionActiva,
  datos: { id?: string; nombre: string; asunto: string; cuerpo: string },
): Promise<ResultadoPlantilla> {
  if (!puede(sesion, "configuracion:editar")) {
    return {
      ok: false,
      error: "No tienes permiso para configurar las plantillas de la empresa.",
    };
  }

  const congelada = await motivoSiEmpresaEnMigracion(sesion.companyId);
  if (congelada) return { ok: false, error: congelada };

  const nombre = datos.nombre.trim().replace(/\s+/g, " ");
  const cuerpo = datos.cuerpo.trim();
  const asunto = datos.asunto.trim();

  if (!nombre) return { ok: false, error: "Ponle un nombre para reconocerla." };
  if (nombre.length > MAX_NOMBRE) {
    return { ok: false, error: `El nombre no puede pasar de ${MAX_NOMBRE} caracteres.` };
  }
  if (!cuerpo) return { ok: false, error: "Una plantilla vacia no sirve de nada." };
  if (cuerpo.length > MAX_CUERPO) {
    return { ok: false, error: `El mensaje no puede pasar de ${MAX_CUERPO} caracteres.` };
  }
  if (asunto.length > MAX_ASUNTO) {
    return { ok: false, error: `El asunto no puede pasar de ${MAX_ASUNTO} caracteres.` };
  }

  const campos = { nombre, asunto: asunto || null, cuerpo };

  try {
    if (datos.id) {
      /**
       * `updateMany` con el `companyId` en el `where`, no `update` por id.
       *
       * Es lo que impide editar la plantilla de otra constructora acertando su
       * id: con `update` habria que leerla antes para comprobarlo, y esa
       * comprobacion se olvida. Que no toque ninguna fila ES la negativa.
       */
      const { count } = await prisma.plantillaMensaje.updateMany({
        where: { id: datos.id, companyId: sesion.companyId },
        data: campos,
      });
      if (count === 0) return { ok: false, error: "Plantilla no encontrada." };
      return { ok: true, id: datos.id };
    }

    const creada = await prisma.plantillaMensaje.create({
      data: { companyId: sesion.companyId, ...campos },
      select: { id: true },
    });
    return { ok: true, id: creada.id };
  } catch (e) {
    // El unico es (empresa, nombre): dos plantillas con el mismo nombre en el
    // desplegable no se distinguen, que es justo lo que se quiere evitar.
    const codigo =
      typeof e === "object" && e !== null && "code" in e
        ? String((e as { code: unknown }).code)
        : "";
    if (codigo === "P2002") {
      return { ok: false, error: `Ya tienes una plantilla llamada «${nombre}».` };
    }
    return { ok: false, error: "No se pudo guardar. Vuelve a intentarlo." };
  }
}

/**
 * Retira una plantilla.
 *
 * Se DESACTIVA, no se borra, igual que un proveedor: los mensajes ya enviados
 * con ella siguen en el historial, y dejar la fila permite entender de donde
 * salio aquel texto. Ademas, borrar liberaria su nombre y otra nueva podria
 * ocuparlo, que confunde al leer historia vieja.
 */
export async function retirarPlantilla(
  sesion: SesionActiva,
  id: string,
): Promise<ResultadoPlantilla> {
  if (!puede(sesion, "configuracion:editar")) {
    return {
      ok: false,
      error: "No tienes permiso para configurar las plantillas de la empresa.",
    };
  }

  const congelada = await motivoSiEmpresaEnMigracion(sesion.companyId);
  if (congelada) return { ok: false, error: congelada };

  const { count } = await prisma.plantillaMensaje.updateMany({
    where: { id, companyId: sesion.companyId },
    data: { activa: false },
  });
  if (count === 0) return { ok: false, error: "Plantilla no encontrada." };

  return { ok: true, id };
}
