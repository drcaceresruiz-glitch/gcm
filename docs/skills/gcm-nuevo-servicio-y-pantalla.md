---
name: gcm-nuevo-servicio-y-pantalla
description: El recorrido de tres capas para una pantalla o servicio nuevo de un modulo de negocio de GCM (obra, encargo, cronograma...) - Server Action, servicio, Prisma - y las convenciones de idioma, comentarios y pruebas que ya tiene el resto del proyecto. Se dispara al pedir una pantalla o servicio nuevo.
---

# Pantalla y servicio nuevo en GCM

Este skill acelera el patron mas repetido del historial del proyecto. A
diferencia de `gcm-limites-de-capas` o `gcm-despliegue`, posponerlo no
provoca un incidente por si mismo -solo hace mas lento escribir codigo que
de todas formas saldria correcto si ya se sigue `gcm-limites-de-capas`-.
Cargalo cuando el pedido sea concretamente "una pantalla/accion/servicio
nuevo para X", no para cualquier cambio.

## El recorrido de tres capas

1. **Server Action co-ubicada**, en `acciones.ts` junto a la ruta que la
   usa (p. ej. `src/app/(dashboard)/obras/[id]/<modulo>/acciones.ts`).
   Empieza con `"use server"`. No decide nada de negocio: comprueba que
   llegaron los datos minimos de la peticion (sesion, FormData) y pasa el
   resto al servicio. El servicio es la frontera real -ver
   `gcm-limites-de-capas`-, asi que la Server Action puede llamarse desde
   una ruta nueva sin repetir el permiso ni el filtro de empresa.
2. **Servicio**, en `src/services/<modulo>.service.ts`. Aqui vive TODO:
   `puede(sesion, "recurso:accion")` primero, la consulta a Prisma con
   `companyId: sesion.companyId` (o `project: { companyId }`), la logica
   de negocio, la transaccion si hace falta, y el apunte de `AuditLog`
   cuando la escritura lo justifica.
3. **Prisma**, solo desde el servicio. La pantalla (componente de
   servidor o cliente) nunca importa `@/lib/prisma` directamente -ESLint
   lo bloquea, pero la razon de fondo es la frontera de permisos, no el
   linter-.

Cada capa lleva su propio `.test.ts`. Los servicios se prueban con
DOBLES de Prisma (un objeto `estado` mutable compartido entre tests que
simula las tablas, inyectado via `vi.mock("@/lib/prisma", ...)`), nunca
contra una base real: es lo que permite que la suite entera corra en
segundos y en CI sin infraestructura.

## Convencion de idioma, y es a proposito

- **Codigo, comentarios y UI: español CON tildes.**
- **Documentacion (`docs/*.md`) y mensajes de commit: español SIN
  tildes.**

Son registros distintos a proposito, no un descuido: el codigo y la UI
los lee gente escribiendo con teclado normal en el dia a dia; los
documentos y commits han pasado por herramientas que a veces maltratan la
codificacion (ver el incidente de PowerShell/`Get-Content` en la memoria
del proyecto), y sin tildes ese riesgo desaparece del todo en vez de
mitigarse.

## Que va en un comentario

El comentario explica el **POR QUE**, nunca el QUE -eso ya lo dice el
nombre de la funcion o la variable-. Un comentario que solo repite lo que
la linea de abajo ya dice en codigo es ruido que hay que seguir leyendo
para descartar. Lo que SI merece un comentario:

- Una restriccion oculta que el codigo no puede expresar por si solo
  ("no se puede reordenar esto sin romper X").
- Un caso raro medido en produccion que motivo la forma actual, con la
  cifra o el incidente si existe (este proyecto tiene muchos: "el
  20/08/2026...", "el incidente real del 19/08...").
- Una decision que parece un error a primera vista y no lo es (por que NO
  se hizo de la forma obvia).

Nunca: "// crea el proveedor", "// suma el total" — si el nombre de la
funcion ya lo dice, el comentario solo repite trabajo de lectura sin
anadir nada.

## Que hace que una prueba muerda

La prueba que importa lleva, en el `it(...)` o en un comentario dentro,
una frase que dice QUE rompe si se quita esa prueba o si alguien
deshiciera el arreglo que prueba. Es lo que distingue una prueba que de
verdad protege algo de una que solo ocupa espacio y hace mas lenta la
suite sin bajar el riesgo de nada. Ejemplo real de este proyecto: una
prueba de aislamiento entre empresas que se valido MUTANDO el servicio a
proposito (cambiando un `where` de `projectId` a `encargoId`) para
confirmar que la prueba de verdad fallaba si la guarda desaparecia -no
solo que pasaba con el codigo actual-.
