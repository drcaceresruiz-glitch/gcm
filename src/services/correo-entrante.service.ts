import "server-only";

import { ImapFlow } from "imapflow";

import { prisma } from "@/lib/prisma";
import { descifrar, hayLlaveDeCifrado } from "@/lib/secreto";
import { normalizarEmail } from "@/lib/contacto";
import {
  cuerpoEntrante,
  decidirEmparejado,
  tokensEnCabeceras,
  type Emparejado,
} from "@/lib/correo-entrante";

/**
 * Recoger las respuestas de los contratistas y ponerlas en su obra.
 *
 * GCM NO ES UN CLIENTE DE CORREO, y esta distincion gobierna todo el modulo:
 * se mira el buzon de la constructora, se reconoce lo que responde a un
 * mensaje que GCM envio, y **todo lo demas se ignora**. Un correo que no se
 * empareja no se guarda, no se marca y no se toca: sigue en el buzon para que
 * lo lea una persona, que es de quien es.
 *
 * EL BUZON SE ABRE EN SOLO LECTURA. No es un detalle: es de la constructora y
 * lo usa gente, asi que GCM no puede marcarle correos como leidos ni moverlos
 * ni borrarlos. Con `readOnly` el servidor rechaza cualquier cambio de estado,
 * de modo que la promesa no depende de que este codigo se porte bien.
 *
 * Y COMO NO SE MARCA NADA, la misma pasada vuelve a ver los mismos correos.
 * Lo que impide duplicarlos es el indice unico
 * `(companyId, messageIdEntrante)`, no la memoria de lo ya visto: es la misma
 * doctrina de `EnvioAviso`, donde la clave se reserva y no se confia en un
 * contador.
 */

/// Su propia clave en `RelojTarea`, separada de la de los avisos: son dos
/// tareas con ritmos y fallos distintos, y compartir cursor haria que un IMAP
/// caido arrastrase al recordatorio de restricciones.
const CLAVE = "correo-entrante";

/// Presupuesto de la pasada. Mas corto que el de los avisos porque va DESPUES
/// de ellos dentro de la misma peticion: lo que aqui se pase de largo se lo
/// come al conjunto, y quien corta es LiteSpeed.
const PRESUPUESTO_MS = 15_000;

/// Una pasada que lleva mas de esto sin cerrar se da por muerta. Sin esto, un
/// proceso que revienta a mitad bloquea la lectura para siempre.
const PASADA_MUERTA_MS = PRESUPUESTO_MS * 3;

/// Empresas por pasada. Igual que `MAX_OBRAS_POR_PASADA`: se recorren por
/// turnos con un cursor circular, nunca todas de golpe.
const MAX_EMPRESAS_POR_PASADA = 3;

/// Correos que se miran de un buzon en una pasada. Un buzon con mil correos
/// sin leer no puede consumir la pasada entera.
const MAX_CORREOS_POR_BUZON = 40;

/// Cuanto se retrocede la primera vez, y de margen sobre `leidoHastaAt`.
/// IMAP busca por DIA, no por hora, y el reloj del servidor de correo no tiene
/// por que coincidir con el nuestro: sin margen, un correo de la frontera se
/// pierde y no vuelve nunca.
const DIAS_ATRAS = 7;
const DIAS_MARGEN = 1;

/// El puerto de IMAP sobre TLS. Es el de cPanel y el de casi todos; si algun
/// proveedor lo tuviera distinto, tendria su propio campo. Ponerlo
/// configurable hoy seria inventarse un problema que nadie ha tenido.
const PUERTO_IMAP = 993;

export interface ResumenCorreoEntrante {
  ok: boolean;
  /// Buzones mirados en esta pasada.
  buzones: number;
  /// Respuestas guardadas.
  respuestas: number;
  /// Correos que se miraron y no se emparejaron con nada. Es la cifra que
  /// dice si el emparejado funciona sin tener que ponerse a leer buzones.
  ignorados: number;
  siguiente: string | null;
  cortadaPorTiempo: boolean;
  solapada?: boolean;
  error?: string;
}

const NADA: ResumenCorreoEntrante = {
  ok: true,
  buzones: 0,
  respuestas: 0,
  ignorados: 0,
  siguiente: null,
  cortadaPorTiempo: false,
};

interface BuzonALeer {
  companyId: string;
  host: string;
  usuario: string;
  clave: string;
  desde: Date;
}

