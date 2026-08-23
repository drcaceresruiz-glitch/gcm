import { describe, it, expect } from "vitest";
import ExcelJS from "exceljs";

import {
  generarPlantillaMeta,
  TOTAL_COSTO_EJEMPLO,
  COSTO_PROPIO_EJEMPLO,
  COSTE_MENSUAL_EJEMPLO,
} from "./plantilla-meta";
import { analizarExcel } from "./excel-presupuesto";
import { cifrasDeLaMeta } from "./costo-meta";
import { generarContractual } from "./contractual-desde-meta";

/**
 * El contrato de la plantilla de la meta: lo que GCM regala para descargar,
 * GCM lo tiene que poder importar limpio. Se genera y se pasa por los MISMOS
 * analizadores que usa el importador. Si alguien cambia las reglas y la
 * plantilla se queda atras, esto revienta antes de produccion.
 */

/** Un libro con solo la hoja de gastos, para los casos que fallan. */
describe("la hoja de costo directo de la plantilla meta", () => {
  it("la lee el MISMO importador que el presupuesto, sin un solo error", async () => {
    // Es la razon de que esta hoja vaya la primera y con las mismas columnas:
    // no hay un segundo importador que mantener.
    const r = await analizarExcel(await generarPlantillaMeta(), { propiasDeLaMeta: true });

    expect(r.errores).toEqual([]);
    expect(r.filaCabecera).not.toBeNull();
  });

  it("clasifica capitulos y partidas", async () => {
    const r = await analizarExcel(await generarPlantillaMeta(), { propiasDeLaMeta: true });
    const porCodigo = new Map(r.filas.map((f) => [f.codigo, f]));

    expect(r.totalCapitulos).toBe(2);
    expect(porCodigo.get("1.0")?.tipo).toBe("CAPITULO");
    expect(porCodigo.get("1.1")?.tipo).toBe("PARTIDA");
  });

  it("los costos propios de la meta salen SIN codigo, y por eso no van al contrato", async () => {
    /*
     * Es la mitad importante de lo que ensena la plantilla. Con codigo, un
     * andamio alquilado entraria al presupuesto del cliente como una linea
     * mas -y de ahi al cronograma, como una tarea que alguien tendria que
     * ejecutar-. Sin codigo cuesta igual, cuenta en la meta y en la bolsa, y
     * su dinero se cubre con el recargo del resto.
     */
    const r = await analizarExcel(await generarPlantillaMeta(), { propiasDeLaMeta: true });

    expect(r.propiasDeLaMeta.map((f) => f.descripcion)).toEqual([
      "Residente de obra",
      "Maestro de obra",
      "Almacenero",
      "Camioneta y combustible",
      "Carta fianza de fiel cumplimiento",
      "Póliza CAR",
      "Andamio metálico en alquiler",
      "Encofrado metálico en alquiler (varias partidas)",
    ]);

    // Y ninguno aparece entre las filas con codigo: si el residente entrara
    // al contrato con su linea, el cliente veria su sueldo.
    expect(r.filas.some((f) => f.descripcion.includes("Residente"))).toBe(false);
    expect(r.filas.some((f) => f.descripcion.includes("Andamio"))).toBe(false);
  });

  it("sin la opcion, el importador del contrato las sigue ignorando", async () => {
    // La opcion es SOLO de la hoja de la meta: en el importador del
    // presupuesto contractual una fila sin codigo es una nota o un subtitulo,
    // y recogerla meteria texto suelto en el arbol de partidas.
    const r = await analizarExcel(await generarPlantillaMeta());

    expect(r.propiasDeLaMeta).toEqual([]);
    expect(r.filas.some((f) => f.descripcion.includes("Residente"))).toBe(false);
  });

  it("suma lo esperado y no estrena al usuario con el aviso de repetidos", async () => {
    const r = await analizarExcel(await generarPlantillaMeta(), { propiasDeLaMeta: true });

    expect(r.montoTotal).toBe(TOTAL_COSTO_EJEMPLO);
    expect(r.gruposRepetidos).toEqual([]);
    expect(r.filasOcultas).toBe(0);
    // Una: el subtitulo del bloque de costos propios, que es texto y nada
    // mas. La fila de TOTAL del final no cuenta porque queda fuera de la
    // tabla, que es donde tiene que quedarse.
    expect(r.filasTextoOmitidas).toBe(1);
  });
});

