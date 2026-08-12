import "server-only";

import { prisma } from "@/lib/prisma";
import { puede } from "@/lib/rbac";
import { esPositivo, restar } from "@/lib/decimal";
import {
  agruparPorCapitulo,
  alertasDeAtraso,
  cadenaCritica,
} from "@/lib/control-avance";
import { diasLaborablesEntre } from "@/lib/calendario";
import { metricasEvm, valorDeAvance, type MetricasEvm } from "@/lib/evm";
import { obtenerObra } from "@/services/obras.service";
import { totalDeObra } from "@/services/presupuesto-obra";
import { datosCurvaS, obtenerCronograma } from "@/services/cronograma.service";
import { obtenerCalendario } from "@/services/calendario.service";
import { listarPlanesSemanales } from "@/services/plan-semanal.service";
import {
  confiabilidadDeVentana,
  demoraDeLiberacion,
  type DemoraLiberacion,
} from "@/services/lookahead.service";
import { MODULOS_POR_DEFECTO, type ModuloTablero } from "@/lib/tablero";
import { pendientesDeObra, type Pendiente } from "@/lib/pendientes";
import { diasSinReportar } from "@/lib/parte-diario";
import { arrastreDeIncumplidos, causaQueMasFrena } from "@/lib/plan-semanal";
import { cumplimientoDeLiberacion } from "@/lib/lookahead-compromiso";
import { cobertura } from "@/lib/mapeo-partidas";
import { diasEntre, fechaCorta, hoy } from "@/utils/fechas";
import type { CausaNoCumplimiento } from "@/generated/prisma/enums";
import type { SesionActiva } from "@/services/sesion.service";

/**
 * Todo lo que enseña el tablero de UNA obra.
 *
 * Se arma de una vez y para todos los modulos, encendidos o no. Es a
 * proposito: encender un modulo que estaba apagado no debe costar una vuelta
 * al servidor, porque configurar el tablero es probar combinaciones hasta dar
 * con la que sirve. Cambiar de OBRA si va al servidor —son cifras distintas,
 * no las mismas escondidas—.
 *
 * Las cifras salen de las MISMAS funciones que las pantallas de detalle
 * —`obtenerCronograma`, `datosCurvaS`, `agruparPorCapitulo`,
 * `cadenaCritica`—. Un tablero que calcula por su cuenta acaba diciendo un
 * numero distinto del que dice la pantalla a la que enlaza, y entonces no se
 * cree ninguno de los dos.
 */

export interface ObraDelSelector {
  id: string;
  correlativo: string | null;
  nombre: string;
  estado: string;
}

/**
 * Las obras para el desplegable del tablero: TODAS, no una pagina.
 *
 * `listarObras` devuelve doce por pagina y ademas calcula presupuesto y
 * comprometido de cada una. Aqui hacen falta los nombres de todas y nada mas:
 * la obra que se supervisa puede estar en la pagina tres, o filtrada fuera
 * por la busqueda que hay escrita arriba.
 */
export async function listarObrasParaTablero(
  sesion: SesionActiva,
): Promise<ObraDelSelector[]> {
  if (!puede(sesion, "obra:leer")) return [];

  const obras = await prisma.project.findMany({
    where: { companyId: sesion.companyId },
    orderBy: { createdAt: "desc" },
    select: { id: true, correlativo: true, nombreObra: true, estado: true },
  });

  // Las EN EJECUCION primero, para que el tablero abra en la obra que de
  // verdad se supervisa y no en una de planificacion vacia. El orden del enum
  // que usa el panel pone PLANIFICACION delante, que alli tiene sentido pero
  // aqui dejaba el tablero arrancando en una obra sin cronograma ni
  // presupuesto —y sus KPIs parecian «no corresponder» a ninguna obra real—.
  const PRIORIDAD: Record<string, number> = {
    EN_EJECUCION: 0,
    PARALIZADA: 1,
    PLANIFICACION: 2,
    CERRADA: 3,
  };

  return obras
    .map((o) => ({
      id: o.id,
      correlativo: o.correlativo,
      nombre: o.nombreObra,
      estado: o.estado,
    }))
    .sort((a, b) => (PRIORIDAD[a.estado] ?? 9) - (PRIORIDAD[b.estado] ?? 9));
}

/// Un punto de la curva en miniatura. `t` es 0..1 sobre el eje de tiempo y
/// `v` el porcentaje 0..100: asi el SVG no necesita saber de fechas.
export interface PuntoMini {
  t: number;
  v: number;
}

