import "server-only";
import { prisma } from "@/lib/prisma";
import { puede } from "@/lib/rbac";
import type { SesionActiva } from "@/services/sesion.service";
import type { OrigenRegistro } from "@/generated/prisma/enums";

/**
 * Catalogo de proveedores de la empresa.
 *
 * El RUC es la identidad, y es unico por empresa. No es un detalle
 * administrativo: es la clave que impide que el mismo proveedor entre dos
 * veces, tecleado una y cargado de un archivo la otra. Que las dos vias no se
 * pisen se cierra AQUI y en la base, no en la pantalla.
 *
 * Un proveedor no se borra nunca, se desactiva: sus ordenes son historia de
 * la obra y tienen que seguir diciendo a quien se le compro.
 */

/** 11 digitos. Los de empresa empiezan por 20 y los de persona natural por 10. */
const RUC = /^\d{11}$/;

export interface ProveedorResumen {
  id: string;
  razonSocial: string;
  ruc: string;
  contactoNombre: string | null;
  contactoTelefono: string | null;
  email: string | null;
  cuentaBancaria: string | null;
  cci: string | null;
  activo: boolean;
  origen: OrigenRegistro;
  /// Cuantas ordenes tiene. Se ensena para que nadie desactive a ciegas a
  /// quien lleva media obra.
  totalOrdenes: number;
}

export type Resultado =
  | { ok: true; id: string }
  | { ok: false; error: string };

export async function listarProveedores(
  sesion: SesionActiva,
  incluirInactivos = false,
): Promise<ProveedorResumen[]> {
  if (!puede(sesion, "proveedor:leer")) return [];

  const filas = await prisma.proveedor.findMany({
    where: {
      companyId: sesion.companyId,
      ...(incluirInactivos ? {} : { activo: true }),
    },
    orderBy: { razonSocial: "asc" },
    select: {
      id: true,
      razonSocial: true,
      ruc: true,
      contactoNombre: true,
      contactoTelefono: true,
      email: true,
      cuentaBancaria: true,
      cci: true,
      activo: true,
      origen: true,
      _count: { select: { ordenes: true } },
    },
  });

  return filas.map(({ _count, ...p }) => ({
    ...p,
    totalOrdenes: _count.ordenes,
  }));
}

export interface DatosProveedor {
  razonSocial: string;
  ruc: string;
  contactoNombre?: string;
  contactoTelefono?: string;
  email?: string;
  cuentaBancaria?: string;
  cci?: string;
}

/** Comprobaciones de forma, comunes al alta y a la edicion. */
function validar(datos: DatosProveedor): string | null {
  if (!datos.razonSocial.trim()) {
    return "Indica la razon social o el nombre del proveedor.";
  }

  const ruc = datos.ruc.trim();
  if (!RUC.test(ruc)) {
    return "El RUC son 11 digitos, sin espacios ni guiones.";
  }

  return null;
}

/** Limpia y recorta los campos a lo que aguanta la columna. */
function saneado(datos: DatosProveedor) {
  const opcional = (v: string | undefined, largo: number) =>
    v?.trim() ? v.trim().slice(0, largo) : null;

  return {
    razonSocial: datos.razonSocial.trim().slice(0, 200),
    ruc: datos.ruc.trim(),
    contactoNombre: opcional(datos.contactoNombre, 150),
    contactoTelefono: opcional(datos.contactoTelefono, 30),
    email: opcional(datos.email, 150),
    cuentaBancaria: opcional(datos.cuentaBancaria, 40),
    cci: opcional(datos.cci, 40),
  };
}

