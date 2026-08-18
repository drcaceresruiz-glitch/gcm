import "server-only";
import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import { join, resolve } from "node:path";

import { prisma } from "@/lib/prisma";
import { puede } from "@/lib/rbac";
import { env } from "@/lib/env";
import { alcanzaObra, FUERA_DE_ALCANCE } from "@/lib/alcance-obras";
import { motivoSiObraCerrada } from "@/services/obra-abierta";
import { restar, sumar, esPositivo } from "@/lib/decimal";
import { importeValorizado } from "@/lib/encargos";
import {
  MIMES_COMPROBANTE,
  TAMANO_MAXIMO_COMPROBANTE,
  validarPago,
  type DatosPago,
} from "@/lib/pagos";
import {
  estadoDeCadencia,
  ETIQUETA_ORIGEN,
  type EstadoCadencia,
} from "@/lib/cadencia-valorizacion";
import {
  contarPaginas,
  normalizarPagina,
  saltar,
  POR_PAGINA,
  type Pagina,
} from "@/lib/paginacion";
import { hoy } from "@/utils/fechas";
import type { SesionActiva } from "@/services/sesion.service";

/**
 * Lo que se le paga al contratista, y a quien le toca valorizar.
 *
 * Las dos caras del mismo hecho: el contratista valoriza su avance y la
 * empresa le paga contra esa valorizacion. El ENCARGO es el contrato marco y
 * las dos cuelgan de el.
 *
 * TRES CIFRAS QUE NO SE MEZCLAN, y es lo que mas cuesta al leer esta pantalla:
 *
 *   - `montoContratado`: SU precio, el del contratista. No es el presupuesto
 *     de la obra ni el costo meta. Puede quedar por encima o por debajo.
 *   - `valorizado`: monto contratado x el ultimo porcentaje acumulado.
 *   - `pagado`: la suma de los pagos registrados.
 *
 * Todo en aritmetica decimal. Aqui es dinero: nunca coma flotante.
 */

/// La raiz del almacen, resuelta a absoluta. Misma disciplina que la
/// evidencia de obra y la galeria: el archivo vive FUERA del arbol de la app.
function raizAlmacen(): string {
  return resolve(env.STORAGE_ROOT);
}

export type ResultadoPago = { ok: true; id: string } | { ok: false; error: string };

export interface PagoRegistrado {
  id: string;
  monto: string;
  fecha: Date;
  registradoPor: string;
  nota: string | null;
  /// Cuantos comprobantes lleva adjuntos.
  comprobantes: number;
}

/**
 * Registra un pago contra un encargo.
 *
 * Permiso `encargo:gestionar`: pagar es un acto economico-administrativo, el
 * mismo perfil que pacta el monto del encargo. NO se invento un permiso
 * propio —cada permiso nuevo hay que concederlo empresa por empresa, y uno
 * que en la practica siempre acompana a otro solo sirve para que un dia
 * falte—.
 *
 * El comprobante es OPCIONAL al registrar: obligarlo aqui empujaria a no
 * registrar el pago hasta tener el papel, y un pago sin registrar es peor que
 * un pago sin comprobante. La pantalla lo pide igual.
 */
