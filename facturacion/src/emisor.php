<?php
/**
 * emisor.php — Construye el comprobante, lo firma y lo manda a SUNAT.
 *
 * FACTURA Y BOLETA NO VIAJAN IGUAL, y es la diferencia que más sorprende al
 * dejar un proveedor intermediario:
 *
 *   · La FACTURA se envía a SUNAT una a una y SUNAT contesta en el momento con
 *     un CDR —la constancia de que la recibió y la aceptó—.
 *   · La BOLETA admite DOS caminos: enviarla individualmente —igual que una
 *     factura, con respuesta inmediata— o informarla agrupada con las demás del
 *     día en un RESUMEN DIARIO, que devuelve un «ticket» que hay que consultar
 *     después.
 *
 * SE ENVÍA INDIVIDUALMENTE POR DEFECTO, y es la decisión importante de este
 * archivo. El resumen diario obliga a que un proceso nocturno funcione todos
 * los días: si deja de correr, las boletas se siguen emitiendo y SUNAT no se
 * entera, y el incumplimiento se acumula en silencio. El envío individual
 * cierra cada boleta en el momento y no deja nada colgando.
 *
 * El resumen sigue existiendo como RED DE SEGURIDAD: una boleta cuyo envío no
 * llegó a salir —se cayó la red, SUNAT no respondía— queda en
 * `pendiente_resumen` y el cron la informa. Lo que SUNAT rechazó explícitamente
 * no se reintenta: eso es un error de datos y volver a mandarlo lo repetiría.
 *
 * EL IGV YA ESTÁ DENTRO DEL PRECIO que publica la tienda, así que el importe
 * gravado se DESCUENTA, no se suma. Y se calcula en CÉNTIMOS: la base más el
 * IGV tienen que dar el total exacto, y con decimales en coma flotante eso
 * falla por un céntimo el día menos pensado. SUNAT rechaza el comprobante
 * cuando la suma de las líneas no cuadra con los totales.
 */

declare(strict_types=1);

require_once __DIR__ . '/config.php';
require_once __DIR__ . '/almacen.php';
require_once __DIR__ . '/letras.php';
require_once __DIR__ . '/../vendor/autoload.php';

use Greenter\Model\Client\Client;
use Greenter\Model\Company\Address;
use Greenter\Model\Company\Company;
use Greenter\Model\Sale\FormaPagos\FormaPagoContado;
use Greenter\Model\Sale\Invoice;
use Greenter\Model\Sale\Legend;
use Greenter\Model\Sale\SaleDetail;
use Greenter\Model\Summary\Summary;
use Greenter\Model\Summary\SummaryDetail;
use Greenter\See;

const FACT_IGV_PORCENTAJE = 18;

/** Reparte un importe CON IGV incluido. Todo en céntimos, para que cuadre. */
function fact_desglosar(int $totalCentimos): array
{
    $total = abs($totalCentimos);
    $base = (int)round($total / (1 + FACT_IGV_PORCENTAJE / 100));
    return ['total' => $total, 'base' => $base, 'igv' => $total - $base];
}

/** De céntimos a los soles con dos decimales que espera Greenter. */
function fact_soles(int $centimos): float
{
    return round($centimos / 100, 2);
}

function fact_empresa(): Company
{
    $direccion = (new Address())
        ->setUbigueo(fact_cfg('UBIGEO', '070101'))
        ->setDepartamento(fact_cfg('DEPARTAMENTO', 'CALLAO'))
        ->setProvincia(fact_cfg('PROVINCIA', 'CALLAO'))
        ->setDistrito(fact_cfg('DISTRITO', 'CALLAO'))
        ->setDireccion(fact_cfg('DIRECCION'))
        ->setCodLocal(fact_cfg('COD_LOCAL', '0000'));

    return (new Company())
        ->setRuc(fact_cfg('RUC'))
        ->setRazonSocial(fact_cfg('RAZON_SOCIAL'))
        ->setNombreComercial(fact_cfg('NOMBRE_COMERCIAL', fact_cfg('RAZON_SOCIAL')))
        ->setAddress($direccion);
}

