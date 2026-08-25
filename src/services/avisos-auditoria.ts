import "server-only";

import { prisma } from "@/lib/prisma";
import { puede } from "@/lib/rbac";
import { alcanzaObra } from "@/lib/alcance-obras";
import type { CanalAviso, EventoAviso } from "@/generated/prisma/enums";
import type { SesionActiva } from "@/services/sesion.service";

/**
 * Que se aviso de verdad: a quien, por donde, si salio y si se leyo.
 *
 * POR QUE EXISTE
 *
 * El 12 de agosto de 2026 se probo el motor de avisos con una tarea real y la
 * campanita no se encendio. No habia forma de saber si el aviso no se creo, si
 * se creo y no salio, o si salio para alguien que no era quien miraba: hubo
 * que entrar a phpMyAdmin a mirar `envios_aviso` a mano. Un sistema que manda
 * cosas en nombre de la empresa y no puede decir que mando obliga a confiar, y
 * eso no vale.
 *
 * LO QUE NO SE PUEDE SABER, DICHO ANTES DE QUE ALGUIEN LO PREGUNTE
 *
 * **"Leido" solo es cierto en la campanita**, donde es una columna que se
 * escribe al abrir la bandeja. En correo y en SMS **no se sabe**, y no se va a
 * inventar: saberlo exigiria un pixel espia que rastrea a quien recibe el
 * mensaje —cosa que ademas la mitad de los clientes de correo bloquean, asi
 * que el dato mentiria tanto por defecto como por exceso—. Aqui se dice
 * "salio" de los tres canales y "leido" solo de uno. Un dato honesto y
 * limitado sirve; uno completo e inventado, no.
 *
 * COMO SE MIDE LA LECTURA
 *
 * Por PERSONA y no por envio. `EnvioAviso` no apunta al `Aviso` que creo —no
 * hay columna— y emparejarlos por fecha seria una heuristica que fallaria justo
 * cuando dos avisos caen en el mismo segundo. Contar cuantos tiene y cuantos ha
 * abierto es exacto, y responde igual de bien a la pregunta real: "¿este se
 * entera de lo que le mando?".
 */

/// Cuantos envios se ensenan. Es un registro para mirar "que paso ayer", no un
/// archivo historico: con mas filas la pantalla deja de leerse.
const MAX_ENVIOS = 60;

export interface EnvioVista {
  id: string;
  cuando: Date;
  /// Nombre ya resuelto. "Alguien dado de baja" si la fila ya no existe.
  quien: string;
  externo: boolean;
  canal: CanalAviso;
  evento: EventoAviso;
  /// Si de verdad salio. False con motivo es lo interesante.
  salio: boolean;
  motivo: string | null;
  /// A donde fue: el correo o el celular. Para poder decir "iba a este correo".
  destino: string;
}

export interface LecturaVista {
  clave: string;
  nombre: string;
  /// Avisos in-app que se le han creado.
  recibidos: number;
  leidos: number;
  ultimoLeidoAt: Date | null;
}

export interface AuditoriaAvisos {
  envios: EnvioVista[];
  /// Solo usuarios de GCM: los de fuera no tienen bandeja que leer.
  lectura: LecturaVista[];
  /// Intentos que no salieron, de los que se ensenan. Va arriba en rojo.
  fallidos: number;
  /// Si no hay ni un envio, la pantalla lo dice en vez de una tabla vacia.
  vacio: boolean;
}

/**
 * El registro de avisos de una obra.
 *
 * Mismo permiso que ver los implicados (`lookahead:leer`): quien puede ver a
 * quien se avisa tiene que poder ver si le llego. Separarlos obligaria a
 * conceder un permiso mas para responder una pregunta que la propia pantalla
 * de configuracion provoca.
 */
