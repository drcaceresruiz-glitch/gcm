---
name: commit-y-push-sin-preguntar
description: "El usuario autorizo hacer commit y push a main sin pedir confirmacion, cuando yo mismo lo recomendaria"
metadata: 
  node_type: memory
  type: feedback
  originSessionId: 4952c5a1-0464-46be-bb3b-af22c4881667
  modified: 2026-08-21T18:46:35.091Z
---

El 21 de agosto de 2026, tras terminar el arreglo de `desplegar.sh` (punto 0
de PENDIENTES.md) y preguntar si hacia commit y si hacia push, el usuario
respondio: que sea mi regla, que lo recomiende con cierta cadencia, y que
puedo hacerlo **sin consultar antes**.

**Why:** un push a `main` en este repo dispara un despliegue real a
produccion (`desplegar.yml` corre en cada push a `main`), asi que por defecto
yo lo trataba como accion de alto riesgo que exige confirmar antes. El
usuario prefiere no ser interrumpido para esa confirmacion.

**How to apply:** cuando termine un cambio que en circunstancias normales
recomendaria commitear y pushear —trabajo completo, probado, no a medias—,
hacerlo directamente: `git add` de los archivos concretos, commit, y push a
`main`. No hace falta preguntar antes. Si el trabajo lleva un rato sin
cerrarse en un commit, es razonable proponerlo aunque no se haya terminado
del todo, en vez de esperar en silencio.

Lo que esto NO cubre, porque el usuario no lo autorizo y sigue aplicando la
regla general de este entorno:
- Operaciones destructivas (`reset --hard`, `push --force`, borrar ramas).
- Saltarse hooks (`--no-verify`) o firma (`--no-gpg-sign`).
- Tocar nada que no sea el flujo normal commit+push a `main`.

Despues de hacerlo, avisar en la respuesta que hecho commit/push y que un
despliegue va a correr — transparencia despues del hecho, no permiso antes.
