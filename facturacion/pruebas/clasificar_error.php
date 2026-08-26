<?php
/**
 * clasificar_error.php — Qué rechazos de SUNAT gastan el número y cuáles no.
 *
 * POR QUÉ EXISTE ESTA PRUEBA. La primera boleta REAL salió rechazada con
 * «SUNAT 0111: No tiene el perfil para enviar comprobantes electronicos», un
 * fallo de permisos del usuario secundario. SUNAT no llegó a mirar el
 * comprobante —no hay constancia de recepción porque no hubo recepción—, pero
 * el código lo trataba igual que a un rechazo de contenido y quemaba el
 * número: la serie real habría empezado en B001-2, con un hueco de salida en
 * una numeración que tiene que ser correlativa.
 *
 * El corte está en el código que devuelve SUNAT:
 *   · 100-999   ni lo miró (autenticación, perfil, servicio caído) → número libre
 *   · 1000 o más lo procesó y lo rechazó por su contenido           → número gastado
 *
 * Se ejecuta:  php facturacion/pruebas/clasificar_error.php
 */

declare(strict_types=1);

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

/**
 * La misma clasificación que hace fact_emitir(), aislada para poder probarla
 * sin hablar con SUNAT. Se lee del propio emisor.php para que no puedan
 * separarse: si allí cambia el criterio y aquí no, esta prueba falla.
 */
function clasificar(string $codigo, bool $esFactura): string
{
    $codigoNumero = ($codigo !== '' && ctype_digit($codigo)) ? (int)$codigo : -1;
    $niLoMiro = $codigoNumero >= 100 && $codigoNumero <= 999;
    $loRechazoSunat = $codigoNumero >= 1000;

    if ($niLoMiro) {
        return 'no_entregado';
    }
    if ($loRechazoSunat || $esFactura) {
        return 'fallido';
    }
    return 'pendiente_resumen';
}

echo "Clasificación de los rechazos de SUNAT\n";

// --- Lo que SUNAT ni miró: el número sigue libre -----------------------------
// 0111 es el que salió de verdad; los otros son de la misma familia.
foreach (['0111' => 'no tiene el perfil para enviar comprobantes',
          '0100' => 'el sistema no puede responder',
          '0130' => 'no se pudo autenticar',
          '0999' => 'el último de la familia'] as $codigo => $queEs) {
    comprobar("$codigo ($queEs) deja el número libre",
        'no_entregado', clasificar((string)$codigo, false));
    comprobar("$codigo lo deja libre también en una factura",
        'no_entregado', clasificar((string)$codigo, true));
}

// --- Lo que SUNAT procesó y rechazó: el número se gasta ----------------------
foreach (['1033' => 'el comprobante ya fue registrado',
          '2026' => 'falta la descripción del ítem',
          '2324' => 'el importe no cuadra',
          '4000' => 'rechazo con constancia'] as $codigo => $queEs) {
    comprobar("$codigo ($queEs) gasta el número", 'fallido', clasificar((string)$codigo, false));
}

// --- Un fallo de transporte no trae código numérico --------------------------
// Ahí no se sabe si llegó, así que una boleta se recupera por el resumen
// diario y una factura queda fallida para reintentarla a mano.
comprobar('sin código, una boleta va al resumen del día',
    'pendiente_resumen', clasificar('CDR', false));
comprobar('sin código, una factura queda fallida', 'fallido', clasificar('CDR', true));
comprobar('un código vacío se trata igual', 'pendiente_resumen', clasificar('', false));

// --- Y el criterio es EL MISMO que el del emisor -----------------------------
// Si alguien cambia fact_emitir() y se olvida de esta prueba, esto lo caza.
$fuente = file_get_contents(__DIR__ . '/../src/emisor.php');
comprobar('el emisor usa el mismo corte de 100 a 999', true,
    str_contains($fuente, '$codigoNumero >= 100 && $codigoNumero <= 999'));
comprobar('y el mismo corte de 1000 en adelante', true,
    str_contains($fuente, '$codigoNumero >= 1000'));
comprobar('y marca no_entregado', true, str_contains($fuente, "'no_entregado'"));

echo "\n== $hechas comprobaciones, $fallos fallidas ==\n";
exit($fallos === 0 ? 0 : 1);
