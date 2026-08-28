/**
 * Abre la pantalla de la meta con una cotizacion cargada y comprueba que el
 * boton del contratista SE VE.
 *
 *   npm run dev
 *   npx tsx --require ./scripts/stub-server-only.cjs scripts/ver-ajuste-en-pantalla.ts
 *
 * Un cambio que consiste en ENSENAR algo pasa la bateria entera estando mal.
 * Crea la obra, la abre con sesion, mira, y lo borra todo.
 */
import { createHash, randomBytes } from "node:crypto";
import ExcelJS from "exceljs";

import { prisma } from "@/lib/prisma";
import { permisosDe } from "@/lib/rbac";
import { crearObra, eliminarObra } from "@/services/obras.service";
import { cargarMetaDesdeExcel } from "@/services/meta-desde-excel";

const BASE = "http://localhost:3000";

let ok = 0;
let mal = 0;
function comprobar(que: string, real: unknown, esperado: unknown) {
  const bien = String(real) === String(esperado);
  console.log(`  ${bien ? "OK  " : "MAL "} ${que.padEnd(50)} ${String(real)}`);
  if (bien) ok++;
  else mal++;
}

async function cotizacion(): Promise<ArrayBuffer> {
  const libro = new ExcelJS.Workbook();
  const h = libro.addWorksheet("Costo Directo");
  h.addRow([
    "Ítem", "Descripción", "Und.", "Metrado", "Precio Unitario", "Parcial",
    "% Dcto", "% GG", "% Utilidad", "% Recargo",
  ]);
  for (const f of [
    ["8", "INSTALACIONES ELECTRICAS", null, null, null, null, 5, 8, 10, 20],
    ["8.01", "Salidas de luz", "und", 100, 100, 10000, null, null, null, null],
    ["8.02", "Tomacorrientes", "und", 60, 100, 6000, null, null, null, null],
    ["8.03", "Tableros", "und", 4, 1000, 4000, null, null, null, null],
  ] as (string | number | null)[][]) {
    h.addRow(f);
  }
  return (await libro.xlsx.writeBuffer()) as ArrayBuffer;
}

async function main() {
  const empresa = await prisma.company.findFirstOrThrow({ select: { id: true, razonSocial: true } });
  const usuarios = await prisma.user.findMany({
    where: { companyId: empresa.id, estado: "ACTIVO" },
    select: { id: true, email: true, role: true },
  });
  const usuario = usuarios.find((u) => permisosDe(u.role).includes("obra:crear"));
  if (!usuario) throw new Error("ningun usuario puede crear obras");

  const sesion = {
    sesionId: "ver-ajuste",
    userId: usuario.id,
    companyId: empresa.id,
    role: usuario.role,
    permisos: permisosDe(usuario.role),
    obrasAsignadas: null,
    esOperador: true,
    debeCambiarClave: false,
    email: usuario.email,
    nombre: "Comprobacion",
    empresa: empresa.razonSocial,
  } as unknown as Parameters<typeof crearObra>[0];

  let obraId: string | null = null;
  let sesionId: string | null = null;
  try {
    const creada = await crearObra(sesion, {
      nombreObra: "VER AJUSTE EN PANTALLA - borrar",
      codigoObra: `VER-${Date.now().toString().slice(-6)}`,
      fechaInicio: "2026-09-01",
      fechaFinProgramada: "2027-03-01",
    });
    if (!creada.ok) throw new Error(creada.error);
    obraId = creada.id;

    const meta = await cargarMetaDesdeExcel(sesion, obraId, {
      archivo: new File([await cotizacion()], "cotizacion.xlsx"),
      modo: "PARTIDA",
      mesesPlazo: "6",
      fechaMeta: "2026-09-01",
    });
    if (!meta.ok) throw new Error(meta.error);

    const token = randomBytes(32).toString("base64url");
    const s = await prisma.session.create({
      data: {
        userId: usuario.id,
        tokenHash: createHash("sha256").update(token).digest("hex"),
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      },
      select: { id: true },
    });
    sesionId = s.id;

    const r = await fetch(`${BASE}/obras/${obraId}/meta`, {
      headers: { cookie: `gcm_sesion=${token}` },
      redirect: "manual",
    });
    comprobar("la pantalla de la meta responde", r.status, 200);
    const html = r.status === 200 ? await r.text() : "";
    const texto = html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

    /*
     * EN EL HTML CRUDO, no en el texto: `aria-label` y `title` son ATRIBUTOS,
     * y quitar las etiquetas se los lleva por delante. Buscar el rotulo de un
     * boton en el texto visible da siempre que falta, aunque este ahi.
     */
    comprobar(
      "el botón del contratista está en el capítulo",
      html.includes("Lo que cobra el contratista de INSTALACIONES ELECTRICAS"),
      true,
    );
    comprobar("y la tabla deja editar (sale el lápiz)", html.includes("Corregir"), true);
    comprobar("el capítulo enseña su costo real (22,420.00)", texto.includes("22,420.00"), true);
    comprobar("y la partida su importe repartido (11,210.00)", texto.includes("11,210.00"), true);
  } finally {
    if (sesionId) await prisma.session.delete({ where: { id: sesionId } }).catch(() => {});
    if (obraId) {
      const b = await eliminarObra(sesion, obraId);
      console.log(`\nobra de prueba borrada: ${b.ok ? "si" : "NO"}`);
    }
    await prisma.$disconnect();
  }

  console.log(`\nRESULTADO: ${ok} bien, ${mal} mal`);
  process.exit(mal === 0 ? 0 : 1);
}

main();
