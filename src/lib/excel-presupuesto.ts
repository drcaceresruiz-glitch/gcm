import ExcelJS from "exceljs";
import { normalizarDecimal, multiplicar, sumar } from "@/lib/decimal";
import {
  sumarHojas,
  detectarImportesRepetidos,
  type GrupoRepetido,
  cubiertosPorDescendientes,
} from "@/lib/jerarquia-partidas";

/**
 * Lectura de presupuestos desde Excel.
 *
 * El importador nunca escribe nada por si mismo: analiza, valida y devuelve
 * una vista previa. La escritura ocurre en un segundo paso, ya con el
 * usuario habiendo visto lo que se va a cargar. Un presupuesto importado a
 * ciegas es peor que no importarlo.
 */

export type TipoFila = "CAPITULO" | "PARTIDA";

export type Modalidad = "PRECIOS_UNITARIOS" | "SUMA_ALZADA" | "ALCANCE";

export interface FilaImportada {
  /// Numero de fila en el Excel, para que el usuario la localice.
  fila: number;
  codigo: string;
  tipo: TipoFila;
  /// Como esta contratada. Determina si el importe se recalcula al cambiar
  /// el metrado y como se valorizara su avance.
  modalidad: Modalidad;
  descripcion: string;
  nivel: number;
  unidad: string | null;
  metrado: string | null;
  precioUnitario: string | null;
  parcial: string | null;
  /// % de recargo con el que se genera el contractual. En un capitulo lo
  /// heredan sus partidas; en una partida gana sobre el de su capitulo.
  porcentajeRecargo: string | null;
  /// Fecha opcional de la plantilla, "YYYY-MM-DD". Van juntas o ninguna: ver
  /// la validacion en `analizarExcel`. Sin ellas, la EDT sale `sinProgramar`
  /// como hoy; con ellas, `generarEdtDesdePresupuesto` programa la tarea de
  /// una vez.
  fechaInicio: string | null;
  fechaFin: string | null;
  /// Aviso no bloqueante: la fila se importa igual.
  aviso?: string;
}

export interface ErrorImportacion {
  fila: number;
  columna?: string;
  mensaje: string;
}

/**
 * Un costo propio de la meta: tiene importe pero no codigo contractual.
 *
 * No es una `FilaImportada` recortada: le faltan a proposito el codigo, el
 * tipo y el nivel, que son lo que ubica una partida en el arbol. Esta no va
 * a ningun arbol.
 */
export interface FilaPropiaDeLaMeta {
  fila: number;
  descripcion: string;
  unidad: string | null;
  metrado: string | null;
  precioUnitario: string | null;
  parcial: string | null;
}

export interface ResultadoAnalisis {
  filas: FilaImportada[];
  errores: ErrorImportacion[];
  filaCabecera: number | null;
  columnasDetectadas: Record<string, string>;
  totalCapitulos: number;
  totalPartidas: number;
  montoTotal: string;
  /// El mismo total contando una sola vez cada grupo de importes repetidos.
  montoSinRepetidos: string;
  /// Rachas de filas consecutivas con importe identico.
  gruposRepetidos: GrupoRepetido[];
  /// Filas de texto sin codigo: notas, subtitulos y clausulas del contrato.
  filasTextoOmitidas: number;
  /**
   * Costos con cifras pero SIN codigo, para la hoja de la meta.
   *
   * Solo se rellena con `opciones.propiasDeLaMeta`. Son los costos reales que
   * el contrato no desglosa -un andamio alquilado, un encofrado metalico
   * compartido por varias partidas-: cuentan en lo que cuesta la obra, pero no
   * tienen linea propia en el presupuesto del cliente.
   *
   * Van APARTE de `filas` a proposito. `FilaImportada.codigo` es obligatorio
   * porque el arbol del presupuesto se ordena y se anida por el; estas no
   * entran en ese arbol, y hacerlo nullable obligaria a que cada consumidor
   * del importador se preguntara que hacer con una partida sin sitio.
   */
  propiasDeLaMeta: FilaPropiaDeLaMeta[];
  /**
   * Filas cuya descripcion no cabia y se guardo recortada.
   *
   * Van APARTE del `aviso` de cada fila, aunque tambien se anote alli: los
   * avisos por fila no llegan hoy a ninguna pantalla, y este recorte SI tiene
   * que verse -es texto del presupuesto que ya no esta-. Se lleva el numero
   * de fila del Excel, que es lo unico con lo que alguien puede ir a mirarla.
   */
  descripcionesRecortadas: number[];
  /// Partidas ocultas en el Excel: quedaron fuera de alcance y no se importan.
  filasOcultas: number;
  /// Importe que suman esas partidas ocultas, para que se vea que se dejo fuera.
  importeOculto: string;
}

/** Numeros separados por punto: "4", "4.3", "01.02.01". */
const CODIGO_VALIDO = /^\d+(\.\d+)*$/;

/**
 * Lo que aguanta cada columna de texto en la base, copiado de `WbsItem`.
 *
 * ESTAN AQUI PORQUE EL EXCEL LO ESCRIBE UNA PERSONA. El 20/08/2026 una
 * importacion desde la plantilla oficial murio con la pantalla de error
 * generica: `descripcion` se recortaba antes de guardar, pero `unidad` y
 * `codigoPartida` viajaban enteros contra un VarChar(20) y un VarChar(32).
 * Una unidad tecleada de mas —"m2 de muro tarrajeado"— y MariaDB responde
 * «Data too long», que nadie capturaba.
 *
 * Se comprueba AQUI, al analizar, y no solo al guardar: en la vista previa
 * todavia se puede decir QUE fila es. Un fallo en la insercion solo puede
 * decir que algo salio mal.
 *
 * Si cambian en `prisma/schema.prisma`, cambian aqui.
 */
const MAX_UNIDAD = 20;
const MAX_CODIGO = 32;

/**
 * Lo que aguanta la descripcion, y por que su fallo era el mas caro de los tres.
 *
 * `PresupuestoMetaItem.descripcion` y `WbsItem.descripcion` son ambas
 * VarChar(500). Hasta el 27 de agosto de 2026 este limite NO se miraba aqui:
 * el codigo y la unidad si, la descripcion no. Y una descripcion larga no da
 * un error de fila como los otros dos —llega hasta el `createMany`, MariaDB
 * responde P2000 y la EXCEPCION SE COME LA PANTALLA ENTERA—: quien adjuntaba
 * el Excel en el alta de obra veia «Esta pantalla no se pudo cargar», sin
 * mencion del archivo ni de la fila.
 *
 * Paso con un presupuesto real de 400 partidas donde ocho traian el alcance
 * tecnico completo dentro de la celda de descripcion —la mayor, 1264
 * caracteres con la lista de llaves y diferenciales de un tablero—. Es lo
 * normal en un presupuesto de verdad, no un archivo mal hecho.
 *
 * Se RECORTA y se avisa, como la unidad: la partida y su importe valen mas
 * que el parrafo de alcance, y perder el presupuesto entero por un texto
 * largo es la peor de las opciones. Las filas recortadas viajan en
 * `descripcionesRecortadas` para que la pantalla pueda nombrarlas.
 */
const MAX_DESCRIPCION = 500;

export interface Combinacion {
  /// Fila que posee el valor; el resto lo comparten.
  maestra: number;
  ultima: number;
}

