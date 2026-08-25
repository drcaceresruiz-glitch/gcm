import { restar } from "./decimal";
import type { ElementoPdf, OpcionesPdf, PaginaPdf, TintaPdf } from "./informe-pdf";
import { aWinAnsi, partirEnLineas, type Medir } from "./pdf-texto";

/**
 * Los presupuestos en papel: el contractual, la meta y los dos enfrentados.
 *
 * Tres documentos y un solo modulo porque son la MISMA tabla con distintas
 * columnas, y separarlos acabaria con tres maneras de dibujar una fila de
 * capitulo. Lo que de verdad los distingue es a quien van dirigidos, y eso es
 * una sola linea de cada uno:
 *
 * - **Contractual**: va al cliente. Partidas, metrados, precios de venta y
 *   total. NI UNA cifra de costo, ni recargos, ni bolsa, ni gastos generales.
 *   Es lo que se firma.
 * - **Meta**: es interno. Lo que cuesta construir, con sus gastos generales.
 * - **Comparativa**: los dos enfrentados, con la bolsa por linea. Interno
 *   tambien, y el que no se manda por error: lleva el rotulo puesto.
 *
 * Logica pura y sin base de datos: aqui se decide QUE cae y DONDE, sin pintar
 * y sin nombrar un color. El origen de coordenadas del PDF esta ABAJO a la
 * izquierda, asi que `y` crece hacia arriba.
 */

/// A4 VERTICAL: un presupuesto es una lista larga y estrecha, al reves que el
/// informe -que es sobre todo tablas anchas y por eso va apaisado-.
export const A4_VERTICAL: OpcionesPdf = {
  ancho: 595,
  alto: 842,
  margen: 36,
  altoPie: 24,
  tamTituloDocumento: 15,
  tamTituloSeccion: 10,
  tamTexto: 8,
  interlineado: 1.15,
  relleno: 3,
};

export interface LineaPresupuesto {
  codigo: string | null;
  descripcion: string;
  tipo: "CAPITULO" | "PARTIDA";
  unidad: string | null;
  metrado: string | null;
  /// El precio y el importe del documento que se esta imprimiendo.
  precioUnitario: string | null;
  parcial: string | null;
  /// Solo en la comparativa: lo mismo en el OTRO presupuesto.
  parcialOtro?: string | null;
}

export interface DatosPresupuesto {
  empresa: string;
  /// El RUC de la constructora. Un presupuesto sin el no identifica a quien
  /// lo emite, y es lo primero que mira quien lo recibe.
  ruc: string | null;
  obra: string;
  ubicacion: string | null;
  /// El nombre del programa del cronograma, si la obra ya lo tiene cargado.
  programa: string | null;
  /**
   * Quien firma. Su colegiatura va DEBAJO del nombre porque es lo que hace
   * que el documento valga como documento profesional, no como una lista de
   * precios.
   */
  residente: { nombre: string; colegiatura: string | null } | null;
  /// Lo que se imprime arriba: "PRESUPUESTO CONTRACTUAL", etc.
  titulo: string;
  /// Una linea que explica de que documento se trata y para quien es.
  subtitulo: string;
  lineas: readonly LineaPresupuesto[];
  /// Los totales del pie, en el orden en que se leen. `destacado` para el que
  /// se mira primero.
  totales: readonly { etiqueta: string; importe: string; destacado?: boolean }[];
  /// Se estampa en diagonal cuando el documento NO debe salir de la empresa.
  soloInterno: boolean;
}

/// Las columnas, en puntos desde el margen izquierdo. La descripcion se lleva
/// lo que sobra.
interface Columnas {
  codigo: number;
  unidad: number;
  metrado: number;
  precio: number;
  parcial: number;
  /// Solo en la comparativa.
  otro?: number;
}

const ALTO_FILA = 14;

