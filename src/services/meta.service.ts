import "server-only";
import { prisma } from "@/lib/prisma";
import { puede } from "@/lib/rbac";
import { normalizarDecimal, esPositivo, esCero } from "@/lib/decimal";
import { subtotalesPorRama } from "@/lib/jerarquia-partidas";
import { cifrasDeLaMeta } from "@/lib/costo-meta";
import {
  calcularBolsa,
  desfaseDeMeta,
  type Bolsa,
  type Desfase,
  type LineaContractual,
  type LineaMeta,
  type ModoMeta,
} from "@/lib/bolsa";
import {
  presupuestoVigenteDeObra,
  SinLineaBaseError,
} from "@/services/movimientos.service";
import { motivoSiObraCerrada } from "@/services/obra-abierta";
import type { SesionActiva } from "@/services/sesion.service";

/**
 * Presupuesto meta de la obra: lo que la empresa se compromete a gastar.
 *
 * Espeja `revisiones.service` —versiones, congelado con `aprobadaAt`, mismo
 * patron de auditoria— con UNA diferencia deliberada: aqui SI se puede crear
 * una version nueva despues de aprobar la anterior.
 *
 * En el contractual eso esta prohibido, y con razon: una vez firmada, la
 * linea base es un contrato y los cambios van como adicionales encima. La
 * meta no es un contrato con nadie: es la promesa interna, y tiene que poder
 * rehacerse cuando el alcance cambia. Si no pudiera, la llegada de un
 * adicional dejaria la meta desfasada PARA SIEMPRE y la bolsa exagerando sin
 * remedio. Re-fijarla es justo la respuesta a ese desfase.
 */

export interface MetaResumen {
  id: string;
  version: number;
  modo: ModoMeta;
  fechaMeta: Date;
  costoDirecto: string;
  costoPropio: string;
  costoTotal: string;
  mesesPlazo: string;
  /// null si la meta nacio antes que el contractual: no se fijo contra nada.
  baselineVersion: number | null;
  movimientosAlFijar: number;
  aprobada: boolean;
  aprobadaAt: Date | null;
  aprobadaPor: string | null;
  creadaPor: string;
  notas: string | null;
  totalItems: number;
}

/** Las versiones de la meta, de la mas nueva a la mas vieja. */
export async function listarMetas(
  sesion: SesionActiva,
  obraId: string,
): Promise<MetaResumen[]> {
  if (!puede(sesion, "meta:leer")) return [];

  const filas = await prisma.presupuestoMeta.findMany({
    where: { projectId: obraId, project: { companyId: sesion.companyId } },
    orderBy: { version: "desc" },
    include: { _count: { select: { items: true } } },
  });

  return filas.map((m) => ({
    id: m.id,
    version: m.version,
    modo: m.modo as ModoMeta,
    fechaMeta: m.fechaMeta,
    costoDirecto: m.costoDirecto.toString(),
    costoPropio: m.costoPropio.toString(),
    costoTotal: m.costoTotal.toString(),
    mesesPlazo: m.mesesPlazo.toString(),
    baselineVersion: m.baselineVersion,
    movimientosAlFijar: m.movimientosAlFijar,
    aprobada: m.aprobadaAt !== null,
    aprobadaAt: m.aprobadaAt,
    aprobadaPor: m.aprobadaPor,
    creadaPor: m.creadaPor,
    notas: m.notas,
    totalItems: m._count.items,
  }));
}

/**
 * La meta que manda: la aprobada de version mas alta; si no hay ninguna
 * aprobada, el ultimo borrador.
 *
 * Se elige la APROBADA aunque exista un borrador mas nuevo, al contrario que
 * en la linea base. Un borrador de meta es trabajo en curso —alguien esta
 * recalculando el costo— y hasta que se congela no puede gobernar la bolsa
 * que se ensena en el tablero.
 */
export async function metaQueManda(companyId: string, obraId: string) {
  const donde = { projectId: obraId, project: { companyId } };

  const aprobada = await prisma.presupuestoMeta.findFirst({
    where: { ...donde, aprobadaAt: { not: null } },
    orderBy: { version: "desc" },
  });
  if (aprobada) return aprobada;

  return prisma.presupuestoMeta.findFirst({
    where: donde,
    orderBy: { version: "desc" },
  });
}

