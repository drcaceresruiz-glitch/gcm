import "server-only";

import { prisma } from "@/lib/prisma";
import { puede } from "@/lib/rbac";
import { hoy } from "@/utils/fechas";
import {
  tareasDeLaSemana,
  tareasTerminadas,
  type TareaProgramada,
} from "@/lib/plan-semanal";
import { ultimoAvancePorTarea } from "@/lib/cronograma";
import {
  ventanaLookahead,
  faseDeTarea,
  estadoDeTarea,
  confiabilidad,
  planificarFlujos,
  normalizarSemanas,
  TIPOS_RESTRICCION,
  type Confiabilidad,
  type FaseAnalisis,
  type ModoFlujos,
  type MotivoConservada,
} from "@/lib/lookahead";
import {
  validarCompromisoRestriccion,
  cumplimientoDeLiberacion,
  estadoDePromesa,
  claveDeResponsable,
  type CumplimientoLiberacion,
  type EstadoPromesa,
} from "@/lib/lookahead-compromiso";
import { planesAbiertos, type SemanaAbierta } from "@/services/plan-semanal.service";
import {
  fotosPorDestino,
  fotosPorDestinoDePase,
  type FotoResumen,
} from "@/services/evidencia.service";
import { motivoSiObraCerrada } from "@/services/obra-abierta";
import type { TipoRestriccion } from "@/generated/prisma/enums";
import type { Prisma } from "@/generated/prisma/client";
import type { SesionActiva } from "@/services/sesion.service";
import type { PaseActivo } from "@/services/pase.service";

/**
 * Lookahead (Last Planner): la ventana de mediano plazo y el analisis de las 7
 * restricciones por tarea.
 *
 * Las tareas se DERIVAN del cronograma vigente (no se crean a mano): son las de
 * trabajo cuyo rango solapa la ventana [hoy, hoy+3 semanas], ancladas por `uid`
 * como `AvanceTarea`. La lectura (`obtenerLookahead`) es pura; los `LookaheadTask`
 * nacen con `sincronizarLookahead`. La aritmetica (ventana, fase, confiabilidad,
 * que flujos crear y cuales se pueden retirar) vive en `@/lib/lookahead`, probada.
 *
 * Las restricciones NO se siembran: una tarea nace vacia y sin analizar, y es
 * quien la analiza el que dice cuales de los 7 flujos le aplican —incluida la
 * respuesta "ninguno"—. Esa respuesta se registra con `analizadaAt`, que es lo
 * unico que distingue "revisada, no le aplica nada" de "nadie la ha mirado".
 */

function quien(sesion: SesionActiva): string {
  return `${sesion.nombres} ${sesion.apellidos}`.trim().slice(0, 150);
}

type Tx = Prisma.TransactionClient;

/**
 * Recalcula y persiste `estado` de varias tareas. UNICO sitio que escribe esa
 * columna.
 *
 * Antes lo hacia solo `alternarRestriccion`, y era el unico escritor por
 * accidente: era la unica funcion que tocaba restricciones. Con cuatro, eso
 * deja de ser una propiedad y pasa a ser una invariante que hay que sostener:
 * si aparece un segundo `lookaheadTask.update({ data: { estado } })`, la
 * columna y `estadoDeTarea` empiezan a divergir y el aviso de
 * `comprometerAlPts` miente sin que nada falle.
 *
 * Dos consultas fijas y no una por tarea: un lote de treinta tareas por N+1 es
 * justo el patron que tumbo produccion el 10 de agosto.
 *
 * BLOQUEADO se respeta: es una marca manual, no se deduce de nada.
 *
 * Devuelve los uid que ACABAN de pasar a LISTO —no los que ya lo estaban—,
 * que es lo unico que se puede avisar: "ya esta lista" solo tiene sentido la
 * primera vez.
 */
async function recalcularEstados(
  tx: Tx,
  ids: readonly string[],
): Promise<number[]> {
  if (ids.length === 0) return [];

  const tareas = await tx.lookaheadTask.findMany({
    where: { id: { in: [...ids] }, estado: { not: "BLOQUEADO" } },
    select: {
      id: true,
      uid: true,
      listaAt: true,
      analizadaAt: true,
      restricciones: { select: { resuelta: true } },
    },
  });

  const listas = tareas.filter((t) => estadoDeTarea(t) === "LISTO");
  const resto = tareas.filter((t) => estadoDeTarea(t) !== "LISTO");

  // Las que TRANSITAN: estaban sin sellar y ahora estan listas. Se calcula
  // antes de escribir, que es cuando todavia se puede distinguir.
  const nuevas = listas.filter((t) => t.listaAt === null).map((t) => t.uid);

  if (listas.length > 0) {
    await tx.lookaheadTask.updateMany({
      where: { id: { in: listas.map((t) => t.id) } },
      data: { estado: "LISTO" },
    });
    // `listaAt: null` en el where: la fecha es de la TRANSICION, no del
    // estado. Sin esa guarda, cada recalculo la refrescaria y el aviso de "ya
    // esta lista" saldria otra vez cada vez que alguien toca la matriz.
    await tx.lookaheadTask.updateMany({
      where: { id: { in: listas.map((t) => t.id) }, listaAt: null },
      data: { listaAt: new Date() },
    });
  }
  if (resto.length > 0) {
    // Al dejar de estar lista se borra el sello: si vuelve a estarlo, es una
    // transicion nueva y merece un aviso nuevo.
    await tx.lookaheadTask.updateMany({
      where: { id: { in: resto.map((t) => t.id) } },
      data: { estado: "PENDIENTE", listaAt: null },
    });
  }

  return nuevas;
}

export interface CeldaRestriccion {
  /// null = este flujo NO APLICA a esta tarea (o nadie la ha analizado aun):
  /// no hay fila de restriccion, asi que no hay nada que marcar ni donde
  /// colgar una foto. OJO: antes esto significaba "tarea sin sincronizar".
  id: string | null;
  tipo: TipoRestriccion;
  resuelta: boolean;
  /// Nota de quien la abrio ("falta el plano de detalle"). Va al tooltip.
  detalle: string | null;
  /// Fotos que demuestran que este flujo quedo liberado. Vacio si no hay, y
  /// siempre vacio en las celdas sin restriccion (no existe a que colgarlas).
  fotos: FotoResumen[];
  /**
   * A quien le toca levantarla, en la MISMA clave que usa el reparto de avisos
   * ("u:<id>" | "c:<id>"). Null = nadie se ha hecho cargo.
   *
   * Va la clave y no el nombre a proposito: resolver el nombre por cada celda
   * serian siete consultas por tarea. La pantalla ya tiene la lista de personas
   * y lo resuelve alli, gratis.
   */
  responsableClave: string | null;
  /// Para cuando prometio tenerla levantada.
  fechaCompromiso: Date | null;
  /// En que punto esta esa promesa, ya calculado contra hoy.
  promesa: EstadoPromesa;
}