export interface DatosTablero {
  obra: ObraDelSelector;
  plazo: {
    inicio: string;
    fin: string;
    /// Fin segun el cronograma, que puede no ser el de la ficha.
    finCronograma: string | null;
    /// Dias de diferencia entre uno y otro. Null si no hay cronograma.
    desvioFicha: number | null;
    diasTotales: number;
    transcurridos: number;
    /// Negativo si el plazo ya vencio.
    restantes: number;
    /// De los restantes, cuantos se trabaja de verdad segun el calendario de
    /// la obra. Null si la obra no tiene calendario sembrado.
    laborablesRestantes: number | null;
    porcentaje: number;
  };
  presupuesto: {
    total: string;
    comprometido: string;
    saldo: string;
    porcentaje: number;
    partidas: number;
    sobregiradas: number;
  };
  /// Null sin permiso `orden:leer`: el modulo no se pinta en vez de mentir.
  ordenes: {
    total: number;
    aprobadas: number;
    borradores: number;
    anuladas: number;
  } | null;
  /// Null si la obra no tiene cronograma cargado, o sin `cronograma:leer`.
  cronograma: DatosCronogramaTablero | null;
  /// Null sin permiso `plan_semanal:leer`.
  planSemanal: DatosPlanSemanalTablero | null;
  /// Null sin permiso `lookahead:leer`.
  lookahead: DatosLookaheadTablero | null;
  /// Cuanto tarda cada flujo en liberarse. Null sin permiso `lookahead:leer`.
  liberacion: DemoraLiberacion | null;
  /// El EVM en resumen. Null sin cronograma con cortes o sin presupuesto:
  /// sin esas dos patas no hay valor ganado que medir.
  valorGanado: { metricas: MetricasEvm; corte: string } | null;
  /// Que falta por hacer, ordenado por lo que rompe. Vacio = obra al dia.
  pendientes: Pendiente[];
}

/**
 * Last Planner en el tablero: si se CUMPLE lo prometido, no cuanto se avanza.
 *
 * El tablero enseñaba avance, plazo y dinero —las tres cifras del control
 * clasico— y ni una del sistema que la obra usa para decidir la semana. Se
 * puede ir al dia en la curva con un PPC del 50%: significa que el ritmo tapa
 * una planificacion que no se cumple, y eso se paga mas adelante.
 */
export interface DatosPlanSemanalTablero {
  /// La ultima semana CERRADA. Una abierta aun no tiene PPC que signifique algo.
  ultima: { numero: number; ppc: number; fechaCorte: string } | null;
  /// El PPC de la semana cerrada anterior, para saber si sube o baja.
  anterior: number | null;
  cerradas: number;
  abiertas: number;
  /// PPC de cada semana cerrada, de la mas antigua a la mas nueva (0..100).
  tendencia: number[];
  /// La causa que mas veces ha frenado un compromiso, en TODAS las semanas.
  causaTop: {
    causa: CausaNoCumplimiento;
    veces: number;
    /// Que parte de todos los incumplimientos con causa se lleva esta.
    porcentaje: number;
  } | null;
  /// Incumplimientos con causa anotada, el denominador del porcentaje.
  fallosConCausa: number;
}

export interface DatosLookaheadTablero {
  listas: number;
  total: number;
  porcentaje: number;
  semanas: number;
  /// Restricciones resueltas en toda la ventana.
  restriccionesResueltas: number;
  /// Tareas de la ventana que nadie ha analizado. Cuentan como no listas, asi
  /// que sin decirlo el porcentaje engaña: parece mala ejecucion cuando es
  /// falta de analisis. Si son TODAS, la tarjeta lo dice en neutro en vez de
  /// gritar un 0% en rojo que solo mide la adopcion.
  sinAnalizar: number;
}

export interface DatosCronogramaTablero {
  version: number;
  corte: string;
  real: number;
  planeado: number;
  desfase: number;
  curva: {
    plan: PuntoMini[];
    real: PuntoMini[];
    proyeccion: PuntoMini[];
    /// Donde cae la fecha de corte en el eje, para la linea vertical.
    tCorte: number;
    /// Real entre planeado. 1 es ir justo al plan.
    factor: number;
    termino: string | null;
    /// Dias que el termino proyectado se pasa del plan. Negativo: se adelanta.
    diasDeMas: number | null;
  };
  atrasos: {
    alta: number;
    media: number;
    baja: number;
    total: number;
    primera: { nombre: string; desfase: number; motivo: string | null } | null;
  };
  criticas: {
    eslabones: number;
    atrasados: number;
    atrasoAcumulado: number;
    proxima: { nombre: string; fin: string } | null;
  };
  capitulos: {
    codigo: string | null;
    nombre: string;
    planeado: number;
    real: number;
    desfase: number;
  }[];
}

/**
 * Cuantos puntos como mucho tiene la curva en miniatura.
 *
 * El plan es un punto por DIA de obra: en una de dos años son setecientos, y
 * mandarlos todos al navegador para dibujarlos en doscientos pixeles es pagar
 * un payload por un detalle que nadie puede ver. Se muestrea de forma
 * uniforme y se conserva siempre el ultimo punto, que es el que cierra la
 * curva en el 100%.
 */
const PUNTOS_MINI = 80;

/**
 * Con cuanta antelacion se avisa de lo que viene.
 *
 * Catorce dias: lo que tarda de verdad cerrar un subcontrato o liberar un
 * plano. Avisar a siete ya no deja margen para reaccionar, que es lo unico
 * que hace util un aviso.
 */
const DIAS_PROXIMAS = 14;

/**
 * Cuantos dias laborables puede pasar una tarea abierta sin reportarse antes de
 * que se avise.
 *
 * Tres: con el parte del dia, reportar cuesta un envio, asi que tres dias
 * laborables sin tocar una partida viva ya no es «no me ha dado tiempo». Y es
 * menos de una semana a proposito: el residente que lo deja para el viernes
 * —antes del reporte del sabado— llega a tiempo de verlo.
 */
