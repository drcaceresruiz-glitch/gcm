import type { Role } from "@/generated/prisma/enums";

/**
 * Matriz de permisos declarativa.
 *
 * Principio de denegacion por defecto: un permiso que no aparece
 * explicitamente en la lista de un rol, no se concede. Anadir un permiso
 * nuevo no abre nada hasta que se asigna a un rol de forma consciente.
 *
 * Esta matriz gobierna la capa de servicios, que es donde se toma la
 * decision real. El middleware solo evita que el usuario navegue a una
 * pantalla que no le corresponde: es comodidad de interfaz, no una
 * frontera de seguridad.
 *
 * Desde la gestion de permisos por empresa, la matriz es la PLANTILLA y no
 * la ultima palabra: cada empresa puede conceder o revocar permisos sueltos
 * encima de ella (`company_permissions`). Quien decide es
 * `resolverPermisos`, que se ejecuta una vez por peticion al abrir la sesion
 * y deja el resultado en `SesionActiva.permisos`. Por eso `puede` recibe un
 * sujeto con sus permisos ya resueltos y no un rol: desde aqui, el rol solo
 * dice de donde se parte.
 */

export const PERMISOS = [
  "empresa:leer",
  "empresa:editar",
  /// Congelar la constructora y sacarla entera en un archivo, para llevarla
  /// a otra instalacion. Ver `INNEGOCIABLES`.
  "empresa:migrar",

  "usuario:leer",
  "usuario:crear",
  "usuario:editar",
  "usuario:desactivar",
  "usuario:resetear_clave",

  "obra:leer",
  "obra:crear",
  "obra:editar",
  "obra:eliminar",
  "obra:eliminar_cerrada",
  /// Recargar el respaldo de una obra borrada, como copia de solo lectura.
  "obra:restaurar",
  "obra:asignar_equipo",

  "partida:leer",
  "partida:crear",
  "partida:editar",
  "partida:eliminar",
  "partida:importar",

  "cronograma:leer",
  "cronograma:importar",
  // Escribir el plan a mano y quitar tareas. Van aparte de `importar` porque
  // no son lo mismo: importar anade una version y no destruye nada, mientras
  // que estos dos cambian y borran lo que ya hay. Colgarlos de `importar`
  // habria regalado el borrado a quien solo tenia que poder subir un archivo.
  "cronograma:editar",
  "cronograma:eliminar",
  "avance:registrar",
  "cronograma:linea_base",

  "plan_semanal:leer",
  "plan_semanal:gestionar",

  "lookahead:leer",
  "lookahead:gestionar",

  // La galeria de la obra: el escaparate, no la evidencia probatoria.
  // `publicar` va aparte de `gestionar` a proposito: subir y describir fotos
  // es trabajo de campo; decidir cuales ve EL CLIENTE es un acto de gerencia.
  "galeria:leer",
  "galeria:gestionar",
  "galeria:publicar",

  "linea_base:leer",
  "linea_base:crear",
  "linea_base:aprobar",

  "meta:leer",
  "meta:crear",
  "meta:aprobar",

  "movimiento:leer",
  "movimiento:crear",
  "movimiento:aprobar",

  "proveedor:leer",
  "proveedor:crear",
  "proveedor:editar",
  /// Escribirle. Va aparte de `editar` porque no es lo mismo mantener una
  /// ficha que mandar un correo con el membrete de la empresa a alguien de
  /// fuera: lo primero se deshace, lo segundo ya llego.
  "proveedor:contactar",

  "encargo:leer",
  "encargo:gestionar",
  "encargo:valorizar",

  "orden:leer",
  "orden:crear",
  "orden:aprobar",
  "orden:anular",

  "nota:leer",
  "nota:crear",
  /// Reescribir o borrar lo que ya se anoto. Va aparte de `crear` porque no
  /// es lo mismo: anotar y marcar atendido/reabrir son actos reversibles de
  /// campo, y corregir o destruir el texto de otro es un acto distinto —el
  /// mismo reparto que ya separa `encargo:valorizar` de `encargo:gestionar`.
  "nota:gestionar",

  "permiso:leer",
  "permiso:editar",

  "configuracion:editar",

  "auditoria:leer",
] as const;

