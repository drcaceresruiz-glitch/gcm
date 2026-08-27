> **Respaldo:** estos archivos estan copiados en `docs/memoria/` del
> repositorio GCM. Esta carpeta del perfil se vacio ENTERA al reinstalar
> Claude el 20 de agosto de 2026, y por eso la copia versionada es la que de
> verdad sobrevive. **Si editas o anades una memoria aqui, copia el cambio
> alli**; si esta carpeta vuelve a aparecer vacia, se restaura desde el
> repositorio. Ver [[reinstalacion-borro-memorias-y-plugin]].

- [Los docs son la memoria](docs-son-la-memoria.md) — ESTADO.md y PENDIENTES.md son el traspaso entre sesiones; actualizarlos antes de cerrar
- [La reinstalacion borro memorias y plugin](reinstalacion-borro-memorias-y-plugin.md) — que hacer si vuelven a faltar Read/Write/Bash; resuelto el 21 de agosto de 2026
- [Git va por delante de los docs](git-esta-mas-al-dia-que-los-docs.md) — comprobar el reflog antes de fiarse de la fecha de un documento
- [Avisar si faltan herramientas](avisar-si-faltan-herramientas.md) — decirlo en la primera respuesta, no despues de trabajar
- [Estilo de escritura del proyecto](estilo-de-escritura-del-proyecto.md) — espanol sin tildes, commits que describen el efecto visible
- [PowerShell corrompe la codificacion](powershell-corrompe-la-codificacion.md) — no reescribir archivos con Get-Content/Set-Content; la bateria verde no lo caza, solo git diff
- [Commit y push sin preguntar](commit-y-push-sin-preguntar.md) — autorizado el 21 de agosto: hacerlo cuando yo lo recomendaria, sin pedir confirmacion antes
- [Clic dentro de menu desplegable](clic-dentro-de-menu-desplegable.md) — un form que se cierra al clic puede desmontarse antes de enviarse; probar con un clic real, no solo pruebas automatizadas
- [E2E golden path verificado](e2e-golden-path-verificado.md) — obra->presupuesto->EDT->linea base->movimientos->encargos->Last Planner probado con navegador real el 21/08/2026; reiniciar dev server tras prisma generate
- [Hablar siempre en espanol](hablar-siempre-en-espanol.md) — pedido dos veces en la misma sesion (22/08/2026); ni una respuesta en ingles, ni corta ni tecnica
- [Esconder algo no lo caza la bateria](esconder-algo-no-lo-caza-la-bateria.md) — un cambio que consiste en NO ensenar algo pasa las 3028 pruebas estando mal; recorrer las pantallas
- [Clic por referencia no llega a React](clic-por-referencia-no-llega-a-react.md) — antes de reportar «el boton no hace nada», repetirlo con un clic real en coordenadas
- [Priorizar bugs reportados sobre tareas en curso](priorizar-bugs-reportados-sobre-tareas-en-curso.md) — un bug real con evidencia pausa cualquier otra tarea, aunque el usuario la haya pedido hace poco
- [El instrumento tambien miente](el-instrumento-tambien-miente.md) — antes de reportar, comprobar que la medicion distingue; volver al codigo viejo y ver que la prueba se pone roja
- [Vitest no carga el .env](vitest-no-carga-el-env.md) — para tocar la base o descifrar desde una prueba hay que leer el .env a mano, tambien CORREO_CLAVE_CIFRADO
- [El push cierra las sesiones abiertas](push-cierra-las-sesiones-abiertas.md) — el gancho de pre-push construye; no empujar mientras alguien recorre la aplicacion
- [Heredoc se rompe con plantillas JS](heredoc-se-rompe-con-plantillas-js.md) — un `<<'EOF'` con `${...}` dentro de backticks falla; escribir el script con Write
- [Explicar sin jerga](explicar-sin-jerga.md) — el usuario pidio el 27/08/2026 que se le cuente el sintoma, no la ruta del archivo
- [Ejercitar un servicio fuera de Next](ejercitar-un-servicio-fuera-de-next.md) — como reproducir un fallo que solo aparece al guardar, con tsx y un stub de server-only
- [Rescatar el hosting sin consola](rescatar-el-hosting-sin-consola.md) — «Unable to fork»: ampliar el plan no lo arregla; apartar el paquete, reiniciar por archivo y devolverlo
