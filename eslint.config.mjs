import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({ baseDirectory: __dirname });

const eslintConfig = [
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    // El cliente Prisma es codigo generado: no se audita.
    ignores: ["src/generated/**", ".next/**", "node_modules/**"],
  },
  {
    rules: {
      // Regla de arquitectura: los componentes nunca importan Prisma
      // directamente. Todo acceso a datos pasa por src/services, que es
      // donde vive la verificacion de permisos y el filtro por empresa.
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
    // Los servicios y la propia capa de datos si pueden usar Prisma.
    files: ["src/services/**", "src/lib/prisma.ts", "prisma/**"],
    rules: { "no-restricted-imports": "off" },
  },
];

export default eslintConfig;
