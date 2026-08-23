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
