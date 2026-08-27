import type { ModoMeta } from "@/lib/bolsa";

/**
 * Lo que se puede decidir sobre el Excel de la meta SIN tocar la base.
 *
 * Vive en `lib/` y no junto a `cargarMetaDesdeExcel` por la regla de la casa:
 * lo puro se prueba con numeros y sin montar una obra. Pero aqui hubo ademas
 * un motivo mecanico, y conviene dejarlo escrito porque no se ve desde el
 * puesto de trabajo:
 *
 * EL CI CORRE LAS PRUEBAS ANTES DEL BUILD, y el cliente de Prisma lo genera
 * el build. Una prueba que importe un SERVICIO arrastra `lib/prisma` y revienta
 * en CI con «Cannot find package '@/generated/prisma/client'» aunque en local
 * pase: en local el cliente ya esta generado de la vez anterior, asi que el
 * gancho de pre-push no puede cazarlo NUNCA. Paso el 23 de agosto de 2026 y
 * costo dos despliegues rojos.
 *
 * Regla practica: una prueba o importa `lib/` puro, o dobla `@/lib/prisma`.
 */

/// Lo que Excel produce y el importador sabe abrir.
export const EXTENSIONES = [".xlsx", ".xlsm", ".xls"];

/// Un presupuesto de obra real ronda las 400 filas y no llega ni a 100 KB.
/// Ocho megas es holgura de sobra y a la vez un tope: mas que eso no es un
/// presupuesto, es otra cosa.
export const LIMITE_BYTES = 8 * 1024 * 1024;

export const MODOS: ModoMeta[] = ["PARTIDA", "CAPITULO", "FRENTE"];

/**
 * Los modos que se OFRECEN al cargar una meta, con el texto que los explica.
 *
 * Uno solo, y compartido, porque estaban duplicados: el alta de obra ofrecia
 * tres opciones sin explicacion y proponia CAPITULO; la pantalla de la meta
 * ofrecia dos, con ayuda, y proponia PARTIDA. La misma decision, con nombres
 * distintos y contrarios segun por donde entrabas.
 *
 * NO ESTA FRENTE, y esa es la diferencia con `MODOS` de arriba. `MODOS` es lo
 * que el importador ADMITE; esto es lo que se puede elegir a sabiendas. El
 * reparto de un frente a partidas vive en `MetaItemPartida`, y a dia de hoy
 * NINGUN camino de la aplicacion escribe esa tabla -solo se lee y se cuenta-.
 * Una meta en FRENTE nace con el reparto vacio, `unirPorFrente` marca entonces
 * TODAS sus lineas como costo propio, y la bolsa deja de querer decir nada.
 * Ofrecerlo era una trampa: el algoritmo existe y esta probado, lo que falta
 * es por donde meter el reparto. Cuando eso exista, se anade aqui.
 */
export const MODOS_OFRECIDOS = [
  {
    valor: "PARTIDA",
    titulo: "Partida por partida",
    ayuda:
      "La meta espeja los códigos del contrato. La bolsa sale por partida: se ve exactamente cuál se come el margen.",
  },
  {
    valor: "CAPITULO",
    titulo: "Por capítulo",
    ayuda:
      "La meta lleva una cifra por capítulo. Más rápido de cargar; la bolsa sale por capítulo, no por partida.",
  },
] as const;

/**
 * El que viene marcado.
 *
 * CAPITULO, y se decide UNA vez aqui para que las dos pantallas propongan lo
 * mismo. Es el mas barato de cargar y el que menos compromete: el modo queda
 * congelado en la version de la meta, asi que el que se propone solo deberia
 * ser el que menos trabajo pide, no el mas ambicioso. Quien quiera el detalle
 * por partida lo elige, que para eso esta explicado al lado.
 */
export const MODO_POR_DEFECTO = "CAPITULO";

export type ValidacionArchivo =
  | { ok: true; archivo: File }
  | { ok: false; error: string };

/** El archivo, comprobado antes de gastar un solo ciclo en abrirlo. */
export function validarArchivoMeta(archivo: unknown): ValidacionArchivo {
  if (!(archivo instanceof File) || archivo.size === 0) {
    return { ok: false, error: "Selecciona el archivo de Excel de la meta." };
  }

  const nombre = archivo.name.toLowerCase();
  if (!EXTENSIONES.some((e) => nombre.endsWith(e))) {
    return {
      ok: false,
      error: `El archivo tiene que ser de Excel (${EXTENSIONES.join(", ")}).`,
    };
  }

  if (archivo.size > LIMITE_BYTES) {
    // Se dice CUANTO pesa: «es muy grande» obliga a adivinar, «pesa 9,5 MB y
    // el limite son 8» se resuelve solo.
    const mb = (archivo.size / 1024 / 1024).toFixed(1);
    return { ok: false, error: `El archivo pesa ${mb} MB y el limite son 8 MB.` };
  }

  return { ok: true, archivo };
}

/**
 * Cuantas filas recortadas se nombran en la direccion de la pantalla.
 *
 * Un presupuesto con doscientas descripciones larguisimas produciria una URL
 * de varios miles de caracteres -que algunos servidores cortan-, y nadie lee
 * doscientos numeros. Se nombran unas pocas y el TOTAL viaja aparte, que es
 * lo que impide que el aviso mienta cuando hay mas de las que caben.
 */
const FILAS_NOMBRADAS = 12;

/**
 * El aviso de descripciones recortadas, como parametros de la direccion.
 *
 * Vive aqui, con lo demas que comparten el alta de obra y la pantalla de la
 * meta: las dos cargan el mismo Excel y las dos tienen que contar lo mismo
 * despues. Cadena vacia si no hubo recortes, para poder concatenarla sin
 * preguntar.
 */
export function avisoDeRecorte(recortadas: readonly number[]): string {
  if (recortadas.length === 0) return "";
  return (
    `&recortadas=${recortadas.length}` +
    `&filas=${recortadas.slice(0, FILAS_NOMBRADAS).join(",")}`
  );
}

/**
 * Meses entre dos fechas, a 30 dias.
 *
 * A 30 dias y no por meses de calendario, que es como lo hace el resto del
 * sistema: un mes «de verdad» tiene entre 28 y 31 y la cifra bailaria segun
 * cuando empiece la obra. Se PROPONE; quien carga la meta puede cambiarlo.
 */
export function mesesEntre(inicio: Date, fin: Date): string {
  const dias = (fin.getTime() - inicio.getTime()) / 86_400_000;
  return (Math.round((dias / 30) * 100) / 100).toFixed(2);
}
