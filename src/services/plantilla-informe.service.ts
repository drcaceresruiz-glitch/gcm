import "server-only";
import { prisma } from "@/lib/prisma";
import { puede } from "@/lib/rbac";
import {
  ELECCION_POR_DEFECTO,
  PLANTILLAS_INFORME,
  SECCIONES_INFORME,
  escribirApagadas,
  leerEleccion,
  seccionesDelInforme,
  type PlantillaInforme,
  type SeccionInformeClave,
} from "@/lib/plantilla-informe";
import type { SesionActiva } from "@/services/sesion.service";

/**
 * Que hojas lleva el informe de esta obra: se lee aqui, se decide en
 * `lib/plantilla-informe`.
 *
 * La OBRA manda sobre la empresa cuando ha elegido algo, y manda entera. Las
 * dos consultas van en un lote: es la misma pregunta hecha a dos niveles.
 */

export interface EleccionResuelta {
  plantilla: PlantillaInforme;
  incluidas: SeccionInformeClave[];
  apagadas: SeccionInformeClave[];
  origen: "obra" | "empresa";
}

export async function eleccionDeInforme(
  sesion: SesionActiva,
  obraId: string,
): Promise<EleccionResuelta> {
  const [empresa, obra] = await Promise.all([
    prisma.company.findUnique({
      where: { id: sesion.companyId },
      select: { plantillaInforme: true, seccionesInformeOff: true },
    }),
    // Con el filtro de empresa, como toda lectura de obra: el identificador
    // llega de la URL.
    prisma.project.findFirst({
      where: { id: obraId, companyId: sesion.companyId },
      select: { plantillaInforme: true, seccionesInformeOff: true },
    }),
  ]);

  const deLaEmpresa = empresa
    ? leerEleccion(empresa.plantillaInforme, empresa.seccionesInformeOff)
    : ELECCION_POR_DEFECTO;

  // Solo cuenta como eleccion de la obra si de verdad eligio plantilla. Una
  // obra que nunca toco esto tiene las dos columnas en NULL y hereda.
  const deLaObra =
    obra?.plantillaInforme != null
      ? leerEleccion(obra.plantillaInforme, obra.seccionesInformeOff)
      : null;

  return seccionesDelInforme(deLaEmpresa, deLaObra);
}

export type ResultadoEleccion = { ok: true } | { ok: false; error: string };

function validar(
  plantilla: string,
  apagadas: readonly string[],
): { ok: true; plantilla: PlantillaInforme; apagadas: SeccionInformeClave[] } | { ok: false; error: string } {
  const nombre = PLANTILLAS_INFORME.find((p) => p === plantilla);
  if (!nombre) return { ok: false, error: "Esa plantilla de informe no existe." };

  const claves = apagadas.filter((a): a is SeccionInformeClave =>
    SECCIONES_INFORME.some((s) => s === a),
  );

  return { ok: true, plantilla: nombre, apagadas: claves };
}

/** La eleccion por defecto de toda la constructora. */
export async function guardarEleccionDeEmpresa(
  sesion: SesionActiva,
  plantilla: string,
  apagadas: readonly string[],
): Promise<ResultadoEleccion> {
  // El mismo permiso que el resto de `/empresa/configuracion`, que es donde
  // vive: esto gobierna lo que sale en TODOS los informes de la constructora.
  if (!puede(sesion, "configuracion:editar")) {
    return { ok: false, error: "No tienes permiso para cambiar la configuración." };
  }

  const v = validar(plantilla, apagadas);
  if (!v.ok) return v;

  await prisma.company.update({
    where: { id: sesion.companyId },
    data: {
      plantillaInforme: v.plantilla,
      seccionesInformeOff: escribirApagadas(v.apagadas),
    },
  });

  return { ok: true };
}

/**
 * La eleccion de UNA obra, que pisa la de la empresa.
 *
 * `plantilla` vacia devuelve la obra a heredar: se limpian las DOS columnas,
 * no solo la del nombre. Dejar las apagadas puestas mientras la plantilla
 * vuelve a NULL crearia una obra que hereda la plantilla de la empresa pero
 * conserva unos interruptores que ya nadie ve en pantalla.
 */
export async function guardarEleccionDeObra(
  sesion: SesionActiva,
  obraId: string,
  plantilla: string,
  apagadas: readonly string[],
): Promise<ResultadoEleccion> {
  if (!puede(sesion, "obra:editar")) {
    return { ok: false, error: "No tienes permiso para editar la obra." };
  }

  const obra = await prisma.project.findFirst({
    where: { id: obraId, companyId: sesion.companyId },
    select: { id: true },
  });
  if (!obra) return { ok: false, error: "Obra no encontrada." };

  if (plantilla.trim() === "") {
    await prisma.project.update({
      where: { id: obra.id },
      data: { plantillaInforme: null, seccionesInformeOff: null },
    });
    return { ok: true };
  }

  const v = validar(plantilla, apagadas);
  if (!v.ok) return v;

  await prisma.project.update({
    where: { id: obra.id },
    data: {
      plantillaInforme: v.plantilla,
      seccionesInformeOff: escribirApagadas(v.apagadas),
    },
  });

  return { ok: true };
}