/**
 * Alguien a quien se le puede asignar una restriccion en esta obra.
 *
 * Los de dentro y los de fuera en la MISMA lista, con la misma forma de clave
 * que `@/lib/avisos`: para quien asigna es una sola pregunta —«¿quien lo
 * consigue?»— y partirla en dos desplegables obligaria a saber de antemano si
 * la persona tiene cuenta, que es justo lo que no viene al caso.
 */
export interface PersonaAsignable {
  clave: string;
  nombre: string;
  /// Cargo, o empresa si es de fuera. Para distinguir dos Juan Perez.
  detalle: string | null;
  externo: boolean;
}

/// En que semana del PTS esta ya comprometida una tarea.
export interface CompromisoDeTarea {
  planId: string;
  numero: number;
  abierta: boolean;
}

export interface FilaLookahead {
  uid: number;
  codigo: string | null;
  nombre: string;
  inicio: Date;
  fin: Date;
  faseBloque: string | null;
  zona: string | null;
  /// En que punto del analisis esta. Sustituye al viejo `estado`: la pantalla
  /// necesita separar "nadie la ha mirado" de "revisada y sin restricciones".
  fase: FaseAnalisis;
  /// Cuando se decidio que flujos le aplican, y quien. Null = sin analizar.
  analizadaAt: Date | null;
  analizadaPor: string | null;
  /// Tiene fila `LookaheadTask`. NO implica que nadie la haya analizado: es
  /// solo el contenedor de fase/zona/proveedor y el ancla de los compromisos.
  enMatriz: boolean;
  /// Para enlazar el compromiso con la tarea que lo origino (trazabilidad).
  lookaheadTaskId: string | null;
  /// Los 7 flujos, en el orden de `TIPOS_RESTRICCION`. Los que no aplican
  /// vienen con `id: null`: la matriz tiene siete columnas siempre.
  restricciones: CeldaRestriccion[];
  /// Semanas del PTS donde ya se comprometio (para no duplicar a ciegas).
  comprometida: CompromisoDeTarea[];
}

export interface LookaheadDatos {
  desde: Date;
  hasta: Date;
  filas: FilaLookahead[];
  confiabilidad: Confiabilidad;
  /// Tareas de la ventana que aun no tienen `LookaheadTask` (a traer).
  pendientesDeSincronizar: number;
  /// Tareas de la ventana que nadie ha analizado. Es el numero que importa:
  /// cuentan como no listas y hunden la confiabilidad sin que sea culpa de la
  /// obra.
  sinAnalizar: number;
  /// Cuantas semanas mira esta ventana (ya acotado).
  semanas: number;
  puedeGestionar: boolean;
  /// Semanas del PTS que admiten compromisos (destino al comprometer).
  semanasAbiertas: SemanaAbierta[];
  /// Comprometer escribe el PTS, asi que manda el permiso del plan semanal.
  puedeComprometer: boolean;
  /// A quien se le puede asignar una restriccion. Vacio sin permiso de gestion.
  personas: PersonaAsignable[];
  /// Como va el cumplimiento de las promesas de liberacion en esta ventana.
  liberacion: CumplimientoLiberacion;
}

export type ResultadoLookahead = { ok: true } | { ok: false; error: string };
export type ResultadoSync =
  | { ok: true; creadas: number }
  | { ok: false; error: string };

/** El cronograma vigente de la obra (mas reciente) con sus tareas. */
async function cronogramaVigente(sesion: SesionActiva, obraId: string) {
  return prisma.cronograma.findFirst({
    where: { projectId: obraId, project: { companyId: sesion.companyId } },
    orderBy: [{ fechaCorte: "desc" }, { version: "desc" }],
    select: {
      id: true,
      tareas: {
        select: {
          uid: true,
          codigo: true,
          nombre: true,
          inicio: true,
          fin: true,
          esResumen: true,
          // Para saber cuales estan acabadas: sin esto la ventana ofrecia
          // preparar y comprometer trabajo ya hecho.
          porcentajeArchivo: true,
        },
      },
    },
  });
}

/**
 * Tareas del cronograma vigente que caen en la ventana del Lookahead.
 *
 * Las TERMINADAS se quedan fuera. El Lookahead es make-ready —preparar lo que
 * viene—: en una partida al 100% no hay restricciones que levantar ni promesa
 * que hacer. Mientras no se filtraron, la ventana ofrecia recomprometer en la
 * Semana 3 cinco tareas ya cumplidas y cerradas en la Semana 2, y la
 * confiabilidad salia al 100% contando trabajo hecho como «listo para
 * empezar».
 */
async function tareasDeLaVentana(
  sesion: SesionActiva,
  obraId: string,
  semanas: number,
): Promise<{ desde: Date; hasta: Date; tareas: TareaProgramada[] }> {
  const { desde, hasta } = ventanaLookahead(hoy(), semanas);
  const cronograma = await cronogramaVigente(sesion, obraId);
  const filas = cronograma?.tareas ?? [];

  const avances = await prisma.avanceTarea.findMany({
    where: { projectId: obraId },
    orderBy: [{ fecha: "asc" }, { createdAt: "asc" }],
    select: {
      uid: true, porcentaje: true, fecha: true,
      createdAt: true, reportadoPor: true, nota: true,
    },
  });
  const ultimos = ultimoAvancePorTarea(
    avances.map((a) => ({ ...a, porcentaje: a.porcentaje.toString() })),
  );
  const terminadas = tareasTerminadas(
    filas.map((t) => ({ uid: t.uid, porcentajeArchivo: t.porcentajeArchivo.toString() })),
    ultimos,
  );

  const tareasCron: TareaProgramada[] = filas.map((t) => ({
    uid: t.uid,
    codigo: t.codigo,
    nombre: t.nombre,
    inicio: t.inicio,
    fin: t.fin,
    esResumen: t.esResumen,
  }));
  return {
    desde,
    hasta,
    tareas: tareasDeLaSemana(tareasCron, desde, hasta, terminadas),
  };
}

