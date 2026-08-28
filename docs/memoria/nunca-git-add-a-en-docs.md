---
name: nunca-git-add-a-en-docs
description: Un `git add -A docs/` subio el presupuesto de un cliente al repositorio publico; los documentos de trabajo viven ahi a proposito
metadata:
  type: feedback
---

En `docs/` conviven documentos que SI se versionan con archivos de trabajo que
NO: presupuestos de clientes, borradores de la tesis, cualquier cosa que llegue
por correo. **Y este repositorio es publico.**

El 28 de agosto de 2026, un `git add -A docs/` para subir dos documentos de la
tesis se llevo tres archivos que llevaban semanas fuera a proposito, incluido el
presupuesto de un cliente. Estuvieron accesibles unos veinte minutos. Hubo que
retirarlos, reescribir el historial de la rama y avisar de lo que ya no se puede
deshacer: GitHub puede conservar el objeto, y cualquier clon anterior lo tiene.

Ahora `/docs/*.xlsx` y `/docs/*.docx` estan en el `.gitignore`, pero eso protege
de esos dos formatos y de nada mas.

**Why:** el mensaje del commit que los subio decia, literalmente, que esos
archivos no se versionaban. Saberlo no basta: lo que fallo fue el atajo.

**How to apply:** en `docs/` se anaden los archivos POR NOMBRE, uno a uno. Nunca
`git add -A docs/` ni `git add docs/`. Y antes de cualquier commit que toque esa
carpeta, leer `git status --short` entero en vez de confiar en que solo hay lo
que uno cree. Ver [[docs-son-la-memoria]] y [[commit-y-push-sin-preguntar]]: la
autorizacion para empujar sin preguntar hace esto mas facil, no menos peligroso.
