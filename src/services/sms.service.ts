import "server-only";

import { env } from "@/lib/env";
import { canalesAProbar } from "@/lib/sms";
import { encolarSms, hayColaSms } from "@/services/sms-cola.service";

/**
 * Envio de SMS. UN solo sitio, con dos canales detras.
 *
 * Este archivo existe para que el resto del sistema no sepa por donde sale un
 * SMS: `pase.service` llama a `enviarSms` y se acabo. Los canales, en orden
 * de preferencia:
 *
 * 1. **La cola propia de la empresa.** GCM deja el mensaje en una cola y el
 *    telefono de esa constructora lo recoge con MacroDroid o Tasker y lo manda
 *    con su SIM. Es lo que pidio el usuario para no depender de nadie. La
 *    credencial es de cada empresa y vive hasheada en la base: ya no hay
 *    ningun token de entorno que sirva a varias. Ver `sms-cola.service` para
 *    el reparto y para el riesgo que trae.
 * 2. **json.pe** (`SMS_TOKEN`). La pasarela de antes, que TAMPOCO enviaba
 *    desde la nube: salia del movil Android del cliente con su app instalada.
 *    Se conserva como respaldo.
 *
 * Respaldo quiere decir respaldo: si el primero falla se prueba el segundo.
 * Durante un tiempo no fue asi —tener la cola configurada apagaba json.pe
 * incluso cuando el encolado reventaba— y eso convirtio un fallo de base de
 * datos en una obra entera sin SMS, en silencio. El orden lo decide
 * `canalesAProbar` en `@/lib/sms`, que es puro y esta probado.
 *
 * Sin ninguno de los dos no pasa nada grave: el codigo del pase sale por
 * correo, o lo genera el residente en su pantalla y lo dicta. Por eso los dos
 * son OPCIONALES, como el SMTP, y por eso nada de aqui lanza nunca: un fallo
 * de envio no puede tumbar la operacion que lo pidio.
 *
 * En los dos casos el telefono emisor es un punto unico de fallo: sin
 * bateria, sin saldo o sin cobertura no sale ningun codigo. Eso no lo arregla
 * ningun software, y es la razon de que el correo y el dictado sigan ahi.
 */

const URL_ENVIO = "https://api.sms.json.pe/send";

/// Un envio no puede dejar colgada la peticion que lo pidio. Diez segundos es
/// de sobra para un POST, y LiteSpeed corta mucho antes de que esto importe.
const TIEMPO_MAXIMO_MS = 10_000;

export interface ResultadoSms {
  /**
   * Se acepto el envio por algun canal.
   *
   * OJO: con la cola significa **encolado**, no recibido. Nadie puede
   * garantizar lo segundo —el SMS sale de un telefono ajeno— y prometerlo
   * seria mentir en la pantalla del residente.
   */
  enviado: boolean;
  /// Salio por la cola propia y no por la pasarela.
  encolado?: boolean;
  /// Por que no se envio, para el log. Nunca se ensena al usuario: delataria
  /// si un contacto existe.
  motivo?: string;
}

/**
 * Si esta empresa tiene por donde sacar un SMS.
 *
 * Asincrona desde que la cola es por empresa: hay que mirar si tiene emisor
 * propio, y eso es una consulta.
 */
export async function hayCanalSms(companyId: string): Promise<boolean> {
  return (await hayColaSms(companyId)) || Boolean(env.SMS_TOKEN);
}

/**
 * Manda un SMS por el canal que haya. Nunca lanza.
 *
 * @param companyId De quien es el mensaje. La cola es por empresa: sin esto
 *   el telefono de una constructora recogeria los codigos de otra.
 * @param numero Celular en el formato que guarda GCM (nueve cifras).
 * @param opciones De que obra sale y con que urgencia. Solo llegan a la cola
 *   propia: la pasarela de json.pe manda al momento y no tiene nada que
 *   ordenar. Sin `projectId` no se puede contar cuantos SMS gasta una obra, y
 *   sin `prioridad` un aviso puede adelantar a un codigo de acceso que caduca
 *   en diez minutos.
 */
