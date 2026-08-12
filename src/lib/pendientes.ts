/**
 * Que le falta hacer al residente, y por que importa.
 *
 * GCM sabe muchas cosas que no dice. Sabe que doce tareas de la ventana no se
 * han analizado —y que por eso el porcentaje de confiabilidad esta mintiendo—,
 * sabe que una tarea empezo hace cinco dias y nadie ha reportado avance, y
 * sabe que una partida que arranca en dos semanas no tiene a nadie contratado.
 * Todo eso estaba en la base y en ninguna pantalla.
 *
 * Este modulo convierte ese silencio en una lista. Dos reglas de forma:
 *
 * - **Cada pendiente dice la CONSECUENCIA, no solo el hecho.** "12 tareas sin
 *   analizar" no mueve a nadie; "tu confiabilidad dice 40% y no es cierto" si.
 *   Es la misma linea del resto del sistema: explicar que se rompe.
 * - **Informa, no bloquea.** Nada de esto impide trabajar. GCM ya eligio
 *   advertir en vez de impedir cuando se comprometen tareas sin liberar, y
 *   aqui vale lo mismo: quien esta en obra sabe cosas que el sistema no.
 *
 * La urgencia se transmite con el ORDEN y con el numero, nunca con parpadeos:
 * lo que parpadea se ignora a los tres dias y molesta desde el primero.
 *
 * Aqui vive solo la decision —que es pendiente, con que gravedad y en que
 * orden—. Quien cuenta las filas es el servicio.
 */

/// El ciclo del dato: entra de campo, se procesa en la planificacion, sale
/// como indicador. Un hueco en las entradas invalida todo lo que viene detras,
/// por eso se leen en este orden.
export type BloquePendiente = "entradas" | "procesos" | "salidas";

/**
 * `critica` = hay una cifra que ahora mismo es falsa, o algo que va a parar la
 * obra. `aviso` = conviene mirarlo esta semana.
 */
export type Gravedad = "critica" | "aviso";

export interface Pendiente {
  clave: string;
  bloque: BloquePendiente;
  gravedad: Gravedad;
  /// Que falta, en una linea y con el numero dentro.
  titulo: string;
  /// Que se rompe si no se hace. Esto es lo que mueve a alguien.
  consecuencia: string;
  /// Ruta relativa a la obra donde se arregla ("/lookahead", "/plan-semanal").
  camino: string;
  /// Cuantos elementos afecta, para ordenar dentro de la misma gravedad.
  cuantos: number;
}

/**
 * Lo que el servicio ha contado. Todo son numeros ya resueltos: este modulo
 * no toca la base ni sabe de Prisma, para poder probarlo entero.
 */
export interface ConteoPendientes {
  /// Tareas cuyo inicio ya paso y no tienen ningun avance reportado.
  tareasEmpezadasSinAvance: number;
  /// Semanas CERRADAS donde algun compromiso quedo sin % alcanzado.
  semanasSinPorcentaje: number;
  /// Tareas de la ventana del Lookahead que nadie ha analizado: nadie ha
  /// dicho que flujos les aplican, ni siquiera que no les aplica ninguno.
  lookaheadSinAnalizar: number;
  /// Confiabilidad que se esta mostrando hoy (0..100). Solo para el texto.
  confiabilidadMostrada: number | null;
  /// Tareas que arrancan pronto, YA ANALIZADAS, y con restricciones sin
  /// liberar. Las que nadie ha mirado van en `tareasProximasSinAnalizar`: son
  /// dos problemas distintos y se arreglan de forma distinta.
  tareasProximasBloqueadas: number;
  /// Tareas que arrancan pronto y que nadie ha analizado todavia.
  tareasProximasSinAnalizar: number;
  /// Dias de la ventana con que se miran "las que arrancan pronto".
  diasVentana: number;
  /// Tareas que arrancan pronto y cuya partida no tiene a nadie contratado.
  tareasProximasSinCobertura: number;
  /// Partidas cuyo comprometido supera su presupuesto.
  partidasSobregiradas: number;
  /// PPC de la ultima semana cerrada y de la anterior, para ver la caida.
  ppcUltimo: number | null;
  ppcAnterior: number | null;
  /// Cobertura del mapeo tarea-partida (0..100).
  coberturaMapeo: number | null;
}

/// Por debajo de esto, el PPC ya no es un mal dato suelto sino un patron.
export const PPC_PREOCUPANTE = 70;

/// Por debajo de esto SI es literalmente cierto que se cumple menos de la
/// mitad de lo prometido. Existe para que el texto no lo diga cuando no lo es.
export const PPC_MENOS_DE_LA_MITAD = 50;

/// El EVM no puede ponderar por dinero con menos mapeo que esto.
export const COBERTURA_MINIMA_MAPEO = 60;

export interface LecturaPpc {
  gravedad: Gravedad;
  titulo: string;
  consecuencia: string;
}