/**
 * La matriz del Lookahead: por cada tarea de la ventana, sus 7 restricciones y
 * su estado de confiabilidad. Lectura pura (no crea nada): las tareas aun no
 * sincronizadas salen con celdas vacias y `sincronizada: false`.
 */
export async function obtenerLookahead(
  sesion: SesionActiva,
  obraId: string,
  semanasPedidas?: string | number,
): Promise<LookaheadDatos | null> {
  if (!puede(sesion, "lookahead:leer")) return null;

  const semanas = normalizarSemanas(semanasPedidas);
  const { desde, hasta, tareas } = await tareasDeLaVentana(sesion, obraId, semanas);
  // Una sola vez para toda la matriz: si cada celda leyera la fecha por su
  // cuenta, dos celdas de la misma pantalla podrian caer a distinto lado de la
  // medianoche y una saldria vencida y la otra no.
  const ahora = hoy();

  const uids = tareas.map((t) => t.uid);
  const lookaheadTareas = uids.length
    ? await prisma.lookaheadTask.findMany({
        where: { projectId: obraId, uid: { in: uids } },
        select: {
          id: true,
          uid: true,
          faseBloque: true,
          zona: true,
          analizadaAt: true,
          analizadaPor: true,
          restricciones: {
            select: {
              id: true,
              tipo: true,
              resuelta: true,
              detalle: true,
              resueltaAt: true,
              fechaCompromiso: true,
              responsableUserId: true,
              responsableContactoId: true,
            },
          },
        },
      })
    : [];
  const porUid = new Map(lookaheadTareas.map((l) => [l.uid, l]));

  // En que semanas del PTS esta ya cada tarea: cierra el ciclo (el Lookahead
  // muestra lo que ya se comprometio) y evita comprometer dos veces sin verlo.
  const compromisos = uids.length
    ? await prisma.compromisoSemanal.findMany({
        where: { uid: { in: uids }, plan: { projectId: obraId } },
        select: {
          uid: true,
          plan: { select: { id: true, numero: true, estado: true } },
        },
        orderBy: { plan: { numero: "asc" } },
      })
    : [];
  const comprometidaPorUid = new Map<number, CompromisoDeTarea[]>();
  for (const c of compromisos) {
    if (c.uid === null) continue;
    const lista = comprometidaPorUid.get(c.uid) ?? [];
    lista.push({
      planId: c.plan.id,
      numero: c.plan.numero,
      abierta: c.plan.estado === "ABIERTO",
    });
    comprometidaPorUid.set(c.uid, lista);
  }

  // La evidencia de TODA la ventana en una consulta, no una por celda: son 7
  // restricciones por tarea y una consulta por celda pondria de rodillas a la
  // pantalla en cuanto la ventana pase de unas pocas tareas.
  const idsRestriccion = lookaheadTareas.flatMap((l) =>
    l.restricciones.map((r) => r.id),
  );
  const fotosPorRestriccion = idsRestriccion.length
    ? await fotosPorDestino(sesion, obraId, { restricciones: idsRestriccion })
    : new Map<string, FotoResumen[]>();

  const filas: FilaLookahead[] = tareas.map((t) => {
    const lk = porUid.get(t.uid);
    if (!lk) {
      return {
        uid: t.uid,
        codigo: t.codigo,
        nombre: t.nombre,
        inicio: t.inicio,
        fin: t.fin,
        faseBloque: null,
        zona: null,
        fase: "SIN_ANALIZAR",
        analizadaAt: null,
        analizadaPor: null,
        enMatriz: false,
        lookaheadTaskId: null,
        restricciones: TIPOS_RESTRICCION.map((tipo) => ({
          id: null,
          tipo,
          resuelta: false,
          detalle: null,
          fotos: [],
          responsableClave: null,
          fechaCompromiso: null,
          // Sin fila no hay restriccion, asi que no hay promesa que juzgar.
          // No es "sin asignar": no hay nada que asignar todavia.
          promesa: "liberada" as EstadoPromesa,
        })),
        comprometida: comprometidaPorUid.get(t.uid) ?? [],
      };
    }
    const porTipo = new Map(lk.restricciones.map((r) => [r.tipo, r]));
    const restricciones: CeldaRestriccion[] = TIPOS_RESTRICCION.map((tipo) => {
      const r = porTipo.get(tipo);
      return {
        id: r?.id ?? null,
        tipo,
        resuelta: r?.resuelta ?? false,
        detalle: r?.detalle ?? null,
        fotos: r ? (fotosPorRestriccion.get(r.id) ?? []) : [],
        responsableClave: r ? claveDeResponsable(r) : null,
        fechaCompromiso: r?.fechaCompromiso ?? null,
        // Sin fila, no hay promesa que juzgar. Se marca "liberada" porque es el
        // unico estado que la pantalla no pinta: una celda que no existe no
        // puede salir en rojo por no tener responsable.
        promesa: r ? estadoDePromesa(r, ahora) : ("liberada" as EstadoPromesa),
      };
    });
    return {
      uid: t.uid,
      codigo: t.codigo,
      nombre: t.nombre,
      inicio: t.inicio,
      fin: t.fin,
      faseBloque: lk.faseBloque,
      zona: lk.zona,
      // Se recalcula de los datos reales (fuente de verdad); la columna
      // `estado` se mantiene en sincronia con `recalcularEstados`. Se pasan
      // solo las restricciones QUE EXISTEN: las celdas de relleno con
      // `id: null` no son restricciones sin resolver, son flujos que no
      // aplican, y colarlas aqui dejaria toda tarea en CON_PENDIENTES.
      fase: faseDeTarea({
        analizadaAt: lk.analizadaAt,
        restricciones: lk.restricciones,
      }),
      analizadaAt: lk.analizadaAt,
      analizadaPor: lk.analizadaPor,
      enMatriz: true,
      lookaheadTaskId: lk.id,
      restricciones,
      comprometida: comprometidaPorUid.get(t.uid) ?? [],
    };
  });

  // Comprometer escribe el PTS: el permiso que manda es el del plan semanal,
  // no el del Lookahead (un consultor ve la matriz pero no compromete).
  const puedeComprometer = puede(sesion, "plan_semanal:gestionar");
  const puedeGestionar = puede(sesion, "lookahead:gestionar");

  return {
    desde,
    hasta,
    filas,
    confiabilidad: confiabilidad(filas),
    pendientesDeSincronizar: filas.filter((f) => !f.enMatriz).length,
    sinAnalizar: filas.filter((f) => f.fase === "SIN_ANALIZAR").length,
    semanas,
    puedeGestionar,
    semanasAbiertas: puedeComprometer ? await planesAbiertos(sesion, obraId) : [],
    puedeComprometer,
    // Solo si va a poder asignar: quien no gestiona no necesita la lista, y
    // pedirla seria mandarle al navegador los nombres de toda la obra para
    // nada.
    personas: puedeGestionar ? await personasDeObra(obraId) : [],
    liberacion: cumplimientoDeLiberacion(
      lookaheadTareas.flatMap((l) => l.restricciones),
      ahora,
    ),
  };
}

