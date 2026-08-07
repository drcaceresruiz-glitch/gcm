import "server-only";
import { prisma } from "@/lib/prisma";

export interface EstadoSalud {
  baseDatosConectada: boolean;
  latenciaMs: number;
}

/**
 * Comprobacion de vida del sistema.
 *
 * Ejecuta una consulta real contra la base. Un chequeo que solo responde
 * "ok" sin consultar nada da luz verde aunque la conexion este rota, que es
 * justamente el fallo que interesa detectar tras un despliegue.
 */
export async function verificarSalud(): Promise<EstadoSalud> {
  const inicio = Date.now();

  try {
    await prisma.$queryRaw`SELECT 1`;
    return { baseDatosConectada: true, latenciaMs: Date.now() - inicio };
  } catch {
    return { baseDatosConectada: false, latenciaMs: Date.now() - inicio };
  }
}
