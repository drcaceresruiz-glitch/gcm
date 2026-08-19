import "server-only";
import { Open } from "unzipper";
import { createHash } from "node:crypto";
import { createWriteStream } from "node:fs";
import { mkdir, rm } from "node:fs/promises";
import { dirname, join, normalize, sep } from "node:path";
import { pipeline } from "node:stream/promises";

import { prisma } from "@/lib/prisma";
import { puede } from "@/lib/rbac";
import { env } from "@/lib/env";
import {
  ENTRADA_FIRMA,
  ENTRADA_MANIFIESTO,
  sha256Hex,
} from "@/lib/respaldo-manifiesto";
import {
  FORMATO_MIGRACION,
  TIPO_MIGRACION,
  migracionValida,
  validarFrase,
  type ManifiestoMigracion,
} from "@/lib/respaldo-migracion";
import {
  TABLAS_MIGRACION,
  filtroPorEmpresa,
  tablaDeMigracion,
} from "@/lib/respaldo-empresa-esquema";
import { deserializarFila, type FilaJson } from "@/lib/respaldo-serializacion";
import {
  MapaDeIds,
  ordenarPorPadres,
  remapearFila,
  reservarIds,
  type ReferenciasDeEmpresa,
} from "@/lib/respaldo-remapeo";
import type { SesionActiva } from "@/services/sesion.service";

/**
 * Meter una constructora entera venida de OTRA instalacion de GCM.
 *
 * Es la otra mitad de `migracion-empresa.service`. Lo que alli sale, aqui
 * entra: mismo catalogo, mismo formato, misma frase.
 *
 * TRES REGLAS QUE GOBIERNAN TODO LO DEMAS:
 *
 * **El destino tiene que estar VACIO.** Sin obras, sin contratistas y con un
 * solo usuario: el administrador que importa, que es el que creo el operador.
 * No es una comodidad de implementacion — es lo unico que impide mezclar dos
 * constructoras en una. Si se permitiera importar encima de datos existentes,
 * habria que decidir por cada fila si gana la de dentro o la de fuera, y no
 * hay respuesta buena para eso.
 *
 * **Los identificadores son NUEVOS.** Como en la restauracion de una obra:
 * conservar los del origen parece mas simple y choca en cuanto el mismo
 * archivo se importa dos veces.
 *
 * **Si algo falla a mitad, se deshace lo escrito.** Un import a medias deja
 * una empresa que ya no esta vacia, y por tanto no se puede reintentar. Se
 * borra en orden inverso al de insercion y se dice claramente que no quedo
 * nada.
 */

export type Resultado<T = void> =
  | ({ ok: true } & (T extends void ? object : { datos: T }))
  | { ok: false; error: string };

export interface InformeImportacion {
  razonSocialOrigen: string;
  obras: number;
  filas: number;
  tablas: { tabla: string; filas: number }[];
  archivos: number;
  avisos: string[];
}

interface Contenido {
  manifiesto: ManifiestoMigracion;
  /// tabla -> filas ya deserializadas.
  filas: Map<string, Record<string, unknown>[]>;
  /// Las entradas del zip que son archivos (fotos, comprobantes).
  archivos: { nombre: string; sha256: string }[];
}

/// Las carpetas de archivos del zip. Nada fuera de estas se copia al disco.
const CARPETAS_ARCHIVO = ["evidencia/", "galeria/", "comprobantes/"];

/**
 * Abre el zip, comprueba la frase y la huella de cada entrada.
 *
 * EL ORDEN NO ES NEGOCIABLE: primero la firma del manifiesto, y solo despues
 * se mira nada de lo que el archivo dice. Al reves se estaria confiando en una
 * lista de huellas que cualquiera pudo reescribir.
 *
 * Se lee desde un archivo en disco (`Open.file`) y no desde un Buffer: una
 * empresa con fotos puede pesar cientos de MB y no caben en memoria en este
 * hosting.
 */
