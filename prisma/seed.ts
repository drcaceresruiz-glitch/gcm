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

main()
  .catch((e) => {
    console.error("Error al sembrar datos:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
