---
name: avisar-si-faltan-herramientas
description: Si la sesion no tiene Read/Write/Edit/Bash, decirlo antes de empezar, no despues de trabajar
metadata:
  type: feedback
---

El usuario no quiere trabajar en sesiones sin herramientas de lectura,
escritura y shell. Se lo he encontrado ya varias veces y lo considera
bloqueante.

**Why:** sin ellas solo puedo buscar con `Glob`/`Grep`, no puedo leer diffs ni
modificar archivos. Aceptar el encargo igual y entregar «texto para pegar»
cuando se pidio «actualiza los archivos» es entregar otra cosa.

**How to apply:** al recibir una tarea que exige escribir o ejecutar,
comprobar antes si esas herramientas estan y avisar en la primera respuesta.
Ofrecer la salida (CLI en terminal, o reinstalar el plugin) en vez de dar
rodeos. Ver [[reinstalacion-borro-memorias-y-plugin]].
