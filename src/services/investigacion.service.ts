import "server-only";
import { prisma } from "@/lib/prisma";
import { alcanzaObra } from "@/lib/alcance-obras";
import { diasEntre } from "@/lib/ejecucion-real";
import { hhi, lro, tcac, trc } from "@/lib/aprendizaje";
import {
  CODIGO_CAUSA,
  faseDeLaSemana,
  indicePorSemana,
  num,
  resumir,
  type FaseEstudio,
} from "@/lib/series-estudio";
import type { SesionActiva } from "@/services/sesion.service";

/**
 * Los datos crudos de una obra, listos para un analisis estadistico.
 *
 * PARA QUE EXISTE. La aplicacion se disena para gestionar una obra, no para
 * investigarla, y esas dos cosas piden formatos distintos: la pantalla resume
 * y agrupa, el analisis necesita la observacion individual sin tocar. Este
 * modulo emite lo segundo -una fila por unidad observada- para que se pueda
 * modelar fuera, en Minitab o SPSS, sin que nadie tenga que copiar numeros de
 * una pantalla a una hoja de calculo.
 *
 * TRES ARCHIVOS Y NO UNO, porque son tres unidades de analisis distintas: el
 * compromiso semanal, la restriccion y la semana. Juntarlas en una sola tabla
 * obligaria a repetir los datos de la semana en cada fila -y entonces
 * cualquier media por semana saldria ponderada por el numero de compromisos,
 * que es un error silencioso y clasico-.
 *
 * SOLO PARA QUIEN OPERA GCM, y no es una restriccion de cortesia. Aqui sale
 * la obra entera en crudo: cada compromiso, quien lo incumplio y por que,
 * semana a semana. Es material de investigacion y tambien la radiografia mas
 * completa que existe de como trabaja una constructora, asi que no se abre a
 * un rol de empresa —ni siquiera al administrador de la constructora—: la
 * condicion de operador sale de una lista del servidor, no de una casilla que
 * se pueda marcar desde dentro de la aplicacion.
 *
 * QUE SE EMITE Y QUE NO. Va el dato observado, su fecha, su fase y su
 * clasificacion; no van nombres de personas. La identidad de quien reporto no
 * hace falta para el analisis y su salida en un archivo que va a circular por
 * correo si tiene consecuencias. Los proveedores viajan con un codigo
 * anonimo estable, que permite comparar sin nombrar.
 */

export type ResultadoEstudio =
  | { ok: true; obra: string; interrupcion: Date | null; tablas: Tablas }
  | { ok: false; error: string };

export interface Tabla {
  nombre: string;
  cabecera: readonly string[];
  filas: readonly (readonly (string | number)[])[];
}

export interface Tablas {
  compromisos: Tabla;
  restricciones: Tabla;
  consolidado: Tabla;
  /// Una fila por analisis de causa raiz, con TRC, LRO y el cierre de su
  /// accion correctiva. Es la variable dependiente de aprendizaje.
  aprendizaje: Tabla;
  diccionario: Tabla;
}

/**
 * Codigo anonimo y ESTABLE para un proveedor dentro de un estudio.
 *
 * Estable: el mismo proveedor recibe el mismo codigo en los tres archivos y en
 * todas las descargas, porque sale de su posicion en la lista ordenada por id.
 * Anonimo: no viaja el nombre. Se puede comparar el comportamiento entre
 * proveedores -que es lo que interesa- sin publicar quien es cada uno en un
 * anexo de tesis.
 */
function codigosAnonimos(ids: readonly (string | null)[]): Map<string, string> {
  const unicos = [...new Set(ids.filter((i): i is string => i !== null))].sort();
  return new Map(unicos.map((id, i) => [id, `P${String(i + 1).padStart(3, "0")}`]));
}

/// El mismo texto en los cuatro sitios: quien no es operador no distingue si
/// es que no puede o es que la obra no existe, que es lo correcto.
const SOLO_OPERADOR = "Esto es solo para quien opera GCM.";

