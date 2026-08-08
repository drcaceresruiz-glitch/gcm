import "server-only";
import { prisma } from "@/lib/prisma";
import { puede } from "@/lib/rbac";
import { esPositivo, sumar } from "@/lib/decimal";
import {
  calcularCascadaOrden,
  descuadreDelReparto,
  importeDeOrden,
  sumarLineas,
} from "@/lib/ordenes";
import type { SesionActiva } from "@/services/sesion.service";
import type {
  EstadoOrden,
  OrigenRegistro,
  TipoOrden,
} from "@/generated/prisma/enums";

/**
 * Ordenes de compra y de servicio.
 *
 * De aqui sale el COMPROMETIDO: lo que ya se pacto con proveedores aunque
 * todavia no se haya recibido ni pagado. Se mide contra el NETO, sin IGV,
 * porque el IGV que factura el proveedor es credito fiscal y no costo de
 * obra. Repartir el total inflaria la obra con dinero que se recupera.
 *
 * Dos reglas gobiernan el modulo, y las dos se comprueban al APROBAR, que es
 * cuando la orden empieza a contar:
 *
 *   1. La suma de las imputaciones es igual al neto. Sin eso, el comprometido
 *      de las partidas no cuadra con lo que se pidio de verdad.
 *   2. La suma de las lineas que no son agrupadoras es igual al subtotal. Las
 *      ordenes reales abren cada bloque con una linea que repite la suma de
 *      sus hijas, y contarla otra vez duplica el importe.
 */


export interface LineaEntrada {
  esAgrupador: boolean;
  nivel?: number;
  cantidad?: string;
  unidad?: string;
  descripcion: string;
  precioUnitario?: string;
  importe: string;
}

export interface ImputacionEntrada {
  wbsItemId: string;
  importe: string;
}

export interface DatosOrden {
  proveedorId: string;
  numero: string;
  tipo: TipoOrden;
  fecha: string;
  descripcion: string;
  referencia?: string;
  formaPago?: string;
  observaciones?: string;
  /// El subtotal se toma de las lineas cuando las hay. Las ordenes
  /// historicas se cargan solo por cabecera, y entonces se indica aqui.
  subtotal?: string;
  descuentoComercial?: string;
  /// Fraccion: "0.18". La traduccion desde porcentaje vive en la frontera.
  porcentajeIgv: string;
  lineas: LineaEntrada[];
  imputaciones: ImputacionEntrada[];
  /// Guardar las partidas imputadas como habituales de este proveedor en
  /// esta obra, para que la proxima orden las traiga puestas.
  recordarPartidas?: boolean;
}

export type ResultadoOrden =
  | { ok: true; id: string; numero: string }
  | { ok: false; error: string };

/** Comprobaciones baratas sobre lo que llego, antes de tocar la base. */
function validarEntrada(datos: DatosOrden): string | null {
  if (!datos.numero.trim()) return "Indica el numero de la orden.";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(datos.fecha)) {
    return "Indica la fecha del documento.";
  }
  if (!datos.descripcion.trim()) {
    return "Indica de que es la orden, como aparece en el documento.";
  }
  if (!datos.proveedorId) return "Elige el proveedor.";

  if (datos.lineas.length === 0 && !datos.subtotal) {
    return "Una orden sin lineas necesita al menos su subtotal.";
  }

  if (datos.imputaciones.length === 0) {
    return "Indica contra que partidas se imputa la orden.";
  }

  const partidas = datos.imputaciones.map((i) => i.wbsItemId);
  if (new Set(partidas).size !== partidas.length) {
    return "Hay dos imputaciones sobre la misma partida. Junta los importes en una.";
  }

  return null;
}

