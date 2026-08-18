/**
 * Prueba de humo: abre TODAS las pantallas y avisa si alguna revienta.
 *
 * Uso, con el servidor de desarrollo levantado:
 *
 *     npm run dev
 *     npx tsx scripts/humo.ts
 *
 * Contra otro sitio:  npx tsx scripts/humo.ts --base http://localhost:3001
 *
 * POR QUE EXISTE, medido el 18/08/2026. Ese dia salieron tres fallos en
 * produccion o a punto de llegar a ella, los tres de la misma forma: una
 * consulta de Prisma que nombraba un campo inexistente
 * —`Project.nombre` en vez de `nombreObra`, `Cronograma.vigente` que no
 * existe—. Uno de ellos llevaba un dia entero tumbando la pantalla de nuevo
 * encargo en produccion.
 *
 * NINGUNO lo vio nada de lo que ya habia:
 *
 * - `tsc` no los ve. Comprobado con un experimento: el `select` y el `where`
 *   de Prisma en este proyecto NO rechazan claves desconocidas, y un control
 *   con un error de tipos evidente en el mismo archivo SI salta. Es decir,
 *   no es que el archivo no se mirara: es que esos errores son invisibles
 *   para el compilador.
 * - Las 1.559 pruebas tampoco. Viven casi todas en `lib/` —logica pura— y
 *   59 de los 63 servicios no tienen ni una. Los fallos estaban en servicios.
 *
 * Prisma solo valida la consulta cuando la ejecuta. Asi que la unica forma de
 * cazarlos es EJECUTARLAS: abrir cada pantalla contra una base de verdad.
 *
 * Lo que hace y lo que no:
 *
 * - Descubre las rutas del arbol de `src/app`, no de una lista escrita a
 *   mano. Una pantalla nueva entra sola; una lista habria que acordarse de
 *   actualizarla, y el dia que no se haga es el dia que se rompe.
 * - Rellena los tramos dinamicos con ids REALES de la base.
 * - Falla solo con 5xx. Un 404 o un 403 son respuestas, no averias.
 * - NO comprueba que la pantalla diga lo correcto. Comprueba que responde.
 *   Es una prueba de humo, no de aceptacion, y conviene no confundirlas.
 */
import "dotenv/config";
import { createHash, randomBytes } from "node:crypto";
import { readdirSync } from "node:fs";
import { join, relative, sep } from "node:path";

import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { PrismaClient } from "../src/generated/prisma/client";

const prisma = new PrismaClient({
  adapter: new PrismaMariaDb(process.env["DATABASE_URL"]!),
});

const RAIZ_APP = join(process.cwd(), "src", "app");

/// Cuantas peticiones a la vez. En desarrollo cada ruta se compila la primera
/// vez que se pide, asi que de una en una esto tarda minutos. Cuatro va
/// holgado sin ahogar al servidor.
const EN_PARALELO = 4;

/// Tope por peticion. Una pantalla que tarda mas de esto ya es un problema,
/// aunque acabe respondiendo.
const TOPE_MS = 30_000;

interface Ruta {
  /// La ruta tal cual, con sus tramos dinamicos: `/obras/[id]/tablero`.
  patron: string;
  /// Ya resuelta con ids de verdad, o null si no se pudo.
  url: string | null;
  /// Por que no se pudo resolver. Se ENSEÑA: una ruta saltada en silencio
  /// se lee como una ruta que paso.
  omitida?: string;
  /// Las de `(auth)`, `(pase)` y `(publico)` se piden SIN sesion: son las
  /// puertas de fuera, y entrar con sesion no prueba lo que ve un extraño.
  conSesion: boolean;
}

/** Recorre `src/app` y devuelve cada `page.tsx` y cada `route.ts`. */
function descubrirRutas(): { patron: string; grupo: string }[] {
  const encontradas: { patron: string; grupo: string }[] = [];

  function recorrer(dir: string) {
    for (const entrada of readdirSync(dir, { withFileTypes: true })) {
      const completo = join(dir, entrada.name);

      if (entrada.isDirectory()) {
        recorrer(completo);
        continue;
      }

      if (entrada.name !== "page.tsx" && entrada.name !== "route.ts") continue;

      const tramos = relative(RAIZ_APP, dir).split(sep).filter(Boolean);
      // Los grupos `(dashboard)` no salen en la URL, pero dicen si la pantalla
      // vive detras del login.
      const grupo = tramos.find((t) => t.startsWith("(")) ?? "";
      const patron = "/" + tramos.filter((t) => !t.startsWith("(")).join("/");

      encontradas.push({ patron: patron === "/" ? "/" : patron, grupo });
    }
  }

  recorrer(RAIZ_APP);
  return encontradas.sort((a, b) => a.patron.localeCompare(b.patron));
}

