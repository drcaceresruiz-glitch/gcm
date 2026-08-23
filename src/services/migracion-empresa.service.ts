import "server-only";

import { ZipArchive } from "archiver";

import { prisma } from "@/lib/prisma";
import { nombreDeArchivo } from "@/lib/nombre-archivo";
import { puede } from "@/lib/rbac";
import { generarCsv } from "@/lib/csv";
import { adjuntarArchivos } from "@/lib/respaldo-archivos";
import {
  TABLAS_MIGRACION,
  filtroPorEmpresa,
} from "@/lib/respaldo-empresa-esquema";
import { serializarFila, type FilaJson } from "@/lib/respaldo-serializacion";
import {
  canonicalizar,
  sha256Hex,
  ENTRADA_FIRMA,
  ENTRADA_MANIFIESTO,
  type EntradaZip,
} from "@/lib/respaldo-manifiesto";
import {
  FORMATO_MIGRACION,
  TIPO_MIGRACION,
  firmarMigracion,
  nuevaSal,
  validarFrase,
  type ManifiestoMigracion,
} from "@/lib/respaldo-migracion";
import type { SesionActiva } from "@/services/sesion.service";

/**
 * La constructora entera, en un zip que se abre en OTRA instalacion.
 *
 * Es el hermano mayor de `respaldo.service` y comparte con el casi todo:
 * NDJSON por tabla, fotos transmitidas desde disco, manifiesto al final con
 * la huella de cada entrada. Tres cosas cambian, y las tres importan:
 *
 * **El alcance es la empresa, no una obra.** Viajan tambien los usuarios (con
 * su hash de contrasena), los contratistas y las plantillas de forma de pago,
 * porque el destino esta vacio y sin ellos no hay a quien enlazar.
 *
 * **La firma es una FRASE, no el secreto del servidor.** Un respaldo de obra
 * se firma con `HKDF(APP_SECRET, companyId)` y por eso no vale fuera de casa.
 * Aqui quien exporta elige una frase, la dice por telefono, y quien importa la
 * teclea. GCM no opera nada en medio, que es la condicion para que esto
 * funcione el dia que el producto sea un programa instalado.
 *
 * **La coherencia la da el CONGELADO, no el estado de la obra.** El respaldo
 * de obra exige `CERRADA`; una empresa no se cierra, asi que se exige
 * `enMigracionAt`. Ver `empresa-migracion.service`: sin eso, cuarenta
 * consultas seguidas sin transaccion dan un archivo desgarrado.
 */

interface EntradaDatos extends EntradaZip {
  contenido: string;
}

interface LecturaEmpresa {
  datos: EntradaDatos[];
  tablas: { tabla: string; filas: number }[];
  obras: number;
  fotos: FilaJson[];
  fotosGaleria: FilaJson[];
  comprobantes: FilaJson[];
}

export interface MigracionGenerada {
  archivo: NodeJS.ReadableStream;
  nombreArchivo: string;
}

export type ResultadoExportacion =
  | { ok: true; migracion: MigracionGenerada }
  | { ok: false; error: string };

/**
 * Arma el archivo de migracion de la empresa de la sesion.
 *
 * `frase` no se guarda en ningun sitio: se usa para derivar la clave de firma
 * y se olvida. Si quien exporta la pierde, el archivo no se puede dar por
 * bueno en destino y hay que volver a exportar. Es el precio de que GCM no
 * custodie nada, y se dice en la pantalla antes de empezar.
 */
