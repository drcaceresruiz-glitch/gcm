import "server-only";

import { ZipArchive } from "archiver";

import { prisma } from "@/lib/prisma";
import { puede } from "@/lib/rbac";
import { env } from "@/lib/env";
import { generarCsv } from "@/lib/csv";
import { adjuntarArchivos } from "@/lib/respaldo-archivos";
import { FORMATO_RESPALDO, TABLAS, filtroPorObra } from "@/lib/respaldo-esquema";
import { serializarFila, type FilaJson } from "@/lib/respaldo-serializacion";
import {
  canonicalizar,
  claveDeRespaldo,
  firmar,
  sha256Hex,
  ENTRADA_FIRMA,
  ENTRADA_MANIFIESTO,
  TIPO_RESPALDO,
  type EntradaZip,
  type Manifiesto,
} from "@/lib/respaldo-manifiesto";
import type { SesionActiva } from "@/services/sesion.service";

/**
 * El respaldo completo de una obra, en un zip.
 *
 * Tres decisiones que gobiernan todo lo demas:
 *
 * **Solo obras CERRADAS.** No es una restriccion de producto, es lo que hace
 * coherente al archivo: el respaldo se lee SIN transaccion —envolver treinta
 * consultas en una garantiza el P2028 y ademas clava una conexion del pool— y
 * lo unico que impide que salga desgarrado, con las partidas de un instante y
 * las ordenes de otro, es que nadie pueda escribir mientras. Eso ya lo
 * garantiza la guarda de obra cerrada en cada servicio.
 *
 * **Los datos se arman en memoria; las fotos se transmiten desde disco.** Las
 * filas de una obra real son unos pocos MB; las fotos pueden ser cientos y no
 * caben en memoria en este hosting.
 *
 * **El manifiesto va al FINAL del zip.** Lleva el hash de cada entrada, asi
 * que no puede escribirse antes de saber que hay dentro. Para leerlo da igual:
 * un zip se recorre por su directorio central, que tambien esta al final.
 */

interface EntradaDatos extends EntradaZip {
  contenido: string;
}

interface LecturaObra {
  datos: EntradaDatos[];
  tablas: { tabla: string; filas: number }[];
  fotos: FilaJson[];
  /// Las de la galeria van aparte de las de evidencia: viajan en su propia
  /// carpeta del zip y el manifiesto las declara por separado.
  fotosGaleria: FilaJson[];
  /**
   * Las constancias de pago (PDF o imagen).
   *
   * En su propia carpeta y no con la evidencia, por lo mismo que estan en su
   * propia tabla: la evidencia se ensena en la galeria, y la galeria tiene un
   * enlace que ve el CLIENTE. Que en el zip vayan mezcladas invitaria a
   * volverlas a mezclar al restaurarlas.
   */
  comprobantes: FilaJson[];
  hashDatos: string;
}

export interface RespaldoGenerado {
  archivo: NodeJS.ReadableStream;
  nombreArchivo: string;
}

export type ResultadoRespaldo =
  | { ok: true; respaldo: RespaldoGenerado }
  | { ok: false; error: string };

/**
 * Arma el respaldo de una obra cerrada.
 *
 * Pide `obra:eliminar_cerrada` y no `obra:leer`: el zip lleva la obra ENTERA
 * —incluidos nombres, correos y celulares de los pases y contactos de aviso—
 * y sacarlo del sistema es, en la practica, el mismo poder que borrarla. Al
 * ser un permiso innegociable, solo lo tiene el ADMIN.
 */