async function leerElZip(
  rutaZip: string,
  frase: string,
): Promise<Resultado<Contenido>> {
  let directorio;
  try {
    directorio = await Open.file(rutaZip);
  } catch {
    return { ok: false, error: "El archivo no es un zip que se pueda abrir." };
  }

  const porNombre = new Map(directorio.files.map((f) => [f.path, f]));

  const entradaManifiesto = porNombre.get(ENTRADA_MANIFIESTO);
  const entradaFirma = porNombre.get(ENTRADA_FIRMA);

  if (!entradaManifiesto || !entradaFirma) {
    return {
      ok: false,
      error: "El zip no lleva manifiesto: no es un archivo de migración de GCM.",
    };
  }

  const manifiestoJson = (await entradaManifiesto.buffer()).toString("utf8");
  const firma = (await entradaFirma.buffer()).toString("utf8").trim();

  // La sal se lee del manifiesto SIN FIRMAR todavia, y no pasa nada: sirve
  // para derivar la clave, y una sal cambiada solo consigue que la firma no
  // valide. No decide nada por si misma.
  let sal: string;
  let tipo: string;
  try {
    const crudo = JSON.parse(manifiestoJson) as { sal?: string; tipo?: string };
    sal = crudo.sal ?? "";
    tipo = crudo.tipo ?? "";
  } catch {
    return { ok: false, error: "El manifiesto del archivo no se puede leer." };
  }

  if (tipo !== TIPO_MIGRACION) {
    return {
      ok: false,
      error:
        "Ese archivo no es una migración de empresa. El respaldo de UNA obra " +
        "se carga desde Archivo, no desde aquí.",
    };
  }

  if (!migracionValida(manifiestoJson, firma, frase, sal)) {
    // Un solo mensaje para «frase equivocada» y «archivo alterado»: separarlos
    // le diria a quien prueba cual de las dos cosas tiene que acertar.
    return {
      ok: false,
      error:
        "La frase no corresponde a este archivo, o el archivo está alterado. " +
        "Compruébala con quien te lo envió.",
    };
  }

  const manifiesto = JSON.parse(manifiestoJson) as ManifiestoMigracion;

  if (manifiesto.version > FORMATO_MIGRACION) {
    return {
      ok: false,
      error:
        `Este archivo se generó con una versión más nueva de GCM (formato ` +
        `${manifiesto.version}; esta instalación lee hasta ${FORMATO_MIGRACION}). ` +
        `Actualiza antes de importarlo.`,
    };
  }

  return leerLasEntradas(manifiesto, porNombre);
}

/// Lo minimo que hace falta de una entrada de `unzipper`.
interface EntradaZipLeible {
  path: string;
  buffer: () => Promise<Buffer>;
  stream: () => NodeJS.ReadableStream;
}

/**
 * Lee las tablas del zip y comprueba la huella de CADA entrada.
 *
 * La firma protege la LISTA de huellas; esto protege el contenido de cada
 * archivo de esa lista. Sin lo segundo, bastaria cambiar un `.ndjson` para
 * meter filas que el manifiesto sigue avalando.
 */
