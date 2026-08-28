import "server-only";
import { prisma } from "@/lib/prisma";
import { puede } from "@/lib/rbac";
import {
  esCero,
  esPositivo,
  multiplicar,
  normalizarDecimal,
} from "@/lib/decimal";
import { cifrasDeLaMeta } from "@/lib/costo-meta";
import { recalcularBloque } from "@/lib/cascada-contratista";
import { codigoPadre } from "@/lib/jerarquia-partidas";
import {
  lineasQuePierdenImporte,
  mover,
  quitar,
  renumerar,
  type Direccion,
} from "@/lib/arbol-meta";
import { metaQueManda } from "@/services/meta.service";
import { motivoSiObraCerrada } from "@/services/obra-abierta";
import type { SesionActiva } from "@/services/sesion.service";

/**
 * Corregir el presupuesto meta dentro de la app.
 *
 * Hasta ahora la meta solo entraba por Excel: un precio mal tecleado obligaba
 * a rehacer la plantilla entera y volver a subirla, perdiendo por el camino
 * cualquier recargo ya ajustado. Aqui se corrige linea a linea.
 *
 * **Solo sobre un BORRADOR.** Una meta aprobada esta congelada, y eso es lo
 * que hace que la bolsa signifique algo: con una meta editable bastaria
 * bajarla cuando el gasto se va, y todos los indicadores mentirian hacia
 * atras sin dejar rastro. Es la misma razon por la que `aprobarMeta` existe.
 *
 * Vive aparte de `meta.service` porque es OTRA cosa: aquel compone y compara,
 * este escribe linea a linea. Comparte con el las guardas y `metaQueManda`,
 * que es la unica regla que no puede duplicarse -cual de las versiones manda-.
 */

export interface LineaDeLaMeta {
  id: string;
  codigoRef: string | null;
  descripcion: string;
  tipo: "CAPITULO" | "PARTIDA";
  unidad: string | null;
  metrado: string | null;
  precioUnitario: string | null;
  parcial: string | null;
  porcentajeRecargo: string | null;
  /// El precio del papel del contratista, si esta linea lleva ajuste.
  parcialCotizado: string | null;
  /// Los tres del contratista, en la fila que agrupa.
  descuentoContratista: string | null;
  ggContratista: string | null;
  utilidadContratista: string | null;
  orden: number;
}

export interface BorradorDeMeta {
  metaId: string;
  version: number;
  lineas: LineaDeLaMeta[];
}

/** Las lineas del borrador editable. `null` si no hay, o si ya se aprobo. */
export async function lineasDelBorrador(
  sesion: SesionActiva,
  obraId: string,
): Promise<BorradorDeMeta | null> {
  if (!puede(sesion, "meta:leer")) return null;

  const meta = await metaQueManda(sesion.companyId, obraId);
  if (!meta || meta.aprobadaAt !== null) return null;

  const filas = await prisma.presupuestoMetaItem.findMany({
    where: { presupuestoMetaId: meta.id },
    orderBy: { orden: "asc" },
  });

  return {
    metaId: meta.id,
    version: meta.version,
    lineas: filas.map((f) => ({
      id: f.id,
      codigoRef: f.codigoRef,
      descripcion: f.descripcion,
      tipo: f.tipo as "CAPITULO" | "PARTIDA",
      unidad: f.unidad,
      // A texto y nunca a `number`: son importes.
      metrado: f.metrado?.toString() ?? null,
      precioUnitario: f.precioUnitario?.toString() ?? null,
      parcial: f.parcial?.toString() ?? null,
      porcentajeRecargo: f.porcentajeRecargo?.toString() ?? null,
      parcialCotizado: f.parcialCotizado?.toString() ?? null,
      descuentoContratista: f.porcentajeDescuentoContratista?.toString() ?? null,
      ggContratista: f.porcentajeGastosGeneralesContratista?.toString() ?? null,
      utilidadContratista: f.porcentajeUtilidadContratista?.toString() ?? null,
      orden: f.orden,
    })),
  };
}

/**
 * El borrador sobre el que se puede escribir, o el motivo por el que no.
 *
 * Las cuatro guardas de toda escritura en la meta en un solo sitio: permiso,
 * obra abierta, que exista y que no este aprobada. Repetirlas en cada funcion
 * es como una de ellas acaba faltando justo en la cuarta.
 */