/**
 * A quien se le puede asignar una restriccion en esta obra: los de dentro y los
 * de fuera, en una sola lista.
 *
 * Los de la obra van primero. Es una decision de doctrina, no de orden
 * alfabetico: el responsable de una restriccion casi nunca deberia ser el
 * proveedor, sino quien puede levantarla dentro de la organizacion —el
 * almacenero para MATERIALES, la oficina tecnica para INFORMACION—. El
 * proveedor es a quien esa persona persigue. La lista lo sugiere sin
 * prohibirlo.
 */
async function personasDeObra(obraId: string): Promise<PersonaAsignable[]> {
  const [miembros, externos] = await Promise.all([
    prisma.projectMembership.findMany({
      where: { projectId: obraId, user: { estado: "ACTIVO" } },
      select: {
        user: { select: { id: true, nombres: true, apellidos: true, cargo: true } },
      },
    }),
    prisma.contactoAviso.findMany({
      where: { projectId: obraId, activo: true },
      select: { id: true, nombre: true, empresa: true },
    }),
  ]);

  const dentro = miembros.map((m) => ({
    clave: `u:${m.user.id}`,
    nombre: `${m.user.nombres} ${m.user.apellidos}`.trim(),
    detalle: m.user.cargo,
    externo: false,
  }));

  const fuera = externos.map((c) => ({
    clave: `c:${c.id}`,
    nombre: c.nombre,
    detalle: c.empresa,
    externo: true,
  }));

  const porNombre = (a: PersonaAsignable, b: PersonaAsignable) =>
    a.nombre.localeCompare(b.nombre, "es");

  return [...dentro.sort(porNombre), ...fuera.sort(porNombre)];
}

/**
 * Lo que ve una celda DESDE UN PASE: menos que `CeldaRestriccion`.
 *
 * Sin responsable ni fecha comprometida a proposito. Quien sube una foto desde
 * el andamio necesita saber que flujo esta documentando, no a quien le toca
 * conseguirlo ni que se prometio al cliente: eso es informacion de gestion, y
 * un pase no es un usuario. Reutilizar el tipo de la matriz habria mandado esos
 * datos al telefono sin que nadie lo decidiera.
 */
export type CeldaPase = Pick<
  CeldaRestriccion,
  "id" | "tipo" | "resuelta" | "detalle" | "fotos"
>;

/**
 * Lo que el menu de evidencia necesita, y NADA mas.
 *
 * Estructuralmente compatible con `DatosMenuEvidencia` del componente, que es
 * quien fija el contrato. Deliberadamente no incluye confiabilidad, semanas
 * del PTS ni permisos: un pase no los tiene.
 */
export interface MenuPaseDatos {
  filas: {
    uid: number;
    codigo: string | null;
    nombre: string;
    /// Alguien decidio que flujos le aplican. Solo salen las analizadas.
    analizada: boolean;
    /// SOLO los flujos que aplican de verdad, en el orden de la matriz. Puede
    /// estar vacio: la tarea se reviso y no le aplica ninguno.
    restricciones: CeldaPase[];
  }[];
  semanas: number;
  puedeSubir: boolean;
}

/**
 * El menu de evidencia para un PASE DE OBRA.
 *
 * Puerta APARTE de `obtenerLookahead`, por lo mismo que en `evidencia.service`:
 * el pase no tiene rol ni permisos que consultar, tiene UNA obra. Mezclar los
 * dos modelos de autorizacion en la misma funcion —un `if` que acepte sesion o
 * pase— es como se cuelan los agujeros; el precio es esta duplicacion, que es
 * barata y esta a la vista.
 *
 * El `obraId` sale SIEMPRE de la fila del pase, nunca de la peticion: por eso
 * recibe el `PaseActivo` entero y no un id suelto.
 *
 * Solo devuelve tareas ANALIZADAS. Una tarea que nadie ha mirado no tiene
 * restricciones a las que colgar la foto, y ofrecerla en el telefono seria un
 * callejon sin salida; ademas analizar es cosa de quien gestiona el Lookahead,
 * no del personal de campo.
 *
 * Las analizadas SIN restricciones si salen, con la lista vacia. Podrian
 * omitirse —tampoco tienen donde colgar nada— pero entonces el de campo, con
 * el movil en la mano, veria faltar una tarea que sabe que existe y concluiria
 * que la aplicacion esta rota. Sale, y el menu dice por que no admite fotos.
 */
