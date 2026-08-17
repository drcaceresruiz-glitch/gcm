import "dotenv/config";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { PrismaClient } from "../src/generated/prisma/client";

/**
 * Siembra lo que NO viaja en los dos Excel de la obra de ejemplo.
 *
 * El presupuesto y el cronograma se importan por sus pantallas. Lo que no
 * tiene importador —proveedores, Lookahead, planes semanales con su PPC y el
 * analisis de causa— se siembra aqui, sobre una obra que YA tiene su
 * cronograma cargado.
 *
 *   npx tsx scripts/sembrar-obra-ejemplo.ts --obra <codigo|id>        (ensayo)
 *   npx tsx scripts/sembrar-obra-ejemplo.ts --obra <codigo|id> --si   (escribe)
 *
 * SIN `--si` NO ESCRIBE NADA: enseña lo que haria y termina. Es a proposito,
 * porque este guion puede apuntar a produccion cambiando `DATABASE_URL`, y un
 * script que escribe en cuanto lo ejecutas es exactamente como se estropea una
 * base a la que solo se queria mirar.
 *
 * TODO ancla por `uid`, sin clave ajena, igual que en la aplicacion: los uid
 * 41..48 del cronograma de ejemplo se eligieron para que coincidan con el
 * numero de la partida (4.1 -> 41). Si el cronograma se cargo con otros ID,
 * el guion se planta antes de escribir en vez de sembrar filas que apuntan a
 * tareas que no existen.
 *
 * Es idempotente: cada bloque comprueba si ya hay algo y no lo pisa.
 */

const prisma = new PrismaClient({
  adapter: new PrismaMariaDb(process.env["DATABASE_URL"] ?? ""),
});

/** Fecha de CALENDARIO, anclada a mediodia UTC para que no la corra la zona. */
function dia(iso: string): Date {
  return new Date(`${iso}T00:00:00.000Z`);
}

const PROVEEDORES = [
  ["20512345678", "MOVIMIENTO DE TIERRAS DEL SUR SAC", "Julio Ramirez"],
  ["20487654321", "ACEROS Y ENCOFRADOS LIMA EIRL", "Marta Quispe"],
  ["20456789012", "CONCRETERA PACIFICO SAC", "Elena Fuentes"],
] as const;

/// Los uid del cronograma de ejemplo de los que cuelga todo lo de abajo.
const UIDS_NECESARIOS = [43, 44, 45, 46, 47, 48];

function argumento(nombre: string): string | null {
  const i = process.argv.indexOf(nombre);
  return i >= 0 ? (process.argv[i + 1] ?? null) : null;
}

