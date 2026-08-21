---
name: reinstalacion-borro-memorias-y-plugin
description: La reinstalacion de Claude del 20 de agosto de 2026 vacio ~/.claude; se perdieron las memorias y el plugin desktop-commander
metadata:
  type: project
---

El 20 de agosto de 2026 el usuario reinstalo Claude (commit `835d988 WIP antes
de reinstalar Claude`). La reinstalacion dejo `C:\Users\USER\.claude` casi
vacio: sin memorias y sin plugins.

`.claude/settings.local.json` del proyecto todavia concede permisos a
`mcp__plugin_desktop-commander_desktop-commander__read_file`, senal de que ese
plugin era quien daba acceso a archivos antes. Los permisos siguen; el plugin
no.

**Why:** explica que sesiones posteriores aparezcan sin `Read`, `Write`,
`Edit` ni `Bash`, cosa que al usuario le ha pasado mas de una vez y le
bloquea el trabajo.

**How to apply:** si faltan esas herramientas, no es un archivo de
configuracion —ni el global ni el del proyecto bloquean nada—. Es el arranque
de la sesion. La salida es reinstalar `desktop-commander` desde `/plugin`, o
trabajar desde la CLI (`claude` en una terminal). Ver
[[avisar-si-faltan-herramientas]].
