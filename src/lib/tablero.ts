/**
 * El tablero del panel: que se mira y de que obra.
 *
 * El panel contestaba «cuantas obras tengo» y «cuanto llevo comprometido en
 * total», que son cifras de gerencia. No contestaba «como va LA obra que
 * estoy supervisando», que es lo que se mira todos los dias. Para eso hace
 * falta elegir una obra y ver sus indicadores juntos.
 *
 * Los avisos son la excepcion deliberada: esos NO se filtran por la obra
 * elegida. Un tablero que solo enseña problemas de la obra que estas mirando
 * te deja ciego ante la que no estas mirando, que es justo donde se escapan.
 *
 * Aqui solo vive el catalogo y la preferencia. Los datos los arma
 * `tablero.service`, y de pintarlos se encarga el componente.
 */

export interface DefinicionModulo {
  clave: string;
  etiqueta: string;
  /// Que pregunta contesta. Es lo que se lee en el configurador.
  nota: string;
  /// Columnas que ocupa en la rejilla de cuatro.
  ancho: 1 | 2;
  /// Sin cronograma cargado no tiene nada que enseñar.
  requiereCronograma: boolean;
}

/**
 * El orden de esta lista MANDA el orden de la rejilla.
 *
 * Configurar decide que modulos se ven, no donde se colocan: si el orden
 * saliera de la cookie, encender uno apagado antes lo pondria al final y el
 * tablero cambiaria de forma cada vez que se toca. Que cada indicador este
 * siempre en el mismo sitio es la mitad de lo que hace util un tablero.
 */
export const MODULOS = [
  {
    // Va PRIMERO a proposito: es lo unico del tablero que no describe la obra
    // sino lo que hay que hacer con ella. Ancho 2 porque es una lista, no una
    // cifra, y en una columna las consecuencias quedarian ilegibles.
    clave: "pendientes",
    etiqueta: "Qué falta",
    nota: "Lo que hay que completar, y qué se rompe si no",
    ancho: 2,
    requiereCronograma: false,
  },
  {
    clave: "avance",
    etiqueta: "Avance físico",
    nota: "Ejecutado contra plan en el último corte",
    ancho: 1,
    requiereCronograma: true,
  },
  {
    clave: "curva",
    etiqueta: "Curva de avance",
    nota: "Plan, real y proyección de toda la obra",
    ancho: 1,
    requiereCronograma: true,
  },
  {
    clave: "plazo",
    etiqueta: "Plazo",
    nota: "Días consumidos y los que quedan",
    ancho: 1,
    requiereCronograma: false,
  },
  {
    clave: "presupuesto",
    etiqueta: "Presupuesto",
    nota: "Comprometido con proveedores y saldo",
    ancho: 1,
    requiereCronograma: false,
  },
  {
    // El EVM en resumen. Se calcula con lo que el tablero YA carga (curva +
    // presupuesto): encenderlo no cuesta ninguna consulta extra.
    clave: "valorGanado",
    etiqueta: "Valor ganado (EVM)",
    nota: "SPI y CPI: plazo y costo contra el plan",
    ancho: 1,
    requiereCronograma: true,
  },
  {
    clave: "ppc",
    etiqueta: "PPC (Last Planner)",
    nota: "Qué parte de lo prometido se cumplió",
    ancho: 1,
    requiereCronograma: false,
  },
  {
    clave: "confiabilidad",
    etiqueta: "Lookahead",
    nota: "Cuántas tareas de la ventana están LISTAS",
    ancho: 1,
    requiereCronograma: true,
  },
  {
    clave: "causas",
    etiqueta: "Causa que más frena",
    nota: "El cuello de botella que más se repite",
    ancho: 1,
    requiereCronograma: false,
  },
  {
    clave: "atrasos",
    etiqueta: "Partidas atrasadas",
    nota: "Cuántas van por detrás y cuál urge",
    ancho: 1,
    requiereCronograma: true,
  },
  {
    clave: "criticas",
    etiqueta: "Cadena crítica",
    nota: "Las tareas que mueven la fecha de fin",
    ancho: 1,
    requiereCronograma: true,
  },
  {
    clave: "capitulos",
    etiqueta: "Capítulos",
    nota: "Los tres que más se desvían del plan",
    ancho: 1,
    requiereCronograma: true,
  },
  {
    clave: "ordenes",
    etiqueta: "Órdenes de compra",
    nota: "Cuántas hay y en qué estado están",
    ancho: 1,
    requiereCronograma: false,
  },
] as const satisfies readonly DefinicionModulo[];

export type ModuloTablero = (typeof MODULOS)[number]["clave"];

/// Todos encendidos. Un tablero que empieza vacio no se configura: se ignora.
export const MODULOS_POR_DEFECTO: readonly ModuloTablero[] = MODULOS.map(
  (m) => m.clave,
);

