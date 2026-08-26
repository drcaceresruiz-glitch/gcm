<?php
/**
 * letras.php — El importe escrito con palabras.
 *
 * SUNAT exige en toda factura y boleta la leyenda 1000, el importe en letras:
 * «SON CINCO CON 00/100 SOLES». No es decorativa — sin ella el comprobante se
 * rechaza—, y no hay nada en PHP que la haga, así que se escribe aquí.
 *
 * Las trampas del castellano que hay que respetar, y que son justo donde
 * fallan las versiones improvisadas:
 *   · 1 → UNO, pero 21 → VEINTIUNO y 100 → CIEN (no «CIENTO»).
 *   · 16 a 19 y 21 a 29 van en una sola palabra: DIECISÉIS, VEINTITRÉS.
 *   · El millar en singular es MIL, no «UN MIL».
 *   · Un millón es UN MILLÓN; dos, DOS MILLONES.
 *
 * Se trabaja en CÉNTIMOS para que los decimales no se pierdan por el camino.
 */

declare(strict_types=1);

const FACT_UNIDADES = [
    '', 'UNO', 'DOS', 'TRES', 'CUATRO', 'CINCO', 'SEIS', 'SIETE', 'OCHO', 'NUEVE',
    'DIEZ', 'ONCE', 'DOCE', 'TRECE', 'CATORCE', 'QUINCE', 'DIECISEIS', 'DIECISIETE',
    'DIECIOCHO', 'DIECINUEVE', 'VEINTE', 'VEINTIUNO', 'VEINTIDOS', 'VEINTITRES',
    'VEINTICUATRO', 'VEINTICINCO', 'VEINTISEIS', 'VEINTISIETE', 'VEINTIOCHO', 'VEINTINUEVE',
];
const FACT_DECENAS = [
    3 => 'TREINTA', 4 => 'CUARENTA', 5 => 'CINCUENTA', 6 => 'SESENTA',
    7 => 'SETENTA', 8 => 'OCHENTA', 9 => 'NOVENTA',
];
const FACT_CENTENAS = [
    1 => 'CIENTO', 2 => 'DOSCIENTOS', 3 => 'TRESCIENTOS', 4 => 'CUATROCIENTOS',
    5 => 'QUINIENTOS', 6 => 'SEISCIENTOS', 7 => 'SETECIENTOS', 8 => 'OCHOCIENTOS',
    9 => 'NOVECIENTOS',
];

/** De 0 a 999. */
function fact_letras_centenas(int $n): string
{
    if ($n === 0) {
        return '';
    }
    if ($n === 100) {
        return 'CIEN';
    }
    if ($n < 30) {
        return FACT_UNIDADES[$n];
    }

    $partes = [];
    $centena = intdiv($n, 100);
    $resto = $n % 100;
    if ($centena > 0) {
        $partes[] = FACT_CENTENAS[$centena];
    }
    if ($resto > 0) {
        if ($resto < 30) {
            $partes[] = FACT_UNIDADES[$resto];
        } else {
            $decena = intdiv($resto, 10);
            $unidad = $resto % 10;
            $partes[] = $unidad > 0
                ? FACT_DECENAS[$decena] . ' Y ' . FACT_UNIDADES[$unidad]
                : FACT_DECENAS[$decena];
        }
    }
    return implode(' ', $partes);
}

/** La parte entera, hasta millones. */
function fact_letras_entero(int $n): string
{
    if ($n === 0) {
        return 'CERO';
    }

    $partes = [];
    $millones = intdiv($n, 1000000);
    $miles = intdiv($n % 1000000, 1000);
    $resto = $n % 1000;

    if ($millones > 0) {
        $partes[] = $millones === 1
            ? 'UN MILLON'
            : fact_letras_entero($millones) . ' MILLONES';
    }
    if ($miles > 0) {
        // «MIL», no «UN MIL».
        $partes[] = $miles === 1 ? 'MIL' : fact_letras_centenas($miles) . ' MIL';
    }
    if ($resto > 0) {
        $partes[] = fact_letras_centenas($resto);
    }
    return implode(' ', $partes);
}

/**
 * La leyenda completa, tal como la quiere SUNAT.
 *
 * @param int    $centimos importe total en céntimos
 * @param string $moneda   'PEN' o 'USD'
 */
function fact_importe_en_letras(int $centimos, string $moneda = 'PEN'): string
{
    $centimos = abs($centimos);
    $enteros = intdiv($centimos, 100);
    $decimales = $centimos % 100;
    $nombre = $moneda === 'USD' ? 'DOLARES AMERICANOS' : 'SOLES';

    return sprintf(
        'SON %s CON %02d/100 %s',
        fact_letras_entero($enteros),
        $decimales,
        $nombre
    );
}