/**
 * Que decir del PPC de la ultima semana, sin decir nada que no sea cierto.
 *
 * Hasta el 12/08/2026 esto era una sola frase fija: **«Menos de la mitad de lo
 * prometido se cumple con regularidad»**, y salia con cualquier PPC por debajo
 * de 70 —y tambien con un 85% que hubiera bajado desde 88—. Con el 62% real de
 * la primera obra, GCM afirmaba en pantalla algo que sus propios numeros
 * desmentian: 62 no es menos de la mitad.
 *
 * Importa mas de lo que parece. El panel «Que falta» se gana la atencion del
 * residente diciendo consecuencias exactas; una sola frase que exagera ensena
 * que aqui se exagera, y entonces tampoco se cree la que si es grave.
 *
 * Asi que la lectura se deriva del numero:
 *
 * - por debajo de 50, «menos de la mitad» ES literalmente cierto;
 * - entre 50 y 70, se dice cuantos de cada diez se cumplieron y por que 70 es
 *   la raya —debajo de ahi el plan ya no predice—;
 * - por encima de 70 solo se habla si CAYO, y entonces lo unico que se dice es
 *   que cayo, porque el nivel esta bien.
 *
 * Devuelve null cuando no hay nada que decir: PPC sano y sin caida.
 */
export function lecturaDelPpc(
  ultimo: number | null,
  anterior: number | null,
): LecturaPpc | null {
  if (ultimo === null) return null;

  const ppc = Math.round(ultimo);
  const cayo = anterior !== null && ultimo < anterior;
  const bajo = ppc < PPC_PREOCUPANTE;

  if (!bajo && !cayo) return null;

  const titulo = `El PPC de la última semana fue ${ppc}%`;
  const caida = cayo ? ` Baja desde ${Math.round(anterior)}%.` : "";

  if (ppc < PPC_MENOS_DE_LA_MITAD) {
    return {
      gravedad: "critica",
      titulo,
      consecuencia:
        `Menos de la mitad de lo que se promete se cumple: el plan semanal ya no predice nada. ` +
        `Mira el Pareto de causas antes de comprometer la semana que viene.${caida}`,
    };
  }

  if (bajo) {
    // Se redondea a la baja: prometer «7 de cada 10» con un 69% seria el mismo
    // defecto que se esta arreglando, en pequeno.
    const diez = Math.floor(ppc / 10);
    return {
      gravedad: "critica",
      titulo,
      consecuencia:
        `Se cumplieron algo más de ${diez} de cada 10 compromisos. Por debajo del ${PPC_PREOCUPANTE}% ` +
        `la semana que viene se planifica sobre promesas que ya fallaron: mira el Pareto de causas ` +
        `antes de comprometer.${caida}`,
    };
  }

  // Nivel bueno, pero a menos. Se avisa sin dramatizar: una alarma que grita
  // con un 85% ensena a ignorar la que suene con un 45%.
  return {
    gravedad: "aviso",
    titulo,
    consecuencia:
      `El nivel sigue siendo bueno, pero va a menos.${caida} ` +
      `Mira el Pareto de causas: dos semanas seguidas a la baja ya son una tendencia.`,
  };
}

const ORDEN_BLOQUE: Record<BloquePendiente, number> = {
  entradas: 0,
  procesos: 1,
  salidas: 2,
};

function plural(n: number, singular: string, prural: string): string {
  return n === 1 ? singular : prural;
}

/**
 * La lista de lo que falta, ya ordenada.
 *
 * Vacia significa que no hay nada pendiente, y eso hay que poder decirlo: un
 * panel que nunca esta en verde ensena a ignorarlo.
 */