export interface ComparacionMeta {
  meta: MetaResumen;
  bolsa: Bolsa;
  /// Cuanto exagera la bolsa por movimientos aprobados despues de fijarla.
  desfase: Desfase;
}

/**
 * Por que no hay bolsa, cuando no la hay.
 *
 * Va como CODIGO y no solo como frase porque la pantalla tiene que ofrecer un
 * camino distinto en cada caso, y elegirlo buscando palabras dentro del
 * mensaje ya salio mal una vez: cuando faltaba el contractual, el texto decia
 * «linea base» y la pantalla mandaba a Revisiones —que sirve para congelar un
 * contractual que todavia no existe—. El usuario se quedaba dando vueltas
 * entre dos pantallas sin poder avanzar.
 */
export type MotivoSinBolsa =
  | "sin-permiso"
  | "sin-obra"
  | "sin-meta"
  /// Hay meta, pero no hay presupuesto contractual contra el que compararla.
  /// El paso siguiente es GENERARLO, no congelar nada.
  | "sin-contractual"
  /**
   * Se puede ver la meta pero no el presupuesto contractual, que es la otra
   * mitad de la resta.
   *
   * Le pasa hoy a RESIDENTE y a ADMIN_OBRA: tienen `meta:leer` y
   * `movimiento:crear`, pero no `movimiento:leer`. Hasta que esto se
   * distinguio, la pantalla se caia con el error crudo de permiso dentro de
   * una caja roja de «no se pudo calcular la bolsa», que parece una averia y
   * no una cuestion de permisos.
   */
  | "sin-permiso-contractual";

export type ResultadoComparacion =
  | { ok: true; comparacion: ComparacionMeta }
  | { ok: false; motivo: MotivoSinBolsa; error: string };

/**
 * El lado contractual, al nivel que pide el modo.
 *
 * En CAPITULO no se recorta el codigo por los puntos para adivinar el
 * capitulo: se usa `subtotalesPorRama`, que sube por la cadena REAL de padres.
 * En los presupuestos de verdad faltan filas intermedias y hay cabeceras
 * terminadas en ceros, y adivinar por el codigo es exactamente el error que
 * ya salio caro en el mapeo de tareas.
 */
async function lineasContractuales(
  modo: ModoMeta,
  obraId: string,
  partidas: readonly {
    wbsItemId: string;
    codigoPartida: string;
    descripcion: string;
    vigente: string;
  }[],
): Promise<LineaContractual[]> {
  if (modo !== "CAPITULO") {
    return partidas.map((p) => ({
      codigo: p.codigoPartida,
      descripcion: p.descripcion,
      importe: p.vigente,
    }));
  }

  const todos = await prisma.wbsItem.findMany({
    where: { projectId: obraId },
    orderBy: { orden: "asc" },
    select: { codigoPartida: true, descripcion: true, tipo: true, nivel: true },
  });

  const vigentePorCodigo = new Map(
    partidas.map((p) => [p.codigoPartida, p.vigente]),
  );

  const subtotales = subtotalesPorRama(
    todos.map((t) => ({
      codigo: t.codigoPartida,
      // Solo las partidas aportan importe, y el que aportan es el VIGENTE
      // (base mas adicionales), no el de la linea base.
      parcial: t.tipo === "PARTIDA"
        ? (vigentePorCodigo.get(t.codigoPartida) ?? "0.00")
        : null,
    })),
  );

  // Solo las raices: la suma de sus subtotales es exactamente el costo
  // directo de la obra, invariante que fija una prueba de `jerarquia-partidas`.
  // Bajar de ahi contaria el mismo dinero dos veces.
  return todos
    .filter((t) => t.nivel === 0)
    .map((t) => ({
      codigo: t.codigoPartida,
      descripcion: t.descripcion,
      importe: subtotales.get(t.codigoPartida) ?? "0.00",
    }));
}

/**
 * La bolsa de la obra: meta contra presupuesto vigente.
 *
 * Contra el VIGENTE y no contra la base, para que los adicionales cuenten. El
 * efecto secundario —que una meta vieja frente a adicionales nuevos exagere la
 * bolsa— se mide y se devuelve en `desfase`, no se esconde.
 */
