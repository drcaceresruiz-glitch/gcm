import "server-only";

import { prisma } from "@/lib/prisma";
import { puede } from "@/lib/rbac";
import { cifrar, descifrar, hayLlaveDeCifrado } from "@/lib/secreto";
import { validarProveedorIa, type DatosProveedorIa } from "@/lib/proveedor-ia";
import type { SesionActiva } from "@/services/sesion.service";

/**
 * Los proveedores de IA que una empresa guardo, con su propia clave.
 *
 * Mismo molde que `remitente-correo.service.ts` para el secreto —cifrado,
 * nunca vuelve a la pantalla, `verificadoAt` solo tras una llamada real—,
 * pero aqui puede haber VARIOS proveedores por empresa (no uno): la
 * empresa trae su propia clave, de su propio proveedor, y puede guardar
 * mas de uno y elegir cual usar. Cual esta ACTIVO es un puntero en
 * `Company.proveedorIaActivoId`, no un campo de esta tabla — asi nunca
 * puede haber dos activos a la vez, por construccion.
 *
 * Esta es SOLO la infraestructura de credenciales (Fase 1). El agente
 * conversacional que las usa —chat, herramientas, turnos— no esta
 * construido todavia; ver `docs/PENDIENTES.md`, seccion 6b.
 */

function quien(sesion: SesionActiva): string {
  return `${sesion.nombres} ${sesion.apellidos}`.trim().slice(0, 150);
}

// ---------------------------------------------------------------------------
// Adaptadores — como se llama a cada tipo de proveedor
// ---------------------------------------------------------------------------

export interface ConfigLlamadaIa {
  apiKey: string;
  urlBase: string | null;
  modelo: string;
}

export type RespuestaProveedorIa = { ok: true } | { ok: false; error: string };

/**
 * Una herramienta del agente: un envoltorio delgado sobre una funcion de
 * servicio que YA existe y ya hace `puede(sesion, ...)`. `ejecutar` recibe
 * la sesion REAL de quien pregunta, nunca una fabricada -si esa funcion
 * decide que no hay permiso, sencillamente devuelve lo que ya devuelve
 * para ese caso (`[]`, `null`, un error), sin que la herramienta tenga
 * que reimplementar nada-.
 */
export interface HerramientaAgente {
  nombre: string;
  descripcion: string;
  /// JSON Schema de los argumentos, tal cual lo pide la API de Claude.
  esquema: object;
  ejecutar: (sesion: SesionActiva, args: unknown) => Promise<unknown>;
}

export type ResultadoEscrituraAgente =
  | { ok: true; mensaje: string }
  | { ok: false; error: string };

/**
 * Herramienta de ESCRITURA (Fase 2b) — proponer una accion, nunca
 * ejecutarla sola. A proposito NO tiene `ejecutar`: el bucle de turnos
 * (`agente-conversacion.service.ts`) solo conoce `HerramientaAgente[]`
 * para lo que dispara solo, asi que una `HerramientaEscritura` no cabe
 * ahi por construccion — es un error de compilacion, no una convencion
 * que alguien tiene que recordar. Solo la alcanzan `proponer_accion` (que
 * llama a `resumen`) y la confirmacion humana (que llama a
 * `ejecutarEscritura`, y solo con el `datos` YA guardado en la propuesta,
 * nunca uno nuevo).
 */
export interface HerramientaEscritura {
  nombre: string;
  descripcion: string;
  /// JSON Schema de `datos`, el unico campo que el modelo rellena.
  esquema: object;
  /// Calcula el texto EXACTO de la tarjeta de confirmacion a partir de
  /// `datos` -nunca lo que el modelo haya dicho-: misma aritmetica y las
  /// mismas busquedas (nombre de partida, de tarea) que usaria la
  /// escritura real. Si lanza, el error cae en el mismo `try/catch`
  /// generico de cada llamada a herramienta -el modelo puede corregir y
  /// reintentar, no revienta el turno-.
  resumen: (sesion: SesionActiva, datos: unknown) => Promise<string>;
  /// La escritura real. Solo la llama la confirmacion de la propuesta,
  /// tras el click humano.
  ejecutarEscritura: (
    sesion: SesionActiva,
    datos: unknown,
  ) => Promise<ResultadoEscrituraAgente>;
}

export interface TurnoIa {
  mensajes: unknown[];
  herramientas: HerramientaAgente[];
  /// Instrucciones fijas de quien es el agente y como debe comportarse.
  sistema?: string;
}

export type RespuestaTurno =
  | { tipo: "texto"; texto: string }
  | {
      tipo: "usar_herramientas";
      llamadas: { id: string; nombre: string; args: unknown }[];
      /// El mensaje "assistant" COMPLETO, ya en el formato exacto que este
      /// proveedor espera de vuelta en `mensajes` -Claude y OpenAI lo
      /// arman distinto (bloques `tool_use` vs. `tool_calls`), asi que
      /// quien orquesta el turno (`agente-conversacion.service.ts`) nunca
      /// lo construye a mano: solo hace `mensajes.push(bruto)` tal cual.
      bruto: unknown;
    };

/// Lo que hace falta para preguntarle a un proveedor que modelos tiene —
/// nunca un `modelo`, porque es justo lo que todavia no se sabe.
export interface ConfigListadoIa {
  apiKey: string;
  urlBase: string | null;
}

export type RespuestaModelosIa =
  | { ok: true; modelos: string[] }
  | { ok: false; error: string };

