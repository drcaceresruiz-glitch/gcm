import { describe, expect, it } from "vitest";

import {
  estadoDeLaBolsa,
  textoDelAviso,
  tocaAvisar,
  UMBRAL_BOLSA_POR_DEFECTO,
  type EstadoBolsa,
} from "@/lib/aviso-bolsa";

/**
 * El aviso de la bolsa, pedido con estas palabras: «deberia haber avisos
 * cuando la bolsa se vea comprometida, se acerca o se pone en negativo, que
 * permita configurar estos avisos. EN VEZ DE ASUMIRLO A SABIENDAS».
 *
 * Lo que se prueba aqui no es aritmetica -esa ya esta probada en
 * `lib/decimal`- sino las dos decisiones que hacen que un aviso se lea o se
 * ignore: cuando se considera que la bolsa esta mal, y cuando se calla.
 */

const UMBRAL = 25;

describe("en que estado esta la bolsa", () => {
  it("holgada mientras quede mas del umbral", () => {
    // Quedan 30.000 de los 100.000 previstos: por encima del 25 %.
    expect(estadoDeLaBolsa("30000.00", "100000.00", UMBRAL)).toBe("holgada");
  });

  it("cerca justo al tocar el umbral, no un centimo despues", () => {
    // El 25 % de 100.000 son 25.000. Quedarse EN el umbral ya avisa: esperar
    // a bajar de el regalaria el aviso del dia en que se cruza.
    expect(estadoDeLaBolsa("25000.00", "100000.00", UMBRAL)).toBe("cerca");
    expect(estadoDeLaBolsa("25000.01", "100000.00", UMBRAL)).toBe("holgada");
    expect(estadoDeLaBolsa("24999.99", "100000.00", UMBRAL)).toBe("cerca");
  });

  it("roja en negativo, que es el caso que se pidio nombrando", () => {
    expect(estadoDeLaBolsa("-4200.00", "100000.00", UMBRAL)).toBe("roja");
  });

  /**
   * El CERO es rojo, no ambar. «Te queda 0,00 de bolsa» no es una buena
   * noticia que merezca el escalon intermedio: a partir de ahi, todo lo que
   * se lleve sale del margen de la obra.
   */
  it("el cero ya es rojo", () => {
    expect(estadoDeLaBolsa("0.00", "100000.00", UMBRAL)).toBe("roja");
  });

  it("el umbral es configurable y cambia donde salta", () => {
    // Con el 10 %, 12.000 sobre 100.000 todavia es holgada; con el 25 %, no.
    expect(estadoDeLaBolsa("12000.00", "100000.00", 10)).toBe("holgada");
    expect(estadoDeLaBolsa("12000.00", "100000.00", 25)).toBe("cerca");
  });

  /**
   * Con el umbral en 0 se apaga el escalon intermedio PERO NO EL ROJO. Quien
   * no quiere que le avisen «te queda poco» casi siempre sigue queriendo que
   * le avisen «no queda nada», y hacer que 0 apague las dos cosas obligaria a
   * elegir entre ruido y silencio total.
   */
  it("con el umbral en 0 solo avisa el rojo", () => {
    expect(estadoDeLaBolsa("1.00", "100000.00", 0)).toBe("holgada");
    expect(estadoDeLaBolsa("-1.00", "100000.00", 0)).toBe("roja");
  });

  /**
   * Una obra planificada SIN margen no esta «cerca» de quedarse sin bolsa: es
   * que no tenia. Calcular el porcentaje igual daria un «te queda el 40 %» de
   * algo que nunca existio.
   */
  it("con la prevista en cero o negativa no hay escalon intermedio", () => {
    expect(estadoDeLaBolsa("500.00", "0.00", UMBRAL)).toBe("holgada");
    expect(estadoDeLaBolsa("500.00", "-9000.00", UMBRAL)).toBe("holgada");
    // Pero el rojo sigue funcionando: si encima se pasa, se dice.
    expect(estadoDeLaBolsa("-500.00", "0.00", UMBRAL)).toBe("roja");
  });

  it("no arrastra el ruido de la coma flotante", () => {
    // El 33 % de 0,30 son 0,099 -> 0,10 a dos decimales.
    expect(estadoDeLaBolsa("0.10", "0.30", 33)).toBe("cerca");
    expect(estadoDeLaBolsa("0.11", "0.30", 33)).toBe("holgada");
  });
});

