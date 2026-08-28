/**
 * Que lleva el respaldo de una obra, en que orden, y como se lee cada dato.
 *
 * Este archivo es el CATALOGO. No toca la base ni el disco: declara la forma
 * del respaldo para que el servicio que lo escribe, el que lo restaura y el
 * que borra la obra usen los tres la misma verdad. Si vivieran en cada
 * servicio, el dia que alguien anada una tabla la copia quedaria coja en uno
 * de los tres y nadie se enteraria hasta que hiciera falta el respaldo.
 *
 * La prueba de al lado lee `prisma/schema.prisma` y compara. Anadir una
 * columna sin pasar por aqui pone el build en rojo, que es la unica forma de
 * que el modo de fallo de esto —perder datos en silencio— sea visible.
 */

/**
 * Version del FORMATO del zip.
 *
 * Sube solo si cambia como esta montado el archivo (entradas, codificacion),
 * no cuando cambian las columnas de una tabla: eso lo vigila `huellaTablas`.
 * Un respaldo con version mayor que esta se rechaza en seco —no hay forma
 * segura de adivinar un formato futuro—; uno menor pasa por los conversores.
 */
export const FORMATO_RESPALDO = 1;

/** Que hacer con una referencia a algo de la empresa que ya no existe. */
export type SiFalta = "null" | "descartar";

/** Una referencia a otra tabla DEL RESPALDO: se remapea al id nuevo. */
export interface RefInterna {
  campo: string;
  /// Tabla a la que apunta. La propia tabla = autorreferencia.
  a: string;
}

/** Una referencia a algo de la EMPRESA, que vive fuera de la obra. */
export interface RefExterna {
  campo: string;
  a: "usuario" | "proveedor";
  siFalta: SiFalta;
}

export interface TablaRespaldo {
  /// Nombre de la tabla en la base. Es tambien el nombre de la entrada del zip.
  tabla: string;
  /// Delegado del cliente Prisma (`prisma[modelo]`).
  modelo: string;
  /// Referencias a otras tablas del respaldo, que hay que remapear.
  refs: readonly RefInterna[];
  /// Referencias a la empresa.
  externas?: readonly RefExterna[];
  /// Columnas Decimal y su ESCALA. Se escriben como cadena con esa escala:
  /// "0.00" y "0" no dicen lo mismo, y un `number` de JSON perderia el dato.
  decimales?: Readonly<Record<string, number>>;
  /// Columnas `@db.Date`: dia de calendario, no instante. Viajan como
  /// "YYYY-MM-DD". Escribirlas como ISO completo invita a reconstruirlas en
  /// otra zona horaria y correr el dia, y una de ellas —`fechaCorte`— es la
  /// clave de la cadencia semanal entera.
  fechas?: readonly string[];
}

/**
 * Lo que NO viaja en el respaldo, y por que.
 *
 * No es una lista de lo que sobra: cada una esta aqui por un motivo que
 * costaria caro descubrir despues.
 */