const SI_NO = (v: boolean | null): string => (v === null ? "" : v ? "1" : "0");

const iso = (f: Date | null): string =>
  f === null ? "" : f.toISOString().slice(0, 10);

export async function datosDelEstudio(
  sesion: SesionActiva,
  obraId: string,
  /**
   * Limite superior de especificacion, en dias, para el retraso de liberacion
   * de restricciones.
   *
   * Viaja como parametro y se emite como COLUMNA en cada fila, no se aplica
   * aqui: el analisis de capacidad se hace fuera, y el archivo tiene que
   * llevar escrito contra que limite se juzgo cada observacion. Un limite que
   * solo existe en la cabeza de quien exporto no se puede replicar.
   */
  lesDias: number,
): Promise<ResultadoEstudio> {
  if (!sesion.esOperador) return { ok: false, error: SOLO_OPERADOR };

  if (!alcanzaObra(sesion, obraId)) {
    return { ok: false, error: "Esa obra no es tuya." };
  }

  const obra = await prisma.project.findFirst({
    where: { id: obraId, companyId: sesion.companyId },
    select: { id: true, nombreObra: true, fechaInterrupcionEstudio: true },
  });
  if (!obra) return { ok: false, error: "Obra no encontrada." };

  const interrupcion = obra.fechaInterrupcionEstudio;

  const planes = await prisma.planSemanal.findMany({
    where: { projectId: obraId },
    orderBy: { fechaCorte: "asc" },
    select: {
      id: true,
      numero: true,
      fechaCorte: true,
      estado: true,
      origenDatos: true,
      cerradoAt: true,
      compromisos: {
        select: {
          id: true,
          descripcion: true,
          cumplido: true,
          cumplidoAt: true,
          causa: true,
          zona: true,
          proveedorId: true,
          cantidadPlan: true,
          cantidadEjec: true,
          unidad: true,
          uid: true,
        },
      },
    },
  });

  const restricciones = await prisma.restriccion.findMany({
    where: { tarea: { projectId: obraId } },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      tipo: true,
      resuelta: true,
      resueltaAt: true,
      fechaCompromiso: true,
      createdAt: true,
      responsableUserId: true,
      tarea: { select: { uid: true, zona: true, proveedorId: true } },
    },
  });

  const analisis = await prisma.analisisCausa.findMany({
    where: { projectId: obraId },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      causa: true,
      createdAt: true,
      fechaCompromiso: true,
      cerradoAt: true,
    },
  });

  const indice = indicePorSemana(planes);
  const anonimo = codigosAnonimos([
    ...planes.flatMap((p) => p.compromisos.map((c) => c.proveedorId)),
    ...restricciones.map((r) => r.tarea.proveedorId),
  ]);

  const fase = (f: Date | null): FaseEstudio =>
    f === null ? "SIN_CLASIFICAR" : faseDeLaSemana(f, interrupcion);

  // -------------------------------------------------------------------------
  // Compromisos: una fila por compromiso semanal.
  // -------------------------------------------------------------------------
  const filasCompromisos = planes.flatMap((p) =>
    p.compromisos.map((c) => [
      obra.id,
      indice.get(p.fechaCorte.getTime()) ?? "",
      p.numero,
      iso(p.fechaCorte),
      fase(p.fechaCorte),
      p.origenDatos,
      c.id,
      c.uid ?? "",
      // El texto va entrecomillado por `generarCsv`; se recorta porque una
      // descripcion de 300 caracteres estorba en una tabla de analisis.
      c.descripcion.replace(/\s+/g, " ").slice(0, 120),
      c.zona ?? "",
      c.proveedorId ? (anonimo.get(c.proveedorId) ?? "") : "",
      SI_NO(c.cumplido),
      c.causa ? (CODIGO_CAUSA[c.causa] ?? "") : "",
      c.causa ?? "",
      num(c.cantidadPlan === null ? null : Number(c.cantidadPlan), 4),
      num(c.cantidadEjec === null ? null : Number(c.cantidadEjec), 4),
      c.unidad ?? "",
      // Cuanto tardo el equipo en cerrar el compromiso desde el corte.
      c.cumplidoAt === null ? "" : diasEntre(p.fechaCorte, c.cumplidoAt),
    ]),
  );

  // -------------------------------------------------------------------------
  // Restricciones: una fila por restriccion, con el retraso ya en dias.
  // -------------------------------------------------------------------------
  const filasRestricciones = restricciones.map((r) => {
    /*
     * El retraso solo existe si hay las DOS fechas: la comprometida y la de
     * resolucion. Una restriccion sin fecha comprometida no se puede juzgar
     * -no se prometio nada- y una sin resolver todavia no ha terminado su
     * ciclo. Se emiten igual, con el retraso vacio, para que se vea cuantas
     * quedaron fuera de la medida: una tasa calculada sobre las que si tienen
     * fecha, sin decir cuantas no la tienen, es una muestra sin declarar.
     */
    const retraso =
      r.fechaCompromiso !== null && r.resueltaAt !== null
        ? diasEntre(r.fechaCompromiso, r.resueltaAt)
        : null;

    const referencia = r.fechaCompromiso ?? r.createdAt;

    return [
      obra.id,
      r.id,
      iso(r.fechaCompromiso),
      iso(r.resueltaAt),
      fase(referencia),
      r.tipo,
      r.resuelta ? "RESUELTA" : "PENDIENTE",
      r.tarea.zona ?? "",
      r.tarea.proveedorId ? (anonimo.get(r.tarea.proveedorId) ?? "") : "",
      retraso === null ? "" : retraso,
      lesDias,
      // Fuera de especificacion segun el LES declarado arriba. Se emite
      // calculado para que el archivo se pueda leer sin rehacer la cuenta.
      retraso === null ? "" : retraso > lesDias ? "1" : "0",
    ];
  });

  // -------------------------------------------------------------------------
  // Consolidado: una fila por semana. Es la serie temporal.
  // -------------------------------------------------------------------------
  const filasConsolidado = planes.map((p) => {
    const evaluados = p.compromisos.filter((c) => c.cumplido !== null);
    const cumplidos = evaluados.filter((c) => c.cumplido === true).length;
    const ppc = evaluados.length === 0 ? null : (cumplidos / evaluados.length) * 100;

    /*
     * Las restricciones de la semana son las COMPROMETIDAS para esa semana,
     * no las creadas: lo que se mide es si se cumplio lo prometido para ese
     * corte. Se toma la ventana de siete dias que termina en la fecha de
     * corte, que es la semana del Last Planner.
     */
    const desde = new Date(p.fechaCorte);
    desde.setUTCDate(desde.getUTCDate() - 6);
    const deLaSemana = restricciones.filter(
      (r) =>
        r.fechaCompromiso !== null &&
        r.fechaCompromiso >= desde &&
        r.fechaCompromiso <= p.fechaCorte,
    );

    const conCiclo = deLaSemana.filter((r) => r.resueltaAt !== null);
    const aTiempo = conCiclo.filter(
      (r) => r.resueltaAt !== null && r.resueltaAt <= r.fechaCompromiso!,
    ).length;

    const retrasos = conCiclo.map((r) => diasEntre(r.fechaCompromiso!, r.resueltaAt!));
    const resumen = resumir(retrasos);

    /*
     * La concentracion de las causas de ESTA semana.
     *
     * Se cuenta sobre las NUEVE categorias y no sobre las que aparecieron: si
     * se contaran solo las presentes, una semana con un unico fallo daria
     * 1,0 -maxima concentracion- igual que una semana con veinte fallos todos
     * de la misma causa, y no significan lo mismo. Las ausentes entran como
     * cero y no alteran la suma, pero dejan el indicador comparable entre
     * semanas.
     */
    const porCausa = Object.keys(CODIGO_CAUSA).map(
      (causa) => p.compromisos.filter((c) => c.causa === causa).length,
    );
    const concentracion = hhi(porCausa);

    return [
      obra.id,
      indice.get(p.fechaCorte.getTime()) ?? "",
      p.numero,
      iso(p.fechaCorte),
      fase(p.fechaCorte),
      p.origenDatos,
      p.estado,
      evaluados.length,
      cumplidos,
      num(ppc, 2),
      deLaSemana.length,
      conCiclo.length,
      num(conCiclo.length === 0 ? null : (aTiempo / conCiclo.length) * 100, 2),
      resumen.n,
      num(resumen.media, 4),
      // La desviacion es LO QUE SE QUIERE VER BAJAR. Vacia con menos de dos
      // observaciones: ver `resumir`.
      num(resumen.desviacion, 4),
      num(resumen.mediana, 4),
      num(resumen.minimo, 4),
      num(resumen.maximo, 4),
      num(concentracion, 4),
      // Cuantas categorias distintas fallaron esa semana: el HHI se lee mucho
      // mejor con este al lado -0,5 con dos causas no es 0,5 con siete-.
      porCausa.filter((n) => n > 0).length,
    ];
  });

  // -------------------------------------------------------------------------
  // Aprendizaje: una fila por analisis de causa raiz.
  // -------------------------------------------------------------------------

  /**
   * En que indice de semana cae una fecha cualquiera.
   *
   * Las semanas del Last Planner cubren los siete dias que terminan en su
   * fecha de corte, asi que se busca la primera cuyo corte no sea anterior a
   * la fecha. Lo que cae despues de la ultima semana no tiene indice: se
   * devuelve null en vez de empujarlo a la ultima, que inventaria un dato.
   */
  const semanaDe = (f: Date): number | null => {
    const encaja = planes.find((p) => p.fechaCorte >= f);
    return encaja ? (indice.get(encaja.fechaCorte.getTime()) ?? null) : null;
  };

  const cierreTcac = tcac(
    analisis.map((a) => ({
      fechaCompromiso: a.fechaCompromiso,
      cerradoAt: a.cerradoAt,
    })),
  );

  const filasAprendizaje = analisis.map((a) => {
    // Los incumplimientos de ESA causa, con la semana en que ocurrieron.
    const eventos = planes
      .filter((p) => p.compromisos.some((c) => c.causa === a.causa))
      .map((p) => ({
        corte: p.fechaCorte,
        cuantos: p.compromisos.filter((c) => c.causa === a.causa).length,
      }));

    /*
     * Las dos ventanas: antes de ABRIR el analisis y despues de CERRARLO.
     *
     * Lo de en medio -mientras la accion se estaba implantando- no cuenta en
     * ninguna de las dos, y es deliberado: ni es el problema sin tocar ni es
     * el problema resuelto. Meterlo en cualquiera de los lados ensuciaria la
     * comparacion que la TRC quiere hacer.
     */
    const antes = eventos.filter((e) => e.corte < a.createdAt);
    const despues =
      a.cerradoAt === null ? [] : eventos.filter((e) => e.corte > a.cerradoAt!);

    const semanasAntes = planes.filter((p) => p.fechaCorte < a.createdAt).length;
    const semanasDespues =
      a.cerradoAt === null
        ? 0
        : planes.filter((p) => p.fechaCorte > a.cerradoAt!).length;

    const eventosAntes = antes.reduce((s, e) => s + e.cuantos, 0);
    const eventosDespues = despues.reduce((s, e) => s + e.cuantos, 0);

    const primero = eventos[0];
    const latencia = lro(
      primero ? (indice.get(primero.corte.getTime()) ?? null) : null,
      semanaDe(a.createdAt),
    );

    return [
      obra.id,
      a.id,
      CODIGO_CAUSA[a.causa] ?? "",
      a.causa,
      iso(a.createdAt),
      semanaDe(a.createdAt) ?? "",
      fase(a.createdAt),
      iso(a.fechaCompromiso),
      iso(a.cerradoAt),
      a.cerradoAt === null ? "0" : "1",
      a.cerradoAt !== null && a.fechaCompromiso !== null
        ? a.cerradoAt <= a.fechaCompromiso
          ? "1"
          : "0"
        : "",
      latencia === null ? "" : latencia,
      eventosAntes,
      semanasAntes,
      eventosDespues,
      semanasDespues,
      num(trc(eventosAntes, semanasAntes, eventosDespues, semanasDespues), 2),
    ];
  });

  return {
    ok: true,
    obra: obra.nombreObra,
    interrupcion,
    tablas: {
      compromisos: {
        nombre: "dataset_compromisos",
        cabecera: [
          "obra_id", "semana_indice", "semana_numero", "fecha_corte",
          "fase_estudio", "origen_datos", "compromiso_id", "tarea_uid",
          "descripcion", "zona", "proveedor_cod", "cumplimiento",
          "causa_cod", "causa_etiqueta", "cantidad_plan", "cantidad_ejec",
          "unidad", "dias_cierre",
        ],
        filas: filasCompromisos,
      },
      restricciones: {
        nombre: "dataset_restricciones",
        cabecera: [
          "obra_id", "restriccion_id", "fecha_compromiso", "fecha_resolucion",
          "fase_estudio", "tipo", "estado", "zona", "proveedor_cod",
          "retraso_dias", "les_dias", "fuera_especificacion",
        ],
        filas: filasRestricciones,
      },
      consolidado: {
        nombre: "dataset_consolidado",
        cabecera: [
          "obra_id", "semana_indice", "semana_numero", "fecha_corte",
          "fase_estudio", "origen_datos", "estado_plan",
          "compromisos_evaluados", "compromisos_cumplidos", "ppc_pct",
          "restricciones_semana", "restricciones_con_ciclo",
          "tasa_liberacion_oportuna_pct", "retraso_n", "retraso_media_dias",
          "retraso_desv_dias", "retraso_mediana_dias", "retraso_min_dias",
          "retraso_max_dias", "hhi_causas", "causas_distintas",
        ],
        filas: filasConsolidado,
      },
      aprendizaje: {
        nombre: "dataset_aprendizaje",
        cabecera: [
          "obra_id", "analisis_id", "causa_cod", "causa_etiqueta",
          "fecha_apertura", "semana_apertura", "fase_estudio",
          "fecha_compromiso", "fecha_cierre", "cerrada", "cerrada_a_tiempo",
          "lro_semanas", "eventos_antes", "semanas_antes", "eventos_despues",
          "semanas_despues", "trc_pct",
        ],
        filas: filasAprendizaje,
      },
      diccionario: diccionario(lesDias, interrupcion, cierreTcac),
    },
  };
}