async function borradorEditable(
  sesion: SesionActiva,
  obraId: string,
): Promise<{ ok: true; metaId: string } | { ok: false; error: string }> {
  if (!puede(sesion, "meta:crear")) {
    return { ok: false, error: "No tienes permiso para cambiar el presupuesto meta." };
  }

  const cerrada = await motivoSiObraCerrada(sesion, obraId);
  if (cerrada) return { ok: false, error: cerrada };

  const meta = await metaQueManda(sesion.companyId, obraId);
  if (!meta) return { ok: false, error: "Esta obra todavía no tiene presupuesto meta." };

  if (meta.aprobadaAt !== null) {
    return {
      ok: false,
      error:
        `La meta v${meta.version} está aprobada y no se puede editar. ` +
        "Para cambiarla se carga una versión nueva.",
    };
  }

  return { ok: true, metaId: meta.id };
}

type Transaccion = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

/**
 * Vuelve a sumar el costo de la meta desde sus lineas.
 *
 * Se llama despues de CADA cambio y dentro de la misma transaccion: si el
 * total se recalculara aparte, un fallo entre medias dejaria una meta cuyas
 * lineas no suman lo que dice su cabecera, y esa cifra gobierna la bolsa.
 *
 * Es la MISMA funcion que usa `crearMeta` -`cifrasDeLaMeta`- sobre la misma
 * lista. Antes esta edicion sumaba por su cuenta y le anadia unos gastos
 * generales que no tocaba; ahora no hay dos cuentas que puedan discrepar, y
 * por eso editar un sueldo aqui SI mueve el costo total, cosa que antes era
 * imposible: los gastos generales solo se podian cambiar volviendo al Excel.
 */
async function recalcularCosto(tx: Transaccion, metaId: string): Promise<void> {
  const lineas = await tx.presupuestoMetaItem.findMany({
    where: { presupuestoMetaId: metaId },
    select: {
      codigoRef: true,
      unidad: true,
      precioUnitario: true,
      parcial: true,
    },
  });

  const cifras = cifrasDeLaMeta(
    lineas.map((l) => ({
      codigoRef: l.codigoRef,
      unidad: l.unidad,
      precioUnitario: l.precioUnitario?.toString() ?? null,
      parcial: l.parcial?.toString() ?? null,
    })),
  );

  await tx.presupuestoMeta.update({
    where: { id: metaId },
    data: {
      costoDirecto: cifras.costoDirecto,
      costoPropio: cifras.costoPropio,
      costoTotal: cifras.costoTotal,
    },
  });
}

export interface DatosLineaMeta {
  descripcion: string;
  unidad?: string | null;
  metrado?: string | null;
  precioUnitario?: string | null;
  /// Solo se usa si no hay metrado y precio: entonces es una suma alzada.
  parcial?: string | null;
}

interface CifrasLinea {
  unidad: string | null;
  metrado: string | null;
  precioUnitario: string | null;
  parcial: string | null;
}

/**
 * Las cifras de una linea, normalizadas y con el parcial ya resuelto.
 *
 * El parcial se CALCULA cuando hay metrado y precio, en vez de aceptar el que
 * llegue: es la misma regla que la formula de la plantilla, y asi una linea
 * tecleada en la app y otra venida del Excel no pueden cuadrar distinto. Un
 * importe que viaja por el formulario y se guarda tal cual es ademas un
 * importe que cualquiera puede cambiar editando la pagina.
 */
function cifrasDeLinea(
  d: DatosLineaMeta,
): { ok: true; valores: CifrasLinea } | { ok: false; error: string } {
  const num = (v: string | null | undefined, decimales: number, campo: string) => {
    const crudo = (v ?? "").trim();
    if (crudo === "") return { ok: true as const, valor: null };
    const n = normalizarDecimal(crudo, decimales);
    if (n === null) return { ok: false as const, error: `El ${campo} no es un número.` };
    if (!esPositivo(n) && !esCero(n)) {
      return { ok: false as const, error: `El ${campo} no puede ser negativo.` };
    }
    return { ok: true as const, valor: n };
  };

  const metrado = num(d.metrado, 4, "metrado");
  if (!metrado.ok) return { ok: false, error: metrado.error };
  const precio = num(d.precioUnitario, 4, "precio unitario");
  if (!precio.ok) return { ok: false, error: precio.error };
  const suelto = num(d.parcial, 2, "importe");
  if (!suelto.ok) return { ok: false, error: suelto.error };

  const parcial =
    metrado.valor !== null && precio.valor !== null
      ? multiplicar(metrado.valor, precio.valor, 2)
      : suelto.valor;

  return {
    ok: true,
    valores: {
      unidad: (d.unidad ?? "").trim() || null,
      metrado: metrado.valor,
      precioUnitario: precio.valor,
      parcial,
    },
  };
}

