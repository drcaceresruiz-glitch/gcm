import { z } from "zod";

/**
 * Validacion de variables de entorno.
 *
 * Se valida al arrancar, no al usarlas: si falta una credencial preferimos
 * que la aplicacion no levante a que falle a mitad de una operacion con
 * datos de obra a medio escribir.
 */
const envSchema = z.object({
  DATABASE_URL: z
    .string()
    .min(1, "DATABASE_URL es obligatoria")
    .refine(
      (v) => v.startsWith("mysql://") || v.startsWith("mariadb://"),
      "DATABASE_URL debe ser una cadena de conexion MySQL/MariaDB",
    ),

  /// Clave para firmar y derivar valores sensibles. Minimo 32 caracteres.
  /// Generar con: openssl rand -base64 32
  APP_SECRET: z.string().min(32, "APP_SECRET debe tener al menos 32 caracteres"),

  /// URL publica de la aplicacion. Se usa en los correos de alta y de
  /// recuperacion de clave, donde una URL relativa no sirve.
  APP_URL: z.string().min(1).default("http://localhost:3000"),

  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),

  /// Raiz de almacenamiento de archivos subidos. Debe apuntar FUERA del
  /// directorio de la aplicacion para que un despliegue no pueda borrarla.
  STORAGE_ROOT: z.string().min(1).default("./storage"),

  /**
   * Token de decolecta.com para consultar el RUC en SUNAT.
   *
   * Se llamaba APIS_NET_PE_TOKEN: apis.net.pe migro a decolecta y su dominio
   * antiguo devuelve 401 aunque el token sea bueno.
   *
   * OPCIONAL a proposito. Sin el, el alta de proveedores sigue funcionando
   * igual: solo se pierde el autorrelleno de la razon social, que es una
   * comodidad y no un requisito. Hacerlo obligatorio ataria el arranque de
   * toda la aplicacion a un servicio de terceros.
   */
  DECOLECTA_TOKEN: z.string().optional(),

  /**
   * Conversion de archivos .mpp de MS Project a XML, con MPXJ.
   *
   * Las dos son OPCIONALES a proposito, igual que el SMTP. Sin ellas el
   * importador sigue funcionando: solo deja de aceptar .mpp y pide el .xml,
   * que es lo que pasa en desarrollo, donde no hay Java instalado. Hacerlas
   * obligatorias ataria el arranque de toda la aplicacion a una herramienta
   * que solo usa una pantalla.
   *
   * MPXJ_JAVA es la ruta al ejecutable `java` (en el servidor, `~/java/bin/java`
   * de un Temurin 21) y MPXJ_HOME el directorio con los JAR de MPXJ.
   */
  MPXJ_JAVA: z.string().optional(),
  MPXJ_HOME: z.string().optional(),

  // --- Correo saliente (alta de usuarios y recuperacion de clave) ---
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().int().positive().optional(),
  SMTP_USER: z.string().optional(),
  SMTP_PASSWORD: z.string().optional(),
  SMTP_FROM: z.string().optional(),
});

function loadEnv() {
  const parsed = envSchema.safeParse(process.env);

  if (!parsed.success) {
    const detalle = parsed.error.issues
      .map((i) => `  - ${i.path.join(".")}: ${i.message}`)
      .join("\n");
    throw new Error(
      `Configuracion de entorno invalida:\n${detalle}\n\n` +
        `Revisa tu archivo .env (usa .env.example como referencia).`,
    );
  }

  return parsed.data;
}

export const env = loadEnv();

export const isProduction = env.NODE_ENV === "production";