async function leerLasEntradas(
  manifiesto: ManifiestoMigracion,
  porNombre: Map<string, EntradaZipLeible>,
): Promise<Resultado<Contenido>> {
  const filas = new Map<string, Record<string, unknown>[]>();
  const archivos: { nombre: string; sha256: string }[] = [];

  for (const declarada of manifiesto.entradas) {
    const entrada = porNombre.get(declarada.nombre);
    if (!entrada) {
      return { ok: false, error: `Al zip le falta "${declarada.nombre}".` };
    }

    // Los binarios NO se cargan en memoria para comprobarlos: se copian al
    // disco despues, y su huella se comprueba mientras se copian.
    if (CARPETAS_ARCHIVO.some((c) => declarada.nombre.startsWith(c))) {
      archivos.push({ nombre: declarada.nombre, sha256: declarada.sha256 });
      continue;
    }

    if (!declarada.nombre.startsWith("datos/")) continue;

    const texto = (await entrada.buffer()).toString("utf8");

    if (sha256Hex(texto) !== declarada.sha256) {
      return {
        ok: false,
        error: `"${declarada.nombre}" no coincide con su huella: el archivo está alterado o corrupto.`,
      };
    }

    const lineas = texto.split("\n").filter((l) => l.trim() !== "");
    const cabecera = JSON.parse(lineas[0] ?? "{}") as { tabla?: string };
    const tabla = tablaDeMigracion(cabecera.tabla ?? "");

    if (!tabla) {
      return {
        ok: false,
        error:
          `El archivo trae la tabla "${cabecera.tabla}", que este GCM no conoce. ` +
          `Puede ser de una versión más nueva.`,
      };
    }

    filas.set(
      tabla.tabla,
      lineas
        .slice(1)
        .map((l) => deserializarFila(JSON.parse(l) as FilaJson, tabla)),
    );
  }

  return { ok: true, datos: { manifiesto, filas, archivos } };
}

/**
 * Que el destino este vacio de verdad.
 *
 * Se miran las tres cosas que hacen imposible mezclar sin decidir a mano:
 * obras, contratistas y personas. Del usuario se admite UNO —quien importa—,
 * porque el operador crea la empresa con su administrador y no hay forma de
 * llegar a esta pantalla sin el.
 */
async function destinoVacio(
  companyId: string,
  userId: string,
): Promise<string | null> {
  const [obras, proveedores, usuarios] = await Promise.all([
    prisma.project.count({ where: { companyId } }),
    prisma.proveedor.count({ where: { companyId } }),
    prisma.user.count({ where: { companyId, id: { not: userId } } }),
  ]);

  if (obras === 0 && proveedores === 0 && usuarios === 0) return null;

  const hay = [
    obras > 0 ? `${obras} obra(s)` : null,
    proveedores > 0 ? `${proveedores} contratista(s)` : null,
    usuarios > 0 ? `${usuarios} usuario(s) más` : null,
  ]
    .filter(Boolean)
    .join(", ");

  return (
    `Esta empresa ya tiene ${hay}. Una migración solo entra en una empresa ` +
    `recién creada y vacía: si entrara encima de lo que ya hay, habría que ` +
    `decidir dato por dato cuál manda, y eso no se puede hacer sin equivocarse. ` +
    `Pide a tu operador una empresa nueva. Si esto es el resto de un intento ` +
    `anterior que falló, avísale para que la vacíe.`
  );
}

/**
 * Que hacer con cada persona que viene en el archivo.
 *
 * El correo es unico en TODA la instalacion, no por empresa, asi que aqui hay
 * tres casos y solo uno es normal:
 *
 * - **No existe**: se crea con identificador nuevo. El caso corriente.
 * - **Es quien esta importando**: no se crea; se ata su identificador viejo al
 *   de la cuenta que ya tiene. Asi todo lo que le nombra —sus membresias, sus
 *   restricciones, las ordenes que aprobo— sigue apuntando a el.
 * - **Existe y es de OTRA empresa**: se RECHAZA la importacion entera. No se
 *   puede crear una segunda cuenta con ese correo, y renombrarlo en silencio
 *   fabricaria un acceso que su dueno no sabe que tiene y con el que no puede
 *   entrar.
 */
interface DecisionUsuarios {
  /// Identificadores VIEJOS cuyas filas no se insertan: su persona ya existe
  /// aqui y su identificador quedo atado al de la cuenta que ya tiene.
  omitir: Set<string>;
  /// Correos que pertenecen a alguien de otra empresa.
  ajenos: string[];
}

