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
  /// Cuantos caracteres aguanta la columna de `Proveedor` en la base
  /// (`prisma/schema.prisma`). Sin esto se trunca en silencio en
  /// `proveedores.service.ts` (`saneado()`) y nadie se entera de que su
  /// texto no cabia entero — el mismo descuido que causo el incidente de
  /// "Data too long" del 20 de agosto en el importador de presupuesto.
  maxLargo?: number;
}

export const CAMPOS_EXCEL: readonly CampoExcel[] = [
  { clave: "ruc", titulo: "RUC", ancho: 14, ejemplo: "20552103816", obligatorio: true },
  {
    clave: "razonSocial",
    titulo: "Razón social o nombre",
    ancho: 42,
    ejemplo: "CONSTRUCTORA EJEMPLO S.A.C.",
    obligatorio: true,
    maxLargo: 200,
  },
  { clave: "contactoNombre", titulo: "Contacto", ancho: 24, ejemplo: "Juan Pérez", maxLargo: 150 },
  { clave: "contactoTelefono", titulo: "Teléfono", ancho: 14, ejemplo: "987654321", maxLargo: 30 },
  { clave: "email", titulo: "Correo", ancho: 28, ejemplo: "ventas@ejemplo.com", maxLargo: 150 },
  {
    clave: "rol",
    titulo: "Qué hace",
    ancho: 16,
    ejemplo: "CONTRATISTA",
    opciones: ["PROVEEDOR", "CONTRATISTA", "AMBOS"],
  },
  {
    clave: "tipoImpuesto",
    titulo: "Qué emite",
    ancho: 14,
    ejemplo: "IGV",
    opciones: ["IGV", "RENTA", "NINGUNO"],
  },
  { clave: "banco", titulo: "Banco", ancho: 18, ejemplo: "BCP", maxLargo: 80 },
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
  {
    clave: "cuentaBancaria",
    titulo: "Número de cuenta",
    ancho: 24,
    ejemplo: "194 2629150 0 70",
    maxLargo: 40,
  },
  { clave: "cci", titulo: "CCI", ancho: 26, ejemplo: "00219400262915007012", maxLargo: 40 },
  {
    clave: "cuentaDetraccion",
    titulo: "Cuenta de detracción",
    ancho: 24,
    ejemplo: "00-123-456789",
    maxLargo: 40,
  },
];

/// La fila de la cabecera. Debajo va la de opciones, y luego los datos.
export const FILA_CABECERA = 4;

/** Una fila del archivo, ya leida como texto. */
export type FilaExcel = Partial<Record<keyof DatosProveedor, string>>;

export type ResultadoFila =
  | { ok: true; datos: DatosProveedor; aviso?: string }
  | { ok: false; motivo: string };

/**
 * Recorta un texto a lo que aguanta su columna, avisando si tuvo que hacerlo.
 *
 * Antes de esto, un texto largo se recortaba en silencio dentro de
 * `saneado()` (`proveedores.service.ts`): quien subia el Excel nunca sabia
 * que su dato no habia entrado entero. Mismo criterio que
 * `excel-presupuesto.ts` con `MAX_UNIDAD`/`MAX_CODIGO`.
 */
function recortado(
  etiqueta: string,
  valor: string,
  maxLargo: number,
  avisos: string[],
): string {
  if (valor.length <= maxLargo) return valor;
  const cortado = valor.slice(0, maxLargo);
  avisos.push(
    `${etiqueta} "${valor}" pasa de ${maxLargo} caracteres y se guardo como "${cortado}".`,
  );
  return cortado;
}

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
  let razonSocial = (fila.razonSocial ?? "").trim();

  if (!ruc && !razonSocial) return { ok: false, motivo: "fila vacía" };
  if (!/^\d{11}$/.test(ruc)) {
    return { ok: false, motivo: `RUC inválido: «${fila.ruc ?? ""}»` };
  }
  if (!razonSocial) return { ok: false, motivo: `sin razón social (RUC ${ruc})` };

  const avisos: string[] = [];
  const razonSocialMax = CAMPOS_EXCEL.find((c) => c.clave === "razonSocial")?.maxLargo;
  if (razonSocialMax) {
    razonSocial = recortado("La razón social", razonSocial, razonSocialMax, avisos);
  }

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

    datos[campo.clave] = campo.maxLargo
      ? recortado(`"${campo.titulo}"`, bruto, campo.maxLargo, avisos)
      : bruto;
  }

  return avisos.length > 0
    ? { ok: true, datos, aviso: avisos.join(" ") }
    : { ok: true, datos };
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

/**
 * El titulo de una columna, para emparejarlo con su campo.
 *
 * Sin tildes y sin los asteriscos de obligatorio. Es lo que permite corregir la
 * ortografia de la plantilla SIN romper los archivos que ya estan repartidos:
 * "TELEFONO" y "TELÉFONO" tienen que caer en la misma columna. Comparando el
 * texto tal cual, esos archivos dejarian de importar esa columna EN SILENCIO
 * -no da error, el dato simplemente no entra-.
 *
 * El asterisco se quita con expresion regular y no con replace de cadena:
 * `"a * b *".replace("*", "")` solo se lleva el primero.
 */
export function normalizarTitulo(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/\*/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}
