import "server-only";

import { prisma } from "@/lib/prisma";
import { puede } from "@/lib/rbac";
import { sumar } from "@/lib/decimal";
import { alertasDeAtraso } from "@/lib/control-avance";
import { medirAvance, type AvanceReportado } from "@/lib/cronograma";
import { ponderarPorDuracion } from "@/lib/curva-s";
import { obraAdmiteCambios } from "@/lib/obras";
import { semaforoIndice, type Semaforo } from "@/lib/tablero";
import type { SesionActiva } from "@/services/sesion.service";

/**
 * La lectura de GERENCIA: la cartera entera, no una obra.
 *
 * Es la vista cross-obra que solo tiene sentido para quien responde de todas.
 * La puerta NO es un permiso nuevo —la matriz ya tiene bastantes, y uno que
 * en la practica siempre acompana a otro solo sirve para que un dia falte—
 * sino el ALCANCE: `obrasAsignadas === null` significa «ve toda la cartera»,
 * que es exactamente la definicion de gerente en GCM. Ver
 * `@/lib/alcance-obras`.
 *
 * REGLA DE COSTE, y manda sobre todo lo demas que se anada aqui: este panel
 * corre sobre N obras a la vez, en un hosting de 20 Entry Processes donde
 * cargar UN cronograma entero en una pantalla ya tumbo produccion dos veces.
 * Nada de lo que viva aqui puede hacer una consulta por obra si existe la
 * forma de hacer una para todas. En particular **`datosEvm` no se llama
 * desde aqui**: encadena cinco consultas por obra, dos de ellas cargando el
 * cronograma completo y todas las partidas.
 */

export interface ObraConAdicionales {
  obraId: string;
  obraNombre: string;
  /// Cuantos adicionales lleva en borrador.
  cuantos: number;
  /// Lo que sumarian al presupuesto si se aprobaran todos.
  importe: string;
}

export interface AdicionalesPendientes {
  porObra: ObraConAdicionales[];
  /// El total de la cartera. Es la cifra del titular.
  importe: string;
  cuantos: number;
}

/**
 * Los ADICIONALES en BORRADOR de toda la empresa, con su impacto.
 *
 * Un adicional en borrador es dinero que todavia no cuenta en ningun sitio
 * —el BAC solo suma los aprobados— pero que ya esta pedido. Es justo la cifra
 * que un gerente necesita ver junta: obra por obra no se percibe, y en la
 * cartera puede ser la diferencia entre el margen del año y su ausencia.
 *
 * ## Se suman las LINEAS, no `totalEntradas`
 *
 * El movimiento persiste sus totales «para poder listar sin agregar», pero su
 * propio esquema advierte de que **no se confia en ellos**: se recalculan
 * desde las lineas dentro de la transaccion de aprobacion. Mientras el
 * movimiento sigue en BORRADOR se le anaden y quitan lineas, asi que el total
 * guardado puede ir por detras. Aqui se agrega desde las lineas, que es la
 * verdad, y cuesta UNA consulta mas para todas las obras.
 *
 * ## Dos consultas en total, sean dos obras o cuarenta
 *
 * Una para los movimientos y otra para sus lineas agrupadas. Nada crece con
 * el numero de obras.
 */
