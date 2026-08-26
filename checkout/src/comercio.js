/**
 * comercio.js — Quién vende. En un solo sitio.
 *
 * Estos datos son obligatorios en el comprobante, en los Términos, en el Libro
 * de Reclamaciones y en cualquier correo que salga de aquí. Hasta ahora vivían
 * escritos a mano en tres páginas HTML, y el día que cambie el domicilio fiscal
 * habría que acordarse de los tres sitios.
 *
 * Se pueden sobreescribir desde el `.env` sin tocar código —un cambio de
 * teléfono no debería exigir un despliegue—, y lo de abajo es lo que hay hoy.
 *
 * OJO: las tres páginas HTML todavía los repiten. Esto es el sitio único para
 * lo que se genera en el servidor; unificar las páginas es harina de otro
 * costal y no se hace a medias.
 */

const COMERCIO = {
  razonSocial: process.env.EMPRESA_RAZON_SOCIAL || 'Yudelvis Cáceres Ruiz',
  ruc: process.env.EMPRESA_RUC || '15606050906',
  direccion: process.env.EMPRESA_DIRECCION
    || 'Av. Alameda 1 N.° 200, Condominio Villanova 4, Torre 6, Dpto. 405, Callao, Callao, Perú',
  correo: process.env.EMPRESA_CORREO || 'drcaceresruiz@gmail.com',
  telefono: process.env.EMPRESA_TELEFONO || '+51 963 076 640',
  tienda: process.env.URL_PUBLICA || '',
};

module.exports = { COMERCIO };
