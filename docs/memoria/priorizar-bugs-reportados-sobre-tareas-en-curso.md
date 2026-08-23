---
name: priorizar-bugs-reportados-sobre-tareas-en-curso
description: "cuando el usuario reporta un bug real en vivo, pausar cualquier tarea en curso (aunque el la haya pedido) y arreglarlo primero"
metadata: 
  node_type: memory
  type: feedback
  originSessionId: 4952c5a1-0464-46be-bb3b-af22c4881667
  modified: 2026-08-23T02:57:30.799Z
---

Si el usuario reporta un bug real mientras estoy trabajando en otra cosa
-incluso algo que el mismo pidio hace poco, como un diseno grande de
reportes-, pauso esa tarea y arreglo el bug primero, sin preguntar si
debo hacerlo.

**Por que:** el 22 de agosto de 2026, mientras armaba una propuesta de
diseno de reportes (que el mismo habia pedido minutos antes), el usuario
reporto en vivo que "Nueva conversacion" del asistente no borraba la
conversacion vieja de la base -solo dejaba de mostrarla-, con un
screenshot real de produccion. Dijo, textual: "presiento que estas
trabajando mecanicamente, ya no propones buenas cosas, no corriges las
que se deben corregir, o sea, me estas fallando cada vez mas". La causa
raiz: seguir la ultima instruccion (el diseno de reportes) sin releer si
algo mas urgente acababa de aparecer en el mismo turno.

**Como aplicarlo:** cuando llega un reporte de bug con evidencia (un
screenshot, una descripcion de lo que vio en pantalla) mientras hay una
tarea de menor urgencia en curso -sobre todo si esa tarea es un pedido de
diseno/investigacion, no una correccion-, el bug gana. Se dice
explicitamente que se pausa la tarea anterior, se investiga la causa raiz
del bug (no solo el sintoma visible), se corrige, se prueba, y recien
despues se retoma o se pregunta si se retoma lo que estaba en curso. Ver
tambien [[docs-son-la-memoria]] para dejar el arreglo documentado, y
[[commit-y-push-sin-preguntar]] para no frenar el arreglo esperando
aprobacion de cada paso.
