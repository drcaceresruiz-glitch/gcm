import {
  TABLAS,
  type RefInterna,
  type TablaRespaldo,
} from "@/lib/respaldo-esquema";

/**
 * Que lleva la MIGRACION de una constructora entera, y en que orden.
 *
 * El respaldo de obra (`respaldo-esquema`) se lleva una obra y deja fuera lo
 * que vive en la empresa —usuarios, contratistas, formas de pago—, porque al
 * restaurarlo esas cosas YA estan en el destino y solo hay que volver a
 * enlazarlas. En una migracion no: el destino esta vacio, y si no viaja el
 * contratista no hay a quien enlazar.
 *
 * SE REUSA EL CATALOGO DE OBRA ENTERO, no se escribe uno paralelo. Aquel
 * declara para cada tabla sus referencias, sus columnas de importe con su
 * escala exacta y sus fechas de calendario, y tiene una prueba que lee
 * `schema.prisma` y pone el build en rojo si alguien anade una tabla sin
 * registrarla. Un segundo catalogo tendria que repetir todo eso y divergiria
 * el primer dia que alguien tocara una sola de las dos copias.
 *
 * Lo que se hace aqui son dos cosas y nada mas:
 *
 *   1. **Anteponer las tablas de empresa**, que son el nuevo cimiento.
 *   2. **Convertir en internas las referencias que alli eran externas.** En el
 *      respaldo de obra, `proveedorId` apunta «a la empresa» y se remapea
 *      contra lo que exista en destino; en una migracion el proveedor viaja
 *      dentro, asi que es una referencia mas del archivo.
 */

/**
 * Lo que NO viaja en una migracion, ADEMAS de lo que ya excluye el respaldo
 * de obra. Cada una por un motivo que costaria caro descubrir despues.
 */
export const EXCLUIDAS_MIGRACION: Readonly<Record<string, string>> = {
  companies:
    "La empresa NO se restaura como fila: el destino ya tiene la suya, creada " +
    "por su operador, y traerla chocaria con el RUC unico. Sus datos —razon " +
    "social, RUC, logo, representante— viajan en el MANIFIESTO, para poder " +
    "decir de quien es el archivo antes de importarlo y para que quien " +
    "importa decida si sobreescribe los suyos.",
  sessions:
    "Sesiones abiertas, no historia. Restaurarlas dejaria entrando en la " +
    "instalacion nueva a quien tuviera una pestana abierta en la vieja.",
  password_reset_tokens:
    "Credenciales vivas con caducidad. Lo mismo que las sesiones.",
  codigos_acceso: "Codigos de doble factor en vuelo. No son historia.",
  emisores_sms:
    "Es una credencial viva atada a UN telefono y, ademas, a la direccion de " +
    "la cola, que en la instalacion nueva es otra. Viajaria un token que ya " +
    "no sirve para nada y que habria que revocar. Se vuelve a vincular.",
  remitentes_correo:
    "La contrasena del buzon esta cifrada con la llave del ORIGEN " +
    "(`CORREO_CLAVE_CIFRADO`), que el destino no tiene: llegaria un dato " +
    "imposible de descifrar. Es mas honesto no traerlo y pedir que se teclee " +
    "otra vez, que es un minuto, que dejar una fila que parece configurada y " +
    "no manda ni un correo.",
  solicitudes_cambio_perfil:
    "Tramites a medias —alguien pidio cambiar su celular— que en la " +
    "instalacion nueva no tienen a quien reclamar. Se vuelven a pedir.",
  reloj_tareas:
    "Es el latido del propio servidor —cuando corrio la ultima pasada de " +
    "avisos—, no dato de ninguna empresa. En la instalacion nueva su reloj " +
    "es otro, y traer el del origen diria que corrio algo que no ha corrido.",
};

/**
 * Las tablas de la EMPRESA, en orden de dependencia.
 *
 * Van delante de las de obra porque son su cimiento: las partidas apuntan a
 * proveedores y las restricciones a usuarios, no al reves. Este orden se
 * recorre tal cual al escribir y al insertar, y al reves para borrar.
 */
export const TABLAS_EMPRESA: readonly TablaRespaldo[] = [
  {
    /// Las personas. Viaja `passwordHash` a proposito: es un hash scrypt, no
    /// una contrasena, y su formato se lleva consigo el coste y la sal. Sin
    /// el, TODA la constructora tendria que restablecer su clave el primer
    /// dia en la instalacion nueva, que es la peor bienvenida posible.
    tabla: "users",
    modelo: "user",
    refs: [],
  },
  {
    /// Las excepciones de permisos de la empresa. Sin ellas, el destino
    /// aplicaria la matriz de fabrica y alguien perderia en silencio un
    /// permiso que su empresa le habia dado a mano.
    tabla: "company_permissions",
    modelo: "companyPermission",
    refs: [],
  },
  {
    tabla: "proveedores",
    modelo: "proveedor",
    refs: [],
  },
  {
    tabla: "formas_pago_plantillas",
    modelo: "formaPagoPlantilla",
    refs: [],
  },
];

/**
 * A que tabla del archivo corresponde cada referencia «a la empresa».
 *
 * En el respaldo de obra estas apuntan fuera; aqui, dentro.
 */
const TABLA_DE_EXTERNA: Readonly<Record<string, string>> = {
  usuario: "users",
  proveedor: "proveedores",
};

/**
 * Una tabla de obra, con sus referencias externas convertidas en internas.
 *
 * `siFalta` desaparece a proposito y no se pierde nada: existia para decidir
 * que hacer cuando el proveedor al que apunta la obra ya no esta en la
 * empresa de destino. En una migracion el proveedor viaja en el mismo
 * archivo, asi que o esta —y se remapea como cualquier otra referencia— o el
 * archivo esta roto, que es un caso distinto y lo canta la verificacion.
 */
function conExternasInternas(t: TablaRespaldo): TablaRespaldo {
  if (!t.externas || t.externas.length === 0) return t;

  const convertidas: RefInterna[] = t.externas.map((e) => ({
    campo: e.campo,
    a: TABLA_DE_EXTERNA[e.a]!,
  }));

  const { externas: _externas, ...resto } = t;
  return { ...resto, refs: [...t.refs, ...convertidas] };
}

/**
 * El catalogo completo de una migracion: empresa primero, obra despues.
 *
 * Se calcula una vez al cargar el modulo, no en cada llamada: es una lista
 * fija y recalcularla por exportacion solo daria oportunidades de que dos
 * consumidores vieran cosas distintas.
 */
export const TABLAS_MIGRACION: readonly TablaRespaldo[] = [
  ...TABLAS_EMPRESA,
  ...TABLAS.map(conExternasInternas),
];

/** La tabla del catalogo de migracion, por su nombre. */
export function tablaDeMigracion(nombre: string): TablaRespaldo | undefined {
  return TABLAS_MIGRACION.find((t) => t.tabla === nombre);
}
