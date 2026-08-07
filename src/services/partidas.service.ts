import "server-only";
import { prisma } from "@/lib/prisma";
import { puede } from "@/lib/rbac";
import { normalizarDecimal, multiplicar } from "@/lib/decimal";
import { codigoPadre, calcularProfundidades } from "@/lib/jerarquia-partidas";
import type { SesionActiva } from "@/services/sesion.service";
import type { AuditAction, ModalidadPartida } from "@/generated/prisma/enums";

/**
 * Edicion de partidas.
 *
 * La importacion desde Excel nunca sale perfecta: hay filas con formulas
 * arrastradas, metrados mal tecleados y descripciones a medias. Poder
 * corregirlas dentro del sistema evita el circuito de arreglar el Excel y
 * volver a importar, que ademas obliga a rehacer todo el presupuesto para
 * cambiar una celda.
 */

export type Resultado<T = void> =
  | ({ ok: true } & (T extends void ? object : { datos: T }))
  | { ok: false; error: string };

/** Comprueba que la partida existe, es de la empresa y el presupuesto esta abierto. */
async function contextoEditable(sesion: SesionActiva, partidaId: string) {
  const partida = await prisma.wbsItem.findFirst({
    // El filtro por empresa sale de la sesion: sin esto, cambiar el id en la
    // peticion permitiria editar el presupuesto de otro cliente.
    where: { id: partidaId, project: { companyId: sesion.companyId } },
    select: {
      id: true,
      projectId: true,
      codigoPartida: true,
      descripcion: true,
      unidad: true,
      metrado: true,
      precioUnitario: true,
      parcial: true,
      tipo: true,
      modalidad: true,
    },
  });

  if (!partida) return { ok: false as const, error: "Partida no encontrada." };

  const congelada = await prisma.baseline.findFirst({
    where: { projectId: partida.projectId, aprobadaAt: { not: null } },
    select: { version: true },
  });

  if (congelada) {
    return {
      ok: false as const,
      error: `El presupuesto esta congelado (linea base v${congelada.version}). Los cambios deben registrarse como adicionales.`,
    };
  }

  return { ok: true as const, partida };
}

async function auditar(datos: {
  sesion: SesionActiva;
  projectId: string;
  entidadId: string;
  accion: AuditAction;
  antes?: unknown;
  despues?: unknown;
}): Promise<void> {
  await prisma.auditLog
    .create({
      data: {
        companyId: datos.sesion.companyId,
        userId: datos.sesion.userId,
        projectId: datos.projectId,
        entidad: "WbsItem",
        entidadId: datos.entidadId,
        accion: datos.accion,
        antes: (datos.antes ?? null) as never,
        despues: (datos.despues ?? null) as never,
      },
    })
    .catch(() => {});
}

export interface CamposPartida {
  descripcion?: string;
  /// Cambiarla altera como se calcula el importe de aqui en adelante.
  modalidad?: ModalidadPartida;
  unidad?: string | null;
  metrado?: string | null;
  precioUnitario?: string | null;
  /// Si se envia, manda sobre el calculo. Es lo que permite mantener las
  /// partidas a suma alzada, donde el importe no es metrado x precio.
  parcial?: string | null;
}

