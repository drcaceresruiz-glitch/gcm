import "dotenv/config";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { PrismaClient } from "../src/generated/prisma/client";

/**
 * Que hay hoy de proveedores y ordenes.
 *
 * Utilidad de diagnostico, como las de Excel: sirve para responder "en que
 * estado quedo esto" sin abrir Prisma Studio ni escribir SQL a mano.
 *
 *   npx tsx scripts/ver-ordenes.ts
 */
const prisma = new PrismaClient({
  adapter: new PrismaMariaDb(process.env["DATABASE_URL"] ?? ""),
});

async function main() {
  const proveedores = await prisma.proveedor.findMany({
    select: {
      razonSocial: true,
      ruc: true,
      activo: true,
      _count: { select: { ordenes: true } },
    },
    orderBy: { razonSocial: "asc" },
  });

  console.log(`\nPROVEEDORES (${proveedores.length})`);
  for (const p of proveedores) {
    const estado = p.activo ? "activo" : "DESACTIVADO";
    console.log(
      `  ${p.ruc}  ${p.razonSocial}  [${estado}, ${p._count.ordenes} ordenes]`,
    );
  }

  const ordenes = await prisma.ordenCompra.findMany({
    select: {
      numero: true,
      estado: true,
      descripcion: true,
      neto: true,
      total: true,
      proveedor: { select: { razonSocial: true } },
      _count: { select: { lineas: true, imputaciones: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  console.log(`\nORDENES (${ordenes.length})`);
  for (const o of ordenes) {
    console.log(
      `  ${o.numero}  ${o.estado}  neto ${o.neto} / total ${o.total}` +
        `  [${o._count.lineas} lineas, ${o._count.imputaciones} imputaciones]` +
        `  ${o.proveedor.razonSocial} - ${o.descripcion}`,
    );
  }

  console.log("");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