export async function menuDePase(
  pase: PaseActivo,
  semanasPedidas?: string | number,
): Promise<MenuPaseDatos> {
  const semanas = normalizarSemanas(semanasPedidas);
  const { desde, hasta } = ventanaLookahead(hoy(), semanas);

  // El cronograma vigente de SU obra. No se reusa `cronogramaVigente`, que
  // filtra por la empresa de una sesion que aqui no existe.
  const cronograma = await prisma.cronograma.findFirst({
    where: { projectId: pase.obraId },
    orderBy: [{ fechaCorte: "desc" }, { version: "desc" }],
    select: {
      tareas: {
        select: {
          uid: true, codigo: true, nombre: true,
          inicio: true, fin: true, esResumen: true,
        },
      },
    },
  });

  const tareas = tareasDeLaSemana(
    (cronograma?.tareas ?? []).map((t) => ({
      uid: t.uid,
      codigo: t.codigo,
      nombre: t.nombre,
      inicio: t.inicio,
      fin: t.fin,
      esResumen: t.esResumen,
    })),
    desde,
    hasta,
  );

  const uids = tareas.map((t) => t.uid);
  const analizadas = uids.length
    ? await prisma.lookaheadTask.findMany({
        where: {
          projectId: pase.obraId,
          uid: { in: uids },
          analizadaAt: { not: null },
        },
        select: {
          uid: true,
          restricciones: {
            select: { id: true, tipo: true, resuelta: true, detalle: true },
          },
        },
      })
    : [];
  const porUid = new Map(analizadas.map((l) => [l.uid, l]));

  // Toda la evidencia de la ventana en UNA consulta: son 7 restricciones por
  // tarea y una consulta por celda mataria la pagina (ya paso en produccion).
  const idsRestriccion = analizadas.flatMap((l) =>
    l.restricciones.map((r) => r.id),
  );
  const fotosPorRestriccion = idsRestriccion.length
    ? await fotosPorDestinoDePase(pase.obraId, { restricciones: idsRestriccion })
    : new Map<string, FotoResumen[]>();

  const filas = tareas
    .filter((t) => porUid.has(t.uid))
    .map((t) => {
      const lk = porUid.get(t.uid)!;
      const porTipo = new Map(lk.restricciones.map((r) => [r.tipo, r]));
      return {
        uid: t.uid,
        codigo: t.codigo,
        nombre: t.nombre,
        analizada: true,
        // Solo los flujos que existen, no siete celdas de las que casi todas
        // serian null: en el movil eso son siete filas muertas que no hacen
        // nada al tocarlas.
        restricciones: TIPOS_RESTRICCION.filter((tipo) => porTipo.has(tipo)).map(
          (tipo) => {
            const r = porTipo.get(tipo)!;
            return {
              id: r.id,
              tipo,
              resuelta: r.resuelta,
              detalle: r.detalle,
              fotos: fotosPorRestriccion.get(r.id) ?? [],
            };
          },
        ),
      };
    });

  // El derecho del pase ES adjuntar: no hay permiso que mirar. Que la obra
  // este cerrada lo corta antes `obtenerPaseVigente`, y la subida lo vuelve a
  // comprobar en el servicio.
  return { filas, semanas, puedeSubir: true };
}

export interface ConfiabilidadVentana extends Confiabilidad {
  /// Cuantas semanas mira la ventana.
  semanas: number;
  /// Restricciones marcadas como resueltas en toda la ventana.
  restriccionesResueltas: number;
  /**
   * El cumplimiento de las PROMESAS de liberacion.
   *
   * La confiabilidad dice cuantas tareas estan listas; esto dice si quien se
   * comprometio a dejarlas listas cumplio. Son preguntas distintas y las dos
   * hacen falta: una obra puede tener confiabilidad baja porque nadie analiza,
   * o porque se analiza y luego nadie levanta lo que prometio levantar.
   */
  liberacion: CumplimientoLiberacion;
}

/**
 * Solo la confiabilidad, a partir de tareas QUE YA TIENE QUIEN LLAMA.
 *
 * `obtenerLookahead` hace cuatro consultas, y la primera es el cronograma
 * entero. Para el tablero eso era releer lo que el propio tablero acababa de
 * leer: se acepto "a sabiendas" y el 10 de agosto de 2026 costo una caida
 * —esta escrito en `plan-semanal.service` que cargar el cronograma completo en
 * una pantalla ya habia matado el render a mitad bajo los limites de
 * produccion, y volvio a pasar—.
 *
 * Esta version recibe las tareas ya leidas y hace UNA consulta. No devuelve
 * las filas ni las semanas abiertas porque quien solo quiere el porcentaje no
 * debe pagar por ellas.
 *
 * El numero que sale es el MISMO que el de la pantalla del Lookahead: ambos
 * derivan el estado de las restricciones con `estadoDeTarea` y lo agregan con
 * `confiabilidad`. Si algun dia divergen, es que alguien duplico la regla en
 * vez de reutilizarla.
 */
export async function confiabilidadDeVentana(
  sesion: SesionActiva,
  obraId: string,
  tareasCronograma: readonly TareaProgramada[],
  semanasPedidas?: string | number,
): Promise<ConfiabilidadVentana | null> {
  if (!puede(sesion, "lookahead:leer")) return null;

  const semanas = normalizarSemanas(semanasPedidas);
  const { desde, hasta } = ventanaLookahead(hoy(), semanas);
  const tareas = tareasDeLaSemana([...tareasCronograma], desde, hasta);

  const uids = tareas.map((t) => t.uid);
  const analizadas = uids.length
    ? await prisma.lookaheadTask.findMany({
        where: {
          projectId: obraId,
          uid: { in: uids },
          project: { companyId: sesion.companyId },
        },
        select: {
          uid: true,
          analizadaAt: true,
          restricciones: {
            select: {
              tipo: true,
              resuelta: true,
              resueltaAt: true,
              fechaCompromiso: true,
              responsableUserId: true,
              responsableContactoId: true,
            },
          },
        },
      })
    : [];

  const porUid = new Map(analizadas.map((l) => [l.uid, l]));

  // Una tarea sin fila `LookaheadTask` es, por definicion, sin analizar: no
  // hay donde guardar la fecha. Los dos numeros que antes se contaban por
  // separado —"sin traer" y "sin analizar"— se funden en uno, que es el que
  // de verdad explica por que la confiabilidad sale baja.
  const filas = tareas.map((t) => {
    const lk = porUid.get(t.uid);
    return {
      fase: faseDeTarea({
        analizadaAt: lk?.analizadaAt ?? null,
        restricciones: lk?.restricciones ?? [],
      }),
    };
  });

  const todasLasRestricciones = analizadas.flatMap((l) => l.restricciones);

  return {
    ...confiabilidad(filas),
    semanas,
    restriccionesResueltas: todasLasRestricciones.filter((r) => r.resuelta)
      .length,
    liberacion: cumplimientoDeLiberacion(todasLasRestricciones, hoy()),
  };
}

/**
 * Trae al Lookahead las tareas de la ventana que aun no estan: crea su
 * `LookaheadTask` VACIO, sin restricciones y sin analizar.
 *
 * Ya no siembra los 7 flujos. Sembrarlos hacia que toda tarea naciera con
 * siete casillas que nadie eligio —incluidos los hitos de duracion cero, que
 * no tienen ni materiales ni cuadrilla— y que "cero restricciones" no pudiera
 * distinguirse de "nadie la ha mirado". Cuales aplican lo dice `fijarFlujos`.
 *
 * Idempotente: no duplica las que ya existen.
 */
