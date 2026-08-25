/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, beforeEach, vi } from "vitest";
import ExcelJS from "exceljs";
import { CAMPOS_EXCEL, FILA_CABECERA } from "@/lib/proveedores-excel";
import type { SesionActiva } from "./sesion.service";

/**
 * `importarProveedores`, la parte que SI toca la base.
 *
 * Nace el 24 de agosto de 2026 al cambiar el `findFirst` por fila —un Excel de
 * doscientos proveedores eran doscientos viajes— por una sola consulta con
 * todos los RUC. Lo que hay que fijar no es la consulta sino lo que ese cambio
 * podia romper sin que nadie lo notara: **dos filas con el mismo RUC**. Con un
 * mapa cargado UNA vez, la segunda fila no ve al que acaba de crear la primera
 * e intenta crearlo otra vez.
 */

const h = vi.hoisted(() => ({
  guardados: [] as any[],
  llamadas: { findMany: 0, findFirst: 0, crear: 0, editar: 0 },
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    proveedor: {
      findMany: async ({ where }: any) => {
        h.llamadas.findMany++;
        const rucs: string[] = where.ruc?.in ?? [];
        return h.guardados.filter((p) => rucs.includes(p.ruc));
      },
      findFirst: async ({ where }: any) => {
        h.llamadas.findFirst++;
        return h.guardados.find((p) => p.ruc === where.ruc) ?? null;
      },
    },
    auditLog: { create: async () => undefined },
  },
}));

vi.mock("@/lib/rbac", () => ({ puede: () => true }));
vi.mock("@/services/empresa-migracion.service", () => ({
  motivoSiEmpresaEnMigracion: async () => null,
}));

vi.mock("./proveedores.service", () => ({
  crearProveedor: async (_s: unknown, datos: any) => {
    h.llamadas.crear++;
    if (h.guardados.some((p) => p.ruc === datos.ruc)) {
      // Lo que haria el indice unico de la base: es exactamente el fallo que
      // esta prueba existe para que no vuelva.
      return { ok: false, error: "Ese RUC ya esta registrado." };
    }
    h.guardados.push({ id: `p${h.guardados.length + 1}`, ...datos });
    return { ok: true, id: `p${h.guardados.length}` };
  },
  editarProveedor: async () => {
    h.llamadas.editar++;
    return { ok: true };
  },
}));

const { importarProveedores } = await import("./proveedores-excel.service");

const sesion = { companyId: "c1", userId: "u1" } as unknown as SesionActiva;

/// Un libro con las filas que se le pasen, en el formato de la plantilla.
async function libroCon(filas: { ruc: string; razon: string }[]): Promise<File> {
  const libro = new ExcelJS.Workbook();
  const hoja = libro.addWorksheet("Proveedores");
  CAMPOS_EXCEL.forEach((c, i) => {
    hoja.getRow(FILA_CABECERA).getCell(i + 1).value = c.titulo;
  });
  filas.forEach((f, i) => {
    const fila = hoja.getRow(FILA_CABECERA + 1 + i);
    CAMPOS_EXCEL.forEach((c, j) => {
      const v =
        c.clave === "ruc" ? f.ruc : c.clave === "razonSocial" ? f.razon : "";
      if (v) fila.getCell(j + 1).value = v;
    });
  });
  const buffer = await libro.xlsx.writeBuffer();
  return new File([buffer as ArrayBuffer], "proveedores.xlsx");
}

describe("importarProveedores", () => {
  beforeEach(() => {
    h.guardados = [];
    h.llamadas = { findMany: 0, findFirst: 0, crear: 0, editar: 0 };
  });

  it("los que ya estaban se piden en UNA consulta, no una por fila", async () => {
    const archivo = await libroCon([
      { ruc: "20100000001", razon: "CONCRETERA UNO SAC" },
      { ruc: "20100000002", razon: "FIERROS DOS SAC" },
      { ruc: "20100000003", razon: "ENCOFRADOS TRES SAC" },
    ]);

    const r = await importarProveedores(sesion, archivo);

    expect(r.ok).toBe(true);
    if (r.ok) expect(r.resumen.creados).toBe(3);
    expect(h.llamadas.findMany).toBe(1);
  });

  /**
   * EL CASO QUE EL CAMBIO PODIA ROMPER.
   *
   * Con un `findFirst` por fila esto funcionaba solo: la segunda vuelta veia
   * al proveedor recien creado. Con un mapa cargado antes del bucle hay que
   * meterlo a mano, y si no se hace la segunda fila intenta crear un RUC que
   * ya existe y la importacion devuelve un rechazo que no deberia existir.
   */
  it("dos filas con el mismo RUC: la segunda completa, no vuelve a crear", async () => {
    const archivo = await libroCon([
      { ruc: "20100000001", razon: "CONCRETERA UNO SAC" },
      { ruc: "20100000001", razon: "CONCRETERA UNO SAC" },
    ]);

    const r = await importarProveedores(sesion, archivo);

    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.resumen.creados).toBe(1);
    expect(r.resumen.rechazos).toEqual([]);
    expect(h.llamadas.crear).toBe(1);
    expect(h.guardados).toHaveLength(1);
  });

  it("un RUC que ya estaba en la base no se crea otra vez", async () => {
    h.guardados.push({
      id: "p0", ruc: "20100000009", razonSocial: "YA ESTABA SAC",
      contactoNombre: null, contactoTelefono: null, email: null, banco: null,
      tipoCuenta: null, monedaCuenta: null, cuentaBancaria: null, cci: null,
      cuentaDetraccion: null, rol: "PROVEEDOR", tipoImpuesto: "IGV",
    });

    const archivo = await libroCon([
      { ruc: "20100000009", razon: "YA ESTABA SAC" },
    ]);

    const r = await importarProveedores(sesion, archivo);

    expect(r.ok).toBe(true);
    expect(h.llamadas.crear).toBe(0);
  });
});
