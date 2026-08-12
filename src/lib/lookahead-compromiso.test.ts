import { describe, it, expect } from "vitest";
import {
  estadoDePromesa,
  seLiberoATiempo,
  cumplimientoDeLiberacion,
  validarCompromisoRestriccion,
  claveDeResponsable,
  type RestriccionConPromesa,
} from "./lookahead-compromiso";

const d = (s: string) => new Date(`${s}T00:00:00Z`);
const HOY = d("2026-08-12");

/** Una restriccion abierta, sin nadie y sin fecha. Cada test enciende lo suyo. */
function r(cambios: Partial<RestriccionConPromesa> = {}): RestriccionConPromesa {
  return {
    tipo: "MATERIALES",
    resuelta: false,
    resueltaAt: null,
    fechaCompromiso: null,
    responsableUserId: null,
    responsableContactoId: null,
    ...cambios,
  };
}

describe("estadoDePromesa", () => {
  it("sin nadie asignado es «sin-asignar», que es el peor caso", () => {
    // Y hasta ahora era invisible: nadie se hacia cargo y nadie lo sabia.
    expect(estadoDePromesa(r(), HOY)).toBe("sin-asignar");
  });

  it("«sin-asignar» y «sin-fecha» son estados DISTINTOS", () => {
    // Son dos conversaciones distintas: «¿quien?» y «¿para cuando?», y las
    // resuelve gente distinta. Juntarlas obligaria a un texto vago.
    expect(estadoDePromesa(r({ responsableUserId: "u1" }), HOY)).toBe("sin-fecha");
  });

  it("distingue a tiempo, vence hoy y vencida", () => {
    const con = (fecha: string) =>
      estadoDePromesa(
        r({ responsableUserId: "u1", fechaCompromiso: d(fecha) }),
        HOY,
      );
    expect(con("2026-08-14")).toBe("a-tiempo");
    expect(con("2026-08-12")).toBe("vence-hoy");
    expect(con("2026-08-11")).toBe("vencida");
  });

  it("una resuelta esta liberada aunque su fecha hubiera pasado", () => {
    // El estado dice donde esta, no si cumplio. Lo segundo lo dice
    // `seLiberoATiempo`, y mezclarlos pintaria de rojo trabajo ya hecho.
    expect(
      estadoDePromesa(
        r({ resuelta: true, fechaCompromiso: d("2026-08-01") }),
        HOY,
      ),
    ).toBe("liberada");
  });
});

describe("seLiberoATiempo", () => {
  it("el MISMO dia cuenta como a tiempo", () => {
    // Quien prometio el jueves y lo tuvo el jueves cumplio. Castigarlo por unas
    // horas es un indicador que ensena a no comprometerse a nada.
    expect(
      seLiberoATiempo(
        r({
          resuelta: true,
          fechaCompromiso: d("2026-08-14"),
          resueltaAt: d("2026-08-14"),
        }),
      ),
    ).toBe(true);
  });

  it("un dia tarde es tarde", () => {
    expect(
      seLiberoATiempo(
        r({
          resuelta: true,
          fechaCompromiso: d("2026-08-14"),
          resueltaAt: d("2026-08-15"),
        }),
      ),
    ).toBe(false);
  });

  it("sin fecha prometida no hay nada que juzgar", () => {
    expect(seLiberoATiempo(r({ resuelta: true, resueltaAt: HOY }))).toBeNull();
  });

  it("sin fecha de resolucion se da por buena antes que acusar sin dato", () => {
    expect(
      seLiberoATiempo(r({ resuelta: true, fechaCompromiso: d("2026-08-14") })),
    ).toBe(true);
  });
});

