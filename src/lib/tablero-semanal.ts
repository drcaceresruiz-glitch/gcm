/**
 * El tablero de planificacion semanal del Last Planner, en datos.
 * Logica pura, sin base de datos.
 *
 * Es la pizarra de la sala puesta en filas y columnas: una fila por
 * contratista, una columna por dia habil, y una tarjeta por compromiso. GCM no
 * viene a sustituir esa pizarra —el compromiso publico se adquiere delante de
 * la gente, no delante de una pantalla— sino a ser el REGISTRO de lo que se
 * acordo, para que nadie tenga que transcribir post-its y las metricas salgan
 * solas.
 *
 * Dos reglas gobiernan este archivo, y las dos son la misma idea:
 * **lo que no se puede colocar se ENSEÑA, no se esconde.**
 *
 *   - Un compromiso sin dia no desaparece: va a su banda «sin dia». Es trabajo
 *     pactado para la semana que todavia no tiene hueco, y esa es justamente
 *     la conversacion que el tablero existe para provocar.
 *   - Un compromiso sin contratista tampoco: va a una fila propia, la ultima.
 *     Trabajo sin dueño es el hallazgo mas util de la reunion, y esconderlo
 *     dentro de otra fila lo perderia.
 */

const DIA_MS = 86_400_000;

/// Etiqueta de la fila de los compromisos sin contratista asignado.
export const SIN_CONTRATISTA = "Sin contratista asignado";

export interface DiaTablero {
  /// ISO 1-7 (lunes = 1), como `WorkCalendar.diaSemana`.
  iso: number;
  fecha: Date;
  laborable: boolean;
  /**
   * Si la columna se pinta.
   *
   * Un dia no laborable y VACIO sobra: mete ruido en una pizarra que se lee de
   * un vistazo. Pero uno no laborable CON tarjetas no se puede esconder, o el
   * tablero perderia trabajo comprometido —y que alguien haya puesto algo un
   * domingo es exactamente lo que hay que ver—.
   */
  visible: boolean;
}

export interface CompromisoEnTablero {
  id: string;
  descripcion: string;
  proveedorId: string | null;
  proveedorNombre: string | null;
  zona: string | null;
  /// Hex del post-it. Null = sin color, y la tarjeta sale neutra.
  color: string | null;
  cantidadPlan: string | null;
  unidad: string | null;
  /// null = la semana sigue abierta y nadie ha evaluado todavia.
  cumplido: boolean | null;
  /// ISO 1-7. Null en los dos = sin dia asignado.
  diaInicio: number | null;
  diaFin: number | null;
}

export interface Tarjeta extends CompromisoEnTablero {
  /// Indice de la primera columna que ocupa, dentro de `dias`.
  desde: number;
  /// Indice de la ultima. Igual que `desde` cuando es de un solo dia.
  hasta: number;
}

export interface FilaTablero {
  /// null = la fila de los que no tienen contratista.
  proveedorId: string | null;
  nombre: string;
  tarjetas: Tarjeta[];
  /// Compromisos de este contratista sin dia todavia.
  sinDia: CompromisoEnTablero[];
}

export interface Tablero {
  dias: DiaTablero[];
  filas: FilaTablero[];
  /// Cuantas tarjetas estan colocadas en el calendario.
  colocadas: number;
  /// Cuantos compromisos siguen sin dia. Es la cifra que la reunion tiene que
  /// bajar a cero antes de dar la semana por planificada.
  sinDia: number;
}

/**
 * Los siete dias de la semana que cierra en `fechaCorte`, en orden.
 *
 * La semana del PTS es la que termina en el corte, asi que va de
 * `fechaCorte - 6` a `fechaCorte` —el mismo rango que `rangoSemana`—. Los
 * siete valores ISO aparecen exactamente una vez, asi que cualquier dia 1-7
 * cae en una columna y solo una.
 */
export function diasDeLaSemana(
  fechaCorte: Date,
  laborables: ReadonlySet<number>,
): DiaTablero[] {
  const dias: DiaTablero[] = [];

  for (let i = 6; i >= 0; i--) {
    const fecha = new Date(fechaCorte.getTime() - i * DIA_MS);
    const dow = fecha.getUTCDay();
    const iso = dow === 0 ? 7 : dow;

    dias.push({
      iso,
      fecha,
      // Sin calendario cargado se asume laborable: es preferible enseñar de
      // mas a esconder un dia con trabajo dentro.
      laborable: laborables.size === 0 || laborables.has(iso),
      visible: true,
    });
  }

  return dias;
}

/**
 * El tablero entero: columnas, filas y tarjetas colocadas.
 *
 * Las filas van ordenadas por nombre de contratista, y la de «sin contratista»
 * SIEMPRE la ultima aunque alfabeticamente le tocara otro sitio: es la que
 * cierra la lectura, no la que la abre.
 */