interface AdaptadorProveedorIa {
  /// Un mensaje minimo real, para confirmar que la clave y el modelo
  /// funcionan — mismo criterio que `probarRemitente`, que manda un correo
  /// de verdad en vez de solo verificar la conexion.
  probar(config: ConfigLlamadaIa): Promise<RespuestaProveedorIa>;
  /// Ausente = este proveedor todavia no sabe tener una conversacion con
  /// herramientas.
  conversar?(
    config: ConfigLlamadaIa,
    turno: TurnoIa,
  ): Promise<RespuestaTurno | { ok: false; error: string }>;
  /// Solo relevante si `conversar` existe. Construye el o los mensajes que
  /// representan el RESULTADO de ejecutar las herramientas, para agregarlos
  /// al historial antes de la proxima vuelta -Claude empaqueta todos los
  /// resultados en UN mensaje `user` con varios bloques `tool_result`;
  /// OpenAI quiere un mensaje `role: "tool"` SEPARADO por cada resultado-,
  /// asi que devuelve un arreglo: uno o varios, segun el proveedor.
  mensajesDeResultados?(
    resultados: { toolUseId: string; contenido: string }[],
  ): unknown[];
  /// Ausente = este proveedor no permite listar sus modelos -la pantalla
  /// cae al campo de texto libre-. La lista es SIEMPRE en vivo, nunca un
  /// catalogo guardado en GCM: un catalogo fijo se desactualiza el dia que
  /// el proveedor saca un modelo nuevo o retira uno viejo, y eso es
  /// justamente el tipo de dato que este proyecto no quiere mostrar como
  /// si fuera cierto sin serlo.
  listarModelos?(config: ConfigListadoIa): Promise<RespuestaModelosIa>;
}

/// Tope de espera de la llamada de prueba. Es UN mensaje corto, acotado.
const TOPE_PRUEBA_MS = 15_000;
/// Tope de una vuelta de conversacion con herramientas: puede tardar mas
/// que un simple "hola" porque el proveedor a veces razona antes de
/// decidir que herramienta llamar.
const TOPE_CONVERSACION_MS = 45_000;

/// Codigos de estado que vale la pena reintentar: el proveedor esta
/// temporalmente sobrecargado o hubo un fallo transitorio de SU lado
/// -cazado en vivo: Gemini devolviendo 503 "high demand... try again
/// later"-, no un problema con la peticion en si. 400/401/404 y compania
/// NO estan aqui a proposito: reintentar esos no los arregla, solo tarda
/// mas en dar el mismo error.
const CODIGOS_REINTENTABLES = new Set([429, 500, 502, 503, 504]);
/// Una vez mas, no una guerra de desgaste: si el proveedor sigue
/// saturado tras el reintento, se le dice a quien pregunta -no se le
/// hace esperar en bucle por algo que puede tardar minutos en despejarse-.
const REINTENTOS_MAX = 1;
const ESPERA_REINTENTO_MS = 1500;

/**
 * `fetch` con un reintento automatico ante una sobrecarga transitoria del
 * proveedor. `construirOpciones` es una FUNCION, no un objeto ya armado:
 * cada intento necesita su propio `AbortSignal.timeout(...)` fresco -reusar
 * la misma senal entre intentos la dejaria ya vencida para el segundo,
 * abortandolo de inmediato sin ni siquiera intentarlo-.
 */
async function fetchConReintento(
  url: string,
  construirOpciones: () => RequestInit,
): Promise<Response> {
  let ultima: Response | null = null;
  for (let intento = 0; intento <= REINTENTOS_MAX; intento++) {
    const r = await fetch(url, construirOpciones());
    if (r.ok || !CODIGOS_REINTENTABLES.has(r.status) || intento === REINTENTOS_MAX) {
      return r;
    }
    ultima = r;
    await new Promise((resolve) => setTimeout(resolve, ESPERA_REINTENTO_MS));
  }
  // Inalcanzable -el bucle siempre devuelve en la ultima vuelta-, pero
  // TypeScript no lo sabe sin esto.
  return ultima!;
}

/**
 * Los fallos del ENTORNO, dichos en el idioma de la aplicacion.
 *
 * `AbortSignal.timeout` y `fetch` lanzan mensajes del runtime, en ingles y sin
 * salida: «The operation was aborted due to timeout». Eso llegaba tal cual a
 * la pantalla del asistente, dentro de una aplicacion que esta entera en
 * español y que en todas partes dice que ha pasado y que hacer. Visto el 25 de
 * agosto de 2026 preguntandole algo al asistente.
 *
 * ESTOS TEXTOS LLEVAN TILDES y el resto del archivo no: son de los pocos que
 * una persona LEE en pantalla, igual que los cuatro de `motivoNoAdmiteCambios`.
 *
 * Solo se traducen los que salen del ENTORNO y sabemos nombrar. Lo que
 * responda el proveedor -una clave mala, un modelo que no existe, un limite de
 * uso- se deja como viene: ahi el texto del proveedor es la unica pista real
 * de que pasa, y taparlo con una frase nuestra seria peor.
 */
function falloDelEntorno(error: unknown): string | null {
  const nombre = error instanceof Error ? error.name : "";
  const texto = error instanceof Error ? error.message : String(error);

  if (nombre === "TimeoutError" || /aborted due to timeout/i.test(texto)) {
    return (
      "El proveedor de IA tardó demasiado en responder y se cortó la espera. " +
      "Vuelve a intentarlo; si se repite, puede que su servicio esté lento."
    );
  }
  if (nombre === "AbortError") {
    return "La consulta se canceló antes de terminar. Vuelve a intentarlo.";
  }
  // `fetch` no distingue DNS de red caida ni de certificado: todo es esto.
  if (/fetch failed|ENOTFOUND|ECONNREFUSED|ETIMEDOUT|EAI_AGAIN/i.test(texto)) {
    return (
      "No se pudo contactar con el proveedor de IA. Revisa la conexión del " +
      "servidor y que la dirección configurada sea la correcta."
    );
  }
  return null;
}

