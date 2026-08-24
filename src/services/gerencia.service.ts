import "server-only";

import { cache } from "react";
import { prisma } from "@/lib/prisma";
import { puede } from "@/lib/rbac";
import { filtroDeObras } from "@/lib/alcance-obras";
import { sumar, restar, esPositivo } from "@/lib/decimal";
import { alertasDeAtraso } from "@/lib/control-avance";
import { medirAvance, type AvanceReportado } from "@/lib/cronograma";
import { ponderarPorDuracion } from "@/lib/curva-s";
import { obraAdmiteCambios } from "@/lib/obras";
import { semaforoIndice, type Semaforo } from "@/lib/tablero";
import { diasEntre, hoy } from "@/utils/fechas";
import type { TipoRestriccion } from "@/generated/prisma/enums";
import { totalesPorObra } from "@/services/presupuesto-obra";
import { comprometidoPorObra } from "@/services/comprometido.service";
import {
  metricasEvm,
  valorDeAvance,
  type MetricasEvm,
} from "@/lib/evm";
import { bandaDePpc, type BandaPpc } from "@/lib/plan-semanal";
import {
  ppcDeLaUltimaCerrada,
  type UltimoPpc,
} from "@/services/plan-semanal.service";
import { estadoDeCadencia } from "@/lib/cadencia-valorizacion";
import { importeDeValorizacion, montoVigente } from "@/lib/adendas";
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
 *
 * El cronograma vigente + avances de cada obra —lo unico caro de este
 * archivo— se carga UNA sola vez por peticion en `loteConAvanceMedido`,
 * envuelto en `cache()`. `semaforoDeCartera` y `sobregiroProyectadoDeCartera`
 * lo consumen los dos: sin el `cache()`, la pagina —que pide las dos con
 * `Promise.all`— pagaria esa consulta dos veces. Cualquier funcion nueva que
 * necesite el avance fisico de la cartera debe llamar a este helper, nunca
 * repetir su propia consulta de cronograma.
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
/// Cuantas adendas pendientes se listan como mucho. Es una bandeja de firma:
/// veinte decisiones ya son mas de las que nadie resuelve de una sentada, y el
/// total sigue diciendose aunque la lista se corte.
export const MAX_ADENDAS_EN_BANDEJA = 20;

export interface AdendaPorFirmar {
  id: string;
  obraId: string;
  obraNombre: string;
  encargoId: string;
  /// Correlativo dentro del encargo: «la 2.a adenda de este contratista».
  numero: number;
  proveedor: string;
  concepto: string;
  /// Con signo: positivo es un adicional, negativo un deductivo.
  importe: string;
  fecha: Date;
  registradaPor: string;
  /// Dias desde que se registro. Es lo que convierte «hay una pendiente» en
  /// «hay una pendiente desde hace once dias».
  diasEsperando: number;
}

export interface BandejaDeFirma {
  adendas: AdendaPorFirmar[];
  /**
   * Las deducciones de costos propios que esperan firma.
   *
   * Van en la MISMA bandeja que las adendas y no en un panel aparte: para
   * quien firma son la misma tarea -algo que alguien pidio y espera-, y
   * repartirlas en dos cajas obliga a mirar en dos sitios para saber si queda
   * algo pendiente. Se listan aparte DENTRO de la bandeja porque tiran del
   * dinero en direcciones opuestas: una adenda se lo lleva y una deduccion lo
   * devuelve, asi que sumarlas en un solo importe daria una cifra que no
   * significa nada.
   */
  deducciones: DeduccionPorFirmar[];
  /// Cuantas ADENDAS hay en total, aunque la lista venga recortada.
  cuantas: number;
  /// Cuantas DEDUCCIONES hay en total.
  cuantasDeducciones: number;
  /// Lo que sumarian a los contratos si se firmaran todas las adendas, con
  /// signo.
  importe: string;
  /// Lo que volveria a las bolsas si se firmaran todas las deducciones.
  importeDeducciones: string;
  /// Dias que lleva esperando la mas antigua de TODAS. 0 si no hay ninguna.
  diasDeLaMasVieja: number;
  tope: number;
}

export interface DeduccionPorFirmar {
  id: string;
  obraId: string;
  obraNombre: string;
  /// Correlativo dentro de la obra.
  numero: number;
  /// La linea de la meta de la que se quiere dejar de gastar.
  linea: string;
  /// Que no se va a gastar, y por que se puede. Es lo que hay que leer para
  /// decidir: sin eso, aprobar seria firmar una cifra a ciegas.
  motivo: string;
  /// Siempre positivo: cuanto volveria a la bolsa.
  importe: string;
  solicitadaPor: string;
  diasEsperando: number;
}

