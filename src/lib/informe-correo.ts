import type { DatosCsvInforme } from "./informe-csv";
import { fechaCsv } from "./informe-csv";

/**
 * Lo que DICE el correo del informe.
 *
 * Separado de como se pinta (eso vive en `mailer.service`) porque lo que se
 * destaca es una decision y las decisiones se prueban: que la obra vaya «por
 * delante» o «por detras», cuales son las tres partidas que merecen aparecer
 * en un correo que se lee en el movil, y si el PPC se menciona o se calla.
 *
 * Come del MISMO objeto que la pantalla y la hoja de calculo. Las cifras del
 * cuerpo no pueden discrepar del adjunto porque salen del mismo sitio.
 */

/**
 * Cuanta desviacion hace falta para dejar de decir «al dia».
 *
 * Sin umbral, un +0.02 se anunciaria como «por delante del plan» en un correo
 * que a veces va al cliente. Medio punto es la frontera: por debajo, la obra
 * esta donde tenia que estar y decir otra cosa es vender o alarmar.
 */
export const UMBRAL_AL_DIA = 0.5;

/// Cuantas partidas atrasadas caben en el cuerpo. Es un correo que se lee en
/// el movil: la lista entera esta en el adjunto, y aqui solo van las que
/// justifican abrirlo.
export const MAX_GRAVES_EN_CORREO = 3;

export interface LineaGrave {
  /// Codigo y nombre, ya juntos.
  partida: string;
  /// Por que esta aqui, en palabras: puntos y dias.
  detalle: string;
}

export interface ResumenCorreoInforme {
  asunto: string;
  /// El titular, en una frase. Es lo unico que muchos van a leer.
  estado: string;
  cifras: { etiqueta: string; valor: string }[];
  /// Null cuando la semana no cerro: un PPC a medias no se menciona.
  ppc: string | null;
  masGraves: LineaGrave[];
  /// Cuantas atrasadas quedaron fuera del cuerpo.
  gravesOmitidas: number;
}

export function resumenParaCorreo(d: DatosCsvInforme): ResumenCorreoInforme {
  const desviacion = Number(d.desviacion);
  const corte = fechaCsv(d.fechaCorte);

  const estado =
    Math.abs(desviacion) < UMBRAL_AL_DIA
      ? "La obra va al día respecto al plan."
      : desviacion > 0
        ? `La obra va ${desviacion.toFixed(2)} puntos por delante del plan.`
        : `La obra va ${Math.abs(desviacion).toFixed(2)} puntos por detrás del plan.`;

  const cifras = [
    { etiqueta: "Avance real", valor: `${d.real}%` },
    { etiqueta: "Avance planeado", valor: `${d.planeado}%` },
    { etiqueta: "Desviación", valor: `${d.desviacion} puntos` },
  ];

  // Lo ganado solo se menciona si hay periodo con el que comparar. En el
  // primer informe no hay «lo que paso esta semana»: hay un principio.
  if (d.periodo.desde !== null) {
    cifras.push({
      etiqueta: `Ganado desde el ${fechaCsv(d.periodo.desde)}`,
      valor: `${d.periodo.ganado} puntos`,
    });
  }

  const semana = d.lastPlanner?.semana ?? null;
  const ppc =
    semana !== null && semana.ppc !== null
      ? `PPC de la semana ${semana.numero}: ${semana.ppc}% (${semana.cumplidos} de ${semana.total} compromisos)`
      : null;

  const altas = d.alertas.filter((a) => a.severidad === "alta");
  const masGraves: LineaGrave[] = altas
    .slice(0, MAX_GRAVES_EN_CORREO)
    .map((a) => ({
      partida: [a.codigo, a.nombre].filter(Boolean).join(" "),
      detalle: `${Math.abs(Number(a.desfase)).toFixed(2)} puntos por detrás · ${a.diasAtraso} días de trabajo${a.esCritico ? " · ruta crítica" : ""}`,
    }));

  return {
    asunto: `Informe de obra — ${d.obra} (corte ${corte})`,
    estado,
    cifras,
    ppc,
    masGraves,
    gravesOmitidas: Math.max(0, altas.length - masGraves.length),
  };
}