/**
 * El comprador.
 *
 * Un RUC de 11 dígitos es tipo 6; un DNI de 8, tipo 1. Sin documento —una
 * boleta pequeña, que es lo normal en una tienda— se usa el «cliente varios»
 * que admite SUNAT: tipo 0 y ceros como número.
 */
function fact_cliente(array $datos): Client
{
    $documento = preg_replace('/\D/', '', (string)($datos['documento'] ?? ''));
    $nombre = trim((string)($datos['nombres'] ?? ''));

    if (strlen($documento) === 11) {
        $tipo = '6';
    } elseif (strlen($documento) === 8) {
        $tipo = '1';
    } else {
        $tipo = '0';
        $documento = '00000000';
        $nombre = $nombre !== '' ? $nombre : 'CLIENTES VARIOS';
    }

    return (new Client())
        ->setTipoDoc($tipo)
        ->setNumDoc($documento)
        ->setRznSocial($nombre !== '' ? mb_substr($nombre, 0, 100) : 'CLIENTE')
        ->setEmail((string)($datos['correo'] ?? ''));
}

/** ¿A este pedido le toca factura? Solo si el comprador dio un RUC. */
function fact_es_factura(array $pedido): bool
{
    return strlen(preg_replace('/\D/', '', (string)($pedido['documento'] ?? ''))) === 11;
}

/** Arma el comprobante completo, con su única línea de detalle. */
function fact_construir(array $pedido, string $serie, int $correlativo): Invoice
{
    $esFactura = fact_es_factura($pedido);
    $m = fact_desglosar((int)$pedido['importeCentimos']);

    // LA DESCRIPCIÓN NO PUEDE IR VACÍA. SUNAT rechaza con el código 2026 («El
    // XML no contiene el tag cac:Item/cbc:Description») y no es hipotético:
    // pasó con un pedido antiguo, de los que no guardaban qué se había
    // comprado. `??` no basta —una cadena vacía no es null—, así que se
    // comprueba que quede algo escrito.
    $descripcion = trim((string)($pedido['productoNombre'] ?? ''));
    if ($descripcion === '') {
        $descripcion = 'Producto o servicio';
    }
    $codigo = trim((string)($pedido['productoId'] ?? ''));
    if ($codigo === '') {
        $codigo = 'GCM';
    }

    $detalle = (new SaleDetail())
        ->setCodProducto(mb_substr($codigo, 0, 30))
        ->setUnidad('ZZ')                       // servicio
        ->setDescripcion(mb_substr($descripcion, 0, 250))
        ->setCantidad(1)
        ->setMtoValorUnitario(fact_soles($m['base']))
        ->setMtoValorVenta(fact_soles($m['base']))
        ->setMtoBaseIgv(fact_soles($m['base']))
        ->setPorcentajeIgv(FACT_IGV_PORCENTAJE)
        ->setIgv(fact_soles($m['igv']))
        ->setTipAfeIgv('10')                    // gravado, operación onerosa
        ->setTotalImpuestos(fact_soles($m['igv']))
        ->setMtoPrecioUnitario(fact_soles($m['total']));

    $leyenda = (new Legend())
        ->setCode('1000')                       // importe en letras: obligatoria
        ->setValue(fact_importe_en_letras($m['total']));

    return (new Invoice())
        ->setUblVersion('2.1')
        ->setTipoOperacion('0101')              // venta interna
        ->setTipoDoc($esFactura ? '01' : '03')  // 01 factura · 03 boleta
        ->setSerie($serie)
        ->setCorrelativo((string)$correlativo)
        ->setFechaEmision(new DateTime(date('Y-m-d H:i:s'), new DateTimeZone('America/Lima')))
        ->setFormaPago(new FormaPagoContado())  // se cobró antes de emitir
        ->setTipoMoneda((string)($pedido['moneda'] ?? 'PEN'))
        ->setCompany(fact_empresa())
        ->setClient(fact_cliente($pedido))
        ->setMtoOperGravadas(fact_soles($m['base']))
        ->setMtoIGV(fact_soles($m['igv']))
        ->setTotalImpuestos(fact_soles($m['igv']))
        ->setValorVenta(fact_soles($m['base']))
        ->setSubTotal(fact_soles($m['total']))
        ->setMtoImpVenta(fact_soles($m['total']))
        ->setDetails([$detalle])
        ->setLegends([$leyenda]);
}