export async function sincronizarLookahead(
  sesion: SesionActiva,
  obraId: string,
  /// LAS MISMAS semanas que se estan viendo. Si aqui se usara otra cifra, el
  /// boton dejaria sin analizar tareas que la pantalla si muestra, y no habria
  /// forma de entender por que.
  semanasPedidas?: string | number,
): Promise<ResultadoSync> {
  if (!puede(sesion, "lookahead:gestionar")) {
    return { ok: false, error: "No tienes permiso para gestionar el Lookahead." };
  }

  const cerradaSync = await motivoSiObraCerrada(sesion, obraId);
  if (cerradaSync) return { ok: false, error: cerradaSync };

  const obra = await prisma.project.findFirst({
    where: { id: obraId, companyId: sesion.companyId },
    select: { id: true },
  });
  if (!obra) return { ok: false, error: "Obra no encontrada." };

  const { tareas } = await tareasDeLaVentana(
    sesion,
    obraId,
    normalizarSemanas(semanasPedidas),
  );
  if (tareas.length === 0) return { ok: true, creadas: 0 };

  const existentes = await prisma.lookaheadTask.findMany({
    where: { projectId: obraId, uid: { in: tareas.map((t) => t.uid) } },
    select: { uid: true },
  });
  const yaHay = new Set(existentes.map((e) => e.uid));
  const nuevas = tareas.filter((t) => !yaHay.has(t.uid));
  if (nuevas.length === 0) return { ok: true, creadas: 0 };

  await prisma.$transaction(async (tx) => {
    // Un solo `createMany` en vez de un `create` + `createMany` por tarea:
    // eran 2N consultas por sincronizacion. `skipDuplicates` cubre a dos
    // usuarios pulsando a la vez, que antes reventaba con P2002 contra el
    // unico (projectId, uid).
    await tx.lookaheadTask.createMany({
      data: nuevas.map((t) => ({ projectId: obraId, uid: t.uid })),
      skipDuplicates: true,
    });

    await tx.auditLog.create({
      data: {
        companyId: sesion.companyId,
        userId: sesion.userId,
        projectId: obraId,
        entidad: "LookaheadTask",
        entidadId: obraId,
        accion: "CREATE",
        despues: { evento: "sincronizar", creadas: nuevas.length },
      },
    });
  });

  return { ok: true, creadas: nuevas.length };
}

// --- Analizar y levantar ---------------------------------------------------

/**
 * Tope de tareas por lote.
 *
 * "Elegir todas" con una ventana de 12 semanas puede ser mucho, y una
 * transaccion larga bloquea la tabla para el resto de la obra mientras dura.
 */
export const MAX_LOTE = 200;

export interface Conservada {
  uid: number;
  tipo: TipoRestriccion;
  motivo: MotivoConservada;
}

/**
 * Lo que ACABA de pasar, para que quien llame pueda avisar.
 *
 * Va aparte del resultado numerico y en crudo —uid y tipo, sin nombres—
 * porque avisar NO es trabajo de este servicio: aqui solo se dice que ocurrio.
 * Quien compone el aviso resuelve los nombres, que es donde hacen falta.
 */
export interface HechosLookahead {
  /// Flujos que se acaban de abrir.
  abiertas: { uid: number; tipo: TipoRestriccion }[];
  /// Tareas que acaban de pasar a LISTA (solo la transicion, no las que ya lo
  /// estaban).
  listas: number[];
}

const SIN_HECHOS: HechosLookahead = { abiertas: [], listas: [] };

export type ResultadoAnalisis =
  | {
      ok: true;
      /// Cuantas tareas quedaron tocadas.
      tareas: number;
      creadas: number;
      borradas: number;
      levantadas: number;
      /// Flujos que se pidio quitar y se quedaron porque tenian algo dentro.
      /// La pantalla lo dice: no se pierde nada en silencio.
      conservadas: Conservada[];
      hechos: HechosLookahead;
    }
  | { ok: false; error: string };

const NADA: ResultadoAnalisis = {
  ok: true,
  tareas: 0,
  creadas: 0,
  borradas: 0,
  levantadas: 0,
  conservadas: [],
  hechos: SIN_HECHOS,
};

/**
 * Permiso, obra abierta y obra de la empresa, en ese orden. Devuelve el motivo
 * si no se puede escribir, o null si via libre.
 */
async function puertaDeEscritura(
  sesion: SesionActiva,
  obraId: string,
): Promise<string | null> {
  if (!puede(sesion, "lookahead:gestionar")) {
    return "No tienes permiso para gestionar el Lookahead.";
  }
  const cerrada = await motivoSiObraCerrada(sesion, obraId);
  if (cerrada) return cerrada;

  const obra = await prisma.project.findFirst({
    where: { id: obraId, companyId: sesion.companyId },
    select: { id: true },
  });
  return obra ? null : "Obra no encontrada.";
}

/**
 * Fija QUE flujos aplican a una o varias tareas, y las marca como ANALIZADAS.
 *
 * Cubre las tres cosas de una vez: elegir en lote, decir cuales aplican y
 * decir que no aplica ninguno (`tipos: []`). Crea el `LookaheadTask` que falte,
 * asi que no hace falta haber traido la tarea antes.
 *
 * La decision de que se crea y que se puede borrar es de `planificarFlujos`,
 * que esta en `@/lib/lookahead` y tiene tests: es la regla que impide dejar
 * fotos de evidencia huerfanas, y no puede vivir en un servicio sin probar.
 *
 * Nunca pide confirmacion, al reves que `comprometerAlPts`: alli la accion es
 * irreversible, aqui no se pierde nada —lo que tiene trabajo dentro se
 * conserva y se informa—, asi que no hay nada que confirmar.
 */
export async function fijarFlujos(
  sesion: SesionActiva,
  obraId: string,
  datos: {
    uids: readonly number[];
    tipos: readonly TipoRestriccion[];
    modo?: ModoFlujos;
  },
): Promise<ResultadoAnalisis> {
  return analizar(sesion, obraId, datos, "fijar-flujos");
}

/**
 * "Revisadas: no les aplica ninguna restriccion." Atajo de `fijarFlujos` con
 * la lista vacia; funcion propia para que el registro de auditoria diga el
 * evento de verdad y no un `fijar-flujos` con `tipos: []` que hay que
 * interpretar.
 */
