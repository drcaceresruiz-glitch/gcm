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
 * verdad; esto es solo el protocolo que habla cada `SERVICIO_IA_CONOCIDO`
 * de abajo.
 */
export const TIPOS_PROVEEDOR_IA_CONOCIDOS = [
  { valor: "claude", etiqueta: "Claude (Anthropic)", pideUrlBase: false },
  { valor: "openai_compatible", etiqueta: "OpenAI o compatible", pideUrlBase: true },
] as const;

/**
 * Servicios de IA conocidos, con su URL base de fabrica — lo que el
 * formulario ofrece para no tener que teclear ni adivinar nada de eso.
 *
 * A PROPOSITO no es lo mismo que `TIPOS_PROVEEDOR_IA_CONOCIDOS`: el "tipo"
 * es el PROTOCOLO (como se habla), el "servicio" es la MARCA (con quien se
 * habla). Varios servicios comparten protocolo -Gemini, Groq y OpenRouter
 * son los tres `openai_compatible`, cada uno con su propia URL-, y por eso
 * hace falta esta capa aparte en vez de que el `tipo` cargara con las dos
 * cosas a la vez.
 *
 * `urlBase: null` dos veces por motivos distintos: en `claude` porque ese
 * protocolo no la pide (la URL de Anthropic esta fija en el adaptador,
 * `agente-ia.service.ts`); en `otro` porque es a proposito generico -un
 * endpoint propio o de un proveedor que todavia no esta en esta lista-, y
 * ahi la URL SI la pide el formulario, pero no hay ninguna de fabrica que
 * ofrecer. La URL sigue siendo editable aunque venga precargada: si un
 * servicio cambia la suya, o alguien usa un proxy, no hay que esperar un
 * cambio de codigo para escribir la que haga falta.
 */
export const SERVICIOS_IA_CONOCIDOS = [
  { valor: "claude", etiqueta: "Claude (Anthropic)", tipo: "claude", urlBase: null },
  {
    valor: "gemini",
    etiqueta: "Gemini (Google)",
    tipo: "openai_compatible",
    urlBase: "https://generativelanguage.googleapis.com/v1beta/openai",
  },
  {
    valor: "groq",
    etiqueta: "Groq",
    tipo: "openai_compatible",
    urlBase: "https://api.groq.com/openai/v1",
  },
  {
    valor: "openrouter",
    etiqueta: "OpenRouter",
    tipo: "openai_compatible",
    urlBase: "https://openrouter.ai/api/v1",
  },
  {
    valor: "otro",
    etiqueta: "Otro compatible con OpenAI",
    tipo: "openai_compatible",
    urlBase: null,
  },
] as const;