/** El emisor de Greenter, ya con certificado, clave SOL y servicio puestos. */
function fact_see(): See
{
    $see = new See();
    $see->setCertificate(file_get_contents(fact_ruta_certificado()));
    $see->setService(fact_endpoint());
    $see->setClaveSOL(fact_cfg('RUC'), fact_cfg('SOL_USUARIO'), fact_cfg('SOL_CLAVE'));
    // Sin caché de plantillas: se emiten unos pocos comprobantes al día y una
    // caché en disco es una cosa más que puede quedarse rancia o sin permisos.
    $see->setCachePath(null);
    return $see;
}

/**
 * Emite el comprobante de un pedido.
 *
 * Idempotente por pedido: si ya tiene uno, lo devuelve sin emitir otro. Eso
 * importa más aquí que en ningún otro sitio — dos comprobantes por una misma
 * venta son dos hechos tributarios, y deshacerlos exige una nota de crédito.
 *
 * EL CORRELATIVO SE RESERVA ANTES DE ENVIAR. Si el envío falla, el número
 * queda gastado y marcado como fallido. Es preferible un hueco explicable a
 * dos comprobantes con el mismo número.
 */
function fact_emitir(array $pedido): array
{
    $idPedido = (string)($pedido['pedido'] ?? '');
    if ($idPedido === '') {
        return ['ok' => false, 'motivo' => 'Falta el identificador del pedido.'];
    }
    if (!fact_configurado()) {
        return ['ok' => false, 'motivo' => 'Falta configurar: ' . implode('; ', fact_que_falta())];
    }
    if ((int)($pedido['importeCentimos'] ?? 0) <= 0) {
        return ['ok' => false, 'motivo' => 'El pedido no tiene importe: no hay nada que facturar.'];
    }

    $yaEsta = fact_comprobante_de($idPedido);
    if ($yaEsta !== null) {
        return $yaEsta + ['ok' => true, 'repetido' => true];
    }

    $esFactura = fact_es_factura($pedido);
    $serie = $esFactura ? fact_cfg('SERIE_FACTURA', 'F001') : fact_cfg('SERIE_BOLETA', 'B001');
    $correlativo = fact_siguiente_correlativo($serie);
    $m = fact_desglosar((int)$pedido['importeCentimos']);
    $nombreXml = fact_cfg('RUC') . '-' . ($esFactura ? '01' : '03') . '-' . $serie . '-' . $correlativo;

    $asiento = [
        'tipo' => 'emision',
        'pedido' => $idPedido,
        'documento' => $esFactura ? 'factura' : 'boleta',
        'serie' => $serie,
        'correlativo' => $correlativo,
        'nombreXml' => $nombreXml,
        'fechaEmision' => date('Y-m-d'),
        'totalCentimos' => $m['total'],
        'baseCentimos' => $m['base'],
        'igvCentimos' => $m['igv'],
        'moneda' => (string)($pedido['moneda'] ?? 'PEN'),
        'correo' => (string)($pedido['correo'] ?? ''),
        'documentoCliente' => (string)($pedido['documento'] ?? ''),
        'modo' => fact_es_produccion() ? 'produccion' : 'beta',
    ];

    try {
        $see = fact_see();
        $venta = fact_construir($pedido, $serie, $correlativo);
        $xml = $see->getXmlSigned($venta);
        if (!$xml) {
            $asiento['estado'] = 'fallido';
            $asiento['motivo'] = 'No se pudo firmar el XML. Revise el certificado.';
            fact_anotar($asiento);
            return $asiento + ['ok' => false];
        }
        fact_guardar_xml($nombreXml, $xml);

        // Una boleta puede dejarse a propósito para el resumen diario, si se
        // configura así. La factura siempre va sola.
        if (!$esFactura && fact_cfg('BOLETA_ENVIO', 'individual') === 'resumen') {
            $asiento['estado'] = 'pendiente_resumen';
            fact_anotar($asiento);
            return $asiento + ['ok' => true];
        }

        try {
            $resultado = $see->send($venta);
        } catch (Throwable $envio) {
            // NO LLEGÓ A SALIR. Distinto de que SUNAT lo rechace: aquí el
            // comprobante puede seguir siendo válido, así que la boleta se
            // deja para el resumen diario en vez de darla por perdida. Una
            // factura sí queda fallida: no hay resumen que la recoja.
            $asiento['estado'] = $esFactura ? 'fallido' : 'pendiente_resumen';
            $asiento['motivo'] = 'No se pudo enviar a SUNAT: ' . $envio->getMessage();
            fact_anotar($asiento);
            return $asiento + ['ok' => !$esFactura];
        }

        // NO RESPONDER Y RECHAZAR NO SON LO MISMO, y para una boleta la
        // diferencia decide si se recupera o se pierde:
        //
        //   · no llegó respuesta → no sabemos nada. La boleta va al resumen
        //     diario, que la informará. Una factura no tiene esa red, así que
        //     queda fallida y hay que reintentarla a mano.
        //   · SUNAT dijo que no → es un error en los datos. Repetirlo en un
        //     resumen daría el mismo rechazo, así que queda fallida.
        //
        // CÓMO SE DISTINGUEN: los rechazos de SUNAT vienen con código NUMÉRICO
        // (los de su catálogo). Los fallos de transporte traen texto —`CDR`
        // cuando la respuesta no incluyó el comprobante de recepción, o el
        // código de una falta de SOAP—. Se comprobó mirando qué devuelve de
        // verdad la librería cuando el envío no sale.
        if (!$resultado || !$resultado->isSuccess()) {
            $error = $resultado ? $resultado->getError() : null;
            $codigo = $error ? (string)$error->getCode() : '';
            $loRechazoSunat = $codigo !== '' && ctype_digit($codigo);

            $asiento['estado'] = ($loRechazoSunat || $esFactura) ? 'fallido' : 'pendiente_resumen';
            $asiento['motivo'] = $error
                ? (($loRechazoSunat ? 'SUNAT ' : 'Envío fallido [') . $codigo
                    . ($loRechazoSunat ? ': ' : ']: ') . $error->getMessage())
                : 'SUNAT no respondió al envío.';
            fact_anotar($asiento);
            return $asiento + ['ok' => $asiento['estado'] === 'pendiente_resumen'];
        }

        $cdr = $resultado->getCdrResponse();
        if ($resultado->getCdrZip()) {
            fact_guardar_cdr($nombreXml, $resultado->getCdrZip());
        }
        $asiento['estado'] = 'aceptado';
        $asiento['sunatCodigo'] = $cdr ? $cdr->getCode() : null;
        $asiento['sunatDescripcion'] = $cdr ? $cdr->getDescription() : null;
        $asiento['sunatNotas'] = $cdr ? $cdr->getNotes() : [];
        fact_anotar($asiento);
        return $asiento + ['ok' => true];
    } catch (Throwable $e) {
        // El número ya está reservado: se anota el fallo para que no se
        // reutilice y para que quede por qué.
        $asiento['estado'] = 'fallido';
        $asiento['motivo'] = 'Error al emitir: ' . $e->getMessage();
        fact_anotar($asiento);
        return $asiento + ['ok' => false];
    }
}

