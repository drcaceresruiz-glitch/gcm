<?php
/**
 * index.php — La puerta del servicio de facturación.
 *
 * Este servicio NO se abre a internet para que lo llame cualquiera: lo llama el
 * checkout, servidor a servidor, con una clave compartida. Emitir un
 * comprobante es un hecho tributario a nombre del emisor; que un tercero pueda
 * disparar uno sería tan grave como que pudiera cobrar.
 *
 * LA CLAVE SE COMPARA EN TIEMPO CONSTANTE. `hash_equals` no es una manía: un
 * `===` filtra por lo que tarda cuántos caracteres iniciales se acertaron.
 *
 * SE ACCEDE POR `?accion=`, no por rutas bonitas. En alojamiento compartido las
 * reescrituras de `.htaccess` fallan de formas silenciosas y difíciles de ver
 * desde fuera; un parámetro funciona en cualquier sitio.
 *
 * Acciones:
 *   GET  ?accion=estado    ¿está configurado? qué falta
 *   POST ?accion=emitir    emite la factura o la boleta de un pedido
 *   POST ?accion=resumen   informa a SUNAT las boletas de un día
 *   POST ?accion=ticket    pregunta por el resultado de un resumen
 *   POST ?accion=xml       devuelve el XML firmado de un pedido ya emitido
 */

declare(strict_types=1);

require_once __DIR__ . '/src/emisor.php';

header('Content-Type: application/json; charset=utf-8');
header('X-Robots-Tag: noindex, nofollow');
header('Cache-Control: no-store');

function fact_responder(int $codigo, array $cuerpo): never
{
    http_response_code($codigo);
    echo json_encode($cuerpo, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

/**
 * ¿Quien llama tiene la clave?
 *
 * Sin `CLAVE_API` configurada NO se deja pasar a nadie. Falla cerrado: un
 * servicio que emite comprobantes no puede quedar abierto porque alguien
 * olvidara rellenar una variable.
 */
function fact_autorizado(): bool
{
    $esperada = fact_cfg('CLAVE_API');
    if ($esperada === '') {
        return false;
    }
    $recibida = $_SERVER['HTTP_X_CLAVE_FACTURACION'] ?? '';
    return is_string($recibida) && $recibida !== '' && hash_equals($esperada, $recibida);
}

function fact_cuerpo(): array
{
    $crudo = file_get_contents('php://input');
    $datos = json_decode($crudo ?: '[]', true);
    return is_array($datos) ? $datos : [];
}

$accion = (string)($_GET['accion'] ?? '');

if (!fact_autorizado()) {
    // El mismo mensaje tanto si falta la clave como si es incorrecta: no hay
    // nada que confirmarle a quien está probando.
    fact_responder(401, ['ok' => false, 'error' => 'No autorizado.']);
}

if ($accion === 'estado') {
    $falta = fact_que_falta();
    $serieFactura = fact_cfg('SERIE_FACTURA', 'F001');
    $serieBoleta = fact_cfg('SERIE_BOLETA', 'B001');
    fact_responder(200, [
        'ok' => true,
        'configurado' => fact_configurado() && !$falta,
        'modo' => fact_es_produccion() ? 'produccion' : 'beta',
        'endpoint' => fact_endpoint(),
        'ruc' => fact_cfg('RUC'),
        'razonSocial' => fact_cfg('RAZON_SOCIAL'),
        'serieFactura' => $serieFactura,
        'serieBoleta' => $serieBoleta,
        // Con qué número saldría el PRÓXIMO comprobante de cada serie. Es la
        // única forma de comprobar un paso a producción sin vender de verdad:
        // recién cambiado el modo, las dos tienen que decir 1.
        'proximaFactura' => fact_siguiente_correlativo($serieFactura),
        'proximaBoleta' => fact_siguiente_correlativo($serieBoleta),
        'boletaEnvio' => fact_cfg('BOLETA_ENVIO', 'individual'),
        // De quién es el certificado y hasta cuándo vale. En producción, su RUC
        // tiene que ser el mismo que el del emisor.
        'certificado' => fact_datos_certificado(),
        'falta' => $falta,
    ]);
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    fact_responder(405, ['ok' => false, 'error' => 'Use POST.']);
}

if ($accion === 'emitir') {
    $pedido = fact_cuerpo();
    if (($pedido['pedido'] ?? '') === '' || (int)($pedido['importeCentimos'] ?? 0) <= 0) {
        fact_responder(400, ['ok' => false, 'error' => 'Faltan el pedido o el importe.']);
    }
    // El tipo de documento del comprador llega del checkout y aquí solo se
    // acepta del catálogo conocido: cualquier otra cosa se descarta y el
    // emisor volverá a inferir por el largo del número, como siempre hizo.
    $tipoDoc = strtolower(trim((string)($pedido['tipoDocumento'] ?? '')));
    $pedido['tipoDocumento'] = in_array($tipoDoc, ['dni', 'ce', 'pasaporte', 'ruc'], true) ? $tipoDoc : '';

    // Las líneas llegan como vienen y se limpian aquí: es la frontera del
    // servicio, y lo que entra por HTTP no se mete en un comprobante sin mirar.
    // Cómo se cobró: PRODUCTION si el dinero fue real. Se limpia aquí, como
    // todo lo que entra por HTTP; la decisión de qué hacer con él la toma
    // fact_emitir().
    $pedido['modoPago'] = mb_substr((string)($pedido['modoPago'] ?? ''), 0, 20);
    if (isset($pedido['lineas']) && is_array($pedido['lineas'])) {
        $limpias = [];
        foreach (array_slice($pedido['lineas'], 0, 50) as $l) {
            if (!is_array($l)) {
                continue;
            }
            $limpias[] = [
                'productoId' => mb_substr((string)($l['productoId'] ?? ''), 0, 30),
                'nombre' => mb_substr((string)($l['nombre'] ?? ''), 0, 250),
                'cantidad' => max(1, min(9999, (int)($l['cantidad'] ?? 1))),
                'precioUnitarioCentimos' => max(0, (int)($l['precioUnitarioCentimos'] ?? 0)),
                'importeCentimos' => max(0, (int)($l['importeCentimos'] ?? 0)),
            ];
        }
        $pedido['lineas'] = $limpias;
    }

    $r = fact_emitir($pedido);
    fact_responder($r['ok'] ? 200 : 502, $r);
}

if ($accion === 'resumen') {
    $cuerpo = fact_cuerpo();
    // Por defecto, AYER: el resumen de un día se manda cuando ese día ya se
    // cerró. Informar el día en curso dejaría fuera las boletas de después.
    $fecha = (string)($cuerpo['fecha'] ?? date('Y-m-d', strtotime('-1 day')));
    if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $fecha)) {
        fact_responder(400, ['ok' => false, 'error' => 'Fecha inválida: use AAAA-MM-DD.']);
    }
    $r = fact_resumen_diario($fecha);
    fact_responder($r['ok'] ? 200 : 502, $r);
}