export const EXCLUIDAS: Readonly<Record<string, string>> = {
  codigos_pase:
    "Son credenciales VIVAS. `tokenHash` con caducidad larga por diseno " +
    "(quien esta en obra no teclea un codigo cada media hora). Restaurarlas " +
    "resucita el acceso de gente que quiza ya no pisa la obra.",
  sesiones_pase: "Igual que los codigos: sesiones abiertas, no historia.",
  mensajes_sms:
    "Guarda el TEXTO del SMS, y por esa cola viajan codigos de acceso. Un " +
    "zip que los lleve es peor que la cola: la cola se vacia en segundos, el " +
    "zip vive en un disco. Ademas es consumo de la EMPRESA, no de la obra.",
  avisos:
    "Notificaciones ya leidas o no de una obra que se cerro. No es historia " +
    "de la obra, es el buzon de cada uno.",
  envios_aviso:
    "Solo son claves de deduplicacion para no repetir un aviso. Restaurarlas " +
    "no aporta nada y reservaria claves de una obra que ya paso.",
  estado_bolsa_obra:
    "Es lo que el reloj RECUERDA de la bolsa: en que estado la vio y cuando " +
    "aviso. No es un dato de la obra, es memoria de un mecanismo, y ademas " +
    "se deriva entera del presupuesto y los contratos, que si viajan. " +
    "Restaurarla podria callar el primer aviso de la obra restaurada -si " +
    "llega diciendo que ya sono el rojo- que es justo el que hay que dar.",
  audit_logs:
    "SI viaja en el zip —es historia de la obra— pero NO se restaura. El " +
    "libro de auditoria de una empresa es de la empresa: si un archivo " +
    "pudiera inyectarle filas, dejaria de ser prueba de nada.",
  respaldos_obra:
    "Es el registro de los respaldos que se han hecho, no contenido de la " +
    "obra. Y tiene que SOBREVIVIR al borrado —es la prueba de que hubo " +
    "respaldo antes—, asi que meterla dentro de si misma no tendria sentido.",
  mensajes_contratista:
    "Es historial del CONTRATISTA, no de la obra, por el mismo motivo que " +
    "`mensajes_sms`: el contratista es de la empresa y sigue trabajando en " +
    "otras obras cuando esta se cierra. Su `projectId` se pone a null al " +
    "borrar la obra y la ficha conserva lo que se le escribio. Meterlo en el " +
    "zip lo duplicaria al restaurar, y ademas un respaldo de obra que viaja " +
    "por correo no deberia llevar dentro la correspondencia con terceros.",
};

/**
 * Las tablas del respaldo, EN ORDEN DE INSERCION.
 *
 * El orden es el que resuelve las claves foraneas de una sola pasada, y no
 * hace falta segunda vuelta: basta con poner `movimientos_presupuestales`
 * ANTES que `wbs_items` (por `origenMovimientoId`) y `lookahead_tareas` antes
 * que `compromisos_semanales` (por `lookaheadTaskId`). Parece un ciclo y no lo
 * es: los movimientos no dependen de las partidas, solo sus LINEAS.
 *
 * El borrado recorre esta misma lista al reves. Una sola constante con dos
 * consumidores, para que no puedan discrepar.
 */
