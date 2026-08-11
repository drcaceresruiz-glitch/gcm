import "server-only";
import { timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { generateToken, hashToken, generateNumericCode } from "@/lib/tokens";
import {
  LONGITUD_CODIGO,
  VIGENCIA_CODIGO_MINUTOS,
  MAX_INTENTOS_CODIGO,
  MAX_CODIGOS_POR_VENTANA,
  VENTANA_CODIGOS_MINUTOS,
  canalEfectivo,
  enmascararDestino,
  normalizarCodigo,
  type Canal2FA,
} from "@/lib/dosFactores";
import { enviarCorreo, correoCodigoAcceso } from "@/services/mailer.service";
import { enviarSms, textoCodigoAcceso } from "@/services/sms.service";

/**
 * Verificacion en dos pasos por codigo, al correo o al SMS.
 *
 * El desafio vive entre acertar la clave y terminar de entrar. Quien lo tiene
 * abierto NO esta autenticado: no hay sesion, no hay cookie de sesion y no
 * puede tocar nada. Solo puede gastar sus cinco intentos.
 *
 * La cookie guarda un token opaco, no el identificador del usuario. Si
 * guardara el usuario, cualquiera podria escribir el de otro y ponerse a
 * probar seis cifras contra la cuenta que quisiera.
 *
 * Aqui vive tambien el otro ciclo de codigos: el que comprueba que un celular
 * es de quien dice, antes de dejarle elegirlo como canal. Comparte tabla y
 * mecanismo pero NO se mezcla con el de acceso: los separa `proposito`, y
 * cada uno solo borra y gasta los suyos. Ese va sin cookie, porque quien
 * verifica su telefono ya tiene sesion.
 */

const COOKIE_DESAFIO = "gcm_2fa";

/** Lo que hay que saber del usuario para mandarle su codigo. */
export interface DestinatarioCodigo {
  id: string;
  /// De que empresa es. La cola de SMS es por empresa: sin esto el codigo
  /// saldria por el telefono de otra constructora.
  companyId: string;
  nombres: string;
  email: string;
  celular: string | null;
  canal2FA: Canal2FA;
  celularVerificadoAt: Date | null;
}

/**
 * Abre el desafio y manda el codigo por el canal que corresponda.
 *
 * Devuelve por donde salio de verdad, que no siempre es el canal elegido: ver
 * `repartirCodigo`.
 */
export async function crearDesafio(
  usuario: DestinatarioCodigo,
): Promise<{ canal: Canal2FA; destino: string }> {
  // Un desafio a la vez. Si no, cada intento de entrar dejaria otro codigo
  // vivo y valdrian todos: cinco intentos por codigo se multiplicarian.
  //
  // Se CADUCAN en vez de borrarse, y esa es la diferencia con antes: las
  // filas se quedan un rato para poder contarlas y limitar los reenvios. Una
  // fila caducada no sirve para entrar —`verificarCodigo` mira `expiresAt`—,
  // asi que no se pierde nada. Las viejas de verdad se barren mas abajo.
  const ahora = new Date();
  await prisma.codigoAcceso.updateMany({
    where: { userId: usuario.id, proposito: "ACCESO", expiresAt: { gt: ahora } },
    data: { expiresAt: ahora },
  });

  const token = generateToken();
  const codigo = generateNumericCode(LONGITUD_CODIGO);
  const canal = await canalDeEsteEnvio(usuario);
  const destino = canal === "SMS" ? usuario.celular! : usuario.email;

  await prisma.codigoAcceso.create({
    data: {
      userId: usuario.id,
      proposito: "ACCESO",
      destino,
      tokenHash: hashToken(token),
      codigoHash: hashToken(codigo),
      expiresAt: new Date(ahora.getTime() + VIGENCIA_CODIGO_MINUTOS * 60_000),
    },
  });

  await barrerViejos(usuario.id, ahora);

  const almacen = await cookies();
  almacen.set(COOKIE_DESAFIO, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: VIGENCIA_CODIGO_MINUTOS * 60,
  });

  return repartirCodigo(usuario, canal, destino, codigo);
}