/**
 * Los buzones que hay que mirar, ya descifrados.
 *
 * Sin llave de cifrado no se mira ninguno: la clave del buzon esta guardada
 * cifrada y sin `CORREO_CLAVE_CIFRADO` no hay forma de abrirla. Se calla en
 * vez de fallar, igual que hace el envio: es una configuracion que falta, no
 * un error de nadie.
 */
async function buzonesPendientes(
  ahora: Date,
  cursor: string | null,
): Promise<{ lote: BuzonALeer[]; siguiente: string | null }> {
  if (!hayLlaveDeCifrado()) return { lote: [], siguiente: cursor };

  const filas = await prisma.remitenteCorreo.findMany({
    where: { activo: true, leerRespuestas: true },
    orderBy: { companyId: "asc" },
    select: {
      companyId: true,
      host: true,
      usuario: true,
      claveCifrada: true,
      leidoHastaAt: true,
    },
  });

  // Cursor circular sobre las empresas, igual que el de las obras: se sigue
  // por donde se quedo y se da la vuelta al llegar al final.
  const despues = cursor ? filas.filter((f) => f.companyId > cursor) : filas;
  const orden = despues.length > 0 ? despues : filas;
  const trozo = orden.slice(0, MAX_EMPRESAS_POR_PASADA);

  const lote: BuzonALeer[] = [];
  for (const fila of trozo) {
    const clave = descifrar(fila.claveCifrada);
    // Clave ilegible —llave rotada, o fila manipulada—: se salta este buzon y
    // se sigue con los demas. Una empresa mal configurada no puede dejar sin
    // respuestas a las otras.
    if (clave === null) continue;

    const desde = fila.leidoHastaAt
      ? new Date(fila.leidoHastaAt.getTime() - DIAS_MARGEN * 86_400_000)
      : new Date(ahora.getTime() - DIAS_ATRAS * 86_400_000);

    lote.push({
      companyId: fila.companyId,
      host: fila.host,
      usuario: fila.usuario,
      clave,
      desde,
    });
  }

  return { lote, siguiente: trozo.at(-1)?.companyId ?? null };
}

/** Una rama del arbol MIME, con lo justo que hace falta para recorrerlo. */
interface Rama {
  part?: string;
  type?: string;
  childNodes?: Rama[];
}

/**
 * El identificador de la primera parte en texto plano.
 *
 * Se prefiere `text/plain` y no el HTML a proposito: lo que se guarda es lo
 * que escribio la persona, y el HTML de un cliente de correo trae encima
 * hojas de estilo y tablas de maquetacion que ni se ensenan ni se buscan.
 * Un correo que SOLO trae HTML se queda sin cuerpo, y se dice en la fila.
 */
function parteDeTexto(raiz: Rama | undefined): string | null {
  if (!raiz) return null;
  if (raiz.type === "text/plain") return raiz.part ?? "1";

  for (const hija of raiz.childNodes ?? []) {
    const encontrada = parteDeTexto(hija);
    if (encontrada) return encontrada;
  }
  return null;
}

/** Un flujo a texto, respetando el juego de caracteres que declare el correo. */
async function aTexto(
  contenido: NodeJS.ReadableStream,
  charset: string | undefined,
): Promise<string> {
  const trozos: Buffer[] = [];
  for await (const t of contenido) {
    trozos.push(typeof t === "string" ? Buffer.from(t) : t);
  }
  const bytes = Buffer.concat(trozos);

  // `latin1` y compania aparecen todavia en clientes viejos, que en obra los
  // hay. Un juego desconocido no puede tumbar la pasada: se cae a utf-8 y en
  // el peor caso se ven mal unas tildes.
  try {
    return new TextDecoder(charset || "utf-8").decode(bytes);
  } catch {
    return bytes.toString("utf8");
  }
}

/**
 * Bajar el texto de una parte de un correo.
 *
 * Lo unico que el guardado necesita del servidor de correo, y por eso se pasa
 * como funcion en vez del cliente entero: deja explicito que de IMAP aqui solo
 * se usa esto, y permite probar el emparejado y la idempotencia sin levantar
 * un buzon.
 */
type BajarTexto = (uid: number, parte: string) => Promise<string>;

/** La descarga de verdad, contra el cliente IMAP ya conectado. */
function bajarTexto(cliente: ImapFlow): BajarTexto {
  return async (uid, parte) => {
    const descarga = await cliente.download(String(uid), parte, { uid: true });
    return aTexto(descarga.content, descarga.meta?.charset);
  };
}