const DIAS_SIN_REPORTAR = 3;

/**
 * El presupuesto cuando su modulo esta apagado.
 *
 * Se devuelve la forma completa en ceros en vez de `null` para no obligar a
 * todo lo de abajo a comprobarlo: el modulo no se pinta igualmente, porque
 * `moduloConDatos` lo filtra antes.
 */
const PRESUPUESTO_VACIO: DatosTablero["presupuesto"] = {
  total: "0.00",
  comprometido: "0.00",
  saldo: "0.00",
  porcentaje: 0,
  partidas: 0,
  sobregiradas: 0,
};

function muestrear(puntos: readonly PuntoMini[]): PuntoMini[] {
  if (puntos.length <= PUNTOS_MINI) return [...puntos];

  const paso = (puntos.length - 1) / (PUNTOS_MINI - 1);
  const salida: PuntoMini[] = [];
  for (let i = 0; i < PUNTOS_MINI; i++) {
    salida.push(puntos[Math.round(i * paso)]!);
  }
  return salida;
}

/**
 * El tablero de una obra, o null si no existe o no es de esta empresa.
 *
 * El `companyId` sale de la sesion en cada consulta: manipular el `?obra=` de
 * la URL no alcanza la obra de otra empresa, simplemente devuelve null.
 *
 * SE CARGA SOLO LO DE LOS MODULOS ENCENDIDOS. El diseno original traia los
 * datos de TODOS para que encender uno no costara una vuelta al servidor.
 * Con ocho modulos ligeros era defendible; con once, y tres de ellos
 * consultando Last Planner, dejo de serlo: el 10 de agosto de 2026 el peso de
 * esta funcion tumbo produccion. Ahora quien enciende un modulo apagado paga
 * una recarga —y solo el, y solo esa vez—, que es mucho mejor reparto que
 * cobrarle a todo el mundo, en cada carga, los modulos que tiene apagados.
 */