export async function generarRespaldoDeObra(
  sesion: SesionActiva,
  obraId: string,
): Promise<ResultadoRespaldo> {
  if (!puede(sesion, "obra:eliminar_cerrada")) {
    return {
      ok: false,
      error:
        "Solo el administrador de la empresa puede descargar el respaldo de una obra.",
    };
  }

  // El filtro por empresa sale de la sesion. Todo lo demas cuelga de esta
  // consulta: si la obra no es de esta empresa, no hay nada mas que leer.
  const obra = await prisma.project.findFirst({
    where: { id: obraId, companyId: sesion.companyId },
    select: {
      id: true,
      nombreObra: true,
      correlativo: true,
      codigoObra: true,
      estado: true,
      company: { select: { id: true, razonSocial: true, ruc: true } },
    },
  });

  if (!obra) return { ok: false, error: "No se encontro la obra." };

  if (obra.estado !== "CERRADA") {
    return {
      ok: false,
      error:
        "Solo se respalda una obra CERRADA. Mientras la obra sigue viva sus " +
        "cifras cambian, y el archivo saldria con las partidas de un momento " +
        "y las ordenes de otro.",
    };
  }

  const lectura = await leerLaObra(obraId);

  const manifiesto: Manifiesto = {
    tipo: TIPO_RESPALDO,
    version: FORMATO_RESPALDO,
    empresa: {
      id: obra.company.id,
      razonSocial: obra.company.razonSocial,
      ruc: obra.company.ruc,
    },
    obra: {
      id: obra.id,
      nombreObra: obra.nombreObra,
      correlativo: obra.correlativo,
      codigoObra: obra.codigoObra,
      estado: obra.estado,
    },
    generado: {
      at: new Date().toISOString(),
      por: `${sesion.nombres} ${sesion.apellidos}`.trim(),
      userId: sesion.userId,
    },
    contenido: { evidencia: "omitida" },
    tablas: lectura.tablas,
    // Solo nombre, tamano y hash: el CONTENIDO no entra aqui, o el manifiesto
    // llevaria la obra entera dentro de si mismo.
    entradas: lectura.datos.map(({ nombre, bytes, sha256 }) => ({
      nombre,
      bytes,
      sha256,
    })),
  };

  const zip = new ZipArchive({ zlib: { level: 6 } });

  zip.on("warning", (e: Error) => {
    // Un ENOENT es una foto que ya no esta en disco. No debe tumbar el
    // respaldo: el registro de que existio sigue en `fotos_evidencia`, con su
    // huella y quien la subio.
    if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
  });

  for (const entrada of lectura.datos) {
    zip.append(Buffer.from(entrada.contenido, "utf8"), { name: entrada.nombre });
  }

  zip.append(Buffer.from(leeme(obra.nombreObra), "utf8"), { name: "LEEME.txt" });
  zip.append(Buffer.from(resumenLegible(lectura), "utf8"), {
    name: "informe/resumen.csv",
  });

  const conFotos = await adjuntarArchivos(
    zip,
    lectura.fotos,
    manifiesto.entradas,
    "evidencia",
  );
  manifiesto.contenido.evidencia = conFotos > 0 ? "incluida" : "omitida";

  const conGaleria = await adjuntarArchivos(
    zip,
    lectura.fotosGaleria,
    manifiesto.entradas,
    "galeria",
  );
  manifiesto.contenido.galeria = conGaleria > 0 ? "incluida" : "omitida";

  /**
   * Las constancias de pago.
   *
   * Viajan por lo mismo que la evidencia, pero pesa mas: sin ellas, el zip
   * dice cuanto se le pago a cada contratista y NO puede demostrarlo. La
   * constancia es justo lo que se busca en la discusion de seis meses
   * despues, que es la razon por la que GCM la pide en el momento del pago.
   */
  const conComprobantes = await adjuntarArchivos(
    zip,
    lectura.comprobantes,
    manifiesto.entradas,
    "comprobantes",
  );
  manifiesto.contenido.comprobantes =
    conComprobantes > 0 ? "incluida" : "omitida";

  const manifiestoJson = canonicalizar(manifiesto);
  const firma = firmar(
    manifiestoJson,
    claveDeRespaldo(env.APP_SECRET, sesion.companyId),
  );
  zip.append(Buffer.from(manifiestoJson, "utf8"), { name: ENTRADA_MANIFIESTO });
  zip.append(Buffer.from(firma, "utf8"), { name: ENTRADA_FIRMA });

  // El apunte se escribe cuando el zip TERMINA de salir, no antes: es la
  // prueba de que hubo respaldo, y de el se apoya el borrado. Si la descarga
  // se corta a medias, no hay respaldo y no debe haber apunte.
  zip.on("end", () => {
    void prisma.respaldoObra
      .create({
        data: {
          companyId: sesion.companyId,
          projectId: obra.id,
          userId: sesion.userId,
          nombreObra: obra.nombreObra,
          correlativo: obra.correlativo,
          formato: FORMATO_RESPALDO,
          hashDatos: lectura.hashDatos,
          tamano: zip.pointer(),
          conteos: Object.fromEntries(
            lectura.tablas.map((t) => [t.tabla, t.filas]),
          ),
          // "Los archivos de la obra viajaron", vengan de la evidencia, de la
          // galeria o de las constancias de pago: es la condicion que el
          // borrado comprueba antes de llevarse los archivos del disco.
          // Los comprobantes cuentan aqui desde que viajan; si no, el borrado
          // se creeria autorizado a tirar un PDF que el zip no llevaba.
          conFotos: conFotos > 0 || conGaleria > 0 || conComprobantes > 0,
        },
      })
      .catch(() => {
        // Que falle el apunte no debe romper una descarga ya entregada. El
        // efecto es que el borrado seguira pidiendo un respaldo: se vuelve a
        // descargar, que es el lado seguro del fallo.
      });
  });

  void zip.finalize();

  const marca = new Date().toISOString().slice(0, 10);
  const nombre = obra.correlativo ?? obra.id.slice(0, 8);

  return {
    ok: true,
    respaldo: { archivo: zip, nombreArchivo: `${nombre}-respaldo-${marca}.zip` },
  };
}

/** Lo minimo que hace falta de un delegado de Prisma para leer una tabla. */
interface DelegadoLectura {
  findMany: (args: unknown) => Promise<Record<string, unknown>[]>;
}

