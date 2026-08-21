---
name: estilo-de-escritura-del-proyecto
description: GCM se documenta y se commitea en espanol llano, sin tildes, describiendo el efecto visible
metadata:
  type: project
---

Convenciones de escritura observadas en el repo:

- Documentacion y mensajes de commit en **espanol, sin tildes**.
- Los titulos de commit son **frases completas sobre el efecto visible**, no
  conventional commits: «El tablero deja de contradecirse y gana la tarjeta de
  valor ganado», «Una semana cerrada vacia ya no hunde la capacidad».
- El tono explica **por que**, no solo que: los documentos cuentan las
  hipotesis falsas que se descartaron y las lecciones de metodo.
- **Nada de recuentos en un texto que describe una lista** —«estos siete
  archivos», «los ocho puntos de abajo»—. El recuento se queda viejo la
  primera vez que entra o sale un elemento, y entonces el documento miente
  sobre si mismo. Correccion del usuario del 21 de agosto de 2026, dicha dos
  veces: se escribe «estos archivos» y ya. (Una cifra que describe un HECHO
  fechado —«entraron 297 commits»— si vale: esa no cambia.)

**Why:** el usuario escribe asi y los documentos son de traspaso: se leen
meses despues, por alguien que no estaba.

**How to apply:** al redactar commits o documentacion aqui, imitar ese
registro. Nombrar el sintoma que ve el usuario final de la obra, no el
identificador tecnico. Ver [[docs-son-la-memoria]].