export async function datosTablero(
  sesion: SesionActiva,
  obraId: string,
  modulos: readonly ModuloTablero[] = MODULOS_POR_DEFECTO,
): Promise<DatosTablero | null> {
  const obra = await obtenerObra(sesion, obraId);
  if (!obra) return null;

  const encendido = (clave: ModuloTablero) => modulos.includes(clave);

  // Primera tanda: lo que casi siempre hace falta y no depende de nada mas.
  // El cronograma se lee UNA vez y se reparte; la confiabilidad del Lookahead
  // sale de estas mismas tareas.
  const necesitaCronograma =
    encendido("pendientes") ||
    encendido("avance") ||
    encendido("curva") ||
    encendido("atrasos") ||
    encendido("criticas") ||
    encendido("capitulos") ||
    encendido("confiabilidad") ||
    encendido("valorGanado");

  const necesitaPlanes =
    encendido("ppc") || encendido("causas") || encendido("pendientes");

  const [presupuesto, ordenes, cronograma, curva, calendario, planes] =
    await Promise.all([
      encendido("presupuesto") ||
      encendido("valorGanado") ||
      encendido("pendientes")
        ? presupuestoDeObra(sesion, obraId)
        : PRESUPUESTO_VACIO,
      encendido("presupuesto") || encendido("ordenes")
        ? ordenesDeObra(sesion, obraId)
        : null,
      necesitaCronograma ? obtenerCronograma(sesion, obraId) : null,
      necesitaCronograma ? datosCurvaS(sesion, obraId) : null,
      encendido("plazo") ? obtenerCalendario(sesion, obraId) : [],
      necesitaPlanes ? planSemanalDeObra(sesion, obraId) : null,
    ]);

  // Segunda tanda, y una sola consulta: la confiabilidad se calcula con las
  // tareas que ya estan en memoria. Antes esto releia el cronograma entero.
  const lookahead =
    (encendido("confiabilidad") || encendido("pendientes")) && cronograma
      ? await confiabilidadDeVentana(
          sesion,
          obraId,
          cronograma.tareas,
          // Las terminadas salen del cronograma YA MEDIDO que esta en memoria,
          // sin consulta extra. Tienen que excluirse aqui igual que en la
          // pantalla: contarlas como «no listas» hundia la confiabilidad del
          // tablero con trabajo que ya estaba hecho.
          new Set(
            cronograma.tareas
              .filter((t) => Number(t.porcentajeReal) >= 100)
              .map((t) => t.uid),
          ),
        )
      : null;

  // Los pendientes van al final: necesitan lo que ya cargaron los demas, y
  // solo consultan de mas lo que cruza dinero con tiempo.
  const pendientes = encendido("pendientes")
    ? await pendientesDeLaObra(
        sesion,
        obraId,
        cronograma,
        lookahead,
        planes,
        presupuesto.sobregiradas,
      )
    : [];

  // Valor ganado con lo YA cargado (curva + presupuesto): cero consultas
  // nuevas, y con `metricasEvm`, la MISMA regla que la pantalla del EVM —el
  // punto actual, los mismos respaldos y las mismas compuertas—. Si el numero
  // de aqui y el de alla divergen, alguien duplico la regla.
  const valorGanado = (() => {
    if (!encendido("valorGanado") || !curva || curva.cortes.length === 0) {
      return null;
    }
    const bac = presupuesto.total;
    if (!(Number(bac) > 0)) return null;

    const ultimo = curva.cortes[curva.cortes.length - 1]!;
    const actual = curva.puntoActual ?? {
      fecha: ultimo.fecha,
      real: Number(ultimo.real),
      planeado: curva.planeadoBaseEnCorte ?? Number(ultimo.planeado),
    };

    return {
      metricas: metricasEvm({
        bac,
        pv: valorDeAvance(bac, actual.planeado),
        ev: valorDeAvance(bac, actual.real),
        // Sin permiso de ordenes el AC no existe para esta persona: la
        // metrica lo marca como `sin_permiso` y la tarjeta lo explica.
        ac: puede(sesion, "orden:leer") ? presupuesto.comprometido : null,
      }),
      corte: fechaCorta(actual.fecha),
    };
  })();

  const diasTotales = diasEntre(obra.fechaInicio, obra.fechaFinProgramada);
  const transcurridos = diasEntre(obra.fechaInicio, hoy());

  // Con plazo de cero dias o al reves —fin antes que inicio, que es un dato
  // mal tecleado— no hay proporcion que calcular. Se deja en 0 y el modulo lo
  // enseña tal cual en vez de fingir un 100%.
  const porcentaje =
    diasTotales > 0
      ? Math.min(100, Math.max(0, (transcurridos / diasTotales) * 100))
      : 0;

  return {
    obra: {
      id: obra.id,
      correlativo: obra.correlativo,
      nombre: obra.nombreObra,
      estado: obra.estado,
    },
    plazo: {
      inicio: fechaCorta(obra.fechaInicio),
      fin: fechaCorta(obra.fechaFinProgramada),
      finCronograma: curva?.fin ? fechaCorta(curva.fin) : null,
      desvioFicha: curva?.fin
        ? diasEntre(obra.fechaFinProgramada, curva.fin)
        : null,
      diasTotales,
      transcurridos: Math.max(0, transcurridos),
      restantes: diasEntre(hoy(), obra.fechaFinProgramada),
      // "56 dias" y "42 laborables" no son el mismo plazo, y la cuadrilla solo
      // aparece en los segundos. Sin calendario sembrado se calla en vez de
      // suponer un lunes-a-viernes que en obra casi nunca es cierto.
      laborablesRestantes:
        calendario.length > 0
          ? diasLaborablesEntre(hoy(), obra.fechaFinProgramada, calendario)
          : null,
      porcentaje,
    },
    presupuesto,
    ordenes,
    cronograma:
      cronograma && curva ? armarCronograma(cronograma, curva) : null,
    planSemanal: planes,
    lookahead,
    // Se pide solo si el modulo esta encendido, como el resto: el tablero no
    // paga consultas de lo que nadie mira.
    liberacion: encendido("liberacion")
      ? await demoraDeLiberacion(sesion, obraId)
      : null,
    valorGanado,
    pendientes,
  };
}

/**
 * El PPC y las causas para el tablero.
 *
 * Sale de `listarPlanesSemanales`, la misma funcion que pinta la pantalla del
 * Plan Semanal —incluido su filtro de "solo semanas CERRADAS" para la
 * tendencia—, para que las dos no puedan discrepar.
 */
async function planSemanalDeObra(
  sesion: SesionActiva,
  obraId: string,
): Promise<DatosPlanSemanalTablero | null> {
  if (!puede(sesion, "plan_semanal:leer")) return null;

  const { semanas, tendencia, pareto } = await listarPlanesSemanales(
    sesion,
    obraId,
  );

  // `tendencia` viene de la mas antigua a la mas nueva; la ultima cerrada es
  // la de la derecha del todo.
  const serie = tendencia.map((p) => p.ppc);
  const cerradas = semanas.filter((s) => s.estado === "CERRADO");
  const ultimaCerrada = cerradas[0]; // `semanas` viene por fechaCorte desc

  const fallosConCausa = pareto.reduce((suma, f) => suma + f.conteo, 0);
  // Se calla mientras el Pareto no signifique nada: hacen falta volumen y al
  // menos dos causas distintas. La regla vive en `@/lib/plan-semanal` y tiene
  // test, porque decide lo que el tablero AFIRMA.
  const top = causaQueMasFrena(pareto);

  return {
    ultima:
      ultimaCerrada && ultimaCerrada.ppc !== null
        ? {
            numero: ultimaCerrada.numero,
            ppc: ultimaCerrada.ppc,
            fechaCorte: fechaCorta(ultimaCerrada.fechaCorte),
          }
        : null,
    anterior: serie.length >= 2 ? (serie[serie.length - 2] ?? null) : null,
    cerradas: cerradas.length,
    abiertas: semanas.filter((s) => s.estado === "ABIERTO").length,
    tendencia: serie,
    causaTop: top
      ? { causa: top.causa, veces: top.veces, porcentaje: top.porcentaje }
      : null,
    fallosConCausa,
  };
}

