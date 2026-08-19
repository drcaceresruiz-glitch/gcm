import "server-only";
import { prisma } from "@/lib/prisma";
import { puede } from "@/lib/rbac";
import { motivoSiEmpresaEnMigracion } from "@/services/empresa-migracion.service";
import type { SesionActiva } from "@/services/sesion.service";

/**
 * Formas de pago reutilizables.
 *
 * Son PLANTILLAS DE TEXTO, no calendarios de anticipos. Lo que acaba en la
 * orden es el texto copiado, y alli sigue siendo editable: lo pactado con un
 * proveedor concreto casi siempre tiene un matiz que la plantilla no recoge.
 *
 * Modelar los tramos —porcentaje, condicion, vencimiento— es lo que hara el
 * modulo de abonos, cuando se haya visto como se pagan de verdad. Las tres
 * ordenes analizadas dicen tres cosas distintas: cinco adelantos con
 * condiciones, "60% y saldo contra entrega", y 50/40/10.
 *
 * No tienen permiso propio: las gobierna `orden:leer` y `orden:crear`. Quien
 * redacta ordenes es quien necesita estas plantillas, y anadir un permiso
 * mas a la matriz por algo que nadie va a repartir por separado solo la hace
 * mas larga de leer.
 */

export interface FormaPagoResumen {
  id: string;
  nombre: string;
  texto: string;
  activa: boolean;
}

export type Resultado =
  | { ok: true; id: string }
  | { ok: false; error: string };

export async function listarFormasPago(
  sesion: SesionActiva,
  incluirInactivas = false,
): Promise<FormaPagoResumen[]> {
  if (!puede(sesion, "orden:leer")) return [];

  return prisma.formaPagoPlantilla.findMany({
    where: {
      companyId: sesion.companyId,
      ...(incluirInactivas ? {} : { activa: true }),
    },
    orderBy: { nombre: "asc" },
    select: { id: true, nombre: true, texto: true, activa: true },
  });
}

export interface DatosFormaPago {
  nombre: string;
  texto: string;
}

function validar(datos: DatosFormaPago): string | null {
  if (!datos.nombre.trim()) {
    return "Ponle un nombre corto, que es lo que se ve en el desplegable.";
  }
  if (!datos.texto.trim()) {
    return "Escribe la forma de pago tal como debe salir en la orden.";
  }
  return null;
}

export async function guardarFormaPago(
  sesion: SesionActiva,
  datos: DatosFormaPago,
  formaPagoId?: string,
): Promise<Resultado> {
  if (!puede(sesion, "orden:crear")) {
    return {
      ok: false,
      error: "No tienes permiso para editar las formas de pago.",
    };
  }

  const congelada = await motivoSiEmpresaEnMigracion(sesion.companyId);
  if (congelada) return { ok: false, error: congelada };

  const error = validar(datos);
  if (error) return { ok: false, error };

  const nombre = datos.nombre.trim().slice(0, 100);
  const texto = datos.texto.trim().slice(0, 5000);

  // El nombre repetido se comprueba aqui para poder decirlo con palabras: la
  // clave unica de la base lo cierra igual, pero su mensaje no ayuda a nadie.
  const choque = await prisma.formaPagoPlantilla.findFirst({
    where: {
      companyId: sesion.companyId,
      nombre,
      ...(formaPagoId ? { id: { not: formaPagoId } } : {}),
    },
    select: { id: true },
  });

  if (choque) {
    return { ok: false, error: `Ya hay una forma de pago llamada "${nombre}".` };
  }

  if (formaPagoId) {
    const actual = await prisma.formaPagoPlantilla.findFirst({
      where: { id: formaPagoId, companyId: sesion.companyId },
      select: { id: true, nombre: true, texto: true },
    });
    if (!actual) return { ok: false, error: "Forma de pago no encontrada." };

    await prisma.$transaction(async (tx) => {
      await tx.formaPagoPlantilla.update({
        where: { id: formaPagoId },
        data: { nombre, texto },
      });

      await tx.auditLog.create({
        data: {
          companyId: sesion.companyId,
          userId: sesion.userId,
          entidad: "FormaPagoPlantilla",
          entidadId: formaPagoId,
          accion: "UPDATE",
          antes: { nombre: actual.nombre, texto: actual.texto },
          despues: { nombre, texto },
        },
      });
    });

    return { ok: true, id: formaPagoId };
  }

  const creada = await prisma.$transaction(async (tx) => {
    const forma = await tx.formaPagoPlantilla.create({
      data: { companyId: sesion.companyId, nombre, texto },
      select: { id: true },
    });

    await tx.auditLog.create({
      data: {
        companyId: sesion.companyId,
        userId: sesion.userId,
        entidad: "FormaPagoPlantilla",
        entidadId: forma.id,
        accion: "CREATE",
        despues: { nombre, texto },
      },
    });

    return forma;
  });

  return { ok: true, id: creada.id };
}

/**
 * Activa o desactiva una plantilla. No se borra: las ordenes que la usaron
 * guardan su propio texto copiado, asi que borrarla no las cambiaria, pero
 * si perderia el rastro de por que media obra dice lo mismo.
 */
export async function cambiarEstadoFormaPago(
  sesion: SesionActiva,
  formaPagoId: string,
  activa: boolean,
): Promise<Resultado> {
  if (!puede(sesion, "orden:crear")) {
    return {
      ok: false,
      error: "No tienes permiso para editar las formas de pago.",
    };
  }

  const congelada = await motivoSiEmpresaEnMigracion(sesion.companyId);
  if (congelada) return { ok: false, error: congelada };

  const forma = await prisma.formaPagoPlantilla.findFirst({
    where: { id: formaPagoId, companyId: sesion.companyId },
    select: { id: true, nombre: true, activa: true },
  });

  if (!forma) return { ok: false, error: "Forma de pago no encontrada." };
  if (forma.activa === activa) return { ok: true, id: formaPagoId };

  await prisma.$transaction(async (tx) => {
    await tx.formaPagoPlantilla.update({
      where: { id: formaPagoId },
      data: { activa },
    });

    await tx.auditLog.create({
      data: {
        companyId: sesion.companyId,
        userId: sesion.userId,
        entidad: "FormaPagoPlantilla",
        entidadId: formaPagoId,
        accion: "UPDATE",
        antes: { nombre: forma.nombre, activa: forma.activa },
        despues: { nombre: forma.nombre, activa },
      },
    });
  });

  return { ok: true, id: formaPagoId };
}