export async function adicionalesEnBorrador(
  sesion: SesionActiva,
): Promise<AdicionalesPendientes | null> {
  // Solo quien ve toda la cartera. A quien lleva una obra no se le ensena el
  // pendiente de las demas: es la misma linea que traza el alcance por obra.
  if (sesion.obrasAsignadas !== null) return null;
  if (!puede(sesion, "movimiento:leer")) return null;

  const movimientos = await prisma.movimientoPresupuestal.findMany({
    where: {
      tipo: "ADICIONAL",
      estado: "BORRADOR",
      project: { companyId: sesion.companyId },
    },
    select: {
      id: true,
      projectId: true,
      project: { select: { nombreObra: true } },
    },
  });

  if (movimientos.length === 0) {
    return { porObra: [], importe: "0.00", cuantos: 0 };
  }

  const lineas = await prisma.movimientoLinea.groupBy({
    by: ["movimientoId"],
    where: { movimientoId: { in: movimientos.map((m) => m.id) } },
    _sum: { importe: true },
  });

  const importePorMovimiento = new Map(
    lineas.map((l) => [l.movimientoId, l._sum.importe?.toString() ?? "0"]),
  );

  // Agrupado por obra, con el nombre que ya vino en la consulta.
  const acumulado = new Map<string, { nombre: string; importes: string[] }>();

  for (const m of movimientos) {
    const fila = acumulado.get(m.projectId) ?? {
      nombre: m.project.nombreObra,
      importes: [],
    };
    fila.importes.push(importePorMovimiento.get(m.id) ?? "0");
    acumulado.set(m.projectId, fila);
  }

  const porObra = [...acumulado.entries()].map(([obraId, fila]) => ({
    obraId,
    obraNombre: fila.nombre,
    cuantos: fila.importes.length,
    importe: sumar(fila.importes),
  }));

  // De mayor a menor impacto: la lista se lee de arriba abajo y lo que hay
  // que mirar primero es lo que mas dinero mueve, no la obra mas antigua.
  porObra.sort((a, b) => Number(b.importe) - Number(a.importe));

  return {
    porObra,
    importe: sumar(porObra.map((o) => o.importe)),
    cuantos: movimientos.length,
  };
}

// ---------------------------------------------------------------------------
// El semaforo de partidas criticas y el SPI por duracion
// ---------------------------------------------------------------------------

export interface PartidaCritica {
  uid: number;
  codigo: string | null;
  nombre: string;
  /// Dias de trabajo que YA cuesta el atraso de la propia partida.
  diasAtraso: string;
  /// Por que esta aqui, con las palabras del tablero de la obra.
  motivo: string | null;
}

export interface ObraDelSemaforo {
  obraId: string;
  obraNombre: string;
  /**
   * Avance real entre planeado, ponderados por DURACION. No es el SPI del
   * valor ganado: aqui no hay dinero, solo plazo. Por eso en pantalla se
   * rotula SIEMPRE «SPI por duracion»: llamar «SPI» a secas a dos cuentas
   * distintas segun la pantalla es como se pierde la confianza en las cifras.
   *
   * null cuando no hay cronograma o nada planeado todavia: sin plan no hay
   * indice, y un guion honesto vale mas que un 1.00 inventado.
   */
  spiPorDuracion: number | null;
  semaforo: Semaforo | null;
  sinCronograma: boolean;
  /// Cuantas partidas criticas van por detras del plan en esta obra.
  criticasAtrasadas: number;
  /// Las tres que mas dias cuestan. El resto se mira dentro de la obra.
  partidas: PartidaCritica[];
}

export interface SemaforoCartera {
  /// Peor primero: mas criticas atrasadas y, a igualdad, menor indice.
  obras: ObraDelSemaforo[];
  /// Partidas criticas atrasadas en lo examinado. Es la cifra del titular.
  criticasAtrasadas: number;
  obrasEnRojo: number;
  /// Obras vivas de la empresa. Si supera `obras.length`, se recorto y la
  /// pantalla debe decirlo: un panel que oculta obras en silencio se lee
  /// como «no hay nada», que es lo contrario de la verdad.
  obrasVivas: number;
  tope: number;
}

/**
 * Cuantas obras se examinan por carga de pantalla.
 *
 * Mismo criterio que `MAX_OBRAS_POR_PASADA` del reloj: este hosting corta
 * las peticiones largas, y el coste crece con las obras —dos consultas mas
 * por cada una—. Diez caben con holgura; si un dia la cartera lo supera, la
 * pantalla dice cuantas quedaron fuera en vez de callarselas.
 */
export const MAX_OBRAS_POR_CARGA = 10;

