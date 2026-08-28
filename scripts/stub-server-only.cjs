/* eslint-disable @typescript-eslint/no-require-imports --
 * Este archivo TIENE que ser CommonJS: lo carga `node --require` antes que
 * ningun modulo del proyecto, que es lo unico que permite interceptar la
 * resolucion de `server-only` y dejar el .env puesto a tiempo. Un `import`
 * de ESM se evaluaria despues y no llegaria.
 */
/**
 * Devuelve un modulo vacio para `server-only` y `client-only`.
 *
 * Los servicios de GCM abren con `import "server-only"`, que lanza fuera de un
 * Server Component. Fuera de Next no hay quien lo satisfaga, asi que se
 * intercepta la carga y se devuelve `{}`.
 *
 *   npx tsx --require ./scripts/stub-server-only.cjs scripts/loquesea.ts
 */
const Module = require("node:module");

const cargar = Module._load;
Module._load = function (peticion, padre, esPrincipal) {
  if (peticion === "server-only" || peticion === "client-only") return {};
  return cargar(peticion, padre, esPrincipal);
};

/*
 * Y el `.env`, aqui mismo. Se carga con `--require`, o sea ANTES que ningun
 * modulo del proyecto: `@/lib/prisma` lee `DATABASE_URL` al importarse, asi
 * que hacerlo dentro del script llegaria tarde.
 */
const fs = require("node:fs");
try {
  for (const linea of fs.readFileSync(".env", "utf8").split("\n")) {
    const m = /^([A-Z_]+)=(.*)$/.exec(linea.trim());
    if (m && !process.env[m[1]]) {
      process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  }
} catch {
  // Sin .env el script fallara mas adelante con un mensaje mejor que este.
}