/**
 * Localiza las celdas combinadas verticalmente en las columnas de cifras.
 *
 * Una combinacion vertical significa que varias filas COMPARTEN un unico
 * importe: es una partida contratada a suma alzada cuyo alcance se detalla
 * en varias lineas. En el presupuesto de CRIOCORD, el paquete de drywall
 * ocupa nueve filas que comparten un solo precio de 79.727,33.
 *
 * Es la senal autoritativa, y sustituye a adivinarlo comparando importes
 * iguales: dos partidas distintas pueden costar lo mismo de forma legitima,
 * y confundirlas descuadraria el presupuesto.
 */
function detectarCombinaciones(
  hoja: ExcelJS.Worksheet,
  columnas: number[],
): Map<number, Combinacion> {
  const modelo = hoja.model as unknown as { merges?: string[] };
  const rangos = modelo.merges ?? [];

  const letras = new Set(columnas.map((c) => letraDeColumna(c)));
  const porFila = new Map<number, Combinacion>();

  for (const rango of rangos) {
    const [inicio, fin] = rango.split(":");
    const a = /^([A-Z]+)(\d+)$/.exec(inicio ?? "");
    const b = /^([A-Z]+)(\d+)$/.exec(fin ?? "");
    if (!a || !b) continue;

    const desde = Number(a[2]);
    const hasta = Number(b[2]);

    // Solo las verticales que tocan una columna de cifras.
    if (hasta <= desde || !letras.has(a[1]!)) continue;

    for (let n = desde; n <= hasta; n++) {
      porFila.set(n, { maestra: desde, ultima: hasta });
    }
  }

  return porFila;
}

function letraDeColumna(indice: number): string {
  let n = indice;
  let letra = "";
  while (n > 0) {
    const resto = (n - 1) % 26;
    letra = String.fromCharCode(65 + resto) + letra;
    n = Math.floor((n - 1) / 26);
  }
  return letra;
}

/**
 * Sinonimos de cabecera aceptados.
 *
 * Los presupuestos peruanos suelen venir de S10, pero cada oficina retoca
 * los titulos. Se acepta la variedad real en vez de exigir una plantilla
 * exacta, que es lo que hace que un importador no se use nunca.
 */
const ALIAS: Record<string, string[]> = {
  // Los alias van sin tildes ni simbolos: la cabecera leida se normaliza
  // antes de comparar, asi que "Descripcion", "Descripción" y "DESCRIPCION"
  // acaban siendo la misma cadena.
  codigo: ["item", "codigo", "cod", "nro", "n", "no", "num"],
  descripcion: ["descripcion", "partida", "detalle", "concepto", "actividad"],
  unidad: ["und", "und.", "unidad", "u.m.", "um", "medida", "unid"],
  metrado: ["metrado", "cantidad", "cant", "cant.", "metrados"],
  precioUnitario: ["precio unitario", "p.u.", "pu", "precio", "unitario", "costo unitario"],
  parcial: ["parcial", "subtotal", "importe", "total", "monto"],
  // Solo lo llevan los capitulos: cuanto se recarga ese capitulo del
  // presupuesto real para llegar al contractual. El nombre esta escogido
  // para no chocar con los alias de arriba: llamarla "Total contractual"
  // habria hecho que se leyera como el parcial, e importar el presupuesto
  // ya inflado.
  recargo: ["% recargo", "recargo", "porcentaje recargo", "recargo %"],
  // Opcionales: si no aparecen, la EDT se genera igual que hoy (sin
  // programar). Van al final de la plantilla, nunca en medio, porque
  // `formulaContractual` referencia columnas por letra fija.
  fechaInicio: ["fecha inicio", "f. inicio", "f inicio", "inicio"],
  fechaFin: ["fecha fin", "f. fin", "f fin", "fin", "termino", "término"],
};

/**
 * Rango Unicode de tildes y diacriticos combinantes (U+0300 a U+036F).
 *
 * Se construye desde texto y no como literal `/[...]/` a proposito: con los
 * caracteres escritos directamente, cualquier reguardado del archivo en
 * otra codificacion invierte el rango y rompe la expresion.
 */
const DIACRITICOS = new RegExp("[\\u0300-\\u036f]", "g");

/** Simbolos de grado y ordinal: aparecen en cabeceras como "N°" o "Nº". */
const ORDINALES = new RegExp("[\\u00b0\\u00ba]", "g");

function normalizarTexto(valor: unknown): string {
  return (
    String(valor ?? "")
      .trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(DIACRITICOS, "")
      .replace(ORDINALES, "")
      // Guiones y guiones bajos se eliminan: "SUB-TOTAL" y "SUBTOTAL" son
      // la misma columna, y separarlas hacia fallar la deteccion en
      // presupuestos reales.
      .replace(/[-_]/g, "")
      // Espacios repetidos a uno solo.
      .replace(/\s+/g, " ")
      .trim()
  );
}

/** Extrae el texto de una celda, resolviendo formulas y texto enriquecido. */
function textoCelda(celda: ExcelJS.Cell | undefined): string {
  if (!celda) return "";
  const v = celda.value;

  if (v === null || v === undefined) return "";
  if (typeof v === "object") {
    if ("result" in v) return String(v.result ?? "").trim();
    if ("richText" in v) return v.richText.map((r) => r.text).join("").trim();
    if ("text" in v) return String(v.text).trim();
  }
  return String(v).trim();
}

/** Valor crudo de una celda, resolviendo formulas. */
function valorCelda(celda: ExcelJS.Cell | undefined): unknown {
  if (!celda) return null;
  const v = celda.value;
  if (v !== null && typeof v === "object" && "result" in v) return v.result;
  return v;
}

/**
 * Lee una celda de fecha como "YYYY-MM-DD", o null si esta vacia o no es
 * una fecha.
 *
 * ExcelJS decodifica la fecha serial de Excel como un `Date` en UTC —no
 * lleva zona horaria propia, el numero de serie es solo un dia de
 * calendario—, asi que se formatea con los getters UTC. Usar los locales
 * aqui repetiria el mismo desfase que ya documenta `diaLocal` en
 * `cronograma-manual.service.ts`: en Peru (UTC-5) un `Date` a medianoche
 * UTC cae en las 19:00 del dia anterior, y `getDate()` devolveria ese dia
 * de menos.
 */
type LecturaFecha =
  | { estado: "vacia" }
  | { estado: "ok"; fecha: string }
  /// Habia algo escrito y no se pudo entender como fecha. NO se ignora.
  | { estado: "ilegible"; escrito: string };

/// dd/mm/aaaa y d-m-aaaa, con barra, guion o punto. Es como se escribe una
/// fecha en obra; el ano de dos cifras se rechaza a proposito, porque "10/08/26"
/// puede ser 1926 o 2026 y adivinarlo en un contrato no es aceptable.
const FECHA_TECLEADA = /^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})$/;

/// aaaa-mm-dd, que es lo que sale al exportar de casi cualquier sistema.
const FECHA_ISO = /^(\d{4})-(\d{1,2})-(\d{1,2})$/;

