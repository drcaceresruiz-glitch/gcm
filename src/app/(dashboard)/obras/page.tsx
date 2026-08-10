import { redirect } from "next/navigation";

/**
 * `/obras` no tiene pantalla propia: la lista de obras vive en el panel,
 * debajo del tablero de supervision.
 *
 * Existia el hueco y devolvia un 404, que es la peor respuesta posible a una
 * URL que cualquiera teclearia o guardaria en favoritos —parece que el
 * sistema esta roto, no que la pagina este en otro sitio—. Se redirige en vez
 * de duplicar la lista: dos pantallas con las mismas obras acabarian
 * divergiendo.
 */
export default function ObrasIndex() {
  redirect("/panel");
}
