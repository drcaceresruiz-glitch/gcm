/**
 * Avance FISICO contra avance ECONOMICO, capitulo a capitulo.
 *
 * La pregunta de gerencia es «voy al 40% de obra, por que llevo gastado el
 * 60%», y hasta ahora el sistema no la contestaba por capitulo: el EVM la
 * contesta para la obra entera, y ademas su EV se DERIVA del avance fisico,
 * asi que EV contra PV no es fisico contra economico —es fisico contra plan—.
 *
 * Aqui lo economico es dinero de verdad: lo imputado a ordenes aprobadas.
 *
 * ## Sobre que arbol se calcula
 *
 * Sobre el del PRESUPUESTO, no el del cronograma. El dinero es nativo ahi
 * (`OrdenImputacion.wbsItemId` es una clave foranea real) y es el arbol que
 * lee gerencia. El avance fisico vive en el cronograma y entra por el mapeo
 * tarea-partida, que es N:M y no guarda proporciones.
 *
 * ## La regla que no se puede romper
 *
 * Una partida sin tarea mapeada NO cuenta como 0% de avance. Contarla asi
 * hundiria el fisico de su capitulo e inventaria un problema que no existe;
 * es el modo de fallo caro de esta aplicacion —una fila que deja de contar
 * sin dar error—. Queda fuera de la comparacion y se declara en `sinMedir`,
 * para que quien lea el numero sepa sobre cuanto se calculo.
 *
 * Por eso los dos porcentajes salen de la MISMA base (`baseMedible`): comparar
 * un fisico calculado sobre media obra con un economico calculado sobre la
 * obra entera daria una alarma falsa en cuanto el mapeo estuviera incompleto.
 */

import { dividir, esPositivo, multiplicar, restar, sumar } from "@/lib/decimal";
import { codigoPadre, aportantes, type NodoImporte } from "@/lib/jerarquia-partidas";

/// Cuantos puntos puede ir el gasto por delante del avance antes de avisar.
/// No es una constante universal: es el margen con el que un jefe de obra
/// convive sin alarmarse (acopios, adelantos a proveedor).
export const PUNTOS_DE_AVISO = 10;

export interface PartidaDelCruce extends NodoImporte {
  nombre: string;
}

export interface CapituloDelCruce {
  codigo: string;
  nombre: string;
  /// Subtotal presupuestado del capitulo, con TODO lo que cuelga.
  presupuesto: string;
  /// Imputado a ordenes aprobadas, con todo lo que cuelga.
  gastado: string;
  /// Presupuesto de las partidas cuyo avance SI se conoce. Es la base de los
  /// dos porcentajes de abajo.
  baseMedible: string;
  /// Presupuesto de las partidas sin tarea mapeada: no se sabe como van.
  sinMedir: string;
  /// 0..100 ponderado por importe. Null si no hay ninguna partida medible.
  fisico: number | null;
  /// 0..100: gastado sobre lo medible. Null por la misma razon.
  economico: number | null;
  /// El gasto va por delante del avance mas de `PUNTOS_DE_AVISO`.
  avisa: boolean;
}

/**
 * La cadena de ancestros de un codigo, de padre a raiz.
 *
 * Se sube por `codigoPadre` y no cortando el codigo por los puntos porque en
 * los presupuestos reales faltan filas intermedias y hay cabeceras de grupo
 * terminadas en ceros. `vistos` corta un ciclo si los datos vinieran sucios:
 * sin esa guarda un codigo que se declare padre de si mismo colgaria la carga
 * de la pantalla.
 */
function ancestros(codigo: string, existentes: ReadonlySet<string>): string[] {
  const salida: string[] = [];
  const vistos = new Set<string>([codigo]);
  let padre = codigoPadre(codigo, existentes);
  while (padre && !vistos.has(padre)) {
    salida.push(padre);
    vistos.add(padre);
    padre = codigoPadre(padre, existentes);
  }
  return salida;
}

