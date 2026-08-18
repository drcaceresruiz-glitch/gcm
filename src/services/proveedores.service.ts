import "server-only";
import { prisma } from "@/lib/prisma";
import { puede } from "@/lib/rbac";
import { alcanzaObra } from "@/lib/alcance-obras";
import {
  contarPaginas,
  normalizarPagina,
  saltar,
  POR_PAGINA,
  type Pagina,
} from "@/lib/paginacion";
import type { SesionActiva } from "@/services/sesion.service";
import type {
  MonedaCuenta,
  OrigenRegistro,
  RolProveedor,
  TipoCuenta,
  TipoImpuesto,
} from "@/generated/prisma/enums";
import {
  estadoDelContrato,
  type EstadoContrato,
} from "@/lib/semaforo-contratista";

/**
 * Catalogo de proveedores de la empresa.
 *
 * El RUC es la identidad, y es unico por empresa. No es un detalle
 * administrativo: es la clave que impide que el mismo proveedor entre dos
 * veces, tecleado una y cargado de un archivo la otra. Que las dos vias no se
 * pisen se cierra AQUI y en la base, no en la pantalla.
 *
 * Un proveedor no se borra nunca, se desactiva: sus ordenes son historia de
 * la obra y tienen que seguir diciendo a quien se le compro.
 */

/** 11 digitos. Los de empresa empiezan por 20 y los de persona natural por 10. */
const RUC = /^\d{11}$/;

export interface ProveedorResumen {
  id: string;
  razonSocial: string;
  ruc: string;
  contactoNombre: string | null;
  contactoTelefono: string | null;
  email: string | null;
  banco: string | null;
  tipoCuenta: TipoCuenta | null;
  monedaCuenta: MonedaCuenta | null;
  cuentaBancaria: string | null;
  cci: string | null;
  /// La del Banco de la Nacion, aparte de la corriente: no es la misma cuenta
  /// ni sirve para lo mismo.
  cuentaDetraccion: string | null;
  /// Vende, ejecuta, o las dos cosas.
  rol: RolProveedor;
  /// Que impuesto lleva lo que emite. De aqui lo hereda cada orden suya.
  tipoImpuesto: TipoImpuesto;
  activo: boolean;
  origen: OrigenRegistro;
  /// Cuantas ordenes tiene. Se ensena para que nadie desactive a ciegas a
  /// quien lleva media obra.
  totalOrdenes: number;
}

export type Resultado =
  | { ok: true; id: string }
  | { ok: false; error: string };

/**
 * Los campos de un proveedor en las listas. Va en una constante porque lo
 * comparten la lista completa y la paginada, y son la misma ficha: si se
 * separan, una de las dos pantallas acaba ensenando menos que la otra sin
 * que nadie lo decida.
 */
const CAMPOS_RESUMEN = {
  id: true,
  razonSocial: true,
  ruc: true,
  contactoNombre: true,
  contactoTelefono: true,
  email: true,
  banco: true,
  tipoCuenta: true,
  monedaCuenta: true,
  cuentaBancaria: true,
  cci: true,
  cuentaDetraccion: true,
  rol: true,
  tipoImpuesto: true,
  activo: true,
  origen: true,
  _count: { select: { ordenes: true } },
} as const;

function filtroDe(sesion: SesionActiva, incluirInactivos: boolean) {
  return {
    companyId: sesion.companyId,
    ...(incluirInactivos ? {} : { activo: true }),
  };
}

/**
 * Lo que se escribe en el buscador, convertido en condicion.
 *
 * Busca en razon social, RUC y telefono, que es lo que la gente tiene a mano
 * cuando busca a alguien: el nombre a medias, el RUC de una factura, o el
 * numero desde el que le acaban de llamar.
 *
 * El telefono se compara SIN separadores: en la base hay «987 654 321» y
 * «987-654-321» conviviendo, y quien busca teclea nueve digitos seguidos. Sin
 * esto, el buscador falla justo con el dato mas facil de teclear. MariaDB no
 * tiene un `replace` encadenable comodo en Prisma, asi que se prueban las dos
 * formas: tal cual y con los separadores mas comunes.
 */
function filtroDeBusqueda(busqueda?: string) {
  const texto = busqueda?.trim();
  if (!texto) return {};

  const soloDigitos = texto.replace(/\D/g, "");

  const condiciones: object[] = [
    { razonSocial: { contains: texto } },
    { ruc: { contains: texto } },
    { contactoTelefono: { contains: texto } },
    { contactoNombre: { contains: texto } },
  ];

  if (soloDigitos.length >= 3) {
    condiciones.push({ ruc: { contains: soloDigitos } });
    condiciones.push({ contactoTelefono: { contains: soloDigitos } });
  }

  return { OR: condiciones };
}

