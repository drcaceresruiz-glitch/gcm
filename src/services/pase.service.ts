import "server-only";
import { timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { puede } from "@/lib/rbac";
import { alcanzaObra, FUERA_DE_ALCANCE } from "@/lib/alcance-obras";
import { motivoSiObraCerrada } from "@/services/obra-abierta";
import {
  EMPRESA_EN_MIGRACION,
  motivoNoAdmiteCambios,
  OBRA_ARCHIVADA,
} from "@/lib/obras";
import { isProduction } from "@/lib/env";
import { generateToken, hashToken, generateNumericCode } from "@/lib/tokens";
import {
  LONGITUD_CODIGO,
  VIGENCIA_CODIGO_MINUTOS,
  MAX_INTENTOS_CODIGO,
  MAX_CODIGOS_POR_VENTANA,
  VENTANA_CODIGOS_MINUTOS,
  VIGENCIA_PASE_DIAS,
  normalizarCodigo,
  reconocerContacto,
  validarAltaPase,
  nombreDePase,
  type DatosAltaPase,
} from "@/lib/pase";
import { enviarCorreo, correoCodigoAcceso } from "@/services/mailer.service";
import { enviarSms, textoCodigoPase } from "@/services/sms.service";
import type { SesionActiva } from "@/services/sesion.service";

/**
 * Pase de obra: quien documenta en campo sin ser usuario de GCM.
 *
 * Reglas que este servicio hace cumplir y nadie mas:
 *
 * - **Solo entra quien ya estaba registrado.** El codigo se envia unicamente
 *   a un contacto que el residente dio de alta en ESA obra. Si cualquiera
 *   pudiera teclear un numero y recibir codigo, el pase no valdria nada.
 * - **Nunca se dice si un contacto existe.** Pedir codigo responde igual
 *   exista o no, como ya hace `recuperacion.service`. Si no, la pantalla se
 *   convierte en un detector de quien trabaja en la obra.
 * - **Un pase alcanza UNA obra.** No hay forma de que toque otra: el
 *   `projectId` sale de la fila del pase, jamas de la peticion.
 * - **Un pase no es un usuario.** No tiene rol ni permisos, y lo unico que
 *   se le concede es adjuntar fotos. Por eso el tipo que devuelve no encaja
 *   con `SesionActiva` ni por accidente.
 */

const COOKIE_PASE = "gcm_pase";
const COOKIE_DESAFIO_PASE = "gcm_pase_codigo";

/**
 * Un pase con el telefono ya reconocido.
 *
 * Deliberadamente NO tiene `permisos`, `role` ni `userId`: si los tuviera,
 * encajaria por estructura en `puede()` y en cualquier servicio que espere
 * una sesion, y bastaria un descuido para que un pase entrara donde no debe.
 */
export interface PaseActivo {
  paseId: string;
  obraId: string;
  companyId: string;
  /// Nombre completo, tal como quedara firmando cada foto.
  nombre: string;
}

export type ResultadoPase = { ok: true } | { ok: false; error: string };

/// Lo que se devuelve al pedir codigo. `codigo` solo viaja cuando lo pide
/// quien gestiona la obra desde su pantalla (para dictarlo o mandarlo por
/// WhatsApp); en la pantalla publica JAMAS sale.
///
/// `aviso` dice que un canal fallo, y SOLO se rellena en la via con permiso.
/// En la publica seria una fuga: contar que el SMS no salio ya confirma que
/// ese numero esta dado de alta, que es justo lo que el silencio protege.
export type ResultadoCodigo =
  | { ok: true; codigo?: string; enviadoA?: string; aviso?: string }
  | { ok: false; error: string };

function quien(sesion: SesionActiva): string {
  return `${sesion.nombres} ${sesion.apellidos}`.trim().slice(0, 150);
}

// ---------------------------------------------------------------------------
// Gestion: la hace un usuario de GCM con permiso sobre el Lookahead
// ---------------------------------------------------------------------------

export interface PaseLista {
  id: string;
  nombres: string;
  apellidos: string;
  cargo: string | null;
  empresa: string | null;
  celular: string | null;
  email: string | null;
  activo: boolean;
  createdAt: Date;
  /// Cuantas fotos lleva aportadas: es lo que dice si el pase sirve de algo.
  fotos: number;
  /// Si su telefono esta reconocido ahora mismo.
  conAcceso: boolean;
}

/** El personal con pase de una obra. Exige gestionar el Lookahead. */
export async function listarPases(
  sesion: SesionActiva,
  obraId: string,
): Promise<PaseLista[]> {
  if (!puede(sesion, "lookahead:gestionar")) return [];

  const ahora = new Date();
  const pases = await prisma.paseObra.findMany({
    where: { projectId: obraId, project: { companyId: sesion.companyId } },
    orderBy: [{ activo: "desc" }, { createdAt: "asc" }],
    select: {
      id: true, nombres: true, apellidos: true, cargo: true, empresa: true,
      celular: true, email: true, activo: true, createdAt: true,
      _count: { select: { fotos: true } },
      sesiones: { where: { expiresAt: { gt: ahora } }, select: { id: true }, take: 1 },
    },
  });

  return pases.map((p) => ({
    id: p.id,
    nombres: p.nombres,
    apellidos: p.apellidos,
    cargo: p.cargo,
    empresa: p.empresa,
    celular: p.celular,
    email: p.email,
    activo: p.activo,
    createdAt: p.createdAt,
    fotos: p._count.fotos,
    conAcceso: p.sesiones.length > 0,
  }));
}

export async function crearPase(
  sesion: SesionActiva,
  obraId: string,
  datos: DatosAltaPase,
): Promise<ResultadoPase> {
  if (!puede(sesion, "lookahead:gestionar")) {
    return { ok: false, error: "No tienes permiso para dar pases en esta obra." };
  }

  // El alcance por obra, antes de consultar: esto se llama desde una accion
  // de servidor, que no pasa por el layout de la obra.
  if (!alcanzaObra(sesion, obraId)) return { ok: false, error: FUERA_DE_ALCANCE };

  /*
   * DAR UN PASE ES ABRIR TRABAJO, y en una obra que no admite cambios no hay
   * trabajo que abrir: un pase existe para que alguien documente en campo.
   *
   * Solo AQUI, y no en `editarPase`, `eliminarPase` ni `cambiarEstadoPase`:
   * esas tres CIERRAN -corregir un dato, limpiar, y sobre todo REVOCAR-, y
   * revocarle el acceso a alguien tiene que funcionar siempre, con la obra en
   * el estado que sea. Es la misma linea que parte el resto de la aplicacion.
   *
   * La pantalla publica del pase ya excluye las obras cerradas
   * -`obraParaPase` filtra por `estado: { not: "CERRADA" }`-, asi que esto
   * cierra la puerta que quedaba: crear el pase desde dentro.
   */
  const cerrada = await motivoSiObraCerrada(sesion, obraId);
  if (cerrada) return { ok: false, error: cerrada };

  const obra = await prisma.project.findFirst({
    where: { id: obraId, companyId: sesion.companyId },
    select: {
      id: true,
      estado: true,
      archivadaEn: true,
      company: { select: { enMigracionAt: true } },
    },
  });
  if (!obra) return { ok: false, error: "Obra no encontrada." };

  const noAdmite = motivoNoAdmiteCambios({
    estado: obra.estado,
    archivadaEn: obra.archivadaEn,
    empresaEnMigracion: obra.company.enMigracionAt !== null,
  });
  if (noAdmite) return { ok: false, error: noAdmite };

  const v = validarAltaPase(datos);
  if (!v.ok) return { ok: false, error: v.error };

  // El contacto no se puede repetir dentro de la obra: al pedir codigo se
  // busca POR contacto, y con dos filas iguales no se sabria de quien es.
  const repetido = await prisma.paseObra.findFirst({
    where: {
      projectId: obraId,
      OR: [
        ...(v.datos.email ? [{ email: v.datos.email }] : []),
        ...(v.datos.celular ? [{ celular: v.datos.celular }] : []),
      ],
    },
    select: { nombres: true, apellidos: true },
  });
  if (repetido) {
    return {
      ok: false,
      error: `Ese contacto ya lo tiene ${repetido.nombres} ${repetido.apellidos} en esta obra.`,
    };
  }

  const pase = await prisma.paseObra.create({
    data: {
      projectId: obraId,
      ...v.datos,
      creadoPor: quien(sesion),
    },
    select: { id: true },
  });

  await prisma.auditLog.create({
    data: {
      companyId: sesion.companyId,
      userId: sesion.userId,
      projectId: obraId,
      entidad: "PaseObra",
      entidadId: pase.id,
      accion: "CREATE",
      despues: {
        nombre: `${v.datos.nombres} ${v.datos.apellidos}`,
        celular: v.datos.celular,
        email: v.datos.email,
      },
    },
  });

  return { ok: true };
}

/**
 * Corrige los datos de un pase.
 *
 * Existe porque los datos se teclean en la caseta y se equivocan: un digito
 * del celular mal y esa persona no recibe ningun codigo nunca, sin que nada
 * lo avise —el servicio calla a proposito ante un contacto que no existe—.
 *
 * Cambiar el contacto TIRA sus sesiones y sus codigos pendientes. Si no, un
 * telefono reconocido con el numero viejo seguiria entrando un ano, que es
 * justo lo que se quiere cortar al corregirlo.
 */
export async function editarPase(
  sesion: SesionActiva,
  obraId: string,
  paseId: string,
  datos: DatosAltaPase,
): Promise<ResultadoPase> {
  if (!puede(sesion, "lookahead:gestionar")) {
    return { ok: false, error: "No tienes permiso para editar los pases." };
  }

  /*
   * EL ALCANCE POR OBRA, y no basta con el `companyId`.
   *
   * El filtro por empresa impide llegar a la cartera de otra constructora; el
   * alcance es la capa de dentro: un residente no tiene por que tocar las
   * obras de su empresa que no gestiona. Esto se llama desde una accion de
   * servidor, que NO pasa por el layout de la obra, asi que aqui es donde hay
   * que comprobarlo.
   *
   * `crearPase` ya lo hacia con este mismo comentario y sus hermanas no: era
   * un olvido, no una decision. Visto auditando el 24 de agosto de 2026.
   */
  if (!alcanzaObra(sesion, obraId)) return { ok: false, error: FUERA_DE_ALCANCE };

  const previo = await prisma.paseObra.findFirst({
    where: { id: paseId, projectId: obraId, project: { companyId: sesion.companyId } },
    select: {
      id: true,
      celular: true,
      email: true,
      project: {
        select: {
          estado: true,
          archivadaEn: true,
          company: { select: { enMigracionAt: true } },
        },
      },
    },
  });
  if (!previo) return { ok: false, error: "Pase no encontrado." };

  const noAdmite = motivoNoAdmiteCambios({
    estado: previo.project.estado,
    archivadaEn: previo.project.archivadaEn,
    empresaEnMigracion: previo.project.company.enMigracionAt !== null,
  });
  if (noAdmite) return { ok: false, error: noAdmite };

  const v = validarAltaPase(datos);
  if (!v.ok) return { ok: false, error: v.error };

  // El mismo contacto no puede estar en dos pases de la obra; se excluye el
  // propio, o corregir el cargo sin tocar el telefono chocaria consigo mismo.
  const repetido = await prisma.paseObra.findFirst({
    where: {
      projectId: obraId,
      id: { not: paseId },
      OR: [
        ...(v.datos.email ? [{ email: v.datos.email }] : []),
        ...(v.datos.celular ? [{ celular: v.datos.celular }] : []),
      ],
    },
    select: { nombres: true, apellidos: true },
  });
  if (repetido) {
    return {
      ok: false,
      error: `Ese contacto ya lo tiene ${repetido.nombres} ${repetido.apellidos} en esta obra.`,
    };
  }

  const cambioElContacto =
    previo.celular !== v.datos.celular || previo.email !== v.datos.email;

  await prisma.paseObra.update({ where: { id: paseId }, data: v.datos });

  if (cambioElContacto) {
    await prisma.sesionPase.deleteMany({ where: { paseId } });
    await prisma.codigoPase.deleteMany({ where: { paseId } });
  }

  await prisma.auditLog.create({
    data: {
      companyId: sesion.companyId,
      userId: sesion.userId,
      projectId: obraId,
      entidad: "PaseObra",
      entidadId: paseId,
      accion: "UPDATE",
      antes: { celular: previo.celular, email: previo.email },
      despues: {
        nombre: `${v.datos.nombres} ${v.datos.apellidos}`,
        celular: v.datos.celular,
        email: v.datos.email,
        contactoCambiado: cambioElContacto,
      },
    },
  });

  return { ok: true };
}

/**
 * Borra un pase de la obra.
 *
 * Se puede borrar SIN perder evidencia, y no por casualidad: `FotoEvidencia`
 * apunta al pase con `onDelete: SetNull` y guarda ademas `subidaPor` con el
 * nombre en TEXTO. Las fotos sobreviven firmadas por quien las tomo aunque su
 * pase ya no exista. Sus codigos y sesiones si se van en cascada, que es lo
 * correcto: son credenciales, no historia.
 *
 * El nombre se copia al registro de auditoria ANTES de borrar, porque despues
 * ya no habria de donde sacarlo y el rastro diria «se borro algo».
 */
export async function eliminarPase(
  sesion: SesionActiva,
  obraId: string,
  paseId: string,
): Promise<ResultadoPase> {
  if (!puede(sesion, "lookahead:gestionar")) {
    return { ok: false, error: "No tienes permiso para eliminar los pases." };
  }

  // El alcance por obra: `companyId` para en la puerta de la empresa, esto
  // para en la de la obra. Ver el comentario largo en `editarPase`.
  if (!alcanzaObra(sesion, obraId)) return { ok: false, error: FUERA_DE_ALCANCE };

  const pase = await prisma.paseObra.findFirst({
    where: { id: paseId, projectId: obraId, project: { companyId: sesion.companyId } },
    select: {
      nombres: true, apellidos: true, celular: true, email: true,
      _count: { select: { fotos: true } },
      project: {
        select: {
          estado: true,
          archivadaEn: true,
          company: { select: { enMigracionAt: true } },
        },
      },
    },
  });
  if (!pase) return { ok: false, error: "Pase no encontrado." };

  // Borrar un pase tambien QUITA acceso: misma puerta que revocar.
  const noAdmite = motivoParaNoQuitarAcceso({
    archivadaEn: pase.project.archivadaEn,
    empresaEnMigracion: pase.project.company.enMigracionAt !== null,
  });
  if (noAdmite) return { ok: false, error: noAdmite };

  await prisma.paseObra.delete({ where: { id: paseId } });

  await prisma.auditLog.create({
    data: {
      companyId: sesion.companyId,
      userId: sesion.userId,
      projectId: obraId,
      entidad: "PaseObra",
      entidadId: paseId,
      accion: "DELETE",
      antes: {
        nombre: `${pase.nombres} ${pase.apellidos}`,
        celular: pase.celular,
        email: pase.email,
        // Cuantas fotos quedan huerfanas de pase pero firmadas con su
        // nombre: es el dato que explica el registro dentro de un ano.
        fotosConservadas: pase._count.fotos,
      },
    },
  });

  return { ok: true };
}

/**
 * Si se puede QUITAR el acceso de un pase, que no es lo mismo que darlo.
 *
 * REVOCAR Y BORRAR SON CERRAR, y hasta el 24 de agosto de 2026 pasaban por la
 * misma guarda que crear y editar. El agujero era este: la sesion de un pase
 * SIGUE VALIENDO en una obra PARALIZADA -`obtenerPaseVigente` solo la invalida
 * si la obra esta CERRADA o la empresa suspendida-, pero `cambiarEstadoPase` y
 * `eliminarPase` la rechazaban por «obra paralizada». O sea: el titular seguia
 * entrando y nadie podia echarlo.
 *
 * Quitar acceso nunca falsea el expediente —solo resta—, asi que el estado de
 * la obra no tiene por que impedirlo. Lo unico que lo bloquea es que esto no
 * sea una obra viva sobre la que actuar: una copia restaurada de un respaldo,
 * o la empresa entera congelada para exportarla.
 */
function motivoParaNoQuitarAcceso(obra: {
  archivadaEn: Date | null;
  empresaEnMigracion: boolean;
}): string | null {
  if (obra.empresaEnMigracion) return EMPRESA_EN_MIGRACION;
  if (obra.archivadaEn) return OBRA_ARCHIVADA;
  return null;
}

/**
 * Revoca (o devuelve) el acceso de un pase.
 *
 * Revocar NO borra: sus fotos siguen siendo evidencia y su autoria tiene que
 * poder rastrearse. Ademas se tiran sus sesiones, para que el telefono que ya
 * estaba reconocido deje de estarlo en el acto.
 */
export async function cambiarEstadoPase(
  sesion: SesionActiva,
  obraId: string,
  paseId: string,
  activo: boolean,
): Promise<ResultadoPase> {
  if (!puede(sesion, "lookahead:gestionar")) {
    return { ok: false, error: "No tienes permiso para gestionar los pases." };
  }

  // El alcance por obra: `companyId` para en la puerta de la empresa, esto
  // para en la de la obra. Ver el comentario largo en `editarPase`.
  if (!alcanzaObra(sesion, obraId)) return { ok: false, error: FUERA_DE_ALCANCE };

  const previo = await prisma.paseObra.findFirst({
    where: { id: paseId, projectId: obraId, project: { companyId: sesion.companyId } },
    select: {
      project: {
        select: {
          estado: true,
          archivadaEn: true,
          company: { select: { enMigracionAt: true } },
        },
      },
    },
  });
  if (!previo) return { ok: false, error: "Pase no encontrado." };

  const contexto = {
    estado: previo.project.estado,
    archivadaEn: previo.project.archivadaEn,
    empresaEnMigracion: previo.project.company.enMigracionAt !== null,
  };
  // Revocar QUITA acceso y va por la puerta de al lado; devolverlo lo DA, y
  // esa si es una escritura como las demas.
  const noAdmite = activo
    ? motivoNoAdmiteCambios(contexto)
    : motivoParaNoQuitarAcceso(contexto);
  if (noAdmite) return { ok: false, error: noAdmite };

  const { count } = await prisma.paseObra.updateMany({
    where: {
      id: paseId,
      projectId: obraId,
      project: { companyId: sesion.companyId },
    },
    data: {
      activo,
      revocadoAt: activo ? null : new Date(),
      revocadoPor: activo ? null : quien(sesion),
    },
  });
  if (count === 0) return { ok: false, error: "Pase no encontrado." };

  if (!activo) {
    // Que deje de entrar YA, no cuando caduque su cookie.
    await prisma.sesionPase.deleteMany({ where: { paseId } });
    await prisma.codigoPase.deleteMany({ where: { paseId } });
  }

  await prisma.auditLog.create({
    data: {
      companyId: sesion.companyId,
      userId: sesion.userId,
      projectId: obraId,
      entidad: "PaseObra",
      entidadId: paseId,
      accion: "UPDATE",
      despues: { evento: activo ? "reactivar" : "revocar" },
    },
  });

  return { ok: true };
}

// ---------------------------------------------------------------------------
// Acceso: lo hace la propia persona desde su telefono
// ---------------------------------------------------------------------------

/**
 * Lo minimo de la obra para pintar la pantalla de acceso: su nombre.
 *
 * Se sirve SIN sesion, asi que va justo lo que ya esta impreso en el codigo QR
 * que cuelga en la caseta: el nombre de la obra. Nada de presupuesto, avance
 * ni empresa. Si la obra no admite entrar —cerrada o empresa suspendida—
 * devuelve null y la pantalla lo dice sin entrar en detalles.
 */
export async function obraParaPase(
  obraId: string,
): Promise<{ nombre: string } | null> {
  const obra = await prisma.project.findFirst({
    where: {
      id: obraId,
      estado: { not: "CERRADA" },
      company: { activa: true },
    },
    select: { nombreObra: true },
  });

  return obra ? { nombre: obra.nombreObra } : null;
}

/**
 * El pase vigente de una obra, buscado por lo que la persona tecleo.
 *
 * Devuelve null tambien cuando existe pero esta revocado, o cuando la obra o
 * la empresa no admiten entrar. Todos esos casos se responden igual arriba.
 */
async function buscarPaseParaEntrar(obraId: string, entrada: string) {
  const contacto = reconocerContacto(entrada);
  if (!contacto) return null;

  return prisma.paseObra.findFirst({
    where: {
      projectId: obraId,
      activo: true,
      ...(contacto.tipo === "email"
        ? { email: contacto.valor }
        : { celular: contacto.valor }),
      project: { estado: { not: "CERRADA" }, company: { activa: true } },
    },
    select: {
      id: true, nombres: true, apellidos: true, email: true, celular: true,
      // La empresa sale de la OBRA, nunca de la peticion: aqui no hay sesion
      // que consultar y el `obraId` viene de un codigo QR pegado en una
      // caseta. Es lo que decide por que telefono sale el SMS.
      project: { select: { companyId: true } },
    },
  });
}

/**
 * Crea el codigo y lo manda. Para la pantalla PUBLICA (`revelar: false`).
 *
 * Responde lo mismo exista o no el contacto: en la pantalla se dice «si estas
 * registrado, te llegara un codigo». Es la misma decision que ya tomo
 * `recuperacion.service`, y por lo mismo: si respondiera distinto, un
 * desconocido con el QR de la caseta podria averiguar quien trabaja alli.
 */
export async function solicitarCodigo(
  obraId: string,
  entrada: string,
): Promise<ResultadoCodigo> {
  const pase = await buscarPaseParaEntrar(obraId, entrada);

  // Silencio deliberado: se devuelve ok tanto si existe como si no.
  if (!pase) return { ok: true };

  const limite = await pasoElLimite(pase.id);
  if (limite) return { ok: true };

  const codigo = await sembrarCodigo(pase.id);
  await repartirCodigo({ ...pase, companyId: pase.project.companyId }, codigo);

  return { ok: true };
}

/**
 * Manda el codigo por TODOS los caminos que el pase tenga abiertos.
 *
 * Por los dos a la vez y no por uno solo: el SMS de json.pe sale del telefono
 * de la obra, que puede estar apagado o sin saldo, y el correo puede tardar.
 * Mandar por ambos cuesta lo mismo y multiplica las probabilidades de que el
 * codigo llegue antes de que caduque.
 *
 * Ninguno de los dos lanza si falla: si no llega por ninguno, queda que el
 * residente lo genere en su pantalla y lo dicte.
 */
async function repartirCodigo(
  pase: {
    nombres: string;
    email: string | null;
    celular: string | null;
    companyId: string;
  },
  codigo: string,
): Promise<{ porSms: boolean; porCorreo: boolean }> {
  const [sms, correo] = await Promise.all([
    pase.celular
      ? enviarSms(
          pase.companyId,
          pase.celular,
          textoCodigoPase(codigo, VIGENCIA_CODIGO_MINUTOS),
        )
      : Promise.resolve({ enviado: false }),
    pase.email
      ? enviarCorreo({
          para: pase.email,
          ...correoCodigoAcceso({
            nombre: pase.nombres,
            codigo,
            minutos: VIGENCIA_CODIGO_MINUTOS,
          }),
        })
      : Promise.resolve({ enviado: false }),
  ]);

  return { porSms: sms.enviado, porCorreo: correo.enviado };
}

/**
 * Genera un codigo y lo DEVUELVE, para que quien gestiona la obra se lo dicte
 * o se lo mande por WhatsApp. Es la via para quien no tiene correo.
 *
 * Exige permiso de gestion: aqui el codigo si sale en claro.
 */
export async function generarCodigoParaEntregar(
  sesion: SesionActiva,
  obraId: string,
  paseId: string,
): Promise<ResultadoCodigo> {
  if (!puede(sesion, "lookahead:gestionar")) {
    return { ok: false, error: "No tienes permiso para generar códigos." };
  }

  // El alcance por obra: `companyId` para en la puerta de la empresa, esto
  // para en la de la obra. Ver el comentario largo en `editarPase`.
  if (!alcanzaObra(sesion, obraId)) return { ok: false, error: FUERA_DE_ALCANCE };

  const pase = await prisma.paseObra.findFirst({
    where: {
      id: paseId,
      projectId: obraId,
      activo: true,
      project: { companyId: sesion.companyId },
    },
    select: { id: true, nombres: true, email: true, celular: true },
  });
  if (!pase) return { ok: false, error: "Pase no encontrado o revocado." };

  const codigo = await sembrarCodigo(pase.id);

  // Ademas de devolverlo para dictarlo, se intenta mandar por sus canales:
  // puede llegar antes de que el residente termine de escribir el WhatsApp.
  const repartido = await repartirCodigo(
    { ...pase, companyId: sesion.companyId },
    codigo,
  );
  const enviadoA = repartido.porSms
    ? (pase.celular ?? undefined)
    : repartido.porCorreo
      ? (pase.email ?? undefined)
      : undefined;

  // Que el residente sepa que tiene que dictarlo, en vez de suponer que ya
  // llego. Antes esto solo quedaba en el registro de auditoria, que nadie
  // mira: la pantalla decia lo mismo saliera el SMS o no.
  const aviso = avisoDeReparto(pase, repartido);

  await prisma.auditLog.create({
    data: {
      companyId: sesion.companyId,
      userId: sesion.userId,
      projectId: obraId,
      entidad: "PaseObra",
      entidadId: paseId,
      accion: "UPDATE",
      // El codigo NUNCA se audita, igual que no se auditan las claves.
      despues: {
        evento: "codigo_generado",
        porSms: repartido.porSms,
        porCorreo: repartido.porCorreo,
      },
    },
  });

  return { ok: true, codigo, enviadoA, aviso };
}

/**
 * Que decirle a quien acaba de generar un codigo, cuando algo no salio.
 *
 * Solo habla de los canales que ese pase TIENE: avisar de que no salio el
 * correo a quien nunca dio uno es ruido, y el ruido ensena a la gente a no
 * leer los avisos.
 */
function avisoDeReparto(
  pase: { email: string | null; celular: string | null },
  repartido: { porSms: boolean; porCorreo: boolean },
): string | undefined {
  const fallaron: string[] = [];

  if (pase.celular && !repartido.porSms) fallaron.push("SMS");
  if (pase.email && !repartido.porCorreo) fallaron.push("correo");

  if (fallaron.length === 0) return undefined;

  return `No se pudo enviar por ${fallaron.join(" ni por ")}. Díctale el código.`;
}

/** Demasiados codigos en poco rato. Frena el bombardeo de un buzon. */
async function pasoElLimite(paseId: string): Promise<boolean> {
  const desde = new Date(Date.now() - VENTANA_CODIGOS_MINUTOS * 60_000);
  const recientes = await prisma.codigoPase.count({
    where: { paseId, createdAt: { gt: desde } },
  });
  return recientes >= MAX_CODIGOS_POR_VENTANA;
}

/** Crea el desafio, deja la cookie y devuelve el codigo en claro. */
async function sembrarCodigo(paseId: string): Promise<string> {
  const token = generateToken();
  const codigo = generateNumericCode(LONGITUD_CODIGO);

  await prisma.codigoPase.create({
    data: {
      paseId,
      tokenHash: hashToken(token),
      codigoHash: hashToken(codigo),
      expiresAt: new Date(Date.now() + VIGENCIA_CODIGO_MINUTOS * 60_000),
    },
  });

  const almacen = await cookies();
  almacen.set(COOKIE_DESAFIO_PASE, token, {
    httpOnly: true,
    secure: isProduction,
    sameSite: "lax",
    path: "/",
    maxAge: VIGENCIA_CODIGO_MINUTOS * 60,
  });

  return codigo;
}

/**
 * Comprueba el codigo tecleado y, si acierta, reconoce el telefono.
 *
 * A diferencia del segundo factor de los usuarios, aqui SI se abre el acceso
 * en el mismo sitio: no hay clave previa ni un segundo paso que separar.
 */
export async function verificarCodigoPase(
  obraId: string,
  entrada: string,
  meta: { ip?: string; userAgent?: string } = {},
): Promise<ResultadoPase> {
  const almacen = await cookies();
  const token = almacen.get(COOKIE_DESAFIO_PASE)?.value;

  const CADUCADO = "El código caducó o ya no vale. Pide otro.";
  if (!token) return { ok: false, error: CADUCADO };

  const desafio = await prisma.codigoPase.findUnique({
    where: { tokenHash: hashToken(token) },
    select: {
      id: true,
      paseId: true,
      codigoHash: true,
      intentos: true,
      expiresAt: true,
      pase: {
        select: {
          id: true, projectId: true, activo: true,
          nombres: true, apellidos: true,
          project: { select: { companyId: true, estado: true } },
        },
      },
    },
  });

  if (!desafio || desafio.expiresAt <= new Date()) {
    await olvidarDesafioPase();
    return { ok: false, error: CADUCADO };
  }

  // El desafio es de ESTA obra, y el pase sigue sirviendo. Ambas cosas
  // pueden haber cambiado entre pedir el codigo y teclearlo.
  if (
    desafio.pase.projectId !== obraId ||
    !desafio.pase.activo ||
    desafio.pase.project.estado === "CERRADA"
  ) {
    await olvidarDesafioPase();
    return { ok: false, error: CADUCADO };
  }

  const esperado = Buffer.from(desafio.codigoHash, "hex");
  const recibido = Buffer.from(hashToken(normalizarCodigo(entrada)), "hex");

  // En tiempo constante, por lo mismo que en el segundo factor: comparar con
  // `===` tarda mas cuantas mas cifras coinciden, y ese tiempo permite ir
  // adivinando el codigo cifra a cifra.
  const acierta =
    esperado.length === recibido.length && timingSafeEqual(esperado, recibido);

  if (!acierta) {
    const intentos = desafio.intentos + 1;

    if (intentos >= MAX_INTENTOS_CODIGO) {
      await olvidarDesafioPase();
      return {
        ok: false,
        error: "Demasiados intentos. Pide un código nuevo.",
      };
    }

    await prisma.codigoPase.update({
      where: { id: desafio.id },
      data: { intentos },
    });

    const quedan = MAX_INTENTOS_CODIGO - intentos;
    return {
      ok: false,
      error: `Código incorrecto. Te quedan ${quedan} intento(s).`,
    };
  }

  // Acertado: el codigo se gasta y el telefono queda reconocido.
  await olvidarDesafioPase();

  const tokenSesion = generateToken();
  await prisma.sesionPase.create({
    data: {
      paseId: desafio.paseId,
      tokenHash: hashToken(tokenSesion),
      expiresAt: new Date(Date.now() + VIGENCIA_PASE_DIAS * 24 * 60 * 60_000),
      ip: meta.ip?.slice(0, 45) ?? null,
      userAgent: meta.userAgent?.slice(0, 255) ?? null,
    },
  });

  almacen.set(COOKIE_PASE, tokenSesion, {
    httpOnly: true,
    secure: isProduction,
    sameSite: "lax",
    path: "/",
    maxAge: VIGENCIA_PASE_DIAS * 24 * 60 * 60,
  });

  await prisma.auditLog.create({
    data: {
      companyId: desafio.pase.project.companyId,
      // Un pase no es un usuario: la columna queda vacia a proposito y el
      // rastro va en `despues`. `userId` no tiene clave foranea, asi que
      // esto es legitimo y no rompe nada.
      userId: null,
      projectId: obraId,
      entidad: "PaseObra",
      entidadId: desafio.paseId,
      accion: "LOGIN",
      despues: {
        evento: "acceso_con_codigo",
        nombre: nombreDePase(desafio.pase),
      },
      ip: meta.ip?.slice(0, 45) ?? null,
      userAgent: meta.userAgent?.slice(0, 255) ?? null,
    },
  });

  return { ok: true };
}

export async function olvidarDesafioPase(): Promise<void> {
  const almacen = await cookies();
  const token = almacen.get(COOKIE_DESAFIO_PASE)?.value;

  if (token) {
    await prisma.codigoPase
      .deleteMany({ where: { tokenHash: hashToken(token) } })
      .catch(() => {});
  }

  almacen.delete(COOKIE_DESAFIO_PASE);
}

/** Hay un codigo pedido y todavia sirve: decide que pantalla se pinta. */
export async function hayCodigoPendiente(): Promise<boolean> {
  const token = (await cookies()).get(COOKIE_DESAFIO_PASE)?.value;
  if (!token) return false;

  const desafio = await prisma.codigoPase.findUnique({
    where: { tokenHash: hashToken(token) },
    select: { expiresAt: true },
  });

  return Boolean(desafio && desafio.expiresAt > new Date());
}

/**
 * El pase de quien esta usando el telefono, SIN exigir una obra concreta.
 *
 * Existe para quien no sabe todavia de que obra habla: `/api/evidencia/<id>`
 * recibe el id de una foto y nada mas, asi que primero averigua de quien es
 * el telefono y despues comprueba que la foto sea de SU obra. Devolver aqui
 * la obra del pase —y no aceptarla como parametro— es lo que impide que ese
 * id venga de la peticion.
 *
 * Se comprueba TODO en cada peticion —que el pase siga activo, que la obra
 * no este cerrada y que la empresa no este suspendida— porque la cookie dura
 * un ano: revocar a alguien tiene que echarlo al instante, no dentro de once
 * meses.
 */
export async function obtenerPaseVigente(): Promise<PaseActivo | null> {
  const almacen = await cookies();
  const token = almacen.get(COOKIE_PASE)?.value;
  if (!token) return null;

  const sesion = await prisma.sesionPase.findUnique({
    where: { tokenHash: hashToken(token) },
    select: {
      id: true,
      expiresAt: true,
      pase: {
        select: {
          id: true, projectId: true, activo: true,
          nombres: true, apellidos: true,
          project: { select: { companyId: true, estado: true, company: { select: { activa: true } } } },
        },
      },
    },
  });

  if (!sesion) return null;

  const muerta = sesion.expiresAt <= new Date() || !sesion.pase.activo;
  if (muerta) {
    // Solo se borra la fila si de verdad murio. Que la obra este cerrada o la
    // empresa suspendida son estados REVERSIBLES: tirar la sesion por eso
    // obligaria a pedir codigo otra vez el dia que la obra se reabra.
    await prisma.sesionPase.delete({ where: { id: sesion.id } }).catch(() => {});
    return null;
  }

  const vale =
    sesion.pase.project.estado !== "CERRADA" && sesion.pase.project.company.activa;
  if (!vale) return null;

  return {
    paseId: sesion.pase.id,
    obraId: sesion.pase.projectId,
    companyId: sesion.pase.project.companyId,
    nombre: nombreDePase(sesion.pase),
  };
}

/**
 * El pase de quien usa el telefono, exigiendo que sea de ESTA obra.
 *
 * Es la puerta normal: toda pantalla del pase sabe en que obra esta, y
 * comparar aqui evita que una cookie legitima de la obra A sirva para mirar
 * la obra B con solo cambiar el id de la URL.
 */
export async function obtenerPase(obraId: string): Promise<PaseActivo | null> {
  const pase = await obtenerPaseVigente();
  return pase && pase.obraId === obraId ? pase : null;
}

export async function cerrarPase(): Promise<void> {
  const almacen = await cookies();
  const token = almacen.get(COOKIE_PASE)?.value;

  if (token) {
    await prisma.sesionPase
      .deleteMany({ where: { tokenHash: hashToken(token) } })
      .catch(() => {});
  }

  almacen.delete(COOKIE_PASE);
}
