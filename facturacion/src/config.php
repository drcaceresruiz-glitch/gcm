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
    return fact_cfg('CERT_DIR', FACT_BASE . '/certificados') . '/' . basename($nombre);
}

function fact_datos_dir(): string
{
    return fact_cfg('DATOS_DIR', FACT_BASE . '/datos');
}

/**
 * A nombre de quién está el certificado instalado, y hasta cuándo vale.
 *
 * DOS PREGUNTAS QUE SOLO SE RESPONDEN MIRANDO EL ARCHIVO. La primera es de
 * quién es: en el entorno de pruebas de SUNAT se puede emitir con el RUC de
 * juguete 20000000001 firmando con cualquier certificado, y beta lo acepta;
 * en producción, el RUC del certificado tiene que ser el del emisor o SUNAT
 * rechaza todo. Enterarse ahí es enterarse tarde. La segunda es hasta cuándo:
 * el certificado tributario de SUNAT dura tres años y el día que caduca deja
 * de poder emitirse, sin más aviso que el rechazo.
 *
 * SOLO SE LEE LA PARTE PÚBLICA. El archivo lleva también la clave privada
 * —la firma tributaria del emisor— y de ahí no sale nada: se recorta el
 * bloque del certificado y se descarta el resto antes de mirarlo.
 */
function fact_datos_certificado(): ?array
{
    $ruta = fact_ruta_certificado();
    if (!is_readable($ruta) || !function_exists('openssl_x509_parse')) {
        return null;
    }
    $pem = (string)file_get_contents($ruta);
    if (!preg_match('/-----BEGIN CERTIFICATE-----.*?-----END CERTIFICATE-----/s', $pem, $m)) {
        return null;
    }
    $datos = openssl_x509_parse($m[0]);
    if (!is_array($datos)) {
        return null;
    }

    $sujeto = $datos['subject'] ?? [];

    // DÓNDE ESTÁ EL RUC. No hay un solo sitio: unos certificados lo ponen en
    // `serialNumber`, y los tributarios que emite RENIEC lo llevan DENTRO del
    // nombre común —«||USO TRIBUTARIO|| APELLIDOS NOMBRES CDT 15606050906»—.
    // La primera versión solo miraba `serialNumber` y con un certificado de
    // esos contestaba «no consta», que es peor que no preguntar: la
    // comprobación de si el certificado es del RUC emisor quedaba muda justo
    // cuando hacía falta. Se recorren todos los campos del sujeto.
    //
    // Un RUC peruano son once dígitos que empiezan por 10, 15, 16, 17 o 20;
    // exigirlo evita confundirlo con cualquier otro número largo del nombre.
    $ruc = '';
    $orden = ['serialNumber', 'SN', 'CN', 'OU', 'O'];
    $campos = $orden + array_keys($sujeto);
    foreach ($campos as $campo) {
        $valor = $sujeto[$campo] ?? '';
        if (!is_string($valor)) {
            continue;
        }
        if (preg_match('/(?<!\d)((?:10|15|16|17|20)\d{9})(?!\d)/', $valor, $c)) {
            $ruc = $c[1];
            break;
        }
    }

    $caduca = isset($datos['validTo_time_t']) ? (int)$datos['validTo_time_t'] : 0;

    return [
        'titular' => (string)($sujeto['CN'] ?? $sujeto['O'] ?? ''),
        'ruc' => $ruc,
        'emisor' => (string)(($datos['issuer'] ?? [])['CN'] ?? ''),
        'caduca' => $caduca ? date('Y-m-d', $caduca) : '',
        'diasParaCaducar' => $caduca ? (int)floor(($caduca - time()) / 86400) : null,
    ];
}

/**
 * El usuario que se le manda a SUNAT, y qué tiene de raro.
 *
 * SUNAT NO RECIBE EL USUARIO SECUNDARIO A SECAS: recibe el RUC pegado delante
 * -«15606050906DRCACERE»-. Esa union la hace la libreria, asi que en la
 * configuracion van por separado... y ahi esta la trampa: quien escribe el
 * usuario ya concatenado acaba mandando el RUC dos veces
 * («1560605090615606050906DRCACERE») y SUNAT contesta lo mismo que si no
 * tuviera permisos. Nada en pantalla decia cual de las dos cosas pasaba.
 *
 * SUNAT ademas pide el usuario en MAYUSCULAS y de 8 caracteres o mas. Un
 * usuario en minusculas o corto se rechaza igual, y tampoco se veia.
 *
 * Devuelve lo que se envia y una lista de reparos. No decide nada: solo lo
 * enseña, para poder compararlo con lo que dice el portal de SUNAT.
 */
