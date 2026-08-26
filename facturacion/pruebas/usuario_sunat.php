<?php
/**
 * usuario_sunat.php — Que el usuario que se le manda a SUNAT sea el correcto.
 *
 * POR QUÉ EXISTE ESTA PRUEBA. SUNAT no recibe el usuario secundario a secas:
 * recibe el RUC pegado delante — «15606050906DRCACERE» —. Esa unión la hace la
 * librería, así que en la configuración van por separado, y ahí está la
 * trampa: quien escribe el usuario ya concatenado manda el RUC dos veces y
 * SUNAT contesta exactamente lo mismo que si al usuario le faltaran permisos.
 * Con el error 0111 delante, no había forma de distinguir un permiso que aún
 * no se ha activado de un usuario mal escrito.
 *
 * SUNAT pide además el usuario en mayúsculas y de 8 caracteres o más.
 *
 * Se ejecuta:  php facturacion/pruebas/usuario_sunat.php
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

/** Prueba con un RUC y un usuario dados, sin tocar el `.env`. */
function con(string $ruc, string $usuario): array
{
    putenv('FACT_RUC=' . $ruc);
    putenv('FACT_SOL_USUARIO=' . $usuario);
    return fact_usuario_sunat();
}

const RUC = '15606050906';

echo "El usuario que recibe SUNAT\n";

// --- Lo correcto: usuario suelto, el RUC lo pone el sistema ------------------
$r = con(RUC, 'DRCACERE');
comprobar('el RUC se pega delante del usuario', '15606050906DRCACERE', $r['envia']);
comprobar('y no hay nada que reparar', [], $r['reparos']);

// --- El error que no se veía: el usuario ya lleva el RUC --------------------
$r = con(RUC, '15606050906DRCACERE');
comprobar('avisa si el usuario ya trae el RUC', 1, count($r['reparos']));
comprobar('y dice que se enviaría dos veces', true,
    str_contains($r['reparos'][0] ?? '', 'dos veces'));
comprobar('el envío duplicado se ve tal cual',
    '1560605090615606050906DRCACERE', $r['envia']);

// --- Lo que SUNAT rechaza por forma ----------------------------------------
$r = con(RUC, 'CORTO');
comprobar('avisa de un usuario de menos de 8 caracteres', true,
    str_contains(implode(' ', $r['reparos']), '8 caracteres'));

$r = con(RUC, 'drcacere');
comprobar('avisa de un usuario en minúsculas', true,
    str_contains(implode(' ', $r['reparos']), 'MAYUSCULAS'));

// Uno corto Y en minúsculas junta los dos reparos: se dicen todos, no el
// primero que aparezca.
$r = con(RUC, 'abc');
comprobar('junta los reparos que haya', 2, count($r['reparos']));

// --- Sin usuario no se inventa nada -----------------------------------------
$r = con(RUC, '');
comprobar('sin usuario, lo dice', true, str_contains($r['reparos'][0] ?? '', 'Falta SOL_USUARIO'));
comprobar('y no compone ningún envío', '', $r['envia']);

// --- Un RUC vacío no hace saltar el aviso de duplicado -----------------------
// str_starts_with($x, '') es siempre cierto: sin este cuidado, cualquier
// usuario parecería llevar el RUC dentro.
$r = con('', 'DRCACERE');
comprobar('sin RUC no se acusa de duplicado', [], $r['reparos']);

echo "\n== $hechas comprobaciones, $fallos fallidas ==\n";
exit($fallos === 0 ? 0 : 1);
