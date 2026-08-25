import { esCero, esPositivo, porcentajeDe } from "./decimal";
import { fechaCsv } from "./informe-documento";
import type {
  CapituloDeLaBrecha,
  DatosCsvInforme,
  EconomiaDelInforme,
} from "./informe-documento";
import type { ElementoPdf, OpcionesPdf, PaginaPdf, TintaPdf } from "./informe-pdf";
import { ETIQUETA_CNC } from "./plan-semanal";
import { aWinAnsi, partirEnLineas, type Medir } from "./pdf-texto";

/**
 * Control economico y Last Planner: la hoja que GCM aporta.
 *
 * Es la unica de las cinco que NO existe en el informe del cliente. Traduce a
 * PDF `docs/informe-plantillas/hojas/control.fix.html`, que se rehizo entera
 * despues de que un revisor la reprobara por dos motivos que conviene no
 * repetir aqui:
 *
 * 1. **Duplicaba la hoja de resumen.** Avance, capitulos, alertas y curva ya
 *    estan en la primera pagina. Lo que justifica esta hoja es el cruce que
 *    ninguna otra hace: cuanto se ha CONSTRUIDO contra cuanto se ha
 *    COMPROMETIDO. Esa distancia es el sobregiro proyectado, y es lo unico
 *    que avisa ANTES de que el sobrecosto sea real.
 * 2. **Rellenaba el Last Planner con datos de muestra** cuando la obra no
 *    tenia ni una semana cerrada. Aqui no: si no hay PPC, se dibuja el hueco
 *    y se explica. Un dato que no existe no se rellena.
 *
 * Como el resto de la maquetacion: QUE cae y DONDE, sin pintar y sin nombrar
 * un color. El origen de coordenadas esta ABAJO a la izquierda.
 */

export interface DatosControl {
  obra: string;
  empresa: string;
  fechaCorte: Date;
  /// El avance fisico al corte, en texto, como lo trae el informe.
  real: string;
  economia: EconomiaDelInforme | null;
  /**
   * DONDE se abre la brecha, capitulo a capitulo.
   *
   * El revisor del diseño lo dejo anotado: la hoja enseñaba el cruce SOLO en
   * global, y una cifra global dice que hay un problema sin decir donde.
   * Vacio -o sin permiso de ordenes- y este bloque no se pinta.
   */
  cruce?: readonly CapituloDeLaBrecha[];
  lastPlanner: DatosCsvInforme["lastPlanner"];
}

/**
 * Cuantos capitulos de la brecha caben legibles. Los peores primero: el resto
 * se mira en pantalla, que no tiene tope de papel.
 *
 * Dos cifras porque el ancho de la columna depende de si hay Last Planner que
 * dibujar. Cuando no lo hay, el dinero se lleva la hoja entera y caben mas: es
 * justo el hueco que antes se quedaba en blanco.
 */
const CAPITULOS_DE_LA_BRECHA = 5;
const CAPITULOS_DE_LA_BRECHA_ANCHO = 12;

/// Un porcentaje en texto, acotado a 0..100 y tolerante con la basura: una
/// cifra ilegible se dibuja como cero, nunca como NaN.
function pct(valor: string): number {
  const n = Number(valor);
  if (!Number.isFinite(n)) return 0;
  return Math.min(100, Math.max(0, n));
}

/**
 * Que porcentaje del presupuesto esta comprometido.
 *
 * Se calcula con la aritmetica de importes del proyecto y no con `Number`: son
 * dos cifras de dinero, y dividirlas en coma flotante es exactamente el error
 * que `lib/decimal` existe para evitar. Devuelve `null` cuando no se puede
 * calcular —presupuesto cero, importe ilegible—, y entonces la hoja lo dice.
 */
export function porcentajeComprometido(e: EconomiaDelInforme): number | null {
  return porcentajeDe(e.comprometido, e.presupuesto);
}