function armar(anio: number, mes: number, dia: number): string | null {
  // Se reconstruye y se compara: asi un 31 de febrero no se convierte en
  // marzo sin que nadie se entere.
  const d = new Date(Date.UTC(anio, mes - 1, dia));
  if (
    d.getUTCFullYear() !== anio ||
    d.getUTCMonth() !== mes - 1 ||
    d.getUTCDate() !== dia
  ) {
    return null;
  }
  const mm = String(mes).padStart(2, "0");
  const dd = String(dia).padStart(2, "0");
  return `${anio}-${mm}-${dd}`;
}

function leerFechaDetallada(valor: unknown): LecturaFecha {
  if (valor instanceof Date && !Number.isNaN(valor.getTime())) {
    const anio = valor.getUTCFullYear();
    const mes = String(valor.getUTCMonth() + 1).padStart(2, "0");
    const dia = String(valor.getUTCDate()).padStart(2, "0");
    return { estado: "ok", fecha: `${anio}-${mes}-${dia}` };
  }

  if (valor === null || valor === undefined) return { estado: "vacia" };

  /**
   * Una fecha ESCRITA COMO TEXTO tambien vale.
   *
   * Pasa constantemente: se pega desde otro archivo, o la columna quedo con
   * formato de texto y Excel guarda "01/08/2026" como cadena. Hasta hoy eso
   * se descartaba EN SILENCIO -la partida entraba sin fechas y nadie se
   * enteraba hasta ver la EDT sin programar-, que es la peor forma de fallar:
   * el usuario cree que las cargo.
   */
  const texto = String(valor).trim();
  if (texto === "") return { estado: "vacia" };

  const tecleada = FECHA_TECLEADA.exec(texto);
  if (tecleada) {
    const fecha = armar(
      Number(tecleada[3]),
      Number(tecleada[2]),
      Number(tecleada[1]),
    );
    return fecha ? { estado: "ok", fecha } : { estado: "ilegible", escrito: texto };
  }

  const iso = FECHA_ISO.exec(texto);
  if (iso) {
    const fecha = armar(Number(iso[1]), Number(iso[2]), Number(iso[3]));
    return fecha ? { estado: "ok", fecha } : { estado: "ilegible", escrito: texto };
  }

  return { estado: "ilegible", escrito: texto };
}

/**
 * Localiza la fila de cabecera y a que campo corresponde cada columna.
 *
 * No se asume que la cabecera este en la fila 1: las exportaciones de S10
 * traen titulo de obra, cliente y fecha antes de la tabla.
 */
function detectarCabecera(
  hoja: ExcelJS.Worksheet,
  /**
   * En modo estructura basta con codigo y descripcion.
   *
   * Se pide una columna de cifras para no confundir con una tabla de
   * presupuesto cualquier lista que tenga un numero y un texto al lado. Pero
   * quien sube SOLO la estructura puede traer justo eso -codigo y
   * descripcion- y exigirle una columna de metrado que no tiene seria
   * rechazarle el archivo por no traer lo que hemos dicho que no hace falta.
   */
  soloEstructura = false,
): {
  filaCabecera: number | null;
  mapa: Map<string, number>;
} {
  const limite = Math.min(hoja.rowCount, 30);

  for (let n = 1; n <= limite; n++) {
    const fila = hoja.getRow(n);
    const mapa = new Map<string, number>();
    const usadas = new Set<number>();

    // Se resuelven primero los campos mas especificos: "precio unitario"
    // antes que "precio", y "descripcion" antes que "partida", que aparece
    // como sinonimo en dos campos distintos.
    const orden = [
      "metrado", "precioUnitario", "parcial", "unidad", "codigo", "descripcion",
      "recargo", "fechaInicio", "fechaFin",
    ];

    for (const campo of orden) {
      const alias = ALIAS[campo] ?? [];

      for (let c = 1; c <= Math.min(hoja.columnCount, 40); c++) {
        if (usadas.has(c)) continue;

        const encabezado = normalizarTexto(textoCelda(fila.getCell(c)));
        if (!encabezado) continue;

        const coincide = alias.some(
          (a) => encabezado === a || encabezado.startsWith(`${a} `) || encabezado === `${a}.`,
        );

        if (coincide) {
          mapa.set(campo, c);
          usadas.add(c);
          break;
        }
      }
    }

    // Con codigo, descripcion y al menos un dato economico ya es una tabla
    // de presupuesto reconocible.
    const conCifras = mapa.has("metrado") || mapa.has("precioUnitario");
    if (mapa.has("codigo") && mapa.has("descripcion") && (conCifras || soloEstructura)) {
      return { filaCabecera: n, mapa };
    }
  }

  return { filaCabecera: null, mapa: new Map() };
}

/**
 * Un codigo es de capitulo si termina en `.0` (1.0, 2.0) o si no tiene
 * separador (1, 2). El resto son partidas. El nivel se deduce de la
 * cantidad de segmentos, para soportar tambien el formato S10 de tres o
 * mas niveles ("01.01.02").
 */