/**
 * El diccionario de variables, generado y no escrito a mano.
 *
 * Es anexo obligatorio de cualquier tesis cuantitativa, y generarlo desde el
 * mismo sitio que emite los datos evita el fallo clasico: que el anexo
 * describa una version del archivo distinta de la que se analizo. Lleva el
 * tipo de medicion de cada variable porque es lo primero que se declara al
 * cargarla en SPSS.
 */
function diccionario(
  lesDias: number,
  interrupcion: Date | null,
  cierre: import("@/lib/aprendizaje").Tcac,
): Tabla {
  const v = (
    archivo: string,
    variable: string,
    tipo: string,
    unidad: string,
    definicion: string,
  ) => [archivo, variable, tipo, unidad, definicion];

  return {
    nombre: "diccionario_variables",
    cabecera: ["archivo", "variable", "tipo", "unidad", "definicion"],
    filas: [
      v("(todos)", "obra_id", "nominal", "-", "Identificador de la obra."),
      v("(todos)", "fase_estudio", "nominal", "PRE/POST",
        `Fase respecto al punto de interrupcion${interrupcion ? ` (${iso(interrupcion)})` : " (no definido)"}. La semana del punto de interrupcion cuenta como POST.`),
      v("(todos)", "semana_indice", "escala", "orden",
        "Posicion de la semana en la serie, ordenada por fecha de corte. Es el eje temporal del analisis; no coincide con semana_numero si se cargaron semanas historicas despues."),
      v("(todos)", "semana_numero", "escala", "orden",
        "Numero correlativo del plan en la aplicacion, por orden de creacion."),
      v("(todos)", "fecha_corte", "escala", "fecha ISO",
        "Fecha de cierre de la semana del Last Planner (YYYY-MM-DD)."),
      v("(todos)", "origen_datos", "nominal", "-",
        "GESTIONADO: la semana se vivio con la aplicacion. RECONSTRUIDO: se cargo despues desde actas o cuaderno de obra."),
      v("compromisos", "cumplimiento", "nominal", "0/1",
        "1 si el compromiso se cumplio, 0 si no. Vacio si el plan no se ha cerrado."),
      v("compromisos", "causa_cod", "nominal", "1-9",
        "Causa de no cumplimiento: 1 PRERREQUISITO, 2 MATERIALES, 3 MANO_OBRA, 4 EQUIPOS, 5 INFORMACION, 6 CLIENTE_TERCEROS, 7 CLIMA, 8 REPROGRAMACION, 9 OTRA."),
      v("compromisos", "dias_cierre", "escala", "dias",
        "Dias entre la fecha de corte y el momento en que se registro el cumplimiento."),
      v("compromisos", "cantidad_plan / cantidad_ejec", "escala", "segun unidad",
        "Cantidad comprometida y ejecutada de la actividad."),
      v("restricciones", "retraso_dias", "escala", "dias",
        "Dias entre la fecha comprometida de levantamiento y la fecha real de resolucion. Negativo = se libero antes. Vacio si falta alguna de las dos fechas."),
      v("restricciones", "les_dias", "escala", "dias",
        `Limite superior de especificacion declarado para el analisis de capacidad. Valor usado en esta exportacion: ${lesDias}.`),
      v("restricciones", "fuera_especificacion", "nominal", "0/1",
        "1 si retraso_dias supera les_dias."),
      v("consolidado", "ppc_pct", "escala", "%",
        "Porcentaje de Plan Completado: compromisos cumplidos sobre compromisos evaluados."),
      v("consolidado", "tasa_liberacion_oportuna_pct", "escala", "%",
        "Restricciones resueltas dentro de su fecha comprometida, sobre las que completaron su ciclo esa semana."),
      v("consolidado", "retraso_media_dias", "escala", "dias",
        "Media del retraso de liberacion de las restricciones de la semana."),
      v("consolidado", "retraso_desv_dias", "escala", "dias",
        "Desviacion estandar MUESTRAL (n-1) del retraso. Vacia con menos de dos observaciones."),
      v("consolidado", "retraso_n", "escala", "conteo",
        "Observaciones con ciclo completo sobre las que se calculan media y desviacion."),
      v("aprendizaje", "trc_pct", "escala", "%",
        "Tasa de recurrencia: frecuencia semanal de la causa despues del cierre del analisis sobre la de antes de su apertura, x100. Cerca de 0 = el patron dejo de repetirse. Vacia si falta alguna de las dos ventanas."),
      v("aprendizaje", "lro_semanas", "escala", "semanas",
        "Latencia de reaccion: semanas entre el primer evento del patron y la apertura formal del analisis de causa raiz."),
      v("aprendizaje", "cerrada / cerrada_a_tiempo", "nominal", "0/1",
        `Cierre de la accion correctiva. Agregando estas dos columnas se obtiene la TCAC: en esta exportacion, ${num(cierre.general, 1) || "sin datos"} % de cierre general y ${num(cierre.oportuno, 1) || "sin datos"} % dentro de la fecha comprometida, sobre ${cierre.comprometidas} acciones con fecha.`),
      v("aprendizaje", "eventos_antes / semanas_antes", "escala", "conteo",
        "Numerador y denominador de la frecuencia previa. Se publican para que la TRC se pueda recalcular y auditar."),
      v("consolidado", "hhi_causas", "escala", "indice",
        "Concentracion de las causas de la semana (Herfindahl-Hirschman): suma de los cuadrados de las proporciones. De 1/9 (repartido entre las nueve categorias) a 1,0 (todo por una sola). Un valor ALTO indica madurez: lo evitable ya se resolvio y queda lo externo."),
      v("(formato)", "codificacion", "-", "-",
        "UTF-8 sin BOM. Separador de columnas segun el parametro sep (coma por defecto). Punto como separador decimal. Fechas en ISO YYYY-MM-DD."),
      v("(formato)", "valores perdidos", "-", "-",
        "Celda VACIA, nunca cero ni -1. SPSS y JASP la leen como perdido por defecto; un cero se analizaria como un dato real."),
      v("(formato)", "dicotomicas", "-", "0/1",
        "Codificadas 0/1 y no TRUE/FALSE: asi entran como numericas y admiten media, que es lo que se usa para calcular proporciones."),
      v("(formato)", "importacion SPSS", "-", "-",
        "Archivo > Abrir > Datos, tipo CSV. Marcar que la primera fila contiene los nombres de las variables y fijar el punto como separador decimal."),
      v("(formato)", "importacion JASP", "-", "-",
        "Abrir el CSV directamente. JASP infiere el tipo de cada columna; revisar que las codificadas (causa_cod, cumplimiento) queden como nominales y no como escala."),
    ],
  };
}

