import { describe, expect, it } from "vitest";
import {
  clavesDeLaBitacora,
  hojasBitacora,
  jornadasDeLaBitacora,
  type DatosBitacora,
} from "./informe-hoja-bitacora";
import { A4_APAISADO, type ElementoPdf } from "./informe-pdf";
import type { PartidaActiva } from "./control-avance";
import type { FotoResumen } from "@/services/evidencia.service";

const medir = (texto: string, tamano: number) => texto.length * (tamano / 2);

const partida = (uid: number, nombre: string): PartidaActiva => ({
  uid,
  codigo: `4.${uid}`,
  nombre,
  fila: uid,
  inicio: new Date(Date.UTC(2026, 7, 6)),
  fin: new Date(Date.UTC(2026, 7, 10)),
  porcentajePlaneado: "83.00",
  porcentajeReal: "30.00",
  desfase: "-53.00",
  esCritico: false,
});

const foto = (
  id: string,
  dia: number,
  extra: Partial<FotoResumen> = {},
): FotoResumen => ({
  id,
  nota: `Nota de ${id}`,
  nombreOriginal: `${id}.jpg`,
  subidaPor: "Eduardo Pérez",
  createdAt: new Date(Date.UTC(2026, 7, dia, 11, 0, 0)),
  purgada: false,
  ...extra,
});

const datos = (parcial: Partial<DatosBitacora> = {}): DatosBitacora => ({
  obra: "LABORATORIO CRIOCORD - LURÍN",
  empresa: "LARQUITECTURA STUDIO SAC",
  fechaCorte: new Date(Date.UTC(2026, 7, 8)),
  activas: [partida(30, "Solados para zapatas")],
  fotosPorUid: { 30: [foto("a", 8)] },
  ...parcial,
});

const textos = (elementos: readonly ElementoPdf[]) =>
  elementos.filter((e) => e.tipo === "texto").map((e) => e.texto);

const imagenes = (elementos: readonly ElementoPdf[]) =>
  elementos.filter((e) => e.tipo === "imagen");

describe("jornadasDeLaBitacora", () => {
  it("agrupa por dia, no por partida", () => {
    // Dos partidas distintas fotografiadas el mismo dia son UNA jornada: una
    // bitacora se lee por lo que paso cada dia.
    const j = jornadasDeLaBitacora(
      datos({
        activas: [partida(30, "Solados"), partida(46, "Nivelación")],
        fotosPorUid: { 30: [foto("a", 8)], 46: [foto("b", 8)] },
      }),
    );
    expect(j).toHaveLength(1);
    expect(j[0]?.fotos).toHaveLength(2);
    expect(j[0]?.partidas).toHaveLength(2);
  });

  it("deja fuera las fotos purgadas", () => {
    // El registro de auditoria se conserva a proposito, pero el archivo ya no
    // existe: dibujar su hueco produce un marco vacio que se lee como fallo.
    const j = jornadasDeLaBitacora(
      datos({ fotosPorUid: { 30: [foto("a", 8, { purgada: true })] } }),
    );
    expect(j).toHaveLength(0);
  });

  it("de la mas reciente hacia atras, y solo tres jornadas", () => {
    const j = jornadasDeLaBitacora(
      datos({
        fotosPorUid: {
          30: [foto("a", 3), foto("b", 4), foto("c", 5), foto("d", 8)],
        },
      }),
    );
    expect(j).toHaveLength(3);
    expect(j.map((x) => x.dia.getUTCDate())).toEqual([8, 5, 4]);
  });

  it("dentro del dia, en el orden en que se subieron", () => {
    const tarde = foto("tarde", 8);
    tarde.createdAt = new Date(Date.UTC(2026, 7, 8, 17, 0, 0));
    const manana = foto("manana", 8);
    manana.createdAt = new Date(Date.UTC(2026, 7, 8, 7, 0, 0));
    const j = jornadasDeLaBitacora(datos({ fotosPorUid: { 30: [tarde, manana] } }));
    expect(j[0]?.fotos.map((f) => f.foto.id)).toEqual(["manana", "tarde"]);
  });

  it("como mucho seis fotos por jornada: la cuadricula del original", () => {
    const nueve = Array.from({ length: 9 }, (_, i) => foto(`f${i}`, 8));
    const j = jornadasDeLaBitacora(datos({ fotosPorUid: { 30: nueve } }));
    expect(j[0]?.fotos).toHaveLength(6);
  });
});

describe("clavesDeLaBitacora", () => {
  it("pide exactamente las fotos que se van a dibujar, ni una mas", () => {
    // Es lo que impide que una obra con cientos de fotos las lea todas de
    // disco para imprimir dieciocho.
    const muchas = Array.from({ length: 40 }, (_, i) => foto(`f${i}`, 8));
    const d = datos({ fotosPorUid: { 30: muchas } });
    const claves = clavesDeLaBitacora(d);
    expect(claves).toHaveLength(6);

    const dibujadas = imagenes(hojasBitacora(d, A4_APAISADO, medir)[0]!.elementos);
    expect(dibujadas.map((i) => (i.tipo === "imagen" ? i.clave : ""))).toEqual(claves);
  });

  it("sin fotos no pide ninguna", () => {
    expect(clavesDeLaBitacora(datos({ fotosPorUid: {} }))).toEqual([]);
  });
});

