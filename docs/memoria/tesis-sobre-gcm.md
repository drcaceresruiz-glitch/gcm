---
name: tesis-sobre-gcm
description: GCM es tambien el instrumento de la tesis del usuario; el diseno, las restricciones y donde vive cada documento
metadata:
  type: project
---

Desde el 27 de agosto de 2026, GCM tiene un segundo uso: es el **instrumento
de medicion de la tesis del usuario** (segunda especialidad en Ingenieria de
Procesos). Enfoque cuantitativo, **diseno cuasiexperimental de series
cronologicas interrumpidas**, con la **semana como unidad de analisis**.

**LO QUE NO SE TOCA.** El usuario lo dijo varias veces: el titulo, las
preguntas, los objetivos y las hipotesis ya estan cerrados. Cualquier problema
que aparezca —incluido el de conseguir datos de la fase previa— se resuelve
SIN cambiarlos. Si una solucion exige moverlos, no es la solucion.

Consecuencia directa: como el titulo dice «aplicacion web basada en el Last
Planner System», la variable independiente es **la herramienta, no el
metodo**. Por eso la fase previa se gestiona con Last Planner EN PAPEL durante
diez a doce semanas (`docs/tesis/protocolo-fase-previa.md`), y lo unico que
cambia entre fases es el soporte.

**Donde vive cada cosa:**

- `docs/tesis/` — estructura completa (titulo, problemas, objetivos,
  hipotesis, matriz de consistencia con dimensiones, operacionalizacion,
  capitulo de metodologia redactado), cuestionario TAM, ficha de validacion
  por expertos y el protocolo de la fase previa.
- `docs/piloto/` — los CSV del piloto simulado y las figuras de plantilla.
- La pantalla `Investigacion`, solo para quien opera GCM.

**Lo que falta es de CAMPO, no de codigo:** elegir tres expertos y aplicar la
V de Aiken, el Kappa de Cohen sobre 30 a 50 incumplimientos, y una obra real
en ejecucion.

**Why:** ningun documento del repositorio explica que la app tiene este
segundo proposito, y las decisiones de producto que se tomen a partir de ahora
—sobre todo en Last Planner y en la exportacion— afectan a un estudio ya
planteado.

**How to apply:** antes de cambiar como se calculan PPC, causas de no
cumplimiento o fechas de restricciones, comprobar si el cambio rompe la
comparabilidad de las series. Ver [[operar-gcm-no-es-un-acceso-aparte]] y
[[docs-son-la-memoria]].
