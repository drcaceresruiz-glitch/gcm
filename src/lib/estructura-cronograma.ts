/**
 * Como esta armado el esquema de un cronograma, y si hay que fiarse de ello.
 *
 * Existe porque GCM recibe archivos de MS Project de dos formas y la
 * diferencia cambia QUE ES UN CAPITULO:
 *
 *   CON fila de proyecto            SIN fila de proyecto
 *   -------------------            --------------------
 *   (raiz)  PROYECTO               1.0  OBRAS PROVISIONALES   <- capitulos
 *     2.0  SANITARIAS   <- cap.      1.1  Cartel               <- partidas
 *       2.1  Punto agua              1.2  Cerco
 *
 * Antes se daba por hecho que SIEMPRE habia fila de proyecto y los capitulos
 * estaban en `nivelRaiz + 1`. En los archivos que empiezan por los capitulos
 * eso se comia un nivel: la pantalla listaba las PARTIDAS como capitulos, y
 * pasaba en las tres obras de la base sin que nada fallara.
 *
 * La senal es la AUSENCIA DE CODIGO. La fila que resume el proyecto entero no
 * lleva codigo; los capitulos siempre lo llevan («1.0», «4.0», «7.0»).
 *
 * OJO con la diferencia: NO se identifican los capitulos por su codigo —eso
 * fallaria, porque «7.3.1» es hermana de «7.3» y no su hija—, se usa la falta
 * de codigo para reconocer la RAIZ, que es otra pregunta.
 */

export interface TareaConNivel {
  nivel: number;
  codigo: string | null;
  nombre: string;
}

export type FormaCronograma =
  /// Arriba del todo hay una fila que resume la obra entera.
  | "con-fila-de-proyecto"
  /// El archivo empieza directamente por los capitulos.
  | "por-capitulos"
  /// Una sola tarea arriba, CON codigo: una obra de un solo capitulo. Se
  /// interpreta asi, pero se avisa, porque es lo unico que no se puede
  /// distinguir de una fila de proyecto mal etiquetada.
  | "capitulo-unico"
  /// Todas las tareas al mismo nivel: no hay jerarquia, luego no hay
  /// capitulos. Son tareas sueltas, y pintarlas como capitulos de si mismas
  /// llenaria la tabla de ruido.
  | "plana";

export interface EstructuraCronograma {
  forma: FormaCronograma;
  /// El nivel de esquema donde viven los capitulos.
  nivelCapitulo: number | null;
  /// La fila que resume la obra, si la hay. No es un capitulo.
  filaDeProyecto: TareaConNivel | null;
  /**
   * true cuando la lectura NO es segura y conviene que alguien la mire.
   *
   * Solo pasa con `capitulo-unico`: una sola tarea arriba con codigo puede
   * ser una obra de un capitulo —lo correcto— o una fila de proyecto a la
   * que alguien le puso codigo. Las dos se ven igual desde aqui, y elegir
   * mal cambia todas las cifras por capitulo.
   */
  dudosa: boolean;
}

export function estructuraDelCronograma(
  tareas: readonly TareaConNivel[],
): EstructuraCronograma {
  if (tareas.length === 0) {
    return {
      forma: "plana",
      nivelCapitulo: null,
      filaDeProyecto: null,
      dudosa: false,
    };
  }

  const nivelRaiz = Math.min(...tareas.map((t) => t.nivel));

  // Sin jerarquia no hay capitulos. Va lo primero porque un archivo plano
  // cumple ademas «varias arriba», y sin esto cada tarea suelta saldria como
  // un capitulo con una sola partida: ella misma.
  if (nivelRaiz === Math.max(...tareas.map((t) => t.nivel))) {
    return {
      forma: "plana",
      nivelCapitulo: null,
      filaDeProyecto: null,
      dudosa: false,
    };
  }
  const enRaiz = tareas.filter((t) => t.nivel === nivelRaiz);

  if (enRaiz.length > 1) {
    // Varias arriba: son los capitulos. No hay nada que dudar.
    return {
      forma: "por-capitulos",
      nivelCapitulo: nivelRaiz,
      filaDeProyecto: null,
      dudosa: false,
    };
  }

  const unica = enRaiz[0]!;

  // Vacio y null son lo mismo aqui: la plantilla de cronograma escribe la
  // fila de proyecto con `codigo: ""`, no con null. Comprobar solo null la
  // dejaba fuera y volvia a comerse un nivel en los archivos que SI la traen.
  if ((unica.codigo ?? "").trim() === "") {
    return {
      forma: "con-fila-de-proyecto",
      nivelCapitulo: nivelRaiz + 1,
      filaDeProyecto: unica,
      dudosa: false,
    };
  }

  return {
    forma: "capitulo-unico",
    nivelCapitulo: nivelRaiz,
    filaDeProyecto: null,
    dudosa: true,
  };
}
