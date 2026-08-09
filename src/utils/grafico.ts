/**
 * Sacar un grafico SVG de la pagina para descargarlo, imprimirlo o enviarlo.
 *
 * El grafico se dibuja con variables de tema (`var(--texto)`, `currentColor`),
 * que es lo que le permite repintar solo al cambiar de tema. Pero fuera de la
 * pagina esas variables no existen: un SVG copiado tal cual sale sin colores,
 * o directamente negro sobre negro. Aqui se resuelven a su valor real antes de
 * exportarlo.
 *
 * Solo funciona en el navegador: usa `getComputedStyle` y `canvas`.
 */

/** Toda referencia a una variable CSS que aparezca en el marcado. */
const VARIABLE = /var\((--[a-z0-9-]+)\)/gi;

/**
 * Copia del SVG con los colores ya resueltos y las medidas fijadas.
 *
 * Se trabaja sobre una copia y nunca sobre el original: tocar el que se esta
 * viendo lo dejaria con los colores congelados y dejaria de responder al
 * cambio de tema.
 */
export function svgAutonomo(svg: SVGSVGElement): string {
  const estilo = getComputedStyle(svg);
  const color = estilo.color;

  const caja = svg.viewBox.baseVal;
  const ancho = caja.width || svg.clientWidth || 760;
  const alto = caja.height || svg.clientHeight || 300;

  const copia = svg.cloneNode(true) as SVGSVGElement;
  copia.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  copia.setAttribute("width", String(ancho));
  copia.setAttribute("height", String(alto));

  // Un fondo propio: sin el, un PNG sale con transparencia y en WhatsApp —que
  // lo muestra sobre fondo oscuro— el texto desaparece.
  const fondo = document.createElementNS("http://www.w3.org/2000/svg", "rect");
  fondo.setAttribute("width", "100%");
  fondo.setAttribute("height", "100%");
  fondo.setAttribute("fill", estilo.getPropertyValue("--superficie").trim() || "#ffffff");
  copia.insertBefore(fondo, copia.firstChild);

  const marcado = new XMLSerializer().serializeToString(copia);

  return marcado
    .replace(VARIABLE, (_, nombre: string) => {
      const valor = estilo.getPropertyValue(nombre).trim();
      // Si la variable no existe se deja un gris antes que un `var()` que el
      // renderizador no entiende y pinta en negro.
      return valor || "#64748b";
    })
    .replace(/currentColor/g, color);
}

/**
 * El grafico como PNG.
 *
 * Se dibuja al doble de tamano: un PNG a la medida del SVG se ve borroso en
 * cuanto alguien lo abre a pantalla completa o lo imprime.
 */
export async function svgAPng(svg: SVGSVGElement, escala = 2): Promise<Blob> {
  const marcado = svgAutonomo(svg);
  const caja = svg.viewBox.baseVal;
  const ancho = (caja.width || 760) * escala;
  const alto = (caja.height || 300) * escala;

  const imagen = new Image();
  imagen.decoding = "sync";

  // Se pasa por data URL y no por blob URL a proposito: con blob URL, algunos
  // navegadores marcan el canvas como contaminado y `toBlob` falla.
  const fuente = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(marcado)}`;

  await new Promise<void>((resolver, rechazar) => {
    imagen.onload = () => resolver();
    imagen.onerror = () => rechazar(new Error("No se pudo dibujar el grafico."));
    imagen.src = fuente;
  });

  const lienzo = document.createElement("canvas");
  lienzo.width = ancho;
  lienzo.height = alto;

  const ctx = lienzo.getContext("2d");
  if (!ctx) throw new Error("Este navegador no puede generar la imagen.");

  ctx.drawImage(imagen, 0, 0, ancho, alto);

  return new Promise<Blob>((resolver, rechazar) => {
    lienzo.toBlob(
      (blob) => (blob ? resolver(blob) : rechazar(new Error("No se pudo generar la imagen."))),
      "image/png",
    );
  });
}

/** Descarga un blob con el nombre dado, sin dejar el objeto colgando. */
export function descargar(blob: Blob, nombre: string): void {
  const url = URL.createObjectURL(blob);
  const enlace = document.createElement("a");
  enlace.href = url;
  enlace.download = nombre;
  enlace.click();

  // Se libera despues del clic: revocarla en el mismo tick cancela la descarga
  // en algunos navegadores.
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

/** Base64 sin la cabecera `data:`, que es lo que espera un adjunto de correo. */
export async function aBase64(blob: Blob): Promise<string> {
  const buffer = await blob.arrayBuffer();
  let binario = "";
  const bytes = new Uint8Array(buffer);

  // Por trozos: `String.fromCharCode(...bytes)` con cientos de miles de bytes
  // desborda la pila de argumentos.
  for (let i = 0; i < bytes.length; i += 8192) {
    binario += String.fromCharCode(...bytes.subarray(i, i + 8192));
  }

  return btoa(binario);
}
