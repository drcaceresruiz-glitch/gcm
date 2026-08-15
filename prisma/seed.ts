import "dotenv/config";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { PrismaClient } from "../src/generated/prisma/client";
import { hashPassword } from "../src/lib/password";
import { generateTemporaryPassword } from "../src/lib/tokens";

/**
 * Datos iniciales.
 *
 * Se modela la obra CRIOCORD real para que la estructura sea reconocible
 * desde el primer arranque. Es idempotente: puede ejecutarse varias veces
 * sin duplicar nada.
 */

const adapter = new PrismaMariaDb(process.env["DATABASE_URL"]!);
const prisma = new PrismaClient({ adapter });

/** Los 12 capitulos del cronograma actual, con su nomenclatura exacta. */
const CAPITULOS: ReadonlyArray<readonly [string, string]> = [
  ["1.0", "CAPITULO I: GESTION, SEGURIDAD Y COSTOS INDIRECTOS"],
  ["2.0", "CAPITULO II: TRABAJOS PRELIMINARES"],
  ["3.0", "CAPITULO III: DEMOLICIONES Y DESMONTAJES"],
  ["4.0", "CAPITULO IV: MOVIMIENTO DE TIERRA Y CIMENTACIONES"],
  ["5.0", "CAPITULO V: ESTRUCTURAS METALICAS Y LOSAS"],
  ["6.0", "CAPITULO VI: ACI (AGUA CONTRA INCENDIOS)"],
  ["7.0", "CAPITULO VII: INSTALACIONES SANITARIAS (AGUA Y DESAGUE)"],
  ["8.0", "CAPITULO VIII: INSTALACIONES ELECTRICAS Y COMUNICACIONES"],
  ["9.0", "CAPITULO IX: SISTEMA DE DETECCION Y ALARMA CONTRA INCENDIOS"],
  ["10.0", "CAPITULO X: HVAC (AIRE ACONDICIONADO Y VENTILACION)"],
  ["11.0", "CAPITULO XI: ARQUITECTURA Y ACABADOS"],
  ["12.0", "CAPITULO XII: CIERRE, PRUEBAS INTEGRALES Y ENTREGA"],
];

/**
 * Partidas de ejemplo del Capitulo IV.
 *
 * Aqui se ve el cambio de fondo: en el cronograma actual el metrado va
 * dentro del texto ("Excavacion para zapatas (4.25 m3)"). Ahora metrado,
 * unidad y precio son campos propios, y el parcial se calcula solo.
 */
const PARTIDAS_CAP4: ReadonlyArray<
  readonly [string, string, string, number, number]
> = [
  ["4.1", "Trazo y replanteo de cimentaciones", "m2", 120.0, 8.5],
  ["4.2", "Corte de losa de concreto existente", "ml", 30.0, 45.0],
  ["4.3", "Demolicion de losas de concreto", "und", 9.0, 180.0],
  ["4.4", "Excavacion para zapatas", "m3", 4.25, 95.0],
  ["4.5", "Solado para zapatas e=4 pulg", "m2", 12.0, 38.0],
  ["4.6", "Acero corrugado fy=4200 kg/cm2 en zapatas", "kg", 285.0, 6.2],
  ["4.7", "Concreto f'c=210 kg/cm2 en zapatas", "m3", 6.8, 420.0],
  ["4.8", "Eliminacion de desmonte con acarreo", "m3", 15.0, 55.0],
];

/**
 * Las 8 tareas del cronograma, espejo de las 8 partidas del Capitulo IV.
 *
 * El espejo NO es decorativo: es lo que permite enlazar cada tarea con su
 * partida en `MapeoTareaPartida`, y de ahi sale el avance ponderado POR DINERO
 * en vez de por duracion. Sin ese enlace, la curva S reparte a partes iguales
 * una excavacion de 403 soles y un concreto de 2.856, y el porcentaje de obra
 * deja de significar nada.
 *
 * `uid` coincide a proposito con el numero de la partida (4.1 -> uid 41): es
 * legible al depurar y no colisiona con el espacio de un archivo real.
 */
