/**
 * Que es de verdad una imagen, leido de sus bytes.
 *
 * EXISTE PORQUE EL MIME LO DICE EL CLIENTE. `archivo.type` viene del
 * navegador —o de quien imite al navegador— y renombrar un archivo cambia lo
 * que dice ser. Los primeros bytes no: un PNG empieza por su firma y un JPEG
 * por la suya. Si no cuadran, no se guarda.
 *
 * Y de paso da el tamano, que hace falta para colocarlo sin deformarlo: el
 * informe en PDF y el correo necesitan la proporcion, y medirla aqui evita
 * fiarse de lo que diga el formulario.
 *
 * Sin dependencias: son dos cabeceras y se leen a mano. Meter una libreria de
 * imagenes para esto seria traer un arbol entero por veinte lineas —y en este
 * hosting las que compilan binarios no van—.
 */

export type TipoImagen = "png" | "jpeg";

export interface MedidaImagen {
  tipo: TipoImagen;
  ancho: number;
  alto: number;
}

const FIRMA_PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/**
 * Marcadores JPEG que llevan el tamano dentro (SOF, «start of frame»).
 *
 * NO son todos los `FFCx`: `FFC4` es la tabla Huffman, `FFC8` una extension y
 * `FFCC` la tabla aritmetica. Meterlos aqui haria leer como alto y ancho dos
 * numeros que no lo son, y lo peor es que el resultado parece una medida
 * plausible en vez de un error.
 */
const SOF = new Set([
  0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf,
]);

function esPng(b: Uint8Array): boolean {
  return FIRMA_PNG.every((byte, i) => b[i] === byte);
}

function medirPng(b: Uint8Array): MedidaImagen | null {
  // Firma (8) + longitud (4) + "IHDR" (4) y ahi empiezan ancho y alto, cuatro
  // bytes cada uno y en orden de red.
  if (b.length < 24) return null;
  if (String.fromCharCode(b[12]!, b[13]!, b[14]!, b[15]!) !== "IHDR") return null;

  const leer32 = (i: number) =>
    ((b[i]! << 24) | (b[i + 1]! << 16) | (b[i + 2]! << 8) | b[i + 3]!) >>> 0;

  const ancho = leer32(16);
  const alto = leer32(20);
  if (ancho === 0 || alto === 0) return null;

  return { tipo: "png", ancho, alto };
}

function medirJpeg(b: Uint8Array): MedidaImagen | null {
  if (b.length < 4 || b[0] !== 0xff || b[1] !== 0xd8) return null;

  let i = 2;
  while (i < b.length - 1) {
    // Los segmentos empiezan por 0xFF; puede haber relleno de varios 0xFF.
    if (b[i] !== 0xff) {
      i += 1;
      continue;
    }

    const marcador = b[i + 1]!;
    i += 2;

    // Marcadores sueltos, sin longitud detras.
    if (marcador === 0xd8 || marcador === 0x01 || (marcador >= 0xd0 && marcador <= 0xd7)) {
      continue;
    }
    if (marcador === 0xd9 || marcador === 0xda) break; // fin, o empiezan los datos

    // Hacen falta DOS bytes desde `i`, asi que el ultimo que se toca es
    // `i + 1`: la guarda compara contra la longitud, no contra el ultimo
    // indice. Escrita como `i + 1 >= b.length` rechazaba el caso en que el
    // segmento termina justo al final del archivo.
    if (i + 2 > b.length) return null;
    const longitud = (b[i]! << 8) | b[i + 1]!;

    if (SOF.has(marcador)) {
      // longitud(2) + precision(1), y luego alto y ancho —en ese orden, que
      // es al reves de como se dice en castellano y del PNG—. El ultimo byte
      // que se lee es `i + 6`, asi que hacen falta siete desde `i`.
      if (i + 7 > b.length) return null;
      const alto = (b[i + 3]! << 8) | b[i + 4]!;
      const ancho = (b[i + 5]! << 8) | b[i + 6]!;
      if (ancho === 0 || alto === 0) return null;
      return { tipo: "jpeg", ancho, alto };
    }

    if (longitud < 2) return null;
    i += longitud;
  }

  return null;
}

/** El tipo y el tamano reales, o null si no es un PNG ni un JPEG legible. */
export function medirImagen(bytes: Uint8Array): MedidaImagen | null {
  if (esPng(bytes)) return medirPng(bytes);
  return medirJpeg(bytes);
}

/**
 * El lado mayor que se guarda.
 *
 * En pantalla el logo se ve a unos 32 px y en el PDF a unos 40 puntos, asi
 * que 512 deja margen de sobra para pantallas densas y para el papel, sin
 * guardar una foto de cartel. Lo que llegue mas grande lo encoge el navegador
 * ANTES de subir (aqui no hay `sharp` que valga).
 */
export const LADO_MAXIMO_LOGO = 512;

/**
 * A que tamano hay que dejar una imagen para que quepa en `LADO_MAXIMO_LOGO`
 * **sin deformarla**.
 *
 * Devuelve la medida tal cual si ya cabe: reescalar hacia ARRIBA un logo
 * pequeno solo lo emborrona.
 */
export function encajar(
  ancho: number,
  alto: number,
  ladoMaximo: number = LADO_MAXIMO_LOGO,
): { ancho: number; alto: number } {
  const mayor = Math.max(ancho, alto);
  if (mayor <= ladoMaximo) return { ancho, alto };

  const factor = ladoMaximo / mayor;
  // Redondeando hacia arriba y con minimo 1: un logo muy apaisado podria dar
  // 0 de alto al redondear, y un canvas de altura 0 no dibuja nada.
  return {
    ancho: Math.max(1, Math.round(ancho * factor)),
    alto: Math.max(1, Math.round(alto * factor)),
  };
}

/**
 * El tamano al que hay que dibujar una imagen para que quepa DENTRO de una
 * caja sin deformarse y sin salirse.
 *
 * Es lo que en CSS hace `object-fit: contain`, pero en numeros, porque el PDF
 * no tiene CSS: se escala por el lado que TOCA ANTES el borde —el menor de
 * los dos factores— y el otro sobra. Escalar cada lado por su cuenta llenaria
 * la caja exacta y estiraria el logo, que es el unico resultado inaceptable:
 * un logo deformado se lee como descuido de la empresa que lo manda.
 *
 * NO agranda: si ya cabe, se deja como esta. Un logo pequeno estirado a la
 * caja se ve borroso, y ese emborronado tambien parece descuido.
 *
 * **NO REDONDEA**, al reves que `encajar`, y la diferencia importa. Aquel
 * dibuja en un `canvas`, que solo admite pixeles enteros; este coloca en un
 * PDF, donde las coordenadas son fraccionarias. Redondear aqui deformaba de
 * verdad: un logo de 512x26 en una caja de 110x30 sale de 5,59 pt de alto, y
 * llevarlo a 6 lo aplasta un 6,9 % —medido—. En una imagen tan baja, un punto
 * es mucho.
 */
export function encajarEnCaja(
  ancho: number,
  alto: number,
  cajaAncho: number,
  cajaAlto: number,
): { ancho: number; alto: number } {
  if (ancho <= 0 || alto <= 0) return { ancho: 0, alto: 0 };

  const factor = Math.min(cajaAncho / ancho, cajaAlto / alto, 1);

  return { ancho: ancho * factor, alto: alto * factor };
}
