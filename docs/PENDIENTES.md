# Pendientes de GCM

Lo que falta, ordenado por lo que duele antes. Este documento y `ESTADO.md`
son la unica memoria entre sesiones: lo que no esta escrito aqui, se pierde.

Ultima revision: 10 de agosto de 2026.

> **Antes de tocar el despliegue, lee el incidente del 10 de agosto en
> `ESTADO.md`.** Dos horas de caida por dos causas que no eran las que
> parecian.

---

## 1. Deuda del incidente del 10 de agosto

### ~~Devolver los esqueletos de carga~~ HECHO

Volvieron el 10 de agosto de 2026 con `RescateRevelado` en el layout raiz, que
drena la cola `$RB` con `setInterval` y `visibilitychange` cuando
`requestAnimationFrame` no puede. Verificado en produccion con la pestana en
SEGUNDO PLANO —la condicion exacta que lo rompia—: cola de revelado presente y
cero esqueletos visibles.

El mecanismo y sus cuatro reglas estan en `REVELADO-REACT.md`. **Leelo antes
de anadir otro `loading.tsx` o `<Suspense>`**, y sobre todo si algun dia se
actualiza React: `$RB` y `$RV` son internos, no API publica.

### ~~El despliegue no borra nada~~ SCRIPT LISTO, FALTA CABLEARLO

`scripts/desplegar.sh` (10 de agosto) descomprime a un directorio de
preparacion y hace un intercambio atomico con `mv`, con lo que los restos de
compilaciones viejas desaparecen. **Aun no esta cableado**: ni el workflow lo
sube ni el cron lo invoca. Hasta entonces sigue vigente lo de abajo.

### El despliegue no borra nada (mientras el script no este cableado)

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

## 2. Cierre y arranque de obra (empezado el 10 de agosto)

Lo hecho: una obra `CERRADA` ya no admite NINGUNA escritura. El guard
compartido es `motivoSiObraCerrada` (`src/services/obra-abierta.ts`) —devuelve
el texto del motivo, no un booleano, para que todos los servicios den el mismo
mensaje—. Cubre mapeo, revisiones, movimientos, importacion, ordenes,
plan semanal, encargos, calendario, lookahead y cronograma; partidas, obras y
la importacion del cronograma usan `obraAdmiteCambios` directo porque ya
cargaban el estado. Ademas `requisitosParaEjecutar` bloquea pasar a
EN_EJECUCION sin presupuesto (cronograma y linea base solo avisan).

Lo que falta:

- **Requisitos de cierre**: no permitir cerrar con valorizaciones, pagos o
  tareas pendientes; listar lo que falta igual que al arrancar.
- **Acta de cierre** con lecciones aprendidas (auditoria y aprendizaje).
- **Repositorio de obras cerradas**: listar, buscar y revisar en solo
  lectura, con estadisticas comparadas.
- **¿Reabrir?** Hoy una obra cerrada por error no tiene salida. Propuesta:
  permitirlo con permiso propio y quedando en la auditoria. Sin decidir.
- **Eliminar obra**: el usuario borro su obra de prueba por SQL; en la app no
  debe existir el borrado cuando este en produccion real.

## 3. Cronograma: opcion B (decidida el 10 de agosto)

Project **solo siembra** el plan una vez; despues se edita y se corta siempre
desde la app. Para que eso sea posible GCM tiene que calcular por si mismo lo
que hoy lee del archivo:

- `porcentajePlaneado` por tarea a una fecha dada.
- Camino critico (`esCritico`) y holgura.
- Motor de fechas que respete el calendario laboral de la obra
  (`calendario.service` ya guarda los dias laborables).
- Editor manual con dependencias y recalculo automatico (ya decidido:
  arrastrar y soltar llega despues, el motor es lo primero).

## 4. Importacion de presupuesto (Excel)

- Verificar de punta a punta que importa TODO correctamente.
- Plantilla ideal descargable para llenar e importar al crear la obra.
- Permitir corregir, editar, eliminar y crear partidas tras importar (la
  edicion existe; falta revisarla contra la importacion).

---

## 5. Defectos conocidos, sin arreglar

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

## 6. Documentacion

- **`MANUAL.md` quedo atras el 10 de agosto.** Describe el panel como si
  cargara los once modulos siempre, y no menciona las pestanas en dos niveles
  (Plan / Ejecucion / Compras) ni el menu de empresa agrupado.
- **Faltan capturas y videos.** Se pidio que el manual fuera «el super
  tutorial para dummies»; hoy es solo texto.

---

## 7. Seguridad

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

## 8. Funcionalidad pendiente

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

## 9. Limitaciones del asistente

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
