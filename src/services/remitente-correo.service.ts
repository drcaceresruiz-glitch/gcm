import "server-only";
import nodemailer, { type Transporter } from "nodemailer";

import { prisma } from "@/lib/prisma";
import { puede } from "@/lib/rbac";
import { cifrar, descifrar, hayLlaveDeCifrado } from "@/lib/secreto";
import {
  cabeceraRemitente,
  validarRemitente,
  type DatosRemitente,
} from "@/lib/remitente-correo";
import type { SesionActiva } from "@/services/sesion.service";

/**
 * El buzon propio de cada constructora: desde donde sale su correo.
 *
 * Sin fila aqui, el correo de esa empresa sale por el buzon compartido de la
 * instalacion y todo sigue como estaba. Con fila activa, sale del suyo.
 *
 * TRES REGLAS QUE SE HACEN CUMPLIR AQUI Y EN NINGUN OTRO SITIO:
 *
 * - **La contrasena no vuelve nunca a la pantalla.** `leerRemitente` no la
 *   devuelve ni cifrada: solo dice si la hay. Una contrasena que viaja de
 *   vuelta acaba en el HTML de un formulario y en el historial del navegador.
 * - **Sin llave de cifrado no se guarda nada.** Ver `lib/secreto`: el fallo
 *   seguro es no poder configurar el buzon propio, jamas guardarlo en claro.
 * - **Configurado no es lo mismo que funciona.** Por eso hay `verificadoAt` y
 *   un boton de probar: si no, el primer correo que falla es el que iba al
 *   cliente, y nadie se entera hasta que el cliente lo dice.
 *
 * Este servicio NO importa `mailer.service`, y es a proposito: el mailer si
 * importa de aqui `configuracionDeEnvio` y `crearTransporte`. La flecha va en
 * un solo sentido para que no haya ciclo entre los dos.
 */

function quien(sesion: SesionActiva): string {
  return `${sesion.nombres} ${sesion.apellidos}`.trim().slice(0, 150);
}

// ---------------------------------------------------------------------------
// Lo que usa el mailer
// ---------------------------------------------------------------------------

export interface ConfiguracionEnvio {
  host: string;
  puerto: number;
  seguro: boolean;
  usuario: string;
  clave: string;
  /// Ya montado como cabecera: «"NOMBRE" <correo>».
  desde: string;
}

/**
 * El buzon propio de una empresa, listo para enviar. null = usa el compartido.
 *
 * Devuelve null en cuatro casos que significan lo mismo para quien envia —no
 * hay buzon propio utilizable— y por eso no se distinguen: no hay fila, esta
 * apagada, no hay llave de cifrado, o la clave guardada no descifra (llave
 * rotada o fila manipulada). En los cuatro, el correo sale igual por el buzon
 * compartido en vez de no salir.
 */
export async function configuracionDeEnvio(
  companyId: string,
): Promise<ConfiguracionEnvio | null> {
  if (!hayLlaveDeCifrado()) return null;

  const fila = await prisma.remitenteCorreo.findFirst({
    where: { companyId, activo: true },
    select: {
      host: true,
      puerto: true,
      seguro: true,
      usuario: true,
      claveCifrada: true,
      remitenteNombre: true,
      remitenteCorreo: true,
    },
  });
  if (!fila) return null;

  const clave = descifrar(fila.claveCifrada);
  if (clave === null) return null;

  return {
    host: fila.host,
    puerto: fila.puerto,
    seguro: fila.seguro,
    usuario: fila.usuario,
    clave,
    desde: cabeceraRemitente(fila.remitenteNombre, fila.remitenteCorreo),
  };
}