/**
 * Fijar -o quitar- el punto de interrupcion del estudio en esta obra.
 *
 * Es la semana en que la obra empezo a gestionarse con GCM, y de ella sale la
 * clasificacion PRE/POST de todos los datos. Se guarda en la obra y no se pide
 * en cada descarga a proposito: asi la fase es un dato del sistema, igual para
 * todo el que exporte, y se puede auditar. Cambiarla reclasifica la serie
 * entera, que es exactamente lo que tiene que pasar cuando alguien se
 * equivoca de fecha; por eso pide el mismo permiso fuerte que exportar.
 */
export async function fijarPuntoDeInterrupcion(
  sesion: SesionActiva,
  obraId: string,
  fecha: string | null,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!sesion.esOperador) return { ok: false, error: SOLO_OPERADOR };
  if (!alcanzaObra(sesion, obraId)) {
    return { ok: false, error: "Esa obra no es tuya." };
  }

  let valor: Date | null = null;
  if (fecha !== null && fecha !== "") {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
      return { ok: false, error: "La fecha tiene que ser del tipo 2026-06-01." };
    }
    // Medianoche UTC, como el resto de fechas de calendario del sistema: si se
    // construye en hora local, el dia se corre al guardarlo.
    valor = new Date(`${fecha}T00:00:00.000Z`);
  }

  const obra = await prisma.project.findFirst({
    where: { id: obraId, companyId: sesion.companyId },
    select: { id: true },
  });
  if (!obra) return { ok: false, error: "Obra no encontrada." };

  await prisma.project.update({
    where: { id: obraId },
    data: { fechaInterrupcionEstudio: valor },
  });

  return { ok: true };
}

