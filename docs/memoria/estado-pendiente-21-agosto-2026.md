---
name: estado-pendiente-21-agosto-2026
description: "Trabajo abierto al 21 de agosto de 2026: hueco de 90 commits sin documentar y un WIP sin describir"
metadata:
  type: project
---

Abierto a fecha de 21 de agosto de 2026:

1. **Hueco documental.** Unos 90 commits entre el 12 y el 20 de agosto no
   estan en `ESTADO.md` ni en `PENDIENTES.md`. Temas: informe semanal en PDF
   y por WhatsApp/SMS, analisis de causa raiz, aislamiento multiempresa
   probado, archivado/respaldo/borrado de obra cerrada, migraciones
   automaticas en el despliegue, EDT y cronograma encadenados al presupuesto,
   hitos de obra (incluidos los predictivos), Gantt con dependencias,
   catalogo de proveedores con carga por Excel y consulta de RUC por json.pe.
2. **`835d988 WIP antes de reinstalar Claude`** (20 ago, 23:37) quedo a
   medias y nadie describio que contiene. Mirarlo antes de seguir.
3. **`_msg.txt`** en la raiz es un borrador de mensaje de commit del 9 de
   agosto, ya usado y obsoleto. Borrar.
4. **Pendientes ya hechos sin tachar** en `PENDIENTES.md`, sobre todo en
   informe semanal, cierre de obra, EDT/cronograma e hitos. Comprobar en el
   codigo antes de retomar cualquier punto.

**Why:** son cuatro cabos sueltos que no se deducen leyendo el codigo, y el
primero hace que la documentacion enganie a quien la lea.

**How to apply:** resolverlos en la primera sesion que tenga `Read` y `Bash`.
Cuando esten los cuatro cerrados, borrar esta memoria. Ver
[[git-esta-mas-al-dia-que-los-docs]].
