import "server-only";
import { prisma } from "@/lib/prisma";
import { puede } from "@/lib/rbac";
import { motivoSiObraCerrada } from "@/services/obra-abierta";
import { ponerEdtAlDia } from "@/services/edt-sincronizar";
import type { Resultado } from "@/services/edt.service";
import type { SesionActiva } from "@/services/sesion.service";
import { alcanzaObra } from "@/lib/alcance-obras";

/**
 * Los hitos de la obra: las fechas clave que marca el planificador.
 *
 * Un hito NO es una partida. Es un acontecimiento —«fin de estructuras»,
 * «entrega del terreno»—: dura cero dias, no lleva dinero y nadie lo ejecuta.
 * Por eso el resto del sistema lo aparta del avance ponderado y del mapeo con
 * el presupuesto, igual que a una tarea resumen.
 *
 * Y por eso mismo un hito es una FILA NUEVA, nunca una partida reetiquetada:
 * marcar como hito una partida costeada la sacaria de la valorizacion en nueve
 * sitios del sistema sin dar ningun error, y su dinero dejaria de estar
 * cubierto por ninguna tarea.
 */

export interface NuevoHito {
  nombre: string;
  /// El dia en que se cumple. Fecha de CALENDARIO, "YYYY-MM-DD".
  fecha: string;
  /// Tras que partida va. Nulo = al final del cronograma.
  anclaCodigo?: string | null;
  /// Con cuantos dias de antelacion avisar. Por defecto una semana.
  diasAviso?: number;
}

const DIAS_AVISO_MAX = 90;

function revisar(hito: NuevoHito): string | null {
  if (!hito.nombre?.trim()) return "El hito necesita un nombre.";
  if (hito.nombre.trim().length > 500) return "El nombre es demasiado largo.";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(hito.fecha ?? "")) {
    return "La fecha del hito no es valida.";
  }
  const dias = hito.diasAviso ?? 7;
  if (!Number.isInteger(dias) || dias < 0 || dias > DIAS_AVISO_MAX) {
    return `La antelacion del aviso va de 0 a ${DIAS_AVISO_MAX} dias.`;
  }
  return null;
}

/**
 * Marca un hito sobre la EDT.
 *
 * Nace al final del documento y es la SINCRONIZACION la que lo coloca detras
 * de la rama que lo ancla. Se hace asi a proposito: la regla de donde va un
 * hito es delicada —al mismo nivel que su ancla y detras de toda su rama, o
 * rompe la jerarquia— y tenerla en dos sitios garantiza que un dia discrepen.
 */