/**
 * Marcar una semana como GESTIONADA con la aplicacion o RECONSTRUIDA a mano.
 *
 * Una semana reconstruida se cargo despues, desde actas o cuaderno de obra:
 * sus datos pueden ser correctos y aun asi no son equivalentes, porque nadie
 * tenia el tablero delante cuando se decidio. Sin esta marca, una serie no
 * puede demostrar donde esta el punto de interrupcion, y un estudio que no
 * puede demostrarlo no prueba nada.
 */
export async function marcarOrigenDeSemana(
  sesion: SesionActiva,
  obraId: string,
  planId: string,
  origen: "GESTIONADO" | "RECONSTRUIDO",
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!sesion.esOperador) return { ok: false, error: SOLO_OPERADOR };
  if (!alcanzaObra(sesion, obraId)) {
    return { ok: false, error: "Esa obra no es tuya." };
  }

  // El plan se ata a la obra Y a la empresa antes de tocarlo: con el id de un
  // plan ajeno se estaria marcando la semana de otra constructora.
  const plan = await prisma.planSemanal.findFirst({
    where: { id: planId, projectId: obraId, project: { companyId: sesion.companyId } },
    select: { id: true },
  });
  if (!plan) return { ok: false, error: "Esa semana no es de esta obra." };

  await prisma.planSemanal.update({
    where: { id: plan.id },
    data: { origenDatos: origen },
  });

  return { ok: true };
}

