<?php
/**
 * pdf.php — La representación impresa del comprobante.
 *
 * QUÉ ES Y QUÉ NO ES. El documento con validez ante SUNAT es el XML firmado;
 * esto es su «representación impresa», que es como SUNAT llama al papel (o al
 * PDF) que se le entrega a quien compra. No sustituye al XML: lo acompaña. Se
 * hace porque nadie abre un XML — el comprador quiere ver su boleta.
 *
 * SE LEE DEL XML FIRMADO, NO DEL LIBRO. Podría componerse con lo que guarda
 * `comprobantes.jsonl`, pero entonces el papel diría lo que nosotros creemos
 * haber enviado, y no lo que se envió. Leyéndolo del XML, si alguna vez los
 * dos discrepan, el PDF enseña la verdad y el fallo se ve. Además el XML es lo
 * único que tiene el resumen de la firma, que es obligatorio en el impreso.
 *
 * LO QUE SUNAT EXIGE que aparezca, y por eso está todo aquí:
 *   · emisor con RUC y domicilio fiscal, y adquirente con su documento
 *   · denominación del comprobante, serie-número y fecha
 *   · detalle, valor de venta, IGV e importe total
 *   · el importe total EN LETRAS
 *   · el código QR, con los campos en el orden y separador que ella define
 *   · el valor resumen (hash) de la firma digital
 *   · la leyenda de que es una representación impresa
 *
 * TCPDF y no un conversor de HTML: en un alojamiento compartido no hay binario
 * externo que valga, y TCPDF es PHP puro y trae el generador de QR dentro.
 */

declare(strict_types=1);

require_once __DIR__ . '/config.php';
require_once __DIR__ . '/almacen.php';

/** Los espacios de nombres de UBL 2.1, que es como viaja un comprobante. */
const FACT_NS = [
    'cbc' => 'urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2',
    'cac' => 'urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2',
    'ext' => 'urn:oasis:names:specification:ubl:schema:xsd:CommonExtensionComponents-2',
    'ds'  => 'http://www.w3.org/2000/09/xmldsig#',
];

/** El primer valor de una consulta, o una cadena vacía. */
function fact_xp(SimpleXMLElement $nodo, string $ruta): string
{
    $r = $nodo->xpath($ruta);
    return ($r && isset($r[0])) ? trim((string)$r[0]) : '';
}

/**
 * Saca del XML firmado todo lo que va en el impreso.
 *
 * Devuelve null si el XML no se puede leer: mejor no entregar papel que
 * entregar uno inventado.
 */