function clasificarCodigo(
  codigo: string,
  tieneDatosEconomicos: boolean,
  tieneImporte: boolean,
  /**
   * Solo en modo estructura: si alguna otra fila cuelga de esta.
   *
   * Es la señal que sustituye al dinero cuando no hay dinero. Sin cifras que
   * mirar, lo unico que distingue un titulo de una partida es si algo cuelga
   * de el: `11.01 DRYWALL` agrupa a `11.01.01`, y `11.14.16` no agrupa a
   * nadie, asi que es donde acaba el arbol y donde ira un precio.
   */
  esPadre = false,
  soloEstructura = false,
  /**
   * Si alguna descendiente de esta fila trae importe propio.
   *
   * Es lo que distingue un SUBTOTAL de un PRECIO cuando los dos vienen
   * escritos igual. Ver `cubiertosPorDescendientes`.
   */
  cubiertaPorHijas = false,
): { tipo: TipoFila; nivel: number } {
  const segmentos = codigo.split(".");
  const ultimo = segmentos.at(-1) ?? "";
  const nivel = Math.max(0, segmentos.length - 1);

  /*
   * EN MODO ESTRUCTURA MANDA EL CODIGO Y NADA MAS.
   *
   * Se sale antes de mirar `tieneImporte`, porque en este modo no se lee
   * ninguno; y antes de la regla S10 de «sin datos economicos es un
   * subtitulo», que aqui clasificaria el presupuesto ENTERO como titulos:
   * es justo lo que impedia cargar un presupuesto sin precios.
   *
   * Capitulo es lo que agrupa (`esPadre`) y lo que lo dice por convencion
   * -un solo segmento, o terminado en cero como `7.02.00`-. El resto son
   * hojas del arbol, y una hoja es una partida a la que se le podra poner
   * su unidad, su cantidad y su precio dentro de GCM.
   */
  if (soloEstructura) {
    /*
     * LA CABECERA DE UN GRUPO VIVE UN ESCALON POR ENCIMA DE SU CONTENIDO.
     *
     * `7.02.00 REDES DE DESAGUE` y `7.02.01 Corte de piso` tienen los mismos
     * tres segmentos, asi que contando puntos salen al MISMO nivel: el arbol
     * quedaba plano y las trece partidas del bloque no seguian a su cabecera
     * al moverla. Se vio en el ensayo con un presupuesto real.
     *
     * El cero final es lo que la delata: `7.02.00` es la cabecera del grupo
     * `7.02`, asi que su sitio es el de `7.02` -un escalon mas afuera- y las
     * `7.02.xx` cuelgan de ella. Igual con `8.01.0` sobre `8.01.2`.
     */
    const ultimoEsCero = segmentos.length > 1 && Number(ultimo) === 0;
    const nivelReal = ultimoEsCero ? Math.max(0, nivel - 1) : nivel;

    if (esPadre || ultimoEsCero || segmentos.length === 1) {
      return { tipo: "CAPITULO", nivel: nivelReal };
    }
    return { tipo: "PARTIDA", nivel: nivelReal };
  }

  if (esPadre) return { tipo: "CAPITULO", nivel };

  /*
   * Si la fila lleva un importe propio, es costeable, y manda sobre
   * cualquier convencion de codigo. En los presupuestos reales hay grupos
   * como "7.02.00 REDES DE DESAGUE" que llevan el precio del subcontrato a
   * suma alzada mientras sus hijas solo detallan el alcance. Tratarlos como
   * capitulo por terminar en cero descartaria ese dinero.
   *
   * SALVO EN MODO ESTRUCTURA, donde ese importe no se va a traer: mirarlo
   * aqui convertiria «7.02.00 REDES DE DESAGUE» en una partida que espera un
   * precio, cuando lo que es -y lo que su codigo dice que es- es el titulo
   * del grupo que tiene debajo. El dinero del archivo no decide nada cuando
   * el dinero del archivo no se importa.
   */
  /*
   * SU CIFRA ES UN SUBTOTAL, no un precio: agrupa.
   *
   * Va ANTES de `tieneImporte` y por eso una plantilla puede enseñar el total
   * de cada capitulo en su cabecera sin que el presupuesto se cuente dos
   * veces al volver a subirla. Tambien recoge los presupuestos ajenos que
   * traen subtotales por capitulo, que son casi todos.
   *
   * No pisa el caso de al lado -«7.02.00 REDES DE DESAGUE» con el precio del
   * subcontrato y sus hijas describiendo alcance sin cifra-: alli ninguna
   * hija tiene importe, asi que la fila no esta cubierta y sigue siendo la
   * partida costeada que es. La diferencia la marca lo que hay DEBAJO, no la
   * forma del codigo.
   */
  if (cubiertaPorHijas && !soloEstructura) {
    return { tipo: "CAPITULO", nivel };
  }

  if (tieneImporte && !soloEstructura) {
    return { tipo: "PARTIDA", nivel };
  }

  // Convencion explicita: un solo segmento ("1") o terminacion en cero
  // ("4.0") es capitulo.
  if (segmentos.length === 1 || Number(ultimo) === 0) {
    return { tipo: "CAPITULO", nivel };
  }

  /*
   * Señal de contenido: en el formato S10 los niveles intermedios como
   * "01.02" son subtitulos que agrupan, sin metrado ni precio. Una fila sin
   * datos economicos agrupa; no es una partida a la que se le pueda exigir
   * un metrado.
   *
   * NO EN MODO ESTRUCTURA, donde ninguna fila trae datos economicos y esta
   * regla convertiria el presupuesto entero en titulos. Alli ya se decidio
   * arriba: agrupa lo que tiene hijas o lo dice su codigo, y el resto son
   * partidas -aunque lleguen sin unidad y sin cantidad, que es exactamente lo
   * que se pidio que no diera error-.
   */
  if (!tieneDatosEconomicos && !soloEstructura) {
    return { tipo: "CAPITULO", nivel };
  }

  return { tipo: "PARTIDA", nivel };
}

export interface OpcionesAnalisis {
  /**
   * Recoger las filas con cifras y sin codigo en vez de descartarlas.
   *
   * Se enciende SOLO para la hoja de la meta. En el importador del
   * presupuesto contractual una fila sin codigo sigue siendo una nota o un
   * subtitulo, y recogerla ahi meteria texto suelto en el arbol de partidas.
   */
  propiasDeLaMeta?: boolean;
  /**
   * SOLO LA ESTRUCTURA: se trae el arbol y no una sola cifra.
   *
   * Se lee hasta la columna de cantidad -codigo, descripcion, unidad y
   * metrado- y se ignoran el precio unitario y el importe **aunque vengan en
   * el archivo**. Los precios se ponen despues, dentro de GCM.
   *
   * PEDIDO EL 27 DE AGOSTO DE 2026, y resuelve dos cosas de una vez:
   *
   * - **Traerse un presupuesto ajeno sin heredar sus cuentas.** Ese dia se
   *   comparo un presupuesto real contra lo que GCM contaba y no cuadraba:
   *   el Excel dejaba subcapitulos enteros fuera de sus propios totales -les
   *   faltaba la formula- y no restaba sus descuentos comerciales. Importar
   *   solo la estructura corta ese problema de raiz: no hay cifra ajena que
   *   pueda discrepar, porque no se trae ninguna.
   * - **Cargar lo que hoy no se puede cargar.** Sin esto, una fila sin
   *   cifras se clasifica como CAPITULO -convencion del formato S10- y a un
   *   capitulo no se le puede poner importe despues. Un presupuesto sin
   *   precios entraba entero como titulos y no habia forma de valorizarlo.
   *
   * Aqui el tipo se decide SOLO POR EL CODIGO: manda la forma del arbol, no
   * si la fila trae dinero.
   */
  soloEstructura?: boolean;
}