async function decidirUsuarios(
  entrantes: readonly Record<string, unknown>[],
  sesion: SesionActiva,
  mapa: MapaDeIds,
): Promise<DecisionUsuarios> {
  const correos = entrantes
    .map((u) => u["email"])
    .filter((e): e is string => typeof e === "string");

  const existentes = await prisma.user.findMany({
    where: { email: { in: correos } },
    select: { id: true, email: true, companyId: true },
  });

  const porCorreo = new Map(existentes.map((u) => [u.email, u]));
  const decision: DecisionUsuarios = { omitir: new Set(), ajenos: [] };

  for (const fila of entrantes) {
    const email = fila["email"];
    const idViejo = fila["id"];
    if (typeof email !== "string" || typeof idViejo !== "string") continue;

    const ya = porCorreo.get(email);
    if (!ya) continue;

    if (ya.companyId === sesion.companyId) {
      mapa.fijar("users", idViejo, ya.id);
      decision.omitir.add(idViejo);
    } else {
      decision.ajenos.push(email);
    }
  }

  return decision;
}

/** Lo minimo de un delegado de Prisma para escribir y para deshacer. */
interface DelegadoEscritura {
  createMany: (args: { data: Record<string, unknown>[] }) => Promise<unknown>;
  deleteMany: (args: { where: Record<string, unknown> }) => Promise<unknown>;
  updateMany: (args: {
    where: Record<string, unknown>;
    data: Record<string, unknown>;
  }) => Promise<unknown>;
}

function delegado(modelo: string): DelegadoEscritura {
  return (prisma as unknown as Record<string, DelegadoEscritura>)[modelo]!;
}

/**
 * En una migracion no hay referencias «a la empresa»: el catalogo las convirtio
 * todas en internas porque el usuario y el contratista viajan DENTRO.
 *
 * Si alguna vez se llama a esto, es que el catalogo tiene una externa sin
 * convertir, y eso hay que verlo — no resolverlo en silencio a null.
 */
const SIN_EXTERNAS: ReferenciasDeEmpresa = {
  usuario: () => {
    throw new Error(
      "El catálogo de migración dejó una referencia externa a usuario sin convertir.",
    );
  },
  proveedor: () => {
    throw new Error(
      "El catálogo de migración dejó una referencia externa a proveedor sin convertir.",
    );
  },
};

