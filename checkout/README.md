# Checkout de GCM

Checkout en soles (PEN) para los dos productos que hoy se venden: la **Licencia de
la App Web GCM** y el **Software Descargable Autoinstalable GCM**. El cobro lo
procesa **Izipay** con su formulario embebido.

Es una aplicación **aparte de la app Next.js**: su propio servidor Express, su
propio `package.json` y sus propias páginas. Se despliega y se reinicia sin tocar
GCM, que es justo lo que se quiere de algo que cobra.

---

## Arrancarlo

```bash
cd checkout
npm install
cp .env.example .env      # y pegue dentro las credenciales de PRUEBAS de Izipay
npm start                 # http://localhost:3001/checkout.html
```

Sin `.env`, la página carga igual y avisa: `/api/create-payment` devuelve 503 y el
botón de pago queda deshabilitado. Es a propósito — es preferible eso a fallar en
la cara de quien está pagando.

---

## Las piezas

| Archivo | Qué es |
|---|---|
| `server.js` | El servidor: catálogo, pago, webhook, retorno y reclamaciones. |
| `src/catalogo.js` | **El único sitio donde vive un precio.** |
| `src/pagos.js` | Verificación de firma, resumen del cobro e idempotencia. |
| `src/pagina_retorno.js` | La página que ve el comprador al volver de pagar. |
| `src/reclamaciones.js` | El Libro de Reclamaciones: validación, correlativo y escritura. |
| `public/checkout.html` | La página de compra. Autocontenida salvo el cliente de Izipay. |
| `public/terminos.html` · `public/devoluciones.html` | Las dos páginas legales que Izipay exige ver enlazadas. |
| `public/reclamaciones.html` | La hoja de reclamación virtual (Ley 29571). |
| `src/pedidos.js` | El pedido desde que empieza, y el estado de cada compra. |
| `src/comprobantes.js` | Pide la boleta o la factura al servicio de facturación. |
| `src/correo.js` | Los cuatro correos: al comprador, al administrador y las reclamaciones. |
| `src/comercio.js` | Quién vende: razón social, RUC, domicilio. En un solo sitio. |
| `src/admin_sesion.js` | Quién puede entrar al panel. |
| `src/panel_admin.js` | Las pantallas del panel del administrador. |
| `.env.example` | Qué credenciales hacen falta y de dónde salen. |
| `datos/` | El libro escrito. **No se versiona**: lleva datos personales. |

### Las rutas

- `GET /api/config` — clave pública de Izipay y si el servidor está configurado.
- `GET /api/catalogo` — productos con su precio ya formateado.
- `POST /api/create-payment` — recibe `{ producto, nombres, correo, documento, telefono }`
  y devuelve el `formToken`.
- `POST /api/validate-payment` — comprueba la firma de la vuelta por el navegador.
- `POST /api/ipn` — **la notificación de servidor a servidor. Es la que manda.**
- `GET|POST /retorno` — adonde vuelve el comprador tras pagar.
- `POST /api/reclamacion` — registra una hoja del Libro de Reclamaciones. No
  depende de la pasarela: se puede reclamar precisamente porque el pago falló.
- `GET /admin` — **el panel del administrador**: compras, estado de cada pago,
  entrega, comprobante, reclamaciones y el guion de atención. Exige
  `ADMIN_PASSWORD`; sin ella devuelve 503 y no se abre.

### El panel

Tres estados, y ninguno se guarda: se calculan leyendo `pedidos.jsonl`,
`pagos.jsonl` y `eventos.jsonl`.

| Estado | Qué significa |
|---|---|
| **Sin pagar** | Se empezó el pedido y todavía no consta cobro. |
| **Abandonado** | Igual, pero pasó más de una hora. |
| **Falta entregar** | Hay un cobro `PAID` **con firma válida**. Es lo que hay que atender. |
| **Entregado** | Alguien pulsó el botón después de mandar el producto. |

Nada se corrige encima: marcar, anotar un comprobante o dejar una nota **añaden
un evento**. Por eso el historial enseña también las equivocaciones, que es
justamente para lo que sirve un historial.

### Las dos URL que van al Back Office

```
URL de notificación al final del pago (IPN)  →  https://drcaceresruiz.com/api/ipn
URL de retorno de la tienda                  →  https://drcaceresruiz.com/retorno
```

El servidor las imprime al arrancar, ya montadas sobre `URL_PUBLICA`, para no
tener que escribirlas a mano. La primera se configura en **Configuración →
Reglas de notificaciones**; la segunda, en la pestaña **Configuración** de la
tienda. Las dos en **HTTPS**.

---

## Las dos reglas que sostienen esto