export async function crearHito(
  sesion: SesionActiva,
  obraId: string,
  hito: NuevoHito,
): Promise<Resultado<{ uid: number; aviso?: string }>> {
  if (!puede(sesion, "cronograma:editar")) {
    return { ok: false, error: "No tienes permiso para editar el cronograma." };
  }

  const cerrada = await motivoSiObraCerrada(sesion, obraId);
  if (cerrada) return { ok: false, error: cerrada };

  const problema = revisar(hito);
  if (problema) return { ok: false, error: problema };

  const obra = await prisma.project.findFirst({
    where: { id: obraId, companyId: sesion.companyId },
    select: { id: true },
  });
  if (!obra) return { ok: false, error: "Obra no encontrada." };

  const vigente = await prisma.cronograma.findFirst({
    where: { projectId: obraId },
    orderBy: [{ fechaCorte: "desc" }, { version: "desc" }],
    select: { id: true, version: true, lineaBaseAt: true, _count: { select: { tareas: true } } },
  });

  if (!vigente) {
    return {
      ok: false,
      error:
        "Esta obra no tiene cronograma todavia. Genera la EDT desde el " +
        "presupuesto y despues marca sus hitos.",
    };
  }

  if (vigente.lineaBaseAt) {
    return {
      ok: false,
      error:
        `El cronograma v${vigente.version} esta fijado como linea base y no ` +
        `admite cambios. Los hitos se marcan antes de fijarla.`,
    };
  }

  const ancla = hito.anclaCodigo?.trim() || null;

  if (ancla !== null) {
    const existe = await prisma.wbsItem.count({
      where: { projectId: obraId, codigoPartida: ancla },
    });
    if (existe === 0) {
      return { ok: false, error: `La partida ${ancla} no esta en el presupuesto.` };
    }
  }

  const quien = `${sesion.nombres} ${sesion.apellidos} (${sesion.email})`.trim().slice(0, 150);
  const dia = new Date(`${hito.fecha}T00:00:00.000Z`);

  const uid = await prisma.$transaction(async (tx) => {
    /**
     * El uid sale del contador monotono de la obra y no se recicla jamas.
     *
     * `AvanceTarea` se ancla a el sin clave ajena —y ahora tambien `HitoObra`—,
     * asi que reutilizar uno le pegaria a este hito el historial de una tarea
     * muerta.
     */
    const actualizada = await tx.project.update({
      where: { id: obraId },
      data: { ultimoUidManual: { decrement: 1 } },
      select: { ultimoUidManual: true },
    });
    const nuevoUid = actualizada.ultimoUidManual;

    const ultima = await tx.tareaCronograma.findFirst({
      where: { cronogramaId: vigente.id },
      orderBy: { fila: "desc" },
      select: { fila: true },
    });

    await tx.tareaCronograma.create({
      data: {
        cronogramaId: vigente.id,
        uid: nuevoUid,
        fila: (ultima?.fila ?? 0) + 1,
        codigo: null,
        nombre: hito.nombre.trim().slice(0, 500),
        // A raiz mientras no se coloque: un nivel profundo al final del
        // documento convertiria en resumen a la fila de delante.
        nivel: 1,
        esResumen: false,
        esHito: true,
        esCritico: false,
        holguraDias: "0.00",
        holguraInferida: true,
        // Un hito SI tiene fecha —es lo unico que tiene—, asi que nace
        // programado. Y dura cero dias: es un instante, no trabajo.
        sinProgramar: false,
        inicio: dia,
        fin: dia,
        duracionDias: "0.00",
        porcentajePlaneado: "0.00",
        porcentajeArchivo: "0.00",
        origen: "MANUAL",
      },
    });

    await tx.hitoObra.create({
      data: {
        projectId: obraId,
        uid: nuevoUid,
        anclaCodigo: ancla,
        diasAviso: hito.diasAviso ?? 7,
        creadoPor: quien,
      },
    });

    await tx.auditLog.create({
      data: {
        companyId: sesion.companyId,
        userId: sesion.userId,
        projectId: obraId,
        entidad: "Cronograma",
        entidadId: vigente.id,
        accion: "CREATE",
        despues: {
          evento: "hito_marcado",
          uid: nuevoUid,
          nombre: hito.nombre.trim(),
          fecha: hito.fecha,
          anclaCodigo: ancla,
        },
      },
    });

    return nuevoUid;
  });

  // Y que lo coloque quien sabe donde va.
  const aviso = await ponerEdtAlDia(sesion, obraId);

  return { ok: true, datos: { uid, ...(aviso ? { aviso } : {}) } };
}

/**
 * Borra un hito.
 *
 * Se lleva por delante lo que colgaba de su uid, que en un hito es poco: no
 * lleva enlace con el presupuesto —el sistema no deja mapearlo— pero SI puede
 * tener avance, porque un hito se da por cumplido al llegar al 100%. Eso no se
 * puede recuperar, asi que se avisa antes.
 */
