import coreWebVitals from "eslint-config-next/core-web-vitals";
import typescriptConfig from "eslint-config-next/typescript";

/**
 * Configuracion plana de ESLint.
 *
 * Next 16 publica sus configuraciones ya en formato plano, asi que no hace
 * falta el puente `FlatCompat` del formato antiguo.
 */
const eslintConfig = [
  ...coreWebVitals,
  ...typescriptConfig,

  {
    // El cliente Prisma es codigo generado: no se audita.
    ignores: [
      "src/generated/**",
      ".next/**",
      "node_modules/**",
      "next-env.d.ts",
      // Los worktrees de trabajo son COPIAS enteras del repo. Sin esta linea
      // cada fichero se audita dos veces y, peor, una rama ajena en curso
      // puede tumbar el lint de main sin que nadie haya tocado main. Git ya
      // los ignora (.gitignore linea 107); esto es lo mismo para ESLint.
      ".claude/**",
    ],
  },

  {
    files: ["src/**/*.{ts,tsx}"],
    rules: {
      /**
       * El guion bajo delante marca «este parametro existe por la firma, no
       * porque haga falta».
       *
       * Es el convenio que ya usaba todo el proyecto —`_previo` en cada
       * accion de servidor— pero sin declararlo: la regla solo avisa del
       * ULTIMO parametro sin usar, asi que colaba mientras hubiera otro
       * detras. Una accion que no recibe formulario lo destapo. Declararlo
       * es preferible a inventarle un uso al parametro o a sembrar
       * `eslint-disable` sueltos.
       */
      "@typescript-eslint/no-unused-vars": [
        "warn",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],
      /**
       * Regla de arquitectura: los componentes no importan Prisma
       * directamente. Todo acceso a datos pasa por src/services, que es
       * donde se verifican permisos y se filtra por empresa. Sin esta
       * barrera, un descuido en un componente puede filtrar datos de otra
       * empresa sin que nadie lo note en revision.
       */
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@/generated/prisma/client", "@/lib/prisma"],
              message:
                "No importes Prisma directamente. Usa un servicio de src/services/.",
            },
          ],
        },
      ],
    },
  },

  {
    // La capa de datos y los servicios si pueden usar Prisma.
    files: ["src/services/**", "src/lib/prisma.ts"],
    rules: { "no-restricted-imports": "off" },
  },

  {
    /**
     * Segunda mitad de la regla de arriba: los componentes tampoco importan
     * un SERVICIO como valor.
     *
     * La regla anterior cierra la puerta directa —`@/lib/prisma`— pero deja
     * abierta la de al lado: un componente que importe `@/services/algo`
     * arrastra Prisma igual, solo que a traves del servicio. Lo unico que lo
     * impedia era `import "server-only"` dentro de cada servicio, y el
     * 19/08/2026 faltaba en cinco de los ochenta y uno —entre ellos
     * `meta.service`, que es el margen de la obra—. Una puerta que esta en
     * setenta y seis sitios y falta en cinco no es una puerta.
     *
     * `allowTypeImports` porque los tipos SI: una veintena de componentes
     * importan `ResumenOrden`, `ComparacionMeta` y demas con `import type`,
     * que TypeScript borra al compilar y nunca llega al navegador. Es la
     * forma correcta de compartir la forma del dato sin arrastrar el codigo
     * que lo lee. Lo que esta regla persigue es justo el dia que a alguien se
     * le caiga la palabra `type`.
     *
     * Va DESPUES del bloque general a proposito: pisa su `no-restricted-imports`
     * y por eso repite aqui el veto a Prisma, que si no se perderia.
     */
    files: ["src/components/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": "off",
      "@typescript-eslint/no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@/generated/prisma/client", "@/lib/prisma"],
              message:
                "No importes Prisma directamente. Usa un servicio de src/services/.",
            },
            {
              group: ["@/services/*", "@/services/**"],
              allowTypeImports: true,
              message:
                "Un componente no ejecuta un servicio: recibe sus datos ya resueltos desde la pagina. Solo se admite `import type`.",
            },
          ],
        },
      ],
    },
  },

  {
    /**
     * Scripts que se ejecutan EN EL SERVIDOR, con el Node de cPanel y sin
     * dependencias de desarrollo. Van en JavaScript plano y CommonJS a
     * proposito: alli no hay `tsx` que compile TypeScript, y el paquete
     * desplegado tampoco es un modulo ES. `require` es lo correcto aqui.
     */
    files: ["scripts/**/*.js"],
    rules: { "@typescript-eslint/no-require-imports": "off" },
  },
];

export default eslintConfig;
