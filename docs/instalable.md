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

## E. La base de datos, que es el riesgo técnico mayor

El paso de **MariaDB a SQLite** es el cambio con más superficie:

- **La precisión del dinero.** Todo GCM se apoya en decimales exactos —los
  importes viajan como texto hasta en el respaldo, a propósito— y hay que
  verificar en serio que esa exactitud sobrevive al cambio de motor. Un
  céntimo que se redondea distinto descuadra una valorización **sin dar
  error**, que es el modo de fallo característico de este sistema.
- Índices únicos, tipos de fecha y `ENUM` se comportan distinto.

**Esto no está verificado.** Es la primera comprobación que habría que hacer, y
antes de escribir una línea del instalable.

## F. Lo que aparece nuevo

Cosas que hoy no existen porque las resuelve el hosting:

- **Actualizaciones.** Hoy es FTP + cron. Un instalable necesita su propio
  mecanismo de actualización.
- **Respaldo.** Hoy lo hace el hosting. Allí pasa a ser del cliente — y el
  **exportador de empresa** cobra un sentido distinto: deja de ser solo para
  mudarse y pasa a ser la copia de seguridad.
- **Licenciamiento.** Se vende un ejecutable; hoy no hay nada que lo controle.

---

## Resumen: lo que hay que decidir antes

1. **Qué pasa con la galería del cliente y con el pase de obra.** Son las dos
   que bloquean y las dos que se ven. Sin respuesta, «sin dependencias web» no
   se puede prometer entero.
2. **Si algo corre cuando la aplicación está cerrada.** De eso dependen los
   avisos, los SMS y la lectura de respuestas.
3. **Si el dinero sobrevive al cambio de motor de base de datos.** Es
   comprobable hoy, con una prueba, y conviene hacerlo antes que nada.

Lo demás —el buzón, la llave, el operador— ya tiene camino conocido o se
degrada de forma explicable.