export function pendientesDeObra(c: ConteoPendientes): Pendiente[] {
  const salida: Pendiente[] = [];

  // --- ENTRADAS: sin esto, lo de abajo mide el vacio -----------------------

  if (c.tareasEmpezadasSinAvance > 0) {
    const n = c.tareasEmpezadasSinAvance;
    salida.push({
      clave: "avance-sin-reportar",
      bloque: "entradas",
      gravedad: "critica",
      titulo: `${n} ${plural(n, "tarea empezo", "tareas empezaron")} y nadie ha reportado avance`,
      consecuencia:
        "La curva S las cuenta al 0%: la obra se ve mas atrasada de lo que esta, y el valor ganado tambien.",
      camino: "/cronograma",
      cuantos: n,
    });
  }

  if (c.semanasSinPorcentaje > 0) {
    const n = c.semanasSinPorcentaje;
    salida.push({
      clave: "cierre-sin-porcentaje",
      bloque: "entradas",
      gravedad: "aviso",
      titulo: `${n} ${plural(n, "semana cerrada", "semanas cerradas")} sin % alcanzado`,
      consecuencia:
        "Esos compromisos cuentan para el PPC pero no movieron la curva S. El avance fisico se quedo sin registrar.",
      camino: "/plan-semanal",
      cuantos: n,
    });
  }

  // --- PROCESOS: lo que va a frenar la obra en las proximas semanas --------

  if (c.tareasProximasSinCobertura > 0) {
    const n = c.tareasProximasSinCobertura;
    salida.push({
      clave: "sin-cobertura",
      bloque: "procesos",
      gravedad: "critica",
      titulo: `${n} ${plural(n, "tarea arranca", "tareas arrancan")} en ${c.diasVentana} dias sin nadie contratado`,
      consecuencia:
        "Su partida no tiene encargo: no hay proveedor ni precio cerrado para ejecutarla, y a estas alturas contratar ya corre.",
      camino: "/proveedores",
      cuantos: n,
    });
  }

  if (c.tareasProximasBloqueadas > 0) {
    const n = c.tareasProximasBloqueadas;
    salida.push({
      clave: "restricciones-sin-liberar",
      bloque: "procesos",
      gravedad: "critica",
      titulo: `${n} ${plural(n, "tarea arranca", "tareas arrancan")} con restricciones sin liberar`,
      consecuencia:
        "Comprometerlas asi es prometer trabajo que no se puede empezar, y es lo que hunde el PPC de la semana siguiente.",
      camino: "/lookahead",
      cuantos: n,
    });
  }

  if (c.tareasProximasSinAnalizar > 0) {
    const n = c.tareasProximasSinAnalizar;
    salida.push({
      clave: "proximas-sin-analizar",
      bloque: "procesos",
      gravedad: "critica",
      titulo: `${n} ${plural(n, "tarea arranca", "tareas arrancan")} en ${c.diasVentana} dias y nadie las ha analizado`,
      consecuencia:
        "Nadie ha mirado si les falta plano, material o frente libre. Si falta algo se descubre el lunes que arranca, cuando ya no hay margen para conseguirlo.",
      camino: "/lookahead",
      cuantos: n,
    });
  }

  if (c.lookaheadSinAnalizar > 0) {
    const n = c.lookaheadSinAnalizar;
    const conf =
      c.confiabilidadMostrada !== null
        ? ` Ahora mismo muestra ${Math.round(c.confiabilidadMostrada)}%.`
        : "";
    salida.push({
      clave: "lookahead-sin-analizar",
      bloque: "procesos",
      gravedad: "aviso",
      titulo: `${n} ${plural(n, "tarea de la ventana", "tareas de la ventana")} sin analizar`,
      consecuencia: `Cuentan como no listas, asi que tu confiabilidad sale mas baja de lo real por falta de analisis, no por la obra.${conf}`,
      camino: "/lookahead",
      cuantos: n,
    });
  }

  // --- SALIDAS: los indicadores que ya estan diciendo algo -----------------

  if (c.partidasSobregiradas > 0) {
    const n = c.partidasSobregiradas;
    salida.push({
      clave: "sobregiro",
      bloque: "salidas",
      gravedad: "critica",
      titulo: `${n} ${plural(n, "partida comprometida", "partidas comprometidas")} por encima de su presupuesto`,
      consecuencia:
        "Ya se pidio mas dinero del que la partida tenia. O falta un adicional que lo respalde, o hay que reconvertir de otra.",
      camino: "/ordenes",
      cuantos: n,
    });
  }

  const ppc = lecturaDelPpc(c.ppcUltimo, c.ppcAnterior);
  if (ppc) {
    salida.push({
      clave: "ppc-bajo",
      bloque: "salidas",
      // Un PPC bajo no rompe ningun dato: senala un problema de gestion, y de
      // eso avisa el Pareto de causas. Por eso avisa y no grita.
      gravedad: ppc.gravedad,
      titulo: ppc.titulo,
      consecuencia: ppc.consecuencia,
      camino: "/plan-semanal",
      cuantos: 1,
    });
  }

  if (
    c.coberturaMapeo !== null &&
    c.coberturaMapeo < COBERTURA_MINIMA_MAPEO
  ) {
    salida.push({
      clave: "mapeo-incompleto",
      bloque: "salidas",
      gravedad: "aviso",
      titulo: `Solo el ${Math.round(c.coberturaMapeo)}% del presupuesto esta enlazado al cronograma`,
      consecuencia:
        "Mientras no pase del 60%, el avance se pondera por duracion y no por dinero: una tarea barata pesa igual que una cara.",
      camino: "/cronograma/mapeo",
      cuantos: 1,
    });
  }

  return ordenar(salida);
}

/**
 * Primero lo que rompe una cifra, luego por bloque —una entrada mala invalida
 * lo de abajo— y a igualdad, lo que afecta a mas cosas.
 */
function ordenar(lista: readonly Pendiente[]): Pendiente[] {
  return [...lista].sort((a, b) => {
    if (a.gravedad !== b.gravedad) return a.gravedad === "critica" ? -1 : 1;
    if (a.bloque !== b.bloque) {
      return ORDEN_BLOQUE[a.bloque] - ORDEN_BLOQUE[b.bloque];
    }
    return b.cuantos - a.cuantos;
  });
}

/** Cuantos hay de cada gravedad, para el contador de la cabecera. */
export function resumirPendientes(lista: readonly Pendiente[]): {
  criticas: number;
  avisos: number;
  total: number;
} {
  const criticas = lista.filter((p) => p.gravedad === "critica").length;
  return { criticas, avisos: lista.length - criticas, total: lista.length };
}