/**
 * El semaforo de partidas criticas de la cartera, con su SPI por duracion.
 *
 * La cuenta NO se reescribe: es `alertasDeAtraso`, la misma que pinta el
 * tablero de cada obra, sobre las MISMAS tareas medidas con `medirAvance` y
 * con la MISMA fecha de corte —la del cronograma vigente—. Dos pantallas que
 * calculan distinto el mismo atraso acabarian contradiciendose, y ese es el
 * modo de fallo caracteristico de GCM.
 *
 * Lo unico nuevo es de donde salen las tareas sin arruinar el servidor:
 *
 * - UNA consulta estrecha por obra —el cronograma VIGENTE con solo las
 *   columnas que la cuenta necesita—, con la forma de
 *   `avisos-reloj.hitosQueTocanHoy`. NUNCA `obtenerCronograma`: trae el
 *   documento entero con sus dependencias, y cargarlo en bucle es lo que
 *   tumbo produccion dos veces.
 * - UNA consulta de avances para TODO el lote, no una por obra: son las
 *   mismas filas que N consultas, en un solo viaje.
 * - Y el tope de obras por carga, dicho en pantalla cuando recorta.
 *
 * Solo se ensenan las alertas de severidad ALTA que ademas son de la ruta
 * critica: son las que corren la fecha de fin de la obra entera. El resto ya
 * se ve dentro de cada obra, y aqui seria ruido.
 *
 * El SPI por duracion sale del MISMO lote de tareas y no cuesta ni una
 * consulta mas. El SPI en soles NO entra: exige la cobertura de mapeo
 * tarea-partida y eso arrastra el EVM entero, que es `datosEvm` en bucle.
 */