/** Un id de verdad para cada tramo dinamico, sacado de la base. */
async function idsReales(): Promise<Record<string, string | null>> {
  const [obra, proveedor, encargo, plan, orden, galeria] = await Promise.all([
    prisma.project.findFirst({ select: { id: true }, orderBy: { createdAt: "asc" } }),
    prisma.proveedor.findFirst({ select: { id: true } }),
    prisma.encargoProveedor.findFirst({ select: { id: true } }),
    prisma.planSemanal.findFirst({ select: { id: true } }),
    prisma.ordenCompra.findFirst({ select: { id: true } }),
    prisma.galeriaObra.findFirst({ select: { slug: true } }),
  ]);

  return {
    "[id]": obra?.id ?? null,
    "[obraId]": obra?.id ?? null,
    "[proveedorId]": proveedor?.id ?? null,
    "[encargoId]": encargo?.id ?? null,
    "[planId]": plan?.id ?? null,
    "[ordenId]": orden?.id ?? null,
    "[slug]": galeria?.slug ?? null,
    // A proposito uno inventado: lo que se comprueba es que la pantalla diga
    // «este enlace ya no vale» en vez de reventar. Un token valido no se
    // puede fabricar sin pedir una recuperacion de verdad.
    "[token]": "token-que-no-existe-de-prueba",
  };
}

function resolver(
  patron: string,
  grupo: string,
  ids: Record<string, string | null>,
): Ruta {
  // `(auth)`, `(pase)` y `(publico)` son las puertas de fuera.
  const conSesion = grupo === "(dashboard)" || grupo === "";

  const faltan: string[] = [];
  const url = patron.replace(/\[[^\]]+\]/g, (tramo) => {
    const valor = ids[tramo];
    if (!valor) {
      faltan.push(tramo);
      return tramo;
    }
    return valor;
  });

  if (faltan.length > 0) {
    return {
      patron,
      url: null,
      conSesion,
      omitida: `no hay ${faltan.join(", ")} en la base`,
    };
  }

  return { patron, url, conSesion };
}

interface Resultado {
  ruta: Ruta;
  estado: number | null;
  ms: number;
  detalle?: string;
}

/**
 * Si el cuerpo trae un error de servidor, aunque la respuesta venga con 200.
 *
 * **EL CODIGO DE ESTADO NO BASTA, Y ESTO ES LO QUE HACE UTIL A ESTA PRUEBA.**
 * Comprobado el 18/08 reintroduciendo a proposito el fallo de
 * `Cronograma.vigente`: la pantalla de nuevo encargo devolvia **HTTP 200**
 * con la cabecera y el titulo pintados, y el formulario simplemente no
 * estaba. El servidor registraba el error, el navegador enseñaba «This page
 * couldn't load», y por HTTP todo parecia sano. Una prueba que solo mirara
 * el 200 habria dado verde sobre una pantalla rota, que es peor que no tener
 * prueba.
 *
 * La razon es el streaming: React manda la cascara, y si un componente de
 * servidor revienta despues, el fallo viaja DENTRO del payload en vez de en
 * la cabecera HTTP. Ahi se serializa como una fila de error —`NN:E{"digest"…`—
 * y ese es el marcador que se busca.
 *
 * Contrastado con paginas sanas: `/panel`, `/empresa/proveedores` y la lista
 * de encargos traen CERO apariciones. La rota, una.
 */
function errorEnElCuerpo(cuerpo: string): string | undefined {
  // La fila de error del payload de React, escapada o sin escapar segun donde
  // caiga dentro del HTML. Se captura el DIGEST, no solo su presencia.
  const fila = /\d+:E\{\\?"digest\\?":\\?"([^"\\]*)/.exec(cuerpo);

  if (fila) {
    const digest = fila[1] ?? "";

    // `NEXT_REDIRECT` y `NEXT_HTTP_ERROR_FALLBACK` NO son averias: asi es como
    // Next implementa `redirect()` y `notFound()` —lanzando— y viajan por el
    // mismo carril que un error de verdad.
    //
    // Sin este filtro la prueba daba SIETE rotas donde habia dos: marcaba la
    // portada, el login y toda pantalla que redirige por falta de permiso.
    // Una prueba que grita en lo que funciona se acaba ignorando, y entonces
    // tampoco avisa de lo que no.
    if (!digest.startsWith("NEXT_")) {
      const nombre = /\\?"name\\?":\\?"([A-Za-z]+)\\?"/.exec(cuerpo.slice(fila.index));
      return `revento al renderizar${nombre ? `: ${nombre[1]}` : ""} (llego con 200, el fallo va dentro del stream)`;
    }
  }

  // El texto que ve una persona cuando pasa lo de arriba. Va aparte por si
  // algun dia cambia el formato del payload: dos redes, no una.
  if (/A server error occurred|This page could.?n.?t load/i.test(cuerpo)) {
    return "el cuerpo trae el aviso de error de servidor de Next";
  }

  return undefined;
}

