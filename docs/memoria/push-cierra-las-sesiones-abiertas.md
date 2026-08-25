---
name: push-cierra-las-sesiones-abiertas
description: "git push corre la bateria G6 con build, y el build invalida las sesiones del servidor de desarrollo"
metadata:
  type: project
---

En GCM, **`git push` construye**: el gancho `.githooks/pre-push` corre la
bateria G6 entera —typecheck, lint, test y **build**—. Y `npm run build`
invalida las sesiones del servidor de desarrollo.

**Why:** si alguien está recorriendo la aplicación en el navegador —una prueba
manual, un usuario de prueba, el propio usuario mirando una pantalla—, cada
push lo echa fuera y hay que volver a entrar. El 25 de agosto de 2026 pasó dos
veces seguidas en mitad de un recorrido, y la segunda me costó pedirle al
usuario que se reautenticara.

**How to apply:** mientras haya alguien mirando la aplicación, **no empujar**.
Correr `typecheck`, `lint` y `test` a mano cuantas veces haga falta —esos no
molestan—, ir juntando los commits, y hacer un solo `push` cuando el recorrido
termine. Decírselo al usuario antes de empujar, no después.

Nota aparte: cuando el recorrido lo hace un usuario de prueba en una ventana de
incógnito, la extensión de Chrome **está desactivada en incógnito por defecto**
y hay que permitirla en `chrome://extensions` para poder conducir esa ventana.
