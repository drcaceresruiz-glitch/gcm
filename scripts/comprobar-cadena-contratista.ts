/**
 * La cadena entera, contra la base LOCAL: cotizacion -> costo real -> contractual.
 *
 *   npx tsx --require ./scripts/stub-server-only.cjs scripts/comprobar-cadena-contratista.ts
 *
 * Comprueba que lo que cobra el contratista se reparte entre las partidas, que
 * el presupuesto real queda con ese costo, y que el contractual se genera
 * ENCIMA de el —no encima del precio de cotizacion—, que es el orden que pide
 * el negocio: primero se sabe lo que cuesta, y solo despues lo que se cobra.
 *
 * Borra la obra al terminar, pase lo que pase.
 */
import ExcelJS from "exceljs";

import { prisma } from "@/lib/prisma";
import { permisosDe } from "@/lib/rbac";
import { crearObra, eliminarObra } from "@/services/obras.service";
import { aplicarImportacion } from "@/services/importacion.service";
import { analizarExcel } from "@/lib/excel-presupuesto";
import { generarEdtDesdePresupuesto } from "@/services/edt.service";
import { sumarHojas } from "@/lib/jerarquia-partidas";
import { previsualizarContractual } from "@/services/contractual.service";
import { cargarMetaDesdeExcel } from "@/services/meta-desde-excel";
import { fijarAjusteDelContratista } from "@/services/meta-edicion.service";

let ok = 0;
let mal = 0;
function comprobar(que: string, real: unknown, esperado: unknown) {
  const bien = String(real) === String(esperado);
  console.log(`  ${bien ? "OK  " : "MAL "} ${que.padEnd(54)} ${String(real)}${bien ? "" : `   (esperado ${String(esperado)})`}`);
  if (bien) ok++;
  else mal++;
}

/** Un Excel como el que sale de vaciar la cotizacion de un contratista. */
async function cotizacion(): Promise<ArrayBuffer> {
  const libro = new ExcelJS.Workbook();
  const h = libro.addWorksheet("Costo Directo");
  h.addRow([
    "Ítem", "Descripción", "Und.", "Metrado", "Precio Unitario", "Parcial",
    "% Dcto", "% GG", "% Utilidad", "% Recargo",
  ]);
  const filas: (string | number | null)[][] = [
    // Un capitulo con un solo contratista: 5% de descuento, 8% de gastos
    // generales, 10% de utilidad. Y un 20% de recargo al cliente.
    ["8", "INSTALACIONES ELECTRICAS", null, null, null, null, 5, 8, 10, 20],
    ["8.01", "Salidas de luz", "und", 100, 100, 10000, null, null, null, null],
    ["8.02", "Tomacorrientes", "und", 60, 100, 6000, null, null, null, null],
    ["8.03", "Tableros", "und", 4, 1000, 4000, null, null, null, null],
    // Y otro sin contratista: entra tal cual, con su propio recargo.
    ["9", "LIMPIEZA", null, null, null, null, null, null, null, 15],
    ["9.01", "Limpieza final", "glb", 1, 2000, 2000, null, null, null, null],
  ];
  for (const f of filas) h.addRow(f);
  return (await libro.xlsx.writeBuffer()) as ArrayBuffer;
}

