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
| `server.js` | El servidor: catálogo, crear pago, validar pago y reclamaciones. |
| `src/catalogo.js` | **El único sitio donde vive un precio.** |
| `src/reclamaciones.js` | El Libro de Reclamaciones: validación, correlativo y escritura. |
| `public/checkout.html` | La página de compra. Autocontenida salvo el cliente de Izipay. |
| `public/terminos.html` · `public/devoluciones.html` | Las dos páginas legales que Izipay exige ver enlazadas. |
| `public/reclamaciones.html` | La hoja de reclamación virtual (Ley 29571). |
| `.env.example` | Qué credenciales hacen falta y de dónde salen. |
| `datos/` | El libro escrito. **No se versiona**: lleva datos personales. |

### Las rutas

- `GET /api/config` — clave pública de Izipay y si el servidor está configurado.
- `GET /api/catalogo` — productos con su precio ya formateado.
- `POST /api/create-payment` — recibe `{ producto, nombres, correo, documento, telefono }`
  y devuelve el `formToken`.
- `POST /api/validate-payment` — comprueba la firma HMAC de la respuesta del pago.
- `POST /api/reclamacion` — registra una hoja del Libro de Reclamaciones. No
  depende de la pasarela: se puede reclamar precisamente porque el pago falló.

---

## Las dos reglas que sostienen esto

**1. El importe lo pone el servidor.** El navegador manda el *identificador* del
producto, nunca un precio. Si el precio viajara en el formulario, cualquiera
compraría la licencia por un sol abriendo las herramientas del navegador.

**2. La firma es lo que prueba que se pagó.** Que el navegador diga «pagado» no
prueba nada: esa línea la escribe cualquiera desde la consola. `validate-payment`
recalcula el HMAC-SHA256 sobre el `kr-answer` **tal como llegó** —sin volver a
serializarlo, que cambiaría la firma— y solo entonces da el pago por bueno.

Los datos de la tarjeta no pasan por aquí ni una vez: el `<div class="kr-embedded">`
lo rellena Izipay con un formulario suyo.

---

## Lo que falta antes de cobrar de verdad

Esto es un checkout que funciona, no el circuito de cobro completo. Lo que queda
está razonado en `docs/plan-cobro-licencia.md`:

1. **Los precios son DE PRUEBA** (S/ 5.00 y S/ 10.00), puestos así para las
   transacciones de certificación de Izipay. Sustituirlos por la tarifa real en
   `src/catalogo.js` antes de abrir el checkout al público.
2. **El webhook (IPN).** Hoy la confirmación es la del navegador, y el navegador
   se cierra: si alguien paga y cierra la pestaña, no se entera nadie. El webhook
   avisa siempre, y hay que hacerlo idempotente. Hay ejemplo oficial en
   `izipay-pe/Server-IPN-JavaScript`.
3. **Guardar el pedido.** No hay base de datos detrás de este checkout: no queda
   registro de quién compró qué. El modelo (`PagoLicencia`) ya está propuesto en
   el plan.
4. **La copia por correo del Libro de Reclamaciones.** El reglamento obliga a
   entregarla en el acto; hoy la hoja se registra y se anota en el log, pero no
   sale ningún correo porque no hay remitente configurado.
5. **El comprobante electrónico.** El régimen ya lo permite (MYPE Tributario,
   afecto a IGV, boleta y factura), pero emitirlo sigue siendo manual: nada en
   este checkout habla con un OSE/PSE todavía.
6. **Las páginas legales son un borrador** redactado por un programador. La
   estructura y los plazos están, pero merecen una revisión legal.

Lo que YA está resuelto y no hay que volver a tocar: identidad del comercio
(RUC, razón social, dirección, contacto), IGV incluido en el precio mostrado,
Libro de Reclamaciones con su aviso, y la validación de la firma del pago.

---

## Cuando toque añadir categorías y edición

`src/catalogo.js` se sustituye por una tabla. La forma de cada producto ya es la
que tendría una fila —`id`, `categoria`, `nombre`, `resumen`, `detalle`,
`precioCentimos`, `moneda`, `vigencia`, `entrega`—, así que ni el checkout ni el
servidor tienen que rehacerse: cambia de dónde sale el catálogo, no qué es.