export async function importarEmpresa(
  sesion: SesionActiva,
  rutaZip: string,
  frase: string,
): Promise<Resultado<InformeImportacion>> {
  if (!puede(sesion, "empresa:migrar")) {
    return {
      ok: false,
      error: "Solo el administrador de la empresa puede importar una constructora.",
    };
  }

  const v = validarFrase(frase);
  if (!v.ok) return { ok: false, error: v.error };

  const ocupado = await destinoVacio(sesion.companyId, sesion.userId);
  if (ocupado) return { ok: false, error: ocupado };

  const lectura = await leerElZip(rutaZip, frase);
  if (!lectura.ok) return lectura;

  const { manifiesto, filas, archivos } = lectura.datos;
  const avisos: string[] = [];

  // Los identificadores de TODAS las tablas, reservados antes de traducir
  // nada: hay autorreferencias y el padre puede venir despues que la hija.
  const mapa = new MapaDeIds();
  for (const tabla of TABLAS_MIGRACION) {
    reservarIds(filas.get(tabla.tabla) ?? [], tabla.tabla, mapa);
  }

  // DESPUES de reservar y ANTES de escribir: `fijar` tiene que pisar el
  // identificador que `reservarIds` acaba de inventar para quien ya existe.
  const usuarios = await decidirUsuarios(
    filas.get("users") ?? [],
    sesion,
    mapa,
  );

  if (usuarios.ajenos.length > 0) {
    return {
      ok: false,
      error:
        `Estos correos ya pertenecen a personas de otra empresa de esta ` +
        `instalación: ${usuarios.ajenos.slice(0, 5).join(", ")}` +
        `${usuarios.ajenos.length > 5 ? "…" : ""}. Un correo identifica a una ` +
        `sola cuenta, así que no se puede importar sin decidir qué pasa con ` +
        `ellas. Habla con tu operador.`,
    };
  }

  /**
   * Quien ya tenia cuenta aqui ANTES de escribir nada.
   *
   * Se captura ahora y no en el `catch` porque alli ya no se podria
   * distinguir: las cuentas del archivo y las de esta instalacion estarian
   * mezcladas en la misma empresa, y deshacer se llevaria por delante la de
   * quien esta importando.
   */
  const usuariosPrevios = (
    await prisma.user.findMany({
      where: { companyId: sesion.companyId },
      select: { id: true },
    })
  ).map((u) => u.id);

  const informe: InformeImportacion["tablas"] = [];
  let total = 0;

  try {
    for (const tabla of TABLAS_MIGRACION) {
      const origen = filas.get(tabla.tabla) ?? [];
      if (origen.length === 0) {
        informe.push({ tabla: tabla.tabla, filas: 0 });
        continue;
      }

      const listas: Record<string, unknown>[] = [];

      // El padre ANTES que la hija: `wbs_items.parentId` es autorreferente y
      // Restrict, y el orden del archivo no garantiza nada.
      for (const cruda of ordenarPorPadres(origen, tabla)) {
        // La persona que ya existe aqui no se vuelve a crear: su identificador
        // viejo quedo atado al de su cuenta en `decidirUsuarios`, asi que todo
        // lo que la nombra sigue apuntando a ella.
        if (
          tabla.tabla === "users" &&
          typeof cruda["id"] === "string" &&
          usuarios.omitir.has(cruda["id"])
        ) {
          continue;
        }

        const r = remapearFila(cruda, tabla, mapa, SIN_EXTERNAS);
        if (r.fila === null) continue;

        /**
         * LA EMPRESA SE REESCRIBE SIEMPRE, en cualquier tabla que la lleve.
         *
         * Es lo que hace que el archivo sea de la constructora de DESTINO y
         * no de la de origen. Se hace de forma generica —«si la fila tiene
         * companyId»— y no con una lista de tablas, para que una tabla nueva
         * quede cubierta el dia que se anada, en vez de colarse con la
         * empresa de otra instalacion escrita dentro.
         */
        if ("companyId" in r.fila) r.fila["companyId"] = sesion.companyId;

        /**
         * LA RUTA DEL ARCHIVO, SIEMPRE CON BARRAS NORMALES.
         *
         * `ruta` se guarda con el separador del sistema que subio el archivo.
         * Migrar de un servidor Linux a un PC con Windows —que es el caso
         * principal de todo esto— traeria `fotos/x/y.jpg`, y al reves
         * `fotos\x\y.jpg`. Con `/` funciona en los dos: `path.join` en Windows
         * acepta las barras normales, y en Linux ya son las suyas.
         *
         * Sin esto, la ficha llega bien y la foto no aparece: el fallo mas
         * caro de diagnosticar de los dos.
         */
        const ruta = r.fila["ruta"];
        if (typeof ruta === "string") {
          r.fila["ruta"] = ruta.replace(/\\/g, "/");
        }

        listas.push(r.fila);
      }

      if (listas.length > 0) {
        // En trozos: `max_allowed_packet` tiene su limite y hay tablas con
        // decenas de miles de filas. `createMany` respeta `createdAt` tal
        // como viene, que es lo que hace que la copia no diga que se creo hoy.
        for (let i = 0; i < listas.length; i += 500) {
          await delegado(tabla.modelo).createMany({
            data: listas.slice(i, i + 500),
          });
        }
      }

      informe.push({ tabla: tabla.tabla, filas: listas.length });
      total += listas.length;
    }
  } catch (e) {
    // Un import a medias deja la empresa sin poder reintentarse: ya no esta
    // vacia. Se deshace lo escrito antes de devolver el error, protegiendo a
    // quien ya tenia cuenta aqui.
    await deshacer(sesion.companyId, usuariosPrevios);
    throw e;
  }

  /**
   * Las fotos y los comprobantes, al disco.
   *
   * Se hace DESPUES de las filas y a proposito fuera del `try` que deshace:
   * un archivo que no se copia deja una imagen rota, que es un fallo visible y
   * reparable; deshacer la empresa entera por eso seria mucho peor. Se cuenta
   * en el informe.
   *
   * Aqui esta la diferencia con la restauracion de UNA obra, que no copia los
   * binarios y avisa de que las imagenes apareceran rotas. En una migracion
   * eso no vale: la constructora tiene que llegar entera.
   */
  const copiados = await copiarArchivos(rutaZip, archivos);

  if (copiados.fallidos > 0) {
    avisos.push(
      `${copiados.fallidos} archivo(s) no se pudieron copiar al disco. Sus ` +
        `fichas están, pero la imagen o el PDF aparecerán rotos.`,
    );
  }

  if (usuarios.omitir.size > 0) {
    avisos.push(
      `${usuarios.omitir.size} persona(s) del archivo ya tenían cuenta aquí: ` +
        `se conservó la cuenta existente y todo lo que las nombra apunta a ella.`,
    );
  }

  avisos.push(
    "El buzón de correo y el teléfono de los SMS NO viajan: sus credenciales " +
      "estaban atadas a la instalación de origen. Hay que configurarlos de nuevo.",
  );

  await prisma.auditLog
    .create({
      data: {
        companyId: sesion.companyId,
        userId: sesion.userId,
        entidad: "Company",
        entidadId: sesion.companyId,
        accion: "CREATE",
        despues: {
          evento: "importar_migracion",
          origen: {
            empresaId: manifiesto.empresa.id,
            razonSocial: manifiesto.empresa.razonSocial,
            ruc: manifiesto.empresa.ruc,
            generado: manifiesto.generado,
          },
          filas: total,
          archivos: copiados.puestos,
        },
      },
    })
    .catch(() => {});

  return {
    ok: true,
    datos: {
      razonSocialOrigen: manifiesto.empresa.razonSocial,
      obras: manifiesto.empresa.obras,
      filas: total,
      tablas: informe,
      archivos: copiados.puestos,
      avisos,
    },
  };
}