describe("cumplimientoDeLiberacion", () => {
  it("con cero prometidas el porcentaje es NULL, no cero", () => {
    // «Nadie prometio nada» no es «todos fallaron». Es exactamente la confusion
    // que tenia la confiabilidad antes de `analizadaAt` —una obra sin analizar
    // salia al 0% como si lo hubiera hecho mal— y no se repite.
    const c = cumplimientoDeLiberacion([r(), r({ responsableUserId: "u1" })], HOY);
    expect(c.porcentaje).toBeNull();
    expect(c.sinAsignar).toBe(1);
    expect(c.sinFecha).toBe(1);
  });

  it("lo que nadie prometio NO entra en el porcentaje", () => {
    // No se puede medir lo que nadie prometio, y contarlo como fallo inventaria
    // un incumplimiento donde solo hubo silencio.
    const c = cumplimientoDeLiberacion(
      [
        // Prometida y cumplida.
        r({
          resuelta: true,
          fechaCompromiso: d("2026-08-10"),
          resueltaAt: d("2026-08-09"),
        }),
        // Resuelta pero nadie habia prometido nada: no cuenta ni a favor ni en
        // contra.
        r({ resuelta: true, resueltaAt: d("2026-08-09") }),
      ],
      HOY,
    );
    expect(c.porcentaje).toBe(100);
    expect(c.aTiempo).toBe(1);
    expect(c.tarde).toBe(0);
    expect(c.conFecha).toBe(1);
  });

  it("cuenta las vencidas abiertas, que es el numero que mueve", () => {
    const c = cumplimientoDeLiberacion(
      [
        r({ responsableUserId: "u1", fechaCompromiso: d("2026-08-10") }),
        r({ responsableContactoId: "c1", fechaCompromiso: d("2026-08-11") }),
        r({ responsableUserId: "u1", fechaCompromiso: d("2026-08-20") }),
      ],
      HOY,
    );
    expect(c.vencidasAbiertas).toBe(2);
    // Vencidas y abiertas no son «tarde»: todavia no se han liberado, asi que
    // no hay resultado que puntuar.
    expect(c.porcentaje).toBeNull();
  });

  it("mezcla a tiempo y tarde", () => {
    const c = cumplimientoDeLiberacion(
      [
        r({
          resuelta: true,
          fechaCompromiso: d("2026-08-10"),
          resueltaAt: d("2026-08-10"),
        }),
        r({
          resuelta: true,
          fechaCompromiso: d("2026-08-10"),
          resueltaAt: d("2026-08-12"),
        }),
      ],
      HOY,
    );
    expect(c.aTiempo).toBe(1);
    expect(c.tarde).toBe(1);
    expect(c.porcentaje).toBe(50);
  });

  it("una lista vacia no inventa nada", () => {
    const c = cumplimientoDeLiberacion([], HOY);
    expect(c).toEqual({
      conFecha: 0,
      aTiempo: 0,
      tarde: 0,
      vencidasAbiertas: 0,
      sinAsignar: 0,
      sinFecha: 0,
      porcentaje: null,
    });
  });
});

describe("validarCompromisoRestriccion", () => {
  const v = (responsable: string, fecha: string) =>
    validarCompromisoRestriccion({ responsable, fecha }, HOY);

  it("acepta un usuario y una fecha futura", () => {
    const res = v("u:abc", "2026-08-20");
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.datos.responsable).toEqual({ tipo: "usuario", id: "abc" });
      expect(res.datos.fecha).toEqual(d("2026-08-20"));
    }
  });

  it("acepta alguien de fuera", () => {
    const res = v("c:xyz", "");
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.datos.responsable).toEqual({ tipo: "contacto", id: "xyz" });
      expect(res.datos.fecha).toBeNull();
    }
  });

  it("acepta HOY: prometer para hoy es prometer", () => {
    expect(v("u:abc", "2026-08-12").ok).toBe(true);
  });

  it("RECHAZA una fecha pasada", () => {
    // Prometer para ayer no es una promesa: es registrar un incumplimiento por
    // adelantado, y envenenaria el indicador desde el primer dia.
    const res = v("u:abc", "2026-08-11");
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toContain("ya pasó");
  });

  it("deja poner fecha SIN responsable, y responsable SIN fecha", () => {
    // En obra se sabe antes «esto tiene que estar el jueves» que quien lo va a
    // conseguir. Exigir los dos haria que no se rellenara ninguno.
    expect(v("", "2026-08-20").ok).toBe(true);
    expect(v("u:abc", "").ok).toBe(true);
  });

  it("permite vaciar los dos: quitar la promesa es una decision valida", () => {
    const res = v("", "");
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.datos.responsable).toBeNull();
      expect(res.datos.fecha).toBeNull();
    }
  });

  it("rechaza un sujeto con forma rara en vez de adivinar", () => {
    expect(v("abc", "").ok).toBe(false);
    expect(v("u:", "").ok).toBe(false);
  });

  it("rechaza una fecha con formato invalido", () => {
    expect(v("u:abc", "20/08/2026").ok).toBe(false);
  });
});

describe("claveDeResponsable", () => {
  it("usa la MISMA clave que el reparto de avisos", () => {
    // Asi el responsable directo y el suscrito por flujo son la misma persona
    // para `repartirAvisos`, y quien llegue por las dos vias recibe UN aviso.
    expect(claveDeResponsable(r({ responsableUserId: "u1" }))).toBe("u:u1");
    expect(claveDeResponsable(r({ responsableContactoId: "c1" }))).toBe("c:c1");
    expect(claveDeResponsable(r())).toBeNull();
  });
});