export async function exportarEmpresa(
  sesion: SesionActiva,
  frase: string,
): Promise<ResultadoExportacion> {
  if (!puede(sesion, "empresa:migrar")) {
    return {
      ok: false,
      error:
        "Solo el administrador de la empresa puede sacarla para llevarla a otra instalación.",
    };
  }

  const v = validarFrase(frase);
  if (!v.ok) return { ok: false, error: v.error };

  const empresa = await prisma.company.findUnique({
    where: { id: sesion.companyId },
    select: {
      id: true,
      razonSocial: true,
      ruc: true,
      enMigracionAt: true,
    },
  });

  if (!empresa) return { ok: false, error: "No se encontró la empresa." };

  if (empresa.enMigracionAt === null) {
    return {
      ok: false,
      error:
        "Antes de exportar hay que poner la empresa en migración. Mientras no " +
        "esté congelada, sus obras siguen cambiando y el archivo saldría con " +
        "las partidas de un momento y los pagos de otro.",
    };
  }

  const lectura = await leerLaEmpresa(sesion.companyId);
  const sal = nuevaSal();

  const manifiesto: ManifiestoMigracion = {
    tipo: TIPO_MIGRACION,
    version: FORMATO_MIGRACION,
    sal,
    empresa: {
      id: empresa.id,
      razonSocial: empresa.razonSocial,
      ruc: empresa.ruc,
      obras: lectura.obras,
    },
    generado: {
      at: new Date().toISOString(),
      por: `${sesion.nombres} ${sesion.apellidos}`.trim(),
      userId: sesion.userId,
    },
    contenido: {
      evidencia: "omitida",
      galeria: "omitida",
      comprobantes: "omitida",
    },
    tablas: lectura.tablas,
    entradas: lectura.datos.map(({ nombre, bytes, sha256 }) => ({
      nombre,
      bytes,
      sha256,
    })),
  };

  const zip = new ZipArchive({ zlib: { level: 6 } });

  zip.on("warning", (e: Error) => {
    // Un ENOENT es un archivo que ya no esta en disco. No tumba la
    // exportacion: la fila sigue contando quien lo subio y con que huella.
    if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
  });

  for (const entrada of lectura.datos) {
    zip.append(Buffer.from(entrada.contenido, "utf8"), { name: entrada.nombre });
  }

  zip.append(Buffer.from(leeme(empresa.razonSocial), "utf8"), {
    name: "LEEME.txt",
  });
  zip.append(Buffer.from(resumenLegible(lectura), "utf8"), {
    name: "informe/resumen.csv",
  });

  // `ruta-completa` en las tres, y no es cosmetico: aqui caben las fotos de
  // todas las obras en la misma carpeta, y dos archivos distintos con el
  // mismo nombre de fichero se pisarian dentro del zip sin dar error.
  const conEvidencia = await adjuntarArchivos(
    zip,
    lectura.fotos,
    manifiesto.entradas,
    "evidencia",
    "ruta-completa",
  );
  manifiesto.contenido.evidencia = conEvidencia > 0 ? "incluida" : "omitida";

  const conGaleria = await adjuntarArchivos(
    zip,
    lectura.fotosGaleria,
    manifiesto.entradas,
    "galeria",
    "ruta-completa",
  );
  manifiesto.contenido.galeria = conGaleria > 0 ? "incluida" : "omitida";

  const conComprobantes = await adjuntarArchivos(
    zip,
    lectura.comprobantes,
    manifiesto.entradas,
    "comprobantes",
    "ruta-completa",
  );
  manifiesto.contenido.comprobantes =
    conComprobantes > 0 ? "incluida" : "omitida";

  const manifiestoJson = canonicalizar(manifiesto);
  zip.append(Buffer.from(manifiestoJson, "utf8"), { name: ENTRADA_MANIFIESTO });
  zip.append(
    Buffer.from(firmarMigracion(manifiestoJson, frase, sal), "utf8"),
    { name: ENTRADA_FIRMA },
  );

  await apuntarExportacion(sesion, lectura, manifiesto.generado.at);

  /**
   * El RECIBO, que es otra cosa que el apunte de auditoria de arriba.
   *
   * Se escribe cuando el zip TERMINA de salir —igual que el respaldo de una
   * obra, y por la misma razon— porque de el se apoya el borrado de la
   * constructora: si la descarga se corta a medias, no hubo exportacion y no
   * debe haber recibo. El apunte de auditoria si queda: alli lo que interesa
   * es que alguien lo intento.
   *
   * `void` y no `await`: la respuesta ya esta viajando cuando esto ocurre.
   */
  zip.on("end", () => {
    void prisma.exportacionEmpresa
      .create({
        data: {
          companyId: empresa.id,
          userId: sesion.userId,
          razonSocial: empresa.razonSocial,
          ruc: empresa.ruc,
          formato: FORMATO_MIGRACION,
          hashManifiesto: sha256Hex(manifiestoJson),
          tamano: zip.pointer(),
          obras: lectura.obras,
          conteos: Object.fromEntries(
            lectura.tablas.map((t) => [t.tabla, t.filas]),
          ),
        },
      })
      .catch(() => {
        // Un recibo que no se pudo escribir NO puede tumbar una exportacion ya
        // entregada. Lo que se pierde es el permiso para borrar despues, que
        // es el lado seguro de este fallo: obliga a exportar otra vez.
      });
  });

  void zip.finalize();

  const nombre = (empresa.ruc ?? empresa.id.slice(0, 8)).replace(/\W/g, "");

  return {
    ok: true,
    migracion: {
      archivo: zip,
      // El RUC y no la razon social: este archivo viaja entre instalaciones
      // y tiene que identificar a la constructora sin ambiguedad.
      nombreArchivo: nombreDeArchivo({
        ambito: nombre,
        documento: "migracion",
        fecha: new Date(),
        extension: "zip",
      }),
    },
  };
}