/**
 * Lee la obra entera, tabla por tabla, en el orden del catalogo.
 *
 * El filtro sale de `filtroPorObra`, el MISMO que usa el borrado. No es un
 * ahorro de codigo: es la garantia de que lo que el respaldo guarda y lo que
 * el borrado se lleva son exactamente las mismas filas. Si cada uno tuviera su
 * criterio, el dia que divergieran se borraria algo que el zip no tiene.
 *
 * El aislamiento por empresa se hereda de la consulta de la obra, que ya
 * filtro por `companyId`: todo lo demas cuelga de ese `projectId`.
 */
async function leerLaObra(obraId: string): Promise<LecturaObra> {
  const datos: EntradaDatos[] = [];
  const tablas: { tabla: string; filas: number }[] = [];
  let fotos: FilaJson[] = [];
  let fotosGaleria: FilaJson[] = [];
  let comprobantes: FilaJson[] = [];

  for (const [indice, tabla] of TABLAS.entries()) {
    const delegado = (prisma as unknown as Record<string, DelegadoLectura>)[
      tabla.modelo
    ]!;
    const crudas = await delegado.findMany({
      where: filtroPorObra(tabla.tabla, obraId),
    });

    const filas = crudas.map((cruda) => serializarFila(cruda, tabla));

    if (tabla.tabla === "fotos_evidencia") fotos = filas;
    if (tabla.tabla === "fotos_galeria") fotosGaleria = filas;
    if (tabla.tabla === "comprobantes_pago") comprobantes = filas;

    // NDJSON: una fila por linea. Permite leer un respaldo grande sin meter
    // todo el archivo en memoria, y que un `diff` senale la fila que cambio.
    const cabecera = JSON.stringify({ tabla: tabla.tabla, filas: filas.length });
    const contenido = [cabecera, ...filas.map((f) => JSON.stringify(f))].join("\n") + "\n";
    const numero = String(indice + 1).padStart(2, "0");

    datos.push({
      nombre: `datos/${numero}-${tabla.tabla}.ndjson`,
      contenido,
      bytes: Buffer.byteLength(contenido, "utf8"),
      sha256: sha256Hex(contenido),
    });
    tablas.push({ tabla: tabla.tabla, filas: filas.length });
  }

  return {
    datos,
    tablas,
    fotos,
    fotosGaleria,
    comprobantes,
    // Una sola huella de TODOS los datos: es la que ata el apunte de
    // `respaldos_obra` con el archivo que el usuario tiene en su disco.
    hashDatos: sha256Hex(datos.map((d) => d.sha256).join("")),
  };
}

/**
 * El resumen que se puede abrir SIN GCM.
 *
 * Un respaldo que solo se entiende con la aplicacion que lo genero sirve de
 * poco el dia que hace falta: se abre delante de un cliente, de un auditor o
 * de un abogado. Va por `generarCsv`, que ya pone el BOM —sin el, Excel en
 * Windows destroza las tildes—, la linea `sep=;` y la defensa contra la
 * inyeccion de formulas, que aqui importa porque las descripciones de partida
 * salen de un Excel que subio el usuario.
 */
function resumenLegible(lectura: LecturaObra): string {
  const filas: (string | number | null)[][] = [
    ["Tabla", "Filas"],
    ...lectura.tablas.map((t) => [t.tabla, t.filas]),
  ];
  return generarCsv(filas);
}

function leeme(nombreObra: string): string {
  return [
    `RESPALDO DE OBRA - ${nombreObra}`,
    "",
    "Que es esto",
    "-----------",
    "La copia completa de una obra de GCM: sus partidas, presupuesto,",
    "ordenes de compra, cronograma, avances, plan semanal, encargos a",
    "proveedores y las fotos de evidencia.",
    "",
    "Que hay dentro",
    "--------------",
    "  datos/       una entrada por tabla, en formato NDJSON (una fila por",
    "               linea). El numero del nombre es el orden en que se montan.",
    "  evidencia/   las fotos de evidencia, tal cual se subieron.",
    "  galeria/     las fotos de la galeria de avance, tal cual se subieron.",
    "  informe/     un resumen en CSV que se abre con cualquier hoja de calculo.",
    "  manifiesto.json / .sig   que lleva el archivo, y su firma.",
    "",
    "Los importes van como TEXTO y no como numero, a proposito: leerlos como",
    "numero decimal les quita precision, y aqui son dinero.",
    "",
    "Como se vuelve a abrir",
    "----------------------",
    "Desde GCM, en la pantalla de cargar respaldo. La obra se despliega en",
    "modo AUDITORIA: se ve entera y no se puede modificar nada.",
    "Solo se puede cargar en la MISMA empresa que lo genero.",
    "",
    "Cuidado",
    "-------",
    "Este archivo contiene DATOS PERSONALES (nombres, correos y telefonos de",
    "quien tuvo acceso a la obra y de los contactos de aviso). Guardalo como",
    "guardarias el expediente en papel.",
    "",
    "La firma prueba que el archivo salio de esta instalacion de GCM y que no",
    "se ha tocado desde entonces. No prueba quien lo genero.",
    "",
  ].join("\r\n");
}
