import "server-only";
import { SinPermisoError } from "@/lib/errores";
import { estadoDelEmisor } from "@/lib/emisor-sms";
import { verificarSalud } from "@/services/salud.service";
import { cache } from "react";
import { prisma } from "@/lib/prisma";
import { puede } from "@/lib/rbac";
import { alcanzaObra, filtroDeObras, VE_TODAS_LAS_OBRAS } from "@/lib/alcance-obras";
import { esPositivo, restar, sumar } from "@/lib/decimal";
import { importeDeValorizacion, montoVigente } from "@/lib/adendas";
import {
  comprometidoDelAmbito,
  comprometidoPorObra,
} from "@/services/comprometido.service";
import { subtotalesPorRama, sumarHojas } from "@/lib/jerarquia-partidas";
import { totalDeEmpresa, totalesPorObra } from "@/services/presupuesto-obra";
import {
  estadoDeObra,
  validarObra,
  ESTADOS_OBRA,
  formatearCorrelativoObra,
  puedeTransicionarObra,
  requisitosParaEjecutar,
  puedeArrancar,
  requisitosParaCerrar,
  puedeCerrar,
  motivoNoAdmiteCambios,
  ETIQUETA_ESTADO_OBRA,
  fechaDeObra,
  ESTADOS_OBRA_CON_EXPOSICION,
  type EstadoObra,
} from "@/lib/obras";
import { diasEntre, hoy } from "@/utils/fechas";
import {
  contarPaginas,
  normalizarPagina,
  saltar,
  POR_PAGINA,
  type Pagina,
} from "@/lib/paginacion";
import type { SesionActiva } from "@/services/sesion.service";

/**
 * Consulta de obras.
 *
 * Regla de aislamiento: el `companyId` sale SIEMPRE de la sesion, nunca de
 * un parametro de la peticion. Es lo unico que impide que un usuario de una
 * empresa vea las obras de otra manipulando un identificador en la URL.
 *
 * Y DENTRO de la empresa manda el alcance por obra (`@/lib/alcance-obras`),
 * que sale tambien de la sesion. Aqui esta el embudo que lo cierra para toda
 * la aplicacion: `obtenerObra` es la puerta por la que pasa el layout de
 * `/obras/[id]`, asi que negarla ahi apaga de golpe todas las pantallas de
 * dentro de una obra; y `listarObras` con el resumen y las alertas son lo
 * unico que nombra obras en el panel.
 */

export interface ObraResumen {
  id: string;
  codigoObra: string | null;
  /// Correlativo del sistema ("OB-000001"). Null solo en obras anteriores a
  /// su introduccion.
  correlativo: string | null;
  nombreObra: string;
  ubicacion: string | null;
  estado: string;
  fechaInicio: Date;
  fechaFinProgramada: Date;
  /// Suma de los parciales de todas las partidas. String para no perder
  /// precision al viajar del servidor al navegador.
  presupuestoTotal: string;
  totalPartidas: number;
  /**
   * Comprometido con proveedores, con la MISMA definicion que
   * `obtenerComprometido` en la pantalla de la obra: encargos VIGENTES (su
   * monto contratado, que es el precio del contratista) mas ordenes sueltas
   * APROBADAS por su importe imputable. Una orden emitida contra un encargo
   * no suma —su dinero ya lo puso el monto del encargo—, un borrador todavia
   * no compromete a nadie y una anulada dejo de hacerlo.
   */
  comprometido: string;
  /// Partidas cuyo comprometido supera su parcial.
  partidasSobregiradas: number;
}

export interface ResumenEmpresa {
  obras: number;
  obrasEnEjecucion: number;
  /**
   * Cuantas obras hay DETRAS del dinero de abajo: en ejecucion o paralizadas
   * (`ESTADOS_OBRA_CON_EXPOSICION`).
   *
   * Va aparte de `obrasEnEjecucion` porque no son lo mismo y el panel lo
   * notaba: las cifras cubren tambien las paralizadas -paralizar no borra lo
   * comprometido- pero el conteo no, asi que con cero en ejecucion y una
   * paralizada la caja se titulaba «La obra en ejecución» sobre cifras de una
   * obra parada. Y con CERO obras vivas se pintaba esa misma caja llena de
   * ceros, que es lo que hizo preguntar «¿por que esas tarjetas no muestran
   * nada?»: no estaban rotas, es que no habia nada que enseñar y nadie lo
   * decia.
   */
  obrasConExposicion: number;
  /**
   * Suma de las partidas SOLO de las obras en ejecucion, no de la cartera
   * entera. Mezclar planificacion, ejecucion y cerradas daba un numero
   * contra el que nadie decide nada: la exposicion de hoy es lo que esta
   * vivo. La cartera completa es cifra de presentacion, no de operacion.
   */
  presupuestoTotal: string;
  /// Comprometido con proveedores de las obras con exposicion, con LA
  /// definicion compartida de `comprometido.service.ts`: encargos vigentes
  /// por su monto VIGENTE -adendas aprobadas incluidas- mas ordenes sueltas
  /// aprobadas por su importe imputable. Las ordenes contra un encargo no
  /// suman: ya las puso el.
  comprometido: string;
  /// Presupuesto menos comprometido, ambos ya acotados a ejecucion. Puede
  /// salir negativo, y entonces hay que verlo: se ha pedido mas de lo que
  /// hay presupuestado.
  saldo: string;
  partidasSobregiradas: number;
  obrasConPlazoVencido: number;
}

/**
 * Las cifras de la empresa para encabezar el panel: el conteo de obras es de
 * todas; el dinero, SOLO de las que tienen exposicion real HOY
 * (`ESTADOS_OBRA_CON_EXPOSICION`: en ejecucion o paralizada).
 *
 * Primero no existian en ninguna pantalla; despues sumaban la cartera
 * completa, y ese numero mezclaba obras en planificacion, en ejecucion y
 * cerradas: contra el no se decide nada. Lo que el panel debe contestar a
 * primera vista es la exposicion de HOY —cuanto hay presupuestado y
 * comprometido en lo que esta vivo—.
 *
 * Hasta el 22 de agosto de 2026 esto miraba solo `EN_EJECUCION`, y una obra
 * paralizada con encargos vigentes desaparecia de estas cifras aunque la
 * deuda con el proveedor siguiera existiendo —mientras `gerencia.service.ts`
 * y `avisos-reloj.ts` ya la seguian contando como viva—. Ver
 * `ESTADOS_OBRA_CON_EXPOSICION` en `lib/obras.ts`.
 *
 * Va aparte de `listarObras` a proposito: aquella devuelve UNA PAGINA y
 * estas cifras no dependen de la pagina. Calcularlas desde ella daria un
 * total distinto en cada pagina, que es justo la clase de cifra que no puede
 * aparecer en un panel de control.
 */
