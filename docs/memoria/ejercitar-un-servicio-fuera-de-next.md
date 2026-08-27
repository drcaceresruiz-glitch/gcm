---
name: ejercitar-un-servicio-fuera-de-next
description: "Como correr un servicio real de GCM contra la base local desde un script, cuando hay que reproducir un fallo que solo aparece al guardar"
metadata: 
  node_type: memory
  type: project
  originSessionId: 2c5341c5-98be-4452-9854-ad90fbf358db
  modified: 2026-08-27T20:09:54.487Z
---

Para reproducir un fallo que ocurre AL GUARDAR -no al leer- hace falta correr
el servicio de verdad contra la base local. Ni las pruebas ni el navegador
sirven de atajo:

- **Vitest no vale**: `@/generated/prisma/client` esta aliasado a
  `test/prisma-generado-prohibido.ts`, que lanza al importarse. Una prueba
  nunca toca la base. Ver [[vitest-no-carga-el-env]].
- **`npx tsx` solo, tampoco**: los servicios abren con `import "server-only"`,
  que lanza fuera de un Server Component.

Lo que funciona: un script con `npx tsx --require ./stub.cjs`, donde el stub
intercepta `Module._load` y devuelve `{}` para `server-only` y `client-only`.
El `.env` se lee a mano (Next no esta ahi para cargarlo), la `SesionActiva` se
construye con `permisosDe(rol)` de `lib/rbac`, y se crea una obra de prueba
que se borra en el `finally`.

Para saber si algo esta roto ANTES de investigar, `npx tsx scripts/humo.ts`
con el `dev` levantado recorre todas las pantallas y avisa de las que
revientan al renderizar; crea su propia sesion en la base, sin contrasenas.

**Why:** el 27/08/2026 «la pantalla de nueva obra no carga» resulto ser el
Excel al guardarse (P2000, descripcion de 1264 caracteres contra un
VarChar(500)). La pantalla renderizaba perfecta en local y el humo la daba por
buena: el fallo solo existia con ese archivo y con la base delante. Sin
ejercitar el servicio de verdad habria seguido adivinando.

**How to apply:** cuando el sintoma sea «esta pantalla no se pudo cargar» y el
codigo de la pantalla no haya cambiado, sospechar de la ESCRITURA y montar
esto antes de razonar mas. Ver [[el-instrumento-tambien-miente]] y
[[priorizar-bugs-reportados-sobre-tareas-en-curso]].