export async function crearProveedor(
  sesion: SesionActiva,
  datos: DatosProveedor,
  origen: OrigenRegistro = "MANUAL",
): Promise<Resultado> {
  if (!puede(sesion, "proveedor:crear")) {
    return { ok: false, error: "No tienes permiso para crear proveedores." };
  }

  const error = validar(datos);
  if (error) return { ok: false, error };

  const campos = saneado(datos);

  /**
   * El RUC repetido se comprueba aqui para poder decir A QUIEN pertenece, no
   * solo que choca. Da igual que la clave unica de la base lo cierre tambien:
   * "Ese RUC ya es de FCM INGENIEROS" resuelve el problema y
   * "Unique constraint failed" obliga a ir a buscarlo.
   */
  const existente = await prisma.proveedor.findFirst({
    where: { companyId: sesion.companyId, ruc: campos.ruc },
    select: { razonSocial: true, activo: true },
  });

  if (existente) {
    return {
      ok: false,
      error: existente.activo
        ? `El RUC ${campos.ruc} ya esta dado de alta como "${existente.razonSocial}".`
        : `El RUC ${campos.ruc} pertenece a "${existente.razonSocial}", que esta desactivado. Vuelve a activarlo en vez de crearlo otra vez.`,
    };
  }

  const creado = await prisma.$transaction(async (tx) => {
    const proveedor = await tx.proveedor.create({
      data: { companyId: sesion.companyId, origen, ...campos },
      select: { id: true },
    });

    await tx.auditLog.create({
      data: {
        companyId: sesion.companyId,
        userId: sesion.userId,
        entidad: "Proveedor",
        entidadId: proveedor.id,
        accion: "CREATE",
        despues: { ...campos, origen },
      },
    });

    return proveedor;
  });

  return { ok: true, id: creado.id };
}

export async function editarProveedor(
  sesion: SesionActiva,
  proveedorId: string,
  datos: DatosProveedor,
): Promise<Resultado> {
  if (!puede(sesion, "proveedor:editar")) {
    return { ok: false, error: "No tienes permiso para editar proveedores." };
  }

  const error = validar(datos);
  if (error) return { ok: false, error };

  const campos = saneado(datos);

  // El filtro por empresa sale de la sesion: es lo unico que impide editar
  // el proveedor de otro cliente manipulando el identificador.
  const actual = await prisma.proveedor.findFirst({
    where: { id: proveedorId, companyId: sesion.companyId },
    select: {
      id: true,
      razonSocial: true,
      ruc: true,
      contactoNombre: true,
      contactoTelefono: true,
      email: true,
      cuentaBancaria: true,
      cci: true,
    },
  });

  if (!actual) return { ok: false, error: "Proveedor no encontrado." };

  if (campos.ruc !== actual.ruc) {
    const choque = await prisma.proveedor.findFirst({
      where: {
        companyId: sesion.companyId,
        ruc: campos.ruc,
        id: { not: proveedorId },
      },
      select: { razonSocial: true },
    });

    if (choque) {
      return {
        ok: false,
        error: `El RUC ${campos.ruc} ya es de "${choque.razonSocial}".`,
      };
    }
  }

  await prisma.$transaction(async (tx) => {
    await tx.proveedor.update({ where: { id: proveedorId }, data: campos });

    await tx.auditLog.create({
      data: {
        companyId: sesion.companyId,
        userId: sesion.userId,
        entidad: "Proveedor",
        entidadId: proveedorId,
        accion: "UPDATE",
        antes: { ...actual, id: undefined },
        despues: campos,
      },
    });
  });

  return { ok: true, id: proveedorId };
}

/**
 * Activa o desactiva un proveedor. Nunca se borra.
 *
 * Sus ordenes son historia de la obra y tienen que seguir diciendo a quien se
 * le compro. Desactivar solo lo saca de los desplegables de ordenes nuevas.
 */
export async function cambiarEstadoProveedor(
  sesion: SesionActiva,
  proveedorId: string,
  activo: boolean,
): Promise<Resultado> {
  if (!puede(sesion, "proveedor:editar")) {
    return { ok: false, error: "No tienes permiso para editar proveedores." };
  }

  const proveedor = await prisma.proveedor.findFirst({
    where: { id: proveedorId, companyId: sesion.companyId },
    select: { id: true, activo: true, razonSocial: true },
  });

  if (!proveedor) return { ok: false, error: "Proveedor no encontrado." };
  if (proveedor.activo === activo) return { ok: true, id: proveedorId };

  await prisma.$transaction(async (tx) => {
    await tx.proveedor.update({ where: { id: proveedorId }, data: { activo } });

    await tx.auditLog.create({
      data: {
        companyId: sesion.companyId,
        userId: sesion.userId,
        entidad: "Proveedor",
        entidadId: proveedorId,
        accion: "UPDATE",
        antes: { razonSocial: proveedor.razonSocial, activo: proveedor.activo },
        despues: { razonSocial: proveedor.razonSocial, activo },
      },
    });
  });

  return { ok: true, id: proveedorId };
}
