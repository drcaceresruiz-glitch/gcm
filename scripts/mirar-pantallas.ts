/**
 * Mira lo que DICEN unas pantallas concretas, no solo si responden.
 *
 *   npm run dev
 *   npx tsx scripts/mirar-pantallas.ts
 *
 * `humo.ts` recorre las 92 rutas y avisa de las que revientan; esto es lo
 * otro: abre unas pocas y comprueba que el texto que tiene que estar, esta.
 * Sirve para lo que ninguna prueba caza —un cambio que consiste en ENSENAR
 * algo— sin tener que teclear una contrasena.
 *
 * Abre sesion escribiendo la fila que escribiria el login, la usa y la borra.
 * Solo contra la base local.
 */
import { createHash, randomBytes } from "node:crypto";

import { prisma } from "@/lib/prisma";

const BASE = process.env["BASE"] ?? "http://localhost:3000";

interface Caso {
  titulo: string;
  ruta: string | (() => Promise<string | null>);
  espera: string[];
}

const CASOS: Caso[] = [
  {
    titulo: "Manual: el capitulo de la EDT",
    ruta: "/manual/edt",
    espera: [
      "El presupuesto ya es la EDT",
      "Paquete de trabajo",
      "Hasta dónde descomponer",
      "el dinero decide",
    ],
  },
  {
    titulo: "Manual: suma alzada en el capitulo del presupuesto",
    ruta: "/manual/presupuesto",
    espera: [
      "Cómo está contratada",
      "Importe cerrado",
      "Referencial",
      "glb, global, glg",
    ],
  },
  {
    titulo: "Investigacion: la guia del estudio",
    ruta: "/investigacion",
    espera: [
      "Cómo se monta el estudio",
      "Last Planner en papel",
      "Lo que NO se puede cambiar a mitad",
      "verificación funcional del instrumento",
    ],
  },
  {
    titulo: "Investigacion: la guia del analisis de una obra",
    ruta: async () => {
      const obra = await prisma.project.findFirst({ select: { id: true } });
      return obra ? `/obras/${obra.id}/investigacion` : null;
    },
    espera: [
      "Qué hacer con estos archivos",
      "regresión segmentada",
      "Durbin-Watson",
      "fase_constructiva_n",
    ],
  },
  {
    titulo: "Presupuesto de una obra: el subtotal por capitulo",
    ruta: async () => {
      const obra = await prisma.project.findFirst({ select: { id: true } });
      return obra ? `/obras/${obra.id}` : null;
    },
    espera: [],
  },
];

let ok = 0;
let mal = 0;

async function main() {
  const usuario = await prisma.user.findFirstOrThrow({
    where: { estado: "ACTIVO" },
    select: { id: true, email: true },
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

  try {
    console.log(`sesion de ${usuario.email} · ${BASE}\n`);

    for (const caso of CASOS) {
      const ruta = typeof caso.ruta === "string" ? caso.ruta : await caso.ruta();
      if (ruta === null) {
        console.log(`-- ${caso.titulo}: sin datos en la base, no se puede abrir\n`);
        continue;
      }

      const r = await fetch(`${BASE}${ruta}`, {
        headers: { cookie: `gcm_sesion=${token}` },
        redirect: "manual",
      });
      const html = r.status === 200 ? await r.text() : "";
      // El texto visible, sin marcado. Se conservan los `<script>`: Next
      // manda ahi el contenido de los componentes de servidor.
      const texto = html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

      console.log(`-- ${caso.titulo}`);
      console.log(`   ${ruta}  ->  ${r.status}${r.status === 200 ? ` (${html.length} bytes)` : ""}`);
      if (r.status !== 200) {
        console.log("   NO SE PUDO ABRIR");
        mal++;
        console.log();
        continue;
      }
      for (const e of caso.espera) {
        const esta = texto.includes(e);
        console.log(`   ${esta ? "OK  " : "FALTA"} ${e}`);
        if (esta) ok++;
        else mal++;
      }
      console.log();
    }
  } finally {
    await prisma.session.delete({ where: { id: sesion.id } }).catch(() => {});
    await prisma.$disconnect();
  }

  console.log(`RESULTADO: ${ok} bien, ${mal} mal`);
  process.exit(mal === 0 ? 0 : 1);
}

main();