export async function crearOrden(
  sesion: SesionActiva,
  obraId: string,
  datos: DatosOrden,
  origen: OrigenRegistro = "MANUAL",
): Promise<ResultadoOrden> {
  if (!puede(sesion, "orden:crear")) {
    return { ok: false, error: "No tienes permiso para registrar ordenes." };
  }

  const errorEntrada = validarEntrada(datos);
  if (errorEntrada) return { ok: false, error: errorEntrada };

  const numero = datos.numero.trim().slice(0, 30);

  // --- Importes, con la aritmetica exacta ---------------------------------
  const lineas: { entrada: LineaEntrada; importe: string }[] = [];
  for (const linea of datos.lineas) {
    const importe = importeDeOrden(linea.importe);
    if (importe === null) {
      return {
        ok: false,
        error: `El importe "${linea.importe}" no es valido. Las ordenes no llevan importes en negativo.`,
      };
    }
    lineas.push({ entrada: linea, importe });
  }

  // El subtotal sale de las lineas cuando las hay, y solo se acepta a mano
  // en las ordenes de cabecera. Asi una orden con detalle no puede declarar
  // un subtotal que sus propias lineas desmientan.
  const subtotal =
    lineas.length > 0
      ? sumarLineas(
          lineas.map((l) => ({
            esAgrupador: l.entrada.esAgrupador,
            importe: l.importe,
          })),
        )
      : importeDeOrden(datos.subtotal ?? "");

  if (subtotal === null) {
    return { ok: false, error: "El subtotal no es un numero valido." };
  }

  const descuento = importeDeOrden(datos.descuentoComercial ?? "0") ?? "0.00";
  const cascada = calcularCascadaOrden({
    subtotal,
    descuentoComercial: descuento,
    porcentajeIgv: datos.porcentajeIgv,
  });

  if (!esPositivo(cascada.neto)) {
    return {
      ok: false,
      error: `El neto de la orden sale en ${cascada.neto}. Revisa el subtotal y el descuento comercial.`,
    };
  }

  const imputaciones: { wbsItemId: string; importe: string }[] = [];
  for (const imputacion of datos.imputaciones) {
    const importe = importeDeOrden(imputacion.importe);
    if (importe === null) {
      return {
        ok: false,
        error: `El importe imputado "${imputacion.importe}" no es valido.`,
      };
    }
    imputaciones.push({ wbsItemId: imputacion.wbsItemId, importe });
  }

  // La invariante. Se comprueba ya al guardar el borrador, aunque se vuelva a
  // comprobar al aprobar: descubrirlo al final obligaria a rehacer el reparto
  // entero sin tener delante las cifras.
  const descuadre = descuadreDelReparto(
    cascada.neto,
    imputaciones.map((i) => i.importe),
  );

  if (descuadre !== null) {
    // Se dice de que lado falta, no solo que no cuadra: con varias partidas
    // delante, "faltan 1,980.00" es accionable y ademas delata el error mas
    // probable, que es haber repartido el total con IGV en vez del neto.
    const sobra = esPositivo(descuadre);
    const magnitud = sobra ? descuadre : descuadre.slice(1);

    return {
      ok: false,
      error: `El reparto entre partidas suma ${sumar(imputaciones.map((i) => i.importe))} y el neto de la orden es ${cascada.neto}: ${sobra ? "sobran" : "faltan"} ${magnitud}. Recuerda que el comprometido se imputa SIN IGV.`,
    };
  }

  // --- Comprobaciones contra la base --------------------------------------
  const obra = await prisma.project.findFirst({
    where: { id: obraId, companyId: sesion.companyId },
    select: { id: true },
  });
  if (!obra) return { ok: false, error: "Obra no encontrada." };

  const proveedor = await prisma.proveedor.findFirst({
    where: { id: datos.proveedorId, companyId: sesion.companyId },
    select: { id: true, activo: true, razonSocial: true },
  });
  if (!proveedor) return { ok: false, error: "Proveedor no encontrado." };
  if (!proveedor.activo) {
    return {
      ok: false,
      error: `"${proveedor.razonSocial}" esta desactivado. Vuelve a activarlo si le vas a comprar.`,
    };
  }

  /**
   * El numero repetido se comprueba aqui para decir QUE orden lo ocupa.
   *
   * Es tambien lo que impide que las dos vias de carga se pisen: da igual que
   * la orden entrara tecleada o desde un archivo, el numero identifica el
   * documento y la clave unica de la base lo cierra por debajo. El importador
   * topa con esto mismo, y por eso tiene que ensenar lo que ya existe en vez
   * de insertarlo otra vez.
   */
  const ocupado = await prisma.ordenCompra.findFirst({
    where: { companyId: sesion.companyId, numero },
    select: { id: true, descripcion: true, estado: true },
  });

  if (ocupado) {
    return {
      ok: false,
      error: `La orden ${numero} ya existe ("${ocupado.descripcion}", ${ocupado.estado.toLowerCase()}). Cada numero identifica un documento.`,
    };
  }

  // Las partidas imputadas tienen que ser de ESTA obra y llevar importe
  // propio. Una de alcance no lo tiene: su dinero vive en la partida padre,
  // y comprometer contra ella dejaria el gasto colgando de nada.
  const partidas = await prisma.wbsItem.findMany({
    where: {
      id: { in: imputaciones.map((i) => i.wbsItemId) },
      projectId: obraId,
    },
    select: { id: true, codigoPartida: true, tipo: true, modalidad: true },
  });
  const porId = new Map(partidas.map((p) => [p.id, p]));

  for (const imputacion of imputaciones) {
    const partida = porId.get(imputacion.wbsItemId);
    if (!partida) {
      return {
        ok: false,
        error: "Una de las partidas imputadas no existe en esta obra.",
      };
    }
    if (partida.tipo !== "PARTIDA") {
      return {
        ok: false,
        error: `"${partida.codigoPartida}" es un capitulo. El gasto se imputa a las partidas, no a los capitulos.`,
      };
    }
    if (partida.modalidad === "ALCANCE") {
      return {
        ok: false,
        error: `"${partida.codigoPartida}" solo detalla el alcance de otra partida y no lleva importe propio. Imputa a la partida padre.`,
      };
    }
  }

  const texto = (v: string | undefined, largo: number) =>
    v?.trim() ? v.trim().slice(0, largo) : null;

  const creada = await prisma.$transaction(async (tx) => {
    const orden = await tx.ordenCompra.create({
      data: {
        companyId: sesion.companyId,
        projectId: obraId,
        proveedorId: proveedor.id,
        numero,
        tipo: datos.tipo,
        estado: "BORRADOR",
        origen,
        fecha: new Date(datos.fecha),
        referencia: texto(datos.referencia, 60),
        descripcion: datos.descripcion.trim().slice(0, 255),
        formaPago: texto(datos.formaPago, 5000),
        observaciones: texto(datos.observaciones, 5000),
        subtotal: cascada.subtotal,
        descuentoComercial: cascada.descuentoComercial,
        neto: cascada.neto,
        igv: cascada.igv,
        total: cascada.total,
        lineas: {
          create: lineas.map((l, i) => ({
            orden: i,
            nivel: l.entrada.nivel ?? 0,
            esAgrupador: l.entrada.esAgrupador,
            cantidad: l.entrada.cantidad || null,
            unidad: texto(l.entrada.unidad, 20),
            descripcion: l.entrada.descripcion.trim(),
            precioUnitario: l.entrada.precioUnitario || null,
            importe: l.importe,
          })),
        },
        imputaciones: { create: imputaciones },
      },
      select: { id: true, numero: true },
    });

    /**
     * Se recuerdan las partidas para este proveedor en esta obra.
     *
     * `createMany` con `skipDuplicates` y no un borrado previo: la intencion
     * es ANADIR a lo que ya se sabe, no sustituirlo. Una orden pequena de un
     * proveedor que normalmente hace cinco partidas no debe reducir su lista
     * a la unica que trajo esta vez.
     */
    if (datos.recordarPartidas) {
      await tx.proveedorPartida.createMany({
        data: imputaciones.map((i) => ({
          proveedorId: proveedor.id,
          wbsItemId: i.wbsItemId,
        })),
        skipDuplicates: true,
      });
    }

    await tx.auditLog.create({
      data: {
        companyId: sesion.companyId,
        userId: sesion.userId,
        projectId: obraId,
        entidad: "OrdenCompra",
        entidadId: orden.id,
        accion: "CREATE",
        despues: {
          numero: orden.numero,
          proveedor: proveedor.razonSocial,
          tipo: datos.tipo,
          origen,
          neto: cascada.neto,
          igv: cascada.igv,
          total: cascada.total,
          lineas: lineas.length,
          imputaciones: imputaciones.length,
        },
      },
    });

    return orden;
  });

  return { ok: true, id: creada.id, numero: creada.numero };
}

