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

export const PALETAS = ["teal", "azul", "indigo", "ambar", "grafito"] as const;
export type Paleta = (typeof PALETAS)[number];

export const ETIQUETA_TEMA: Record<Tema, string> = {
  auto: "Segun el sistema",
  claro: "Claro",
  oscuro: "Oscuro",
};

export const ETIQUETA_PALETA: Record<Paleta, string> = {
  teal: "Teal",
  azul: "Azul",
  indigo: "Indigo",
  ambar: "Ambar",
  grafito: "Grafito",
};

/**
 * El color con el que se pinta cada muestra del selector.
 *
 * Se repiten aqui los valores de `globals.css` a proposito: la muestra tiene
 * que ensenar el color de una paleta que TODAVIA no esta aplicada, asi que no
 * puede leerlo de `var(--color-marca-500)`, que siempre devolveria el de la
 * paleta activa y pintaria las cinco muestras iguales.
 */
export const MUESTRA_PALETA: Record<Paleta, string> = {
  teal: "oklch(0.62 0.11 195)",
  azul: "oklch(0.55 0.16 250)",
  indigo: "oklch(0.54 0.18 285)",
  ambar: "oklch(0.6 0.15 55)",
  grafito: "oklch(0.48 0.02 240)",
};

/// Claves de `localStorage`. Con el mismo prefijo que el resto de
/// preferencias que ya guarda la aplicacion.
export const CLAVE_TEMA = "gcm:tema";
export const CLAVE_PALETA = "gcm:paleta";

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

  try {
    localStorage.setItem(CLAVE_TEMA, tema);
    localStorage.setItem(CLAVE_PALETA, paleta);
  } catch {
    // Navegacion privada de algunos navegadores. Se aplica igual, aunque no
    // sobreviva a la recarga: es mejor que no hacer nada.
  }

  const oscuroDelSistema =
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-color-scheme: dark)").matches;

  document.documentElement.dataset.tema = temaEfectivo(tema, oscuroDelSistema);
  document.documentElement.dataset.paleta = paleta;
}
