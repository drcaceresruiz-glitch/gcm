/**
 * Un limitador de frecuencia por clave, en memoria.
 *
 * POR QUE EN MEMORIA Y NO EN LA BASE, al reves que el limite de intentos de
 * login: aquel cuenta fallos que YA se auditan, asi que la fila existia igual.
 * Aqui habria que escribir una fila por consulta solo para poder contarlas, y
 * eso es mas caro que la llamada que se quiere frenar.
 *
 * Encaja porque este despliegue es UN proceso en UNA maquina —hosting
 * compartido con Passenger, ver la auditoria—. **Lo que hay que saber si eso
 * cambia**: con dos procesos, cada uno tendria su propio contador y el limite
 * real seria el doble. Y se reinicia en cada despliegue, que es aceptable para
 * proteger una cuota de terceros y NO lo seria para una defensa de seguridad.
 *
 * Ventana DESLIZANTE y no cubos por minuto: con cubos, veinte consultas al
 * final de un minuto y veinte al principio del siguiente son cuarenta en dos
 * segundos sin pasarse de «veinte por minuto».
 *
 * Sin temporizadores: la hora entra como argumento. Asi se prueba entero sin
 * relojes falsos y sin esperar.
 */

export interface Limitador {
  /**
   * Apunta un intento y dice si pasa.
   *
   * Cuando NO pasa, `esperaSegundos` es lo que falta para que el mas viejo de
   * la ventana caduque: es un dato que la pantalla puede decir, y decir
   * cuanto convierte un «no» en una espera.
   */
  intentar(
    clave: string,
    ahora: number,
  ): { ok: true } | { ok: false; esperaSegundos: number };
  /// Cuantas claves se estan vigilando. Para las pruebas y para no crecer.
  tamano(): number;
}

export function crearLimitador(opciones: {
  maximo: number;
  ventanaMs: number;
  /**
   * Cuantas claves distintas se recuerdan como mucho.
   *
   * Existe porque el mapa lo llena quien llama: con una clave por empresa son
   * dos o tres, pero si algun dia se limita por algo mas variado —una IP, un
   * RUC— un mapa sin tope es una fuga de memoria lenta. Al pasarse se tira la
   * mitad mas antigua; perder un contador solo deja pasar alguna consulta de
   * mas, que es el lado inofensivo del fallo.
   */
  maximasClaves?: number;
}): Limitador {
  const { maximo, ventanaMs, maximasClaves = 1000 } = opciones;
  /// clave -> instantes de los intentos que siguen dentro de la ventana.
  const vistos = new Map<string, number[]>();

  return {
    intentar(clave, ahora) {
      const desde = ahora - ventanaMs;
      const previos = (vistos.get(clave) ?? []).filter((t) => t > desde);

      if (previos.length >= maximo) {
        // El mas viejo de los que cuentan decide cuando se libera un hueco.
        const masViejo = previos[0]!;
        const espera = Math.ceil((masViejo + ventanaMs - ahora) / 1000);
        // Se guarda lo ya podado: si no, la ventana no avanzaria nunca para
        // quien insiste, porque cada intento rechazado dejaria la lista vieja.
        vistos.set(clave, previos);
        return { ok: false, esperaSegundos: Math.max(1, espera) };
      }

      previos.push(ahora);
      vistos.set(clave, previos);

      if (vistos.size > maximasClaves) {
        // Las mas antiguas primero: `Map` conserva el orden de insercion, y
        // una clave que no se vuelve a usar nunca se reinserta.
        for (const k of [...vistos.keys()].slice(0, Math.floor(maximasClaves / 2))) {
          vistos.delete(k);
        }
      }

      return { ok: true };
    },

    tamano: () => vistos.size,
  };
}
