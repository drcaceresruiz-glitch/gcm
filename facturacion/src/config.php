<?php
/**
 * config.php — De dónde salen las credenciales y dónde vive cada cosa.
 *
 * NADA DE ESTO SE VERSIONA. El certificado es la firma tributaria del emisor y
 * la clave SOL abre su cuenta en SUNAT: viven en `.env` y en `certificados/`,
 * las dos rutas cerradas por `.htaccess` y fuera de git.
 *
 * FALLA CERRADO. Sin certificado o sin clave SOL, `configurado()` devuelve
 * false y el servicio contesta 503 en vez de intentar firmar con lo que haya.
 * Un comprobante mal firmado no se «arregla luego»: SUNAT lo rechaza y queda
 * un correlativo quemado.
 */

declare(strict_types=1);

const FACT_BASE = __DIR__ . '/..';

/** Lee un `.env` sencillo: `CLAVE=valor`, una por línea, `#` comenta. */
function fact_env(): array
{
    static $valores = null;
    if ($valores !== null) {
        return $valores;
    }
    $valores = [];
    $ruta = FACT_BASE . '/.env';
    if (!is_readable($ruta)) {
        return $valores;
    }
    foreach (file($ruta, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) as $linea) {
        $linea = trim($linea);
        if ($linea === '' || $linea[0] === '#') {
            continue;
        }
        $corte = strpos($linea, '=');
        if ($corte === false) {
            continue;
        }
        $clave = trim(substr($linea, 0, $corte));
        $valor = trim(substr($linea, $corte + 1));
        // Se admiten comillas alrededor del valor: una clave con espacios o con
        // un `#` dentro se escribe entrecomillada y no se parte por el medio.
        if (strlen($valor) >= 2 && ($valor[0] === '"' || $valor[0] === "'")
            && substr($valor, -1) === $valor[0]) {
            $valor = substr($valor, 1, -1);
        }
        $valores[$clave] = $valor;
    }
    return $valores;
}

/**
 * Un valor de configuración.
 *
 * Una variable de entorno `FACT_<CLAVE>` pisa al `.env`. Va con prefijo a
 * propósito: `RUC` o `SOL_CLAVE` a secas son nombres demasiado comunes para
 * confiar en que nadie más los defina en un servidor compartido. Sirve para
 * apuntar el servicio a otro sitio sin editar el archivo —y es lo que usan las
 * pruebas para recorrer los dos modos sin tocar la configuración real—.
 */
function fact_cfg(string $clave, string $porDefecto = ''): string
{
    $delEntorno = getenv('FACT_' . $clave);
    if (is_string($delEntorno) && $delEntorno !== '') {
        return $delEntorno;
    }
    $env = fact_env();
    return isset($env[$clave]) && $env[$clave] !== '' ? $env[$clave] : $porDefecto;
}

/** ¿Estamos apuntando a SUNAT de verdad, o a su entorno de pruebas? */
function fact_es_produccion(): bool
{
    return fact_cfg('SUNAT_MODO', 'beta') === 'produccion';
}

/**
 * El servicio de SUNAT al que se envía.
 *
 * BETA es un entorno de juguete: acepta el RUC de pruebas 20000000001 con el
 * usuario MODDATOS, y lo que se manda ahí NO existe para SUNAT. Es donde hay
 * que equivocarse.
 */
function fact_endpoint(): string
{
    return fact_es_produccion()
        ? 'https://e-factura.sunat.gob.pe/ol-ti-itcpfegem/billService'
        : 'https://e-beta.sunat.gob.pe/ol-ti-itcpfegem-beta/billService';
}

function fact_ruta_certificado(): string
{
    $nombre = fact_cfg('CERT_ARCHIVO', 'certificado.pem');
    return FACT_BASE . '/certificados/' . basename($nombre);
}

function fact_datos_dir(): string
{
    return fact_cfg('DATOS_DIR', FACT_BASE . '/datos');
}

/**
 * ¿Hay con qué emitir?
 *
 * Se apoya en `fact_que_falta()` en vez de repetir la lista: durante las
 * pruebas se vio que `estado` decía «no configurado» por falta de la extensión
 * SOAP y `emitir` seguía adelante igualmente, para reventar después con un
 * error incomprensible. Una sola fuente de verdad y el aviso llega entero.
 */
function fact_configurado(): bool
{
    return fact_que_falta() === [];
}

/** Lo que falta, para poder decirlo en vez de fallar sin explicación. */
function fact_que_falta(): array
{
    $falta = [];
    foreach (['RUC', 'RAZON_SOCIAL', 'SOL_USUARIO', 'SOL_CLAVE'] as $clave) {
        if (fact_cfg($clave) === '') {
            $falta[] = $clave . ' en .env';
        }
    }
    if (!is_readable(fact_ruta_certificado())) {
        $falta[] = 'el certificado en certificados/' . basename(fact_ruta_certificado());
    }
    // Se comprueba la CLASE, no el nombre de la extensión: es lo que de verdad
    // se usa, y así el servicio también funciona donde SoapClient llegue por
    // otra vía. Sin ella no hay forma de hablar con SUNAT.
    if (!class_exists('SoapClient')) {
        $falta[] = 'la extensión SOAP de PHP (actívela en cPanel → Select PHP Version)';
    }
    if (!extension_loaded('openssl')) {
        $falta[] = 'la extensión OpenSSL de PHP';
    }
    return $falta;
}