export async function actualizarPartida(
  sesion: SesionActiva,
  partidaId: string,
  campos: CamposPartida,
): Promise<Resultado> {
  if (!puede(sesion.role, "partida:editar")) {
    return { ok: false, error: "No tienes permiso para editar partidas." };
  }

  const ctx = await contextoEditable(sesion, partidaId);
  if (!ctx.ok) return ctx;
  const { partida } = ctx;

  const datos: Record<string, unknown> = {};

  if (campos.descripcion !== undefined) {
    const texto = campos.descripcion.trim();
    if (texto === "") {
      return { ok: false, error: "La descripcion no puede quedar vacia." };
    }
    datos["descripcion"] = texto.slice(0, 500);
  }

  if (campos.unidad !== undefined) {
    const u = campos.unidad?.trim() ?? "";
    datos["unidad"] = u === "" ? null : u.slice(0, 20);
  }

  // Los numericos se normalizan con la misma precision que la base. Un
  // texto no numerico se rechaza en vez de guardarse como nulo: perder un
  // metrado en silencio es peor que un mensaje de error.
  for (const [campo, decimales] of [
    ["metrado", 4],
    ["precioUnitario", 4],
    ["parcial", 2],
  ] as const) {
    const valor = campos[campo];
    if (valor === undefined) continue;

    if (valor === null || valor.trim() === "") {
      datos[campo] = null;
      continue;
    }

    const normalizado = normalizarDecimal(valor, decimales);
    if (normalizado === null) {
      return { ok: false, error: `El valor de ${campo} no es un numero valido.` };
    }
    datos[campo] = normalizado;
  }

  /**
   * El importe solo se recalcula en partidas a precios unitarios.
   *
   * En una partida a suma alzada el precio esta cerrado y el metrado es
   * referencial: corregir ese metrado no puede alterar un importe ya
   * pactado con el contratista. Y en una fila de alcance el dinero vive en
   * su partida padre, asi que tampoco tiene importe propio que recalcular.
   */
  const modalidad = campos.modalidad ?? partida.modalidad;

  if (campos.parcial === undefined && modalidad === "PRECIOS_UNITARIOS") {
    const metrado = (datos["metrado"] ?? partida.metrado?.toString()) as string | null;
    const precio = (datos["precioUnitario"] ??
      partida.precioUnitario?.toString()) as string | null;

    if (metrado && precio) {
      datos["parcial"] = multiplicar(metrado, precio, 2);
    }
  }

  if (campos.modalidad !== undefined) {
    datos["modalidad"] = campos.modalidad;

    // Al pasar a alcance, el importe deja de ser propio: lo lleva el padre.
    if (campos.modalidad === "ALCANCE") datos["parcial"] = null;
  }

  if (Object.keys(datos).length === 0) return { ok: true };

  await prisma.wbsItem.update({ where: { id: partidaId }, data: datos });

  await auditar({
    sesion,
    projectId: partida.projectId,
    entidadId: partidaId,
    accion: "UPDATE",
    antes: {
      codigo: partida.codigoPartida,
      descripcion: partida.descripcion,
      unidad: partida.unidad,
      metrado: partida.metrado?.toString() ?? null,
      precioUnitario: partida.precioUnitario?.toString() ?? null,
      parcial: partida.parcial?.toString() ?? null,
    },
    despues: datos,
  });

  return { ok: true };
}

export async function eliminarPartida(
  sesion: SesionActiva,
  partidaId: string,
): Promise<Resultado> {
  if (!puede(sesion.role, "partida:eliminar")) {
    return { ok: false, error: "No tienes permiso para eliminar partidas." };
  }

  const ctx = await contextoEditable(sesion, partidaId);
  if (!ctx.ok) return ctx;
  const { partida } = ctx;

  const hijos = await prisma.wbsItem.count({ where: { parentId: partidaId } });

  if (hijos > 0) {
    // Borrar en cascada dejaria desaparecer partidas con importe sin que
    // nadie lo pida. Se exige vaciar el capitulo primero.
    return {
      ok: false,
      error: `"${partida.codigoPartida}" contiene ${hijos} partida(s). Eliminalas antes, o el presupuesto perderia importes sin aviso.`,
    };
  }

  await prisma.wbsItem.delete({ where: { id: partidaId } });

  await auditar({
    sesion,
    projectId: partida.projectId,
    entidadId: partidaId,
    accion: "DELETE",
    antes: {
      codigo: partida.codigoPartida,
      descripcion: partida.descripcion,
      parcial: partida.parcial?.toString() ?? null,
    },
  });

  return { ok: true };
}

export interface NuevaPartida {
  codigoPartida: string;
  descripcion: string;
  unidad?: string | null;
  metrado?: string | null;
  precioUnitario?: string | null;
}

