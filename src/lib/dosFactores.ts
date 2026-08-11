/**
 * Reglas de la verificacion en dos pasos que no necesitan base de datos.
 *
 * El codigo son seis cifras. Es poca entropia —un millon de combinaciones—,
 * y por eso lo que de verdad lo sostiene es el limite de intentos y la
 * caducidad corta, no la longitud: con cinco intentos y diez minutos, las
 * probabilidades de acertar a ciegas son de cinco entre un millon.
 *
 * Seis cifras y no ocho porque esto se teclea desde el movil mirando el
 * correo —o el SMS— en otra ventana, y cada cifra de mas es un error de
 * tecleo mas.
 */

export const LONGITUD_CODIGO = 6;

/** Vigencia del codigo. Corta: se pide y se usa en el momento. */
export const VIGENCIA_CODIGO_MINUTOS = 10;

/** Intentos antes de tirar el desafio y volver a empezar por la clave. */
export const MAX_INTENTOS_CODIGO = 5;

/**
 * Cuantos codigos puede pedir una misma persona seguidos, y en cuanto rato.
 *
 * Vivia en `@/lib/pase` —que lo necesito primero— y se trajo aqui al abrir
 * el SMS al segundo factor de los usuarios, que hasta entonces NO tenia
 * ningun limite de reenvios: solo el de intentos por desafio. Con el correo
 * eso solo llenaba un buzon; con el SMS, cada reenvio gasta dinero de la
 * linea de la empresa y acerca el corte por antispam de la operadora.
 */
export const MAX_CODIGOS_POR_VENTANA = 3;
export const VENTANA_CODIGOS_MINUTOS = 15;

/** Por donde sale el codigo de acceso. Lo elige cada persona en su perfil. */
export type Canal2FA = "CORREO" | "SMS";

/**
 * Por donde sale de verdad el codigo de esta persona.
 *
 * No basta con lo que eligio: el SMS solo vale si hay un celular y si ese
 * celular esta VERIFICADO. Cualquier otro caso cae al correo.
 *
 * Es una funcion y no un campo porque el estado puede dejar de cumplirse
 * despues de elegir —al cambiar el numero se borra la verificacion—, y
 * porque el fallo seguro tiene que ser "te llega por correo", nunca "no te
 * llega". Un codigo que no sale deja a la persona fuera de su cuenta, y el
 * envio de SMS se traga los errores en silencio.
 */
export function canalEfectivo(usuario: {
  canal2FA: Canal2FA;
  celular: string | null;
  celularVerificadoAt: Date | null;
}): Canal2FA {
  if (usuario.canal2FA !== "SMS") return "CORREO";
  if (!usuario.celular) return "CORREO";
  if (!usuario.celularVerificadoAt) return "CORREO";

  return "SMS";
}

/**
 * El destino, tapado, para poder ensenarlo sin regalarlo.
 *
 * La pantalla del codigo tiene que decir a DONDE se mando —si no, quien
 * cambio de canal hace un mes mira el buzon equivocado—, pero escribirlo
 * entero se lo regala a quien tenga la pantalla delante en un ordenador
 * compartido.
 *
 * Del celular se dejan las tres ultimas cifras, que es como lo hace todo el
 * mundo y basta para reconocer el propio numero. Del correo, la primera
 * letra y el dominio: el dominio casi siempre es el de la empresa y no
 * distingue a nadie.
 */
export function enmascararDestino(canal: Canal2FA, valor: string): string {
  if (canal === "SMS") {
    const cifras = valor.replace(/\D/g, "");
    return cifras.length <= 3 ? cifras : `•••${cifras.slice(-3)}`;
  }

  const arroba = valor.indexOf("@");
  if (arroba <= 0) return valor;

  return `${valor[0]}•••${valor.slice(arroba)}`;
}

/**
 * Deja el codigo tal como se compara: solo cifras.
 *
 * La gente pega el codigo desde el correo con espacios delante y detras, y
 * algunos clientes lo parten como "123 456". Rechazar eso seria culpar al
 * usuario de un formato que no eligio.
 */
export function normalizarCodigo(entrada: string): string {
  return entrada.replace(/\D/g, "");
}

export function codigoBienFormado(entrada: string): boolean {
  return normalizarCodigo(entrada).length === LONGITUD_CODIGO;
}
