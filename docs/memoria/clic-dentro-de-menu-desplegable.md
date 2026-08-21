---
name: clic-dentro-de-menu-desplegable
description: "Un formulario dentro de un menu/dropdown que se cierra al clic puede desmontarse antes de enviarse; probarlo con un clic de verdad, no solo con pruebas automatizadas"
metadata: 
  node_type: memory
  type: feedback
  originSessionId: 4952c5a1-0464-46be-bb3b-af22c4881667
  modified: 2026-08-21T20:42:26.147Z
---

Construyendo el interruptor "ver como rol" de GCM (21 de agosto de 2026),
puse dos `<form action={...}>` dentro del panel de un menu desplegable
(`MenuDesplegable`) que se cierra al detectar cualquier clic dentro de si
mismo. El clic en el boton de envio burbujeaba hasta ese contenedor, que se
cerraba y desmontaba el formulario **antes** de que el envio llegara a
ejecutarse: el boton no hacia absolutamente nada, en silencio, sin error en
consola ni en el servidor.

El propio codigo del proyecto YA documentaba este exacto problema junto al
boton de "Salir" (`BotonSalir`, en el mismo archivo): un comentario explicaba
que hacia falta `onClick={(e) => e.stopPropagation()}` en el `<form>` por
esta misma razon. Lo lei, no lo conecte con lo que estaba escribiendo al
lado, y repeti el error que el comentario ya advertia.

**Why:** typecheck, lint y 2450 pruebas automatizadas seguian en verde
mientras el boton estaba roto. Ninguna de esas herramientas simula un clic
real de mouse ni la propagacion de eventos del DOM; prueban LOGICA
(permisos, calculo, tipos), no INTERACCION. El usuario tuvo que probarlo el
mismo, tres rondas de "no hace nada" / "donde se detiene exactamente", para
que apareciera.

**How to apply:** al escribir un control interactivo (boton, formulario,
enlace) que vive DENTRO de un contenedor con su propio manejador de
cierre-al-clic (un menu desplegable, un modal, un cajon movil, cualquier
"clic fuera para cerrar"), comprobar activamente si ese clic puede
burbujear y disparar el cierre antes de que la accion del control termine.
Buscar primero si el propio proyecto ya tiene el patron resuelto en otro
sitio (aqui estaba, literalmente al lado) antes de escribir el control
nuevo. Y para esta clase de bug en general —depende de un evento de mouse
real, no de una funcion pura— no basta con typecheck/lint/pruebas: hay que
probarlo con un clic de verdad, o pedirselo a quien pueda, antes de darlo
por terminado.