describe("los sueldos y las polizas, ya dentro de la misma hoja", () => {
  /*
   * Bajaron aqui el 23 de agosto de 2026. Vivian en una hoja «Gastos
   * Generales» aparte con su propio parser y su propia suma, y esa suma podia
   * llegar en cero sin que nada avisara: una meta enseñaba 600 de costo
   * cuando eran 700, con el sueldo del residente escrito en el Excel y
   * valiendo cero. Se quito la segunda lista en vez de vigilarla.
   */
  const cifras = async () => {
    const r = await analizarExcel(await generarPlantillaMeta(), {
      propiasDeLaMeta: true,
    });
    return cifrasDeLaMeta([
      ...r.filas.map((f) => ({
        codigoRef: f.codigo as string | null,
        unidad: f.unidad,
        precioUnitario: f.precioUnitario,
        parcial: f.parcial,
      })),
      ...r.propiasDeLaMeta.map((f) => ({
        codigoRef: null,
        unidad: f.unidad,
        precioUnitario: f.precioUnitario,
        parcial: f.parcial,
      })),
    ]);
  };

  it("ya no hay una segunda hoja que pueda quedarse en cero", async () => {
    const libro = new ExcelJS.Workbook();
    await libro.xlsx.load(await generarPlantillaMeta());

    expect(libro.worksheets.map((h) => h.name)).toEqual([
      "Costo Directo",
      "Instrucciones",
    ]);
  });

  it("el sueldo del residente cuenta en el costo total", async () => {
    // LA prueba de este archivo. Si algun dia vuelve a haber dos listas, esto
    // es lo que se rompe primero.
    const c = await cifras();

    expect(c.costoPropio).toBe(COSTO_PROPIO_EJEMPLO);
    expect(c.costoTotal).toBe(TOTAL_COSTO_EJEMPLO);
    expect(c.costoTotal).not.toBe(c.costoDirecto);
  });

  it("un sueldo va por MESES, y de ahi sale lo que cuesta el atraso", async () => {
    // Escrito como 8 x 6.500 dice lo que cuesta estirarse. Escrito como
    // 52.000 a secas no dice nada, y esa es la razon de pedir la unidad.
    const c = await cifras();

    expect(c.costeMensualDelAtraso).toBe(COSTE_MENSUAL_EJEMPLO);
    // Residente, maestro, almacenero, camioneta y andamio.
    expect(c.lineasPorMes).toBe(5);
  });

  it("lo que no depende del plazo no entra en el coste del atraso", async () => {
    // Una carta fianza no cuesta mas porque la obra se alargue: va en «glb».
    const r = await analizarExcel(await generarPlantillaMeta(), {
      propiasDeLaMeta: true,
    });
    const fianza = r.propiasDeLaMeta.find((f) =>
      f.descripcion.startsWith("Carta fianza"),
    )!;

    expect(fianza.unidad).toBe("glb");
  });

  it("los meses se recortan al plazo real de la obra", async () => {
    /*
     * Sin esto, la plantilla de una obra de dos meses propone ocho meses de
     * residente y quien la rellena deprisa se lleva un costo cuatro veces
     * mayor que su obra. Y el parcial se rehace: dejarlo con el de ocho meses
     * seria peor que no recortar.
     */
    const r = await analizarExcel(await generarPlantillaMeta(2), {
      propiasDeLaMeta: true,
    });
    const residente = r.propiasDeLaMeta.find(
      (f) => f.descripcion === "Residente de obra",
    )!;

    expect(residente.metrado).toBe("2.0000");
    expect(residente.parcial).toBe("13000.00");

    // La fianza no se toca: no se mide en meses.
    const fianza = r.propiasDeLaMeta.find((f) =>
      f.descripcion.startsWith("Carta fianza"),
    )!;
    expect(fianza.parcial).toBe("9500.00");
  });
});

