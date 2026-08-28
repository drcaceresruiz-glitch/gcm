import { obtenerSesion } from "@/services/sesion.service";
import { datosDelEstudio, type Tabla } from "@/services/investigacion.service";
import { generarCsvPlano } from "@/lib/csv";
import { nombreDeArchivo } from "@/lib/nombre-archivo";

/**
 * Los datos crudos de una obra, en CSV, para analizarlos fuera.
 *
 * Cuatro archivos, uno por unidad de analisis mas el diccionario:
 *
 *   /obras/<id>/investigacion/compromisos     una fila por compromiso semanal
 *   /obras/<id>/investigacion/restricciones   una fila por restriccion
 *   /obras/<id>/investigacion/consolidado     una fila por semana (la serie)
 *   /obras/<id>/investigacion/aprendizaje     una fila por analisis de causa raiz
 *   /obras/<id>/investigacion/diccionario     que significa cada variable
 *
 * Dos parametros, los dos con valor por defecto:
 *
 *   ?les=2    limite superior de especificacion en dias para el retraso de
 *             liberacion. Viaja COMO COLUMNA en cada fila; no filtra nada.
 *   ?sep=;    separador de columnas. Coma por defecto -es lo que esperan SPSS
 *             y Minitab-; punto y coma para mirarlo antes en un Excel espanol.
 *
 * SE EMITE UNA TABLA POR PETICION y no un ZIP con las cuatro. Un ZIP obliga a
 * descomprimir para ver si el archivo trae lo que se esperaba, y estas
 * descargas se repiten cada semana mientras dura un estudio. Con una URL por
 * tabla se puede automatizar la recogida desde el propio programa de analisis.
 */

const TABLAS = [
  "compromisos",
  "restricciones",
  "consolidado",
  "aprendizaje",
  "diccionario",
] as const;
type NombreTabla = (typeof TABLAS)[number];

export async function GET(
  peticion: Request,
  { params }: { params: Promise<{ id: string; tabla: string }> },
) {
  const sesion = await obtenerSesion();
  if (!sesion) return new Response("No autorizado", { status: 401 });

  /*
   * SOLO QUIEN OPERA GCM, y se comprueba aqui ademas de en el servicio.
   *
   * El servicio ya lo rechaza, pero esta ruta devuelve un ARCHIVO: conviene
   * que la puerta se vea en el mismo sitio donde se abre, para que nadie
   * anada mañana otra tabla y se fie de que alguien mas comprobo. La
   * condicion de operador no es un rol de empresa -sale de una lista del
   * servidor- y no se puede conceder desde dentro de la aplicacion.
   */
  if (!sesion.esOperador) {
    return new Response("Esto es solo para quien opera GCM.", { status: 403 });
  }

  const { id, tabla } = await params;

  const cual = TABLAS.find((t) => t === tabla) as NombreTabla | undefined;
  if (!cual) {
    return new Response(
      `Esa tabla no existe. Las que hay: ${TABLAS.join(", ")}.`,
      { status: 404 },
    );
  }

  const parametros = new URL(peticion.url).searchParams;

  /*
   * El LES por defecto es CERO dias, y no dos ni tres.
   *
   * Cero significa «lo comprometido para el jueves se libera el jueves», que
   * es lo unico que se puede defender sin un acuerdo previo. Cualquier
   * tolerancia mayor es una decision del estudio y tiene que declararla quien
   * exporta, no heredarla de un valor que pusimos nosotros por comodidad.
   */
  const pedido = Number(parametros.get("les"));
  const les = Number.isFinite(pedido) && pedido >= 0 ? Math.trunc(pedido) : 0;

  const separador = parametros.get("sep") === ";" ? ";" : ",";

  const datos = await datosDelEstudio(sesion, id, les);
  if (!datos.ok) return new Response(datos.error, { status: 404 });

  const elegida: Tabla = datos.tablas[cual];
  const csv = generarCsvPlano([elegida.cabecera, ...elegida.filas], separador);

  const nombre = nombreDeArchivo({
    ambito: datos.obra,
    documento: elegida.nombre,
    // CON fecha, al reves que una plantilla: cada descarga es una foto de los
    // datos de ese dia, y en un estudio se descargan muchas veces. Sin fecha
    // en el nombre, la carpeta acaba con «(1)», «(2)» y «(3)» y nadie sabe
    // cual analizo.
    fecha: new Date(),
    extension: "csv",
  });

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${nombre}"`,
      "Cache-Control": "no-store",
    },
  });
}
