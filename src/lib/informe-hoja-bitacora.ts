import type { FotoResumen } from "@/services/evidencia.service";
import type { PartidaActiva } from "./control-avance";
import { fechaCsv } from "./informe-documento";
import type { ElementoPdf, OpcionesPdf, PaginaPdf, TintaPdf } from "./informe-pdf";
import { aWinAnsi, partirEnLineas, type Medir } from "./pdf-texto";

/**
 * La bitacora fotografica: lo que se hizo en obra, con sus fotos.
 *
 * Traduce a PDF la hoja «Bitacora fotografica diaria» disenada sobre el
 * informe real del cliente (`docs/informe-plantillas/hojas/bitacora.fix.html`,
 * con el original descrito en `ORIGINALES.md`). Es la hoja que convierte el
 * informe en algo que se puede ensenar a quien no visita la obra: hasta ahora
 * las fotos de evidencia estaban en la aplicacion y no salian en ningun
 * documento.
 *
 * **Va por DIAS, no por partidas.** Las fotos llegan agrupadas por la partida
 * a la que se subieron, pero una bitacora se lee por jornadas —«el dia 8 se
 * llenaron cuatro zapatas»—, que es como esta montado el papel del cliente. Se
 * reagrupan aqui por su fecha, y cada dia lleva debajo las partidas en las que
 * se trabajo, que es el bloque «trabajo realizado» del original.
 *
 * Igual que el resto de la maquetacion: se decide QUE cae y DONDE, sin pintar
 * y sin nombrar un color. Las fotos viajan por CLAVE —su id— y quien llama se
 * encarga de cargar los bytes; para eso esta `clavesDeLaBitacora`, que dice
 * exactamente cuales van a hacer falta.
 *
 * El origen de coordenadas del PDF esta ABAJO a la izquierda: `y` crece hacia
 * arriba.
 */

/// Cuantas jornadas se documentan. Mas paginas de fotos que de cifras
/// convierten el informe en un album; con tres se cubre la semana del corte.
const DIAS_VISIBLES = 3;

/// Fotos por jornada: dos filas de tres, como la cuadricula del original.
const COLUMNAS = 3;
const FILAS = 2;
const FOTOS_POR_DIA = COLUMNAS * FILAS;

export interface DatosBitacora {
  obra: string;
  empresa: string;
  fechaCorte: Date;
  activas: readonly PartidaActiva[];
  /// Fotos de cada partida activa, por su uid, tal como las compone el
  /// informe.
  fotosPorUid: Record<number, FotoResumen[]>;
}

/// Una foto con la partida de la que cuelga, que es lo que se pierde al
/// reagrupar por dia y hace falta para el pie de cada imagen.
interface FotoConPartida {
  foto: FotoResumen;
  partida: PartidaActiva;
}

interface Jornada {
  dia: Date;
  fotos: FotoConPartida[];
  /// Las partidas distintas en las que se trabajo ese dia, en su orden.
  partidas: PartidaActiva[];
}

/**
 * Las jornadas que la bitacora va a documentar, de la mas reciente hacia
 * atras.
 *
 * Una foto PURGADA se queda fuera: su registro de auditoria sigue en la base
 * a proposito, pero el archivo ya no existe y dibujar su hueco solo produce
 * un recuadro vacio que el lector interpreta como un fallo del informe.
 */
export function jornadasDeLaBitacora(d: DatosBitacora): Jornada[] {
  const porDia = new Map<string, Jornada>();

  for (const partida of d.activas) {
    for (const foto of d.fotosPorUid[partida.uid] ?? []) {
      if (foto.purgada) continue;
      const clave = foto.createdAt.toISOString().slice(0, 10);
      const jornada = porDia.get(clave) ?? {
        dia: new Date(`${clave}T00:00:00.000Z`),
        fotos: [],
        partidas: [],
      };
      jornada.fotos.push({ foto, partida });
      if (!jornada.partidas.some((p) => p.uid === partida.uid)) {
        jornada.partidas.push(partida);
      }
      porDia.set(clave, jornada);
    }
  }

  return [...porDia.values()]
    .sort((a, b) => b.dia.getTime() - a.dia.getTime())
    .slice(0, DIAS_VISIBLES)
    .map((j) => ({
      ...j,
      // Dentro del dia, en el orden en que se subieron: es el orden en que
      // pasaron las cosas.
      fotos: [...j.fotos]
        .sort((a, b) => a.foto.createdAt.getTime() - b.foto.createdAt.getTime())
        .slice(0, FOTOS_POR_DIA),
    }));
}