describe("la columna de recargo, y donde se puede escribir", () => {
  /*
   * `generarContractual` siempre supo recargar una PARTIDA -resuelve
   * empezando por el codigo de la propia linea y solo sube al padre si esa no
   * lo trae- pero hasta el 23 de agosto de 2026 esta celda quedaba bloqueada
   * en las partidas y el servicio filtraba `tipo: "CAPITULO"`. El motor sabia
   * hacerlo y no habia por donde pedirlo.
   */
  const hoja = async () => {
    const libro = new ExcelJS.Workbook();
    await libro.xlsx.load(await generarPlantillaMeta());
    return libro.worksheets[0]!;
  };

  /// La fila de un ejemplo, buscada por su descripcion.
  const filaDe = (h: ExcelJS.Worksheet, texto: string): number => {
    for (let f = 5; f <= 30; f++) {
      if (String(h.getRow(f).getCell(2).value ?? "").startsWith(texto)) return f;
    }
    throw new Error(`No se encontro la fila de ${texto}`);
  };

  it("una PARTIDA acepta su propio recargo", async () => {
    const h = await hoja();
    const g = h.getRow(filaDe(h, "Cartel de identificación")).getCell(7);

    expect(g.protection?.locked).toBe(false);
  });

  it("un CAPITULO tambien, como siempre", async () => {
    const h = await hoja();
    const g = h.getRow(filaDe(h, "OBRAS PROVISIONALES")).getCell(7);

    expect(g.protection?.locked).toBe(false);
  });

  it("un SUELDO no: no se le factura al cliente, no hay que recargar", async () => {
    // No es un descuido que este bloqueada. Una linea sin Item no tiene
    // codigo con el que nombrarla, y el servicio la rechaza igual.
    const h = await hoja();
    const g = h.getRow(filaDe(h, "Residente de obra")).getCell(7);

    // `locked: true` es el valor por defecto de Excel y el archivo no lo
    // escribe, asi que al releer viene `undefined`. Lo que se comprueba es
    // que NO este desbloqueada, y la nota -que si viaja- prueba que la celda
    // esta asi a proposito y no por descuido.
    expect(g.protection?.locked).not.toBe(false);
    expect(String(g.note ?? "")).toContain("no se recarga");
  });

  it("las filas vacias tambien la aceptan, sean lo que sean", async () => {
    const h = await hoja();
    expect(h.getRow(200).getCell(7).protection?.locked).toBe(false);
  });
});