export type ResultadoLinea = { ok: true } | { ok: false; error: string };

/**
 * Corregir una linea del borrador.
 *
 * El CODIGO no se toca aqui a proposito: es la referencia contra el
 * contractual, y cambiarlo mueve la linea de sitio en la comparacion sin que
 * se vea. Para eso estan anadir y borrar, que sí lo dicen.
 */
export async function editarLineaDeMeta(
  sesion: SesionActiva,
  obraId: string,
  lineaId: string,
  datos: DatosLineaMeta,
): Promise<ResultadoLinea> {
  const borrador = await borradorEditable(sesion, obraId);
  if (!borrador.ok) return borrador;

  const descripcion = datos.descripcion.trim();
  if (!descripcion) return { ok: false, error: "La línea necesita una descripción." };

  const cifras = cifrasDeLinea(datos);
  if (!cifras.ok) return cifras;

  // El identificador viene del formulario: se ata a ESTA meta antes de tocar
  // nada, o con el id de una linea ajena se editaria la meta de otra obra.
  const linea = await prisma.presupuestoMetaItem.findFirst({
    where: { id: lineaId, presupuestoMetaId: borrador.metaId },
    select: { id: true, tipo: true },
  });
  if (!linea) return { ok: false, error: "Esa línea no es de esta meta." };

  await prisma.$transaction(async (tx) => {
    await tx.presupuestoMetaItem.update({
      where: { id: linea.id },
      data: {
        descripcion: descripcion.slice(0, 500),
        unidad: cifras.valores.unidad?.slice(0, 20) ?? null,
        metrado: cifras.valores.metrado,
        precioUnitario: cifras.valores.precioUnitario,
        // Un capitulo es un titulo: no lleva importe propio y no suma.
        parcial: linea.tipo === "CAPITULO" ? null : cifras.valores.parcial,
      },
    });
    await recalcularCosto(tx, borrador.metaId);
  });

  return { ok: true };
}

/** Anadir una linea al final del borrador. */
export async function anadirLineaAMeta(
  sesion: SesionActiva,
  obraId: string,
  datos: DatosLineaMeta & { codigoRef: string | null },
): Promise<ResultadoLinea> {
  const borrador = await borradorEditable(sesion, obraId);
  if (!borrador.ok) return borrador;

  const descripcion = datos.descripcion.trim();
  if (!descripcion) return { ok: false, error: "La línea necesita una descripción." };

  const cifras = cifrasDeLinea(datos);
  if (!cifras.ok) return cifras;

  const codigoRef = (datos.codigoRef ?? "").trim() || null;

  if (codigoRef !== null) {
    const repetido = await prisma.presupuestoMetaItem.findFirst({
      where: { presupuestoMetaId: borrador.metaId, codigoRef },
      select: { id: true },
    });
    if (repetido) {
      return {
        ok: false,
        error: `El código ${codigoRef} ya está en la meta. Cada línea es única.`,
      };
    }
  }

  const ultima = await prisma.presupuestoMetaItem.findFirst({
    where: { presupuestoMetaId: borrador.metaId },
    orderBy: { orden: "desc" },
    select: { orden: true },
  });

  await prisma.$transaction(async (tx) => {
    await tx.presupuestoMetaItem.create({
      data: {
        presupuestoMetaId: borrador.metaId,
        codigoRef,
        descripcion: descripcion.slice(0, 500),
        // Se anaden PARTIDAS: un capitulo nuevo cambia la jerarquia entera, y
        // eso es rehacer la meta, no corregirla.
        tipo: "PARTIDA",
        nivel: 1,
        orden: (ultima?.orden ?? 0) + 1,
        unidad: cifras.valores.unidad?.slice(0, 20) ?? null,
        metrado: cifras.valores.metrado,
        precioUnitario: cifras.valores.precioUnitario,
        parcial: cifras.valores.parcial,
        porcentajeRecargo: null,
      },
    });
    await recalcularCosto(tx, borrador.metaId);
  });

  return { ok: true };
}