export const TABLAS: readonly TablaRespaldo[] = [
  {
    tabla: "projects",
    modelo: "project",
    refs: [],
    fechas: [
      "fechaInicio",
      "fechaFinProgramada",
      "fechaEstimadaReanudacion",
      "fechaInterrupcionEstudio",
    ],
  },
  {
    tabla: "baselines",
    modelo: "baseline",
    refs: [{ campo: "projectId", a: "projects" }],
    decimales: {
      costoDirecto: 2,
      descuentos: 2,
      porcentajeGastosGenerales: 4,
      porcentajeUtilidad: 4,
      porcentajeIgv: 4,
      porcentajeDescuento: 4,
      porcentajeRetencion: 4,
      montoTotal: 2,
      tipoCambio: 4,
    },
    fechas: ["fechaRevision"],
  },
  {
    tabla: "baseline_items",
    modelo: "baselineItem",
    refs: [{ campo: "baselineId", a: "baselines" }],
    decimales: { metrado: 4, precioUnitario: 4, parcial: 2 },
  },
  {
    tabla: "movimientos_presupuestales",
    modelo: "movimientoPresupuestal",
    refs: [
      { campo: "projectId", a: "projects" },
      { campo: "baselineId", a: "baselines" },
    ],
    decimales: { totalEntradas: 2, totalSalidas: 2, importeNeto: 2 },
    fechas: ["fecha"],
  },
  {
    /// Por NIVEL ascendente: `parentId` es autorreferente y Restrict, igual
    /// que en el importador de presupuesto. Aqui no hay que releer nada
    /// despues de insertar, porque los ids se conocen de antemano.
    tabla: "wbs_items",
    modelo: "wbsItem",
    refs: [
      { campo: "projectId", a: "projects" },
      { campo: "parentId", a: "wbs_items" },
      { campo: "origenMovimientoId", a: "movimientos_presupuestales" },
    ],
    decimales: { metrado: 4, precioUnitario: 4, parcial: 2 },
    fechas: ["fechaInicioPlan", "fechaFinPlan"],
  },
  {
    tabla: "movimiento_lineas",
    modelo: "movimientoLinea",
    refs: [
      { campo: "movimientoId", a: "movimientos_presupuestales" },
      { campo: "wbsItemId", a: "wbs_items" },
      /// `nuevoParentId` NO tiene clave foranea, pero guarda un id de
      /// partida: el capitulo del que colgara la partida nueva. Sin
      /// remapearlo, un movimiento en borrador de la obra restaurada
      /// apuntaria a un capitulo de la obra ORIGINAL —misma empresa, sin
      /// error, sin ruido—. Es la referencia mas facil de olvidar.
      { campo: "nuevoParentId", a: "wbs_items" },
    ],
    decimales: { importe: 2, nuevoMetrado: 4, nuevoPrecio: 4 },
  },
  {
    /// Van despues de `wbs_items` porque el reparto de mas abajo apunta a las
    /// partidas con `Restrict`: al borrar, que es esta lista al reves, el
    /// reparto tiene que irse ANTES que ellas.
    tabla: "presupuestos_meta",
    modelo: "presupuestoMeta",
    refs: [{ campo: "projectId", a: "projects" }],
    decimales: {
      costoDirecto: 2,
      costoPropio: 2,
      costoTotal: 2,
      mesesPlazo: 2,
    },
    fechas: ["fechaMeta"],
  },
  {
    tabla: "presupuesto_meta_items",
    modelo: "presupuestoMetaItem",
    refs: [{ campo: "presupuestoMetaId", a: "presupuestos_meta" }],
    decimales: { metrado: 4, precioUnitario: 4, parcial: 2, porcentajeRecargo: 3 },
    fechas: ["fechaInicioPlan", "fechaFinPlan"],
  },
  {
    /// El ORDEN de estas dos referencias importa, y no es capricho: se llega a
    /// la obra por la PARTIDA, no por el item de la meta. El item cuelga de
    /// `presupuestos_meta`, que si tiene `projectId`, pero eso serian dos
    /// saltos y el filtro del respaldo solo hace uno. La partida lo tiene
    /// directo, asi que va primera.
    tabla: "meta_item_partidas",
    modelo: "metaItemPartida",
    refs: [
      { campo: "wbsItemId", a: "wbs_items" },
      { campo: "metaItemId", a: "presupuesto_meta_items" },
    ],
    decimales: { fraccion: 3 },
  },
  {
    /// Despues de los items: cuelga de uno de ellos. Al borrar -esta lista al
    /// reves- se va antes que el item del que deduce.
    tabla: "deducciones_costo_propio",
    modelo: "deduccionCostoPropio",
    refs: [
      { campo: "projectId", a: "projects" },
      { campo: "presupuestoMetaId", a: "presupuestos_meta" },
      { campo: "metaItemId", a: "presupuesto_meta_items" },
    ],
    decimales: { importe: 2 },
  },
  {
    tabla: "proveedor_partidas",
    modelo: "proveedorPartida",
    refs: [{ campo: "wbsItemId", a: "wbs_items" }],
    externas: [{ campo: "proveedorId", a: "proveedor", siFalta: "descartar" }],
  },
  {
    tabla: "cronogramas",
    modelo: "cronograma",
    refs: [{ campo: "projectId", a: "projects" }],
    fechas: ["fechaCorte"],
  },
  {
    tabla: "tareas_cronograma",
    modelo: "tareaCronograma",
    refs: [{ campo: "cronogramaId", a: "cronogramas" }],
    decimales: {
      duracionDias: 2,
      porcentajePlaneado: 2,
      porcentajeArchivo: 2,
      holguraDias: 2,
    },
    fechas: ["inicio", "fin"],
  },
  {
    tabla: "dependencias_tarea",
    modelo: "dependenciaTarea",
    refs: [{ campo: "cronogramaId", a: "cronogramas" }],
    decimales: { desfaseDias: 2 },
  },
  {
    tabla: "calendarios_laborales",
    modelo: "workCalendar",
    refs: [{ campo: "projectId", a: "projects" }],
    decimales: { horas: 2 },
  },
  {
    tabla: "mapeo_tarea_partida",
    modelo: "mapeoTareaPartida",
    refs: [{ campo: "projectId", a: "projects" }],
  },
  {
    // El responsable y el contacto NO se listan como referencias a proposito:
    // son `SET NULL` y pueden apuntar a alguien que ya no esta. Restaurar un
    // respaldo no debe fallar porque un responsable causara baja entre medias.
    tabla: "hitos_obra",
    modelo: "hitoObra",
    refs: [{ campo: "projectId", a: "projects" }],
  },
  {
    tabla: "contactos_aviso",
    modelo: "contactoAviso",
    refs: [{ campo: "projectId", a: "projects" }],
  },
  {
    // `creadoPor`/`atendidaPor` son texto suelto, sin FK: no hay nada que
    // remapear ahi, a diferencia de `hitos_obra`. Es historia permanente de
    // la obra —igual que `hitos_obra`, no un buzon como `avisos`—, por eso
    // viaja en el respaldo y no en `EXCLUIDAS`.
    tabla: "notas",
    modelo: "nota",
    refs: [{ campo: "projectId", a: "projects" }],
    fechas: ["fechaRecordatorio"],
  },
  {
    // Igual que `fotos_evidencia`: guarda la RUTA de un archivo que vive en
    // STORAGE_ROOT, fuera de la base. El respaldo copia el registro; el
    // archivo fisico es responsabilidad de quien restaura, no de este
    // catalogo.
    tabla: "adjuntos_nota",
    modelo: "adjuntoNota",
    refs: [
      { campo: "projectId", a: "projects" },
      { campo: "notaId", a: "notas" },
    ],
  },
  {
    tabla: "pases_obra",
    modelo: "paseObra",
    refs: [{ campo: "projectId", a: "projects" }],
  },
  {
    tabla: "lookahead_tareas",
    modelo: "lookaheadTask",
    refs: [{ campo: "projectId", a: "projects" }],
    externas: [{ campo: "proveedorId", a: "proveedor", siFalta: "null" }],
  },
  {
    tabla: "restricciones_tarea",
    modelo: "restriccion",
    refs: [
      { campo: "lookaheadTaskId", a: "lookahead_tareas" },
      { campo: "responsableContactoId", a: "contactos_aviso" },
    ],
    externas: [
      { campo: "responsableUserId", a: "usuario", siFalta: "null" },
    ],
    fechas: ["fechaCompromiso"],
  },
  {
    tabla: "planes_semanales",
    modelo: "planSemanal",
    refs: [{ campo: "projectId", a: "projects" }],
    fechas: ["fechaCorte", "fechaInicio"],
  },
  {
    tabla: "compromisos_semanales",
    modelo: "compromisoSemanal",
    refs: [
      { campo: "planSemanalId", a: "planes_semanales" },
      /// Suelta, sin clave foranea, pero es un id: hay que remapearla.
      { campo: "lookaheadTaskId", a: "lookahead_tareas" },
    ],
    externas: [{ campo: "proveedorId", a: "proveedor", siFalta: "null" }],
    decimales: { metaPorcentaje: 2, cantidadPlan: 4, cantidadEjec: 4 },
  },
  {
    tabla: "avances_tarea",
    modelo: "avanceTarea",
    refs: [
      { campo: "projectId", a: "projects" },
      { campo: "planSemanalId", a: "planes_semanales" },
    ],
    decimales: { porcentaje: 2 },
    fechas: ["fecha"],
  },
  /// Hermana de `avances_tarea`: las dos cuelgan de la obra por `uid` y las
  /// dos cuentan como fue la ejecucion. Va en el respaldo porque las fechas
  /// reales de arranque y termino no se pueden reconstruir desde ningun otro
  /// sitio -se dedujeron de una serie de partes que puede haberse corregido
  /// despues-, y perderlas al restaurar dejaria la obra sin su historia.
  {
    tabla: "ejecucion_tareas",
    modelo: "ejecucionTarea",
    refs: [{ campo: "projectId", a: "projects" }],
    fechas: ["inicioReal", "finReal"],
  },
  {
    tabla: "fotos_evidencia",
    modelo: "fotoEvidencia",
    refs: [
      { campo: "projectId", a: "projects" },
      { campo: "restriccionId", a: "restricciones_tarea" },
      { campo: "compromisoId", a: "compromisos_semanales" },
      { campo: "paseId", a: "pases_obra" },
    ],
    // `uid` no es una FK (ancla por valor a la tarea del cronograma), asi que
    // no va en `refs`. `fecha` es dia de calendario y SI tiene que declararse:
    // sin esto el respaldo la exportaria como instante y correria el dia.
    fechas: ["fecha"],
  },
  // La galeria (el escaparate) va aparte de la evidencia a proposito, igual
  // que en el resto del sistema. `fotos_galeria` ANTES que `galerias_obra`:
  // la portada de la configuracion apunta a una foto, y el catalogo exige
  // que toda referencia mire hacia atras.
  {
    tabla: "fotos_galeria",
    modelo: "fotoGaleria",
    refs: [{ campo: "projectId", a: "projects" }],
  },
  {
    tabla: "galerias_obra",
    modelo: "galeriaObra",
    refs: [
      { campo: "projectId", a: "projects" },
      { campo: "portadaId", a: "fotos_galeria" },
    ],
  },
  {
    tabla: "encargos_proveedor",
    modelo: "encargoProveedor",
    refs: [{ campo: "projectId", a: "projects" }],
    externas: [{ campo: "proveedorId", a: "proveedor", siFalta: "descartar" }],
    decimales: { montoContratado: 2 },
    fechas: ["fechaInicio", "fechaFin"],
  },
  {
    tabla: "encargo_partidas",
    modelo: "encargoPartida",
    refs: [
      { campo: "encargoId", a: "encargos_proveedor" },
      { campo: "wbsItemId", a: "wbs_items" },
    ],
    decimales: { fraccion: 3 },
  },
  {
    /**
     * `projectId` viaja aunque la obra ya se alcance por el encargo: es una
     * columna DESNORMALIZADA (existe para poder declarar la unicidad del
     * correlativo de obra) y, como todo id, hay que remapearla. Sin esta
     * linea la fila restaurada conservaria el id de la obra ORIGINAL, que en
     * el caso normal —restaurar una obra borrada— ya no existe.
     */
    tabla: "valorizaciones_encargo",
    modelo: "valorizacionEncargo",
    refs: [
      { campo: "encargoId", a: "encargos_proveedor" },
      { campo: "projectId", a: "projects" },
    ],
    // `importe` es el valorizado CONGELADO del corte. Viaja en el respaldo
    // como cualquier otro importe: sin el, restaurar una obra revaluaria todo
    // su historico contra el monto de hoy.
    decimales: { porcentaje: 3, importe: 2 },
    fechas: ["fecha"],
  },
  {
    tabla: "adendas_encargo",
    modelo: "adendaEncargo",
    refs: [
      { campo: "encargoId", a: "encargos_proveedor" },
      { campo: "projectId", a: "projects" },
    ],
    decimales: { importe: 2 },
    fechas: ["fecha"],
  },
  {
    /// Las fechas pactadas de valorizacion de ese encargo (los hitos de pago).
    /// Sin ellas, la copia restaurada no sabria cuando le tocaba valorizar a
    /// ese contratista y la cadencia caeria a la periodica de la obra, que es
    /// justo lo que estas fechas existen para sustituir.
    tabla: "fechas_valorizacion",
    modelo: "fechaValorizacion",
    refs: [{ campo: "encargoId", a: "encargos_proveedor" }],
    fechas: ["fecha"],
  },
  {
    /**
     * LOS PAGOS. Faltaban, y era el agujero mas caro del respaldo.
     *
     * El respaldo es lo que hace reversible el borrado de una obra —el
     * servicio no deja borrar sin uno reciente— asi que sin esta tabla borrar
     * una obra cerrada se llevaba por delante el historial de lo que se le
     * pago a cada contratista, sin que nada avisara. Es exactamente el modo de
     * fallo que este catalogo existe para impedir.
     *
     * `valorizacionId` es opcional (hay adelantos que no valorizan nada), asi
     * que si el corte no viajara la fila seguiria siendo valida con el campo
     * a null; pero viaja, porque `valorizaciones_encargo` va antes.
     */
    tabla: "pagos_encargo",
    modelo: "pagoEncargo",
    refs: [
      { campo: "encargoId", a: "encargos_proveedor" },
      { campo: "valorizacionId", a: "valorizaciones_encargo" },
    ],
    decimales: { monto: 2 },
    fechas: ["fecha"],
  },
  {
    /**
     * La constancia de cada pago.
     *
     * OJO: como `fotos_evidencia`, guarda la RUTA de un archivo que vive en
     * `STORAGE_ROOT`, no el archivo. Restaurar la fila devuelve la ficha del
     * comprobante —importe, fecha, quien lo subio, su huella— pero el PDF solo
     * vuelve si el respaldo lo trajo. Es la misma limitacion que ya tienen las
     * fotos y se dice igual de claro.
     */
    tabla: "comprobantes_pago",
    modelo: "comprobantePago",
    refs: [{ campo: "pagoId", a: "pagos_encargo" }],
  },
  {
    tabla: "ordenes_compra",
    modelo: "ordenCompra",
    refs: [{ campo: "projectId", a: "projects" }],
    externas: [{ campo: "proveedorId", a: "proveedor", siFalta: "descartar" }],
    decimales: {
      subtotal: 2,
      descuentoComercial: 2,
      neto: 2,
      impuesto: 2,
      total: 2,
    },
    fechas: ["fecha"],
  },
  {
    tabla: "orden_lineas",
    modelo: "ordenLinea",
    refs: [{ campo: "ordenId", a: "ordenes_compra" }],
    decimales: { cantidad: 4, precioUnitario: 4, importe: 2 },
  },
  {
    tabla: "orden_imputaciones",
    modelo: "ordenImputacion",
    refs: [
      { campo: "ordenId", a: "ordenes_compra" },
      { campo: "wbsItemId", a: "wbs_items" },
    ],
    decimales: { importe: 2 },
  },
  {
    tabla: "analisis_causa",
    modelo: "analisisCausa",
    refs: [{ campo: "projectId", a: "projects" }],
    externas: [{ campo: "responsableUserId", a: "usuario", siFalta: "null" }],
    fechas: ["fechaCompromiso", "aperturaDeclarada"],
  },
  {
    /// El usuario es obligatorio aqui, asi que si ya no existe la fila se
    /// descarta entera. No se pierde nada real: la copia es de solo lectura y
    /// una membresia no concede permiso ninguno sobre ella.
    tabla: "project_memberships",
    modelo: "projectMembership",
    refs: [{ campo: "projectId", a: "projects" }],
    externas: [{ campo: "userId", a: "usuario", siFalta: "descartar" }],
  },
  {
    /// Descartar y no anular: la fila tiene el invariante de que EXACTAMENTE
    /// una de userId/rol/contactoId esta puesta. Una con las tres en nulo
    /// seria una fila imposible que ninguna pantalla sabe pintar.
    tabla: "suscripciones_aviso",
    modelo: "suscripcionAviso",
    refs: [
      { campo: "projectId", a: "projects" },
      { campo: "contactoId", a: "contactos_aviso" },
    ],
    externas: [{ campo: "userId", a: "usuario", siFalta: "descartar" }],
  },
  {
    tabla: "ajustes_avisos_obra",
    modelo: "ajustesAvisosObra",
    refs: [{ campo: "projectId", a: "projects" }],
  },
];

