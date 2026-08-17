import "server-only";

import ExcelJS from "exceljs";

import { prisma } from "@/lib/prisma";
import { puede } from "@/lib/rbac";
import {
  CAMPOS_EXCEL,
  FILA_CABECERA,
  huecosQueRellenar,
  leerFila,
  type FilaExcel,
} from "@/lib/proveedores-excel";
import {
  crearProveedor,
  editarProveedor,
  type DatosProveedor,
} from "./proveedores.service";
import type { SesionActiva } from "./sesion.service";

/**
 * El catalogo de proveedores por Excel: bajar la plantilla y subirla llena.
 *
 * Existe porque dar de alta treinta proveedores a mano, uno por uno, es la
 * clase de trabajo que no se hace nunca: la lista se queda en la hoja de
 * calculo de alguien y GCM se queda vacio.
 *
 * LA REGLA QUE LO GOBIERNA TODO: **rellena huecos y nunca pisa**. Vive en
 * `lib/proveedores-excel.huecosQueRellenar`, es pura y esta probada. Aqui solo
 * se aplica.
 */

/** El titulo de la hoja. `importar` lee la PRIMERA, se llame como se llame. */
const HOJA = "Proveedores";

const AZUL = "FF1D4ED8";
const GRIS = "FFF1F5F9";

export async function generarPlantillaProveedores(): Promise<ArrayBuffer> {
  const libro = new ExcelJS.Workbook();
  libro.creator = "GCM";

  const hoja = libro.addWorksheet(HOJA);
  hoja.columns = CAMPOS_EXCEL.map((c) => ({ width: c.ancho }));

  hoja.getCell("A1").value = "PROVEEDORES Y CONTRATISTAS - GCM";
  hoja.getCell("A1").font = { bold: true, size: 14 };

  // La regla, ARRIBA DEL TODO y en el propio archivo. Quien rellena esto no
  // tiene por que acordarse de lo que decia la pantalla al descargarlo.
  hoja.getCell("A2").value =
    "Solo hacen falta RUC y razon social. Lo demas puede ir vacio y se completa despues.";
  hoja.getCell("A2").font = { italic: true, color: { argb: "FF667788" } };
  hoja.getCell("A3").value =
    "Si vuelves a subir este archivo NO se duplica nada: se busca por RUC y solo se rellenan los campos vacios. Lo que ya tiene valor en GCM no se toca.";
  hoja.getCell("A3").font = { italic: true, color: { argb: "FF667788" } };

  const cabecera = hoja.getRow(FILA_CABECERA);
  CAMPOS_EXCEL.forEach((campo, i) => {
    const celda = cabecera.getCell(i + 1);
    celda.value = campo.obligatorio ? `${campo.titulo} *` : campo.titulo;
    celda.font = { bold: true, color: { argb: "FFFFFFFF" } };
    celda.fill = { type: "pattern", pattern: "solid", fgColor: { argb: AZUL } };
    celda.alignment = { vertical: "middle", wrapText: true };
  });
  cabecera.height = 26;

  // Las opciones validas, debajo de su columna: sin esto la gente escribe
  // «soles» donde va «PEN» y la fila entra a medias sin que nadie sepa por que.
  const ayuda = hoja.getRow(FILA_CABECERA + 1);
  CAMPOS_EXCEL.forEach((campo, i) => {
    const celda = ayuda.getCell(i + 1);
    celda.value = campo.opciones ? campo.opciones.join(" / ") : "";
    celda.font = { size: 9, italic: true, color: { argb: "FF667788" } };
    celda.fill = { type: "pattern", pattern: "solid", fgColor: { argb: GRIS } };
  });

  const ejemplo = hoja.getRow(FILA_CABECERA + 2);
  CAMPOS_EXCEL.forEach((campo, i) => {
    ejemplo.getCell(i + 1).value = campo.ejemplo;
    ejemplo.getCell(i + 1).font = { color: { argb: "FF94A3B8" } };
  });

  hoja.views = [{ state: "frozen", ySplit: FILA_CABECERA }];

  return libro.xlsx.writeBuffer() as Promise<ArrayBuffer>;
}

export interface ResumenImportacion {
  creados: number;
  completados: number;
  sinCambios: number;
  /// Por que se descarto cada fila, con su numero. Se enseñan todas: «3 filas
  /// con error» sin decir cuales obliga a revisar el archivo entero a ojo.
  rechazos: { fila: number; motivo: string }[];
}

export type ResultadoImportacion =
  | { ok: true; resumen: ResumenImportacion }
  | { ok: false; error: string };

/**
 * Lee el Excel y mete lo que trae.
 *
 * Las columnas se localizan POR SU CABECERA y no por su posicion: si alguien
 * reordena las columnas al rellenar —y lo hace— leer por posicion cargaria los
 * telefonos en el campo del banco sin dar un solo error.
 */
