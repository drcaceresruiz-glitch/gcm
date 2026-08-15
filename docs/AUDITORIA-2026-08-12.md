# Auditoría de GCM — 12 de agosto de 2026

Revisión completa de arquitectura, backend, frontend y calidad, medida contra el
objetivo de **vender GCM a otras constructoras**.

**Qué se revisó:** 478 archivos de código, 117 616 líneas, 47 modelos de datos,
37 migraciones, 981 pruebas. Next.js 16 con React 19 y TypeScript estricto,
Prisma 7 sobre MariaDB, desplegado en cPanel.

**Veredicto en una línea:** el código está muy por encima de la media y en
seguridad es inusualmente bueno; se encontraron cinco fallos bloqueantes, y los
cinco quedaron corregidos y desplegados el mismo día.

---

## 1. El punto de partida (verificado, no supuesto)

Antes de la lista de problemas conviene saber qué se buscó y **no** apareció,
porque son las patologías habituales de un proyecto así:

| Se buscó | Resultado |
|---|---|
| Inyección SQL | **Ninguna.** Solo dos consultas crudas, ambas parametrizadas |
| `eval`, código dinámico, deserialización insegura | **Ninguno** |
| Secretos subidos al repositorio | **Ninguno.** El `.env` está excluido |
| Bloques de error vacíos que se tragan fallos | **Ninguno** |
| Trabajo a medias (`TODO`, `FIXME`) | **Ninguno** |
| Enlaces o formularios rotos | **Ninguno.** Las ~90 rutas resuelven |
| Rutas sin proteger | **Ninguna.** Las 94 acciones validan sesión |

Y tres cosas que están notablemente bien hechas:

- **El aislamiento entre empresas**, que es lo que sostiene el negocio: el
  identificador de empresa sale siempre de la sesión, nunca de la petición, y
  hay una batería de 50 pruebas dedicada a defenderlo.
- **La aritmética del dinero**: los importes viajan como texto y se operan con
  enteros grandes, así que nunca pasan por un número con decimales flotantes.
- **La accesibilidad**: etiquetas asociadas, botones con nombre, diálogos
  marcados, y una paleta que separa los semáforos también por luminosidad para
  que funcionen con daltonismo.

---

## 2. Bloqueantes — los cinco, CORREGIDOS y en producción

### 2.1 Una sola contraseña abría la cola de SMS de varias empresas
**Estado: corregido** (`6069edc`)

La cola de SMS tenía una contraseña de reserva que servía a **toda** empresa sin
teléfono propio vinculado — no a una, a todas a la vez. Por esa cola viajan los
códigos del pase de obra y los del segundo factor **en claro**, así que quien
tuviera esa cadena leía los códigos de cualquier cliente antes que sus dueños.

Con una sola constructora era deuda anotada; con clientes de pago es un fallo de
aislamiento entre inquilinos.

Se comprobó en producción antes de tocar nada: hay una sola empresa y ya tenía
su teléfono vinculado, así que quitarlo no dejó a nadie sin SMS. Una empresa sin
teléfono propio ya no tiene cola y sus códigos salen por correo.

### 2.2 El despliegue no aplicaba los cambios de base de datos
**Estado: corregido** (`37ab60e`, `85abbee`) — **prueba real pendiente**

Cuando una función nueva necesita una columna o tabla nueva, eso no viaja con el
código. Hasta ahora nadie lo aplicaba: el código nuevo llegaba, la base se
quedaba igual, y **el panel entero se caía** hasta que alguien entraba al
servidor a mano. Ya había pasado varias veces (10 y 11 de agosto).

Ahora lo aplica el propio despliegue, **antes** de publicar la versión nueva, y
si falla no publica: sigue sirviendo la anterior.

En su estreno no funcionó, y costó una caída de ~20 minutos. La causa se
encontró y se corrigió: el despliegue sobrescribía el script del servidor
*encima*, mientras un cron lo ejecuta cada minuto; bash lee los scripts por
posición según avanza, así que una subida a mitad de ejecución dejaba al proceso
leyendo desplazado. Ahora los scripts se suben con otro nombre y se renombran,
que es la técnica que el paquete grande ya usaba.

**Queda por probarse de verdad**: el 12 de agosto no había ningún cambio de base
pendiente, así que el camino completo no llegó a ejercitarse. El próximo
despliegue que traiga uno es la prueba, y el registro del servidor ya dice si el
script arranca y hasta dónde llega.

### 2.3 El despliegue no comprobaba con quién hablaba
**Estado: corregido** (`4a78f74`, `b25f1d2`, `23a50e6`)

La subida al servidor iba cifrada pero **sin autenticar**: cualquiera en medio
podía presentar su propio certificado y quedarse con la contraseña del FTP de
producción.