// ---------------------------------------------------------------------------
// Aprobacion y anulacion
// ---------------------------------------------------------------------------

/** Se lanza dentro de la transaccion; se traduce a un error legible fuera. */
class FalloOrden extends Error {}

export type ResultadoSimple =
  | { ok: true; numero: string }
  | { ok: false; error: string };

/**
 * Aprueba una orden: a partir de aqui cuenta en el comprometido.
 *
 * Se vuelven a comprobar las dos reglas contra lo que hay GUARDADO, no contra
 * lo que dijo el formulario: entre el borrador y la aprobacion pudo editarse
 * cualquier cosa.
 *
 * A diferencia de aprobar una linea base o un movimiento, esto SI se puede
 * deshacer: una orden aprobada se anula. Cancelar un pedido a un proveedor es
 * corriente y el sistema tiene que admitirlo sin obligar a inventar un
 * documento de signo contrario.
 */
export async function aprobarOrden(
  sesion: SesionActiva,
  ordenId: string,
): Promise<ResultadoSimple> {
  if (!puede(sesion, "orden:aprobar")) {
    return { ok: false, error: "No tienes permiso para aprobar ordenes." };
  }

  const aprobadaPor = `${sesion.nombres} ${sesion.apellidos} (${sesion.email})`
    .trim()
    .slice(0, 150);

  try {
    const numero = await prisma.$transaction(async (tx) => {
      const orden = await tx.ordenCompra.findFirst({
        where: { id: ordenId, company: { id: sesion.companyId } },
        select: {
          id: true,
          projectId: true,
          numero: true,
          estado: true,
          subtotal: true,
          neto: true,
          lineas: { select: { esAgrupador: true, importe: true } },
          imputaciones: { select: { importe: true } },
        },
      });

      if (!orden) throw new FalloOrden("Orden no encontrada.");
      if (orden.estado === "APROBADA") {
        throw new FalloOrden(`La orden ${orden.numero} ya estaba aprobada.`);
      }
      if (orden.estado === "ANULADA") {
        throw new FalloOrden(
          `La orden ${orden.numero} esta anulada. Registra una nueva en su lugar.`,
        );
      }

      // Regla 1: el reparto suma el neto.
      const descuadre = descuadreDelReparto(
        orden.neto.toString(),
        orden.imputaciones.map((i) => i.importe.toString()),
      );
      if (descuadre !== null) {
        throw new FalloOrden(
          `El reparto entre partidas no cuadra con el neto de la orden: difiere en ${descuadre}. Corrigelo antes de aprobar.`,
        );
      }

      // Regla 2: las lineas que llevan dinero suman el subtotal. Solo aplica
      // si la orden tiene detalle; las historicas se cargan por cabecera.
      if (orden.lineas.length > 0) {
        const deLineas = sumarLineas(
          orden.lineas.map((l) => ({
            esAgrupador: l.esAgrupador,
            importe: l.importe.toString(),
          })),
        );

        if (deLineas !== orden.subtotal.toString()) {
          throw new FalloOrden(
            `Las lineas suman ${deLineas} y el subtotal dice ${orden.subtotal.toString()}. Revisa que las lineas que solo repiten el total de su bloque esten marcadas como agrupadoras.`,
          );
        }
      }

      // La condicion sobre el estado cierra la carrera de dos pulsaciones: la
      // segunda no encuentra fila que cambiar.
      const { count } = await tx.ordenCompra.updateMany({
        where: { id: orden.id, estado: "BORRADOR" },
        data: { estado: "APROBADA", aprobadaAt: new Date(), aprobadaPor },
      });
      if (count === 0) {
        throw new FalloOrden(`La orden ${orden.numero} ya estaba aprobada.`);
      }

      await tx.auditLog.create({
        data: {
          companyId: sesion.companyId,
          userId: sesion.userId,
          projectId: orden.projectId,
          entidad: "OrdenCompra",
          entidadId: orden.id,
          accion: "APPROVE",
          antes: { estado: "BORRADOR" },
          despues: {
            numero: orden.numero,
            estado: "APROBADA",
            aprobadaPor,
            comprometido: orden.neto.toString(),
          },
        },
      });

      return orden.numero;
    });

    return { ok: true, numero };
  } catch (e) {
    if (e instanceof FalloOrden) return { ok: false, error: e.message };
    throw e;
  }
}