export async function importarProveedores(
  sesion: SesionActiva,
  archivo: File,
): Promise<ResultadoImportacion> {
  // Los DOS permisos: un archivo crea proveedores nuevos y completa los que ya
  // estaban, asi que quien importa hace las dos cosas a la vez.
  if (!puede(sesion, "proveedor:crear") || !puede(sesion, "proveedor:editar")) {
    return {
      ok: false,
      error: "No tienes permiso para dar de alta ni completar proveedores.",
    };
  }

  let hoja;
  try {
    const libro = new ExcelJS.Workbook();
    await libro.xlsx.load(await archivo.arrayBuffer());
    hoja = libro.worksheets[0];
  } catch {
    return { ok: false, error: "No se pudo leer el archivo. ¿Es un .xlsx?" };
  }

  if (!hoja) return { ok: false, error: "El archivo no tiene ninguna hoja." };

  // Donde esta cada columna, buscando su titulo en la fila de cabecera.
  const columnas = new Map<number, (typeof CAMPOS_EXCEL)[number]["clave"]>();
  const cabecera = hoja.getRow(FILA_CABECERA);

  cabecera.eachCell((celda, n) => {
    const titulo = String(celda.value ?? "")
      .replace("*", "")
      .trim()
      .toUpperCase();

    const campo = CAMPOS_EXCEL.find((c) => c.titulo.toUpperCase() === titulo);
    if (campo) columnas.set(n, campo.clave);
  });

  if (columnas.size === 0) {
    return {
      ok: false,
      error:
        "No se reconocieron las columnas. Descarga la plantilla y rellénala sin cambiar la fila de títulos.",
    };
  }

  const resumen: ResumenImportacion = {
    creados: 0,
    completados: 0,
    sinCambios: 0,
    rechazos: [],
  };

  // Se empieza DESPUES de la cabecera. La fila de opciones y la de ejemplo se
  // descartan solas: la primera no tiene RUC y la segunda lo tiene de mentira
  // —y si alguien deja el ejemplo, entra como un proveedor llamado
  // «CONSTRUCTORA EJEMPLO», que se ve y se desactiva—.
  for (let n = FILA_CABECERA + 1; n <= hoja.rowCount; n++) {
    const fila = hoja.getRow(n);
    const datos: FilaExcel = {};

    for (const [columna, clave] of columnas) {
      const valor = fila.getCell(columna).value;
      if (valor === null || valor === undefined) continue;

      // Un RUC tecleado como numero llega como number, y un correo con enlace
      // llega como objeto: se aplana todo a texto antes de mirarlo.
      const texto =
        typeof valor === "object" && "text" in valor
          ? String(valor.text)
          : typeof valor === "object" && "result" in valor
            ? String(valor.result)
            : String(valor);

      datos[clave] = texto;
    }

    const leida = leerFila(datos);
    if (!leida.ok) {
      if (leida.motivo !== "fila vacía") {
        resumen.rechazos.push({ fila: n, motivo: leida.motivo });
      }
      continue;
    }

    const existente = await prisma.proveedor.findFirst({
      where: { companyId: sesion.companyId, ruc: leida.datos.ruc },
    });

    if (!existente) {
      const r = await crearProveedor(sesion, leida.datos, "IMPORTADO");
      if (r.ok) resumen.creados++;
      else resumen.rechazos.push({ fila: n, motivo: r.error });
      continue;
    }

    const cambios = huecosQueRellenar(existente, leida.datos);

    if (Object.keys(cambios).length === 0) {
      resumen.sinCambios++;
      continue;
    }

    // Se guarda por `editarProveedor` y no con un `update` crudo: el servicio
    // valida, normaliza los desplegables y deja su apunte de auditoria. Se le
    // pasa TODO lo que ya tenia con los huecos rellenos encima, asi que lo que
    // ya tenia valor se reescribe con su propio valor: nada cambia.
    const fusionado: DatosProveedor = {
      ruc: existente.ruc,
      razonSocial: existente.razonSocial,
      contactoNombre: existente.contactoNombre ?? "",
      contactoTelefono: existente.contactoTelefono ?? "",
      email: existente.email ?? "",
      banco: existente.banco ?? "",
      tipoCuenta: existente.tipoCuenta ?? "",
      monedaCuenta: existente.monedaCuenta ?? "",
      cuentaBancaria: existente.cuentaBancaria ?? "",
      cci: existente.cci ?? "",
      cuentaDetraccion: existente.cuentaDetraccion ?? "",
      rol: existente.rol,
      tipoImpuesto: existente.tipoImpuesto,
      ...cambios,
    };

    const r = await editarProveedor(sesion, existente.id, fusionado);
    if (r.ok) resumen.completados++;
    else resumen.rechazos.push({ fila: n, motivo: r.error });
  }

  await prisma.auditLog.create({
    data: {
      companyId: sesion.companyId,
      userId: sesion.userId,
      entidad: "Proveedor",
      entidadId: sesion.companyId,
      accion: "CREATE",
      despues: {
        evento: "importacion-excel",
        creados: resumen.creados,
        completados: resumen.completados,
        sinCambios: resumen.sinCambios,
        rechazados: resumen.rechazos.length,
      },
    },
  });

  return { ok: true, resumen };
}