/** Lo que se saca de un correo antes de decidir si es nuestro. */
interface Candidato {
  uid: number;
  messageId: string;
  remitente: string | null;
  asunto: string | null;
  fecha: Date;
  tokens: string[];
  parteTexto: string | null;
}

/**
 * Mira un buzon y guarda lo que resulte ser respuesta a un mensaje de GCM.
 *
 * DOS FASES, y el orden importa por privacidad tanto como por velocidad:
 *
 * 1. Se leen solo CABECERAS de los correos recientes: quien escribe, cuando,
 *    y a que mensaje responde.
 * 2. Se decide cuales son nuestros, y **solo de esos se descarga el cuerpo**.
 *
 * Asi GCM no llega a leer el correo privado de la constructora ni por
 * accidente: de lo que no es una respuesta a un mensaje suyo, nunca baja el
 * texto.
 */
async function leerBuzon(
  buzon: BuzonALeer,
): Promise<{ respuestas: number; ignorados: number }> {
  const cliente = new ImapFlow({
    host: buzon.host,
    port: PUERTO_IMAP,
    secure: true,
    auth: { user: buzon.usuario, pass: buzon.clave },
    // Sin esto imapflow escribe el dialogo IMAP entero en la consola, con las
    // cabeceras de correos que no son nuestros.
    logger: false,
  });

  let respuestas = 0;
  let ignorados = 0;

  await cliente.connect();
  try {
    // SOLO LECTURA: el servidor rechaza cualquier cambio de estado, asi que
    // GCM no puede marcar como leido ni mover ni borrar nada aunque quisiera.
    const cerrojo = await cliente.getMailboxLock("INBOX", { readOnly: true });
    try {
      const uids = await cliente.search({ since: buzon.desde }, { uid: true });
      if (!uids || uids.length === 0) return { respuestas, ignorados };

      // Los mas nuevos primero: si un buzon trae mas de lo que cabe en una
      // pasada, lo que se queda para la siguiente es lo viejo.
      const recientes = uids.slice(-MAX_CORREOS_POR_BUZON);

      const candidatos: Candidato[] = [];
      for await (const mensaje of cliente.fetch(
        recientes,
        { envelope: true, bodyStructure: true, headers: ["references"] },
        { uid: true },
      )) {
        const referencias = mensaje.headers?.toString("utf8") ?? "";
        const messageId = mensaje.envelope?.messageId;
        // Sin `Message-ID` no hay como no duplicarlo: se ignora. Es rarisimo
        // —lo pone el servidor que envia— y guardarlo sin clave de
        // idempotencia lo duplicaria en cada pasada, para siempre.
        if (!messageId) {
          ignorados += 1;
          continue;
        }

        candidatos.push({
          uid: mensaje.uid,
          messageId,
          remitente: mensaje.envelope?.from?.[0]?.address ?? null,
          asunto: mensaje.envelope?.subject ?? null,
          fecha: mensaje.envelope?.date ?? new Date(),
          tokens: tokensEnCabeceras(mensaje.envelope?.inReplyTo, referencias),
          parteTexto: parteDeTexto(mensaje.bodyStructure as Rama | undefined),
        });
      }

      const r = await emparejarYGuardar(buzon, bajarTexto(cliente), candidatos);
      respuestas += r.respuestas;
      ignorados += r.ignorados;
    } finally {
      cerrojo.release();
    }
  } finally {
    // `logout` cierra limpio; si el servidor ya corto, no se puede dejar la
    // conexion colgada o la siguiente pasada encuentra el buzon ocupado.
    await cliente.logout().catch(() => cliente.close());
  }

  return { respuestas, ignorados };
}

/** El mensaje saliente al que responde un token, con lo que hace falta luego. */
interface Hilo {
  id: string;
  proveedorId: string;
  projectId: string | null;
  userId: string | null;
}

/**
 * Exportada PARA PODER PROBARLA. Es donde vive la idempotencia —que releer el
 * buzon no duplique una respuesta— y eso no se puede comprobar de verdad
 * desde fuera sin levantar un servidor de correo.
 */
