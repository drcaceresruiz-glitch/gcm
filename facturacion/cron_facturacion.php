<?php
/**
 * cron_facturacion.php — Lo que hay que hacer todos los días, sin que nadie mire.
 *
 * DOS COSAS, Y LAS DOS SON OBLIGACIÓN:
 *
 *  1. INFORMAR LAS BOLETAS DEL DÍA ANTERIOR. Una boleta se le entrega al
 *     cliente al momento, pero a SUNAT se le comunica agrupada, en un resumen
 *     diario, y hay plazo. Si este proceso deja de correr, las boletas siguen
 *     emitiéndose y SUNAT no se entera: el incumplimiento se acumula en
 *     silencio, que es la peor forma de incumplir.
 *
 *  2. RECOGER LOS TICKETS PENDIENTES. SUNAT no contesta al resumen en el acto:
 *     devuelve un ticket y hay que volver a preguntar. Un resumen enviado y
 *     nunca consultado es un resumen del que no sabemos si fue aceptado.
 *
 * SE EJECUTA DESDE LA LÍNEA DE ÓRDENES, no por web. Si alguien lo pide por
 * navegador, se corta: no hay motivo para que esto sea alcanzable desde fuera.
 *
 * En cPanel → Cron jobs, una vez al día basta. Por ejemplo a las 06:00:
 *
 *   0 6 * * *  /usr/local/bin/php /home/USUARIO/facturacion/cron_facturacion.php
 *
 * Conviene mandar su salida a un correo suyo: el día que falle, quiere leerlo.
 */

declare(strict_types=1);

if (PHP_SAPI !== 'cli') {
    http_response_code(403);
    exit("Esto se ejecuta desde el cron, no por web.\n");
}

require_once __DIR__ . '/src/emisor.php';

$hoy = date('Y-m-d');
echo "[facturación] " . date('c') . " — modo " . (fact_es_produccion() ? 'PRODUCCIÓN' : 'beta') . "\n";

if (!fact_configurado()) {
    fwrite(STDERR, "[facturación] SIN CONFIGURAR. Falta: " . implode('; ', fact_que_falta()) . "\n");
    exit(1);
}

$fallos = 0;

/* ------------------------------------------------ 1. resúmenes pendientes */
// Se miran los últimos días, no solo ayer: si el cron no corrió un día —el
// servidor estaba caído, o alguien lo desactivó— esas boletas se quedarían sin
// informar para siempre. Mirar atrás las recupera solas.
for ($atras = 1; $atras <= (int)fact_cfg('DIAS_A_REVISAR', '7'); $atras++) {
    $fecha = date('Y-m-d', strtotime("-$atras day"));
    $pendientes = fact_boletas_sin_resumir($fecha);
    if (!$pendientes) {
        continue;
    }
    echo "[facturación] " . count($pendientes) . " boleta(s) del $fecha sin informar. Enviando resumen…\n";
    $r = fact_resumen_diario($fecha);
    if ($r['ok'] ?? false) {
        echo "[facturación]   enviado. Ticket: " . ($r['ticket'] ?? '?') . "\n";
    } else {
        $fallos++;
        fwrite(STDERR, "[facturación]   FALLÓ: " . ($r['motivo'] ?? 'sin detalle') . "\n");
    }
}

/* --------------------------------------------------- 2. tickets sin respuesta */
$enviados = [];
$resueltos = [];
foreach (fact_leer_libro() as $fila) {
    if (($fila['tipo'] ?? '') === 'resumen_enviado' && !empty($fila['ticket'])) {
        $enviados[$fila['ticket']] = $fila;
    }
    if (($fila['tipo'] ?? '') === 'resumen_estado' && !empty($fila['ticket'])) {
        $resueltos[$fila['ticket']] = $fila;
    }
}

foreach ($enviados as $ticket => $envio) {
    // Un ticket ya resuelto Y aceptado no se vuelve a preguntar. Uno resuelto
    // con rechazo sí: puede haberse corregido la causa.
    if (isset($resueltos[$ticket]) && ($resueltos[$ticket]['aceptado'] ?? false)) {
        continue;
    }
    echo "[facturación] consultando ticket $ticket (resumen del " . ($envio['fecGeneracion'] ?? '?') . ")…\n";
    $r = fact_consultar_ticket((string)$ticket);
    if ($r['ok'] ?? false) {
        echo "[facturación]   " . ($r['aceptado'] ? 'ACEPTADO' : 'código ' . ($r['codigo'] ?? '?'))
            . ' — ' . ($r['descripcion'] ?? '') . "\n";
        if (!($r['aceptado'] ?? false)) {
            $fallos++;
        }
    } else {
        $fallos++;
        fwrite(STDERR, "[facturación]   FALLÓ: " . ($r['motivo'] ?? 'sin detalle') . "\n");
    }
}

echo "[facturación] terminado" . ($fallos ? " CON $fallos problema(s)" : ' sin problemas') . ".\n";
// Un código de salida distinto de cero hace que cPanel destaque el fallo en el
// correo del cron, en vez de mandar un mensaje que parece normal.
exit($fallos > 0 ? 1 : 0);