function fact_leer_xml(string $xml): ?array
{
    $antes = libxml_use_internal_errors(true);
    $doc = simplexml_load_string($xml);
    libxml_clear_errors();
    libxml_use_internal_errors($antes);
    if ($doc === false) {
        return null;
    }
    foreach (FACT_NS as $prefijo => $uri) {
        $doc->registerXPathNamespace($prefijo, $uri);
    }

    $emisor = '/*/cac:AccountingSupplierParty/cac:Party';
    $cliente = '/*/cac:AccountingCustomerParty/cac:Party';

    $lineas = [];
    foreach ($doc->xpath('/*/cac:InvoiceLine') ?: [] as $l) {
        foreach (FACT_NS as $p => $u) {
            $l->registerXPathNamespace($p, $u);
        }
        $lineas[] = [
            'descripcion' => fact_xp($l, 'cac:Item/cbc:Description'),
            'codigo' => fact_xp($l, 'cac:Item/cac:SellersItemIdentification/cbc:ID'),
            'cantidad' => (float)fact_xp($l, 'cbc:InvoicedQuantity'),
            'unidad' => (string)($l->xpath('cbc:InvoicedQuantity')[0]['unitCode'] ?? 'NIU'),
            'precioUnitario' => (float)fact_xp(
                $l,
                'cac:PricingReference/cac:AlternativeConditionPrice/cbc:PriceAmount'
            ),
            'valorVenta' => (float)fact_xp($l, 'cbc:LineExtensionAmount'),
        ];
    }

    // El importe en letras viaja como una nota con el código 1000.
    $enLetras = '';
    foreach ($doc->xpath('/*/cbc:Note') ?: [] as $nota) {
        if ((string)($nota['languageLocaleID'] ?? '') === '1000') {
            $enLetras = trim((string)$nota);
            break;
        }
    }

    $docCliente = $doc->xpath($cliente . '/cac:PartyIdentification/cbc:ID');
    return [
        'serieNumero' => fact_xp($doc, '/*/cbc:ID'),
        'fecha' => fact_xp($doc, '/*/cbc:IssueDate'),
        'tipoDoc' => fact_xp($doc, '/*/cbc:InvoiceTypeCode'),
        'moneda' => fact_xp($doc, '/*/cbc:DocumentCurrencyCode'),
        'emisorRuc' => fact_xp($doc, $emisor . '/cac:PartyIdentification/cbc:ID'),
        'emisorNombre' => fact_xp($doc, $emisor . '/cac:PartyLegalEntity/cbc:RegistrationName'),
        'emisorComercial' => fact_xp($doc, $emisor . '/cac:PartyName/cbc:Name'),
        // Distrito y provincia se repiten en media Lima y en todo el Callao;
        // «CALLAO CALLAO» en el domicilio parece un error de copiar y pegar.
        'emisorDireccion' => trim(implode(' - ', array_unique(array_filter([
            fact_xp($doc, $emisor . '/cac:PartyLegalEntity/cac:RegistrationAddress/cac:AddressLine/cbc:Line'),
            fact_xp($doc, $emisor . '/cac:PartyLegalEntity/cac:RegistrationAddress/cbc:District'),
            fact_xp($doc, $emisor . '/cac:PartyLegalEntity/cac:RegistrationAddress/cbc:CityName'),
        ])))),
        'clienteNombre' => fact_xp($doc, $cliente . '/cac:PartyLegalEntity/cbc:RegistrationName'),
        'clienteDoc' => fact_xp($doc, $cliente . '/cac:PartyIdentification/cbc:ID'),
        'clienteTipoDoc' => (string)(($docCliente[0] ?? null) ? ($docCliente[0]['schemeID'] ?? '') : ''),
        'lineas' => $lineas,
        'gravado' => (float)fact_xp($doc, '/*/cac:LegalMonetaryTotal/cbc:LineExtensionAmount'),
        'igv' => (float)fact_xp($doc, '/*/cac:TaxTotal/cbc:TaxAmount'),
        'total' => (float)fact_xp($doc, '/*/cac:LegalMonetaryTotal/cbc:PayableAmount'),
        'enLetras' => $enLetras,
        'hash' => fact_xp($doc, '//ds:DigestValue'),
    ];
}

/** Cómo se llama cada tipo de documento en el impreso. */
function fact_titulo_doc(string $tipo): string
{
    return $tipo === '01' ? 'FACTURA ELECTRÓNICA' : 'BOLETA DE VENTA ELECTRÓNICA';
}

/**
 * La unidad de medida, escrita como la lee una persona.
 *
 * En el XML va el código del catálogo 03 de SUNAT —«NIU», «ZZ»—, que en el
 * impreso no le dice nada a nadie. Un código que no esté en la lista se
 * enseña tal cual: es preferible a inventarle un nombre.
 */
function fact_nombre_unidad(string $codigo): string
{
    return [
        'NIU' => 'unidad', 'ZZ' => 'servicio', 'KGM' => 'kg', 'GRM' => 'g',
        'LTR' => 'litro', 'MTR' => 'm', 'MTQ' => 'm³', 'MTK' => 'm²',
        'HUR' => 'hora', 'DAY' => 'día', 'BX' => 'caja', 'PK' => 'paquete',
    ][strtoupper($codigo)] ?? $codigo;
}

/** El nombre del tipo de documento del adquirente, según el catálogo 06. */
function fact_nombre_tipo_doc_cliente(string $codigo): string
{
    return [
        '1' => 'DNI', '4' => 'Carné de extranjería', '6' => 'RUC',
        '7' => 'Pasaporte', '0' => 'Sin documento',
    ][$codigo] ?? 'Documento';
}

/**
 * El contenido del código QR.
 *
 * El orden y el separador los fija SUNAT; no es un texto libre. Termina en
 * barra a propósito: el último campo va seguido de separador igual que los
 * demás.
 */
function fact_texto_qr(array $d): string
{
    return implode('|', [
        $d['emisorRuc'],
        $d['tipoDoc'],
        explode('-', $d['serieNumero'])[0] ?? '',
        explode('-', $d['serieNumero'])[1] ?? '',
        number_format($d['igv'], 2, '.', ''),
        number_format($d['total'], 2, '.', ''),
        $d['fecha'],
        $d['clienteTipoDoc'],
        $d['clienteDoc'],
    ]) . '|';
}

