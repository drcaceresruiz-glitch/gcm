---
name: reinstalacion-borro-memorias-y-plugin
description: La reinstalacion de Claude del 20 de agosto de 2026 vacio ~/.claude; memorias y plugin desktop-commander ya restaurados el 21 de agosto de 2026
metadata: 
  node_type: memory
  type: project
  originSessionId: 9d4a796e-6409-4bdd-92a1-0a14e3d2e5ea
  modified: 2026-08-21T17:02:33.369Z
---

El 20 de agosto de 2026 el usuario reinstalo Claude (commit `835d988 WIP antes
de reinstalar Claude`). La reinstalacion dejo `C:\Users\USER\.claude` casi
vacio: sin memorias y sin plugins. Por eso hubo sesiones sin `Read`, `Write`,
`Edit` ni `Bash`, cosa que al usuario le paso mas de una vez y le bloqueaba el
trabajo.

**Ya esta resuelto (21 de agosto de 2026).** Comprobado en esa fecha:

- `desktop-commander@claude-plugins-official` v0.2.0 reinstalado a las 16:41
  UTC y activado en `~/.claude/settings.json` (`enabledPlugins`).
- Las memorias del perfil estan de vuelta, ademas de la copia de
  `docs/memoria/` que nunca se perdio.
- El plugin expone las herramientas con el prefijo `mcp__desktop-commander__`.
  El nombre viejo era `mcp__plugin_desktop-commander_desktop-commander__`, y
  `.claude/settings.local.json` del proyecto seguia concediendo permiso a ese
  nombre muerto; se corrigio ese mismo dia a los nombres actuales.

**Why:** si vuelven a faltar herramientas, el diagnostico ya esta hecho una
vez y no hay que repetirlo desde cero.

**How to apply:** si faltan `Read`/`Write`/`Edit`/`Bash`, no es un archivo de
configuracion —ni el global ni el del proyecto bloquean nada—. Es el arranque
de la sesion. La salida es reinstalar `desktop-commander` desde `/plugin`, o
trabajar desde la CLI (`claude` en una terminal). Para confirmar que el plugin
esta: mirar `~/.claude/plugins/installed_plugins.json` y el bloque
`enabledPlugins` de `~/.claude/settings.json`. Ver
[[avisar-si-faltan-herramientas]].
