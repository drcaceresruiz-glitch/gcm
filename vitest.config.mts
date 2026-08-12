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
    include: ["src/**/*.test.ts"],
  },
});