/// Recorta y quita cualquier rastro de la clave del texto de error de un
/// proveedor ajeno — mismo cuidado que `probarRemitente` con la contrasena
/// SMTP. `maxLargo` por defecto es el limite de `ultimoError`
/// (`AgenteIaProveedor`, VARCHAR(300)); quien guarde en otra columna con
/// otro limite (p. ej. `MensajeAgente.error`, VARCHAR(500)) lo pasa aparte.
function mensajeSaneado(texto: string, clave: string, maxLargo = 300): string {
  return texto.replaceAll(clave, "***").slice(0, maxLargo);
}

/// Igual que `mensajeSaneado`, pero reservando espacio para una PISTA fija
/// que se agrega al final. Sin esto, un mensaje del proveedor ya de por si
/// largo mas la pista podian juntos superar el limite de la columna -paso
/// de verdad, cazado en vivo: el guardado reventaba con "el valor es
/// demasiado largo para la columna" en vez de guardar el error-. Aqui se
/// trunca el mensaje del proveedor, nunca la pista.
function mensajeSaneadoConPista(
  texto: string,
  clave: string,
  pista: string,
  maxLargo = 300,
): string {
  const base = mensajeSaneado(texto, clave, Math.max(maxLargo - pista.length, 0));
  return `${base}${pista}`;
}

/// Nombre y descripcion de la herramienta de mentira que "Probar" manda
/// junto al mensaje -nunca se le pide al modelo que la use, solo que
/// pueda RECIBIRLA sin rechazar la llamada entera-. Sin esto, "Probar"
/// solo confirmaba que el modelo sabe responder "listo", pero el
/// Asistente de verdad SIEMPRE manda herramientas -no hay forma de saber
/// de antemano si la pregunta las va a necesitar-, asi que un modelo sin
/// soporte de tool-use pasaba la prueba y fallaba en el primer mensaje
/// real. Detectarlo aqui, al guardar la clave, es mucho mas barato que
/// descubrirlo a mitad de una conversacion.
const HERRAMIENTA_DE_PRUEBA_OPENAI = {
  type: "function",
  function: {
    name: "confirmar_recepcion",
    description: "Herramienta de prueba. No hace falta llamarla para responder.",
    parameters: { type: "object", properties: {} },
  },
};
const HERRAMIENTA_DE_PRUEBA_CLAUDE = {
  name: "confirmar_recepcion",
  description: "Herramienta de prueba. No hace falta llamarla para responder.",
  input_schema: { type: "object", properties: {} },
};

/// La pista que se agrega cuando la prueba fallo CON la herramienta de
/// mentira puesta: la causa mas probable es que el modelo no soporta
/// tool-use, no que la clave este mal.
const PISTA_SIN_TOOL_USE =
  ' Si el proveedor menciona "tool"/"function calling" en el error, es que este modelo no las soporta: el Asistente las necesita para consultar tus datos, así que prueba con otro modelo de este mismo proveedor.';

async function probarClaude(config: ConfigLlamadaIa): Promise<RespuestaProveedorIa> {
  try {
    const r = await fetchConReintento("https://api.anthropic.com/v1/messages", () => ({
      method: "POST",
      headers: {
        "x-api-key": config.apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: config.modelo,
        max_tokens: 16,
        tools: [HERRAMIENTA_DE_PRUEBA_CLAUDE],
        messages: [{ role: "user", content: "Responde solo con la palabra: listo" }],
      }),
      signal: AbortSignal.timeout(TOPE_PRUEBA_MS),
    }));

    if (!r.ok) {
      const cuerpo = await r.text();
      return {
        ok: false,
        error: mensajeSaneadoConPista(`(${r.status}) ${cuerpo}`, config.apiKey, PISTA_SIN_TOOL_USE),
      };
    }
    return { ok: true };
  } catch (error) {
    const propio = falloDelEntorno(error);
    if (propio) return { ok: false, error: propio };
    const texto = error instanceof Error ? error.message : String(error);
    return { ok: false, error: mensajeSaneado(texto, config.apiKey) };
  }
}

interface BloqueContenidoClaude {
  type: string;
  text?: string;
  id?: string;
  name?: string;
  input?: unknown;
}
interface RespuestaMessagesClaude {
  stop_reason: string;
  content: BloqueContenidoClaude[];
}

async function conversarClaude(
  config: ConfigLlamadaIa,
  turno: TurnoIa,
): Promise<RespuestaTurno | { ok: false; error: string }> {
  try {
    const r = await fetchConReintento("https://api.anthropic.com/v1/messages", () => ({
      method: "POST",
      headers: {
        "x-api-key": config.apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: config.modelo,
        max_tokens: 2048,
        ...(turno.sistema ? { system: turno.sistema } : {}),
        tools: turno.herramientas.map((h) => ({
          name: h.nombre,
          description: h.descripcion,
          input_schema: h.esquema,
        })),
        messages: turno.mensajes,
      }),
      signal: AbortSignal.timeout(TOPE_CONVERSACION_MS),
    }));

    if (!r.ok) {
      const cuerpo = await r.text();
      return { ok: false, error: mensajeSaneado(`(${r.status}) ${cuerpo}`, config.apiKey) };
    }

    const datos = (await r.json()) as RespuestaMessagesClaude;
    const bloques = datos.content ?? [];
    const bloquesHerramienta = bloques.filter((b) => b.type === "tool_use");

    if (datos.stop_reason === "tool_use" && bloquesHerramienta.length > 0) {
      return {
        tipo: "usar_herramientas",
        llamadas: bloquesHerramienta.map((b) => ({
          id: b.id ?? "",
          nombre: b.name ?? "",
          args: b.input,
        })),
        bruto: { role: "assistant", content: bloques },
      };
    }

    const texto = bloques
      .filter((b) => b.type === "text")
      .map((b) => b.text ?? "")
      .join("\n")
      .trim();
    return { tipo: "texto", texto: texto || "No tengo una respuesta para eso." };
  } catch (error) {
    const propio = falloDelEntorno(error);
    if (propio) return { ok: false, error: propio };
    const texto = error instanceof Error ? error.message : String(error);
    return { ok: false, error: mensajeSaneado(texto, config.apiKey) };
  }
}