/** Quitar una linea del borrador. */
export async function eliminarLineaDeMeta(
  sesion: SesionActiva,
  obraId: string,
  lineaId: string,
): Promise<ResultadoLinea> {
  const borrador = await borradorEditable(sesion, obraId);
  if (!borrador.ok) return borrador;

  const filas = await prisma.presupuestoMetaItem.findMany({
    where: { presupuestoMetaId: borrador.metaId },
    orderBy: { orden: "asc" },
    select: { id: true, nivel: true, tipo: true, codigoRef: true },
  });

  const linea = filas.find((f) => f.id === lineaId);
  if (!linea) return { ok: false, error: "Esa línea no es de esta meta." };

  /*
   * UN CAPITULO YA SE PUEDE BORRAR, y hasta el 27 de agosto de 2026 no.
   *
   * El motivo de entonces era bueno: «sus partidas se quedarian sin sitio y
   * sin recargo». Lo era porque el arbol solo se podia mirar, no tocar, y
   * borrar el titulo dejaba las suyas colgando de quien quedara encima. Desde
   * que hay renumeracion eso se arregla solo: las que colgaban de el suben un
   * escalon y se renumera entero, que es exactamente lo que uno espera al
   * borrar un titulo intermedio.
   *
   * NO se borran las de dentro. Borrar un capitulo y llevarse veinte partidas
   * por delante en un solo clic es la clase de gesto que no se puede deshacer
   * y que nadie espera: se quita el titulo y su contenido se queda.
   */
  const delArbol = filas.filter((f) => f.codigoRef !== null);
  const esDelArbol = linea.codigoRef !== null;

  await prisma.$transaction(async (tx) => {
    await tx.presupuestoMetaItem.delete({ where: { id: linea.id } });

    if (esDelArbol) {
      const quedan = renumerar(
        quitar(
          delArbol.map((f) => ({
            id: f.id,
            nivel: f.nivel ?? 0,
            tipo: f.tipo as "CAPITULO" | "PARTIDA",
            codigo: f.codigoRef,
          })),
          linea.id,
        ),
      );

      for (const [i, l] of quedan.entries()) {
        await tx.presupuestoMetaItem.update({
          where: { id: l.id },
          data: {
            codigoRef: l.codigo,
            nivel: l.nivel,
            tipo: l.tipo,
            orden: i,
            ...(l.tipo === "CAPITULO"
              ? { parcial: null, metrado: null, precioUnitario: null }
              : {}),
          },
        });
      }
    }

    await recalcularCosto(tx, borrador.metaId);
  });

  return { ok: true };
}

/**
 * Mover una linea del borrador: subir, bajar, meter dentro o sacar.
 *
 * POR QUE HACE FALTA, con el caso que lo pidio delante: un presupuesto de otra
 * oficina trae la jerarquia en la maqueta y no en la numeracion. `PRIMER PISO`
 * agrupa en el papel a `REDES DE DESAGUE`, pero sus codigos —`7.01.00` y
 * `7.02.00`— son de hermanos, y GCM solo puede dibujar el arbol de los
 * numeros. Antes de esto, la unica salida era renumerar el Excel a mano y
 * volver a subirlo.
 *
 * SE MUEVE LA RAMA ENTERA. Mover un capitulo sin sus partidas las dejaria
 * colgando de quien quede encima, que es cambiar de sitio dinero ajeno sin
 * que nadie lo haya pedido.
 *
 * Y SE RENUMERA TODO DESPUES, no solo lo movido: los codigos son la posicion
 * en el arbol, asi que en cuanto algo cambia de sitio dejan de describirlo.
 * Renumerar entero es lo unico que garantiza que no queden dos `7.02.00` ni
 * un `7.03` que ya no viene detras de ningun `7.02`.
 *
 * El tipo se recalcula solo: es capitulo lo que tiene hijas. Por eso «crear un
 * capitulo» no necesita boton propio —se añade una linea y se le mete algo
 * debajo— y por eso no puede quedar un capitulo vacio fingiendo ser un titulo.
 * Cuando una partida con importe pasa a capitulo, PIERDE ese importe: un
 * capitulo vale la suma de los suyos. Se avisa en el resultado, porque son
 * miles de soles que dejan de estar sin que nadie los haya tocado.
 */
