import { describe, expect, it, vi } from "vitest";

/**
 * Lo que la pantalla del contractual dice ANTES de borrar el presupuesto.
 *
 * La casilla «Borrar el presupuesto que ya tiene la obra» no admite un aviso
 * aproximado: lo que hace es un borrado completo del arbol de partidas, y lo
 * unico que separa a alguien de perder una partida escrita a mano es ese
 * texto.
 *
 * Y hasta el 23 de agosto de 2026 el texto se contradecia con el boton de al
 * lado. La casilla contaba las filas del arbol -«las 6 partidas que ya tiene
 * la obra»- y el boton contaba solo las que llevan importe -«Generar el
 * contractual con 4 partida(s)»-. El mismo conjunto, dos cifras, dos
 * centimetros de distancia. Quien lee eso no sabe si sobran dos partidas o si
 * el programa esta contando mal, y en una pantalla que borra, la duda cuesta.
 */

const items: {
  codigoPartida: string;
  descripcion: string;
  origen: string;
  editadaAMano: boolean;
  tipo: "CAPITULO" | "PARTIDA";
}[] = [];

vi.mock("@/lib/prisma", () => ({
  prisma: {
    wbsItem: { findMany: () => Promise.resolve(items) },
  },
}));

import { analizarRiesgoDeReemplazo } from "@/services/importacion.service";

const sesion = {
  userId: "u1",
  companyId: "c1",
  role: "ADMIN",
  permisos: ["partida:leer"],
  nombres: "A",
  apellidos: "B",
} as never;

const cap = (codigo: string) =>
  ({
    codigoPartida: codigo,
    descripcion: `Capitulo ${codigo}`,
    origen: "IMPORTADO",
    editadaAMano: false,
    tipo: "CAPITULO" as const,
  });

const par = (
  codigo: string,
  extra: { origen?: string; editadaAMano?: boolean } = {},
) => ({
  codigoPartida: codigo,
  descripcion: `Partida ${codigo}`,
  origen: extra.origen ?? "IMPORTADO",
  editadaAMano: extra.editadaAMano ?? false,
  tipo: "PARTIDA" as const,
});

describe("cuantas lineas se van a borrar", () => {
  it("cuenta las partidas y los capitulos POR SEPARADO", async () => {
    items.length = 0;
    items.push(cap("1.0"), par("1.1"), par("1.2"), cap("2.0"), par("2.1"), par("2.2"));

    const r = await analizarRiesgoDeReemplazo(sesion, "obra-1");

    // Cuatro, no seis: es el mismo numero que el boton de al lado.
    expect(r.totalPartidas).toBe(4);
    expect(r.totalCapitulos).toBe(2);
  });

  it("una obra sin presupuesto no ofrece borrar nada", async () => {
    // La casilla solo se pinta con `totalPartidas > 0`: si contara tambien
    // los capitulos, una obra con titulos y sin partidas ofreceria borrar un
    // presupuesto que no existe.
    items.length = 0;

    const r = await analizarRiesgoDeReemplazo(sesion, "obra-1");

    expect(r.totalPartidas).toBe(0);
    expect(r.totalCapitulos).toBe(0);
  });
});

describe("lo que no se puede recuperar se dice aparte", () => {
  it("una partida escrita a mano se señala: no esta en ningun archivo", async () => {
    items.length = 0;
    items.push(par("1.1"), par("1.2", { origen: "MANUAL" }));

    const r = await analizarRiesgoDeReemplazo(sesion, "obra-1");

    expect(r.creadasAMano.map((x) => x.codigo)).toEqual(["1.2"]);
  });

  it("una importada y corregida despues se cuenta UNA vez, no dos", async () => {
    // Contarla en los dos avisos inflaria la cifra y le quitaria credibilidad
    // justo al aviso que tiene que frenar a alguien.
    items.length = 0;
    items.push(par("1.1", { origen: "MANUAL", editadaAMano: true }));

    const r = await analizarRiesgoDeReemplazo(sesion, "obra-1");

    expect(r.creadasAMano).toHaveLength(1);
    expect(r.corregidasAMano).toHaveLength(0);
  });
});

describe("sin permiso de lectura no se dice nada", () => {
  it("devuelve vacio, no la lista", async () => {
    items.length = 0;
    items.push(par("1.1", { origen: "MANUAL" }));

    const sinPermiso = { ...(sesion as object), permisos: [] } as never;
    const r = await analizarRiesgoDeReemplazo(sinPermiso, "obra-1");

    expect(r.totalPartidas).toBe(0);
    expect(r.totalCapitulos).toBe(0);
    expect(r.creadasAMano).toEqual([]);
  });
});