/**
 * Por donde sale ESTE envio.
 *
 * Es el canal efectivo del usuario, salvo que haya pedido demasiados codigos
 * en poco rato: entonces baja al correo. **No se le deja sin codigo**, que es
 * la diferencia importante con el limite del pase de obra: aqui quien pide ya
 * acerto su clave, asi que no es un desconocido bombardeando, es alguien
 * intentando entrar en su propia cuenta. Lo que hay que proteger no es la
 * puerta, es el gasto de la linea de la empresa, y el correo no cuesta nada.
 */
async function canalDeEsteEnvio(
  usuario: DestinatarioCodigo,
): Promise<Canal2FA> {
  const canal = canalEfectivo(usuario);
  if (canal !== "SMS") return "CORREO";

  const desde = new Date(Date.now() - VENTANA_CODIGOS_MINUTOS * 60_000);
  const recientes = await prisma.codigoAcceso.count({
    where: {
      userId: usuario.id,
      proposito: "ACCESO",
      destino: usuario.celular,
      createdAt: { gt: desde },
    },
  });

  return recientes >= MAX_CODIGOS_POR_VENTANA ? "CORREO" : "SMS";
}

/**
 * Manda el codigo por UN canal, con el correo de red debajo.
 *
 * Por uno y no por los dos, a diferencia del pase de obra: alli se busca que
 * el codigo llegue como sea a alguien que esta en la obra con guantes; aqui
 * la persona eligio un canal y recibirlo por duplicado en cada entrada
 * molesta —y el SMS cuesta—.
 *
 * Pero si el SMS no sale, se manda por correo. No es mandarlo por los dos: es
 * que un SMS que falla dejaria a la persona fuera de su propia cuenta sin que
 * nadie se entere, porque `enviarSms` se traga los errores a proposito.
 */
async function repartirCodigo(
  usuario: DestinatarioCodigo,
  canal: Canal2FA,
  destino: string,
  codigo: string,
): Promise<{ canal: Canal2FA; destino: string }> {
  if (canal === "SMS") {
    const sms = await enviarSms(
      usuario.companyId,
      destino,
      textoCodigoAcceso(codigo, VIGENCIA_CODIGO_MINUTOS),
    );
    if (sms.enviado) return { canal, destino };

    console.error(
      `[2fa] El SMS no salio (${sms.motivo ?? "sin motivo"}). Se manda por correo.`,
    );

    // Queda constancia de por donde salio de verdad, o la pantalla diria que
    // mire un SMS que no existe.
    await prisma.codigoAcceso.updateMany({
      where: { userId: usuario.id, proposito: "ACCESO", destino },
      data: { destino: usuario.email },
    });
  }

  await enviarCorreo({
    para: usuario.email,
    ...correoCodigoAcceso({
      nombre: usuario.nombres,
      codigo,
      minutos: VIGENCIA_CODIGO_MINUTOS,
    }),
  });

  return { canal: "CORREO", destino: usuario.email };
}

/**
 * Tira las filas que ya no sirven ni para contar.
 *
 * Sin esto, caducar en vez de borrar dejaria una fila por cada entrada para
 * siempre. Se conserva la ventana del limite de reenvios y nada mas.
 */
async function barrerViejos(userId: string, ahora: Date): Promise<void> {
  const limite = new Date(ahora.getTime() - VENTANA_CODIGOS_MINUTOS * 60_000);

  await prisma.codigoAcceso
    .deleteMany({ where: { userId, createdAt: { lt: limite } } })
    .catch(() => {});
}

/** El desafio abierto, si lo hay, con por donde salio el codigo. */
export async function desafioAbierto(): Promise<{
  canal: Canal2FA;
  destinoTapado: string;
} | null> {
  const token = (await cookies()).get(COOKIE_DESAFIO)?.value;
  if (!token) return null;

  const desafio = await prisma.codigoAcceso.findUnique({
    where: { tokenHash: hashToken(token) },
    select: { expiresAt: true, destino: true },
  });

  if (!desafio || desafio.expiresAt <= new Date()) return null;

  // El destino se guarda desde que el SMS es posible; un desafio de antes de
  // ese cambio no lo tiene, y entonces solo pudo salir por correo.
  const destino = desafio.destino ?? "";
  const canal: Canal2FA = destino.includes("@") || !destino ? "CORREO" : "SMS";

  return { canal, destinoTapado: enmascararDestino(canal, destino) };
}

