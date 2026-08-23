import "server-only";
import { PDFDocument } from "pdf-lib";

import { esCero, sumar } from "@/lib/decimal";
import { cifrasDeLaMeta } from "@/lib/costo-meta";
import { soles } from "@/utils/formato";
import {
  A4_VERTICAL,
  bolsaDeLinea,
  paginasDelPresupuesto,
  type DatosPresupuesto,
  type LineaPresupuesto,
} from "@/lib/presupuesto-pdf";
import { aWinAnsi } from "@/lib/pdf-texto";
import { listarPartidas, obtenerObra, type PartidaFila } from "@/services/obras.service";
import { obtenerEmpresa } from "@/services/empresa.service";
import { metaQueManda } from "@/services/meta.service";
import { lineasDelBorrador } from "@/services/meta-edicion.service";
import { prisma } from "@/lib/prisma";
import { puede } from "@/lib/rbac";
import type { SesionActiva } from "@/services/sesion.service";
import {
  cargarFuentes,
  medidorCon,
  pintarDocumento,
} from "@/services/pdf-pintor.service";

/**
 * Los presupuestos en PDF: contractual, meta y la comparativa.
 *
 * El contractual es el UNICO que puede salir de la empresa, y por eso es el
 * unico que no lleva ni una cifra de costo: ni el real, ni el recargo, ni la
 * bolsa, ni los gastos generales. Los otros dos van rotulados como internos,
 * en rojo y en la primera linea, para que no se manden por descuido.
 *
 * La maquetacion vive en `lib/presupuesto-pdf` -pura y probada- y el pintor
 * en `pdf-pintor.service`, el mismo que dibuja el informe al corte: no hay
 * dos paletas ni dos formas de dibujar una tabla.
 */

export type DocumentoPresupuesto = "contractual" | "meta" | "comparativa";

export type ResultadoPdf =
  | { ok: true; bytes: Uint8Array; nombre: string }
  | { ok: false; estado: 403 | 404; error: string };

/// Las partidas del contractual, tal como estan en el arbol de la obra.
function comoLineas(filas: readonly PartidaFila[]): LineaPresupuesto[] {
  return filas.map((f) => ({
    codigo: f.codigoPartida,
    descripcion: f.descripcion,
    tipo: f.tipo,
    unidad: f.unidad,
    metrado: f.metrado,
    precioUnitario: f.precioUnitario,
    parcial: f.parcial,
  }));
}

/**
 * Solo las HOJAS suman.
 *
 * Un capitulo lleva la suma de lo que cuelga de el, asi que sumar capitulos y
 * partidas a la vez contaria el mismo dinero dos veces. Es la misma regla que
 * `sumarHojas` aplica en el importador.
 */
function totalDeHojas(filas: readonly PartidaFila[]): string {
  const conHijas = new Set(filas.map((f) => f.parentId).filter(Boolean));
  return sumar(
    filas
      .filter((f) => !conHijas.has(f.id))
      .map((f) => f.parcial)
      .filter((p): p is string => p !== null),
  );
}