export async function registrarPago(
  sesion: SesionActiva,
  obraId: string,
  encargoId: string,
  datos: DatosPago,
  comprobante?: File | null,
): Promise<ResultadoPago> {
  if (!puede(sesion, "encargo:gestionar")) {
    return { ok: false, error: "No tienes permiso para registrar pagos." };
  }
  if (!alcanzaObra(sesion, obraId)) {
    return { ok: false, error: FUERA_DE_ALCANCE };
  }

  // La guarda de siempre: obra cerrada o archivada no admite movimientos.
  const cerrada = await motivoSiObraCerrada(sesion, obraId);
  if (cerrada) return { ok: false, error: cerrada };

  const encargo = await prisma.encargoProveedor.findFirst({
    where: {
      id: encargoId,
      projectId: obraId,
      project: { companyId: sesion.companyId },
    },
    select: { id: true, estado: true, proveedor: { select: { razonSocial: true } } },
  });
  if (!encargo) return { ok: false, error: "No se encontró el encargo." };

  if (encargo.estado === "ANULADO") {
    return {
      ok: false,
      error: "El encargo está anulado: no se le pueden registrar pagos.",
    };
  }

  const valido = validarPago(datos, hoy());
  if (!valido.ok) return { ok: false, error: valido.error };

  // El archivo se comprueba ANTES de escribir nada en la base: un pago
  // guardado con el comprobante rechazado dejaria al usuario creyendo que
  // subio el respaldo.
  let archivo: { contenido: Buffer; extension: string; hash: string } | null = null;
  if (comprobante && comprobante.size > 0) {
    const extension = MIMES_COMPROBANTE.get(comprobante.type);
    if (!extension) {
      return {
        ok: false,
        error: "El comprobante tiene que ser PDF, JPG, PNG o WebP.",
      };
    }
    if (comprobante.size > TAMANO_MAXIMO_COMPROBANTE) {
      return { ok: false, error: "El comprobante pesa más de 8 MB." };
    }

    const contenido = Buffer.from(await comprobante.arrayBuffer());
    archivo = {
      contenido,
      extension,
      hash: createHash("sha256").update(contenido).digest("hex"),
    };
  }

  const autor = `${sesion.nombres} ${sesion.apellidos}`.trim();

  const pago = await prisma.$transaction(async (tx) => {
    const creado = await tx.pagoEncargo.create({
      data: {
        encargoId,
        monto: valido.monto,
        fecha: valido.fecha,
        registradoPor: autor,
        nota: valido.nota,
      },
      select: { id: true },
    });

    if (archivo) {
      const rutaRelativa = join(
        "pagos",
        obraId,
        `${creado.id}${archivo.extension}`,
      );

      await tx.comprobantePago.create({
        data: {
          pagoId: creado.id,
          ruta: rutaRelativa,
          nombreOriginal:
            comprobante?.name.slice(0, 255) || `comprobante${archivo.extension}`,
          mimeType: comprobante?.type ?? "application/octet-stream",
          tamano: comprobante?.size ?? archivo.contenido.length,
          hash: archivo.hash,
          subidoPor: autor,
        },
      });

      // El archivo se escribe DENTRO de la transaccion a proposito: si falla
      // el disco, la fila del pago tampoco queda. Al reves —fila sin archivo—
      // el historial diria que hay respaldo y no lo habria.
      await fs.mkdir(join(raizAlmacen(), "pagos", obraId), { recursive: true });
      await fs.writeFile(join(raizAlmacen(), rutaRelativa), archivo.contenido);
    }

    await tx.auditLog.create({
      data: {
        companyId: sesion.companyId,
        userId: sesion.userId,
        projectId: obraId,
        entidad: "PagoEncargo",
        entidadId: creado.id,
        accion: "CREATE",
        despues: {
          contratista: encargo.proveedor.razonSocial,
          monto: valido.monto,
          fecha: datos.fecha,
          conComprobante: archivo !== null,
        },
      },
    });

    return creado;
  });

  return { ok: true, id: pago.id };
}

/** Los pagos de un encargo, del mas reciente al mas antiguo. */
export async function listarPagos(
  sesion: SesionActiva,
  obraId: string,
  encargoId: string,
): Promise<PagoRegistrado[]> {
  if (!puede(sesion, "encargo:leer")) return [];
  if (!alcanzaObra(sesion, obraId)) return [];

  const filas = await prisma.pagoEncargo.findMany({
    where: {
      encargoId,
      encargo: { projectId: obraId, project: { companyId: sesion.companyId } },
    },
    orderBy: [{ fecha: "desc" }, { createdAt: "desc" }],
    select: {
      id: true,
      monto: true,
      fecha: true,
      registradoPor: true,
      nota: true,
      _count: { select: { comprobantes: true } },
    },
  });

  return filas.map((f) => ({
    id: f.id,
    monto: f.monto.toString(),
    fecha: f.fecha,
    registradoPor: f.registradoPor,
    nota: f.nota,
    comprobantes: f._count.comprobantes,
  }));
}

/**
 * Fija —o quita— la cadencia propia de un contratista en esta obra.
 *
 * `null` devuelve el encargo a la cadencia de la obra. Es una operacion de
 * configuracion, no de dinero, pero va con el mismo permiso que pactar el
 * encargo: quien decide cada cuanto valoriza alguien es quien negocio con el.
 */
