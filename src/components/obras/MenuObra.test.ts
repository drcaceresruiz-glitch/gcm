import { describe, expect, it } from "vitest";

import { seccionActiva, type FaseMenu } from "@/components/obras/MenuObra";

const RAIZ = "/obras/x";

/**
 * Un mapa minimo, con el mismo patron real: `presupuesto` en la raiz de la
 * obra y `soloExacto`, `cronograma` con una rama que no esta en `ramas` (el
 * prefijo implicito la cubre igual), y `lookahead` con `evidencia` como
 * prefijo declarado a mano.
 */
const FASES: FaseMenu[] = [
  {
    clave: "plan",
    titulo: "Plan",
    secciones: [
      {
        clave: "presupuesto",
        titulo: "Presupuesto",
        pregunta: "",
        href: RAIZ,
        prefijos: [`${RAIZ}/importar`],
        soloExacto: true,
      },
      {
        clave: "cronograma",
        titulo: "Cronograma",
        pregunta: "",
        href: `${RAIZ}/cronograma`,
      },
    ],
  },
  {
    clave: "ejecucion",
    titulo: "Ejecución",
    secciones: [
      {
        clave: "lookahead",
        titulo: "Lookahead",
        pregunta: "",
        href: `${RAIZ}/lookahead`,
        prefijos: [`${RAIZ}/evidencia`],
      },
    ],
  },
];

describe("el bug de verdad: la raiz de la obra ya no reclama todo", () => {
  it("editar la ficha de la obra no enciende Presupuesto", () => {
    // Antes de soloExacto, esto encendia «Presupuesto» por accidente: era
    // el sintoma que el inventario marco como grave.
    expect(seccionActiva(`${RAIZ}/editar`, FASES)).toBeNull();
  });

  it("la portada de la obra si enciende Presupuesto", () => {
    expect(seccionActiva(RAIZ, FASES)).toBe("presupuesto");
  });

  it("importar sigue siendo Presupuesto: va en `prefijos`", () => {
    expect(seccionActiva(`${RAIZ}/importar`, FASES)).toBe("presupuesto");
  });
});

describe("evidencia enciende Lookahead, no Presupuesto", () => {
  it("la galeria de fotos cuelga aparte pero es del Lookahead", () => {
    expect(seccionActiva(`${RAIZ}/evidencia`, FASES)).toBe("lookahead");
  });
});

describe("el prefijo implicito sigue funcionando para las demas secciones", () => {
  it("una subruta no declarada en `ramas` igual enciende su seccion", () => {
    // cronograma/gantt no esta en `prefijos` ni en `ramas` de este mapa
    // minimo, y aun asi el prefijo implicito del propio href la cubre.
    expect(seccionActiva(`${RAIZ}/cronograma/gantt`, FASES)).toBe("cronograma");
  });
});

describe("gana el prefijo mas largo", () => {
  it("una ruta de dos niveles no se confunde con la de uno", () => {
    expect(seccionActiva(`${RAIZ}/cronograma`, FASES)).toBe("cronograma");
    expect(seccionActiva(`${RAIZ}/cronograma/gantt`, FASES)).toBe("cronograma");
  });
});

describe("una ruta sin seccion propia no inventa una", () => {
  it("devuelve null en vez de adivinar", () => {
    expect(seccionActiva(`${RAIZ}/personal`, FASES)).toBeNull();
    expect(seccionActiva("/otra/cosa", FASES)).toBeNull();
  });
});