/**
 * Anula una orden. Deja de contar en el comprometido, pero no se borra.
 *
 * El motivo es obligatorio: dentro de seis meses, "por que se anulo la 00117"
 * es una pregunta que alguien hara, y la respuesta tiene que estar aqui y no
 * en la memoria de quien la anulo.
 */
export async function anularOrden(
  sesion: SesionActiva,
  ordenId: string,
  motivo: string,
): Promise<ResultadoSimple> {
  if (!puede(sesion, "orden:anular")) {
    return { ok: false, error: "No tienes permiso para anular ordenes." };
  }

  if (!motivo.trim()) {
    return { ok: false, error: "Explica por que se anula la orden." };
  }

  const anuladaPor = `${sesion.nombres} ${sesion.apellidos} (${sesion.email})`
    .trim()
    .slice(0, 150);

  const orden = await prisma.ordenCompra.findFirst({
    where: { id: ordenId, companyId: sesion.companyId },
    select: { id: true, projectId: true, numero: true, estado: true, neto: true },
  });

  if (!orden) return { ok: false, error: "Orden no encontrada." };
  if (orden.estado === "ANULADA") {
    return { ok: false, error: `La orden ${orden.numero} ya estaba anulada.` };
  }

  await prisma.$transaction(async (tx) => {
    await tx.ordenCompra.update({
      where: { id: orden.id },
      data: {
        estado: "ANULADA",
        anuladaAt: new Date(),
        anuladaPor,
        motivoAnulado: motivo.trim().slice(0, 5000),
      },
    });

    await tx.auditLog.create({
      data: {
        companyId: sesion.companyId,
        userId: sesion.userId,
        projectId: orden.projectId,
        entidad: "OrdenCompra",
        entidadId: orden.id,
        accion: "UPDATE",
        antes: { estado: orden.estado },
        despues: {
          numero: orden.numero,
          estado: "ANULADA",
          anuladaPor,
          motivo: motivo.trim(),
          // Se deja constancia de cuanto dejo de estar comprometido: es la
          // cifra que cambia en el control al anular.
          liberado: orden.estado === "APROBADA" ? orden.neto.toString() : "0.00",
        },
      },
    });
  });

  return { ok: true, numero: orden.numero };
}