/**
 * En cookie y no en `localStorage`, por lo mismo que la apariencia: el
 * servidor la lee y pinta el tablero ya configurado en la primera respuesta.
 * Con `localStorage` haria falta leerlo tras montar, y el tablero parpadearia
 * en cada carga con la seleccion equivocada.
 *
 * Los dos puntos no valen en el nombre de una cookie, de ahi el guion.
 *
 * SE GUARDAN LOS MODULOS APAGADOS, no los encendidos.
 *
 * Al reves —que es como estaba— cada modulo nuevo nacia invisible para todo
 * el que hubiera tocado el configurador alguna vez: su cookie no lo nombraba,
 * asi que quedaba fuera del filtro. Se descubrio al añadir los tres de Last
 * Planner, que no habrian aparecido en la unica pantalla donde importaban.
 * Guardando lo apagado, lo nuevo entra encendido para siempre.
 *
 * El nombre lleva el sufijo `-off` a proposito: una cookie vieja con la lista
 * de encendidos significaria justo lo contrario si se leyera con esta regla,
 * y renombrarla es mas barato que migrarla. Se pierde una vez la seleccion de
 * quien la tuviera; a cambio, no vuelve a pasar.
 */
export const COOKIE_TABLERO = "gcm-tablero-off";
export const COOKIE_TABLERO_OBRA = "gcm-tablero-obra";

/// Un año: es una preferencia, no una sesion.
const DURACION_COOKIE = 60 * 60 * 24 * 365;

/**
 * Los modulos que hay que pintar: el catalogo menos los apagados.
 *
 * Se filtra el CATALOGO, y no al reves. Asi se cae solo lo que ya no existe
 * —una clave de una version anterior— sin tener que migrar nada, el orden sale
 * del catalogo y no del texto guardado, y un modulo nuevo aparece encendido
 * sin que nadie tenga que ir a buscarlo al configurador.
 *
 * La cadena VACIA significa "no hay ninguno apagado", que es lo mismo que no
 * tener cookie. Apagarlos todos si se representa: la lista con las ocho o las
 * once claves.
 */
export function modulosValidos(
  valor: string | null | undefined,
): ModuloTablero[] {
  if (!valor) return [...MODULOS_POR_DEFECTO];

  const apagados = new Set(valor.split(",").map((c) => c.trim()));
  return MODULOS.filter((m) => !apagados.has(m.clave)).map((m) => m.clave);
}

/**
 * Guarda la preferencia en el acto, sin pasar por el servidor.
 *
 * Encender o apagar un modulo no necesita datos nuevos: el servidor ya mando
 * los de TODOS los modulos de la obra elegida, asi que el cambio es solo
 * enseñar u ocultar. Ir al servidor por esto añadiria una espera a una accion
 * que debe ser instantanea.
 *
 * Cambiar de OBRA si necesita servidor, y eso lo hace el componente con una
 * navegacion: son cifras distintas, no las mismas escondidas.
 */
export function guardarTablero(
  modulos: readonly ModuloTablero[],
  obraId?: string,
): void {
  if (typeof document === "undefined") return;

  // Se recibe lo VISIBLE, que es lo que maneja la interfaz, y se guarda su
  // complemento. La conversion vive aqui para que ningun componente tenga que
  // acordarse de invertir la lista.
  const visibles = new Set<string>(modulos);
  const apagados = MODULOS.filter((m) => !visibles.has(m.clave)).map(
    (m) => m.clave,
  );

  const comun = `path=/; max-age=${DURACION_COOKIE}; SameSite=Lax`;
  document.cookie = `${COOKIE_TABLERO}=${apagados.join(",")}; ${comun}`;
  if (obraId) document.cookie = `${COOKIE_TABLERO_OBRA}=${obraId}; ${comun}`;
}

/**
 * Como se lee un indice: verde por delante, ambar rozando, rojo por detras.
 *
 * Los bordes son los de la practica habitual en control de obra —1.00 y
 * 0.90— y se dejan aqui, en logica pura, para que el semaforo del tablero y
 * el que vendra con el valor ganado no puedan discrepar.
 *
 * El 0.90 y el 1.00 exactos caen en AMBAR: ir justo al plan no es ir
 * sobrado, y pintarlo verde invita a no mirarlo.
 */
export type Semaforo = "verde" | "ambar" | "rojo";

export function semaforoIndice(indice: number | null): Semaforo | null {
  if (indice === null || !Number.isFinite(indice)) return null;
  if (indice > 1) return "verde";
  if (indice >= 0.9) return "ambar";
  return "rojo";
}

/**
 * El mismo semaforo pero para una desviacion en PUNTOS de porcentaje, que es
 * como se mide el avance fisico mientras el peso siga siendo la duracion.
 *
 * El umbral de cinco puntos es el que ya usa el aviso de la tarjeta de obra:
 * por debajo es ruido del reparto diario, no un atraso que nadie deba
 * corregir.
 */
export function semaforoDesfase(desfase: number): Semaforo {
  if (desfase >= 0) return "verde";
  if (desfase > -5) return "ambar";
  return "rojo";
}

export const COLOR_SEMAFORO: Record<Semaforo, string> = {
  verde: "var(--color-exito)",
  ambar: "var(--color-alerta)",
  rojo: "var(--color-peligro)",
};
