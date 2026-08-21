---
name: git-esta-mas-al-dia-que-los-docs
description: En GCM el historial de git suele ir por delante de los documentos; comprobar el reflog antes de dar por buena una fecha de docs
metadata:
  type: feedback
---

El 20 de agosto de 2026 informe del estado del proyecto leyendo solo
`docs/ESTADO.md` (10 ago) y `docs/PENDIENTES.md` (12 ago), y conclui que no
habia trabajo reciente. El usuario me corrigio: habia unos 90 commits
posteriores, el ultimo de ese mismo dia.

**Why:** los documentos se actualizan a rachas y el codigo no espera. Fiarse
de la linea «Ultima actualizacion» de un documento da una foto vieja y hace
perder tiempo al usuario explicando lo que ya sabe.

**How to apply:** antes de resumir el estado del proyecto, mirar
`git log`/`.git/logs/HEAD` y comparar su ultima fecha con la de los
documentos. Si hay hueco, decirlo de entrada. Los titulos de commit de este
repo son descriptivos y sirven de indice; los diffs, para el detalle.
