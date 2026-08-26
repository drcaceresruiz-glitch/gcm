/**
 * reclamaciones.js — El Libro de Reclamaciones, por dentro.
 *
 * QUÉ EXIGE LA NORMA (Ley 29571 y D.S. 011-2011-PCM), y que por eso está aquí:
 *   · cada hoja lleva un CORRELATIVO único, y no se puede repetir ni saltar;
 *   · el consumidor recibe una COPIA en el acto;
 *   · las hojas se CONSERVAN dos años;
 *   · una hoja registrada NO se modifica ni se borra.
 *
 * CÓMO SE GUARDA, Y POR QUÉ ASÍ. En un archivo `.jsonl` que solo crece: una
 * línea por hoja, y nunca se reescribe una línea anterior. Un archivo de solo
 * añadir es lo más parecido a un libro empastado que hay en un disco, y es
 * justamente lo que la norma quiere: que una reclamación no se pueda hacer
 * desaparecer. Una tabla con UPDATE y DELETE habría sido más cómoda y peor.
 *
 * LO QUE ESTO TODAVÍA NO HACE, y hay que resolver antes de operar:
 *   · el correo con la copia al consumidor. Aquí se registra la hoja y se
 *     devuelve el correlativo, pero no sale ningún correo: no hay remitente
 *     configurado. Mientras eso falte, la copia hay que mandarla a mano.
 *   · el respaldo del archivo. Si se pierde el disco se pierde el libro, y son
 *     dos años de conservación obligatoria.
 */

const fs = require('node:fs');
const path = require('node:path');

/** El libro vive fuera de `public/`: nadie debe poder descargarlo por la web. */
const DIRECTORIO = path.join(__dirname, '..', 'datos');
const LIBRO = path.join(DIRECTORIO, 'libro-reclamaciones.jsonl');

const TIPOS_DOC = ['DNI', 'CE', 'PAS', 'RUC'];
const RE_CORREO = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function limpiar(valor, maximo) {
  return String(valor ?? '').trim().slice(0, maximo);
}

/**
 * Revisa la hoja. Devuelve { datos } o { errores }.
 *
 * Los obligatorios son los que el reglamento marca como tales; ni uno más. Pedir
 * de más en una hoja de reclamación es ponerle una barrera a quien ya viene
 * molesto, y eso la norma no lo permite.
 */
function revisarHoja(cuerpo) {
  const errores = {};

  const nombre = limpiar(cuerpo.nombre, 150);
  if (!nombre) errores.nombre = 'Indique su nombre completo.';

  const tipoDoc = TIPOS_DOC.includes(cuerpo.tipoDoc) ? cuerpo.tipoDoc : 'DNI';

  const numDoc = limpiar(cuerpo.numDoc, 20);
  if (!numDoc) errores.numDoc = 'Indique el número de su documento.';
  else if (tipoDoc === 'DNI' && !/^\d{8}$/.test(numDoc)) errores.numDoc = 'El DNI tiene 8 dígitos.';
  else if (tipoDoc === 'RUC' && !/^\d{11}$/.test(numDoc)) errores.numDoc = 'El RUC tiene 11 dígitos.';

  const correo = limpiar(cuerpo.correo, 120).toLowerCase();
  if (!correo) errores.correo = 'Indique su correo: es donde recibirá la copia y la respuesta.';
  else if (!RE_CORREO.test(correo)) errores.correo = 'Ese correo no parece válido.';

  const domicilio = limpiar(cuerpo.domicilio, 200);
  if (!domicilio) errores.domicilio = 'Indique su domicilio.';

  const telefono = limpiar(cuerpo.telefono, 25);
  if (telefono && !/^[\d\s+()-]{6,25}$/.test(telefono)) errores.telefono = 'Ese teléfono no parece válido.';

  const monto = limpiar(cuerpo.monto, 12).replace(',', '.');
  if (monto && !/^\d{1,7}(\.\d{1,2})?$/.test(monto)) errores.monto = 'Escriba solo el importe, por ejemplo 349.00';

  const descripcion = limpiar(cuerpo.descripcion, 1000);
  if (!descripcion) errores.descripcion = 'Describa el producto o servicio contratado.';

  const detalle = limpiar(cuerpo.detalle, 2000);
  if (!detalle) errores.detalle = 'Explique qué ocurrió.';

  const pedido = limpiar(cuerpo.pedido, 1000);
  if (!pedido) errores.pedido = 'Indique qué solicita.';

  if (Object.keys(errores).length) return { errores };

  return {
    datos: {
      nombre, tipoDoc, numDoc, correo, domicilio, telefono,
      apoderado: limpiar(cuerpo.apoderado, 150),
      bien: cuerpo.bien === 'SERVICIO' ? 'SERVICIO' : 'PRODUCTO',
      tipo: cuerpo.tipo === 'QUEJA' ? 'QUEJA' : 'RECLAMO',
      monto: monto || null,
      pedidoRef: limpiar(cuerpo.pedidoRef, 30),
      descripcion, detalle, pedido,
    },
  };
}

/**
 * El siguiente correlativo del año, contando las hojas ya escritas.
 *
 * Se cuenta el archivo en vez de guardar un contador aparte a propósito: un
 * contador en otro sitio se puede desincronizar del libro, y entonces habría dos
 * versiones de «cuántas reclamaciones hay». El libro es la única verdad.
 *
 * Ojo: esto vale para UN proceso. El día que haya varios, el correlativo pasa a
 * una secuencia de base de datos, o dos personas reclamando a la vez recibirán
 * el mismo número.
 */
function siguienteCorrelativo(anio) {
  if (!fs.existsSync(LIBRO)) return 1;
  const lineas = fs.readFileSync(LIBRO, 'utf8').split('\n').filter(Boolean);
  let n = 0;
  for (const linea of lineas) {
    try {
      if (JSON.parse(linea).anio === anio) n++;
    } catch { /* una línea ilegible no debe impedir registrar la siguiente */ }
  }
  return n + 1;
}

/**
 * Registra una hoja y devuelve su constancia.
 *
 * La escritura es con 'a' (añadir) y con la línea entera de una vez: así una
 * hoja se escribe completa o no se escribe, y nunca queda media hoja en el libro.
 */
function registrarHoja(datos, huella = {}) {
  fs.mkdirSync(DIRECTORIO, { recursive: true });

  const ahora = new Date();
  const anio = ahora.getFullYear();
  const numero = siguienteCorrelativo(anio);
  const correlativo = `LR-${anio}-${String(numero).padStart(4, '0')}`;

  const hoja = {
    correlativo,
    anio,
    numero,
    registradaEn: ahora.toISOString(),
    estado: 'PENDIENTE',        // PENDIENTE | RESPONDIDA
    ...datos,
    origen: {
      ip: huella.ip || null,
      agente: huella.agente || null,
    },
  };

  fs.appendFileSync(LIBRO, JSON.stringify(hoja) + '\n', 'utf8');

  return {
    correlativo,
    fecha: ahora.toLocaleDateString('es-PE', { day: '2-digit', month: 'long', year: 'numeric' }),
    correo: datos.correo,
  };
}

module.exports = { revisarHoja, registrarHoja, LIBRO };