export type Permiso = (typeof PERMISOS)[number];

/**
 * Permisos que NO se pueden reconfigurar por empresa.
 *
 * `linea_base:aprobar` y `movimiento:aprobar` son actos contractuales
 * irreversibles que mueven la cifra contra la que se mide la obra. Si se
 * volvieran configurables, cualquier dia alguien se los concede a quien no
 * debe y el sistema pierde la garantia que lo hace fiable.
 *
 * `meta:aprobar` esta aqui por un motivo DISTINTO, y conviene no confundirlo:
 * no es contractual —la meta no se pacta con nadie de fuera— sino una
 * separacion de funciones. Congelar la meta es lo que da sentido a la bolsa:
 * con una meta editable bastaria rebajarla cuando el gasto se va, y todos los
 * indicadores mentirian hacia atras sin dejar rastro. Quien EJECUTA contra la
 * meta no puede ser quien la fija. Si fuera configurable, la primera empresa
 * con prisa se lo concederia al residente y el control desapareceria sin que
 * nadie tomara la decision de quitarlo.
 *
 * Los dos `permiso:*` reparten todos los demas. Si se pudieran conceder, un
 * ADMIN podria darselos a un CONSULTOR y ese repartirse a si mismo el resto:
 * seria una escalada de privilegios con dos clics. Repartir permisos es un
 * acto de administracion, no una tarea delegable.
 *
 * `configuracion:editar` esta aqui por la misma familia de razones, y no por
 * ser "ajustes": lo que gobierna es el TELEFONO por el que salen los SMS de
 * la empresa, y por esa cola viajan los codigos de acceso en claro. Quien
 * pueda vincular un emisor puede leer el segundo factor de cualquiera de sus
 * companeros. Es escalada de privilegios con otro nombre.
 *
 * `obra:eliminar_cerrada` borra una obra TERMINADA y todo lo que cuelga de
 * ella: presupuesto, ordenes, cronograma, avances, fotos. Es el unico acto de
 * la aplicacion del que no se vuelve ni con la auditoria —queda constancia de
 * que se hizo, pero no lo que habia—, y por eso solo lo tiene el ADMIN. Notese
 * que es DISTINTO de `obra:eliminar`, que sigue siendo delegable porque solo
 * alcanza a obras en planificacion, donde no hay nada comprometido todavia.
 *
 * `empresa:migrar` hace dos cosas y las dos son del dueno del negocio y de
 * nadie mas. La primera es CONGELAR la constructora entera: mientras dura,
 * ninguna de sus obras admite un cambio, asi que activarlo a destiempo para
 * la jornada de todos. La segunda es sacarla en un
 * archivo que se abre en OTRA instalacion —usuarios con su hash de
 * contrasena, contratistas, obras, dinero y fotos—, y ese archivo se
 * verifica con una frase, no con el secreto de esta instalacion: quien lo
 * tenga, la tiene entera. Es `obra:eliminar_cerrada` un piso mas arriba.
 */
export const INNEGOCIABLES: readonly Permiso[] = [
  "empresa:migrar",
  "linea_base:aprobar",
  "movimiento:aprobar",
  "meta:aprobar",
  "obra:eliminar_cerrada",
  /// Del ADMIN por el mismo motivo que el borrado: quien pueda recargar un
  /// respaldo puede meter en la empresa una obra entera venida de un archivo.
  "obra:restaurar",
  "permiso:leer",
  "permiso:editar",
  "configuracion:editar",
];

/** Los que si admiten excepcion por empresa. Es lo que dibuja la pantalla. */
export const EDITABLES: readonly Permiso[] = PERMISOS.filter(
  (p) => !INNEGOCIABLES.includes(p),
);

export function esInnegociable(permiso: string): boolean {
  return INNEGOCIABLES.includes(permiso as Permiso);
}

