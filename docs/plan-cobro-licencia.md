# Cobrar la licencia de GCM — mapa y plan

Escrito el 25 de agosto de 2026, antes de tocar código y a propósito: cobrar
mal es de lo poco en este proyecto que no se arregla con un commit. Un importe
equivocado, un cobro duplicado o una suspensión injusta se arreglan hablando
con un cliente, no desplegando.

**Lo que se decidió**: se cobra **la licencia de GCM a las constructoras**. No
las compras de obra a proveedores, ni las valorizaciones al cliente final —esos
son otros dos productos, mapeados abajo en «Lo que esto NO es»—.

---

## 1. La ventaja de haber elegido esto

**GCM es el único comercio.** Cobra `drcaceresruiz`, a su nombre, con una sola
cuenta de pasarela. Eso quita de en medio la parte más cara de las otras dos
opciones: no hay que guardar credenciales de pasarela **por empresa**, ni
repartir dinero entre terceros, ni responder por cobros ajenos.

La llave va en el entorno del servidor, como `APP_SECRET` o `DECOLECTA_TOKEN`,
y no en la base cifrada por empresa —ese patrón (`lib/secreto.ts`) existe para
credenciales **de cada constructora**, y aquí la credencial es una sola y es
nuestra—.

---

## 2. Lo que hay hoy

| Pieza | Estado |
|---|---|
| `Company.licenciaModalidad` · `licenciaVence` · `licenciaNotas` | Registro **manual**, del área del operador. Texto libre y una fecha. |
| `Company.activa` | **El único interruptor real.** Se comprueba en `obtenerSesion`, en cada petición: apagarlo mata también las sesiones abiertas. El operador se lo salta, para no poder encerrarse fuera. |
| `editarLicenciaConstructora` | Anota los tres campos y audita el cambio. **No toca `activa`.** |
| `/operador` | Alta de constructoras, listado, suspender y reactivar. Sólo para los correos de `GCM_OPERADORES`. |
| Lo que ve la constructora de su propia licencia | **Nada.** Ni la modalidad, ni el vencimiento. Es información sólo del operador. |

Y dos comentarios del código que son decisiones, no descuidos, y que hay que
respetar o cambiar a conciencia:

> «Ninguna pasarela de pago detrás: son tres campos para anotar lo que ya se
> sabe por fuera.»

> «A PROPÓSITO no cambia `activa`: una licencia vencida no suspende sola.
> Fingir ese automatismo prometería un cobro que este registro no hace.»

Ese segundo comentario **deja de ser cierto** en cuanto haya pasarela, y es la
primera decisión de la lista de abajo.

---

## 3. Las cinco decisiones, antes de escribir código

Ninguna es técnica. Todas cambian lo que se construye.

### 3.1. ¿Una licencia vencida suspende sola?

Hoy no, y por una buena razón. Con cobro automático se vuelve defendible, pero
**suspender por error deja a una obra sin su sistema en medio de una semana de
trabajo**, y el residente no tiene a quién reclamar a las 6 de la mañana.

**Recomendación**: cobro automático, **suspensión no**. La licencia vencida
enciende un aviso creciente —en el panel de la constructora y en el del
operador— y el apagón sigue siendo un acto humano. Un periodo de gracia
explícito (p. ej. 15 días) y avisos a los 7, 3 y 0 días. Es más trabajo de
avisos y menos de bloqueo, que es el reparto correcto para una herramienta de
la que depende una obra.

### 3.2. ¿Qué planes hay, y a qué precio?

Hoy `licenciaModalidad` es **texto libre de 30 caracteres**. Para cobrar tiene
que ser un dato: un plan con nombre, precio, moneda y periodicidad. Hay que
decidir:

- ¿Cuántos planes y qué los diferencia? (¿número de obras? ¿de usuarios?
  ¿módulos?) — **si un plan limita algo, ese límite hay que hacerlo cumplir**,
  y eso es trabajo aparte que hoy no existe en ninguna parte.
- ¿Mensual, anual, o los dos con descuento en el anual?
- ¿Qué pasa con las constructoras que ya están dentro? (heredan su
  `licenciaModalidad` actual como plan «heredado», sin precio, hasta que se
  les asigne uno)

**Recomendación para la primera entrega**: dos planes, mensual y anual, **sin
ningún límite técnico asociado**. Cobrar primero; limitar, si acaso, después.
Un límite mal puesto se nota el día que alguien no puede crear una obra.

### 3.3. ¿En qué moneda?

Soles es lo natural —el RUC, el IGV y las obras están en soles— pero fija el
banco y la pasarela. Si alguna constructora fuera de Perú, dólares, y entonces
hay dos precios por plan, no una conversión.

### 3.4. La factura electrónica — **la parte que de verdad cuesta**

Cobrar es la parte fácil. En Perú, un cobro sin comprobante válido es un
problema tuyo, no del cliente. Tres caminos:

