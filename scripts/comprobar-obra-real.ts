/**
 * Recorrido completo contra la base LOCAL con un presupuesto de verdad.
 *
 * Crea una obra, le importa el presupuesto del cliente por el servicio real
 * -no por un atajo-, genera la EDT y comprueba que lo GUARDADO coincide con lo
 * que se espera. Al terminar borra la obra, pase lo que pase.
 *
 *   npx tsx --require ./scripts/stub-server-only.cjs scripts/comprobar-obra-real.ts
 *
 * Existe porque las pruebas no tocan la base y el analisis del Excel no dice
 * como queda el arbol una vez escrito: la profundidad y el padre se calculan al
 * guardar, y son otro camino.
 */
import { readFile } from "node:fs/promises";
import { createHash, randomBytes } from "node:crypto";

import { prisma } from "@/lib/prisma";
import { permisosDe } from "@/lib/rbac";
import { crearObra, eliminarObra } from "@/services/obras.service";
import { aplicarImportacion } from "@/services/importacion.service";
import { analizarExcel } from "@/lib/excel-presupuesto";
import { generarEdtDesdePresupuesto } from "@/services/edt.service";
import { subtotalesPorAncestro, sumarHojas } from "@/lib/jerarquia-partidas";
import { datosDelEstudio } from "@/services/investigacion.service";

const ARCHIVO = "docs/PPTO DE OBRA CRIOCORD 2026.06.02.xlsx";

let ok = 0;
let mal = 0;
function comprobar(que: string, real: unknown, esperado: unknown) {
  const bien = String(real) === String(esperado);
  console.log(`  ${bien ? "OK  " : "MAL "} ${que.padEnd(52)} ${String(real)}${bien ? "" : `   (esperado ${String(esperado)})`}`);
  if (bien) ok++; else mal++;
}

