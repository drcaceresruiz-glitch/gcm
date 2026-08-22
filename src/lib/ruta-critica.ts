import { avanzarDiasLaborables, diasLaborablesEntre, type DiaLaboral } from "@/lib/calendario";

/**
 * Ruta critica y holgura (CPM), calculadas por GCM.
 *
 * Hasta ahora `esCritico`/`holguraDias` solo llegaban desde MS Project
 * (`<Critical>`/`<TotalSlack>` del XML): GCM nunca los calculaba por su
 * cuenta. Un cronograma importado por Excel puede traer la red de
 * predecesoras completa (`DependenciaTarea`, via la columna "Depende de")
 * y aun asi nadie corria un algoritmo sobre ella.
 *
 * Aqui vive ese algoritmo, en logica pura: pasada hacia adelante (fechas
 * mas tempranas), pasada hacia atras (fechas mas tardias, desde el fin del
 * proyecto), holgura = diferencia entre ambas. Los cuatro tipos de enlace
 * (FC/CC/FF/CF) se resuelven los dos sentidos, porque el archivo real trae
 * mas de uno y resolver solo FC daria una ruta critica que parece completa
 * y no lo es —el mismo tipo de numero que miente sin avisar—.
 */

export interface NodoRed {
  uid: number;
  /// Decimal como texto, igual que el resto del sistema.
  duracionDias: string;
  esResumen: boolean;
  esHito: boolean;
}

export type TipoEnlace = "FC" | "CC" | "FF" | "CF";

export interface EnlaceRed {
  tareaUid: number;
  predecesoraUid: number;
  tipo: TipoEnlace;
  desfaseDias: string;
}

export interface ResultadoCPM {
  esCritico: Map<number, boolean>;
  holguraDias: Map<number, string>;
  /// Un ciclo en las predecesoras no se puede resolver: se devuelve vacio
  /// en vez de fingir un numero. El llamador se queda con lo que ya tenia
  /// (esCritico: false), igual que hoy sin red de precedencias.
  ciclo: boolean;
}

/// Duracion en dias laborables ENTEROS, con un minimo de 1: un hito
/// (duracion cero) ocupa un unico dia-slot en la red, y su fin coincide
/// con su inicio.
function duracionEntera(duracionDias: string): number {
  return Math.max(1, Math.ceil(Number(duracionDias)));
}

function finDesdeInicio(
  inicio: Date,
  duracionDias: string,
  calendario: readonly DiaLaboral[],
): Date {
  return avanzarDiasLaborables(inicio, duracionEntera(duracionDias) - 1, calendario, 1);
}

function inicioDesdeFin(
  fin: Date,
  duracionDias: string,
  calendario: readonly DiaLaboral[],
): Date {
  return avanzarDiasLaborables(fin, duracionEntera(duracionDias) - 1, calendario, -1);
}

/// Mueve una fecha por un desfase CON SIGNO (positivo adelanta, negativo
/// atrasa), en dias laborables.
function moverDesfase(
  fecha: Date,
  desfaseDias: string,
  calendario: readonly DiaLaboral[],
): Date {
  const d = Number(desfaseDias);
  return avanzarDiasLaborables(fecha, Math.abs(d), calendario, d >= 0 ? 1 : -1);
}

/// La misma operacion en sentido contrario: para la pasada hacia atras, un
/// desfase que ADELANTABA la fecha temprana ATRASA la fecha tardia.
function restarDesfase(
  fecha: Date,
  desfaseDias: string,
  calendario: readonly DiaLaboral[],
): Date {
  return moverDesfase(fecha, String(-Number(desfaseDias)), calendario);
}

/// Orden topologico de Kahn sobre el grafo tareaUid <- predecesoraUid. Si
/// sobran nodos sin poder procesar, el grafo tiene un ciclo.
function ordenTopologico(
  uids: readonly number[],
  enlaces: readonly EnlaceRed[],
): { orden: number[]; ciclo: boolean } {
  const entrantes = new Map<number, EnlaceRed[]>();
  const gradoEntrada = new Map<number, number>();
  for (const uid of uids) {
    entrantes.set(uid, []);
    gradoEntrada.set(uid, 0);
  }
  for (const e of enlaces) {
    if (!entrantes.has(e.tareaUid) || !entrantes.has(e.predecesoraUid)) continue;
    entrantes.get(e.tareaUid)!.push(e);
    gradoEntrada.set(e.tareaUid, (gradoEntrada.get(e.tareaUid) ?? 0) + 1);
  }

  const salientes = new Map<number, number[]>();
  for (const uid of uids) salientes.set(uid, []);
  for (const e of enlaces) {
    if (!salientes.has(e.predecesoraUid) || !entrantes.has(e.tareaUid)) continue;
    salientes.get(e.predecesoraUid)!.push(e.tareaUid);
  }

  const cola = uids.filter((uid) => (gradoEntrada.get(uid) ?? 0) === 0);
  const orden: number[] = [];
  const grado = new Map(gradoEntrada);

  while (cola.length > 0) {
    const uid = cola.shift()!;
    orden.push(uid);
    for (const siguiente of salientes.get(uid) ?? []) {
      const restante = (grado.get(siguiente) ?? 0) - 1;
      grado.set(siguiente, restante);
      if (restante === 0) cola.push(siguiente);
    }
  }

  return { orden, ciclo: orden.length !== uids.length };
}

