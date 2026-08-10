# Esqueletos de carga, desactivados el 10 de agosto de 2026

Estos dos ficheros eran `loading.tsx`: uno general del area privada y otro del
panel. Estan aqui, en una carpeta con guion bajo delante —que Next excluye del
enrutado—, para conservarlos sin que creen limites de suspension.

## Por que se apagaron

Produccion se quedo sirviendo **el esqueleto para siempre** en todas las
pantallas con sesion. El diagnostico, ya cerrado:

- El servidor respondia **200 con el HTML completo**, 145 KB en 590 ms, con el
  contenido real dentro.
- Ese contenido llegaba al navegador dentro de un `<div hidden id="S:1">`, que
  es donde React deja lo que viaja por streaming.
- La instruccion que lo coloca en su sitio —`$RC("B:1","S:1")`— se emitia al
  final del HTML, pero no surtia efecto.
- React se hidrataba (habia `__reactFiber$` en el `<main>`), pero la carga util
  de datos, `self.__next_f`, llegaba **con cero entradas**.
- Resultado: el limite de suspension se quedaba mostrando su respaldo, los 60
  rectangulos grises, indefinidamente.

Un `loading.tsx` no es decorativo: **parte la respuesta en dos**. Primero el
armazon con el esqueleto, y despues el contenido, que hay que colocar con
JavaScript. Si esa segunda mitad no llega o no se aplica, la pagina se queda en
el esqueleto y no hay forma de salir.

Sin `loading.tsx` no hay dos mitades: el servidor manda la pagina entera y el
navegador la pinta, aunque la hidratacion falle. Se pierde el esqueleto y se
gana que la pantalla **no pueda quedarse en blanco por algo del cliente**. Con
el servidor respondiendo en 590 ms, es un cambio barato.

## Cuando volver a encenderlos

Cuando se sepa POR QUE `self.__next_f` llegaba vacio. Las dos sospechas vivas:

1. **Estaticos rancios.** `_next/static` lo sirve Apache con
   `Cache-Control: immutable` durante un ano, y el despliegue descomprime
   encima sin borrar nunca lo anterior. El navegador puede acabar ejecutando
   JavaScript de una compilacion y recibiendo HTML de otra.
2. **LiteSpeed y las respuestas por streaming.** El proxy podria estar
   entregando el cuerpo de una forma que impide que los scripts en linea de
   React se apliquen en el orden que espera.

Mientras una de las dos no este descartada, devolver el `loading.tsx` es
devolver el fallo.