Ahora se verifica, y si no cuadra **no despliega**. Encender esto destapó dos
problemas reales del hosting, los dos documentados en `infraestructura.md`: el
servidor no envía su certificado intermedio (se aporta aparte), y el certificado
está a nombre de `server0808.cloudhostservers.com`, no del dominio.

**Acción pendiente tuya:** rotar la contraseña del FTP. Hasta este cambio viajó
contra un extremo sin verificar.

### 2.4 Se podía dejar a un cliente fuera de su propia cuenta
**Estado: corregido** (`ba10bf6`)

El bloqueo por intentos fallidos era solo por cuenta, y el contador **solo se
ponía a cero al acertar**. Una cuenta que llegara a cinco fallos quedaba a
merced de cualquiera para siempre: a partir de ahí, un fallo suelto cada cuarto
de hora la mantenía bloqueada indefinidamente. El correo del administrador de
una constructora es adivinable.

Ahora el castigo se cumple y se acaba, y hay además un límite por conexión —
veinte fallos en quince minutos desde la misma dirección— que corta el rociado
de contraseñas contra muchas cuentas a la vez.

No hizo falta cambiar la base de datos: el registro de auditoría ya guardaba la
dirección de cada intento fallido.

### 2.5 Importar un presupuesto grande podía reventar entero
**Estado: corregido** (`37ab60e`)

Las partidas se insertaban **una por una** dentro de una operación que el motor
corta a los cinco segundos. Con las 348 partidas de una obra real eso rozaba el
límite, y al pasarlo **se deshacía la importación completa**. Es la peor forma
posible de fallar, porque cargar el presupuesto es lo primero que hace una
constructora nueva. Tampoco había tope de filas: el techo lo ponía el reloj.

Ahora entran por tandas, agrupadas por nivel del árbol, y el tiempo límite está
fijado a propósito en vez de quedar al azar del tamaño del archivo.

---

## 3. Mejoras de optimización — PENDIENTES

Ninguna es urgente. Están por orden de valor.

### 3.1 La capa que aplica los permisos es la menos probada
**El hallazgo más importante que queda.**

Había 981 pruebas, una cifra excelente, pero mal repartida: 54 de 55 archivos
cubrían funciones puras. **De 46 servicios, solo uno tenía pruebas.** Los
servicios son justamente donde se comprueban los permisos y se escribe en la
base.

En concreto: **ninguna prueba fallaba si alguien borraba una comprobación de
permiso.** Hay 135 repartidas a mano por 29 servicios.

La frontera además es estructural, no accidental: la configuración de pruebas
solo recoge archivos `.test.ts` y corre sin navegador, así que las ~36 500
líneas de interfaz no las ejecuta nadie aunque alguien escribiera una prueba.

*Avance del 12 de agosto:* se añadieron 26 pruebas a tres servicios (importación,
cola de SMS y autenticación), que no tenían ninguna. **Quedan ~43 servicios
igual.**

### 3.2 La prueba de aislamiento cubre 11 de 47 servicios
Es el mejor archivo del repositorio en lo suyo, y protege el activo que sostiene
todo el modelo de negocio. Quedan fuera unos 36 servicios; se revisaron dos a
mano y filtran bien, pero nada avisaría si dejaran de hacerlo.

### 3.3 La protección contra scripts inyectados casi no protege
La cabecera de seguridad es sólida en todo salvo en lo que más importa: permite
código en línea y evaluación dinámica, que es justo por donde entra un ataque de
ese tipo. El camino correcto es un identificador único por petición.

### 3.4 El borde de las acciones no valida lo que recibe
Las acciones que reciben objetos (no formularios) confían en el tipo, y los
tipos desaparecen al compilar. Un valor inesperado tumba la petición con error
de servidor. No es escalada de privilegios —los permisos se comprueban antes—
pero es una caída trivial de provocar.

### 3.5 Una referencia del cliente se guarda sin comprobar que sea suya
En el plan semanal se guarda un identificador de tarea sin verificar que
pertenezca a esa obra ni a esa empresa. **Hoy no filtra nada** porque nunca se
lee esa relación, pero es una fuga latente el día que alguien la lea.

### 3.6 Cinco consultas del tablero dependen de la guarda de quien las llama
Filtran por obra pero no por empresa. No es explotable hoy, porque quien las
llama sí filtra, pero rompe la defensa en profundidad en el módulo que agrega
datos de toda la obra.

### 3.7 Un mensaje de error interno llega al usuario
Un punto del análisis de causa raíz devuelve el texto crudo del error de base de
datos, que incluye nombres de tablas y columnas. Es el único sitio del proyecto
con ese patrón; el resto usa el enfoque correcto.

### 3.8 La consulta de RUC no tiene límite y la cuota es compartida
Un cliente que importe proveedores en masa deja sin autorrelleno a los demás.
Degrada con elegancia, así que no es crítico, pero es un recurso compartido que
conviene acotar por empresa antes de tener clientes.