async function main() {
  const empresa = await prisma.company.findFirstOrThrow({ select: { id: true, razonSocial: true } });
  const usuarios = await prisma.user.findMany({
    where: { companyId: empresa.id },
    select: { id: true, email: true, role: true },
  });
  const usuario = usuarios.find((u) => permisosDe(u.role).includes("obra:crear"));
  if (!usuario) throw new Error("ningun usuario puede crear obras");

  const sesion = {
    sesionId: "comprobacion-cadena",
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
  try {
    const creada = await crearObra(sesion, {
      nombreObra: "COMPROBACION CADENA CONTRATISTA - borrar",
      codigoObra: `CDN-${Date.now().toString().slice(-6)}`,
      fechaInicio: "2026-09-01",
      fechaFinProgramada: "2027-03-01",
    });
    if (!creada.ok) throw new Error(creada.error);
    obraId = creada.id;

    console.log("== LA COTIZACION SE CARGA");
    const analisis = await analizarExcel(await cotizacion());
    comprobar("errores", analisis.errores.length, 0);
    comprobar("bloques con ajuste de contratista", analisis.bloquesAjustados, 1);
    // 20.000 x 0,95 x 1,18 = 22.420   +   2.000 sin ajuste
    comprobar("costo real del presupuesto", analisis.montoTotal, "24420.00");

    const aplicado = await aplicarImportacion(sesion, obraId, analisis.filas, false);
    comprobar("se guardo", aplicado.ok, true);
    if (!aplicado.ok) throw new Error(aplicado.error);

    console.log("\n== EL PRESUPUESTO REAL GUARDADO");
    const partidas = await prisma.wbsItem.findMany({
      where: { projectId: obraId },
      select: { codigoPartida: true, tipo: true, modalidad: true, parcial: true },
    });
    const por = new Map(partidas.map((p) => [p.codigoPartida, p]));
    comprobar("8.01 lleva su parte del ajuste", Number(por.get("8.01")?.parcial).toFixed(2), "11210.00");
    comprobar("9.01 no lo lleva, no tiene contratista", Number(por.get("9.01")?.parcial).toFixed(2), "2000.00");
    comprobar(
      "costo directo",
      sumarHojas(
        partidas.map((p) => ({
          codigo: p.codigoPartida,
          parcial: p.tipo === "PARTIDA" ? (p.parcial?.toString() ?? null) : null,
        })),
      ),
      "24420.00",
    );

    console.log("\n== EL CONTRACTUAL SE GENERA ENCIMA DE ESE COSTO");
    /*
     * Antes, la META: es de donde sale el contractual.
     *
     * El presupuesto real y la meta se cargan por caminos distintos y los dos
     * pasan por `analizarExcel`, asi que el ajuste del contratista tiene que
     * aplicarse en los dos. El de la meta es el que acaba en el papel que
     * firma el cliente.
     */
    const meta = await cargarMetaDesdeExcel(sesion, obraId, {
      archivo: new File([await cotizacion()], "cotizacion.xlsx"),
      modo: "PARTIDA",
      mesesPlazo: "6",
      fechaMeta: "2026-09-01",
    });
    comprobar("la meta se cargo", meta.ok, true);
    if (!meta.ok) console.log("       motivo:", meta.error);

    const itemsMeta = await prisma.presupuestoMetaItem.findMany({
      where: { meta: { projectId: obraId } },
      select: { id: true, codigoRef: true, parcial: true },
    });
    const m = new Map(itemsMeta.map((i) => [i.codigoRef, i]));
    comprobar(
      "8.01 en la meta lleva el ajuste del contratista",
      Number(m.get("8.01")?.parcial).toFixed(2),
      "11210.00",
    );

    const previa = await previsualizarContractual(sesion, obraId);
    comprobar("la vista previa responde", previa.ok, true);
    if (!previa.ok) console.log("       motivo:", previa.error);
    if (previa.ok) {
      const lineas = previa.previa.resultado.lineas;
      const c = new Map(lineas.map((l) => [l.codigo, l]));
      // 11.210 x 1,20 = 13.452  ->  el recargo va SOBRE el costo real
      comprobar("8.01 con el 20% de recargo", c.get("8.01")?.parcial, "13452.00");
      // 2.000 x 1,15 = 2.300
      comprobar("9.01 con el 15% de recargo", c.get("9.01")?.parcial, "2300.00");
      // 22.420 x 1,20 + 2.000 x 1,15 = 26.904 + 2.300
      const total = lineas
        .filter((l) => l.parcial !== null)
        .reduce((s, l) => s + Number(l.parcial), 0);
      comprobar("total del contractual", total.toFixed(2), "29204.00");

      console.log("\n  la cadena completa:");
      console.log("    suma de sus partidas ........... 20,000.00");
      console.log("    total de su cotizacion ......... 22,420.00   (-5% +8% +10%)");
      console.log("      = lo que se le paga");
      console.log("    lo que se le cobra al cliente .. 26,904.00   (+20%)");
    }

    console.log("\n== Y SE PUEDE CAMBIAR DESDE LA PANTALLA");
    const capitulo = itemsMeta.find((i) => i.codigoRef === "8");
    if (capitulo) {
      const cambio = await fijarAjusteDelContratista(sesion, obraId, capitulo.id, {
        descuento: "10",
        gastosGenerales: "8",
        utilidad: "10",
      });
      comprobar("el cambio se guardo", cambio.ok, true);
      if (!cambio.ok) console.log("       motivo:", cambio.error);

      const tras = await prisma.presupuestoMetaItem.findMany({
        where: { meta: { projectId: obraId } },
        select: { codigoRef: true, parcial: true, parcialCotizado: true },
      });
      const t = new Map(tras.map((i) => [i.codigoRef, i]));
      // 10.000 x 0,90 x 1,18 = 10.620 -> se recalcula DESDE LA COTIZACION,
      // no encadenando el factor nuevo sobre el importe ya ajustado.
      comprobar("8.01 se recalculo desde la cotizacion", Number(t.get("8.01")?.parcial).toFixed(2), "10620.00");
      comprobar("y conserva el precio del papel", Number(t.get("8.01")?.parcialCotizado).toFixed(2), "10000.00");

      const quitado = await fijarAjusteDelContratista(sesion, obraId, capitulo.id, {
        descuento: "",
        gastosGenerales: "",
        utilidad: "",
      });
      comprobar("se puede quitar", quitado.ok, true);
      const limpias = await prisma.presupuestoMetaItem.findMany({
        where: { meta: { projectId: obraId } },
        select: { codigoRef: true, parcial: true, parcialCotizado: true },
      });
      const l = new Map(limpias.map((i) => [i.codigoRef, i]));
      comprobar("8.01 vuelve a la cotizacion", Number(l.get("8.01")?.parcial).toFixed(2), "10000.00");
      comprobar("y se retira el precio guardado", l.get("8.01")?.parcialCotizado, null);

      const enPartida = await fijarAjusteDelContratista(sesion, obraId, m.get("8.01")!.id, {
        descuento: "5",
        gastosGenerales: "",
        utilidad: "",
      });
      comprobar("en una PARTIDA se rechaza", enPartida.ok, false);

      const fuera = await fijarAjusteDelContratista(sesion, obraId, capitulo.id, {
        descuento: "150",
        gastosGenerales: "",
        utilidad: "",
      });
      comprobar("un descuento del 150% se rechaza", fuera.ok, false);
    }

    console.log("\n== Y LA EDT NO SE ENTERA DE NADA");
    const edt = await generarEdtDesdePresupuesto(sesion, obraId);
    comprobar("la EDT se genera", edt.ok, true);
    if (edt.ok) {
      const tareas = await prisma.tareaCronograma.findMany({
        where: { cronograma: { projectId: obraId } },
        select: { codigo: true, esResumen: true },
      });
      // Dos capitulos + cuatro partidas. Ni una tarea de descuento ni de
      // gastos generales: no son trabajo, son precio.
      comprobar("tareas creadas", tareas.length, 6);
      comprobar(
        "ninguna tarea de descuento o gastos generales",
        tareas.filter((t) => /dcto|descuento|gasto|utilidad/i.test(t.codigo ?? "")).length,
        0,
      );
      const hojas = tareas.filter((t) => !t.esResumen);
      comprobar(
        "el dinero de las hojas es el costo real",
        sumarHojas(
          hojas.map((t) => ({
            codigo: t.codigo ?? "",
            parcial: por.get(t.codigo ?? "")?.parcial?.toString() ?? null,
          })),
        ),
        "24420.00",
      );
    }
  } finally {
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