/**
 * El PDF, en bytes.
 *
 * @return string|null null si el XML no se pudo leer
 */
function fact_pdf_desde_xml(string $xml): ?string
{
    $d = fact_leer_xml($xml);
    if ($d === null || $d['serieNumero'] === '') {
        return null;
    }

    require_once __DIR__ . '/../vendor/autoload.php';

    $simbolo = $d['moneda'] === 'USD' ? 'US$' : 'S/';
    $money = fn(float $v): string => $simbolo . ' ' . number_format($v, 2, '.', ',');

    $pdf = new TCPDF('P', 'mm', 'A4', true, 'UTF-8');
    $pdf->SetCreator('drcaceresruiz.com');
    $pdf->SetAuthor($d['emisorNombre']);
    $pdf->SetTitle(fact_titulo_doc($d['tipoDoc']) . ' ' . $d['serieNumero']);
    $pdf->SetMargins(14, 14, 14);
    $pdf->SetAutoPageBreak(true, 18);
    $pdf->setPrintHeader(false);
    $pdf->setPrintFooter(false);
    $pdf->AddPage();

    // --- Cabecera: emisor a la izquierda, el recuadro del documento a la derecha.
    $pdf->SetFont('helvetica', 'B', 13);
    $pdf->MultiCell(112, 6, $d['emisorNombre'], 0, 'L', false, 1, 14, 14);
    $pdf->SetFont('helvetica', '', 9);
    $texto = $d['emisorComercial'] !== '' && $d['emisorComercial'] !== $d['emisorNombre']
        ? $d['emisorComercial'] . "\n" : '';
    $texto .= $d['emisorDireccion'];
    $pdf->MultiCell(112, 5, $texto, 0, 'L', false, 1, 14, $pdf->GetY() + 1);

    $pdf->SetLineWidth(0.4);
    $pdf->Rect(132, 14, 64, 26);
    $pdf->SetFont('helvetica', 'B', 10);
    $pdf->MultiCell(64, 5, 'R.U.C. ' . $d['emisorRuc'], 0, 'C', false, 1, 132, 17);
    $pdf->SetFont('helvetica', 'B', 9.5);
    $pdf->MultiCell(64, 5, fact_titulo_doc($d['tipoDoc']), 0, 'C', false, 1, 132, 24);
    $pdf->SetFont('helvetica', 'B', 11);
    $pdf->MultiCell(64, 5, $d['serieNumero'], 0, 'C', false, 1, 132, 31);

    // --- Adquirente y fecha.
    $pdf->SetY(46);
    $pdf->SetFont('helvetica', '', 9.5);
    $filas = [
        ['Fecha de emisión', $d['fecha']],
        ['Señor(es)', $d['clienteNombre'] !== '' ? $d['clienteNombre'] : '-'],
        [fact_nombre_tipo_doc_cliente($d['clienteTipoDoc']), $d['clienteDoc']],
        ['Moneda', $d['moneda'] === 'USD' ? 'Dólares americanos' : 'Soles'],
    ];
    foreach ($filas as [$rotulo, $valor]) {
        $y = $pdf->GetY();
        $pdf->SetFont('helvetica', 'B', 9.5);
        $pdf->MultiCell(38, 5.5, $rotulo . ':', 0, 'L', false, 0, 14, $y);
        $pdf->SetFont('helvetica', '', 9.5);
        $pdf->MultiCell(144, 5.5, $valor, 0, 'L', false, 1, 52, $y);
    }

    // --- El detalle.
    $pdf->Ln(3);
    $anchos = [16, 18, 88, 28, 32];
    $cabeceras = ['Cant.', 'Unidad', 'Descripción', 'P. unitario', 'Importe'];
    $pdf->SetFont('helvetica', 'B', 9);
    $pdf->SetFillColor(238, 240, 242);
    $y = $pdf->GetY();
    $x = 14;
    foreach ($cabeceras as $i => $t) {
        $pdf->MultiCell($anchos[$i], 7, $t, 0, $i >= 3 ? 'R' : ($i === 2 ? 'L' : 'C'), true, 0, $x, $y);
        $x += $anchos[$i];
    }
    $pdf->SetY($y + 7);

    $pdf->SetFont('helvetica', '', 9);
    foreach ($d['lineas'] as $l) {
        $y = $pdf->GetY();
        // La descripción manda la altura de la fila: es la única que se parte.
        $alto = max(6.5, $pdf->getStringHeight($anchos[2], $l['descripcion']));
        $celdas = [
            [rtrim(rtrim(number_format($l['cantidad'], 2, '.', ''), '0'), '.'), 'C'],
            [fact_nombre_unidad($l['unidad']), 'C'],
            [$l['descripcion'], 'L'],
            [$money($l['precioUnitario']), 'R'],
            [$money($l['precioUnitario'] * $l['cantidad']), 'R'],
        ];
        $x = 14;
        foreach ($celdas as $i => [$t, $alin]) {
            $pdf->MultiCell($anchos[$i], $alto, $t, 0, $alin, false, 0, $x, $y);
            $x += $anchos[$i];
        }
        $pdf->SetY($y + $alto);
        $pdf->SetDrawColor(215, 219, 223);
        $pdf->Line(14, $pdf->GetY(), 196, $pdf->GetY());
        $pdf->SetDrawColor(0, 0, 0);
    }

    // --- Totales, a la derecha.
    $pdf->Ln(2);
    $totales = [
        ['Valor de venta', $d['gravado']],
        ['IGV (18%)', $d['igv']],
    ];
    $pdf->SetFont('helvetica', '', 9.5);
    foreach ($totales as [$rotulo, $valor]) {
        $y = $pdf->GetY();
        $pdf->MultiCell(46, 5.5, $rotulo . ':', 0, 'R', false, 0, 118, $y);
        $pdf->MultiCell(32, 5.5, $money($valor), 0, 'R', false, 1, 164, $y);
    }
    $y = $pdf->GetY();
    $pdf->SetFont('helvetica', 'B', 11);
    $pdf->MultiCell(46, 7, 'IMPORTE TOTAL:', 0, 'R', false, 0, 118, $y);
    $pdf->MultiCell(32, 7, $money($d['total']), 0, 'R', false, 1, 164, $y);

    if ($d['enLetras'] !== '') {
        $pdf->Ln(1);
        $pdf->SetFont('helvetica', '', 9);
        // La leyenda de SUNAT ya viene con su «SON» delante; anteponerle otro
        // dejaba un «Son: SON VEINTICINCO...» en el papel del comprador.
        $letras = $d['enLetras'];
        $pdf->MultiCell(182, 5, preg_match('/^son\b/i', $letras) ? $letras : 'Son: ' . $letras,
            0, 'L', false, 1, 14, $pdf->GetY());
    }

    // --- El pie obligatorio: QR, resumen de la firma y la leyenda.
    $pdf->Ln(6);
    $yPie = $pdf->GetY();
    $pdf->write2DBarcode(fact_texto_qr($d), 'QRCODE,M', 14, $yPie, 32, 32, [
        'border' => false, 'padding' => 0, 'fgcolor' => [0, 0, 0], 'bgcolor' => false,
    ], 'N');

    $pdf->SetFont('helvetica', '', 8);
    $pdf->MultiCell(146, 4.5,
        'Representación impresa de la ' . mb_strtolower(fact_titulo_doc($d['tipoDoc'])) . '.'
        . "\nConsulte su validez en https://ww1.sunat.gob.pe/ol-ti-itconsvalicpe/ConsValiCpe.htm"
        . ($d['hash'] !== '' ? "\nValor resumen (hash): " . $d['hash'] : ''),
        0, 'L', false, 1, 50, $yPie + 2);

    return $pdf->Output('', 'S');
}

/**
 * El PDF de un comprobante ya emitido, buscándolo por su pedido.
 *
 * @return string|null null si el pedido no tiene comprobante o falta su XML
 */
function fact_pdf_de_pedido(string $pedido): ?string
{
    $asiento = fact_comprobante_de($pedido);
    if ($asiento === null || ($asiento['nombreXml'] ?? '') === '') {
        return null;
    }
    $ruta = fact_datos_dir() . '/xml/' . basename($asiento['nombreXml']) . '.xml';
    if (!is_readable($ruta)) {
        return null;
    }
    $xml = (string)file_get_contents($ruta);
    return $xml === '' ? null : fact_pdf_desde_xml($xml);
}