// ---------------------------------------------------------------------------
// Consulta
// ---------------------------------------------------------------------------

export interface ComprometidoPorPartida {
  wbsItemId: string;
  comprometido: string;
}

/**
 * Lo comprometido con proveedores, por partida.
 *
 * Solo cuentan las APROBADAS: un borrador todavia no es un compromiso con
 * nadie, y una anulada dejo de serlo. Ese filtro es la definicion de la
 * columna, no una optimizacion.
 *
 * Devuelve importes SIN IGV, que es como se mide el costo de obra.
 */
export async function obtenerComprometido(
  sesion: SesionActiva,
  obraId: string,
): Promise<ComprometidoPorPartida[]> {
  if (!puede(sesion, "orden:leer")) return [];

  const porPartida = await prisma.ordenImputacion.groupBy({
    by: ["wbsItemId"],
    where: {
      ordenCompra: {
        projectId: obraId,
        estado: "APROBADA",
        company: { id: sesion.companyId },
      },
    },
    _sum: { importe: true },
  });

  // `_sum` es null cuando no hay filas, y `sumar` no lo tolera. Ademas
  // normaliza a dos decimales: Prisma devuelve "10000" y no "10000.00".
  return porPartida.map((p) => ({
    wbsItemId: p.wbsItemId,
    comprometido: sumar([p._sum.importe?.toString() ?? "0"]),
  }));
}

export interface OrdenResumen {
  id: string;
  numero: string;
  tipo: TipoOrden;
  estado: EstadoOrden;
  origen: OrigenRegistro;
  fecha: Date;
  descripcion: string;
  referencia: string | null;
  formaPago: string | null;
  proveedor: { id: string; razonSocial: string; ruc: string };
  subtotal: string;
  descuentoComercial: string;
  neto: string;
  igv: string;
  total: string;
  aprobadaAt: Date | null;
  aprobadaPor: string | null;
  anuladaAt: Date | null;
  motivoAnulado: string | null;
  totalLineas: number;
  imputaciones: { codigoPartida: string; descripcion: string; importe: string }[];
}