/// Claude empaqueta TODOS los resultados de una vuelta en un unico mensaje
/// `user` con varios bloques `tool_result` -asi habla su API, no una
/// eleccion de GCM-.
function mensajesDeResultadosClaude(
  resultados: { toolUseId: string; contenido: string }[],
): unknown[] {
  return [
    {
      role: "user",
      content: resultados.map((res) => ({
        type: "tool_result",
        tool_use_id: res.toolUseId,
        content: res.contenido,
      })),
    },
  ];
}

/// Forma comun a la respuesta de "listar modelos" de Anthropic y de
/// cualquier proveedor compatible con OpenAI: una lista de objetos con un
/// `id` de texto. Ambos adaptadores la leen igual.
interface ListaModelosCruda {
  data?: { id?: string }[];
}

async function listarModelosClaude(config: ConfigListadoIa): Promise<RespuestaModelosIa> {
  try {
    const r = await fetchConReintento("https://api.anthropic.com/v1/models", () => ({
      headers: { "x-api-key": config.apiKey, "anthropic-version": "2023-06-01" },
      signal: AbortSignal.timeout(TOPE_PRUEBA_MS),
    }));

    if (!r.ok) {
      const cuerpo = await r.text();
      return { ok: false, error: mensajeSaneado(`(${r.status}) ${cuerpo}`, config.apiKey) };
    }

    const datos = (await r.json()) as ListaModelosCruda;
    const modelos = (datos.data ?? [])
      .map((m) => m.id)
      .filter((id): id is string => Boolean(id));
    if (modelos.length === 0) {
      return { ok: false, error: "El proveedor respondió, pero sin ningún modelo en la lista." };
    }
    return { ok: true, modelos };
  } catch (error) {
    const propio = falloDelEntorno(error);
    if (propio) return { ok: false, error: propio };
    const texto = error instanceof Error ? error.message : String(error);
    return { ok: false, error: mensajeSaneado(texto, config.apiKey) };
  }
}

async function listarModelosOpenAiCompatible(
  config: ConfigListadoIa,
): Promise<RespuestaModelosIa> {
  if (!config.urlBase) {
    return {
      ok: false,
      error: "Este proveedor necesita una URL base y no tiene ninguna guardada.",
    };
  }

  try {
    const r = await fetchConReintento(`${config.urlBase}/models`, () => ({
      headers: { authorization: `Bearer ${config.apiKey}` },
      signal: AbortSignal.timeout(TOPE_PRUEBA_MS),
    }));

    if (!r.ok) {
      const cuerpo = await r.text();
      return { ok: false, error: mensajeSaneado(`(${r.status}) ${cuerpo}`, config.apiKey) };
    }

    const datos = (await r.json()) as ListaModelosCruda;
    const modelos = (datos.data ?? [])
      .map((m) => m.id)
      .filter((id): id is string => Boolean(id))
      // Gemini expone su listado con el nombre de recurso nativo
      // ("models/gemini-2.5-flash"), pero su propio endpoint de
      // chat/completions -el que este adaptador llama- exige el nombre
      // SIN ese prefijo. Es una inconsistencia del propio proveedor entre
      // su listado y su capa de compatibilidad, no algo que dependa de
      // cual proveedor sea: quitarlo si aparece es inofensivo para Groq u
      // OpenRouter, que nunca lo traen.
      .map((id) => (id.startsWith("models/") ? id.slice("models/".length) : id))
      .sort();
    if (modelos.length === 0) {
      return { ok: false, error: "El proveedor respondió, pero sin ningún modelo en la lista." };
    }
    return { ok: true, modelos };
  } catch (error) {
    const propio = falloDelEntorno(error);
    if (propio) return { ok: false, error: propio };
    const texto = error instanceof Error ? error.message : String(error);
    return { ok: false, error: mensajeSaneado(texto, config.apiKey) };
  }
}

