<?php
/**
 * certificado.php — Que se sepa de quién es el certificado, esté donde esté
 * escrito el RUC.
 *
 * POR QUÉ EXISTE ESTA PRUEBA. La primera versión buscaba el RUC solo en el
 * campo `serialNumber`. El certificado tributario real que emite RENIEC no lo
 * lleva ahí, sino dentro del nombre común —«||USO TRIBUTARIO|| CACERES RUIZ
 * YUDELVIS CDT 15606050906»—, así que el panel contestaba «no consta en el
 * certificado» y la comprobación de si el certificado es del RUC emisor se
 * quedaba muda justo el día que había que hacerla. Se vio en el servidor de
 * verdad, mirando la pantalla.
 *
 * Se ejecuta:  php facturacion/pruebas/certificado.php
 */

declare(strict_types=1);

require_once __DIR__ . '/../src/config.php';

$fallos = 0;
$hechas = 0;

function comprobar(string $que, $esperado, $obtenido): void
{
    global $fallos, $hechas;
    $hechas++;
    if ($esperado === $obtenido) {
        echo "  ok   $que\n";
        return;
    }
    $fallos++;
    echo "  FALLA $que\n";
    echo "        esperaba: " . var_export($esperado, true) . "\n";
    echo "        obtuvo:   " . var_export($obtenido, true) . "\n";
}

/** Fabrica un certificado de mentira con el sujeto que se le pida. */
function certificado_con(array $sujeto, int $dias = 400): string
{
    $clave = openssl_pkey_new(['private_key_bits' => 2048]);
    $csr = openssl_csr_new($sujeto, $clave, ['digest_alg' => 'sha256']);
    $x509 = openssl_csr_sign($csr, null, $clave, $dias, ['digest_alg' => 'sha256']);
    openssl_x509_export($x509, $pem);
    openssl_pkey_export($clave, $pemClave);
    return $pemClave . $pem;
}

$temporal = sys_get_temp_dir() . '/fact_cert_' . getmypid();
mkdir($temporal . '/certificados', 0700, true);
$ruta = $temporal . '/certificados/certificado.pem';
putenv('FACT_CERT_DIR=' . $temporal . '/certificados');

echo "Lectura del certificado\n";

// --- El caso real: RUC dentro del nombre común, como lo emite RENIEC --------
file_put_contents($ruta, certificado_con([
    'countryName' => 'PE',
    'commonName' => '||USO TRIBUTARIO|| CACERES RUIZ YUDELVIS CDT 15606050906',
]));
$d = fact_datos_certificado();
comprobar('encuentra el RUC dentro del nombre común', '15606050906', $d['ruc'] ?? null);
comprobar('conserva el titular tal como lo dice el certificado',
    '||USO TRIBUTARIO|| CACERES RUIZ YUDELVIS CDT 15606050906', $d['titular'] ?? null);
comprobar('sabe que todavía vale', true, ($d['diasParaCaducar'] ?? 0) > 0);

// --- El caso estándar: RUC en serialNumber ----------------------------------
file_put_contents($ruta, certificado_con([
    'countryName' => 'PE',
    'commonName' => 'EMPRESA EJEMPLO SAC',
    'serialNumber' => '20123456789',
]));
comprobar('encuentra el RUC en serialNumber', '20123456789', fact_datos_certificado()['ruc'] ?? null);

// --- serialNumber manda sobre el nombre, si están los dos -------------------
file_put_contents($ruta, certificado_con([
    'countryName' => 'PE',
    'commonName' => 'ALGO CDT 15606050906',
    'serialNumber' => '20123456789',
]));
comprobar('con los dos, manda serialNumber', '20123456789', fact_datos_certificado()['ruc'] ?? null);

// --- Un número largo que NO es un RUC no se confunde con uno ----------------
// Los RUC peruanos empiezan por 10, 15, 16, 17 o 20.
file_put_contents($ruta, certificado_con([
    'countryName' => 'PE',
    'commonName' => 'CERTIFICADO NUMERO 99887766554',
]));
comprobar('no toma por RUC un número que no puede serlo', '', fact_datos_certificado()['ruc'] ?? null);

// --- Sin certificado, no se inventa nada ------------------------------------
unlink($ruta);
comprobar('sin archivo devuelve null', null, fact_datos_certificado());

@rmdir($temporal . '/certificados');
@rmdir($temporal);

echo "\n== $hechas comprobaciones, $fallos fallidas ==\n";
exit($fallos === 0 ? 0 : 1);
