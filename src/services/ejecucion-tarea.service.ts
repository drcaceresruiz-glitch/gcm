import "server-only";
import { prisma } from "@/lib/prisma";
import {
  ejecucionTrasAvance,
  type OrigenFecha,
} from "@/lib/ejecucion-real";

/**
 * Guardar cuando arranco y cuando termino DE VERDAD cada tarea.
 *
 * Se llama desde donde ya se registra el avance —el parte del cronograma y el
 * cierre del plan semanal—, dentro de su misma transaccion. No hay una
 * pantalla nueva ni un dato mas que teclear: la fecha se deduce de lo que el
 * equipo ya reporta, y por eso se guarda marcada como DERIVADA.
 *
 * POR QUE NO SE PIDE A MANO. Pedir la fecha real de inicio y fin de cada tarea
 * es trabajo administrativo que en obra no se hace: se rellenaria a ojo a fin
 * de mes, y una fecha puesta a ojo mide peor que una deducida de un parte del
 * dia que si se llena. Quien necesite precision puede declararla, y entonces
 * manda la persona: `ejecucionTrasAvance` no pisa nunca una DECLARADA.
 *
 * La decision de que fecha guardar vive en `lib/ejecucion-real`, en logica
 * pura y probada aparte -incluidos los casos raros: el parte que llega con
 * fecha anterior, la correccion que baja del cien-. Aqui solo se lee lo que
 * habia, se pregunta, y se escribe si algo cambia.
 */

type Transaccion = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

export async function anotarEjecucion(
  tx: Transaccion,
  projectId: string,
  uid: number,
  fecha: Date,
  porcentaje: number,
): Promise<void> {
  const previa = await tx.ejecucionTarea.findUnique({
    where: { projectId_uid: { projectId, uid } },
    select: {
      inicioReal: true,
      finReal: true,
      origenInicio: true,
      origenFin: true,
    },
  });

  const cambio = ejecucionTrasAvance(
    {
      inicioReal: previa?.inicioReal ?? null,
      finReal: previa?.finReal ?? null,
      origenInicio: (previa?.origenInicio as OrigenFecha | null) ?? null,
      origenFin: (previa?.origenFin as OrigenFecha | null) ?? null,
    },
    { fecha, porcentaje },
  );

  // Sin cambios no se escribe: un `update` por cada parte del dia llenaria la
  // tabla de escrituras que no cambian nada.
  if (Object.keys(cambio).length === 0) return;

  await tx.ejecucionTarea.upsert({
    where: { projectId_uid: { projectId, uid } },
    create: { projectId, uid, ...cambio },
    update: cambio,
  });
}
