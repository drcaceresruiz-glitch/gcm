/**
 * El manifiesto del respaldo: que lleva el archivo, y como se comprueba que
 * salio de aqui y que nadie lo ha tocado.
 *
 * Lo que esto SI garantiza: que el zip se genero en esta instalacion, para
 * esta empresa, y que ni el manifiesto ni ninguna entrada han cambiado desde
 * entonces.
 *
 * Lo que NO garantiza, y conviene no venderlo de mas: `APP_SECRET` es un
 * secreto del SERVIDOR, no de la empresa. Quien tenga acceso al servidor o a
 * las variables del panel puede fabricar un respaldo valido para cualquier
 * empresa de esta instalacion. Es un sello de procedencia contra el accidente
 * y contra la manipulacion del archivo, no una defensa contra alguien que ya
 * esta dentro.
 */

import { createHash, createHmac, hkdfSync, timingSafeEqual } from "node:crypto";

import { FORMATO_RESPALDO } from "@/lib/respaldo-esquema";

/** Marca el tipo de archivo. Si no cuadra, no es un respaldo de obra. */
export const TIPO_RESPALDO = "gcm.respaldo.obra";

/** Nombre de las dos entradas que se leen ANTES que ninguna otra. */
export const ENTRADA_MANIFIESTO = "manifiesto.json";
export const ENTRADA_FIRMA = "manifiesto.sig";

export interface EntradaZip {
  nombre: string;
  bytes: number;
  sha256: string;
}

export interface Manifiesto {
  tipo: typeof TIPO_RESPALDO;
  version: number;
  empresa: { id: string; razonSocial: string; ruc: string | null };
  obra: {
    id: string;
    nombreObra: string;
    correlativo: string | null;
    codigoObra: string | null;
    estado: string;
  };
  generado: { at: string; por: string; userId: string | null };
  contenido: {
    /// Si la evidencia viaja dentro. Un respaldo sin fotos sigue siendo una
    /// auditoria completa de las cifras, pero NO sirve para borrar la obra.
    evidencia: "incluida" | "omitida";
    /// Y lo mismo con las fotos de la galeria (el escaparate). Opcional
    /// porque los respaldos anteriores a la galeria no traen la clave, y el
    /// manifiesto tiene que poder leerlos igual.
    galeria?: "incluida" | "omitida";
    /**
     * Las constancias de pago (PDF o imagen).
     *
     * Opcional por lo mismo que `galeria`: los respaldos emitidos antes de que
     * los comprobantes viajaran no traen la clave, y siguen siendo validos —
     * solo que sin ellas—. Ausente NO significa "omitida": significa que ese
     * archivo es de antes y no se sabe.
     */
    comprobantes?: "incluida" | "omitida";
  };
  tablas: { tabla: string; filas: number }[];
  entradas: EntradaZip[];
}

/**
 * JSON estable: las claves siempre en el mismo orden.
 *
 * Hace falta porque lo que se firma son BYTES. Sin un orden fijo, el mismo
 * manifiesto serializado dos veces podria dar dos cadenas distintas y la firma
 * dejaria de cuadrar consigo misma.
 */
export function canonicalizar(valor: unknown): string {
  return JSON.stringify(ordenar(valor), null, 2);
}

function ordenar(valor: unknown): unknown {
  if (Array.isArray(valor)) return valor.map(ordenar);
  if (valor && typeof valor === "object") {
    const entradas = Object.entries(valor as Record<string, unknown>).sort(
      ([a], [b]) => (a < b ? -1 : a > b ? 1 : 0),
    );
    return Object.fromEntries(entradas.map(([k, v]) => [k, ordenar(v)]));
  }
  return valor;
}

export function sha256Hex(datos: Uint8Array | string): string {
  return createHash("sha256").update(datos).digest("hex");
}

/**
 * La clave con la que se firma, derivada y no el `APP_SECRET` en crudo.
 *
 * Se deriva con HKDF usando el `companyId` como sal. Dos cosas se ganan: esta
 * clave no sirve para nada mas del sistema (separacion de dominio), y **un
 * respaldo de una empresa ni siquiera verifica contra otra**, aparte de que el
 * `companyId` viaja firmado dentro del manifiesto.
 */
export function claveDeRespaldo(secreto: string, companyId: string): Buffer {
  return Buffer.from(
    hkdfSync("sha256", secreto, companyId, `${TIPO_RESPALDO}.v1`, 32),
  );
}

export function firmar(manifiestoJson: string, clave: Buffer): string {
  return createHmac("sha256", clave).update(manifiestoJson, "utf8").digest("hex");
}

/**
 * Comprueba la firma en tiempo constante.
 *
 * `timingSafeEqual` y no `===`, por el mismo criterio que `verifyPassword`:
 * comparar cadena a cadena filtra por cuanto tarda cuantos caracteres se
 * acertaron.
 */
export function firmaValida(
  manifiestoJson: string,
  firmaRecibida: string,
  clave: Buffer,
): boolean {
  const esperada = Buffer.from(firmar(manifiestoJson, clave), "hex");
  let recibida: Buffer;
  try {
    recibida = Buffer.from(firmaRecibida.trim(), "hex");
  } catch {
    return false;
  }
  // `timingSafeEqual` lanza si los largos difieren, asi que se comprueba antes.
  if (recibida.length !== esperada.length) return false;
  return timingSafeEqual(recibida, esperada);
}

export type RevisionManifiesto =
  | { ok: true; manifiesto: Manifiesto }
  | { ok: false; error: string };

/**
 * Todo lo que hay que comprobar ANTES de descomprimir una sola entrada.
 *
 * El orden no es negociable: primero la firma, y solo despues se mira nada de
 * lo que dice el archivo. Fiarse del contenido para decidir si el contenido es
 * de fiar seria dar la vuelta a la comprobacion.
 *
 * La firma y la empresa dan el MISMO mensaje a proposito: distinguirlos le
 * diria a quien prueba un archivo ajeno cual de las dos cosas ha fallado.
 */
export function revisarManifiesto(
  manifiestoJson: string,
  firmaRecibida: string,
  secreto: string,
  companyId: string,
): RevisionManifiesto {
  if (!firmaValida(manifiestoJson, firmaRecibida, claveDeRespaldo(secreto, companyId))) {
    return {
      ok: false,
      error:
        "Este respaldo no pertenece a esta empresa, o el archivo esta alterado.",
    };
  }

  let manifiesto: Manifiesto;
  try {
    manifiesto = JSON.parse(manifiestoJson) as Manifiesto;
  } catch {
    return { ok: false, error: "El manifiesto del respaldo no se puede leer." };
  }

  if (manifiesto.tipo !== TIPO_RESPALDO) {
    return { ok: false, error: "Este archivo no es un respaldo de obra de GCM." };
  }

  // Redundante con la firma —la clave se deriva del companyId— y explicito a
  // proposito: la defensa no debe depender de un detalle de la derivacion.
  if (manifiesto.empresa?.id !== companyId) {
    return {
      ok: false,
      error:
        "Este respaldo no pertenece a esta empresa, o el archivo esta alterado.",
    };
  }

  if (manifiesto.version > FORMATO_RESPALDO) {
    return {
      ok: false,
      error:
        `Este respaldo se genero con una version mas nueva de GCM (formato ` +
        `${manifiesto.version}; esta instalacion lee hasta ${FORMATO_RESPALDO}). ` +
        `Actualiza antes de restaurarlo.`,
    };
  }

  return { ok: true, manifiesto };
}
