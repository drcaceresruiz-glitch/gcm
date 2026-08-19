# Qué se rompe si GCM pasa a ser un programa instalado

## Por qué existe este documento

GCM se vende hoy como aplicación web y el rumbo declarado es que además se
entregue como **un ejecutable que se instala en la máquina de la
constructora, sin servidor y sin base de datos en la nube**. GCM vendería el
software y no operaría nada.

Varias decisiones del producto ya se tomaron mirando ese futuro —el buzón de
correo propio por empresa, la llave de cifrado, el archivo de migración— pero
**nunca se había hecho la lista completa de lo que deja de funcionar**. Sin esa
lista es imposible decidir con honestidad qué se le promete a un cliente.

Este documento la hace. No propone soluciones: enumera y clasifica.

## Cómo leerlo

Cada punto está clasificado por lo que le pasa, no por lo que es:

- **BLOQUEA** — deja de funcionar. No hay versión degradada.
- **SE DEGRADA** — funciona peor o a medias, y se puede explicar en pantalla.
- **CAMBIA DE DUEÑO** — sigue funcionando, pero pasa a ser responsabilidad del
  cliente en vez de de GCM.

Y agrupado por **la razón** por la que se rompe, que es lo que permite tomar
una decisión para todo el grupo en vez de una por funcionalidad.

---

## A. Lo que exige que alguien llegue DESDE FUERA a la aplicación

Aquí está el problema serio, y es el que menos se ve al pensar «una app de
escritorio». Tres funcionalidades del producto **suponen que GCM tiene una
dirección alcanzable desde internet**. Un PC detrás de un router doméstico no
la tiene: hay NAT, la IP cambia, y no hay certificado que presentar.

| Funcionalidad | Quién entra desde fuera | |
|---|---|---|
| **Cola de SMS** | El teléfono vinculado consulta `APP_URL/api/sms/cola` | **BLOQUEA** |
| **Galería de obra** | El **cliente final** abre un enlace público (`/galeria/<slug>`) | **BLOQUEA** |
| **Pase de obra** | El personal de campo entra con un código (`/pase/<obraId>`) | **BLOQUEA** |

Las tres son de las cosas más visibles del producto: la galería es lo que la
constructora le enseña a SU cliente, y el pase es cómo el personal reporta sin
tener cuenta. **Decidir qué pasa con estas dos es previo a comprometerse con
«sin dependencias web».**

## B. Lo que exige correr solo, sin que nadie abra la aplicación

Hoy hay **dos líneas de cron en el servidor** creadas a mano en cPanel: una
aplica los despliegues cada minuto y otra llama al reloj de avisos cada cinco.
En un PC no hay cron, y además el PC se apaga por la noche.

| Funcionalidad | | |
|---|---|---|
| **Reloj de avisos** (restricciones, hitos, valorizaciones pendientes) | Sin él, los avisos in-app siguen; los correos y SMS de aviso, no | **SE DEGRADA** |
| **Cola de SMS** | Nadie la vacía | **BLOQUEA** |
| **Leer las respuestas de contratistas** (planificado) | Nadie mira el buzón | **BLOQUEA** |

Alternativas conocidas: un servicio de Windows, una tarea programada, o
aceptar que **solo corre con la aplicación abierta** — lo que cambia lo que se
le puede prometer al cliente y hay que decirlo en pantalla, no callarlo.

## C. Lo que hoy vive en la configuración del servidor

| Variable | Qué pasa | |
|---|---|---|
| `GCM_OPERADORES` | ¿Quién es «operador» en la instalación de un cliente? Probablemente nadie, y el área de constructoras debería desaparecer | **CAMBIA DE DUEÑO** |
| `CORREO_CLAVE_CIFRADO` | Pasa a compartir disco con la base. Ya documentado en `lib/secreto.ts`: protege contra un volcado copiado a otro sitio, no contra quien se sienta delante | **SE DEGRADA** |
| `AVISOS_CRON_TOKEN` | Sin cron que lo use, sobra | — |
| `SMTP_*` (buzón compartido) | **No existe**. El correo propio de cada constructora deja de ser una mejora y pasa a ser el único camino | **CAMBIA DE DUEÑO** |

## D. Lo que solo necesita SALIR a internet, y aguanta

Estas funcionan igual: necesitan conexión, no ser alcanzables.

- **Envío de correo** por el SMTP de la constructora.
- **Consulta de RUC en SUNAT** (y ya es opcional: sin token se teclea a mano).
- Y si algún día se usa un proveedor de SMS por API en vez del teléfono
  vinculado, ese camino también sobreviviría — a diferencia de la cola.

## E. La base de datos — COMPROBADO el 19/08/2026: el dinero sobrevive