export function calcularRutaCritica(
  nodos: readonly NodoRed[],
  enlaces: readonly EnlaceRed[],
  fechaInicioObra: Date,
  calendario: readonly DiaLaboral[],
): ResultadoCPM {
  const vacio: ResultadoCPM = {
    esCritico: new Map(),
    holguraDias: new Map(),
    ciclo: false,
  };

  const trabajo = nodos.filter((n) => !n.esResumen);
  if (trabajo.length === 0) return vacio;

  const porUid = new Map(trabajo.map((n) => [n.uid, n]));
  const uids = trabajo.map((n) => n.uid);
  const enlacesValidos = enlaces.filter(
    (e) => porUid.has(e.tareaUid) && porUid.has(e.predecesoraUid),
  );

  const { orden, ciclo } = ordenTopologico(uids, enlacesValidos);
  if (ciclo) return { ...vacio, ciclo: true };

  const entrantesPorTarea = new Map<number, EnlaceRed[]>();
  const salientesPorTarea = new Map<number, EnlaceRed[]>();
  for (const uid of uids) {
    entrantesPorTarea.set(uid, []);
    salientesPorTarea.set(uid, []);
  }
  for (const e of enlacesValidos) {
    entrantesPorTarea.get(e.tareaUid)!.push(e);
    salientesPorTarea.get(e.predecesoraUid)!.push(e);
  }

  // --- Pasada hacia adelante: fechas mas tempranas ---
  const es = new Map<number, Date>();
  const ef = new Map<number, Date>();

  for (const uid of orden) {
    const nodo = porUid.get(uid)!;
    const entrantes = entrantesPorTarea.get(uid) ?? [];

    let inicioTemprano = fechaInicioObra;
    for (const enlace of entrantes) {
      const p = es.get(enlace.predecesoraUid)!;
      const finP = ef.get(enlace.predecesoraUid)!;
      let candidato: Date;
      switch (enlace.tipo) {
        case "FC": {
          // La sucesora no puede empezar EL MISMO dia en que termina la
          // predecesora —ese dia la predecesora lo sigue ocupando, EF es
          // inclusivo—: hace falta un dia laborable mas antes de aplicar
          // el desfase.
          const diaSiguiente = avanzarDiasLaborables(finP, 1, calendario, 1);
          candidato = moverDesfase(diaSiguiente, enlace.desfaseDias, calendario);
          break;
        }
        case "CC":
          candidato = moverDesfase(p, enlace.desfaseDias, calendario);
          break;
        case "FF": {
          const finRequerido = moverDesfase(finP, enlace.desfaseDias, calendario);
          candidato = inicioDesdeFin(finRequerido, nodo.duracionDias, calendario);
          break;
        }
        case "CF": {
          const finRequerido = moverDesfase(p, enlace.desfaseDias, calendario);
          candidato = inicioDesdeFin(finRequerido, nodo.duracionDias, calendario);
          break;
        }
      }
      if (candidato.getTime() > inicioTemprano.getTime()) inicioTemprano = candidato;
    }

    es.set(uid, inicioTemprano);
    ef.set(uid, finDesdeInicio(inicioTemprano, nodo.duracionDias, calendario));
  }

  const finProyecto = uids.reduce(
    (max, uid) => (ef.get(uid)!.getTime() > max.getTime() ? ef.get(uid)! : max),
    ef.get(orden[0]!)!,
  );

  // --- Pasada hacia atras: fechas mas tardias ---
  const ls = new Map<number, Date>();
  const lf = new Map<number, Date>();

  for (let i = orden.length - 1; i >= 0; i--) {
    const uid = orden[i]!;
    const nodo = porUid.get(uid)!;
    const salientes = salientesPorTarea.get(uid) ?? [];

    let finTardio = finProyecto;
    for (const enlace of salientes) {
      const s = ls.get(enlace.tareaUid)!;
      const finS = lf.get(enlace.tareaUid)!;
      let candidato: Date;
      switch (enlace.tipo) {
        case "FC": {
          // Simetrico al ajuste de la pasada hacia adelante: la
          // predecesora tiene que terminar el dia ANTES de que la
          // sucesora tenga que empezar, no ese mismo dia.
          const diaAnterior = avanzarDiasLaborables(s, 1, calendario, -1);
          candidato = restarDesfase(diaAnterior, enlace.desfaseDias, calendario);
          break;
        }
        case "CC": {
          const inicioRequerido = restarDesfase(s, enlace.desfaseDias, calendario);
          candidato = finDesdeInicio(inicioRequerido, nodo.duracionDias, calendario);
          break;
        }
        case "FF":
          candidato = restarDesfase(finS, enlace.desfaseDias, calendario);
          break;
        case "CF": {
          const inicioRequerido = restarDesfase(finS, enlace.desfaseDias, calendario);
          candidato = finDesdeInicio(inicioRequerido, nodo.duracionDias, calendario);
          break;
        }
      }
      if (candidato.getTime() < finTardio.getTime()) finTardio = candidato;
    }

    lf.set(uid, finTardio);
    ls.set(uid, inicioDesdeFin(finTardio, nodo.duracionDias, calendario));
  }

  // --- Holgura y criticidad ---
  const esCritico = new Map<number, boolean>();
  const holguraDias = new Map<number, string>();

  for (const uid of uids) {
    const dias = Math.max(0, diasLaborablesEntre(es.get(uid)!, ls.get(uid)!, calendario) - 1);
    holguraDias.set(uid, dias.toFixed(2));
    esCritico.set(uid, dias <= 0);
  }

  return { esCritico, holguraDias, ciclo: false };
}
