import "server-only";
import { timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { generateToken, hashToken, generateNumericCode } from "@/lib/tokens";
import {
  LONGITUD_CODIGO,
  VIGENCIA_CODIGO_MINUTOS,
  MAX_INTENTOS_CODIGO,
  normalizarCodigo,
} from "@/lib/dosFactores";
import { enviarCorreo, correoCodigoAcceso } from "@/services/mailer.service";

/**
 * Verificacion en dos pasos por codigo al correo.
 *
 * El desafio vive entre acertar la clave y terminar de entrar. Quien lo tiene
 * abierto NO esta autenticado: no hay sesion, no hay cookie de sesion y no
 * puede tocar nada. Solo puede gastar sus cinco intentos.
 *
 * La cookie guarda un token opaco, no el identificador del usuario. Si
 * guardara el usuario, cualquiera podria escribir el de otro y ponerse a
 * probar seis cifras contra la cuenta que quisiera.
 */

const COOKIE_DESAFIO = "gcm_2fa";

export async function crearDesafio(usuario: {
  id: string;
  nombres: string;
  email: string;
}): Promise<void> {
  // Un desafio a la vez. Si no, cada intento de entrar dejaria otro codigo
  // vivo y valdrian todos: cinco intentos por codigo se multiplicarian.
  await prisma.codigoAcceso.deleteMany({ where: { userId: usuario.id } });

  const token = generateToken();
  const codigo = generateNumericCode(LONGITUD_CODIGO);

  await prisma.codigoAcceso.create({
    data: {
      userId: usuario.id,
      tokenHash: hashToken(token),
      codigoHash: hashToken(codigo),
      expiresAt: new Date(Date.now() + VIGENCIA_CODIGO_MINUTOS * 60_000),
    },
  });

  const almacen = await cookies();
  almacen.set(COOKIE_DESAFIO, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: VIGENCIA_CODIGO_MINUTOS * 60,
  });

  await enviarCorreo({
    para: usuario.email,
    ...correoCodigoAcceso({
      nombre: usuario.nombres,
      codigo,
      minutos: VIGENCIA_CODIGO_MINUTOS,
    }),
  });
}

/** Hay un desafio abierto y todavia sirve. Decide si se pinta la pantalla. */
export async function hayDesafioAbierto(): Promise<boolean> {
  const token = (await cookies()).get(COOKIE_DESAFIO)?.value;
  if (!token) return false;

  const desafio = await prisma.codigoAcceso.findUnique({
    where: { tokenHash: hashToken(token) },
    select: { expiresAt: true },
  });

  return Boolean(desafio && desafio.expiresAt > new Date());
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

  const esperado = Buffer.from(desafio.codigoHash, "hex");
  const recibido = Buffer.from(hashToken(normalizarCodigo(entrada)), "hex");

  // Se comparan los hashes en tiempo constante. Comparar con `===` tarda mas
  // cuantas mas cifras coinciden desde el principio, y ese tiempo es una
  // pista que permite ir adivinando el codigo cifra a cifra.
  const acierta =
    esperado.length === recibido.length && timingSafeEqual(esperado, recibido);

  if (!acierta) {
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
