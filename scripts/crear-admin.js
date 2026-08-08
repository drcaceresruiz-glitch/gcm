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
 * - No usa Prisma. El proyecto genera su cliente en `src/generated/prisma` y
 *   Next lo empaqueta DENTRO del codigo compilado, asi que no existe como
 *   modulo suelto: `require("@prisma/client")` falla con MODULE_NOT_FOUND.
 *
 * - El driver `mariadb` tampoco viaja en el paquete, por lo mismo. Si no
 *   esta, el script no se rinde: imprime el SQL para pegarlo en phpMyAdmin.
 *   Asi funciona con o sin dependencias, que es lo que se quiere de una
 *   herramienta de rescate.
 */
const { randomBytes, randomInt, scrypt } = require("node:crypto");

/** El driver es opcional: sin el se cae al modo SQL. */
function cargarDriver() {
  try {
    return require("mariadb");
  } catch {
    return null;
  }
}

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

/** Comillas simples dobladas: es todo lo que necesita un literal de MySQL. */
function sql(valor) {
  return "'" + String(valor).replace(/'/g, "''") + "'";
}

/**
 * Modo sin driver: se imprimen las sentencias para pegarlas en phpMyAdmin.
 *
 * Se usa INSERT IGNORE en la empresa por si ya existe, y se elige el numero
 * de documento con una subconsulta, para no depender de conocer el estado de
 * la base desde aqui.
 */
function imprimirSql(email, hash, empresaId, usuarioId) {
  console.log("\nNo se encontro el driver `mariadb`, asi que no puedo");
  console.log("escribir en la base directamente.");
  console.log("\nCopia TODO lo que va entre las lineas y pegalo en");
  console.log("phpMyAdmin, en la pestana SQL de la base de la aplicacion:");
  console.log("\n-------------------------------------------------------");
  console.log(
    "INSERT IGNORE INTO companies (id, razonSocial, ruc, direccion, updatedAt)\n" +
      "VALUES (" + sql(empresaId) + ", " + sql(RAZON_SOCIAL) + ", " +
      sql(RUC) + ", 'Lima, Peru', NOW(3));",
  );
  console.log(
    "\nINSERT INTO users (id, companyId, nombres, apellidos, tipoDoc, numDoc,\n" +
      "  cargo, email, passwordHash, role, estado, mustChangePassword, updatedAt)\n" +
      "SELECT " + sql(usuarioId) + ", c.id, 'Administrador', 'GCM', 'DNI',\n" +
      "  LPAD((SELECT COUNT(*) FROM users u WHERE u.companyId = c.id), 8, '0'),\n" +
      "  'Administrador del sistema', " + sql(email) + ", " + sql(hash) + ",\n" +
      "  'ADMIN', 'ACTIVO', true, NOW(3)\n" +
      "FROM companies c WHERE c.ruc = " + sql(RUC) + ";",
  );
  console.log("-------------------------------------------------------");
}

async function main() {
  const email = (process.argv[2] || "").trim().toLowerCase();
  if (!email || !email.includes("@")) {
    console.error("Uso: node scripts/crear-admin.js tu-correo@ejemplo.com");
    process.exit(1);
  }

  const clave = claveTemporal();
  const hash = await hashPassword(clave);

  const mariadb = cargarDriver();

  // Sin driver no hace falta ni la URL: se imprime el SQL y listo.
  if (!mariadb) {
    imprimirSql(email, hash, id(), id());
    console.log("\n=====================================================");
    console.log("  Usuario:  " + email);
    console.log("  Clave:    " + clave);
    console.log("=====================================================");
    console.log("Ejecuta ese SQL y despues entra con estos datos.");
    return;
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

    await con.query(
      "INSERT INTO users (id, companyId, nombres, apellidos, tipoDoc, numDoc," +
        " cargo, email, passwordHash, role, estado, mustChangePassword," +
        " updatedAt)" +
        " VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'ADMIN', 'ACTIVO', true, NOW(3))",
      [
        id(), empresaId, "Administrador", "GCM", "DNI",
        await numDocLibre(con, empresaId),
        "Administrador del sistema", email, hash,
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