export async function marcarSinRestricciones(
  sesion: SesionActiva,
  obraId: string,
  uids: readonly number[],
): Promise<ResultadoAnalisis> {
  return analizar(sesion, obraId, { uids, tipos: [] }, "sin-restricciones");
}

async function analizar(
  sesion: SesionActiva,
  obraId: string,
  datos: {
    uids: readonly number[];
    tipos: readonly TipoRestriccion[];
    modo?: ModoFlujos;
  },
  evento: "fijar-flujos" | "sin-restricciones",
): Promise<ResultadoAnalisis> {
  const error = await puertaDeEscritura(sesion, obraId);
  if (error) return { ok: false, error };

  const pedidos = [...new Set(datos.tipos)];
  const uids = [...new Set(datos.uids)].slice(0, MAX_LOTE);
  if (uids.length === 0) return NADA;

  // Los uid llegan del cliente: solo valen los que existen en el cronograma
  // vigente de ESTA obra. Sin esto se podrian crear filas de Lookahead para
  // tareas inventadas, que luego no se veria en ninguna pantalla.
  const cronograma = await cronogramaVigente(sesion, obraId);
  const delCronograma = new Set((cronograma?.tareas ?? []).map((t) => t.uid));
  const validos = uids.filter((u) => delCronograma.has(u));
  if (validos.length === 0) return NADA;

  const ahora = new Date();
  const autor = quien(sesion);

  return prisma.$transaction(async (tx) => {
    // Las que aun no estan en la matriz se crean vacias sobre la marcha.
    await tx.lookaheadTask.createMany({
      data: validos.map((uid) => ({ projectId: obraId, uid })),
      skipDuplicates: true,
    });

    const tareas = await tx.lookaheadTask.findMany({
      where: { projectId: obraId, uid: { in: validos } },
      select: {
        id: true,
        uid: true,
        restricciones: {
          select: {
            id: true,
            tipo: true,
            resuelta: true,
            detalle: true,
            requiereDoc: true,
            documentoId: true,
            _count: { select: { fotos: true } },
          },
        },
      },
    });

    const crear: { lookaheadTaskId: string; tipo: TipoRestriccion }[] = [];
    const borrar: string[] = [];
    const conservadas: Conservada[] = [];

    for (const t of tareas) {
      const plan = planificarFlujos(
        t.restricciones.map((r) => ({
          id: r.id,
          tipo: r.tipo,
          resuelta: r.resuelta,
          detalle: r.detalle,
          requiereDoc: r.requiereDoc,
          documentoId: r.documentoId,
          fotos: r._count.fotos,
        })),
        pedidos,
        datos.modo ?? "reemplazar",
      );
      for (const tipo of plan.crear) crear.push({ lookaheadTaskId: t.id, tipo });
      borrar.push(...plan.borrar);
      for (const c of plan.conservadas) {
        conservadas.push({ uid: t.uid, tipo: c.tipo, motivo: c.motivo });
      }
    }

    if (borrar.length > 0) {
      await tx.restriccion.deleteMany({ where: { id: { in: borrar } } });
    }
    if (crear.length > 0) {
      await tx.restriccion.createMany({ data: crear, skipDuplicates: true });
    }

    const ids = tareas.map((t) => t.id);
    await tx.lookaheadTask.updateMany({
      where: { id: { in: ids } },
      data: { analizadaAt: ahora, analizadaPor: autor },
    });
    const listas = await recalcularEstados(tx, ids);

    // Los flujos recien abiertos, con su uid: es lo que se avisa. Se traduce
    // de id de tarea a uid aqui, que es donde se tiene el mapa.
    const uidPorId = new Map(tareas.map((t) => [t.id, t.uid]));
    const abiertas = crear.flatMap((c) => {
      const uid = uidPorId.get(c.lookaheadTaskId);
      return uid === undefined ? [] : [{ uid, tipo: c.tipo }];
    });

    // Queda registrado QUIEN descarto que flujo. La doctrina del Last Planner
    // es que las siete preguntas se hacen siempre; poder responder "a esta no
    // le aplica" es lo que se acaba de abrir, y tiene que ser auditable.
    await tx.auditLog.create({
      data: {
        companyId: sesion.companyId,
        userId: sesion.userId,
        projectId: obraId,
        entidad: "LookaheadTask",
        entidadId: obraId,
        accion: "UPDATE",
        despues: {
          evento,
          uids: validos,
          tipos: pedidos,
          modo: datos.modo ?? "reemplazar",
          creadas: crear.length,
          borradas: borrar.length,
          conservadas: conservadas.length,
        },
      },
    });

    return {
      ok: true as const,
      tareas: tareas.length,
      creadas: crear.length,
      borradas: borrar.length,
      levantadas: 0,
      conservadas,
      hechos: { abiertas, listas },
    };
  });
}

/**
 * Levanta (o vuelve a bajar) restricciones concretas, una o muchas.
 *
 * Los ids llegan del cliente, asi que primero se comprueba cuales son de una
 * tarea de ESTA obra y empresa y se opera solo sobre esas. Se filtran ademas
 * las que ya estaban como se pide, para que el numero que se devuelve sea el
 * de cambios reales y no el de casillas tocadas.
 */
export async function levantarRestricciones(
  sesion: SesionActiva,
  obraId: string,
  datos: { ids: readonly string[]; resuelta: boolean },
): Promise<ResultadoAnalisis> {
  const error = await puertaDeEscritura(sesion, obraId);
  if (error) return { ok: false, error };

  const ids = [...new Set(datos.ids)];
  if (ids.length === 0) return NADA;

  const suyas = await prisma.restriccion.findMany({
    where: {
      id: { in: ids },
      resuelta: !datos.resuelta,
      tarea: { projectId: obraId, project: { companyId: sesion.companyId } },
    },
    select: { id: true, lookaheadTaskId: true },
  });
  if (suyas.length === 0) return NADA;

  const tareas = [...new Set(suyas.map((r) => r.lookaheadTaskId))];
  const ahora = new Date();
  const autor = quien(sesion);

  return prisma.$transaction(async (tx) => {
    await tx.restriccion.updateMany({
      where: { id: { in: suyas.map((r) => r.id) } },
      data: {
        resuelta: datos.resuelta,
        resueltaAt: datos.resuelta ? ahora : null,
        resueltaPor: datos.resuelta ? autor : null,
      },
    });

    const listas = await recalcularEstados(tx, tareas);

    await tx.auditLog.create({
      data: {
        companyId: sesion.companyId,
        userId: sesion.userId,
        projectId: obraId,
        entidad: "Restriccion",
        entidadId: obraId,
        accion: "UPDATE",
        despues: {
          evento: datos.resuelta ? "levantar" : "reabrir",
          restricciones: suyas.length,
          tareas: tareas.length,
        },
      },
    });

    return {
      ok: true as const,
      tareas: tareas.length,
      creadas: 0,
      borradas: 0,
      levantadas: suyas.length,
      conservadas: [],
      // Levantar no abre nada; lo que puede pasar es que alguna quede lista.
      hechos: { abiertas: [], listas },
    };
  });
}

