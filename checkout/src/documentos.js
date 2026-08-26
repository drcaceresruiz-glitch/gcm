/**
 * documentos.js — Los tipos de documento de identidad que acepta la tienda.
 *
 * Hasta ahora solo existían DNI y RUC, adivinados por el largo del número (8 u
 * 11 dígitos). Eso dejaba fuera a extranjeros residentes (carné de
 * extranjería) y a turistas (pasaporte), que también compran y también tienen
 * derecho a que su boleta lleve su documento.
 *
 * Cada tipo lleva su código del catálogo 06 de SUNAT, porque este dato acaba
 * en el comprobante: 1 = DNI, 4 = carné de extranjería, 6 = RUC,
 * 7 = pasaporte. El servicio de facturación repite el mapeo por su cuenta
 * —es otra aplicación, en otro servidor— pero los códigos salen de aquí y de
 * allá del mismo catálogo, así que no pueden divergir sin que SUNAT lo
 * rechace.
 *
 * Los pedidos anteriores a este módulo no guardaron tipo: para ellos se
 * infiere del largo, como siempre se hizo, y por eso `inferirTipo` no
 * desaparece — es la compatibilidad con lo ya vendido.
 */

const TIPOS = {
  dni: {
    etiqueta: 'DNI',
    patron: /^\d{8}$/,
    error: 'El DNI tiene 8 dígitos.',
  },
  ce: {
    etiqueta: 'Carné de extranjería',
    patron: /^[A-Za-z0-9]{6,12}$/,
    error: 'El carné de extranjería tiene entre 6 y 12 letras o números.',
  },
  pasaporte: {
    etiqueta: 'Pasaporte',
    patron: /^[A-Za-z0-9]{5,12}$/,
    error: 'El pasaporte tiene entre 5 y 12 letras o números.',
  },
  ruc: {
    etiqueta: 'RUC',
    patron: /^\d{11}$/,
    error: 'El RUC tiene 11 dígitos.',
  },
};

/** El tipo de un documento sin tipo declarado: como se adivinó siempre. */
function inferirTipo(documento) {
  const limpio = String(documento || '').trim();
  if (/^\d{8}$/.test(limpio)) return 'dni';
  if (/^\d{11}$/.test(limpio)) return 'ruc';
  return '';
}

/**
 * Revisa el par (tipo, número) que llega del formulario.
 *
 * Devuelve { tipoDocumento, documento } con los dos campos ya limpios, o
 * { error } con el mensaje para el campo del número. Las reglas:
 *
 *  · Sin número no hay documento: el tipo solo, elegido y abandonado, se
 *    ignora — el comprador que empezó a rellenarlo y se arrepintió no puede
 *    quedarse atascado.
 *  · Con número pero sin tipo (una llamada vieja a la API, o un navegador con
 *    el HTML cacheado de antes del selector) se infiere por el largo.
 *  · Con tipo, el número tiene que cumplir el patrón DE ESE tipo.
 */
function revisarDocumento(tipoCrudo, documentoCrudo) {
  const documento = String(documentoCrudo || '').trim().toUpperCase();
  const tipo = String(tipoCrudo || '').trim().toLowerCase();

  if (!documento) return { tipoDocumento: '', documento: '' };

  if (!tipo) {
    const inferido = inferirTipo(documento);
    if (!inferido) return { error: 'Indique qué documento es: el DNI tiene 8 dígitos y el RUC, 11.' };
    return { tipoDocumento: inferido, documento };
  }

  const regla = TIPOS[tipo];
  if (!regla) return { error: 'Ese tipo de documento no se reconoce.' };
  if (!regla.patron.test(documento)) return { error: regla.error };
  return { tipoDocumento: tipo, documento };
}

/**
 * «DNI 12345678», «Pasaporte AB12345»… para el panel y los correos.
 * Con un pedido de antes del selector, infiere; sin documento, una raya.
 */
function etiquetaDocumento(tipo, documento) {
  if (!documento) return '—';
  const clave = TIPOS[tipo] ? tipo : inferirTipo(documento);
  const nombre = TIPOS[clave] ? TIPOS[clave].etiqueta : 'Documento';
  return `${nombre} ${documento}`;
}

/** ¿A este par le corresponde factura? Solo al RUC. */
function llevaFactura(tipo, documento) {
  const clave = TIPOS[tipo] ? tipo : inferirTipo(documento);
  return clave === 'ruc';
}

module.exports = { TIPOS, inferirTipo, revisarDocumento, etiquetaDocumento, llevaFactura };