Era el riesgo que parecía mayor. Se midió, y **no bloquea**. Los guiones que lo
demuestran están en `storage/sqlite-dinero/` (fuera de git).

Lo que se midió, con Prisma 7 y el adaptador de SQLite:

| Prueba | Resultado |
|---|---|
| SQLite guarda `DECIMAL` como… | coma flotante (`real`) |
| Prisma devuelve… | **un objeto Decimal**, no un `number` |
| Importe de una obra real (1 515 163,22) | idéntico al escribir y leer |
| Suma de 752 partidas (el tamaño real) | **idéntica al céntimo** |
| Suma de 50 000 partidas | **idéntica al céntimo** |
| `0.10 + 0.20` sumado por SQL | `0.30000000000000004` |
| …formateado a 2 decimales | `0.30` |
| Escala al leer | `0.10` vuelve como `0.1` |

**Por qué sobrevive**: GCM no le pide las cuentas a la base. `src/lib/decimal.ts`
hace aritmética exacta con enteros grandes sobre texto —«los valores viajan
siempre como texto para no pasar nunca por un `number` intermedio»— así que
sumar, restar, multiplicar y dividir dinero es exacto **con cualquier motor**.

El único punto de contacto son los sitios que sí piden la suma a la base
(`_sum` sobre `importe` y `montoContratado`, en `obras`, `tablero`,
`movimientos`, `presupuesto-obra`, `ordenes` y `gerencia`). Todos hacen
`._sum.x.toString()` y se lo pasan a `sumar()`, que reaplica la escala; el
error flotante queda muy por debajo de medio céntimo hasta magnitudes que una
constructora no alcanza.

**Repasado el 19/08, y no hubo nada que arreglar.** Son **once** `_sum` sobre
dinero y **cero** `_avg`/`_min`/`_max`. Los cuatro sitios donde uno llega a
decidir algo —el signo del vigente al aprobar un movimiento, y el sobregiro
por partida en tres pantallas— pasan todos por `sumar`/`restar` antes de la
comparación. Los cuatro invariantes de suma cuadran, incluida la única
igualdad literal sobre dinero de todo el sistema (`lib/ordenes.ts`,
`diferencia === "0.00"`), que es segura porque su entrada ya pasó por `sumar`.
Los pagos, además, se suman en GCM fila a fila y no en SQL.

Lo único que faltaba era que algo lo sostuviera: era una costumbre, no una
regla. Ahora lo sostiene `src/lib/dinero-desde-la-base.test.ts`, que saca los
campos `Decimal` del propio `schema.prisma` y comprueba que ningún valor
sumado por la base decide nada sin normalizar.

Queda **sin comprobar** el resto del cambio de motor: índices únicos, tipos de
fecha y `ENUM`. Y conviene mirar en pantalla que la escala perdida al leer
(`0.10` -> `0.1`) no asoma; el respaldo no se ve afectado, porque su catálogo
ya reaplica la escala.

## F. Lo que aparece nuevo

Cosas que hoy no existen porque las resuelve el hosting:

- **Actualizaciones.** Hoy es FTP + cron. Un instalable necesita su propio
  mecanismo de actualización.
- **Respaldo.** Hoy lo hace el hosting. Allí pasa a ser del cliente — y el
  **exportador de empresa** cobra un sentido distinto: deja de ser solo para
  mudarse y pasa a ser la copia de seguridad.
- **Licenciamiento.** Se vende un ejecutable; hoy no hay nada que lo controle.

---

## Resumen: se puede vender completo, pero no es «compilar lo que hay»

**El dinero ya no es un obstáculo** (ver E). Lo que queda son tres funciones
que suponen que alguien entra al PC desde fuera — y las tres tienen salida sin
que GCM opere nada, porque la aplicación instalada **sí puede salir**:

| Función | Salida propuesta |
|---|---|
| **SMS** | Un proveedor por API: la app sale, nadie entra. Ya hay medio camino (`SMS_TOKEN`) |
| **Pase de obra** | La red local de la obra o de la oficina: el personal está físicamente ahí |
| **Galería del cliente** | Dar la vuelta: que la app **envíe** —el informe por correo— en vez de esperar a que el cliente entre |

Y una cuarta, de otra naturaleza: **algo tiene que correr con la aplicación
cerrada** (avisos, cola de SMS, lectura de respuestas). Servicio de Windows,
tarea programada, o decir en pantalla que solo corre con la app abierta.

**Lo que no se debe hacer**: prometer «todas las funciones» y descubrir en el
primer cliente que su cliente no puede abrir la galería.

Lo demás —el buzón, la llave, el operador— ya tiene camino conocido o se
degrada de forma explicable.
