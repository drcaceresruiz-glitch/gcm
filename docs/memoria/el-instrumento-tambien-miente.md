---
name: el-instrumento-tambien-miente
description: "Antes de reportar un hallazgo, comprobar que la medicion sabe distinguir; el 25/08/2026 mi instrumento fallo cuatro veces"
metadata:
  type: feedback
---

El 25 de agosto de 2026, en un solo día, **cuatro veces estuve a punto de
reportar un fallo que no existía —o de dar por bueno uno que sí—, y la culpa
fue siempre de mi forma de medir, no del código**:

- **El panel anima sus cifras.** Una captura mostró «Obras 1» cuando eran 2 y
  un presupuesto de 314.098 cuando eran 745.553. Eran fotogramas del contador
  subiendo.
- **Me inventé un permiso.** Escribí `obra:cambiar_estado` en una prueba, salió
  «no», y concluí que se ofrecían botones sin permiso. Ese permiso no existe: el
  real es `obra:editar`, y sí lo tenía.
- **Mi ayudante de prueba restaba el ancho dos veces.** Daba solapamiento donde
  no lo había y la prueba fallaba con el código bueno.
- **Y la peor: escribí una prueba que pasaba con el fallo dentro.** Comprobaba
  que dos rótulos no se tocaran, pero el medidor de mentira de las pruebas
  —3,5 puntos por letra— los hacía caber aunque el código estuviera mal.
- El mismo día, una función que devuelve el mismo error cuando la fila no
  aparece y cuando el fichero no está en disco: con una foto de prueba sin
  archivo, un «bloqueada» no probaba nada.

**Why:** un instrumento que no distingue los dos casos no mide nada, y su
respuesta se lee igual de convincente. Reportar un fallo falso cuesta la
credibilidad de todos los demás hallazgos; dar por bueno uno real es peor.

**How to apply:** antes de decir «esto falla» o «esto está bien», preguntarse
**qué vería el instrumento en el caso contrario**. En concreto:

- Con una prueba nueva de regresión, **volver al código viejo y ver que se pone
  roja**. Si pasa con el fallo dentro, la prueba no vale. Se hizo dos veces ese
  día y cazó una prueba inútil.
- Si dos causas distintas dan la misma respuesta —«no existe» y «no lo
  alcanzas», «fila ausente» y «archivo ausente»—, medir otra cosa que sí las
  separe: comparar las dos consultas, mirar el WHERE, no el resultado.
- Ante una captura de pantalla con números, **dejar la página asentarse**: si
  animan, la foto miente.
- Si el nombre de un permiso, campo o función sale de mi cabeza y no de un
  `grep`, comprobarlo antes de razonar sobre él.

Ver [[esconder-algo-no-lo-caza-la-bateria]] y
[[clic-por-referencia-no-llega-a-react]]: la misma familia, medir mal.