/**
 * TODOS los proveedores, sin paginar.
 *
 * No se pagina a proposito: de aqui se llena el desplegable de proveedores
 * del formulario de ordenes. Recortarla a una pagina dejaria fuera al resto
 * **sin que fallase nada** —el desplegable seguiria abriendo, solo que sin
 * el proveedor que se buscaba—, y ese es justo el tipo de error que aqui se
 * cierra en la estructura y no confiando en que nadie se equivoque.
 *
 * Para la pantalla del catalogo, que si se pagina, esta
 * `listarProveedoresPagina`.
 */
export async function listarProveedores(
  sesion: SesionActiva,
  incluirInactivos = false,
): Promise<ProveedorResumen[]> {
  if (!puede(sesion, "proveedor:leer")) return [];

  const filas = await prisma.proveedor.findMany({
    where: filtroDe(sesion, incluirInactivos),
    orderBy: { razonSocial: "asc" },
    select: CAMPOS_RESUMEN,
  });

  return filas.map(({ _count, ...p }) => ({
    ...p,
    totalOrdenes: _count.ordenes,
  }));
}

/** El catalogo de `/empresa/proveedores`, de veinte en veinte. */
export async function listarProveedoresPagina(
  sesion: SesionActiva,
  opciones: {
    incluirInactivos?: boolean;
    pagina?: string;
    porPagina?: number;
    /// Nombre, RUC o telefono, a medias. Vacio no filtra nada.
    busqueda?: string;
    /// Solo los que ejecutan, solo los que venden, o todos si no se dice.
    rol?: RolProveedor;
  } = {},
): Promise<Pagina<ProveedorResumen>> {
  const porPagina = opciones.porPagina ?? POR_PAGINA;

  if (!puede(sesion, "proveedor:leer")) {
    return { filas: [], total: 0, pagina: 1, totalPaginas: 1 };
  }

  // AMBOS entra siempre que se filtre por uno de los dos: quien hace las dos
  // cosas es contratista cuando se buscan contratistas. Filtrar por igualdad
  // exacta lo dejaria fuera de las dos listas, que es el peor resultado.
  const porRol =
    opciones.rol && opciones.rol !== "AMBOS"
      ? { rol: { in: [opciones.rol, "AMBOS"] as RolProveedor[] } }
      : {};

  const where = {
    ...filtroDe(sesion, opciones.incluirInactivos ?? false),
    ...porRol,
    ...filtroDeBusqueda(opciones.busqueda),
  };

  const total = await prisma.proveedor.count({ where });
  const totalPaginas = contarPaginas(total, porPagina);
  const pagina = normalizarPagina(opciones.pagina, totalPaginas);

  const filas = await prisma.proveedor.findMany({
    where,
    orderBy: { razonSocial: "asc" },
    skip: saltar(pagina, porPagina),
    take: porPagina,
    select: CAMPOS_RESUMEN,
  });

  return {
    filas: filas.map(({ _count, ...p }) => ({
      ...p,
      totalOrdenes: _count.ordenes,
    })),
    total,
    pagina,
    totalPaginas,
  };
}

export interface DatosProveedor {
  razonSocial: string;
  ruc: string;
  contactoNombre?: string;
  contactoTelefono?: string;
  email?: string;
  banco?: string;
  /// Cadena vacia = sin indicar. Se convierte a null al guardar.
  tipoCuenta?: string;
  monedaCuenta?: string;
  cuentaBancaria?: string;
  cci?: string;
  /// La del Banco de la Nacion. Cadena vacia = sin indicar.
  cuentaDetraccion?: string;
  /// "PROVEEDOR" | "CONTRATISTA" | "AMBOS". Si no llega, se queda en PROVEEDOR,
  /// que es lo que era todo el catalogo hasta ahora.
  rol?: string;
  /// "IGV" | "RENTA" | "NINGUNO". Si no llega, se queda en IGV.
  tipoImpuesto?: string;
}

/** Comprobaciones de forma, comunes al alta y a la edicion. */
function validar(datos: DatosProveedor): string | null {
  if (!datos.razonSocial.trim()) {
    return "Indica la razon social o el nombre del proveedor.";
  }

  const ruc = datos.ruc.trim();
  if (!RUC.test(ruc)) {
    return "El RUC son 11 digitos, sin espacios ni guiones.";
  }

  return null;
}

