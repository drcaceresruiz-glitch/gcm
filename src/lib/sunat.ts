/**
 * Leer la respuesta de una consulta de RUC, venga de quien venga.
 *
 * Vive aqui y no en el servicio porque es lo unico de esa consulta que se
 * puede probar sin red: dado un JSON, sacar la razon social. Y es JUSTO lo que
 * se rompe cuando cambia el proveedor —que ya cambio una vez, de apis.net.pe a
 * decolecta, y ahora ademas convive con json.pe—.
 *
 * Cada uno contesta a su manera:
 *
 * - decolecta devuelve los campos SUELTOS y en snake_case (`razon_social`).
 * - json.pe los envuelve en `{ success, message, data }` y llama a la razon
 *   social `nombre_o_razon_social`.
 *
 * Por eso se aceptan varios nombres en vez de uno: no cuesta nada y evita que
 * el proximo cambio de formato deje el formulario mudo sin que nadie entienda
 * por que.
 */

/**
 * El objeto con los datos, quitando el envoltorio si lo hay.
 *
 * Devuelve null cuando el propio servicio dice que no —`success: false`—, que
 * json.pe puede mandar CON UN 200. Dar por buena una respuesta solo porque
 * llego es como se convierte un rechazo en una razon social vacia.
 */
export function cuerpoUtil(datos: unknown): unknown | null {
  if (typeof datos !== "object" || datos === null) return null;

  const registro = datos as Record<string, unknown>;

  if ("success" in registro) {
    if (registro.success === false) return null;

    const dentro = registro.data;
    if (typeof dentro === "object" && dentro !== null) return dentro;
  }

  return datos;
}

/** La razon social, con los nombres que usa cada proveedor. */
export function leerRazonSocial(datos: unknown): string | null {
  const cuerpo = cuerpoUtil(datos);
  if (typeof cuerpo !== "object" || cuerpo === null) return null;

  const registro = cuerpo as Record<string, unknown>;

  for (const campo of [
    "razon_social", // decolecta
    "nombre_o_razon_social", // json.pe
    "razonSocial",
    "nombre",
  ]) {
    const valor = registro[campo];
    if (typeof valor === "string" && valor.trim()) return valor.trim();
  }

  return null;
}

/** Un texto suelto del cuerpo, si viene y no esta vacio. */
export function leerTexto(datos: unknown, campo: string): string | undefined {
  const cuerpo = cuerpoUtil(datos);
  if (typeof cuerpo !== "object" || cuerpo === null) return undefined;

  const valor = (cuerpo as Record<string, unknown>)[campo];
  return typeof valor === "string" && valor.trim() ? valor.trim() : undefined;
}