/**
 * Levanta TODAS las pendientes de las tareas elegidas. Es el boton de lote:
 * en obra lo normal es que un frente se libere entero de golpe.
 */
export async function levantarTodasDeTareas(
  sesion: SesionActiva,
  obraId: string,
  uids: readonly number[],
): Promise<ResultadoAnalisis> {
  const error = await puertaDeEscritura(sesion, obraId);
  if (error) return { ok: false, error };

  const lista = [...new Set(uids)].slice(0, MAX_LOTE);
  if (lista.length === 0) return NADA;

  const pendientes = await prisma.restriccion.findMany({
    where: {
      resuelta: false,
      tarea: {
        projectId: obraId,
        uid: { in: lista },
        project: { companyId: sesion.companyId },
      },
    },
    select: { id: true },
  });

  return levantarRestricciones(sesion, obraId, {
    ids: pendientes.map((r) => r.id),
    resuelta: true,
  });
}

export interface ResultadoCompromiso {
  ok: boolean;
  /// Cuantas restricciones quedaron con la promesa puesta.
  asignadas?: number;
  error?: string;
}

/**
 * Registra QUIEN levanta unas restricciones y PARA CUANDO.
 *
 * Es la pieza que le faltaba al analisis de restricciones para ser un analisis
 * de restricciones: el Last Planner pide una lista de *restriccion ->
 * responsable -> fecha*, y lo que habia era una casilla que alguien marca.
 *
 * VA EN LOTE porque asignar de una en una a treinta filas no lo hace nadie, y
 * una funcion que no se usa no protege de nada. Es el mismo motivo por el que
 * `levantarTodasDeTareas` existe.
 *
 * La promesa se registra VENGA POR DONDE VENGA. En obra llega por telefono y la
 * escribe el residente, y por eso `comprometidoPor` guarda a quien la anota,
 * que no es lo mismo que quien promete. Esa diferencia importa: una promesa que
 * alguien se hizo a si mismo no vale lo que una que hizo el almacenero delante
 * de todos.
 */
export async function comprometerRestricciones(
  sesion: SesionActiva,
  obraId: string,
  datos: {
    ids: readonly string[];
    /// "u:<id>" | "c:<id>" | "" para dejarla sin responsable.
    responsable: string;
    /// "YYYY-MM-DD" | "" para quitar la fecha.
    fecha: string;
  },
): Promise<ResultadoCompromiso> {
  const error = await puertaDeEscritura(sesion, obraId);
  if (error) return { ok: false, error };

  const validacion = validarCompromisoRestriccion(
    { responsable: datos.responsable, fecha: datos.fecha },
    hoy(),
  );
  if (!validacion.ok) return { ok: false, error: validacion.error };

  const ids = [...new Set(datos.ids)].slice(0, MAX_LOTE);
  if (ids.length === 0) return { ok: true, asignadas: 0 };

  // Los ids llegan del cliente: solo valen los que cuelgan de una tarea de ESTA
  // obra y de esta empresa. Y solo las ABIERTAS: poner responsable a algo ya
  // levantado seria escribir una promesa sobre trabajo terminado.
  const suyas = await prisma.restriccion.findMany({
    where: {
      id: { in: ids },
      resuelta: false,
      tarea: { projectId: obraId, project: { companyId: sesion.companyId } },
    },
    select: { id: true },
  });
  if (suyas.length === 0) return { ok: true, asignadas: 0 };

  const { responsable, fecha } = validacion.datos;

  // El responsable tiene que ser de ESTA obra. Sin esto, un id copiado de otra
  // obra dejaria una restriccion a nombre de alguien que no puede ni verla.
  if (responsable) {
    const existe =
      responsable.tipo === "usuario"
        ? await prisma.projectMembership.count({
            where: { projectId: obraId, userId: responsable.id },
          })
        : await prisma.contactoAviso.count({
            where: { id: responsable.id, projectId: obraId, activo: true },
          });
    if (existe === 0) {
      return { ok: false, error: "Esa persona no está en esta obra." };
    }
  }

  const ahora = new Date();

  await prisma.$transaction(async (tx) => {
    await tx.restriccion.updateMany({
      where: { id: { in: suyas.map((r) => r.id) } },
      data: {
        responsableUserId:
          responsable?.tipo === "usuario" ? responsable.id : null,
        responsableContactoId:
          responsable?.tipo === "contacto" ? responsable.id : null,
        fechaCompromiso: fecha,
        comprometidoAt: ahora,
        comprometidoPor: quien(sesion),
      },
    });

    await tx.auditLog.create({
      data: {
        companyId: sesion.companyId,
        userId: sesion.userId,
        projectId: obraId,
        entidad: "Restriccion",
        entidadId: obraId,
        accion: "UPDATE",
        despues: {
          evento: "comprometer",
          restricciones: suyas.length,
          responsable: datos.responsable || null,
          fecha: datos.fecha || null,
        },
      },
    });
  });

  return { ok: true, asignadas: suyas.length };
}

/**
 * Una sola casilla de la matriz. Delega en `levantarRestricciones` para que el
 * camino de una y el de muchas sean el mismo: si divergieran, uno de los dos
 * acabaria olvidandose de recalcular el semaforo.
 */
export async function alternarRestriccion(
  sesion: SesionActiva,
  obraId: string,
  restriccionId: string,
  resuelta: boolean,
): Promise<ResultadoLookahead> {
  const r = await levantarRestricciones(sesion, obraId, {
    ids: [restriccionId],
    resuelta,
  });
  return r.ok ? { ok: true } : { ok: false, error: r.error };
}