/** Limpia y recorta los campos a lo que aguanta la columna. */
function saneado(datos: DatosProveedor) {
  const opcional = (v: string | undefined, largo: number) =>
    v?.trim() ? v.trim().slice(0, largo) : null;

  // Un valor fuera del enum se guarda como null en vez de romper: viene de un
  // desplegable, y si alguien manipula la peticion lo peor que consigue es
  // dejar el campo vacio.
  const enumerado = <T extends string>(v: string | undefined, validos: T[]) =>
    v && (validos as string[]).includes(v) ? (v as T) : null;

  return {
    razonSocial: datos.razonSocial.trim().slice(0, 200),
    ruc: datos.ruc.trim(),
    contactoNombre: opcional(datos.contactoNombre, 150),
    contactoTelefono: opcional(datos.contactoTelefono, 30),
    email: opcional(datos.email, 150),
    banco: opcional(datos.banco, 80),
    tipoCuenta: enumerado<TipoCuenta>(datos.tipoCuenta, [
      "AHORROS",
      "CORRIENTE",
    ]),
    monedaCuenta: enumerado<MonedaCuenta>(datos.monedaCuenta, ["PEN", "USD"]),
    cuentaBancaria: opcional(datos.cuentaBancaria, 40),
    cci: opcional(datos.cci, 40),
    cuentaDetraccion: opcional(datos.cuentaDetraccion, 40),
    // Como el impuesto, tampoco admite null. Ante un valor raro se queda en
    // PROVEEDOR, que es lo que era todo el catalogo antes de existir el campo.
    rol:
      enumerado<RolProveedor>(datos.rol, [
        "PROVEEDOR",
        "CONTRATISTA",
        "AMBOS",
      ]) ?? "PROVEEDOR",
    // Este no admite null: toda orden lleva un tratamiento u otro. Ante un
    // valor raro se queda en IGV, que es el caso corriente y el que menos
    // sorprende si alguien no toco el desplegable.
    tipoImpuesto:
      enumerado<TipoImpuesto>(datos.tipoImpuesto, [
        "IGV",
        "RENTA",
        "NINGUNO",
      ]) ?? "IGV",
  };
}

export async function crearProveedor(
  sesion: SesionActiva,
  datos: DatosProveedor,
  origen: OrigenRegistro = "MANUAL",
): Promise<Resultado> {
  if (!puede(sesion, "proveedor:crear")) {
    return { ok: false, error: "No tienes permiso para crear proveedores." };
  }

  const error = validar(datos);
  if (error) return { ok: false, error };

  const campos = saneado(datos);

  /**
   * El RUC repetido se comprueba aqui para poder decir A QUIEN pertenece, no
   * solo que choca. Da igual que la clave unica de la base lo cierre tambien:
   * "Ese RUC ya es de FCM INGENIEROS" resuelve el problema y
   * "Unique constraint failed" obliga a ir a buscarlo.
   */
  const existente = await prisma.proveedor.findFirst({
    where: { companyId: sesion.companyId, ruc: campos.ruc },
    select: { razonSocial: true, activo: true },
  });

  if (existente) {
    return {
      ok: false,
      error: existente.activo
        ? `El RUC ${campos.ruc} ya esta dado de alta como "${existente.razonSocial}".`
        : `El RUC ${campos.ruc} pertenece a "${existente.razonSocial}", que esta desactivado. Vuelve a activarlo en vez de crearlo otra vez.`,
    };
  }

  const creado = await prisma.$transaction(async (tx) => {
    const proveedor = await tx.proveedor.create({
      data: { companyId: sesion.companyId, origen, ...campos },
      select: { id: true },
    });

    await tx.auditLog.create({
      data: {
        companyId: sesion.companyId,
        userId: sesion.userId,
        entidad: "Proveedor",
        entidadId: proveedor.id,
        accion: "CREATE",
        despues: { ...campos, origen },
      },
    });

    return proveedor;
  });

  return { ok: true, id: creado.id };
}

export async function editarProveedor(
  sesion: SesionActiva,
  proveedorId: string,
  datos: DatosProveedor,
): Promise<Resultado> {
  if (!puede(sesion, "proveedor:editar")) {
    return { ok: false, error: "No tienes permiso para editar proveedores." };
  }

  const error = validar(datos);
  if (error) return { ok: false, error };

  const campos = saneado(datos);

  // El filtro por empresa sale de la sesion: es lo unico que impide editar
  // el proveedor de otro cliente manipulando el identificador.
  const actual = await prisma.proveedor.findFirst({
    where: { id: proveedorId, companyId: sesion.companyId },
    select: {
      id: true,
      razonSocial: true,
      ruc: true,
      contactoNombre: true,
      contactoTelefono: true,
      email: true,
      banco: true,
      tipoCuenta: true,
      monedaCuenta: true,
      cuentaBancaria: true,
      cci: true,
      tipoImpuesto: true,
    },
  });

  if (!actual) return { ok: false, error: "Proveedor no encontrado." };

  if (campos.ruc !== actual.ruc) {
    const choque = await prisma.proveedor.findFirst({
      where: {
        companyId: sesion.companyId,
        ruc: campos.ruc,
        id: { not: proveedorId },
      },
      select: { razonSocial: true },
    });

    if (choque) {
      return {
        ok: false,
        error: `El RUC ${campos.ruc} ya es de "${choque.razonSocial}".`,
      };
    }
  }

  await prisma.$transaction(async (tx) => {
    await tx.proveedor.update({ where: { id: proveedorId }, data: campos });

    await tx.auditLog.create({
      data: {
        companyId: sesion.companyId,
        userId: sesion.userId,
        entidad: "Proveedor",
        entidadId: proveedorId,
        accion: "UPDATE",
        antes: { ...actual, id: undefined },
        despues: campos,
      },
    });
  });

  return { ok: true, id: proveedorId };
}

