/**
 * Galeria de obra: el agrupado de fotos por periodo, puro y sin base.
 *
 * Vive aparte del servicio por el patron de la casa (la aritmetica se prueba
 * sola) y ademas porque lo usan DOS pantallas que no comparten nada mas: la
 * galeria interna y la pagina publica del cliente.
 */

/// Copia local del enum de Prisma a proposito: este modulo lo importan
/// componentes de cliente, y no debe arrastrar nada del lado servidor.
export type AgrupacionGaleria = "SEMANA" | "MES";

export interface GrupoFotos<T> {
  /// "2026-08-10" (lunes de la semana) o "2026-08" (mes). Ordenable.
  clave: string;
  /// Medianoche UTC del primer dia del periodo, para formatear etiquetas.
  inicio: Date;
  fotos: T[];
}

/**
 * El dia de calendario EN LIMA de un instante, como "YYYY-MM-DD".
 *
 * `createdAt` se guarda en UTC, y Lima va cinco horas por detras: una foto
 * subida un domingo a las 10 de la noche en obra es lunes de madrugada en
 * UTC. Agrupar por el dia UTC la colgaria de la semana equivocada, que es
 * exactamente lo que el gerente notaria ("esta foto no es de esta semana").
 * GCM es una herramienta peruana; el calendario que manda es el de Lima.
 */
export function diaLima(instante: Date): string {
  // en-CA formatea YYYY-MM-DD, que ya es la clave ordenable que se necesita.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Lima",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(instante);
}

/// El lunes de la semana de un dia "YYYY-MM-DD", como fecha UTC a medianoche.
function lunesDe(dia: string): Date {
  const fecha = new Date(`${dia}T00:00:00Z`);
  // getUTCDay: 0=domingo..6=sabado. Correr al lunes anterior (o el mismo).
  const retroceso = (fecha.getUTCDay() + 6) % 7;
  fecha.setUTCDate(fecha.getUTCDate() - retroceso);
  return fecha;
}

/**
 * Agrupa las fotos por periodo, de lo mas reciente a lo mas antiguo.
 *
 * El orden DENTRO de cada grupo es el de llegada: quien llama ya trae las
 * fotos ordenadas (la consulta pide `createdAt desc`) y reordenarlas aqui
 * seria decidir dos veces lo mismo.
 */
export function agruparFotos<T extends { createdAt: Date }>(
  fotos: readonly T[],
  agrupacion: AgrupacionGaleria,
): GrupoFotos<T>[] {
  const grupos = new Map<string, GrupoFotos<T>>();

  for (const foto of fotos) {
    const dia = diaLima(foto.createdAt);
    // El lunes ya ES un dia de calendario (medianoche UTC): su clave sale de
    // la ISO tal cual. Pasarlo otra vez por `diaLima` restaria cinco horas
    // mas y devolveria el domingo.
    const clave =
      agrupacion === "SEMANA"
        ? lunesDe(dia).toISOString().slice(0, 10)
        : dia.slice(0, 7);
    const existente = grupos.get(clave);
    if (existente) {
      existente.fotos.push(foto);
      continue;
    }
    grupos.set(clave, {
      clave,
      inicio:
        agrupacion === "SEMANA"
          ? lunesDe(dia)
          : new Date(`${clave}-01T00:00:00Z`),
      fotos: [foto],
    });
  }

  return [...grupos.values()].sort((a, b) => (a.clave < b.clave ? 1 : -1));
}

/**
 * La etiqueta del grupo, en la lengua de la obra.
 *
 * `inicio` es medianoche UTC de un dia de calendario, asi que se formatea
 * CONTRA UTC: si se dejara la zona por defecto, un servidor en otra zona
 * correria la fecha un dia.
 */
export function etiquetaGrupo(
  inicio: Date,
  agrupacion: AgrupacionGaleria,
): string {
  if (agrupacion === "SEMANA") {
    const dia = new Intl.DateTimeFormat("es-PE", {
      timeZone: "UTC",
      day: "numeric",
      month: "long",
      year: "numeric",
    }).format(inicio);
    return `Semana del ${dia}`;
  }

  const mes = new Intl.DateTimeFormat("es-PE", {
    timeZone: "UTC",
    month: "long",
    year: "numeric",
  }).format(inicio);
  // es-PE da "agosto de 2026" en minuscula; como encabezado va capitalizado.
  return mes.charAt(0).toUpperCase() + mes.slice(1);
}
