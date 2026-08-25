/**
 * Sonda del cronograma: crea obras con cronogramas DEGENERADOS en la base de
 * desarrollo, PIDE sus pantallas con una sesion real, y las borra.
 *
 * Uso, con el servidor de desarrollo levantado:
 *
 *     npm run dev
 *     npx tsx scripts/sonda-cronograma.ts
 *
 * POR QUE EXISTE. Nacio el 25/08/2026 persiguiendo el fallo `81572617`, que
 * revento una pantalla de cronograma el dia 24 y no se pudo reproducir. Aquel
 * dia se ejecutaron los SERVICIOS y las funciones puras de esa pantalla, y
 * todo pasaba; lo que nunca se hizo fue DIBUJARLA con datos raros. `humo.ts`
 * tampoco llega: abre cada ruta una vez con los datos que ya hay, y los datos
 * que ya hay son razonables.
 *
 * `81572617` sigue sin reproducirse —ninguno de estos casos lo saca—, pero la
 * sonda encontro otra cosa que si era real: con una tarea de 1900 a 9999 —un
 * año mal tecleado— el Gantt tardaba 10 s y el PDF del informe semanal 39 s,
 * con dos tareas dentro. El coste lo fijaba el PLAZO y no el tamaño del
 * cronograma. Acotado en `lib/gantt` y en `components/cronograma/Gantt`.
 *
 * ESCRIBE EN LA BASE Y BORRA LO QUE ESCRIBE. Solo contra la local: lo
 * comprueba antes de empezar. Si se interrumpe a media ejecucion pueden
 * quedar obras «SONDA - ...» sueltas, y se borran a mano.
 */
import "dotenv/config";
import { randomBytes, createHash } from "node:crypto";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { PrismaClient } from "../src/generated/prisma/client";

const prisma = new PrismaClient({ adapter: new PrismaMariaDb(process.env["DATABASE_URL"]!) });
const BASE = "http://localhost:3000";
const d = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

interface Tarea {
  uid: number;
  fila: number;
  nombre: string;
  nivel: number;
  inicio: Date;
  fin: Date;
  duracionDias: string;
  porcentajePlaneado?: string;
  porcentajeArchivo?: string;
  esHito?: boolean;
  esResumen?: boolean;
  sinProgramar?: boolean;
  codigo?: string;
}

interface Caso {
  nombre: string;
  obra: { inicio: Date; fin: Date; diaCorteSemanal?: number };
  cronograma: { fechaCorte: Date; minutosPorDia?: number; lineaBase?: boolean } | null;
  tareas: Tarea[];
}

const T = (p: Partial<Tarea> & { uid: number }): Tarea => ({
  fila: p.uid,
  nombre: `Tarea ${p.uid}`,
  nivel: 1,
  inicio: d("2026-01-05"),
  fin: d("2026-01-09"),
  duracionDias: "5.00",
  porcentajePlaneado: "0.00",
  porcentajeArchivo: "0.00",
  ...p,
});