/**
 * Solo lectura: base comun de todos los roles no administrativos.
 *
 * `meta:leer` NO esta aqui, y es a proposito. De esta lista bebe CONSULTOR,
 * que es el perfil del cliente y de la supervision: `linea_base:leer` les
 * ensena el presupuesto de VENTA, que es suyo y lo han firmado, pero la meta
 * es el COSTO al que la empresa cree que puede hacerlo, y su diferencia es el
 * margen. Eso no se ensena a la otra parte de la mesa.
 *
 * `nota:leer` tampoco, por el mismo principio que ya aplica `galeria:leer`:
 * la bitacora de la obra ensena TODO lo que alguien anoto, y sus categorias
 * fijas incluyen financiero y legal. Eso es exactamente lo que este comentario
 * ya excluye del perfil cliente dos parrafos mas arriba.
 */
const SOLO_LECTURA: Permiso[] = [
  "empresa:leer",
  "obra:leer",
  "partida:leer",
  "cronograma:leer",
  "plan_semanal:leer",
  "lookahead:leer",
  "linea_base:leer",
  "movimiento:leer",
];

/**
 * Todo lo que termina en ":leer", salvo lo innegociable (`permiso:leer`,
 * que es exclusivo de ADMIN). Es la base de GERENTE: un gerente ve el
 * negocio entero —incluidos `meta:leer`, `nota:leer` y `galeria:leer`, que
 * CONSULTOR no tiene porque esa lista es del cliente, no de la empresa—
 * pero no administra ni aprueba nada.
 *
 * Se DERIVA de `PERMISOS` a proposito, en vez de enumerarse a mano: un
 * permiso de lectura nuevo entra aqui solo con anadirse a `PERMISOS`, sin
 * que nadie tenga que acordarse de tocar esta lista tambien.
 */
const TODO_LO_QUE_SE_LEE: readonly Permiso[] = PERMISOS.filter(
  (p) => p.endsWith(":leer") && !INNEGOCIABLES.includes(p),
);