export async function compararConContractual(
  sesion: SesionActiva,
  obraId: string,
): Promise<ResultadoComparacion> {
  if (!puede(sesion, "meta:leer")) {
    return {
      ok: false,
      motivo: "sin-permiso",
      error: "No tienes permiso para ver el presupuesto meta.",
    };
  }

  // Se comprueba ANTES de llamar, y no cazando la excepcion: el permiso que
  // falta es un dato conocido, no un accidente que haya que interceptar por
  // el texto de su mensaje.
  if (!puede(sesion, "movimiento:leer")) {
    return {
      ok: false,
      motivo: "sin-permiso-contractual",
      error:
        "Puedes ver el presupuesto meta, pero no el contractual, y la bolsa " +
        "es la diferencia entre los dos. Pidele a un administrador el permiso " +
        "de lectura de movimientos si necesitas ver la bolsa.",
    };
  }

  return comparacionDeObra(sesion.companyId, obraId);
}

/**
 * La misma comparacion, SIN SESION.
 *
 * Existe para el reloj de avisos, que corre sin nadie detras y necesita saber
 * si la bolsa de la obra se puso en rojo. Escribir alli una segunda version de
 * esta cuenta seria repetir el error que este proyecto acaba de pasar un dia
 * entero deshaciendo con el comprometido: cinco lecturas del mismo numero, y
 * la que se quedo atras enseñando dinero disponible que ya estaba gastado.
 *
 * NO comprueba permisos, por eso es interna. La empresa se recibe y se aplica
 * en cada consulta -nunca sale de la peticion-, y quien la llama desde una
 * pantalla es `compararConContractual`, que si los comprueba.
 */
export async function comparacionDeObra(
  companyId: string,
  obraId: string,
): Promise<ResultadoComparacion> {
  const obra = await prisma.project.findFirst({
    where: { id: obraId, companyId },
    select: {
        id: true,
        fechaInicio: true,
        fechaFinProgramada: true,
        metaIncluyeGastosGenerales: true,
      },
  });
  if (!obra) {
    return { ok: false, motivo: "sin-obra", error: "Obra no encontrada." };
  }

  const meta = await metaQueManda(companyId, obraId);
  if (!meta) {
    return {
      ok: false,
      motivo: "sin-meta",
      error: "Esta obra todavia no tiene presupuesto meta.",
    };
  }

  let vigente;
  try {
    vigente = await presupuestoVigenteDeObra(companyId, obraId);
  } catch (e) {
    if (e instanceof SinLineaBaseError) {
      return {
        ok: false,
        motivo: "sin-contractual",
        error:
          "Todavia no existe el presupuesto contractual, que es contra lo que " +
          "se compara la meta. Sale del real inflando cada capitulo: es el " +
          "paso siguiente, y no hay que teclearlo.",
      };
    }
    throw e;
  }

  const modo = meta.modo as ModoMeta;

  // La tabla de gastos generales quedo DORMIDA: ni se escribe ni se lee.
  const [items] = await Promise.all([
    prisma.presupuestoMetaItem.findMany({
      where: { presupuestoMetaId: meta.id },
      orderBy: { orden: "asc" },
      // Siempre, no solo en FRENTE: un `include` condicional deja el tipo en
      // `unknown` y obliga a castear. Fuera de FRENTE la tabla de reparto
      // esta vacia para esta meta, asi que la union no cuesta nada.
      include: { reparto: true },
    }),
  ]);

  // El reparto de un frente se pondera con el importe VIGENTE de cada
  // partida, no con el parcial de la linea base: si no, un adicional sobre
  // una partida repartida no llegaria nunca al frente que la ejecuta.
  const vigentePorId = new Map(
    vigente.partidas.map((p) => [p.wbsItemId, p.vigente]),
  );

  const lineasMeta: LineaMeta[] = items.map((i) => ({
    codigoRef: i.codigoRef,
    descripcion: i.descripcion,
    importe: i.parcial?.toString() ?? "0.00",
    reparto: i.reparto.map((r) => ({
      parcial: vigentePorId.get(r.wbsItemId) ?? "0.00",
      fraccion: r.fraccion.toString(),
    })),
  }));

  // El costo interno que no es partida —sueldos, alquileres, polizas— ya
  // viaja DENTRO de `lineasMeta`, con `codigoRef` en null. `calcularBolsa` lo
  // separa por ahi: va a la bolsa NETA, no a la de produccion, porque la de
  // arriba mide el margen de las partidas.
  const bolsa = calcularBolsa({
    modo,
    contractual: await lineasContractuales(modo, obraId, vigente.partidas),
    meta: lineasMeta,
    utilidadContractual: vigente.cascadaVigente.utilidad,
  });

  // Los movimientos aprobados DESPUES de fijar la meta. Se ordenan por numero
  // —el correlativo de la obra— y se saltan los que ya existian: es el mismo
  // criterio con el que se conto `movimientosAlFijar`.
  const posteriores = await prisma.movimientoPresupuestal.findMany({
    where: { projectId: obraId, estado: "APROBADO" },
    orderBy: { numero: "asc" },
    skip: meta.movimientosAlFijar,
    select: { importeNeto: true },
  });

  const mesesMeta = meta.mesesPlazo.toString();

  return {
    ok: true,
    comparacion: {
      meta: {
        id: meta.id,
        version: meta.version,
        modo,
        fechaMeta: meta.fechaMeta,
        costoDirecto: meta.costoDirecto.toString(),
        costoPropio: meta.costoPropio.toString(),
        costoTotal: meta.costoTotal.toString(),
        mesesPlazo: mesesMeta,
        baselineVersion: meta.baselineVersion,
        movimientosAlFijar: meta.movimientosAlFijar,
        aprobada: meta.aprobadaAt !== null,
        aprobadaAt: meta.aprobadaAt,
        aprobadaPor: meta.aprobadaPor,
        creadaPor: meta.creadaPor,
        notas: meta.notas,
        totalItems: items.length,
      },
      bolsa,
      desfase: desfaseDeMeta(
        posteriores.map((m) => ({ importeNeto: m.importeNeto.toString() })),
      ),
    },
  };
}