export async function obtenerResumenEmpresa(
  sesion: SesionActiva,
): Promise<ResumenEmpresa> {
  if (!puede(sesion, "obra:leer")) throw new SinPermisoError();

  const deLaEmpresa = { companyId: sesion.companyId };

  /**
   * Las obras que ESTE usuario puede contar. Las cifras de cabecera son la
   * exposicion de lo que uno gestiona, no la de la constructora: un residente
   * que lee el presupuesto y el comprometido de la cartera entera sigue
   * sabiendo justo lo que esta capa viene a no contarle.
   *
   * Va en su propio objeto y NO dentro de `deLaEmpresa`, que se esparce
   * tambien en filtros de `OrdenCompra`: alli `id` es el de la ORDEN, no el
   * de la obra, y el filtro no daria error —devolveria cero, y el panel
   * ensenaria un comprometido de 0,00 perfectamente creible—.
   */
  const obrasDelAlcance = { ...deLaEmpresa, ...filtroDeObras(sesion) };

  // Las cifras de sobregiro y plazo vencido salen de `datosAlertasEmpresa`, que
  // esta cacheada por peticion: el panel tambien pide las alertas para el
  // popup, asi que ese trabajo se hace una sola vez y aqui solo se leen sus
  // totales. Lo demas son agregados propios que van en el mismo lote.
  const [
    obras,
    obrasEnEjecucion,
    obrasConExposicion,
    presupuesto,
    comprometido,
    alertas,
  ] = await Promise.all([
      prisma.project.count({ where: obrasDelAlcance }),

      prisma.project.count({
        where: { ...obrasDelAlcance, estado: "EN_EJECUCION" },
      }),

      // Las que de verdad ponen el dinero de abajo. Ver `obrasConExposicion`.
      prisma.project.count({
        where: {
          ...obrasDelAlcance,
          estado: { in: [...ESTADOS_OBRA_CON_EXPOSICION] },
        },
      }),

      // Con la regla de hojas y no con un `SUM` plano: filtrar por `tipo` no
      // protege del doble conteo, porque un grupo a suma alzada con hijas
      // costeadas tambien es PARTIDA. Acotado a `ESTADOS_OBRA_CON_EXPOSICION`
      // igual que el comprometido de abajo: las dos cifras se restan para dar
      // el saldo, y restar ambitos distintos daria un numero que no es de
      // nadie. PARALIZADA entra: paralizar no borra lo comprometido.
      totalDeEmpresa(sesion, ESTADOS_OBRA_CON_EXPOSICION),

      // El comprometido con LA definicion compartida, la misma que ve el
      // tablero de cada obra: encargos VIGENTES por su monto vigente -con las
      // adendas aprobadas dentro- mas las ordenes sueltas aprobadas. Hasta el
      // 23/08 esto sumaba `montoContratado`, asi que un adicional ya firmado
      // por gerencia no aparecia en la exposicion de la empresa.
      comprometidoDelAmbito(sesion, {
        estado: { in: [...ESTADOS_OBRA_CON_EXPOSICION] },
        ...filtroDeObras(sesion),
      }),

      datosAlertasEmpresa(sesion),
    ]);

  const presupuestoTotal = presupuesto;
  const comprometidoTotal = comprometido.total;

  return {
    obras,
    obrasEnEjecucion,
    obrasConExposicion,
    presupuestoTotal,
    comprometido: comprometidoTotal,
    // Con aritmetica decimal y no con resta de numeros: aqui son importes, y
    // en este sistema el dinero nunca pasa por coma flotante.
    // Con `restar` y no con `sumar([a, `-${b}`])`: esa forma produce "--100"
    // en cuanto el sustraendo ya es negativo, y `sumar` la descarta en
    // silencio devolviendo el minuendo intacto —o sea, el saldo entero—.
    saldo: restar(presupuestoTotal, comprometidoTotal) ?? "0.00",
    partidasSobregiradas: alertas.partidasSobregiradas,
    obrasConPlazoVencido: alertas.obrasConPlazoVencido,
  };
}

interface DatosAlertas {
  alertas: AlertaEmpresa[];
  /// Total de partidas de la empresa por encima de su presupuesto.
  partidasSobregiradas: number;
  /// Obras con exposicion real (en ejecucion o paralizada, ver
  /// `ESTADOS_OBRA_CON_EXPOSICION`) con la fecha de fin ya pasada.
  obrasConPlazoVencido: number;
}

/**
 * Calcula de UNA sola vez todo lo de alertas: la lista para el popup y los
 * totales para las cifras del resumen.
 *
 * Va en `cache()` porque el panel pide, por separado y con el MISMO objeto de
 * sesion, el resumen (que necesita los totales) y las alertas (para el popup).
 * Sin esto, el trabajo pesado —dos agregados y sus busquedas de nombres— se
 * hacia dos veces por carga del panel; con el, una.
 *
 * Comparar partida a partida —y no dos sumas— es a proposito: un total holgado
 * puede esconder varias partidas pasadas de largo, que es justo lo que hay que
 * corregir con una reconversion.
 */
const datosAlertasEmpresa = cache(async function datosAlertasEmpresa(
  sesion: SesionActiva,
): Promise<DatosAlertas> {
  const deLaEmpresa = { companyId: sesion.companyId };

  const [comprometido, vencidas] = await Promise.all([
    // El comprometido de toda la cartera del alcance, con la definicion
    // compartida. Trae ya repartido por partida QUIEN se paso de su parcial:
    // antes esa cuenta se rehacia aqui, y una copia mas de la misma regla es
    // una copia mas que se puede quedar atras.
    comprometidoPorObra(sesion, filtroDeObras(sesion)),
    prisma.project.findMany({
      where: {
        ...deLaEmpresa,
        ...filtroDeObras(sesion),
        // PARALIZADA entra: si el plazo ya paso y la obra encima esta
        // parada, eso es mas relevante para gerencia, no menos.
        estado: { in: [...ESTADOS_OBRA_CON_EXPOSICION] },
        fechaFinProgramada: { lt: new Date() },
      },
      select: { id: true, nombreObra: true, fechaFinProgramada: true },
    }),
  ]);

  const alertas: AlertaEmpresa[] = [];
  let partidasSobregiradas = 0;

  // Cuantas partidas se pasan de su parcial, y de que obra es cada una: el
  // total va al resumen, el desglose por obra al popup. Quien decide que es un
  // sobregiro es `resumirComprometido`, no este bucle: hasta el 23/08 la regla
  // -incluida la trampa del parcial negativo- estaba copiada en tres sitios.
  const sobregiroPorObra = new Map<string, number>();
  for (const [obraId, resumen] of comprometido) {
    if (resumen.sobregiradas.length === 0) continue;
    partidasSobregiradas += resumen.sobregiradas.length;
    sobregiroPorObra.set(obraId, resumen.sobregiradas.length);
  }

  if (sobregiroPorObra.size > 0) {
    const conSobregiro = await prisma.project.findMany({
      where: { id: { in: [...sobregiroPorObra.keys()] } },
      select: { id: true, nombreObra: true },
    });
    const nombrePorId = new Map(conSobregiro.map((o) => [o.id, o.nombreObra]));

    for (const [obraId, n] of sobregiroPorObra) {
      alertas.push({
        obraId,
        obraNombre: nombrePorId.get(obraId) ?? "Obra",
        clave: "sobregiro",
        camino: `/obras/${obraId}`,
        texto:
          n === 1
            ? "1 partida comprometida por encima de su presupuesto"
            : `${n} partidas comprometidas por encima de su presupuesto`,
      });
    }
  }

  for (const obra of vencidas) {
    alertas.push({
      obraId: obra.id,
      obraNombre: obra.nombreObra,
      clave: "plazo",
      camino: `/obras/${obra.id}`,
      texto: `El plazo vencio hace ${diasEntre(obra.fechaFinProgramada, new Date())} dia(s)`,
    });
  }

  // --- Avisos de la EMPRESA, que no son de ninguna obra ---------------------
  //
  // Van con los demas y no en una pantalla aparte porque el sintoma se sufre
  // en la obra: al residente no le llega el codigo, o esta mirando datos de
  // una version que ya no corre. Los dos detectores existian desde hace
  // tiempo; lo que faltaba era que hablaran donde alguien mira.
  //
  // Solo para quien puede actuar. `configuracion:editar` es justo el permiso
  // que gobierna el telefono emisor, y es innegociable, asi que esto no puede
  // acabar en la pantalla de un consultor por reconfiguracion de nadie.
  if (puede(sesion, "configuracion:editar")) {
    const ahora = new Date();

    const emisores = await prisma.emisorSms.findMany({
      where: { companyId: sesion.companyId, activo: true },
      select: { ultimaConsultaAt: true },
    });

    // Basta UNO despierto: los otros son respaldo, y avisar porque un
    // respaldo duerme seria una alarma encendida casi siempre.
    const algunoVivo = emisores.some(
      (e) => estadoDelEmisor(e.ultimaConsultaAt, ahora) === "vivo",
    );

    if (emisores.length > 0 && !algunoVivo) {
      /**
       * El latido dice si la APP esta consultando, no si los SMS salen.
       *
       * El aviso afirmaba «los codigos de acceso no estan saliendo», que es
       * una consecuencia que nunca comprobo: Android duerme la aplicacion al
       * apagar la pantalla —lo dice el propio `lib/emisor-sms`—, asi que el
       * latido se corta en un telefono que funciona y la alarma salia a
       * diario siendo falsa.
       *
       * Lo que SI se puede comprobar es si hay mensajes esperando: con la
       * cola vacia, un telefono callado no esta reteniendo nada.
       */
      const enCola = await prisma.mensajeSms.count({
        where: { companyId: sesion.companyId, enviadoAt: null },
      });

      alertas.push({
        obraId: null,
        obraNombre: "Mensajeria de la empresa",
        clave: "emisor-dormido",
        texto:
          enCola > 0
            ? `Ningun telefono emisor responde y hay ${enCola} mensaje(s) sin salir.`
            : "Ningun telefono emisor esta dando señal. No hay mensajes esperando, asi que puede ser solo que la aplicacion este en segundo plano.",
        camino: "/empresa/configuracion",
      });
    }

    const salud = await verificarSalud();
    if (salud.desplieguePendiente) {
      alertas.push({
        obraId: null,
        obraNombre: "Version del sistema",
        clave: "despliegue-pendiente",
        texto:
          "Hay una version subida sin aplicar: lo que se ve no es la ultima.",
        camino: "/empresa/configuracion",
      });
    }
  }

  return { alertas, partidasSobregiradas, obrasConPlazoVencido: vencidas.length };
});

