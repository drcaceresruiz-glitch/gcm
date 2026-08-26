<?php
/**
 * pago_de_prueba.php — Que un cobro de mentira no saque un comprobante real.
 *
 * POR QUÉ EXISTE ESTA PRUEBA. La pasarela de pago y este servicio se ponen en
 * producción por separado, y entre una cosa y otra hay un rato —a veces días—
 * en que la tienda sigue cobrando con tarjetas de prueba mientras aquí ya se
 * emite de verdad. Se detectó justo en ese hueco: la facturación acababa de
 * pasar a producción y la tienda seguía en modo de pruebas, así que la
 * siguiente compra de mentira habría sacado una boleta REAL ante SUNAT por una
 * venta que nunca ocurrió. Eso solo se deshace con una nota de crédito.
 *
 * El criterio es exigir que el pago diga que fue real, no que diga que fue de
 * prueba: un pedido viejo sin el dato tampoco se factura. Dejar una venta sin
 * comprobante se arregla emitiéndolo cuando se aclare; emitir uno que no
 * correspondía, no.
 *
 * Se ejecuta:  php facturacion/pruebas/pago_de_prueba.php
 */

declare(strict_types=1);

require_once __DIR__ . '/../src/emisor.php';

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

$temporal = sys_get_temp_dir() . '/fact_pago_' . getmypid();
mkdir($temporal . '/datos', 0700, true);
putenv('FACT_DATOS_DIR=' . $temporal . '/datos');

/** Un pedido cualquiera, cobrado del modo que se diga. */
function pedido_con(?string $modoPago): array
{
    $p = [
        'pedido' => 'DCR-' . substr(md5((string)$modoPago), 0, 8),
        'importeCentimos' => 500,
        'moneda' => 'PEN',
        'documento' => '',
        'nombres' => 'CLIENTE',
        'productoNombre' => 'Producto',
    ];
    if ($modoPago !== null) {
        $p['modoPago'] = $modoPago;
    }
    return $p;
}

echo "Un pago de prueba no saca comprobante real\n";

// --- En PRODUCCIÓN -----------------------------------------------------------
putenv('FACT_SUNAT_MODO=produccion');

foreach (['TEST', 'test', '', 'CUALQUIER COSA'] as $modo) {
    $r = fact_emitir(pedido_con($modo));
    comprobar("en producción se niega a facturar un pago «{$modo}»",
        true, ($r['ok'] === false) && !empty($r['rechazadoPorModo']));
}

$r = fact_emitir(pedido_con(null));
comprobar('en producción se niega si el pedido no dice cómo se cobró',
    true, ($r['ok'] === false) && !empty($r['rechazadoPorModo']));

// Un pago real sí pasa la guarda. No llega a emitirse porque falta la
// configuración de SUNAT —esto no habla con nadie—, pero el motivo del fallo
// demuestra que la guarda lo dejó pasar.
$r = fact_emitir(pedido_con('PRODUCTION'));
comprobar('en producción un pago real pasa la guarda',
    false, !empty($r['rechazadoPorModo']));
$r2 = fact_emitir(pedido_con('production'));
comprobar('y da igual cómo esté escrito', false, !empty($r2['rechazadoPorModo']));

// --- En BETA no estorba ------------------------------------------------------
// Lo emitido contra el entorno de pruebas no existe para SUNAT, así que ahí un
// pago de prueba es exactamente lo que se quiere facturar.
putenv('FACT_SUNAT_MODO=beta');

foreach (['TEST', 'PRODUCTION', ''] as $modo) {
    $r = fact_emitir(pedido_con($modo));
    comprobar("en beta no estorba a un pago «{$modo}»", false, !empty($r['rechazadoPorModo']));
}

// --- Un comprobante ya emitido se devuelve igual ------------------------------
// La idempotencia manda sobre la guarda: si por lo que sea ya existe, lo que
// hace falta es NO emitir otro.
putenv('FACT_SUNAT_MODO=produccion');
$yaEmitido = pedido_con('TEST');
fact_anotar([
    'tipo' => 'emision', 'pedido' => $yaEmitido['pedido'], 'documento' => 'boleta',
    'serie' => 'B001', 'correlativo' => 9, 'estado' => 'aceptado',
    'fechaEmision' => '2026-08-26', 'modo' => 'produccion',
]);
$r = fact_emitir($yaEmitido);
comprobar('un pedido ya facturado devuelve el suyo, no otro', true, !empty($r['repetido']));

// --- Y no se gasta un correlativo por un rechazo ------------------------------
$antes = fact_siguiente_correlativo('B001');
fact_emitir(pedido_con('TEST'));
comprobar('un rechazo no gasta correlativo', $antes, fact_siguiente_correlativo('B001'));

// Limpieza. El almacén crea subcarpetas para los XML y los CDR, asi que se
// borra de dentro hacia fuera.
foreach (['/datos/xml', '/datos/cdr', '/datos', ''] as $sub) {
    foreach (glob($temporal . $sub . '/*') ?: [] as $f) {
        if (is_file($f)) {
            unlink($f);
        }
    }
}
foreach (['/datos/xml', '/datos/cdr', '/datos', ''] as $sub) {
    @rmdir($temporal . $sub);
}

echo "\n== $hechas comprobaciones, $fallos fallidas ==\n";
exit($fallos === 0 ? 0 : 1);
