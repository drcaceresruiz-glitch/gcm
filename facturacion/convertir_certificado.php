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
 * DOS INTENTOS, Y EL SEGUNDO ES EL QUE SUELE FUNCIONAR. Los certificados de
 * SUNAT vienen cifrados con algoritmos antiguos (RC2, 3DES) que OpenSSL 3
 * desactivó por defecto. `openssl_pkcs12_read()` falla con un
 * «digital envelope routines::unsupported» que parece una contraseña
 * equivocada y no lo es. Por eso, si el primer intento falla, se prueba con la
 * línea de órdenes de OpenSSL y su opción `-legacy`, que sí los abre.
 *
 * Y la contraseña se le pasa por VARIABLE DE ENTORNO, no en la línea de
 * órdenes: los argumentos de un proceso los ve cualquiera que liste los
 * procesos del servidor; su entorno, no.
 *
 * Y ESTÁ PROTEGIDO POR LA MISMA CLAVE DEL SERVICIO (`CLAVE_API` del `.env`),
 * que hay que escribir abajo. Falla cerrado: sin clave configurada no se abre.
 */

declare(strict_types=1);

require_once __DIR__ . '/src/config.php';

/**
 * Segundo intento: la línea de órdenes de OpenSSL, con `-legacy`.
 *
 * Devuelve el PEM, o null con el motivo en `$detalle`.
 */
function fact_convertir_con_openssl(string $pfx, string $clave, ?string &$detalle): ?string
{
    $detalle = null;
    if (!function_exists('proc_open')) {
        $detalle = 'este servidor no permite ejecutar programas desde PHP (proc_open deshabilitado)';
        return null;
    }

    // Se prueba primero CON -legacy (OpenSSL 3) y luego sin él (OpenSSL 1.x,
    // donde esa opción no existe y sobra).
    foreach ([true, false] as $conLegacy) {
        $orden = 'openssl pkcs12' . ($conLegacy ? ' -legacy' : '')
            . ' -in ' . escapeshellarg($pfx) . ' -nodes -passin env:FACT_PFX_PASS';

        $tuberias = [1 => ['pipe', 'w'], 2 => ['pipe', 'w']];
        $proceso = @proc_open(
            $orden,
            $tuberias,
            $canales,
            null,
            ['FACT_PFX_PASS' => $clave, 'PATH' => getenv('PATH') ?: '/usr/bin:/bin:/usr/local/bin']
        );
        if (!is_resource($proceso)) {
            $detalle = 'no se pudo ejecutar openssl';
            continue;
        }
        $salida = stream_get_contents($canales[1]);
        $errores = stream_get_contents($canales[2]);
        fclose($canales[1]);
        fclose($canales[2]);
        $codigo = proc_close($proceso);

        if ($codigo === 0 && str_contains($salida, 'PRIVATE KEY')) {
            // La línea de órdenes intercala «Bag Attributes», «subject=»,
            // «issuer=»… entre los bloques. La librería de firma espera PEM y
            // nada más, así que se dejan solo los bloques.
            preg_match_all('/-----BEGIN [^-]+-----.*?-----END [^-]+-----/s', $salida, $bloques);
            return $bloques[0] ? implode("\n", $bloques[0]) . "\n" : $salida;
        }
        // «Mac verify error» / «invalid password» sí es la contraseña: no tiene
        // sentido reintentar sin -legacy.
        if (stripos($errores, 'verify error') !== false || stripos($errores, 'invalid password') !== false) {
            $detalle = 'la contraseña del certificado no es correcta';
            return null;
        }
        $detalle = trim($errores) !== '' ? trim(explode("\n", trim($errores))[0]) : 'openssl no devolvió el certificado';
    }
    return null;
}

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
        $pem = '';
        $porLaViaAntigua = false;

        // La contraseña puede ser vacía en algunos certificados: se admite.
        if ($contenido !== false && openssl_pkcs12_read($contenido, $partes, $claveCert)) {
            $pem = ($partes['pkey'] ?? '') . ($partes['cert'] ?? '');
            foreach (($partes['extracerts'] ?? []) as $extra) {
                $pem .= $extra;
            }
        } else {
            // Casi siempre es el cifrado antiguo, no la contraseña.
            $errorPhp = openssl_error_string() ?: '';
            $detalle = null;
            $pem = (string)fact_convertir_con_openssl($pfx, $claveCert, $detalle);
            $porLaViaAntigua = trim($pem) !== '';
            if (!$porLaViaAntigua) {
                $mensaje = 'No se pudo abrir el certificado. '
                    . ($detalle ? ucfirst($detalle) . '.' : 'Revise la contraseña.')
                    . (str_contains($errorPhp, 'unsupported')
                        ? ' (Su certificado usa un cifrado antiguo y este servidor no pudo abrirlo'
                          . ' por ninguna de las dos vías.)'
                        : '');
            }
        }

        if ($mensaje === null) {
            if (trim($pem) === '') {
                $mensaje = 'El certificado se abrió pero venía vacío. Vuelva a descargarlo de SUNAT.';
            } else {
                file_put_contents($destino, $pem);
                @chmod($destino, 0600);
                $mensaje = 'Certificado convertido'
                    . ($porLaViaAntigua ? ' (con la vía para cifrado antiguo)' : '')
                    . '. Ahora borre el .pfx y borre este archivo (convertir_certificado.php).';
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
