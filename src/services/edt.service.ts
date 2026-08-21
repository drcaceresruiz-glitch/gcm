import "server-only";
import { prisma } from "@/lib/prisma";
import { puede } from "@/lib/rbac";
import { hoy as hoyCalendario } from "@/utils/fechas";
import { motivoSiObraCerrada } from "@/services/obra-abierta";
import { diasLaborablesEntre, type DiaLaboral } from "@/lib/calendario";
import { obtenerCalendario } from "@/services/calendario.service";
import {
  edtDesdePresupuesto,
  resumenesPorOrden,
  subirFechas,
  type Programada,
} from "@/lib/edt-desde-presupuesto";
import type { SesionActiva } from "@/services/sesion.service";

/**
 * Generar el cronograma DESDE el presupuesto.
 *
 * El presupuesto ya es la EDT: el capitulo es la rama, la partida es el
 * paquete de trabajo —el entregable— y sus subpartidas son las tareas que hay
 * que hacer para cumplirlo. Teclearlo otra vez en el cronograma seria escribir
 * dos veces la misma estructura y garantizar que un dia discrepen.
 *
 * Lo unico que se anade encima son las FECHAS, y solo en las hojas: los
 * paquetes y los capitulos las heredan.
 */

export type Resultado<T = void> =
  | ({ ok: true } & (T extends void ? object : { datos: T }))
  | { ok: false; error: string };

/**
 * El cliente que entrega `$transaction`: el mismo de siempre sin las funciones
 * de conexion. Se toma del propio `prisma` para que un cambio de version del
 * cliente lo arrastre solo.
 */
type ClienteTransaccion = Omit<
  typeof prisma,
  "$connect" | "$disconnect" | "$on" | "$use" | "$extends"
>;

export interface EdtGenerada {
  version: number;
  tareas: number;
  /// Cuantas llevan enlace con el presupuesto: son las que valorizan.
  enlazadas: number;
}

/**
 * Recalcula las fechas de las tareas RESUMEN a partir de sus hojas.
 *
 * Se guarda calculado y no se calcula al leer porque de estas fechas beben el
 * Gantt, la curva S, el informe y el valor ganado: cada uno por su lado, y si
 * cada uno lo dedujera podrian deducir cosas distintas.
 *
 * Se llama despues de CUALQUIER cambio en las tareas manuales.
 */
