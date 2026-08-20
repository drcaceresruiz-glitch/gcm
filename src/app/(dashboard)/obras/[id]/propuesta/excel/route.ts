import ExcelJS from "exceljs";
import { obtenerSesion } from "@/services/sesion.service";
import { obtenerPropuesta } from "@/services/propuesta.service";
import {
  aplicarDetalle,
  convertirLineas,
  costoDirectoDeLineas,
  SIMBOLO,
  type Moneda,
} from "@/lib/propuesta-detalle";
import { normalizarDecimal } from "@/lib/decimal";
import {
  calcularCascadaComercial,
  parametrosDeImpuesto,
  type TipoImpuestoContractual,
} from "@/lib/presupuesto";

/**
 * La propuesta en Excel.
 *
 * Va por POST y no por enlace porque las observaciones son texto libre y no
 * tienen por que caber en una URL.
 *
 * SIEMPRE sale con todo el detalle, aunque en pantalla se este viendo
 * resumida: el PDF es lo que ve el cliente y el Excel es el archivo con el que
 * se trabaja. Lo que si respeta es la forma de facturar elegida, porque si no
 * el Excel y el PDF dirian dos precios distintos del mismo presupuesto.
 */

/// Tope de los textos libres. Sin el, un pegado de veinte paginas entra en la
/// hoja y revienta la descarga: el mismo modo de fallo que ya mordio en otros
/// formularios de esta app.
const MAX_TEXTO = 2000;

const IMPUESTOS = new Set<string>(["IGV", "RENTA", "NINGUNO"]);

const METRADO = "#,##0.00";

/// El simbolo va DENTRO del formato: la celda sigue siendo un numero y suma,
/// pero se lee con su moneda. Una columna de dinero sin moneda, en un papel
/// que se entrega a un cliente, es un error.
function formatoDinero(moneda: Moneda): string {
  return `"${SIMBOLO[moneda]}" #,##0.00`;
}
const VERDE = "FF0D5C56";

function texto(datos: FormData, clave: string): string {
  return String(datos.get(clave) ?? "").slice(0, MAX_TEXTO);
}

export async function POST(
  peticion: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const sesion = await obtenerSesion();
  if (!sesion) return new Response("No autorizado", { status: 401 });

  const { id } = await params;
  const datos = await peticion.formData();
  const revisionId = String(datos.get("revisionId") ?? "");

  // El permiso y el filtro por empresa los pone el servicio; aqui solo se
  // traduce el null a un 404, igual que en la pantalla.
  const propuesta = await obtenerPropuesta(
    sesion,
    id,
    revisionId === "" ? undefined : revisionId,
  );

  if (!propuesta) return new Response("No encontrado", { status: 404 });

  // Lo que llega del formulario no se cree: si no es uno de los tres valores
  // conocidos se cae al de la revision.
  const pedido = String(datos.get("impuesto") ?? "");
  const impuesto = (
    IMPUESTOS.has(pedido) ? pedido : propuesta.revision.tipoImpuesto
  ) as TipoImpuestoContractual;

  const igv =
    normalizarDecimal(String(datos.get("igv") ?? ""), 4) ??
    propuesta.revision.porcentajes.igv;

  const { porcentajes, tipoCambio } = propuesta.revision;

  // Solo se emite en dolares si la revision trae tipo de cambio. Sin el, se
  // cae a soles en silencio en vez de inventar una cotizacion.
  const moneda: Moneda =
    datos.get("moneda") === "USD" && tipoCambio !== null ? "USD" : "PEN";

  // Se convierten las LINEAS y el costo directo sale de sumarlas: asi la
  // columna del Excel suma exactamente la cifra del resumen.
  const lineas =
    moneda === "USD" && tipoCambio !== null
      ? convertirLineas(propuesta.lineas, tipoCambio)
      : propuesta.lineas;

  const costoDirecto =
    moneda === "USD" ? costoDirectoDeLineas(lineas) : propuesta.costoDirectoNeto;

  const cascada = calcularCascadaComercial({
    costoDirecto,
    porcentajeGastosGenerales: porcentajes.gastosGenerales,
    porcentajeUtilidad: porcentajes.utilidad,
    porcentajeDescuento: porcentajes.descuento,
    ...parametrosDeImpuesto(
      impuesto,
      igv,
      datos.get("asumida") === "true",
      porcentajes.retencion,
    ),
  });

  const buffer = await componer(
    propuesta,
    cascada,
    impuesto,
    igv,
    moneda,
    aplicarDetalle(lineas, "todo"),
    texto(datos, "presentacion"),
    texto(datos, "observaciones"),
  );

  const nombre =
    "propuesta-" +
    archivo(propuesta.obra.nombreObra) +
    "-rev" +
    String(propuesta.revision.version) +
    ".xlsx";

  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": 'attachment; filename="' + nombre + '"',
      "Cache-Control": "no-store",
    },
  });
}

