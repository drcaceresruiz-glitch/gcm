import "dotenv/config";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { PrismaClient } from "../src/generated/prisma/client";
import type { Role } from "../src/generated/prisma/enums";

/**
 * Asigna a cada usuario las obras que ya venia viendo, ANTES de cerrar.
 *
 *   npx tsx scripts/sembrar-equipo-inicial.ts          (ensayo: no escribe)
 *   npx tsx scripts/sembrar-equipo-inicial.ts --si     (escribe)
 *
 * ---------------------------------------------------------------------------
 * ESTO NO CORRE EN EL SERVIDOR. Comprobado el 18/08/2026, fallando.
 *
 * El paquete de despliegue (`.github/workflows/desplegar.yml`) lleva
 * `.next/standalone`, los estaticos, `public` y `prisma`. NO lleva `scripts/`
 * ni `src/`, asi que ni el guion esta alli ni podria importar el cliente de
 * Prisma generado. Da `ERR_MODULE_NOT_FOUND`, se ejecute desde donde se
 * ejecute.
 *
 * EN PRODUCCION se hace por SQL, desde phpMyAdmin. Primero el ensayo:
 *
 *   SELECT COUNT(*) FROM users u
 *   JOIN projects p ON p.companyId = u.companyId
 *   WHERE u.role <> 'ADMIN' AND u.estado = 'ACTIVO'
 *     AND NOT EXISTS (SELECT 1 FROM project_memberships m
 *                     WHERE m.userId = u.id AND m.projectId = p.id);
 *
 * Y si el numero cuadra, el mismo criterio en un INSERT ... SELECT con
 * `UUID()` como id. Ver [[acceso-por-obra]] en la memoria.
 * ---------------------------------------------------------------------------
 *
 * Existe por el dia del cambio, y solo por ese dia.
 *
 * Hasta ahora `project_memberships` estaba vacia y no importaba: todo el
 * mundo veia todas las obras de su empresa. Desde que el alcance por obra
 * manda (`src/lib/alcance-obras.ts`), esa tabla vacia significa lo contrario
 * —nadie ve nada salvo el ADMIN—, y sin este guion el despliegue dejaria a
 * los residentes, administradores de obra, almaceneros y consultores mirando
 * un panel vacio.
 *
 * Lo que hace: a cada usuario ACTIVO cuyo rol NO ve todas las obras, le
 * asigna TODAS las obras de su empresa. Es decir, congela el acceso que ya
 * tenia. A partir de ahi el administrador quita desde la pantalla Equipo de
 * cada obra lo que no corresponda —que es el trabajo de decidirlo, y no lo
 * hace un guion—.
 *
 * SIN `--si` NO ESCRIBE NADA: enseña lo que haria y termina. Es a proposito,
 * porque esto puede apuntar a produccion cambiando `DATABASE_URL`.
 *
 * Es idempotente: usa `createMany` con `skipDuplicates` sobre la clave unica
 * (userId, projectId), asi que correrlo dos veces no duplica ni falla.
 */

const prisma = new PrismaClient({
  adapter: new PrismaMariaDb(process.env["DATABASE_URL"] ?? ""),
});

/**
 * Los roles que ven toda la cartera y por tanto NO necesitan fila.
 *
 * Se repite aqui en vez de importarse de `src/lib/alcance-obras` porque ese
 * modulo arrastra los tipos generados de Prisma por otra ruta y este guion
 * corre fuera del build de Next. Si algun dia cambia la lista de alla, esta
 * hay que mirarla: asignar de mas no rompe nada —la fila sobra—, pero no
 * asignar a quien lo necesita deja a alguien sin obras.
 */
const VE_TODAS: Role[] = ["ADMIN"];

async function main() {
  const escribir = process.argv.includes("--si");

  const usuarios = await prisma.user.findMany({
    where: { estado: "ACTIVO", role: { notIn: VE_TODAS } },
    select: { id: true, nombres: true, apellidos: true, role: true, companyId: true },
    orderBy: { companyId: "asc" },
  });

  if (usuarios.length === 0) {
    console.log("No hay usuarios que necesiten asignacion. Nada que hacer.");
    return;
  }

  const obras = await prisma.project.findMany({
    select: { id: true, companyId: true, nombreObra: true },
  });

  const obrasPorEmpresa = new Map<string, { id: string; nombreObra: string }[]>();
  for (const o of obras) {
    const lista = obrasPorEmpresa.get(o.companyId) ?? [];
    lista.push({ id: o.id, nombreObra: o.nombreObra });
    obrasPorEmpresa.set(o.companyId, lista);
  }

  // Lo que ya existe, para que el ensayo diga la verdad sobre cuanto falta.
  const existentes = await prisma.projectMembership.findMany({
    select: { userId: true, projectId: true },
  });
  const yaEsta = new Set(existentes.map((m) => `${m.userId}|${m.projectId}`));

  const filas: { userId: string; projectId: string; role: Role }[] = [];

  for (const u of usuarios) {
    const suyas = obrasPorEmpresa.get(u.companyId) ?? [];
    const faltan = suyas.filter((o) => !yaEsta.has(`${u.id}|${o.id}`));

    console.log(
      `${u.apellidos}, ${u.nombres} (${u.role}): ${faltan.length} de ${suyas.length} obras por asignar`,
    );

    for (const o of faltan) {
      filas.push({ userId: u.id, projectId: o.id, role: u.role });
    }
  }

  console.log(`\nTotal de filas a crear: ${filas.length}`);

  if (!escribir) {
    console.log("\nENSAYO: no se ha escrito nada. Repite con --si para aplicar.");
    return;
  }

  if (filas.length === 0) {
    console.log("Nada que crear.");
    return;
  }

  const { count } = await prisma.projectMembership.createMany({
    data: filas,
    skipDuplicates: true,
  });

  console.log(`Creadas ${count} asignaciones.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