describe("un recargo escrito en una PARTIDA llega hasta el contractual", () => {
  /*
   * REPORTADO EL 23 DE AGOSTO DE 2026 con captura: un 10 % escrito en la fila
   * de la partida 1.1 desaparecia al importar, sin un solo aviso.
   *
   * El recargo por partida estaba cerrado en TRES sitios distintos, y
   * abrirlos de uno en uno no arreglaba nada porque el dato moria en el
   * siguiente: la celda del Excel estaba bloqueada, el servicio filtraba
   * `tipo: "CAPITULO"` y el importador ponia `porcentajeRecargo: null` fijo
   * en la rama de partida. Esta prueba recorre el camino ENTERO -escribir en
   * la celda, importar, generar- porque es la unica forma de que no vuelva a
   * pasar que una pieza este abierta y la de al lado no.
   */
  const conRecargoEnLa11 = async (pct: number) => {
    const libro = new ExcelJS.Workbook();
    await libro.xlsx.load(await generarPlantillaMeta());
    const hoja = libro.worksheets[0]!;

    // Fila 6, columna G: la partida 1.1 del ejemplo. Es literalmente la celda
    // de la captura.
    expect(hoja.getRow(6).getCell(1).value).toBe("1.1");
    hoja.getRow(6).getCell(7).value = pct;

    const salida = await libro.xlsx.writeBuffer();
    return analizarExcel(
      new Uint8Array(salida as unknown as Uint8Array).buffer as ArrayBuffer,
      { propiasDeLaMeta: true },
    );
  };

  it("el importador lo lee, en vez de tirarlo", async () => {
    const r = await conRecargoEnLa11(10);
    const p11 = r.filas.find((f) => f.codigo === "1.1")!;

    expect(p11.porcentajeRecargo).toBe("10.00");
  });

  it("y el contractual lo aplica: gana sobre el de su capitulo", async () => {
    const r = await conRecargoEnLa11(10);
    const c = generarContractual(
      r.filas.map((f) => ({
        codigo: f.codigo,
        descripcion: f.descripcion,
        tipo: f.tipo,
        nivel: f.nivel,
        orden: f.fila,
        unidad: f.unidad,
        metrado: f.metrado,
        precioUnitario: f.precioUnitario,
        parcial: f.parcial,
        porcentajeRecargo: f.porcentajeRecargo,
        fechaInicio: f.fechaInicio,
        fechaFin: f.fechaFin,
      })),
    );

    const p11 = c.lineas.find((l) => l.codigo === "1.1")!;
    expect(p11.codigoDelRecargo).toBe("1.1");
    expect(p11.porcentajeAplicado).toBe("10.00");

    // Y su hermana sigue con el del capitulo: no se contagia.
    const p12 = c.lineas.find((l) => l.codigo === "1.2")!;
    expect(p12.codigoDelRecargo).toBe("1.0");
  });

  it("sin tocar nada, la partida sigue heredando", async () => {
    // El control: si esto pasara igual con y sin recargo, la prueba de arriba
    // no probaria nada.
    const r = await analizarExcel(await generarPlantillaMeta(), {
      propiasDeLaMeta: true,
    });

    expect(r.filas.find((f) => f.codigo === "1.1")!.porcentajeRecargo).toBeNull();
  });
});

describe("cuantas filas vienen listas, y con que", () => {
  /*
   * Hasta el 23 de agosto de 2026 eran SESENTA, y parecian de sobra hasta que
   * se miro un presupuesto de verdad: CRIOCORD tiene 368 partidas. Quien
   * pasaba de la fila 64 anadia filas a mano, y una fila a mano nace sin
   * formulas: el Parcial y el Contractual se quedan en blanco y el
   * presupuesto sale corto sin que nada lo avise.
   */
  it("la ultima fila preparada tiene sus dos formulas, igual que la primera", async () => {
    const libro = new ExcelJS.Workbook();
    await libro.xlsx.load(await generarPlantillaMeta());
    const hoja = libro.worksheets[0]!;

    // Cabecera en la 4, asi que la ultima preparada es la 404.
    const ultima = hoja.getRow(404);
    const parcial = ultima.getCell(6).value as { formula?: string };
    const contractual = ultima.getCell(8).value as { formula?: string };

    expect(parcial?.formula).toContain("D404*E404");
    expect(contractual?.formula).toContain("SUMPRODUCT");
  });

  it("caben las 368 partidas de una obra real, con sitio de sobra", async () => {
    const libro = new ExcelJS.Workbook();
    await libro.xlsx.load(await generarPlantillaMeta());
    const hoja = libro.worksheets[0]!;

    const fila368 = hoja.getRow(4 + 368);
    expect((fila368.getCell(6).value as { formula?: string })?.formula).toBeTruthy();
  });
});