export function paginasDelPresupuesto(
  d: DatosPresupuesto,
  o: OpcionesPdf,
  medir: Medir,
  /// La comparativa lleva una columna mas y cambia los rotulos.
  comparativa = false,
): PaginaPdf[] {
  const izq = o.margen;
  const der = o.ancho - o.margen;

  /**
   * DONDE EMPIEZA LA COLUMNA DE LA UNIDAD SE MIDE, no se pone a ojo.
   *
   * «METRADO» va alineado a la DERECHA, asi que su `x` es su borde derecho y
   * el rotulo se dibuja hacia atras. «UND.» va alineado a la izquierda. Con
   * las dos posiciones escritas a mano los rotulos se pisaban y la cabecera
   * se leia «UNDMETRADO» —en los TRES documentos, no solo en la comparativa—.
   * Se vio el 24 de agosto de 2026, en cuanto se pudo mirar un PDF de verdad;
   * las pruebas no lo cazaban porque comprueban que nada se salga del papel,
   * no que dos textos no se solapen.
   *
   * Restando los dos anchos medidos mas un hueco, no se pueden pisar aunque
   * alguien cambie los rotulos o el cuerpo de letra.
   */
  const metrado = comparativa ? der - 190 : der - 175;
  const unidad = metrado - medir("METRADO", 7) - medir("UND.", 7) - 6;

  const cols: Columnas = comparativa
    ? {
        codigo: izq,
        unidad,
        /*
         * `der - 190` y no `der - 210`, que era donde estaba: en la
         * comparativa el sitio sale gratis porque la columna `precio` no se
         * dibuja -no hay «P. UNITARIO»- y entre el metrado y el contractual
         * quedaban noventa puntos sin usar.
         */
        metrado,
        precio: der - 160,
        parcial: der - 80,
        otro: der - 0,
      }
    : {
        codigo: izq,
        unidad,
        metrado,
        precio: der - 105,
        parcial: der,
      };

  /// Donde acaba la descripcion, que es lo unico que se parte en lineas.
  const finDescripcion = cols.unidad - 8;

  const paginas: PaginaPdf[] = [];
  let elementos: ElementoPdf[] = [];
  let y = 0;

  const texto = (
    x: number,
    contenido: string,
    tam: number,
    opciones: { negrita?: boolean; tinta?: TintaPdf; derecha?: boolean } = {},
  ) => {
    const ancho = opciones.derecha ? medir(contenido, tam) : 0;
    elementos.push({
      tipo: "texto",
      x: x - ancho,
      y,
      texto: aWinAnsi(contenido),
      tam,
      negrita: opciones.negrita ?? false,
      gris: false,
      tinta: opciones.tinta ?? "tinta",
    });
  };

  const cabeceraDeTabla = () => {
    texto(cols.codigo, "ÍTEM", 7, { negrita: true, tinta: "tinta-suave" });
    texto(cols.codigo + 42, "DESCRIPCIÓN", 7, { negrita: true, tinta: "tinta-suave" });
    texto(cols.unidad, "UND.", 7, { negrita: true, tinta: "tinta-suave" });
    texto(cols.metrado, "METRADO", 7, {
      negrita: true,
      tinta: "tinta-suave",
      derecha: true,
    });
    if (!comparativa) {
      texto(cols.precio, "P. UNITARIO", 7, {
        negrita: true,
        tinta: "tinta-suave",
        derecha: true,
      });
    }
    texto(cols.parcial, comparativa ? "CONTRACTUAL" : "PARCIAL", 7, {
      negrita: true,
      tinta: "tinta-suave",
      derecha: true,
    });
    if (comparativa && cols.otro !== undefined) {
      texto(cols.otro, "META", 7, {
        negrita: true,
        tinta: "tinta-suave",
        derecha: true,
      });
    }

    y -= 5;
    elementos.push({ tipo: "linea", x1: izq, y1: y, x2: der, y2: y, tinta: "linea" });
    y -= 12;
  };

  const nuevaPagina = (primera: boolean) => {
    if (elementos.length > 0) paginas.push({ elementos });
    elementos = [];
    y = o.alto - o.margen;

    if (primera) {
      y -= o.tamTituloDocumento;
      texto(izq, d.titulo, o.tamTituloDocumento, { negrita: true });

      y -= 12;
      texto(izq, d.obra, 9, { negrita: true });

      y -= 10;
      const membrete = [
        d.ruc ? `${d.empresa} · RUC ${d.ruc}` : d.empresa,
        d.ubicacion,
        d.programa,
      ]
        .filter(Boolean)
        .join("  ·  ");
      for (const linea of partirEnLineas(membrete, der - izq, 8, medir)) {
        texto(izq, linea, 8, { tinta: "tinta-suave" });
        y -= 10;
      }
      y += 10;

      y -= 11;
      for (const linea of partirEnLineas(d.subtitulo, der - izq, 8, medir)) {
        texto(izq, linea, 8, { tinta: d.soloInterno ? "peligro" : "tinta-suave" });
        y -= 10;
      }

      y -= 4;
      elementos.push({ tipo: "linea", x1: izq, y1: y, x2: der, y2: y, tinta: "linea" });
      y -= 16;
    } else {
      // Las paginas siguientes no repiten la cabecera entera: solo lo justo
      // para saber que documento es si una hoja se separa del resto.
      y -= 9;
      texto(izq, `${d.titulo} · ${d.obra}`, 8, { tinta: "tinta-suave" });
      y -= 14;
    }

    cabeceraDeTabla();
  };

  nuevaPagina(true);

  for (const l of d.lineas) {
    const nombre = [l.codigo, l.descripcion].filter(Boolean).join("  ");
    const lineas = partirEnLineas(nombre, finDescripcion - cols.codigo, 8, medir);
    const alto = Math.max(ALTO_FILA, lineas.length * 10 + 4);

    // Sitio para la fila Y para el pie: una fila partida entre dos paginas es
    // el fallo tipico de paginar a mano.
    if (y - alto < o.margen + o.altoPie + 40) nuevaPagina(false);

    const esCapitulo = l.tipo === "CAPITULO";

    if (esCapitulo) {
      elementos.push({
        tipo: "fondo",
        x: izq,
        y: y - 3,
        ancho: der - izq,
        alto: alto - 2,
        tinta: "linea",
      });
    }

    lineas.forEach((linea, i) => {
      const yLinea = y - i * 10;
      elementos.push({
        tipo: "texto",
        x: cols.codigo,
        y: yLinea,
        texto: aWinAnsi(linea),
        tam: 8,
        negrita: esCapitulo,
        gris: false,
        tinta: "tinta",
      });
    });

    if (!esCapitulo) {
      texto(cols.unidad, l.unidad ?? "", 8, { tinta: "tinta-suave" });
      texto(cols.metrado, l.metrado ?? "", 8, { derecha: true });
      if (!comparativa) {
        texto(cols.precio, l.precioUnitario ?? "", 8, { derecha: true });
      }
    }

    if (l.parcial) texto(cols.parcial, l.parcial, 8, { derecha: true, negrita: esCapitulo });

    if (comparativa && cols.otro !== undefined && l.parcialOtro) {
      texto(cols.otro, l.parcialOtro, 8, { derecha: true, negrita: esCapitulo });
    }

    y -= alto;
  }

  // ---- Totales ------------------------------------------------------------

  if (y - d.totales.length * 16 - 20 < o.margen + o.altoPie) nuevaPagina(false);

  y -= 6;
  elementos.push({ tipo: "linea", x1: izq, y1: y, x2: der, y2: y, tinta: "tinta" });
  y -= 16;

  for (const t of d.totales) {
    texto(cols.codigo, t.etiqueta, t.destacado ? 10 : 8, {
      negrita: t.destacado ?? false,
    });
    texto(cols.parcial, t.importe, t.destacado ? 10 : 8, {
      derecha: true,
      negrita: t.destacado ?? false,
      tinta: esNegativoTexto(t.importe) ? "peligro" : "tinta",
    });
    y -= t.destacado ? 18 : 14;
  }

  /**
   * La linea de firma, solo si se sabe quien firma.
   *
   * No se dibuja una raya con «Residente de obra» debajo cuando la obra no
   * tiene uno asignado: un hueco para firmar sin nombre invita a que lo
   * rellene cualquiera a mano, y entonces el documento dice algo que GCM no
   * puede respaldar.
   */
  if (d.residente !== null) {
    if (y - 60 < o.margen + o.altoPie) nuevaPagina(false);

    y -= 34;
    elementos.push({
      tipo: "linea",
      x1: izq,
      y1: y + 8,
      x2: izq + 200,
      y2: y + 8,
      tinta: "tinta",
    });
    texto(izq, d.residente.nombre, 8, { negrita: true });
    y -= 10;
    const cargo = d.residente.colegiatura
      ? `Residente de obra · ${d.residente.colegiatura}`
      : "Residente de obra";
    texto(izq, cargo, 7, { tinta: "tinta-suave" });
  }

  paginas.push({ elementos });
  return paginas;
}

/// Un importe negativo se pinta en rojo. Se mira el signo del TEXTO y no se
/// convierte a numero: es dinero, y aqui solo hace falta saber si empieza por
/// menos.
function esNegativoTexto(importe: string): boolean {
  return importe.trim().startsWith("-") || importe.includes("-S/");
}

/**
 * La bolsa de una linea de la comparativa: contractual menos meta.
 *
 * Se calcula aqui y no en la pantalla para que el papel y la pantalla no
 * puedan restar distinto.
 */
export function bolsaDeLinea(
  contractual: string | null,
  meta: string | null,
): string | null {
  if (contractual === null || meta === null) return null;
  return restar(contractual, meta);
}
