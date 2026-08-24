import { capitulosDelInforme } from "./control-avance";
import type { DatosCsvInforme } from "./informe-documento";
import { fechaCsv } from "./informe-documento";
import type { ElementoPdf, OpcionesPdf, PaginaPdf, TintaPdf } from "./informe-pdf";
import { aWinAnsi, partirEnLineas, type Medir } from "./pdf-texto";

/**
 * La hoja de resumen al corte: la primera pagina del informe en PDF.
 *
 * Es la traduccion a PDF de la hoja «Dashboard al corte» que se diseno sobre
 * los informes reales del cliente (el HTML vive en
 * `docs/informe-plantillas/hojas/dashboard.fix.html`, con la descripcion del
 * original en `ORIGINALES.md`). Lo que llegaba hasta hoy era un informe de
 * tablas: correcto, completo y mudo. Quien lo abre quiere saber en dos
 * segundos si la obra va bien, y eso no se lee en una tabla de doce filas.
 *
 * **Solo pinta lo que el informe YA calcula.** No hay ni una cifra nueva:
 * avance real, planeado, desviacion, capitulos y alertas salen del mismo
 * `DatosCsvInforme` que alimentan la hoja de calculo y las tablas de las
 * paginas siguientes. Si algun dia una cifra de aqui no cuadra con su tabla,
 * es un fallo de esta hoja, nunca dos verdades distintas.
 *
 * Igual que el resto de `informe-pdf.ts`: aqui se decide QUE cae y DONDE, sin
 * pintar nada y sin nombrar un solo color —solo tintas por su papel—. El
 * origen de coordenadas del PDF esta ABAJO a la izquierda, asi que `y` crece
 * hacia arriba.
 */

/// Un porcentaje que viene como texto del informe. Un dato ilegible se trata
/// como cero y no como NaN: el anillo tiene que dibujarse igual.
function pct(valor: string): number {
  const n = Number(valor);
  if (!Number.isFinite(n)) return 0;
  return Math.min(100, Math.max(0, n));
}

/// Cuantos capitulos caben en la columna sin apretarlos. Con mas, se dice
/// cuantos quedan fuera en vez de recortar en silencio.
const CAPITULOS_VISIBLES = 9;

/// Y cuantas alertas. Las mismas razones.
const ALERTAS_VISIBLES = 4;

const TINTA_SEVERIDAD = {
  alta: "peligro",
  media: "alerta",
  baja: "tinta-suave",
} as const;