export async function olvidarDesafio(): Promise<void> {
  const almacen = await cookies();
  const token = almacen.get(COOKIE_DESAFIO)?.value;

  if (token) {
    await prisma.codigoAcceso
      .deleteMany({ where: { tokenHash: hashToken(token) } })
      .catch(() => {});
  }

  almacen.delete(COOKIE_DESAFIO);
}

export type ResultadoCodigo =
  | { ok: true; userId: string }
  | { ok: false; error: string; volverAlLogin?: boolean };

const CADUCADO = "El codigo caduco o ya no vale. Vuelve a ingresar.";

/**
 * Comprueba el codigo y, si acierta, devuelve de quien es para que quien
 * llama abra la sesion. Este servicio NO crea la sesion: separar «demostrar
 * quien eres» de «entrar» deja un solo sitio donde se abren sesiones.
 */
export async function verificarCodigo(
  entrada: string,
): Promise<ResultadoCodigo> {
  const almacen = await cookies();
  const token = almacen.get(COOKIE_DESAFIO)?.value;

  if (!token) return { ok: false, error: CADUCADO, volverAlLogin: true };

  const desafio = await prisma.codigoAcceso.findUnique({
    where: { tokenHash: hashToken(token) },
    select: {
      id: true,
      userId: true,
      codigoHash: true,
      intentos: true,
      expiresAt: true,
      user: { select: { estado: true } },
    },
  });

  if (!desafio || desafio.expiresAt <= new Date()) {
    await olvidarDesafio();
    return { ok: false, error: CADUCADO, volverAlLogin: true };
  }

  // Que la cuenta siga activa se mira AQUI y no solo al teclear la clave:
  // entre un paso y otro un administrador puede haberla desactivado.
  if (desafio.user.estado !== "ACTIVO") {
    await olvidarDesafio();
    return { ok: false, error: CADUCADO, volverAlLogin: true };
  }

  if (!codigoAcierta(desafio.codigoHash, entrada)) {
    const intentos = desafio.intentos + 1;

    if (intentos >= MAX_INTENTOS_CODIGO) {
      await olvidarDesafio();
      return {
        ok: false,
        error:
          "Demasiados intentos fallidos. Vuelve a ingresar para pedir otro codigo.",
        volverAlLogin: true,
      };
    }

    await prisma.codigoAcceso.update({
      where: { id: desafio.id },
      data: { intentos },
    });

    const quedan = MAX_INTENTOS_CODIGO - intentos;
    return {
      ok: false,
      error: `Codigo incorrecto. Te quedan ${quedan} intento(s).`,
    };
  }

  // Acertado: el desafio se gasta aqui mismo, para que el mismo codigo no
  // sirva dos veces.
  await olvidarDesafio();

  return { ok: true, userId: desafio.userId };
}

/**
 * Compara el codigo tecleado con el guardado, en tiempo constante.
 *
 * Comparar con `===` tarda mas cuantas mas cifras coinciden desde el
 * principio, y ese tiempo es una pista que permite ir adivinando el codigo
 * cifra a cifra.
 */
function codigoAcierta(codigoHash: string, entrada: string): boolean {
  const esperado = Buffer.from(codigoHash, "hex");
  const recibido = Buffer.from(hashToken(normalizarCodigo(entrada)), "hex");

  return (
    esperado.length === recibido.length && timingSafeEqual(esperado, recibido)
  );
}

// ---------------------------------------------------------------------------
// El otro ciclo: comprobar que un celular es de quien dice
// ---------------------------------------------------------------------------

export type ResultadoVerificacion =
  | { ok: true }
  | { ok: false; error: string };