export async function semaforoDeCartera(
  sesion: SesionActiva,
): Promise<SemaforoCartera | null> {
  // La misma puerta que el resto de la pantalla: el ALCANCE, no un permiso.
  if (sesion.obrasAsignadas !== null) return null;
  if (!puede(sesion, "cronograma:leer")) return null;

  const todas = await prisma.project.findMany({
    where: { companyId: sesion.companyId },
    orderBy: { nombreObra: "asc" },
    select: { id: true, nombreObra: true, estado: true, archivadaEn: true },
  });

  // Solo obras que admiten cambios, como el reloj de avisos: una cerrada no
  // tiene atrasos que corregir, y una restaurada de respaldo es una foto.
  // PARALIZADA si cuenta: una obra parada puede seguir atrasada respecto a
  // su plan, y esconderla del panel de gerencia no es lo que se pidio aqui.
  const vivas = todas.filter((o) => obraAdmiteCambios(o, { permiteEnParalizada: true }));
  const lote = vivas.slice(0, MAX_OBRAS_POR_CARGA);

  if (lote.length === 0) {
    return {
      obras: [],
      criticasAtrasadas: 0,
      obrasEnRojo: 0,
      obrasVivas: vivas.length,
      tope: MAX_OBRAS_POR_CARGA,
    };
  }

  const [vigentes, avances] = await Promise.all([
    Promise.all(
      lote.map((obra) =>
        prisma.cronograma.findFirst({
          where: { projectId: obra.id },
          orderBy: [{ fechaCorte: "desc" }, { version: "desc" }],
          select: {
            fechaCorte: true,
            tareas: {
              select: {
                uid: true, fila: true, codigo: true, nombre: true,
                nivel: true, esResumen: true, esHito: true, esCritico: true,
                inicio: true, fin: true, sinProgramar: true,
                duracionDias: true, porcentajePlaneado: true,
                porcentajeArchivo: true,
              },
            },
          },
        }),
      ),
    ),
    // El avance vive aparte del cronograma para sobrevivir a sus versiones,
    // igual que en `obtenerCronograma`.
    prisma.avanceTarea.findMany({
      where: { projectId: { in: lote.map((obra) => obra.id) } },
      select: {
        projectId: true, uid: true, porcentaje: true, fecha: true,
        createdAt: true, reportadoPor: true, nota: true,
      },
    }),
  ]);

  const avancesPorObra = new Map<string, AvanceReportado[]>();
  for (const a of avances) {
    const fila = {
      uid: a.uid,
      porcentaje: a.porcentaje.toString(),
      fecha: a.fecha,
      createdAt: a.createdAt,
      reportadoPor: a.reportadoPor,
      nota: a.nota,
    };
    const lista = avancesPorObra.get(a.projectId);
    if (lista) lista.push(fila);
    else avancesPorObra.set(a.projectId, [fila]);
  }

  const obras: ObraDelSemaforo[] = lote.map((obra, i) => {
    const vigente = vigentes[i] ?? null;
    if (!vigente) {
      // La obra sale con la mano vacia, no desaparece: para el gerente,
      // «sin cronograma» es un dato de la obra, no la ausencia de la obra.
      return {
        obraId: obra.id,
        obraNombre: obra.nombreObra,
        spiPorDuracion: null,
        semaforo: null,
        sinCronograma: true,
        criticasAtrasadas: 0,
        partidas: [],
      };
    }

    // Los Decimal se pasan a texto en la frontera, como en todo el sistema,
    // y el avance reportado desde obra manda sobre el porcentaje del
    // archivo: esa regla vive en `medirAvance` y aqui solo se llama.
    const { tareas } = medirAvance(
      vigente.tareas.map((t) => ({
        ...t,
        duracionDias: t.duracionDias.toString(),
        porcentajePlaneado: t.porcentajePlaneado.toString(),
        porcentajeArchivo: t.porcentajeArchivo.toString(),
      })),
      avancesPorObra.get(obra.id) ?? [],
    );

    const criticas = alertasDeAtraso(tareas, vigente.fechaCorte).filter(
      (a) => a.severidad === "alta" && a.esCritico,
    );

    /**
     * El SPI compara contra un plan, y una tarea sin programar no tiene
     * plan: sus fechas son el relleno que exige la columna. Se aparta de
     * la cuenta igual que `alertasDeAtraso` la aparta de las alertas.
     */
    const programadas = tareas.filter((t) => !t.sinProgramar);
    const planeado = Number(
      ponderarPorDuracion(programadas, (t) => t.porcentajePlaneado),
    );
    const real = Number(
      ponderarPorDuracion(programadas, (t) => t.porcentajeReal),
    );
    const spi = planeado > 0 ? Number((real / planeado).toFixed(2)) : null;

    return {
      obraId: obra.id,
      obraNombre: obra.nombreObra,
      spiPorDuracion: spi,
      semaforo: semaforoIndice(spi),
      sinCronograma: false,
      criticasAtrasadas: criticas.length,
      // `alertasDeAtraso` ya viene por dias de atraso, de mas a menos.
      partidas: criticas.slice(0, 3).map((a) => ({
        uid: a.uid,
        codigo: a.codigo,
        nombre: a.nombre,
        diasAtraso: a.diasAtraso,
        motivo: a.motivo,
      })),
    };
  });

  // Peor primero: la lista se lee de arriba abajo, y lo primero que hay que
  // mirar es la obra con mas partidas criticas atrasadas; a igualdad, la de
  // peor indice. Las que no tienen indice —sin cronograma— van al final.
  obras.sort(
    (a, b) =>
      b.criticasAtrasadas - a.criticasAtrasadas ||
      (a.spiPorDuracion ?? Number.POSITIVE_INFINITY) -
        (b.spiPorDuracion ?? Number.POSITIVE_INFINITY),
  );

  return {
    obras,
    criticasAtrasadas: obras.reduce((n, o) => n + o.criticasAtrasadas, 0),
    obrasEnRojo: obras.filter((o) => o.semaforo === "rojo").length,
    obrasVivas: vivas.length,
    tope: MAX_OBRAS_POR_CARGA,
  };
}