export async function analizarExcel(
  contenido: ArrayBuffer,
  opciones: OpcionesAnalisis = {},
): Promise<ResultadoAnalisis> {
  const libro = new ExcelJS.Workbook();
  await libro.xlsx.load(contenido);

  const hoja = libro.worksheets[0];
  const errores: ErrorImportacion[] = [];

  if (!hoja) {
    return {
      filas: [], errores: [{ fila: 0, mensaje: "El archivo no contiene ninguna hoja." }],
      filaCabecera: null, columnasDetectadas: {}, totalCapitulos: 0,
      totalPartidas: 0, montoTotal: "0.00", montoSinRepetidos: "0.00",
      gruposRepetidos: [], filasTextoOmitidas: 0, propiasDeLaMeta: [],
      descripcionesRecortadas: [], filasOcultas: 0, importeOculto: "0.00",
    };
  }

  const { filaCabecera, mapa } = detectarCabecera(
    hoja,
    opciones.soloEstructura === true,
  );

  if (filaCabecera === null) {
    return {
      filas: [],
      errores: [{
        fila: 0,
        mensaje:
          "No se encontro la tabla de partidas. Se necesitan al menos una columna de codigo, " +
          "una de descripcion y una de metrado o precio unitario.",
      }],
      filaCabecera: null, columnasDetectadas: {}, totalCapitulos: 0,
      totalPartidas: 0, montoTotal: "0.00", montoSinRepetidos: "0.00",
      gruposRepetidos: [], filasTextoOmitidas: 0, propiasDeLaMeta: [],
      descripcionesRecortadas: [], filasOcultas: 0, importeOculto: "0.00",
    };
  }

  const columnasDetectadas: Record<string, string> = {};
  for (const [campo, col] of mapa) {
    columnasDetectadas[campo] = textoCelda(hoja.getRow(filaCabecera).getCell(col)) || `Columna ${col}`;
  }

  const filas: FilaImportada[] = [];
  const codigosVistos = new Map<string, number>();

  /**
   * Que codigos agrupan a otros. Solo hace falta en modo estructura.
   *
   * Se resuelve en una pasada previa porque la respuesta esta MAS ABAJO en el
   * documento: cuando se lee `11.01 DRYWALL` todavia no se sabe que existe
   * `11.01.01`, y sin eso la fila se clasificaria como partida y acabaria
   * pidiendo un precio que nunca va a tener.
   *
   * Se guardan los PREFIJOS, no los codigos: de `11.01.01` salen `11` y
   * `11.01`, que son sus dos padres. Asi la pregunta «¿este agrupa?» es una
   * consulta al conjunto y no un recorrido por fila.
   */
  const codigosPadre = new Set<string>();
  if (opciones.soloEstructura) {
    const columnaCodigo = mapa.get("codigo")!;
    for (let n = filaCabecera + 1; n <= hoja.rowCount; n++) {
      const codigo = textoCelda(hoja.getRow(n).getCell(columnaCodigo)).trim();
      if (!CODIGO_VALIDO.test(codigo)) continue;
      const partes = codigo.split(".");
      for (let i = 1; i < partes.length; i++) {
        codigosPadre.add(partes.slice(0, i).join("."));
      }
    }
  }

  /**
   * Que filas traen un SUBTOTAL en vez de un precio.
   *
   * Misma idea que `codigosPadre` y misma razon para resolverla en una pasada
   * previa: la respuesta esta mas abajo en el documento. Al leer «1.0 CAPITULO
   * I ... 12.765» todavia no se sabe si sus partidas llevan precio, y de eso
   * depende si esos 12.765 son la suma de ellas -y hay que descartarlos- o el
   * precio de un paquete -y hay que conservarlos-.
   *
   * Sin esto, una plantilla que enseñe el total de cada capitulo se cuenta dos
   * veces al volver a subirla, y lo mismo pasa con cualquier presupuesto ajeno
   * que traiga subtotales por capitulo, que son casi todos.
   */
  const cubiertos = ((): ReadonlySet<string> => {
    if (opciones.soloEstructura) return new Set<string>();

    const columnaCodigo = mapa.get("codigo")!;
    const columnaParcial = mapa.get("parcial");
    const columnaMetrado = mapa.get("metrado");
    const columnaPrecio = mapa.get("precioUnitario");

    const nodos: { codigo: string; parcial: string | null }[] = [];
    for (let n = filaCabecera + 1; n <= hoja.rowCount; n++) {
      const fila = hoja.getRow(n);
      const codigo = textoCelda(fila.getCell(columnaCodigo)).trim();
      if (!CODIGO_VALIDO.test(codigo)) continue;

      const leerDec = (col: number | undefined) =>
        col ? normalizarDecimal(valorCelda(fila.getCell(col)), 4) : null;

      // El importe efectivo de la fila: el subtotal si lo trae, y si no, lo
      // que sale de multiplicar. Es el mismo orden que usa el bucle de abajo.
      const parcial = leerDec(columnaParcial);
      const importe =
        parcial ??
        (() => {
          const m = leerDec(columnaMetrado);
          const pu = leerDec(columnaPrecio);
          return m !== null && pu !== null ? multiplicar(m, pu, 2) : null;
        })();

      nodos.push({ codigo, parcial: importe });
    }

    return cubiertosPorDescendientes(nodos);
  })();

  let filasTextoOmitidas = 0;
  const descripcionesRecortadas: number[] = [];
  const propiasDeLaMeta: FilaPropiaDeLaMeta[] = [];
  let filasOcultas = 0;
  const importesOcultos: string[] = [];

  // Filas que comparten un unico importe por estar combinadas en el Excel.
  const combinaciones = detectarCombinaciones(
    hoja,
    ["metrado", "precioUnitario", "parcial"]
      .map((c) => mapa.get(c))
      .filter((c): c is number => c !== undefined),
  );

  /**
   * Ultima fila con un codigo valido.
   *
   * Los presupuestos cierran con totales y con las clausulas contractuales,
   * que son parrafos de texto sin codigo. Delimitar la tabla por aqui evita
   * dos errores opuestos: leer el texto legal como partidas rotas, y cortar
   * la tabla al primer hueco en blanco, que existe entre capitulos y haria
   * perder presupuesto en silencio.
   */
  const colCodigo = mapa.get("codigo")!;
  const colParcial = mapa.get("parcial");
  let ultimaFila = filaCabecera;
  for (let n = filaCabecera + 1; n <= hoja.rowCount; n++) {
    const c = textoCelda(hoja.getRow(n).getCell(colCodigo));
    if (c && CODIGO_VALIDO.test(c)) {
      ultimaFila = n;
      continue;
    }

    /**
     * Con `propiasDeLaMeta`, una fila CON IMPORTE tambien cierra tabla mas
     * abajo aunque no tenga codigo.
     *
     * Sin esto, el bloque de costos propios -que en la plantilla va al final,
     * detras de la ultima partida con codigo- quedaba fuera del recorrido y
     * su dinero desaparecia sin que nada lo dijera. Se exige el IMPORTE, no
     * solo la descripcion: asi las clausulas y los parrafos legales del
     * final siguen sin alargar la tabla, que es lo que este corte protege.
     */
    if (opciones.propiasDeLaMeta && colParcial) {
      const filaN = hoja.getRow(n);
      const importe = normalizarDecimal(valorCelda(filaN.getCell(colParcial)), 2);
      const colUnidad = mapa.get("unidad");
      const colMetrado = mapa.get("metrado");
      // Se exige ademas unidad o metrado: es lo que distingue un costo de la
      // fila de TOTAL del final, que tambien tiene importe y tampoco codigo.
      // Sin esta condicion la tabla se alargaba hasta el total y arrastraba
      // con ella el texto legal que va detras.
      const medible =
        (colUnidad ? textoCelda(filaN.getCell(colUnidad)) : "") !== "" ||
        (colMetrado
          ? normalizarDecimal(valorCelda(filaN.getCell(colMetrado)), 4) !== null
          : false);
      if (importe !== null && medible) ultimaFila = n;
    }
  }

  // Si no hay ningun codigo valido se recorre la hoja entera igualmente.
  // De lo contrario el analisis terminaria sin leer nada y sin explicar por
  // que, que es la peor respuesta posible: el usuario ve cero partidas y
  // ningun motivo.
  if (ultimaFila === filaCabecera) ultimaFila = hoja.rowCount;

  for (let n = filaCabecera + 1; n <= ultimaFila; n++) {
    const fila = hoja.getRow(n);

    const codigo = textoCelda(fila.getCell(mapa.get("codigo")!));
    const descripcion = textoCelda(fila.getCell(mapa.get("descripcion")!));

    /**
     * Las filas ocultas no se importan.
     *
     * En un presupuesto, ocultar una fila es la forma habitual de dejar una
     * partida fuera de alcance sin borrarla, por si vuelve a entrar. Sus
     * formulas de total tampoco la incluyen. Contarla inflaria el
     * presupuesto con trabajo que nadie va a ejecutar.
     */
    if (fila.hidden) {
      const importe = normalizarDecimal(
        mapa.get("parcial") ? valorCelda(fila.getCell(mapa.get("parcial")!)) : null,
        2,
      );
      if (codigo || descripcion) {
        filasOcultas++;
        if (importe) importesOcultos.push(importe);
      }
      continue;
    }

    if (!codigo && !descripcion) continue;

    if (!codigo) {
      /**
       * Una fila SIN codigo pero CON importe, en la hoja de la meta, es un
       * costo propio: algo que cuesta de verdad y que el contrato no
       * desglosa. Antes se descartaba con el resto del texto, asi que ese
       * dinero desaparecia sin decir nada -y el modelo lleva desde el
       * principio preparado para guardarlo (`codigoRef` nulo)-.
       */
      if (opciones.propiasDeLaMeta) {
        const leer = (campo: string, decimales: number) => {
          const col = mapa.get(campo);
          return col ? normalizarDecimal(valorCelda(fila.getCell(col)), decimales) : null;
        };
        const parcial = leer("parcial", 2);
        const metrado = leer("metrado", 4);
        const precioUnitario = leer("precioUnitario", 4);

        const colUnidad = mapa.get("unidad");
        const unidad = colUnidad
          ? textoCelda(fila.getCell(colUnidad)) || null
          : null;

        /**
         * Un costo, no un total.
         *
         * La fila «TOTAL COSTO DIRECTO» del final tambien tiene importe y
         * tampoco tiene codigo, y colarla habria duplicado el presupuesto
         * entero en una sola linea. Se distingue por la FORMA y no por su
         * texto: un costo se mide -lleva unidad, o metrado y precio-, y un
         * total no lleva ninguna de las dos cosas. Mirar la palabra "TOTAL"
         * seria adivinar, y en el Excel de cada empresa se escribe distinto.
         */
        const esCosto =
          (metrado !== null && precioUnitario !== null) ||
          (parcial !== null && unidad !== null);

        if (esCosto) {
          // El mismo tope que en las partidas con codigo: estas se guardan en
          // la MISMA columna, y olvidarlo aqui dejaria media puerta abierta.
          if (descripcion.trim().length > MAX_DESCRIPCION) {
            descripcionesRecortadas.push(n);
          }

          propiasDeLaMeta.push({
            fila: n,
            descripcion: descripcion.trim().slice(0, MAX_DESCRIPCION),
            unidad,
            metrado,
            precioUnitario,
            // Sin parcial escrito se calcula, igual que en cualquier partida:
            // el importe no puede quedarse en null teniendo con que sacarlo.
            parcial: parcial ?? multiplicar(metrado!, precioUnitario!, 2),
          });
          continue;
        }
      }

      // Texto sin codigo: notas, subtitulos, filas de totales y clausulas
      // contractuales, que en los presupuestos reales aparecen intercaladas
      // entre capitulos. Se omiten en silencio y solo se cuentan.
      //
      // Listarlas como errores llenaria el informe de ruido, y un listado
      // ruidoso ensena al usuario a ignorarlo: entonces se pierde tambien
      // el error de verdad.
      filasTextoOmitidas++;
      continue;
    }

    if (!CODIGO_VALIDO.test(codigo)) {
      errores.push({
        fila: n, columna: "codigo",
        mensaje: `Codigo "${codigo}" no valido. Se esperan numeros separados por punto, como 4.3 o 01.02.01.`,
      });
      continue;
    }

    const tieneValor = (campo: string) => {
      const col = mapa.get(campo);
      return col
        ? normalizarDecimal(valorCelda(fila.getCell(col)), 4) !== null
        : false;
    };

    // Cualquiera de los tres convierte la fila en algo costeable o medible.
    // El subtotal cuenta por si solo: en los presupuestos reales hay grupos
    // contratados a suma alzada, con precio pero sin metrado ni unitario.
    const tieneImporte = tieneValor("parcial");
    const tieneDatosEconomicos =
      tieneValor("metrado") || tieneValor("precioUnitario") || tieneImporte;

    if (!descripcion) {
      // Un codigo suelto, sin descripcion ni cifras, es una fila residual
      // del Excel. No aporta nada: se omite como una fila vacia mas.
      if (!tieneDatosEconomicos) continue;

      errores.push({
        fila: n, columna: "descripcion",
        mensaje: `La partida ${codigo} tiene cifras pero le falta la descripcion.`,
      });
      continue;
    }

    // El codigo NO se recorta: es la identidad de la partida —lo que la une
    // al cronograma, a las ordenes y a la linea base— y acortarlo la ataria
    // en silencio a otra. Se rechaza la fila y se dice cual.
    if (codigo.length > MAX_CODIGO) {
      errores.push({
        fila: n, columna: "codigo",
        mensaje: `El codigo "${codigo}" tiene ${codigo.length} caracteres y el maximo son ${MAX_CODIGO}.`,
      });
      continue;
    }

    const duplicado = codigosVistos.get(codigo);
    if (duplicado !== undefined) {
      errores.push({
        fila: n, columna: "codigo",
        mensaje: `El codigo ${codigo} ya aparece en la fila ${duplicado}. Cada partida debe ser unica.`,
      });
      continue;
    }
    codigosVistos.set(codigo, n);

    /**
     * Fechas opcionales de la plantilla. Van juntas o no van: un rango a
     * medias no tiene con que escribirse en el cronograma (ni inicio ni fin
     * admiten nulo alla), a diferencia de metrado/precio, que si son
     * independientes.
     */
    const colInicio = mapa.get("fechaInicio");
    const colFin = mapa.get("fechaFin");
    const leidaInicio: LecturaFecha = colInicio
      ? leerFechaDetallada(valorCelda(fila.getCell(colInicio)))
      : { estado: "vacia" };
    const leidaFin: LecturaFecha = colFin
      ? leerFechaDetallada(valorCelda(fila.getCell(colFin)))
      : { estado: "vacia" };

    // Algo escrito que no se entiende NO se descarta callando. Antes se
    // ignoraba y la partida entraba sin fechas: el usuario creia haberlas
    // cargado y solo se enteraba al ver la EDT entera sin programar.
    const ilegible =
      leidaInicio.estado === "ilegible"
        ? { cual: "fecha inicio", escrito: leidaInicio.escrito }
        : leidaFin.estado === "ilegible"
          ? { cual: "fecha fin", escrito: leidaFin.escrito }
          : null;

    if (ilegible) {
      errores.push({
        fila: n,
        columna: ilegible.cual,
        mensaje:
          `La partida ${codigo} tiene "${ilegible.escrito}" en ${ilegible.cual}, ` +
          `y no se entiende como fecha. Escribela como 01/08/2026 o 2026-08-01, ` +
          `o deja la celda vacia.`,
      });
      continue;
    }

    const fechaInicio = leidaInicio.estado === "ok" ? leidaInicio.fecha : null;
    const fechaFin = leidaFin.estado === "ok" ? leidaFin.fecha : null;

    if ((fechaInicio === null) !== (fechaFin === null)) {
      errores.push({
        fila: n,
        columna: fechaInicio === null ? "fecha inicio" : "fecha fin",
        mensaje:
          `La partida ${codigo} trae ${fechaInicio === null ? "fecha fin" : "fecha inicio"} ` +
          `pero no la otra. Las dos fechas van juntas, o se dejan las dos en blanco.`,
      });
      continue;
    }

    if (fechaInicio !== null && fechaFin !== null && fechaFin < fechaInicio) {
      errores.push({
        fila: n,
        columna: "fecha fin",
        mensaje: `La partida ${codigo} termina (${fechaFin}) antes de empezar (${fechaInicio}).`,
      });
      continue;
    }

    const { tipo, nivel } = clasificarCodigo(
      codigo,
      tieneDatosEconomicos,
      tieneImporte,
      codigosPadre.has(codigo),
      opciones.soloEstructura === true,
      cubiertos.has(codigo),
    );
    const registro = construirFila({
      hoja, fila, n, mapa, codigo, descripcion, tipo, nivel,
      // Las celdas combinadas reparten un IMPORTE, y en modo estructura no se
      // trae ninguno: mirarlas solo serviria para marcar como «alcance» filas
      // que aqui son partidas normales a la espera de su precio.
      combinacion: opciones.soloEstructura ? null : (combinaciones.get(n) ?? null),
      fechaInicio, fechaFin,
      soloEstructura: opciones.soloEstructura === true,
    });

    if (registro) {
      // El recorte lo hace `normalizarDescripcion`; aqui se DEJA CONSTANCIA.
      // Sin esto la partida entraria con el alcance a medias y nadie lo
      // sabria: es justo el fallo silencioso que este proyecto persigue.
      if (descripcion.trim().length > MAX_DESCRIPCION) {
        descripcionesRecortadas.push(n);
        const nota =
          `La descripcion tenia ${descripcion.trim().length} caracteres y se guardo ` +
          `recortada a ${MAX_DESCRIPCION}. Si ahi va el alcance contratado, su sitio ` +
          `son las especificaciones, no el nombre de la partida.`;
        registro.aviso = registro.aviso ? `${registro.aviso} ${nota}` : nota;
      }

      filas.push(registro);
    }
  }

  // Importes que se repiten en filas consecutivas: casi siempre una formula
  // arrastrada en el Excel. Se marcan y se ofrece el total sin ellos, para
  // que el usuario compare y decida.
  const repetidos = detectarImportesRepetidos(filas);

  /// Todas las filas del grupo menos la primera, que si cuenta.
  const filasRepetidas = new Set(repetidos.flatMap((g) => g.filas.slice(1)));

  for (const f of filas) {
    if (!filasRepetidas.has(f.fila)) continue;
    const nota =
      "Importe identico al de la fila anterior: posible formula arrastrada en el Excel.";
    f.aviso = f.aviso ? `${f.aviso} ${nota}` : nota;
  }

  return {
    filas,
    errores,
    filaCabecera,
    columnasDetectadas,
    totalCapitulos: filas.filter((f) => f.tipo === "CAPITULO").length,
    totalPartidas: filas.filter((f) => f.tipo === "PARTIDA").length,
    // Solo las hojas: si un grupo lleva importe propio y sus hijas tambien,
    // sumar ambos contaria el mismo dinero dos veces.
    /**
     * El total cuenta TAMBIEN los costos propios de la meta.
     *
     * Es lo que cuesta la obra, y esos costos cuestan. Dejarlos fuera del
     * total del importador enseñaria una cifra distinta de la que despues
     * guarda la meta -que si los suma-, y dos cifras del mismo dinero en dos
     * pantallas es como empieza a no cuadrar nada.
     */
    montoTotal: sumar(
      [
        sumarHojas(filas),
        ...propiasDeLaMeta.map((f) => f.parcial).filter((v): v is string => v !== null),
      ],
      2,
    ),
    montoSinRepetidos: sumarHojas(
      filas.map((f) =>
        filasRepetidas.has(f.fila) ? { ...f, parcial: null } : f,
      ),
    ),
    gruposRepetidos: repetidos,
    filasTextoOmitidas,
    propiasDeLaMeta,
    // Ordenadas: se leen como se recorre el Excel, de arriba abajo. Las
    // partidas con codigo y los costos propios se apuntan en dos sitios
    // distintos del bucle, asi que sin esto saldrian entremezcladas.
    descripcionesRecortadas: [...descripcionesRecortadas].sort((a, b) => a - b),
    filasOcultas,
    importeOculto: sumar(importesOcultos),
  };
}