/**
 * Manda un codigo al celular para comprobar que existe y que es suyo.
 *
 * Sin cookie: quien esta aqui ya tiene sesion, asi que el desafio se ata a su
 * `userId`. Y solo por SMS —nunca por correo—: mandarlo al buzon no probaria
 * nada del telefono, que es justo lo que hay que probar.
 */
export async function pedirCodigoCelular(
  userId: string,
  companyId: string,
  celular: string,
): Promise<ResultadoVerificacion> {
  const ahora = new Date();
  const desde = new Date(ahora.getTime() - VENTANA_CODIGOS_MINUTOS * 60_000);

  const recientes = await prisma.codigoAcceso.count({
    where: {
      userId,
      proposito: "VERIFICAR_CELULAR",
      createdAt: { gt: desde },
    },
  });
  if (recientes >= MAX_CODIGOS_POR_VENTANA) {
    return {
      ok: false,
      error: `Pediste varios códigos seguidos. Espera unos minutos y vuelve a intentarlo.`,
    };
  }

  await prisma.codigoAcceso.deleteMany({
    where: { userId, proposito: "VERIFICAR_CELULAR", createdAt: { lt: desde } },
  });
  await prisma.codigoAcceso.updateMany({
    where: {
      userId,
      proposito: "VERIFICAR_CELULAR",
      expiresAt: { gt: ahora },
    },
    data: { expiresAt: ahora },
  });

  const codigo = generateNumericCode(LONGITUD_CODIGO);

  await prisma.codigoAcceso.create({
    data: {
      userId,
      proposito: "VERIFICAR_CELULAR",
      destino: celular,
      // Sin cookie, sin token: el desafio es de este usuario y de este numero.
      tokenHash: null,
      codigoHash: hashToken(codigo),
      expiresAt: new Date(ahora.getTime() + VIGENCIA_CODIGO_MINUTOS * 60_000),
    },
  });

  const sms = await enviarSms(
    companyId,
    celular,
    textoCodigoAcceso(codigo, VIGENCIA_CODIGO_MINUTOS),
  );

  if (!sms.enviado) {
    return {
      ok: false,
      error:
        "No se pudo enviar el SMS. Revisa el número, o inténtalo más tarde.",
    };
  }

  return { ok: true };
}

/**
 * Comprueba el codigo que se mando a ese celular.
 *
 * El numero entra como argumento y se compara con el `destino` guardado: si
 * la persona cambio el celular despues de pedir el codigo, el que tiene en la
 * mano ya no vale. Si no se comprobara, bastaria pedir el codigo a un numero
 * propio y cambiar el campo antes de teclearlo para dar por verificado un
 * telefono ajeno.
 */
export async function comprobarCodigoCelular(
  userId: string,
  celular: string,
  entrada: string,
): Promise<ResultadoVerificacion> {
  const desafio = await prisma.codigoAcceso.findFirst({
    where: {
      userId,
      proposito: "VERIFICAR_CELULAR",
      destino: celular,
      expiresAt: { gt: new Date() },
    },
    orderBy: { createdAt: "desc" },
    select: { id: true, codigoHash: true, intentos: true },
  });

  if (!desafio) {
    return {
      ok: false,
      error: "El código caducó o ya no vale. Pide uno nuevo.",
    };
  }

  if (!codigoAcierta(desafio.codigoHash, entrada)) {
    const intentos = desafio.intentos + 1;

    if (intentos >= MAX_INTENTOS_CODIGO) {
      await prisma.codigoAcceso.delete({ where: { id: desafio.id } });
      return {
        ok: false,
        error: "Demasiados intentos fallidos. Pide un código nuevo.",
      };
    }

    await prisma.codigoAcceso.update({
      where: { id: desafio.id },
      data: { intentos },
    });

    const quedan = MAX_INTENTOS_CODIGO - intentos;
    return { ok: false, error: `Código incorrecto. Te quedan ${quedan} intento(s).` };
  }

  // Se gasta: el mismo codigo no verifica dos veces.
  await prisma.codigoAcceso.delete({ where: { id: desafio.id } });

  return { ok: true };
}
