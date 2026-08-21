import "server-only";
import { prisma } from "@/lib/prisma";
import { puede } from "@/lib/rbac";
import type { SesionActiva } from "@/services/sesion.service";

/**
 * Los datos de la propia empresa.
 *
 * Existian en la base desde el principio pero no habia donde tocarlos: se
 * escribian una vez al crear la empresa y ahi se quedaban. Hacen falta ahora
 * porque son los que encabezan y firman las ordenes que se le mandan al
 * proveedor, y un documento que sale a un tercero con el telefono viejo es un
 * problema de verdad.
 *
 * El RUC NO se edita aqui a proposito. Es la identidad fiscal de la empresa,
 * es unico en la base y ya figura impreso en las ordenes emitidas; cambiarlo
 * desde una pantalla de ajustes reescribiria en silencio documentos ya
 * enviados. Si estuviera mal, es una correccion de datos, no un ajuste.
 */

export interface DatosEmpresa {
  razonSocial: string;
  ruc: string;
  direccion: string | null;
  telefono: string | null;
  email: string | null;
  representanteLegal: string | null;
  cargoRepresentante: string | null;
  observacionesOrden: string | null;
}

export type Resultado = { ok: true } | { ok: false; error: string };

export async function obtenerEmpresa(
  sesion: SesionActiva,
): Promise<DatosEmpresa | null> {
  if (!puede(sesion, "empresa:leer")) return null;

  return prisma.company.findUnique({
    where: { id: sesion.companyId },
    select: {
      razonSocial: true,
      ruc: true,
      direccion: true,
      telefono: true,
      email: true,
      representanteLegal: true,
      cargoRepresentante: true,
      observacionesOrden: true,
    },
  });
}

/** Lo que llega del formulario. El RUC no viaja: no se edita. */
export type CambiosEmpresa = Omit<DatosEmpresa, "ruc">;

/** Vacio y ausente son lo mismo en estos campos: ninguno es obligatorio. */
function opcional(valor: string | null): string | null {
  const limpio = (valor ?? "").trim();
  return limpio === "" ? null : limpio;
}

export async function actualizarEmpresa(
  sesion: SesionActiva,
  cambios: CambiosEmpresa,
): Promise<Resultado> {
  if (!puede(sesion, "empresa:editar")) {
    return { ok: false, error: "No tienes permiso para editar la empresa." };
  }

  const razonSocial = cambios.razonSocial.trim();
  if (!razonSocial) {
    return { ok: false, error: "La razon social no puede quedar vacia." };
  }

  await prisma.company.update({
    where: { id: sesion.companyId },
    data: {
      razonSocial,
      direccion: opcional(cambios.direccion),
      telefono: opcional(cambios.telefono),
      email: opcional(cambios.email),
      representanteLegal: opcional(cambios.representanteLegal),
      cargoRepresentante: opcional(cambios.cargoRepresentante),
      observacionesOrden: opcional(cambios.observacionesOrden),
    },
  });

  return { ok: true };
}

/**
 * Enciende o apaga la vista previa de roles para toda la empresa.
 *
 * Misma frontera que el resto de `/empresa/configuracion`: es
 * `configuracion:editar`, innegociable, ADMIN siempre. No es la frontera de
 * seguridad de la vista previa en si —esa la pone la interseccion de
 * `@/lib/vista-rol`—, solo decide si el control existe.
 */
export async function cambiarVistaPreviaRoles(
  sesion: SesionActiva,
  activar: boolean,
): Promise<Resultado> {
  if (!puede(sesion, "configuracion:editar")) {
    return { ok: false, error: "No tienes permiso para cambiar esto." };
  }

  await prisma.company.update({
    where: { id: sesion.companyId },
    data: { permitirVistaPreviaRoles: activar },
  });

  return { ok: true };
}