/**
 * LO QUE ESPERA LA FIRMA DE GERENCIA, en un sitio.
 *
 * Las adendas se registran dentro del encargo y se firman dentro del encargo:
 * obra -> Proveedores -> el contratista -> el panel de adendas. Tres clics
 * desde una obra concreta, y CERO desde ninguna parte si no sabes en cual
 * mirar. El circuito se diseño con dos firmas -el residente registra, gerencia
 * aprueba- y a la segunda firma le faltaba la bandeja: quien tiene que firmar
 * no tenia como enterarse de que habia algo que firmar.
 *
 * MIENTRAS TANTO HAY DOS PERSONAS PARADAS. Al residente no se le deja pagar
 * al contratista por encima de lo firmado -el pago se rechaza nombrando esta
 * adenda-, y el comprometido de la obra no cuenta ese dinero, asi que la
 * cifra que mira el propio gerente para decidir esta corta. Las dos cosas se
 * arreglan con la misma firma.
 *
 * SE ORDENA POR ANTIGUEDAD, no por importe. Es lo contrario que
 * `adicionalesEnBorrador`, y a proposito: alli se mira exposicion -cuanto
 * dinero hay pedido- y aqui se mira una cola de trabajo. Lo que primero se
 * pudre es lo que lleva mas tiempo esperando, no lo que mas vale.
 *
 * DOS COSAS ESPERAN FIRMA, y las dos van aqui: las adendas del contratista y
 * las deducciones de costos propios. Para quien firma son la misma tarea, y
 * repartirlas en dos paneles obligaria a mirar en dos sitios para saber si
 * queda algo pendiente. Se listan por separado dentro de la bandeja porque
 * tiran del dinero en direcciones opuestas -la adenda se lo lleva, la
 * deduccion lo devuelve- y sumarlas en un solo importe daria una cifra que no
 * significa nada.
 *
 * QUIEN FIRMA CADA UNA ES UN PERMISO DISTINTO, y por eso cada lista se pide
 * por separado: en una empresa puede firmar adendas el jefe de proyectos y
 * deducciones solo el gerente. A quien no puede firmar ninguna de las dos no
 * se le enseña la bandeja.
 *
 * DOS consultas, con el nombre de la obra dentro.
 */
export async function adendasPorFirmar(
  sesion: SesionActiva,
): Promise<BandejaDeFirma | null> {
  const firmaAdendas = puede(sesion, "adenda:aprobar");
  const firmaDeducciones = puede(sesion, "deduccion:aprobar");

  // Una bandeja de firma para quien no firma nada es una lista de cosas que no
  // puede hacer.
  if (!firmaAdendas && !firmaDeducciones) return null;

  // El alcance de obras se resuelve una vez: es el mismo para las dos.
  const deLaEmpresa = {
    companyId: sesion.companyId,
    ...filtroDeObras(sesion),
  };

  const [filas, pedidas] = await Promise.all([
    firmaAdendas
      ? prisma.adendaEncargo.findMany({
          where: {
            estado: "PENDIENTE",
            // La empresa sale de la SESION y se aplica DONDE se lee.
            project: deLaEmpresa,
          },
          orderBy: { createdAt: "asc" },
          select: {
            id: true,
            numero: true,
            fecha: true,
            importe: true,
            concepto: true,
            registradaPor: true,
            createdAt: true,
            encargoId: true,
            projectId: true,
            project: { select: { nombreObra: true } },
            encargo: { select: { proveedor: { select: { razonSocial: true } } } },
          },
        })
      : [],
    firmaDeducciones
      ? prisma.deduccionCostoPropio.findMany({
          where: { estado: "PENDIENTE", project: deLaEmpresa },
          orderBy: { createdAt: "asc" },
          select: {
            id: true,
            numero: true,
            importe: true,
            motivo: true,
            solicitadaPor: true,
            createdAt: true,
            projectId: true,
            project: { select: { nombreObra: true } },
            item: { select: { descripcion: true } },
          },
        })
      : [],
  ]);

  const dia = hoy();

  const adendas = filas.slice(0, MAX_ADENDAS_EN_BANDEJA).map((a) => ({
    id: a.id,
    obraId: a.projectId,
    obraNombre: a.project.nombreObra,
    encargoId: a.encargoId,
    numero: a.numero,
    proveedor: a.encargo.proveedor.razonSocial,
    concepto: a.concepto,
    // A texto en la frontera: es dinero.
    importe: a.importe.toString(),
    fecha: a.fecha,
    registradaPor: a.registradaPor,
    diasEsperando: diasEntre(a.createdAt, dia),
  }));

  const deducciones = pedidas.slice(0, MAX_ADENDAS_EN_BANDEJA).map((d) => ({
    id: d.id,
    obraId: d.projectId,
    obraNombre: d.project.nombreObra,
    numero: d.numero,
    linea: d.item.descripcion,
    motivo: d.motivo,
    importe: d.importe.toString(),
    solicitadaPor: d.solicitadaPor,
    diasEsperando: diasEntre(d.createdAt, dia),
  }));

  // La mas antigua DE LAS DOS listas: la cifra del titular dice cuanto lleva
  // esperando lo que mas lleva, no lo que mas lleva de un tipo.
  const esperas = [
    ...filas.map((a) => a.createdAt),
    ...pedidas.map((d) => d.createdAt),
  ].map((f) => diasEntre(f, dia));

  return {
    adendas,
    deducciones,
    cuantas: filas.length,
    cuantasDeducciones: pedidas.length,
    // Los importes son los de TODAS, no solo las listadas: si se recorta la
    // lista, la cifra del titular no puede recortarse con ella.
    importe: sumar(filas.map((a) => a.importe.toString())),
    importeDeducciones: sumar(pedidas.map((d) => d.importe.toString())),
    diasDeLaMasVieja: esperas.length === 0 ? 0 : Math.max(...esperas),
    tope: MAX_ADENDAS_EN_BANDEJA,
  };
}

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
 * Lo caro de este archivo, resuelto UNA sola vez por peticion: las obras
 * vivas de la cartera (recortadas a `MAX_OBRAS_POR_CARGA`) con su cronograma
 * VIGENTE y el avance ya medido.
 *
 * - UNA consulta estrecha por obra —el cronograma VIGENTE con solo las
 *   columnas que hace falta medir—, con la forma de
 *   `avisos-reloj.hitosQueTocanHoy`. NUNCA `obtenerCronograma`: trae el
 *   documento entero con sus dependencias, y cargarlo en bucle es lo que
 *   tumbo produccion dos veces.
 * - UNA consulta de avances para TODO el lote, no una por obra: son las
 *   mismas filas que N consultas, en un solo viaje.
 *
 * `medirAvance` corre aqui, no en cada llamador: es exactamente la misma
 * cuenta que usa el tablero de cada obra, y calcularla dos veces con
 * distintos llamadores es como dos pantallas acaban contradiciendose entre
 * si —el modo de fallo caracteristico de GCM—.
 *
 * Envuelto en `cache()` de React: `semaforoDeCartera` y
 * `sobregiroProyectadoDeCartera` lo llaman los dos, y la pagina pide ambas
 * con `Promise.all` dentro del mismo request. Sin el `cache()`, la consulta
 * de cronograma se pagaria dos veces por carga de pantalla.
 */
