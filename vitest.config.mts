import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    // Mismo alias que tsconfig, para que las pruebas importen igual que la app.
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      // Ver test/server-only-vacio.ts: sin esto, la capa de servicios no se
      // puede importar desde una prueba.
      "server-only": fileURLToPath(
        new URL("./test/server-only-vacio.ts", import.meta.url),
      ),
    },
  },
  test: {
    environment: "node",
    // Valores FALSOS y suficientes para que los modulos CARGUEN.
    //
    // Varios servicios validan el entorno al importarse (src/lib/env.ts), asi
    // que sin esto no se pueden ni abrir desde una prueba. No se conecta a
    // nada: donde hace falta Prisma, va doblado.
    env: {
      DATABASE_URL: "mysql://prueba:prueba@localhost:3306/prueba",
      APP_SECRET: "secreto-de-prueba-sin-ningun-valor-0123456789abcdef",
    },
    include: ["src/**/*.test.ts"],
  },
});