export async function eliminarHito(
  sesion: SesionActiva,
  obraId: string,
  uid: number,
  confirmarPerdida = false,
): Promise<Resultado<{ pideConfirmacion?: boolean }>> {
  if (!puede(sesion, "cronograma:eliminar")) {
    return { ok: false, error: "No tienes permiso para borrar tareas del cronograma." };
  }

  const cerrada = await motivoSiObraCerrada(sesion, obraId);
  if (cerrada) return { ok: false, error: cerrada };

  const vigente = await prisma.cronograma.findFirst({
    where: { projectId: obraId, project: { companyId: sesion.companyId } },
    orderBy: [{ fechaCorte: "desc" }, { version: "desc" }],
    select: { id: true, version: true, lineaBaseAt: true },
  });
  if (!vigente) return { ok: false, error: "Esta obra no tiene cronograma." };

  if (vigente.lineaBaseAt) {
    return {
      ok: false,
      error: `El cronograma v${vigente.version} esta fijado como linea base y no admite cambios.`,
    };
  }

  const fila = await prisma.tareaCronograma.findFirst({
    where: { cronogramaId: vigente.id, uid },
    select: { id: true, nombre: true, esHito: true, origen: true },
  });
  if (!fila) return { ok: false, error: "Ese hito no esta en el cronograma vigente." };

  if (!fila.esHito) {
    return {
      ok: false,
      error: `"${fila.nombre}" no es un hito. Las tareas se borran desde su propia lista.`,
    };
  }

  if (fila.origen !== "MANUAL") {
    return {
      ok: false,
      error:
        `"${fila.nombre}" vino de un archivo. Quitalo en MS Project y vuelve a ` +
        `importarlo, o el siguiente corte lo devolveria.`,
    };
  }

  const avances = await prisma.avanceTarea.count({ where: { projectId: obraId, uid } });

  if (avances > 0 && !confirmarPerdida) {
    return {
      ok: false,
      error:
        `Borrar "${fila.nombre}" se llevaria ${avances} reporte(s) de avance. ` +
        `Eso no se puede recuperar.`,
      // El que llama distingue "no se pudo" de "hay que confirmar".
      ...({ datos: { pideConfirmacion: true } } as object),
    } as Resultado<{ pideConfirmacion?: boolean }>;
  }

  await prisma.$transaction(async (tx) => {
    await tx.avanceTarea.deleteMany({ where: { projectId: obraId, uid } });
    await tx.hitoObra.deleteMany({ where: { projectId: obraId, uid } });
    await tx.dependenciaTarea.deleteMany({
      where: { cronogramaId: vigente.id, OR: [{ tareaUid: uid }, { predecesoraUid: uid }] },
    });
    await tx.tareaCronograma.delete({ where: { id: fila.id } });

    await tx.auditLog.create({
      data: {
        companyId: sesion.companyId,
        userId: sesion.userId,
        projectId: obraId,
        entidad: "Cronograma",
        entidadId: vigente.id,
        accion: "DELETE",
        antes: { evento: "hito_borrado", uid, nombre: fila.nombre, avancesBorrados: avances },
      },
    });
  });

  return { ok: true, datos: {} };
}

export interface HitoListado {
  uid: number;
  nombre: string;
  /// "YYYY-MM-DD".
  fecha: string;
  anclaCodigo: string | null;
  diasAviso: number;
  /// La clave del responsable, para el desplegable. Nulo si no tiene.
  responsableClave: string | null;
  /**
   * Su nombre, o nulo si ya no se puede resolver.
   *
   * Con clave pero sin nombre significa que esa persona causo baja despues de
   * hacerse cargo: la traza se conserva —`SET NULL` solo actua al BORRAR la
   * fila, y aqui se da de baja, que no es lo mismo— pero ya no hay a quien
   * escribir. La pantalla lo dice en vez de callarlo.
   */
  responsableNombre: string | null;
}

export interface PersonaPosible {
  /// "u:" mas el id para alguien de GCM; "c:" mas el id para alguien de fuera.
  clave: string;
  nombre: string;
  externo: boolean;
}

/**
 * Quien puede responder de un hito.
 *
 * Los de la obra primero, y despues los contactos externos. El orden no es
 * cosmetico: el responsable es quien responde DENTRO de la organizacion —el
 * residente, el jefe de campo—, no el proveedor al que se persigue. Se permite
 * elegir a alguien de fuera —la supervision, el cliente— porque a veces la
 * fecha depende de ellos, pero no es lo que se ofrece primero.
 *
 * Solo gente viva: un usuario dado de baja o un contacto desactivado no puede
 * hacerse cargo de nada.
 */