1. **Manual, como hoy**: se cobra por la pasarela y la factura se emite fuera,
   con el facturador que ya uses. GCM sólo anota el número. **Es lo que
   recomiendo para empezar**: no bloquea nada y el volumen inicial lo aguanta
   una persona.
2. **Semiautomático**: GCM prepara el borrador (datos del cliente, importe,
   IGV) y alguien lo emite. Ahorra tecleo y errores.
3. **Automático con un OSE/PSE**: integración completa. Es un proyecto propio,
   no un paso de éste.

Sea cual sea, hay que **guardar el RUC y la razón social con los que se
factura** — ya están en `Company` — y decidir si el IGV va incluido en el
precio del plan o se suma encima. Esa decisión cambia el número que se ve en
el botón, así que va antes de dibujarlo.

### 3.5. ¿Se guarda la tarjeta para cobrar solo cada mes?

- **No** (recomendado para empezar): cada periodo se paga con un botón. Menos
  responsabilidad, ninguna sorpresa, y el cliente decide. A cambio, hay que
  perseguir el cobro.
- **Sí**: la pasarela guarda la tarjeta —GCM **nunca**— y cobra sola. Es lo
  cómodo a la larga y añade el problema de la tarjeta que caduca o rebota, que
  es un flujo entero con sus avisos.

**Recomendación**: empezar sin recurrencia. Añadirla después no rompe nada de
lo que se construya ahora si el modelo de datos separa «el pago» de «la
suscripción», como propone el punto 5.

---

## 4. La pasarela

**No elijas por la comisión.** Elige por, en este orden: que tu banco la
liquide sin fricción, que tenga **webhook con firma**, que tenga **modo de
pruebas de verdad**, y que la documentación esté viva.

Candidatas en Perú: **Culqi**, **Niubiz** (Visanet), **Izipay** y **Mercado
Pago**. Para cobros desde fuera, **PayPal**. No pongo comisiones aquí a
propósito: cambian, y una cifra vieja en un documento es peor que ninguna.

**Lo que hay que preguntar antes de decidir**, y conviene preguntarlo por
escrito:

1. ¿Cuánto tarda el dinero en llegar a la cuenta? (T+1, T+3, mensual)
2. ¿Comisión por transacción y comisión fija? ¿Hay mínimo mensual?
3. ¿Manda **webhook firmado**? ¿Reintenta si no respondes? ¿Cuántas veces?
4. ¿Hay entorno de pruebas con tarjetas de prueba?
5. ¿Cómo se hace una **devolución**, y desde dónde?
6. ¿Qué pasa con un **contracargo**? ¿Avisa por webhook?

Las respuestas 3 y 6 son las que deciden cuánto código hay que escribir.

---

## 5. El modelo de datos propuesto

Tres tablas nuevas. `Company` sólo gana un puntero.

```
PlanLicencia          Qué se vende.
  nombre, descripcion
  precio, moneda, periodicidad (MENSUAL | ANUAL)
  activo                       ← se deja de vender sin borrarlo: hay
                                 suscripciones vivas que lo apuntan

SuscripcionLicencia   Qué tiene contratado UNA constructora.
  companyId, planId
  inicio, vence                ← `vence` sustituye a `Company.licenciaVence`
  estado (ACTIVA | VENCIDA | CANCELADA)
  precioAcordado               ← el precio SE COPIA al contratar, no se lee
                                 del plan: subir la tarifa no puede reescribir
                                 lo que alguien ya pagó (misma regla que el
                                 presupuesto meta congelado)

PagoLicencia          Cada intento de cobro, salga o no.
  companyId, suscripcionId
  importe, moneda
  estado (PENDIENTE | PAGADO | RECHAZADO | DEVUELTO)
  pasarela, referenciaExterna  ← el id del cargo en la pasarela
  claveIdempotencia UNIQUE     ← la que hace que un webhook repetido no
                                 cobre ni acredite dos veces
  creadoAt, confirmadoAt
  facturaNumero, facturaAt     ← nulos hasta que se emita (decisión 3.4)
```

**Por qué un pago es una fila y no un campo en la empresa**: porque hay que
poder responder «¿qué se ha cobrado y cuándo?» sin adivinar, y porque un cobro
rechazado también es información. El mismo criterio por el que los movimientos
presupuestales no son un número dentro de la obra.

`Company.licenciaModalidad/Vence/Notas` **se quedan** en la primera entrega, y
no es dejadez: son el registro de las constructoras que pagan por fuera (una
transferencia, un acuerdo antiguo). El día que una empresa contrate por la
pasarela, manda su suscripción; mientras no, manda la anotación manual. Poner
los dos a la vez y decir cuál manda es más honesto que migrar a ciegas.

---

## 6. El flujo, paso a paso

