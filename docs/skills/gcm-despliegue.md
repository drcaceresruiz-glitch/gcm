---
name: gcm-despliegue
description: Runbook del despliegue de GCM a produccion (gcm.drcaceresruiz.com) - el mecanismo FTP+cron, como leer /api/health, el criterio G6 del pre-push, y las reglas que ya costaron un incidente cada una. Se dispara al tocar scripts/desplegar.sh o .github/workflows/, o ante cualquier reporte de "la obra no ve mi cambio" / "el sitio esta caido".
---

# Despliegue de GCM

Este runbook es el mecanismo y las reglas operativas, que no cambian de un
dia para otro. El relato completo de CADA incidente -con fechas, sintomas y
diagnosticos descartados- vive en `docs/ESTADO.md` ("Incidente del 10 de
agosto de 2026", seccion 17 "Despliegue: lo que fallo y como se cerro") y
en `docs/PENDIENTES.md`. No se reproduce aqui a proposito: un runbook que
copia la narrativa se desincroniza el dia que el incidente se cierra y
nadie se acuerda de actualizar la copia. Si algo de abajo no cuadra con lo
que ves en el servidor, esos dos documentos son la fuente, no este archivo.

## El mecanismo

1. `git push` a `main` sube un unico paquete (`gcm.tar.gz`) mas `app.js`
   por FTP.
2. Un cron de cPanel corre `scripts/desplegar.sh` cada minuto.
3. `desplegar.sh` aplica las MIGRACIONES DE BASE DE DATOS antes de
   intercambiar el codigo -nunca al reves-. Codigo nuevo contra tablas
   viejas tira la aplicacion entera.
4. El cambio de version es un renombrado atomico del directorio de la app,
   no una copia de archivos encima de lo que ya corria.
5. Si `migrate deploy` falla, `devolver_paquete()` regresa
   `gcm.tar.gz.desplegando` a `gcm.tar.gz` sola -sin que nadie entre al
   servidor-, reintenta hasta 30 veces (una por minuto de cron, ~media
   hora) y si se agotan deja de tocarlo y lo dice en la bitacora
   (`tmp/despliegue.log`), para no encadenar arranques de Prisma sin fin.

**Lo que NO se puede hacer:** aplicar el paquete sin migrar. No hay atajo
seguro para eso.

## Como leer `/api/health`

Nunca revela detalles de error al exterior, solo estado. Campos y a que
causa apunta cada uno (`src/app/api/health/route.ts`):

- `version`: el SHA del PAQUETE (lo que de verdad corre), no el de
  `app.js` -`app.js` lo deja el FTP en su sitio ANTES de que el cron
  aplique el paquete, asi que usarlo como "version" miente mientras el
  cron no ha corrido todavia-.
- `arranque`: el SHA del punto de entrada, aparte, para poder VER un hueco
  entre lo que se subio y lo que arranco.
- `coherencia`: `"ok"` si `version` y `arranque` coinciden; `"desfasado"`
  si el FTP dejo un paquete que el cron aun no aplico; `"desconocida"` si
  el paquete es anterior a esta comprobacion y no trae SHA -no saberlo y
  estar al dia no son lo mismo, y decir "ok" sin poder comprobarlo es como
  se pierde media hora buscando algo que no es la causa-.
- `despliegue`: `"pendiente"` = hay un paquete subido que el cron aun no
  aplico, o sea que ESTA NO es la ultima version. Se puede saber con un
  `curl`, sin entrar al servidor a mirar fechas de archivo.
- `reloj`: el cron de avisos automaticos (`avisos-reloj`, no el de
  despliegue). `"nunca"` = falta la linea del cron en cPanel;
  `"parado"` = existe y lleva media hora sin correr. Un cron de avisos que
  no existe no lo echa de menos nadie, porque lo que falla es justo lo que
  avisaba -por eso se publica aqui, no se espera a que alguien note el
  silencio-.
- `operadores`: cuantos correos hay en `GCM_OPERADORES` (el numero, nunca
  los correos). 0 = falta la variable y nadie puede dar de alta
  constructoras nuevas.
- `cifrado`: si `CORREO_CLAVE_CIFRADO` esta configurado. "falta" = ninguna
  constructora puede guardar su buzon propio.

## El criterio G6 (`pre-push`, `.githooks/pre-push`)

Cuatro pasos, EN ESTE ORDEN, porque cada uno tapa el punto ciego del
anterior: **typecheck → lint → test → build**. Vive en `pre-push` y no en
`pre-commit` a proposito: cada push a `main` despliega a produccion, y
colgarlo del commit obligaria a esperar en cada guardado intermedio -que
es como se acaba usando `--no-verify` por costumbre, y entonces el gancho
deja de proteger nada-.

Por que las cuatro y no menos: un deploy real murio en el LINT del CI por
un `any` en un doble de test que G6 en ese momento no miraba (el lint no
estaba en la lista); vitest no comprueba tipos que `tsc` si ve; `tsc` no
ve las consultas de Prisma ni los errores que solo aparecen al construir;
y `build` es lo unico que de verdad reproduce el fallo que el CI puede
dar con typecheck y test en verde.

Saltarselo un dia concreto: `git push --no-verify` -pero entonces el CI
sigue corriendo las cuatro en remoto, asi que solo ahorra tiempo local, no
riesgo real-.

## Reglas operativas, cada una nacida de un incidente real

- **Nunca `localhost` en un `DATABASE_URL` de este hosting.** Resuelve
  solo a `::1` en este servidor, y MariaDB no atiende IPv6. Siempre
  `127.0.0.1`.
- **No encadenar intentos manuales de `desplegar.sh`.** Cada intento
  fallido deja procesos zombis (`bash`, `npm exec`, `node`, el
  schema-engine de Prisma) y varios acumulados agotan el `nproc` del LVE
  del hosting: `node` deja de poder crear hilos y muere con
  `pthread_create: Resource temporarily unavailable` en fracciones de
  segundo. **No es un problema de memoria** -aunque el sintoma engañe a
  pensar eso-, es un tope de PROCESOS.
- **Lanzarlo con `nohup`** si hace falta correrlo a mano: sin eso, muere
  con la sesion de SSH (SIGHUP) y deja mas restos.
- **Limpiar con `pkill -f prisma` antes de reintentar. NUNCA `pkill node`
  a secas**: ahi vive la aplicacion entera.
- **Ante la duda, dejar que lo haga el cron solo.** No relanzar un
  despliegue "por si acaso" sin saber la causa exacta: ya se probo, y
  fallo exactamente igual las veces que se repitio a ciegas.

## El metodo, no solo el dato

Cuando un sintoma sobrevive a DOS diagnosticos distintos, la siguiente
accion es MEDIR algo en el servidor, no seguir razonando sobre lo que ya
se sabe. El incidente del 10 de agosto se dio por resuelto tres veces con
causas distintas (cron roto, desajuste de host, "parpadeo" de la base)
antes de que una medicion real (`getent hosts localhost`, un marcador en
`node -e`, `ps -u` con `etime`) descartara las tres y encontrara la
cuarta. Repetir el mismo tipo de razonamiento una tercera vez no habria
encontrado nada nuevo.