/**
 * El orden de BORRADO: el inverso exacto del de insercion.
 *
 * Se borra hoja a raiz y a mano, sin apoyarse en las cascadas. No es
 * desconfianza del motor: es que confiar en el orden en que MariaDB resuelve
 * cascadas a traves de treinta tablas es como se consigue un P2003 en
 * produccion un domingo. Ademas hay cinco `Restrict` que ninguna cascada
 * resuelve sola.
 */
export const ORDEN_BORRADO: readonly TablaRespaldo[] = [...TABLAS].reverse();

/**
 * Como se llega a la obra desde una tabla que NO tiene `projectId`.
 *
 * El valor es el nombre de la RELACION en Prisma, que no siempre coincide con
 * el de la columna: `orden_lineas.ordenId` se navega como `ordenCompra`, y
 * `restricciones_tarea.lookaheadTaskId` como `tarea`.
 *
 * Sirve para acotar el borrado sin arrastrar listas de identificadores: se
 * borra con `{ ordenCompra: { projectId } }`, que es una sola sentencia, en vez
 * de con un `IN (...)` de decenas de miles de ids que ademas chocaria contra
 * `max_allowed_packet`.
 *
 * Casi todas cuelgan de una que SI tiene `projectId` y les basta UN nivel, asi
 * que el valor normal es una cadena. Cuando hacen falta dos —`comprobantes_pago`
 * cuelga del pago, y el pago del encargo— se escribe el CAMINO como lista, de
 * fuera hacia dentro. No se aplano a un solo nivel a proposito: seria anadir
 * una columna redundante a la tabla solo para simplificar este mapa, y una
 * columna redundante es una que algun dia dira algo distinto de la relacion.
 */
