import "server-only";
import { prisma } from "@/lib/prisma";
import { puede } from "@/lib/rbac";
import { hoy as hoyCalendario } from "@/utils/fechas";
import { motivoSiObraCerrada } from "@/services/obra-abierta";
import {
  edtDesdePresupuesto,
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
): Promise<void> {
  const tareas = await tx.tareaCronograma.findMany({
    where: { cronogramaId },
    orderBy: { fila: "asc" },
    select: { uid: true, fila: true, nivel: true, esResumen: true, inicio: true, fin: true },
  });

  const dia = (f: Date) => f.toISOString().slice(0, 10);

  const antes: (Programada & { uid: number })[] = tareas.map((t) => ({
    uid: t.uid,
    nivel: t.nivel,
    fila: t.fila,
    esResumen: t.esResumen,
    inicio: dia(t.inicio),
    fin: dia(t.fin),
  }));

  const despues = subirFechas(antes);
  const previas = new Map(antes.map((t) => [t.uid, t]));

  for (const t of despues) {
    if (!t.esResumen) continue;

    const vieja = previas.get(t.uid);
    // Sin una sola hoja programada no se toca: inventarle fechas al resumen
    // seria decir que hay un plan donde no lo hay.
    if (t.inicio === null || t.fin === null) continue;
    if (vieja?.inicio === t.inicio && vieja.fin === t.fin) continue;

    await tx.tareaCronograma.updateMany({
      where: { cronogramaId, uid: t.uid },
      data: {
        inicio: new Date(`${t.inicio}T00:00:00.000Z`),
        fin: new Date(`${t.fin}T00:00:00.000Z`),
        // La duracion de un resumen es su envoltura, en dias de calendario. No
        // hay otra fuente: las hojas la traen del teclado y el resumen no se
        // teclea. Se documenta aqui porque el resto del sistema toma la
        // duracion del archivo y NUNCA de restar fechas.
        duracionDias: diasEntre(t.inicio, t.fin),
      },
    });
  }
}

function diasEntre(inicio: string, fin: string): string {
  const a = Date.parse(`${inicio}T00:00:00Z`);
  const b = Date.parse(`${fin}T00:00:00Z`);
  const dias = Math.round((b - a) / 86_400_000) + 1;
  return `${Math.max(dias, 0)}.00`;
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

  const partidas = await prisma.wbsItem.findMany({
    where: { projectId: obraId },
    select: {
      id: true,
      codigoPartida: true,
      descripcion: true,
      parentId: true,
      orden: true,
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

  const edt = edtDesdePresupuesto(partidas);

  const quien = `${sesion.nombres} ${sesion.apellidos} (${sesion.email})`.trim().slice(0, 150);
  const confirmadoPor = quien.slice(0, 150);

  const salida = await prisma.$transaction(
    async (tx) => {
      let cronogramaId = vigente?.id ?? null;
      let version = vigente?.version ?? 0;

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
          // Nacen SIN programar. El presupuesto no tiene fechas y no se las
          // inventa: se ponen en las hojas y suben solas.
          inicio: obra.fechaInicio,
          fin: obra.fechaInicio,
          duracionDias: "0.00",
          porcentajePlaneado: "0.00",
          porcentajeArchivo: "0.00",
          origen: "MANUAL" as const,
        })),
      });

      /**
       * El enlace con el dinero, solo en las HOJAS.
       *
       * Una partida con subpartidas no lleva importe propio: sus hijas lo
       * cubren, que es lo que decide `aportantes` en el presupuesto. Enlazar
       * tambien el paquete haria que su avance y el de sus tareas contaran dos
       * veces el mismo dinero.
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