export async function personasParaResponsable(
  sesion: SesionActiva,
  obraId: string,
): Promise<PersonaPosible[]> {
  if (!puede(sesion, "cronograma:leer")) return [];

  // El alcance por obra, con la MISMA respuesta que «no tienes permiso»: las
  // dos dicen «esto no es para ti» y distinguirlas ya seria contar algo. Ver
  // la regla 4 en `gcm-limites-de-capas`.
  if (!alcanzaObra(sesion, obraId)) return [];

  const [miembros, contactos] = await Promise.all([
    prisma.projectMembership.findMany({
      where: {
        projectId: obraId,
        project: { companyId: sesion.companyId },
        user: { estado: "ACTIVO" },
      },
      select: { user: { select: { id: true, nombres: true, apellidos: true } } },
    }),
    prisma.contactoAviso.findMany({
      where: { projectId: obraId, activo: true },
      select: { id: true, nombre: true },
    }),
  ]);

  const dentro = miembros
    .map((m) => ({
      clave: `u:${m.user.id}`,
      nombre: `${m.user.nombres} ${m.user.apellidos}`.trim(),
      externo: false,
    }))
    .sort((a, b) => a.nombre.localeCompare(b.nombre));

  const fuera = contactos
    .map((c) => ({ clave: `c:${c.id}`, nombre: c.nombre, externo: true }))
    .sort((a, b) => a.nombre.localeCompare(b.nombre));

  return [...dentro, ...fuera];
}

/**
 * Pone —o quita— el nombre de alguien encima de un hito.
 *
 * UNO DE LOS DOS, NUNCA AMBOS. La base no puede exigirlo con dos claves
 * ajenas opcionales, asi que se comprueba aqui: `clave` trae "u:" o "c:", y de
 * ahi sale cual de las dos columnas se llena. `null` lo deja sin responsable.
 *
 * Y se comprueba que esa persona sea DE ESTA OBRA. Sin esto, alterando el
 * identificador se podria poner de responsable a alguien de otra empresa, que
 * es una fuga de nombres entre clientes.
 */
export async function asignarResponsable(
  sesion: SesionActiva,
  obraId: string,
  uid: number,
  clave: string | null,
): Promise<Resultado> {
  if (!puede(sesion, "cronograma:editar")) {
    return { ok: false, error: "No tienes permiso para editar el cronograma." };
  }

  const cerrada = await motivoSiObraCerrada(sesion, obraId);
  if (cerrada) return { ok: false, error: cerrada };

  const hito = await prisma.hitoObra.findFirst({
    where: { projectId: obraId, uid, project: { companyId: sesion.companyId } },
    select: { id: true },
  });
  if (!hito) return { ok: false, error: "Ese hito no existe en esta obra." };

  let responsableUserId: string | null = null;
  let responsableContactoId: string | null = null;

  if (clave) {
    const id = clave.slice(2);

    if (clave.startsWith("u:")) {
      const miembro = await prisma.projectMembership.findFirst({
        where: {
          projectId: obraId,
          userId: id,
          project: { companyId: sesion.companyId },
          user: { estado: "ACTIVO" },
        },
        select: { id: true },
      });
      if (!miembro) {
        return { ok: false, error: "Esa persona no esta en la obra." };
      }
      responsableUserId = id;
    } else if (clave.startsWith("c:")) {
      const contacto = await prisma.contactoAviso.findFirst({
        where: { id, projectId: obraId, activo: true },
        select: { id: true },
      });
      if (!contacto) {
        return { ok: false, error: "Ese contacto no esta en la obra." };
      }
      responsableContactoId = id;
    } else {
      return { ok: false, error: "No se reconoce a esa persona." };
    }
  }

  await prisma.hitoObra.update({
    where: { id: hito.id },
    data: { responsableUserId, responsableContactoId },
  });

  await prisma.auditLog.create({
    data: {
      companyId: sesion.companyId,
      userId: sesion.userId,
      projectId: obraId,
      entidad: "Cronograma",
      entidadId: hito.id,
      accion: "UPDATE",
      despues: { evento: "hito_responsable", uid, clave },
    },
  });

  return { ok: true };
}

