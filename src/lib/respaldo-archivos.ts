import "server-only";

import { type Archiver } from "archiver";
import { createReadStream } from "node:fs";
import { access } from "node:fs/promises";
import { join } from "node:path";

import { env } from "@/lib/env";
import type { FilaJson } from "@/lib/respaldo-serializacion";
import type { EntradaZip } from "@/lib/respaldo-manifiesto";

/**
 * Meter en un zip los archivos que viven en disco: fotos y comprobantes.
 *
 * Lo usan el respaldo de UNA obra y la migracion de la empresa ENTERA. Vive
 * aqui y no en uno de los dos porque lo que hace es delicado y silencioso: si
 * cada servicio tuviera su copia, el dia que una de ellas dejara de anotar la
 * entrada en el manifiesto el archivo saldria igual —solo que sin poder
 * comprobarse— y nada avisaria.
 *
 * Tres reglas que se cumplen aqui y en ningun otro sitio:
 *
 * - **No se recalcula la huella.** La columna `hash` guarda el SHA-256 desde
 *   que se subio el archivo. Reusarlo ahorra leer cada archivo dos veces y,
 *   sobre todo, hace que la comprobacion al restaurar sea contra la MISMA
 *   huella que se calculo el dia de la foto.
 * - **Un archivo que falta no aborta nada.** Se omite y la fila sigue
 *   contando quien lo subio, cuando y con que huella.
 * - **`purgadaAt` se respeta.** Con la marca puesta el binario ya no existe
 *   por decision propia. Las filas de galeria no traen la columna, de ahi el
 *   `?? null`: con `undefined !== null` se saltarian TODAS.
 */

/**
 * Como se llama la entrada dentro de su carpeta.
 *
 * `solo-archivo` para el respaldo de UNA obra: todo lo de dentro es de esa
 * obra y el nombre corto se lee mejor al abrir el zip.
 *
 * `ruta-completa` para la migracion, y no es cosmetico: alli caben las fotos
 * de treinta obras en la misma carpeta, y dos archivos distintos con el mismo
 * nombre de fichero se pisarian uno a otro dentro del zip. El que perdiera no
 * daria error: llegaria a destino con el contenido del otro.
 */
export type FormaDelNombre = "solo-archivo" | "ruta-completa";

export async function adjuntarArchivos(
  zip: Archiver,
  filas: readonly FilaJson[],
  entradas: EntradaZip[],
  carpeta: "evidencia" | "galeria" | "comprobantes",
  forma: FormaDelNombre = "solo-archivo",
): Promise<number> {
  let puestas = 0;

  for (const fila of filas) {
    const ruta = typeof fila.ruta === "string" ? fila.ruta : null;
    const id = typeof fila.id === "string" ? fila.id : null;
    const hash = typeof fila.hash === "string" ? fila.hash : "";
    const tamano = typeof fila.tamano === "number" ? fila.tamano : 0;
    if (!ruta || !id || (fila.purgadaAt ?? null) !== null) continue;

    const absoluta = join(env.STORAGE_ROOT, ruta);
    try {
      await access(absoluta);
    } catch {
      continue;
    }

    const dentro =
      forma === "ruta-completa" ? ruta : (ruta.split("/").pop() ?? id);
    const nombre = `${carpeta}/${dentro}`;

    zip.append(createReadStream(absoluta), { name: nombre });
    entradas.push({ nombre, bytes: tamano, sha256: hash });
    puestas += 1;
  }

  return puestas;
}