export interface AlertaEmpresa {
  /// null cuando la alerta es de la EMPRESA y no de una obra concreta.
  obraId: string | null;
  /// El nombre de la obra, o el del ambito cuando no hay obra.
  obraNombre: string;
  clave:
    | "sobregiro"
    | "plazo"
    | "emisor-dormido"
    | "despliegue-pendiente";
  texto: string;
  /**
   * A donde se va a arreglar.
   *
   * Las de obra llevan a la obra; las de empresa, a su configuracion. Es
   * obligatorio a proposito: un aviso que no dice donde se arregla obliga a
   * buscarlo, y entonces se ignora.
   */
  camino: string;
}

/**
 * El detalle de las alertas que `obtenerResumenEmpresa` solo cuenta.
 *
 * El resumen dice «1 alerta» pero no dice DE QUE obra ni de que tipo: sin
 * esto, la unica forma de encontrarla era abrir cada tarjeta de obra una por
 * una a ver cual tenia la insignia encendida. Aqui se resuelve la misma
 * pregunta que ya contesta el globo de `FranjaObra`, pero para la empresa
 * entera y con enlace a la obra que corresponde.
 */
export async function listarAlertasEmpresa(
  sesion: SesionActiva,
): Promise<AlertaEmpresa[]> {
  if (!puede(sesion, "obra:leer")) throw new SinPermisoError();
  return (await datosAlertasEmpresa(sesion)).alertas;
}

export interface FiltrosObras {
  pagina?: string;
  porPagina?: number;
  /// Texto libre sobre nombre y codigo.
  q?: string;
  estado?: string;
}

/**
 * Las obras de la empresa, filtradas y paginadas.
 *
 * Antes las traia TODAS y ademas hacia dos agregados sobre todas ellas: con
 * cincuenta obras eran cincuenta tarjetas y dos consultas que crecian sin
 * limite.
 *
 * **El orden pone las activas primero y las cerradas al final**, y sale gratis
 * de la base: `estado` es un ENUM de MariaDB y ORDER BY sobre un ENUM ordena
 * por el indice de declaracion, no alfabeticamente. El esquema lo declara
 * PLANIFICACION, EN_EJECUCION, PARALIZADA, CERRADA, que es justo el orden en
 * que interesa verlas. Si algun dia se reordena ese enum, este orden cambia
 * con el.
 */
export async function listarObras(
  sesion: SesionActiva,
  opciones: FiltrosObras = {},
): Promise<Pagina<ObraResumen>> {
  if (!puede(sesion, "obra:leer")) throw new SinPermisoError();

  const porPagina = opciones.porPagina ?? POR_PAGINA;

  const texto = opciones.q?.trim();
  const estado = ESTADOS_OBRA.find((e) => e === opciones.estado);

  const where = {
    companyId: sesion.companyId,
    // Dentro de la empresa, solo las asignadas. Va en el `where` y no
    // filtrando despues: la paginacion y el total tienen que contar lo mismo
    // que se ensena, o la pagina 2 traeria huecos.
    ...filtroDeObras(sesion),
    ...(estado ? { estado } : {}),
    ...(texto
      ? {
          OR: [
            { nombreObra: { contains: texto } },
            { codigoObra: { contains: texto } },
            // El correlativo tambien se busca: es justo para lo que existe.
            { correlativo: { contains: texto } },
          ],
        }
      : {}),
  };

  const total = await prisma.project.count({ where });
  const totalPaginas = contarPaginas(total, porPagina);
  const pagina = normalizarPagina(opciones.pagina, totalPaginas);

  const obras = await prisma.project.findMany({
    where,
    orderBy: [{ estado: "asc" }, { createdAt: "desc" }],
    skip: saltar(pagina, porPagina),
    take: porPagina,
    select: {
      id: true,
      codigoObra: true,
      correlativo: true,
      nombreObra: true,
      ubicacion: true,
      estado: true,
      fechaInicio: true,
      fechaFinProgramada: true,
    },
  });

  if (obras.length === 0) {
    return { filas: [], total, pagina, totalPaginas };
  }

  // Se agrega en la base y no en JavaScript: sumar miles de partidas en
  // memoria seria innecesariamente costoso y perderia precision decimal.
  //
  // Los dos agregados —presupuesto por obra y comprometido por obra— son
  // independientes entre si, asi que van en el mismo lote: encadenarlos solo
  // sumaba una ida y vuelta a la base de mas por cada carga del panel.
  const idsObras = obras.map((o) => o.id);
  const [totales, comprometido] = await Promise.all([
    // Igual que arriba: la regla de hojas, no una suma plana por tipo.
    totalesPorObra(idsObras),

    // El comprometido de estas obras con LA definicion compartida. Hasta el
    // 23/08 este bloque tenia su propia copia de las consultas, del reparto y
    // de la deteccion de sobregiro; eran ochenta lineas que repetian, una a
    // una, decisiones ya tomadas en otro sitio.
    comprometidoPorObra(sesion, { id: { in: idsObras } }),
  ]);

  const porObra = totales;

  const filas = obras.map((obra) => {
    const agregado = porObra.get(obra.id);
    return {
      ...obra,
      presupuestoTotal: agregado?.costoDirecto ?? "0",
      totalPartidas: agregado?.partidas ?? 0,
      comprometido: comprometido.get(obra.id)?.total ?? "0.00",
      partidasSobregiradas: comprometido.get(obra.id)?.sobregiradas.length ?? 0,
    };
  });

  return { filas, total, pagina, totalPaginas };
}

export interface ObraDetalle {
  id: string;
  codigoObra: string | null;
  correlativo: string | null;
  nombreObra: string;
  ubicacion: string | null;
  cliente: string | null;
  estado: string;
  fechaInicio: Date;
  fechaFinProgramada: Date;
  /// Dia de la semana esperado para el corte de avance (ISO 1..7, viernes=5).
  diaCorteSemanal: number;
  /// Version de la linea base aprobada, o null si el presupuesto sigue abierto.
  lineaBaseVersion: number | null;
  /// Los tres solo tienen valor con `estado === "PARALIZADA"`; se limpian a
  /// null al reanudar o cerrar. Una obra paralizada antes de que existiera
  /// este campo tambien los trae en null.
  motivoParalizacion: string | null;
  fechaEstimadaReanudacion: Date | null;
}

