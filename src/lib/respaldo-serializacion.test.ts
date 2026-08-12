import { describe, expect, it } from "vitest";

import {
  aDiaCalendario,
  deDiaCalendario,
  serializarFila,
  deserializarFila,
} from "@/lib/respaldo-serializacion";
import { tablaDelRespaldo } from "@/lib/respaldo-esquema";

const PARTIDAS = tablaDelRespaldo("wbs_items")!;
const ORDENES = tablaDelRespaldo("ordenes_compra")!;
const PLANES = tablaDelRespaldo("planes_semanales")!;

describe("los importes viajan como cadena, con su escala", () => {
  it("nunca como numero de JSON", () => {
    // Un `number` de JSON es un float binario: 403.75 sobrevive, pero el
    // siguiente no tiene por que. La regla 1 del proyecto es Decimal, jamas
    // Float, y el respaldo no es la excepcion.
    const fila = serializarFila(
      { id: "a", metrado: "12.5", precioUnitario: "3.2", parcial: "40" },
      PARTIDAS,
    );
    expect(typeof fila.metrado).toBe("string");
    expect(typeof fila.parcial).toBe("string");
  });

  it("canonizada a la escala de la columna", () => {
    // Metrado y precio son (14,4); el parcial es (14,2). Sin canonizar, el
    // mismo respaldo hecho dos veces saldria distinto y no se podria comparar
    // ni firmar de forma estable.
    const fila = serializarFila(
      { metrado: "12.5", precioUnitario: "3.2", parcial: "40" },
      PARTIDAS,
    );
    expect(fila.metrado).toBe("12.5000");
    expect(fila.precioUnitario).toBe("3.2000");
    expect(fila.parcial).toBe("40.00");
  });

  it("conserva el signo negativo", () => {
    // El descuento de CRIOCORD es -26821.60 y ese signo ya rompio la
    // aritmetica del dinero en otro sitio. Aqui tiene su prueba.
    const fila = serializarFila({ descuentoComercial: "-26821.6" }, ORDENES);
    expect(fila.descuentoComercial).toBe("-26821.60");
  });

  it("y en la vuelta sigue siendo cadena", () => {
    // Prisma acepta la cadena en una columna Decimal y la guarda exacta.
    // Convertirla a numero aqui desharia todo el cuidado anterior.
    const vuelta = deserializarFila({ parcial: "40.00" }, PARTIDAS);
    expect(vuelta.parcial).toBe("40.00");
  });

  it("un importe nulo no se convierte en cero", () => {
    // En el presupuesto, "capitulo sin importe" y "partida de cero" son cosas
    // distintas y se leen distinto.
    const fila = serializarFila({ parcial: null }, PARTIDAS);
    expect(fila.parcial).toBeNull();
  });
});

describe("los dias de calendario no se pueden correr", () => {
  it("salen como YYYY-MM-DD, no como instante", () => {
    const fila = serializarFila(
      { fechaCorte: new Date("2026-08-07T00:00:00Z") },
      PLANES,
    );
    expect(fila.fechaCorte).toBe("2026-08-07");
  });

  it("ida y vuelta sin moverse", () => {
    const ida = aDiaCalendario(new Date("2026-08-07T00:00:00Z"));
    const vuelta = deDiaCalendario(ida)!;
    expect(aDiaCalendario(vuelta)).toBe("2026-08-07");
    // Medianoche UTC, como `fechaDeObra`: es lo que impide que el dia cambie
    // al reconstruirlo en Lima, que va cinco horas por detras.
    expect(vuelta.toISOString()).toBe("2026-08-07T00:00:00.000Z");
  });

  it("rechaza un dia que no existe", () => {
    // `new Date("2026-02-31")` no falla: rueda al 3 de marzo.
    expect(deDiaCalendario("2026-02-31")).toBeNull();
    expect(deDiaCalendario("no es una fecha")).toBeNull();
  });

  it("las demas fechas siguen siendo instantes completos", () => {
    const fila = serializarFila(
      { createdAt: new Date("2026-08-07T14:32:11.482Z") },
      PLANES,
    );
    expect(fila.createdAt).toBe("2026-08-07T14:32:11.482Z");
  });
});

describe("las columnas y los nulos", () => {
  it("se escriben TODAS, tambien las nulas", () => {
    // Que una clave falte significa "esta columna no existia cuando se hizo el
    // respaldo". Si se omitieran los nulos, esa senal se perderia y un
    // respaldo viejo se restauraria mal sin que nadie lo notara.
    const fila = serializarFila({ id: "a", codigoObra: null }, PARTIDAS);
    expect(Object.keys(fila)).toContain("codigoObra");
    expect(fila.codigoObra).toBeNull();
  });

  it("un texto que parece fecha pero no lo es, no se convierte", () => {
    // Las descripciones de partida vienen de un Excel del usuario.
    const vuelta = deserializarFila(
      { descripcion: "2026-08-07 acta de obra" },
      PARTIDAS,
    );
    expect(vuelta.descripcion).toBe("2026-08-07 acta de obra");
  });

  it("los booleanos y los enteros pasan tal cual", () => {
    const fila = serializarFila({ activo: true, orden: 3 }, PARTIDAS);
    expect(fila.activo).toBe(true);
    expect(fila.orden).toBe(3);
  });
});