/**
 * Activa o desactiva un proveedor. Nunca se borra.
 *
 * Sus ordenes son historia de la obra y tienen que seguir diciendo a quien se
 * le compro. Desactivar solo lo saca de los desplegables de ordenes nuevas.
 */
export async function cambiarEstadoProveedor(
  sesion: SesionActiva,
  proveedorId: string,
  activo: boolean,
): Promise<Resultado> {
  if (!puede(sesion, "proveedor:editar")) {
    return { ok: false, error: "No tienes permiso para editar proveedores." };
  }

  const proveedor = await prisma.proveedor.findFirst({
    where: { id: proveedorId, companyId: sesion.companyId },
    select: { id: true, activo: true, razonSocial: true },
  });

  if (!proveedor) return { ok: false, error: "Proveedor no encontrado." };
  if (proveedor.activo === activo) return { ok: true, id: proveedorId };

  await prisma.$transaction(async (tx) => {
    await tx.proveedor.update({ where: { id: proveedorId }, data: { activo } });

    await tx.auditLog.create({
      data: {
        companyId: sesion.companyId,
        userId: sesion.userId,
        entidad: "Proveedor",
        entidadId: proveedorId,
        accion: "UPDATE",
        antes: { razonSocial: proveedor.razonSocial, activo: proveedor.activo },
        despues: { razonSocial: proveedor.razonSocial, activo },
      },
    });
  });

  return { ok: true, id: proveedorId };
}

/**
 * El semaforo de contrato de varios proveedores a la vez, para UNA obra.
 *
 * EN DOS CONSULTAS PARA TODA LA PAGINA, no una por fila: veinte proveedores
 * serian cuarenta viajes a la base para pintar veinte puntos de color. Aqui se
 * traen los encargos de esos veinte y las ordenes de esos veinte, y el color lo
 * decide `lib/semaforo-contratista`, que es puro y esta probado.
 *
 * Devuelve un mapa por id. Quien no aparezca no tiene nada en esa obra, y la
 * pantalla lo pinta como `ninguno` sin volver a preguntar.
 *
 * Acotado por empresa aunque los ids vengan de una lista ya filtrada: esta
 * funcion es publica y no puede fiarse de quien la llame.
 */
export async function semaforoDeContratos(
  sesion: SesionActiva,
  obraId: string,
  proveedorIds: readonly string[],
  hoy = new Date(),
): Promise<Map<string, EstadoContrato>> {
  const salida = new Map<string, EstadoContrato>();
  if (proveedorIds.length === 0) return salida;
  if (!puede(sesion, "proveedor:leer")) return salida;
  // El pool de contratistas SI se comparte entre obras; su contrato en ESTA
  // obra, no. Ver `@/lib/alcance-obras`.
  if (!alcanzaObra(sesion, obraId)) return salida;

  // Que la obra sea de la empresa se comprueba aqui: sin esto, un id de obra
  // ajena devolveria los encargos de otra constructora.
  const obra = await prisma.project.findFirst({
    where: { id: obraId, companyId: sesion.companyId },
    select: { id: true },
  });
  if (!obra) return salida;

  const [encargos, ordenes] = await Promise.all([
    prisma.encargoProveedor.findMany({
      where: { projectId: obraId, proveedorId: { in: [...proveedorIds] } },
      select: {
        proveedorId: true,
        estado: true,
        fechaInicio: true,
        fechaFin: true,
      },
    }),
    prisma.ordenCompra.findMany({
      where: { projectId: obraId, proveedorId: { in: [...proveedorIds] } },
      select: { proveedorId: true },
      distinct: ["proveedorId"],
    }),
  ]);

  const porProveedor = new Map<string, typeof encargos>();
  for (const e of encargos) {
    const suyos = porProveedor.get(e.proveedorId) ?? [];
    suyos.push(e);
    porProveedor.set(e.proveedorId, suyos);
  }

  const conOrdenes = new Set(ordenes.map((o) => o.proveedorId));

  for (const id of proveedorIds) {
    salida.set(
      id,
      estadoDelContrato(porProveedor.get(id) ?? [], conOrdenes.has(id), hoy),
    );
  }

  return salida;
}
