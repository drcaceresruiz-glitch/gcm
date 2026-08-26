<?php
/**
 * almacen.php — El libro de comprobantes: correlativos, estado y archivos.
 *
 * SOLO CRECE. Cada emisión añade una línea a `datos/comprobantes.jsonl` y cada
 * cosa que le pasa después —que SUNAT la acepte, que entre en un resumen
 * diario— añade OTRA línea, nunca corrige la anterior. Un comprobante emitido
 * es un hecho tributario: lo que hay que poder reconstruir es la historia
 * completa, incluidos los errores, no el último estado.
 *
 * EL CORRELATIVO NO PUEDE SALTAR NI REPETIRSE. SUNAT exige numeración
 * correlativa por serie, así que el número se toma del mayor EMITIDO de esa
 * serie más uno, y se reserva escribiendo la línea ANTES de mandar nada. Si el
 * envío falla, ese número queda gastado y marcado como fallido: es preferible
 * un hueco explicable a dos comprobantes con el mismo número.
 *
 * XML Y CDR SE GUARDAN EN DISCO. El XML firmado es el comprobante; el CDR es
 * la constancia de que SUNAT lo recibió. Hay obligación de conservarlos, y sin
 * ellos no se puede demostrar nada.
 */

declare(strict_types=1);

require_once __DIR__ . '/config.php';

function fact_libro(): string
{
    return fact_datos_dir() . '/comprobantes.jsonl';
}

function fact_asegurar_directorios(): void
{
    foreach ([fact_datos_dir(), fact_datos_dir() . '/xml', fact_datos_dir() . '/cdr'] as $dir) {
        if (!is_dir($dir)) {
            mkdir($dir, 0700, true);
        }
    }
}

/** Lee el libro entero. Una línea ilegible se salta: no tumba el servicio. */
function fact_leer_libro(): array
{
    $ruta = fact_libro();
    if (!is_readable($ruta)) {
        return [];
    }
    $filas = [];
    foreach (file($ruta, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) as $linea) {
        $fila = json_decode($linea, true);
        if (is_array($fila)) {
            $filas[] = $fila;
        }
    }
    return $filas;
}

function fact_anotar(array $fila): void
{
    fact_asegurar_directorios();
    $fila['registradoEn'] = date('c');
    // LOCK_EX y la línea entera de una vez: dos peticiones simultáneas no
    // pueden entrelazar sus escrituras y dejar media línea en el libro.
    file_put_contents(
        fact_libro(),
        json_encode($fila, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) . "\n",
        FILE_APPEND | LOCK_EX
    );
}

/**
 * El siguiente correlativo de una serie.
 *
 * Cuenta TODAS las líneas de emisión de esa serie, fallidas incluidas: un
 * número que se mandó a SUNAT y fue rechazado no se reutiliza, porque no hay
 * forma de saber desde aquí si SUNAT llegó a registrarlo.
 */
function fact_siguiente_correlativo(string $serie): int
{
    $mayor = 0;
    foreach (fact_leer_libro() as $fila) {
        if (($fila['tipo'] ?? '') !== 'emision') {
            continue;
        }
        if (($fila['serie'] ?? '') === $serie && (int)($fila['correlativo'] ?? 0) > $mayor) {
            $mayor = (int)$fila['correlativo'];
        }
    }
    return $mayor + 1;
}

/** ¿Este pedido ya tiene comprobante? Devuelve la emisión, o null. */
function fact_comprobante_de(string $pedido): ?array
{
    foreach (fact_leer_libro() as $fila) {
        if (($fila['tipo'] ?? '') === 'emision' && ($fila['pedido'] ?? '') === $pedido) {
            return $fila;
        }
    }
    return null;
}

/** El estado consolidado de un comprobante: su emisión más lo que vino luego. */
function fact_estado(string $serie, int $correlativo): ?array
{
    $emision = null;
    $posteriores = [];
    foreach (fact_leer_libro() as $fila) {
        if (($fila['serie'] ?? '') !== $serie || (int)($fila['correlativo'] ?? -1) !== $correlativo) {
            continue;
        }
        if (($fila['tipo'] ?? '') === 'emision') {
            $emision = $fila;
        } else {
            $posteriores[] = $fila;
        }
    }
    if ($emision === null) {
        return null;
    }
    $emision['historial'] = $posteriores;
    foreach ($posteriores as $p) {
        if (isset($p['estado'])) {
            $emision['estado'] = $p['estado'];
        }
    }
    return $emision;
}

/** Las boletas emitidas ese día que todavía no se han informado a SUNAT. */
function fact_boletas_sin_resumir(string $fecha): array
{
    $emisiones = [];
    $resumidas = [];
    foreach (fact_leer_libro() as $fila) {
        $clave = ($fila['serie'] ?? '') . '-' . ($fila['correlativo'] ?? '');
        if (($fila['tipo'] ?? '') === 'emision'
            && ($fila['documento'] ?? '') === 'boleta'
            && ($fila['fechaEmision'] ?? '') === $fecha
            && ($fila['estado'] ?? '') !== 'fallido') {
            $emisiones[$clave] = $fila;
        }
        if (($fila['tipo'] ?? '') === 'resumen_enviado') {
            foreach (($fila['incluidos'] ?? []) as $inc) {
                $resumidas[$inc] = true;
            }
        }
    }
    return array_values(array_filter(
        $emisiones,
        fn($k) => !isset($resumidas[$k]),
        ARRAY_FILTER_USE_KEY
    ));
}

function fact_guardar_xml(string $nombre, string $contenido): string
{
    fact_asegurar_directorios();
    $ruta = fact_datos_dir() . '/xml/' . basename($nombre) . '.xml';
    file_put_contents($ruta, $contenido);
    return $ruta;
}

function fact_guardar_cdr(string $nombre, string $contenido): string
{
    fact_asegurar_directorios();
    $ruta = fact_datos_dir() . '/cdr/R-' . basename($nombre) . '.zip';
    file_put_contents($ruta, $contenido);
    return $ruta;
}
