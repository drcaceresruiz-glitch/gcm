import { describe, expect, it } from "vitest";

import { nombreDeArchivo, trozoDeNombre } from "@/lib/nombre-archivo";

const dia = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

describe("un archivo se distingue de otro sin abrirlo", () => {
  /*
   * ES LA RAZON DE SER DEL MODULO. Tres de las descargas mas usadas salian
   * con nombre FIJO -«plantilla-presupuesto-meta-gcm.xlsx»-, asi que bajarlas
   * para tres obras daba «(1)», «(2)», «(3)». Hacian falta carpetas para
   * separar lo que el nombre no separaba.
   */
  it("lleva sistema, obra, documento y fecha", () => {
    expect(
      nombreDeArchivo({
        ambito: "CRIOCORD",
        documento: "presupuesto-meta",
        fecha: dia("2026-08-23"),
        extension: "xlsx",
      }),
    ).toBe("GCM_criocord_presupuesto-meta_2026-08-23.xlsx");
  });

  it("dos obras distintas dan nombres distintos", () => {
    const de = (obra: string) =>
      nombreDeArchivo({
        ambito: obra,
        documento: "presupuesto-meta",
        fecha: dia("2026-08-23"),
        extension: "xlsx",
      });

    expect(de("CRIOCORD")).not.toBe(de("Los Robles"));
  });

  it("la fecha va en ISO, para que la carpeta ordene por nombre", () => {
    // En dd/mm el 01/09 iria antes que el 02/08, y la carpeta quedaria
    // desordenada justo donde mas se acumulan los archivos.
    const agosto = nombreDeArchivo({
      ambito: "obra",
      documento: "informe",
      fecha: dia("2026-08-02"),
      extension: "pdf",
    });
    const septiembre = nombreDeArchivo({
      ambito: "obra",
      documento: "informe",
      fecha: dia("2026-09-01"),
      extension: "pdf",
    });

    expect([septiembre, agosto].sort()).toEqual([agosto, septiembre]);
  });

  it("empieza por GCM: es lo que se teclea para verlos todos", () => {
    const n = nombreDeArchivo({
      ambito: "x",
      documento: "y",
      extension: "pdf",
    });
    expect(n.startsWith("GCM_")).toBe(true);
  });

  it("sin fecha no se inventa una", () => {
    // Un archivo sin fecha propia con una fecha puesta ordenaria mal y, peor,
    // haria creer que el documento es de ese dia.
    expect(
      nombreDeArchivo({ ambito: "acme", documento: "proveedores", extension: "xlsx" }),
    ).toBe("GCM_acme_proveedores.xlsx");
  });
});

describe("el nombre viaja en una cabecera HTTP", () => {
  it("las tildes y la ñ se convierten, no se cuelan", () => {
    // `Content-Disposition` con acentos sale como simbolos raros o rompe la
    // descarga en algunos clientes de correo.
    expect(trozoDeNombre("Ampliación Ñuñoa")).toBe("ampliacion-nunoa");
  });

  it("los espacios y los simbolos se vuelven guiones", () => {
    expect(trozoDeNombre("Edificio  Los Robles / Etapa 2")).toBe(
      "edificio-los-robles-etapa-2",
    );
  });

  it("no deja comillas ni barras: romperian la cabecera o la ruta", () => {
    const sucio = trozoDeNombre('obra "rara" /../ etc');

    expect(sucio).not.toContain('"');
    expect(sucio).not.toContain("/");
    expect(sucio).not.toContain(".");
  });

  it("un nombre larguisimo se recorta y no acaba en guion", () => {
    const largo = trozoDeNombre("A".repeat(80));

    expect(largo.length).toBeLessThanOrEqual(40);
    expect(largo.endsWith("-")).toBe(false);
  });

  it("un nombre que se queda vacio no borra la parte del archivo", () => {
    // Una obra llamada «///» dejaria el trozo en blanco y dos documentos
    // distintos acabarian llamandose igual.
    expect(
      nombreDeArchivo({ ambito: "///", documento: "informe", extension: "pdf" }),
    ).toBe("GCM_sin-nombre_informe.pdf");
  });
});
