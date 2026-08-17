import "server-only";
import { Open } from "unzipper";

import { prisma } from "@/lib/prisma";
import { puede } from "@/lib/rbac";
import {
  ENTRADA_FIRMA,
  ENTRADA_MANIFIESTO,
  revisarManifiesto,
  sha256Hex,
  type Manifiesto,
} from "@/lib/respaldo-manifiesto";
import { TABLAS, tablaDelRespaldo } from "@/lib/respaldo-esquema";
import { deserializarFila, type FilaJson } from "@/lib/respaldo-serializacion";
import {
  MapaDeIds,
  remapearFila,
  reservarIds,
  type ReferenciasDeEmpresa,
} from "@/lib/respaldo-remapeo";
import type { SesionActiva } from "@/services/sesion.service";

/**
 * Recargar el respaldo de una obra, como COPIA DE AUDITORIA.
 *
 * La obra restaurada nace archivada y no admite un solo cambio: la garantia no
 * esta aqui, esta en `obraAdmiteCambios`, que ya mira `archivadaEn` en los
 * cinco puntos de escritura del sistema.
 *
 * Lo que esto NO es: una vuelta atras. Los identificadores son nuevos, y lo
 * que vive fuera de la obra —usuarios, proveedores— se re-enlaza si sigue
 * existiendo y se pierde si no. Se cuenta todo en el informe.
 */

export type Resultado<T = void> =
  | ({ ok: true } & (T extends void ? object : { datos: T }))
  | { ok: false; error: string };

export interface InformeRestauracion {
  obraId: string;
  nombreObra: string;
  filas: number;
  tablas: { tabla: string; filas: number; descartadas: number }[];
  /// Lo que el usuario tiene que saber que NO quedo igual que en el original.
  avisos: string[];
}

/** Lo que se lee del zip antes de tocar la base. */
interface Contenido {
  manifiesto: Manifiesto;
  /// tabla -> filas ya deserializadas.
  filas: Map<string, Record<string, unknown>[]>;
}

/**
 * Abre el zip y comprueba que es nuestro y que nadie lo ha tocado.
 *
 * El orden importa: PRIMERO la firma del manifiesto, DESPUES el hash de cada
 * entrada contra lo que el manifiesto declara. Al reves, se estaria confiando
 * en una lista de hashes que cualquiera pudo reescribir.
 */
async function leerElZip(
  bytes: Buffer,
  companyId: string,
  secreto: string,
): Promise<Resultado<Contenido>> {
  let directorio;
  try {
    directorio = await Open.buffer(bytes);
  } catch {
    return { ok: false, error: "El archivo no es un zip que se pueda abrir." };
  }

  const porNombre = new Map(directorio.files.map((f) => [f.path, f]));

  const entradaManifiesto = porNombre.get(ENTRADA_MANIFIESTO);
  const entradaFirma = porNombre.get(ENTRADA_FIRMA);

  if (!entradaManifiesto || !entradaFirma) {
    return {
      ok: false,
      error: "El zip no lleva manifiesto: no es un respaldo de GCM.",
    };
  }

  const manifiestoJson = (await entradaManifiesto.buffer()).toString("utf8");
  const firma = (await entradaFirma.buffer()).toString("utf8").trim();

  const revision = revisarManifiesto(manifiestoJson, firma, secreto, companyId);
  if (!revision.ok) return { ok: false, error: revision.error };

  const manifiesto = revision.manifiesto;

  if (manifiesto.empresa.id !== companyId) {
    return {
      ok: false,
      error: "Ese respaldo es de otra empresa. Solo se restaura donde se genero.",
    };
  }

  const filas = new Map<string, Record<string, unknown>[]>();

  for (const declarada of manifiesto.entradas) {
    if (!declarada.nombre.startsWith("datos/")) continue;

    const entrada = porNombre.get(declarada.nombre);
    if (!entrada) {
      return { ok: false, error: `Al zip le falta "${declarada.nombre}".` };
    }

    const texto = (await entrada.buffer()).toString("utf8");

    // El hash de CADA entrada, no solo el del manifiesto: la firma protege la
    // lista, y esto protege el contenido de cada archivo de la lista.
    if (sha256Hex(texto) !== declarada.sha256) {
      return {
        ok: false,
        error: `"${declarada.nombre}" no coincide con su huella: el archivo esta alterado o corrupto.`,
      };
    }

    const lineas = texto.split("\n").filter((l) => l.trim() !== "");
    const cabecera = JSON.parse(lineas[0] ?? "{}") as { tabla?: string };
    const tabla = tablaDelRespaldo(cabecera.tabla ?? "");

    if (!tabla) {
      return {
        ok: false,
        error: `El respaldo trae la tabla "${cabecera.tabla}", que este GCM no conoce. Puede ser de una version mas nueva.`,
      };
    }

    filas.set(
      tabla.tabla,
      lineas
        .slice(1)
        .map((l) => deserializarFila(JSON.parse(l) as FilaJson, tabla)),
    );
  }

  return { ok: true, datos: { manifiesto, filas } };
}

