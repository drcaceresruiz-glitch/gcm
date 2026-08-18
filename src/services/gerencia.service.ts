import "server-only";

import { prisma } from "@/lib/prisma";
import { puede } from "@/lib/rbac";
import { sumar } from "@/lib/decimal";
import type { SesionActiva } from "@/services/sesion.service";

/**
 * La lectura de GERENCIA: la cartera entera, no una obra.
 *
 * Es la vista cross-obra que solo tiene sentido para quien responde de todas.
 * La puerta NO es un permiso nuevo —la matriz ya tiene bastantes, y uno que
 * en la practica siempre acompana a otro solo sirve para que un dia falte—
 * sino el ALCANCE: `obrasAsignadas === null` significa «ve toda la cartera»,
 * que es exactamente la definicion de gerente en GCM. Ver
 * `@/lib/alcance-obras`.
 *
 * REGLA DE COSTE, y manda sobre todo lo demas que se anada aqui: este panel
 * corre sobre N obras a la vez, en un hosting de 20 Entry Processes donde
 * cargar UN cronograma entero en una pantalla ya tumbo produccion dos veces.
 * Nada de lo que viva aqui puede hacer una consulta por obra si existe la
 * forma de hacer una para todas. En particular **`datosEvm` no se llama
 * desde aqui**: encadena cinco consultas por obra, dos de ellas cargando el
 * cronograma completo y todas las partidas.
 */

export interface ObraConAdicionales {
  obraId: string;
  obraNombre: string;
  /// Cuantos adicionales lleva en borrador.
  cuantos: number;
  /// Lo que sumarian al presupuesto si se aprobaran todos.
  importe: string;
}

export interface AdicionalesPendientes {
  porObra: ObraConAdicionales[];
  /// El total de la cartera. Es la cifra del titular.
  importe: string;
  cuantos: number;
}

/**
 * Los ADICIONALES en BORRADOR de toda la empresa, con su impacto.
 *
 * Un adicional en borrador es dinero que todavia no cuenta en ningun sitio
 * —el BAC solo suma los aprobados— pero que ya esta pedido. Es justo la cifra
 * que un gerente necesita ver junta: obra por obra no se percibe, y en la
 * cartera puede ser la diferencia entre el margen del año y su ausencia.
 *
 * ## Se suman las LINEAS, no `totalEntradas`
 *
 * El movimiento persiste sus totales «para poder listar sin agregar», pero su
 * propio esquema advierte de que **no se confia en ellos**: se recalculan
 * desde las lineas dentro de la transaccion de aprobacion. Mientras el
 * movimiento sigue en BORRADOR se le anaden y quitan lineas, asi que el total
 * guardado puede ir por detras. Aqui se agrega desde las lineas, que es la
 * verdad, y cuesta UNA consulta mas para todas las obras.
 *
 * ## Dos consultas en total, sean dos obras o cuarenta
 *
 * Una para los movimientos y otra para sus lineas agrupadas. Nada crece con
 * el numero de obras.
 */
export async function adicionalesEnBorrador(
  sesion: SesionActiva,
): Promise<AdicionalesPendientes | null> {
  // Solo quien ve toda la cartera. A quien lleva una obra no se le ensena el
  // pendiente de las demas: es la misma linea que traza el alcance por obra.
  if (sesion.obrasAsignadas !== null) return null;
  if (!puede(sesion, "movimiento:leer")) return null;

  const movimientos = await prisma.movimientoPresupuestal.findMany({
    where: {
      tipo: "ADICIONAL",
      estado: "BORRADOR",
      project: { companyId: sesion.companyId },
    },
    select: {
      id: true,
      projectId: true,
      project: { select: { nombreObra: true } },
    },
  });

  if (movimientos.length === 0) {
    return { porObra: [], importe: "0.00", cuantos: 0 };
  }

  const lineas = await prisma.movimientoLinea.groupBy({
    by: ["movimientoId"],
    where: { movimientoId: { in: movimientos.map((m) => m.id) } },
    _sum: { importe: true },
  });

  const importePorMovimiento = new Map(
    lineas.map((l) => [l.movimientoId, l._sum.importe?.toString() ?? "0"]),
  );

  // Agrupado por obra, con el nombre que ya vino en la consulta.
  const acumulado = new Map<string, { nombre: string; importes: string[] }>();

  for (const m of movimientos) {
    const fila = acumulado.get(m.projectId) ?? {
      nombre: m.project.nombreObra,
      importes: [],
    };
    fila.importes.push(importePorMovimiento.get(m.id) ?? "0");
    acumulado.set(m.projectId, fila);
  }

  const porObra = [...acumulado.entries()].map(([obraId, fila]) => ({
    obraId,
    obraNombre: fila.nombre,
    cuantos: fila.importes.length,
    importe: sumar(fila.importes),
  }));

  // De mayor a menor impacto: la lista se lee de arriba abajo y lo que hay
  // que mirar primero es lo que mas dinero mueve, no la obra mas antigua.
  porObra.sort((a, b) => Number(b.importe) - Number(a.importe));

  return {
    porObra,
    importe: sumar(porObra.map((o) => o.importe)),
    cuantos: movimientos.length,
  };
}