describe("cuando suena y cuando se calla", () => {
  /**
   * LA REGLA QUE HACE QUE ESTO SE LEA. Un aviso que se repite cada dia porque
   * la obra lleva un mes en rojo se ignora a la semana, y entonces tampoco se
   * lee el dia que pasa algo nuevo. Se avisa al EMPEORAR, no mientras dure.
   */
  it("no repite mientras la bolsa siga igual de mal", () => {
    expect(tocaAvisar("roja", "roja")).toBe(false);
    expect(tocaAvisar("cerca", "cerca")).toBe(false);
  });

  it("suena al bajar un escalon", () => {
    expect(tocaAvisar(null, "cerca")).toBe(true);
    expect(tocaAvisar("cerca", "roja")).toBe(true);
  });

  /**
   * Si la obra pasa de holgada a roja de golpe -una adenda grande- suena el
   * rojo directamente. Nunca se «pasa por» el escalon intermedio para no
   * saltarselo: lo que importa es el estado de ahora.
   */
  it("de holgada a roja de golpe suena el rojo, sin pasar por el aviso suave", () => {
    expect(tocaAvisar("holgada", "roja")).toBe(true);
  });

  it("la primera vez que se mira, un rojo no se calla", () => {
    // Sin memoria previa. El sistema no puede callarse un rojo con la excusa
    // de que es la primera vez que mira esta obra.
    expect(tocaAvisar(null, "roja")).toBe(true);
  });

  it("una bolsa sana no suena nunca", () => {
    expect(tocaAvisar(null, "holgada")).toBe(false);
    expect(tocaAvisar("roja", "holgada")).toBe(false);
  });

  /**
   * EL REARME, que es la otra mitad de la regla. Cuando la bolsa mejora no se
   * avisa -nadie necesita una campanita para una buena noticia- pero quien
   * llama tiene que apuntar la mejora igual, porque es lo que permite volver
   * a sonar si se estropea otra vez. Sin esto, una obra que se pone en rojo,
   * se arregla y se vuelve a poner en rojo solo avisaria de la primera vez,
   * que es justo la menos grave de las dos.
   */
  it("recuperarse rearma el aviso", () => {
    const recorrido: EstadoBolsa[] = ["roja", "holgada", "roja"];
    let recordado: EstadoBolsa | null = null;
    const sonaron: EstadoBolsa[] = [];

    for (const estado of recorrido) {
      if (tocaAvisar(recordado, estado)) sonaron.push(estado);
      // Se apunta SIEMPRE, suene o no. Es la linea que rearma.
      recordado = estado;
    }

    expect(sonaron).toEqual(["roja", "roja"]);
  });

  it("sin apuntar las mejoras, el segundo rojo se perderia", () => {
    // El mismo recorrido, pero recordando solo lo avisado. Se deja escrito
    // porque es el error facil, y desde fuera no se distingue de «funciona».
    let recordado: EstadoBolsa | null = null;
    const sonaron: EstadoBolsa[] = [];

    for (const estado of ["roja", "holgada", "roja"] as EstadoBolsa[]) {
      if (tocaAvisar(recordado, estado)) {
        sonaron.push(estado);
        recordado = estado;
      }
    }

    expect(sonaron).toEqual(["roja"]);
  });
});

describe("lo que se le dice a quien lo recibe", () => {
  /**
   * Con el IMPORTE dentro y con la SALIDA nombrada. «La bolsa esta en riesgo»
   * no mueve a nadie; y un aviso del que no se sabe salir es solo una queja.
   * Es la misma linea del panel «Que falta» y del paso siguiente.
   */
  it("el aviso suave dice cuanto queda de cuanto", () => {
    const t = textoDelAviso("cerca", "12400.00", "84000.00");

    expect(t.cuerpo).toContain("12,400.00");
    expect(t.cuerpo).toContain("84,000.00");
    expect(t.cuerpo).toContain("renegociar");
  });

  it("en rojo dice en cuanto te pasaste, en positivo", () => {
    // «Te has pasado en 4.200» se lee; «te quedan -4.200» hay que traducirlo.
    const t = textoDelAviso("roja", "-4200.00", "84000.00");

    expect(t.cuerpo).toContain("4,200.00");
    expect(t.cuerpo).not.toContain("-4,200.00");
  });

  it("en cero no dice que te pasaste, porque no te pasaste", () => {
    const t = textoDelAviso("roja", "0.00", "84000.00");

    expect(t.cuerpo).toContain("No queda nada");
    expect(t.titulo).toContain("se acabó");
  });

  it("las dos salidas posibles se nombran en el rojo", () => {
    // Renegociar con el contratista, o pedir que se deduzca de los costos
    // propios. Son las dos cosas que se pueden decidir, y decirlo es lo que
    // convierte el aviso en instruccion.
    const t = textoDelAviso("roja", "-1.00", "84000.00");

    expect(t.cuerpo).toContain("renegociar");
    expect(t.cuerpo).toContain("costos propios");
  });
});

describe("el valor por defecto", () => {
  /**
   * 25 % y no 10: a un 10 % ya no queda margen de maniobra para renegociar
   * nada con un contratista, y el aviso llegaria cuando la unica salida es
   * asumirlo. Se fija aqui porque es una decision, no un numero cualquiera.
   */
  it("avisa con un cuarto de la bolsa todavia en la mano", () => {
    expect(UMBRAL_BOLSA_POR_DEFECTO).toBe(25);
    expect(estadoDeLaBolsa("26000.00", "100000.00", UMBRAL_BOLSA_POR_DEFECTO)).toBe(
      "holgada",
    );
    expect(estadoDeLaBolsa("24000.00", "100000.00", UMBRAL_BOLSA_POR_DEFECTO)).toBe(
      "cerca",
    );
  });
});
