import { sumar, restar, multiplicar, dividir } from "@/lib/decimal";
import { codigoPadre } from "@/lib/jerarquia-partidas";

/**
 * El presupuesto contractual, calculado a partir del real.
 *
 * El real es lo que de verdad se cuadro con los contratistas. El contractual
 * es lo que se pacta con el cliente: el mismo trabajo, con cada capitulo
 * recargado un porcentaje. La diferencia entre los dos ES la bolsa operativa.
 *
 * Vive aparte y sin base de datos a proposito: aqui esta el dinero, y el
 * dinero se prueba con numeros, no montando una obra entera.
 *
 * TRES REGLAS que se sostienen entre si:
 *
 * 1. El recargo se aplica a las PARTIDAS, no al capitulo. Un capitulo no
 *    tiene precio propio: es un titulo, y su importe es la suma de lo que
 *    cuelga de el. Recargarlo aparte contaria el dinero dos veces.
 * 2. Cada partida hereda el recargo del ancestro MAS CERCANO que tenga uno.
 *    Asi un subcapitulo puede llevar el suyo y el resto del capitulo sigue
 *    con el general.
 * 3. Lo que no se pueda recargar NO se inventa: se pasa tal cual y se avisa.
 *    Una partida que entra al contrato a precio de costo es una decision,
 *    no un accidente, y quien la firma tiene que verla.
 */

/// El precio unitario lleva 4 decimales en la base; el importe, 2.
const DECIMALES_PRECIO = 4;
const DECIMALES_IMPORTE = 2;

/// Escala de trabajo del factor. Se calcula con mas cifras de las que se
/// guardan para que el redondeo ocurra una sola vez, al final.
const DECIMALES_FACTOR = 6;

export interface LineaReal {
  codigo: string | null;
  descripcion: string;
  tipo: "CAPITULO" | "PARTIDA";
  nivel: number;
  orden: number;
  unidad: string | null;
  metrado: string | null;
  precioUnitario: string | null;
  parcial: string | null;
  /// Solo en capitulos, y COMO PORCENTAJE: 18.000 son 18%.
  porcentajeRecargo: string | null;
}

export interface LineaContractual {
  codigo: string;
  descripcion: string;
  tipo: "CAPITULO" | "PARTIDA";
  nivel: number;
  orden: number;
  unidad: string | null;
  metrado: string | null;
  precioUnitario: string | null;
  parcial: string | null;
  /// Que porcentaje se le aplico y de que capitulo salio. La vista previa lo
  /// ensena para que nadie tenga que deducirlo.
  porcentajeAplicado: string | null;
  codigoDelRecargo: string | null;
  /// Lo que costaba en el real, para poder comparar linea a linea.
  parcialReal: string | null;
}

export type MotivoAviso = "SIN_CODIGO" | "SIN_RECARGO" | "SIN_IMPORTE";

export interface AvisoContractual {
  motivo: MotivoAviso;
  mensaje: string;
  codigos: string[];
  /// Cuanto dinero esta implicado. Un aviso sin cifra no deja decidir.
  importe: string;
}

export interface ResultadoContractual {
  lineas: LineaContractual[];
  totalReal: string;
  totalContractual: string;
  /// Contractual menos real: la bolsa operativa.
  bolsa: string;
  avisos: AvisoContractual[];
}

/**
 * El factor por el que se multiplica: 18 (%) pasa a 1.18.
 *
 * Se guarda el PORCENTAJE en la base y se convierte aqui, en un solo sitio.
 * Mezclar las dos formas es como nace el error de cien veces, que en un
 * presupuesto no da error: da una cifra creible y equivocada.
 */
function factorDeRecargo(porcentaje: string): string | null {
  const fraccion = dividir(porcentaje, "100", DECIMALES_FACTOR);
  if (fraccion === null) return null;
  return sumar(["1", fraccion], DECIMALES_FACTOR);
}

/**
 * Recarga una linea. Devuelve el precio y el importe ya pactados.
 *
 * Si hay metrado y precio unitario se recarga el PRECIO y el importe se
 * recalcula: el contrato lleva las mismas cantidades a otro precio, que es
 * como se lee un presupuesto de obra. Si el importe estaba cerrado (suma
 * alzada), se recarga el importe y no hay precio que ensenar.
 */
function recargarLinea(
  linea: LineaReal,
  factor: string,
): { precioUnitario: string | null; parcial: string | null } {
  if (linea.metrado !== null && linea.precioUnitario !== null) {
    const precio = multiplicar(linea.precioUnitario, factor, DECIMALES_PRECIO);
    if (precio === null) return { precioUnitario: null, parcial: null };
    return {
      precioUnitario: precio,
      parcial: multiplicar(linea.metrado, precio, DECIMALES_IMPORTE),
    };
  }

  if (linea.parcial !== null) {
    return {
      precioUnitario: null,
      parcial: multiplicar(linea.parcial, factor, DECIMALES_IMPORTE),
    };
  }

  return { precioUnitario: null, parcial: null };
}

/**
 * Convierte el presupuesto real en el contractual.
 *
 * El total NO se calcula con `sumarHojas`: en el real los capitulos no llevan
 * importe propio (los deja en null quien lo importa), asi que la suma llana
 * de las lineas con cifra es la correcta, y es ademas la MISMA cuenta que usa
 * `crearMeta` para su costo directo. Usar dos cuentas distintas para el mismo
 * dinero es como dos pantallas acaban diciendo cifras diferentes.
 */
