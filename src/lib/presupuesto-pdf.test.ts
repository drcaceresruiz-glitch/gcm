import { describe, expect, it } from "vitest";
import {
  A4_VERTICAL,
  bolsaDeLinea,
  paginasDelPresupuesto,
  type DatosPresupuesto,
  type LineaPresupuesto,
} from "./presupuesto-pdf";
import type { ElementoPdf } from "./informe-pdf";

const medir = (texto: string, tamano: number) => texto.length * (tamano / 2);

const partida = (
  codigo: string,
  descripcion: string,
  parcial: string,
  extra: Partial<LineaPresupuesto> = {},
): LineaPresupuesto => ({
  codigo,
  descripcion,
  tipo: "PARTIDA",
  unidad: "m2",
  metrado: "10",
  precioUnitario: "100.00",
  parcial,
  ...extra,
});

const datos = (parcial: Partial<DatosPresupuesto> = {}): DatosPresupuesto => ({
  empresa: "LARQUITECTURA STUDIO SAC",
  ruc: "20601689988",
  obra: "LABORATORIO CRIOCORD - LURÍN",
  ubicacion: "Carretera Panamericana Sur Km 29.5, Lima",
  programa: "PROGRAMACION EP",
  residente: { nombre: "ARQ. EDUARDO PÉREZ", colegiatura: "CAP 32467" },
  titulo: "PRESUPUESTO CONTRACTUAL",
  subtitulo: "Partidas, metrados y precios pactados.",
  lineas: [
    { ...partida("1.0", "PRELIMINARES", "1960.00"), tipo: "CAPITULO" },
    partida("1.1", "Cartel de obra", "700.00"),
    partida("1.2", "Cerco provisional", "1260.00"),
  ],
  totales: [{ etiqueta: "TOTAL", importe: "S/ 1,960.00", destacado: true }],
  soloInterno: false,
  ...parcial,
});

const hojas = (d: DatosPresupuesto, comparativa = false) =>
  paginasDelPresupuesto(d, A4_VERTICAL, medir, comparativa);

const textos = (elementos: readonly ElementoPdf[]) =>
  elementos.filter((e) => e.tipo === "texto").map((e) => e.texto);

describe("el presupuesto en papel", () => {
  it("lleva la obra, la empresa y su título", () => {
    const t = textos(hojas(datos())[0]!.elementos);

    expect(t).toContain("PRESUPUESTO CONTRACTUAL");
    expect(t).toContain("LABORATORIO CRIOCORD - LURÍN");
    expect(t.some((x) => x.includes("LARQUITECTURA"))).toBe(true);
  });

  it("cada partida sale con su metrado, su precio y su importe", () => {
    const t = textos(hojas(datos())[0]!.elementos);

    expect(t.some((x) => x.includes("1.1") && x.includes("Cartel"))).toBe(true);
    expect(t).toContain("100.00");
    expect(t).toContain("700.00");
  });

  it("un capítulo no repite metrado ni precio: es un título", () => {
    // Si los llevara, el lector sumaria el capitulo Y sus partidas.
    const el = hojas(datos())[0]!.elementos;
    const fondos = el.filter((e) => e.tipo === "fondo");

    // El capitulo se marca con su banda, y no aparece un "m2" de mas: solo
    // los dos de las partidas.
    expect(fondos.length).toBeGreaterThan(0);
    expect(textos(el).filter((x) => x === "m2")).toHaveLength(2);
  });

  it("los totales van al pie, y el destacado en grande", () => {
    const el = hojas(datos())[0]!.elementos;
    const total = el.find((e) => e.tipo === "texto" && e.texto === "TOTAL");

    expect(total?.tipo === "texto" && total.tam).toBe(10);
    expect(total?.tipo === "texto" && total.negrita).toBe(true);
  });

  it("un importe negativo se pinta en rojo", () => {
    // Es el caso de una bolsa negativa: la obra pierde dinero, y eso no puede
    // salir del mismo color que todo lo demas.
    const el = hojas(
      datos({ totales: [{ etiqueta: "BOLSA", importe: "-S/ 1,500.00", destacado: true }] }),
    )[0]!.elementos;
    const cifra = el.find((e) => e.tipo === "texto" && e.texto.includes("1,500.00"));

    expect(cifra?.tipo === "texto" && cifra.tinta).toBe("peligro");
  });
});

describe("el documento interno se distingue del que va al cliente", () => {
  it("el subtítulo del interno va en rojo", () => {
    const el = hojas(
      datos({ soloInterno: true, subtitulo: "DOCUMENTO INTERNO. No se envía." }),
    )[0]!.elementos;
    const aviso = el.find((e) => e.tipo === "texto" && e.texto.includes("INTERNO"));

    expect(aviso?.tipo === "texto" && aviso.tinta).toBe("peligro");
  });

  it("el del cliente NO lleva ese rojo", () => {
    const el = hojas(datos())[0]!.elementos;
    const enRojo = el.filter((e) => e.tipo === "texto" && e.tinta === "peligro");

    expect(enRojo).toHaveLength(0);
  });
});

