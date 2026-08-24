---
name: clic-por-referencia-no-llega-a-react
description: "Un clic del navegador dado por referencia de elemento puede no llegar a React; antes de reportar «el boton no hace nada», repetirlo con un clic real en coordenadas"
metadata:
  type: feedback
---

Recorriendo GCM con la automatizacion del navegador (24 de agosto de 2026)
reporte que el boton «Valorizar» de la tarjeta del contratista no hacia nada:
lo pulsaba y el panel no aparecia. Lo anote como fallo de la aplicacion y
llegue a abrir el archivo para arreglarlo.

No habia nada que arreglar. El clic lo habia dado por REFERENCIA de elemento
(`ref_140`) y no llego a React. Repetido con un clic real en coordenadas
sobre el mismo boton, el panel se abre entero a la primera. El componente
estaba —y estaba— perfectamente escrito.

Ya me habia pasado lo mismo en la misma sesion con `form_input`: escribi el
importe de un encargo, el formulario se reseteo solo, y al teclearlo de
verdad funciono. Dos veces el mismo engano en un dia.

**Why:** un fallo inventado cuesta mas caro que uno que se escapa. Se toca
codigo sano, se le mete un cambio que nadie necesitaba, y ademas se gasta la
credibilidad del resto del informe: si uno de los seis hallazgos es falso,
el usuario tiene motivo para dudar de los otros cinco. Y es exactamente el
error contra el que ya me habia plantado con el fallo del cronograma —me
negue a revertir sin evidencia— solo que esta vez la evidencia falsa la
habia producido yo.

**How to apply:** cuando el sintoma sea «la interfaz no reacciona» y venga de
la automatizacion del navegador, NO reportarlo ni arreglarlo hasta haberlo
repetido con un clic real en coordenadas (o tecleando de verdad, si es un
campo). Si la segunda via funciona, el fallo era de la herramienta: retirarlo
en voz alta, con nombre. Y al reves: un sintoma que sobrevive a las dos vias
si es real y merece que se busque la causa. Emparejada con
[[clic-dentro-de-menu-desplegable]], que es el caso contrario —el control que
de verdad esta roto y las pruebas automatizadas no cazan—.