/** Lo minimo de un delegado de Prisma para escribir una tabla. */
interface DelegadoEscritura {
  createMany: (args: { data: Record<string, unknown>[] }) => Promise<unknown>;
}

export async function restaurarObra(
  sesion: SesionActiva,
  bytes: Buffer,
): Promise<Resultado<InformeRestauracion>> {
  if (!puede(sesion, "obra:restaurar")) {
    return { ok: false, error: "No tienes permiso para restaurar respaldos." };
  }

  const secreto = process.env["APP_SECRET"];
  if (!secreto) {
    return { ok: false, error: "Falta APP_SECRET: no se puede comprobar la firma." };
  }

  const lectura = await leerElZip(bytes, sesion.companyId, secreto);
  if (!lectura.ok) return lectura;

  const { manifiesto, filas } = lectura.datos;
  const avisos: string[] = [];

  /**
   * Lo que vive fuera de la obra se resuelve ANTES de escribir nada.
   *
   * Los usuarios NUNCA se recrean: un `User` lleva su hash de contrasena y su
   * rol, asi que recrearlo fabricaria un acceso para alguien que quiza esta
   * dado de baja. Los proveedores tampoco se recrean en esta version: el
   * respaldo no guarda la tabla de proveedores —solo sus identificadores—, asi
   * que no hay RUC con el que reconocerlos. Lo que no se encuentra se cuenta.
   */
  const [usuarios, proveedores] = await Promise.all([
    prisma.user.findMany({
      where: { companyId: sesion.companyId },
      select: { id: true },
    }),
    prisma.proveedor.findMany({
      where: { companyId: sesion.companyId },
      select: { id: true },
    }),
  ]);

  const idsUsuario = new Set(usuarios.map((u) => u.id));
  const idsProveedor = new Set(proveedores.map((p) => p.id));

  const perdidos = { usuario: 0, proveedor: 0 };

  const empresa: ReferenciasDeEmpresa = {
    usuario: (id) => {
      if (idsUsuario.has(id)) return id;
      perdidos.usuario++;
      return null;
    },
    proveedor: (id) => {
      if (idsProveedor.has(id)) return id;
      perdidos.proveedor++;
      return null;
    },
  };

  /**
   * Las ordenes de compra son unicas por `[companyId, numero]`.
   *
   * Restaurar junto a la original choca contra ese indice. Se RECHAZA y se
   * listan los numeros, en vez de sufijarlos: ese numero va impreso en el papel
   * que tiene el proveedor, y cambiarlo aqui rompe la correspondencia con el
   * documento que existe fuera del sistema.
   */
  const ordenes = filas.get("ordenes_compra") ?? [];
  const numeros = ordenes
    .map((o) => o["numero"])
    .filter((n): n is string => typeof n === "string");

  if (numeros.length > 0) {
    const chocan = await prisma.ordenCompra.findMany({
      where: { companyId: sesion.companyId, numero: { in: numeros } },
      select: { numero: true },
    });

    if (chocan.length > 0) {
      return {
        ok: false,
        error:
          `Ya existen en la empresa ${chocan.length} orden(es) de compra con el ` +
          `mismo numero: ${chocan.slice(0, 5).map((o) => o.numero).join(", ")}` +
          `${chocan.length > 5 ? "…" : ""}. Puede que la obra ya este restaurada.`,
      };
    }
  }

  /**
   * La obra tambien es unica: por `codigoObra` y por `correlativo`.
   *
   * Lo encontro la primera prueba de ida y vuelta, no el plan. Restaurar junto
   * a la original choca contra esos dos indices, y se trata igual que las
   * ordenes: se rechaza diciendo cual, en vez de inventarle otro codigo. Un
   * correlativo es lo que la gente cita al hablar de la obra —"la OB-000007"—
   * y una copia con otro numero es una obra distinta a ojos de cualquiera.
   */
  const original = (filas.get("projects") ?? [])[0];

  if (original) {
    const codigoObra = original["codigoObra"];
    const correlativo = original["correlativo"];

    const choque = await prisma.project.findFirst({
      where: {
        companyId: sesion.companyId,
        OR: [
          ...(typeof codigoObra === "string" ? [{ codigoObra }] : []),
          ...(typeof correlativo === "string" ? [{ correlativo }] : []),
        ],
      },
      select: { nombreObra: true, codigoObra: true, correlativo: true, archivadaEn: true },
    });

    if (choque) {
      return {
        ok: false,
        error:
          `Ya hay una obra en la empresa con ${
            choque.correlativo === correlativo
              ? `el correlativo ${choque.correlativo}`
              : `el codigo ${choque.codigoObra}`
          }: "${choque.nombreObra}"${choque.archivadaEn ? " (una copia de auditoria)" : ""}. ` +
          `Este respaldo ya esta restaurado, o la obra original sigue viva.`,
      };
    }
  }

  // Los identificadores de TODAS las tablas, reservados antes de traducir
  // nada: hay autorreferencias y el padre puede venir despues que la hija.
  const mapa = new MapaDeIds();
  for (const tabla of TABLAS) {
    reservarIds(filas.get(tabla.tabla) ?? [], tabla.tabla, mapa);
  }

  const informe: InformeRestauracion["tablas"] = [];
  let total = 0;

  const ahora = new Date();

  for (const tabla of TABLAS) {
    const origen = filas.get(tabla.tabla) ?? [];
    if (origen.length === 0) {
      informe.push({ tabla: tabla.tabla, filas: 0, descartadas: 0 });
      continue;
    }

    const listas: Record<string, unknown>[] = [];
    let descartadas = 0;

    for (const cruda of origen) {
      const r = remapearFila(cruda, tabla, mapa, empresa);

      if (r.fila === null) {
        descartadas++;
        continue;
      }

      /**
       * La obra nace ARCHIVADA, y se apunta de donde vino.
       *
       * `archivadaEn` es lo que hace que ninguna pantalla la deje tocar. Sin
       * esto la copia de auditoria seria una obra normal mas, editable.
       */
      if (tabla.tabla === "projects") {
        r.fila["archivadaEn"] = ahora;
        r.fila["respaldoOrigen"] = {
          obraOriginalId: manifiesto.obra.id,
          generado: manifiesto.generado ?? null,
          restauradoEn: ahora.toISOString(),
          restauradoPor: sesion.email,
        };
      }

      /**
       * Los avisos de la copia se apagan.
       *
       * Sin esto el reloj empieza a mandar SMS de una obra que se cerro hace
       * dos anos. Es dinero de la SIM y es ruido para quien lo recibe.
       */
      if (tabla.tabla === "ajustes_avisos_obra") {
        r.fila["activo"] = false;
      }

      listas.push(r.fila);
    }

    if (listas.length > 0) {
      /**
       * Una transaccion POR TABLA, no una global.
       *
       * Treinta tablas y decenas de miles de filas no caben en el techo de una
       * sola transaccion de Prisma, y una que se pasa de tiempo revienta a
       * mitad dejando la obra a medias igualmente. Por tabla, el fallo dice
       * exactamente donde paro.
       *
       * `createMany` escribe `createdAt` y `updatedAt` TAL COMO VIENEN porque
       * viajan en los datos: si se omitieran, Prisma los pondria a hoy y la
       * obra restaurada diria que se creo el dia que se recargo.
       */
      const delegado = (prisma as unknown as Record<string, DelegadoEscritura>)[
        tabla.modelo
      ]!;

      // En trozos, que `max_allowed_packet` tiene su limite y hay tablas con
      // decenas de miles de filas.
      for (let i = 0; i < listas.length; i += 500) {
        await delegado.createMany({ data: listas.slice(i, i + 500) });
      }
    }

    informe.push({ tabla: tabla.tabla, filas: listas.length, descartadas });
    total += listas.length;
  }

  if (perdidos.usuario > 0) {
    avisos.push(
      `${perdidos.usuario} referencia(s) a usuarios que ya no estan en la empresa. ` +
        `No se recrean: un usuario lleva su clave y su rol.`,
    );
  }
  if (perdidos.proveedor > 0) {
    avisos.push(
      `${perdidos.proveedor} referencia(s) a proveedores que ya no estan. El ` +
        `respaldo guarda su identificador, no su ficha, asi que no se pueden recrear.`,
    );
  }

  const descartadas = informe.reduce((n, t) => n + t.descartadas, 0);
  if (descartadas > 0) {
    avisos.push(`${descartadas} fila(s) descartadas por perder una referencia obligatoria.`);
  }

  if (manifiesto.contenido?.evidencia === "incluida") {
    avisos.push(
      "Las fotos del zip NO se han vuelto a colocar en el disco: se restauran " +
        "las fichas, no los archivos. Las imagenes apareceran rotas.",
    );
  }

  const obraId = mapa.resolver("projects", manifiesto.obra.id);

  await prisma.auditLog
    .create({
      data: {
        companyId: sesion.companyId,
        userId: sesion.userId,
        projectId: obraId,
        entidad: "Project",
        entidadId: obraId,
        accion: "CREATE",
        despues: {
          evento: "obra_restaurada",
          obraOriginalId: manifiesto.obra.id,
          nombreObra: manifiesto.obra.nombreObra,
          filas: total,
          avisos,
        },
      },
    })
    .catch(() => {});

  return {
    ok: true,
    datos: {
      obraId,
      nombreObra: manifiesto.obra.nombreObra,
      filas: total,
      tablas: informe,
      avisos,
    },
  };
}