function fact_usuario_sunat(): array
{
    $ruc = fact_cfg('RUC');
    $usuario = fact_cfg('SOL_USUARIO');
    $reparos = [];

    if ($usuario === '') {
        return ['envia' => '', 'usuario' => '', 'reparos' => ['Falta SOL_USUARIO en el .env.']];
    }

    if ($ruc !== '' && str_starts_with($usuario, $ruc)) {
        $reparos[] = 'SOL_USUARIO empieza por su RUC. El RUC se añade solo: quitelo y deje'
            . ' unicamente el usuario secundario, o se enviara dos veces.';
    }
    if (mb_strlen($usuario) < 8) {
        $reparos[] = 'El usuario secundario de SUNAT tiene 8 caracteres o mas, y este tiene '
            . mb_strlen($usuario) . '.';
    }
    if ($usuario !== mb_strtoupper($usuario)) {
        $reparos[] = 'SUNAT exige el usuario en MAYUSCULAS.';
    }
    if (trim($usuario) !== $usuario) {
        $reparos[] = 'SOL_USUARIO tiene espacios al principio o al final.';
    }

    return ['envia' => $ruc . $usuario, 'usuario' => $usuario, 'reparos' => $reparos];
}

/**
 * La huella de la clave SOL: cuanto mide y que tiene de raro. NUNCA la clave.
 *
 * LA CLAVE ES LO UNICO QUE NO SE PUEDE MIRAR, y por eso su fallo -«0102:
 * usuario o contraseña incorrectos»- se diagnostica a ciegas: se vuelve a
 * escribir, se prueba, y si sigue mal no se sabe si esta mal copiada, si el
 * archivo se la comio o si de verdad es otra. Esto no la enseña; enseña lo
 * justo para comparar con lo que uno cree haber escrito.
 *
 * Los dos reparos son los dos unicos casos en que el lector de `.env` ALTERA
 * lo escrito: unas comillas alrededor se quitan, y un espacio al final se
 * recorta. Todo lo demas -almohadillas, iguales, dolares, acentos, espacios
 * por el medio- sobrevive intacto; esta comprobado.
 */
function fact_huella_clave(): array
{
    $env = fact_env();
    $crudo = $env['SOL_CLAVE'] ?? null;      // tal cual lo devuelve el lector
    $clave = fact_cfg('SOL_CLAVE');
    $reparos = [];

    if ($clave === '') {
        return ['largo' => 0, 'reparos' => ['Falta SOL_CLAVE en el .env.']];
    }

    // La linea original, para ver lo que el lector pudo haberse comido.
    $linea = '';
    $ruta = FACT_BASE . '/.env';
    if (is_readable($ruta)) {
        foreach (file($ruta, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) as $l) {
            if (str_starts_with(ltrim($l), 'SOL_CLAVE=')) {
                $linea = substr(ltrim($l), strlen('SOL_CLAVE='));
                break;
            }
        }
    }

    if ($linea !== '' && $linea !== $clave) {
        if (strlen($linea) >= 2 && ($linea[0] === '"' || $linea[0] === "'")) {
            $reparos[] = 'La clave esta entre comillas en el .env y las comillas se quitan al'
                . ' leerla. Si forman parte de la clave, no estan llegando; si no, sobran.';
        } elseif (trim($linea) !== $linea) {
            $reparos[] = 'La clave tiene espacios al principio o al final en el .env, y se'
                . ' recortan al leerla.';
        }
    }

    // SUNAT pide entre 6 y 12 caracteres para la clave de un usuario secundario.
    $largo = strlen($clave);
    if ($largo < 6 || $largo > 12) {
        $reparos[] = 'SUNAT pide una clave de 6 a 12 caracteres para el usuario secundario, y'
            . ' esta tiene ' . $largo . '.';
    }

    return ['largo' => $largo, 'reparos' => $reparos];
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