/**
 * El apunte de auditoria de la exportacion.
 *
 * Se escribe ANTES de que el zip termine de salir, al reves que el respaldo
 * de obra, y la diferencia es deliberada. Alli el apunte AUTORIZA el borrado,
 * asi que tiene que significar «el archivo llego entero». Aqui no autoriza
 * nada: es la constancia de que alguien se llevo la constructora completa, y
 * de eso interesa el INTENTO. Colgarlo del final permitiria sacar los datos y
 * cortar la descarga para no dejar rastro.
 */
async function apuntarExportacion(
  sesion: SesionActiva,
  lectura: LecturaEmpresa,
  at: string,
): Promise<void> {
  await prisma.auditLog.create({
    data: {
      companyId: sesion.companyId,
      userId: sesion.userId,
      entidad: "Company",
      entidadId: sesion.companyId,
      accion: "UPDATE",
      despues: {
        evento: "exportar_migracion",
        at,
        obras: lectura.obras,
        // La frase NO se audita: es el secreto que da por bueno el archivo.
        filas: Object.fromEntries(
          lectura.tablas.map((t) => [t.tabla, t.filas]),
        ),
      },
    },
  });
}

/** Lo minimo que hace falta de un delegado de Prisma para leer una tabla. */
interface DelegadoLectura {
  findMany: (args: unknown) => Promise<Record<string, unknown>[]>;
}

/**
 * Lee la empresa entera, tabla por tabla, en el orden del catalogo.
 *
 * Las obras se resuelven UNA vez y su lista vale para las cuarenta tablas:
 * `filtroPorEmpresa` la usa para acotar todo lo que cuelga de una obra sin
 * volver a preguntar por ellas en cada paso.
 *
 * Sin transaccion, a proposito y por lo mismo que el respaldo de obra:
 * envolver cuarenta consultas garantiza el P2028 y clava una conexion del
 * pool. Lo que da coherencia aqui es el congelado, que ya se comprobo arriba.
 */