interface ArgsFila {
  hoja: ExcelJS.Worksheet;
  fila: ExcelJS.Row;
  n: number;
  mapa: Map<string, number>;
  codigo: string;
  descripcion: string;
  tipo: TipoFila;
  nivel: number;
  /// Si la fila comparte importe con otras por estar combinada en el Excel.
  combinacion: Combinacion | null;
  /// Ya leidas y validadas por quien llama (van juntas o ninguna).
  fechaInicio: string | null;
  fechaFin: string | null;
  /// Se trae el arbol y ni una cifra de dinero. Ver `OpcionesAnalisis`.
  soloEstructura?: boolean;
}

/**
 * Normaliza la descripcion al importar, segun el tipo de fila.
 *
 * Capitulo: TODO en mayuscula, porque es un titulo. Partida: mayuscula
 * SOLO la primera letra, respetando el resto tal cual para no destrozar
 * siglas ni unidades legitimas de construccion (PVC, SAP, m2, kg).
 */
function normalizarDescripcion(texto: string, tipo: TipoFila): string {
  // El recorte va ANTES de las mayusculas: asi lo que se guarda mide lo que
  // se prometio medir pase lo que pase con el idioma.
  const limpio = texto.trim().slice(0, MAX_DESCRIPCION);
  if (!limpio) return limpio;
  if (tipo === "CAPITULO") return limpio.toLocaleUpperCase("es");
  return limpio.charAt(0).toLocaleUpperCase("es") + limpio.slice(1);
}