export async function auditoriaDeAvisos(
  sesion: SesionActiva,
  obraId: string,
): Promise<AuditoriaAvisos | null> {
  if (!puede(sesion, "lookahead:leer")) return null;

  // El alcance por obra, con la MISMA respuesta que «no tienes permiso»: las
  // dos dicen «esto no es para ti» y distinguirlas ya seria contar algo. Ver
  // la regla 4 en `gcm-limites-de-capas`.
  if (!alcanzaObra(sesion, obraId)) return null;
  if (!alcanzaObra(sesion, obraId)) return null;

  const obra = await prisma.project.findFirst({
    where: { id: obraId, companyId: sesion.companyId },
    select: { id: true },
  });
  if (!obra) return null;

  const [envios, recibidos, leidos] = await Promise.all([
    prisma.envioAviso.findMany({
      where: { projectId: obraId },
      orderBy: { createdAt: "desc" },
      take: MAX_ENVIOS,
      select: {
        id: true,
        createdAt: true,
        canal: true,
        evento: true,
        enviado: true,
        motivo: true,
        destino: true,
        userId: true,
        contactoId: true,
      },
    }),
    prisma.aviso.groupBy({
      by: ["userId"],
      where: { projectId: obraId, userId: { not: null } },
      _count: { _all: true },
    }),
    prisma.aviso.groupBy({
      by: ["userId"],
      where: {
        projectId: obraId,
        userId: { not: null },
        leidoAt: { not: null },
      },
      _count: { _all: true },
      _max: { leidoAt: true },
    }),
  ]);

  const soloIds = (xs: (string | null)[]) =>
    xs.filter((x): x is string => x !== null);

  const nombres = await nombresDe(sesion.companyId, {
    usuarios: [
      ...soloIds(envios.map((e) => e.userId)),
      ...soloIds(recibidos.map((r) => r.userId)),
    ],
    contactos: soloIds(envios.map((e) => e.contactoId)),
  });

  const vista: EnvioVista[] = envios.map((e) => ({
    id: e.id,
    cuando: e.createdAt,
    // Si la persona se borro, el envio sigue teniendo que decir algo: por eso
    // `EnvioAviso` guarda tambien `destino`, y por eso aqui no se calla.
    quien:
      (e.userId ? nombres.get(`u:${e.userId}`) : null) ??
      (e.contactoId ? nombres.get(`c:${e.contactoId}`) : null) ??
      "Alguien que ya no está en la obra",
    externo: e.contactoId !== null,
    canal: e.canal,
    evento: e.evento,
    salio: e.enviado,
    motivo: e.motivo,
    destino: e.destino,
  }));

  const leidosPorUsuario = new Map(
    leidos.map((l) => [
      l.userId as string,
      { n: l._count._all, ultimo: l._max.leidoAt },
    ]),
  );

  const lectura: LecturaVista[] = recibidos
    .map((r) => {
      const id = r.userId as string;
      const l = leidosPorUsuario.get(id);
      return {
        clave: `u:${id}`,
        nombre: nombres.get(`u:${id}`) ?? "Alguien que ya no está en la obra",
        recibidos: r._count._all,
        leidos: l?.n ?? 0,
        ultimoLeidoAt: l?.ultimo ?? null,
      };
    })
    // Los que menos han leido, primero: son los que hay que mirar. Quien
    // recibe diez y no abre ninguno es el caso que importa.
    .sort((a, b) => a.leidos / a.recibidos - b.leidos / b.recibidos);

  return {
    envios: vista,
    lectura,
    fallidos: vista.filter((e) => !e.salio).length,
    vacio: vista.length === 0,
  };
}

/**
 * Los nombres de usuarios y contactos en dos consultas, no una por fila.
 *
 * `companyId` no sobra aunque los identificadores salgan de una obra que ya
 * se filtro por empresa: resolver un nombre es ensenarselo a alguien, y esa
 * comprobacion tiene que estar DONDE se lee, no confiada a que quien llama
 * haya filtrado bien. El 19/08/2026 la lista de actividad del panel enseno el
 * nombre de una persona de otra constructora por no tener este filtro; era
 * otra consulta, pero el mismo descuido.
 */
async function nombresDe(
  companyId: string,
  ids: {
    usuarios: string[];
    contactos: string[];
  },
): Promise<Map<string, string>> {
  const usuarios = [...new Set(ids.usuarios)];
  const contactos = [...new Set(ids.contactos)];

  const [us, cs] = await Promise.all([
    usuarios.length
      ? prisma.user.findMany({
          where: { id: { in: usuarios }, companyId },
          select: { id: true, nombres: true, apellidos: true },
        })
      : Promise.resolve([]),
    contactos.length
      ? prisma.contactoAviso.findMany({
          where: { id: { in: contactos }, project: { companyId } },
          select: { id: true, nombre: true, empresa: true },
        })
      : Promise.resolve([]),
  ]);

  const mapa = new Map<string, string>();
  for (const u of us) {
    mapa.set(`u:${u.id}`, `${u.nombres} ${u.apellidos}`.trim());
  }
  for (const c of cs) {
    mapa.set(`c:${c.id}`, c.empresa ? `${c.nombre} · ${c.empresa}` : c.nombre);
  }
  return mapa;
}
