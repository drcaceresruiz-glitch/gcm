import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    // Mismo alias que tsconfig, para que las pruebas importen igual que la app.
    alias: {
      /*
       * El cliente GENERADO de Prisma no existe para las pruebas, y falla
       * diciendo por que. Ver `test/prisma-generado-prohibido.ts`: el CI corre
       * las pruebas ANTES del build -que es quien lo genera-, asi que una
       * prueba que llegue hasta el pasa en local y revienta el despliegue.
       * Este alias trae ese fallo al puesto de trabajo.
       *
       * VA DELANTE DE `"@"`: Vite compara los alias EN ORDEN y gana el primero
       * que casa. Detras, `"@"` reescribe la ruta a `src/generated/...` y esto
       * no se mira nunca -comprobado con una prueba trampa que paso en verde-.
       */
      "@/generated/prisma/client": fileURLToPath(
        new URL("./test/prisma-generado-prohibido.ts", import.meta.url),
      ),
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
    /**
     * `.tsx` TAMBIEN, aunque hoy no exista ninguna.
     *
     * Estaba solo `.test.ts`, y eso convertia una prueba de componente en algo
     * peor que no tenerla: quien escribiera `Boton.test.tsx` la veria pasar en
     * verde sin que se hubiera ejecutado nada. Es el mismo modo de fallo que el
     * `select` de Prisma que `tsc` no mira —una comprobacion que no puede
     * fallar— y por eso se cierra ahora y no cuando haga falta.
     *
     * OJO: `environment` es `node`, asi que una prueba que toque el DOM fallara
     * pidiendo jsdom. Eso es lo correcto: fallar diciendo que falta el entorno,
     * no callarse. El dia que se prueben componentes, jsdom entra aqui.
     */
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
  },
});