async function probarOpenAiCompatible(
  config: ConfigLlamadaIa,
): Promise<RespuestaProveedorIa> {
  if (!config.urlBase) {
    return {
      ok: false,
      error: "Este proveedor necesita una URL base y no tiene ninguna guardada.",
    };
  }

  try {
    const r = await fetchConReintento(`${config.urlBase}/chat/completions`, () => ({
      method: "POST",
      headers: {
        authorization: `Bearer ${config.apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: config.modelo,
        max_tokens: 16,
        tools: [HERRAMIENTA_DE_PRUEBA_OPENAI],
        messages: [{ role: "user", content: "Responde solo con la palabra: listo" }],
      }),
      signal: AbortSignal.timeout(TOPE_PRUEBA_MS),
    }));

    if (!r.ok) {
      const cuerpo = await r.text();
      return {
        ok: false,
        error: mensajeSaneadoConPista(`(${r.status}) ${cuerpo}`, config.apiKey, PISTA_SIN_TOOL_USE),
      };
    }
    return { ok: true };
  } catch (error) {
    const propio = falloDelEntorno(error);
    if (propio) return { ok: false, error: propio };
    const texto = error instanceof Error ? error.message : String(error);
    return { ok: false, error: mensajeSaneado(texto, config.apiKey) };
  }
}

interface LlamadaHerramientaOpenAi {
  id: string;
  type: string;
  function: { name: string; arguments: string };
}
interface MensajeRespuestaOpenAi {
  role: string;
  content: string | null;
  tool_calls?: LlamadaHerramientaOpenAi[];
}
interface RespuestaChatCompletionsOpenAi {
  choices?: { message?: MensajeRespuestaOpenAi; finish_reason?: string }[];
}

/**
 * Tool-use en el formato de OpenAI Chat Completions -distinto al de
 * Claude: `tools` va anidado bajo `function`, el sistema es un mensaje
 * `role: "system"` mas (Claude lo lleva aparte), y cada llamada trae sus
 * argumentos como TEXTO JSON, no como objeto-. Sirve para Gemini, Groq,
 * OpenRouter y cualquier "otro" compatible con OpenAI: los cuatro hablan
 * este mismo protocolo, ver `SERVICIOS_IA_CONOCIDOS` en `lib/proveedor-ia.ts`.
 */
async function conversarOpenAiCompatible(
  config: ConfigLlamadaIa,
  turno: TurnoIa,
): Promise<RespuestaTurno | { ok: false; error: string }> {
  if (!config.urlBase) {
    return {
      ok: false,
      error: "Este proveedor necesita una URL base y no tiene ninguna guardada.",
    };
  }

  try {
    const mensajes = turno.sistema
      ? [{ role: "system", content: turno.sistema }, ...turno.mensajes]
      : turno.mensajes;

    const r = await fetchConReintento(`${config.urlBase}/chat/completions`, () => ({
      method: "POST",
      headers: {
        authorization: `Bearer ${config.apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: config.modelo,
        max_tokens: 2048,
        messages: mensajes,
        ...(turno.herramientas.length > 0
          ? {
              tools: turno.herramientas.map((h) => ({
                type: "function",
                function: { name: h.nombre, description: h.descripcion, parameters: h.esquema },
              })),
            }
          : {}),
      }),
      signal: AbortSignal.timeout(TOPE_CONVERSACION_MS),
    }));

    if (!r.ok) {
      const cuerpo = await r.text();
      // El asistente SIEMPRE manda `tools` -no hay forma de saber de
      // antemano si la pregunta los va a necesitar-, asi que un modelo sin
      // soporte de function-calling falla en el primer mensaje, siempre, sin
      // excepcion. Nunca se reintenta sin herramientas: contestar sin poder
      // consultar nada seria adivinar cifras, justo lo que este proyecto
      // prohibe. En la practica "Probar" (arriba) ya deberia haber cazado
      // esto antes de llegar aqui -manda la misma herramienta de mentira-,
      // pero la pista se repite por si el proveedor se comporta distinto
      // entre una llamada de prueba y una de verdad. 500, no 300: aqui se
      // guarda en `MensajeAgente.error`, una columna mas ancha que
      // `AgenteIaProveedor.ultimoError`.
      const pista = turno.herramientas.length > 0 ? PISTA_SIN_TOOL_USE : "";
      return {
        ok: false,
        error: mensajeSaneadoConPista(`(${r.status}) ${cuerpo}`, config.apiKey, pista, 500),
      };
    }

    const datos = (await r.json()) as RespuestaChatCompletionsOpenAi;
    const mensaje = datos.choices?.[0]?.message;
    if (!mensaje) {
      return { ok: false, error: "El proveedor respondió sin ningún mensaje." };
    }

    const llamadas = mensaje.tool_calls ?? [];
    if (llamadas.length > 0) {
      return {
        tipo: "usar_herramientas",
        llamadas: llamadas.map((tc) => {
          let args: unknown = {};
          try {
            args = JSON.parse(tc.function.arguments || "{}");
          } catch {
            // Argumentos que no son JSON valido: se le pasan como texto
            // crudo a la herramienta, que fallara con un mensaje claro en
            // vez de que esto reviente el turno entero.
            args = { _argumentosSinParsear: tc.function.arguments };
          }
          return { id: tc.id, nombre: tc.function.name, args };
        }),
        bruto: { role: "assistant", content: mensaje.content, tool_calls: mensaje.tool_calls },
      };
    }

    const texto = (mensaje.content ?? "").trim();
    return { tipo: "texto", texto: texto || "No tengo una respuesta para eso." };
  } catch (error) {
    const propio = falloDelEntorno(error);
    if (propio) return { ok: false, error: propio };
    const texto = error instanceof Error ? error.message : String(error);
    return { ok: false, error: mensajeSaneado(texto, config.apiKey) };
  }
}

/// OpenAI quiere un mensaje `role: "tool"` SEPARADO por cada resultado
/// -a diferencia de Claude, que los junta en uno solo-.
function mensajesDeResultadosOpenAiCompatible(
  resultados: { toolUseId: string; contenido: string }[],
): unknown[] {
  return resultados.map((res) => ({
    role: "tool",
    tool_call_id: res.toolUseId,
    content: res.contenido,
  }));
}

/**
 * Que sabe LLAMAR GCM hoy. Anadir un proveedor nuevo es una entrada mas
 * aqui, sin migracion: el `tipo` de la fila es texto libre (ver
 * `AgenteIaProveedor` en el esquema), y un tipo sin adaptador registrado se
 * puede guardar igual — solo que `probarProveedorIa` lo dice en vez de
 * fallar en silencio.
 */
