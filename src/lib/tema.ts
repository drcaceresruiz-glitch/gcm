/**
 * Apariencia: tema claro/oscuro y paleta de marca.
 *
 * Todo se resuelve con dos atributos en `<html>` —`data-tema` y
 * `data-paleta`— que `globals.css` traduce a variables. No hay estilos en
 * JavaScript: el navegador repinta los 362 usos de `var(--)` sin que React
 * tenga que enterarse.
 */

export const TEMAS = ["auto", "claro", "oscuro"] as const;
export type Tema = (typeof TEMAS)[number];

/**
 * En orden de rueda de color, no de llegada: el selector las pinta en fila y
 * asi la fila se lee como un degradado en vez de como un cajon desordenado.
 *
 * SIEMPRE al menos siete. No es una cifra tecnica: es la promesa de que cada
 * empresa encuentra una identidad propia, y hay una prueba que la vigila.
 */
export const PALETAS = [
  "teal",
  "azul",
  "marino",
  "indigo",
  "violeta",
  "vino",
  "ambar",
  "grafito",
] as const;
export type Paleta = (typeof PALETAS)[number];

export const ETIQUETA_TEMA: Record<Tema, string> = {
  auto: "Segun el sistema",
  claro: "Claro",
  oscuro: "Oscuro",
};

export const ETIQUETA_PALETA: Record<Paleta, string> = {
  teal: "Teal",
  azul: "Azul",
  marino: "Marino",
  indigo: "Indigo",
  violeta: "Violeta",
  vino: "Vino",
  ambar: "Ambar",
  grafito: "Grafito",
};

/**
 * El color con el que se pinta cada muestra del selector.
 *
 * Se repiten aqui los valores de `globals.css` a proposito: la muestra tiene
 * que ensenar el color de una paleta que TODAVIA no esta aplicada, asi que no
 * puede leerlo de `var(--color-marca-500)`, que siempre devolveria el de la
 * paleta activa y pintaria todas las muestras iguales.
 */
export const MUESTRA_PALETA: Record<Paleta, string> = {
  teal: "oklch(0.62 0.11 195)",
  azul: "oklch(0.55 0.16 250)",
  marino: "oklch(0.38 0.1 260)",
  indigo: "oklch(0.54 0.18 285)",
  violeta: "oklch(0.55 0.17 320)",
  vino: "oklch(0.45 0.11 10)",
  ambar: "oklch(0.6 0.15 55)",
  grafito: "oklch(0.48 0.02 240)",
};

/**
 * Se guarda en COOKIE y no en `localStorage`, al contrario que las columnas
 * del presupuesto.
 *
 * El motivo es que la apariencia tiene que estar decidida **antes de pintar
 * nada**. Con `localStorage` haria falta un script en linea que corriera
 * antes que React —el patron clasico contra el parpadeo—, y en esta version
 * de Next un `<script>` dentro de un componente da error de consola. Una
 * cookie la lee el servidor, que ya escribe el `<html>`: no hay script, no
 * hay parpadeo y no hay nada que sincronizar despues.
 *
 * Los dos puntos no valen en el nombre de una cookie, de ahi el guion.
 */
export const COOKIE_TEMA = "gcm-tema";
export const COOKIE_PALETA = "gcm-paleta";

/// Un ano. Es una preferencia, no una sesion: no debe caducar con ella.
const DURACION_COOKIE = 60 * 60 * 24 * 365;

export const TEMA_POR_DEFECTO: Tema = "claro";
export const PALETA_POR_DEFECTO: Paleta = "teal";

/** Lo guardado puede ser cualquier cosa: lo escribe el navegador y alguien
 *  puede haberlo tocado a mano. Se acota en vez de confiar. */
export function temaValido(valor: string | null | undefined): Tema {
  return TEMAS.includes(valor as Tema) ? (valor as Tema) : TEMA_POR_DEFECTO;
}

export function paletaValida(valor: string | null | undefined): Paleta {
  return PALETAS.includes(valor as Paleta)
    ? (valor as Paleta)
    : PALETA_POR_DEFECTO;
}

/**
 * El tema que hay que pintar de verdad.
 *
 * `auto` no llega nunca al atributo: se resuelve antes contra la preferencia
 * del sistema, para que el CSS solo tenga que conocer dos casos.
 */
export function temaEfectivo(tema: Tema, sistemaPrefiereOscuro: boolean): "claro" | "oscuro" {
  if (tema === "auto") return sistemaPrefiereOscuro ? "oscuro" : "claro";
  return tema;
}

/**
 * Guarda la eleccion y la aplica al documento, de una vez y en el acto.
 *
 * Vive aqui y no en el componente a proposito. El selector esta dentro de un
 * desplegable, asi que **solo existe mientras el menu esta abierto**: si la
 * escritura dependiera de un efecto suyo, cerrar el menu lo desmontaria y la
 * eleccion podria quedarse a medias —guardada pero sin aplicar, o al reves—.
 * Al ser sincrona en el clic, no hay ventana en la que ambas cosas discrepen.
 *
 * No hace nada fuera del navegador: se llama tambien desde codigo que se
 * renderiza en el servidor.
 */
export function aplicarApariencia(tema: Tema, paleta: Paleta): void {
  if (typeof document === "undefined") return;

  document.cookie = `${COOKIE_TEMA}=${tema}; path=/; max-age=${DURACION_COOKIE}; SameSite=Lax`;
  document.cookie = `${COOKIE_PALETA}=${paleta}; path=/; max-age=${DURACION_COOKIE}; SameSite=Lax`;

  // Se aplica tambien en el acto para que el cambio se vea al instante, sin
  // esperar a la siguiente peticion. `auto` se deja tal cual en el atributo:
  // de resolverlo contra el sistema se encarga una consulta de medios en
  // `globals.css`, que es lo que permite que el servidor tampoco tenga que
  // saber la preferencia del equipo.
  document.documentElement.dataset.tema = tema;
  document.documentElement.dataset.paleta = paleta;
}

/**
 * Lee una cookie del lado del cliente.
 *
 * `document.cookie` devuelve todas juntas en una sola cadena
 * (`"a=1; b=2"`), asi que hace falta partirla. Solo la usa el selector para
 * poner sus botones en el estado correcto al montar: la aplicacion en si ya
 * llega pintada, porque el layout la lee en el servidor con `next/headers`.
 */
export function leerCookie(nombre: string): string | null {
  if (typeof document === "undefined") return null;

  for (const par of document.cookie.split("; ")) {
    const [clave, ...resto] = par.split("=");
    if (clave === nombre) return decodeURIComponent(resto.join("="));
  }
  return null;
}
