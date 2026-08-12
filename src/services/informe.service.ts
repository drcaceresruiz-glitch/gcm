import "server-only";
import { obtenerObra } from "./obras.service";
import { obtenerEmpresa } from "./empresa.service";
import {
  datosCurvaS,
  informeAlCorte,
  type CorteDisponible,
  type DatosCurva,
  type PeriodoInforme,
} from "./cronograma.service";
import { lastPlannerAlCorte, type LastPlannerAlCorte } from "./plan-semanal.service";
import {
  agruparPorCapitulo,
  alertasDeAtraso,
  partidasActivas,
  type AlertaAtraso,
  type Capitulo,
  type PartidaActiva,
} from "@/lib/control-avance";
import { puede } from "@/lib/rbac";
import type { SesionActiva } from "./sesion.service";

/**
 * El informe de obra a una fecha, compuesto una sola vez.
 *
 * Existe porque el mismo informe sale ya por tres puertas —la pantalla que se
 * imprime, la descarga en hoja de calculo y el correo— y las tres necesitan
 * exactamente los mismos datos medidos a la misma fecha. Con la composicion
 * repetida en cada puerta, el dia que se anada un bloque o cambie un filtro
 * habria que acordarse de las tres, y la que se olvide empieza a decir algo
 * distinto sin que nadie lo note hasta que un cliente compara el papel con el
 * Excel.
 *
 * El orden de las llamadas NO es casual: `lastPlannerAlCorte` va despues del
 * `Promise.all` porque necesita la fecha que decide `informeAlCorte` —una
 * `?corte=` invalida o futura cae al ultimo corte real—, y pedirlo antes
 * obligaria a resolver dos veces cual es el corte elegido.
 */

export interface InformeCompuesto {
  empresa: string;
  obra: string;
  ubicacion: string | null;
  fechaCorte: Date;
  version: number;
  importadoPor: string;
  planeadoProject: string | null;
  realProject: string | null;
  real: string;
  planeado: string;
  desviacion: string;
  periodo: PeriodoInforme;
  curva: DatosCurva;
  capitulos: Capitulo[];
  alertas: AlertaAtraso[];
  activas: PartidaActiva[];
  lastPlanner: LastPlannerAlCorte | null;
  generadoPor: string;
  /// Las fechas que el selector puede ofrecer. Solo la pantalla las usa.
  cortes: CorteDisponible[];
}

/**
 * Por que no hay informe, cuando no lo hay.
 *
 * Se distinguen los tres motivos en vez de devolver `null` porque cada puerta
 * responde distinto: la pantalla manda al cronograma si falta el plan pero da
 * 404 si la obra no existe, y una ruta de descarga tiene que devolver el
 * codigo que corresponde a cada caso.
 */
export type ResultadoInforme =
  | { estado: "ok"; datos: InformeCompuesto }
  | { estado: "sin-obra" }
  | { estado: "sin-permiso" }
  | { estado: "sin-cronograma" };

export async function componerInforme(
  sesion: SesionActiva,
  obraId: string,
  corteISO?: string,
): Promise<ResultadoInforme> {
  if (!puede(sesion, "cronograma:leer")) return { estado: "sin-permiso" };

  // Es lo que ata la obra a la empresa de quien mira: sin esto, cambiando el
  // identificador se podria componer el informe de una obra ajena.
  const obra = await obtenerObra(sesion, obraId);
  if (!obra) return { estado: "sin-obra" };

  const [informe, curva, empresa] = await Promise.all([
    informeAlCorte(sesion, obraId, corteISO),
    datosCurvaS(sesion, obraId),
    obtenerEmpresa(sesion),
  ]);

  if (!informe) return { estado: "sin-cronograma" };

  const lastPlanner = await lastPlannerAlCorte(sesion, obraId, informe.fechaCorte);

  return {
    estado: "ok",
    datos: {
      empresa: empresa?.razonSocial ?? "",
      obra: obra.nombreObra,
      ubicacion: obra.ubicacion,
      fechaCorte: informe.fechaCorte,
      version: informe.version,
      importadoPor: informe.importadoPor,
      planeadoProject: informe.planeadoProject,
      realProject: informe.realProject,
      real: informe.real,
      planeado: informe.planeado,
      desviacion: informe.desviacion,
      periodo: informe.periodo,
      curva,
      capitulos: agruparPorCapitulo(informe.tareas),
      alertas: alertasDeAtraso(informe.tareas, informe.fechaCorte),
      activas: partidasActivas(informe.tareas, informe.fechaCorte),
      lastPlanner,
      generadoPor: `${sesion.nombres} ${sesion.apellidos}`.trim(),
      cortes: informe.cortes,
    },
  };
}