export interface EntradaItemMeta {
  /// Codigo contractual que espeja. null = linea propia de la meta.
  codigoRef: string | null;
  descripcion: string;
  tipo: "CAPITULO" | "PARTIDA";
  nivel?: number;
  unidad?: string | null;
  metrado?: string | null;
  precioUnitario?: string | null;
  /// El importe de la linea. null = es un TITULO y no suma. A diferencia del
  /// contractual, aqui no hay jerarquia que resolver: cada fila lleva lo suyo
  /// y el costo directo es la suma llana de las que tienen importe.
  parcial: string | null;
  /// Solo en capitulos: % de recargo con el que se genera el contractual.
  ///
  /// OBLIGATORIO a proposito, aunque casi siempre sea null: este dato ya se
  /// perdio una vez en silencio (el importador lo leia y el mapeo de la
  /// accion no lo copiaba). Siendo obligatorio, quien construya la entrada
  /// tiene que decidir, y `tsc` senala el sitio si alguien lo olvida.
  porcentajeRecargo: string | null;
  /// Opcional, "YYYY-MM-DD". Van juntas o ninguna -ya validado por quien
  /// arma la entrada, aqui solo se guardan.
  fechaInicio?: string | null;
  fechaFin?: string | null;
}

export interface DatosMeta {
  modo: ModoMeta;
  fechaMeta: string;
  mesesPlazo: string;
  notas?: string | null;
  items: EntradaItemMeta[];
}

export type ResultadoMeta =
  | { ok: true; id: string; version: number; costoTotal: string }
  | { ok: false; error: string };