export function hojaDashboard(
  d: DatosCsvInforme,
  o: OpcionesPdf,
  medir: Medir,
): PaginaPdf {
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

  let y = o.alto - o.margen - 18;
  texto(izq, y, d.obra, 18, { negrita: true });

  y -= 14;
  const pie = [d.empresa, d.ubicacion, `Corte del ${fechaCsv(d.fechaCorte)}`]
    .filter((t): t is string => Boolean(t))
    .join("  ·  ");
  texto(izq, y, pie, 8, { tinta: "tinta-suave" });

  y -= 10;
  el.push({ tipo: "linea", x1: izq, y1: y, x2: der, y2: y, tinta: "linea" });

  // ---- Anillo de avance ---------------------------------------------------

  const real = pct(d.real);
  const planeado = pct(d.planeado);

  const cx = izq + 92;
  const cy = y - 104;
  const radio = 60;
  const grosor = 15;

  // El aro entero primero, en gris: sin el, un 11 % es una raya suelta y no
  // se lee como «once de cien».
  el.push({ tipo: "arco", cx, cy, radio, grosor, desde: 0, hasta: 360, tinta: "linea" });
  if (real > 0) {
    el.push({
      tipo: "arco",
      cx,
      cy,
      radio,
      grosor,
      desde: 0,
      hasta: (real / 100) * 360,
      tinta: "marca",
    });
  }

  const cifra = `${real.toFixed(0)}%`;
  const anchoCifra = medir(cifra, 30);
  texto(cx - anchoCifra / 2, cy - 4, cifra, 30, { negrita: true, tinta: "marca" });
  const anchoRotulo = medir("REAL", 7);
  texto(cx - anchoRotulo / 2, cy - 20, "REAL", 7, { tinta: "tinta-suave" });

  // Planeado y desviacion, debajo del anillo y separados por una vertical:
  // es el par que el informe del cliente ya ponia junto al donut.
  // La separacion se mide desde el BORDE del anillo, no desde su centro, y
  // cuenta el medio grosor de la pluma: el aro ocupa `radio + grosor / 2`.
  const yPar = cy - radio - grosor / 2 - 24;
  const medioX = cx;
  el.push({ tipo: "linea", x1: medioX, y1: yPar - 4, x2: medioX, y2: yPar + 16, tinta: "linea" });

  texto(izq, yPar + 12, "PLANEADO", 7, { tinta: "tinta-suave" });
  texto(izq, yPar, `${planeado.toFixed(0)}%`, 14, { negrita: true });

  const xDesv = medioX + 12;
  texto(xDesv, yPar + 12, "DESVIACIÓN", 7, { tinta: "tinta-suave" });
  const desviacion = Number(d.desviacion);
  const tintaDesv = !Number.isFinite(desviacion)
    ? "tinta"
    : desviacion < 0
      ? "peligro"
      : desviacion > 0
        ? "exito"
        : "tinta";
  texto(xDesv, yPar, `${d.desviacion} pts`, 14, { negrita: true, tinta: tintaDesv });

  /*
   * CON QUE SE PESO, debajo del par.
   *
   * Solo cuando es por DINERO, que es la excepcion: por duracion es lo que
   * todo el mundo da por hecho al ver un % de avance de obra. Lo mismo hace la
   * pantalla de la curva. Va en el PDF y no solo en la web porque este
   * documento se le entrega al cliente y es donde la cifra vive sola, sin
   * nadie al lado para explicarla.
   */
  if (d.criterioPeso === "DINERO") {
    texto(
      izq,
      yPar - 12,
      "Ponderado por dinero: cada tarea pesa lo que vale su partida.",
      6,
      { tinta: "tinta-suave" },
    );
  }

  // ---- Capitulos ----------------------------------------------------------

  const xCap = izq + 210;
  let yCap = y - 22;

  texto(xCap, yCap, "CONTROL DE CAPÍTULOS", 9, { negrita: true });
  yCap -= 6;
  el.push({ tipo: "linea", x1: xCap, y1: yCap, x2: der, y2: yCap, tinta: "linea" });
  yCap -= 16;

  const capitulos = capitulosDelInforme(d.capitulos);
  const anchoPista = 150;
  const xPista = der - anchoPista - 74;

  for (const c of capitulos.slice(0, CAPITULOS_VISIBLES)) {
    const nombre = [c.codigo, c.nombre].filter(Boolean).join(" ");
    // Se parte en lineas en vez de recortar con puntos suspensivos: un
    // capitulo cuyo nombre acaba en «...» obliga a ir a buscarlo a la tabla.
    const lineas = partirEnLineas(nombre, xPista - xCap - 8, 8, medir);
    texto(xCap, yCap, lineas[0] ?? nombre, 8);

    const r = pct(c.real);
    const p = pct(c.planeado);

    el.push({
      tipo: "fondo",
      x: xPista,
      y: yCap - 2,
      ancho: anchoPista,
      alto: 7,
      tinta: "linea",
    });
    if (r > 0) {
      el.push({
        tipo: "fondo",
        x: xPista,
        y: yCap - 2,
        ancho: (r / 100) * anchoPista,
        alto: 7,
        tinta: "marca",
      });
    }
    // La marca negra del planeado sobre la barra: es el gesto del informe
    // original, y es lo que convierte la barra en una comparacion.
    const xPlan = xPista + (p / 100) * anchoPista;
    el.push({ tipo: "linea", x1: xPlan, y1: yCap - 4, x2: xPlan, y2: yCap + 7, tinta: "tinta", grosor: 1 });

    texto(der - 68, yCap, `P ${p.toFixed(0)}%`, 7, { tinta: "tinta-suave" });
    texto(der - 34, yCap, `R ${r.toFixed(0)}%`, 7, { negrita: true });

    yCap -= 17;
  }

  const ocultos = capitulos.length - CAPITULOS_VISIBLES;
  if (ocultos > 0) {
    texto(xCap, yCap, `y ${ocultos} capítulo(s) más, en la tabla de la página siguiente`, 7, {
      tinta: "tinta-suave",
    });
    yCap -= 14;
  }

  if (capitulos.length === 0) {
    texto(xCap, yCap, "Todavía no hay capítulos con avance que medir.", 8, {
      tinta: "tinta-suave",
    });
  }

  // ---- Alertas ------------------------------------------------------------

  let yAl = Math.min(yCap - 10, o.margen + 132);
  texto(xCap, yAl, "ALERTAS DE ATRASO", 9, { negrita: true });
  yAl -= 6;
  el.push({ tipo: "linea", x1: xCap, y1: yAl, x2: der, y2: yAl, tinta: "linea" });
  yAl -= 15;

  if (d.alertas.length === 0) {
    texto(xCap, yAl, "Ninguna partida va por detrás del plan al corte.", 8, {
      tinta: "exito",
    });
  }

  for (const a of d.alertas.slice(0, ALERTAS_VISIBLES)) {
    const tinta = TINTA_SEVERIDAD[a.severidad];
    // El cuadradito de color va aparte del texto: el rotulo de severidad en
    // amarillo a 7 puntos no se lee impreso, y esa leccion ya la dejaron
    // anotada las hojas de diseno.
    el.push({ tipo: "fondo", x: xCap, y: yAl, ancho: 5, alto: 5, tinta });
    const nombre = [a.codigo, a.nombre].filter(Boolean).join(" ");
    texto(xCap + 11, yAl, nombre, 8);
    texto(der - 96, yAl, `${a.diasAtraso} día(s)`, 8, { negrita: true, tinta });
    yAl -= 14;
  }

  const alertasOcultas = d.alertas.length - ALERTAS_VISIBLES;
  if (alertasOcultas > 0) {
    texto(xCap, yAl, `y ${alertasOcultas} alerta(s) más, en su tabla`, 7, {
      tinta: "tinta-suave",
    });
  }

  return { elementos: el };
}