async function leerLaEmpresa(companyId: string): Promise<LecturaEmpresa> {
  const obras = await prisma.project.findMany({
    where: { companyId },
    select: { id: true },
  });
  const obraIds = obras.map((o) => o.id);

  const datos: EntradaDatos[] = [];
  const tablas: { tabla: string; filas: number }[] = [];
  let fotos: FilaJson[] = [];
  let fotosGaleria: FilaJson[] = [];
  let comprobantes: FilaJson[] = [];

  for (const [indice, tabla] of TABLAS_MIGRACION.entries()) {
    const delegado = (prisma as unknown as Record<string, DelegadoLectura>)[
      tabla.modelo
    ]!;
    const crudas = await delegado.findMany({
      where: filtroPorEmpresa(tabla.tabla, companyId, obraIds),
    });

    const filas = crudas.map((cruda) => serializarFila(cruda, tabla));

    if (tabla.tabla === "fotos_evidencia") fotos = filas;
    if (tabla.tabla === "fotos_galeria") fotosGaleria = filas;
    if (tabla.tabla === "comprobantes_pago") comprobantes = filas;

    // NDJSON: una fila por linea, para poder leer un archivo grande sin
    // meterlo entero en memoria.
    const cabecera = JSON.stringify({ tabla: tabla.tabla, filas: filas.length });
    const contenido =
      [cabecera, ...filas.map((f) => JSON.stringify(f))].join("\n") + "\n";
    const numero = String(indice + 1).padStart(2, "0");

    datos.push({
      nombre: `datos/${numero}-${tabla.tabla}.ndjson`,
      contenido,
      bytes: Buffer.byteLength(contenido, "utf8"),
      sha256: sha256Hex(contenido),
    });
    tablas.push({ tabla: tabla.tabla, filas: filas.length });
  }

  return { datos, tablas, obras: obraIds.length, fotos, fotosGaleria, comprobantes };
}

/** El resumen que se puede abrir SIN GCM, con cualquier hoja de calculo. */
function resumenLegible(lectura: LecturaEmpresa): string {
  const filas: (string | number | null)[][] = [
    ["Tabla", "Filas"],
    ...lectura.tablas.map((t) => [t.tabla, t.filas]),
  ];
  return generarCsv(filas);
}

function leeme(razonSocial: string): string {
  return [
    `MIGRACION DE EMPRESA - ${razonSocial}`,
    "",
    "Que es esto",
    "-----------",
    "La constructora entera, para llevarla de esta instalacion de GCM a",
    "otra: sus usuarios, sus contratistas, sus obras con presupuesto,",
    "cronograma, avances, encargos, pagos y fotos.",
    "",
    "NO es un respaldo de obra. Un respaldo de obra solo se puede volver a",
    "cargar en la misma empresa que lo genero; este esta hecho para cruzar.",
    "",
    "Que hay dentro",
    "--------------",
    "  datos/         una entrada por tabla, en formato NDJSON (una fila por",
    "                 linea). El numero del nombre es el orden en que se montan.",
    "  evidencia/     las fotos de evidencia de todas las obras.",
    "  galeria/       las fotos de la galeria de avance.",
    "  comprobantes/  las constancias de pago a contratistas.",
    "  informe/       un resumen en CSV.",
    "  manifiesto.json / .sig   que lleva el archivo, y su firma.",
    "",
    "Los importes van como TEXTO y no como numero, a proposito: leerlos como",
    "numero decimal les quita precision, y aqui son dinero.",
    "",
    "La frase",
    "--------",
    "Este archivo se firmo con una FRASE que eligio quien lo exporto. Sin",
    "ella no se puede dar por bueno en la instalacion de destino, y GCM no",
    "la tiene guardada en ningun sitio: no puede recuperarla. Si se pierde,",
    "hay que volver a exportar.",
    "",
    "La firma prueba dos cosas: que el archivo no ha cambiado desde que se",
    "exporto, y que quien lo importa conoce esa frase. NO prueba de que",
    "instalacion salio.",
    "",
    "Cuidado",
    "-------",
    "Este archivo contiene DATOS PERSONALES de toda la constructora (nombres,",
    "correos y telefonos de su gente, de sus contratistas y de los contactos",
    "de aviso de cada obra) y las contrasenas de sus usuarios en forma de",
    "hash. Guardalo y mandalo como mandarias el expediente en papel.",
    "",
  ].join("\r\n");
}