const TAREAS_CRONOGRAMA: ReadonlyArray<{
  readonly uid: number;
  readonly codigo: string;
  readonly nombre: string;
  readonly inicio: string;
  readonly fin: string;
  readonly dias: number;
  /// Lo que deberia llevar a la fecha de corte, segun el plan.
  readonly planeado: number;
  /// Lo reportado desde obra. Menor que el plan en las dos ultimas: la obra
  /// va algo atrasada, que es lo interesante de mirar.
  readonly real: number;
}> = [
  // El capitulo lleva el PONDERADO POR DURACION de sus partidas, no un 100
  // redondo: la aplicacion LEE el planeado del capitulo y CALCULA el real de
  // sus hijas, asi que una cifra inventada aqui hace que el informe se
  // contradiga consigo mismo en la misma caja.
  //   planeado = (2+2+2+3+1) x 100 / 15 = 66.67
  //   real     = (2+2+2+3) x 100 + 1 x 60 = 960 / 15 = 64.00
  { uid: 40, codigo: "4.0", nombre: "CAPITULO IV: MOVIMIENTO DE TIERRA Y CIMENTACIONES", inicio: "2026-08-03", fin: "2026-08-21", dias: 15, planeado: 66.67, real: 64 },
  { uid: 41, codigo: "4.1", nombre: "Trazo y replanteo de cimentaciones", inicio: "2026-08-03", fin: "2026-08-04", dias: 2, planeado: 100, real: 100 },
  { uid: 42, codigo: "4.2", nombre: "Corte de losa de concreto existente", inicio: "2026-08-05", fin: "2026-08-06", dias: 2, planeado: 100, real: 100 },
  { uid: 43, codigo: "4.3", nombre: "Demolicion de losas de concreto", inicio: "2026-08-07", fin: "2026-08-10", dias: 2, planeado: 100, real: 100 },
  { uid: 44, codigo: "4.4", nombre: "Excavacion para zapatas", inicio: "2026-08-11", fin: "2026-08-13", dias: 3, planeado: 100, real: 100 },
  { uid: 45, codigo: "4.5", nombre: "Solado para zapatas e=4 pulg", inicio: "2026-08-14", fin: "2026-08-14", dias: 1, planeado: 100, real: 60 },
  // Empieza EL MISMO DIA del corte, y entonces el reparto lineal la da en 0:
  // `fraccion()` comprueba `fecha <= inicio` ANTES que `fecha >= fin`. Poner
  // aqui un 50 a ojo hacia que la curva y la tabla dijeran cosas distintas.
  { uid: 46, codigo: "4.6", nombre: "Acero corrugado fy=4200 kg/cm2 en zapatas", inicio: "2026-08-17", fin: "2026-08-18", dias: 2, planeado: 0, real: 0 },
  { uid: 47, codigo: "4.7", nombre: "Concreto f'c=210 kg/cm2 en zapatas", inicio: "2026-08-19", fin: "2026-08-20", dias: 2, planeado: 0, real: 0 },
  { uid: 48, codigo: "4.8", nombre: "Eliminacion de desmonte con acarreo", inicio: "2026-08-21", fin: "2026-08-21", dias: 1, planeado: 0, real: 0 },
];

/** La fecha a la que estan referidos los avances del corte sembrado. */
const FECHA_CORTE = "2026-08-17";

