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
 * BETA Y PRODUCCIÓN SON DOS UNIVERSOS EN UN MISMO LIBRO. Lo emitido en el
 * entorno de pruebas de SUNAT no existe para SUNAT, así que no puede gastar
 * números de la numeración real: el día que se pasa a producción, la serie
 * empieza en 1 aunque en beta se hubiera llegado a 50. Por eso todo lo que
 * cuenta o busca comprobantes mira SOLO los del modo en que se está
 * operando, con `fact_del_modo_actual()`.
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
 * ¿Esta línea del libro pertenece al modo en que estamos operando?
 *
 * Una línea SIN `modo` es de una versión anterior a que se anotara, y se da
 * por buena en los dos modos A PROPÓSITO. El criterio es el prudente en cada
 * dirección: para el correlativo, contarla evita reutilizar un número que
 * quizá sí se usó; para «¿ya tiene comprobante?», tenerla en cuenta evita
 * emitir dos veces por la misma venta. Equivocarse hacia el otro lado cuesta
 * un comprobante duplicado, que solo se deshace con una nota de crédito.
 */
function fact_del_modo_actual(array $fila): bool
{
    $modo = (string)($fila['modo'] ?? '');
    return $modo === '' || $modo === (fact_es_produccion() ? 'produccion' : 'beta');
}

/**
 * El siguiente correlativo de una serie, DENTRO del modo actual.
 *
 * Cuenta las líneas de emisión de esa serie, LAS FALLIDAS INCLUIDAS: un número
 * que SUNAT procesó y rechazó no se reutiliza, porque desde aquí no hay forma
 * de saber si llegó a registrarlo.
 *
 * La excepción son las marcadas `no_entregado`: esas ni salieron del servidor
 * o SUNAT las rechazó antes de mirarlas —un fallo de perfil, de autenticación
 * o del propio servicio—, así que su número sigue libre y se vuelve a usar.
 * Quemarlo abriría un hueco en una serie que tiene que ser correlativa.
 *
 * Lo emitido en beta NO cuenta: si contara, la primera boleta real saldría con
 * el número siguiente al de las pruebas —B001-3 en vez de B001-1— y la serie
 * nacería con un hueco que SUNAT puede observar.
 */
function fact_siguiente_correlativo(string $serie): int
{
    $mayor = 0;
    foreach (fact_leer_libro() as $fila) {
        if (($fila['tipo'] ?? '') !== 'emision' || !fact_del_modo_actual($fila)) {
            continue;
        }
        if (($fila['estado'] ?? '') === 'no_entregado') {
            continue;
        }
        if (($fila['serie'] ?? '') === $serie && (int)($fila['correlativo'] ?? 0) > $mayor) {
            $mayor = (int)$fila['correlativo'];
        }
    }
    return $mayor + 1;
}

/**
 * ¿Este pedido ya tiene comprobante VÁLIDO? Devuelve la emisión, o null.
 *
 * UN INTENTO FALLIDO NO CUENTA, y pasarlo por alto costó caro: al reintentar
 * un pedido cuya primera emisión SUNAT había rechazado, esta función devolvía
 * aquel registro, `fact_emitir()` lo daba por «ya emitido» y contestaba que
 * todo estaba bien sin haber llamado a SUNAT. El panel enseñaba en verde
 * «Emitido: BOLETA B001-1» y no existía ninguna boleta.
 *
 * Su número sí queda gastado —eso es deliberado, está en
 * `fact_siguiente_correlativo()`—: lo que no puede es hacerse pasar por un
 * comprobante emitido.
 */
function fact_comprobante_de(string $pedido): ?array
{
    foreach (fact_leer_libro() as $fila) {
        if (($fila['tipo'] ?? '') === 'emision'
            && ($fila['pedido'] ?? '') === $pedido
            && !in_array($fila['estado'] ?? '', ['fallido', 'no_entregado'], true)
            && fact_del_modo_actual($fila)) {
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
        // El B001-2 de las pruebas y el B001-2 real son dos comprobantes
        // distintos con el mismo número: mezclar sus historiales daría por
        // aceptado uno que nunca se envió.
        if (($fila['tipo'] ?? '') === 'emision' && !fact_del_modo_actual($fila)) {
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
            && !in_array($fila['estado'] ?? '', ['fallido', 'no_entregado'], true)
            && fact_del_modo_actual($fila)) {
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