export function construirTablero(
  fechaCorte: Date,
  laborables: ReadonlySet<number>,
  compromisos: readonly CompromisoEnTablero[],
): Tablero {
  const dias = diasDeLaSemana(fechaCorte, laborables);
  const columnaDeIso = new Map(dias.map((d, i) => [d.iso, i]));

  const porContratista = new Map<string, FilaTablero>();
  let colocadas = 0;
  let sinDia = 0;

  for (const c of compromisos) {
    const clave = c.proveedorId ?? "";
    let fila = porContratista.get(clave);
    if (!fila) {
      fila = {
        proveedorId: c.proveedorId,
        nombre: c.proveedorNombre ?? SIN_CONTRATISTA,
        tarjetas: [],
        sinDia: [],
      };
      porContratista.set(clave, fila);
    }

    if (c.diaInicio === null) {
      fila.sinDia.push(c);
      sinDia++;
      continue;
    }

    const desde = columnaDeIso.get(c.diaInicio);
    if (desde === undefined) {
      // Un dia fuera de 1-7 no existe en ninguna columna. No se descarta en
      // silencio: se trata como si no tuviera dia, que es lo que de hecho es.
      fila.sinDia.push(c);
      sinDia++;
      continue;
    }

    // SE COMPARA POR COLUMNA, NO POR NUMERO DE DIA, y la diferencia no es
    // cosmetica: la semana termina en el corte, asi que empieza en el dia
    // siguiente y NO en lunes. Con un corte en viernes, la semana va de sabado
    // a viernes, y un compromiso de sabado(6) a lunes(1) es un tramo perfecto
    // que cruza el fin de semana —aunque 6 sea mayor que 1—. Comparando los
    // numeros ISO se aplastaba a un solo dia; comparando columnas se estira
    // como debe.
    //
    // `max` sobre las columnas y no un intercambio: si el fin queda de verdad
    // ANTES del inicio, el dato esta roto y darle la vuelta inventaria un
    // tramo que nadie pacto. Se queda en un solo dia, que es lo minimo
    // defendible.
    const columnaFin = columnaDeIso.get(c.diaFin ?? c.diaInicio) ?? desde;

    fila.tarjetas.push({ ...c, desde, hasta: Math.max(desde, columnaFin) });
    colocadas++;
  }

  for (const fila of porContratista.values()) {
    fila.tarjetas.sort((a, b) => a.desde - b.desde || a.descripcion.localeCompare(b.descripcion, "es"));
  }

  const filas = [...porContratista.values()].sort((a, b) => {
    if (a.proveedorId === null) return 1;
    if (b.proveedorId === null) return -1;
    return a.nombre.localeCompare(b.nombre, "es");
  });

  // Una columna no laborable solo se pinta si alguien puso trabajo en ella.
  for (const [i, dia] of dias.entries()) {
    if (dia.laborable) continue;
    dia.visible = filas.some((f) =>
      f.tarjetas.some((t) => t.desde <= i && i <= t.hasta),
    );
  }

  return { dias, filas, colocadas, sinDia };
}

/**
 * El codigo de colores del post-it, como SUGERENCIA.
 *
 * Es la convencion mas extendida en obra —azul/verde estructuras, amarillo
 * instalaciones, rosa acabados, rojo alerta— pero es una convencion, no una
 * norma: cada empresa tiene la suya y algunas pintan por zona en vez de por
 * especialidad. Por eso viaja con su significado escrito al lado y el campo
 * sigue siendo un hex libre: quien quiera otra cosa la escribe.
 */
export const PALETA_TABLERO: ReadonlyArray<{ hex: string; etiqueta: string }> = [
  { hex: "#2563eb", etiqueta: "Estructuras / concreto" },
  { hex: "#16a34a", etiqueta: "Ingenierías principales" },
  { hex: "#eab308", etiqueta: "Instalaciones (eléctricas / mecánicas)" },
  { hex: "#f97316", etiqueta: "Acabados / tabiquería" },
  { hex: "#ec4899", etiqueta: "Detalles arquitectónicos" },
  { hex: "#dc2626", etiqueta: "Crítico / alerta temprana" },
];

/**
 * Que color de texto se lee encima de un fondo.
 *
 * Sin esto, el amarillo de instalaciones con letra blanca queda ilegible en la
 * pantalla de la sala, que es donde justamente hay que leerlo de lejos. Es la
 * luminancia percibida (ITU-R BT.601), no el promedio de los canales: el verde
 * pesa mucho mas que el azul para el ojo.
 */
export function textoSobre(hex: string | null): "claro" | "oscuro" {
  if (!hex || !/^#[0-9a-f]{6}$/i.test(hex)) return "oscuro";

  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);

  return (r * 299 + g * 587 + b * 114) / 1000 > 140 ? "oscuro" : "claro";
}
