"use client";

/**
 * Guarda, en el navegador, con que version de GCM se pinto esta pagina.
 *
 * NACE DE UN FALLO REAL, visto el 23 de agosto de 2026. Cada `git push`
 * despliega, y una pestana que lleva un rato abierta se queda con el
 * JavaScript de la version ANTERIOR. Los Server Actions se identifican por un
 * id que cambia en cada compilacion, asi que en cuanto esa pestana intenta
 * guardar algo —anadir una partida, corregir un precio— el servidor no
 * reconoce la accion y la pantalla revienta.
 *
 * El usuario ve «Esta pantalla no se pudo cargar» y cree que rompio algo. No
 * rompio nada: solo tiene que recargar. Pero eso no se puede adivinar, y por
 * eso hace falta poder DEMOSTRARLO en vez de suponerlo.
 *
 * El SHA se guarda en una variable de modulo y no en `window` ni en
 * `sessionStorage`: tiene que morir con la pestana. Guardado, sobreviviria a
 * la recarga que precisamente arregla el problema, y la pantalla seguiria
 * diciendo que hay que recargar despues de haber recargado.
 */

let shaDeLaPagina: string | null = null;

/**
 * Con que version se pinto lo que se esta viendo. `null` en local, donde no
 * hay paquete desplegado y por tanto no hay nada que comparar.
 */
export function shaDeEstaPagina(): string | null {
  return shaDeLaPagina;
}

/**
 * No pinta nada: solo deja constancia de la version.
 *
 * Se asigna durante el render y no en un efecto a proposito. Si esperara a
 * `useEffect`, una accion disparada antes de que el efecto corriera no
 * encontraria el sello y el diagnostico se perderia justo en el caso mas
 * rapido, que es el de alguien que ya sabe donde pulsar.
 */
export function SelloVersion({ sha }: { sha: string | null }) {
  shaDeLaPagina = sha;
  return null;
}