/**
 * Si GCM recoge en esta empresa las respuestas de los contratistas.
 *
 * DECIDE A DONDE VUELVE LA RESPUESTA, y por eso no es solo informativo. Un
 * mensaje a un contratista lleva «Responder a» con el correo de quien escribe;
 * mientras GCM no lea el buzon, quitarlo mandaria la respuesta a un buzon que
 * no mira nadie, que es peor que hoy. Con esto encendido pasa lo contrario:
 * hay que dejar que vuelva al buzon de la empresa, porque es el unico que GCM
 * puede abrir.
 *
 * Va atado a `activo` a proposito. La bandera vive en la fila del remitente,
 * asi que una empresa sin buzon propio no puede tenerla encendida: sale por el
 * buzon compartido de la instalacion, y ese no es suyo ni GCM lo va a leer en
 * su nombre.
 */
export async function empresaLeeRespuestas(companyId: string): Promise<boolean> {
  const fila = await prisma.remitenteCorreo.findFirst({
    where: { companyId, activo: true, leerRespuestas: true },
    select: { companyId: true },
  });
  return fila !== null;
}

/** Un transporte para una configuracion concreta. Lo usan el mailer y el probador. */
export function crearTransporte(config: ConfiguracionEnvio): Transporter {
  return nodemailer.createTransport({
    host: config.host,
    port: config.puerto,
    secure: config.seguro,
    auth: { user: config.usuario, pass: config.clave },
  });
}

// ---------------------------------------------------------------------------
// Lo que usa la pantalla
// ---------------------------------------------------------------------------

export interface RemitenteEnPantalla {
  host: string;
  puerto: number;
  usuario: string;
  remitenteNombre: string;
  remitenteCorreo: string;
  activo: boolean;
  /// Si GCM recoge las respuestas de los contratistas de este buzon.
  leerRespuestas: boolean;
  /// Nunca la clave. Solo si hay una guardada, para que el formulario pueda
  /// decir «déjalo vacío para conservarla».
  hayClave: boolean;
  verificadoAt: Date | null;
  ultimoError: string | null;
  ultimoErrorAt: Date | null;
  /// La ultima lectura del buzon que salio bien. Se mueve solo cuando la
  /// pasada termina entera, asi que «hace 4 minutos» significa que la recogida
  /// esta viva de verdad, no que este encendida.
  leidoHastaAt: Date | null;
  /// Por que fallo la ultima lectura. Aparte del error del envio: son dos
  /// caminos distintos y uno puede estar roto con el otro perfecto.
  lecturaError: string | null;
  lecturaErrorAt: Date | null;
}

export async function leerRemitente(
  sesion: SesionActiva,
): Promise<RemitenteEnPantalla | null> {
  // El MISMO permiso que gobierna la pantalla de configuracion y los emisores
  // de SMS. Leer esta configuracion es ya un acto de administracion: dice a
  // que servidor y con que usuario se conecta la empresa.
  if (!puede(sesion, "configuracion:editar")) return null;

  const fila = await prisma.remitenteCorreo.findUnique({
    where: { companyId: sesion.companyId },
    select: {
      host: true,
      puerto: true,
      usuario: true,
      remitenteNombre: true,
      remitenteCorreo: true,
      activo: true,
      leerRespuestas: true,
      claveCifrada: true,
      verificadoAt: true,
      ultimoError: true,
      ultimoErrorAt: true,
      leidoHastaAt: true,
      lecturaError: true,
      lecturaErrorAt: true,
    },
  });
  if (!fila) return null;

  const { claveCifrada, ...resto } = fila;
  return { ...resto, hayClave: claveCifrada.length > 0 };
}

export type ResultadoRemitente = { ok: true } | { ok: false; error: string };

/**
 * Guarda (o actualiza) el buzon propio de la empresa.
 *
 * La clave vacia al editar significa «conserva la que ya estaba»: obligar a
 * reescribirla en cada cambio de puerto llevaria a tenerla apuntada en algun
 * sitio para poder copiarla, que es peor que cualquier cosa que pase aqui.
 *
 * Cambiar cualquier dato borra `verificadoAt`: lo que se probo era la
 * configuracion anterior, y dejar la marca puesta diria que funciona algo que
 * nadie ha probado.
 */