export async function crearPartida(
  sesion: SesionActiva,
  obraId: string,
  nueva: NuevaPartida,
): Promise<Resultado<{ id: string }>> {
  if (!puede(sesion.role, "partida:crear")) {
    return { ok: false, error: "No tienes permiso para crear partidas." };
  }

  const obra = await prisma.project.findFirst({
    where: { id: obraId, companyId: sesion.companyId },
    select: { id: true },
  });
  if (!obra) return { ok: false, error: "Obra no encontrada." };

  const congelada = await prisma.baseline.findFirst({
    where: { projectId: obraId, aprobadaAt: { not: null } },
    select: { version: true },
  });
  if (congelada) {
    return {
      ok: false,
      error: `El presupuesto esta congelado (linea base v${congelada.version}).`,
    };
  }

  const codigo = nueva.codigoPartida.trim();
  if (!/^\d+(\.\d+)*$/.test(codigo)) {
    return {
      ok: false,
      error: "El codigo debe ser numeros separados por punto, como 4.3 o 01.02.01.",
    };
  }

  const descripcion = nueva.descripcion.trim();
  if (descripcion === "") {
    return { ok: false, error: "La descripcion es obligatoria." };
  }

  const existentes = await prisma.wbsItem.findMany({
    where: { projectId: obraId },
    select: { id: true, codigoPartida: true, orden: true },
  });

  if (existentes.some((e) => e.codigoPartida === codigo)) {
    return { ok: false, error: `Ya existe una partida con el codigo ${codigo}.` };
  }

  const codigos = new Set([...existentes.map((e) => e.codigoPartida), codigo]);
  const codigoDelPadre = codigoPadre(codigo, codigos);
  const padre = codigoDelPadre
    ? (existentes.find((e) => e.codigoPartida === codigoDelPadre) ?? null)
    : null;

  const metrado = nueva.metrado ? normalizarDecimal(nueva.metrado, 4) : null;
  const precioUnitario = nueva.precioUnitario
    ? normalizarDecimal(nueva.precioUnitario, 4)
    : null;

  if (nueva.metrado && metrado === null) {
    return { ok: false, error: "El metrado no es un numero valido." };
  }
  if (nueva.precioUnitario && precioUnitario === null) {
    return { ok: false, error: "El precio unitario no es un numero valido." };
  }

  const parcial =
    metrado && precioUnitario ? multiplicar(metrado, precioUnitario, 2) : null;

  // Sin cifras es un capitulo que agrupa; con cifras es una partida.
  const tipo = metrado || precioUnitario ? "PARTIDA" : "CAPITULO";

  const profundidades = calcularProfundidades([...codigos]);

  // Se coloca justo detras de su padre, o al final si cuelga de la raiz.
  const orden = padre
    ? padre.orden + 1
    : Math.max(0, ...existentes.map((e) => e.orden)) + 1;

  const creada = await prisma.$transaction(async (tx) => {
    // Se abre hueco en la numeracion para no dejar dos partidas con el
    // mismo orden, que las mostraria en un orden impredecible.
    await tx.wbsItem.updateMany({
      where: { projectId: obraId, orden: { gte: orden } },
      data: { orden: { increment: 1 } },
    });

    return tx.wbsItem.create({
      data: {
        projectId: obraId,
        parentId: padre?.id ?? null,
        codigoPartida: codigo,
        tipo,
        descripcion: descripcion.slice(0, 500),
        nivel: profundidades.get(codigo) ?? 0,
        orden,
        unidad: nueva.unidad?.trim() ? nueva.unidad.trim().slice(0, 20) : null,
        metrado,
        precioUnitario,
        parcial,
      },
      select: { id: true },
    });
  });

  await auditar({
    sesion,
    projectId: obraId,
    entidadId: creada.id,
    accion: "CREATE",
    despues: { codigo, descripcion, metrado, precioUnitario, parcial },
  });

  return { ok: true, datos: { id: creada.id } };
}