/**
 * La obra, o null si no existe o no es de esta empresa.
 *
 * En `cache()` porque la piden el layout de `obras/[id]` —que pinta el
 * nombre y las pestanas— y ademas cada una de sus paginas. Sin envolverla
 * serian dos consultas identicas en cada navegacion dentro de una obra.
 */
export const obtenerObra = cache(async function obtenerObra(
  sesion: SesionActiva,
  obraId: string,
): Promise<ObraDetalle | null> {
  if (!puede(sesion, "obra:leer")) throw new SinPermisoError();

  /**
   * ESTA es la puerta de toda la obra.
   *
   * El layout de `/obras/[id]` llama aqui y hace `notFound()` con un null,
   * asi que negar aqui apaga las mas de cincuenta pantallas de dentro sin
   * que ninguna tenga que acordarse de nada.
   *
   * Se comprueba ANTES de consultar y se devuelve el MISMO null que una obra
   * inexistente, a proposito: distinguir «no existe» de «existe pero no es
   * tuya» ya seria contar algo. Y sale gratis —el alcance viaja en la
   * sesion—, asi que no cuesta ni una consulta.
   *
   * No se compone con `filtroDeObras` porque este `where` ya fija `id`: la
   * clave del filtro es tambien `id` y una pisaria a la otra.
   */
  if (!alcanzaObra(sesion, obraId)) return null;

  // El companyId sale de la sesion: manipular el id de la URL no permite
  // alcanzar la obra de otra empresa, simplemente no aparece.
  const obra = await prisma.project.findFirst({
    where: { id: obraId, companyId: sesion.companyId },
    select: {
      id: true,
      codigoObra: true,
      correlativo: true,
      nombreObra: true,
      ubicacion: true,
      cliente: true,
      estado: true,
      fechaInicio: true,
      fechaFinProgramada: true,
      diaCorteSemanal: true,
      motivoParalizacion: true,
      fechaEstimadaReanudacion: true,
      baselines: {
        where: { aprobadaAt: { not: null } },
        orderBy: { version: "desc" },
        take: 1,
        select: { version: true },
      },
    },
  });

  if (!obra) return null;

  const { baselines, ...resto } = obra;
  return { ...resto, lineaBaseVersion: baselines[0]?.version ?? null };
});

/**
 * Que pasos del ciclo de la obra tienen ya algo cargado.
 *
 * Alimenta la ruta de la obra (el riel de ubicacion del layout) y el anclaje
 * de continuidad: siete `findFirst` que solo piden el id, en paralelo. No
 * cuenta nada —no importa CUANTO hay, solo si el paso se dio—.
 *
 * En `cache()` por lo mismo que `obtenerObra`: la pide el layout en cada
 * navegacion dentro de la obra.
 */
export interface HitosObra {
  presupuesto: boolean;
  cronograma: boolean;
  /// Linea base del PRESUPUESTO aprobada (la referencia congelada).
  lineaBase: boolean;
  /**
   * Hay al menos UNA revision, aprobada o no.
   *
   * Distinto de `lineaBase`: la propuesta para el cliente se puede emitir
   * desde un borrador -con su sello-, y de hecho verla en papel es parte de
   * decidir si se aprueba. Sin ninguna revision esa pantalla no tiene nada
   * que enseñar, y su entrada del menu no debe existir.
   */
  revision: boolean;
  /// Hay al menos una tarea ANALIZADA en el Lookahead. No basta con que la
  /// tarea este en la matriz: desde que las restricciones se eligen, traerla
  /// no analiza nada y el hito se encenderia sin que nadie hubiera mirado.
  lookahead: boolean;
  /// Existe al menos una semana del PTS.
  planSemanal: boolean;
  /// Hay un presupuesto meta APROBADO. El borrador no cuenta: hasta que se
  /// congela no gobierna ninguna bolsa, igual que en `metaQueManda`.
  meta: boolean;
  /**
   * Hay un presupuesto meta, aunque siga en borrador.
   *
   * Lo usa el anclaje de continuidad, que pregunta otra cosa que la bolsa:
   * no si la meta ya manda, sino si el primer tramo del alta esta dado. Con
   * `meta` a secas, a quien cargo el real y aun no lo aprobo se le volvia a
   * pedir que lo cargara.
   */
  metaCargada: boolean;
  /**
   * El cronograma tiene un corte fijado como linea base.
   *
   * Es OTRA cosa que `lineaBase`, que es la del presupuesto. Esta gobierna el
   * plazo: sin ella el avance se mide contra el ultimo corte cargado, o sea
   * contra si mismo, y la obra siempre parece ir al dia.
   */
  lineaBaseCronograma: boolean;
  /**
   * Hay alguien asignado a la obra.
   *
   * NO alimenta el riel del menu —no hay seccion «Equipo» en las fases del
   * ciclo— sino el anclaje de continuidad: es el paso del alta que mas se
   * olvida y el unico cuyo sintoma aparece en la pantalla de OTRA persona
   * («entro y no veo ninguna obra»), asi que quien lo omite no lo nota.
   */
  equipo: boolean;
  /**
   * Hay alguien a quien asignar: un usuario ACTIVO cuyo rol NO ve ya toda la
   * cartera. Alimenta el paso «asignar equipo» del anclaje: sin nadie
   * asignable no hay boton que ofrecer y proponerlo seria un callejon.
   */
  equipoAsignable: boolean;
}

export const hitosDeObra = cache(async function hitosDeObra(
  sesion: SesionActiva,
  obraId: string,
): Promise<HitosObra> {
  if (!puede(sesion, "obra:leer")) throw new SinPermisoError();

  // Defensa en profundidad: hoy solo se llega aqui tras `obtenerObra`, que ya
  // habria negado. Se repite porque es gratis y porque la proteccion de una
  // funcion no puede depender de en que orden la llame quien la use manana.
  if (!alcanzaObra(sesion, obraId)) {
    return {
      presupuesto: false,
      cronograma: false,
      lineaBase: false,
      revision: false,
      lookahead: false,
      planSemanal: false,
      meta: false,
      metaCargada: false,
      lineaBaseCronograma: false,
      equipo: false,
      equipoAsignable: false,
    };
  }

  // El companyId sale de la sesion, como en toda consulta de obra.
  const deLaObra = {
    projectId: obraId,
    project: { companyId: sesion.companyId },
  };

  const [
    partida,
    cronograma,
    cronogramaBase,
    base,
    revision,
    lookahead,
    plan,
    meta,
    metaCargada,
    miembro,
    asignables,
  ] =
    await Promise.all([
    prisma.wbsItem.findFirst({ where: deLaObra, select: { id: true } }),
    prisma.cronograma.findFirst({ where: deLaObra, select: { id: true } }),
    prisma.cronograma.findFirst({
      where: { ...deLaObra, lineaBaseAt: { not: null } },
      select: { id: true },
    }),
    prisma.baseline.findFirst({
      where: { ...deLaObra, aprobadaAt: { not: null } },
      select: { id: true },
    }),
    // Cualquier revision, aprobada o no: la propuesta se puede emitir desde
    // un borrador, con su sello.
    prisma.baseline.findFirst({ where: deLaObra, select: { id: true } }),
    prisma.lookaheadTask.findFirst({
      where: { ...deLaObra, analizadaAt: { not: null } },
      select: { id: true },
    }),
    prisma.planSemanal.findFirst({ where: deLaObra, select: { id: true } }),
    prisma.presupuestoMeta.findFirst({
      where: { ...deLaObra, aprobadaAt: { not: null } },
      select: { id: true },
    }),
    // Sin exigir que este aprobada: para el anclaje, cargarla ya es el paso.
    prisma.presupuestoMeta.findFirst({ where: deLaObra, select: { id: true } }),
    // La pertenencia NO lleva `project: { companyId }` como las demas: la
    // tabla cuelga de la obra, y la obra ya se comprobo de esta empresa en
    // `alcanzaObra` y en el `obtenerObra` del layout.
    prisma.projectMembership.findFirst({
      where: { projectId: obraId },
      select: { userId: true },
    }),
    // Cuenta barata (companyId + estado + role, indexados) de quien PODRIA
    // asignarse: activo y con rol que no ve ya toda la cartera. Un ADMIN no
    // cuenta porque ya la ve sin asignacion.
    prisma.user.count({
      where: {
        companyId: sesion.companyId,
        estado: "ACTIVO",
        role: { notIn: [...VE_TODAS_LAS_OBRAS] },
      },
    }),
  ]);

  return {
    presupuesto: partida !== null,
    cronograma: cronograma !== null,
    lineaBase: base !== null,
    revision: revision !== null,
    lookahead: lookahead !== null,
    planSemanal: plan !== null,
    meta: meta !== null,
    metaCargada: metaCargada !== null,
    lineaBaseCronograma: cronogramaBase !== null,
    equipo: miembro !== null,
    equipoAsignable: asignables > 0,
  };
});