### 3.9 Los fallos de auditoría se descartan sin dejar rastro
Que la auditoría no tumbe la operación es correcto. Que no se registre en
ningún sitio significa que una tabla rota produciría pérdida silenciosa de la
traza de accesos y aprobaciones, y nadie se enteraría. Con clientes, esa traza
es también la prueba ante una disputa.

### 3.10 Los parámetros del cifrado de contraseñas no tienen tope
Se leen del propio texto almacenado y solo se comprueba que sean números. Un
valor absurdo agota la memoria del proceso en vez de devolver «no válida».
Requiere escritura previa en la base, así que es un riesgo posterior a otro
fallo, pero la cota es una línea.

### 3.11 Once archivos pasan de mil líneas
Siete servicios y cuatro pantallas. No es un defecto en sí, pero es la razón por
la que auditar los permisos cuesta: un archivo de 1700 líneas no se revisa de un
vistazo. Conviene partirlos a medida que se toquen, no en una reforma grande.

### 3.12 Sin división de carga, y la salud pública revela la versión
Ningún componente se carga bajo demanda, así que pantallas pesadas entran
enteras — y este hosting ya ha dado errores por pedir muchos trozos a la vez.
Aparte, la comprobación de salud es pública y dice el identificador exacto de la
versión desplegada.

---

## 4. Buenas prácticas — PENDIENTES

- **El despliegue no ejecuta el revisor de estilo.** Sí compila y sí pasa las
  pruebas, así que el hueco real es solo ese. Dos líneas.
- **Un parche global cambia el significado de las transparencias** y su
  comentario dice «204 usos»; hoy son **723 en ~130 archivos**. Además el parche
  se aplica a iconos y superposiciones, no solo a texto, y deja fuera las
  transparencias más bajas, que son el riesgo de contraste que sigue vivo.
- **Los colores del tema no están declarados donde el sistema de estilos los
  espera**, y por eso el mismo estilo se repite a mano **403 veces en 118
  archivos**, dentro de 924 estilos en línea.
- **Un módulo usa un rodeo obsoleto para restar y lo justifica con un dato
  falso**: dice que no existe una función que sí existe, y cuya documentación
  advierte que su ausencia «costó el mismo fallo cuatro veces». No es un fallo
  vivo, pero engaña a quien lo lea.
- **Conviven dos formas de redondear dinero.** Una función privada eclipsa por
  nombre a la exacta y opera con decimales flotantes. Está protegida y probada;
  el problema es de coherencia.
- **212 líneas de código muerto** sin una sola importación, que además contienen
  el mismo patrón de fuga del punto 3.7 listo para propagarse. Borrarlo.
- **Las fotos subidas se validan por lo que declara el navegador**, no por su
  contenido real, y la ruta que las sirve no envía la cabecera que impide
  interpretarlas como otra cosa. Riesgo residual, arreglo de una línea.
- **Restos menores**: `.gitignore` con una valla de markdown pegada, un borrador
  de mensaje de commit versionado, y tres carpetas vacías que el README
  documenta como si tuvieran contenido.

---

## 5. Acciones tuyas pendientes (no son código)

1. **Rotar la contraseña de la base de datos.** Se expuso durante la sesión en
   el chat y en el historial del servidor (ya limpiado). Es de acceso local, así
   que el alcance es acotado, pero conviene.
2. **Rotar la contraseña del FTP.** Hasta el 12 de agosto viajaba contra un
   extremo sin verificar.

En ambos casos el orden importa para no dejar el sistema sin acceso a mitad:
cambiar en el panel → actualizar la configuración de la aplicación → actualizar
el archivo del servidor → reiniciar.

---

## 6. Lo que esta auditoría NO cubre

Para que no se lea como más de lo que es:

- **No se ejecutó la aplicación para auditarla.** Todo salió de leer el código,
  el esquema y los flujos de despliegue.
- **No se auditó la app Android** del emisor de SMS (663 líneas), que se
  despliega por su cuenta.
- **No se revisó si los indicadores de obra son los correctos** (valor ganado,
  curva S, Last Planner). Se revisó cómo están implementados, no si la teoría
  detrás es la adecuada.
- **No se midió el rendimiento.** Las observaciones sobre consultas y carga
  salen de leer el código, no de perfilar contra la base real.

---

## 7. Estado al cerrar

| | |
|---|---|
| Bloqueantes encontrados | 5 |
| Bloqueantes corregidos y desplegados | 5 |
| Pruebas antes | 981 |
| Pruebas al cerrar | 1048 |
| Servicios con pruebas: antes → después | 1 → 4 (de 46) |
| Mejoras pendientes | 12 |
| Buenas prácticas pendientes | 8 |

Producción verificada: aplicación en pie, base conectada, versión correcta,
página de acceso y recursos estáticos respondiendo.
