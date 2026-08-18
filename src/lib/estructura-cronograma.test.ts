import { describe, expect, it } from "vitest";

import { estructuraDelCronograma } from "@/lib/estructura-cronograma";

/**
 * La regla que decide QUE ES UN CAPITULO, con las cuatro estructuras reales.
 *
 * Antes se daba por hecho que todo archivo trae una fila de proyecto arriba y
 * que los capitulos estan en `nivelRaiz + 1`. Las tres obras de la base NO la
 * traen, asi que la tabla de «Avance por capitulo» listaba las PARTIDAS como
 * capitulos, cada una con una sola partida debajo. No fallaba nada: solo
 * mentia.
 */

const t = (nivel: number, codigo: string | null, nombre = "x") => ({
  nivel,
  codigo,
  nombre,
});

describe("estructuraDelCronograma", () => {
  it("archivo SIN fila de proyecto: los capitulos son el nivel de arriba", () => {
    // El caso del usuario: el Excel empieza directamente por los capitulos.
    const e = estructuraDelCronograma([
      t(1, "1.0", "OBRAS PROVISIONALES"),
      t(2, "1.1", "Cartel"),
      t(2, "1.2", "Cerco"),
      t(1, "2.0", "ESTRUCTURAS"),
      t(2, "2.1", "Concreto"),
      t(2, "2.2", "Acero"),
    ]);

    expect(e.forma).toBe("por-capitulos");
    expect(e.nivelCapitulo).toBe(1);
    expect(e.filaDeProyecto).toBeNull();
    expect(e.dudosa).toBe(false);
  });

  it("archivo CON fila de proyecto: los capitulos bajan un nivel", () => {
    // La fila del proyecto no lleva codigo; los capitulos si.
    const e = estructuraDelCronograma([
      t(1, null, "EDIFICIO LOS ROBLES"),
      t(2, "7.0", "SANITARIAS"),
      t(3, "7.3", "Punto de agua"),
    ]);

    expect(e.forma).toBe("con-fila-de-proyecto");
    expect(e.nivelCapitulo).toBe(2);
    expect(e.filaDeProyecto?.nombre).toBe("EDIFICIO LOS ROBLES");
    expect(e.dudosa).toBe(false);
  });

  it("la fila de proyecto con codigo VACIO tambien cuenta como raiz", () => {
    // La plantilla de cronograma la escribe con `codigo: ""`, no con null.
    // Comprobar solo null la dejaba fuera y volvia a comerse un nivel.
    const e = estructuraDelCronograma([
      t(1, "", "EDIFICIO LOS ROBLES"),
      t(2, "1.0", "ESTRUCTURAS"),
      t(3, "1.1", "Zapatas"),
    ]);

    expect(e.forma).toBe("con-fila-de-proyecto");
    expect(e.nivelCapitulo).toBe(2);
  });

  it("una sola tarea arriba CON codigo es un capitulo, y se marca DUDOSA", () => {
    // El caso de CRIOCORD: el cronograma empieza por «4.0 CAPITULO IV». Es
    // una obra de un solo capitulo, no una fila de proyecto, pero desde aqui
    // las dos se ven igual: por eso se elige lo correcto Y se avisa.
    const e = estructuraDelCronograma([
      t(1, "4.0", "CAPITULO IV: MOVIMIENTO DE TIERRA"),
      t(2, "4.1", "Trazo y replanteo"),
      t(2, "4.2", "Corte de losa"),
    ]);

    expect(e.forma).toBe("capitulo-unico");
    expect(e.nivelCapitulo).toBe(1);
    expect(e.dudosa).toBe(true);
  });

  it("cronograma plano: no hay capitulos que agrupar", () => {
    // Sin jerarquia son tareas sueltas. Pintar cada una como capitulo de si
    // misma llenaria la tabla de ruido.
    const e = estructuraDelCronograma([t(1, "1", "A"), t(1, "2", "B")]);

    expect(e.forma).toBe("plana");
    expect(e.nivelCapitulo).toBeNull();
  });

  it("sin tareas no se inventa nada", () => {
    const e = estructuraDelCronograma([]);
    expect(e.nivelCapitulo).toBeNull();
    expect(e.dudosa).toBe(false);
  });
});