if ($accion === 'xml') {
    // El XML firmado ES el comprobante: es lo que se le manda al comprador.
    // Se devuelve solo el de un pedido YA emitido —nunca se firma nada aquí—,
    // y el nombre del archivo se compone desde el libro, no desde lo que llegue
    // en la petición: que nadie pueda pedir «../../.env» por esta puerta.
    $cuerpo = fact_cuerpo();
    $idPedido = trim((string)($cuerpo['pedido'] ?? ''));
    if ($idPedido === '') {
        fact_responder(400, ['ok' => false, 'error' => 'Falta el pedido.']);
    }
    $comprobante = fact_comprobante_de($idPedido);
    if ($comprobante === null) {
        fact_responder(404, ['ok' => false, 'error' => 'Ese pedido no tiene comprobante emitido.']);
    }
    $ruta = fact_datos_dir() . '/xml/' . basename((string)$comprobante['nombreXml']) . '.xml';
    if (!is_readable($ruta)) {
        fact_responder(404, ['ok' => false, 'error' => 'El XML de ese comprobante no está en el servidor.']);
    }
    fact_responder(200, [
        'ok' => true,
        'nombre' => basename($comprobante['nombreXml']) . '.xml',
        'documento' => $comprobante['documento'] ?? null,
        'serie' => $comprobante['serie'] ?? null,
        'correlativo' => $comprobante['correlativo'] ?? null,
        'xml' => file_get_contents($ruta),
    ]);
}

if ($accion === 'ticket') {
    $cuerpo = fact_cuerpo();
    $ticket = trim((string)($cuerpo['ticket'] ?? ''));
    if ($ticket === '') {
        fact_responder(400, ['ok' => false, 'error' => 'Falta el ticket.']);
    }
    $r = fact_consultar_ticket($ticket);
    fact_responder($r['ok'] ? 200 : 502, $r);
}

fact_responder(404, ['ok' => false, 'error' => 'Acción desconocida.']);
