/**
 * Utilidad para manejo estandarizado de errores en GCM.
 * 
 * Proporciona un patrón consistente para operaciones que pueden fallar,
 * evitando el uso de excepciones para control de flujo normal.
 */

/**
 * Resultado de una operación que puede fallar.
 * 
 * @template T - Tipo del valor exitoso
 * 
 * Ejemplo de uso:
 * ```ts
 * function crearUsuario(datos: Datos): Result<Usuario, string> {
 *   if (!datos.email) {
 *     return { ok: false, error: "Email requerido" };
 *   }
 *   const usuario = { id: 1, ...datos };
 *   return { ok: true, value: usuario };
 * }
 * 
 * const resultado = crearUsuario({ email: "test@example.com" });
 * if (resultado.ok) {
 *   console.log("Usuario creado:", resultado.value);
 * } else {
 *   console.error("Error:", resultado.error);
 * }
 * ```
 */
export type Result<T, E = string> = 
  | { ok: true; value: T }
  | { ok: false; error: E };

/**
 * Crea un resultado exitoso.
 * 
 * @param value - El valor exitoso
 * @returns Un resultado con ok=true
 */
export function success<T>(value: T): Result<T, never> {
  return { ok: true, value };
}

/**
 * Crea un resultado fallido.
 * 
 * @param error - El mensaje o objeto de error
 * @returns Un resultado con ok=false
 */
export function failure<E = string>(error: E): Result<never, E> {
  return { ok: false, error };
}

/**
 * Ejecuta una función que puede lanzar y la convierte a Result.
 * 
 * @param fn - Función a ejecutar
 * @param errorMessage - Mensaje de error por defecto
 * @returns Result de la operación
 * 
 * Ejemplo:
 * ```ts
 * const resultado = tryCatch(() => JSON.parse(jsonString), "JSON inválido");
 * ```
 */
export function tryCatch<T>(
  fn: () => T,
  errorMessage: string = "Operación fallida"
): Result<T, string> {
  try {
    return { ok: true, value: fn() };
  } catch (e) {
    const message = e instanceof Error ? e.message : errorMessage;
    return { ok: false, error: message };
  }
}

/**
 * Transforma el valor exitoso de un Result.
 * 
 * @param result - El resultado original
 * @param fn - Función de transformación
 * @returns Nuevo Result con el valor transformado
 * 
 * Ejemplo:
 * ```ts
 * const numResult = map(success(5), x => x * 2);
 * // { ok: true, value: 10 }
 * ```
 */
export function map<T, U, E = string>(
  result: Result<T, E>,
  fn: (value: T) => U,
): Result<U, E> {
  if (result.ok) {
    return { ok: true, value: fn(result.value) };
  }
  return result;
}

/**
 * Transforma el error de un Result.
 * 
 * @param result - El resultado original
 * @param fn - Función de transformación del error
 * @returns Nuevo Result con el error transformado
 * 
 * Ejemplo:
 * ```ts
 * const mapped = mapError(failure("db_error"), e => `Error: ${e}`);
 * // { ok: false, error: "Error: db_error" }
 * ```
 */
export function mapError<T, E, F>(result: Result<T, E>, fn: (error: E) => F): Result<T, F> {
  if (result.ok) {
    return result as Result<T, F>;
  }
  return { ok: false, error: fn(result.error) };
}

/**
 * Encadena operaciones que pueden fallar.
 * 
 * @param result - El resultado original
 * @param fn - Función que retorna otro Result
 * @returns El resultado de la función si el original fue exitoso
 * 
 * Ejemplo:
 * ```ts
 * const resultado = andThen(
 *   validarDatos(datos),
 *   datos => guardarEnBD(datos)
 * );
 * ```
 */
export function andThen<T, U, E>(result: Result<T, E>, fn: (value: T) => Result<U, E>): Result<U, E> {
  if (result.ok) {
    return fn(result.value);
  }
  return { ok: false, error: result.error };
}

/**
 * Extrae el valor o lanza una excepción.
 * 
 * @param result - El resultado
 * @throws Error si el resultado es fallido
 * @returns El valor exitoso
 * 
 * Útil para migración gradual o casos donde se prefiere excepción.
 */
export function unwrap<T>(result: Result<T, unknown>): T {
  if (result.ok) {
    return result.value;
  }
  throw new Error(typeof result.error === 'string' ? result.error : 'Error desconocido');
}

/**
 * Extrae el valor o un valor por defecto.
 * 
 * @param result - El resultado
 * @param defaultValue - Valor a usar si falla
 * @returns El valor exitoso o el default
 * 
 * Ejemplo:
 * ```ts
 * const config = unwrapOr(getConfig(), { theme: 'light', lang: 'es' });
 * ```
 */
export function unwrapOr<T>(result: Result<T, unknown>, defaultValue: T): T {
  return result.ok ? result.value : defaultValue;
}

/**
 * Extrae el valor o computa un valor por defecto.
 * 
 * @param result - El resultado
 * @param fn - Función que computa el valor default
 * @returns El valor exitoso o el computado
 * 
 * Ejemplo:
 * ```ts
 * const user = unwrapOrElse(getUser(id), () => createDefaultUser());
 * ```
 */
export function unwrapOrElse<T>(result: Result<T, unknown>, fn: () => T): T {
  return result.ok ? result.value : fn();
}

/**
 * Convierte un Result a null si es fallido.
 * 
 * @param result - El resultado
 * @returns El valor o null
 * 
 * Útil para APIs que usan null en lugar de Result.
 */
export function toNull<T>(result: Result<T, unknown>): T | null {
  return result.ok ? result.value : null;
}

/**
 * Convierte un Result a undefined si es fallido.
 * 
 * @param result - El resultado
 * @returns El valor o undefined
 */
export function toUndefined<T>(result: Result<T, unknown>): T | undefined {
  return result.ok ? result.value : undefined;
}
