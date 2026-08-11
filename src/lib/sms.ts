/**
 * Que canales de SMS se prueban, y en que orden.
 *
 * Vive aqui y no en `sms.service` porque es una decision, no un efecto: se
 * puede probar entera sin base de datos, sin red y sin telefono. El servicio
 * se queda con lo de verdad dificil de probar —hablar con la base y con la
 * pasarela— y con esta lista decide a quien llama.
 */

/**
 * Los dos canales, en el orden en que se prefieren.
 *
 * - `cola`: la linea propia de la empresa. Un movil Android recoge los
 *   mensajes de GCM y los manda con su SIM.
 * - `pasarela`: json.pe, el canal de antes, que TAMPOCO enviaba desde la
 *   nube —salia igualmente de un movil— y se conserva como respaldo.
 */
export type CanalSms = "cola" | "pasarela";

/**
 * La lista de canales a intentar, del preferido al ultimo.
 *
 * **La cola va primera cuando esta configurada**: es la linea de la empresa y
 * no la de un tercero, que es justo lo que se pidio al construirla.
 *
 * **Y la pasarela sigue detras aunque la cola exista.** Esto es lo que hace
 * distinta a esta funcion de lo que habia antes, y el motivo de que exista:
 * hasta ahora, tener la cola encendida ANULABA el respaldo. Si el encolado
 * fallaba —la tabla `mensajes_sms` sin crear en produccion, por ejemplo— el
 * envio se daba por perdido sin probar json.pe, y como el fallo se traga en
 * el log, la obra se quedaba sin SMS sin que nadie se enterara. Configurar un
 * canal mejor no puede apagar el que ya funcionaba.
 *
 * Devuelve vacio cuando no hay ninguno, que es un estado legitimo y no un
 * error: el codigo del pase sale igual por correo, y el residente puede
 * generarlo en pantalla y dictarlo.
 */
export function canalesAProbar(disponibles: {
  cola: boolean;
  pasarela: boolean;
}): CanalSms[] {
  const canales: CanalSms[] = [];

  if (disponibles.cola) canales.push("cola");
  if (disponibles.pasarela) canales.push("pasarela");

  return canales;
}