async function main() {
  console.log("Sembrando datos iniciales...\n");

  // --- Empresa ---------------------------------------------------------
  const empresa = await prisma.company.upsert({
    where: { ruc: "20601689988" },
    update: {},
    create: {
      razonSocial: "LARQUITECTURA STUDIO SAC",
      ruc: "20601689988",
      direccion: "Lima, Peru",
      email: "contacto@larquitectura.pe",
    },
  });
  console.log(`  Empresa: ${empresa.razonSocial}`);

  // --- Usuario administrador -------------------------------------------
  // El correo se toma del entorno: un script de datos iniciales no debe
  // llevar la cuenta de una persona escrita en el codigo, y menos en un
  // repositorio publico.
  const emailAdmin =
    process.env["SEED_ADMIN_EMAIL"]?.trim().toLowerCase() ?? "admin@gcm.local";
  const yaExiste = await prisma.user.findUnique({ where: { email: emailAdmin } });

  let claveTemporal: string | null = null;
  if (!yaExiste) {
    claveTemporal = generateTemporaryPassword();
    await prisma.user.create({
      data: {
        companyId: empresa.id,
        nombres: "Administrador",
        apellidos: "GCM",
        tipoDoc: "DNI",
        numDoc: "00000000",
        cargo: "Administrador del sistema",
        email: emailAdmin,
        passwordHash: await hashPassword(claveTemporal),
        role: "ADMIN",
        mustChangePassword: true,
      },
    });
  }
  console.log(`  Usuario administrador: ${emailAdmin}`);

  // --- Obra ------------------------------------------------------------
  const obra = await prisma.project.upsert({
    where: {
      companyId_codigoObra: { companyId: empresa.id, codigoObra: "CRIOCORD" },
    },
    update: {},
    create: {
      companyId: empresa.id,
      codigoObra: "CRIOCORD",
      nombreObra:
        "LABORATORIO INSTITUTO DE CRIOPRESERVACION Y TERAPIA CELULAR",
      ubicacion: "Carretera Panamericana Sur Km 29.5, Lurin, Lima",
      cliente: "Criocord",
      fechaInicio: new Date("2026-08-01"),
      fechaFinProgramada: new Date("2026-10-22"),
      estado: "EN_EJECUCION",
    },
  });
  console.log(`  Obra: ${obra.codigoObra}`);

  // --- Capitulos (EDT nivel 0) -----------------------------------------
  const idsCapitulos = new Map<string, string>();

  for (const [indice, [codigo, descripcion]] of CAPITULOS.entries()) {
    const capitulo = await prisma.wbsItem.upsert({
      where: {
        projectId_codigoPartida: { projectId: obra.id, codigoPartida: codigo },
      },
      update: {},
      create: {
        projectId: obra.id,
        codigoPartida: codigo,
        tipo: "CAPITULO",
        descripcion,
        nivel: 0,
        orden: (indice + 1) * 1000,
      },
    });
    idsCapitulos.set(codigo, capitulo.id);
  }
  console.log(`  Capitulos: ${CAPITULOS.length}`);

  // --- Partidas del Capitulo IV ----------------------------------------
  const padre = idsCapitulos.get("4.0")!;
  let totalCapitulo = 0;

  for (const [i, fila] of PARTIDAS_CAP4.entries()) {
    const [codigo, descripcion, unidad, metrado, precioUnitario] = fila;

    // El parcial se redondea a 2 decimales, igual que en la base de datos.
    const parcial = Math.round(metrado * precioUnitario * 100) / 100;
    totalCapitulo += parcial;

    await prisma.wbsItem.upsert({
      where: {
        projectId_codigoPartida: { projectId: obra.id, codigoPartida: codigo },
      },
      update: {},
      create: {
        projectId: obra.id,
        parentId: padre,
        codigoPartida: codigo,
        tipo: "PARTIDA",
        descripcion,
        nivel: 1,
        orden: 4000 + (i + 1),
        unidad,
        metrado: metrado.toFixed(4),
        precioUnitario: precioUnitario.toFixed(4),
        parcial: parcial.toFixed(2),
      },
    });
  }
  console.log(`  Partidas del Capitulo IV: ${PARTIDAS_CAP4.length}`);
  console.log(`  Subtotal Capitulo IV: S/ ${totalCapitulo.toFixed(2)}`);

  await sembrarObraCompleta(obra.id, idsCapitulos.get("4.0")!, empresa.id);

  if (claveTemporal) {
    console.log("\n  ----------------------------------------------------");
    console.log("   PRIMER ACCESO");
    console.log(`   Usuario:  ${emailAdmin}`);
    console.log(`   Clave:    ${claveTemporal}`);
    console.log("   El sistema pedira cambiarla al entrar.");
    console.log("  ----------------------------------------------------");
  }

  console.log("\nListo.");
}

/** Fecha de calendario a medianoche UTC, como las guarda la aplicacion. */
function dia(iso: string): Date {
  return new Date(`${iso}T00:00:00Z`);
}

/**
 * El resto de la obra: cronograma con avance, calendario, proveedores,
 * Lookahead y plan semanal cerrado.
 *
 * Antes el seed dejaba una obra con presupuesto y nada mas, asi que el
 * cronograma, el Gantt, la curva S, el EVM, el Lookahead y el plan semanal
 * salian vacios y no habia forma de ver ninguno funcionando sin cargar a mano
 * un archivo de MS Project.
 *
 * Todo es idempotente: se comprueba antes de crear, porque esto se ejecuta
 * tambien sobre una base que ya tiene datos.
 */
