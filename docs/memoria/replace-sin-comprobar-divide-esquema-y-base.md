---
name: replace-sin-comprobar-divide-esquema-y-base
description: Un reemplazo por patron que no encaja falla en silencio; en schema.prisma eso deja la base y el esquema divergentes
metadata: 
  node_type: memory
  type: feedback
  originSessionId: 2c5341c5-98be-4452-9854-ad90fbf358db
  modified: 2026-08-28T04:13:51.299Z
---

El 27 de agosto de 2026 paso DOS VECES en la misma sesion: un script de Python
anadio una columna a la migracion SQL —que si se aplico a la base— y el mismo
cambio no encajo en `prisma/schema.prisma`. El `replace` no lanza cuando el
patron no aparece: devuelve el texto igual y el script imprime «hecho».

El resultado es de los peores que hay: **la base tiene la columna y el cliente
de Prisma no**, asi que el codigo compila, las pruebas pasan y revienta en
tiempo de ejecucion con `Unknown field` la primera vez que alguien abre esa
pantalla.

**Como se evita:**

- Para `schema.prisma`, usar la herramienta de edicion, que falla si el texto
  no esta. Nunca un `replace` por patron.
- En cualquier script de reemplazo, `assert viejo in s` ANTES de escribir, y
  uno por cada reemplazo, no uno al final.
- Despues de tocar el esquema: `npx prisma validate`, `generate`, y
  `migrate status` —que dice si la base y las migraciones cuadran— y ademas
  comprobar con un `grep` que el campo esta de verdad en el archivo.

**Why:** los archivos del proyecto tienen CRLF y comentarios `///` en medio de
los bloques, asi que un patron copiado de memoria casi nunca encaja tal cual.
El silencio del `replace` convierte eso en un fallo diferido.

**How to apply:** si un script de edicion imprime «ok» pero el resultado no se
ve, comprobarlo con `grep` antes de seguir construyendo encima. Ver
[[powershell-corrompe-la-codificacion]] para el otro modo de romper un archivo
sin enterarse.
