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
  type TareaControlada,
} from "@/lib/control-avance";
import { puede } from "@/lib/rbac";
import { restar } from "@/lib/decimal";
import type {
  CapituloDeLaBrecha,
  EconomiaDelInforme,
} from "@/lib/informe-documento";
import { bacDeObra } from "./presupuesto-obra";
import { desgloseComprometidoDeObra } from "./ordenes.service";
import { cruceDeObra } from "./fisico-economico.service";
import type { SesionActiva } from "./sesion.service";
import { fotosDeTareas, type FotoResumen } from "./evidencia.service";

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
  /**
   * Con que se pesaron `real` y `planeado`: "DURACION" o "DINERO".
   *
   * Viaja hasta el documento porque la CURVA que va aqui al lado se pesa con
   * el mismo criterio, y hasta el 24 de agosto de 2026 no era asi: las cifras
   * de arriba iban siempre por duracion y la curva ya podia ir por dinero. El
   * mismo PDF, dos varas.
   */
  criterioPeso: "DURACION" | "DINERO";
  /// Cuantas tareas no cuentan por no tener partida mapeada. Cero con
  /// duracion; con dinero se enseña, porque su avance deja de pesar.
  tareasSinPeso: number;
  periodo: PeriodoInforme;
  curva: DatosCurva;
  capitulos: Capitulo[];
  /// El cronograma entero: lo pide la hoja del Gantt del PDF. La hoja de
  /// calculo lo ignora.
  tareas: TareaControlada[];
  alertas: AlertaAtraso[];
  activas: PartidaActiva[];
  /// Fotos de cada partida activa, por su uid. Vacio = sin fotos.
  fotosPorUid: Record<number, FotoResumen[]>;
  lastPlanner: LastPlannerAlCorte | null;
  /**
   * El dinero de la obra al corte. `null` cuando quien pide el informe no
   * puede leer ordenes: se dice que no se puede mostrar, en vez de imprimir
   * un cero que se leeria como «no hay nada comprometido».
   */
  economia: EconomiaDelInforme | null;
  /**
   * DONDE se abre la brecha entre lo construido y lo comprometido.
   *
   * La hoja de control enseñaba el cruce fisico-economico SOLO en global -«11 %
   * de avance contra 26,3 % comprometido»- y el revisor lo dejo anotado: la
   * cifra global dice que hay un problema y no dice donde. Capitulo a capitulo
   * si lo dice, y es el dato que convierte el aviso en algo que se puede ir a
   * mirar.
   *
   * `null` sin permiso de ordenes, igual que `economia`: sin poder leer el
   * gasto el cruce saldria con el gastado en cero, y eso no seria un cruce
   * conservador sino uno que miente en la direccion tranquilizadora.
   */
  cruce: readonly CapituloDeLaBrecha[] | null;
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

  const [informe, curva, empresa, bac, comprometido, cruce] = await Promise.all([
    informeAlCorte(sesion, obraId, corteISO),
    datosCurvaS(sesion, obraId),
    obtenerEmpresa(sesion),
    // `bacDeObra` no filtra por empresa porque no recibe la sesion: se llama
    // DESPUES de `obtenerObra`, que es quien ata la obra a la empresa de quien
    // mira. Mismo orden que en `evm.service`.
    bacDeObra(obraId),
    // Devuelve null sin permiso de ordenes, y ese null viaja hasta el informe.
    desgloseComprometidoDeObra(sesion, obraId),
    /*
     * El cruce POR CAPITULO. Es el mismo `cruceDeObra` que ya alimenta la
     * pantalla de fisico-economico y el panel «Que falta»: no se calcula aqui
     * otra vez, se pide. Dos lecturas del mismo cruce acabarian marcando
     * capitulos distintos en la pantalla y en el papel.
     */
    cruceDeObra(sesion, obraId),
  ]);

  if (!informe) return { estado: "sin-cronograma" };

  const lastPlanner = await lastPlannerAlCorte(sesion, obraId, informe.fechaCorte);

  // Las fotos de las tareas que salen en el informe. Es lo que da el valor
  // agregado que se pidio: el reporte deja de ser solo cifras y ensena lo que
  // se hizo. Se piden por los uids de las partidas activas —las que el informe
  // destaca— en una consulta, sin dia: todo el historial de cada una.
  const activas = partidasActivas(informe.tareas, informe.fechaCorte);
  const fotos = await fotosDeTareas(
    sesion,
    obraId,
    activas.map((p) => p.uid),
  );
  const fotosPorUid: Record<number, FotoResumen[]> = {};
  for (const [uid, lista] of fotos) fotosPorUid[uid] = lista;

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
      criterioPeso: informe.criterioPeso,
      tareasSinPeso: informe.tareasSinPeso,
      periodo: informe.periodo,
      curva,
      capitulos: agruparPorCapitulo(informe.tareas),
      // El cronograma entero viaja para que el PDF pueda dibujar su Gantt. La
      // hoja de calculo lo ignora, igual que ignora los graficos.
      tareas: informe.tareas,
      alertas: alertasDeAtraso(informe.tareas, informe.fechaCorte),
      activas,
      fotosPorUid,
      /*
       * Solo los capitulos, y solo si de verdad hay cifra de gasto.
       * `sinPermisoDeCosto` existe para esto: sin `orden:leer` el cruce viene
       * con el gastado en cero, que pintado en el papel se lee como «no se ha
       * comprometido nada». Se prefiere no dibujar el bloque.
       */
      cruce: !cruce || cruce.sinPermisoDeCosto ? null : cruce.capitulos,
      economia:
        comprometido === null
          ? null
          : {
              presupuesto: bac.bac,
              comprometido: comprometido.total,
              saldo: restar(bac.bac, comprometido.total),
              conLineaBase: bac.conLineaBase,
            },
      lastPlanner,
      generadoPor: `${sesion.nombres} ${sesion.apellidos}`.trim(),
      cortes: informe.cortes,
    },
  };
}