export async function moverLineaDeMeta(
  sesion: SesionActiva,
  obraId: string,
  lineaId: string,
  direccion: Direccion,
): Promise<
  | { ok: true; aviso: string | null }
  | { ok: false; error: string }
> {
  const borrador = await borradorEditable(sesion, obraId);
  if (!borrador.ok) return borrador;

  const filas = await prisma.presupuestoMetaItem.findMany({
    where: { presupuestoMetaId: borrador.metaId },
    orderBy: { orden: "asc" },
    select: { id: true, nivel: true, tipo: true, codigoRef: true, parcial: true },
  });

  /*
   * LAS LINEAS PROPIAS DE LA META NO ENTRAN EN EL ARBOL.
   *
   * Son las que no tienen codigo -un sueldo, un alquiler, una poliza-: cuestan
   * y suman, pero no cuelgan de ningun capitulo del contrato. Meterlas en la
   * renumeracion les inventaria un codigo, y con codigo pasarian a compararse
   * contra el contractual, que es justo lo que no son. Se quedan donde estan y
   * conservan su orden.
   */
  const delArbol = filas.filter((f) => f.codigoRef !== null);
  if (!delArbol.some((f) => f.id === lineaId)) {
    return {
      ok: false,
      error:
        "Esa línea no se puede mover: es un costo propio de la meta y no " +
        "cuelga de ningún capítulo.",
    };
  }

  const movido = mover(
    delArbol.map((f) => ({
      id: f.id,
      nivel: f.nivel ?? 0,
      tipo: f.tipo as "CAPITULO" | "PARTIDA",
      codigo: f.codigoRef,
    })),
    lineaId,
    direccion,
  );
  if (!movido.ok) return { ok: false, error: movido.error };

  const antes = delArbol.map((f) => ({
    id: f.id,
    nivel: f.nivel,
    tipo: f.tipo as "CAPITULO" | "PARTIDA",
    codigo: f.codigoRef,
  }));
  const despues = renumerar(movido.lineas);

  const conImporte = new Set(
    filas.filter((f) => f.parcial !== null).map((f) => f.id),
  );
  const pierden = lineasQuePierdenImporte(antes, despues, conImporte);

  await prisma.$transaction(async (tx) => {
    for (const [i, l] of despues.entries()) {
      await tx.presupuestoMetaItem.update({
        where: { id: l.id },
        data: {
          codigoRef: l.codigo,
          nivel: l.nivel,
          tipo: l.tipo,
          orden: i,
          // Un capitulo no lleva importe propio: vale lo que suman los suyos.
          ...(l.tipo === "CAPITULO"
            ? { parcial: null, metrado: null, precioUnitario: null }
            : {}),
        },
      });
    }

    /*
     * Las lineas propias van DETRAS, conservando su orden entre ellas.
     *
     * No compiten por un sitio en el arbol porque no estan en el, pero el
     * `orden` es unico en la tabla y tienen que caer en alguna parte. Al final
     * es donde menos estorban y donde ya se pintan hoy.
     */
    const propias = filas.filter((f) => f.codigoRef === null);
    for (const [i, f] of propias.entries()) {
      await tx.presupuestoMetaItem.update({
        where: { id: f.id },
        data: { orden: despues.length + i },
      });
    }

    await recalcularCosto(tx, borrador.metaId);
  });

  return {
    ok: true,
    aviso:
      pierden.length === 0
        ? null
        : pierden.length === 1
          ? "Una partida pasó a ser capítulo y se le quitó el importe: ahora vale la suma de lo que tiene dentro."
          : `${pierden.length} partidas pasaron a ser capítulo y se les quitó el importe: ahora valen la suma de lo que tienen dentro.`,
  };
}

/**
 * Fijar lo que cobra el contratista de un bloque, y repartirlo.
 *
 * SE PONE EN LA FILA QUE AGRUPA -el capitulo si lo cubre un solo contratista,
 * o el subcapitulo cuando son varios- y afecta a las partidas que cuelgan de
 * ella hasta el siguiente bloque con porcentajes propios: manda el ancestro
 * MAS CERCANO. Es lo que permite dos contratistas en un capitulo sin inventar
 * ningun concepto nuevo.
 *
 * El importe de cada partida se recalcula SIEMPRE desde el precio cotizado,
 * nunca desde el que se ensena: aplicar el factor nuevo sobre el ya ajustado
 * encadenaria los dos y el presupuesto se alejaria de la cotizacion un poco
 * mas en cada correccion. Ver `recalcularBloque`.
 */
