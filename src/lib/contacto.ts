/**
 * Como se escribe un contacto y como se guarda.
 *
 * Esto vivia en `@/lib/pase`, que es donde se necesito primero. Se saco aqui
 * cuando el segundo factor de los USUARIOS empezo a mandar codigos por SMS:
 * autenticacion importando del pase de obra habria atado dos dominios que no
 * tienen nada que ver, y el que manda no es el pase. `pase.ts` lo reexporta,
 * asi que nada de lo que ya funcionaba cambia.
 *
 * Por que importa la forma canonica: el mismo celular se escribe de cinco
 * maneras (+51 987 654 321, 987-654-321, 51987654321...). Si no se guardara
 * siempre igual, la persona teclearia su numero de otra forma un martes y el
 * sistema le diria que no esta registrada. Y `enviarSms` espera nueve cifras:
 * pasarle lo que la gente teclea es mandar el SMS a ninguna parte.
 */

export type Contacto =
  | { tipo: "email"; valor: string }
  | { tipo: "celular"; valor: string };

/**
 * Deja un celular peruano en nueve cifras.
 *
 * Acepta como lo escribe la gente: con +51, con 51 delante, con espacios,
 * guiones o parentesis. Devuelve null si lo que queda no es un movil peruano
 * (nueve cifras empezando por 9).
 *
 * Se guarda sin prefijo de pais a proposito: es lo que la persona teclea
 * cuando se lo piden, y anadirlo obligaria a adivinar si el 51 del principio
 * es el pais o parte del numero.
 */
export function normalizarCelular(entrada: string): string | null {
  const cifras = entrada.replace(/\D/g, "");

  // 51 delante: puede ser el prefijo de pais, pero solo se quita si lo que
  // queda es un movil valido. Un numero que ya empieza por 9 no se toca.
  const sinPrefijo =
    cifras.length === 11 && cifras.startsWith("51") ? cifras.slice(2) : cifras;

  return /^9\d{8}$/.test(sinPrefijo) ? sinPrefijo : null;
}

/**
 * Correo en minusculas y sin espacios.
 *
 * La comprobacion es deliberadamente laxa, la misma que el alta de usuarios
 * (`@/lib/usuarios`): validar correos con una expresion estricta rechaza
 * direcciones legitimas, y quien se equivoque simplemente no recibira el
 * codigo.
 */
export function normalizarEmail(entrada: string): string | null {
  const limpio = entrada.trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(limpio) ? limpio : null;
}

/**
 * Que escribio quien quiere entrar: un correo o un celular.
 *
 * Se decide por la arroba y no preguntandole a la persona: en obra, un campo
 * menos es un error menos.
 */
export function reconocerContacto(entrada: string): Contacto | null {
  const bruto = entrada.trim();
  if (!bruto) return null;

  if (bruto.includes("@")) {
    const valor = normalizarEmail(bruto);
    return valor ? { tipo: "email", valor } : null;
  }

  const valor = normalizarCelular(bruto);
  return valor ? { tipo: "celular", valor } : null;
}