describe("la proteccion deja salir", () => {
  /*
   * Reportado el 23 de agosto de 2026 con captura: copiar una fila y darle a
   * Pegar sale «La celda o el gráfico que intenta cambiar están en una hoja
   * protegida». No es un permiso que falte -insertar SI esta permitido-: es
   * que pegar ESCRIBE sobre las celdas de formula, que estan bloqueadas. La
   * operacion que funciona es «Insertar celdas copiadas».
   *
   * Lo que se fija aqui es lo unico que puede regresar en silencio: que
   * insertar siga permitido y que no aparezca una contraseña.
   */
  it("permite insertar filas y no pide contraseña", async () => {
    const libro = new ExcelJS.Workbook();
    await libro.xlsx.load(await generarPlantillaMeta());

    // Solo la hoja de datos: «Instrucciones» es texto y no se protege.
    for (const hoja of [libro.worksheets[0]!]) {
      // `sheetProtection` existe al cargar pero los tipos de ExcelJS no lo
      // declaran; de ahi el puente.
      const p = (
        hoja as unknown as {
          sheetProtection?: {
            insertRows?: boolean;
            deleteRows?: boolean;
            spinCount?: number;
          };
        }
      ).sheetProtection;
      expect(p?.insertRows).toBe(true);
      expect(p?.deleteRows).toBe(true);
      // Una hoja protegida CON contraseña no se puede desbloquear, y entonces
      // el aviso de Excel no tiene salida.
      expect(p?.spinCount).toBeUndefined();
    }
  });

  it("la leyenda nombra el menu que de verdad funciona, no «pegar»", async () => {
    const libro = new ExcelJS.Workbook();
    await libro.xlsx.load(await generarPlantillaMeta());
    const leyenda = String(libro.worksheets[0]!.getCell("A3").value);

    expect(leyenda).toContain("Insertar celdas copiadas");
    expect(leyenda).toContain("Desproteger hoja");
  });
});

