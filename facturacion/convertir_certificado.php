<?php
/**
 * convertir_certificado.php — Pasa el certificado de SUNAT al formato que
 * necesita la librería, sin línea de órdenes.
 *
 * POR QUÉ EXISTE. SUNAT entrega el certificado como `.pfx` (o `.p12`), un
 * archivo cifrado con contraseña. Greenter firma con un `.pem`. La conversión
 * normal es un comando de OpenSSL en una terminal, y en un alojamiento
 * compartido no siempre hay terminal. Esto hace lo mismo desde el navegador.
 *
 * ES TEMPORAL Y HAY QUE BORRARLO. En cuanto exista el `.pem`, este archivo y el
 * `.pfx` sobran, y dejarlos es dejar puesta una herramienta que manipula la
 * firma tributaria del emisor. La propia página lo recuerda al terminar.
 *
 * LA CONTRASEÑA NO SE GUARDA EN NINGÚN SITIO: se usa para descifrar y se
 * descarta. No se escribe en el `.env`, ni en un registro, ni en el disco.
 *
 * Y ESTÁ PROTEGIDO POR LA MISMA CLAVE DEL SERVICIO (`CLAVE_API` del `.env`),
 * que hay que escribir abajo. Falla cerrado: sin clave configurada no se abre.
 */

declare(strict_types=1);

require_once __DIR__ . '/src/config.php';

header('X-Robots-Tag: noindex, nofollow');
header('Cache-Control: no-store');

$claveEsperada = fact_cfg('CLAVE_API');
$mensaje = null;
$tipo = 'malo';
$hecho = false;

$destino = FACT_BASE . '/certificados/certificado.pem';
$origenes = glob(FACT_BASE . '/certificados/*.{pfx,p12,PFX,P12}', GLOB_BRACE) ?: [];

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $claveServicio = (string)($_POST['clave_servicio'] ?? '');
    $claveCert = (string)($_POST['clave_certificado'] ?? '');

    if ($claveEsperada === '' || !hash_equals($claveEsperada, $claveServicio)) {
        $mensaje = 'Clave del servicio incorrecta.';
    } elseif (!$origenes) {
        $mensaje = 'No encuentro ningún .pfx en la carpeta certificados/. Súbalo primero.';
    } elseif (!extension_loaded('openssl')) {
        $mensaje = 'Este servidor no tiene la extensión OpenSSL de PHP activada.';
    } else {
        $pfx = $origenes[0];
        $contenido = file_get_contents($pfx);
        $partes = [];
        // La contraseña puede ser vacía en algunos certificados: se admite.
        if ($contenido === false || !openssl_pkcs12_read($contenido, $partes, $claveCert)) {
            $mensaje = 'No se pudo abrir el certificado. Casi siempre es la contraseña. '
                . 'Detalle de OpenSSL: ' . (openssl_error_string() ?: 'sin detalle');
        } else {
            $pem = ($partes['pkey'] ?? '') . ($partes['cert'] ?? '');
            foreach (($partes['extracerts'] ?? []) as $extra) {
                $pem .= $extra;
            }
            if (trim($pem) === '') {
                $mensaje = 'El certificado se abrió pero venía vacío. Vuelva a descargarlo de SUNAT.';
            } else {
                file_put_contents($destino, $pem);
                @chmod($destino, 0600);
                $mensaje = 'Certificado convertido. Ahora borre el .pfx y borre este archivo '
                    . '(convertir_certificado.php).';
                $tipo = 'bien';
                $hecho = true;
            }
        }
    }
}

$existePem = is_readable($destino);
?><!doctype html>
<html lang="es"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Convertir el certificado</title>
<style>
body{font:15px/1.55 system-ui,sans-serif;max-width:560px;margin:8vh auto;padding:0 20px;color:#12211f;background:#f4f7f6}
h1{font-size:20px}
.caja{background:#fff;border:1px solid #dde5e3;border-radius:10px;padding:18px}
label{display:block;margin:14px 0 4px;font-weight:600}
input{width:100%;padding:9px 11px;border:1px solid #dde5e3;border-radius:8px;font:inherit;box-sizing:border-box}
button{margin-top:16px;font:inherit;font-weight:600;padding:10px 18px;border:0;border-radius:8px;background:#0d7a72;color:#fff;cursor:pointer}
.aviso{border-radius:8px;padding:11px 14px;margin:0 0 14px}
.bien{background:#e7f5ec;color:#1a7f4b}
.malo{background:#f6e9e8;color:#b42318}
.apagado{color:#5d6f6c;font-size:14px}
code{background:#eef3f2;padding:1px 5px;border-radius:4px}
</style></head><body>
<h1>Convertir el certificado de SUNAT</h1>
<div class="caja">
<?php if ($mensaje !== null): ?>
  <div class="aviso <?= $tipo ?>"><?= htmlspecialchars($mensaje, ENT_QUOTES) ?></div>
<?php endif; ?>

<?php if ($hecho): ?>
  <p><b>Ya está.</b> Quedan dos cosas por hacer, y las dos son de seguridad:</p>
  <ol>
    <li>Borre el archivo <code><?= htmlspecialchars(basename($origenes[0] ?? ''), ENT_QUOTES) ?></code>
        de la carpeta <code>certificados/</code>.</li>
    <li>Borre este archivo, <code>convertir_certificado.php</code>.</li>
  </ol>
<?php else: ?>
  <p class="apagado">
    Suba su certificado <code>.pfx</code> de SUNAT a la carpeta <code>certificados/</code> y
    rellene lo de abajo. La contraseña <b>no se guarda</b>: se usa para abrir el archivo y se descarta.
  </p>
  <p class="apagado">
    <?= $origenes ? 'Encontrado: <code>' . htmlspecialchars(basename($origenes[0]), ENT_QUOTES) . '</code>'
                  : '<b>Todavía no hay ningún .pfx en certificados/.</b>' ?>
    <?= $existePem ? ' · Ya existe un certificado.pem: al convertir se sustituye.' : '' ?>
  </p>
  <form method="post" autocomplete="off">
    <label for="a">Clave del servicio (la de <code>CLAVE_API</code> del .env)</label>
    <input id="a" type="password" name="clave_servicio" required>
    <label for="b">Contraseña del certificado (la que le dio SUNAT)</label>
    <input id="b" type="password" name="clave_certificado">
    <button type="submit">Convertir</button>
  </form>
<?php endif; ?>
</div>
</body></html>
