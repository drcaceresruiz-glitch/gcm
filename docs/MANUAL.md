# El manual de GCM vive DENTRO de la aplicación

Está en **`/manual`**, con 25 capítulos, y es el que se mantiene.

Este archivo era el manual hasta el 25 de agosto de 2026. Se retiró porque
**dos manuales que se contradicen son peores que uno solo**, y este ya se
contradecía con la aplicación: describía un panel de once indicadores cuando
son quince, y contestaba que «el avance físico no está en soles porque se
pondera por duración» dos días después de que la ponderación por dinero
existiera y estuviera conectada a la curva, al informe y al ritmo.

No era descuido de nadie: es lo que le pasa siempre al manual que no se abre.
Este era un archivo del repositorio, así que ninguna persona de obra —que es
para quien estaba escrito— lo vio nunca.

## Qué se hizo con lo que había

Lo que este archivo tenía y el manual de la aplicación no, se **movió allí**,
comprobando cada respuesta contra el sistema de hoy:

- **Preguntas frecuentes** → `/manual/preguntas`. Se corrigió la del avance en
  soles (ahora explica el umbral del 60 % de cobertura del mapeo) y se
  descartaron tres que eran notas de cambios y no dudas de uso: «cambié la meta
  y perdí la cantidad» y «aparecieron módulos nuevos en el panel» describían
  fallos ya corregidos, y «desplegué un cambio y no aparece» es una pregunta de
  quien despliega, no de quien construye —esa vive en
  [`ESTADO.md`](ESTADO.md)—.
- **Glosario** → `/manual/glosario`, con cinco términos más (línea base, bolsa,
  comprometido).

Lo demás ya estaba contado, y mejor, en los capítulos de la aplicación.

## Dónde está cada cosa ahora

| Qué buscas | Dónde está |
|---|---|
| Cómo se usa el sistema | `/manual`, dentro de la aplicación |
| El estado técnico del proyecto | [`ESTADO.md`](ESTADO.md) |
| Lo que falta por hacer | [`PENDIENTES.md`](PENDIENTES.md) |
| Cómo se despliega | [`infraestructura.md`](infraestructura.md) |

> Este archivo se queda como señal, y no se borra, porque hay enlaces viejos
> que apuntan aquí —el propio `ESTADO.md` lo nombraba— y un 404 no explica
> nada. Si un día no queda ninguno, se puede retirar del todo.
