---
name: rescatar-el-hosting-sin-consola
description: Que hacer cuando cPanel responde «Unable to fork» y no deja abrir Terminal ni reiniciar la app; ampliar el plan NO lo arregla
metadata: 
  node_type: memory
  type: project
  originSessionId: 2c5341c5-98be-4452-9854-ad90fbf358db
  modified: 2026-08-27T22:08:04.491Z
---

El 27 de agosto de 2026 la cuenta del hosting agoto su tope de procesos del
LVE y quedo bloqueada para todo: el Terminal, el gestor de Node y hasta
*Resource Usage* respondian `cagefs_enter: Unable to fork`. La web seguia
sirviendo -el proceso de Node ya estaba vivo-, pero nada nuevo podia arrancar:
ni el cron del despliegue ni el de avisos.

**Lo que NO lo arregla:** ampliar el plan de hosting. Se hizo, y el Terminal
seguia sin abrir. Un plan mayor da cupo nuevo; no libera lo que ya esta
colgado. Tampoco sirve pulsar botones de cPanel: casi todos necesitan arrancar
un proceso, que es justo lo que falla.

**Lo que si funciono, en este orden:**

1. **Apartar el paquete de la cola.** Desde el *Administrador de archivos*
   -que es de lo poco que sigue respondiendo-, renombrar `gcm.tar.gz` a
   `gcm.tar.gz.pausa`. El cron deja de intentar desplegar cada minuto, y con
   ello deja de nacer basura que perpetua la saturacion.
2. **Reiniciar la aplicacion a mano**, editando o creando `gcm/tmp/restart.txt`
   desde el mismo Administrador de archivos. Passenger mata el proceso viejo y
   arranca uno nuevo, y ahi se suelta el cupo. Riesgo declarado: si no hubiera
   sitio ni para arrancar de nuevo, la web se cae hasta que lo haya.
3. **Devolver el paquete**, quitandole el `.pausa`. El cron lo recoge en el
   minuto siguiente y se aplica solo.

**Como se lee el estado sin entrar al servidor**, con `curl` a `/api/health`:
`reloj` pasando de `vivo` a `parado` es la señal de que los crons ya no
corren -no solo el del despliegue-, y ahi es donde se ve que el problema es de
la cuenta entera y no del despliegue. `despliegue: pendiente` con la `version`
sin cambiar durante minutos es el paquete atascado.

**La causa de fondo ya esta cerrada en el codigo** (`scripts/desplegar.sh`): no
se arranca Prisma si no hay migraciones nuevas, y un paquete matado a medias
vuelve solo a la cola a los quince minutos. Esta nota es para el dia que pase
otra cosa que agote el cupo.

**Why:** costo una tarde entera y el usuario acabo agotado -«no entiendo nada,
solo quiero que todo vuelva a la normalidad»-. La secuencia de arriba se
descubrio probando, y no esta escrita en ningun runbook del hosting.

**How to apply:** ante `Unable to fork`, no mandar al usuario a pulsar botones
de cPanel ni a ampliar el plan: apartar el paquete, reiniciar por archivo,
devolverlo. Ver [[gcm-despliegue]] para el mecanismo normal y
[[explicar-sin-jerga]] para como contarlo.
