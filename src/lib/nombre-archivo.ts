/**
 * Como se llama TODO lo que GCM deja descargar.
 *
 * NACE DE UNA PETICION DE OBRA, del 23 de agosto de 2026: «la app no permite
 * crear carpetas de trabajo por obra, ¿podriamos incorporar un selector de
 * ubicacion?». Un navegador NO puede crear carpetas en el disco ni elegir
 * donde cae una descarga -y es a proposito: si pudiera, cualquier web
 * escribiria donde quisiera-, asi que la carpeta no se puede dar.
 *
 * PERO EL PROBLEMA DE FONDO NO ERA LA CARPETA. Al mirarlo, tres de las
 * descargas mas usadas salian con un nombre FIJO, sin obra y sin fecha:
 *
 *     plantilla-presupuesto-meta-gcm.xlsx
 *     plantilla-cronograma-gcm.xlsx
 *     proveedores-gcm.xlsx
 *
 * Bajalas para tres obras y tienes «(1)», «(2)», «(3)»: archivos que no se
 * distinguen solos. Hacian falta carpetas para separar lo que el nombre no
 * separaba. Con el nombre completo, una sola carpeta de Descargas se ordena
 * sola y se busca escribiendo el nombre de la obra.
 *
 * LA FORMA es siempre la misma:
 *
 *     GCM_criocord_presupuesto-meta_2026-08-23.xlsx
 *     ^    ^        ^                ^
 *     |    |        |                fecha ISO
 *     |    |        que documento es
 *     |    la obra (o la empresa, en los documentos que no son de una obra)
 *     el sistema: escribiendo «GCM» salen todos
 *
 * TRES EXIGENCIAS QUE CHOCAN, y por eso esto vive en un solo sitio:
 *
 * - **Solo ASCII.** El nombre viaja en la cabecera `Content-Disposition` y en
 *   la del adjunto del correo, y una tilde ahi se convierte en simbolos raros
 *   o rompe la descarga en algunos clientes. Por eso «Ampliación» sale
 *   «ampliacion».
 * - **Que ordene bien.** La fecha va en ISO -no en dd/mm- para que los
 *   documentos de una obra queden en orden cronologico al ordenar la carpeta
 *   por nombre, que es como se van a acumular.
 * - **Que quepa.** Un nombre de obra largo no aporta y estorba en el
 *   explorador de archivos.
 */

/// Mas largo que esto el nombre no aporta y empieza a estorbar en el
/// explorador de archivos.
const MAX_AMBITO = 40;

/// Delante de todo, siempre. Es lo que se teclea en el buscador de Windows
/// para que salgan TODOS los archivos del sistema y ninguno mas.
const PREFIJO = "GCM";

/**
 * Texto a un trozo de nombre de archivo: sin tildes, sin espacios, en ASCII.
 *
 * Se exporta porque tambien lo necesita quien compone un nombre a mano -un
 * respaldo con su version, por ejemplo- y dos formas de limpiar el mismo
 * texto acaban dando dos nombres distintos para la misma obra.
 */
export function trozoDeNombre(texto: string, maximo = MAX_AMBITO): string {
  return (
    texto
      .normalize("NFD")
      // Las marcas que NFD acaba de separar de su letra. Se nombran por su
      // categoria Unicode y no por un rango de caracteres literales: esos son
      // invisibles en el codigo y el primer editor que toque el archivo puede
      // llevarselos sin que nadie lo note.
      .replace(/\p{M}/gu, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, maximo)
      // El recorte puede dejar un guion colgando al final.
      .replace(/-+$/, "")
  );
}

export interface PartesDelNombre {
  /**
   * De que es el documento: el nombre de la obra, o el de la empresa cuando
   * no pertenece a ninguna obra (el catalogo de proveedores, el respaldo de
   * la empresa entera).
   */
  ambito: string;
  /// Que documento es, ya en minusculas y con guiones: "presupuesto-meta".
  documento: string;
  /// La fecha del documento. Si no viaja, no se pone: hay archivos que no
  /// tienen fecha propia y una inventada ordenaria mal.
  fecha?: Date | null;
  /// Sin el punto: "xlsx", "pdf", "csv".
  extension: string;
}

/** El nombre completo con el que se descarga un archivo. */
export function nombreDeArchivo({
  ambito,
  documento,
  fecha,
  extension,
}: PartesDelNombre): string {
  const partes = [
    PREFIJO,
    // Un ambito que se queda vacio al limpiarlo -un nombre solo con simbolos-
    // no puede desaparecer: dejaria dos documentos distintos con el mismo
    // nombre. Se pone algo antes que nada.
    trozoDeNombre(ambito) || "sin-nombre",
    trozoDeNombre(documento) || "documento",
  ];

  if (fecha) partes.push(fecha.toISOString().slice(0, 10));

  return `${partes.join("_")}.${extension}`;
}