function construirFila(args: ArgsFila): FilaImportada | null {
  const { fila, n, mapa, codigo, descripcion, tipo, nivel, combinacion, fechaInicio, fechaFin } = args;
  const desc = normalizarDescripcion(descripcion, tipo);

  const leer = (campo: string) => {
    const col = mapa.get(campo);
    return col ? valorCelda(fila.getCell(col)) : null;
  };

  /**
   * SOLO LA ESTRUCTURA: hasta la columna de cantidad y ni un paso mas.
   *
   * Se corta aqui, antes de cualquier cuenta, y por eso no hay forma de que
   * una cifra del archivo se cuele: no se leen ni el precio unitario ni el
   * importe AUNQUE el Excel los traiga. La unidad y el metrado si viajan
   * -son medida, no dinero- y pueden faltar sin que pase nada: es una
   * partida a la que todavia no se le ha puesto nada, no un error.
   *
   * Tampoco se avisa de lo que falta. En este modo falta TODO a proposito, y
   * un aviso por linea seria un aviso en cada linea: lo que hay que contar
   * -cuantas partidas esperan precio- se dice una sola vez en la pantalla.
   */
  if (args.soloEstructura) {
    return {
      fila: n, codigo, tipo,
      modalidad: "PRECIOS_UNITARIOS",
      descripcion: desc, nivel,
      unidad: (String(leer("unidad") ?? "").trim().slice(0, MAX_UNIDAD)) || null,
      metrado: normalizarDecimal(leer("metrado"), 2),
      precioUnitario: null,
      parcial: null,
      porcentajeRecargo: normalizarDecimal(leer("recargo"), 2),
      fechaInicio, fechaFin,
    };
  }

  // Los capitulos solo agrupan: su importe es la suma de sus partidas y no
  // se toma del Excel, donde suele venir como subtotal ya calculado. Una
  // fecha en un capitulo se guarda igual (no se prohibe) pero no se usa mas
  // adelante: solo las hojas llegan a tener tarea propia en la EDT.
  if (tipo === "CAPITULO") {
    return {
      fila: n, codigo, tipo, modalidad: "PRECIOS_UNITARIOS", descripcion: desc, nivel,
      unidad: null, metrado: null, precioUnitario: null, parcial: null,
      porcentajeRecargo: normalizarDecimal(leer("recargo"), 2),
      fechaInicio, fechaFin,
    };
  }

  /**
   * Fila cubierta por una celda combinada.
   *
   * El importe pertenece al bloque entero, no a esta linea: al leerla, Excel
   * devuelve el valor de la celda maestra, y contarlo aqui multiplicaria el
   * presupuesto por el numero de filas combinadas. Esta linea solo describe
   * parte del alcance de la partida a suma alzada que encabeza el bloque.
   */
  if (combinacion && n !== combinacion.maestra) {
    const cuantas = combinacion.ultima - combinacion.maestra + 1;
    return {
      fila: n, codigo, tipo, modalidad: "ALCANCE", descripcion: desc, nivel,
      unidad: null, metrado: null, precioUnitario: null, parcial: null,
      porcentajeRecargo: null,
      fechaInicio, fechaFin,
      aviso: `Comparte importe con las filas ${combinacion.maestra} a ${combinacion.ultima} (${cuantas} lineas a suma alzada).`,
    };
  }

  // La unidad se RECORTA, no descarta la fila: es una etiqueta, y perder la
  // partida entera por ella se llevaria por delante su importe. El aviso de
  // abajo deja constancia de que se toco.
  const unidadEntera = String(leer("unidad") ?? "").trim();
  const unidadTexto = unidadEntera.slice(0, MAX_UNIDAD);
  const metrado = normalizarDecimal(leer("metrado"), 2);
  const precioUnitario = normalizarDecimal(leer("precioUnitario"), 2);
  const parcialArchivo = normalizarDecimal(leer("parcial"), 2);

  const avisos: string[] = [];
  let parcial: string | null = null;

  /**
   * El subtotal del archivo MANDA sobre el calculo.
   *
   * Es la cifra pactada en el presupuesto, y en los documentos reales no
   * siempre equivale a metrado x precio unitario: hay partidas contratadas
   * en bloque donde el precio es del paquete completo y la cantidad es
   * informativa. En el presupuesto de CRIOCORD la formula de esas filas es
   * literalmente "=F225", sin multiplicar por la cantidad.
   *
   * Recalcularlas y sobrescribir el importe acordado inflaba el
   * presupuesto en varios millones. Se respeta el documento y, si el
   * calculo discrepa, se avisa para que alguien lo revise.
   */
  if (parcialArchivo !== null) {
    parcial = parcialArchivo;

    if (metrado !== null && precioUnitario !== null) {
      const calculado = multiplicar(metrado, precioUnitario, 2);
      if (calculado !== null && calculado !== parcialArchivo) {
        avisos.push(
          `El importe del archivo (${parcialArchivo}) no es metrado x precio (${calculado}). Se respeta el del archivo.`,
        );
      }
    } else {
      avisos.push("Importe a suma alzada, sin metrado o sin precio unitario.");
    }
  } else if (metrado !== null && precioUnitario !== null) {
    // Sin subtotal en el archivo, se calcula.
    parcial = multiplicar(metrado, precioUnitario, 2);
  }

  // Invariante garantizada por quien llama: una fila sin ningun dato
  // economico se clasifica como CAPITULO y ya salio arriba. Aqui siempre
  // hay al menos metrado, precio o importe.

  if (parcial === null) {
    avisos.push(
      metrado !== null
        ? "Sin precio unitario: se importa como desglose de alcance dentro de una partida a suma alzada."
        : "Sin metrado: no se puede calcular el importe de esta partida.",
    );
  }

  if (!unidadTexto && metrado !== null) {
    avisos.push("Sin unidad de medida. Conviene completarla.");
  }

  if (unidadEntera.length > MAX_UNIDAD) {
    avisos.push(
      `La unidad "${unidadEntera}" pasa de ${MAX_UNIDAD} caracteres y se guardo como "${unidadTexto}". ` +
        `La unidad es una abreviatura (m2, kg, glb); si ahi va alcance, su sitio es la descripcion.`,
    );
  }

  if (combinacion) {
    const cuantas = combinacion.ultima - combinacion.maestra + 1;
    avisos.push(
      `Importe unico compartido con ${cuantas - 1} linea(s) mas, hasta la fila ${combinacion.ultima}.`,
    );
  }

  return {
    fila: n, codigo, tipo,
    // Encabezar un bloque combinado es la definicion de suma alzada: un
    // precio cerrado que cubre todo el alcance descrito debajo.
    modalidad: combinacion
      ? "SUMA_ALZADA"
      : deducirModalidad({ metrado, precioUnitario, parcial, unidad: unidadTexto }),
    descripcion: desc, nivel,
    unidad: unidadTexto || null,
    metrado, precioUnitario, parcial,
    /*
     * UNA PARTIDA TAMBIEN PUEDE LLEVAR SU RECARGO.
     *
     * Esta linea decia `null` fijo, y era el tercer sitio -despues de la
     * celda del Excel y del servicio que guarda- donde el recargo por partida
     * estaba cerrado sin motivo. `generarContractual` siempre supo aplicarlo:
     * resuelve empezando por el codigo de la PROPIA linea y solo sube al
     * padre si esa no lo trae.
     *
     * Reportado el 23 de agosto de 2026: un 10 % escrito en la fila de la
     * partida 1.1 desaparecia al importar, sin un solo aviso.
     */
    porcentajeRecargo: normalizarDecimal(leer("recargo"), 2),
    fechaInicio, fechaFin,
    ...(avisos.length > 0 ? { aviso: avisos.join(" ") } : {}),
  };
}

