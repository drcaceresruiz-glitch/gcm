/**
 * Mover lineas del presupuesto meta y renumerarlas.
 *
 * POR QUE EXISTE. Un presupuesto que llega de otra oficina trae la jerarquia
 * en la MAQUETA -sangrias, negritas, una fila «PRIMER PISO» encima de tres
 * bloques- y no siempre en la numeracion. En el presupuesto que destapo esto,
 * `7.01.00 PRIMER PISO` agrupa visualmente a `7.02.00 REDES DE DESAGUE`, pero
 * por codigo son HERMANOS: `7.01` y `7.02` estan al mismo nivel. GCM solo
 * puede fiarse de los numeros, asi que los pinta al mismo nivel, y quien mira
 * la pantalla ve un arbol que no es el suyo.
 *
 * Se arregla dentro, moviendo lineas, y no pidiendo que rehagan el Excel.
 *
 * EL ARBOL VIVE EN (orden, nivel), NO EN EL CODIGO. El codigo se DERIVA al
 * final, en `renumerar`. Manipular codigos a mano -partirlos, sumarles uno,
 * recomponerlos- es como se desordena un presupuesto entero sin que nadie lo
 * note: basta un `10` que se ordene antes que un `9`. Con la lista plana y el
 * nivel, mover es mover y el numero sale solo.
 *
 * QUE ES CAPITULO SE DECIDE AQUI Y POR UNA SOLA REGLA: lo que tiene hijas.
 * Asi «crear un capitulo» no necesita una operacion propia -se crea una linea
 * y se le mete algo debajo- y no puede quedar un capitulo sin nada dentro
 * pretendiendo ser un titulo, ni una partida con hijas cobrando por su cuenta
 * y por las de abajo.
 */

export type Direccion = "subir" | "bajar" | "sangrar" | "quitar-sangria";

export interface LineaDelArbol {
  id: string;
  /// Profundidad. 0 es un capitulo raiz.
  nivel: number;
  /// Lo unico que no se toca al mover: la descripcion y las cifras viajan.
  tipo: "CAPITULO" | "PARTIDA";
  /// El codigo que resulte de renumerar. Entra el viejo y sale el nuevo.
  codigo: string | null;
}

/**
 * Cuantas lineas cuelgan de la que esta en `i`.
 *
 * Son las siguientes con nivel MAYOR, hasta la primera que vuelve a su altura
 * o mas arriba. Es lo que convierte «mover una linea» en «mover una rama»: un
 * capitulo que se mueve sin sus partidas las deja huerfanas colgando de quien
 * quedara encima, y eso cambia de sitio dinero ajeno.
 */
export function cuantasCuelgan(
  lineas: readonly LineaDelArbol[],
  i: number,
): number {
  const nivel = lineas[i]?.nivel ?? 0;
  let n = 0;
  while (i + 1 + n < lineas.length && (lineas[i + 1 + n]?.nivel ?? 0) > nivel) {
    n++;
  }
  return n;
}

export type ResultadoMover =
  | { ok: true; lineas: LineaDelArbol[] }
  | { ok: false; error: string };

/**
 * Mueve una linea -con todo lo que cuelga de ella- en una de las cuatro
 * direcciones.
 *
 * Devuelve una lista NUEVA; no toca la que entra. Y devuelve el motivo cuando
 * el movimiento no cabe, en vez de dejar la lista igual sin decir nada: un
 * boton que a veces no hace nada es peor que uno que explica por que.
 */
export function mover(
  lineas: readonly LineaDelArbol[],
  id: string,
  direccion: Direccion,
): ResultadoMover {
  const i = lineas.findIndex((l) => l.id === id);
  if (i === -1) return { ok: false, error: "Esa línea no está en la meta." };

  const linea = lineas[i]!;
  const cuelgan = cuantasCuelgan(lineas, i);
  const rama = lineas.slice(i, i + cuelgan + 1);
  const resto = [...lineas.slice(0, i), ...lineas.slice(i + cuelgan + 1)];

  if (direccion === "sangrar") {
    /*
     * Sangrar es «pasa a colgar de la de arriba», asi que hace falta una de
     * arriba a la misma altura. La primera de un bloque no puede sangrarse:
     * no hay nadie de quien colgar, y dejarla mas adentro que su predecesora
     * dibujaria un arbol imposible -un nieto sin hijo-.
     */
    const anterior = lineas[i - 1];
    if (!anterior || anterior.nivel < linea.nivel) {
      return {
        ok: false,
        error:
          "No hay ninguna línea encima de la que pueda colgar. Súbela primero " +
          "o sangra la de arriba.",
      };
    }
    return {
      ok: true,
      // La rama entera baja un escalon: lo de dentro conserva su forma.
      lineas: lineas.map((l, j) =>
        j >= i && j <= i + cuelgan ? { ...l, nivel: l.nivel + 1 } : l,
      ),
    };
  }

  if (direccion === "quitar-sangria") {
    if (linea.nivel === 0) {
      return { ok: false, error: "Esta línea ya está en el nivel más alto." };
    }
    return {
      ok: true,
      lineas: lineas.map((l, j) =>
        j >= i && j <= i + cuelgan ? { ...l, nivel: l.nivel - 1 } : l,
      ),
    };
  }

  if (direccion === "subir") {
    // Su hermana anterior: la primera de arriba a la MISMA altura. Si por el
    // camino aparece una mas alta, es que esta es la primera de su bloque.
    let j = i - 1;
    while (j >= 0 && (lineas[j]?.nivel ?? 0) > linea.nivel) j--;
    if (j < 0 || (lineas[j]?.nivel ?? 0) < linea.nivel) {
      return { ok: false, error: "Ya es la primera de su bloque." };
    }
    return {
      ok: true,
      lineas: [...resto.slice(0, j), ...rama, ...resto.slice(j)],
    };
  }

  // Bajar: se salta la rama de la hermana siguiente y se coloca detras.
  const siguiente = i + cuelgan + 1;
  if (
    siguiente >= lineas.length ||
    (lineas[siguiente]?.nivel ?? 0) < linea.nivel
  ) {
    return { ok: false, error: "Ya es la última de su bloque." };
  }
  const cuelganDeLaSiguiente = cuantasCuelgan(lineas, siguiente);
  const destino = i + cuelganDeLaSiguiente + 1;
  return {
    ok: true,
    lineas: [...resto.slice(0, destino), ...rama, ...resto.slice(destino)],
  };
}

