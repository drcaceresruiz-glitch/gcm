---
name: estado-pendiente-21-agosto-2026
description: "Al 21 de agosto de 2026 lo abierto ya esta escrito en docs/PENDIENTES.md; lo encabeza el WIP 835d988, que quedo a medias sin que nada lo delate"
metadata:
  type: project
---

Los cuatro cabos sueltos que recogia la version anterior de esta memoria
**estan cerrados** (commit `910334e`, 21 de agosto de 2026): los documentos de
traspaso alcanzaron al codigo, el WIP quedo descrito, `_msg.txt` se borro y los
pendientes ya hechos se tacharon comprobandolos uno a uno en el codigo. De
paso: no eran «unos 90 commits», eran **297**.

**Lo que sigue abierto NO se copia aqui.** Vive en la seccion «Lo que hay que
mirar primero» de `docs/PENDIENTES.md`, al principio del archivo, en ocho
puntos. Repetirlo en una memoria es exactamente lo que dejo caducada a la
version anterior el mismo dia que se escribio.

Lo unico que conviene tener en la cabeza al abrir el proyecto: **lo primero de
esa lista es el WIP `835d988`**, y no lo delata nada —typecheck, lint y las 27
pruebas de `encargos.service` pasan, y su migracion esta aplicada—. Los dos
correlativos de valorizacion se escriben bien, pero **no hay ni una prueba del
comportamiento nuevo** (el doble de Prisma se reescribio para probarlo, con
`puerta` y `choqueDeUnicidad`, y ningun test los usa) y **ninguna pantalla lee
los dos numeros**, que era el motivo entero del cambio.

**Why:** un arbol que compila y pasa las pruebas parece terminado, y este no lo
esta. Sin este aviso, la proxima sesion da por bueno el WIP y construye encima.

**How to apply:** al abrir el proyecto, leer la cabecera de
`docs/PENDIENTES.md` antes de decidir en que trabajar, y no fiarse de que la
bateria este verde para dar por cerrado el WIP. **Borrar esta memoria cuando el
WIP se cierre**: a partir de ahi `PENDIENTES.md` se basta solo. Ver
[[docs-son-la-memoria]] y [[git-esta-mas-al-dia-que-los-docs]].