export async function emparejarYGuardar(
  buzon: BuzonALeer,
  bajar: BajarTexto,
  candidatos: readonly Candidato[],
): Promise<{ respuestas: number; ignorados: number }> {
  let respuestas = 0;
  let ignorados = 0;
  if (candidatos.length === 0) return { respuestas, ignorados };

  // Los tokens de TODOS los candidatos en una sola consulta, y acotada a esta
  // empresa: un token de otra constructora no puede emparejar aqui ni aunque
  // el correo lo cite.
  const tokens = [...new Set(candidatos.flatMap((c) => c.tokens))];
  const salientes = tokens.length
    ? await prisma.mensajeContratista.findMany({
        where: { companyId: buzon.companyId, token: { in: tokens } },
        select: { id: true, token: true, proveedorId: true, projectId: true, userId: true },
      })
    : [];
  const hilos = new Map<string, string>(
    salientes.flatMap((s) => (s.token ? [[s.token, s.id] as [string, string]] : [])),
  );
  const porId = new Map<string, Hilo>(salientes.map((s) => [s.id, s]));

  // Y los contratistas por correo, para los que no traen hilo.
  const remitentes = [...new Set(
    candidatos.flatMap((c) => {
      const limpio = c.remitente ? normalizarEmail(c.remitente) : null;
      return limpio ? [limpio] : [];
    }),
  )];
  const proveedores = remitentes.length
    ? await prisma.proveedor.findMany({
        where: { companyId: buzon.companyId, email: { in: remitentes } },
        select: { id: true, email: true },
      })
    : [];
  const contratistasPorCorreo = new Map<string, string[]>();
  for (const p of proveedores) {
    const clave = p.email ? normalizarEmail(p.email) : null;
    if (!clave) continue;
    contratistasPorCorreo.set(clave, [...(contratistasPorCorreo.get(clave) ?? []), p.id]);
  }

  for (const candidato of candidatos) {
    const decision: Emparejado = decidirEmparejado({
      tokens: candidato.tokens,
      remitente: candidato.remitente,
      hilos,
      contratistasPorCorreo,
    });

    if (decision.tipo === "ninguno") {
      ignorados += 1;
      continue;
    }

    const guardado = await guardarRespuesta(buzon, bajar, candidato, decision, porId);
    if (guardado) respuestas += 1;
    else ignorados += 1;
  }

  return { respuestas, ignorados };
}

/**
 * Guarda una respuesta, y avisa a quien escribio.
 *
 * Devuelve false cuando no se guardo nada: o ya estaba —lo dice el indice
 * unico— o el correo no traia texto. Las dos cuentan como ignorado, que es lo
 * honesto: en el resumen de la pasada no puede figurar como respuesta nueva
 * algo que no lo es.
 */
async function guardarRespuesta(
  buzon: BuzonALeer,
  bajar: BajarTexto,
  candidato: Candidato,
  decision: Extract<Emparejado, { tipo: "hilo" } | { tipo: "contratista" }>,
  porId: ReadonlyMap<string, Hilo>,
): Promise<boolean> {
  const hilo = decision.tipo === "hilo" ? porId.get(decision.mensajeId) : null;

  // El cuerpo se baja AQUI, con el emparejado ya decidido: de lo que no es
  // nuestro no se descarga nunca el texto.
  let cuerpo = "";
  if (candidato.parteTexto) {
    try {
      cuerpo = cuerpoEntrante(await bajar(candidato.uid, candidato.parteTexto));
    } catch {
      // Una parte que no se puede bajar no tumba la pasada: se guarda la
      // respuesta sin texto, que sigue siendo el hecho de que contesto.
      cuerpo = "";
    }
  }

  const sinTexto = "[La respuesta llegó sin texto legible. Míralo en el buzón.]";

  try {
    await prisma.mensajeContratista.create({
      data: {
        companyId: buzon.companyId,
        proveedorId: decision.tipo === "hilo" ? hilo!.proveedorId : decision.proveedorId,
        // La obra sale del hilo y NUNCA se adivina. Sin hilo, la respuesta
        // vive en la ficha del contratista: meterla en la obra equivocada se
        // leeria como un compromiso que nadie adquirio.
        projectId: hilo?.projectId ?? null,
        direccion: "ENTRANTE",
        canal: "CORREO",
        destino: buzon.usuario,
        asunto: candidato.asunto?.slice(0, 200) ?? null,
        cuerpo: cuerpo || sinTexto,
        // Llego: no es un intento de envio.
        enviado: true,
        enviadoPor: candidato.remitente ?? "Un contratista",
        enRespuestaA: hilo?.id ?? null,
        messageIdEntrante: candidato.messageId.slice(0, 255),
        createdAt: candidato.fecha,
      },
    });
  } catch {
    // Choque contra `(companyId, messageIdEntrante)`: ya se guardo en una
    // pasada anterior. Es el caso NORMAL —el buzon no se marca— y no un fallo.
    return false;
  }

  // El aviso solo existe si hay obra: `Aviso.projectId` es obligatorio y con
  // clave ajena. Las respuestas sin obra viven en la ficha del contratista y
  // no suenan; lo dice la pantalla, no se tapa.
  if (hilo?.projectId && hilo.userId) {
    await prisma.aviso.create({
      data: {
        companyId: buzon.companyId,
        projectId: hilo.projectId,
        userId: hilo.userId,
        evento: "RESPUESTA_CONTRATISTA",
        titulo: `Respondió ${candidato.remitente ?? "un contratista"}`.slice(0, 200),
        cuerpo: (candidato.asunto ?? cuerpo).slice(0, 400),
        camino: `/obras/${hilo.projectId}/contratistas`,
      },
    });
  }

  return true;
}