export async function listarOrdenes(
  sesion: SesionActiva,
  obraId: string,
): Promise<OrdenResumen[]> {
  if (!puede(sesion, "orden:leer")) return [];

  const filas = await prisma.ordenCompra.findMany({
    where: { projectId: obraId, companyId: sesion.companyId },
    // Por fecha y no por numero: el correlativo de las ordenes reales no es
    // cronologico y ordenar por el mentiria sobre la secuencia.
    orderBy: [{ fecha: "desc" }, { createdAt: "desc" }],
    select: {
      id: true, numero: true, tipo: true, estado: true, origen: true,
      fecha: true, descripcion: true, referencia: true, formaPago: true,
      subtotal: true, descuentoComercial: true, neto: true, igv: true,
      total: true, aprobadaAt: true, aprobadaPor: true, anuladaAt: true,
      motivoAnulado: true,
      proveedor: { select: { id: true, razonSocial: true, ruc: true } },
      _count: { select: { lineas: true } },
      imputaciones: {
        select: {
          importe: true,
          partida: { select: { codigoPartida: true, descripcion: true } },
        },
      },
    },
  });

  return filas.map((o) => ({
    id: o.id,
    numero: o.numero,
    tipo: o.tipo,
    estado: o.estado,
    origen: o.origen,
    fecha: o.fecha,
    descripcion: o.descripcion,
    referencia: o.referencia,
    formaPago: o.formaPago,
    proveedor: o.proveedor,
    subtotal: o.subtotal.toString(),
    descuentoComercial: o.descuentoComercial.toString(),
    neto: o.neto.toString(),
    igv: o.igv.toString(),
    total: o.total.toString(),
    aprobadaAt: o.aprobadaAt,
    aprobadaPor: o.aprobadaPor,
    anuladaAt: o.anuladaAt,
    motivoAnulado: o.motivoAnulado,
    totalLineas: o._count.lineas,
    imputaciones: o.imputaciones.map((i) => ({
      codigoPartida: i.partida.codigoPartida,
      descripcion: i.partida.descripcion,
      importe: i.importe.toString(),
    })),
  }));
}

/**
 * Partidas habituales de cada proveedor en una obra.
 *
 * Se devuelven TODOS los proveedores de una vez, indexados por su id, porque
 * quien redacta una orden todavia no ha elegido proveedor: el formulario
 * necesita poder reaccionar en cuanto lo elija, sin otra ida al servidor.
 *
 * Son una ayuda, no un limite: la orden puede imputar a cualquier partida de
 * la obra.
 */
export async function obtenerPartidasHabituales(
  sesion: SesionActiva,
  obraId: string,
): Promise<Record<string, string[]>> {
  if (!puede(sesion, "orden:crear")) return {};

  const filas = await prisma.proveedorPartida.findMany({
    where: {
      proveedor: { companyId: sesion.companyId },
      // La obra sale de la partida, que es quien sabe a que proyecto va.
      partida: { projectId: obraId },
    },
    select: { proveedorId: true, wbsItemId: true },
  });

  const porProveedor: Record<string, string[]> = {};
  for (const fila of filas) {
    (porProveedor[fila.proveedorId] ??= []).push(fila.wbsItemId);
  }

  return porProveedor;
}

// ---------------------------------------------------------------------------
// El documento
// ---------------------------------------------------------------------------

export interface LineaImpresa {
  nivel: number;
  esAgrupador: boolean;
  cantidad: string | null;
  unidad: string | null;
  descripcion: string;
  precioUnitario: string | null;
  importe: string;
}

