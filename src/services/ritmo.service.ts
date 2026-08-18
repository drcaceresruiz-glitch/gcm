import { prisma } from "@/lib/prisma";
import { puede } from "@/lib/rbac";
import type { SesionActiva } from "@/services/sesion.service";
import { capituloDeCadaTarea } from "@/lib/control-avance";
import { fechasSemanales } from "@/lib/curva-s";
import { ritmoPorTramos, type TareaDelRitmo, type TramoDeRitmo } from "@/lib/ritmo-de-obra";

export interface RitmoDeObra {
  tramos: TramoDeRitmo[];
  /// El mayor `ganado` de la serie. La pantalla dibuja las barras contra esto,
  /// asi que se calcula una vez aqui y no en cada fila.
  techo: number;
  /**
   * Por que no hay tramos, cuando no los hay.
   *
   * Antes esto devolvia `null` y la seccion desaparecia sin mas, que se lee
   * como «esto no funciona». Una pantalla que se calla no explica; una obra
   * recien empezada no tiene ritmo porque no ha pasado una semana, y eso hay
   * que decirlo.
   */
  motivo: "sin-partes" | "primera-semana" | null;
}

/// Cuantos tramos se ensenan. Doce semanas es un trimestre: suficiente para
/// ver una tendencia sin convertir la tabla en un listado historico.
const TRAMOS_MAXIMOS = 12;

/**
 * A que ritmo avanza la obra y que capitulo la mueve.
 *
 * Se alimenta del parte del dia. La cadencia es la de la obra
 * (`diaCorteSemanal`), la misma que usan el plan semanal y la curva S: medir
 * el ritmo con otra semana daria dos versiones de «lo que se avanzo esta
 * semana» en dos pantallas.
 */
export async function ritmoDeObra(
  sesion: SesionActiva,
  obraId: string,
): Promise<RitmoDeObra | null> {
  if (!puede(sesion, "cronograma:leer")) return null;

  const [corte, avances, obra] = await Promise.all([
    prisma.cronograma.findFirst({
      where: { projectId: obraId, project: { companyId: sesion.companyId } },
      orderBy: [{ fechaCorte: "desc" }, { version: "desc" }],
      select: {
        tareas: {
          orderBy: { fila: "asc" },
          select: {
            uid: true,
            fila: true,
            codigo: true,
            nombre: true,
            nivel: true,
            esResumen: true,
            esHito: true,
            esCritico: true,
            inicio: true,
            fin: true,
            duracionDias: true,
            porcentajePlaneado: true,
            porcentajeArchivo: true,
          },
        },
      },
    }),
    prisma.avanceTarea.findMany({
      where: { projectId: obraId },
      orderBy: [{ fecha: "asc" }, { createdAt: "asc" }],
      select: {
        uid: true,
        porcentaje: true,
        fecha: true,
        createdAt: true,
        reportadoPor: true,
        nota: true,
      },
    }),
    prisma.project.findFirst({
      where: { id: obraId, companyId: sesion.companyId },
      select: { diaCorteSemanal: true },
    }),
  ]);

  // Sin cronograma no hay nada que medir, y la pantalla ya lo dice en otro
  // sitio: aqui se calla del todo.
  if (!corte || corte.tareas.length === 0) return null;

  // Sin partes no hay ritmo, pero se explica en vez de desaparecer: una tabla
  // de ceros diria «la obra esta parada» cuando lo cierto es «nadie ha
  // reportado todavia», y una seccion que se esfuma se lee como una averia.
  if (avances.length === 0) {
    return { tramos: [], techo: 0, motivo: "sin-partes" };
  }

  /*
   * El capitulo sale del ORDEN y el NIVEL del documento, no del prefijo del
   * codigo: "7.3.1" es hermana de "7.3" y no su hija, y en los cronogramas
   * reales los codigos no siempre acompanan.
   *
   * `capituloDeCadaTarea` pide el tipo completo de la tarea controlada pero
   * solo mira `fila`, `nivel` y `uid`. Las dos medidas —real y desfase— se
   * rellenan con lo que trae el archivo porque aqui no se mide nada: medir es
   * el trabajo de `ritmoPorTramos`, y hacerlo dos veces con reglas distintas
   * es como se acaba teniendo dos avances para la misma obra.
   */
  const capituloUid = capituloDeCadaTarea(
    corte.tareas.map((t) => ({
      ...t,
      duracionDias: t.duracionDias.toString(),
      porcentajePlaneado: t.porcentajePlaneado.toString(),
      porcentajeArchivo: t.porcentajeArchivo.toString(),
      porcentajeReal: t.porcentajeArchivo.toString(),
      desfase: "0.00",
    })),
  );
  const nombrePorUid = new Map(
    corte.tareas.map((t) => [t.uid, t.codigo ? `${t.codigo} ${t.nombre}` : t.nombre]),
  );

  const tareas: TareaDelRitmo[] = corte.tareas.map((t) => ({
    uid: t.uid,
    esResumen: t.esResumen,
    duracionDias: t.duracionDias.toString(),
    porcentajePlaneado: t.porcentajePlaneado.toString(),
    porcentajeArchivo: t.porcentajeArchivo.toString(),
    // Sin jerarquia —cronograma plano— `capituloDeCadaTarea` devuelve un mapa
    // vacio y todo cae en un solo grupo. Se sigue midiendo el ritmo total; lo
    // que se pierde es el desglose, no la cifra.
    capitulo: nombrePorUid.get(capituloUid.get(t.uid) ?? -1) ?? "Sin capítulo",
  }));

  const reportes = avances.map((a) => ({
    ...a,
    porcentaje: a.porcentaje.toString(),
  }));

  /*
   * Desde el primer parte, no desde el inicio de la obra.
   *
   * Arrancar en la fecha de inicio llenaria la tabla de semanas en blanco
   * anteriores a que nadie reportara nada, y esas semanas se leerian como
   * paradas cuando en realidad no hay dato.
   */
  const primero = reportes[0]!.fecha;
  const semanas = fechasSemanales(primero, new Date(), obra?.diaCorteSemanal ?? 5);

  const tramos = ritmoPorTramos(tareas, reportes, semanas).slice(-TRAMOS_MAXIMOS);

  // Hace falta cerrar al menos un corte para que haya un tramo: con todos los
  // partes dentro de la misma semana no hay dos medidas que restar.
  if (tramos.length === 0) {
    return { tramos: [], techo: 0, motivo: "primera-semana" };
  }

  return {
    tramos,
    techo: Math.max(...tramos.map((t) => t.ganado), 0),
    motivo: null,
  };
}
