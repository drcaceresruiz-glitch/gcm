import "server-only";
import { prisma } from "@/lib/prisma";
import { puede } from "@/lib/rbac";
import { alcanzaObra } from "@/lib/alcance-obras";
import { hoy as hoyCalendario } from "@/utils/fechas";
import { edtDesdePresupuesto, type FilaEdt } from "@/lib/edt-desde-presupuesto";
import { diasLaborablesEntre, type DiaLaboral } from "@/lib/calendario";
import { obtenerCalendario } from "@/services/calendario.service";
import { generarPlantillaCronograma } from "@/lib/plantilla-cronograma";
import { generarProjectXml } from "@/lib/msproject-xml-escribir";
import type { SesionActiva } from "@/services/sesion.service";

/**
 * La EDT de una obra, empaquetada para llevarsela y planificarla fuera.
 *
 * POR QUE EXISTE: al cargar el presupuesto, GCM pedia a continuacion el
 * cronograma y solo ofrecia una plantilla con ejemplos inventados. Quien
 * acababa de subir 348 partidas tenia que teclear otra vez la misma
 * estructura.
 *
 * Salen DOS formatos del mismo sitio, porque no valen para lo mismo:
 *
 *   - **Excel**, para quien planifica en una hoja de calculo.
 *   - **XML de MS Project**, para quien planifica en ProjectLibre —que es
 *     gratis— o en el propio Project. ProjectLibre NO abre el Excel.
 *
 * NINGUNO SUSTITUYE a «Generar la EDT desde el presupuesto», que es mejor
 * cuando se puede: aquel escribe las tareas directamente Y las deja enlazadas
 * con su partida. Esto es para quien planifica fuera y vuelve con el plan.
 */

/** Jornada por defecto cuando la obra no tiene calendario propio. */
const MINUTOS_POR_DIA_DEFECTO = 480;

interface EdtReunida {
  ok: true;
  obra: { nombreObra: string; codigoObra: string | null };
  inicioObra: string;
  finObra: string;
  diasPlazo: number;
  minutosPorDia: number;
  filas: FilaEdt[];
}

/**
 * Todo lo que necesitan los dos formatos, leido UNA vez.
 *
 * Comparten esto a proposito: si cada uno consultara por su cuenta, un dia
 * dirian EDT distintas del mismo presupuesto.
 */
async function reunirEdt(
  sesion: SesionActiva,
  obraId: string,
): Promise<EdtReunida | { ok: false; error: string }> {
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

  const calendario = await obtenerCalendario(sesion, obraId);

  return {
    ok: true,
    obra: { nombreObra: obra.nombreObra, codigoObra: obra.codigoObra },
    // Las fechas se guardan como fecha de calendario a medianoche UTC, asi que
    // el trozo ISO ya es el dia correcto sin pasar por ninguna zona horaria.
    inicioObra: obra.fechaInicio.toISOString().slice(0, 10),
    finObra: obra.fechaFinProgramada.toISOString().slice(0, 10),
    /**
     * La duracion provisional, en dias LABORABLES del calendario de la obra.
     *
     * El importador la exige escrita y no la deduce restando las fechas, asi
     * que sin esto el archivo saldria roto de fabrica. Se mide con el
     * calendario de verdad y no con un lunes-a-viernes supuesto: la obra puede
     * trabajar sabados, y entonces el numero seria otro.
     */
    diasPlazo: diasLaborablesEntre(
      obra.fechaInicio,
      obra.fechaFinProgramada,
      calendario,
    ),
    minutosPorDia: jornadaEnMinutos(calendario),
    filas: edtDesdePresupuesto(
      partidas.map((p) => ({
        id: p.id,
        codigoPartida: p.codigoPartida,
        descripcion: p.descripcion,
        parentId: p.parentId,
        orden: p.orden,
        parcial: p.parcial?.toString() ?? null,
      })),
    ),
  };
}

/**
 * Minutos de la jornada, del primer dia laborable del calendario.
 *
 * Con el se convierten dias a duracion ISO en el XML, y es la MISMA cuenta que
 * deshace el lector: si las dos no coincidieran, el plazo cambiaria solo al ir
 * y volver.
 *
 * Se toma un dia y no un promedio a proposito: MSPDI tiene un unico
 * `<MinutesPerDay>` para todo el archivo, asi que promediar una obra que
 * trabaja cinco horas los sabados daria una jornada que no existe ningun dia.
 */
function jornadaEnMinutos(calendario: readonly DiaLaboral[]): number {
  const laborable = calendario.find((d) => d.laborable);
  if (!laborable) return MINUTOS_POR_DIA_DEFECTO;

  const minutos = Math.round(Number(laborable.horas) * 60);
  return minutos > 0 ? minutos : MINUTOS_POR_DIA_DEFECTO;
}

/** La plantilla de Excel, con la EDT de esta obra ya escrita. */
export async function plantillaCronogramaDeObra(
  sesion: SesionActiva,
  obraId: string,
): Promise<
  | { ok: true; contenido: ArrayBuffer; nombreArchivo: string }
  | { ok: false; error: string }
> {
  const base = await reunirEdt(sesion, obraId);
  if (!base.ok) return base;

  const contenido = await generarPlantillaCronograma({
    nombreObra: base.obra.nombreObra,
    // La fecha de corte se escribe YA PUESTA, con la de hoy. Dejarla vacia
    // seria una trampa: es obligatoria para importar, asi que el archivo
    // saldria roto de fabrica. Con un plan sin ejecutar, hoy es un corte
    // honesto —todo al 0 %— y el planificador puede cambiarla.
    fechaCorte: hoyCalendario().toISOString().slice(0, 10),
    inicioObra: base.inicioObra,
    finObra: base.finObra,
    diasPlazo: base.diasPlazo,
    filas: base.filas,
  });

  return {
    ok: true,
    contenido,
    // `codigoObra` es opcional: sin el, el nombre cae al identificador, que
    // siempre existe. Un archivo llamado "cronograma-null.xlsx" seria peor.
    nombreArchivo: `cronograma-${base.obra.codigoObra ?? obraId}.xlsx`,
  };
}

/** Lo mismo en XML de MS Project, que es lo que abre ProjectLibre. */
export async function cronogramaXmlDeObra(
  sesion: SesionActiva,
  obraId: string,
): Promise<
  | { ok: true; contenido: string; nombreArchivo: string }
  | { ok: false; error: string }
> {
  const base = await reunirEdt(sesion, obraId);
  if (!base.ok) return base;

  const contenido = generarProjectXml({
    nombreObra: base.obra.nombreObra,
    fechaCorte: hoyCalendario().toISOString().slice(0, 10),
    inicioObra: base.inicioObra,
    finObra: base.finObra,
    diasPlazo: base.diasPlazo,
    minutosPorDia: base.minutosPorDia,
    filas: base.filas,
  });

  return {
    ok: true,
    contenido,
    nombreArchivo: `cronograma-${base.obra.codigoObra ?? obraId}.xml`,
  };
}
