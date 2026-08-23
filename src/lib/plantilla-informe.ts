/**
 * Que hojas lleva el informe de obra, y quien lo decide.
 *
 * Dos mecanismos que parecen dos y son uno: una PLANTILLA es un nombre para
 * un conjunto de secciones encendidas, y las secciones se pueden encender y
 * apagar una a una encima de ella. Guardar solo las plantillas dejaria fuera
 * al que quiere «la completa pero sin fotos»; guardar solo las secciones
 * obligaria a cada constructora a decidir cinco cosas antes de imprimir su
 * primer informe.
 *
 * Se resuelve por OBRA si la obra dice algo, y si no por EMPRESA. Una
 * constructora elige una vez y todos sus informes salen igual; la obra que
 * necesita otra cosa —el banco pide el detalle, el cliente no— la pisa.
 *
 * Logica pura: aqui no se lee la base ni se dibuja nada.
 */

/**
 * Las secciones que se pueden apagar.
 *
 * `resumen` NO esta en la lista, y es deliberado: es la hoja que lleva el
 * avance y las alertas de atraso. Un informe del que se puede quitar el
 * atraso no es un informe, es una carta de presentacion, y quien lo recibe
 * no tiene forma de saber que se lo quitaron.
 */
export const SECCIONES_INFORME = [
  "cronograma",
  "control",
  "tablas",
  "bitacora",
] as const;

export type SeccionInformeClave = (typeof SECCIONES_INFORME)[number];

export const ETIQUETA_SECCION: Record<SeccionInformeClave, string> = {
  cronograma: "Cronograma con su Gantt",
  control: "Control económico y Last Planner",
  tablas: "Tablas de detalle",
  bitacora: "Bitácora fotográfica",
};

export const EXPLICACION_SECCION: Record<SeccionInformeClave, string> = {
  cronograma: "Cuándo pasa cada cosa y dónde cae hoy dentro del plan.",
  control:
    "Lo construido frente a lo comprometido, y la confiabilidad del plan semanal.",
  tablas: "El detalle en cifras de todo lo anterior, para quien audita.",
  bitacora: "Las fotos de obra de las últimas jornadas, con su pie.",
};

/**
 * Las plantillas: nombres para un conjunto de secciones.
 *
 * No son estilos distintos, son ALCANCES distintos. Un mismo informe con
 * cuatro hojas o con una, segun a quien se le entregue.
 */
export const PLANTILLAS_INFORME = ["COMPLETA", "EJECUTIVA", "OBRA"] as const;

export type PlantillaInforme = (typeof PLANTILLAS_INFORME)[number];

export const ETIQUETA_PLANTILLA: Record<PlantillaInforme, string> = {
  COMPLETA: "Completa",
  EJECUTIVA: "Ejecutiva",
  OBRA: "De obra",
};

export const EXPLICACION_PLANTILLA: Record<PlantillaInforme, string> = {
  COMPLETA: "Todo: resumen, cronograma, control económico, tablas y fotos.",
  EJECUTIVA:
    "Resumen y control económico. Para quien decide y no va a leer cuarenta partidas.",
  OBRA: "Resumen, cronograma y fotos. Lo que se mira en obra; sin el detalle económico.",
};

/// Que secciones enciende cada plantilla. `resumen` va siempre y no aparece.
const SECCIONES_DE: Record<PlantillaInforme, readonly SeccionInformeClave[]> = {
  COMPLETA: SECCIONES_INFORME,
  EJECUTIVA: ["control", "tablas"],
  OBRA: ["cronograma", "bitacora"],
};

export interface EleccionInforme {
  plantilla: PlantillaInforme;
  /**
   * Secciones apagadas ENCIMA de la plantilla, por su clave.
   *
   * Se guarda lo apagado y no lo encendido a proposito: asi una seccion nueva
   * en el futuro aparece por defecto en los informes de todo el mundo, en vez
   * de quedarse invisible hasta que cada empresa la descubra y la encienda.
   */
  apagadas: readonly SeccionInformeClave[];
}

/** Lo que hay cuando nadie ha elegido nada. */
export const ELECCION_POR_DEFECTO: EleccionInforme = {
  plantilla: "COMPLETA",
  apagadas: [],
};

/**
 * Lee lo guardado, tolerando basura.
 *
 * La lista de apagadas viaja como texto separado por comas -no como JSON- por
 * lo mismo que el resto de columnas cortas del esquema: se puede mirar con un
 * SELECT y no hace falta parsear para depurar. Lo que no reconozca se
 * descarta: una clave vieja de una seccion retirada no puede impedir que el
 * informe salga.
 */
export function leerEleccion(
  plantilla: string | null,
  apagadas: string | null,
): EleccionInforme {
  const nombre = PLANTILLAS_INFORME.find((p) => p === plantilla);

  return {
    plantilla: nombre ?? ELECCION_POR_DEFECTO.plantilla,
    apagadas: (apagadas ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter((s): s is SeccionInformeClave =>
        SECCIONES_INFORME.some((x) => x === s),
      ),
  };
}

/** Para guardar. Se ordena y se quitan repetidas: el texto es el dato. */
export function escribirApagadas(
  apagadas: readonly SeccionInformeClave[],
): string {
  return SECCIONES_INFORME.filter((s) => apagadas.includes(s)).join(",");
}

/**
 * Que secciones salen de verdad.
 *
 * La OBRA manda sobre la empresa, y manda ENTERA: si una obra eligio algo, se
 * usa su plantilla y sus apagadas, no una mezcla. Mezclarlas daria
 * combinaciones que nadie eligio -la plantilla de la empresa con las
 * secciones apagadas de la obra- y que no se pueden explicar en pantalla.
 */
export function seccionesDelInforme(
  empresa: EleccionInforme,
  obra: EleccionInforme | null,
): {
  plantilla: PlantillaInforme;
  incluidas: SeccionInformeClave[];
  apagadas: SeccionInformeClave[];
  /// De donde salio la decision, para poder decirlo en pantalla.
  origen: "obra" | "empresa";
} {
  const manda = obra ?? empresa;
  const deLaPlantilla = SECCIONES_DE[manda.plantilla];

  const incluidas = deLaPlantilla.filter((s) => !manda.apagadas.includes(s));

  /**
   * Lo que se omite y por que: cuenta TODO lo que no sale, venga de la
   * plantilla o de un interruptor.
   *
   * El pie del informe lo dice en numero. Un informe recortado que no
   * confiesa serlo es indistinguible de uno completo para quien lo recibe, y
   * ahi es donde una omision deja de ser una preferencia y pasa a ser una
   * omision.
   */
  const apagadas = SECCIONES_INFORME.filter((s) => !incluidas.includes(s));

  return {
    plantilla: manda.plantilla,
    incluidas,
    apagadas,
    origen: obra ? "obra" : "empresa",
  };
}
