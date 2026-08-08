/**
 * Crea la empresa y el usuario administrador en una base recien migrada.
 *
 * Va en JavaScript plano y no en TypeScript como `prisma/seed.ts` porque se
 * ejecuta en el servidor, donde no hay `tsx` ni dependencias de desarrollo:
 * solo el Node de cPanel y el node_modules que viaja dentro del paquete.
 *
 * Uso, desde el Terminal de cPanel y dentro de la carpeta de la aplicacion:
 *
 *     node scripts/crear-admin.js tu-correo@ejemplo.com
 *
 * Imprime UNA SOLA VEZ una clave temporal. La aplicacion obliga a cambiarla
 * en el primer ingreso, asi que no hace falta guardarla mas alla de ese rato.
 * Es idempotente: si el usuario ya existe, no lo toca ni cambia su clave.
 */
const { randomBytes, randomInt, scrypt } = require("node:crypto");
const { PrismaClient } = require("@prisma/client");
const { PrismaMariaDb } = require("@prisma/adapter-mariadb");

// --- Copia fiel de src/lib/password.ts -------------------------------------
// Los parametros deben coincidir con los de la aplicacion o el hash generado
// aqui no validaria al iniciar sesion.
const N = 16384;
const R = 8;
const P = 1;

function hashPassword(plano) {
  return new Promise((resolve, reject) => {
    const salt = randomBytes(16);
    scrypt(plano.normalize("NFKC"), salt, 32, { N, r: R, p: P }, (err, key) => {
      if (err) return reject(err);
      resolve(
        ["scrypt", N, R, P, salt.toString("base64"), key.toString("base64")]
          .join("$"),
      );
    });
  });
}

// --- Copia de generateTemporaryPassword ------------------------------------
// Sin caracteres ambiguos: esta clave se lee de una pantalla y se teclea.
const ALFABETO = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";

function claveTemporal(longitud = 12) {
  let salida = "";
  for (let i = 0; i < longitud; i++) salida += ALFABETO[randomInt(ALFABETO.length)];
  return salida;
}

async function main() {
  const email = (process.argv[2] || "").trim().toLowerCase();
  if (!email || !email.includes("@")) {
    console.error("Uso: node scripts/crear-admin.js tu-correo@ejemplo.com");
    process.exit(1);
  }

  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error(
      "Falta DATABASE_URL. En el Terminal de cPanel las variables de la\n" +
        "aplicacion Node no estan cargadas: pasala delante del comando.",
    );
    process.exit(1);
  }

  const prisma = new PrismaClient({ adapter: new PrismaMariaDb(url) });

  try {
    const empresa = await prisma.company.upsert({
      where: { ruc: "20601689988" },
      update: {},
      create: {
        razonSocial: "LARQUITECTURA STUDIO SAC",
        ruc: "20601689988",
        direccion: "Lima, Peru",
      },
      select: { id: true, razonSocial: true },
    });
    console.log("Empresa: " + empresa.razonSocial);

    const existe = await prisma.user.findUnique({ where: { email } });
    if (existe) {
      console.log("\nEl usuario " + email + " ya existe. No se toca su clave.");
      console.log("Si la olvidaste, borra la fila en phpMyAdmin y repite.");
      return;
    }

    const clave = claveTemporal();
    await prisma.user.create({
      data: {
        companyId: empresa.id,
        nombres: "Administrador",
        apellidos: "GCM",
        tipoDoc: "DNI",
        numDoc: "00000000",
        cargo: "Administrador del sistema",
        email,
        passwordHash: await hashPassword(clave),
        role: "ADMIN",
        // La aplicacion obliga a cambiarla en el primer ingreso.
        mustChangePassword: true,
      },
    });

    console.log("\n=====================================================");
    console.log("  Usuario:  " + email);
    console.log("  Clave:    " + clave);
    console.log("=====================================================");
    console.log("Se muestra una sola vez. Entra y cambiala; la aplicacion");
    console.log("te lo va a exigir de todos modos.");
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error("\nFallo:", e.message);
  process.exitCode = 1;
});