export async function fijarCadencia(
  sesion: SesionActiva,
  obraId: string,
  encargoId: string,
  dias: number | null,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!puede(sesion, "encargo:gestionar")) {
    return { ok: false, error: "No tienes permiso para cambiar la cadencia." };
  }

  const cerrada = await motivoSiObraCerrada(sesion, obraId);
  if (cerrada) return { ok: false, error: cerrada };

  // Un periodo de cero o negativo daria «vencida siempre». La cuenta ya lo
  // trata como «sin override», pero guardarlo seria decir en la ficha algo
  // que el sistema no hace: se rechaza aqui.
  if (dias !== null && (!Number.isInteger(dias) || dias < 1 || dias > 365)) {
    return { ok: false, error: "La cadencia va de 1 a 365 días." };
  }

  const encargo = await prisma.encargoProveedor.findFirst({
    where: {
      id: encargoId,
      projectId: obraId,
      project: { companyId: sesion.companyId },
    },
    select: { id: true, cadenciaDias: true },
  });
  if (!encargo) return { ok: false, error: "No se encontró el encargo." };

  await prisma.$transaction(async (tx) => {
    await tx.encargoProveedor.update({
      where: { id: encargoId },
      data: { cadenciaDias: dias },
    });

    await tx.auditLog.create({
      data: {
        companyId: sesion.companyId,
        userId: sesion.userId,
        projectId: obraId,
        entidad: "EncargoProveedor",
        entidadId: encargoId,
        accion: "UPDATE",
        antes: { cadenciaDias: encargo.cadenciaDias },
        despues: { cadenciaDias: dias },
      },
    });
  });

  return { ok: true };
}

export interface FilaValorizacion {
  encargoId: string;
  numero: number;
  contratista: string;
  descripcion: string;
  /// SU precio, no el presupuesto de la obra.
  montoContratado: string;
  /// Ultimo porcentaje acumulado, 0..100. "0" si no ha valorizado nunca.
  porcentaje: string;
  valorizado: string;
  pagado: string;
  /// Valorizado menos pagado. Negativo significa que se pago por adelantado.
  porPagar: string;
  ultimaValorizacion: Date | null;
  cadencia: EstadoCadencia;
  etiquetaCadencia: string;
  /// No tiene cadencia propia NI fechas pactadas: hereda la de la obra.
  heredaCadencia: boolean;
}

export interface PanelValorizaciones {
  filas: Pagina<FilaValorizacion>;
  /// Cuantos, de TODOS los vigentes (no solo de la pagina): son los tres
  /// frentes que pidio el usuario, y contarlos por pagina daria un numero
  /// distinto en cada una.
  totales: {
    sinCadenciaPropia: number;
    valorizacionVencida: number;
    conPagoPendiente: number;
  };
  diaCorteObra: number;
}

/**
 * El panel de valorizaciones y pagos de la obra.
 *
 * Paginado y con buscador porque una obra grande tiene decenas de encargos, y
 * porque el trabajo aqui es ir persona por persona, no mirar un total.
 *
 * Los CONTADORES se calculan sobre todos los encargos vigentes y no sobre la
 * pagina: un panel que dice «3 pendientes» en la pagina 1 y «1 pendiente» en
 * la 2 no sirve para decidir nada.
 */