type Cronograma = NonNullable<Awaited<ReturnType<typeof obtenerCronograma>>>;
type Curva = Awaited<ReturnType<typeof datosCurvaS>>;

function armarCronograma(
  cronograma: Cronograma,
  curva: Curva,
): DatosCronogramaTablero {
  const corte = cronograma.fechaCorte;
  const alertas = alertasDeAtraso(cronograma.tareas, corte);
  const cadena = cadenaCritica(cronograma.tareas, corte);

  // Solo los capitulos MEDIBLES: los de puros hitos dan real ponderado 0 por
  // construccion, y ordenados por desviacion coparian siempre los tres
  // primeros puestos con un atraso que no existe.
  const capitulos = agruparPorCapitulo(cronograma.tareas)
    .filter((c) => c.medible)
    .sort((a, b) => Number(a.desfase) - Number(b.desfase))
    .slice(0, 3);

  // El avance VIVO a hoy (`puntoActual`: ultimo avance semanal de GCM, ya
  // incluyendo la semana en curso), no el ultimo corte de import: asi el
  // Tablero avanza al cerrar una semana igual que la tarjeta de la lista, sin
  // reimportar. Cae al ultimo corte solo si aun no hay ningun avance.
  const ultimo = curva.cortes[curva.cortes.length - 1];
  const real = Number(curva.puntoActual?.real ?? ultimo?.real ?? 0);
  const planeado = Number(curva.puntoActual?.planeado ?? ultimo?.planeado ?? 0);

  return {
    version: cronograma.version,
    corte: fechaCorta(corte),
    real,
    planeado,
    desfase: Number((real - planeado).toFixed(2)),
    curva: armarCurva(curva, corte),
    atrasos: {
      alta: alertas.filter((a) => a.severidad === "alta").length,
      media: alertas.filter((a) => a.severidad === "media").length,
      baja: alertas.filter((a) => a.severidad === "baja").length,
      total: alertas.length,
      primera: alertas[0]
        ? {
            nombre: alertas[0].nombre,
            desfase: Number(alertas[0].desfase),
            motivo: alertas[0].motivo,
          }
        : null,
    },
    criticas: {
      eslabones: cadena.eslabones.length,
      atrasados: cadena.atrasados,
      atrasoAcumulado: Number(cadena.atrasoAcumulado),
      // El siguiente eslabon SIN terminar: es donde hay que mirar ahora, y no
      // en la cadena entera, que en su mayor parte ya esta hecha o aun no toca.
      proxima: (() => {
        const siguiente = cadena.eslabones.find((e) => !e.terminado);
        return siguiente
          ? { nombre: siguiente.nombre, fin: fechaCorta(siguiente.fin) }
          : null;
      })(),
    },
    capitulos: capitulos.map((c) => ({
      codigo: c.codigo,
      nombre: c.nombre,
      planeado: Number(c.planeado),
      real: Number(c.real),
      desfase: Number(c.desfase),
    })),
  };
}

/**
 * Normaliza la curva al eje 0..1.
 *
 * El eje llega hasta el termino PROYECTADO y no hasta el fin del plan: si la
 * obra va tarde, la proyeccion se sale por la derecha, y recortarla en el fin
 * del plan escondería justo lo que hay que ver.
 */
function armarCurva(
  curva: Curva,
  corte: Date,
): DatosCronogramaTablero["curva"] {
  const vacia = {
    plan: [],
    real: [],
    proyeccion: [],
    tCorte: 0,
    factor: curva.factor,
    termino: null,
    diasDeMas: null,
  };

  if (!curva.inicio || !curva.fin) return vacia;

  const ultimaProyeccion = curva.proyeccion[curva.proyeccion.length - 1];
  const derecha = Math.max(
    curva.fin.getTime(),
    ultimaProyeccion?.fecha.getTime() ?? 0,
  );
  const izquierda = curva.inicio.getTime();
  const ancho = derecha - izquierda;

  if (ancho <= 0) return vacia;

  const t = (fecha: Date) =>
    Math.min(1, Math.max(0, (fecha.getTime() - izquierda) / ancho));

  /**
   * La linea real, MEDIDA IGUAL QUE EN LA CURVA GRANDE.
   *
   * Se dibujaba con `curva.cortes` —un punto por importacion de MS Project—
   * mas el punto de hoy. La pantalla del cronograma usa `realSemanal`, que
   * desde el 12/08/2026 trae un punto por cada dia con avance reportado. Eran
   * dos lineas distintas de la misma obra: la miniatura saltaba de una
   * importacion a otra en linea recta y se saltaba justo lo que el parte del
   * dia habia registrado en medio.
   *
   * Se ancla en (inicio, 0) porque el primer punto medido cae a los pocos dias
   * de arrancar, y sin el la curva real salia flotando lejos del origen en vez
   * de subir desde el principio del plazo.
   *
   * `muestrear` la recorta a los puntos que caben en una miniatura; se aplica
   * despues del ancla para no gastar en ella uno de los pocos huecos.
   */
  const medidos = curva.realSemanal.length
    ? curva.realSemanal.map((p) => ({ t: t(p.fecha), v: p.valor }))
    : curva.cortes.map((c) => ({ t: t(c.fecha), v: Number(c.real) }));

  const real: PuntoMini[] = [{ t: 0, v: 0 }, ...muestrear(medidos)];

  return {
    plan: muestrear(curva.plan.map((p) => ({ t: t(p.fecha), v: p.valor }))),
    real,
    proyeccion: muestrear(
      curva.proyeccion.map((p) => ({ t: t(p.fecha), v: p.valor })),
    ),
    tCorte: t(corte),
    factor: curva.factor,
    termino: curva.terminoProyectado
      ? fechaCorta(curva.terminoProyectado)
      : null,
    diasDeMas: curva.terminoProyectado
      ? diasEntre(curva.fin, curva.terminoProyectado)
      : null,
  };
}