export async function recalcularResumenes(
  tx: ClienteTransaccion,
  cronogramaId: string,
  /**
   * Filas que NO se recalculan: se quedan exactamente como estaban.
   *
   * Son los SOBRANTES de la sincronizacion —lo que ya no sale del
   * presupuesto—, y existen porque la regla del orden deja de significar lo
   * que dice cuando una fila se destierra al final del documento.
   *
   * El caso que lo destapo: un cronograma importado con la plantilla oficial
   * trae la obra como fila raiz de nivel 1. La sincronizacion la manda al
   * final —no es ninguna partida— y alli, sin nada colgando por debajo, la
   * regla la convierte en HOJA. Una cabecera pasaba a ser trabajo ejecutable:
   * salia ofrecida en el Lookahead, se podia comprometer en el Plan Semanal y
   * **entraba en el denominador del avance ponderado**, que es de donde sale
   * la curva.
   *
   * OJO AL ALCANCE: esto protege el camino de la SINCRONIZACION, que es quien
   * mueve la fila. Cualquier otra escritura que recalcule sin esta lista
   * —editar una tarea a mano, por ejemplo— vuelve a aplicarle la regla y la
   * degrada otra vez. La cura de verdad es que la EDT respete la cabecera en
   * vez de desterrarla, y esa es otra obra.
   */
  intocables: ReadonlySet<number> = new Set(),
): Promise<void> {
  const tareas = await tx.tareaCronograma.findMany({
    where: { cronogramaId },
    orderBy: { fila: "asc" },
    select: {
      uid: true, fila: true, nivel: true, esResumen: true,
      inicio: true, fin: true, sinProgramar: true,
    },
  });

  /**
   * La duracion del resumen se mide EN LO MISMO que la de sus tareas.
   *
   * Las hojas la sacan de sus fechas contando dias de TRABAJO, con el
   * calendario de la obra. Si el resumen contara dias naturales, la misma
   * columna llevaria dos medidas distintas: un paquete que cruce un domingo
   * diria un dia mas que la suma de lo que contiene, sin que nada falle.
   */
  const cronograma = await tx.cronograma.findUnique({
    where: { id: cronogramaId },
    select: { projectId: true },
  });

  const calendario = cronograma
    ? (
        await tx.workCalendar.findMany({
          where: { projectId: cronograma.projectId },
          select: { diaSemana: true, laborable: true, horas: true },
        })
      ).map((d) => ({ ...d, horas: d.horas.toString() }))
    : [];

  const dia = (f: Date) => f.toISOString().slice(0, 10);

  /**
   * Quien es resumen se RECALCULA, no se hereda.
   *
   * `esResumen` se guarda en la base y se quedaba pegado: al borrar la ultima
   * hija de un paquete nadie le devolvia la marca a `false`, y esa fila
   * quedaba inservible para siempre —no valoriza, no aparece en la pantalla de
   * mapeo y el sistema rechaza enlazarla con su partida—, sin ninguna forma de
   * arreglarla salvo borrarla tambien.
   *
   * La regla es la del orden del documento —es resumen quien tiene a la
   * siguiente colgando mas adentro—, la misma que aplica el lector de MS
   * Project, para que las tres vias de entrada coincidan.
   */
  const resumen = resumenesPorOrden(tareas);

  const antes: (Programada & { uid: number })[] = tareas.map((t, i) => {
    // Deja de aportar fecha la que no esta programada, y tambien la que acaba
    // de dejar de ser resumen: las que tenia venian de hijas que ya no estan.
    const sinPlan = t.sinProgramar || (t.esResumen && !resumen[i]!);
    return {
      uid: t.uid,
      nivel: t.nivel,
      fila: t.fila,
      esResumen: resumen[i]!,
      inicio: sinPlan ? null : dia(t.inicio),
      fin: sinPlan ? null : dia(t.fin),
    };
  });

  const despues = subirFechas(antes);

  for (let i = 0; i < despues.length; i++) {
    const t = despues[i]!;
    const vieja = tareas[i]!;

    // Los sobrantes participan en el orden —para no alterar lo que se deduce
    // de las demas— pero no se les escribe nada.
    if (intocables.has(vieja.uid)) continue;

    const cambios: Record<string, unknown> = {};

    if (vieja.esResumen !== t.esResumen) cambios["esResumen"] = t.esResumen;

    if (!t.esResumen && vieja.esResumen && !vieja.sinProgramar) {
      // Se quedo sin hijas: las fechas que arrastra son las de las tareas
      // muertas. Vuelve a estar sin programar en vez de mentir en el Gantt.
      cambios["sinProgramar"] = true;
      cambios["duracionDias"] = "0.00";
    }

    if (t.esResumen) {
      if (t.inicio === null || t.fin === null) {
        // Ninguna hoja suya esta programada: inventarle fechas seria decir que
        // hay un plan donde no lo hay, y conservar las viejas es peor todavia.
        if (!vieja.sinProgramar) {
          cambios["sinProgramar"] = true;
          cambios["duracionDias"] = "0.00";
        }
      } else if (
        vieja.sinProgramar ||
        dia(vieja.inicio) !== t.inicio ||
        dia(vieja.fin) !== t.fin
      ) {
        cambios["inicio"] = new Date(`${t.inicio}T00:00:00.000Z`);
        cambios["fin"] = new Date(`${t.fin}T00:00:00.000Z`);
        // La duracion de un resumen es su ENVOLTURA —de la primera tarea que
        // empieza a la ultima que acaba—, no la suma de las suyas: dos tareas
        // de tres dias en paralelo son tres dias de paquete, no seis. Y se
        // cuenta en dias de trabajo, igual que las hojas.
        cambios["duracionDias"] = diasEntre(t.inicio, t.fin, calendario);
        cambios["sinProgramar"] = false;
      }
    }

    if (Object.keys(cambios).length === 0) continue;

    await tx.tareaCronograma.updateMany({
      where: { cronogramaId, uid: vieja.uid },
      data: cambios,
    });
  }
}

