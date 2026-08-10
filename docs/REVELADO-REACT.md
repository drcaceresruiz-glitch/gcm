# El revelado de contenido de React 19, y por que hay un vigia

Lee esto antes de anadir un `loading.tsx`, un `<Suspense>` o cualquier cosa
que parta la respuesta en dos. Aqui ya costo una caida de produccion.

## Lo que pasa por debajo

En React 19.2 el contenido que llega por streaming **no se muestra en el
acto**. La secuencia real es:

1. El servidor manda el armazon con el esqueleto de carga.
2. Manda el contenido dentro de un `<div hidden id="S:1">`.
3. Emite `<script>$RC("B:1","S:1")</script>`.

Y aqui esta lo que no es evidente: **`$RC` ya no revela nada**. Lo que hace es
marcar el hueco como `$~`, empujar el par a una cola global `$RB`, y programar
el revelado de verdad —`$RV`— con **`requestAnimationFrame`**, y solo cuando
la cola pasa de vacia a dos elementos.

`requestAnimationFrame` **no se ejecuta en una pestana en segundo plano**.

## Que se rompio el 10 de agosto de 2026

Todas las pantallas con sesion se quedaban en el esqueleto de carga para
siempre. El servidor estaba perfecto: respondia **200 con el HTML completo**,
145 KB en 590 ms, con el contenido dentro. Pero:

- Los comentarios en el DOM eran `$~`, no `$?`: el contenido HABIA llegado y
  `$RC` ya lo habia procesado.
- `$RX` no existia, luego **no hubo ningun error de render**.
- Llamar a `$RC("B:1","S:1")` a mano no lanzaba error y no cambiaba nada,
  porque la cola pasaba a tener cuatro elementos y `$RC` solo programa el
  revelado cuando pasa de cero a dos.
- Fallaban **exactamente** las rutas con `loading.tsx`, y funcionaban
  **exactamente** las que no lo tienen: el grupo `(auth)` no tiene ninguno.
  Correlacion perfecta. No tenia nada que ver con la sesion ni con la base.

## La red de seguridad

`src/components/ui/RescateRevelado.tsx`, montado en el layout raiz. Drena la
cola `$RB` con `setInterval` y con `visibilitychange`, que **si corren en
segundo plano** —estrangulados, pero corren—. En primer plano no hace nada:
React revela solo y la cola queda vacia.

Va en el layout raiz **fuera de todo limite de suspension**, porque tiene que
hidratar aunque la pagina siga suspendida, que es justo la condicion en la que
hace falta. Se comprobo que la hidratacion del armazon si ocurre en una
pestana de fondo: lo unico que se quedaba parado era el revelado.

Sondea cada 400 ms durante 20 segundos y luego lo deja; el oyente de
visibilidad se queda por si la pestana vuelve al frente mas tarde.

## Reglas

1. **No quites `RescateRevelado` del layout raiz** mientras haya un solo
   `loading.tsx` o `<Suspense>` en la aplicacion.
2. **Si anades un `loading.tsx` nuevo**, no hace falta tocar nada: el vigia es
   global y drena cualquier cola.
3. **Si algun dia se actualiza React**, comprueba que `$RB` y `$RV` siguen
   existiendo con ese nombre. Son internos y pueden cambiar. El vigia
   comprueba su existencia antes de tocarlos, asi que si desaparecen no rompe
   nada: simplemente deja de proteger, y habria que mirar si sigue haciendo
   falta.
4. **Para probarlo**: abre una pantalla en una pestana de fondo y comprueba
   `document.querySelectorAll('.animate-pulse').length` a los pocos segundos.
   Debe ser cero. Y no midas si hay contenido contando caracteres de texto: un
   esqueleto son rectangulos grises **sin texto**, y eso hace parecer vacia una
   pagina que solo esta cargando. Ese error costo una hora de diagnostico.
