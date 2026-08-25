---
name: heredoc-se-rompe-con-plantillas-js
description: "Un heredoc de Bash con plantillas JS dentro (backtick con ${...}) falla con \"unexpected EOF\"; escribir el script con Write"
metadata: 
  node_type: memory
  type: project
  originSessionId: 8189102d-df1a-4805-ba28-860c250cf55b
  modified: 2026-08-25T21:15:58.872Z
---

Pasar un script por `<<'EOF'` falla con **`unexpected EOF while looking for
matching '`** cuando el contenido lleva **plantillas de JavaScript**: comillas
invertidas con `${...}` dentro, como `` `/obras/${id}/cronograma` ``. Con
comillas invertidas SIN `${}` no pasa, y por eso engana: los mensajes de commit
llenos de `backticks` entran sin problema.

Ocurrio dos veces el 25 de agosto de 2026, las dos escribiendo scripts de
Python que reemplazaban JSX.

**Como se esquiva:** escribir el script con la herramienta `Write` en el
scratchpad y ejecutarlo despues (`python <ruta>` o
`node node_modules/tsx/dist/cli.mjs <ruta>`). No merece la pena pelearse con el
escapado.

**Why:** el fallo no dice nada de plantillas —habla de una comilla sin cerrar—
asi que se pierde tiempo buscando el apostrofe equivocado.

**How to apply:** en cuanto el texto que hay que pasar contenga JSX o TypeScript
con plantillas, ir directo a `Write`. Ver [[powershell-corrompe-la-codificacion]],
que es la otra trampa de este entorno al escribir archivos.
