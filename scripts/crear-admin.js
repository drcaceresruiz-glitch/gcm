/**
 * Crea la empresa y el usuario administrador en una base recien migrada.
 *
 * Uso, desde el Terminal de cPanel y dentro de la carpeta de la aplicacion:
 *
 *     node scripts/crear-admin.js tu-correo@ejemplo.com
 *
 * Imprime UNA SOLA VEZ una clave temporal. La aplicacion obliga a cambiarla
 * en el primer ingreso. Es idempotente: si el usuario ya existe no lo toca.
 *
 * Dos decisiones sobre como esta escrito:
 *
 * - JavaScript plano y CommonJS, no TypeScript: en el servidor solo hay el
 *   Node de cPanel y el node_modules que viaja en el paquete. No hay `tsx`.
 *
 * - Habla directo con MariaDB y no por Prisma. El proyecto genera su cliente
 *   en `src/generated/prisma`, no en `@prisma/client`, y esa ruta no existe
 *   como modulo en el paquete desplegado: `require("@prisma/client")` falla
 *   con MODULE_NOT_FOUND. El driver `mariadb` si esta, porque lo arrastra
 *   `@prisma/adapter-mariadb`.
 */
const { randomBytes, randomInt, scrypt } = require("node:crypto");
const mariadb = require("mariadb");

// --- Copia fiel de src/lib/password.ts -------------------------------------
// Los parametros deben coincidir con los de la aplicacion, o el hash que se
// genere aqui no validaria al iniciar sesion.
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

/** Identificador al estilo cuid: Prisma solo los genera desde su cliente. */
function id() {
  return "c" + Date.now().toString(36) + randomBytes(10).toString("hex");
}

/**
 * Numero de documento libre dentro de la empresa.
 *
 * `users` tiene un unico [companyId, numDoc], asi que un valor fijo como
 * "00000000" solo deja crear un usuario. Es un marcador que se corrige luego
 * desde la ficha de la persona; aqui basta con que no choque.
 */
async function numDocLibre(con, empresaId) {
  for (let i = 0; i < 100; i++) {
    const candidato = String(i).padStart(8, "0");
    const usado = await con.query(
      "SELECT 1 FROM users WHERE companyId = ? AND numDoc = ?",
      [empresaId, candidato],
    );
    if (usado.length === 0) return candidato;
  }
  throw new Error("No hay ningun numero de documento libre de relleno.");
}

const RUC = "20601689988";
const RAZON_SOCIAL = "LARQUITECTURA STUDIO SAC";

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
        "aplicacion Node no estan cargadas: exportala antes del comando.",
    );
    process.exit(1);
  }

  const u = new URL(url);
  const con = await mariadb.createConnection({
    host: u.hostname,
    port: Number(u.port || 3306),
    user: decodeURIComponent(u.username),
    password: decodeURIComponent(u.password),
    database: u.pathname.replace(/^\//, ""),
  });

  try {
    const yaExiste = await con.query(
      "SELECT id FROM users WHERE email = ?",
      [email],
    );
    if (yaExiste.length > 0) {
      console.log("\nEl usuario " + email + " ya existe. No se toca su clave.");
      console.log("Si la olvidaste, borra esa fila en phpMyAdmin y repite.");
      return;
    }

    let empresa = await con.query("SELECT id FROM companies WHERE ruc = ?", [RUC]);
    let empresaId;
    if (empresa.length > 0) {
      empresaId = empresa[0].id;
      console.log("Empresa ya existente: " + RAZON_SOCIAL);
    } else {
      empresaId = id();
      await con.query(
        "INSERT INTO companies (id, razonSocial, ruc, direccion, updatedAt)" +
          " VALUES (?, ?, ?, ?, NOW(3))",
        [empresaId, RAZON_SOCIAL, RUC, "Lima, Peru"],
      );
      console.log("Empresa creada: " + RAZON_SOCIAL);
    }

    const clave = claveTemporal();
    await con.query(
      "INSERT INTO users (id, companyId, nombres, apellidos, tipoDoc, numDoc," +
        " cargo, email, passwordHash, role, estado, mustChangePassword," +
        " updatedAt)" +
        " VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'ADMIN', 'ACTIVO', true, NOW(3))",
      [
        id(), empresaId, "Administrador", "GCM", "DNI",
        await numDocLibre(con, empresaId),
        "Administrador del sistema", email, await hashPassword(clave),
      ],
    );

    console.log("\n=====================================================");
    console.log("  Usuario:  " + email);
    console.log("  Clave:    " + clave);
    console.log("=====================================================");
    console.log("Se muestra una sola vez. Entra y cambiala: la aplicacion");
    console.log("te lo va a exigir de todos modos.");
  } finally {
    await con.end();
  }
}

main().catch((e) => {
  console.error("\nFallo:", e.message);
  process.exitCode = 1;
});