/// Nombre de archivo en ASCII: una cabecera Content-Disposition con tildes
/// llega rota a algunos navegadores.
function archivo(nombre: string): string {
  const limpio = nombre
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+/, "")
    .replace(/-+$/, "")
    .toLowerCase()
    .slice(0, 40);

  return limpio === "" ? "obra" : limpio;
}

type Propuesta = NonNullable<Awaited<ReturnType<typeof obtenerPropuesta>>>;
type Cascada = ReturnType<typeof calcularCascadaComercial>;
type Lineas = ReturnType<typeof aplicarDetalle>;

async function componer(
  propuesta: Propuesta,
  cascada: Cascada,
  impuesto: TipoImpuestoContractual,
  igv: string,
  moneda: Moneda,
  lineas: Lineas,
  presentacion: string,
  observaciones: string,
): Promise<ArrayBuffer> {
  const DINERO = formatoDinero(moneda);

  const libro = new ExcelJS.Workbook();
  libro.creator = "GCM";

  const hoja = libro.addWorksheet("Propuesta");
  hoja.columns = [
    { width: 12 },
    { width: 58 },
    { width: 8 },
    { width: 12 },
    { width: 14 },
    { width: 16 },
  ];

  const { emisor, obra, revision } = propuesta;

  const titulo = (valor: string, tamano: number) => {
    const fila = hoja.addRow([valor]);
    fila.getCell(1).font = { bold: true, size: tamano };
  };

  titulo(emisor.razonSocial.toUpperCase(), 14);
  hoja.addRow(["RUC " + emisor.ruc]);
  if (emisor.direccion) hoja.addRow([emisor.direccion]);

  const contacto = [emisor.telefono, emisor.email].filter(Boolean).join(" · ");
  if (contacto) hoja.addRow([contacto]);

  hoja.addRow([]);
  titulo("PROPUESTA ECONÓMICA", 12);
  hoja.addRow(["Revisión:", revision.version]);
  hoja.addRow(["Fecha:", fecha(revision.fechaRevision)]);

  if (!revision.aprobada) {
    // El mismo aviso que lleva el papel: un borrador no compromete a nadie.
    const fila = hoja.addRow([
      "BORRADOR — esta propuesta aún no está aprobada y puede cambiar",
    ]);
    fila.getCell(1).font = { bold: true };
  }

  hoja.addRow([]);
  hoja.addRow(["Cliente:", obra.cliente ?? ""]);
  hoja.addRow(["Obra:", obra.nombreObra]);
  if (obra.codigoObra) hoja.addRow(["Código:", obra.codigoObra]);
  if (obra.ubicacion) hoja.addRow(["Ubicación:", obra.ubicacion]);

  if (presentacion.trim() !== "") {
    hoja.addRow([]);
    for (const linea of presentacion.split(/\r?\n/)) hoja.addRow([linea]);
  }

  hoja.addRow([]);

  const cabecera = hoja.addRow([
    "Ítem",
    "Descripción",
    "Und.",
    "Metrado",
    "P. Unit. " + SIMBOLO[moneda],
    "Parcial " + SIMBOLO[moneda],
  ]);

  cabecera.eachCell((celda) => {
    celda.font = { bold: true, color: { argb: "FFFFFFFF" } };
    celda.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: VERDE },
    };
  });

  // La cabecera se queda a la vista al bajar por un presupuesto de cientos de
  // partidas: sin esto no se sabe que columna es cual.
  hoja.views = [{ state: "frozen", ySplit: cabecera.number }];

  for (const l of lineas) {
    const fila = hoja.addRow([
      l.codigo,
      l.descripcion,
      l.unidad ?? "",
      numero(l.metrado),
      numero(l.precioUnitario),
      numero(l.importe),
    ]);

    // Un capitulo o un subtotal se resaltan, igual que en el papel.
    if (l.esCapitulo || l.esSubtotal) {
      fila.eachCell((celda) => {
        celda.font = { bold: true };
      });
    }

    fila.getCell(4).numFmt = METRADO;
    fila.getCell(5).numFmt = DINERO;
    fila.getCell(6).numFmt = DINERO;
  }

  resumenDeCascada(
    hoja,
    cascada,
    impuesto,
    igv,
    moneda,
    revision.tipoCambio,
    revision.porcentajes,
  );

  bloque(hoja, "OBSERVACIONES", observaciones);
  bloque(hoja, "CONDICIONES", revision.clausulas ?? "");

  hoja.addRow([]);
  hoja.addRow([]);
  hoja.addRow(["", emisor.representanteLegal ?? emisor.razonSocial]);
  if (emisor.cargoRepresentante) hoja.addRow(["", emisor.cargoRepresentante]);

  return libro.xlsx.writeBuffer() as Promise<ArrayBuffer>;
}

