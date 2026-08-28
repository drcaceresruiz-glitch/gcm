/**
 * Comprueba, contra la base LOCAL, que conceder «obra:crear» al rol RESIDENTE
 * desde la pantalla de permisos basta para que un residente cree obras.
 *
 *   npx tsx --require ./scripts/stub-server-only.cjs scripts/comprobar-permiso-residente.ts
 *
 * Existe porque la respuesta «eso ya se puede, concedelo en Empresa ->
 * Permisos» hay que poder darla habiendolo visto funcionar, no leyendo la
 * matriz. Deja la matriz como estaba, pase lo que pase.
 */
import { prisma } from "@/lib/prisma";
import { permisosDe, resolverPermisos } from "@/lib/rbac";
import { guardarCambios } from "@/services/permisos.service";
import { crearObra, eliminarObra } from "@/services/obras.service";

let ok = 0;
let mal = 0;
function comprobar(que: string, real: unknown, esperado: unknown) {
  const bien = String(real) === String(esperado);
  console.log(`  ${bien ? "OK  " : "MAL "} ${que.padEnd(56)} ${String(real)}`);
  if (bien) ok++;
  else mal++;
}

/** La sesion que tendria esa persona al entrar, con la matriz que haya AHORA. */
async function sesionDe(userId: string) {
  const u = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: {
      id: true, email: true, role: true, companyId: true,
      company: { select: { razonSocial: true, permisos: true } },
    },
  });
  const excepciones = u.company.permisos.filter((p) => p.role === u.role);
  return {
    sesionId: "comprobacion-permisos",
    userId: u.id,
    companyId: u.companyId,
    role: u.role,
    // Igual que `obtenerSesion`: la plantilla del rol con las excepciones de
    // su empresa aplicadas encima.
    permisos: resolverPermisos(u.role, excepciones),
    obrasAsignadas: null,
    esOperador: false,
    debeCambiarClave: false,
    email: u.email,
    nombre: "Comprobacion",
    empresa: u.company.razonSocial,
  } as unknown as Parameters<typeof crearObra>[0];
}

async function main() {
  const empresa = await prisma.company.findFirstOrThrow({
    select: { id: true, razonSocial: true },
  });
  const usuarios = await prisma.user.findMany({
    where: { companyId: empresa.id },
    select: { id: true, email: true, role: true },
  });

  const residente = usuarios.find((u) => u.role === "RESIDENTE");
  const admin = usuarios.find((u) => permisosDe(u.role).includes("permiso:editar"));
  if (!residente) throw new Error("no hay ningun RESIDENTE en la base local");
  if (!admin) throw new Error("no hay quien pueda editar permisos");

  console.log(`empresa: ${empresa.razonSocial}`);
  console.log(`residente: ${residente.email} | quien concede: ${admin.email}\n`);

  const sesionAdmin = await sesionDe(admin.id);
  let concedido = false;
  let obraId: string | null = null;

  try {
    console.log("== ANTES DE CONCEDER NADA");
    const antes = await sesionDe(residente.id);
    comprobar("el residente NO puede crear obras", antes.permisos.includes("obra:crear"), false);
    const intento = await crearObra(antes, {
      nombreObra: "NO DEBERIA CREARSE - borrar",
      fechaInicio: "2026-09-01",
      fechaFinProgramada: "2027-03-01",
    });
    comprobar("y el servicio lo rechaza", intento.ok, false);
    if (!intento.ok) console.log(`       motivo: ${intento.error}`);

    console.log("\n== EL ADMINISTRADOR LE CONCEDE «obra:crear»");
    const guardado = await guardarCambios(sesionAdmin, [
      { role: "RESIDENTE", permiso: "obra:crear", concedido: true },
    ]);
    comprobar("el cambio se guardo", guardado.ok, true);
    if (!guardado.ok) throw new Error(guardado.error);
    concedido = true;

    console.log("\n== EN SU SIGUIENTE PANTALLA");
    const despues = await sesionDe(residente.id);
    comprobar("ahora SI lo tiene", despues.permisos.includes("obra:crear"), true);

    const creada = await crearObra(despues, {
      nombreObra: "COMPROBACION PERMISO RESIDENTE - borrar",
      codigoObra: `PRM-${Date.now().toString().slice(-6)}`,
      fechaInicio: "2026-09-01",
      fechaFinProgramada: "2027-03-01",
    });
    comprobar("el residente crea la obra", creada.ok, true);
    if (creada.ok) obraId = creada.id;

    /*
     * Y lo que NO cambia: conceder crear obras no reparte nada mas. Es lo que
     * hay que poder afirmar antes de tocar la matriz de una empresa viva.
     */
    console.log("\n== LO QUE SIGUE SIN PODER");
    for (const p of [
      "linea_base:aprobar", "meta:aprobar", "movimiento:aprobar",
      "usuario:crear", "permiso:editar", "obra:eliminar",
    ]) {
      comprobar(`sigue sin ${p}`, despues.permisos.includes(p as never), false);
    }
  } finally {
    if (obraId) {
      const b = await eliminarObra(sesionAdmin, obraId);
      console.log(`\nobra de prueba borrada: ${b.ok ? "si" : "NO -> " + JSON.stringify(b)}`);
    }
    if (concedido) {
      // La matriz se deja EXACTAMENTE como estaba: `concedido: false` sobre un
      // permiso que la plantilla ya negaba borra la fila de excepcion.
      const vuelta = await guardarCambios(sesionAdmin, [
        { role: "RESIDENTE", permiso: "obra:crear", concedido: false },
      ]);
      const final = await sesionDe(residente.id);
      console.log(
        `matriz restaurada: ${vuelta.ok ? "si" : "NO"} | ` +
          `el residente vuelve a no poder crear: ${!final.permisos.includes("obra:crear")}`,
      );
    }
    await prisma.$disconnect();
  }

  console.log(`\nRESULTADO: ${ok} bien, ${mal} mal`);
  process.exit(mal === 0 ? 0 : 1);
}

main();