/**
 * Una pasada de lectura de buzones.
 *
 * La llama `/api/reloj` DESPUES de los avisos y dentro de su propio
 * `try/catch`: un servidor de correo lento o caido no puede retrasar ni tumbar
 * el recordatorio de restricciones, que es lo que de verdad no puede fallar.
 *
 * No recibe sesion: no la hay. Quien autoriza es el token de la ruta, y por
 * eso cada consulta lleva su `companyId` explicito y no se hereda ninguno.
 */
export async function pasadaDeCorreoEntrante(): Promise<ResumenCorreoEntrante> {
  const inicio = Date.now();
  const ahora = new Date();

  const previa = await prisma.relojTarea.findUnique({ where: { clave: CLAVE } });

  const enCurso =
    previa !== null &&
    previa.terminadaAt === null &&
    ahora.getTime() - previa.iniciadaAt.getTime() < PASADA_MUERTA_MS;

  if (enCurso) {
    return { ...NADA, siguiente: previa.cursor, solapada: true };
  }

  await prisma.relojTarea.upsert({
    where: { clave: CLAVE },
    create: { clave: CLAVE, iniciadaAt: ahora },
    update: { iniciadaAt: ahora, terminadaAt: null, error: null },
  });

  let buzones = 0;
  let respuestas = 0;
  let ignorados = 0;
  let cortadaPorTiempo = false;
  let cursor = previa?.cursor ?? null;
  let error: string | null = null;

  try {
    const { lote, siguiente } = await buzonesPendientes(ahora, cursor);
    cursor = siguiente ?? cursor;

    for (const buzon of lote) {
      if (Date.now() - inicio > PRESUPUESTO_MS) {
        cortadaPorTiempo = true;
        break;
      }

      try {
        const r = await leerBuzon(buzon);
        respuestas += r.respuestas;
        ignorados += r.ignorados;
        buzones += 1;

        // La marca se mueve SOLO si el buzon se leyo entero y sin fallar. Con
        // el margen de `DIAS_MARGEN` al volver, un correo de la frontera no se
        // pierde por el desfase entre nuestro reloj y el del servidor.
        await prisma.remitenteCorreo.updateMany({
          where: { companyId: buzon.companyId },
          data: { leidoHastaAt: ahora },
        });
      } catch (e) {
        // Un buzon que falla —credenciales cambiadas, servidor caido— no puede
        // dejar sin leer a las demas constructoras. Se apunta y se sigue.
        console.error(
          `[correo-entrante] No se pudo leer el buzon de ${buzon.companyId}:`,
          e instanceof Error ? e.message : e,
        );
      }

      cursor = buzon.companyId;
    }
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
    console.error("[correo-entrante] La pasada fallo:", e);
  }

  // Se cierra TAMBIEN cuando falla: una pasada que revienta y deja esto en
  // null bloquearia la lectura hasta que caduque.
  await prisma.relojTarea.update({
    where: { clave: CLAVE },
    data: {
      terminadaAt: new Date(),
      cursor,
      obrasVistas: buzones,
      avisosCreados: respuestas,
      error: error?.slice(0, 300) ?? null,
    },
  });

  return {
    ok: error === null,
    buzones,
    respuestas,
    ignorados,
    siguiente: cursor,
    cortadaPorTiempo,
    ...(error ? { error } : {}),
  };
}