const ADAPTADORES: Record<string, AdaptadorProveedorIa> = {
  claude: {
    probar: probarClaude,
    conversar: conversarClaude,
    mensajesDeResultados: mensajesDeResultadosClaude,
    listarModelos: listarModelosClaude,
  },
  openai_compatible: {
    probar: probarOpenAiCompatible,
    conversar: conversarOpenAiCompatible,
    mensajesDeResultados: mensajesDeResultadosOpenAiCompatible,
    listarModelos: listarModelosOpenAiCompatible,
  },
};

/**
 * Construye el o los mensajes que representan el resultado de las
 * herramientas, en el formato que este proveedor espera -ver el
 * comentario de `mensajesDeResultados` en `AdaptadorProveedorIa`-. Envuelve
 * el registro de `ADAPTADORES`, mismo criterio que `conversar()`.
 */
export function mensajesDeResultados(
  tipo: string,
  resultados: { toolUseId: string; contenido: string }[],
): unknown[] {
  return ADAPTADORES[tipo]?.mensajesDeResultados?.(resultados) ?? [];
}

/**
 * Le pregunta al proveedor -en vivo, nunca de un catalogo guardado- que
 * modelos tiene disponibles. Envuelve el registro de `ADAPTADORES` para
 * que la Server Action que la llama no tenga que conocerlo, mismo criterio
 * que `conversar()`.
 */
export async function listarModelosProveedor(
  tipo: string,
  config: ConfigListadoIa,
): Promise<RespuestaModelosIa> {
  const adaptador = ADAPTADORES[tipo];
  if (!adaptador?.listarModelos) {
    return {
      ok: false,
      error: `Este proveedor ("${tipo}") no permite detectar sus modelos automáticamente — escribe el nombre a mano.`,
    };
  }
  return adaptador.listarModelos(config);
}

/**
 * Llama al proveedor ACTIVO de una empresa para una vuelta de
 * conversacion con herramientas. Envuelve el registro de `ADAPTADORES`
 * para que quien orquesta el turno (`agente-conversacion.service.ts`) no
 * tenga que conocerlo.
 */
export async function conversar(
  tipo: string,
  config: ConfigLlamadaIa,
  turno: TurnoIa,
): Promise<RespuestaTurno | { ok: false; error: string }> {
  const adaptador = ADAPTADORES[tipo];
  if (!adaptador?.conversar) {
    return {
      ok: false,
      error: `Este proveedor ("${tipo}") todavía no tiene conversación con herramientas implementada en GCM.`,
    };
  }
  return adaptador.conversar(config, turno);
}

// ---------------------------------------------------------------------------
// Lo que usa la pantalla
// ---------------------------------------------------------------------------

export interface ProveedorIaResumen {
  id: string;
  tipo: string;
  nombre: string;
  urlBase: string | null;
  modelo: string;
  /// Nunca la clave. Solo si hay una guardada, para que el formulario pueda
  /// decir «déjalo vacío para conservarla».
  hayClave: boolean;
  activo: boolean;
  verificadoAt: Date | null;
  ultimoError: string | null;
  ultimoErrorAt: Date | null;
}

export async function listarProveedoresIa(
  sesion: SesionActiva,
): Promise<ProveedorIaResumen[]> {
  // El MISMO permiso que gobierna el resto de la configuracion de empresa
  // (RemitenteCorreo, emisores de SMS): guardar una clave de proveedor
  // externo es ya un acto de administracion.
  if (!puede(sesion, "configuracion:editar")) return [];

  const [filas, empresa] = await Promise.all([
    prisma.agenteIaProveedor.findMany({
      where: { companyId: sesion.companyId },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        tipo: true,
        nombre: true,
        urlBase: true,
        modelo: true,
        apiKeyCifrada: true,
        verificadoAt: true,
        ultimoError: true,
        ultimoErrorAt: true,
      },
    }),
    prisma.company.findUnique({
      where: { id: sesion.companyId },
      select: { proveedorIaActivoId: true },
    }),
  ]);

  const activoId = empresa?.proveedorIaActivoId ?? null;

  return filas.map((f) => ({
    id: f.id,
    tipo: f.tipo,
    nombre: f.nombre,
    urlBase: f.urlBase,
    modelo: f.modelo,
    hayClave: f.apiKeyCifrada.length > 0,
    activo: f.id === activoId,
    verificadoAt: f.verificadoAt,
    ultimoError: f.ultimoError,
    ultimoErrorAt: f.ultimoErrorAt,
  }));
}

export type ResultadoProveedorIa = { ok: true } | { ok: false; error: string };

const SIN_PERMISO: ResultadoProveedorIa = {
  ok: false,
  error: "No tienes permiso para configurar los proveedores de IA.",
};

/**
 * Guarda (o actualiza) un proveedor de IA de la empresa.
 *
 * La clave vacia al editar significa «conserva la que ya estaba», mismo
 * criterio que `guardarRemitente`. Cambiar cualquier dato borra
 * `verificadoAt`: lo que se probo era la configuracion anterior.
 */
