---
name: explicar-sin-jerga
description: "Al usuario se le explica con el sintoma que ve, no con nombres de archivo ni linea de codigo; el detalle tecnico solo si lo pide"
metadata: 
  node_type: memory
  type: feedback
  originSessionId: 2c5341c5-98be-4452-9854-ad90fbf358db
  modified: 2026-08-27T20:10:08.357Z
---

El 27 de agosto de 2026, tras una respuesta llena de rutas de archivo,
numeros de linea y nombres de funcion, el usuario contesto: «no entiendo nada
de lo que me dices». La segunda version -misma informacion, contada con el
sintoma que ve el usuario final y sin una sola ruta- si funciono, y la
conversacion avanzo.

Como escribir en las respuestas:

- **Empezar por lo que pasa**, no por donde esta escrito. «La pantalla se cae
  al pulsar crear» antes que «la Server Action lanza P2000».
- **Nada de rutas ni lineas** salvo que se pidan. `excel-presupuesto.ts:954`
  no le dice nada a quien no va a abrir el archivo.
- **Las cifras si**: «ocho partidas», «1264 letras», «400 lineas,
  806.497,45». Son lo que si puede comprobar contra su Excel.
- **Terminar en una decision o una pregunta concreta**, no en un menu de
  opciones tecnicas.

**Why:** el usuario dirige el producto y habla con SU cliente; necesita poder
repetir la explicacion a otra persona. Una respuesta que solo entiende quien
tiene el repositorio delante no le sirve para nada.

**How to apply:** escribir la respuesta y releerla preguntando «esto lo
entenderia el cliente constructor». Ver [[estilo-de-escritura-del-proyecto]] y
[[hablar-siempre-en-espanol]].