/**
 * Cambiar el recargo de uno o varios capitulos de la meta, desde la app.
 *
 * Es el unico dato de la meta que se puede corregir sin volver al Excel, y a
 * proposito: el recargo NO es un costo, es la decision de margen —cuanto se
 * le carga al cliente sobre lo que cuesta— y es justo lo que se quiere poder
 * mover mirando la bolsa antes de firmar. Los costos siguen entrando por la
 * plantilla, que es donde se cuadran con los contratistas.
 *
 * Solo sobre un BORRADOR. Una meta aprobada esta congelada: si se pudiera
 * retocar su margen despues, «congelada» no querria decir nada. Para cambiarla
 * se crea una version nueva, que es como funciona el resto de la meta.
 *
 * El importe no viaja nunca: aqui entra un porcentaje y el dinero lo vuelve a
 * calcular el servidor a partir de el.
 */
export async function ajustarRecargosDeLaMeta(
  sesion: SesionActiva,
  obraId: string,
  /// Codigo -> porcentaje, como texto. "18" son 18%. Vale para un capitulo
  /// y para una partida suelta: ver el comentario de la consulta.
  recargos: Readonly<Record<string, string>>,
): Promise<{ ok: true; cambiados: number } | { ok: false; error: string }> {
  if (!puede(sesion, "meta:crear")) {
    return {
      ok: false,
      error: "No tienes permiso para cambiar el presupuesto meta.",
    };
  }

  const cerrada = await motivoSiObraCerrada(sesion, obraId);
  if (cerrada) return { ok: false, error: cerrada };

  const codigos = Object.keys(recargos);
  if (codigos.length === 0) return { ok: true, cambiados: 0 };

  const meta = await metaQueManda(sesion.companyId, obraId);
  if (!meta) return { ok: false, error: "Esta obra todavia no tiene presupuesto meta." };

  if (meta.aprobadaAt !== null) {
    return {
      ok: false,
      error:
        `La meta v${meta.version} esta aprobada y no se puede retocar. ` +
        "Para cambiar el margen se carga una version nueva.",
    };
  }

  /**
   * Cada porcentaje, normalizado y acotado.
   *
   * El tope no es una manía: un recargo de cuatro cifras casi siempre es un
   * dedo de mas al teclear, y el numero acabaria en un contrato.
   */
  const validados = new Map<string, string | null>();
  for (const [codigo, crudo] of Object.entries(recargos)) {
    const texto = String(crudo ?? "").trim();

    /*
     * VACIO NO ES CERO: es «esta linea no lleva recargo propio, que herede el
     * de su capitulo», que es exactamente lo que significa un `null` para
     * `generarContractual`. Borrar un recargo es una decision y tiene que
     * poder tomarse.
     *
     * Hasta el 23 de agosto de 2026 una casilla vaciada llegaba aqui y salia
     * «El recargo de 1.1 no es un numero»: no habia forma de deshacer un
     * recargo sin recargar la meta entera desde el Excel. Se notaba poco
     * mientras solo se recargaban capitulos; con las partidas es la accion de
     * todos los dias.
     */
    if (texto === "") {
      validados.set(codigo, null);
      continue;
    }

    const pct = normalizarDecimal(texto, 3);
    if (pct === null) {
      return { ok: false, error: `El recargo de ${codigo} no es un numero.` };
    }
    if (!esPositivo(pct) && !esCero(pct)) {
      return { ok: false, error: `El recargo de ${codigo} no puede ser negativo.` };
    }
    if (Number(pct) > 999) {
      return { ok: false, error: `El recargo de ${codigo} pasa del 999 %.` };
    }
    validados.set(codigo, pct);
  }

  /**
   * CAPITULOS Y PARTIDAS, no solo capitulos.
   *
   * Hasta el 23 de agosto de 2026 esto filtraba `tipo: "CAPITULO"` con el
   * argumento de que «el recargo de una partida suelta no existe, lo hereda
   * de su capitulo». Era falso desde el principio: `generarContractual`
   * resuelve el recargo empezando por el codigo de la PROPIA linea y solo
   * sube al padre si esa no lo trae -es la regla 2 de
   * `contractual-desde-meta.ts`-. El motor ya sabia recargar una partida; lo
   * unico que faltaba era dejar guardarlo.
   *
   * Y hace falta: no todas las partidas de un capitulo se margenan igual. Una
   * subcontrata que ya viene cerrada no admite el mismo recargo que la mano
   * de obra propia, y obligar a un porcentaje unico por capitulo es pedir que
   * el margen se invente en la media.
   *
   * Sigue sin poder recargarse una linea SIN codigo -un sueldo no se le
   * factura al cliente-, y eso lo garantiza `codigoRef: { in: ... }`.
   */
  const items = await prisma.presupuestoMetaItem.findMany({
    where: {
      presupuestoMetaId: meta.id,
      codigoRef: { in: [...validados.keys()] },
    },
    select: { id: true, codigoRef: true },
  });

  if (items.length === 0) {
    return { ok: false, error: "Ninguno de esos codigos esta en la meta." };
  }

  await prisma.$transaction(
    items.map((i) =>
      prisma.presupuestoMetaItem.update({
        where: { id: i.id },
        data: { porcentajeRecargo: validados.get(i.codigoRef ?? "") ?? null },
      }),
    ),
  );

  return { ok: true, cambiados: items.length };
}