export async function enviarSms(
  companyId: string,
  numero: string,
  mensaje: string,
  opciones?: { projectId?: string | null; prioridad?: number },
): Promise<ResultadoSms> {
  const canales = canalesAProbar({
    cola: await hayColaSms(companyId),
    pasarela: Boolean(env.SMS_TOKEN),
  });

  if (canales.length === 0) {
    if (env.NODE_ENV !== "production") {
      // En desarrollo se imprime, como hace el correo: asi se puede probar el
      // ciclo entero del pase sin contratar nada.
      console.info(`[sms NO enviado — sin canal] Para: ${numero} | ${mensaje}`);
    }
    return { enviado: false, motivo: "sin-canal" };
  }

  // Gana el primero que acepte. Se acumulan los motivos de los que fallaron
  // para que el log diga «cola+http-500» y no solo el ultimo: saber que la
  // cola tambien estaba caida es la mitad del diagnostico.
  const motivos: string[] = [];

  for (const canal of canales) {
    const r =
      canal === "cola"
        ? await porLaCola(companyId, numero, mensaje, opciones)
        : await enviarPorPasarela(numero, mensaje);

    if (r.enviado) return r;
    if (r.motivo) motivos.push(r.motivo);
  }

  return { enviado: false, motivo: motivos.join("+") };
}

/**
 * La cola propia.
 *
 * Encolar no es enviar: el SMS sale cuando el telefono de la empresa recoge
 * el mensaje. Por eso `enviado: true` viene con `encolado: true`, para que
 * quien lo lea sepa que promete menos.
 */
async function porLaCola(
  companyId: string,
  numero: string,
  mensaje: string,
  opciones?: { projectId?: string | null; prioridad?: number },
): Promise<ResultadoSms> {
  const encolado = await encolarSms(companyId, numero, mensaje, opciones);

  return encolado
    ? { enviado: true, encolado: true }
    : { enviado: false, motivo: "cola" };
}

/** El canal viejo: json.pe. */
async function enviarPorPasarela(
  numero: string,
  mensaje: string,
): Promise<ResultadoSms> {
  const corte = AbortSignal.timeout(TIEMPO_MAXIMO_MS);

  try {
    const respuesta = await fetch(URL_ENVIO, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.SMS_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ number: numero, message: mensaje }),
      signal: corte,
    });

    if (!respuesta.ok) {
      // El cuerpo puede traer el detalle; se registra pero no se propaga.
      const detalle = await respuesta.text().catch(() => "");
      console.error(
        `[sms] La pasarela respondio ${respuesta.status}: ${detalle.slice(0, 200)}`,
      );
      return { enviado: false, motivo: `http-${respuesta.status}` };
    }

    return { enviado: true };
  } catch (e) {
    // Se traga el fallo a proposito: si el telefono emisor esta apagado, el
    // codigo simplemente no llega y quedan el correo y el dictado. Tumbar la
    // peticion no ayudaria a nadie.
    console.error("[sms] No se pudo enviar:", e);
    return { enviado: false, motivo: "red" };
  }
}

/**
 * El texto del codigo, en un SMS.
 *
 * Corto a proposito: un SMS son 160 caracteres y pasarse parte el mensaje en
 * dos, que se cobran como dos y llegan desordenados. Sin enlaces: las
 * operadoras marcan como spam los SMS con URL.
 */
export function textoCodigoPase(codigo: string, minutos: number): string {
  return `GCM: tu codigo para cargar evidencia es ${codigo}. Vence en ${minutos} minutos. No lo compartas.`;
}

/**
 * El codigo para ENTRAR en GCM, en un SMS.
 *
 * Va aparte de `textoCodigoPase` porque no es lo mismo y la diferencia
 * importa: aquel abre una obra para subir fotos, este abre una cuenta entera.
 * Quien lo reciba sin haberlo pedido tiene que entender que alguien conoce su
 * clave, y por eso el aviso final —el mismo que ya lleva el correo—.
 *
 * Las mismas reglas de siempre: menos de 160 caracteres para que no se parta
 * en dos, y sin enlaces, que las operadoras marcan como spam.
 */
export function textoCodigoAcceso(codigo: string, minutos: number): string {
  return `GCM: tu codigo para entrar es ${codigo}. Vence en ${minutos} minutos. Si no estabas entrando, cambia tu clave.`;
}
