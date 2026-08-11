import { describe, expect, it } from "vitest";
import {
  construirFilasCierre,
  type CompromisoDeCierre,
  type FilaCierre,
} from "./plan-semanal";

/**
 * El caso que rompio en obra el 10 de agosto de 2026: se ajustaron los
 * compromisos, se marcaron todos como cumplidos y al cerrar la semana salio
 * «Un compromiso evaluado no pertenece a esta semana», sin salida.
 *
 * La causa no estaba en el cierre sino en el guardado: `guardarCompromisos`
 * borra los compromisos y los recrea, asi que los ids cambian. Las dos cosas
 * viven en la misma pantalla, y el formulario de cierre se habia quedado con
 * los ids del primer render.
 */

/// La primera fila, comprobando que exista: `noUncheckedIndexedAccess` esta
/// activo y un indice suelto no lo pasa.
function primera(filas: FilaCierre[]): FilaCierre {
  const f = filas[0];
  if (!f) throw new Error("se esperaba al menos una fila");
  return f;
}

function compromiso(over: Partial<CompromisoDeCierre> = {}): CompromisoDeCierre {
  return {
    id: "c1",
    descripcion: "7.1 Corte de losa",
    uid: 71,
    metaPorcentaje: null,
    cumplido: null,
    causa: null,
    notaCierre: null,
    porcentajeReal: null,
    cantidadPlan: null,
    unidad: null,
    cantidadEjec: null,
    ...over,
  };
}

describe("construirFilasCierre", () => {
  it("arranca sin tildar lo que nunca se evaluo", () => {
    // Darlo por cumplido inflaba el PPC y tildaba hasta tareas al 0%.
    const f = primera(construirFilasCierre([compromiso()]));
    expect(f.cumplido).toBe(false);
  });

  it("restaura lo ya guardado al reabrir una semana", () => {
    const f = primera(construirFilasCierre([
      compromiso({
        cumplido: true,
        causa: "CLIMA",
        notaCierre: "llovio el jueves",
        porcentajeReal: "80",
      }),
    ]));
    expect(f.cumplido).toBe(true);
    expect(f.causa).toBe("CLIMA");
    expect(f.nota).toBe("llovio el jueves");
    expect(f.porcentajeReal).toBe("80");
  });

  it("usa la meta como punto de partida del % alcanzado", () => {
    const f = primera(
      construirFilasCierre([compromiso({ metaPorcentaje: "60" })]),
    );
    expect(f.porcentajeReal).toBe("60");
  });

  it("adopta los ids NUEVOS cuando el guardado recreo los compromisos", () => {
    // Esto es el arreglo: sin adoptar el id nuevo, cerrar la semana mandaba
    // uno que ya no existia y el servidor lo rechazaba entero.
    const previas: FilaCierre[] = [
      {
        id: "VIEJO",
        descripcion: "7.1 Corte de losa",
        uid: 71,
        cumplido: true,
        causa: "PRERREQUISITO",
        nota: "",
        porcentajeReal: "100",
        cantidadEjec: "",
        cantidadPlan: null,
        unidad: null,
      },
    ];

    const f = primera(
      construirFilasCierre([compromiso({ id: "NUEVO" })], previas),
    );

    expect(f.id).toBe("NUEVO");
    // Y lo que la persona ya habia marcado NO se pierde: emparejado por uid.
    expect(f.cumplido).toBe(true);
    expect(f.porcentajeReal).toBe("100");
  });

  it("empareja las lineas libres por descripcion, que es lo unico que tienen", () => {
    const previas: FilaCierre[] = [
      {
        id: "VIEJO",
        descripcion: "Limpieza general",
        uid: null,
        cumplido: true,
        causa: "PRERREQUISITO",
        nota: "la hizo el turno noche",
        porcentajeReal: "",
        cantidadEjec: "",
        cantidadPlan: null,
        unidad: null,
      },
    ];

    const f = primera(
      construirFilasCierre(
        [compromiso({ id: "NUEVO", uid: null, descripcion: "Limpieza general" })],
        previas,
      ),
    );

    expect(f.id).toBe("NUEVO");
    expect(f.cumplido).toBe(true);
    expect(f.nota).toBe("la hizo el turno noche");
  });

  it("no arrastra nada a una fila que no estaba antes", () => {
    const previas: FilaCierre[] = [
      {
        id: "c1",
        descripcion: "7.1 Corte de losa",
        uid: 71,
        cumplido: true,
        causa: "CLIMA",
        nota: "algo",
        porcentajeReal: "100",
        cantidadEjec: "",
        cantidadPlan: null,
        unidad: null,
      },
    ];

    // Tarea distinta (uid 99): tiene que nacer limpia, no heredar el tilde de
    // su vecina.
    const f = primera(
      construirFilasCierre(
        [compromiso({ id: "c2", uid: 99, descripcion: "8.1 Canalizacion" })],
        previas,
      ),
    );

    expect(f.cumplido).toBe(false);
    expect(f.nota).toBe("");
  });

  it("una fila que desaparecio del plan no sobrevive", () => {
    // Si el residente quita una tarea de la semana, no puede seguir
    // evaluandose: mandarla al cerrar es justo lo que el servidor rechaza.
    const previas: FilaCierre[] = [
      {
        id: "c1",
        descripcion: "7.1 Corte de losa",
        uid: 71,
        cumplido: true,
        causa: "PRERREQUISITO",
        nota: "",
        porcentajeReal: "",
        cantidadEjec: "",
        cantidadPlan: null,
        unidad: null,
      },
    ];

    const filas = construirFilasCierre(
      [compromiso({ id: "c2", uid: 99, descripcion: "8.1 Canalizacion" })],
      previas,
    );

    expect(filas).toHaveLength(1);
    expect(primera(filas).uid).toBe(99);
  });
});