const MATRIZ: Record<Role, readonly Permiso[]> = {
  /// Control total sobre su empresa. Unico rol que aprueba la linea base:
  /// congelar el presupuesto es un acto contractual, no operativo.
  ADMIN: PERMISOS,

  /// Responsable tecnico de obra: construye y mantiene el presupuesto,
  /// pero no lo aprueba ni administra usuarios.
  RESIDENTE: [
    ...SOLO_LECTURA,
    "usuario:leer",
    "obra:editar",
    "partida:crear",
    "partida:editar",
    "partida:eliminar",
    "partida:importar",
    /// Lleva el cronograma: lo importa de Project y reporta el avance desde
    /// obra. Es quien lo sabe —esta ahi— y encaja con que ya importe el
    /// presupuesto. ADMIN_OBRA y CONSULTOR solo lo leen.
    "cronograma:importar",
    /// Y lo teclea y lo corrige, por lo mismo: no todas las obras tienen MS
    /// Project, y quien conoce el plan es quien esta en la obra. Va con el
    /// mismo perfil que ya podia sustituir el cronograma entero subiendo otro
    /// archivo, asi que no ensancha lo que este rol puede romper.
    "cronograma:editar",
    "cronograma:eliminar",
    "avance:registrar",
    /// El last planner de la obra: arma el plan semanal, compromete tareas y
    /// cierra la semana midiendo PPC/CNC. Es trabajo de campo, va con el residente.
    "plan_semanal:gestionar",
    /// El Lookahead (mediano plazo): analiza restricciones y prepara lo que se
    /// podra comprometer en el PTS. Es trabajo de campo, va con el residente.
    "lookahead:gestionar",
    /// La galeria: sube y describe las fotos de avance —esta en obra, las toma
    /// el—. PUBLICAR al cliente no: eso es de gerencia. Y `galeria:leer` no
    /// esta en SOLO_LECTURA a proposito: la galeria interna ensena TODO, y de
    /// esa lista bebe CONSULTOR, que es el perfil del cliente; el cliente solo
    /// entra por su enlace, que ensena lo curado.
    "galeria:leer",
    "galeria:gestionar",
    /// Fija la linea base del cronograma (la version congelada contra la que se
    /// mide el EVM). Re-fijable con confirmacion; se audita. No es contractual
    /// como la del presupuesto, asi que no va en INNEGOCIABLES.
    "cronograma:linea_base",
    "linea_base:crear",
    /// El presupuesto meta y su bolsa. El residente los VE y los ARMA, pero no
    /// los congela: aprobar la meta es lo que la vuelve inmutable, y quien
    /// ejecuta contra ella no deberia poder rebajarla cuando se le va el gasto.
    /// Por eso `meta:aprobar` va en INNEGOCIABLES: no basta con no darselo por
    /// defecto, tiene que no poder concederse.
    ///
    /// Que lo vea es una decision deliberada, no un descuido: la meta solo
    /// cambia conductas si la conoce quien produce. Esconderla deja al unico
    /// que puede mover la aguja trabajando a ciegas sobre ella.
    "meta:leer",
    "meta:crear",
    "movimiento:crear",
    /// Ve a quien se le compra y cuanto se ha comprometido contra SU
    /// presupuesto, pero no pide ni aprueba: eso es administracion.
    "proveedor:leer",
    /// Y le escribe. Es quien esta en obra: el que sabe que manana no hay
    /// agua o que falta el plano es el residente, y hacerlo pasar por
    /// administracion para avisar convierte el aviso en algo que llega tarde.
    "proveedor:contactar",
    "orden:leer",
    /// Los encargos son el frente de cada proveedor en la obra. El residente
    /// los ve y VALORIZA el avance —esta en obra, es quien lo sabe, como con
    /// el avance de las tareas—, pero no reparte alcances ni pacta montos: eso
    /// es administracion, y va en ADMIN_OBRA.
    "encargo:leer",
    "encargo:valorizar",
    /// La bitacora de la obra: anota y marca atendido/reabre. Es trabajo de
    /// campo reversible, igual que valorizar un encargo. Reescribir o borrar
    /// lo ya anotado (`nota:gestionar`) se queda en ADMIN_OBRA.
    "nota:leer",
    "nota:crear",
  ],

  /// Administrador de obra: perfil economico-administrativo. Consulta el
  /// presupuesto pero no lo modifica. En fases posteriores recibira ademas
  /// los permisos de abonos y caja chica.
  ///
  /// Si redacta movimientos presupuestales aunque no edite partidas: mover
  /// dinero entre partidas o pedir un adicional es una negociacion con el
  /// cliente, no una decision tecnica. Aprobarlos sigue siendo de ADMIN.
  ///
  /// Y lleva los proveedores y las ordenes, que es su trabajo: mantener el
  /// catalogo y redactar los pedidos. Aprobar una orden compromete
  /// presupuesto contra un tercero, asi que por defecto se queda en ADMIN
  /// —aunque, al contrario que aprobar una linea base, esto SI se puede
  /// delegar desde la matriz de permisos si la empresa lo organiza asi.
  ADMIN_OBRA: [
    ...SOLO_LECTURA,
    "usuario:leer",
    "movimiento:crear",
    "proveedor:leer",
    "proveedor:crear",
    "proveedor:editar",
    "proveedor:contactar",
    "orden:leer",
    "orden:crear",
    /// Ve la meta y la bolsa —es el perfil economico de la obra y el margen es
    /// su materia— pero no la arma: eso sale de oficina tecnica, con el
    /// residente. Si una empresa lo organiza al reves, `meta:crear` se concede
    /// desde la matriz de permisos sin tocar codigo.
    "meta:leer",
    /// Reparte la obra entre proveedores: crea encargos, les asigna el frente
    /// y su monto, y tambien valoriza. Es el trabajo economico-administrativo
    /// previo a emitir las ordenes.
    "encargo:leer",
    "encargo:gestionar",
    "encargo:valorizar",
    "plan_semanal:gestionar",
    "lookahead:gestionar",
    /// La galeria completa, y la decision de que ve el cliente: publicar una
    /// foto y encender o rotar el enlace son actos de gerencia de obra.
    "galeria:leer",
    "galeria:gestionar",
    "galeria:publicar",
    /// La bitacora completa: anota, y tambien corrige o borra lo que ya
    /// escribio cualquiera. Gerencia de obra, igual que con la galeria.
    "nota:leer",
    "nota:crear",
    "nota:gestionar",
  ],

  /// Almacen: necesita ver las partidas para imputar movimientos de
  /// materiales, nada mas.
  ALMACENERO: ["obra:leer", "partida:leer"],

  /// Consulta externa (cliente, supervision): estrictamente lectura.
  CONSULTOR: SOLO_LECTURA,

  /// Ve el negocio entero, no una obra ni un cliente: toda la cartera y
  /// todo lo que se lee, sin administrar ni aprobar nada. Es el rol que
  /// tambien se puede PREVISUALIZAR desde una cuenta ADMIN —ver
  /// `@/lib/vista-rol`— para quien es gerente y administrador general a la
  /// vez con una sola cuenta.
  GERENTE: TODO_LO_QUE_SE_LEE,
};

