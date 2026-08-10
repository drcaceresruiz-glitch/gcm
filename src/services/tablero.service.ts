import "server-only";

import { prisma } from "@/lib/prisma";
import { puede } from "@/lib/rbac";
import { esPositivo, restar } from "@/lib/decimal";
import {
  agruparPorCapitulo,
  alertasDeAtraso,
  cadenaCritica,
} from "@/lib/control-avance";
import { obtenerObra } from "@/services/obras.service";
import { datosCurvaS, obtenerCronograma } from "@/services/cronograma.service";
import { diasEntre, fechaCorta, hoy } from "@/utils/fechas";
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
 */
export async function datosTablero(
  sesion: SesionActiva,
  obraId: string,
): Promise<DatosTablero | null> {
  const obra = await obtenerObra(sesion, obraId);
  if (!obra) return null;

  const [presupuesto, ordenes, cronograma, curva] = await Promise.all([
    presupuestoDeObra(sesion, obraId),
    ordenesDeObra(sesion, obraId),
    obtenerCronograma(sesion, obraId),
    datosCurvaS(sesion, obraId),
  ]);

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
      finCronograma: curva.fin ? fechaCorta(curva.fin) : null,
      desvioFicha: curva.fin
        ? diasEntre(obra.fechaFinProgramada, curva.fin)
        : null,
      diasTotales,
      transcurridos: Math.max(0, transcurridos),
      restantes: diasEntre(hoy(), obra.fechaFinProgramada),
      porcentaje,
    },
    presupuesto,
    ordenes,
    cronograma: cronograma && armarCronograma(cronograma, curva),
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

  // La linea real se ancla en (inicio, 0): los cortes empiezan a los pocos
  // dias de arrancar la obra, y sin este punto la curva real salia como un
  // trozo suelto flotando lejos del origen en vez de subir desde el principio
  // del plazo, que es como se lee una curva S.
  const real: PuntoMini[] = [
    { t: 0, v: 0 },
    ...curva.cortes.map((c) => ({ t: t(c.fecha), v: Number(c.real) })),
    // Punto final VIVO a hoy: prolonga la linea real hasta el avance actual de
    // GCM (no solo hasta el ultimo corte de import), en linea con el numero
    // grande del modulo. Se omite si no hay avance vigente.
    ...(curva.puntoActual
      ? [{ t: t(curva.puntoActual.fecha), v: curva.puntoActual.real }]
      : []),
  ];

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
  const [partidas, comprometido, porPartida] = await Promise.all([
    prisma.wbsItem.aggregate({
      where: { tipo: "PARTIDA", projectId: obraId, project: { companyId: sesion.companyId } },
      _sum: { parcial: true },
      _count: true,
    }),

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

  const total = partidas._sum.parcial?.toString() ?? "0.00";
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
    partidas: partidas._count,
    sobregiradas,
  };
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