export async function guardarRemitente(
  sesion: SesionActiva,
  datos: DatosRemitente,
): Promise<ResultadoRemitente> {
  if (!puede(sesion, "configuracion:editar")) {
    return { ok: false, error: "No tienes permiso para configurar el correo de la empresa." };
  }

  if (!hayLlaveDeCifrado()) {
    return {
      ok: false,
      error:
        "Esta instalación no tiene configurada la clave de cifrado, así que no se puede guardar la contraseña de un buzón. Habla con quien administra el servidor.",
    };
  }

  const existente = await prisma.remitenteCorreo.findUnique({
    where: { companyId: sesion.companyId },
    select: { id: true, claveCifrada: true },
  });

  const v = validarRemitente(datos, existente === null);
  if (!v.ok) return { ok: false, error: v.error };

  // Clave vacia al editar = se conserva la guardada.
  const claveCifrada =
    v.datos.clave.length > 0 ? cifrar(v.datos.clave) : existente!.claveCifrada;
  if (claveCifrada === null) {
    return { ok: false, error: "No se pudo cifrar la contraseña. Revisa la configuración del servidor." };
  }

  const comun = {
    host: v.datos.host,
    puerto: v.datos.puerto,
    seguro: v.datos.seguro,
    usuario: v.datos.usuario,
    claveCifrada,
    remitenteNombre: v.datos.remitenteNombre,
    remitenteCorreo: v.datos.remitenteCorreo,
    // Lo probado era la configuracion vieja.
    verificadoAt: null,
    ultimoError: null,
    ultimoErrorAt: null,
  };

  const fila = await prisma.remitenteCorreo.upsert({
    where: { companyId: sesion.companyId },
    create: {
      ...comun,
      companyId: sesion.companyId,
      configuradoPor: quien(sesion),
    },
    update: comun,
    select: { id: true },
  });

  await prisma.auditLog.create({
    data: {
      companyId: sesion.companyId,
      userId: sesion.userId,
      entidad: "RemitenteCorreo",
      entidadId: fila.id,
      accion: existente ? "UPDATE" : "CREATE",
      // La contrasena NUNCA se audita, igual que no se auditan las claves.
      despues: {
        host: v.datos.host,
        puerto: v.datos.puerto,
        usuario: v.datos.usuario,
        remitenteCorreo: v.datos.remitenteCorreo,
        claveCambiada: v.datos.clave.length > 0,
      },
    },
  });

  return { ok: true };
}

/** Enciende o apaga el buzon propio sin perder lo tecleado. */
export async function cambiarEstadoRemitente(
  sesion: SesionActiva,
  activo: boolean,
): Promise<ResultadoRemitente> {
  if (!puede(sesion, "configuracion:editar")) {
    return { ok: false, error: "No tienes permiso para configurar el correo de la empresa." };
  }

  const { count } = await prisma.remitenteCorreo.updateMany({
    where: { companyId: sesion.companyId },
    data: { activo },
  });
  if (count === 0) return { ok: false, error: "No hay ningún buzón configurado." };

  await prisma.auditLog.create({
    data: {
      companyId: sesion.companyId,
      userId: sesion.userId,
      entidad: "RemitenteCorreo",
      entidadId: sesion.companyId,
      accion: "UPDATE",
      despues: { evento: activo ? "activar" : "desactivar" },
    },
  });

  return { ok: true };
}

/**
 * Enciende o apaga que GCM RECOJA las respuestas de los contratistas.
 *
 * Separado de `cambiarEstadoRemitente` a proposito, aunque toque la misma
 * fila. Configurar el envio y consentir que GCM abra el buzon son dos permisos
 * morales distintos aunque sea la misma contrasena: uno dice «manda en mi
 * nombre» y el otro «lee mi correo». Encadenarlos habria hecho que activar el
 * envio activase la lectura sin que nadie lo pidiera.
 */
