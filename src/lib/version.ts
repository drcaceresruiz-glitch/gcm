import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Que version de GCM esta corriendo, dicho de forma que no pueda mentir.
 *
 * NACE DE UN FALLO MEDIDO: el pie de pagina llevaba una constante escrita a
 * mano —`const VERSION = "0.1.0"`— con un comentario que decia «se toca a
 * mano al publicar». En 473 commits no se toco NI UNA vez, asi que el pie
 * anuncio la version del andamio de Next mientras la aplicacion llevaba
 * meses en produccion con obras reales encima.
 *
 * La leccion es la de siempre en este proyecto: **un dato que hay que
 * acordarse de actualizar es un recordatorio disfrazado de hecho**. La unica
 * salida es que salga solo de donde ya vive la verdad.
 *
 * Aqui se juntan las dos mitades, y ninguna se teclea:
 *
 * - **La version del producto** sale de `package.json`, inyectada en tiempo
 *   de compilacion por `next.config.ts`. Una sola fuente: subir el numero en
 *   `package.json` lo cambia en el pie, y no hay segunda copia que olvidar.
 * - **El SHA del paquete** sale del archivo `BUILD_SHA` que el despliegue
 *   mete DENTRO del `gcm.tar.gz`. Es la misma cifra que `/api/health`
 *   responde a la pregunta «que codigo esta vivo», y por eso el pie no puede
 *   contradecir a la comprobacion de salud.
 *
 * El SHA **no se cachea** a proposito, aunque se lea en cada pintado. Durante
 * un despliegue hay una ventana en la que el paquete ya esta extraido y el
 * proceso viejo sigue corriendo; cachearlo la haria invisible, que es
 * justamente lo que `salud.service` existe para poder ver.
 */

/**
 * La version del producto, de `package.json` via `next.config.ts`.
 *
 * El respaldo "0.0.0" no es un valor razonable sino un valor ABSURDO, y esa
 * es su gracia: si algun dia se rompe la inyeccion, el pie dira algo que
 * nadie puede confundir con una version de verdad. Un respaldo verosimil
 * seria otra vez una cifra que miente en silencio.
 */
export const VERSION_APP = process.env["APP_VERSION"] ?? "0.0.0";

/**
 * El SHA que viaja dentro del paquete desplegado, o null.
 *
 * null significa «no se sabe» y pasa en dos sitios legitimos: en local, donde
 * no hay paquete, y en un paquete anterior a que esto existiera.
 */
export function shaDelPaquete(): string | null {
  try {
    const sha = readFileSync(join(process.cwd(), "BUILD_SHA"), "utf8").trim();
    return sha === "" ? null : sha;
  } catch {
    return null;
  }
}

/// Cuantos caracteres del SHA se enseñan. Siete es lo que usa git para los
/// hash cortos y basta para identificar un commit sin llenar el pie.
const CORTO = 7;

/**
 * Como se escribe la version en el pie. Puro: recibe el SHA, no lo busca.
 *
 * Sin paquete dice `dev` y no se calla el hueco: en local la version de
 * `package.json` es real pero no corresponde a nada desplegado, y no decirlo
 * invitaria a leer el pie de un portatil como si fuera el de produccion.
 */
export function formatearVersion(version: string, sha: string | null): string {
  return `v${version} · ${sha ? sha.slice(0, CORTO) : "dev"}`;
}

/** La version lista para pintar, ya con el SHA del paquete que corre. */
export function versionParaMostrar(): string {
  return formatearVersion(VERSION_APP, shaDelPaquete());
}