describe("hojasBitacora", () => {
  it("sin fotos no hay hoja, en vez de una pagina en blanco", () => {
    expect(hojasBitacora(datos({ fotosPorUid: {} }), A4_APAISADO, medir)).toEqual([]);
  });

  it("una hoja por jornada", () => {
    const h = hojasBitacora(
      datos({ fotosPorUid: { 30: [foto("a", 7), foto("b", 8)] } }),
      A4_APAISADO,
      medir,
    );
    expect(h).toHaveLength(2);
  });

  it("cada hoja lleva su fecha y el trabajo realizado", () => {
    const t = textos(hojasBitacora(datos(), A4_APAISADO, medir)[0]!.elementos);
    expect(t).toContain("08/08/2026");
    expect(t).toContain("TRABAJO REALIZADO");
    expect(t).toContain("4.30 Solados para zapatas");
  });

  it("una foto sin nota dice quien la subio, en vez de dejar el pie mudo", () => {
    // En una bitacora, de quien es la foto forma parte del dato.
    const t = textos(
      hojasBitacora(
        datos({ fotosPorUid: { 30: [foto("a", 8, { nota: null })] } }),
        A4_APAISADO,
        medir,
      )[0]!.elementos,
    );
    expect(t.some((x) => x.includes("Eduardo Pérez") && x.includes("08/08/2026"))).toBe(
      true,
    );
  });

  it("cada foto va dentro de su marco", () => {
    // El marco se dibuja tenga foto o no: es lo que sostiene la cuadricula
    // cuando una imagen no se puede incrustar.
    const el = hojasBitacora(datos(), A4_APAISADO, medir)[0]!.elementos;
    const img = imagenes(el)[0];
    const marcos = el.filter((e) => e.tipo === "fondo" && e.tinta === "linea");
    expect(img?.tipo).toBe("imagen");
    expect(marcos.length).toBeGreaterThan(0);
    if (img?.tipo !== "imagen") return;
    const marco = marcos.find(
      (m) => m.tipo === "fondo" && m.x <= img.x && m.y <= img.y,
    );
    expect(marco).toBeDefined();
    if (marco?.tipo !== "fondo") return;
    expect(img.x + img.ancho).toBeLessThanOrEqual(marco.x + marco.ancho);
    expect(img.y + img.alto).toBeLessThanOrEqual(marco.y + marco.alto);
  });

  it("nada invade la banda del pie de pagina", () => {
    // El pie con la paginacion lo escribe el pintor DESPUES, encima de lo que
    // haya: si la ultima linea de trabajo realizado baja hasta ahi, se
    // superponen y nadie se entera hasta ver el papel impreso.
    const seis = Array.from({ length: 6 }, (_, i) => foto(`f${i}`, 8));
    const activas = Array.from({ length: 6 }, (_, i) =>
      partida(30 + i, `Partida trabajada número ${i}`),
    );
    const fotosPorUid = Object.fromEntries(
      activas.map((p, i) => [p.uid, [seis[i]!]]),
    );
    const el = hojasBitacora(datos({ activas, fotosPorUid }), A4_APAISADO, medir)[0]!
      .elementos;

    const suelo = A4_APAISADO.margen + A4_APAISADO.altoPie;
    for (const e of el) {
      if (e.tipo === "texto") expect(e.y).toBeGreaterThanOrEqual(suelo);
      if (e.tipo === "fondo" || e.tipo === "imagen") {
        expect(e.y).toBeGreaterThanOrEqual(suelo);
      }
    }
  });

  it("nada se sale de la hoja, ni con la cuadricula llena", () => {
    const seis = Array.from({ length: 6 }, (_, i) => foto(`f${i}`, 8));
    const activas = [partida(30, "Solados"), partida(46, "Nivelación de cama de arena")];
    const el = hojasBitacora(
      datos({ activas, fotosPorUid: { 30: seis.slice(0, 3), 46: seis.slice(3) } }),
      A4_APAISADO,
      medir,
    )[0]!.elementos;

    for (const e of el) {
      const izquierda = e.tipo === "linea" || e.tipo === "trazo" ? Math.min(e.x1, e.x2) : e.tipo === "arco" ? e.cx - e.radio : e.x;
      const derecha =
        e.tipo === "linea" || e.tipo === "trazo"
          ? Math.max(e.x1, e.x2)
          : e.tipo === "arco"
            ? e.cx + e.radio
            : e.tipo === "fondo" || e.tipo === "imagen"
              ? e.x + e.ancho
              : e.x;
      const abajo = e.tipo === "linea" || e.tipo === "trazo" ? Math.min(e.y1, e.y2) : e.tipo === "arco" ? e.cy - e.radio : e.y;
      const arriba =
        e.tipo === "linea" || e.tipo === "trazo"
          ? Math.max(e.y1, e.y2)
          : e.tipo === "arco"
            ? e.cy + e.radio
            : e.tipo === "fondo" || e.tipo === "imagen"
              ? e.y + e.alto
              : e.tipo === "texto"
                ? e.y + e.tam
                : e.y;
      expect(izquierda).toBeGreaterThanOrEqual(0);
      expect(derecha).toBeLessThanOrEqual(A4_APAISADO.ancho);
      expect(abajo).toBeGreaterThanOrEqual(0);
      expect(arriba).toBeLessThanOrEqual(A4_APAISADO.alto);
    }
  });
});