export interface AnclaPosible {
  codigo: string;
  nombre: string;
  nivel: number;
}

/**
 * Las partidas a las que se puede anclar un hito.
 *
 * Los capitulos entran: «fin de estructuras» cuelga del capitulo, no de una de
 * sus partidas. Se ordena por codigo para que la lista se lea como el
 * presupuesto.
 */
export async function partidasParaAnclar(
  sesion: SesionActiva,
  obraId: string,
): Promise<AnclaPosible[]> {
  if (!puede(sesion, "cronograma:leer")) return [];

  // El alcance por obra, con la MISMA respuesta que «no tienes permiso»: las
  // dos dicen «esto no es para ti» y distinguirlas ya seria contar algo. Ver
  // la regla 4 en `gcm-limites-de-capas`.
  if (!alcanzaObra(sesion, obraId)) return [];

  const filas = await prisma.wbsItem.findMany({
    where: { projectId: obraId, project: { companyId: sesion.companyId } },
    orderBy: { codigoPartida: "asc" },
    select: { codigoPartida: true, descripcion: true, nivel: true },
  });

  return filas.map((p) => ({
    codigo: p.codigoPartida,
    nombre: p.descripcion,
    nivel: p.nivel,
  }));
}

/** Los hitos de la obra, con su fecha del cronograma vigente. */
export async function listarHitos(
  sesion: SesionActiva,
  obraId: string,
): Promise<HitoListado[]> {
  if (!puede(sesion, "cronograma:leer")) return [];

  // El alcance por obra, con la MISMA respuesta que «no tienes permiso»: las
  // dos dicen «esto no es para ti» y distinguirlas ya seria contar algo. Ver
  // la regla 4 en `gcm-limites-de-capas`.
  if (!alcanzaObra(sesion, obraId)) return [];

  const vigente = await prisma.cronograma.findFirst({
    where: { projectId: obraId, project: { companyId: sesion.companyId } },
    orderBy: [{ fechaCorte: "desc" }, { version: "desc" }],
    select: { id: true },
  });
  if (!vigente) return [];

  const hitos = await prisma.hitoObra.findMany({
    where: { projectId: obraId },
    select: {
      uid: true,
      anclaCodigo: true,
      diasAviso: true,
      responsableUserId: true,
      responsableContactoId: true,
      // Se traen los nombres por la relacion, no con otra consulta: asi el
      // que ya no se puede resolver llega como `null` y se distingue solo.
      responsable: { select: { nombres: true, apellidos: true, estado: true } },
      contacto: { select: { nombre: true, activo: true } },
    },
  });
  if (hitos.length === 0) return [];

  const tareas = await prisma.tareaCronograma.findMany({
    where: { cronogramaId: vigente.id, uid: { in: hitos.map((h) => h.uid) } },
    orderBy: { fila: "asc" },
    select: { uid: true, nombre: true, fin: true },
  });

  const porUid = new Map(hitos.map((h) => [h.uid, h]));

  return tareas.map((t) => {
    const h = porUid.get(t.uid);

    const clave = h?.responsableUserId
      ? `u:${h.responsableUserId}`
      : h?.responsableContactoId
        ? `c:${h.responsableContactoId}`
        : null;

    // Dado de baja no es lo mismo que borrado: la fila sigue apuntando a el,
    // pero ya no hay a quien escribir. Se devuelve sin nombre para poder
    // decirlo en pantalla.
    const nombre =
      h?.responsable && h.responsable.estado === "ACTIVO"
        ? `${h.responsable.nombres} ${h.responsable.apellidos}`.trim()
        : h?.contacto && h.contacto.activo
          ? h.contacto.nombre
          : null;

    return {
      uid: t.uid,
      nombre: t.nombre,
      fecha: t.fin.toISOString().slice(0, 10),
      anclaCodigo: h?.anclaCodigo ?? null,
      diasAviso: h?.diasAviso ?? 7,
      responsableClave: clave,
      responsableNombre: nombre,
    };
  });
}
