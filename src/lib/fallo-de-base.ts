/**
 * Traducir un fallo de la base a algo que se pueda leer.
 *
 * EXISTE POR UN FALLO REAL, y ya van dos veces. El 20/08/2026 una importacion
 * de presupuesto murio con «Esta pantalla no se pudo cargar»: la escritura se
 * llamaba sin capturar y el error de MariaDB subia hasta el limite de Next.
 * Al arreglarlo se vio que el alta de usuarios tenia el mismo hueco.
 *
 * Lo que se comparte vive aqui; lo que cada dominio SABE DECIR se queda en su
 * servicio. Un catalogo unico de mensajes acabaria diciendo «hay un valor
 * duplicado» donde se puede decir «ese documento ya es de Rosa Diaz».
 */

/**
 * El codigo del error de Prisma, si lo trae.
 *
 * Se mira `code` POR FORMA y no con `instanceof PrismaClientKnownRequestError`:
 * con el adaptador de MariaDB el error puede venir envuelto, y un `instanceof`
 * que falla no da error —elige la rama equivocada—, que es justo lo que este
 * proyecto ya se comio una vez con `SinPermisoError`.
 */
export function codigoDeFallo(e: unknown): string | null {
  return typeof e === "object" && e !== null && "code" in e
    ? String((e as { code: unknown }).code)
    : null;
}

/**
 * Espera a una escritura y devuelve el motivo si fallo, o `null` si fue bien.
 *
 * Recibe la promesa YA CREADA en vez de envolver la llamada en un `try`. Es
 * deliberado: asi el cuerpo de una transaccion larga no cambia ni una sangria
 * y el arreglo se lee entero en el diff, en vez de quedar sepultado bajo un
 * reindentado de cien lineas.
 *
 * `traducir` recibe EL ERROR, no su codigo, aunque casi todos los traductores
 * empiecen llamando a `codigoDeFallo`. Es para que puedan mirar tambien el
 * mensaje cuando el codigo no baste: hay rechazos de MariaDB que llegan sin
 * `code` y solo se distinguen por lo que dicen.
 */
export async function motivoSiFalla(
  promesa: Promise<unknown>,
  traducir: (e: unknown) => string,
): Promise<string | null> {
  try {
    await promesa;
    return null;
  } catch (e) {
    return traducir(e);
  }
}