export async function guardarProveedorIa(
  sesion: SesionActiva,
  datos: DatosProveedorIa,
): Promise<ResultadoProveedorIa> {
  if (!puede(sesion, "configuracion:editar")) return SIN_PERMISO;

  if (!hayLlaveDeCifrado()) {
    return {
      ok: false,
      error:
        "Esta instalación no tiene configurada la clave de cifrado, así que no se puede guardar la clave de un proveedor de IA. Habla con quien administra el servidor.",
    };
  }

  const existente = datos.id
    ? await prisma.agenteIaProveedor.findFirst({
        where: { id: datos.id, companyId: sesion.companyId },
        select: { id: true, apiKeyCifrada: true },
      })
    : null;
  if (datos.id && !existente) {
    return { ok: false, error: "No se encontró ese proveedor." };
  }

  const v = validarProveedorIa(datos, existente === null);
  if (!v.ok) return { ok: false, error: v.error };

  // Clave vacia al editar = se conserva la guardada.
  const apiKeyCifrada =
    v.datos.apiKey.length > 0 ? cifrar(v.datos.apiKey) : existente!.apiKeyCifrada;
  if (apiKeyCifrada === null) {
    return {
      ok: false,
      error: "No se pudo cifrar la clave. Revisa la configuración del servidor.",
    };
  }

  const comun = {
    tipo: v.datos.tipo,
    nombre: v.datos.nombre,
    urlBase: v.datos.urlBase,
    modelo: v.datos.modelo,
    apiKeyCifrada,
    // Lo probado era la configuracion vieja.
    verificadoAt: null,
    ultimoError: null,
    ultimoErrorAt: null,
  };

  const fila = existente
    ? await prisma.agenteIaProveedor.update({
        where: { id: existente.id },
        data: comun,
        select: { id: true },
      })
    : await prisma.agenteIaProveedor.create({
        data: { ...comun, companyId: sesion.companyId, configuradoPor: quien(sesion) },
        select: { id: true },
      });

  await prisma.auditLog.create({
    data: {
      companyId: sesion.companyId,
      userId: sesion.userId,
      entidad: "AgenteIaProveedor",
      entidadId: fila.id,
      accion: existente ? "UPDATE" : "CREATE",
      // La clave NUNCA se audita, igual que la contrasena del buzon.
      despues: {
        tipo: v.datos.tipo,
        nombre: v.datos.nombre,
        modelo: v.datos.modelo,
        claveCambiada: v.datos.apiKey.length > 0,
      },
    },
  });

  return { ok: true };
}

/** Borra un proveedor. Si era el activo, deja a la empresa sin ninguno. */
export async function eliminarProveedorIa(
  sesion: SesionActiva,
  id: string,
): Promise<ResultadoProveedorIa> {
  if (!puede(sesion, "configuracion:editar")) return SIN_PERMISO;

  const fila = await prisma.agenteIaProveedor.findFirst({
    where: { id, companyId: sesion.companyId },
    select: { id: true, nombre: true },
  });
  // Ya no esta: el estado pedido es el que hay.
  if (!fila) return { ok: true };

  await prisma.$transaction(async (tx) => {
    // No confiar solo en `onDelete: SetNull` del esquema: se limpia el
    // puntero explicitamente, en la misma transaccion, mismo principio que
    // `quitarDeObra` no confia solo en la clave unica de la base.
    await tx.company.updateMany({
      where: { id: sesion.companyId, proveedorIaActivoId: id },
      data: { proveedorIaActivoId: null },
    });
    await tx.agenteIaProveedor.delete({ where: { id: fila.id } });
    await tx.auditLog.create({
      data: {
        companyId: sesion.companyId,
        userId: sesion.userId,
        entidad: "AgenteIaProveedor",
        entidadId: fila.id,
        accion: "DELETE",
        antes: { nombre: fila.nombre },
      },
    });
  });

  return { ok: true };
}

/**
 * Activa un proveedor: sera el que use el agente de IA.
 *
 * Exige `verificadoAt`: activar una clave sin probar seria descubrir que
 * esta mal el dia que el agente la necesite de verdad, no antes.
 */
export async function activarProveedorIa(
  sesion: SesionActiva,
  id: string,
): Promise<ResultadoProveedorIa> {
  if (!puede(sesion, "configuracion:editar")) return SIN_PERMISO;

  const fila = await prisma.agenteIaProveedor.findFirst({
    where: { id, companyId: sesion.companyId },
    select: { id: true, verificadoAt: true },
  });
  if (!fila) return { ok: false, error: "No se encontró ese proveedor." };
  if (!fila.verificadoAt) {
    return {
      ok: false,
      error:
        "Pruébalo antes de activarlo: activar una clave sin probar podría dejar el agente sin poder responder el día que haga falta.",
    };
  }

  await prisma.company.update({
    where: { id: sesion.companyId },
    data: { proveedorIaActivoId: id },
  });

  await prisma.auditLog.create({
    data: {
      companyId: sesion.companyId,
      userId: sesion.userId,
      entidad: "AgenteIaProveedor",
      entidadId: id,
      accion: "UPDATE",
      despues: { evento: "activar" },
    },
  });

  return { ok: true };
}

/**
 * Prueba un proveedor de verdad: descifra la clave y manda un mensaje
 * minimo real. El resultado se guarda en la fila, igual que
 * `probarRemitente` — asi la pantalla distingue «configurado» de
 * «configurado y funciona».
 */
