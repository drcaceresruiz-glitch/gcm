import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { PrismaClient } from "@/generated/prisma/client";
import { env, isProduction } from "@/lib/env";

/**
 * Cliente Prisma unico de la aplicacion.
 *
 * Usa el adaptador de MariaDB en lugar del motor compilado en Rust. Esto no
 * es una preferencia de estilo: el binario del motor se compila para un
 * sistema operativo concreto y el del servidor de despliegue no coincide con
 * el de CloudLinux. Con el adaptador el cliente es JavaScript puro y esa
 * clase entera de fallos desaparece.
 *
 * En desarrollo se guarda en globalThis para que la recarga en caliente de
 * Next no abra un pool nuevo en cada cambio hasta agotar las conexiones.
 */
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

function createPrismaClient(): PrismaClient {
  const adapter = new PrismaMariaDb(env.DATABASE_URL, {
    onConnectionError: (err) => {
      console.error("[GCM] Error de conexion con la base de datos:", err.message);
    },
  });

  return new PrismaClient({
    adapter,
    log: isProduction ? ["error", "warn"] : ["error", "warn"],
  });
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (!isProduction) {
  globalForPrisma.prisma = prisma;
}