export function generarContractual(
  reales: readonly LineaReal[],
): ResultadoContractual {
  const conCodigo = reales.filter(
    (l): l is LineaReal & { codigo: string } => l.codigo !== null && l.codigo !== "",
  );
  const codigos = new Set(conCodigo.map((l) => l.codigo));

  const recargoPorCodigo = new Map<string, string>();
  for (const l of conCodigo) {
    if (l.porcentajeRecargo !== null) recargoPorCodigo.set(l.codigo, l.porcentajeRecargo);
  }

  /**
   * El recargo que le toca a una linea: el del ancestro mas cercano.
   *
   * Se sube por `codigoPadre` y no cortando el codigo por los puntos, porque
   * en los presupuestos reales faltan filas de grupo y hay cabeceras
   * terminadas en ceros. `vistos` corta cualquier ciclo: un codigo mal
   * escrito no puede colgar el calculo.
   */
  const recargoDe = (codigo: string): { pct: string; origen: string } | null => {
    let actual: string | null = codigo;
    const vistos = new Set<string>();

    while (actual !== null && !vistos.has(actual)) {
      vistos.add(actual);
      const pct = recargoPorCodigo.get(actual);
      if (pct !== undefined) return { pct, origen: actual };
      actual = codigoPadre(actual, codigos);
    }

    return null;
  };

  const lineas: LineaContractual[] = [];
  const sinRecargo: LineaContractual[] = [];
  const sinImporte: string[] = [];

  for (const l of conCodigo) {
    const base = {
      codigo: l.codigo,
      descripcion: l.descripcion,
      tipo: l.tipo,
      nivel: l.nivel,
      orden: l.orden,
      unidad: l.unidad,
      metrado: l.metrado,
      parcialReal: l.parcial,
    };

    // Un capitulo es un titulo: ni lleva cifras ni se recarga. Su importe es
    // la suma de lo que cuelga de el, ya recargado.
    if (l.tipo === "CAPITULO") {
      lineas.push({
        ...base,
        precioUnitario: null,
        parcial: null,
        porcentajeAplicado: null,
        codigoDelRecargo: null,
      });
      continue;
    }

    const recargo = recargoDe(l.codigo);
    const factor = recargo ? factorDeRecargo(recargo.pct) : null;

    const recargada =
      factor !== null
        ? recargarLinea(l, factor)
        : { precioUnitario: l.precioUnitario, parcial: l.parcial };

    const linea: LineaContractual = {
      ...base,
      precioUnitario: recargada.precioUnitario ?? l.precioUnitario,
      parcial: recargada.parcial,
      porcentajeAplicado: recargo?.pct ?? null,
      codigoDelRecargo: recargo?.origen ?? null,
    };

    lineas.push(linea);

    if (recargo === null) sinRecargo.push(linea);
    if (l.parcial === null && l.metrado === null) sinImporte.push(l.codigo);
  }

  const totalReal = sumar(
    conCodigo.map((l) => l.parcial).filter((v): v is string => v !== null),
    DECIMALES_IMPORTE,
  );
  const totalContractual = sumar(
    lineas.map((l) => l.parcial).filter((v): v is string => v !== null),
    DECIMALES_IMPORTE,
  );


  const avisos: AvisoContractual[] = [];

  // Sin codigo no hay sitio en el arbol del contractual, que se ordena y se
  // anida por el. Son lineas propias del real —costo que el contrato no
  // desglosa—, asi que quedan fuera y se dice cuanto suman: ese dinero hay
  // que cubrirlo recargando el resto.
  const sinCodigo = reales.filter((l) => l.codigo === null || l.codigo === "");
  if (sinCodigo.length > 0) {
    avisos.push({
      motivo: "SIN_CODIGO",
      mensaje:
        "Estas lineas del presupuesto real no tienen codigo, asi que no entran " +
        "en el contractual. Su costo hay que cubrirlo con el recargo del resto.",
      codigos: sinCodigo.map((l) => l.descripcion),
      importe: sumar(
        sinCodigo.map((l) => l.parcial).filter((v): v is string => v !== null),
        DECIMALES_IMPORTE,
      ),
    });
  }

  // Entran al contrato a precio de costo. Puede ser deliberado, pero tiene
  // que verse ANTES de firmar, no descubrirse al cierre.
  if (sinRecargo.length > 0) {
    avisos.push({
      motivo: "SIN_RECARGO",
      mensaje:
        "Su capitulo no tiene recargo, asi que van al contrato al mismo precio " +
        "que costaron: sin margen.",
      codigos: sinRecargo.map((l) => l.codigo),
      importe: sumar(
        sinRecargo.map((l) => l.parcial).filter((v): v is string => v !== null),
        DECIMALES_IMPORTE,
      ),
    });
  }

  if (sinImporte.length > 0) {
    avisos.push({
      motivo: "SIN_IMPORTE",
      mensaje:
        "No llevan ni importe ni metrado, asi que no hay nada que recargar. " +
        "Entran como descripcion de alcance.",
      codigos: sinImporte,
      importe: "0.00",
    });
  }

  return {
    lineas,
    totalReal,
    totalContractual,
    bolsa: restar(totalContractual, totalReal, DECIMALES_IMPORTE) ?? "0.00",
    avisos,
  };
}
