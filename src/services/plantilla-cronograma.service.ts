import "server-only";
import { prisma } from "@/lib/prisma";
import { puede } from "@/lib/rbac";
import { alcanzaObra } from "@/lib/alcance-obras";
import { hoy as hoyCalendario } from "@/utils/fechas";
import { edtDesdePresupuesto } from "@/lib/edt-desde-presupuesto";
import { diasLaborablesEntre } from "@/lib/calendario";
import { obtenerCalendario } from "@/services/calendario.service";
import { generarPlantillaCronograma } from "@/lib/plantilla-cronograma";
import type { SesionActiva } from "@/services/sesion.service";

/**
 * La plantilla del cronograma YA LLENA con la EDT de una obra.
 *
 * Por que existe: al cargar el presupuesto, GCM pedia a continuacion el
 * cronograma y solo ofrecia una plantilla con ejemplos inventados. Quien
 * acababa de subir 348 partidas tenia que teclear otra vez la misma
 * estructura. Ahora se la lleva escrita y solo pone las fechas.
 *
 * NO SUSTITUYE a «Generar la EDT desde el presupuesto», que es mejor cuando se
 * puede: aquel escribe las tareas directamente Y las deja enlazadas con su
 * partida. Esto es para quien planifica FUERA —en Excel, o abriendo despues el
 * XML en ProjectLibre— y vuelve con el plan hecho.
 *
 * Devuelve `null` cuando la obra no tiene presupuesto: no hay EDT que exportar,
 * y la pantalla debe ofrecer la generica en su lugar.
 */
export async function plantillaCronogramaDeObra(
  sesion: SesionActiva,
  obraId: string,
): Promise<
  | { ok: true; contenido: ArrayBuffer; nombreArchivo: string }
  | { ok: false; error: string }
> {
  if (!puede(sesion, "cronograma:importar")) {
    return { ok: false, error: "No tienes permiso para cargar el cronograma." };
  }

  // La puerta va ANTES de consultar, como en los dos embudos de obra: si
  // contestara distinto segun la obra exista, probar identificadores seria una
  // forma de averiguar que obras tiene la empresa.
  if (!alcanzaObra(sesion, obraId)) {
    return { ok: false, error: "No tienes acceso a esta obra." };
  }

  const obra = await prisma.project.findFirst({
    where: { id: obraId, companyId: sesion.companyId },
    select: {
      nombreObra: true,
      codigoObra: true,
      // El plazo contractual: con el se rellenan las fechas provisionales de
      // todas las filas. Sin fechas el archivo no se puede importar.
      fechaInicio: true,
      fechaFinProgramada: true,
    },
  });
  if (!obra) return { ok: false, error: "Obra no encontrada." };

  const partidas = await prisma.wbsItem.findMany({
    where: { projectId: obraId },
    select: {
      id: true,
      codigoPartida: true,
      descripcion: true,
      parentId: true,
      orden: true,
      // Sin el importe no se sabe quien es hoja: lo decide el dinero, no la
      // forma del arbol. Ver `lib/edt-desde-presupuesto`.
      parcial: true,
    },
  });

  if (partidas.length === 0) {
    return {
      ok: false,
      error:
        "Esta obra no tiene presupuesto todavia. Cargalo primero: la EDT del " +
        "cronograma sale de el.",
    };
  }

  const filas = edtDesdePresupuesto(
    partidas.map((p) => ({
      id: p.id,
      codigoPartida: p.codigoPartida,
      descripcion: p.descripcion,
      parentId: p.parentId,
      orden: p.orden,
      parcial: p.parcial?.toString() ?? null,
    })),
  );

  /**
   * La duracion provisional, en dias LABORABLES del calendario de la obra.
   *
   * El importador la exige escrita y no la deduce restando las fechas, asi que
   * sin esto el archivo saldria roto de fabrica. Se mide con el calendario de
   * verdad y no con un lunes-a-viernes supuesto: la obra puede trabajar
   * sabados, y entonces el numero seria otro.
   */
  const calendario = await obtenerCalendario(sesion, obraId);
  const diasPlazo = diasLaborablesEntre(
    obra.fechaInicio,
    obra.fechaFinProgramada,
    calendario,
  );

  const contenido = await generarPlantillaCronograma({
    nombreObra: obra.nombreObra,
    // La fecha de corte se escribe YA PUESTA, con la de hoy. Dejarla vacia
    // seria una trampa: es obligatoria para importar, asi que el archivo
    // saldria roto de fabrica. Con un plan sin ejecutar, hoy es un corte
    // honesto —todo al 0 %— y el planificador puede cambiarla.
    fechaCorte: hoyCalendario().toISOString().slice(0, 10),
    // Las fechas se guardan como fecha de calendario a medianoche UTC, asi que
    // el trozo ISO ya es el dia correcto sin pasar por ninguna zona horaria.
    inicioObra: obra.fechaInicio.toISOString().slice(0, 10),
    finObra: obra.fechaFinProgramada.toISOString().slice(0, 10),
    diasPlazo,
    filas,
  });

  return {
    ok: true,
    contenido,
    // `codigoObra` es opcional: sin el, el nombre cae al identificador, que
    // siempre existe. Un archivo llamado "cronograma-null.xlsx" seria peor.
    nombreArchivo: `cronograma-${obra.codigoObra ?? obraId}.xlsx`,
  };
}