/**
 * Los ids de foto que la bitacora va a dibujar.
 *
 * Existe para que quien carga los bytes cargue EXACTAMENTE esos y ni uno mas:
 * una obra con seiscientas fotos no puede leerlas todas de disco para acabar
 * imprimiendo dieciocho. Sale de la misma funcion que decide la maquetacion,
 * asi que las dos listas no pueden separarse.
 */
export function clavesDeLaBitacora(d: DatosBitacora): string[] {
  return jornadasDeLaBitacora(d).flatMap((j) => j.fotos.map((f) => f.foto.id));
}

export function hojasBitacora(
  d: DatosBitacora,
  o: OpcionesPdf,
  medir: Medir,
): PaginaPdf[] {
  const jornadas = jornadasDeLaBitacora(d);
  // Sin fotos no hay hoja. Una bitacora vacia no explica nada que las tablas
  // no digan ya, y una pagina en blanco en un informe se lee como un error.
  if (jornadas.length === 0) return [];

  return jornadas.map((j) => unaJornada(j, d, o, medir));
}

function unaJornada(
  j: Jornada,
  d: DatosBitacora,
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

  let y = o.alto - o.margen - 13;
  texto(izq, y, "BITÁCORA FOTOGRÁFICA", 13, { negrita: true });
  const rotulo = fechaCsv(j.dia);
  texto(der - medir(rotulo, 13), y, rotulo, 13, { negrita: true, tinta: "marca" });

  y -= 12;
  texto(izq, y, `${d.obra}  ·  ${d.empresa}`, 8, { tinta: "tinta-suave" });

  y -= 9;
  el.push({ tipo: "linea", x1: izq, y1: y, x2: der, y2: y, tinta: "linea" });

  // ---- Cuadricula de fotos ------------------------------------------------

  const anchoUtil = der - izq;
  const aire = 10;
  const anchoCelda = (anchoUtil - aire * (COLUMNAS - 1)) / COLUMNAS;
  /// Deja sitio bajo cada foto para dos lineas de pie.
  const altoPie = 20;
  const altoBloque = 165;
  const altoFoto = altoBloque - altoPie;

  const arriba = y - 14;

  j.fotos.forEach((f, i) => {
    const columna = i % COLUMNAS;
    const fila = Math.floor(i / COLUMNAS);
    const x = izq + columna * (anchoCelda + aire);
    const yBloque = arriba - (fila + 1) * altoBloque - fila * aire;

    // El marco se dibuja SIEMPRE, tenga foto dentro o no: es lo que sostiene
    // la cuadricula cuando una imagen no se puede incrustar.
    el.push({
      tipo: "fondo",
      x,
      y: yBloque + altoPie,
      ancho: anchoCelda,
      alto: altoFoto,
      tinta: "linea",
    });
    el.push({
      tipo: "imagen",
      x: x + 2,
      y: yBloque + altoPie + 2,
      ancho: anchoCelda - 4,
      alto: altoFoto - 4,
      clave: f.foto.id,
    });

    const partida = [f.partida.codigo, f.partida.nombre].filter(Boolean).join(" ");
    const primeraLinea = partirEnLineas(partida, anchoCelda, 7, medir)[0] ?? partida;
    texto(x, yBloque + 10, primeraLinea, 7, { negrita: true });

    // El pie de la foto es la nota de quien la subio. Si no la escribio, se
    // dice quien y cuando en vez de dejar la linea muda: en una bitacora, de
    // quien es la foto forma parte del dato.
    const pie = f.foto.nota
      ? f.foto.nota
      : `${f.foto.subidaPor} · ${fechaCsv(f.foto.createdAt)}`;
    const linea = partirEnLineas(pie, anchoCelda, 7, medir)[0] ?? pie;
    texto(x, yBloque + 1, linea, 7, { tinta: "tinta-suave" });
  });

  // ---- Trabajo realizado --------------------------------------------------

  const filasUsadas = Math.ceil(j.fotos.length / COLUMNAS);
  let yTexto = arriba - filasUsadas * altoBloque - (filasUsadas - 1) * aire - 22;

  texto(izq, yTexto, "TRABAJO REALIZADO", 9, { negrita: true });
  yTexto -= 6;
  el.push({ tipo: "linea", x1: izq, y1: yTexto, x2: der, y2: yTexto, tinta: "linea" });
  yTexto -= 12;

  for (const p of j.partidas) {
    const nombre = [p.codigo, p.nombre].filter(Boolean).join(" ");
    el.push({ tipo: "fondo", x: izq, y: yTexto, ancho: 4, alto: 4, tinta: "marca" });
    texto(izq + 10, yTexto, nombre, 8);
    texto(
      der - 116,
      yTexto,
      `Plan ${p.porcentajePlaneado}%  ·  Real ${p.porcentajeReal}%`,
      7,
      { tinta: "tinta-suave" },
    );
    yTexto -= 12;
  }

  return { elementos: el };
}
