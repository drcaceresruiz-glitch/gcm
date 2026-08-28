---
name: las-guardas-del-repo-obligan-a-registrar
description: "GCM tiene pruebas estructurales que exigen declarar toda tabla, pantalla o funcion nueva; conviene correr la bateria pronto, no al final"
metadata: 
  node_type: memory
  type: project
  originSessionId: 2c5341c5-98be-4452-9854-ad90fbf358db
  modified: 2026-08-28T04:14:06.536Z
---

El proyecto tiene pruebas que no comprueban comportamiento sino REGISTRO, y
que fallan cuando algo nuevo no se declara donde toca:

- `src/lib/respaldo-esquema.test.ts` — toda tabla con `projectId` tiene que
  estar en el catalogo del respaldo o en `EXCLUIDAS` con su motivo, y toda
  columna que sea dia de calendario tiene que aparecer en `fechas`.
- `src/lib/respaldo-empresa-esquema.test.ts` — lo mismo para la migracion de
  empresa.
- `src/services/esOperador-guarda.test.ts` — todo archivo de `services/` que
  mire `sesion.esOperador` tiene que estar en su registro CON TODAS sus
  funciones.
- `src/components/manual/capitulos.test.ts` — toda seccion del menu de obra
  tiene que decir en que capitulo del manual se explica, o `null` con la razon
  escrita al lado.

**Why:** son la respuesta del proyecto a los fallos que nadie ve hasta que
duelen —una tabla que no viaja en el respaldo, una pantalla que nadie sabe
explicar—. El 27 de agosto de 2026, anadir el modulo de investigacion disparo
las cuatro a la vez, y ninguna de las cuatro se me habria ocurrido sola.

**How to apply:** al anadir una tabla, una pantalla del menu o una funcion que
mire `esOperador`, correr `npm test` PRONTO —no al final del bloque— para que
la guarda diga que falta declarar mientras el contexto todavia esta fresco.
Ver [[esconder-algo-no-lo-caza-la-bateria]]: alli la bateria no cazaba; aqui
caza, y hay que dejarla hablar.
