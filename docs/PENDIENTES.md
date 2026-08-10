# Pendientes de GCM

Lo que falta, ordenado por lo que duele antes. Este documento y `ESTADO.md`
son la unica memoria entre sesiones: lo que no esta escrito aqui, se pierde.

Ultima revision: 10 de agosto de 2026.

> **Antes de tocar el despliegue, lee el incidente del 10 de agosto en
> `ESTADO.md`.** Dos horas de caida por dos causas que no eran las que
> parecian.

---

## 1. Deuda del incidente del 10 de agosto

### Devolver los esqueletos de carga

Los dos `loading.tsx` estan apagados, movidos a
`src/app/(dashboard)/_esqueletos/`. Sin ellos la pagina llega entera y se
pinta aunque falle la hidratacion.

Para devolverlos hace falta una **red de seguridad** que drene la cola `$RB`
si `$RV` no llego a ejecutarse. En React 19.2 el revelado del contenido se
programa con `requestAnimationFrame`, que **no corre en pestanas en segundo
plano**: sin esa red, quien abra GCM en una pestana de fondo se encuentra el
esqueleto congelado. El diagnostico completo esta en
`_esqueletos/LEEME.md`.

### El despliegue no borra nada

`tar -xzf` descomprime ENCIMA del arbol anterior. Los ficheros de
compilaciones viejas se quedan para siempre. Comprobado en produccion: en
`.next/server/app/` conviven `(dashboard)` y ademas carpetas sueltas `obras`,
`empresa` y `operador`, que en el codigo actual solo existen DENTRO del grupo
`(dashboard)`. Son restos de cuando esas rutas no estaban agrupadas.

### Tres copias de `_next/static` con cache de un ano

El workflow las publica en `deploy/.next/static`, `deploy/_next/static` y
`deploy/public/_next/static`, con un `.htaccess` que pone
`Cache-Control: public, max-age=31536000, immutable`. Nunca se purgan. Es la
via por la que un navegador podria ejecutar JavaScript de una compilacion y
recibir HTML de otra —sintoma ya visto en el log:
`Failed to find Server Action ... from an older or newer deployment`—.

### Dos mecanismos de descompresion a la vez

Ahora descomprime el **cron** (cada minuto, sin limite de tiempo) y `app.js`
conserva su logica con candado como respaldo. Funciona, pero hay que decidir
quien manda y quitar la duplicidad. **Regla que no se puede romper: nada
lento en el arranque.** Descomprimir tarda 16 segundos y LiteSpeed corta el
proceso mucho antes; por eso ningun despliegue del dia llego a aplicarse.

---

## 2. Defectos conocidos, sin arreglar

- **`moduloConDatos` duplica las guardas de `ModuloContenido`**
  (`components/tablero/modulos.tsx`). Estan pegadas y comentadas a proposito,
  pero si algun dia se separan vuelve la caja vacia. Lo correcto es que cada
  modulo declare de que datos depende, en un solo sitio.
- **El modulo de PPC y el de Causas se contradicen a la vista.** Uno dice
  «2 semanas abiertas sin cerrar todavia» y el de al lado «5 incumplimientos
  con causa». No es un error de calculo —el Pareto cuenta TODAS las semanas a
  proposito, incluidas las abiertas— pero leidos juntos no se entienden. Se
  arregla con una palabra en el subtitulo del modulo de causas.
- **Sin migas de pan en las subpaginas profundas.** Desde
  `cronograma/mapeo`, `ordenes/nueva` o `plan-semanal/[planId]` no se ve donde
  estas dentro de la obra.
- **`EnlaceBoton` solo esta en el tablero y en «Editar datos de la obra».**
  Falta decidir los casos raros: pestanas de navegacion, tarjetas enteras que
  son enlace, y enlaces dentro de un parrafo. Convertirlo TODO en boton hace
  que nada destaque.
- **Aviso de lint**: `_x` definido y sin usar en `src/lib/result.test.ts:86`.
  Una linea.
- **La cookie vieja `gcm-tablero`** sigue en los navegadores, ignorada desde
  que se paso a `gcm-tablero-off`. Inofensiva; caduca sola dentro de un ano.

---

## 3. Documentacion

- **`MANUAL.md` quedo atras el 10 de agosto.** Describe el panel como si
  cargara los once modulos siempre, y no menciona las pestanas en dos niveles
  (Plan / Ejecucion / Compras) ni el menu de empresa agrupado.
- **Faltan capturas y videos.** Se pidio que el manual fuera «el super
  tutorial para dummies»; hoy es solo texto.

---

## 4. Seguridad

Anotado antes del 10 de agosto, sin tocar:

- **Limite de intentos por IP en el login.**
- **Limite de peticiones a SUNAT.**
- **Cinco consultas sin filtro por empresa**: `obras.service` (lineas 196,
  233, 402), `tablero.service` (427) y `actividad.service` (76).
- **Fuga por el texto del error de correo duplicado** en el alta NORMAL de
  usuarios. En el alta de constructoras ya esta resuelta con
  `CORREO_NO_DISPONIBLE`: el mensaje no debe permitir averiguar si una persona
  ya es usuaria de otra empresa.

---

## 5. Funcionalidad pendiente

| | Que es | Migracion |
|---|---|---|
| — | Ventana del Lookahead **por obra** (hoy solo en la URL) | Si, una columna |
| — | Empresa de demostracion para el tutorial | No: identificarla por variable de entorno |
| — | Sombrear el area entre plan y real en la curva S | No |
| **Fase 2** | Documental: planos, protocolos y guias, con validacion automatica de restricciones | Si |
| **Fase 3** | Sectores de color en el PTS y aviso cuando dos cuadrillas coinciden en el mismo sitio | Si |
| **Fase 4** | «Cumplio» calculado desde la cantidad ejecutada, linea de meta, causa raiz | No |
| **Fase 5** | Motor de reglas | Por definir |

---

## 6. Limitaciones del asistente

Para que ninguna sesion futura pierda tiempo redescubriendolas:

- **No hay acceso de escritura fuera de la carpeta del proyecto.** Los
  archivos de memoria del perfil (`~/.claude/.../memory/`) no se pueden
  actualizar desde aqui. Por eso la continuidad vive en `docs/`.
- **No se pueden ejecutar `tsc`, `vitest` ni `lint`.** Las herramientas de
  shell se cayeron a mitad de la sesion del 10 de agosto. Hay que pedirle al
  usuario que los corra y pegue la salida. **No empujar nada sin esa
  verificacion.**
- **Cuidado con el navegador automatizado.** Comprobar `document.hidden`
  antes de creerse lo que se ve: una pestana en segundo plano estrangula los
  temporizadores y no ejecuta `requestAnimationFrame`. El 10 de agosto eso
  hizo parecer que produccion estaba rota mas tiempo del que lo estuvo.
- **Y mirar la pantalla antes de teorizar.** Ese dia se midio si una pagina
  tenia contenido contando caracteres de texto, y el problema era justamente
  un esqueleto de carga, que no tiene texto. Una captura lo habria resuelto en
  un minuto en vez de en una hora.
