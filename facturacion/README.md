# Facturación electrónica ante SUNAT

Emite las **facturas** y **boletas** de la tienda firmándolas con el certificado
del emisor y enviándolas a SUNAT **directamente**, sin proveedor intermediario.
Usa [Greenter](https://greenter.dev) (vendorizada en `vendor/`, sin Composer en
el servidor).

Es un servicio **aparte**: PHP, su propio subdominio, su propia carpeta. El
checkout (Node) le pide comprobantes por HTTP con una clave compartida. Se
despliega y se reinicia sin tocar la tienda.

---

## Cómo llega cada comprobante a SUNAT

La **factura** se envía siempre sola y SUNAT contesta en el acto con su CDR.

La **boleta** admite dos caminos, y aquí se toma el primero:

| | `BOLETA_ENVIO=individual` (por defecto) | `BOLETA_ENVIO=resumen` |
|---|---|---|
| Cuándo se entera SUNAT | En el acto | Al día siguiente |
| Respuesta | CDR inmediato | Un **ticket** que hay que consultar |
| Si el cron deja de correr | No pasa nada | **Las boletas no llegan nunca** |

Por eso el individual es el camino principal: el resumen diario hace que el
cumplimiento dependa de que un proceso nocturno funcione todos los días, y
cuando falla no se nota.

**Aun así `cron_facturacion.php` hace falta**, como red de seguridad: una boleta
cuyo envío no llegó a salir —red caída, SUNAT sin responder— queda en
`pendiente_resumen` y el cron la informa. Mira **varios días atrás**, no solo
ayer, para que un día caído se recupere solo.

Lo que SUNAT **rechazó** explícitamente no se reintenta: eso es un error de
datos, y volver a mandarlo daría el mismo resultado.

---

## Las piezas

| Archivo | Qué es |
|---|---|
| `index.php` | La puerta: `estado`, `emitir`, `resumen`, `ticket`. |
| `src/config.php` | `.env`, rutas y a qué SUNAT se apunta. |
| `src/emisor.php` | Construye el comprobante, lo firma y lo envía. |
| `src/almacen.php` | El libro: correlativos, estado y archivos. |
| `src/letras.php` | El importe en palabras (leyenda 1000, obligatoria). |
| `cron_facturacion.php` | Resúmenes diarios y tickets pendientes. |
| `convertir_certificado.php` | Pasa el `.pfx` de SUNAT a `.pem`. **Temporal: bórrelo tras usarlo.** |
| `datos/` | Libro, XML y CDR. **No se versiona.** |
| `certificados/` | El certificado. **No se versiona.** |

### Las acciones

Todas exigen la cabecera `X-Clave-Facturacion` con el valor de `CLAVE_API`.
Sin `CLAVE_API` configurada **no se atiende a nadie**: falla cerrado.

```
GET  ?accion=estado    ¿está configurado?, en qué modo, qué falta
POST ?accion=emitir    { pedido, importeCentimos, moneda, documento,
                         nombres, correo, productoId, productoNombre }
POST ?accion=resumen   { fecha }   (por defecto, ayer)
POST ?accion=ticket    { ticket }
```

---

## Las reglas que sostienen esto

**El IGV ya está dentro del precio**, así que la base se **descuenta**, no se
suma. Y se calcula en **céntimos**: base + IGV tiene que dar el total exacto.
Con decimales en coma flotante eso falla por un céntimo el día menos pensado, y
SUNAT rechaza el comprobante cuando las líneas no cuadran con los totales.

**El correlativo se reserva antes de enviar.** Si el envío falla, ese número
queda gastado y marcado como fallido. Un hueco explicable es mejor que dos
comprobantes con el mismo número.

**El libro solo crece.** Cada emisión añade una línea; lo que pase después añade
otra. Un comprobante emitido es un hecho tributario: hay que poder reconstruir
la historia completa, errores incluidos, no el último estado.

**Beta primero.** `SUNAT_MODO=beta` apunta al entorno de pruebas, donde nada de
lo que se manda existe. Se pasa a `produccion` cuando una factura **y** un
resumen de boletas hayan salido aceptados en beta.

---

## Puesta en marcha

1. **Active la extensión SOAP** en cPanel → *Select PHP Version* → *Extensions*.
   Sin ella no se puede hablar con SUNAT; `?accion=estado` lo dice.
2. Suba esta carpeta a su propio subdominio.
3. `cp .env.example .env` y rellénelo. Empiece con `SUNAT_MODO=beta`.
4. Suba el `.pfx` de SUNAT a `certificados/`, abra `convertir_certificado.php`,
   conviértalo, y **borre el `.pfx` y el propio conversor**.
5. Pruebe en beta: una factura y un resumen de boletas.
6. Programe el cron (una vez al día) y mande su salida a un correo suyo.
7. Solo entonces, `SUNAT_MODO=produccion` con la clave SOL real.

---

## Lo que este servicio NO hace

- **No genera el PDF** del comprobante. El XML es el documento válido; la
  representación impresa es otra cosa y todavía no está.
- **No manda correos.** Al comprador hay que hacerle llegar su comprobante por
  otro medio.
- **No anula.** Una factura emitida por error se corrige con una nota de
  crédito, y eso no está implementado.