async function main() {
  const clave = argumento("--obra");
  const escribir = process.argv.includes("--si");

  if (!clave) {
    console.error("Falta --obra <codigo|id>. Con --si ademas escribe.");
    process.exit(1);
  }

  const obra = await prisma.project.findFirst({
    where: { OR: [{ id: clave }, { codigoObra: clave }] },
    select: { id: true, companyId: true, nombreObra: true, codigoObra: true, estado: true, archivadaEn: true },
  });

  if (!obra) {
    console.error(`No hay ninguna obra con codigo o id "${clave}".`);
    process.exit(1);
  }

  console.log(`OBRA: ${obra.nombreObra} (${obra.codigoObra}) — ${obra.estado}`);
  console.log(`BASE: ${(process.env["DATABASE_URL"] ?? "").replace(/\/\/[^@]+@/, "//***@")}`);

  // Una obra archivada es una copia de auditoria: no admite escritura por
  // ningun camino, y este no va a ser la excepcion.
  if (obra.archivadaEn) {
    console.error("Esa obra es una copia de auditoria (archivada). No se siembra.");
    process.exit(1);
  }

  // El ancla. Sin estas tareas, todo lo de abajo serian filas apuntando a la
  // nada: el Lookahead y los compromisos cuelgan del uid SIN clave ajena, asi
  // que la base los aceptaria encantada y la pantalla saldria vacia.
  const tareas = await prisma.tareaCronograma.findMany({
    where: { cronograma: { projectId: obra.id }, uid: { in: UIDS_NECESARIOS } },
    select: { uid: true },
  });
  const presentes = new Set(tareas.map((t) => t.uid));
  const faltan = UIDS_NECESARIOS.filter((u) => !presentes.has(u));

  if (faltan.length > 0) {
    console.error(
      `\nEl cronograma de esta obra no tiene los ID ${faltan.join(", ")}.\n` +
        "Importa antes 'gcm-cronograma-obra-ejemplo.xlsx', que los trae. Si\n" +
        "cargaste otro cronograma, los uid no coinciden y sembrar aqui dejaria\n" +
        "el Lookahead y el plan semanal apuntando a tareas inexistentes.",
    );
    process.exit(1);
  }

  if (!escribir) {
    console.log("\n--- ENSAYO (sin --si no se escribe nada) ---");
  }

  // --- Proveedores (catalogo de la EMPRESA, no de la obra) ---------------
  const idsProveedor = new Map<string, string>();
  let nuevosProveedores = 0;

  for (const [ruc, razonSocial, contacto] of PROVEEDORES) {
    const existe = await prisma.proveedor.findUnique({
      where: { companyId_ruc: { companyId: obra.companyId, ruc } },
      select: { id: true },
    });

    if (existe) {
      idsProveedor.set(ruc, existe.id);
      continue;
    }
    nuevosProveedores += 1;
    if (!escribir) {
      idsProveedor.set(ruc, "(nuevo)");
      continue;
    }

    const p = await prisma.proveedor.create({
      data: {
        companyId: obra.companyId,
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
  console.log(`Proveedores: ${nuevosProveedores} nuevos, ${PROVEEDORES.length - nuevosProveedores} ya estaban`);

  // --- Lookahead ---------------------------------------------------------
  // Tres tareas: una LISTO —lo unico comprometible en el plan semanal—, una
  // BLOQUEADO con sus dos restricciones abiertas, y una sin analizar.
  const yaLookahead = await prisma.lookaheadTask.findFirst({
    where: { projectId: obra.id },
    select: { id: true },
  });

  if (yaLookahead) {
    console.log("Lookahead: ya hay tareas, no se toca");
  } else if (!escribir) {
    console.log("Lookahead: se crearian 3 tareas (1 lista, 1 bloqueada, 1 sin analizar)");
  } else {
    const listo = await prisma.lookaheadTask.create({
      data: {
        projectId: obra.id, uid: 46, faseBloque: "Cimentaciones", zona: "Sector A",
        proveedorId: idsProveedor.get("20487654321")!, estado: "LISTO",
        analizadaAt: dia("2026-08-14"), analizadaPor: "Siembra de ejemplo",
      },
      select: { id: true },
    });
    await prisma.restriccion.createMany({
      data: [
        { lookaheadTaskId: listo.id, tipo: "MATERIALES", detalle: "Acero en obra", resuelta: true, resueltaAt: dia("2026-08-13"), resueltaPor: "Siembra de ejemplo" },
        { lookaheadTaskId: listo.id, tipo: "MANO_OBRA", detalle: "Cuadrilla de fierreros confirmada", resuelta: true, resueltaAt: dia("2026-08-13"), resueltaPor: "Siembra de ejemplo" },
      ],
    });

    const bloqueada = await prisma.lookaheadTask.create({
      data: {
        projectId: obra.id, uid: 47, faseBloque: "Cimentaciones", zona: "Sector A",
        proveedorId: idsProveedor.get("20456789012")!, estado: "BLOQUEADO",
        analizadaAt: dia("2026-08-14"), analizadaPor: "Siembra de ejemplo",
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
      data: { projectId: obra.id, uid: 48, faseBloque: "Cimentaciones", zona: "Sector B", estado: "PENDIENTE" },
    });
    console.log("Lookahead: 3 tareas creadas");
  }

  // --- Plan semanal ------------------------------------------------------
  // Uno CERRADO y otro ABIERTO. El cerrado es el que da PPC: 2 de 4
  // compromisos cumplidos = 50%. Los dos que fallaron llevan su causa, que es
  // de donde sale el Pareto de causas de no cumplimiento.
  const yaPlan = await prisma.planSemanal.findFirst({
    where: { projectId: obra.id },
    select: { id: true },
  });

  if (yaPlan) {
    console.log("Plan semanal: ya hay semanas, no se toca");
  } else if (!escribir) {
    console.log("Plan semanal: se crearian S2 cerrado (PPC 50%) y S3 abierto");
  } else {
    const cerrado = await prisma.planSemanal.create({
      data: {
        projectId: obra.id, numero: 2, fechaCorte: dia("2026-08-15"), estado: "CERRADO",
        creadoPor: "Siembra de ejemplo", cerradoPor: "Siembra de ejemplo", cerradoAt: dia("2026-08-15"),
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
        projectId: obra.id, numero: 3, fechaCorte: dia("2026-08-22"), estado: "ABIERTO",
        creadoPor: "Siembra de ejemplo",
      },
      select: { id: true },
    });
    await prisma.compromisoSemanal.createMany({
      data: [
        { planSemanalId: abierto.id, uid: 46, descripcion: "Terminar habilitado y colocar acero de zapatas", metaPorcentaje: "100.00", zona: "Sector A", proveedorId: idsProveedor.get("20487654321")! },
        { planSemanalId: abierto.id, uid: 45, descripcion: "Completar solado pendiente", metaPorcentaje: "100.00", zona: "Sector A" },
      ],
    });
    console.log("Plan semanal: S2 cerrado (PPC 50%) y S3 abierto");
  }

  // --- Analisis de causa raiz -------------------------------------------
  // MATERIALES es la causa que se repite, y eso es lo que dispara el
  // analisis. Cuelga del par obra + causa, no del compromiso que fallo.
  const yaAnalisis = await prisma.analisisCausa.findFirst({
    where: { projectId: obra.id },
    select: { id: true },
  });

  if (yaAnalisis) {
    console.log("Analisis de causa: ya hay, no se toca");
  } else if (!escribir) {
    console.log("Analisis de causa: se crearia 1 (MATERIALES)");
  } else {
    await prisma.analisisCausa.create({
      data: {
        projectId: obra.id,
        causa: "MATERIALES",
        porQue: "El concreto se pide el mismo dia que se necesita, y la planta despacha por orden de llegada.",
        accion: "Programar el mixer con 48 horas y confirmar la vispera con el proveedor.",
        fechaCompromiso: dia("2026-08-24"),
        creadoPor: "Siembra de ejemplo",
      },
    });
    console.log("Analisis de causa raiz: 1 (MATERIALES)");
  }

  // --- Ajustes de avisos, APAGADOS --------------------------------------
  /**
   * Se deja la fila creada pero `activo: false`, y no es timidez.
   *
   * Con los avisos encendidos, el reloj empieza a mandar correos y SMS de
   * verdad sobre restricciones y hitos SEMBRADOS —fechas de agosto de 2026 ya
   * vencidas— a quien figure suscrito. Es la misma razon por la que la
   * restauracion de un respaldo fuerza `activo: false`: nadie pidio que una
   * obra de ejemplo le escribiera.
   *
   * Se enciende desde la pantalla de Personal cuando se quiera ver esa parte.
   */
  const yaAjustes = await prisma.ajustesAvisosObra.findUnique({
    where: { projectId: obra.id },
    select: { activo: true },
  });

  if (yaAjustes) {
    console.log(`Avisos: ya configurados (activo=${yaAjustes.activo}), no se toca`);
  } else if (!escribir) {
    console.log("Avisos: se crearia la configuracion APAGADA (activo=false)");
  } else {
    await prisma.ajustesAvisosObra.create({
      data: {
        projectId: obra.id,
        activo: false,
        diasRecordatorio: 3,
        horaResumen: 17,
        maxSmsDia: 20,
      },
    });
    console.log("Avisos: configuracion creada APAGADA");
  }

  if (!escribir) {
    console.log("\nNada de esto se ha escrito. Repite con --si para hacerlo.");
  } else {
    console.log("\nHecho.");
  }
}

main()
  .catch((e) => {
    console.error("Fallo la siembra:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