async function pedir(ruta: Ruta, base: string, cookie: string): Promise<Resultado> {
  const arranque = Date.now();
  const control = new AbortController();
  const reloj = setTimeout(() => control.abort(), TOPE_MS);

  try {
    const r = await fetch(base + ruta.url, {
      // Manual: un 307 al login es una RESPUESTA y hay que verla. Siguiendola
      // se veria el login con 200 y parecerian todas bien.
      redirect: "manual",
      headers: ruta.conSesion ? { cookie } : {},
      signal: control.signal,
    });

    const cuerpo = await r.text();
    const error = errorEnElCuerpo(cuerpo);

    return {
      ruta,
      estado: r.status,
      ms: Date.now() - arranque,
      detalle: error,
    };
  } catch (e) {
    return {
      ruta,
      estado: null,
      ms: Date.now() - arranque,
      detalle: e instanceof Error ? e.message : String(e),
    };
  } finally {
    clearTimeout(reloj);
  }
}

async function main() {
  const argumentos = process.argv.slice(2);
  const iBase = argumentos.indexOf("--base");
  const base = iBase >= 0 ? argumentos[iBase + 1]! : "http://localhost:3000";

  const url = process.env["DATABASE_URL"] ?? "";
  if (!url.includes("127.0.0.1") && !url.includes("localhost")) {
    throw new Error(
      "Esto abre una sesion en la base a la que apunte DATABASE_URL. Solo contra la local.",
    );
  }

  const usuario = await prisma.user.findFirstOrThrow({
    where: { estado: "ACTIVO" },
    select: { id: true, email: true },
  });

  // La misma fila que escribe `iniciarSesion` despues de validar la clave.
  // Asi no hay que manejar ninguna contrasena.
  const token = randomBytes(32).toString("base64url");
  const sesion = await prisma.session.create({
    data: {
      userId: usuario.id,
      tokenHash: createHash("sha256").update(token).digest("hex"),
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    },
    select: { id: true },
  });

  try {
    const ids = await idsReales();
    const rutas = descubrirRutas().map((r) => resolver(r.patron, r.grupo, ids));

    const porPedir = rutas.filter((r) => r.url !== null);
    const omitidas = rutas.filter((r) => r.url === null);

    console.log(`Sesion de ${usuario.email} · ${base}`);
    console.log(`${rutas.length} rutas descubiertas, ${porPedir.length} por pedir\n`);

    const cookie = `gcm_sesion=${token}`;
    const resultados: Resultado[] = [];

    // Tanda a tanda, para no lanzar sesenta peticiones de golpe.
    for (let i = 0; i < porPedir.length; i += EN_PARALELO) {
      const tanda = porPedir.slice(i, i + EN_PARALELO);
      resultados.push(...(await Promise.all(tanda.map((r) => pedir(r, base, cookie)))));
    }

    const rotas = resultados.filter(
      (r) => r.estado === null || r.estado >= 500 || r.detalle !== undefined,
    );

    for (const r of resultados.sort((a, b) => b.ms - a.ms)) {
      const rota = rotas.includes(r);
      const marca = rota ? "ROTA " : "  ok ";
      const estado = r.estado === null ? "sin respuesta" : String(r.estado);
      console.log(
        `${marca} ${estado.padEnd(13)} ${String(r.ms).padStart(6)} ms  ${r.ruta.patron}` +
          (r.detalle ? `\n         ${r.detalle}` : ""),
      );
    }

    // Las omitidas se ENSEÑAN. Una ruta que no se probo no es una ruta que
    // pasó, y callarlas convierte esto en una prueba que miente.
    if (omitidas.length > 0) {
      console.log(`\nSin probar (${omitidas.length}):`);
      for (const o of omitidas) console.log(`  ${o.patron} — ${o.omitida}`);
      console.log(
        "  Siembra la base para cubrirlas: npx tsx scripts/sembrar-obra-ejemplo.ts",
      );
    }

    console.log(
      `\n${resultados.length - rotas.length} de ${resultados.length} respondieron.`,
    );

    if (rotas.length > 0) {
      console.log(`${rotas.length} ROTAS.`);
      process.exitCode = 1;
    }
  } finally {
    // La sesion de prueba no se queda viva.
    await prisma.session.delete({ where: { id: sesion.id } }).catch(() => {});
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