describe("las formulas de la plantilla se abren en cualquier programa", () => {
  it("no usan N() sobre un rango: solo Excel la evalua como matriz", async () => {
    /*
     * Con `N(rango)` dentro de un SUMPRODUCT, Google Sheets y LibreOffice
     * colapsan el rango a su primera celda y el producto entero sale CERO:
     * la columna Contractual aparecia a 0,00 en la hoja descargada. La
     * plantilla se abre en lo que cada constructora tenga.
     */
    const libro = new ExcelJS.Workbook();
    await libro.xlsx.load(await generarPlantillaMeta());
    const hoja = libro.worksheets[0]!;

    const formulas: string[] = [];
    hoja.eachRow((fila) => {
      fila.eachCell((celda) => {
        const v = celda.value;
        if (v && typeof v === "object" && "formula" in v) {
          formulas.push((v as { formula: string }).formula);
        }
      });
    });

    expect(formulas.length).toBeGreaterThan(0);
    expect(formulas.filter((f) => /N\(\$?[A-Z]+\$?\d+:/.test(f))).toEqual([]);
    expect(formulas.some((f) => f.includes("ISNUMBER("))).toBe(true);
  });

  it("las celdas calculadas traen su resultado, para que se vean sin recalcular", async () => {
    // Un visor que no recalcula -una vista previa de correo, el explorador-
    // ensena la celda vacia si el archivo no trae el valor cacheado.
    const libro = new ExcelJS.Workbook();
    await libro.xlsx.load(await generarPlantillaMeta());
    const hoja = libro.worksheets[0]!;

    // Fila 5 es el primer capitulo del ejemplo, con su 18 % de recargo.
    const contractual = hoja.getRow(5).getCell("H").value as { result?: number };
    expect(contractual.result).toBeCloseTo(2312.8, 2);
  });
});

describe("una fecha escrita como TEXTO", () => {
  /**
   * Pasa constantemente: se pega desde otro archivo, o la columna quedo con
   * formato de texto y Excel guarda "01/08/2026" como cadena en vez de como
   * fecha. Hasta hoy eso se descartaba EN SILENCIO y la partida entraba sin
   * fechas: el usuario creia haberlas cargado y solo se enteraba al ver la
   * EDT entera sin programar.
   */
  async function conTextoEnLasFechas(
    codigo: string,
    inicio: unknown,
    fin: unknown,
  ): Promise<ArrayBuffer> {
    const libro = new ExcelJS.Workbook();
    await libro.xlsx.load(await generarPlantillaMeta());
    const hoja = libro.worksheets[0]!;

    let filaPartida: ExcelJS.Row | null = null;
    hoja.eachRow((fila) => {
      if (fila.getCell(1).value === codigo) filaPartida = fila;
    });
    if (!filaPartida) throw new Error(`No se encontro la partida ${codigo}.`);

    (filaPartida as ExcelJS.Row).getCell(9).value = inicio as never;
    (filaPartida as ExcelJS.Row).getCell(10).value = fin as never;

    return (await libro.xlsx.writeBuffer()) as ArrayBuffer;
  }

  const analizar = async (inicio: unknown, fin: unknown) =>
    analizarExcel(await conTextoEnLasFechas("1.1", inicio, fin), {
      propiasDeLaMeta: true,
    });

  it("dd/mm/aaaa se entiende, que es como se escribe en obra", async () => {
    const r = await analizar("01/08/2026", "15/08/2026");
    const p = r.filas.find((f) => f.codigo === "1.1");

    expect(r.errores).toEqual([]);
    expect(p?.fechaInicio).toBe("2026-08-01");
    expect(p?.fechaFin).toBe("2026-08-15");
  });

  it("con guiones o puntos tambien", async () => {
    const r = await analizar("1-8-2026", "15.8.2026");
    const p = r.filas.find((f) => f.codigo === "1.1");

    expect(r.errores).toEqual([]);
    expect(p?.fechaInicio).toBe("2026-08-01");
  });

  it("aaaa-mm-dd tambien, que es lo que exporta cualquier sistema", async () => {
    const r = await analizar("2026-08-01", "2026-08-15");
    expect(r.filas.find((f) => f.codigo === "1.1")?.fechaInicio).toBe("2026-08-01");
  });

  it("lo que no se entiende da ERROR, no se ignora callando", async () => {
    const r = await analizar("agosto", "15/08/2026");

    expect(r.errores).toHaveLength(1);
    expect(r.errores[0]!.mensaje).toContain("agosto");
    expect(r.errores[0]!.mensaje).toContain("no se entiende como fecha");
    // Y la partida no entra a medias: se para y se dice cual es.
    expect(r.filas.some((f) => f.codigo === "1.1")).toBe(false);
  });

  it("un 31 de febrero no se convierte en marzo sin avisar", async () => {
    const r = await analizar("31/02/2026", "15/03/2026");

    expect(r.errores).toHaveLength(1);
    expect(r.errores[0]!.columna).toBe("fecha inicio");
  });

  it("el ano de dos cifras se rechaza: 26 puede ser 1926", async () => {
    // Adivinar el siglo en un contrato no es aceptable.
    const r = await analizar("01/08/26", "15/08/26");
    expect(r.errores).toHaveLength(1);
  });

  it("una celda vacia sigue siendo una partida sin fechas, sin error", async () => {
    const r = await analizar(null, null);

    expect(r.errores).toEqual([]);
    expect(r.filas.find((f) => f.codigo === "1.1")?.fechaInicio).toBeNull();
  });
});

describe("las fechas opcionales de la plantilla meta", () => {
  /**
   * La plantilla no trae fechas de ejemplo a proposito (demuestra que son
   * opcionales), asi que aqui se escribe una a mano sobre el libro ya
   * generado -mismo mecanismo que usa `generarPlantillaMeta`, ExcelJS
   * escribiendo un `Date`- y se vuelve a analizar. Esto es lo que certifica
   * que la fecha sobrevive el viaje sin correrse un dia por la zona horaria
   * de Peru: si `leerFecha` usara getters locales en vez de UTC, esta prueba
   * fallaria.
   */
  async function conFechaEnLaPartida(
    codigo: string,
    fechaInicio: Date,
    fechaFin: Date,
  ): Promise<ArrayBuffer> {
    const libro = new ExcelJS.Workbook();
    await libro.xlsx.load(await generarPlantillaMeta());
    const hoja = libro.worksheets[0]!;

    let filaPartida: ExcelJS.Row | null = null;
    hoja.eachRow((fila) => {
      if (fila.getCell(1).value === codigo) filaPartida = fila;
    });
    if (!filaPartida) throw new Error(`No se encontro la partida ${codigo} en la plantilla.`);

    (filaPartida as ExcelJS.Row).getCell(9).value = fechaInicio;
    (filaPartida as ExcelJS.Row).getCell(10).value = fechaFin;

    return (await libro.xlsx.writeBuffer()) as ArrayBuffer;
  }

  it("una partida con fecha sale con esa fecha, sin correrse un dia", async () => {
    const r = await analizarExcel(
      await conFechaEnLaPartida(
        "1.1",
        new Date("2026-09-01T00:00:00.000Z"),
        new Date("2026-09-15T00:00:00.000Z"),
      ),
    );

    expect(r.errores).toEqual([]);
    const porCodigo = new Map(r.filas.map((f) => [f.codigo, f]));
    expect(porCodigo.get("1.1")?.fechaInicio).toBe("2026-09-01");
    expect(porCodigo.get("1.1")?.fechaFin).toBe("2026-09-15");
  });

  it("una partida sin fecha (el ejemplo tal cual) sale con null, no con error", async () => {
    const r = await analizarExcel(await generarPlantillaMeta(), { propiasDeLaMeta: true });
    const porCodigo = new Map(r.filas.map((f) => [f.codigo, f]));

    expect(r.errores).toEqual([]);
    expect(porCodigo.get("2.1")?.fechaInicio).toBeNull();
    expect(porCodigo.get("2.1")?.fechaFin).toBeNull();
  });

  it("solo una de las dos fechas es un error bloqueante", async () => {
    const libro = new ExcelJS.Workbook();
    await libro.xlsx.load(await generarPlantillaMeta());
    const hoja = libro.worksheets[0]!;
    let filaPartida: ExcelJS.Row | null = null;
    hoja.eachRow((fila) => {
      if (fila.getCell(1).value === "1.1") filaPartida = fila;
    });
    (filaPartida as unknown as ExcelJS.Row).getCell(9).value = new Date("2026-09-01T00:00:00.000Z");
    // Fecha fin se deja en blanco a proposito.

    const r = await analizarExcel((await libro.xlsx.writeBuffer()) as ArrayBuffer);

    expect(r.errores).toHaveLength(1);
    expect(r.errores[0]!.mensaje).toContain("no la otra");
  });
});

describe("el recargo que genera el presupuesto contractual", () => {
  it("llega al importador, y solo en los capitulos", async () => {
    const r = await analizarExcel(await generarPlantillaMeta(), { propiasDeLaMeta: true });
    const porCodigo = new Map(r.filas.map((f) => [f.codigo, f]));

    expect(porCodigo.get("1.0")?.porcentajeRecargo).toBe("18.00");
    expect(porCodigo.get("2.0")?.porcentajeRecargo).toBe("15.00");
    // El bloque de costos propios NO lleva recargo: no va al contrato, asi
    // que no hay nada que recargar.

    // El recargo es del capitulo entero: una partida no lo lleva.
    expect(porCodigo.get("1.1")?.porcentajeRecargo).toBeNull();
  });

  it("no le roba la columna al parcial", async () => {
    /**
     * La columna se llama "Contractual" y no "Total contractual" por esto.
     *
     * El alias de `parcial` incluye "total", "monto" e "importe", y la
     * deteccion admite prefijos: una cabecera que empezara por cualquiera de
     * esos podria quedarse con la columna del importe real, y el presupuesto
     * entraria inflado sin que nada avisara.
     */
    const r = await analizarExcel(await generarPlantillaMeta(), { propiasDeLaMeta: true });

    expect(r.columnasDetectadas["parcial"]).toBe("Parcial");
    expect(r.montoTotal).toBe(TOTAL_COSTO_EJEMPLO);
  });
});