/// Soles con separador de miles, que es como se leen en un informe impreso.
function soles(importe: string): string {
  const n = Number(importe);
  if (!Number.isFinite(n)) return importe;
  return `S/ ${n.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function hojaControl(
  d: DatosControl,
  o: OpcionesPdf,
  medir: Medir,
): PaginaPdf[] {
  // Sin dinero que ensenar y sin Last Planner que contar, la hoja no tiene
  // nada propio que decir: no se imprime una pagina para explicar dos huecos.
  const hayLastPlanner = (d.lastPlanner?.tendencia.length ?? 0) > 0;
  if (d.economia === null && !hayLastPlanner) return [];

  const el: ElementoPdf[] = [];
  const izq = o.margen;
  const der = o.ancho - o.margen;

  const texto = (
    x: number,
    y: number,
    contenido: string,
    tam: number,
    opciones: { negrita?: boolean; tinta?: TintaPdf } = {},
  ) => {
    el.push({
      tipo: "texto",
      x,
      y,
      texto: aWinAnsi(contenido),
      tam,
      negrita: opciones.negrita ?? false,
      gris: false,
      tinta: opciones.tinta ?? "tinta",
    });
  };

  // ---- Cabecera -----------------------------------------------------------

  let y = o.alto - o.margen - 13;
  texto(izq, y, "CONTROL ECONÓMICO Y LAST PLANNER", 13, { negrita: true });
  const rotulo = `Corte del ${fechaCsv(d.fechaCorte)}`;
  texto(der - medir(rotulo, 9), y + 2, rotulo, 9, { negrita: true, tinta: "marca" });

  y -= 12;
  texto(izq, y, `${d.obra}  ·  ${d.empresa}`, 8, { tinta: "tinta-suave" });

  y -= 10;
  el.push({ tipo: "linea", x1: izq, y1: y, x2: der, y2: y, tinta: "linea" });

  /**
   * Dos columnas -el dinero a la izquierda, el plan a la derecha- SOLO cuando
   * hay plan que dibujar.
   *
   * Sin ninguna semana cerrada, la mitad derecha se quedaba con una nota y dos
   * rotulos vacios, y el revisor del diseño lo dejo anotado: «honesto, pero
   * mucho papel para cero informacion». Era ~40 % de la hoja en blanco.
   *
   * Asi que el dinero se lleva el ancho entero y el aviso de Last Planner baja
   * a una franja al pie. `der + 24` no es un truco: la columna del dinero
   * dibuja hasta `medio - 24`, asi que esto la hace terminar justo en el
   * margen derecho sin tener que tocar ni una de las lineas de abajo.
   */
  const medio = hayLastPlanner ? izq + (der - izq) * 0.54 : der + 24;
  const anchoIzq = medio - izq - 24;

  // ---- Mitad economica ----------------------------------------------------

  let yE = y - 20;

  if (d.economia === null) {
    texto(izq, yE, "SIN ACCESO A LAS CIFRAS DE DINERO", 9, { negrita: true });
    yE -= 14;
    for (const linea of partirEnLineas(
      "Quien genera este informe no tiene permiso para leer las órdenes de la obra, así que el comprometido no se puede calcular. No se imprime un cero: sería leerlo como que no hay nada comprometido.",
      anchoIzq,
      8,
      medir,
    )) {
      texto(izq, yE, linea, 8, { tinta: "tinta-suave" });
      yE -= 11;
    }
  } else {
    const e = d.economia;
    const construido = pct(d.real);
    const comprometido = porcentajeComprometido(e);

    texto(izq, yE, "LO CONSTRUIDO FRENTE A LO COMPROMETIDO", 9, { negrita: true });
    yE -= 6;
    el.push({ tipo: "linea", x1: izq, y1: yE, x2: medio - 24, y2: yE, tinta: "linea" });
    yE -= 26;

    const anchoPista = anchoIzq - 62;

    /// Una pista con su cifra al final. Las dos a la MISMA escala: si no, la
    /// comparacion que justifica esta hoja deja de poder hacerse a ojo.
    const pista = (etiqueta: string, valor: number, tinta: TintaPdf) => {
      texto(izq, yE + 11, etiqueta, 7, { tinta: "tinta-suave" });
      el.push({
        tipo: "fondo",
        x: izq,
        y: yE - 2,
        ancho: anchoPista,
        alto: 9,
        tinta: "linea",
      });
      el.push({
        tipo: "fondo",
        x: izq,
        y: yE - 2,
        ancho: Math.max(1, (valor / 100) * anchoPista),
        alto: 9,
        tinta,
      });
      texto(izq + anchoPista + 8, yE, `${valor.toFixed(valor < 10 ? 1 : 0)}%`, 13, {
        negrita: true,
        tinta,
      });
    };

    pista("AVANCE FÍSICO EJECUTADO", construido, "tinta");
    yE -= 34;

    if (comprometido === null) {
      texto(izq, yE, "El comprometido no se puede expresar en % del presupuesto.", 8, {
        tinta: "tinta-suave",
      });
      yE -= 14;
    } else {
      pista("PRESUPUESTO COMPROMETIDO", comprometido, "marca");
      yE -= 26;

      /**
       * La brecha, dicha con palabras.
       *
       * Es la razon de ser de la hoja, asi que va escrita y no solo dibujada:
       * un lector que no sepa que dos barras desiguales significan algo se
       * queda sin el aviso. Se redondea a un decimal porque son porcentajes,
       * no importes: la resta de los importes de verdad es `saldo`.
       */
      const brecha = comprometido - construido;
      const puntos = `${Math.abs(brecha).toFixed(1)} puntos`;
      if (brecha > 0) {
        for (const linea of partirEnLineas(
          `Se ha comprometido ${puntos} más presupuesto del que se ha construido. Esa distancia es lo que avisa del sobrecosto ANTES de que ocurra.`,
          anchoIzq,
          8,
          medir,
        )) {
          texto(izq, yE, linea, 8, { tinta: "peligro" });
          yE -= 11;
        }
      } else {
        for (const linea of partirEnLineas(
          `Lo comprometido va ${puntos} por detrás de lo construido: al ritmo actual el presupuesto acompaña a la obra.`,
          anchoIzq,
          8,
          medir,
        )) {
          texto(izq, yE, linea, 8, { tinta: "exito" });
          yE -= 11;
        }
      }
    }

    yE -= 14;
    texto(izq, yE, "LAS CUENTAS AL CORTE", 9, { negrita: true });
    yE -= 6;
    el.push({ tipo: "linea", x1: izq, y1: yE, x2: medio - 24, y2: yE, tinta: "linea" });
    yE -= 14;

    const cuenta = (etiqueta: string, valor: string | null, tinta: TintaPdf) => {
      texto(izq, yE, etiqueta, 8, { tinta: "tinta-suave" });
      const importe = valor === null ? "No se puede calcular" : soles(valor);
      texto(medio - 24 - medir(importe, 9), yE, importe, 9, {
        negrita: true,
        tinta: valor === null ? "tinta-suave" : tinta,
      });
      yE -= 14;
    };

    cuenta("Presupuesto", e.presupuesto, "tinta");
    cuenta("Comprometido", e.comprometido, "marca");
    cuenta("Saldo", e.saldo, esNegativo(e.saldo) ? "peligro" : "exito");

    if (!e.conLineaBase) {
      texto(izq, yE, "Sin línea base aprobada: el presupuesto no incluye adicionales.", 7, {
        tinta: "tinta-suave",
      });
      yE -= 11;
    }

    /*
     * DONDE SE ABRE LA BRECHA.
     *
     * El bloque que el revisor del diseño echo en falta: arriba se dice que se
     * ha comprometido N puntos mas de lo construido, y hasta aqui la hoja no
     * decia en QUE capitulo. Una cifra global avisa; esta lista dice a donde
     * ir a mirar.
     *
     * Se ordenan por brecha descendente y se cortan a `CAPITULOS_DE_LA_BRECHA`:
     * mas no cabe legible en media hoja apaisada. Los capitulos SIN medir
     * -sin ninguna partida con tarea mapeada- no entran: de ellos no se sabe
     * como van, y colarlos con un cero los pintaria como si fueran los sanos.
     */
    const conBrecha = (d.cruce ?? [])
      .filter((c) => c.fisico !== null && c.economico !== null)
      .map((c) => ({ ...c, brecha: c.economico! - c.fisico! }))
      .sort((a, b) => b.brecha - a.brecha)
      .slice(
        0,
        hayLastPlanner
          ? CAPITULOS_DE_LA_BRECHA
          : CAPITULOS_DE_LA_BRECHA_ANCHO,
      );

    if (conBrecha.length > 0) {
      yE -= 14;
      texto(izq, yE, "DÓNDE SE ABRE LA BRECHA", 9, { negrita: true });
      yE -= 6;
      el.push({ tipo: "linea", x1: izq, y1: yE, x2: medio - 24, y2: yE, tinta: "linea" });
      yE -= 14;

      texto(izq, yE, "Capítulo", 7, { tinta: "tinta-suave" });
      const cabeceras = "Físico   Gastado   Brecha";
      texto(medio - 24 - medir(cabeceras, 7), yE, cabeceras, 7, {
        tinta: "tinta-suave",
      });
      yE -= 12;

      for (const c of conBrecha) {
        const nombre = [c.codigo, c.nombre].filter(Boolean).join(" ");
        const cifras = `${c.fisico!.toFixed(0)}%   ${c.economico!.toFixed(0)}%`;
        const anchoCifras = medir(cifras, 8);
        const signo = c.brecha > 0 ? "+" : "";
        const brechaTexto = `${signo}${c.brecha.toFixed(0)} pts`;
        const anchoBrecha = medir(brechaTexto, 8);

        // El nombre se recorta a lo que quede libre: la fila tiene que caber
        // en una linea o la tabla deja de leerse de un vistazo.
        const libre = medio - 24 - izq - anchoCifras - anchoBrecha - 16;
        const lineas = partirEnLineas(nombre, Math.max(40, libre), 8, medir);
        texto(izq, yE, lineas[0] ?? nombre, 8);

        texto(medio - 24 - anchoBrecha - 12 - anchoCifras, yE, cifras, 8, {
          tinta: "tinta-suave",
        });
        // El signo manda el color: gastar por delante del avance es lo que
        // avisa, ir por detras es que el presupuesto acompaña.
        texto(medio - 24 - anchoBrecha, yE, brechaTexto, 8, {
          negrita: true,
          tinta: c.brecha > 0 ? "peligro" : "exito",
        });
        yE -= 13;
      }
    }
  }

  // ---- Last Planner -------------------------------------------------------

  const tendencia = d.lastPlanner?.tendencia ?? [];
  const pareto = d.lastPlanner?.pareto ?? [];

  if (tendencia.length === 0) {
    /**
     * El estado vacio, dicho y no disimulado, pero en UNA FRANJA al pie.
     *
     * Sigue en pie la correccion que costo rehacer la hoja entera: mientras no
     * haya una semana cerrada no hay PPC, ni causas, ni Pareto, y eso se dice
     * con esas palabras en vez de dibujar un grafico de muestra que el lector
     * tomaria por suyo.
     *
     * LO QUE SI CAMBIA -y conviene saber que fue a proposito- son los dos
     * rotulos vacios con su «SIN DATOS» y su linea, que enseñaban la
     * estructura que la hoja TENDRA. Se aprobaron en su dia y se quitan ahora
     * porque eran la mayor parte de ese 40 % de papel en blanco que el propio
     * revisor apunto despues. La honestidad estaba en el texto, no en el
     * esqueleto: el texto se queda entero, y el sitio se lo lleva el dinero,
     * que si tiene algo que contar.
     */
    let yL = yE - 26;
    texto(izq, yL, "LAST PLANNER", 9, { negrita: true });
    yL -= 6;
    el.push({ tipo: "linea", x1: izq, y1: yL, x2: der, y2: yL, tinta: "linea" });
    yL -= 14;
    texto(izq, yL, "Todavía no hay nada que medir", 8, {
      negrita: true,
      tinta: "marca",
    });
    yL -= 11;
    for (const linea of partirEnLineas(
      `Al corte del ${fechaCsv(d.fechaCorte)} la obra no tiene ninguna semana del plan cerrada: no hay PPC ni causas de incumplimiento. Esos datos no existen todavía y ninguno se ha estimado para rellenar el hueco. Esta hoja los recogerá sola al cerrar la primera semana del plan.`,
      der - izq,
      8,
      medir,
    )) {
      texto(izq, yL, linea, 8, { tinta: "tinta-suave" });
      yL -= 11;
    }
  } else {
    let yL = y - 20;
    texto(medio, yL, "LAST PLANNER", 9, { negrita: true });
    yL -= 6;
    el.push({ tipo: "linea", x1: medio, y1: yL, x2: der, y2: yL, tinta: "linea" });
    yL -= 16;

    texto(medio, yL, "PPC SEMANA A SEMANA", 8, { negrita: true, tinta: "tinta-suave" });
    yL -= 14;

    // Una barra por semana cerrada, con su numero debajo. Las ultimas doce:
    // mas no cabe legible y la tendencia se lee igual.
    const ultimas = tendencia.slice(-12);
    const anchoZona = der - medio;
    const anchoBarra = Math.min(22, anchoZona / Math.max(1, ultimas.length) - 4);
    const altoZona = 60;

    ultimas.forEach((punto, i) => {
      const x = medio + i * (anchoBarra + 4);
      const valor = Math.min(100, Math.max(0, punto.ppc));
      const alto = Math.max(1, (valor / 100) * altoZona);
      el.push({
        tipo: "fondo",
        x,
        y: yL - altoZona,
        ancho: anchoBarra,
        alto: altoZona,
        tinta: "linea",
      });
      el.push({
        tipo: "fondo",
        x,
        y: yL - altoZona,
        ancho: anchoBarra,
        alto,
        tinta: valor >= 80 ? "exito" : valor >= 60 ? "alerta" : "peligro",
      });
      texto(x, yL - altoZona - 9, etiquetaSemana(punto.fecha), 6, {
        tinta: "tinta-suave",
      });
    });

    yL -= altoZona + 22;

    texto(medio, yL, "CAUSAS DE INCUMPLIMIENTO", 8, { negrita: true, tinta: "tinta-suave" });
    yL -= 14;

    if (pareto.length === 0) {
      texto(medio, yL, "Ningún compromiso incumplido hasta el corte.", 8, {
        tinta: "exito",
      });
    }

    for (const fila of pareto.slice(0, 5)) {
      texto(medio, yL, ETIQUETA_CNC[fila.causa], 8);
      texto(der - medir(String(fila.conteo), 8), yL, String(fila.conteo), 8, {
        negrita: true,
      });
      yL -= 13;
    }
  }

  return [{ elementos: el }];
}

/// Un importe en texto que representa una deuda. Se mira con los ayudantes de
/// importes del proyecto y no con `Number`, que es como se cuela el error de
/// redondeo en una comparacion de dinero.
function esNegativo(importe: string | null): boolean {
  if (importe === null) return false;
  return !esPositivo(importe) && !esCero(importe);
}

/// El rotulo de una barra del PPC: dia y mes de la semana que cerro.
function etiquetaSemana(fecha: Date): string {
  const dia = String(fecha.getUTCDate()).padStart(2, "0");
  const mes = String(fecha.getUTCMonth() + 1).padStart(2, "0");
  return `${dia}/${mes}`;
}