/**
 * El resumen diario de boletas.
 *
 * Se informa lo emitido en UN día, y SUNAT no contesta al momento: devuelve un
 * TICKET que hay que consultar después. Por eso esto anota el ticket y el
 * resultado se recoge en una segunda pasada.
 *
 * @param string $fecha día de las boletas, en formato Y-m-d
 */
function fact_resumen_diario(string $fecha): array
{
    if (!fact_configurado()) {
        return ['ok' => false, 'motivo' => 'Falta configurar: ' . implode('; ', fact_que_falta())];
    }

    $boletas = fact_boletas_sin_resumir($fecha);
    if (!$boletas) {
        return ['ok' => true, 'nada' => true, 'motivo' => 'No hay boletas sin informar del ' . $fecha . '.'];
    }

    $detalles = [];
    $incluidos = [];
    foreach ($boletas as $b) {
        $documento = preg_replace('/\D/', '', (string)($b['documentoCliente'] ?? ''));
        $tipoCliente = strlen($documento) === 11 ? '6' : (strlen($documento) === 8 ? '1' : '0');
        $detalles[] = (new SummaryDetail())
            ->setTipoDoc('03')
            ->setSerieNro($b['serie'] . '-' . $b['correlativo'])
            ->setClienteTipo($tipoCliente)
            ->setClienteNro($documento !== '' ? $documento : '00000000')
            ->setTotal(fact_soles((int)$b['totalCentimos']))
            ->setMtoOperGravadas(fact_soles((int)$b['baseCentimos']))
            ->setMtoIGV(fact_soles((int)$b['igvCentimos']))
            ->setEstado('1');                  // 1 = adicionar
        $incluidos[] = $b['serie'] . '-' . $b['correlativo'];
    }

    // El correlativo del resumen es por día: el primero del día es el 1.
    $correlativoResumen = 1;
    foreach (fact_leer_libro() as $fila) {
        if (($fila['tipo'] ?? '') === 'resumen_enviado' && ($fila['fecGeneracion'] ?? '') === $fecha) {
            $correlativoResumen++;
        }
    }

    $resumen = (new Summary())
        ->setFecGeneracion(new DateTime($fecha, new DateTimeZone('America/Lima')))
        ->setFecResumen(new DateTime(date('Y-m-d'), new DateTimeZone('America/Lima')))
        ->setCorrelativo((string)$correlativoResumen)
        ->setCompany(fact_empresa())
        ->setDetails($detalles);

    try {
        $resultado = fact_see()->send($resumen);
        if ($resultado === null || !$resultado->isSuccess()) {
            $error = $resultado ? $resultado->getError() : null;
            return ['ok' => false, 'motivo' => $error
                ? ('SUNAT ' . $error->getCode() . ': ' . $error->getMessage())
                : 'SUNAT no respondió al resumen.'];
        }

        $ticket = $resultado->getTicket();

        // SIN TICKET NO HAY ENVÍO. Anotar el resumen como enviado marca esas
        // boletas como informadas y no vuelven a intentarse nunca; hacerlo sin
        // un ticket que consultar sería perderlas en silencio. Salió en las
        // pruebas: el envío devolvía «correcto» y ticket nulo.
        if (!$ticket) {
            return ['ok' => false, 'motivo' => 'SUNAT aceptó la conexión pero no devolvió ticket. '
                . 'Las boletas siguen pendientes y se reintentarán.'];
        }

        fact_anotar([
            'tipo' => 'resumen_enviado',
            'fecGeneracion' => $fecha,
            'correlativo' => $correlativoResumen,
            'ticket' => $ticket,
            'incluidos' => $incluidos,
            'modo' => fact_es_produccion() ? 'produccion' : 'beta',
        ]);
        return ['ok' => true, 'ticket' => $ticket, 'boletas' => count($incluidos)];
    } catch (Throwable $e) {
        return ['ok' => false, 'motivo' => 'Error al enviar el resumen: ' . $e->getMessage()];
    }
}

/** Pregunta a SUNAT por un ticket de resumen y anota el resultado. */
function fact_consultar_ticket(string $ticket): array
{
    if (!fact_configurado()) {
        return ['ok' => false, 'motivo' => 'Falta configurar: ' . implode('; ', fact_que_falta())];
    }
    try {
        $estado = fact_see()->getStatus($ticket);
        $cdr = $estado->getCdrResponse();
        $fila = [
            'tipo' => 'resumen_estado',
            'ticket' => $ticket,
            'codigo' => $estado->getCode(),
            'aceptado' => $estado->isSuccess(),
            'descripcion' => $cdr ? $cdr->getDescription() : ($estado->getError()
                ? $estado->getError()->getMessage() : null),
        ];
        if ($estado->getCdrZip()) {
            fact_guardar_cdr('resumen-' . preg_replace('/\W/', '', $ticket), $estado->getCdrZip());
        }
        fact_anotar($fila);
        return $fila + ['ok' => true];
    } catch (Throwable $e) {
        return ['ok' => false, 'motivo' => 'Error al consultar el ticket: ' . $e->getMessage()];
    }
}