export async function probarProveedorIa(
  sesion: SesionActiva,
  id: string,
): Promise<ResultadoProveedorIa> {
  if (!puede(sesion, "configuracion:editar")) return SIN_PERMISO;

  const fila = await prisma.agenteIaProveedor.findFirst({
    where: { id, companyId: sesion.companyId },
    select: { id: true, tipo: true, urlBase: true, modelo: true, apiKeyCifrada: true },
  });
  if (!fila) return { ok: false, error: "No se encontró ese proveedor." };

  const adaptador = ADAPTADORES[fila.tipo];
  if (!adaptador) {
    return {
      ok: false,
      error: `Este tipo de proveedor ("${fila.tipo}") todavía no tiene conexión implementada en GCM.`,
    };
  }

  const apiKey = descifrar(fila.apiKeyCifrada);
  if (apiKey === null) {
    return {
      ok: false,
      error: "No se pudo leer la clave guardada. Vuelve a guardarla e inténtalo otra vez.",
    };
  }

  const r = await adaptador.probar({ apiKey, urlBase: fila.urlBase, modelo: fila.modelo });

  if (r.ok) {
    await prisma.agenteIaProveedor.update({
      where: { id: fila.id },
      data: { verificadoAt: new Date(), ultimoError: null, ultimoErrorAt: null },
    });
    return { ok: true };
  }

  await prisma.agenteIaProveedor.update({
    where: { id: fila.id },
    data: { verificadoAt: null, ultimoError: r.error, ultimoErrorAt: new Date() },
  });
  return { ok: false, error: `El proveedor rechazó la prueba: ${r.error}` };
}

// ---------------------------------------------------------------------------
// Lo que usa el agente conversacional
// ---------------------------------------------------------------------------

export interface ConfiguracionProveedorActivo {
  id: string;
  nombre: string;
  tipo: string;
  modelo: string;
  urlBase: string | null;
  apiKey: string;
}

/**
 * El proveedor ACTIVO de una empresa, listo para conversar. Mismo molde
 * que `configuracionDeEnvio` en `remitente-correo.service.ts`: null en
 * los mismos casos que ahi significan lo mismo para quien llama —no hay
 * con que responder—: sin proveedor activo, sin llave de cifrado, o la
 * clave guardada no descifra (llave rotada o fila manipulada).
 */
export async function configuracionProveedorActivo(
  companyId: string,
): Promise<ConfiguracionProveedorActivo | null> {
  if (!hayLlaveDeCifrado()) return null;

  const empresa = await prisma.company.findUnique({
    where: { id: companyId },
    select: {
      proveedorIaActivo: {
        select: { id: true, nombre: true, tipo: true, modelo: true, urlBase: true, apiKeyCifrada: true },
      },
    },
  });
  const activo = empresa?.proveedorIaActivo;
  if (!activo) return null;

  const apiKey = descifrar(activo.apiKeyCifrada);
  if (apiKey === null) return null;

  return {
    id: activo.id,
    nombre: activo.nombre,
    tipo: activo.tipo,
    modelo: activo.modelo,
    urlBase: activo.urlBase,
    apiKey,
  };
}

/**
 * Los OTROS proveedores YA VERIFICADOS de una empresa -nunca el que
 * acaba de fallar, nunca uno que nadie probo nunca-, en orden de
 * antiguedad. Es la lista de candidatos para el conmutador automatico
 * (`agente-conversacion.service.ts`): si el activo falla, se intenta con
 * el primero de esta lista antes de rendirse. Sin permiso de por medio
 * a proposito -como `configuracionProveedorActivo`, es una consulta
 * interna del propio motor del agente, no una pantalla que un usuario
 * pida a mano-, pero SOLO entre proveedores que un humano ya probo de
 * verdad alguna vez (`verificadoAt` no nulo): el conmutador nunca activa
 * algo que nadie confirmo que funcionaba.
 */
export async function configuracionesAlternativas(
  companyId: string,
  excluirId: string,
): Promise<ConfiguracionProveedorActivo[]> {
  if (!hayLlaveDeCifrado()) return [];

  const filas = await prisma.agenteIaProveedor.findMany({
    where: { companyId, id: { not: excluirId }, verificadoAt: { not: null } },
    orderBy: { createdAt: "asc" },
    select: { id: true, nombre: true, tipo: true, modelo: true, urlBase: true, apiKeyCifrada: true },
  });

  const configuraciones: ConfiguracionProveedorActivo[] = [];
  for (const f of filas) {
    const apiKey = descifrar(f.apiKeyCifrada);
    if (apiKey === null) continue; // fila manipulada o llave rotada: se salta, no revienta el conmutador
    configuraciones.push({
      id: f.id,
      nombre: f.nombre,
      tipo: f.tipo,
      modelo: f.modelo,
      urlBase: f.urlBase,
      apiKey,
    });
  }
  return configuraciones;
}

/**
 * Activa un proveedor SIN pedir permiso ni exigir `verificadoAt` de
 * nuevo -a diferencia de `activarProveedorIa`, que es la version
 * expuesta a la pantalla-. Solo la llama el conmutador automatico, y
 * solo con un proveedor que `configuracionesAlternativas` ya filtro por
 * `verificadoAt` no nulo: no es una puerta nueva, es la MISMA puerta
 * (un humano probo esto alguna vez) accionada por el sistema en vez de
 * un click.
 */
export async function activarProveedorInterno(
  companyId: string,
  proveedorId: string,
): Promise<void> {
  await prisma.company.update({
    where: { id: companyId },
    data: { proveedorIaActivoId: proveedorId },
  });
}

/**
 * Registra que un proveedor fallo durante una conversacion real -no
 * durante "Probar"-, para que quien administra `/empresa/configuracion/ia`
 * lo vea la proxima vez que entre (mismo campo `ultimoError` que ya usa
 * "Probar", misma pantalla, sin superficie nueva). A proposito NO toca
 * `verificadoAt`: un fallo en una conversacion es una senal mas debil que
 * un "Probar" fallido a proposito -alguien SI confirmo antes que este
 * proveedor funciona-, asi que no le retira esa confianza sola.
 */
export async function marcarErrorProveedorInterno(
  proveedorId: string,
  error: string,
): Promise<void> {
  await prisma.agenteIaProveedor.update({
    where: { id: proveedorId },
    data: { ultimoError: error.slice(0, 300), ultimoErrorAt: new Date() },
  });
}