/**
 * Presupuesto y comprometido de UNA obra.
 *
 * Las mismas definiciones que el resumen de empresa: el presupuesto es la
 * suma de los parciales de las partidas (sin IGV) y el comprometido es el
 * importe IMPUTABLE de las ordenes APROBADAS —neto con IGV, total con
 * retencion—. Un borrador todavia no compromete a nadie.
 */
async function presupuestoDeObra(
  sesion: SesionActiva,
  obraId: string,
): Promise<DatosTablero["presupuesto"]> {
  const obraDeLaEmpresa = await prisma.project.findFirst({
    where: { id: obraId, companyId: sesion.companyId },
    select: { id: true },
  });
  if (!obraDeLaEmpresa) return PRESUPUESTO_VACIO;

  const [partidas, comprometido, porPartida] = await Promise.all([
    // `totalDeObra` y no un `SUM(parcial)` plano: un grupo a suma alzada con
    // hijas costeadas tambien es tipo PARTIDA, y sumarlos a los dos contaba el
    // mismo dinero dos veces. Este total ademas alimenta la tarjeta de VALOR
    // GANADO de mas abajo, o sea el BAC.
    totalDeObra(obraId),

    prisma.ordenImputacion.aggregate({
      where: {
        ordenCompra: {
          projectId: obraId,
          companyId: sesion.companyId,
          estado: "APROBADA",
        },
      },
      _sum: { importe: true },
    }),

    prisma.ordenImputacion.groupBy({
      by: ["wbsItemId"],
      where: {
        ordenCompra: {
          projectId: obraId,
          companyId: sesion.companyId,
          estado: "APROBADA",
        },
      },
      _sum: { importe: true },
    }),
  ]);

  const total = partidas.costoDirecto;
  const gastado = comprometido._sum.importe?.toString() ?? "0.00";

  // Partida a partida y no dos sumas: un total holgado puede esconder varias
  // partidas pasadas de largo, que es justo lo que hay que corregir.
  let sobregiradas = 0;
  if (porPartida.length > 0) {
    const parciales = await prisma.wbsItem.findMany({
      where: { id: { in: porPartida.map((p) => p.wbsItemId) } },
      select: { id: true, parcial: true },
    });
    const parcialPorId = new Map(
      parciales.map((p) => [p.id, p.parcial?.toString() ?? "0"]),
    );

    for (const fila of porPartida) {
      // Con `restar` y no con `sumar([a, "-"+b])`: el parcial puede ser
      // negativo —un descuento comercial— y esa forma produce "--26821.60",
      // que `sumar` descarta en silencio marcando un sobregiro que no existe.
      const exceso = restar(
        fila._sum.importe?.toString() ?? "0",
        parcialPorId.get(fila.wbsItemId) ?? "0",
      );
      if (exceso !== null && esPositivo(exceso)) sobregiradas++;
    }
  }

  const numeroTotal = Number(total);

  return {
    total,
    comprometido: gastado,
    saldo: restar(total, gastado) ?? "0.00",
    porcentaje: numeroTotal > 0 ? (Number(gastado) / numeroTotal) * 100 : 0,
    partidas: partidas.partidas,
    sobregiradas,
  };
}

/**
 * Que le falta al residente, contado.
 *
 * La decision —que es pendiente, con que gravedad y en que orden— vive en
 * `@/lib/pendientes`, probada. Aqui solo se cuentan filas.
 *
 * Casi todo sale de lo que el tablero YA tiene en memoria: el cronograma
 * medido trae en cada tarea si alguien reporto avance, y la confiabilidad y
 * el PPC vienen de sus modulos. Solo se consulta de mas lo que cruza dinero
 * con tiempo, que es precisamente el aviso que nadie mas puede dar.
 */
