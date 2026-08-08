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
    ],
  },

  {
    files: ["src/**/*.{ts,tsx}"],
    rules: {
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
