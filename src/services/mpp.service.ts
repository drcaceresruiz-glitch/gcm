import "server-only";
import { spawn } from "node:child_process";
import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { env } from "@/lib/env";

/**
 * Conversion de .mpp a XML con MPXJ, para no obligar a convertir a mano.
 *
 * MS Project guarda en .mpp, que es un formato binario propietario. El
 * importador lee MSPDI (el XML de Project), asi que hasta ahora habia que
 * exportarlo a mano o pasar el .mpp por `scripts/mpp-a-xml.bat`. Esto quita
 * ese paso: se sube el .mpp y el servidor lo convierte.
 *
 * SE PUEDE HACER PORQUE EL SERVIDOR CORRE JAVA. Esta comprobado con el
 * archivo real de 8 MB: 4,48 s con `-Xmx256m`, y 445 KB de salida identica a
 * la conversion local. Cabe de sobra dentro de una peticion web, asi que no
 * hacen falta colas ni procesos en segundo plano.
 *
 * DEGRADA IGUAL QUE EL CORREO. Si no hay Java configurado —en desarrollo no
 * lo hay—, no se rompe nada: se dice que no se admite .mpp y se pide el .xml,
 * que sigue funcionando exactamente igual.
 */

export type ResultadoConversion =
  | { ok: true; xml: ArrayBuffer }
  | { ok: false; error: string };

/**
 * Techo de tiempo del proceso.
 *
 * El archivo real tarda 4,5 s. Treinta segundos deja margen de sobra para uno
 * mayor y sigue estando muy por debajo de lo que aguanta una peticion; sin
 * tope, un archivo corrupto podria dejar un proceso Java colgado ocupando
 * memoria del servidor hasta que alguien lo mire.
 */
const TIEMPO_MAXIMO_MS = 30_000;

/**
 * Techo del XML producido.
 *
 * El .mpp de 8 MB da 445 KB. Sesenta megas es holgadisimo y evita que un
 * archivo preparado para expandirse llene el disco del servidor.
 */
const SALIDA_MAXIMA = 60 * 1024 * 1024;

/** Memoria del proceso Java. Con 256 MB sobra para el archivo real. */
const MEMORIA = "-Xmx256m";

/**
 * La clase de MPXJ que convierte. El paquete es `org.mpxj` desde la version
 * 13; casi toda la documentacion que circula sigue diciendo `net.sf.mpxj`.
 */
const CLASE = "org.mpxj.sample.MpxjConvert";

/** true si el servidor puede convertir .mpp. */
export function puedeConvertirMpp(): boolean {
  return Boolean(env.MPXJ_JAVA && env.MPXJ_HOME);
}

export async function convertirMppAXml(
  contenido: ArrayBuffer,
  nombre: string,
): Promise<ResultadoConversion> {
  if (!env.MPXJ_JAVA || !env.MPXJ_HOME) {
    return {
      ok: false,
      error:
        "Este servidor no puede convertir archivos .mpp. Exporta el cronograma " +
        "a XML desde MS Project (Archivo > Guardar como > XML) y sube ese archivo.",
    };
  }

  const classpath = await construirClasspath(env.MPXJ_HOME);
  if (classpath === null) {
    return {
      ok: false,
      error: "La conversion de .mpp no esta bien configurada en el servidor.",
    };
  }

  // Directorio propio por conversion: dos importaciones a la vez no pueden
  // pisarse el archivo, y borrar la carpeta entera al final no deja restos.
  const trabajo = await mkdtemp(join(tmpdir(), "gcm-mpp-"));

  // Nombres fijos: el del usuario no toca el sistema de archivos ni siquiera
  // como nombre de un temporal.
  const entrada = join(trabajo, "entrada.mpp");
  const salida = join(trabajo, "salida.xml");

  try {
    await writeFile(entrada, Buffer.from(contenido));

    const codigo = await ejecutar(env.MPXJ_JAVA, [
      MEMORIA,
      "-cp",
      classpath,
      CLASE,
      entrada,
      salida,
    ]);

    if (codigo !== 0) {
      // Sin el detalle del proceso: un archivo corrupto no debe revelar rutas
      // del servidor ni trazas de la libreria.
      return {
        ok: false,
        error:
          `No se pudo convertir "${nombre}". Comprueba que sea un archivo de ` +
          "MS Project valido, o exportalo a XML y sube ese.",
      };
    }

    const xml = await readFile(salida);

    if (xml.byteLength === 0) {
      return { ok: false, error: `La conversion de "${nombre}" salio vacia.` };
    }
    if (xml.byteLength > SALIDA_MAXIMA) {
      return { ok: false, error: "El cronograma convertido es demasiado grande." };
    }

    return {
      ok: true,
      xml: xml.buffer.slice(
        xml.byteOffset,
        xml.byteOffset + xml.byteLength,
      ) as ArrayBuffer,
    };
  } catch {
    return {
      ok: false,
      error: `No se pudo convertir "${nombre}". Prueba a exportarlo a XML desde MS Project.`,
    };
  } finally {
    // Pase lo que pase. Un temporal de 8 MB por importacion acabaria llenando
    // el disco del servidor sin que nadie lo note.
    await rm(trabajo, { recursive: true, force: true }).catch(() => {});
  }
}

/**
 * Lanza el proceso y espera a que termine.
 *
 * `spawn` con la lista de argumentos y SIN shell. Con shell, un nombre de
 * archivo con comillas o punto y coma seria una inyeccion de comandos; asi
 * los argumentos van tal cual al proceso y no los interpreta nadie.
 */
function ejecutar(programa: string, argumentos: string[]): Promise<number> {
  return new Promise((resolver, rechazar) => {
    const proceso = spawn(programa, argumentos, {
      shell: false,
      stdio: "ignore",
      timeout: TIEMPO_MAXIMO_MS,
    });

    proceso.on("error", rechazar);
    proceso.on("close", (codigo, senal) => {
      // Matado por el tope de tiempo: no es un exito con codigo raro.
      if (senal) rechazar(new Error("La conversion tardo demasiado."));
      else resolver(codigo ?? 1);
    });
  });
}

/**
 * El classpath con todos los JAR de MPXJ.
 *
 * Se listan aqui en vez de con `find ... | tr` para no pasar por un shell.
 * Son 32 archivos, asi que enumerarlos cuesta nada.
 */
async function construirClasspath(raiz: string): Promise<string | null> {
  try {
    const entradas = await readdir(raiz, { withFileTypes: true, recursive: true });

    const jars = entradas
      .filter((e) => e.isFile() && e.name.toLowerCase().endsWith(".jar"))
      .map((e) => join(e.parentPath ?? raiz, e.name));

    if (jars.length === 0) return null;

    // El separador del classpath es ":" en Unix y ";" en Windows.
    return jars.join(process.platform === "win32" ? ";" : ":");
  } catch {
    return null;
  }
}