async function pendientesDeLaObra(
  sesion: SesionActiva,
  obraId: string,
  cronograma: Cronograma | null,
  lookahead: DatosLookaheadTablero | null,
  planes: DatosPlanSemanalTablero | null,
  sobregiradas: number,
): Promise<Pendiente[]> {
  const ahora = hoy();
  const limite = new Date(ahora.getTime() + DIAS_PROXIMAS * 86_400_000);

  // Solo trabajo real: un resumen agrupa y un hito dura cero dias, asi que
  // ninguno de los dos se "empieza" ni se contrata.
  const trabajo = (cronograma?.tareas ?? []).filter(
    (t) => !t.esResumen && !t.esHito,
  );

  // Empezadas y sin que nadie haya reportado nada. `avance` es null cuando no
  // hay ningun `AvanceTarea`, que es distinto de haber reportado un 0%.
  const tareasEmpezadasSinAvance = trabajo.filter(
    (t) => t.inicio <= ahora && t.avance === null,
  ).length;

  // Las que SI se reportaron alguna vez y se estan quedando atras. Es otro
  // problema y tiene otro arreglo —el parte del dia, que las saca todas
  // juntas—, asi que se cuenta aparte. Se mide en dias LABORABLES: contar en
  // dias naturales convertiria cualquier fin de semana en un aviso.
  const calendario = await obtenerCalendario(sesion, obraId);
  const tareasConAvanceViejo = trabajo.filter(
    (t) =>
      t.inicio <= ahora &&
      t.avance !== null &&
      Number(t.porcentajeReal) < 100 &&
      diasSinReportar(t.avance.fecha, ahora, calendario) > DIAS_SIN_REPORTAR,
  ).length;

  const proximas = trabajo.filter(
    (t) => t.inicio > ahora && t.inicio <= limite,
  );
  const uidsProximos = proximas.map((t) => t.uid);

  const [
    lkProximas,
    mapeos,
    partidas,
    planesCerrados,
    yaRetomadas,
    restriccionesAbiertas,
  ] = await Promise.all([
    uidsProximos.length > 0
      ? prisma.lookaheadTask.findMany({
          where: { projectId: obraId, uid: { in: uidsProximos } },
          select: { uid: true, estado: true, analizadaAt: true },
        })
      : Promise.resolve([]),

    prisma.mapeoTareaPartida.findMany({
      where: { projectId: obraId },
      select: { uid: true, codigoPartida: true },
    }),

    // Con sus encargos VIGENTES: una partida sin encargo vivo no tiene a
    // nadie contratado para ejecutarla.
    prisma.wbsItem.findMany({
      where: { projectId: obraId, project: { companyId: sesion.companyId } },
      select: {
        codigoPartida: true,
        parcial: true,
        encargos: {
          where: { encargo: { estado: "VIGENTE" } },
          select: { fraccion: true },
        },
      },
    }),

    // Semanas cerradas que no dejaron ningun avance fisico: sus compromisos
    // con tarea contaron para el PPC y no movieron la curva.
    //
    // La misma consulta sirve para el ARRASTRE: se traen tambien `cumplido` y
    // la fecha del corte, porque `arrastreDeIncumplidos` necesita saber cual
    // fue la ULTIMA palabra de cada tarea —una que fallo y luego se cumplio va
    // avanzando y no hay que sacarla—.
    prisma.planSemanal.findMany({
      where: { projectId: obraId, estado: "CERRADO" },
      select: {
        id: true,
        numero: true,
        fechaCorte: true,
        _count: { select: { avances: true } },
        compromisos: {
          where: { uid: { not: null } },
          select: {
            id: true,
            uid: true,
            descripcion: true,
            cumplido: true,
            causa: true,
          },
        },
      },
    }),

    // Lo ya retomado: comprometido otra vez en una semana que sigue ABIERTA.
    prisma.compromisoSemanal.findMany({
      where: {
        uid: { not: null },
        plan: { projectId: obraId, estado: "ABIERTO" },
      },
      select: { uid: true },
    }),

    // Las promesas de liberacion que estan abiertas. Toda la obra, no solo la
    // ventana: una restriccion que se prometio y vencio sigue siendo un
    // compromiso roto aunque su tarea ya no este en las proximas tres semanas.
    prisma.restriccion.findMany({
      where: { resuelta: false, tarea: { projectId: obraId } },
      select: {
        fechaCompromiso: true,
        responsableUserId: true,
        responsableContactoId: true,
      },
    }),
  ]);

  const lkPorUid = new Map(lkProximas.map((l) => [l.uid, l]));

  // Solo las ANALIZADAS que siguen con algo sin liberar. Una tarea que nadie
  // ha mirado no "arranca con restricciones sin liberar": no tiene ninguna, y
  // pedirle al residente que libere restricciones que nadie eligio no
  // significa nada. De ese hueco avisa la regla de al lado, y contarla en las
  // dos seria acusar dos veces del mismo problema.
  const tareasProximasBloqueadas = proximas.filter((t) => {
    const lk = lkPorUid.get(t.uid);
    return lk != null && lk.analizadaAt !== null && lk.estado !== "LISTO";
  }).length;

  // Arrancan en dos semanas y nadie ha mirado si les falta plano, material o
  // frente. Es mas grave que el aviso general de la ventana: aqui ya no queda
  // margen para reaccionar.
  const tareasProximasSinAnalizar = proximas.filter(
    (t) => (lkPorUid.get(t.uid)?.analizadaAt ?? null) === null,
  ).length;

  // Cobertura: que partidas tienen ya a alguien contratado.
  const conEncargo = new Set(
    partidas
      .filter((p) => p.encargos.length > 0)
      .map((p) => p.codigoPartida),
  );
  const partidasDeTarea = new Map<number, string[]>();
  for (const m of mapeos) {
    partidasDeTarea.set(m.uid, [
      ...(partidasDeTarea.get(m.uid) ?? []),
      m.codigoPartida,
    ]);
  }

  // Sin nadie contratado = ninguna de sus partidas tiene encargo vigente. Las
  // tareas SIN mapear no cuentan aqui: de esas ya avisa la cobertura del
  // mapeo, y senalarlas dos veces seria ruido.
  const tareasProximasSinCobertura = proximas.filter((t) => {
    const codigos = partidasDeTarea.get(t.uid);
    return codigos !== undefined && !codigos.some((c) => conEncargo.has(c));
  }).length;

  const semanasSinPorcentaje = planesCerrados.filter(
    (p) => p.compromisos.length > 0 && p._count.avances === 0,
  ).length;

  // El ARRASTRE: lo prometido que fallo y sigue sin hacerse ni retomarse.
  const avancePorUid = new Map<number, number>(
    trabajo.flatMap((t) =>
      t.avance === null ? [] : [[t.uid, Number(t.avance.porcentaje)] as const],
    ),
  );

  const arrastre = arrastreDeIncumplidos(
    planesCerrados.flatMap((p) =>
      p.compromisos.map((c) => ({
        uid: c.uid,
        descripcion: c.descripcion,
        numeroSemana: p.numero,
        fechaCorte: p.fechaCorte,
        cumplido: c.cumplido === true,
        causa: c.causa,
      })),
    ),
    avancePorUid,
    new Set(
      yaRetomadas.map((c) => c.uid).filter((u): u is number => u !== null),
    ),
  );

  const cob = cobertura(
    mapeos,
    partidas.map((p) => ({
      codigo: p.codigoPartida,
      descripcion: "",
      parcial: p.parcial?.toString() ?? null,
    })),
  );

  // Las promesas de liberacion. Se reutiliza la misma funcion pura que pinta
  // el indicador del Lookahead: si aqui se contara a mano, el panel y la
  // cabecera podrian decir numeros distintos del mismo dia.
  const promesas = cumplimientoDeLiberacion(
    restriccionesAbiertas.map((r) => ({
      tipo: "MATERIALES" as const,
      resuelta: false,
      resueltaAt: null,
      fechaCompromiso: r.fechaCompromiso,
      responsableUserId: r.responsableUserId,
      responsableContactoId: r.responsableContactoId,
    })),
    ahora,
  );

  // La ultima semana CERRADA por fecha de corte, sin depender del orden con
  // que llegue la consulta. Sus compromisos cuentan solo los ligados a una
  // tarea —asi viene la consulta—, de modo que el guardia de sobrecarga peca
  // de conservador: mejor callar un aviso que inventarlo.
  const ultimaCerrada = planesCerrados.reduce<
    (typeof planesCerrados)[number] | null
  >(
    (mejor, p) => (mejor === null || p.fechaCorte > mejor.fechaCorte ? p : mejor),
    null,
  );

  // Cuanto hace que el archivo del cronograma dice lo que dice. QUE es viejo
  // lo decide pendientes.ts; aqui solo se cuenta.
  const diasDeCronograma =
    cronograma === null
      ? null
      : Math.floor(
          (ahora.getTime() - cronograma.fechaCorte.getTime()) / 86_400_000,
        );

  return pendientesDeObra({
    tareasEmpezadasSinAvance,
    tareasConAvanceViejo,
    diasSinReportar: DIAS_SIN_REPORTAR,
    semanasSinPorcentaje,
    restriccionesVencidas: promesas.vencidasAbiertas,
    restriccionesSinResponsable: promesas.sinAsignar,
    incumplidosSinRetomar: arrastre.length,
    incumplidosCronicos: arrastre.filter((a) => a.veces > 1).length,
    lookaheadSinAnalizar: lookahead?.sinAnalizar ?? 0,
    confiabilidadMostrada: lookahead?.porcentaje ?? null,
    tareasProximasBloqueadas,
    tareasProximasSinAnalizar,
    diasVentana: DIAS_PROXIMAS,
    tareasProximasSinCobertura,
    partidasSobregiradas: sobregiradas,
    ppcUltimo: planes?.ultima?.ppc ?? null,
    ppcAnterior: planes?.anterior ?? null,
    coberturaMapeo: mapeos.length > 0 ? cob.porcentaje : null,
    compromisosUltimaSemana: ultimaCerrada?.compromisos.length ?? 0,
    diasDesdeCorteCronograma: diasDeCronograma,
  });
}

/** Las ordenes de la obra por estado. Null sin permiso para verlas. */
async function ordenesDeObra(
  sesion: SesionActiva,
  obraId: string,
): Promise<DatosTablero["ordenes"]> {
  if (!puede(sesion, "orden:leer")) return null;

  const porEstado = await prisma.ordenCompra.groupBy({
    by: ["estado"],
    where: { projectId: obraId, companyId: sesion.companyId },
    _count: true,
  });

  const cuenta = (estado: string) =>
    porEstado.find((f) => f.estado === estado)?._count ?? 0;

  return {
    total: porEstado.reduce((suma, f) => suma + f._count, 0),
    aprobadas: cuenta("APROBADA"),
    borradores: cuenta("BORRADOR"),
    anuladas: cuenta("ANULADA"),
  };
}