/**
 * Dias de trabajo entre dos fechas de calendario, ambas incluidas.
 *
 * Las fechas se parten a mano en vez de pasarlas por `new Date(iso)`: eso las
 * interpreta en UTC, y en Peru —UTC-5— el dia sale corrido uno atras, con lo
 * que `getDay()` diria domingo donde hay lunes.
 */
function diasEntre(
  inicio: string,
  fin: string,
  calendario: readonly DiaLaboral[],
): string {
  const dia = (iso: string) => {
    const [anio, mes, d] = iso.split("-").map(Number);
    return new Date(anio!, mes! - 1, d!);
  };
  return `${diasLaborablesEntre(dia(inicio), dia(fin), calendario)}.00`;
}

export async function generarEdtDesdePresupuesto(
  sesion: SesionActiva,
  obraId: string,
): Promise<Resultado<EdtGenerada>> {
  if (!puede(sesion, "cronograma:editar")) {
    return { ok: false, error: "No tienes permiso para editar el cronograma." };
  }

  const cerrada = await motivoSiObraCerrada(sesion, obraId);
  if (cerrada) return { ok: false, error: cerrada };

  const obra = await prisma.project.findFirst({
    where: { id: obraId, companyId: sesion.companyId },
    select: { id: true, fechaInicio: true, ultimoUidManual: true },
  });
  if (!obra) return { ok: false, error: "Obra no encontrada." };

  // Solo hace falta si el presupuesto trae fechas propias: `diasEntre` la
  // usa para calcular la duracion de esas tareas en dias laborables.
  const calendario = await obtenerCalendario(sesion, obraId);

  const partidas = await prisma.wbsItem.findMany({
    where: { projectId: obraId },
    select: {
      id: true,
      codigoPartida: true,
      descripcion: true,
      parentId: true,
      orden: true,
      // Sin el importe no se puede saber quien es hoja: lo decide el dinero.
      parcial: true,
      // Si el presupuesto ya trajo fecha, la tarea nace programada de una
      // vez en vez de `sinProgramar`. Opcionales: la mayoria de las obras no
      // las traera.
      fechaInicioPlan: true,
      fechaFinPlan: true,
    },
  });

  if (partidas.length === 0) {
    return {
      ok: false,
      error: "Esta obra no tiene presupuesto todavia. La EDT sale de el.",
    };
  }

  const vigente = await prisma.cronograma.findFirst({
    where: { projectId: obraId },
    orderBy: [{ fechaCorte: "desc" }, { version: "desc" }],
    select: {
      id: true,
      version: true,
      origen: true,
      lineaBaseAt: true,
      _count: { select: { tareas: true } },
    },
  });

  if (vigente?.lineaBaseAt) {
    return {
      ok: false,
      error:
        `El cronograma v${vigente.version} esta fijado como linea base. Los ` +
        `indicadores se calculan contra el, asi que no admite cambios.`,
    };
  }

  /**
   * Se genera sobre un cronograma VACIO, no encima de uno que ya tiene plan.
   *
   * Si vino de un archivo, ese archivo YA trae la EDT y su red de precedencias:
   * anadirle otra en paralelo duplicaria la obra entera. Y si se tecleo a mano,
   * mezclar filas generadas con filas escritas deja una estructura que nadie
   * puede leer —el nivel y el orden son lo unico que dice quien cuelga de
   * quien—. Reconciliar las dos es el trabajo de la sincronizacion, que va
   * aparte y con su propia regla: lo que ya tiene avance no se toca.
   */
  if (vigente && vigente._count.tareas > 0) {
    return {
      ok: false,
      error:
        vigente.origen === "IMPORTADO"
          ? `El cronograma v${vigente.version} vino de un archivo y ya trae su EDT. ` +
            `Generarla otra vez desde el presupuesto duplicaria la obra.`
          : `El cronograma v${vigente.version} ya tiene ${vigente._count.tareas} tarea(s). ` +
            `Bórralas antes, o espera a la sincronización con el presupuesto.`,
    };
  }

  const edt = edtDesdePresupuesto(
    partidas.map((p) => ({
      ...p,
      parcial: p.parcial?.toString() ?? null,
      // Mismo criterio que el resto del proyecto para leer un `@db.Date` de
      // vuelta como "YYYY-MM-DD" (ver `diasEntre` mas abajo en este archivo).
      fechaInicioPlan: p.fechaInicioPlan?.toISOString().slice(0, 10) ?? null,
      fechaFinPlan: p.fechaFinPlan?.toISOString().slice(0, 10) ?? null,
    })),
  );

  if (edt.length === 0) {
    return {
      ok: false,
      error:
        "Ninguna partida del presupuesto tiene importe todavia, asi que no hay " +
        "nada que programar. Costea el presupuesto y vuelve.",
    };
  }

  const quien = `${sesion.nombres} ${sesion.apellidos} (${sesion.email})`.trim().slice(0, 150);
  const confirmadoPor = quien.slice(0, 150);

  const salida = await prisma.$transaction(
    async (tx) => {
      let cronogramaId = vigente?.id ?? null;
      let version = vigente?.version ?? 0;

      /**
       * La comprobacion de "esta vacio" se repite AQUI DENTRO.
       *
       * Hacerla solo antes deja una ventana: dos pestañas, dos usuarios, o uno
       * solo que reintenta tras un cuelgue, y las dos peticiones ven el
       * cronograma vacio, las dos pasan, y quedan 736 tareas donde debia haber
       * 368 —cada partida enlazada a dos tareas gemelas, cargando su importe
       * dos veces—. El avance ponderado saldria a la mitad del real y la
       * cobertura del mapeo seguiria marcando 100%, asi que la cifra parece
       * mas seria y miente. Las dos peticiones responderian "Listo".
       *
       * El `update` del contador de uid mas abajo bloquea la fila de la obra,
       * pero llega tarde: para entonces ya se decidio generar. Se relee antes.
       */
      if (cronogramaId !== null) {
        const ahora = await tx.cronograma.findUnique({
          where: { id: cronogramaId },
          select: { lineaBaseAt: true, _count: { select: { tareas: true } } },
        });
        if (!ahora) throw new Error("AVISO: el cronograma dejo de existir. Recarga la pantalla.");
        if (ahora.lineaBaseAt) {
          throw new Error(
            "AVISO: el cronograma acaba de fijarse como linea base. Recarga la pantalla.",
          );
        }
        if (ahora._count.tareas > 0) {
          throw new Error(
            `AVISO: otra generacion se adelanto y el cronograma ya tiene ` +
              `${ahora._count.tareas} tarea(s). Recarga la pantalla.`,
          );
        }
      }

      if (cronogramaId === null) {
        version = 1;
        const nuevo = await tx.cronograma.create({
          data: {
            projectId: obraId,
            version,
            fechaCorte: hoyCalendario(),
            nombreProyecto: "EDT generada desde el presupuesto",
            archivo: null,
            origen: "MANUAL",
            importadoPor: quien,
          },
          select: { id: true },
        });
        cronogramaId = nuevo.id;
      }

      /**
       * Los uid salen del contador monotono de la obra, de golpe.
       *
       * Uno por tarea y sin reciclar nunca: `AvanceTarea` y
       * `MapeoTareaPartida` se anclan a el sin clave ajena, asi que un uid
       * reutilizado le pegaria a una tarea el avance de otra.
       */
      const obraActualizada = await tx.project.update({
        where: { id: obraId },
        data: { ultimoUidManual: { decrement: edt.length } },
        select: { ultimoUidManual: true },
      });

      // El contador quedo en el ULTIMO entregado; se reparte hacia arriba.
      const primerUid = obraActualizada.ultimoUidManual + edt.length - 1;

      const conUid = edt.map((f, i) => ({ ...f, uid: primerUid - i }));

      await tx.tareaCronograma.createMany({
        data: conUid.map((f) => ({
          cronogramaId: cronogramaId!,
          uid: f.uid,
          fila: f.fila,
          codigo: f.codigo.slice(0, 40),
          nombre: f.nombre.slice(0, 500),
          nivel: f.nivel,
          esResumen: f.esResumen,
          esHito: false,
          // Sin red de precedencias no hay ruta critica: no se inventa.
          esCritico: false,
          holguraDias: "0.00",
          holguraInferida: true,
          /**
           * Programada de una vez si el presupuesto trajo fecha; si no,
           * NACE SIN PROGRAMAR, y hay que decirlo con una marca.
           *
           * Sin fecha, el presupuesto no tiene con que y no se inventa
           * ninguna. Pero las columnas no admiten nulo, asi que se rellenan
           * con el inicio de obra —y eso, sin la marca, el sistema lo lee
           * como "programada para el primer dia y ya vencida": generar la
           * EDT publicaba al instante cientos de alertas rojas en el
           * tablero y en el informe al cliente, senalando como cuello de
           * botella una partida que nadie habia programado todavia.
           *
           * `f.inicio`/`f.fin` ya vienen de `edtDesdePresupuesto` -solo en
           * las hojas que trajeron las dos fechas, y en los resumenes cuyo
           * subarbol tiene al menos una hoja programada, via `subirFechas`.
           */
          ...(f.inicio !== null && f.fin !== null
            ? {
                sinProgramar: false,
                inicio: new Date(`${f.inicio}T00:00:00.000Z`),
                fin: new Date(`${f.fin}T00:00:00.000Z`),
                duracionDias: diasEntre(f.inicio, f.fin, calendario),
              }
            : {
                sinProgramar: true,
                inicio: obra.fechaInicio,
                fin: obra.fechaInicio,
                duracionDias: "0.00",
              }),
          porcentajePlaneado: "0.00",
          porcentajeArchivo: "0.00",
          origen: "MANUAL" as const,
        })),
      });

      /**
       * El enlace con el dinero, en las HOJAS.
       *
       * Aqui "hoja" ya no significa "sin subpartidas" sino APORTANTE al costo
       * directo: `edtDesdePresupuesto` construye la EDT de modo que las filas
       * no resumen sean exactamente las que devuelve `aportantes`. Por eso la
       * suma de lo enlazado es el costo directo entero —ni un sol sin tarea
       * que lo cubra, ni un sol contado dos veces—, y por eso ninguna partida
       * costeada puede quedar marcada como resumen, que es lo que la excluiria
       * de la valorizacion.
       */
      const hojas = conUid.filter((f) => !f.esResumen);

      await tx.mapeoTareaPartida.createMany({
        data: hojas.map((f) => ({
          projectId: obraId,
          uid: f.uid,
          codigoPartida: f.codigo.slice(0, 32),
          confirmadoPor,
          nota: "Enlace creado al generar la EDT desde el presupuesto.",
        })),
      });

      await tx.auditLog.create({
        data: {
          companyId: sesion.companyId,
          userId: sesion.userId,
          projectId: obraId,
          entidad: "Cronograma",
          entidadId: cronogramaId,
          accion: "CREATE",
          despues: {
            evento: "edt_generada_desde_presupuesto",
            version,
            tareas: conUid.length,
            enlazadas: hojas.length,
          },
        },
      });

      return { version, tareas: conUid.length, enlazadas: hojas.length };
    },
    { timeout: 60_000 },
  );

  return { ok: true, datos: salida };
}