/**
 * Copia al disco las fotos y los comprobantes que trae el zip.
 *
 * La entrada se llama `evidencia/<ruta>`, donde `<ruta>` es exactamente lo que
 * guarda la columna `ruta` de la fila. Se le quita la carpeta de delante y se
 * escribe en `STORAGE_ROOT/<ruta>`: asi la fila importada encuentra su archivo
 * SIN tocar la columna. Esa ruta lleva dentro el identificador VIEJO de la
 * obra, y da igual: es un nombre de carpeta, no una clave que nadie resuelva.
 *
 * La huella se comprueba MIENTRAS se copia, no despues: leer el archivo dos
 * veces por cada foto de una constructora entera es un paseo por el disco que
 * no hace falta dar.
 */
async function copiarArchivos(
  rutaZip: string,
  archivos: readonly { nombre: string; sha256: string }[],
): Promise<{ puestos: number; fallidos: number }> {
  if (archivos.length === 0) return { puestos: 0, fallidos: 0 };

  const directorio = await Open.file(rutaZip);
  const porNombre = new Map(
    directorio.files.map((f) => [f.path, f as unknown as EntradaZipLeible]),
  );

  const raiz = normalize(env.STORAGE_ROOT);
  let puestos = 0;
  let fallidos = 0;

  for (const archivo of archivos) {
    const entrada = porNombre.get(archivo.nombre);
    if (!entrada) {
      fallidos += 1;
      continue;
    }

    // Se le quita la carpeta del zip (`evidencia/`, `galeria/`…) para
    // recuperar la ruta tal cual la guarda la fila.
    const relativa = archivo.nombre.slice(archivo.nombre.indexOf("/") + 1);
    const destino = normalize(join(raiz, relativa));

    /**
     * DEFENSA CONTRA EL ZIP CON RUTAS HACIA ARRIBA.
     *
     * Un `../../..` dentro del nombre de una entrada escribiria fuera del
     * almacen —en el codigo de la aplicacion, por ejemplo—. La firma no
     * protege de esto: quien fabrica el archivo conoce la frase, porque la
     * eligio el. Se comprueba que el destino cae DENTRO de la raiz.
     */
    if (destino !== raiz && !destino.startsWith(raiz + sep)) {
      fallidos += 1;
      continue;
    }

    try {
      await mkdir(dirname(destino), { recursive: true });

      const huella = createHash("sha256");
      const flujo = entrada.stream();
      flujo.on("data", (trozo: Buffer) => huella.update(trozo));

      await pipeline(flujo, createWriteStream(destino));

      if (huella.digest("hex") !== archivo.sha256) {
        // Un archivo que no cuadra con su huella no se queda en el disco: es
        // peor tener una foto alterada que no tenerla.
        await rm(destino, { force: true });
        fallidos += 1;
        continue;
      }

      puestos += 1;
    } catch {
      fallidos += 1;
    }
  }

  return { puestos, fallidos };
}