export async function cambiarLecturaRespuestas(
  sesion: SesionActiva,
  leer: boolean,
): Promise<ResultadoRemitente> {
  if (!puede(sesion, "configuracion:editar")) {
    return { ok: false, error: "No tienes permiso para configurar el correo de la empresa." };
  }

  const { count } = await prisma.remitenteCorreo.updateMany({
    where: { companyId: sesion.companyId },
    data: {
      leerRespuestas: leer,
      // Al ENCENDER se borra la marca de hasta donde se leyo, para que la
      // primera pasada mire los ultimos dias en vez de arrancar desde una
      // fecha vieja de un encendido anterior. Al apagar no se toca: si se
      // vuelve a encender manana, no hay por que releer una semana entera.
      // Y con ella el fallo de lectura anterior: acusar de un error de hace
      // un mes a una recogida que acaba de empezar es contar algo que ya no
      // ha pasado. Si sigue roto, la primera pasada lo vuelve a apuntar.
      ...(leer ? { leidoHastaAt: null, lecturaError: null, lecturaErrorAt: null } : {}),
    },
  });
  if (count === 0) return { ok: false, error: "No hay ningún buzón configurado." };

  await prisma.auditLog.create({
    data: {
      companyId: sesion.companyId,
      userId: sesion.userId,
      entidad: "RemitenteCorreo",
      entidadId: sesion.companyId,
      accion: "UPDATE",
      // Queda en el libro de la empresa: que alguien autorizara a leer el
      // buzon es exactamente lo que un administrador querra poder consultar.
      despues: { evento: leer ? "leer-respuestas" : "dejar-de-leer-respuestas" },
    },
  });

  return { ok: true };
}

/**
 * Prueba el buzon de verdad: conecta, autentica y manda un correo.
 *
 * Se manda A QUIEN LO PRUEBA, a su propia direccion, y no a una de ejemplo:
 * la unica forma de saber que el correo sale Y llega es verlo llegar. Un
 * `verify()` a secas comprueba la conexion y la clave, pero no que el
 * servidor acepte ese remitente, que es justo lo que mas rechazan.
 *
 * El resultado se guarda en la fila. Asi la pantalla puede distinguir
 * «configurado» de «configurado y probado», y si falla enseña lo que dijo el
 * servidor en vez de pedir que se adivine.
 */
export async function probarRemitente(
  sesion: SesionActiva,
): Promise<ResultadoRemitente> {
  if (!puede(sesion, "configuracion:editar")) {
    return { ok: false, error: "No tienes permiso para configurar el correo de la empresa." };
  }

  const config = await configuracionDeEnvio(sesion.companyId);
  if (!config) {
    return {
      ok: false,
      error:
        "No hay un buzón propio activo que probar. Guárdalo y actívalo primero.",
    };
  }

  try {
    const t = crearTransporte(config);
    await t.verify();
    await t.sendMail({
      from: config.desde,
      to: sesion.email,
      subject: "Prueba del buzón de correo — GCM",
      text:
        "Este correo confirma que GCM puede enviar desde el buzón de tu constructora.\n\n" +
        "Si te ha llegado, el informe semanal y los avisos saldrán desde esta misma dirección.",
    });

    await prisma.remitenteCorreo.update({
      where: { companyId: sesion.companyId },
      data: { verificadoAt: new Date(), ultimoError: null, ultimoErrorAt: null },
    });

    return { ok: true };
  } catch (error) {
    /**
     * Lo que dijo el servidor, recortado y SIN la contrasena.
     *
     * nodemailer no la incluye en el mensaje, pero se recorta igual: un error
     * de un servidor ajeno es texto que no controlamos y acaba pintado en
     * pantalla y guardado en la base.
     */
    const mensaje = (error instanceof Error ? error.message : String(error))
      .replace(config.clave, "***")
      .slice(0, 300);

    await prisma.remitenteCorreo.update({
      where: { companyId: sesion.companyId },
      data: { verificadoAt: null, ultimoError: mensaje, ultimoErrorAt: new Date() },
    });

    return { ok: false, error: `El servidor rechazó el envío: ${mensaje}` };
  }
}
