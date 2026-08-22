/**
 * Un proveedor de IA de una constructora: que datos hacen falta y cuales cuadran.
 *
 * Puro y sin base, mismo criterio que `lib/remitente-correo.ts`. Lo que se
 * comprueba aqui es lo que se puede comprobar SIN llamar al proveedor; lo
 * unico que decide de verdad si una clave funciona es una llamada de
 * prueba real, y por eso existe el boton de probar (`agente-ia.service.ts`).
 *
 * A PROPOSITO no se restringe `tipo` a una lista fija aqui: el conjunto de
 * proveedores que GCM sabe LLAMAR vive en el registro de adaptadores del
 * servicio, y anadir uno nuevo no debe exigir tocar esta validacion. La
 * pantalla, mientras tanto, solo ofrece los tipos que sabe pintar.
 */

export interface DatosProveedorIa {
  /// Presente = editar un proveedor existente; ausente = crear uno nuevo.
  id?: string;
  tipo: string;
  nombre: string;
  /// Como llega del formulario: texto vacio si no aplica.
  urlBase: string;
  modelo: string;
  /// Vacio al editar = «deja la que ya estaba». Ver `guardarProveedorIa`.
  apiKey: string;
}

export interface ProveedorIaValido {
  tipo: string;
  nombre: string;
  urlBase: string | null;
  modelo: string;
  apiKey: string;
}

export type ResultadoValidacionIa =
  | { ok: true; datos: ProveedorIaValido }
  | { ok: false; error: string };

export function validarProveedorIa(
  datos: DatosProveedorIa,
  /// true al crear: entonces la clave es obligatoria. Al editar puede venir
  /// vacia, y significa «conserva la que ya estaba guardada».
  exigeClave: boolean,
): ResultadoValidacionIa {
  const tipo = datos.tipo.trim();
  if (!tipo) return { ok: false, error: "Elige un tipo de proveedor." };

  const nombre = datos.nombre.trim();
  if (!nombre) {
    return {
      ok: false,
      error: "Ponle un nombre a este proveedor, para distinguirlo de otros que guardes.",
    };
  }

  const modelo = datos.modelo.trim();
  if (!modelo) {
    return {
      ok: false,
      error: "Indica el modelo — por ejemplo claude-sonnet-5 o gpt-4o-mini.",
    };
  }

  const urlBaseTexto = datos.urlBase.trim();
  if (urlBaseTexto && !/^https:\/\//i.test(urlBaseTexto)) {
    return { ok: false, error: 'La URL base tiene que empezar con "https://".' };
  }
  const urlBase = urlBaseTexto.length > 0 ? urlBaseTexto.replace(/\/+$/, "") : null;

  const apiKey = datos.apiKey;
  if (exigeClave && apiKey.length === 0) {
    return { ok: false, error: "Indica la clave de API de este proveedor." };
  }

  return { ok: true, datos: { tipo, nombre, urlBase, modelo, apiKey } };
}

/**
 * Los tipos que la PANTALLA sabe pintar hoy — no una lista de lo que GCM
 * puede llegar a llamar algun dia. El registro de adaptadores en
 * `agente-ia.service.ts` es la fuente real de que se puede probar de
 * verdad; esto es solo el `<select>` del formulario.
 */
export const TIPOS_PROVEEDOR_IA_CONOCIDOS = [
  { valor: "claude", etiqueta: "Claude (Anthropic)", pideUrlBase: false },
  { valor: "openai_compatible", etiqueta: "OpenAI o compatible", pideUrlBase: true },
] as const;