/**
 * Cuanto trabajo espera en cada seccion del menu.
 *
 * Alimenta las insignias del menu de la obra. Hasta ahora GCM calculaba todo
 * esto para el panel «Que falta» del tablero y el menu no sabia nada: para
 * enterarte de que tenias cinco restricciones vencidas habia que ir al tablero
 * a mirarlas.
 *
 * SE CUENTA SOLO LO QUE SE PUEDE CONTAR BARATO, y esa restriccion manda sobre
 * lo completo que sea. Esto corre en el layout, o sea en CADA navegacion
 * dentro de la obra, sobre un hosting de 20 Entry Processes donde cargar el
 * cronograma entero en una pantalla ya tumbo produccion dos veces. Por eso son
 * dos `count` con indice y nada mas: no se cruzan tareas con avances ni se
 * reconstruyen ventanas.
 *
 * Lo que queda fuera a proposito: las tareas del parte sin reportar y las
 * tareas de la ventana sin analizar. Las dos exigen leer el cronograma
 * completo y medirlo, que es justo lo que no puede hacerse aqui. Siguen
 * saliendo en el panel «Que falta», que se calcula una vez y en su sitio.
 */
export interface AvisosSeccion {
  /// Restricciones abiertas cuya fecha comprometida ya paso. Alguien dijo que
  /// las tendria y no las tuvo: eso tiene nombre y apellidos, y por eso mueve.
  lookahead: number;
  /// Semanas ABIERTAS cuyo corte ya paso: estan sin cerrar y ya toca.
  planSemanal: number;
  /// Notas pendientes cuyo recordatorio ya paso. "Vencida" nunca se guarda
  /// (ver `esVencida` en `@/lib/notas`): se cuenta con la misma condicion,
  /// no leyendo una columna que no existe.
  notas: number;
}

export const avisosDeSeccion = cache(async function avisosDeSeccion(
  sesion: SesionActiva,
  obraId: string,
): Promise<AvisosSeccion> {
  const vacio = { lookahead: 0, planSemanal: 0, notas: 0 };
  if (!puede(sesion, "obra:leer")) return vacio;
  if (!alcanzaObra(sesion, obraId)) return vacio;

  const hoyDia = hoy();
  const deLaObra = {
    projectId: obraId,
    project: { companyId: sesion.companyId },
  };

  const [vencidas, sinCerrar, notasVencidas] = await Promise.all([
    puede(sesion, "lookahead:leer")
      ? prisma.restriccion.count({
          where: {
            resuelta: false,
            fechaCompromiso: { lt: hoyDia },
            tarea: deLaObra,
          },
        })
      : 0,
    puede(sesion, "plan_semanal:leer")
      ? prisma.planSemanal.count({
          where: { ...deLaObra, estado: "ABIERTO", fechaCorte: { lte: hoyDia } },
        })
      : 0,
    puede(sesion, "nota:leer")
      ? prisma.nota.count({
          where: {
            projectId: obraId,
            companyId: sesion.companyId,
            atendida: false,
            fechaRecordatorio: { lt: hoyDia },
          },
        })
      : 0,
  ]);

  return { lookahead: vencidas, planSemanal: sinCerrar, notas: notasVencidas };
});

// ---------------------------------------------------------------------------
// Alta de obras
// ---------------------------------------------------------------------------

export interface DatosObra {
  nombreObra: string;
  /// Vacio = sin codigo. La columna es nullable y la UI ya lo contempla.
  codigoObra?: string;
  ubicacion?: string;
  cliente?: string;
  /// "YYYY-MM-DD", como las manda un <input type="date">.
  fechaInicio: string;
  fechaFinProgramada: string;
  /// Uno de ProjectState. Si no llega o es raro, Planificacion.
  estado?: string;
}

export type ResultadoCrearObra =
  | { ok: true; id: string }
  | { ok: false; error: string };

/**
 * Calendario laboral por defecto de una obra nueva (Last Planner).
 *
 * L-V 8h, sabado 5h, domingo descanso: la cadencia habitual de las obras del
 * cliente (el sabado laborable de CRIOCORD son 5h). Es editable despues; da al
 * Lookahead una base de dias habiles desde el primer dia. ISO 1..7 (lunes=1).
 */
const CALENDARIO_POR_DEFECTO = [
  { diaSemana: 1, laborable: true, horas: "8" },
  { diaSemana: 2, laborable: true, horas: "8" },
  { diaSemana: 3, laborable: true, horas: "8" },
  { diaSemana: 4, laborable: true, horas: "8" },
  { diaSemana: 5, laborable: true, horas: "8" },
  { diaSemana: 6, laborable: true, horas: "5" },
  { diaSemana: 7, laborable: false, horas: "0" },
] as const;

/**
 * Crea una obra en la empresa de la sesion.
 *
 * Hasta ahora las obras solo nacian del script de seed: el permiso
 * `obra:crear` estaba en la matriz pero no habia servicio que lo usara, asi
 * que en produccion, con la base vacia, no habia forma de arrancar la
 * primera obra.
 */
export async function crearObra(
  sesion: SesionActiva,
  datos: DatosObra,
): Promise<ResultadoCrearObra> {
  if (!puede(sesion, "obra:crear")) {
    return { ok: false, error: "No tienes permiso para crear obras." };
  }

  // Las reglas —nombre, fechas, estado— viven en `lib/obras` para que se
  // puedan probar sin base de datos.
  const validacion = validarObra(datos);
  if (!validacion.ok) return { ok: false, error: validacion.error };

  const { inicio, fin } = validacion.plazo;
  const estado = estadoDeObra(datos.estado);

  const opcional = (v: string | undefined, largo: number) =>
    v?.trim() ? v.trim().slice(0, largo) : null;

  const codigoObra = opcional(datos.codigoObra, 40);

  // El codigo repetido se comprueba aqui para poder decir con QUE obra choca,
  // y no soltar el "Unique constraint failed" crudo de Prisma. La clave
  // unica de la base lo cierra igual; esto es para que el mensaje sirva.
  if (codigoObra) {
    const existente = await prisma.project.findFirst({
      where: { companyId: sesion.companyId, codigoObra },
      select: { nombreObra: true },
    });
    if (existente) {
      return {
        ok: false,
        error: `Ya existe una obra con el codigo ${codigoObra}: "${existente.nombreObra}".`,
      };
    }
  }

  const campos = {
    nombreObra: datos.nombreObra.trim().slice(0, 255),
    codigoObra,
    ubicacion: opcional(datos.ubicacion, 255),
    cliente: opcional(datos.cliente, 200),
    fechaInicio: inicio,
    fechaFinProgramada: fin,
    estado,
  };

  const creada = await prisma.$transaction(async (tx) => {
    // El correlativo sale del contador de la empresa, incrementado de forma
    // atomica: el valor PREVIO al incremento es el de esta obra. Hacerlo con
    // `increment` y no leyendo-y-sumando evita que dos altas simultaneas se
    // lleven el mismo numero.
    const empresa = await tx.company.update({
      where: { id: sesion.companyId },
      data: { siguienteCorrelativoObra: { increment: 1 } },
      select: { siguienteCorrelativoObra: true },
    });
    const correlativo = formatearCorrelativoObra(
      empresa.siguienteCorrelativoObra - 1,
    );

    const obra = await tx.project.create({
      data: { companyId: sesion.companyId, correlativo, ...campos },
      select: { id: true },
    });

    // Siembra el calendario laboral por defecto de la obra (Last Planner).
    await tx.workCalendar.createMany({
      data: CALENDARIO_POR_DEFECTO.map((d) => ({ projectId: obra.id, ...d })),
    });

    await tx.auditLog.create({
      data: {
        companyId: sesion.companyId,
        userId: sesion.userId,
        projectId: obra.id,
        entidad: "Project",
        entidadId: obra.id,
        accion: "CREATE",
        despues: {
          correlativo,
          ...campos,
          fechaInicio: datos.fechaInicio,
          fechaFinProgramada: datos.fechaFinProgramada,
        },
      },
    });

    return obra;
  });

  return { ok: true, id: creada.id };
}