**1. El importe lo pone el servidor.** El navegador manda el *identificador* del
producto, nunca un precio. Si el precio viajara en el formulario, cualquiera
compraría la licencia por un sol abriendo las herramientas del navegador.

**2. La firma es lo que prueba que se pagó.** Que el navegador diga «pagado» no
prueba nada: esa línea la escribe cualquiera desde la consola. Se recalcula el
HMAC-SHA256 sobre el `kr-answer` **tal como llegó** —sin volver a serializarlo,
que cambiaría la firma— y solo entonces se da el pago por bueno.

**Y son DOS claves distintas, que es el error que más cuesta encontrar:**

| Camino | Quién lo trae | Se firma con | `kr-hash-key` |
|---|---|---|---|
| `validate-payment` y `/retorno` | el navegador | clave **HMAC-SHA-256** | `sha256_hmac` |
| `/api/ipn` | Izipay, servidor a servidor | **contraseña** de la API REST | `password` |

Verificar el IPN con la clave HMAC no falla «a veces»: falla siempre, y el
síntoma es un webhook que rechaza todos los pagos buenos.

**Y test y producción tienen claves distintas**, aunque compartan la misma URL de
notificación. Por eso `.env` admite `IZIPAY_PASSWORD_ALTERNA` y
`IZIPAY_HMAC_SHA256_ALTERNA`: las del modo que no se esté usando, solo para
verificar lo que entra. Sin ellas, el día que se active producción las
notificaciones reales se rechazarían por firma con todo aparentemente bien.

**El que manda es el IPN.** La vuelta por el navegador puede no llegar nunca —el
comprador cierra la pestaña— y entonces el cobro existiría sin que nadie se
enterase. `/retorno` solo sirve para enseñarle el resultado a la persona;
ninguna decisión cuelga de ella.

Los datos de la tarjeta no pasan por aquí ni una vez: el `<div class="kr-embedded">`
lo rellena Izipay con un formulario suyo.

---

## Lo que falta antes de cobrar de verdad

Esto es un checkout que funciona, no el circuito de cobro completo. Lo que queda
está razonado en `docs/plan-cobro-licencia.md`:

1. **Los precios son DE PRUEBA** (S/ 5.00 y S/ 10.00), puestos así para las
   transacciones de certificación de Izipay. Sustituirlos por la tarifa real en
   `src/catalogo.js` antes de abrir el checkout al público.
2. **Una base de datos de verdad.** El pedido ya se anota antes de ir a la
   pasarela (`datos/pedidos.jsonl`), así que un pago iniciado y nunca terminado
   sí deja rastro. Lo que sigue faltando es dónde vive todo eso: tres `.jsonl`
   que solo crecen bastan para decenas de pedidos al mes y dejan de bastar
   mucho antes de lo que parece —cada visita al panel los lee enteros—.
4. **La representación impresa del comprobante.** Al comprador se le manda el
   XML firmado, que es el documento con validez, pero un PDF legible es lo que
   la gente espera recibir. Falta generarlo.
5. **El comprobante electrónico: ya se emite solo.** Al confirmarse el pago se
   pide a NubeFact la **factura** (si el comprador puso RUC) o la **boleta** (si
   puso DNI o nada). El precio publicado lleva el IGV dentro, así que el importe
   gravado se DESCUENTA, y en céntimos: `total_gravada + total_igv` tiene que dar
   exactamente `total` o NubeFact rechaza el comprobante.

   El correlativo lo llevamos nosotros (`datos/comprobantes.jsonl`). Si el número
   que toca ya existe en NubeFact —código 23, porque alguien emitió a mano o se
   perdió el archivo— se reintenta con el siguiente en vez de dar la venta por no
   facturada.

   Emitir ocurre DESPUÉS de que el dinero entró, así que nunca tumba un cobro: si
   NubeFact no responde, el fallo queda en el historial del pedido y hay un botón
   en el panel para emitirlo cuando vuelva.
6. **Las páginas legales son un borrador** redactado por un programador. La
   estructura y los plazos están, pero merecen una revisión legal.

Lo que YA está resuelto y no hay que volver a tocar: identidad del comercio
(RUC, razón social, dirección, contacto), IGV incluido en el precio mostrado,
Libro de Reclamaciones con su aviso, el webhook con su firma e idempotencia, la
página de retorno, y la validación de la firma del pago.

---

## Cuando toque añadir categorías y edición

`src/catalogo.js` se sustituye por una tabla. La forma de cada producto ya es la
que tendría una fila —`id`, `categoria`, `nombre`, `resumen`, `detalle`,
`precioCentimos`, `moneda`, `vigencia`, `entrega`—, así que ni el checkout ni el
servidor tienen que rehacerse: cambia de dónde sale el catálogo, no qué es.