const CASOS: Caso[] = [
  {
    nombre: "cronograma sin ni una tarea",
    obra: { inicio: d("2026-01-01"), fin: d("2026-12-31") },
    cronograma: { fechaCorte: d("2026-06-30") },
    tareas: [],
  },
  {
    nombre: "una sola tarea de duracion cero",
    obra: { inicio: d("2026-01-01"), fin: d("2026-12-31") },
    cronograma: { fechaCorte: d("2026-06-30") },
    tareas: [T({ uid: 1, inicio: d("2026-01-05"), fin: d("2026-01-05"), duracionDias: "0.00" })],
  },
  {
    nombre: "tarea con el fin ANTES del inicio",
    obra: { inicio: d("2026-01-01"), fin: d("2026-12-31") },
    cronograma: { fechaCorte: d("2026-06-30") },
    tareas: [T({ uid: 1, inicio: d("2026-03-10"), fin: d("2026-02-01"), duracionDias: "-37.00" })],
  },
  {
    nombre: "obra de un solo dia",
    obra: { inicio: d("2026-05-04"), fin: d("2026-05-04") },
    cronograma: { fechaCorte: d("2026-05-04") },
    tareas: [T({ uid: 1, inicio: d("2026-05-04"), fin: d("2026-05-04"), duracionDias: "1.00" })],
  },
  {
    nombre: "EDT recien generada, todo sin programar",
    obra: { inicio: d("2026-01-01"), fin: d("2026-12-31") },
    cronograma: { fechaCorte: d("2026-01-01") },
    tareas: [
      T({
        uid: 1,
        sinProgramar: true,
        inicio: d("2026-01-01"),
        fin: d("2026-01-01"),
        duracionDias: "0.00",
      }),
      T({
        uid: 2,
        sinProgramar: true,
        inicio: d("2026-01-01"),
        fin: d("2026-01-01"),
        duracionDias: "0.00",
        nivel: 2,
      }),
    ],
  },
  {
    nombre: "solo hitos, ninguno con duracion",
    obra: { inicio: d("2026-01-01"), fin: d("2026-12-31") },
    cronograma: { fechaCorte: d("2026-06-30") },
    tareas: [
      T({ uid: 1, esHito: true, inicio: d("2026-02-01"), fin: d("2026-02-01"), duracionDias: "0.00" }),
      T({ uid: 2, esHito: true, inicio: d("2026-09-01"), fin: d("2026-09-01"), duracionDias: "0.00" }),
    ],
  },
  {
    nombre: "solo resumenes, ninguna hoja",
    obra: { inicio: d("2026-01-01"), fin: d("2026-12-31") },
    cronograma: { fechaCorte: d("2026-06-30") },
    tareas: [T({ uid: 1, esResumen: true, nivel: 0 }), T({ uid: 2, esResumen: true, nivel: 1 })],
  },
  {
    nombre: "fechas extremas: ano 1900 y ano 9999",
    obra: { inicio: d("1900-01-01"), fin: d("9999-12-31") },
    cronograma: { fechaCorte: d("2026-06-30") },
    tareas: [T({ uid: 1, inicio: d("1900-01-01"), fin: d("9999-12-31"), duracionDias: "99999.00" })],
  },
  {
    nombre: "corte ANTERIOR a todo el plan",
    obra: { inicio: d("2026-01-01"), fin: d("2026-12-31") },
    cronograma: { fechaCorte: d("2025-01-01") },
    tareas: [T({ uid: 1, inicio: d("2026-06-01"), fin: d("2026-06-30"), duracionDias: "30.00" })],
  },
  {
    nombre: "corte MUY posterior al plan",
    obra: { inicio: d("2026-01-01"), fin: d("2026-12-31") },
    cronograma: { fechaCorte: d("9999-01-01") },
    tareas: [T({ uid: 1, inicio: d("2026-06-01"), fin: d("2026-06-30"), duracionDias: "30.00" })],
  },
  {
    nombre: "porcentajes al limite y duracion cero",
    obra: { inicio: d("2026-01-01"), fin: d("2026-12-31") },
    cronograma: { fechaCorte: d("2026-06-30") },
    tareas: [
      T({ uid: 1, duracionDias: "0.00", porcentajePlaneado: "100.00", porcentajeArchivo: "100.00" }),
      T({ uid: 2, duracionDias: "0.00", porcentajePlaneado: "0.00", porcentajeArchivo: "100.00" }),
    ],
  },
  {
    nombre: "linea base marcada sobre un cronograma vacio",
    obra: { inicio: d("2026-01-01"), fin: d("2026-12-31") },
    cronograma: { fechaCorte: d("2026-06-30"), lineaBase: true },
    tareas: [],
  },
  {
    nombre: "minutosPorDia = 0",
    obra: { inicio: d("2026-01-01"), fin: d("2026-12-31") },
    cronograma: { fechaCorte: d("2026-06-30"), minutosPorDia: 0 },
    tareas: [T({ uid: 1 })],
  },
  {
    nombre: "obra que termina ANTES de empezar",
    obra: { inicio: d("2026-12-31"), fin: d("2026-01-01") },
    cronograma: { fechaCorte: d("2026-06-30") },
    tareas: [T({ uid: 1 })],
  },
  {
    nombre: "corte semanal en domingo",
    obra: { inicio: d("2026-01-01"), fin: d("2026-12-31"), diaCorteSemanal: 7 },
    cronograma: { fechaCorte: d("2026-06-30") },
    tareas: [T({ uid: 1 })],
  },
  {
    nombre: "obra sin ningun cronograma",
    obra: { inicio: d("2026-01-01"), fin: d("2026-12-31") },
    cronograma: null,
    tareas: [],
  },
];

