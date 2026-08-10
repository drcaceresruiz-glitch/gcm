import "server-only";

import { env } from "@/lib/env";

/**
 * Envio de SMS por json.pe.
 *
 * OJO A COMO FUNCIONA, porque no es un proveedor en la nube: el SMS **sale
 * del telefono Android del cliente**. Hay que instalar su app en un movil,
 * vincularlo, y ese aparato es el que manda el mensaje por su propia SIM.
 *
 * De ahi las tres consecuencias que hay que tener presentes:
 *
 * 1. **Ese telefono es un punto unico de fallo.** Sin bateria, sin saldo o
 *    sin cobertura, no sale ningun codigo y nadie puede entrar a documentar.
 *    Por eso el correo sigue siendo el respaldo y por eso el residente puede
 *    generar el codigo en pantalla y dictarlo.
 * 2. **Es opcional, como el SMTP.** Sin token, esto devuelve
 *    `{ enviado: false }` y no lanza: un fallo de envio no puede tumbar la
 *    operacion que lo pidio.
 * 3. El numero va como lo guarda GCM (nueve cifras). Si algun dia la pasarela
 *    exige prefijo de pais, se anade AQUI y en ningun otro sitio.
 */

const URL_ENVIO = "https://api.sms.json.pe/send";

/// Un envio no puede dejar colgada la peticion que lo pidio. Diez segundos es
/// de sobra para un POST, y LiteSpeed corta mucho antes de que esto importe.
const TIEMPO_MAXIMO_MS = 10_000;

export interface ResultadoSms {
  enviado: boolean;
  /// Por que no se envio, para el log. Nunca se ensena al usuario: delataria
  /// si un contacto existe.
  motivo?: string;
}

export function hayCanalSms(): boolean {
  return Boolean(env.SMS_TOKEN);
}

/**
 * Manda un SMS. Nunca lanza.
 *
 * @param numero Celular en el formato que guarda GCM (nueve cifras).
 */
export async function enviarSms(
  numero: string,
  mensaje: string,
): Promise<ResultadoSms> {
  if (!env.SMS_TOKEN) {
    if (env.NODE_ENV !== "production") {
      // En desarrollo se imprime, como hace el correo: asi se puede probar el
      // ciclo entero del pase sin contratar nada.
      console.info(`[sms NO enviado — sin token] Para: ${numero} | ${mensaje}`);
    }
    return { enviado: false, motivo: "sin-token" };
  }

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