export async function fijarAjusteDelContratista(
  sesion: SesionActiva,
  obraId: string,
  lineaId: string,
  datos: { descuento: string; gastosGenerales: string; utilidad: string },
): Promise<ResultadoLinea> {
  const borrador = await borradorEditable(sesion, obraId);
  if (!borrador.ok) return borrador;

  const pct = (valor: string, nombre: string) => {
    const limpio = valor.trim();
    if (limpio === "") return { ok: true as const, valor: null };
    const n = normalizarDecimal(limpio, 3);
    if (n === null) return { ok: false as const, error: `El ${nombre} no es un número.` };
    // Un descuento del 120 % dejaria el capitulo en negativo, y un margen de
    // mil por ciento es siempre un cero de mas. Se rechaza en vez de guardar
    // una cifra creible y equivocada.
    if (Number(n) < 0 || Number(n) > 100) {
      return { ok: false as const, error: `El ${nombre} va de 0 a 100.` };
    }
    return { ok: true as const, valor: n };
  };

  const d = pct(datos.descuento, "descuento");
  if (!d.ok) return d;
  const g = pct(datos.gastosGenerales, "porcentaje de gastos generales");
  if (!g.ok) return g;
  const u = pct(datos.utilidad, "porcentaje de utilidad");
  if (!u.ok) return u;

  const linea = await prisma.presupuestoMetaItem.findFirst({
    where: { id: lineaId, presupuestoMetaId: borrador.metaId },
    select: { id: true, tipo: true, codigoRef: true },
  });
  if (!linea) return { ok: false, error: "Esa línea no es de esta meta." };
  if (linea.tipo !== "CAPITULO" || linea.codigoRef === null) {
    return {
      ok: false,
      error:
        "Lo que cobra el contratista se pone en el capítulo o subcapítulo que " +
        "agrupa sus partidas, no en una partida suelta.",
    };
  }

  const todas = await prisma.presupuestoMetaItem.findMany({
    where: { presupuestoMetaId: borrador.metaId, codigoRef: { not: null } },
    select: {
      id: true, codigoRef: true, tipo: true, parcial: true, parcialCotizado: true,
      porcentajeDescuentoContratista: true,
      porcentajeGastosGeneralesContratista: true,
      porcentajeUtilidadContratista: true,
    },
    orderBy: { orden: "asc" },
  });

  const ajuste = { descuento: d.valor, gastosGenerales: g.valor, utilidad: u.valor };
  const codigos = new Set(todas.map((t) => t.codigoRef!));

  /** El bloque: las partidas cuyo ancestro con porcentajes es ESTA linea. */
  const delBloque = todas.filter((t) => {
    if (t.tipo !== "PARTIDA" || t.codigoRef === null) return false;
    let padre = codigoPadre(t.codigoRef, codigos);
    while (padre) {
      const p = todas.find((x) => x.codigoRef === padre);
      if (!p) break;
      // El primero que lleve porcentajes manda. Si es este, la partida es suya.
      const suyo = p.id === linea.id;
      const tieneAjuste =
        p.porcentajeDescuentoContratista !== null ||
        p.porcentajeGastosGeneralesContratista !== null ||
        p.porcentajeUtilidadContratista !== null;
      if (suyo) return true;
      if (tieneAjuste) return false;
      padre = codigoPadre(padre, codigos);
    }
    return false;
  });

  const recalculadas = recalcularBloque(
    delBloque.map((t) => ({
      codigo: t.codigoRef!,
      parcial: t.parcial?.toString() ?? null,
      parcialCotizado: t.parcialCotizado?.toString() ?? null,
    })),
    ajuste,
  );

  await prisma.$transaction(async (tx) => {
    await tx.presupuestoMetaItem.update({
      where: { id: linea.id },
      data: {
        porcentajeDescuentoContratista: ajuste.descuento,
        porcentajeGastosGeneralesContratista: ajuste.gastosGenerales,
        porcentajeUtilidadContratista: ajuste.utilidad,
      },
    });

    for (const [i, r] of recalculadas.entries()) {
      const original = delBloque[i]!;
      await tx.presupuestoMetaItem.update({
        where: { id: original.id },
        data: { parcial: r.parcial, parcialCotizado: r.parcialCotizado },
      });
    }

    await recalcularCosto(tx, borrador.metaId);
  });

  return { ok: true };
}