export async function panelDeValorizaciones(
  sesion: SesionActiva,
  obraId: string,
  opciones: { pagina?: string; q?: string } = {},
): Promise<PanelValorizaciones | null> {
  if (!puede(sesion, "encargo:leer")) return null;
  if (!alcanzaObra(sesion, obraId)) return null;

  const obra = await prisma.project.findFirst({
    where: { id: obraId, companyId: sesion.companyId },
    select: { diaCorteSemanal: true },
  });
  if (!obra) return null;

  // Solo los VIGENTES: un encargo cerrado ya no debe valorizar, y uno anulado
  // no existio. Meterlos llenaria el panel de rojo que nadie puede resolver.
  const encargos = await prisma.encargoProveedor.findMany({
    where: { projectId: obraId, estado: "VIGENTE" },
    orderBy: { numero: "asc" },
    select: {
      id: true,
      numero: true,
      descripcion: true,
      montoContratado: true,
      cadenciaDias: true,
      fechaInicio: true,
      createdAt: true,
      proveedor: { select: { razonSocial: true } },
      fechasValorizacion: { select: { fecha: true }, orderBy: { fecha: "asc" } },
      valorizaciones: {
        orderBy: { fecha: "desc" },
        take: 1,
        select: { fecha: true, porcentaje: true },
      },
      pagos: { select: { monto: true } },
    },
  });

  const dia = hoy();

  const todas: FilaValorizacion[] = encargos.map((e) => {
    const ultima = e.valorizaciones[0] ?? null;
    const porcentaje = ultima?.porcentaje.toString() ?? "0";
    const montoContratado = e.montoContratado.toString();

    // Con `importeValorizado` de `lib/encargos`, que YA existia: es la misma
    // cuenta que usa la pantalla de Proveedores. Repetirla aqui —aunque diera
    // el mismo resultado hoy— es como dos pantallas acaban diciendo cifras
    // distintas del mismo encargo.
    const valorizado = importeValorizado(montoContratado, porcentaje);

    const pagado = sumar(e.pagos.map((p) => p.monto.toString()));

    const cadencia = estadoDeCadencia(
      {
        diaCorteObra: obra.diaCorteSemanal,
        cadenciaDias: e.cadenciaDias,
        fechas: e.fechasValorizacion.map((f) => f.fecha),
        ultimaValorizacion: ultima?.fecha ?? null,
        // Sin fecha de inicio pactada, el ancla es el dia en que se creo el
        // encargo: es lo unico cierto que hay.
        inicioEncargo: e.fechaInicio ?? e.createdAt,
      },
      dia,
    );

    return {
      encargoId: e.id,
      numero: e.numero,
      contratista: e.proveedor.razonSocial,
      descripcion: e.descripcion,
      montoContratado,
      porcentaje,
      valorizado,
      pagado,
      porPagar: restar(valorizado, pagado) ?? "0.00",
      ultimaValorizacion: ultima?.fecha ?? null,
      cadencia,
      etiquetaCadencia: ETIQUETA_ORIGEN[cadencia.origen],
      heredaCadencia:
        e.cadenciaDias === null && e.fechasValorizacion.length === 0,
    };
  });

  const totales = {
    sinCadenciaPropia: todas.filter((f) => f.heredaCadencia).length,
    valorizacionVencida: todas.filter((f) => f.cadencia.vencida).length,
    conPagoPendiente: todas.filter((f) => esPositivo(f.porPagar)).length,
  };

  const texto = opciones.q?.trim().toLowerCase();
  const filtradas = texto
    ? todas.filter(
        (f) =>
          f.contratista.toLowerCase().includes(texto) ||
          f.descripcion.toLowerCase().includes(texto) ||
          `e-${f.numero}`.includes(texto),
      )
    : todas;

  /**
   * La paginacion se hace en memoria y NO en la base, a proposito: el orden
   * util aqui —primero el que debe valorizacion, y dentro de esos el que mas
   * retraso lleva— sale de una cuenta que la base no conoce (`estadoDeCadencia`
   * mezcla tres niveles de herencia). Se acepta porque son los encargos
   * VIGENTES de UNA obra: decenas, no miles.
   */
  const ordenadas = [...filtradas].sort((a, b) => {
    if (a.cadencia.vencida !== b.cadencia.vencida) {
      return a.cadencia.vencida ? -1 : 1;
    }
    if (a.cadencia.diasDeRetraso !== b.cadencia.diasDeRetraso) {
      return b.cadencia.diasDeRetraso - a.cadencia.diasDeRetraso;
    }
    return a.numero - b.numero;
  });

  const total = ordenadas.length;
  const totalPaginas = contarPaginas(total, POR_PAGINA);
  const pagina = normalizarPagina(opciones.pagina, totalPaginas);
  const desde = saltar(pagina, POR_PAGINA);

  return {
    filas: {
      filas: ordenadas.slice(desde, desde + POR_PAGINA),
      total,
      pagina,
      totalPaginas,
    },
    totales,
    diaCorteObra: obra.diaCorteSemanal,
  };
}