export type ResultadoActualizarObra =
  | { ok: true; id: string }
  | { ok: false; error: string };

/**
 * Edita los datos de una obra de la empresa de la sesion.
 *
 * Antes no habia forma de corregir una obra ya creada: nombre, cliente,
 * ubicacion, codigo y —lo que mas duele— el PLAZO quedaban fijos desde el alta.
 * Una fecha fin mal tecleada se arrastraba a todo el panel (dias restantes,
 * avance de calendario) sin forma de enmendarla desde la UI.
 *
 * Espeja a `crearObra`: mismas reglas puras (`validarObra`), mismo aislamiento
 * por empresa y mismo control de codigo unico —excluyendo la propia obra—, con
 * un apunte de auditoria del antes y el despues. NO toca el `estado`: ese cambia
 * por la maquina de transiciones (`cambiarEstadoObra`), no por este formulario.
 */
export async function actualizarObra(
  sesion: SesionActiva,
  obraId: string,
  datos: DatosObra,
): Promise<ResultadoActualizarObra> {
  if (!puede(sesion, "obra:editar")) {
    return { ok: false, error: "No tienes permiso para editar obras." };
  }

  const obra = await prisma.project.findFirst({
    where: { id: obraId, companyId: sesion.companyId },
    select: {
      id: true,
      nombreObra: true,
      codigoObra: true,
      ubicacion: true,
      cliente: true,
      fechaInicio: true,
      fechaFinProgramada: true,
      estado: true,
      archivadaEn: true,
    },
  });
  if (!obra) return { ok: false, error: "No se encontro la obra." };

  const noAdmite = motivoNoAdmiteCambios(obra);
  if (noAdmite) return { ok: false, error: noAdmite };

  const validacion = validarObra(datos);
  if (!validacion.ok) return { ok: false, error: validacion.error };

  const { inicio, fin } = validacion.plazo;

  const opcional = (v: string | undefined, largo: number) =>
    v?.trim() ? v.trim().slice(0, largo) : null;

  const codigoObra = opcional(datos.codigoObra, 40);

  // Codigo unico dentro de la empresa, EXCLUYENDO esta misma obra: sin el
  // `id: { not }`, guardar sin cambiar el codigo chocaria contra si mismo.
  if (codigoObra) {
    const existente = await prisma.project.findFirst({
      where: { companyId: sesion.companyId, codigoObra, id: { not: obraId } },
      select: { nombreObra: true },
    });
    if (existente) {
      return {
        ok: false,
        error: `Ya existe otra obra con el codigo ${codigoObra}: "${existente.nombreObra}".`,
      };
    }
  }

  const campos = {
    nombreObra: datos.nombreObra.trim().slice(0, 255),
    codigoObra,
    ubicacion: opcional(datos.ubicacion, 255),
    cliente: opcional(datos.cliente, 200),
    fechaInicio: inicio,
    fechaFinProgramada: fin,
  };

  await prisma.$transaction(async (tx) => {
    await tx.project.update({ where: { id: obraId }, data: campos });

    await tx.auditLog.create({
      data: {
        companyId: sesion.companyId,
        userId: sesion.userId,
        projectId: obraId,
        entidad: "Project",
        entidadId: obraId,
        accion: "UPDATE",
        antes: {
          nombreObra: obra.nombreObra,
          codigoObra: obra.codigoObra,
          ubicacion: obra.ubicacion,
          cliente: obra.cliente,
          fechaInicio: obra.fechaInicio.toISOString().slice(0, 10),
          fechaFinProgramada: obra.fechaFinProgramada.toISOString().slice(0, 10),
        },
        despues: {
          ...campos,
          fechaInicio: datos.fechaInicio,
          fechaFinProgramada: datos.fechaFinProgramada,
        },
      },
    });
  });

  return { ok: true, id: obraId };
}

// ---------------------------------------------------------------------------
// Baja de obras
// ---------------------------------------------------------------------------

/**
 * Elimina una obra, con trazabilidad, SOLO si es segura de eliminar.
 *
 * Segura = en PLANIFICACION, sin ninguna orden y sin ninguna linea base. Es
 * decir, una obra que aun no ha comprometido nada con nadie ni ha congelado
 * su presupuesto: lo unico que puede tener son partidas cargadas, que se van
 * con ella. En cuanto hay una orden o una linea base, la obra ya es historia
 * economica y no se borra —a lo sumo se cierra—.
 *
 * Sin linea base no puede haber movimientos (un movimiento exige una), asi
 * que el arbol de partidas es lo unico colgando. Se rompe la jerarquia antes
 * de borrar —`parentId` a NULL— porque la relacion padre-hijo es `Restrict`:
 * un `deleteMany` sobre filas que se referencian entre si fallaria.
 */
export async function eliminarObra(
  sesion: SesionActiva,
  obraId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!puede(sesion, "obra:eliminar")) {
    return { ok: false, error: "No tienes permiso para eliminar obras." };
  }

  const obra = await prisma.project.findFirst({
    where: { id: obraId, companyId: sesion.companyId },
    select: { id: true, nombreObra: true, codigoObra: true, estado: true },
  });
  if (!obra) return { ok: false, error: "No se encontro la obra." };

  if (obra.estado !== "PLANIFICACION") {
    return {
      ok: false,
      error:
        "Solo se pueden eliminar obras en planificacion. Una obra en ejecucion, paralizada o cerrada es historia de la empresa: se conserva.",
    };
  }

  const [ordenes, baselines] = await Promise.all([
    prisma.ordenCompra.count({ where: { projectId: obraId } }),
    prisma.baseline.count({ where: { projectId: obraId } }),
  ]);

  if (ordenes > 0) {
    return {
      ok: false,
      error:
        "Esta obra ya tiene ordenes registradas; no puede eliminarse. Anula las ordenes o cierra la obra.",
    };
  }
  if (baselines > 0) {
    return {
      ok: false,
      error:
        "Esta obra ya tiene una linea base; no puede eliminarse. Una vez congelado el presupuesto, la obra se conserva.",
    };
  }

  await prisma.$transaction(async (tx) => {
    // El apunte va ANTES del borrado: si algo fallara despues, queda el
    // intento registrado y no un borrado silencioso.
    await tx.auditLog.create({
      data: {
        companyId: sesion.companyId,
        userId: sesion.userId,
        projectId: obraId,
        entidad: "Project",
        entidadId: obraId,
        accion: "DELETE",
        antes: {
          nombreObra: obra.nombreObra,
          codigoObra: obra.codigoObra,
          estado: obra.estado,
        },
      },
    });

    // Romper la jerarquia antes de borrar: la relacion padre-hijo es Restrict
    // y un borrado masivo con las referencias intactas chocaria contra ella.
    await tx.wbsItem.updateMany({
      where: { projectId: obraId },
      data: { parentId: null },
    });
    // Las partidas se van; sus filas de "proveedor habitual" caen en cascada.
    await tx.wbsItem.deleteMany({ where: { projectId: obraId } });

    await tx.project.delete({ where: { id: obraId } });
  });

  return { ok: true };
}

