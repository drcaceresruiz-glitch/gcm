<?php
/**
 * correlativo_por_modo.php — Que pasar a producción NO herede la numeración
 * de las pruebas.
 *
 * POR QUÉ EXISTE ESTA PRUEBA. El libro de comprobantes es uno solo y guarda
 * tanto lo emitido contra el entorno beta de SUNAT como lo real. El correlativo
 * se calculaba sobre TODO el libro, así que el día del paso a producción la
 * primera boleta real habría salido con el número siguiente al de las pruebas
 * —B001-3, porque en beta se llegó a B001-2— y la serie real habría nacido con
 * un hueco. Se corrió a mano una vez y se corrigió; esto es lo que impide que
 * vuelva.
 *
 * Se ejecuta:  php facturacion/pruebas/correlativo_por_modo.php
 */

declare(strict_types=1);

require_once __DIR__ . '/../src/almacen.php';

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

// Un libro de mentira, en una carpeta temporal, con lo mismo que hay hoy en el
// servidor: dos boletas y una factura emitidas contra beta.
$temporal = sys_get_temp_dir() . '/fact_prueba_' . getmypid();
mkdir($temporal . '/datos', 0700, true);
putenv('FACT_DATOS_DIR=' . $temporal . '/datos');

/** Recorre los dos modos sin tocar el `.env` real. */
function fact_modo_forzado(string $modo): void
{
    putenv('FACT_SUNAT_MODO=' . $modo);
}

$libro = $temporal . '/datos/comprobantes.jsonl';
$lineas = [
    ['tipo' => 'emision', 'pedido' => 'DCR-1', 'documento' => 'boleta', 'serie' => 'B001',
     'correlativo' => 1, 'estado' => 'fallido', 'fechaEmision' => '2026-08-25', 'modo' => 'beta'],
    ['tipo' => 'emision', 'pedido' => 'DCR-2', 'documento' => 'boleta', 'serie' => 'B001',
     'correlativo' => 2, 'estado' => 'aceptado', 'fechaEmision' => '2026-08-25', 'modo' => 'beta'],
    ['tipo' => 'emision', 'pedido' => 'DCR-3', 'documento' => 'factura', 'serie' => 'F001',
     'correlativo' => 1, 'estado' => 'aceptado', 'fechaEmision' => '2026-08-25', 'modo' => 'beta'],
];
file_put_contents($libro, implode("\n", array_map(
    fn($l) => json_encode($l, JSON_UNESCAPED_UNICODE),
    $lineas
)) . "\n");

echo "Correlativos separados por modo\n";

// --- En beta, la numeración de beta sigue donde estaba -----------------------
fact_modo_forzado('beta');
comprobar('en beta la siguiente boleta es la 3', 3, fact_siguiente_correlativo('B001'));
comprobar('en beta la siguiente factura es la 2', 2, fact_siguiente_correlativo('F001'));
comprobar('en beta el pedido ya facturado se reconoce',
    2, fact_comprobante_de('DCR-2')['correlativo'] ?? null);
comprobar('en beta la emisión fallida NO se da por buena',
    null, fact_comprobante_de('DCR-1'));

// --- En producción, la numeración real EMPIEZA EN 1 --------------------------
fact_modo_forzado('produccion');
comprobar('en producción la primera boleta es la 1', 1, fact_siguiente_correlativo('B001'));
comprobar('en producción la primera factura es la 1', 1, fact_siguiente_correlativo('F001'));
comprobar('en producción un pedido facturado en beta NO tiene comprobante',
    null, fact_comprobante_de('DCR-2'));
comprobar('en producción el cron no ve las boletas de beta para resumir',
    0, count(fact_boletas_sin_resumir('2026-08-25')));
comprobar('en producción el estado de B001-2 de beta no se hereda',
    null, fact_estado('B001', 2));

// --- Una línea SIN modo (libro de una versión anterior) cuenta en los dos ----
// Es el criterio prudente: nunca reutilizar un número que quizá se usó, nunca
// emitir dos veces por la misma venta.
file_put_contents($libro, json_encode([
    'tipo' => 'emision', 'pedido' => 'VIEJO-1', 'documento' => 'boleta', 'serie' => 'B009',
    'correlativo' => 7, 'estado' => 'aceptado', 'fechaEmision' => '2026-08-20',
], JSON_UNESCAPED_UNICODE) . "\n", FILE_APPEND);

foreach (['beta', 'produccion'] as $modo) {
    fact_modo_forzado($modo);
    comprobar("en $modo una emisión sin modo gasta su número", 8, fact_siguiente_correlativo('B009'));
    comprobar("en $modo una emisión sin modo cuenta como comprobante",
        7, fact_comprobante_de('VIEJO-1')['correlativo'] ?? null);
}

// --- Un envio que SUNAT no llego a procesar NO gasta su numero ---------------
// Paso de verdad: la primera boleta real salio con SUNAT 0111 «no tiene el
// perfil para enviar comprobantes electronicos». SUNAT ni la miro, asi que no
// existe para ella; si su numero se quemara, la serie real habria empezado en
// el 2 y con un hueco que hay que explicar.
fact_modo_forzado('produccion');
file_put_contents($libro, json_encode([
    'tipo' => 'emision', 'pedido' => 'DCR-0111', 'documento' => 'boleta', 'serie' => 'B900',
    'correlativo' => 1, 'estado' => 'no_entregado', 'fechaEmision' => '2026-08-26',
    'modo' => 'produccion',
], JSON_UNESCAPED_UNICODE) . "\n", FILE_APPEND);

comprobar('lo que SUNAT no proceso deja su numero libre', 1, fact_siguiente_correlativo('B900'));
comprobar('y no cuenta como comprobante del pedido', null, fact_comprobante_de('DCR-0111'));
comprobar('ni se manda en el resumen diario del dia',
    0, count(fact_boletas_sin_resumir('2026-08-26')));

// Un rechazo de contenido SI lo gasta: ahi SUNAT si lo proceso.
file_put_contents($libro, json_encode([
    'tipo' => 'emision', 'pedido' => 'DCR-2026', 'documento' => 'boleta', 'serie' => 'B901',
    'correlativo' => 1, 'estado' => 'fallido', 'fechaEmision' => '2026-08-26',
    'modo' => 'produccion',
], JSON_UNESCAPED_UNICODE) . "\n", FILE_APPEND);

comprobar('un rechazo de SUNAT si gasta su numero', 2, fact_siguiente_correlativo('B901'));

// Limpieza.
array_map('unlink', glob($temporal . '/datos/*') ?: []);
@rmdir($temporal . '/datos');
@rmdir($temporal);

echo "\n== $hechas comprobaciones, $fallos fallidas ==\n";
exit($fallos === 0 ? 0 : 1);