const SUBRUTAS = ["", "/gantt", "/informe", "/informe/pdf", "/informe/csv"];

async function main() {
  const url = process.env["DATABASE_URL"] ?? "";
  if (!url.includes("127.0.0.1") && !url.includes("localhost")) {
    throw new Error("Solo contra la base local.");
  }

  const usuario = await prisma.user.findFirstOrThrow({
    where: { estado: "ACTIVO" },
    select: { id: true, email: true, companyId: true },
  });
  const token = randomBytes(32).toString("base64url");
  const sesion = await prisma.session.create({
    data: {
      userId: usuario.id,
      tokenHash: createHash("sha256").update(token).digest("hex"),
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    },
    select: { id: true },
  });
  const cookie = `gcm_sesion=${token}`;
  const creadas: string[] = [];
  let rotas = 0;

  try {
    for (const caso of CASOS) {
      const obra = await prisma.project.create({
        data: {
          companyId: usuario.companyId,
          nombreObra: `SONDA - ${caso.nombre}`.slice(0, 250),
          fechaInicio: caso.obra.inicio,
          fechaFinProgramada: caso.obra.fin,
          estado: "EN_EJECUCION",
          diaCorteSemanal: caso.obra.diaCorteSemanal ?? 5,
        },
        select: { id: true },
      });
      creadas.push(obra.id);

      if (caso.cronograma) {
        await prisma.cronograma.create({
          data: {
            projectId: obra.id,
            version: 1,
            fechaCorte: caso.cronograma.fechaCorte,
            nombreProyecto: caso.nombre.slice(0, 250),
            minutosPorDia: caso.cronograma.minutosPorDia ?? 480,
            importadoPor: "sonda",
            lineaBaseAt: caso.cronograma.lineaBase ? new Date() : null,
            lineaBasePor: caso.cronograma.lineaBase ? "sonda" : null,
            tareas: {
              create: caso.tareas.map((t) => ({
                uid: t.uid,
                fila: t.fila,
                nombre: t.nombre,
                nivel: t.nivel,
                codigo: t.codigo ?? null,
                esHito: t.esHito ?? false,
                esResumen: t.esResumen ?? false,
                sinProgramar: t.sinProgramar ?? false,
                inicio: t.inicio,
                fin: t.fin,
                duracionDias: t.duracionDias,
                porcentajePlaneado: t.porcentajePlaneado ?? "0.00",
                porcentajeArchivo: t.porcentajeArchivo ?? "0.00",
              })),
            },
          },
        });
      }

      console.log(`\n${caso.nombre}`);
      for (const sub of SUBRUTAS) {
        const t0 = Date.now();
        try {
          const r = await fetch(`${BASE}/obras/${obra.id}/cronograma${sub}`, {
            headers: { cookie },
            redirect: "manual",
            signal: AbortSignal.timeout(120_000),
          });
          const cuerpo = r.status >= 500 ? await r.text() : "";
          if (r.status >= 500) rotas++;
          console.log(
            `${r.status >= 500 ? "  *** " : "      "}${r.status} ${(Date.now() - t0)
              .toString()
              .padStart(6)} ms  ${sub || "(pantalla)"}`,
          );
          if (cuerpo) {
            const digest = /digest["':\s]+(\d+)/.exec(cuerpo);
            console.log(`        digest=${digest?.[1] ?? "?"}`);
          }
        } catch (e) {
          rotas++;
          console.log(`  *** EXCEPCION ${sub} - ${e instanceof Error ? e.message : String(e)}`);
        }
      }
    }
  } finally {
    console.log(`\n${rotas} respuesta(s) rota(s). Borrando ${creadas.length} obras de sonda...`);
    for (const id of creadas) {
      await prisma.cronograma.deleteMany({ where: { projectId: id } });
      await prisma.project
        .delete({ where: { id } })
        .catch((e) => console.log(`  no se pudo borrar ${id}: ${e}`));
    }
    await prisma.session.delete({ where: { id: sesion.id } }).catch(() => {});
    await prisma.$disconnect();
  }
}

main();
