---
name: powershell-corrompe-la-codificacion
description: "Editar un archivo del proyecto con Get-Content/Set-Content de PowerShell 5.1 recodifica cada tilde, comilla angular y raya larga, y no lo caza ninguna herramienta"
metadata: 
  node_type: memory
  type: project
  originSessionId: e835fad8-f802-4255-b684-265781b24162
  modified: 2026-08-21T05:56:52.119Z
---

En este equipo PowerShell es **5.1**. `Get-Content -Raw` lee un archivo sin BOM
como ANSI (Windows-1252) y `Set-Content -Encoding utf8` lo escribe **con** BOM y
en UTF-8. El viaje de ida y vuelta destroza todo lo que no sea ASCII: `—` sale
`â€"`, `«` sale `Â«`, `valorización` sale `valorizaciÃ³n`. Ademas cuela un BOM
en la primera linea.

Paso de verdad el 21 de agosto de 2026, haciendo una prueba de mutacion sobre
`src/services/encargos.service.ts`: se corrompio el archivo entero, incluido un
mensaje de error que ve el usuario.

**Why:** `tsc`, `eslint` y las 2384 pruebas pasaron con el archivo ya
corrompido. **La bateria verde no dice nada de esto**; el unico que lo ve es
`git diff`, porque aparecen tocadas lineas que uno no escribio.

**How to apply:** editar SIEMPRE con las herramientas de edicion, nunca
reescribiendo un archivo desde PowerShell. Para una prueba de mutacion, mutar
con la herramienta de edicion y deshacer con `git checkout --`. Y despues de
cualquier tropiezo asi, mirar `git diff -U0 <archivo>` y comprobar que no hay
mas lineas `-` de las que uno cambio. Ver [[estilo-de-escritura-del-proyecto]].