export interface SemanaDelEstudio {
  id: string;
  numero: number;
  indice: number;
  fechaCorte: Date;
  fase: FaseEstudio;
  origenDatos: "GESTIONADO" | "RECONSTRUIDO";
  estado: string;
  compromisos: number;
  ppc: number | null;
}

export interface ResumenEstudio {
  obra: string;
  interrupcion: Date | null;
  semanas: SemanaDelEstudio[];
  pre: number;
  post: number;
  reconstruidas: number;
  restricciones: number;
  restriccionesMedibles: number;
}

/** Lo que la pantalla del estudio necesita saber para poder explicarse. */
export async function resumenDelEstudio(
  sesion: SesionActiva,
  obraId: string,
): Promise<ResumenEstudio | null> {
  if (!sesion.esOperador) return null;
  if (!alcanzaObra(sesion, obraId)) return null;

  const obra = await prisma.project.findFirst({
    where: { id: obraId, companyId: sesion.companyId },
    select: { nombreObra: true, fechaInterrupcionEstudio: true },
  });
  if (!obra) return null;

  const planes = await prisma.planSemanal.findMany({
    where: { projectId: obraId },
    orderBy: { fechaCorte: "asc" },
    select: {
      id: true,
      numero: true,
      fechaCorte: true,
      estado: true,
      origenDatos: true,
      compromisos: { select: { cumplido: true } },
    },
  });

  const indice = indicePorSemana(planes);

  const semanas = planes.map((p) => {
    const evaluados = p.compromisos.filter((c) => c.cumplido !== null);
    const cumplidos = evaluados.filter((c) => c.cumplido === true).length;
    return {
      id: p.id,
      numero: p.numero,
      indice: indice.get(p.fechaCorte.getTime()) ?? 0,
      fechaCorte: p.fechaCorte,
      fase: faseDeLaSemana(p.fechaCorte, obra.fechaInterrupcionEstudio),
      origenDatos: p.origenDatos as "GESTIONADO" | "RECONSTRUIDO",
      estado: p.estado,
      compromisos: p.compromisos.length,
      ppc: evaluados.length === 0 ? null : (cumplidos / evaluados.length) * 100,
    };
  });

  const [restricciones, medibles] = await Promise.all([
    prisma.restriccion.count({ where: { tarea: { projectId: obraId } } }),
    prisma.restriccion.count({
      where: {
        tarea: { projectId: obraId },
        fechaCompromiso: { not: null },
        resueltaAt: { not: null },
      },
    }),
  ]);

  return {
    obra: obra.nombreObra,
    interrupcion: obra.fechaInterrupcionEstudio,
    semanas,
    pre: semanas.filter((s) => s.fase === "PRE").length,
    post: semanas.filter((s) => s.fase === "POST").length,
    reconstruidas: semanas.filter((s) => s.origenDatos === "RECONSTRUIDO").length,
    restricciones,
    restriccionesMedibles: medibles,
  };
}