/**
 * Los roles, en el orden en que se presentan.
 *
 * Sale de las claves de MATRIZ y no de una lista aparte: anadir un rol ya
 * obliga a darle permisos ahi, y una segunda lista solo podria olvidarse.
 */
export const ROLES = Object.keys(MATRIZ) as Role[];

/**
 * Como se escribe cada rol en pantalla, en UN solo sitio.
 *
 * Vive aqui, junto a los roles, y no en cada pantalla: el alta de usuarios y
 * la matriz de permisos tenian su propia version y ya divergian —una decia
 * "Administrador de obra" y la otra "Admin. de obra" para el mismo rol—. Con
 * una sola fuente, el nombre de un rol es el mismo se mire donde se mire.
 */
export const ETIQUETA_ROL: Record<Role, string> = {
  ADMIN: "Administrador",
  RESIDENTE: "Residente",
  ADMIN_OBRA: "Administrador de obra",
  ALMACENERO: "Almacenero",
  CONSULTOR: "Consultor",
  GERENTE: "Gerente",
};

/** Lo que la plantilla del rol concede, antes de excepciones. */
export function permisosDe(role: Role): readonly Permiso[] {
  return MATRIZ[role];
}

/** Una excepcion tal como viene de `company_permissions`. */
export interface ExcepcionPermiso {
  permiso: string;
  concedido: boolean;
}

/**
 * Permisos efectivos de un rol en una empresa: la plantilla, con las
 * excepciones aplicadas encima.
 *
 * Se ignora en silencio toda excepcion que recaiga sobre un INNEGOCIABLE, y
 * tambien la que nombre un permiso que ya no existe en el codigo. Lo primero
 * es defensa en profundidad: el servicio ya rechaza guardarlas, pero una fila
 * insertada a mano en la base tampoco debe surtir efecto. Lo segundo evita
 * que renombrar un permiso deje filas huerfanas concediendo algo indefinido.
 */
export function resolverPermisos(
  role: Role,
  excepciones: readonly ExcepcionPermiso[] = [],
): Permiso[] {
  const efectivos = new Set<Permiso>(MATRIZ[role]);

  for (const excepcion of excepciones) {
    const permiso = excepcion.permiso as Permiso;
    if (!PERMISOS.includes(permiso)) continue;
    if (esInnegociable(permiso)) continue;

    if (excepcion.concedido) efectivos.add(permiso);
    else efectivos.delete(permiso);
  }

  // Se devuelve en el orden de PERMISOS y no en el de insercion del Set: la
  // lista se lee en pantallas y en la auditoria, y un orden estable evita
  // diferencias que no son diferencias.
  return PERMISOS.filter((p) => efectivos.has(p));
}

/**
 * Lo que se pregunta en cada frontera: sujeto y permiso.
 *
 * Recibe los permisos YA resueltos, no un rol, porque desde que son
 * configurables por empresa el rol no basta para responder. Se tipa de forma
 * estructural para que `lib/` no dependa de la capa de servicios, que es
 * `server-only`.
 */
export interface ConPermisos {
  permisos: readonly Permiso[];
}

export function puede(sujeto: ConPermisos, permiso: Permiso): boolean {
  return sujeto.permisos.includes(permiso);
}
