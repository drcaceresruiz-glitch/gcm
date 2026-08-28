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
    const g = h.getRow(filaDe(h, "Cartel de identificación")).getCell(10);

    expect(g.protection?.locked).toBe(false);
  });

  it("un CAPITULO tambien, como siempre", async () => {
    const h = await hoja();
    const g = h.getRow(filaDe(h, "OBRAS PROVISIONALES")).getCell(10);

    expect(g.protection?.locked).toBe(false);
  });

  it("un SUELDO no: no se le factura al cliente, no hay que recargar", async () => {
    // No es un descuido que este bloqueada. Una linea sin Item no tiene
    // codigo con el que nombrarla, y el servicio la rechaza igual.
    const h = await hoja();
    const g = h.getRow(filaDe(h, "Residente de obra")).getCell(10);

    // `locked: true` es el valor por defecto de Excel y el archivo no lo
    // escribe, asi que al releer viene `undefined`. Lo que se comprueba es
    // que NO este desbloqueada, y la nota -que si viaja- prueba que la celda
    // esta asi a proposito y no por descuido.
    expect(g.protection?.locked).not.toBe(false);
    expect(String(g.note ?? "")).toContain("no se recarga");
  });

  it("las filas vacias tambien la aceptan, sean lo que sean", async () => {
    const h = await hoja();
    expect(h.getRow(200).getCell(10).protection?.locked).toBe(false);
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
    hoja.getRow(6).getCell(10).value = pct;

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

describe("una fila metida a mano, sin formulas, entra igual", () => {
  /*
   * Es lo que hace que anadir filas sea facil, y no se sabia: el importador
   * calcula el parcial con el metrado y el precio cuando la celda viene
   * vacia -«Sin subtotal en el archivo, se calcula», en
   * `excel-presupuesto.ts`-. O sea que insertar una fila en blanco y escribir
   * SIEMPRE funciono; lo que sobraba era el procedimiento que la plantilla
   * enseñaba.
   *
   * Se fija aqui porque toda la simplificacion del texto depende de ello: si
   * algun dia el importador dejara de calcular, la instruccion pasaria a ser
   * un consejo que hace perder dinero.
   */
  const conFilaAMano = async () => {
    const libro = new ExcelJS.Workbook();
    await libro.xlsx.load(await generarPlantillaMeta());
    const hoja = libro.worksheets[0]!;

    const f = hoja.getRow(25);
    f.getCell(1).value = "1.3";
    f.getCell(2).value = "Partida escrita a mano";
    f.getCell(3).value = "m2";
    f.getCell(4).value = 10;
    f.getCell(5).value = 25;
    // Sin formula en Parcial: asi nace una fila insertada en blanco.
    f.getCell(6).value = null;

    const salida = await libro.xlsx.writeBuffer();
    return analizarExcel(
      new Uint8Array(salida as unknown as Uint8Array).buffer as ArrayBuffer,
      { propiasDeLaMeta: true },
    );
  };

  it("su importe se calcula, y sin un solo error", async () => {
    const r = await conFilaAMano();
    const nueva = r.filas.find((x) => x.codigo === "1.3")!;

    expect(nueva.parcial).toBe("250.00");
    expect(r.errores).toEqual([]);
  });

  it("y suma al total, no se pierde por el camino", async () => {
    const r = await conFilaAMano();
    expect(r.montoTotal).toBe("141428.00");
  });
});

describe("el TOTAL del pie cuenta lo mismo que GCM", () => {
  /*
   * La formula exigia `$A<>""`, o sea que solo sumaba las filas CON codigo.
   * El dia que los sueldos bajaron al bloque sin Item eso dejo fuera 129.820
   * soles: la hoja enseñaba un total y GCM importaba otro, y el total del pie
   * es justo lo que se mira antes de subir el archivo.
   */
  it("incluye los costos propios, no solo las partidas", async () => {
    const libro = new ExcelJS.Workbook();
    await libro.xlsx.load(await generarPlantillaMeta());
    const celda = libro.worksheets[0]!.getRow(406).getCell(6).value as {
      formula?: string;
      result?: number;
    };

    expect(celda.result).toBe(Number(TOTAL_COSTO_EJEMPLO));
    // La condicion que los excluia ya no esta.
    expect(celda.formula).not.toContain('<>""');
  });

  it("suma la columna Parcial saltandose los capitulos", async () => {
    const libro = new ExcelJS.Workbook();
    await libro.xlsx.load(await generarPlantillaMeta());
    const f = libro.worksheets[0]!.getRow(406).getCell(6).value as {
      formula?: string;
    };

    /*
     * Ya no hacen falta dos sumandos: cada fila trae su Parcial calculado
     * -la partida multiplica, el capitulo suma sus hijas-, asi que el total
     * solo tiene que saltarse las cabeceras para no contar dos veces.
     */
    expect(f.formula).toBe("SUMPRODUCT($D$5:$D$404,$E$5:$E$404)");
  });

  it("sin `N(rango)`, que solo funciona dentro de Excel", async () => {
    const libro = new ExcelJS.Workbook();
    await libro.xlsx.load(await generarPlantillaMeta());
    const f = libro.worksheets[0]!.getRow(406).getCell(6).value as {
      formula?: string;
    };

    expect(f.formula).not.toMatch(/\bN\(/);
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
    const contractual = ultima.getCell(11).value as { formula?: string };

    expect(parcial?.formula).toContain("D404*E404");
    expect(contractual?.formula).toContain("$F404*(1+$J404/100)");

    /*
     * Y NO suma nada, porque no tiene nada debajo. Con el rango al reves
     * -`$A$405:$A$404`- Excel lo ordena solo y acaba incluyendo esta misma
     * fila: referencia circular.
     */
    expect(parcial?.formula).not.toContain("$A$405");

    // La penultima si suma: ahi todavia puede colgar algo.
    const penultima = hoja.getRow(403).getCell(6).value as { formula?: string };
    expect(penultima?.formula).toContain("SUMPRODUCT(");
  });

  it("caben las 368 partidas de una obra real, con sitio de sobra", async () => {
    const libro = new ExcelJS.Workbook();
    await libro.xlsx.load(await generarPlantillaMeta());
    const hoja = libro.worksheets[0]!;

    const fila368 = hoja.getRow(4 + 368);
    expect((fila368.getCell(6).value as { formula?: string })?.formula).toBeTruthy();
  });
});

describe("nada estorba al llenar la hoja", () => {
  /*
   * ESTE BLOQUE CAMBIO DE BANDO EL 27/08/2026, y conviene saber por que.
   *
   * Nacio defendiendo la proteccion: que dejara insertar filas y que no
   * pidiera contraseña. Venia del reporte del 23 de agosto -copiar una fila y
   * darle a Pegar salia «La celda o el grafico que intenta cambiar estan en
   * una hoja protegida»-, que entonces se resolvio enseñando el menu que si
   * funcionaba.
   *
   * El cliente pidio despues lo que ese rodeo escondia: traerse su
   * presupuesto entero pegandolo. Asi que ahora se fija lo contrario -que no
   * haya proteccion ninguna- y lo que se conserva de aquello es lo unico que
   * de verdad importaba: que se puedan añadir filas donde haga falta y que la
   * leyenda diga como, sin procedimientos de tres pasos.
   */
  it("no hay proteccion que quitar, ni con contraseña ni sin ella", async () => {
    const libro = new ExcelJS.Workbook();
    await libro.xlsx.load(await generarPlantillaMeta());

    // `sheetProtection` existe al cargar pero los tipos de ExcelJS no lo
    // declaran; de ahi el puente.
    const p = (
      libro.worksheets[0]! as unknown as { sheetProtection?: unknown }
    ).sheetProtection;

    expect(p).toBeFalsy();
  });

  it("la leyenda dice lo simple: pega lo tuyo y escribe", async () => {
    /*
     * Antes decia «copia una fila vacia y usa Insertar celdas copiadas». Era
     * cierto y era innecesario: el importador YA calcula el parcial con el
     * metrado y el precio cuando la celda viene vacia. Se estaba enseñando un
     * procedimiento de tres pasos para un problema que no existia, y el
     * usuario lo dijo: «no me queda claro como agregar filas, se me hace
     * dificil».
     *
     * El truco de copiar la fila sigue documentado en la hoja de
     * instrucciones, donde toca: sirve para VER el parcial en Excel, no para
     * que el presupuesto salga bien.
     */
    const libro = new ExcelJS.Workbook();
    await libro.xlsx.load(await generarPlantillaMeta());
    const leyenda = String(libro.worksheets[0]!.getCell("A3").value);

    expect(leyenda).toContain("Pega aquí");
    expect(leyenda).toContain("GCM lo calcula");
    // Y no vuelve a pedir el rodeo como si fuera obligatorio.
    expect(leyenda).not.toContain("Insertar celdas copiadas");
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
    /*
     * NI UN `SUMPRODUCT` CON UN `IF` DENTRO, que es la version cara de la
     * misma leccion. `IF(ISNUMBER(rango),rango,0)` dentro de un SUMPRODUCT
     * solo se evalua como matriz si la formula se introduce como matricial;
     * escrita normal, Excel devuelve #!VALOR! y el TOTAL COSTO DIRECTO de la
     * plantilla salia **0,00** en el archivo que se descargaba.
     *
     * No lo cazo ninguna prueba porque ExcelJS NO CALCULA: lee el resultado
     * que nosotros escribimos junto a la formula, asi que la bateria veia el
     * numero correcto mientras el usuario abria un cero. Comprobar la forma
     * es lo unico que se puede hacer sin Excel delante; cuando se toquen
     * estas formulas, hay que abrir el archivo de verdad.
     */
    const matricialEncubierta = formulas.filter((f) => {
      const i = f.indexOf("SUMPRODUCT(");
      if (i < 0) return false;
      // Un `IF` sobre una CELDA es inofensivo -el prefijo del capitulo sale
      // asi-. El que rompe es el que abarca un RANGO, porque solo se evalua
      // elemento a elemento en una formula matricial.
      return /IF\([^()]*\$?[A-Z]+\$?\d+:/.test(f.slice(i));
    });
    expect(matricialEncubierta).toEqual([]);
  });

  it("las celdas calculadas traen su resultado, para que se vean sin recalcular", async () => {
    // Un visor que no recalcula -una vista previa de correo, el explorador-
    // ensena la celda vacia si el archivo no trae el valor cacheado.
    const libro = new ExcelJS.Workbook();
    await libro.xlsx.load(await generarPlantillaMeta());
    const hoja = libro.worksheets[0]!;

    // Fila 5 es el primer capitulo del ejemplo, con su 18 % de recargo.
    const contractual = hoja.getRow(5).getCell("K").value as { result?: number };
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

    (filaPartida as ExcelJS.Row).getCell(12).value = inicio as never;
    (filaPartida as ExcelJS.Row).getCell(13).value = fin as never;

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

    (filaPartida as ExcelJS.Row).getCell(12).value = fechaInicio;
    (filaPartida as ExcelJS.Row).getCell(13).value = fechaFin;

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
    (filaPartida as unknown as ExcelJS.Row).getCell(12).value = new Date("2026-09-01T00:00:00.000Z");
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

/**
 * La hoja se entrega SIN protección.
 *
 * Pedido por el cliente el 27 de agosto de 2026: quiere pegar de una vez los
 * capitulos, partidas y subpartidas que ya tiene en su propio Excel, y una
 * hoja protegida corta el pegado en cuanto toca una celda con formula. Antes
 * habia que enseñar el rodeo de «Insertar celdas copiadas»; ahora no hay
 * rodeo que enseñar.
 */
describe("la plantilla se puede llenar pegando", () => {
  const hojaCosto = async () => {
    const libro = new ExcelJS.Workbook();
    await libro.xlsx.load(await generarPlantillaMeta());
    return libro.worksheets[0]!;
  };

  it("la hoja no viene protegida", async () => {
    const h = await hojaCosto();

    // ExcelJS marca la hoja protegida con `sheetProtection` en el modelo. Sin
    // proteccion no escribe el elemento, asi que llega vacio.
    const modelo = h as unknown as { sheetProtection?: unknown };
    expect(modelo.sheetProtection).toBeFalsy();
  });

  it("las celdas calculadas siguen avisando con gris y nota", async () => {
    const h = await hojaCosto();

    // La columna Parcial de la primera fila de datos: se calcula sola.
    const parcial = h.getRow(5).getCell(6);
    expect(parcial.fill).toBeTruthy();
    expect(String(parcial.note ?? "")).not.toBe("");
  });

  it("la leyenda invita a pegar y explica que el Parcial se recalcula", async () => {
    const h = await hojaCosto();
    const leyenda = String(h.getCell("A3").value ?? "");

    expect(leyenda).toContain("Pega aquí tus capítulos");
    expect(leyenda).toContain("no está protegida");
    // Lo que evita el susto al ver la columna gris en blanco despues de pegar.
    expect(leyenda).toContain("GCM lo calcula");
  });

  it("ya no manda a nadie al menu de «Insertar celdas copiadas» para pegar", async () => {
    const libro = new ExcelJS.Workbook();
    await libro.xlsx.load(await generarPlantillaMeta());
    const instrucciones = libro.worksheets.find((h) => h.name === "Instrucciones")!;

    let texto = "";
    instrucciones.eachRow((fila) => {
      texto += String(fila.getCell(2).value ?? "") + "\n";
    });

    // El rodeo sigue mencionado como truco para VER el Parcial al insertar una
    // fila, que es legitimo; lo que no puede quedar es la vieja advertencia de
    // que la hoja esta protegida, porque ya no lo esta.
    expect(texto).not.toContain("Desproteger hoja");
    expect(texto).toContain("la hoja no está protegida");
  });
});

/**
 * PEGAR ENCIMA NO CUESTA DINERO, y es lo que sostiene que la hoja ya no se
 * proteja.
 *
 * Al pegar desde otro Excel, las celdas de destino se sobrescriben: las
 * columnas Parcial y Contractual pierden su formula y se quedan en blanco.
 * El argumento del cambio es que eso da igual porque el importador recalcula.
 * Aqui se comprueba en vez de suponerlo: se simula el pegado -datos escritos
 * encima, formulas borradas- y se pasa el archivo por el importador de verdad.
 */
describe("un presupuesto pegado encima de la plantilla", () => {
  /** Escribe una partida como la escribiria un pegado: sin formulas. */
  async function plantillaConPegado(): Promise<ArrayBuffer> {
    const libro = new ExcelJS.Workbook();
    await libro.xlsx.load(await generarPlantillaMeta());
    const hoja = libro.worksheets[0]!;

    // Tres filas del presupuesto de otra oficina, pegadas sobre las primeras
    // filas de datos. Se machaca TODO lo que un pegado machacaria, incluida
    // la columna Parcial con su formula.
    const pegado: [string, string, string, number, number][] = [
      ["1", "CAPITULO I: ESTRUCTURAS", "", 0, 0],
      ["1.01", "Concreto f'c=210 en zapatas", "m3", 12.5, 420],
      ["1.02", "Acero corrugado fy=4200", "kg", 850, 6.2],
    ];

    pegado.forEach(([codigo, descripcion, unidad, metrado, precio], i) => {
      const fila = hoja.getRow(5 + i);
      fila.getCell(1).value = codigo;
      fila.getCell(2).value = descripcion;
      fila.getCell(3).value = unidad || null;
      fila.getCell(4).value = metrado || null;
      fila.getCell(5).value = precio || null;
      // Lo que hace el pegado y no se puede evitar: la formula se va.
      fila.getCell(6).value = null;
      fila.getCell(11).value = null;
    });

    return (await libro.xlsx.writeBuffer()) as ArrayBuffer;
  }

  it("entra sin errores aunque la columna Parcial quede vacia", async () => {
    const r = await analizarExcel(await plantillaConPegado(), {
      propiasDeLaMeta: true,
    });

    expect(r.errores).toEqual([]);
  });

  it("los importes salen igual: se calculan con el metrado y el precio", async () => {
    const r = await analizarExcel(await plantillaConPegado(), {
      propiasDeLaMeta: true,
    });

    const concreto = r.filas.find((f) => f.codigo === "1.01");
    const acero = r.filas.find((f) => f.codigo === "1.02");

    // 12,5 x 420 y 850 x 6,20, hechos por el importador y no por Excel.
    expect(concreto?.parcial).toBe("5250.00");
    expect(acero?.parcial).toBe("5270.00");
  });

  it("el capitulo pegado sigue siendo un capitulo, no una partida", async () => {
    const r = await analizarExcel(await plantillaConPegado(), {
      propiasDeLaMeta: true,
    });

    expect(r.filas.find((f) => f.codigo === "1")?.tipo).toBe("CAPITULO");
    expect(r.filas.find((f) => f.codigo === "1.01")?.tipo).toBe("PARTIDA");
  });
});
