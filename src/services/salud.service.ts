import "server-only";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { prisma } from "@/lib/prisma";

export interface EstadoSalud {
  baseDatosConectada: boolean;
  latenciaMs: number;
  /**
   * Hay un paquete subido que nadie ha aplicado.
   *
   * Quiere decir que **esta version NO es la ultima**: el despliegue llego al
   * servidor y sigue ahi esperando. Se mira porque es exactamente el fallo
   * que mas tiempo ha costado: la Action en verde, la web respondiendo 200 y
   * codigo viejo corriendo, sin nada que lo delatara. El 12 de agosto se
   * perdio una hora deduciendolo de fechas de archivos.
   *
   * Lo aplica `desplegar.sh` desde un cron cada minuto, asi que ver esto en
   * true durante mas de un par de minutos significa que el cron no existe o
   * esta fallando; en `tmp/despliegue.log` esta el porque.
   */
  desplieguePendiente: boolean;
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
  const desplieguePendiente = hayPaqueteSinAplicar();

  try {
    await prisma.$queryRaw`SELECT 1`;
    return {
      baseDatosConectada: true,
      latenciaMs: Date.now() - inicio,
      desplieguePendiente,
    };
  } catch {
    return {
      baseDatosConectada: false,
      latenciaMs: Date.now() - inicio,
      desplieguePendiente,
    };
  }
}

/**
 * Si queda un paquete de despliegue por aplicar.
 *
 * `gcm.tar.gz` es uno recien subido; `.desplegando` es uno que se empezo a
 * aplicar y se quedo a medias, que es peor y por eso cuenta igual.
 *
 * Se busca junto al proceso, que en el servidor es la raiz de la aplicacion.
 * En desarrollo no existe ninguno de los dos y esto sale siempre false, que
 * es lo correcto: en local no hay despliegue que aplicar.
 */
function hayPaqueteSinAplicar(): boolean {
  const raiz = process.cwd();

  return ["gcm.tar.gz", "gcm.tar.gz.desplegando"].some((nombre) =>
    existsSync(join(raiz, nombre)),
  );
}