export async function crearMeta(
  sesion: SesionActiva,
  obraId: string,
  datos: DatosMeta,
): Promise<ResultadoMeta> {
  if (!puede(sesion, "meta:crear")) {
    return { ok: false, error: "No tienes permiso para crear el presupuesto meta." };
  }

  const cerrada = await motivoSiObraCerrada(sesion, obraId);
  if (cerrada) return { ok: false, error: cerrada };

  const obra = await prisma.project.findFirst({
    where: { id: obraId, companyId: sesion.companyId },
    select: { id: true },
  });
  if (!obra) return { ok: false, error: "Obra no encontrada." };

  if (datos.items.length === 0) {
    return { ok: false, error: "La meta no tiene ni una linea." };
  }

  /**
   * La linea base ya NO es obligatoria para fijar la meta.
   *
   * Antes lo era: sin contractual no habia contra que comparar. Pero desde
   * que el contractual SE GENERA a partir del real, exigir un contractual
   * para poder crear el real era pescadilla que se muerde la cola.
   *
   * Se anota la version si la hay y null si no. Null es la verdad: esta meta
   * no se fijo contra ningun contractual porque nacio antes que el. Un cero
   * mentiria, y `desfaseDeMeta` no tiene nada que medir mientras no exista
   * el otro presupuesto.
   */
  const base = await prisma.baseline.findFirst({
    where: { projectId: obraId, aprobadaAt: { not: null } },
    orderBy: { version: "desc" },
    select: { version: true },
  });

  const mesesPlazo = normalizarDecimal(datos.mesesPlazo, 2);
  if (mesesPlazo === null || !esPositivo(mesesPlazo)) {
    return { ok: false, error: "El plazo en meses tiene que ser mayor que cero." };
  }

  // Un codigo repetido significa que la misma partida esta dos veces en la
  // meta: el costo directo saldria inflado y la bolsa hundida, sin error.
  const referencias = datos.items
    .map((i) => i.codigoRef)
    .filter((c): c is string => c !== null);
  const repetido = referencias.find(
    (c, i) => referencias.indexOf(c) !== i,
  );
  if (repetido) {
    return {
      ok: false,
      error: `El codigo ${repetido} aparece dos veces en la meta.`,
    };
  }

  /**
   * Las tres cifras, de UNA pasada sobre UNA lista.
   *
   * Aqui vivio el fallo mas caro de esta pantalla. Habia una segunda lista
   * -la hoja «Gastos Generales»- y, cuando esa hoja se retiro el 20 de agosto
   * de 2026, quedo una linea que ponia sus entradas a `[]` fijo. Al
   * restaurarla el 23 esa linea SOBREVIVIO: las filas volvian a guardarse en
   * su tabla y se veian en pantalla, pero el total valia cero. Una meta
   * enseñaba 600 de costo cuando eran 700, con el sueldo del residente
   * escrito en el Excel y sin contar. La obra no perdia 200, perdia 300.
   *
   * Ya no hay dos listas que sincronizar. Un sueldo es un item sin
   * `codigoRef` con la unidad en «mes», y `cifrasDeLaMeta` lo cuenta igual
   * que a cualquier otro.
   */
  const cifras = cifrasDeLaMeta(datos.items);

  const [ultima, movimientos] = await Promise.all([
    prisma.presupuestoMeta.findFirst({
      where: { projectId: obraId },
      orderBy: { version: "desc" },
      select: { version: true },
    }),
    prisma.movimientoPresupuestal.count({
      where: { projectId: obraId, estado: "APROBADO" },
    }),
  ]);

  const version = (ultima?.version ?? 0) + 1;
  const creadaPor = `${sesion.nombres} ${sesion.apellidos} (${sesion.email})`
    .trim()
    .slice(0, 150);

  const creada = await prisma.$transaction(async (tx) => {
    const meta = await tx.presupuestoMeta.create({
      data: {
        projectId: obraId,
        version,
        modo: datos.modo,
        fechaMeta: new Date(datos.fechaMeta),
        notas: datos.notas?.trim() || null,
        costoDirecto: cifras.costoDirecto,
        costoPropio: cifras.costoPropio,
        costoTotal: cifras.costoTotal,
        mesesPlazo,
        baselineVersion: base?.version ?? null,
        movimientosAlFijar: movimientos,
        creadaPor,
      },
      select: { id: true },
    });

    await tx.presupuestoMetaItem.createMany({
      data: datos.items.map((i, orden) => ({
        presupuestoMetaId: meta.id,
        codigoRef: i.codigoRef,
        descripcion: i.descripcion,
        tipo: i.tipo,
        nivel: i.nivel ?? 0,
        orden,
        unidad: i.unidad ?? null,
        metrado: i.metrado ?? null,
        precioUnitario: i.precioUnitario ?? null,
        parcial: i.parcial,
        porcentajeRecargo: i.porcentajeRecargo ?? null,
        // "YYYY-MM-DD" a medianoche UTC, no `new Date(iso)` local: es una
        // columna `@db.Date` y el dia no debe correrse por la zona horaria
        // de Peru. Mismo patron que `cronograma-manual.service.ts`.
        fechaInicioPlan: i.fechaInicio ? new Date(`${i.fechaInicio}T00:00:00.000Z`) : null,
        fechaFinPlan: i.fechaFin ? new Date(`${i.fechaFin}T00:00:00.000Z`) : null,
      })),
    });


    await tx.auditLog.create({
      data: {
        companyId: sesion.companyId,
        userId: sesion.userId,
        projectId: obraId,
        entidad: "PresupuestoMeta",
        entidadId: meta.id,
        accion: "CREATE",
        despues: {
          version,
          modo: datos.modo,
          costoDirecto: cifras.costoDirecto,
          costoPropio: cifras.costoPropio,
          costoTotal: cifras.costoTotal,
          mesesPlazo,
          baselineVersion: base?.version ?? null,
          lineas: datos.items.length,
        },
      },
    });

    return meta;
  });

  return { ok: true, id: creada.id, version, costoTotal: cifras.costoTotal };
}