export interface OrdenImpresa {
  emisor: {
    razonSocial: string;
    ruc: string;
    direccion: string | null;
    telefono: string | null;
    email: string | null;
    representanteLegal: string | null;
    cargoRepresentante: string | null;
    observacionesOrden: string | null;
  };
  obra: { nombreObra: string; cliente: string | null };
  numero: string;
  tipo: TipoOrden;
  estado: EstadoOrden;
  fecha: Date;
  descripcion: string;
  referencia: string | null;
  formaPago: string | null;
  observaciones: string | null;
  proveedor: {
    razonSocial: string;
    ruc: string;
    contactoNombre: string | null;
    contactoTelefono: string | null;
    email: string | null;
    banco: string | null;
    tipoCuenta: string | null;
    monedaCuenta: string | null;
    cuentaBancaria: string | null;
    cci: string | null;
  };
  lineas: LineaImpresa[];
  subtotal: string;
  descuentoComercial: string;
  neto: string;
  igv: string;
  total: string;
}

/**
 * Todo lo que lleva impreso el papel que se le manda al proveedor.
 *
 * Va en una consulta aparte de `listarOrdenes` porque pide cosas que el
 * listado no necesita —los datos del emisor, los bancarios del proveedor, el
 * detalle linea a linea— y cargarlas en cada fila de la tabla para usarlas en
 * una de cada cien seria pagar por adelantado algo que casi nunca se usa.
 *
 * Se puede imprimir en cualquier estado, tambien BORRADOR y ANULADA: hace
 * falta poder revisar antes de aprobar, y guardar copia de lo que se anulo.
 * Es el documento el que tiene que decir en cual esta, y por eso viaja
 * `estado` con el resto.
 */
export async function obtenerOrdenParaImpresion(
  sesion: SesionActiva,
  obraId: string,
  ordenId: string,
): Promise<OrdenImpresa | null> {
  if (!puede(sesion, "orden:leer")) return null;

  const orden = await prisma.ordenCompra.findFirst({
    // El companyId no es redundante con el id: sin el, un id adivinado de
    // otra empresa devolveria su orden entera, con sus datos bancarios.
    where: { id: ordenId, projectId: obraId, companyId: sesion.companyId },
    include: {
      company: true,
      project: { select: { nombreObra: true, cliente: true } },
      proveedor: true,
      lineas: { orderBy: { orden: "asc" } },
    },
  });

  if (!orden) return null;

  return {
    emisor: {
      razonSocial: orden.company.razonSocial,
      ruc: orden.company.ruc,
      direccion: orden.company.direccion,
      telefono: orden.company.telefono,
      email: orden.company.email,
      representanteLegal: orden.company.representanteLegal,
      cargoRepresentante: orden.company.cargoRepresentante,
      observacionesOrden: orden.company.observacionesOrden,
    },
    obra: {
      nombreObra: orden.project.nombreObra,
      cliente: orden.project.cliente,
    },
    numero: orden.numero,
    tipo: orden.tipo,
    estado: orden.estado,
    fecha: orden.fecha,
    descripcion: orden.descripcion,
    referencia: orden.referencia,
    formaPago: orden.formaPago,
    observaciones: orden.observaciones,
    proveedor: {
      razonSocial: orden.proveedor.razonSocial,
      ruc: orden.proveedor.ruc,
      contactoNombre: orden.proveedor.contactoNombre,
      contactoTelefono: orden.proveedor.contactoTelefono,
      email: orden.proveedor.email,
      banco: orden.proveedor.banco,
      tipoCuenta: orden.proveedor.tipoCuenta,
      monedaCuenta: orden.proveedor.monedaCuenta,
      cuentaBancaria: orden.proveedor.cuentaBancaria,
      cci: orden.proveedor.cci,
    },
    // Los importes salen como cadena, sin tocar. Darles formato es cosa de
    // `utils/formato`, en el ultimo paso: aqui pasar por coma flotante seria
    // perder precision para ganar nada.
    lineas: orden.lineas.map((l) => ({
      nivel: l.nivel,
      esAgrupador: l.esAgrupador,
      cantidad: l.cantidad?.toString() ?? null,
      unidad: l.unidad,
      descripcion: l.descripcion,
      precioUnitario: l.precioUnitario?.toString() ?? null,
      importe: l.importe.toString(),
    })),
    subtotal: orden.subtotal.toString(),
    descuentoComercial: orden.descuentoComercial.toString(),
    neto: orden.neto.toString(),
    igv: orden.igv.toString(),
    total: orden.total.toString(),
  };
}
