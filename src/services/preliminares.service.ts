import "server-only";

import { prisma } from "@/lib/prisma";
import type { SesionActiva } from "./sesion.service";

/**
 * Que tiene ya cargado una constructora, y que le falta.
 *
 * DE AQUI SALEN LAS MARCAS DEL LATERAL DEL PANEL, y por eso existe: una
 * constructora que entra por primera vez ve una aplicacion vacia y no sabe por
 * donde empezar. En vez de una pantalla de bienvenida aparte —que se visita
 * una vez y luego estorba—, la guia ES el menu: las mismas entradas de
 * siempre, con una marca en las que ya estan.
 *
 * Se apaga sola. Cuando todo esta cargado, el menu deja de enseñar marcas y
 * vuelve a ser navegacion a secas: una lista de checks verdes permanente es
 * ruido que nadie vuelve a leer.
 *
 * Son cinco `count` con `take: 1` sobre columnas indexadas: se pide en cada
 * carga del panel y no puede costar mas que lo que ya cuesta pintarlo.
 */

export interface Preliminares {
  logo: boolean;
  contratistas: boolean;
  /// Mas de una persona. Con el administrador solo no hay equipo cargado, y
  /// marcarlo como hecho el primer dia haria la guia inutil justo cuando mas
  /// sirve.
  equipo: boolean;
  obras: boolean;
  /// Al menos una obra con presupuesto. Es el paso donde de verdad empieza a
  /// servir GCM, y el que mas se atasca.
  presupuesto: boolean;
  /// Todo lo anterior. Con esto en `true` el lateral deja de marcar nada.
  completo: boolean;
}

export async function preliminaresDeEmpresa(
  sesion: SesionActiva,
): Promise<Preliminares> {
  const [empresa, contratistas, usuarios, obras, partidas] = await Promise.all([
    prisma.company.findUnique({
      where: { id: sesion.companyId },
      select: { logoRuta: true },
    }),
    prisma.proveedor.count({
      where: { companyId: sesion.companyId },
      take: 1,
    }),
    prisma.user.count({
      where: { companyId: sesion.companyId, estado: "ACTIVO" },
      take: 2,
    }),
    prisma.project.count({
      where: { companyId: sesion.companyId },
      take: 1,
    }),
    prisma.wbsItem.count({
      where: { project: { companyId: sesion.companyId }, tipo: "PARTIDA" },
      take: 1,
    }),
  ]);

  const estado = {
    logo: Boolean(empresa?.logoRuta),
    contratistas: contratistas > 0,
    equipo: usuarios > 1,
    obras: obras > 0,
    presupuesto: partidas > 0,
  };

  return {
    ...estado,
    completo: Object.values(estado).every(Boolean),
  };
}