describe("la comparativa", () => {
  const comparada = datos({
    titulo: "CONTRACTUAL FRENTE A META",
    lineas: [
      partida("1.1", "Cartel de obra", "826.00", { parcialOtro: "700.00" }),
      {
        codigo: null,
        descripcion: "Andamio en alquiler (costo propio de la meta)",
        tipo: "PARTIDA",
        unidad: "mes",
        metrado: "4",
        precioUnitario: "380.00",
        parcial: null,
        parcialOtro: "1520.00",
      },
    ],
    soloInterno: true,
  });

  it("enfrenta las dos cifras en la misma fila", () => {
    const t = textos(hojas(comparada, true)[0]!.elementos);

    expect(t).toContain("826.00");
    expect(t).toContain("700.00");
    expect(t).toContain("CONTRACTUAL");
    expect(t).toContain("META");
  });

  it("un costo propio de la meta sale sin contraparte contractual", () => {
    // No tiene con que compararse: el contrato no lo desglosa.
    const t = textos(hojas(comparada, true)[0]!.elementos);

    expect(t.some((x) => x.includes("Andamio"))).toBe(true);
    expect(t).toContain("1520.00");
  });
});

describe("paginación", () => {
  it("un presupuesto largo se reparte en varias páginas", () => {
    const muchas = Array.from({ length: 200 }, (_, i) =>
      partida(`1.${i}`, `Partida número ${i}`, "100.00"),
    );
    const p = hojas(datos({ lineas: muchas }));

    expect(p.length).toBeGreaterThan(1);
  });

  it("las páginas siguientes dicen de qué documento son", () => {
    // Si una hoja se separa del resto, tiene que poder identificarse.
    const muchas = Array.from({ length: 200 }, (_, i) =>
      partida(`1.${i}`, `Partida número ${i}`, "100.00"),
    );
    const p = hojas(datos({ lineas: muchas }));
    const t = textos(p[1]!.elementos);

    expect(t.some((x) => x.includes("PRESUPUESTO CONTRACTUAL"))).toBe(true);
    expect(t).toContain("ÍTEM");
  });

  it("nada se sale de la hoja ni invade el pie", () => {
    const muchas = Array.from({ length: 200 }, (_, i) =>
      partida(`1.${i}`, `Partida con un nombre bastante largo número ${i}`, "100.00"),
    );
    const suelo = A4_VERTICAL.margen + A4_VERTICAL.altoPie;

    for (const pagina of hojas(datos({ lineas: muchas }))) {
      for (const e of pagina.elementos) {
        if (e.tipo === "texto") {
          expect(e.y).toBeGreaterThanOrEqual(suelo);
          expect(e.y + e.tam).toBeLessThanOrEqual(A4_VERTICAL.alto);
          expect(e.x).toBeGreaterThanOrEqual(0);
        }
        if (e.tipo === "fondo") {
          expect(e.x + e.ancho).toBeLessThanOrEqual(
            A4_VERTICAL.ancho - A4_VERTICAL.margen + 0.01,
          );
        }
      }
    }
  });
});

describe("bolsaDeLinea", () => {
  it("es contractual menos meta", () => {
    expect(bolsaDeLinea("826.00", "700.00")).toBe("126.00");
  });

  it("sin una de las dos no se inventa un cero", () => {
    // Una partida que no esta en la meta no tiene bolsa cero: no tiene bolsa.
    expect(bolsaDeLinea("826.00", null)).toBeNull();
    expect(bolsaDeLinea(null, "700.00")).toBeNull();
  });
});

describe("el membrete y la firma", () => {
  it("el membrete lleva el RUC, la ubicación y el programa", () => {
    // Los cuatro datos que el papel del cliente ya tenia y GCM no ensenaba.
    const t = textos(hojas(datos())[0]!.elementos).join(" ");

    expect(t).toContain("20601689988");
    expect(t).toContain("Km 29.5");
    expect(t).toContain("PROGRAMACION EP");
  });

  it("la firma lleva la colegiatura debajo del nombre", () => {
    // Es lo que hace que el documento valga como documento profesional y no
    // como una lista de precios.
    const t = textos(hojas(datos())[0]!.elementos);

    expect(t).toContain("ARQ. EDUARDO PÉREZ");
    expect(t.some((x) => x.includes("CAP 32467"))).toBe(true);
  });

  it("un residente sin colegiatura firma igual, sin inventarse una", () => {
    const t = textos(
      hojas(datos({ residente: { nombre: "ING. LUZ RAMOS", colegiatura: null } }))[0]!
        .elementos,
    );

    expect(t).toContain("ING. LUZ RAMOS");
    expect(t).toContain("Residente de obra");
  });

  it("sin residente asignado NO se dibuja una raya para firmar", () => {
    // Un hueco de firma sin nombre invita a que lo rellene cualquiera a mano,
    // y entonces el documento dice algo que GCM no puede respaldar.
    const t = textos(hojas(datos({ residente: null }))[0]!.elementos);

    expect(t.some((x) => x.includes("Residente de obra"))).toBe(false);
  });

  it("una empresa sin RUC no imprime «RUC null»", () => {
    const t = textos(hojas(datos({ ruc: null }))[0]!.elementos).join(" ");

    expect(t).not.toContain("RUC");
    expect(t).toContain("LARQUITECTURA");
  });
});
