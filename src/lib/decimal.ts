/**
 * Aritmetica decimal exacta.
 *
 * JavaScript calcula con coma flotante binaria: 0.1 + 0.2 da
 * 0.30000000000000004, y 4.25 * 95 puede dar 403.74999999999994. En un
 * presupuesto de obra eso son centimos que no cuadran y un cliente que
 * pregunta por que la suma no da.
 *
 * Aqui se opera con enteros grandes (BigInt) escalados, que es exacto por
 * construccion. Los valores viajan siempre como texto para no pasar nunca
 * por un `number` intermedio.
 */

interface Escalado {
  valor: bigint;
  escala: number;
}

/** "12.3456" -> { valor: 123456n, escala: 4 } */
function escalar(texto: string): Escalado | null {
  const limpio = texto.trim();
  if (!/^-?\d+(\.\d+)?$/.test(limpio)) return null;

  const negativo = limpio.startsWith("-");
  const sinSigno = negativo ? limpio.slice(1) : limpio;
  const [entero = "0", decimales = ""] = sinSigno.split(".");

  const digitos = `${entero}${decimales}`;
  const valor = BigInt(digitos) * (negativo ? -1n : 1n);

  return { valor, escala: decimales.length };
}

/** Devuelve el valor como texto con exactamente `decimales` posiciones. */
function formatear({ valor, escala }: Escalado, decimales: number): string {
  let v = valor;
  let e = escala;

  if (e < decimales) {
    v *= 10n ** BigInt(decimales - e);
    e = decimales;
  } else if (e > decimales) {
    // Redondeo al alza en el medio (half-up), que es lo que espera
    // cualquiera que revise un presupuesto a mano.
    const divisor = 10n ** BigInt(e - decimales);
    const negativo = v < 0n;
    const abs = negativo ? -v : v;
    const cociente = abs / divisor;
    const resto = abs % divisor;
    const redondeado = resto * 2n >= divisor ? cociente + 1n : cociente;
    v = negativo ? -redondeado : redondeado;
    e = decimales;
  }

  const negativo = v < 0n;
  const digitos = (negativo ? -v : v).toString().padStart(e + 1, "0");
  const corte = digitos.length - e;
  const entero = digitos.slice(0, corte);
  const frac = digitos.slice(corte);

  const signo = negativo ? "-" : "";
  return e === 0 ? `${signo}${entero}` : `${signo}${entero}.${frac}`;
}

/**
 * Normaliza un valor que llega de Excel, de un formulario o de la base.
 *
 * Acepta el formato peruano con separador de miles ("1,234.56") y tambien
 * la coma como separador decimal ("1234,56"), que aparece cuando el Excel
 * se creo con configuracion regional distinta.
 *
 * Devuelve null si no es un numero valido: es preferible rechazar la fila
 * y avisar, a importar un dato silenciosamente equivocado.
 */
export function normalizarDecimal(
  entrada: unknown,
  decimales: number,
): string | null {
  if (entrada === null || entrada === undefined || entrada === "") return null;

  let texto: string;

  if (typeof entrada === "number") {
    if (!Number.isFinite(entrada)) return null;
    // toFixed con un decimal extra evita arrastrar el ruido binario del
    // valor original antes de redondear a la precision final.
    texto = entrada.toFixed(Math.min(decimales + 2, 20));
  } else {
    texto = String(entrada).trim();
  }

  if (texto === "") return null;

  texto = texto.replace(/\s/g, "");

  if (texto.includes(",")) {
    const comas = (texto.match(/,/g) ?? []).length;

    if (texto.includes(".") || comas > 1) {
      // "1,234.56" o "1,234,567": la coma solo puede ser separador de miles.
      texto = texto.replace(/,/g, "");
    } else {
      const decimalesTrasComa = texto.split(",")[1]?.length ?? 0;

      if (decimalesTrasComa === 3) {
        // "12,500" es irresoluble: 12500 en formato peruano, 12.5 en
        // formato europeo. Equivocarse son tres ordenes de magnitud en un
        // presupuesto, asi que se rechaza y se pide corregir el archivo.
        return null;
      }

      // "1234,56" -> coma decimal.
      texto = texto.replace(",", ".");
    }
  }

  const escalado = escalar(texto);
  if (!escalado) return null;

  return formatear(escalado, decimales);
}

/**
 * Multiplicacion exacta. Se usa para el parcial de cada partida:
 * parcial = metrado x precio unitario.
 */
export function multiplicar(
  a: string,
  b: string,
  decimales: number,
): string | null {
  const ea = escalar(a);
  const eb = escalar(b);
  if (!ea || !eb) return null;

  return formatear(
    { valor: ea.valor * eb.valor, escala: ea.escala + eb.escala },
    decimales,
  );
}

/** Suma exacta de una lista de importes. */
export function sumar(valores: string[], decimales = 2): string {
  let acumulado: Escalado = { valor: 0n, escala: 0 };

  for (const v of valores) {
    const e = escalar(v);
    if (!e) continue;

    const escalaComun = Math.max(acumulado.escala, e.escala);
    const a = acumulado.valor * 10n ** BigInt(escalaComun - acumulado.escala);
    const b = e.valor * 10n ** BigInt(escalaComun - e.escala);
    acumulado = { valor: a + b, escala: escalaComun };
  }

  return formatear(acumulado, decimales);
}

/** true si el valor es estrictamente mayor que cero. */
export function esPositivo(valor: string): boolean {
  const e = escalar(valor);
  return e !== null && e.valor > 0n;
}

/** true si el valor es negativo. */
export function esNegativo(valor: string): boolean {
  const e = escalar(valor);
  return e !== null && e.valor < 0n;
}