class YaAprobada extends Error {}

export type ResultadoAprobacion =
  | { ok: true; version: number }
  | { ok: false; error: string };

/**
 * Congela la meta. A partir de aqui es inmutable.
 *
 * Es lo que hace que la bolsa signifique algo: con una meta editable bastaria
 * bajarla cuando el gasto se va, y todos los indicadores mentirian hacia
 * atras sin dejar rastro.
 */
export async function aprobarMeta(
  sesion: SesionActiva,
  metaId: string,
): Promise<ResultadoAprobacion> {
  if (!puede(sesion, "meta:aprobar")) {
    return { ok: false, error: "No tienes permiso para aprobar el presupuesto meta." };
  }

  const meta = await prisma.presupuestoMeta.findFirst({
    where: { id: metaId, project: { companyId: sesion.companyId } },
    select: {
      id: true, projectId: true, version: true,
      aprobadaAt: true, costoTotal: true,
    },
  });
  if (!meta) return { ok: false, error: "Presupuesto meta no encontrado." };

  if (meta.aprobadaAt) {
    return { ok: false, error: `La meta v${meta.version} ya estaba aprobada.` };
  }

  const cerrada = await motivoSiObraCerrada(sesion, meta.projectId);
  if (cerrada) return { ok: false, error: cerrada };

  // Solo la ultima. Congelar una version antigua teniendo un borrador mas
  // nuevo dejaria gobernando una meta ya superada, porque `metaQueManda`
  // toma la aprobada de version mas alta.
  const ultima = await prisma.presupuestoMeta.findFirst({
    where: { projectId: meta.projectId },
    orderBy: { version: "desc" },
    select: { version: true },
  });
  if (ultima && ultima.version !== meta.version) {
    return {
      ok: false,
      error:
        `Solo se puede aprobar la ultima meta, y la v${ultima.version} es ` +
        `posterior a esta. Aprueba esa, o eliminala antes.`,
    };
  }

  const aprobadaAt = new Date();
  const aprobadaPor = `${sesion.nombres} ${sesion.apellidos} (${sesion.email})`
    .trim()
    .slice(0, 150);

  try {
    await prisma.$transaction(async (tx) => {
      // `aprobadaAt: null` en el where es lo que hace segura la carrera: si
      // otra peticion aprobo primero, esta no encuentra fila y no sobrescribe
      // ni la fecha ni el firmante originales.
      const { count } = await tx.presupuestoMeta.updateMany({
        where: { id: meta.id, aprobadaAt: null },
        data: { aprobadaAt, aprobadaPor },
      });

      if (count === 0) throw new YaAprobada();

      await tx.auditLog.create({
        data: {
          companyId: sesion.companyId,
          userId: sesion.userId,
          projectId: meta.projectId,
          entidad: "PresupuestoMeta",
          entidadId: meta.id,
          accion: "APPROVE",
          antes: { aprobada: false },
          despues: {
            version: meta.version,
            aprobadaAt: aprobadaAt.toISOString(),
            aprobadaPor,
            costoTotal: meta.costoTotal.toString(),
          },
        },
      });
    });
  } catch (e) {
    if (e instanceof YaAprobada) {
      return { ok: false, error: `La meta v${meta.version} ya estaba aprobada.` };
    }
    throw e;
  }

  return { ok: true, version: meta.version };
}