async function sembrarObraCompleta(
  obraId: string,
  capituloIV: string,
  empresaId: string,
): Promise<void> {
  // --- Calendario laboral ----------------------------------------------
  // Lunes a viernes 8h y sabado 5h, que es el calendario real de CRIOCORD.
  // El Lookahead lo necesita para repartir tareas y contar plazos.
  for (let diaSemana = 1; diaSemana <= 7; diaSemana++) {
    await prisma.workCalendar.upsert({
      where: { projectId_diaSemana: { projectId: obraId, diaSemana } },
      update: {},
      create: {
        projectId: obraId,
        diaSemana,
        laborable: diaSemana <= 6,
        horas: diaSemana === 6 ? "5.00" : diaSemana === 7 ? "0.00" : "8.00",
      },
    });
  }
  console.log("  Calendario laboral: lunes a sabado");


  // --- Cronograma -------------------------------------------------------
  // Una sola version: el historico de cortes lo va construyendo el uso. Nace
  // como MANUAL y sin archivo, que es justo lo que el esquema permite desde
  // que el cronograma puede entrar tecleado o por Excel.
  const yaHayCronograma = await prisma.cronograma.findFirst({
    where: { projectId: obraId },
    select: { id: true },
  });

  if (!yaHayCronograma) {
    const cronograma = await prisma.cronograma.create({
      data: {
        projectId: obraId,
        version: 1,
        fechaCorte: dia(FECHA_CORTE),
        nombreProyecto: "LABORATORIO INSTITUTO DE CRIOPRESERVACION Y TERAPIA CELULAR",
        importadoPor: "Siembra inicial",
        origen: "MANUAL",
      },
      select: { id: true },
    });

    await prisma.tareaCronograma.createMany({
      data: TAREAS_CRONOGRAMA.map((t, i) => ({
        cronogramaId: cronograma.id,
        uid: t.uid,
        fila: i + 1,
        codigo: t.codigo,
        nombre: t.nombre,
        // La primera es el capitulo y agrupa; las demas cuelgan de ella.
        nivel: i === 0 ? 1 : 2,
        esResumen: i === 0,
        esHito: false,
        // Sin la red de precedencias no se conoce la ruta critica, asi que no
        // se inventa: se marca la holgura como no informada.
        esCritico: false,
        holguraDias: "0.00",
        holguraInferida: true,
        inicio: dia(t.inicio),
        fin: dia(t.fin),
        duracionDias: t.dias.toFixed(2),
        porcentajePlaneado: t.planeado.toFixed(2),
        porcentajeArchivo: t.real.toFixed(2),
        origen: "MANUAL",
      })),
    });

    console.log(`  Cronograma v1 al ${FECHA_CORTE}: ${TAREAS_CRONOGRAMA.length} tareas`);
  }

  // --- El enlace cronograma <-> presupuesto ------------------------------
  // Es lo que convierte el avance en DINERO. Sin el, la curva S pondera por
  // duracion y una excavacion de 403 soles pesa lo mismo que un concreto de
  // 2.856. Se ancla por codigo de partida, no por id, a proposito: reimportar
  // el presupuesto recrea las filas con identificadores nuevos.
  for (const t of TAREAS_CRONOGRAMA) {
    if (t.codigo === "4.0") continue; // el capitulo no lleva importe propio

    await prisma.mapeoTareaPartida.upsert({
      where: {
        projectId_uid_codigoPartida: {
          projectId: obraId,
          uid: t.uid,
          codigoPartida: t.codigo,
        },
      },
      update: {},
      create: {
        projectId: obraId,
        uid: t.uid,
        codigoPartida: t.codigo,
        confirmadoPor: "Siembra inicial",
      },
    });
  }
  console.log(`  Enlaces tarea-partida: ${TAREAS_CRONOGRAMA.length - 1}`);

  // --- Avance reportado desde obra --------------------------------------
  // Cada reporte es una fila nueva, nunca un UPDATE: la curva S sale de la
  // serie historica. Se siembran dos cortes para que la curva tenga forma en
  // vez de un solo punto.
  const yaHayAvance = await prisma.avanceTarea.findFirst({
    where: { projectId: obraId },
    select: { id: true },
  });

  if (!yaHayAvance) {
    const reportes = TAREAS_CRONOGRAMA.filter((t) => t.codigo !== "4.0").flatMap(
      (t) => {
        const filas = [];
        // Corte anterior: la mitad de lo que hay hoy, para que haya pendiente.
        if (t.real > 0) {
          filas.push({
            projectId: obraId,
            uid: t.uid,
            fecha: dia("2026-08-10"),
            porcentaje: Math.round(t.real / 2).toFixed(2),
            reportadoPor: "Siembra inicial",
          });
        }
        filas.push({
          projectId: obraId,
          uid: t.uid,
          fecha: dia(FECHA_CORTE),
          porcentaje: t.real.toFixed(2),
          reportadoPor: "Siembra inicial",
        });
        return filas;
      },
    );

    await prisma.avanceTarea.createMany({ data: reportes });
    console.log(`  Avance reportado: ${reportes.length} partes en 2 cortes`);
  }

  // --- Proveedores ------------------------------------------------------
  const PROVEEDORES = [
    ["20512345678", "MOVIMIENTO DE TIERRAS DEL SUR SAC", "Julio Ramirez"],
    ["20487654321", "ACEROS Y ENCOFRADOS LIMA EIRL", "Marta Quispe"],
    ["20456789012", "CONCRETERA PACIFICO SAC", "Elena Fuentes"],
  ] as const;

  const idsProveedor = new Map<string, string>();

  for (const [ruc, razonSocial, contacto] of PROVEEDORES) {
    const p = await prisma.proveedor.upsert({
      where: { companyId_ruc: { companyId: empresaId, ruc } },
      update: {},
      create: {
        companyId: empresaId,
        ruc,
        razonSocial,
        contactoNombre: contacto,
        tipoImpuesto: "IGV",
        origen: "MANUAL",
      },
      select: { id: true },
    });
    idsProveedor.set(ruc, p.id);
  }
  console.log(`  Proveedores: ${PROVEEDORES.length}`);

  // --- Lookahead --------------------------------------------------------
  // Las tres tareas de las proximas semanas, con sus restricciones. Una queda
  // LISTO —sin restricciones pendientes, que es lo unico comprometible en el
  // plan semanal—, otra BLOQUEADA y otra sin analizar.
  const yaHayLookahead = await prisma.lookaheadTask.findFirst({
    where: { projectId: obraId },
    select: { id: true },
  });

  if (!yaHayLookahead) {
    const listo = await prisma.lookaheadTask.create({
      data: {
        projectId: obraId,
        uid: 46,
        faseBloque: "Cimentaciones",
        zona: "Sector A",
        proveedorId: idsProveedor.get("20487654321")!,
        estado: "LISTO",
        analizadaAt: dia("2026-08-14"),
        analizadaPor: "Siembra inicial",
      },
      select: { id: true },
    });

    await prisma.restriccion.createMany({
      data: [
        { lookaheadTaskId: listo.id, tipo: "MATERIALES", detalle: "Acero en obra", resuelta: true, resueltaAt: dia("2026-08-13"), resueltaPor: "Siembra inicial" },
        { lookaheadTaskId: listo.id, tipo: "MANO_OBRA", detalle: "Cuadrilla de fierreros confirmada", resuelta: true, resueltaAt: dia("2026-08-13"), resueltaPor: "Siembra inicial" },
      ],
    });

    const bloqueada = await prisma.lookaheadTask.create({
      data: {
        projectId: obraId,
        uid: 47,
        faseBloque: "Cimentaciones",
        zona: "Sector A",
        proveedorId: idsProveedor.get("20456789012")!,
        estado: "BLOQUEADO",
        analizadaAt: dia("2026-08-14"),
        analizadaPor: "Siembra inicial",
      },
      select: { id: true },
    });

    await prisma.restriccion.createMany({
      data: [
        { lookaheadTaskId: bloqueada.id, tipo: "REQUISITOS", detalle: "Falta protocolo de liberacion de acero", requiereDoc: true, fechaCompromiso: dia("2026-08-19") },
        { lookaheadTaskId: bloqueada.id, tipo: "EQUIPOS", detalle: "Bomba de concreto sin confirmar", fechaCompromiso: dia("2026-08-18") },
      ],
    });

    await prisma.lookaheadTask.create({
      data: { projectId: obraId, uid: 48, faseBloque: "Cimentaciones", zona: "Sector B", estado: "PENDIENTE" },
    });

    console.log("  Lookahead: 3 tareas (1 lista, 1 bloqueada, 1 sin analizar)");
  }

  // --- Plan semanal ------------------------------------------------------
  // Uno CERRADO y otro ABIERTO. El cerrado es el que da PPC: 3 de 4
  // compromisos cumplidos = 75%. Los dos que fallaron llevan su causa, que es
  // de donde sale el Pareto de causas de no cumplimiento.
  const yaHayPlan = await prisma.planSemanal.findFirst({
    where: { projectId: obraId },
    select: { id: true },
  });

  if (!yaHayPlan) {
    const cerrado = await prisma.planSemanal.create({
      data: {
        projectId: obraId,
        numero: 2,
        fechaCorte: dia("2026-08-15"),
        estado: "CERRADO",
        creadoPor: "Siembra inicial",
        cerradoPor: "Siembra inicial",
        cerradoAt: dia("2026-08-15"),
      },
      select: { id: true },
    });

    await prisma.compromisoSemanal.createMany({
      data: [
        { planSemanalId: cerrado.id, uid: 44, descripcion: "Excavacion de zapatas Z-1 a Z-4", metaPorcentaje: "100.00", cumplido: true, zona: "Sector A", proveedorId: idsProveedor.get("20512345678")!, cantidadPlan: "4.2500", cantidadEjec: "4.2500", unidad: "m3" },
        { planSemanalId: cerrado.id, uid: 45, descripcion: "Solado de zapatas", metaPorcentaje: "100.00", cumplido: false, causa: "MATERIALES", notaCierre: "El mixer llego a las 16:00 y no dio tiempo", zona: "Sector A", cantidadPlan: "12.0000", cantidadEjec: "7.2000", unidad: "m2" },
        { planSemanalId: cerrado.id, uid: 43, descripcion: "Retiro de losa demolida", metaPorcentaje: "100.00", cumplido: true, zona: "Sector A" },
        { planSemanalId: cerrado.id, uid: 46, descripcion: "Habilitado de acero en taller", metaPorcentaje: "40.00", cumplido: false, causa: "MANO_OBRA", notaCierre: "Dos fierreros de baja", zona: "Taller", proveedorId: idsProveedor.get("20487654321")! },
      ],
    });

    const abierto = await prisma.planSemanal.create({
      data: {
        projectId: obraId,
        numero: 3,
        fechaCorte: dia("2026-08-22"),
        estado: "ABIERTO",
        creadoPor: "Siembra inicial",
      },
      select: { id: true },
    });

    await prisma.compromisoSemanal.createMany({
      data: [
        { planSemanalId: abierto.id, uid: 46, descripcion: "Terminar habilitado y colocar acero de zapatas", metaPorcentaje: "100.00", zona: "Sector A", proveedorId: idsProveedor.get("20487654321")! },
        { planSemanalId: abierto.id, uid: 45, descripcion: "Completar solado pendiente", metaPorcentaje: "100.00", zona: "Sector A" },
      ],
    });

    console.log("  Plan semanal: S2 cerrado (PPC 50%) y S3 abierto");
  }

  // --- Analisis de causa raiz -------------------------------------------
  // MATERIALES se repitio dos semanas seguidas, y eso es lo que dispara el
  // analisis. Cuelga del par obra + causa, no del compromiso que fallo.
  const yaHayAnalisis = await prisma.analisisCausa.findFirst({
    where: { projectId: obraId },
    select: { id: true },
  });

  if (!yaHayAnalisis) {
    await prisma.analisisCausa.create({
      data: {
        projectId: obraId,
        causa: "MATERIALES",
        porQue:
          "El concreto se pide el mismo dia que se necesita, y la planta " +
          "despacha por orden de llegada.",
        accion:
          "Programar el mixer con 48 horas y confirmar la vispera con el " +
          "proveedor.",
        fechaCompromiso: dia("2026-08-24"),
        creadoPor: "Siembra inicial",
      },
    });
    console.log("  Analisis de causa raiz: 1 (MATERIALES)");
  }
}

main()
  .catch((e) => {
    console.error("Error al sembrar datos:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
