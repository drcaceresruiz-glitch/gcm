import { describe, expect, it } from "vitest";

import { avisoDeRecorte, mesesEntre, validarArchivoMeta } from "@/lib/meta-excel";

/**
 * Lo que se decide sobre el Excel de la meta antes de abrirlo.
 *
 * Lo comparten DOS caminos: la pantalla de la meta y el alta de obra, donde
 * se adjunta el Excel y la obra nace con su presupuesto. Dos lecturas del
 * mismo archivo se desincronizan a la primera columna nueva -es exactamente
 * lo que costo caro con la hoja de gastos generales-, asi que se prueba la
 * puerta comun.
 *
 * APUNTA A `lib/` Y NO AL SERVICIO, y no es un detalle de gusto: el CI corre
 * las pruebas ANTES del build, que es quien genera el cliente de Prisma. Una
 * prueba que importe el servicio arrastra `lib/prisma` y revienta en CI
 * aunque en local pase -en local el cliente ya esta generado-, asi que el
 * gancho de pre-push no puede cazarlo. Paso, y costo dos despliegues rojos.
 */

function archivoFalso(nombre: string, bytes: number): File {
  return new File([new Uint8Array(bytes)], nombre);
}

describe("que archivos entran", () => {
  it("acepta los tres formatos de Excel", () => {
    for (const ext of [".xlsx", ".xlsm", ".xls"]) {
      expect(validarArchivoMeta(archivoFalso(`meta${ext}`, 10)).ok).toBe(true);
    }
  });

  it("no le importan las mayusculas de la extension", () => {
    // El archivo lo nombra una persona, y Windows lo devuelve como le parece.
    expect(validarArchivoMeta(archivoFalso("META.XLSX", 10)).ok).toBe(true);
  });

  it("un PDF se rechaza diciendo que formatos valen", () => {
    const r = validarArchivoMeta(archivoFalso("presupuesto.pdf", 10));

    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain(".xlsx");
  });

  it("un archivo vacio no es un archivo", () => {
    // El input de tipo `file` manda un File de cero bytes cuando no se eligio
    // nada. Sin esto, adjuntar «nada» intentaria abrirlo y fallaria por otro
    // sitio, con un mensaje que no ayuda.
    expect(validarArchivoMeta(archivoFalso("meta.xlsx", 0)).ok).toBe(false);
    expect(validarArchivoMeta(null).ok).toBe(false);
    expect(validarArchivoMeta(undefined).ok).toBe(false);
  });

  it("uno de mas de 8 MB se rechaza DICIENDO cuanto pesa", () => {
    // «Es muy grande» obliga a adivinar; «pesa 9,5 MB y el limite son 8» se
    // resuelve solo.
    const r = validarArchivoMeta(archivoFalso("meta.xlsx", 9 * 1024 * 1024));

    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("9.0 MB");
  });
});

describe("el plazo que se propone al crear la obra", () => {
  /*
   * En el alta no se pregunta el plazo en meses: sale de las dos fechas que
   * se acaban de teclear. Pedirlo otra vez seria pedir dos veces el mismo
   * dato, y a la segunda alguien pone otro numero.
   */
  const dia = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

  it("240 dias son 8,00 meses: se cuenta a 30 dias, como el servicio", () => {
    // A 30 dias y no por meses de calendario, que es como lo hace el resto
    // del sistema. Un mes «de verdad» tiene entre 28 y 31 y la cifra bailaria
    // segun cuando empiece la obra.
    expect(mesesEntre(dia("2026-01-01"), dia("2026-08-29"))).toBe("8.00");
  });

  it("sale a dos decimales, no redondeado a meses enteros", () => {
    // Una obra de cuarenta y cinco dias no es «un mes» ni «dos»: es 1,5, y de
    // ahi salen los meses de residente que propone la plantilla.
    expect(mesesEntre(dia("2026-01-01"), dia("2026-02-15"))).toBe("1.50");
  });

  it("una obra de un dia no da cero", () => {
    // Daria un plazo invalido y la carga se rechazaria con un mensaje sobre
    // los meses, que no es el problema.
    expect(Number(mesesEntre(dia("2026-01-01"), dia("2026-01-02")))).toBeGreaterThan(0);
  });
});

/**
 * El aviso de descripciones recortadas, camino de la pantalla.
 *
 * Se prueba aqui porque lo usan los DOS caminos que cargan el Excel -el alta
 * de obra y la pantalla de la meta-, igual que la validacion de arriba.
 */
describe("el aviso de las descripciones recortadas", () => {
  it("no dice nada cuando no se recorto ninguna", () => {
    expect(avisoDeRecorte([])).toBe("");
  });

  it("lleva el total y las filas donde mirarlas", () => {
    const parametros = new URLSearchParams(avisoDeRecorte([276, 290, 293]));

    expect(parametros.get("recortadas")).toBe("3");
    expect(parametros.get("filas")).toBe("276,290,293");
  });

  it("con muchas, nombra unas pocas pero el total sigue siendo el de verdad", () => {
    const muchas = Array.from({ length: 40 }, (_, i) => i + 10);
    const parametros = new URLSearchParams(avisoDeRecorte(muchas));

    // El total NO se recorta: es lo que impide que el aviso diga «12
    // descripciones» cuando fueron cuarenta.
    expect(parametros.get("recortadas")).toBe("40");
    expect(parametros.get("filas")?.split(",")).toHaveLength(12);
  });
});