export const RELACION_A_LA_OBRA: Readonly<
  Record<string, string | readonly string[]>
> = {
  baseline_items: "baseline",
  movimiento_lineas: "movimiento",
  proveedor_partidas: "partida",
  orden_lineas: "ordenCompra",
  orden_imputaciones: "ordenCompra",
  tareas_cronograma: "cronograma",
  dependencias_tarea: "cronograma",
  encargo_partidas: "encargo",
  valorizaciones_encargo: "encargo",
  adendas_encargo: "encargo",
  fechas_valorizacion: "encargo",
  pagos_encargo: "encargo",
  /// Dos niveles: el comprobante cuelga del pago y el pago del encargo, que es
  /// el que tiene `projectId`.
  comprobantes_pago: ["pago", "encargo"],
  presupuesto_meta_items: "meta",
  /// Por la PARTIDA y no por el item: ver el comentario de la tabla. Es la
  /// unica de las tres que no llega por su padre natural.
  meta_item_partidas: "partida",
  compromisos_semanales: "plan",
  restricciones_tarea: "tarea",
};

/**
 * Los saltos que hay que dar desde una tabla hasta la que tiene `projectId`.
 *
 * Lista vacia = la tabla ya lo tiene. Se expone porque la MIGRACION de una
 * empresa navega exactamente el mismo camino y solo cambia la hoja del final
 * —«esta obra» pasa a ser «cualquier obra de esta empresa»—: si se copiara el
 * recorrido en el otro modulo, anadir un salto aqui dejaria la migracion
 * leyendo de menos sin dar error.
 */