```
1. El ADMIN de la constructora entra a «Mi constructora → Licencia».
   Ve su plan, hasta cuándo está pagado, y qué pasa si vence.

2. Pulsa «Renovar». GCM crea un PagoLicencia en PENDIENTE con su clave de
   idempotencia y pide a la pasarela una sesión de pago POR EL IMPORTE QUE
   CALCULA EL SERVIDOR. El navegador nunca dice cuánto se cobra.

3. La persona paga en la pasarela (fuera de GCM: los datos de la tarjeta no
   pasan por aquí ni una vez).

4. La pasarela llama al webhook `/api/pagos/<pasarela>`:
     - se comprueba la FIRMA. Sin firma válida, 401 y no se toca nada;
     - se busca el pago por su referencia. Si ya estaba PAGADO, se responde
       200 y NO se hace nada más —el webhook llega repetido, siempre—;
     - se marca PAGADO y se empuja `SuscripcionLicencia.vence`.
   Responder RÁPIDO: este hosting corta lo que tarda (incidente del 10 de
   agosto). Lo que no sea marcar el pago, que lo haga el reloj.

5. El reloj (`/api/reloj`, cada minuto, ya existe) hace lo lento:
     - avisa de las licencias por vencer (7, 3, 0 días);
     - concilia: un pago PENDIENTE de hace más de N minutos se le pregunta a
       la pasarela, por si el webhook se perdió. **La conciliación no es
       opcional**: el webhook falla, y sin esto el cliente paga y no se entera
       nadie.
```

---

## 7. Las reglas que no se negocian

1. **El importe lo calcula el servidor.** Nunca lo que venga del navegador.
2. **El webhook es idempotente**, por `claveIdempotencia`. Llegan repetidos.
3. **Se verifica la firma** antes de mirar el contenido.
4. **GCM no ve, no guarda y no registra datos de tarjeta.** Ni en logs.
5. **La llave secreta va en el entorno**, nunca en el repositorio ni en el
   paquete del navegador.
6. **Todo cobro se audita** (`AuditLog`), como ya se auditan la licencia
   manual y la suspensión.
7. **Suspender sigue siendo humano** (decisión 3.1).

---

## 8. Las pantallas

**Nueva, para la constructora**: `Mi constructora → Licencia`. Su plan, su
vencimiento, el historial de pagos con su comprobante, y el botón. Hoy no
existe **nada** de esto: no se le puede pedir a alguien que pague algo que no
puede ver.

**Ampliada, para el operador**: en `/operador/[empresaId]`, junto al registro
manual, los cobros de esa constructora y su estado. Y en la lista, quién debe.

---

## 9. Lo que esto NO es

Para que no se mezcle en la conversación:

- **No es un carrito de materiales.** Comprar a proveedores ya tiene su
  circuito (encargos → órdenes → valorizaciones → pagos) y le falta sólo el
  movimiento de dinero. Es otro proyecto, más grande, y ahí **cada
  constructora** necesitaría su propia pasarela.
- **No es cobrarle al cliente final de la obra.** Eso sería una pantalla
  pública, como el pase de obra, y también con la pasarela de cada
  constructora.

Las dos comparten el modelo de `PagoLicencia` casi tal cual, así que
construirlo bien ahora abarata las dos.

---

## 10. Riesgos concretos, de este hosting y de este país

- **El arranque lento mata la app** (incidente del 10 de agosto). El webhook
  tiene que responder en milisegundos y delegar en el reloj.
- **El despliegue cierra las sesiones abiertas.** No desplegar mientras alguien
  esté pagando; y el pago tiene que sobrevivir a que la app se reinicie a
  media transacción — de ahí que el `PagoLicencia` se cree ANTES de mandar a
  la pasarela.
- **`x-forwarded-for` sigue siendo un supuesto** (ver `PENDIENTES.md`). Si se
  limita el webhook por IP, no fiarse sólo de eso: la firma es lo que manda.
- **La factura electrónica es una obligación, no una mejora.** Ver 3.4.

---

## 11. Orden de trabajo sugerido

1. **Decidir los cinco puntos del apartado 3.** Sin eso no se empieza.
2. **Elegir pasarela** con las seis preguntas del apartado 4.
3. Modelo de datos y migración (apartado 5), **sin pasarela todavía**: planes,
   suscripciones, y la pantalla de licencia de la constructora en modo lectura.
   Ya tiene valor solo: hoy nadie ve su propia licencia.
4. El botón de pago contra el **entorno de pruebas** de la pasarela, con el
   webhook y la idempotencia.
5. La conciliación por el reloj y los avisos de vencimiento.
6. Producción, con **un cobro real y pequeño** hecho por ti antes de ofrecérselo
   a nadie.

El paso 3 es la mitad del valor y no tiene ningún riesgo. Si quieres empezar
por algo mientras se deciden los otros puntos, es por ahí.