export type ResultadoBorrado =
  | { ok: true; version: number }
  | { ok: false; error: string };

/**
 * Elimina un BORRADOR de meta. Una aprobada no se toca nunca.
 *
 * Existe por lo mismo que el de la semana del plan: una meta cargada por
 * error —el Excel equivocado, el modo que no era— hay que poder rehacerla, y
 * dejarla ahi como version muerta ensucia el historial que decide cual manda.
 * Se lleva por cascada sus lineas, su reparto y sus gastos generales.
 */
export async function eliminarBorrador(
  sesion: SesionActiva,
  metaId: string,
): Promise<ResultadoBorrado> {
  if (!puede(sesion, "meta:crear")) {
    return { ok: false, error: "No tienes permiso para eliminar el presupuesto meta." };
  }

  const meta = await prisma.presupuestoMeta.findFirst({
    where: { id: metaId, project: { companyId: sesion.companyId } },
    select: { id: true, projectId: true, version: true, aprobadaAt: true },
  });
  if (!meta) return { ok: false, error: "Presupuesto meta no encontrado." };

  if (meta.aprobadaAt) {
    return {
      ok: false,
      error:
        `La meta v${meta.version} esta aprobada y es inmutable. Si el alcance ` +
        `cambio, crea una version nueva.`,
    };
  }

  const cerrada = await motivoSiObraCerrada(sesion, meta.projectId);
  if (cerrada) return { ok: false, error: cerrada };

  await prisma.$transaction(async (tx) => {
    // La auditoria se escribe ANTES de borrar: despues no habria de que
    // dejar constancia, y esta fila es lo unico que queda de la version.
    await tx.auditLog.create({
      data: {
        companyId: sesion.companyId,
        userId: sesion.userId,
        projectId: meta.projectId,
        entidad: "PresupuestoMeta",
        entidadId: meta.id,
        accion: "DELETE",
        antes: { version: meta.version, aprobada: false },
      },
    });

    // `aprobadaAt: null` tambien aqui: si alguien la aprueba entre la lectura
    // y el borrado, este no encuentra fila y la meta congelada sobrevive.
    await tx.presupuestoMeta.deleteMany({
      where: { id: meta.id, aprobadaAt: null },
    });
  });

  return { ok: true, version: meta.version };
}