export function caminoALaObra(tabla: string): readonly string[] {
  const relacion = RELACION_A_LA_OBRA[tabla];
  if (!relacion) return [];
  return typeof relacion === "string" ? [relacion] : relacion;
}

/**
 * Envuelve el filtro de la hoja en los saltos de esa tabla.
 *
 * De dentro hacia fuera: partiendo de la hoja, se va envolviendo en cada paso
 * del camino, para que ["pago","encargo"] de `{ pago: { encargo: <hoja> } }`.
 */
export function porElCaminoDeLaObra(
  tabla: string,
  hoja: Record<string, unknown>,
): Record<string, unknown> {
  return caminoALaObra(tabla).reduceRight<Record<string, unknown>>(
    (dentro, paso) => ({ [paso]: dentro }),
    hoja,
  );
}

/**
 * El filtro que acota una tabla a UNA obra.
 *
 * Se usa igual para leer el respaldo y para borrar, que es justo lo que evita
 * que el borrado alcance filas distintas de las que el respaldo guardo.
 */
export function filtroPorObra(
  tabla: string,
  obraId: string,
): Record<string, unknown> {
  if (tabla === "projects") return { id: obraId };
  return porElCaminoDeLaObra(tabla, { projectId: obraId });
}

/** Busca una tabla del catalogo por su nombre. */
export function tablaDelRespaldo(nombre: string): TablaRespaldo | undefined {
  return TABLAS.find((t) => t.tabla === nombre);
}
