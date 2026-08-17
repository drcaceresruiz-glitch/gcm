import type { DatosProveedor } from "@/services/proveedores.service";

/**
 * El Excel del catalogo de proveedores: que columnas tiene y como se leen.
 *
 * UNA SOLA LISTA manda sobre las tres cosas —las columnas de la plantilla que
 * se descarga, la lectura del archivo que se sube, y el objeto que se guarda—.
 * Anadir un campo aqui lo hace aparecer en la plantilla y ser importable en el
 * mismo cambio, sin tocar tres archivos que acabarian discrepando.
 *
 * LO QUE ESTO NO ES: no se deriva del esquema de la base. Prisma no expone sus
 * campos en ejecucion, asi que la garantia real no es «la plantilla se saca de
 * la base», sino que **es imposible anadir una columna y olvidarse de leerla**.
 * Hay una prueba que falla si las dos mitades se separan.
 */

export interface CampoExcel {
  /// La clave con la que se guarda. Coincide con `DatosProveedor`.
  clave: keyof DatosProveedor;
  /// La cabecera que se ve en el Excel.
  titulo: string;
  /// Ancho de la columna, para que no haya que estirarlas a mano.
  ancho: number;
  /// Lo que se escribe en la fila de ejemplo.
  ejemplo: string;
  /// Valores admitidos, cuando el campo es de lista. Se anotan bajo la
  /// cabecera: sin esto, la gente escribe «soles» donde va «PEN».
  opciones?: readonly string[];
  /// Los dos unicos sin los cuales una fila no sirve para nada.
  obligatorio?: boolean;
}

export const CAMPOS_EXCEL: readonly CampoExcel[] = [
  { clave: "ruc", titulo: "RUC", ancho: 14, ejemplo: "20552103816", obligatorio: true },
  {
    clave: "razonSocial",
    titulo: "Razon social o nombre",
    ancho: 42,
    ejemplo: "CONSTRUCTORA EJEMPLO S.A.C.",
    obligatorio: true,
  },
  { clave: "contactoNombre", titulo: "Contacto", ancho: 24, ejemplo: "Juan Perez" },
  { clave: "contactoTelefono", titulo: "Telefono", ancho: 14, ejemplo: "987654321" },
  { clave: "email", titulo: "Correo", ancho: 28, ejemplo: "ventas@ejemplo.com" },
  {
    clave: "rol",
    titulo: "Que hace",
    ancho: 16,
    ejemplo: "CONTRATISTA",
    opciones: ["PROVEEDOR", "CONTRATISTA", "AMBOS"],
  },
  {
    clave: "tipoImpuesto",
    titulo: "Que emite",
    ancho: 14,
    ejemplo: "IGV",
    opciones: ["IGV", "RENTA", "NINGUNO"],
  },
  { clave: "banco", titulo: "Banco", ancho: 18, ejemplo: "BCP" },
  {
    clave: "tipoCuenta",
    titulo: "Tipo de cuenta",
    ancho: 16,
    ejemplo: "CORRIENTE",
    opciones: ["AHORROS", "CORRIENTE"],
  },
  {
    clave: "monedaCuenta",
    titulo: "Moneda",
    ancho: 10,
    ejemplo: "PEN",
    opciones: ["PEN", "USD"],
  },
  { clave: "cuentaBancaria", titulo: "Numero de cuenta", ancho: 24, ejemplo: "194 2629150 0 70" },
  { clave: "cci", titulo: "CCI", ancho: 26, ejemplo: "00219400262915007012" },
  {
    clave: "cuentaDetraccion",
    titulo: "Cuenta de detraccion",
    ancho: 24,
    ejemplo: "00-123-456789",
  },
];

/// La fila de la cabecera. Debajo va la de opciones, y luego los datos.
export const FILA_CABECERA = 4;

/** Una fila del archivo, ya leida como texto. */
export type FilaExcel = Partial<Record<keyof DatosProveedor, string>>;

export type ResultadoFila =
  | { ok: true; datos: DatosProveedor }
  | { ok: false; motivo: string };

/**
 * Una fila del Excel convertida en datos, o el motivo de descartarla.
 *
 * SOLO EXIGE RUC Y RAZON SOCIAL. Todo lo demas puede venir vacio: el archivo se
 * llena en varias tandas y en obra casi nunca se tienen los datos bancarios el
 * dia que se da de alta al proveedor. Rechazar la fila por eso obligaria a
 * inventarse un banco para poder guardar un nombre.
 */
export function leerFila(fila: FilaExcel): ResultadoFila {
  const ruc = (fila.ruc ?? "").replace(/\D/g, "");
  const razonSocial = (fila.razonSocial ?? "").trim();

  if (!ruc && !razonSocial) return { ok: false, motivo: "fila vacía" };
  if (!/^\d{11}$/.test(ruc)) {
    return { ok: false, motivo: `RUC inválido: «${fila.ruc ?? ""}»` };
  }
  if (!razonSocial) return { ok: false, motivo: `sin razón social (RUC ${ruc})` };

  const datos: DatosProveedor = { ruc, razonSocial };

  for (const campo of CAMPOS_EXCEL) {
    if (campo.obligatorio) continue;

    const bruto = (fila[campo.clave] ?? "").trim();
    if (!bruto) continue;

    // Las listas se comparan en mayusculas y sin acentos de mas: quien rellena
    // el Excel escribe «Corriente» o «corriente», y rechazarlo por la caja
    // seria devolverle el archivo por algo que la maquina sabe resolver.
    if (campo.opciones) {
      const elegida = campo.opciones.find(
        (o) => o.toUpperCase() === bruto.toUpperCase(),
      );
      if (elegida) datos[campo.clave] = elegida;
      continue;
    }

    datos[campo.clave] = bruto;
  }

  return { ok: true, datos };
}

/// Lo que ya tiene guardado un proveedor, para decidir que huecos rellenar.
export type ProveedorGuardado = Partial<Record<keyof DatosProveedor, unknown>>;

/**
 * Que campos del Excel se aplican a un proveedor que YA EXISTE.
 *
 * **RELLENA HUECOS Y NUNCA PISA.** Si el proveedor ya tiene teléfono, el del
 * archivo se ignora aunque sea distinto. Es la regla que hace que reimportar
 * por enesima vez sea inofensivo: un Excel viejo no puede hacer retroceder un
 * dato que alguien corrigio a mano en la aplicacion.
 *
 * El precio, dicho para que nadie lo descubra por las malas: **no se pueden
 * corregir datos en masa subiendo un Excel**. Para cambiar algo que ya tiene
 * valor hay que editar la ficha. Se prefiere eso a que un archivo desactualizado
 * pise en silencio lo bueno.
 *
 * Devuelve solo lo que hay que escribir. Vacio = no hay nada que hacer con esa
 * fila, y la pantalla lo cuenta como «sin cambios» en vez de como un guardado.
 */
export function huecosQueRellenar(
  existente: ProveedorGuardado,
  delExcel: DatosProveedor,
): Partial<DatosProveedor> {
  const cambios: Partial<DatosProveedor> = {};

  for (const campo of CAMPOS_EXCEL) {
    // El RUC identifica: por definicion ya coincide, y no se toca.
    if (campo.clave === "ruc") continue;

    const nuevo = delExcel[campo.clave];
    if (typeof nuevo !== "string" || !nuevo.trim()) continue;

    const actual = existente[campo.clave];
    const tieneValor =
      actual !== null && actual !== undefined && String(actual).trim() !== "";

    if (tieneValor) continue;

    cambios[campo.clave] = nuevo;
  }

  return cambios;
}