/**
 * El cruce, capitulo raiz a capitulo raiz.
 *
 * `avancePorCodigo` trae solo las partidas de las que se sabe algo: una
 * partida ausente del mapa es «no medible», que NO es «al 0%».
 */
export function cruceFisicoEconomico(
  partidas: readonly PartidaDelCruce[],
  gastoPorCodigo: ReadonlyMap<string, string>,
  avancePorCodigo: ReadonlyMap<string, string>,
): CapituloDelCruce[] {
  const existentes = new Set(partidas.map((p) => p.codigo));
  const nombres = new Map(partidas.map((p) => [p.codigo, p.nombre]));

  const presupuesto = new Map<string, string[]>();
  const gastado = new Map<string, string[]>();
  const base = new Map<string, string[]>();
  const ganado = new Map<string, string[]>();
  const gastadoMedible = new Map<string, string[]>();

  const anota = (m: Map<string, string[]>, clave: string, valor: string) => {
    const previo = m.get(clave);
    if (previo) previo.push(valor);
    else m.set(clave, [valor]);
  };

  // `aportantes` decide que filas cuentan para el dinero, igual que en el
  // total de la obra: asi el cruce NO puede contradecir al presupuesto.
  const cuentan = aportantes(partidas);
  const codigosQueCuentan = new Set(cuentan.map((p) => p.codigo));

  for (const p of cuentan) {
    const cadena = [p.codigo, ...ancestros(p.codigo, existentes)];
    const importe = p.parcial!;
    const gasto = gastoPorCodigo.get(p.codigo) ?? "0.00";
    const pct = avancePorCodigo.get(p.codigo) ?? null;

    for (const c of cadena) {
      anota(presupuesto, c, importe);
      anota(gastado, c, gasto);
      if (pct !== null) {
        anota(base, c, importe);
        anota(gastadoMedible, c, gasto);
        anota(ganado, c, multiplicar(importe, dividir(pct, "100", 6) ?? "0", 2) ?? "0.00");
      }
    }
  }

  /*
   * El dinero imputado a una fila que NO aporta al presupuesto.
   *
   * Pasa cuando se imputa una orden a un capitulo que ya tiene hijas
   * costeadas: `aportantes` lo excluye —para el presupuesto ese capitulo es
   * un titulo— pero el gasto es real y se pago. Sin este recorrido ese dinero
   * desapareceria del cruce sin dar ningun error, que es justo lo que este
   * modulo existe para evitar.
   */
  for (const [codigo, importe] of gastoPorCodigo) {
    if (codigosQueCuentan.has(codigo) || !existentes.has(codigo)) continue;
    for (const c of [codigo, ...ancestros(codigo, existentes)]) {
      anota(gastado, c, importe);
    }
  }

  // Capitulos raiz: los que no cuelgan de nadie. Es el primer nivel que se
  // lee en un presupuesto ("1.0 ESTRUCTURAS").
  const raices = [...existentes].filter(
    (c) => codigoPadre(c, existentes) === null,
  );
  raices.sort((a, b) => a.localeCompare(b, "es", { numeric: true }));

  return raices.map((codigo) => {
    const baseMedible = sumar(base.get(codigo) ?? []);
    const total = sumar(presupuesto.get(codigo) ?? []);
    const hayBase = esPositivo(baseMedible);

    const fisico = hayBase
      ? Number(dividir(multiplicar(sumar(ganado.get(codigo) ?? []), "100", 2) ?? "0", baseMedible, 2) ?? "0")
      : null;
    const economico = hayBase
      ? Number(
          dividir(
            multiplicar(sumar(gastadoMedible.get(codigo) ?? []), "100", 2) ?? "0",
            baseMedible,
            2,
          ) ?? "0",
        )
      : null;

    return {
      codigo,
      nombre: nombres.get(codigo) ?? codigo,
      presupuesto: total,
      gastado: sumar(gastado.get(codigo) ?? []),
      baseMedible,
      sinMedir: restar(total, baseMedible) ?? "0.00",
      fisico,
      economico,
      avisa:
        fisico !== null && economico !== null && economico - fisico > PUNTOS_DE_AVISO,
    };
  });
}
