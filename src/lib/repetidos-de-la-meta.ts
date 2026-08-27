import { detectarImportesRepetidos } from "@/lib/jerarquia-partidas";
import { multiplicar, sumar } from "@/lib/decimal";

/**
 * Importes repetidos en el presupuesto meta YA CARGADO.
 *
 * POR QUE NO SE AVISA AL IMPORTAR Y YA. El importador detecta estos grupos
 * desde el primer dia -`detectarImportesRepetidos`, con su total alternativo-
 * y hasta el 27 de agosto de 2026 no los leia NADIE: se calculaban, se
 * devolvian y se perdian al salir del servicio. Un presupuesto real llego con
 * cinco filas repitiendo 4.200 por una formula arrastrada, y la meta se guardo
 * con ese dinero contado cinco veces sin que la pantalla lo mencionara.
 *
 * Se calcula AQUI, sobre las lineas guardadas, y no se pasa desde la carga:
 *
 * - El aviso sigue estando la semana que viene, cuando alguien vuelva a mirar
 *   la meta. Un aviso que solo aparece en la pantalla siguiente a la subida se
 *   pierde en cuanto se navega a otro sitio, que es justo lo que pasa cuando
 *   se sube el Excel y se sale a comer.
 * - Cubre las metas cargadas ANTES de que esto existiera.
 * - Y sigue el rastro de las correcciones: se arregla una linea a mano y el
 *   aviso se va solo, porque se recalcula al pintar.
 *
 * NO SE CORRIGE POR CUENTA PROPIA, y esa decision no cambia: dos partidas
 * pueden costar lo mismo de forma legitima -dos puertas iguales, dos tramos
 * del mismo muro-. Se dice lo que se ve y cuanto esta en juego; decide una
 * persona.
 */

/**
 * Lo minimo que necesita una linea para entrar en la cuenta.
 *
 * Se declara aqui en vez de importar `LineaDeLaMeta` del servicio: `lib/` no
 * depende de `services/` -es la regla de capas de la casa- y ademas asi esto
 * se prueba con objetos escritos a mano, sin base ni sesion.
 */
export interface LineaRepetible {
  codigoRef: string | null;
  descripcion: string;
  precioUnitario: string | null;
  parcial: string | null;
  /// Posicion en el presupuesto. Es lo que dice si dos lineas van SEGUIDAS.
  orden: number;
}

export interface GrupoDeMeta {
  /// Las descripciones, para poder nombrarlas en pantalla sin ir a la base.
  descripciones: string[];
  /// Los codigos del contrato. Vacio en las lineas propias de la meta.
  codigos: string[];
  /// El importe que repiten todas.
  importe: string;
  /// Lo que sobra si de verdad era una formula arrastrada: importe x (n - 1).
  deMas: string;
}

export interface RepetidosDeLaMeta {
  grupos: GrupoDeMeta[];
  /// Cuanto suma la meta de mas, sumando todos los grupos.
  deMasTotal: string;
  /// Cuantas lineas estan implicadas, contando la primera de cada grupo.
  lineasImplicadas: number;
}

export function repetidosDeLaMeta(
  lineas: readonly LineaRepetible[],
): RepetidosDeLaMeta {
  /*
   * Se reusa la deteccion del importador en vez de escribir otra.
   *
   * Es la MISMA pregunta -importes identicos en lineas seguidas- y tener dos
   * respuestas distintas para ella acabaria con el importador avisando de un
   * grupo que la pantalla no ve. `orden` hace de numero de fila: es
   * consecutivo y respeta el orden del documento, que es lo unico que la
   * deteccion necesita para saber si dos lineas van pegadas.
   */
  const grupos = detectarImportesRepetidos(
    lineas.map((l) => ({
      fila: l.orden,
      codigo: l.codigoRef ?? "",
      parcial: l.parcial,
      precioUnitario: l.precioUnitario,
    })),
  );

  const porOrden = new Map(lineas.map((l) => [l.orden, l]));

  const salida = grupos.map((g) => {
    // `filas` son ordenes: cuantas lineas repiten el importe. La primera es
    // legitima -alguna cuesta eso de verdad-, asi que solo sobran las demas.
    const sobrantes = g.filas.length - 1;
    return {
      descripciones: g.filas.map((f) => porOrden.get(f)?.descripcion ?? ""),
      codigos: g.codigos.filter((c) => c !== ""),
      importe: g.importe,
      deMas: multiplicar(g.importe, String(sobrantes), 2) ?? "0.00",
    };
  });

  return {
    grupos: salida,
    deMasTotal: sumar(
      salida.map((g) => g.deMas),
      2,
    ),
    lineasImplicadas: grupos.reduce((n, g) => n + g.filas.length, 0),
  };
}