/** Unidades que en la practica significan "precio cerrado por el conjunto". */
const UNIDADES_GLOBALES = new Set(["glb", "glb.", "glob", "global", "und.glb", "glg"]);

/**
 * Deduce como esta contratada la partida.
 *
 * La senal decisiva es si el importe se explica por metrado x precio. Si no
 * se explica, o si no hay con que calcularlo, el precio esta cerrado por el
 * conjunto y el metrado es referencial.
 */
function deducirModalidad(d: {
  metrado: string | null;
  precioUnitario: string | null;
  parcial: string | null;
  unidad: string;
}): Modalidad {
  // Metrado sin importe ni precio: describe el alcance de la partida padre.
  if (d.parcial === null && d.precioUnitario === null && d.metrado !== null) {
    return "ALCANCE";
  }

  if (d.parcial !== null && d.metrado !== null && d.precioUnitario !== null) {
    const calculado = multiplicar(d.metrado, d.precioUnitario, 2);
    // El importe no se explica por la multiplicacion: es un precio cerrado.
    if (calculado !== d.parcial) return "SUMA_ALZADA";
  }

  // Precio cerrado sin metrado o sin unitario con que descomponerlo.
  if (d.parcial !== null && (d.metrado === null || d.precioUnitario === null)) {
    return "SUMA_ALZADA";
  }

  // Unidad global: el precio cubre el conjunto aunque la cantidad sea 1.
  if (UNIDADES_GLOBALES.has(d.unidad.trim().toLowerCase())) {
    return "SUMA_ALZADA";
  }

  return "PRECIOS_UNITARIOS";
}