/**
 * Reparte los codigos segun la forma del arbol: 1, 1.01, 1.01.01, 2...
 *
 * DOS CIFRAS a partir del segundo nivel -`1.01` y no `1.1`- porque es como
 * vienen los presupuestos de esta casa y porque asi ordenan bien como texto:
 * con una sola, `1.10` se cuela entre `1.1` y `1.2` en cualquier lista
 * ordenada alfabeticamente, que es media aplicacion.
 *
 * El primer nivel NO se rellena con ceros: los capitulos se llaman 1, 2, 3 en
 * todos los presupuestos, y un «01» de mas se ve raro en la pantalla.
 *
 * Se recalcula el TIPO al mismo tiempo: tiene hijas, es capitulo. Y un
 * capitulo no lleva importe propio, asi que quien pase a serlo se queda sin
 * el; eso lo avisa `lineasQuePierdenImporte`, para que no desaparezca dinero
 * en silencio.
 */
export function renumerar(lineas: readonly LineaDelArbol[]): LineaDelArbol[] {
  const contadores: number[] = [];
  const salida: LineaDelArbol[] = [];

  for (let i = 0; i < lineas.length; i++) {
    const l = lineas[i]!;
    const nivel = Math.max(0, l.nivel);

    /*
     * Se olvida lo que se contaba mas adentro: al volver a subir, la
     * numeracion de dentro empieza otra vez desde uno.
     *
     * Y SE RELLENA LO QUE FALTE POR DEBAJO, con `push`, en vez de estirar el
     * array con `length`. Estirarlo deja HUECOS -indices sin asignar- y `map`
     * se los salta: los codigos salian con el punto doble, «7..01», en cuanto
     * una linea entraba a un nivel al que no se habia llegado contando desde
     * arriba. Se vio con un presupuesto de verdad.
     */
    if (contadores.length > nivel + 1) contadores.length = nivel + 1;
    while (contadores.length < nivel + 1) contadores.push(0);
    contadores[nivel] = (contadores[nivel] ?? 0) + 1;

    const partes = contadores.map((n, p) =>
      p === 0 ? String(n || 1) : String(n || 1).padStart(2, "0"),
    );

    salida.push({
      ...l,
      nivel,
      codigo: partes.join("."),
      tipo: cuantasCuelgan(lineas, i) > 0 ? "CAPITULO" : "PARTIDA",
    });
  }

  return salida;
}

/**
 * Quita una linea y saca un escalon lo que colgaba de ella.
 *
 * Es lo que uno espera al borrar un titulo intermedio: desaparece el titulo y
 * su contenido se queda, un nivel mas afuera. NO se borra lo de dentro —
 * llevarse veinte partidas por delante en un clic no se puede deshacer y nadie
 * lo espera—.
 *
 * Vive aqui y no en el servicio porque es la misma clase de cuenta que
 * `mover`: se prueba con una lista escrita a mano y sin base delante.
 */
export function quitar(
  lineas: readonly LineaDelArbol[],
  id: string,
): LineaDelArbol[] {
  const i = lineas.findIndex((l) => l.id === id);
  if (i === -1) return [...lineas];

  const cuelgan = cuantasCuelgan(lineas, i);

  return [
    ...lineas.slice(0, i),
    // Solo las suyas suben; lo de mas abajo no era suyo.
    ...lineas
      .slice(i + 1, i + 1 + cuelgan)
      .map((l) => ({ ...l, nivel: l.nivel - 1 })),
    ...lineas.slice(i + 1 + cuelgan),
  ];
}

/**
 * Las que van a perder su importe por pasar a ser capitulo.
 *
 * Se pregunta ANTES de guardar. Un capitulo vale la suma de sus partidas y no
 * puede llevar cifra propia, asi que meterle algo debajo a una partida
 * valorizada le quita su importe: es correcto, pero tiene que decirse. En un
 * presupuesto son miles de soles que dejan de estar sin que nadie los haya
 * tocado.
 */
export function lineasQuePierdenImporte(
  antes: readonly LineaDelArbol[],
  despues: readonly LineaDelArbol[],
  conImporte: ReadonlySet<string>,
): string[] {
  const eraPartida = new Set(
    antes.filter((l) => l.tipo === "PARTIDA").map((l) => l.id),
  );
  return despues
    .filter(
      (l) =>
        l.tipo === "CAPITULO" && eraPartida.has(l.id) && conImporte.has(l.id),
    )
    .map((l) => l.id);
}