/**
 * Deshace una importacion que fallo a mitad.
 *
 * POR QUE EXISTE: el destino tiene que estar vacio para importar, asi que una
 * importacion a medias se convierte en una empresa que ya no admite el
 * reintento. Sin esto, el unico arreglo seria que el operador borrara la
 * empresa y la volviera a crear.
 *
 * Se recorre el catalogo AL REVES, hoja a raiz, igual que el borrado de una
 * obra: no se confia en las cascadas del motor a traves de cuarenta tablas.
 *
 * `protegidos` son los usuarios que YA estaban en el destino —el
 * administrador que importa—. Sin esa exclusion, deshacer se llevaria por
 * delante la cuenta de quien lo esta intentando.
 */
async function deshacer(
  companyId: string,
  protegidos: readonly string[],
): Promise<void> {
  const obras = await prisma.project.findMany({
    where: { companyId },
    select: { id: true },
  });
  const obraIds = obras.map((o) => o.id);

  for (const tabla of [...TABLAS_MIGRACION].reverse()) {
    const donde = filtroPorEmpresa(tabla.tabla, companyId, obraIds);

    const filtro =
      tabla.tabla === "users"
        ? { ...donde, id: { notIn: [...protegidos] } }
        : donde;

    /**
     * La jerarquia se rompe ANTES de borrarla.
     *
     * `wbs_items.parentId` es autorreferente y Restrict: un `deleteMany` sobre
     * filas que se apuntan entre si falla. Es exactamente lo que ya hace el
     * borrado de una obra, y sin esto el `deshacer` fallaria en silencio —
     * lleva `.catch`— dejando la empresa a medias y sin poder reintentar, que
     * es justo lo que este bloque existe para evitar.
     */
    const propios = tabla.refs.filter((r) => r.a === tabla.tabla);
    for (const ref of propios) {
      await delegado(tabla.modelo)
        .updateMany({ where: filtro, data: { [ref.campo]: null } })
        .catch(() => {});
    }

    // Si una tabla falla al borrar no se aborta el resto: dejar a medias el
    // deshacer es peor que intentarlo entero y contar lo que quedo.
    await delegado(tabla.modelo)
      .deleteMany({ where: filtro })
      .catch(() => {});
  }
}

/**
 * Si esta empresa puede RECIBIR una constructora, para pintarlo en la pantalla.
 *
 * Devuelve el mismo motivo que rechazaria la importacion, no uno parecido: si
 * la pantalla explicara una cosa y el servicio otra, la gente probaria a
 * importar para averiguar cual de las dos manda.
 */
export async function puedeRecibirMigracion(
  sesion: SesionActiva,
): Promise<{ vacia: boolean; motivo: string | null }> {
  if (!puede(sesion, "empresa:migrar")) return { vacia: false, motivo: null };

  const motivo = await destinoVacio(sesion.companyId, sesion.userId);
  return { vacia: motivo === null, motivo };
}