/**
 * El resumen, en el orden que pide SUNAT.
 *
 * Las lineas que valen cero no se escriben, por lo mismo que en el papel: un
 * "DESCUENTO 0.00" hace dudar de si se olvido aplicarlo, y un "IGV 0.00"
 * parece una averia cuando lo que pasa es que es un recibo por honorarios.
 */
function resumenDeCascada(
  hoja: ExcelJS.Worksheet,
  cascada: Cascada,
  impuesto: TipoImpuestoContractual,
  igv: string,
  moneda: Moneda,
  tipoCambioUsado: string | null,
  porcentajes: Propuesta["revision"]["porcentajes"],
): void {
  const filas: [string, string][] = [
    ["COSTO DIRECTO", cascada.costoDirecto],
    [
      "GASTOS GENERALES (" + pct(porcentajes.gastosGenerales) + ")",
      cascada.gastosGenerales,
    ],
    ["UTILIDAD (" + pct(porcentajes.utilidad) + ")", cascada.utilidad],
    ["SUBTOTAL", cascada.subtotal],
  ];

  if (Number(cascada.descuento) !== 0) {
    filas.push([
      "DESCUENTO COMERCIAL (" + pct(porcentajes.descuento) + ")",
      cascada.descuento,
    ]);
  }

  filas.push(["VALOR DE VENTA", cascada.valorVenta]);

  if (impuesto === "IGV") {
    filas.push(["IGV (" + pct(igv) + ")", cascada.igv]);
  }

  // Solo si de verdad difiere: sin IGV y sin retencion asumida es la misma
  // cifra que el valor de venta, y repetirla con otro nombre confunde.
  if (Number(cascada.precioVenta) !== Number(cascada.valorVenta)) {
    filas.push(["PRECIO DE VENTA", cascada.precioVenta]);
  }

  if (impuesto === "RENTA") {
    filas.push([
      "RETENCIÓN DE RENTA (" + pct(porcentajes.retencion) + ")",
      cascada.retencionRenta,
    ]);
    filas.push(["NETO A RECIBIR", cascada.netoARecibir]);
  }

  const DINERO = formatoDinero(moneda);

  hoja.addRow([]);

  for (const [etiqueta, importe] of filas) {
    const fila = hoja.addRow(["", "", "", "", etiqueta, numero(importe)]);
    fila.getCell(5).font = { bold: true };
    fila.getCell(6).font = { bold: true };
    fila.getCell(6).numFmt = DINERO;
  }

  if (moneda === "USD" && tipoCambioUsado !== null) {
    hoja.addRow([]);
    hoja.addRow([
      "Importes convertidos desde soles al tipo de cambio " + tipoCambioUsado + ".",
    ]);
  }

  if (impuesto !== "IGV") {
    hoja.addRow([]);
    hoja.addRow([
      impuesto === "RENTA"
        ? "Importes no afectos a IGV: se emite recibo por honorarios, sujeto a retención de renta de cuarta categoría."
        : "Importes no afectos a IGV.",
    ]);
  }
}

/// Excel quiere numeros, no cadenas: si entra "1,234.56" como texto ni suma ni
/// aplica el formato. Lo que no sea numero se deja en blanco.
function numero(valor: string | null): number | null {
  if (valor === null) return null;
  const n = Number(valor);
  return Number.isFinite(n) ? n : null;
}

/// Las fracciones de la base (0.18) se leen como porcentaje (18.00%).
function pct(fraccion: string): string {
  return (Number(fraccion) * 100).toFixed(2) + "%";
}

function fecha(valor: Date): string {
  return valor.toLocaleDateString("es-PE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "UTC",
  });
}

/// Un bloque de texto libre con su titulo. Vacio = no se escribe nada: un
/// titulo suelto sin contenido parece un dato que se perdio.
function bloque(
  hoja: ExcelJS.Worksheet,
  titulo: string,
  contenido: string,
): void {
  if (contenido.trim() === "") return;

  hoja.addRow([]);
  const cabecera = hoja.addRow([titulo]);
  cabecera.getCell(1).font = { bold: true };

  // Cada salto de linea, su propia fila: una celda con saltos dentro obliga a
  // ajustar el alto a mano para que se lea entera.
  for (const linea of contenido.split(/\r?\n/)) hoja.addRow([linea]);
}
