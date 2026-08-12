/**
 * Como se escribe cada dato de la obra en el respaldo, y como se vuelve a leer.
 *
 * Logica pura: no toca la base ni el disco, y por eso se puede probar de ida y
 * vuelta con valores exactos. Los tres tipos que importan —importe, dia y
 * instante— tienen cada uno su trampa, y las tres cuestan datos si se pasan por
 * alto.
 */

import { normalizarDecimal } from "@/lib/decimal";
import type { TablaRespaldo } from "@/lib/respaldo-esquema";

export type ValorJson =
  | string
  | number
  | boolean
  | null
  | ValorJson[]
  | { [clave: string]: ValorJson };

export type FilaJson = Record<string, ValorJson>;

/**
 * Un dia de calendario, "YYYY-MM-DD".
 *
 * Se corta del ISO en UTC y NO se construye con los getters locales: en Lima
 * (UTC-5) `getDate()` sobre una fecha guardada a medianoche UTC devuelve el
 * dia ANTERIOR. Una de estas columnas es `fechaCorte`, que es la clave de la
 * cadencia semanal entera; correrla un dia parte el Last Planner.
 */
export function aDiaCalendario(fecha: Date): string {
  return fecha.toISOString().slice(0, 10);
}

/** El camino de vuelta: medianoche UTC, como hace `fechaDeObra`. */
export function deDiaCalendario(texto: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(texto)) return null;
  const fecha = new Date(`${texto}T00:00:00Z`);
  if (Number.isNaN(fecha.getTime())) return null;
  // `new Date("2026-02-31")` no falla: rueda al 3 de marzo. Comparar contra lo
  // que se pidio descarta los dias que no existen.
  return fecha.toISOString().slice(0, 10) === texto ? fecha : null;
}

/**
 * Una fila de la base, lista para escribirse en el respaldo.
 *
 * Reglas, por orden de importancia:
 *
 * 1. **Los importes salen como CADENA, nunca como numero.** `JSON.parse` de
 *    un numero produce un `float` de JavaScript, y ahi se pierde exactamente
 *    lo que `lib/decimal` existe para conservar. Ademas se canoniza a la
 *    escala de la columna: asi el respaldo de la misma obra sale identico dos
 *    veces —comparable, hasheable— y "0.00" sigue diciendo algo distinto de
 *    "0" a quien lo lea desde fuera.
 * 2. **Las columnas de dia salen como "YYYY-MM-DD"** y las demas fechas como
 *    instante ISO en UTC. Mezclarlas corre dias.
 * 3. **Se escriben TODAS las columnas, tambien las que valen null.** Que una
 *    clave falte significa "esta columna no existia cuando se hizo el
 *    respaldo", y es lo que permite detectar un respaldo viejo al restaurarlo.
 *    Omitir los nulos "para ahorrar bytes" borraria esa diferencia.
 */
export function serializarFila(
  fila: Record<string, unknown>,
  tabla: TablaRespaldo,
): FilaJson {
  const salida: FilaJson = {};
  const decimales = tabla.decimales ?? {};
  const dias = new Set(tabla.fechas ?? []);

  for (const [campo, valor] of Object.entries(fila)) {
    if (valor === null || valor === undefined) {
      salida[campo] = null;
      continue;
    }

    const escala = decimales[campo];
    if (escala !== undefined) {
      // `String(valor)` sirve tanto para el Decimal de Prisma como para un
      // numero o una cadena: todos saben decir su propio valor.
      salida[campo] = normalizarDecimal(String(valor), escala);
      continue;
    }

    if (valor instanceof Date) {
      salida[campo] = dias.has(campo)
        ? aDiaCalendario(valor)
        : valor.toISOString();
      continue;
    }

    if (typeof valor === "bigint") {
      salida[campo] = valor.toString();
      continue;
    }

    salida[campo] = valor as ValorJson;
  }

  return salida;
}

/**
 * El camino de vuelta, para restaurar.
 *
 * Los importes se quedan como CADENA a proposito: Prisma acepta una cadena en
 * una columna `Decimal` y la guarda exacta. Convertirla a numero aqui seria
 * deshacer en la ultima linea todo el cuidado de la primera.
 */
export function deserializarFila(
  fila: FilaJson,
  tabla: TablaRespaldo,
): Record<string, unknown> {
  const salida: Record<string, unknown> = {};
  const dias = new Set(tabla.fechas ?? []);
  const decimales = tabla.decimales ?? {};

  for (const [campo, valor] of Object.entries(fila)) {
    if (valor === null) {
      salida[campo] = null;
      continue;
    }

    if (decimales[campo] !== undefined) {
      salida[campo] = valor;
      continue;
    }

    if (typeof valor === "string") {
      if (dias.has(campo)) {
        salida[campo] = deDiaCalendario(valor);
        continue;
      }
      if (esInstante(valor)) {
        salida[campo] = new Date(valor);
        continue;
      }
    }

    salida[campo] = valor;
  }

  return salida;
}

/**
 * Si una cadena es un instante ISO con zona, y no un texto cualquiera.
 *
 * Se exige la `Z` final: sin ella, una descripcion de partida que empezara
 * pareciendo una fecha acabaria convertida en `Date` y guardada como basura.
 */
function esInstante(texto: string): boolean {
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/.test(texto);
}