/**
 * Cambia el estado de una obra por uno de los permitidos desde el actual.
 *
 * La maquina de estados vive en `lib/obras` para poder probarla; aqui solo se
 * comprueba que el paso pedido sea uno de los validos y se registra el cambio.
 * Un paso invalido —o manipulado en la peticion— se rechaza con un mensaje
 * claro en vez de escribir un estado imposible.
 */
export async function cambiarEstadoObra(
  sesion: SesionActiva,
  obraId: string,
  nuevoEstado: string,
  /// Solo se usa (y se exige) al reabrir: el nombre tecleado tiene que
  /// coincidir con el de la obra, mismo patron de confirmacion que
  /// `eliminarObraCerrada` — sin la contrasena, porque esto es reversible
  /// (volver a cerrar deshace el cambio) y no hace falta la misma friccion
  /// que un borrado permanente.
  confirmacionNombre?: string,
  /// Solo se usa (y se exige el motivo) al paralizar. `fechaEstimada` es
  /// opcional: a veces de verdad no se sabe cuando se reanuda.
  detallePausa?: { motivo: string; fechaEstimada?: string | null },
  /// Solo se mira al pasar de PLANIFICACION a EN_EJECUCION, y solo hace falta
  /// si algo de lo minimo no esta hecho. Ver `faltaParaEjecutar`.
  confirmarSinRequisitos?: boolean,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!puede(sesion, "obra:editar")) {
    return { ok: false, error: "No tienes permiso para cambiar el estado de la obra." };
  }

  const obra = await prisma.project.findFirst({
    where: { id: obraId, companyId: sesion.companyId },
    select: { estado: true, nombreObra: true },
  });
  if (!obra) return { ok: false, error: "No se encontro la obra." };

  if (!ESTADOS_OBRA.includes(nuevoEstado as EstadoObra)) {
    return { ok: false, error: "Estado no valido." };
  }

  if (obra.estado === nuevoEstado) return { ok: true }; // nada que hacer

  if (!puedeTransicionarObra(obra.estado, nuevoEstado)) {
    return {
      ok: false,
      error: `No se puede pasar de ${ETIQUETA_ESTADO_OBRA[obra.estado as EstadoObra]} a ${ETIQUETA_ESTADO_OBRA[nuevoEstado as EstadoObra]}.`,
    };
  }

  // Reabrir exige su propio permiso, ADEMAS del `obra:editar` general de
  // arriba: es la unica transicion que deshace la garantia de que una obra
  // cerrada es historia, y por eso esta en `INNEGOCIABLES` (solo ADMIN).
  if (obra.estado === "CERRADA" && nuevoEstado === "EN_EJECUCION") {
    if (!puede(sesion, "obra:reabrir")) {
      return { ok: false, error: "No tienes permiso para reabrir una obra cerrada." };
    }
    if ((confirmacionNombre ?? "").trim() !== obra.nombreObra.trim()) {
      return {
        ok: false,
        error: "El nombre no coincide con el de la obra. Vuelve a escribirlo.",
      };
    }
  }

  // Paralizar exige motivo: sin el, meses despues nadie recuerda por que se
  // paro. La fecha estimada de reanudacion NO se exige — a veces de verdad
  // no se sabe (litigio, financiamiento pendiente), y forzarla invitaria a
  // teclear cualquier fecha solo para pasar el formulario.
  let fechaEstimadaReanudacion: Date | null = null;
  if (nuevoEstado === "PARALIZADA") {
    const motivo = (detallePausa?.motivo ?? "").trim();
    if (!motivo) {
      return { ok: false, error: "Indica el motivo de la paralizacion." };
    }
    if (detallePausa?.fechaEstimada) {
      fechaEstimadaReanudacion = fechaDeObra(detallePausa.fechaEstimada);
      if (!fechaEstimadaReanudacion) {
        return { ok: false, error: "La fecha estimada de reanudacion no es valida." };
      }
    }
  }

  /**
   * Arrancar POR PRIMERA VEZ tiene minimos. Reanudar una obra paralizada no:
   * esa ya paso por aqui, y volver a exigirselo bloquearia una obra en marcha
   * por un requisito que cumplio hace meses.
   *
   * Dos niveles, que es lo que `requisitosParaEjecutar` ya distingue:
   *
   * - **Sin partidas se BLOQUEA.** Una obra en ejecucion sin presupuesto deja
   *   el control economico entero sin suelo.
   * - **Sin cronograma o sin linea base NO se bloquea, pero se firma.** En
   *   obra real a veces se arranca antes que el papeleo, y un muro solo
   *   consigue que se ponga en ejecucion con datos inventados o que se
   *   trabaje fuera del sistema. Lo que se exige es que la decision sea
   *   explicita, igual que al paralizar hay que escribir el motivo.
   *
   * Hasta hoy los dos ultimos se pasaban a mano como `true` -"la pantalla ya
   * los avisa antes de llegar"-, y la pantalla NO los avisaba: se podia
   * arrancar una obra sin cronograma y sin linea base sin que nada lo dijera
   * en ningun momento.
   */
  if (nuevoEstado === "EN_EJECUCION" && obra.estado === "PLANIFICACION") {
    /**
     * Se consulta aqui y no con `hitosDeObra`, aunque el layout use ese.
     *
     * `hitosDeObra` exige `obra:leer` y LANZA si falta; esta transicion solo
     * pide `obra:editar`, y hacerla depender de otro permiso convertiria un
     * "no puedes" en una excepcion. La REGLA -que es lo que de verdad no
     * puede duplicarse- es la misma en los dos sitios:
     * `requisitosParaEjecutar`.
     *
     * Ojo con la linea base: la que pide este requisito es la del CRONOGRAMA
     * -habla de plazo- y no la del presupuesto, que es otra cosa.
     */
    const [partidas, cronograma, cronogramaBase] = await Promise.all([
      prisma.wbsItem.count({ where: { projectId: obraId, tipo: "PARTIDA" } }),
      prisma.cronograma.findFirst({
        where: { projectId: obraId, project: { companyId: sesion.companyId } },
        select: { id: true },
      }),
      prisma.cronograma.findFirst({
        where: {
          projectId: obraId,
          project: { companyId: sesion.companyId },
          lineaBaseAt: { not: null },
        },
        select: { id: true },
      }),
    ]);

    const faltan = requisitosParaEjecutar({
      partidas,
      tieneCronograma: cronograma !== null,
      tieneLineaBase: cronogramaBase !== null,
    });

    // Se comprueba en el servidor y no solo en la pantalla: la accion se puede
    // invocar directamente.
    if (!puedeArrancar(faltan)) {
      const bloqueante = faltan.find((r) => r.bloqueante);
      return {
        ok: false,
        error: `${bloqueante?.falta ?? "Faltan requisitos."} ${bloqueante?.consecuencia ?? ""}`.trim(),
      };
    }

    if (faltan.length > 0 && !confirmarSinRequisitos) {
      return {
        ok: false,
        error:
          "Esta obra arrancaria con cosas sin hacer: " +
          faltan.map((f) => f.falta).join(" ") +
          " Se puede arrancar igual, pero hay que confirmarlo.",
      };
    }
  }

  // Cerrar es historia: una vez cerrada, nadie puede ya aprobar un
  // movimiento en borrador ni saldar una deuda pendiente. Se comprueba
  // aqui, en el servidor, para las tres transiciones que llevan a CERRADA
  // (PLANIFICACION, EN_EJECUCION y PARALIZADA).
  //
  // El tercer requisito de `requisitosParaCerrar` —pendientes criticos del
  // tablero— no se comprueba todavia: reusar `pendientesDeLaObra` desde
  // aqui crearia un ciclo de imports (`tablero.service` ya importa de este
  // archivo), y no vale la pena duplicar esa logica solo para un aviso que
  // ademas no bloquea nada. Se deja en `0` a proposito; ver PENDIENTES.md.
  if (nuevoEstado === "CERRADA") {
    const [encargosVigentes, movimientosBorrador] = await Promise.all([
      prisma.encargoProveedor.findMany({
        where: {
          projectId: obraId,
          estado: "VIGENTE",
          project: { companyId: sesion.companyId },
        },
        select: {
          montoContratado: true,
          // Contra el VIGENTE, no contra lo firmado: un adicional aprobado es
          // deuda con el contratista, y sin contarlo la obra se podia cerrar
          // dejando dinero por pagar que el requisito no veia.
          adendas: { where: { estado: "APROBADA" }, select: { importe: true } },
          valorizaciones: {
            orderBy: { fecha: "desc" },
            take: 1,
            select: { porcentaje: true, importe: true },
          },
          pagos: { select: { monto: true } },
        },
      }),
      prisma.movimientoPresupuestal.count({
        where: { projectId: obraId, estado: "BORRADOR" },
      }),
    ]);

    const valorizacionesPendientes = encargosVigentes.filter((e) => {
      const ultima = e.valorizaciones[0];
      const vigente = montoVigente(
        e.montoContratado.toString(),
        e.adendas.map((a) => ({ importe: a.importe.toString() })),
      );
      // El importe CONGELADO del corte cuando lo hay: recalcularlo contra el
      // contrato de hoy revalua el pasado cada vez que entra una adenda.
      const valorizado = ultima
        ? importeDeValorizacion(
            {
              porcentaje: ultima.porcentaje.toString(),
              importe: ultima.importe?.toString() ?? null,
            },
            vigente,
          )
        : "0.00";
      const pagado = sumar(e.pagos.map((p) => p.monto.toString()));
      return esPositivo(restar(valorizado, pagado) ?? "0.00");
    }).length;

    const faltan = requisitosParaCerrar({
      valorizacionesPendientes,
      movimientosBorrador,
      pendientesCriticos: 0,
    });

    if (!puedeCerrar(faltan)) {
      const bloqueante = faltan.find((r) => r.bloqueante);
      return {
        ok: false,
        error: `${bloqueante?.falta ?? "Faltan requisitos."} ${bloqueante?.consecuencia ?? ""}`.trim(),
      };
    }
  }

  // Al entrar en PARALIZADA se guarda el motivo/fecha/cuando; al salir
  // (reanudar o cerrar) los tres se limpian a null — mismo criterio que
  // `PaseObra.revocadoAt/revocadoPor` al reactivar un pase.
  const datosParalizacion =
    nuevoEstado === "PARALIZADA"
      ? {
          motivoParalizacion: (detallePausa?.motivo ?? "").trim(),
          fechaEstimadaReanudacion,
          paralizadaEn: new Date(),
        }
      : obra.estado === "PARALIZADA"
        ? { motivoParalizacion: null, fechaEstimadaReanudacion: null, paralizadaEn: null }
        : {};

  await prisma.$transaction(async (tx) => {
    await tx.project.update({
      where: { id: obraId },
      data: { estado: nuevoEstado as EstadoObra, ...datosParalizacion },
    });
    await tx.auditLog.create({
      data: {
        companyId: sesion.companyId,
        userId: sesion.userId,
        projectId: obraId,
        entidad: "Project",
        entidadId: obraId,
        accion: "UPDATE",
        antes: { estado: obra.estado },
        despues: { estado: nuevoEstado },
      },
    });
  });

  return { ok: true };
}