export async function generarPresupuestoPdf(
  sesion: SesionActiva,
  obraId: string,
  documento: DocumentoPresupuesto,
): Promise<ResultadoPdf> {
  if (!puede(sesion, "partida:leer")) {
    return { ok: false, estado: 403, error: "Sin permiso." };
  }

  // Ata la obra a la empresa de quien mira, como toda lectura de obra.
  const obra = await obtenerObra(sesion, obraId);
  if (!obra) return { ok: false, estado: 404, error: "Obra no encontrada." };

  /**
   * Los dos internos exigen ADEMAS `meta:leer`.
   *
   * `partida:leer` abre el contractual, que es el presupuesto de venta y lo
   * ve cualquiera que trabaje en la obra. El costo real y la bolsa son otra
   * cosa: es el margen de la empresa, y de esa lista se excluye a proposito
   * al perfil del cliente.
   */
  if (documento !== "contractual" && !puede(sesion, "meta:leer")) {
    return {
      ok: false,
      estado: 403,
      error: "Sin permiso para ver el presupuesto meta.",
    };
  }

  const [empresa, arbol] = await Promise.all([
    obtenerEmpresa(sesion),
    listarPartidas(sesion, obraId),
  ]);

  /**
   * El membrete y la firma: los cuatro datos que el papel del cliente lleva y
   * GCM no ensenaba, aunque tres de ellos ya estuvieran en el modelo.
   *
   * El residente sale de la pertenencia a la obra, no de quien descarga: el
   * que firma un presupuesto es el que responde por el, y casi nunca es quien
   * pulsa el boton.
   */
  const [residente, cronograma] = await Promise.all([
    prisma.projectMembership.findFirst({
      where: {
        projectId: obraId,
        project: { companyId: sesion.companyId },
        user: { role: "RESIDENTE", estado: "ACTIVO" },
      },
      select: {
        user: { select: { nombres: true, apellidos: true, colegiatura: true } },
      },
    }),
    prisma.cronograma.findFirst({
      where: { projectId: obraId, project: { companyId: sesion.companyId } },
      orderBy: { version: "desc" },
      select: { nombreProyecto: true },
    }),
  ]);

  const comun = {
    empresa: empresa?.razonSocial ?? "",
    ruc: empresa?.ruc ?? null,
    obra: obra.nombreObra,
    ubicacion: obra.ubicacion,
    programa: cronograma?.nombreProyecto ?? null,
    residente: residente
      ? {
          nombre: `${residente.user.nombres} ${residente.user.apellidos}`.trim(),
          colegiatura: residente.user.colegiatura,
        }
      : null,
  };

  const datos =
    documento === "contractual"
      ? await datosContractual(comun, arbol.filas)
      : documento === "meta"
        ? await datosMeta(sesion, obraId, comun)
        : await datosComparativa(sesion, obraId, comun, arbol.filas);

  if (datos === null) {
    return {
      ok: false,
      estado: 404,
      error: "Esta obra todavía no tiene presupuesto meta cargado.",
    };
  }

  const pdf = await PDFDocument.create();
  pdf.setTitle(`${datos.titulo} - ${aWinAnsi(obra.nombreObra)}`);
  pdf.setCreator("GCM");

  const fuentes = await cargarFuentes(pdf);
  const paginas = paginasDelPresupuesto(
    datos,
    A4_VERTICAL,
    medidorCon(fuentes),
    documento === "comparativa",
  );

  const marca = datos.soloInterno ? "DOCUMENTO INTERNO · no enviar al cliente" : "";
  pintarDocumento(
    pdf,
    paginas,
    A4_VERTICAL,
    fuentes,
    (indice, total) =>
      `${aWinAnsi(obra.nombreObra)}${marca ? ` · ${marca}` : ""} · Página ${indice + 1} de ${total}`,
  );

  const nombre = `${documento}-${obra.nombreObra}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

  return { ok: true, bytes: await pdf.save(), nombre: `${nombre}.pdf` };
}

type Comun = Pick<
  DatosPresupuesto,
  "empresa" | "ruc" | "obra" | "ubicacion" | "programa" | "residente"
>;

async function datosContractual(
  comun: Comun,
  filas: readonly PartidaFila[],
): Promise<DatosPresupuesto> {
  return {
    ...comun,
    titulo: "PRESUPUESTO CONTRACTUAL",
    subtitulo:
      "Partidas, metrados y precios pactados. Es el documento que se firma con el cliente.",
    lineas: comoLineas(filas),
    totales: [
      { etiqueta: "TOTAL DEL PRESUPUESTO", importe: soles(totalDeHojas(filas)), destacado: true },
    ],
    soloInterno: false,
  };
}

async function datosMeta(
  sesion: SesionActiva,
  obraId: string,
  comun: Comun,
): Promise<DatosPresupuesto | null> {
  const meta = await metaQueManda(sesion.companyId, obraId);
  if (!meta) return null;

  const borrador = await lineasDelBorrador(sesion, obraId);

  /**
   * Las lineas salen del borrador cuando lo hay, y de la meta aprobada
   * cuando no.
   *
   * `lineasDelBorrador` devuelve null en una meta ya congelada -su trabajo es
   * dar lo EDITABLE-, y este documento tambien tiene que poder imprimirse
   * despues de aprobar: es el momento en que mas falta hace.
   */
  const lineas: LineaPresupuesto[] =
    borrador !== null
      ? borrador.lineas.map((l) => ({
          codigo: l.codigoRef,
          descripcion: l.descripcion,
          tipo: l.tipo,
          unidad: l.unidad,
          metrado: l.metrado,
          precioUnitario: l.precioUnitario,
          parcial: l.parcial,
        }))
      : (
          await prisma.presupuestoMetaItem.findMany({
            where: { presupuestoMetaId: meta.id },
            orderBy: { orden: "asc" },
          })
        ).map((i) => ({
          codigo: i.codigoRef,
          descripcion: i.descripcion,
          tipo: i.tipo as "CAPITULO" | "PARTIDA",
          unidad: i.unidad,
          metrado: i.metrado?.toString() ?? null,
          precioUnitario: i.precioUnitario?.toString() ?? null,
          parcial: i.parcial?.toString() ?? null,
        }));

  /*
   * El pie desglosa la MISMA lista que la tabla de arriba: lo que tiene
   * codigo y lo que no. No hay un tercer sumando que venga de otro sitio, que
   * es como se llego a imprimir un costo total al que le faltaba la nomina.
   */
  const cifras = cifrasDeLaMeta(
    lineas.map((l) => ({
      codigoRef: l.codigo,
      unidad: l.unidad,
      precioUnitario: l.precioUnitario,
      parcial: l.parcial,
    })),
  );

  const totales: { etiqueta: string; importe: string; destacado?: boolean }[] = [
    { etiqueta: "Costo directo", importe: soles(cifras.costoDirecto) },
  ];

  if (!esCero(cifras.costoPropio)) {
    totales.push({
      etiqueta: "Costos propios (no van al contrato)",
      importe: soles(cifras.costoPropio),
    });
  }

  totales.push({
    etiqueta: "COSTO TOTAL DE LA OBRA",
    importe: soles(cifras.costoTotal),
    destacado: true,
  });

  // Lo que cuesta cada mes de mas. Solo si hay de donde sacarlo: un cero
  // aqui diria que alargarse sale gratis.
  if (cifras.lineasPorMes > 0 && !esCero(cifras.costeMensualDelAtraso)) {
    totales.push({
      etiqueta: "Cada mes de atraso cuesta",
      importe: soles(cifras.costeMensualDelAtraso),
    });
  }

  return {
    ...comun,
    titulo: `PRESUPUESTO META v${meta.version}`,
    subtitulo:
      "DOCUMENTO INTERNO. Es lo que a la empresa le cuesta construir la obra, " +
      "sueldos y pólizas incluidos. No se envía al cliente.",
    lineas,
    totales,
    soloInterno: true,
  };
}

async function datosComparativa(
  sesion: SesionActiva,
  obraId: string,
  comun: Comun,
  filas: readonly PartidaFila[],
): Promise<DatosPresupuesto | null> {
  const meta = await metaQueManda(sesion.companyId, obraId);
  if (!meta) return null;

  const items = await prisma.presupuestoMetaItem.findMany({
    where: { presupuestoMetaId: meta.id },
    orderBy: { orden: "asc" },
  });

  /// Por CODIGO, que es lo que espeja una linea de la meta con su partida del
  /// contrato. Las que no tienen codigo son costos propios de la meta y no
  /// tienen contra que compararse: van al final, con su columna izquierda
  /// vacia.
  const metaPorCodigo = new Map(
    items
      .filter((i) => i.codigoRef !== null)
      .map((i) => [i.codigoRef!, i.parcial?.toString() ?? null]),
  );

  const lineas: LineaPresupuesto[] = filas.map((f) => ({
    codigo: f.codigoPartida,
    descripcion: f.descripcion,
    tipo: f.tipo,
    unidad: f.unidad,
    metrado: f.metrado,
    precioUnitario: f.precioUnitario,
    parcial: f.parcial,
    parcialOtro: metaPorCodigo.get(f.codigoPartida) ?? null,
  }));

  for (const i of items.filter((x) => x.codigoRef === null)) {
    lineas.push({
      codigo: null,
      descripcion: `${i.descripcion} (costo propio de la meta)`,
      tipo: "PARTIDA",
      unidad: i.unidad,
      metrado: i.metrado?.toString() ?? null,
      precioUnitario: i.precioUnitario?.toString() ?? null,
      parcial: null,
      parcialOtro: i.parcial?.toString() ?? null,
    });
  }

  const totalContractual = totalDeHojas(filas);
  const totalMeta = meta.costoTotal.toString();
  const bolsa = bolsaDeLinea(totalContractual, totalMeta);

  return {
    ...comun,
    titulo: "CONTRACTUAL FRENTE A META",
    subtitulo:
      "DOCUMENTO INTERNO. Lo que se cobra al cliente frente a lo que cuesta " +
      "construirlo. La diferencia es la bolsa de la obra. No se envía al cliente.",
    lineas,
    totales: [
      { etiqueta: "Total contractual (lo que se cobra)", importe: soles(totalContractual) },
      { etiqueta: "Costo total de la meta (lo que cuesta)", importe: soles(totalMeta) },
      {
        etiqueta: "BOLSA DE LA OBRA",
        importe: bolsa === null ? "—" : soles(bolsa),
        destacado: true,
      },
    ],
    soloInterno: true,
  };
}