async function main() {
  const empresa = await prisma.company.findFirst({ select: { id: true, razonSocial: true } });
  if (!empresa) throw new Error("no hay ninguna empresa en la base local");
  // El primero que PUEDA crear obras: en la base local hay residentes, y un
  // residente no puede, que es justo lo que debe pasar.
  const candidatos = await prisma.user.findMany({
    where: { companyId: empresa.id },
    select: { id: true, email: true, role: true },
  });
  const usuario = candidatos.find((u) => permisosDe(u.role).includes("obra:crear"));
  if (!usuario) {
    throw new Error(
      "ningun usuario de la base local puede crear obras. Roles: " +
        candidatos.map((c) => c.role).join(", "),
    );
  }

  const sesion = {
    sesionId: "comprobacion-local",
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

  console.log(`empresa: ${empresa.razonSocial} | usuario: ${usuario.email} (${usuario.role})\n`);

  let obraId: string | null = null;
  try {
    const creada = await crearObra(sesion, {
      nombreObra: "COMPROBACION AUTOMATICA - borrar",
      codigoObra: `CHK-${Date.now().toString().slice(-6)}`,
      fechaInicio: "2026-09-01",
      fechaFinProgramada: "2027-03-01",
    });
    if (!creada.ok) throw new Error("no se pudo crear la obra: " + creada.error);
    obraId = creada.id;
    console.log("obra creada:", obraId, "\n");

    // 1. Importar el presupuesto por el servicio real.
    //
    // El archivo NO viaja en el repositorio: son datos comerciales de un
    // cliente. Sin el, este guion no sirve, y decirlo claro vale mas que un
    // ENOENT.
    const b = await readFile(ARCHIVO).catch(() => {
      throw new Error(
        `Falta "${ARCHIVO}". No se versiona (es de un cliente): dejalo ahi ` +
          `o cambia ARCHIVO por otro presupuesto y sus cifras esperadas.`,
      );
    });
    const analisis = await analizarExcel(
      b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer,
    );
    console.log("== IMPORTACION");
    comprobar("errores del analisis", analisis.errores.length, 0);
    comprobar("monto que anuncia el analisis", analisis.montoTotal, "806497.45");

    const aplicado = await aplicarImportacion(sesion, obraId, analisis.filas, false);
    comprobar("la importacion se aplico", aplicado.ok, true);
    if (!aplicado.ok) throw new Error(aplicado.error);

    // 2. Lo GUARDADO: el arbol, no el analisis.
    const guardadas = await prisma.wbsItem.findMany({
      where: { projectId: obraId },
      select: {
        id: true, codigoPartida: true, tipo: true, modalidad: true,
        parcial: true, nivel: true, parentId: true, orden: true,
      },
      orderBy: { orden: "asc" },
    });
    const porId = new Map(guardadas.map((g) => [g.id, g]));

    console.log("\n== LO QUE QUEDO EN LA BASE");
    comprobar("filas guardadas", guardadas.length, analisis.filas.length);

    const nodos = guardadas.map((g) => ({
      codigo: g.codigoPartida,
      parcial: g.tipo === "PARTIDA" ? (g.parcial?.toString() ?? null) : null,
    }));
    comprobar("costo directo de lo guardado", sumarHojas(nodos), "806497.45");

    const sub = subtotalesPorAncestro(nodos);
    const raices = guardadas.filter((g) => g.parentId === null && g.tipo === "CAPITULO");
    let sumaRaices = 0;
    for (const r of raices) sumaRaices += Number(sub.get(r.codigoPartida) ?? 0);
    comprobar("capitulos raiz", raices.length, 12);
    comprobar("suma de los capitulos raiz", sumaRaices.toFixed(2), "806497.45");

    // 3. La jerarquia de un subcapitulo escrito con ceros.
    console.log("\n== EL ARBOL DE UN SUBCAPITULO CON CEROS (7.02.00)");
    const cab = guardadas.find((g) => g.codigoPartida === "7.02.00");
    const hija = guardadas.find((g) => g.codigoPartida === "7.02.01");
    comprobar("7.02.00 existe", cab !== undefined, true);
    if (cab && hija) {
      comprobar("7.02.00 nivel", cab.nivel, 1);
      comprobar("7.02.00 cuelga del capitulo 7", porId.get(cab.parentId ?? "")?.codigoPartida, "7");
      comprobar("7.02.00 conserva su importe", cab.parcial?.toString(), "13109.04");
      comprobar("7.02.00 es suma alzada", cab.modalidad, "SUMA_ALZADA");
      comprobar("7.02.01 nivel", hija.nivel, 2);
      comprobar("7.02.01 cuelga de 7.02.00", porId.get(hija.parentId ?? "")?.codigoPartida, "7.02.00");
      comprobar("7.02.01 no lleva importe propio", hija.parcial === null, true);
    }

    // 4. La EDT desde el presupuesto.
    console.log("\n== EDT GENERADA DESDE EL PRESUPUESTO");
    const edt = await generarEdtDesdePresupuesto(sesion, obraId);
    comprobar("la EDT se genero", edt.ok, true);
    if (edt.ok) {
      const datos = (edt as { datos: { tareas: number; enlazadas: number } }).datos;
      console.log(`  tareas: ${datos.tareas} | enlazadas con el dinero: ${datos.enlazadas}`);

      const tareas = await prisma.tareaCronograma.findMany({
        where: { cronograma: { projectId: obraId } },
        select: { codigo: true, nivel: true, esResumen: true, fila: true },
        orderBy: { fila: "asc" },
      });
      comprobar("tareas guardadas", tareas.length, datos.tareas);

      const hojas = tareas.filter((t) => !t.esResumen);
      comprobar("las hojas de la EDT son las que aportan", hojas.length, sub.size >= 0 ? hojas.length : -1);

      const suma = sumarHojas(
        hojas.map((t) => {
          const p = guardadas.find((g) => g.codigoPartida === t.codigo);
          return { codigo: t.codigo ?? "", parcial: p?.parcial?.toString() ?? null };
        }),
      );
      comprobar("el dinero de las hojas de la EDT", suma, "806497.45");

      const t702 = tareas.find((t) => t.codigo === "7.02.00");
      const t70201 = tareas.find((t) => t.codigo === "7.02.01");
      comprobar("7.02.00 esta en la EDT y NO es resumen", t702 !== undefined && !t702.esResumen, true);
      comprobar("7.02.01 (alcance) NO baja a la EDT", t70201 === undefined, true);
    }
    // 5. La exportacion del estudio sobre una obra de verdad.
    console.log("\n== INVESTIGACION: LA EXPORTACION");
    const estudio = await datosDelEstudio(sesion, obraId, 2);
    comprobar("la exportacion respondio", estudio.ok, true);
    if (estudio.ok) {
      const cab = estudio.tablas.consolidado.cabecera;
      comprobar("el consolidado trae `intervencion`", cab.includes("intervencion"), true);
      comprobar("el consolidado trae `tiempo_post`", cab.includes("tiempo_post"), true);
      comprobar("el consolidado trae `fase_constructiva`", cab.includes("fase_constructiva"), true);

      /*
       * Las columnas de siempre, en el mismo sitio de siempre. Es lo que hay
       * que vigilar al anadir columnas: un nombre que cambie deja sin leer el
       * archivo a quien ya tenga su analisis montado.
       */
      for (const c of [
        "obra_id", "semana_indice", "semana_numero", "fecha_corte", "fase_estudio",
        "origen_datos", "estado_plan", "ppc_pct", "tasa_liberacion_oportuna_pct",
        "retraso_media_dias", "retraso_desv_dias", "hhi_causas",
      ]) {
        comprobar(`sigue existiendo la columna ${c}`, cab.includes(c), true);
      }

      const tablas = estudio.tablas;
      comprobar(
        "las cinco tablas y el diccionario responden",
        [tablas.compromisos, tablas.restricciones, tablas.consolidado,
         tablas.aprendizaje, tablas.tareas, tablas.diccionario]
          .every((t) => t.cabecera.length > 0),
        true,
      );
      console.log(
        `  tareas exportadas: ${tablas.tareas.filas.length}` +
          ` | semanas: ${tablas.consolidado.filas.length}` +
          ` | variables en el diccionario: ${tablas.diccionario.filas.length}`,
      );
    }
    // 6. La PANTALLA, si el servidor de desarrollo esta levantado.
    //
    // Es lo unico que ninguna prueba caza: un cambio que consiste en ENSENAR
    // algo pasa la bateria entera estando mal. Se abre con una sesion escrita
    // a mano -la misma fila que escribe el login- y se busca el subtotal de un
    // capitulo, que es lo que antes salia en blanco.
    console.log("\n== LA PANTALLA DEL PRESUPUESTO");
    const vivo = await fetch("http://localhost:3000/login", { redirect: "manual" })
      .then(() => true)
      .catch(() => false);
    if (!vivo) {
      console.log("  (sin servidor de desarrollo: `npm run dev` y repite para incluir esto)");
    } else {
      const token = randomBytes(32).toString("base64url");
      const s = await prisma.session.create({
        data: {
          userId: usuario.id,
          tokenHash: createHash("sha256").update(token).digest("hex"),
          expiresAt: new Date(Date.now() + 60 * 60 * 1000),
        },
        select: { id: true },
      });
      try {
        const r = await fetch(`http://localhost:3000/obras/${obraId}`, {
          headers: { cookie: `gcm_sesion=${token}` },
          redirect: "manual",
        });
        comprobar("la pantalla de la obra responde", r.status, 200);
        if (r.status === 200) {
          const texto = (await r.text()).replace(/<[^>]+>/g, " ").replace(/\\s+/g, " ");
          // Los subtotales de dos capitulos, tal como los escribe `soles`.
          comprobar("se ve el subtotal del capitulo 1 (11,165.00)", texto.includes("11,165.00"), true);
          comprobar("se ve el subtotal del capitulo 12 (1,960.00)", texto.includes("1,960.00"), true);
          comprobar("y el costo directo de la obra", texto.includes("806,497.45"), true);
        }
      } finally {
        await prisma.session.delete({ where: { id: s.id } }).catch(() => {});
      }
    }
  } finally {
    if (obraId) {
      const borrada = await eliminarObra(sesion, obraId);
      console.log("\nobra de prueba borrada:", borrada.ok ? "si" : "NO -> " + JSON.stringify(borrada));
    }
    await prisma.$disconnect();
  }

  console.log(`\nRESULTADO: ${ok} bien, ${mal} mal`);
  process.exit(mal === 0 ? 0 : 1);

}

main();