export interface PartidaFila {
  id: string;
  /// De que capitulo cuelga. Lo necesita la pantalla para poder ofrecer
  /// agrupar SOLO partidas del mismo capitulo, que es la condicion que impone
  /// el servicio: agrupar entre capitulos moveria dinero de uno a otro.
  parentId: string | null;
  codigoPartida: string;
  tipo: "CAPITULO" | "PARTIDA";
  /// Gobierna si el importe se recalcula al cambiar el metrado.
  modalidad: "PRECIOS_UNITARIOS" | "SUMA_ALZADA" | "ALCANCE";
  descripcion: string;
  nivel: number;
  unidad: string | null;
  metrado: string | null;
  precioUnitario: string | null;
  /// En las partidas, su propio parcial. En los capitulos, la suma de todo
  /// lo que cuelga de ellos.
  parcial: string | null;
}

export interface ArbolPartidas {
  filas: PartidaFila[];
  totalPartidas: number;
  montoTotal: string;
}

export async function listarPartidas(
  sesion: SesionActiva,
  obraId: string,
): Promise<ArbolPartidas> {
  if (!puede(sesion, "partida:leer")) throw new SinPermisoError();

  const obra = await prisma.project.findFirst({
    where: { id: obraId, companyId: sesion.companyId },
    select: { id: true },
  });

  if (!obra) return { filas: [], totalPartidas: 0, montoTotal: "0.00" };

  const items = await prisma.wbsItem.findMany({
    where: { projectId: obraId },
    orderBy: [{ orden: "asc" }, { codigoPartida: "asc" }],
    select: {
      id: true, parentId: true, codigoPartida: true, tipo: true,
      modalidad: true, descripcion: true, nivel: true, unidad: true,
      metrado: true, precioUnitario: true, parcial: true,
    },
  });

  // Subtotal de cada capitulo: el MISMO algoritmo que decide el costo
  // directo de la obra (`subtotalesPorRama`, sobre el codigo y la regla de
  // `aportantes`), no un rollup aparte por `parentId`. Hasta el 21 de agosto
  // de 2026 este rollup sumaba a mano cualquier hija de tipo PARTIDA con
  // parcial, sin aplicar `aportantes`: un capitulo a suma alzada con hijas
  // de ALCANCE ya no puede darse (ver el arreglo del 15 de agosto), pero el
  // calculo seguia siendo uno DISTINTO del que usa `montoTotal` dos lineas
  // mas abajo, y las dos ramas de un mismo numero pueden divergir en cuanto
  // alguien reintroduce el caso que `aportantes` sabe resolver. Con
  // `subtotalesPorRama`, la suma de los subtotales raiz cuadra siempre,
  // exactamente, con `montoTotal` — es el invariante que el propio helper
  // trae probado.
  const subtotales = subtotalesPorRama(
    items.map((i) => ({
      codigo: i.codigoPartida,
      parcial: i.tipo === "PARTIDA" ? (i.parcial?.toString() ?? null) : null,
    })),
  );

  const filas: PartidaFila[] = items.map((i) => ({
    id: i.id,
    parentId: i.parentId,
    codigoPartida: i.codigoPartida,
    tipo: i.tipo,
    modalidad: i.modalidad,
    descripcion: i.descripcion,
    nivel: i.nivel,
    unidad: i.unidad,
    metrado: i.metrado?.toString() ?? null,
    precioUnitario: i.precioUnitario?.toString() ?? null,
    parcial:
      i.tipo === "PARTIDA"
        ? (i.parcial?.toString() ?? null)
        : (subtotales.get(i.codigoPartida) ?? "0.00"),
  }));

  const partidas = items.filter((i) => i.tipo === "PARTIDA");

  return {
    filas,
    totalPartidas: partidas.length,
    // Misma regla que en la importacion: el costo de una rama es la suma de
    // sus hojas. Si aqui se sumara todo, el total de la obra no cuadraria
    // con el que se mostro al importar.
    montoTotal: sumarHojas(
      filas.map((f) => ({
        codigo: f.codigoPartida,
        parcial: f.tipo === "PARTIDA" ? f.parcial : null,
      })),
    ),
  };
}