const loteConAvanceMedido = cache(async function loteConAvanceMedido(
  sesion: SesionActiva,
) {
  const todas = await prisma.project.findMany({
    where: { companyId: sesion.companyId },
    orderBy: { nombreObra: "asc" },
    select: {
      id: true,
      nombreObra: true,
      estado: true,
      archivadaEn: true,
      // Solo lo necesita `valorizacionesDeCartera` (la cadencia de cada
      // encargo hereda el corte de SU obra si no tiene la suya propia),
      // pero sale gratis en la misma fila: ninguna consulta mas.
      diaCorteSemanal: true,
    },
  });

  // Solo obras que admiten cambios, como el reloj de avisos: una cerrada no
  // tiene atrasos que corregir, y una restaurada de respaldo es una foto.
  // PARALIZADA si cuenta: una obra parada puede seguir atrasada respecto a
  // su plan, y esconderla del panel de gerencia no es lo que se pidio aqui.
  const vivas = todas.filter((o) => obraAdmiteCambios(o, { permiteEnParalizada: true }));
  const loteObras = vivas.slice(0, MAX_OBRAS_POR_CARGA);

  if (loteObras.length === 0) {
    return { lote: [], obrasVivas: vivas.length };
  }

  const [vigentes, avances] = await Promise.all([
    Promise.all(
      loteObras.map((obra) =>
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
      where: { projectId: { in: loteObras.map((obra) => obra.id) } },
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

  const lote = loteObras.map((obra, i) => {
    const vigente = vigentes[i] ?? null;
    if (!vigente) {
      // La obra sale con la mano vacia, no desaparece: para el gerente,
      // «sin cronograma» es un dato de la obra, no la ausencia de la obra.
      return {
        obraId: obra.id,
        obraNombre: obra.nombreObra,
        diaCorteSemanal: obra.diaCorteSemanal,
        datos: null,
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

    return {
      obraId: obra.id,
      obraNombre: obra.nombreObra,
      diaCorteSemanal: obra.diaCorteSemanal,
      datos: { fechaCorte: vigente.fechaCorte, tareas },
    };
  });

  return { lote, obrasVivas: vivas.length };
});

/**
 * El semaforo de partidas criticas de la cartera, con su SPI por duracion.
 *
 * La cuenta NO se reescribe: es `alertasDeAtraso`, la misma que pinta el
 * tablero de cada obra, sobre las MISMAS tareas medidas con `medirAvance` y
 * con la MISMA fecha de corte —la del cronograma vigente—. Dos pantallas que
 * calculan distinto el mismo atraso acabarian contradiciendose, y ese es el
 * modo de fallo caracteristico de GCM.
 *
 * Solo se ensenan las alertas de severidad ALTA que ademas son de la ruta
 * critica: son las que corren la fecha de fin de la obra entera. El resto ya
 * se ve dentro de cada obra, y aqui seria ruido.
 *
 * El SPI por duracion sale del MISMO lote de tareas —`loteConAvanceMedido`—
 * y no cuesta ni una consulta mas. El SPI en soles NO entra: exige la
 * cobertura de mapeo tarea-partida y eso arrastra el EVM entero, que es
 * `datosEvm` en bucle.
 */
export async function semaforoDeCartera(
  sesion: SesionActiva,
): Promise<SemaforoCartera | null> {
  // La misma puerta que el resto de la pantalla: el ALCANCE, no un permiso.
  if (sesion.obrasAsignadas !== null) return null;
  if (!puede(sesion, "cronograma:leer")) return null;

  const { lote, obrasVivas } = await loteConAvanceMedido(sesion);

  if (lote.length === 0) {
    return {
      obras: [],
      criticasAtrasadas: 0,
      obrasEnRojo: 0,
      obrasVivas,
      tope: MAX_OBRAS_POR_CARGA,
    };
  }

  const obras: ObraDelSemaforo[] = lote.map((o) => {
    if (!o.datos) {
      return {
        obraId: o.obraId,
        obraNombre: o.obraNombre,
        spiPorDuracion: null,
        semaforo: null,
        sinCronograma: true,
        criticasAtrasadas: 0,
        partidas: [],
      };
    }

    const { fechaCorte, tareas } = o.datos;

    const criticas = alertasDeAtraso(tareas, fechaCorte).filter(
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
      obraId: o.obraId,
      obraNombre: o.obraNombre,
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
    obrasVivas,
    tope: MAX_OBRAS_POR_CARGA,
  };
}

// ---------------------------------------------------------------------------
// Sobregiro proyectado: % comprometido contra % de avance fisico
// ---------------------------------------------------------------------------

export interface ObraConSobregiroProyectado {
  obraId: string;
  obraNombre: string;
  /// Avance real ponderado por duracion. Rotulo obligatorio en pantalla:
  /// "avance fisico", NUNCA "SPI" -es el mismo ponderado que usa el
  /// semaforo, pero en puntos de avance, no en un ratio-. null sin
  /// cronograma o sin nada planeado todavia.
  avanceFisicoPct: number | null;
  /// Comprometido (encargos VIGENTE + ordenes sueltas APROBADA, la MISMA
  /// formula que `obtenerResumenEmpresa`/`datosAlertasEmpresa` en
  /// `obras.service.ts` -no `comprometidoPorPartida`, que es para el
  /// sobregiro YA ocurrido-) sobre el presupuesto de la obra. null si el
  /// presupuesto esta en cero.
  comprometidoPct: number | null;
  /// comprometidoPct - avanceFisicoPct. Positivo = se esta comprometiendo
  /// mas rapido de lo que avanza. null si falta cualquiera de los dos.
  desviacionPuntos: number | null;
  enRiesgo: boolean;
}

export interface SobregiroProyectadoCartera {
  /// Peor desviacion primero. Solo obras con datos suficientes para
  /// comparar (avanceFisicoPct y comprometidoPct no nulos) entran al orden;
  /// las demas van al final, con su motivo visible en sus campos null.
  obras: ObraConSobregiroProyectado[];
  obrasEnRiesgo: number;
  /// Igual que en `SemaforoCartera`: si supera `obras.length`, la pantalla
  /// tiene que decirlo.
  obrasVivas: number;
  tope: number;
}

/**
 * Cuantos puntos de diferencia entre comprometido y avance fisico cuentan
 * como riesgo. Nombrada, no un numero magico en medio de la cuenta: cambiar
 * el umbral es tocar una linea, no rastrear una cifra suelta.
 */
export const UMBRAL_SOBREGIRO_PROYECTADO_PUNTOS = 10;

/**
 * Que obras se estan comprometiendo mas rapido de lo que avanzan, ANTES de
 * que eso se note como sobregiro real de una partida.
 *
 * `partidasSobregiradas` (alertas de `obras.service.ts`) solo detecta el
 * sobregiro YA ocurrido, partida por partida. Esto es lo mismo pero
 * proyectado y de cartera: no existe en NINGUN otro sitio de GCM hoy, ni a
 * nivel de obra individual.
 *
 * Reusa `loteConAvanceMedido` para el avance fisico —CERO consultas extra
 * de cronograma— y anade dos consultas baratas y agregadas para el
 * comprometido y el presupuesto de las mismas obras del lote.
 */
export async function sobregiroProyectadoDeCartera(
  sesion: SesionActiva,
): Promise<SobregiroProyectadoCartera | null> {
  if (sesion.obrasAsignadas !== null) return null;
  // Deny-by-default: se exige TODO lo que la cifra toca (avance fisico +
  // comprometido), no solo el permiso "principal".
  if (!puede(sesion, "cronograma:leer")) return null;
  if (!puede(sesion, "orden:leer") || !puede(sesion, "encargo:leer")) return null;

  const { lote, obrasVivas } = await loteConAvanceMedido(sesion);

  if (lote.length === 0) {
    return { obras: [], obrasEnRiesgo: 0, obrasVivas, tope: MAX_OBRAS_POR_CARGA };
  }

  const obraIds = lote.map((o) => o.obraId);

  const [comprometidoDeCadaObra, presupuestos] = await Promise.all([
    // LA definicion compartida (`comprometido.service.ts`), la misma que el
    // tablero de la obra y el panel de empresa. Antes esto tenia su propia
    // pareja de consultas -y ninguna de las dos filtraba por empresa, se fiaba
    // de que `obraIds` ya venia acotado-: ahora el filtro se aplica tambien
    // donde se lee, como manda la regla.
    comprometidoPorObra(sesion, { id: { in: obraIds } }),
    // Ya existe, ya es batched: una consulta a `wbsItem`, sin tocar cronograma.
    totalesPorObra(obraIds),
  ]);

  const obras: ObraConSobregiroProyectado[] = lote.map((o) => {
    let avanceFisicoPct: number | null = null;
    if (o.datos) {
      const programadas = o.datos.tareas.filter((t) => !t.sinProgramar);
      const planeado = Number(
        ponderarPorDuracion(programadas, (t) => t.porcentajePlaneado),
      );
      if (planeado > 0) {
        avanceFisicoPct = Number(
          ponderarPorDuracion(programadas, (t) => t.porcentajeReal),
        );
      }
    }

    const presupuesto = Number(presupuestos.get(o.obraId)?.costoDirecto ?? "0");
    const comprometido = Number(comprometidoDeCadaObra.get(o.obraId)?.total ?? "0");
    const comprometidoPct = presupuesto > 0 ? (comprometido / presupuesto) * 100 : null;

    const desviacionPuntos =
      avanceFisicoPct !== null && comprometidoPct !== null
        ? comprometidoPct - avanceFisicoPct
        : null;

    return {
      obraId: o.obraId,
      obraNombre: o.obraNombre,
      avanceFisicoPct,
      comprometidoPct,
      desviacionPuntos,
      enRiesgo:
        desviacionPuntos !== null &&
        desviacionPuntos > UMBRAL_SOBREGIRO_PROYECTADO_PUNTOS,
    };
  });

  // Peor desviacion primero; las que no se pueden comparar (sin datos
  // suficientes) van al final, no desaparecen.
  obras.sort(
    (a, b) =>
      (b.desviacionPuntos ?? Number.NEGATIVE_INFINITY) -
      (a.desviacionPuntos ?? Number.NEGATIVE_INFINITY),
  );

  return {
    obras,
    obrasEnRiesgo: obras.filter((o) => o.enRiesgo).length,
    obrasVivas,
    tope: MAX_OBRAS_POR_CARGA,
  };
}

// ---------------------------------------------------------------------------
// Compras/encargos sin aprobar
// ---------------------------------------------------------------------------

export interface ObraConComprasPendientes {
  obraId: string;
  obraNombre: string;
  cuantas: number;
  importe: string;
}

export interface ComprasPendientes {
  porObra: ObraConComprasPendientes[];
  importe: string;
  cuantas: number;
}

/**
 * Las ORDENES DE COMPRA en BORRADOR de toda la empresa, con su impacto.
 *
 * Calco de `adicionalesEnBorrador` (arriba en este mismo archivo) pero
 * sobre `OrdenCompra`: dinero pedido que todavia no cuenta como
 * comprometido -eso solo pasa al aprobar-, y que obra por obra no se
 * percibe. UNA sola consulta: `OrdenCompra.total` no arrastra el mismo
 * problema de "recalculado al aprobar" que los movimientos presupuestales
 * (no tiene lineas que se editen aparte), asi que no hace falta una
 * segunda consulta de agregado -a diferencia de `adicionalesEnBorrador`-.
 */
export async function comprasPendientesDeAprobar(
  sesion: SesionActiva,
): Promise<ComprasPendientes | null> {
  if (sesion.obrasAsignadas !== null) return null;
  if (!puede(sesion, "orden:leer")) return null;

  const ordenes = await prisma.ordenCompra.findMany({
    where: { companyId: sesion.companyId, estado: "BORRADOR" },
    select: {
      id: true,
      projectId: true,
      total: true,
      project: { select: { nombreObra: true } },
    },
  });

  if (ordenes.length === 0) {
    return { porObra: [], importe: "0.00", cuantas: 0 };
  }

  const acumulado = new Map<string, { nombre: string; importes: string[] }>();
  for (const o of ordenes) {
    const fila = acumulado.get(o.projectId) ?? {
      nombre: o.project.nombreObra,
      importes: [],
    };
    fila.importes.push(o.total.toString());
    acumulado.set(o.projectId, fila);
  }

  const porObra = [...acumulado.entries()].map(([obraId, fila]) => ({
    obraId,
    obraNombre: fila.nombre,
    cuantas: fila.importes.length,
    importe: sumar(fila.importes),
  }));

  // De mayor a menor impacto, mismo criterio que los adicionales.
  porObra.sort((a, b) => Number(b.importe) - Number(a.importe));

  return {
    porObra,
    importe: sumar(porObra.map((o) => o.importe)),
    cuantas: ordenes.length,
  };
}

// ---------------------------------------------------------------------------
// Restricciones de Lookahead vencidas o por vencer
// ---------------------------------------------------------------------------

/// Ventana, en dias hacia adelante, para considerar una restriccion
/// "por vencer" y no solo "vencida" o "al dia".
const VENTANA_DIAS_POR_VENCER = 7;

export interface RestriccionDeCartera {
  id: string;
  obraId: string;
  obraNombre: string;
  tipo: TipoRestriccion;
  detalle: string | null;
  fechaCompromiso: Date;
  /// Positivo = dias que ya paso la fecha. Negativo = dias que faltan.
  diasVencida: number;
}

export interface RestriccionesCartera {
  vencidas: RestriccionDeCartera[];
  porVencer: RestriccionDeCartera[];
  totalVencidas: number;
}

/**
 * Restricciones del Lookahead sin resolver y con fecha de compromiso ya
 * pasada o proxima, agregadas de toda la cartera.
 *
 * UNA sola consulta. `Restriccion`/`LookaheadTask` son tablas
 * INDEPENDIENTES de `Cronograma`/`TareaCronograma`: esto no toca el
 * cronograma en absoluto, y no comparte nada con `loteConAvanceMedido`.
 *
 * A proposito NO se resuelve el nombre de la tarea (codigo/uid): eso
 * exigiria una segunda consulta contra el cronograma vigente de cada obra
 * para mapear `uid -> nombre`, justo el tipo de consulta que esta pantalla
 * evita. Tipo + detalle + obra + fecha de compromiso ya dice lo esencial;
 * el link a `/obras/[id]/lookahead` lleva al contexto completo.
 */
export async function restriccionesDeCartera(
  sesion: SesionActiva,
): Promise<RestriccionesCartera | null> {
  if (sesion.obrasAsignadas !== null) return null;
  if (!puede(sesion, "lookahead:leer")) return null;

  const filas = await prisma.restriccion.findMany({
    where: {
      resuelta: false,
      fechaCompromiso: { not: null },
      tarea: { project: { companyId: sesion.companyId } },
    },
    select: {
      id: true,
      tipo: true,
      detalle: true,
      fechaCompromiso: true,
      tarea: {
        select: { projectId: true, project: { select: { nombreObra: true } } },
      },
    },
    orderBy: { fechaCompromiso: "asc" },
  });

  const ahora = hoy();
  const vencidas: RestriccionDeCartera[] = [];
  const porVencer: RestriccionDeCartera[] = [];

  for (const f of filas) {
    // El `where` ya filtro `not: null`, pero el tipo generado sigue siendo
    // `Date | null`: se descarta explicito en vez de silenciar con `!`.
    if (!f.fechaCompromiso) continue;

    const diasVencida = diasEntre(f.fechaCompromiso, ahora);
    const fila: RestriccionDeCartera = {
      id: f.id,
      obraId: f.tarea.projectId,
      obraNombre: f.tarea.project.nombreObra,
      tipo: f.tipo,
      detalle: f.detalle,
      fechaCompromiso: f.fechaCompromiso,
      diasVencida,
    };

    if (diasVencida > 0) vencidas.push(fila);
    else if (diasVencida >= -VENTANA_DIAS_POR_VENCER) porVencer.push(fila);
  }

  return { vencidas, porVencer, totalVencidas: vencidas.length };
}

// ---------------------------------------------------------------------------
// EVM de cartera (proxy)
// ---------------------------------------------------------------------------

export interface ObraConEvmDeCartera {
  obraId: string;
  obraNombre: string;
  metricas: MetricasEvm;
}

export interface EvmDeCartera {
  obras: ObraConEvmDeCartera[];
  obrasVivas: number;
  tope: number;
}

/**
 * Valor ganado (EVM) de la cartera, en version PROXY -no el BAC/EV exactos
 * de `evm.service.ts` para una obra sola, que exige cargar el cronograma
 * COMPLETO (todas las versiones) y por eso no se puede repetir 10 veces
 * aqui.
 *
 * Reusa piezas que YA estan pagadas o son gratis:
 * - BAC = `totalesPorObra` (el mismo proxy de presupuesto que ya usa
 *   `sobregiroProyectadoDeCartera`; NO el BAC "real" con ajustes de linea
 *   base de `bacDeObra`, que costaria varias consultas mas por obra).
 * - PV/EV = `valorDeAvance(bac, %)` de `@/lib/evm`, con el %planeado/%real
 *   ponderado por duracion que sale del MISMO `loteConAvanceMedido` que ya
 *   paga `semaforoDeCartera`/`sobregiroProyectadoDeCartera` -es literalmente
 *   el mismo numero que ahi se rotula "avance fisico", convertido a soles-.
 * - AC = ordenes APROBADAS (unica consulta nueva de esta funcion), la MISMA
 *   definicion que usa `evm.service.ts` para una obra: NO es el
 *   "comprometido" de `sobregiroProyectadoDeCartera` (que suma encargos
 *   vigentes aun sin formalizar) — son dos cifras a proposito distintas,
 *   documentado en `evm.service.ts`.
 * - `metricasEvm`/`hayBaseParaProyectar` de `@/lib/evm`: aritmetica pura,
 *   sin tocar la base.
 *
 * Rotulo obligatorio en pantalla: CPI/EAC/VAC de esta seccion son
 * "de cartera (aproximado)", nunca a secas -mismo criterio que "SPI por
 * duracion"-. Es un CUARTO indicador de costo/avance en la app (junto al
 * SPI del EVM de obra, el SPI por duracion de gerencia, y el avance fisico
 * del sobregiro proyectado); llamarlo igual que cualquiera de esos tres
 * seria repetir el problema de confianza que ya costo caro una vez.
 */
export async function evmDeCartera(
  sesion: SesionActiva,
): Promise<EvmDeCartera | null> {
  if (sesion.obrasAsignadas !== null) return null;
  if (!puede(sesion, "cronograma:leer")) return null;
  if (!puede(sesion, "orden:leer")) return null;

  const { lote, obrasVivas } = await loteConAvanceMedido(sesion);

  if (lote.length === 0) {
    return { obras: [], obrasVivas, tope: MAX_OBRAS_POR_CARGA };
  }

  const obraIds = lote.map((o) => o.obraId);

  const [presupuestos, imputaciones] = await Promise.all([
    totalesPorObra(obraIds),
    // AC: SOLO ordenes ya aprobadas -sueltas y contra encargo, sin
    // distincion-, igual que `evm.service.ts` para una obra. `OrdenImputacion`
    // no tiene `projectId` propio (solo `ordenId`/`wbsItemId`): se agrega en
    // JS por `ordenCompra.projectId`, mismo patron que `imputacionesSueltas`
    // en `sobregiroProyectadoDeCartera`.
    prisma.ordenImputacion.findMany({
      where: {
        ordenCompra: {
          estado: "APROBADA",
          projectId: { in: obraIds },
          companyId: sesion.companyId,
        },
      },
      select: { importe: true, ordenCompra: { select: { projectId: true } } },
    }),
  ]);

  const acPorObra = new Map<string, string[]>();
  for (const i of imputaciones) {
    const obraId = i.ordenCompra.projectId;
    const importes = acPorObra.get(obraId) ?? [];
    importes.push(i.importe.toString());
    acPorObra.set(obraId, importes);
  }

  const obras: ObraConEvmDeCartera[] = lote.map((o) => {
    const bac = presupuestos.get(o.obraId)?.costoDirecto ?? "0.00";

    let planeadoPct = 0;
    let realPct = 0;
    if (o.datos) {
      const programadas = o.datos.tareas.filter((t) => !t.sinProgramar);
      planeadoPct = Number(
        ponderarPorDuracion(programadas, (t) => t.porcentajePlaneado),
      );
      realPct = Number(
        ponderarPorDuracion(programadas, (t) => t.porcentajeReal),
      );
    }

    const pv = valorDeAvance(bac, planeadoPct);
    const ev = valorDeAvance(bac, realPct);
    // `ac` NUNCA null aqui: el gate de "orden:leer" ya paso al entrar a la
    // funcion. `null` en `EntradaEvm.ac` significa "sin permiso" -si se
    // pasara aqui, `hayBaseParaProyectar` diria el motivo equivocado
    // ("no tienes permiso") a una obra que en realidad solo no tiene
    // todavia ninguna orden aprobada ("sin_gasto").
    const ac = sumar(acPorObra.get(o.obraId) ?? []);

    return {
      obraId: o.obraId,
      obraNombre: o.obraNombre,
      metricas: metricasEvm({ bac, pv, ev, ac }),
    };
  });

  return { obras, obrasVivas, tope: MAX_OBRAS_POR_CARGA };
}

// ---------------------------------------------------------------------------
// Confiabilidad de cartera (PPC de la ultima semana cerrada, por obra)
// ---------------------------------------------------------------------------

export interface ObraConPpc {
  obraId: string;
  obraNombre: string;
  /// null = esta obra todavia no tiene ninguna semana de Plan Semanal cerrada.
  ultimo: UltimoPpc | null;
  banda: BandaPpc | null;
}

export interface ConfiabilidadDeCartera {
  /// Con ultimo PPC primero, peor banda arriba; las que no tienen ninguna
  /// semana cerrada van al final.
  obras: ObraConPpc[];
  obrasSinPlanCerrado: number;
}

/**
 * El PPC de la ultima semana cerrada de cada obra de la cartera.
 *
 * Reusa `ppcDeLaUltimaCerrada` de `plan-semanal.service.ts` tal cual -la
 * MISMA cuenta que ya usa `/panel`, no una segunda formula-. A proposito
 * NO promedia el historico de cada obra: eso exigiria traer todas sus
 * semanas cerradas, el mismo coste que esa funcion evito desde que se
 * escribio ("con un año de obra son cincuenta semanas, para acabar usando
 * una de cada cincuenta").
 *
 * Los `obraIds` salen de `loteConAvanceMedido` -mismo lote y mismo filtro
 * de "obra viva" que el resto de la pantalla-, no del filtro propio de
 * `semanaDeLaEmpresa` (que no excluye obras `archivadaEn`): sin esto, una
 * obra restaurada de un respaldo podria aparecer aqui mientras el resto de
 * `/gerencia` ya la excluye.
 */
export async function confiabilidadDeCartera(
  sesion: SesionActiva,
): Promise<ConfiabilidadDeCartera | null> {
  if (sesion.obrasAsignadas !== null) return null;
  if (!puede(sesion, "plan_semanal:leer")) return null;

  const { lote } = await loteConAvanceMedido(sesion);
  if (lote.length === 0) return { obras: [], obrasSinPlanCerrado: 0 };

  const porObra = await ppcDeLaUltimaCerrada(lote.map((o) => o.obraId));

  const obras: ObraConPpc[] = lote.map((o) => {
    const ultimo = porObra.get(o.obraId) ?? null;
    return {
      obraId: o.obraId,
      obraNombre: o.obraNombre,
      ultimo,
      banda: ultimo?.ppc === null || ultimo?.ppc === undefined
        ? null
        : bandaDePpc(ultimo.ppc),
    };
  });

  // Peor banda primero (malo, flojo, bueno), y dentro de cada banda el PPC
  // mas bajo arriba; sin ninguna semana cerrada, al final.
  const ORDEN_BANDA: Record<BandaPpc, number> = { malo: 0, flojo: 1, bueno: 2 };
  obras.sort((a, b) => {
    if (a.banda === null && b.banda === null) return 0;
    if (a.banda === null) return 1;
    if (b.banda === null) return -1;
    if (a.banda !== b.banda) return ORDEN_BANDA[a.banda] - ORDEN_BANDA[b.banda];
    return (a.ultimo?.ppc ?? 0) - (b.ultimo?.ppc ?? 0);
  });

  return {
    obras,
    obrasSinPlanCerrado: obras.filter((o) => o.ultimo === null).length,
  };
}

// ---------------------------------------------------------------------------
// Valorizaciones de cartera
// ---------------------------------------------------------------------------

export interface ObraConValorizaciones {
  obraId: string;
  obraNombre: string;
  vencidas: number;
  /// Con saldo por pagar, pero todavia no vencida.
  pendientes: number;
  porPagarTotal: string;
}

export interface ValorizacionesDeCartera {
  /// Solo las obras con algo por pagar, mayor porPagarTotal primero.
  obras: ObraConValorizaciones[];
  totalVencidas: number;
}

/**
 * Cuantas valorizaciones estan vencidas o pendientes de pago, de toda la
 * cartera. No existe hoy ningun otro sitio donde verlo sin entrar obra por
 * obra: `/panel` solo muestra "comprometido" (encargos + ordenes), nunca el
 * estado de PAGO real.
 *
 * Reusa, sin copiar, las dos piezas puras que ya usa `pagos.service.ts`
 * para una obra: `estadoDeCadencia` (los tres niveles de herencia -fechas
 * pactadas, `cadenciaDias` del encargo, `diaCorteSemanal` de la obra-) e
 * `importeValorizado`. `diaCorteSemanal` sale del lote de
 * `loteConAvanceMedido`, ya extendido para traerlo.
 *
 * COSTE REAL, dicho sin adornar: MEDIA, no BARATA. Es la primera seccion de
 * este archivo que carga filas COMPLETAS con relaciones anidadas (fechas
 * pactadas + ultima valorizacion + todos los pagos) en vez de un agregado
 * puro -sigue siendo UNA consulta, sin loop por obra, pero con mas payload
 * que cualquier otro bloque de gerencia hoy-.
 */
export async function valorizacionesDeCartera(
  sesion: SesionActiva,
): Promise<ValorizacionesDeCartera | null> {
  if (sesion.obrasAsignadas !== null) return null;
  if (!puede(sesion, "orden:leer")) return null;

  const { lote } = await loteConAvanceMedido(sesion);
  if (lote.length === 0) return { obras: [], totalVencidas: 0 };

  const diaCortePorObra = new Map(lote.map((o) => [o.obraId, o.diaCorteSemanal]));
  const obraIds = lote.map((o) => o.obraId);

  const encargos = await prisma.encargoProveedor.findMany({
    where: { estado: "VIGENTE", projectId: { in: obraIds } },
    select: {
      projectId: true,
      montoContratado: true,
      // Contra el VIGENTE: un adicional aprobado es dinero que el contratista
      // puede valorizar y cobrar, y sin contarlo el «por pagar» de gerencia
      // salia corto justo en los encargos que mas se han movido.
      adendas: { where: { estado: "APROBADA" }, select: { importe: true } },
      cadenciaDias: true,
      fechaInicio: true,
      createdAt: true,
      fechasValorizacion: { select: { fecha: true } },
      valorizaciones: {
        orderBy: { fecha: "desc" },
        take: 1,
        select: { fecha: true, porcentaje: true, importe: true },
      },
      pagos: { select: { monto: true } },
    },
  });

  const dia = hoy();
  const acumulado = new Map<
    string,
    { vencidas: number; pendientes: number; porPagar: string[] }
  >();

  for (const e of encargos) {
    const diaCorteObra = diaCortePorObra.get(e.projectId) ?? 5;
    const ultima = e.valorizaciones[0] ?? null;
    const porcentaje = ultima?.porcentaje.toString() ?? "0";
    // Con el importe CONGELADO del corte cuando lo hay: recalcularlo contra el
    // contrato de hoy revaluaria el pasado en cuanto entra una adenda.
    const valorizado = ultima
      ? importeDeValorizacion(
          {
            porcentaje,
            importe: ultima.importe?.toString() ?? null,
          },
          montoVigente(
            e.montoContratado.toString(),
            e.adendas.map((a) => ({ importe: a.importe.toString() })),
          ),
        )
      : "0.00";
    const pagado = sumar(e.pagos.map((p) => p.monto.toString()));
    const porPagar = restar(valorizado, pagado) ?? "0.00";

    if (!esPositivo(porPagar)) continue;

    const cadencia = estadoDeCadencia(
      {
        diaCorteObra,
        cadenciaDias: e.cadenciaDias,
        fechas: e.fechasValorizacion.map((f) => f.fecha),
        ultimaValorizacion: ultima?.fecha ?? null,
        inicioEncargo: e.fechaInicio ?? e.createdAt,
      },
      dia,
    );

    const fila = acumulado.get(e.projectId) ?? {
      vencidas: 0,
      pendientes: 0,
      porPagar: [],
    };
    if (cadencia.vencida) fila.vencidas++;
    else fila.pendientes++;
    fila.porPagar.push(porPagar);
    acumulado.set(e.projectId, fila);
  }

  const nombrePorObra = new Map(lote.map((o) => [o.obraId, o.obraNombre]));
  const obras: ObraConValorizaciones[] = [...acumulado.entries()].map(
    ([obraId, f]) => ({
      obraId,
      obraNombre: nombrePorObra.get(obraId) ?? obraId,
      vencidas: f.vencidas,
      pendientes: f.pendientes,
      porPagarTotal: sumar(f.porPagar),
    }),
  );

  obras.sort((a, b) => Number(b.porPagarTotal) - Number(a.porPagarTotal));

  return {
    obras,
    totalVencidas: obras.reduce((n, o) => n + o.vencidas, 0),
  };
}
