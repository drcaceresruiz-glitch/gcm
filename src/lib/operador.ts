/**
 * Quien opera GCM: quien puede dar de alta constructoras clientes.
 *
 * Esta por ENCIMA de la empresa, y por eso no es un rol ni una columna:
 *
 *   - Un valor nuevo en el enum `Role` exigiria migracion y una fila entera en
 *     la MATRIZ de `rbac.ts`, que describe lo que se puede hacer DENTRO de una
 *     empresa. Un OPERADOR acabaria siendo elegible en el gestor de permisos y
 *     asignable a una obra, que es justo lo contrario de lo que es.
 *   - Una columna booleana en `User` seria CONCEDIBLE DESDE LA APLICACION: el
 *     privilegio mas alto del producto dependeria de que ninguna pantalla se
 *     equivoque al escribirla.
 *
 * Vive en una variable de entorno, asi que concederlo exige acceso al
 * servidor: la misma llave que ya hace falta para migrar la base. No hay
 * ningun camino dentro de la aplicacion para escribir esa lista.
 *
 * OJO: ser operador NO concede ni un solo permiso del dominio. Dentro de su
 * empresa el operador es un usuario corriente y `puede()` sigue resolviendo
 * por su rol. Fuera, solo puede crear empresas y activarlas o suspenderlas;
 * nunca leer los datos de un cliente.
 */

/**
 * Los correos de la lista, normalizados.
 *
 * Ausente o vacia significa que NADIE es operador, y es el valor por defecto:
 * un despliegue que olvide la variable se queda sin area de operador, no con
 * el area abierta.
 */
export function parsearOperadores(bruto: string | undefined | null): string[] {
  if (!bruto) return [];
  const limpios = bruto
    .split(",")
    .map((c) => c.trim().toLowerCase())
    .filter((c) => c.length > 0);
  return [...new Set(limpios)];
}

/**
 * Si un correo es de la lista.
 *
 * Comparacion EXACTA sobre el correo normalizado, nunca por subcadena: con
 * `includes`, "a@x.pe" casaria con "mala@x.pe" y con "a@x.pe.dominio-falso.com",
 * y cualquiera que registrara ese correo se volveria operador.
 */
export function esCorreoOperador(
  email: string | undefined | null,
  operadores: readonly string[],
): boolean {
  if (!email) return false;
  const normal = email.trim().toLowerCase();
  if (normal.length === 0) return false;
  return operadores.includes(normal);
}
