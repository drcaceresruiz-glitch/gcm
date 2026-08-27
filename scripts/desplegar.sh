#!/bin/bash
#
# Aplica en el servidor el paquete que sube el despliegue.
#
# Lo llama un CRON cada minuto, desde cPanel -> Trabajos cron:
#   cd ~/RUTA_DE_LA_APP && bash desplegar.sh >/dev/null 2>&1
#
# La ruta real no se escribe aqui: este repositorio es publico y el nombre de
# la cuenta se deduce de ella. Vive en el secreto `FTP_SERVER_DIR` y en el
# propio cron, como manda `docs/infraestructura.md`.
#
# El script lo sube el workflow por FTP, junto a `app.js` y fuera del
# comprimido: si viajara dentro, el intercambio de mas abajo lo moveria
# mientras se esta ejecutando.
#
# POR QUE NO LO HACE EL ARRANQUE DE LA APLICACION
#
# Descomprimir son 16 segundos medidos (0,5 de CPU; el resto, esperando al
# disco) y LiteSpeed mata el arranque mucho antes. El 10 de agosto de 2026 eso
# dejo TODOS los despliegues del dia sin aplicar: el paquete quedaba a medio
# extraer y el arbol mezclaba archivos de dos compilaciones. De ahi un .mjs que
# parecia truncado, "Server Action de otra version" y renders muertos a mitad.
# Un cron no tiene cronometro. El arranque, ahora, no hace trabajo pesado.
#
# POR QUE SE DESCOMPRIME EN UN DIRECTORIO APARTE
#
# Antes se hacia "tar -xzf" ENCIMA del arbol vivo, y eso tenia dos defectos:
#
#   1. El proceso que servia peticiones leia archivos que estaban cambiando
#      bajo sus pies.
#   2. Lo que ya no venia en el paquete NO SE BORRABA NUNCA. En produccion
#      quedaron rutas de versiones anteriores —"obras", "empresa" y "operador"
#      sueltas en .next/server/app, de cuando no estaban agrupadas— y copias
#      viejas de los estaticos, que Apache sirve con cache de UN ANO. Ese
#      sedimento es la via por la que un navegador puede acabar ejecutando
#      JavaScript de una compilacion y recibiendo HTML de otra.
#
# Ahora se descomprime en ".siguiente", se comprueba que el paquete trae lo
# minimo, y se cambia por el vivo con renombrados, que son instantaneos. El
# arbol viejo se va ENTERO, con su sedimento.
#
# Si algo falla antes del cambio, no se toca nada y la version que estaba
# sirviendo sigue en pie. Eso es deliberado: media version desplegada es peor
# que una version vieja.

set -uo pipefail

RAIZ="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$RAIZ" || exit 1

PAQUETE="$RAIZ/gcm.tar.gz"
EN_CURSO="$RAIZ/gcm.tar.gz.desplegando"
NUEVO="$RAIZ/.siguiente"
VIEJO="$RAIZ/.anterior"
CANDADO="$RAIZ/tmp/candado-despliegue"
BITACORA="$RAIZ/tmp/despliegue.log"
CUENTA_INTENTOS="$RAIZ/tmp/intentos-migracion"

# Cuantas veces se reintenta un paquete cuya migracion falla. El cron pasa cada
# minuto, asi que son ~30 minutos de reintentos: de sobra para un reinicio de
# MariaDB o un mantenimiento corto, y poco para que una causa que no se va sola
# llene la bitacora y encadene arranques de Prisma sin fin.
INTENTOS_MAXIMOS=30

# Cuanto se espera antes de dar por muerto un paquete reservado. Un despliegue
# entero tarda menos de dos minutos; quince es holgura de sobra para no pisar
# uno que de verdad se este aplicando.
MINUTOS_PARA_RESCATE=15

# Sin paquete no hay nada que hacer. Es el caso normal: el cron corre cada
# minuto y despliegues hay pocos.
#
# PERO «SIN PAQUETE» TIENE DOS SIGNIFICADOS, y confundirlos costo una tarde
# entera el 27/08/2026. El paquete se reserva renombrandolo a `.desplegando`
# nada mas cogerlo. Si el proceso muere DE VERDAD a mitad -no que falle: que lo
# maten- nadie deshace ese renombrado: `devolver_paquete` solo corre por la
# rama de fallo de migracion, y a un proceso muerto no le queda rama. El cron
# pasa entonces cada minuto, no ve ningun `gcm.tar.gz`, y se va. Para siempre.
#
# Aquel dia el hosting agoto su tope de procesos y mato el despliegue en seco
# —la bitacora se corta a media linea, sin error—; el paquete se quedo
# reservado y el servidor no volvio a desplegar hasta que una persona lo
# renombro a mano. Este bloque es esa persona.
RESCATE=0
if [ ! -f "$PAQUETE" ]; then
  # Nada reservado tampoco: no hay despliegue en marcha y no hay nada que hacer.
  [ -f "$EN_CURSO" ] || exit 0

  # Reservado hace poco: hay un despliegue EN CURSO de verdad. No se toca, que
  # es justo lo que el candado impide y aqui se repite por si acaso.
  [ -z "$(find "$EN_CURSO" -maxdepth 0 -mmin -"$MINUTOS_PARA_RESCATE" 2>/dev/null)" ] || exit 0

  RESCATE=1
fi

mkdir -p "$RAIZ/tmp"

registrar() {
  echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] $*" >> "$BITACORA"
}

# DEVOLVER EL PAQUETE PARA QUE EL CRON LO REINTENTE SOLO
#
# El paquete se reserva renombrandolo a `.desplegando` nada mas cogerlo, y eso
# esta bien: si el proceso muere a mitad, el pase siguiente no reintenta sobre
# un archivo a medias. Pero hasta el 21/08/2026 la rama de fallo de migracion
# NO deshacia ese renombrado, y ahi el razonamiento se rompia: el paquete esta
# entero, lo que fallo es la BASE. El cron seguia pasando cada minuto sin ver
# ningun `gcm.tar.gz` que aplicar, asi que el despliegue se quedaba parado
# hasta que una persona entraba al servidor a renombrarlo a mano. Es la
# diferencia entre «se aplica en cuanto la base vuelva» y «no se aplica nunca».
#
# NO se devuelve cuando lo que falla es el PAQUETE —descomprimir, o que no
# traiga server.js—: eso no lo arregla esperar, y reintentarlo cada minuto solo
# llenaria la bitacora del mismo error para siempre.
#
# Y NO se reintenta indefinidamente: cada intento arranca `npx`, `node` y el
# schema-engine de Prisma, y encadenar arranques sin fin es como se agoto el
# `nproc` de LVE el 21/08. Al llegar al tope se deja como `.desplegando` y se
# dice en la bitacora que hay que mirarlo, que es exactamente lo que significa.
devolver_paquete() {
  # Clave del paquete CONCRETO, para no arrastrar la cuenta de un paquete a
  # otro: `mv` conserva tamano y fecha, asi que un reintento del mismo archivo
  # trae la misma clave y una subida nueva trae otra y empieza de cero.
  local clave previa intentos
  clave="$(stat -c '%s-%Y' "$EN_CURSO" 2>/dev/null || echo desconocido)"
  previa="$(cut -d' ' -f1 "$CUENTA_INTENTOS" 2>/dev/null)"
  intentos="$(cut -d' ' -f2 "$CUENTA_INTENTOS" 2>/dev/null)"
  [ "$previa" = "$clave" ] || intentos=0
  case "${intentos:-}" in "" | *[!0-9]*) intentos=0 ;; esac
  intentos=$((intentos + 1))
  printf '%s %s\n' "$clave" "$intentos" > "$CUENTA_INTENTOS"

  if [ "$intentos" -ge "$INTENTOS_MAXIMOS" ]; then
    registrar "ERROR: $intentos intentos fallidos con este paquete; se DEJA de" \
              "reintentar. Resuelta la causa, para retomarlo:" \
              "mv gcm.tar.gz.desplegando gcm.tar.gz"
    return
  fi

  if mv -f "$EN_CURSO" "$PAQUETE"; then
    registrar "El paquete vuelve a ser gcm.tar.gz: el cron lo reintentara dentro" \
              "de un minuto (intento $intentos de $INTENTOS_MAXIMOS)."
  else
    registrar "ERROR: no se pudo devolver el paquete a gcm.tar.gz. Hay que" \
              "renombrarlo a mano: mv gcm.tar.gz.desplegando gcm.tar.gz"
  fi
}

# Candado: mkdir es atomico, o lo gana uno o lo gana otro. Si el dueno murio a
# medias, a los diez minutos cualquiera puede retomarlo; sin esa caducidad un
# candado abandonado bloquearia los despliegues para siempre.
if ! mkdir "$CANDADO" 2>/dev/null; then
  if [ -d "$CANDADO" ] && [ -z "$(find "$CANDADO" -maxdepth 0 -mmin -10 2>/dev/null)" ]; then
    registrar "AVISO: candado caducado, se retoma."
    rm -rf "$CANDADO"
    mkdir "$CANDADO" 2>/dev/null || exit 0
  else
    exit 0
  fi
fi
trap 'rm -rf "$CANDADO"' EXIT

# EL RESCATE, ya con el candado en la mano.
#
# Se limita a devolver el paquete a la cola y salir: NO lo aplica en el mismo
# pase. Si lo que mato al anterior sigue ahi -el tope de procesos del hosting,
# por ejemplo- volver a intentarlo en caliente es exactamente lo que encadena
# arranques y agrava la causa. El cron pasa dentro de un minuto y para entonces
# la maquina ha respirado.
#
# Cuenta como intento, y por eso llama a `devolver_paquete` en vez de hacer el
# `mv` a pelo: un paquete que muere en seco una y otra vez se detiene solo a los
# treinta, en lugar de rescatarse en bucle hasta el fin de los tiempos.
if [ "$RESCATE" = "1" ]; then
  registrar "AVISO: habia un paquete reservado sin tocar desde hace mas de" \
            "$MINUTOS_PARA_RESCATE minutos. El despliegue anterior murio sin poder" \
            "devolverlo (proceso matado, no fallo). Se devuelve a la cola."
  devolver_paquete
  exit 0
fi

# Se deja constancia ANTES de hacer nada, y no solo al terminar.
#
# El 12 de agosto un despliegue se aplico sin que apareciera una sola linea en
# esta bitacora, y eso hizo imposible saber si el script habia corrido, si habia
# muerto a mitad o si el paquete lo habia aplicado otra cosa. Una linea al
# empezar convierte esa pregunta en una respuesta.
registrar "Paquete detectado; se empieza a aplicar."

# Se renombra antes de tocarlo: si el proceso muere ahora, el siguiente pase no
# reintenta sobre un archivo incompleto y el fallo queda visible.
mv -f "$PAQUETE" "$EN_CURSO" || { registrar "ERROR: no se pudo reservar el paquete."; exit 1; }

rm -rf "$NUEVO"
mkdir -p "$NUEVO" || { registrar "ERROR: no se pudo crear $NUEVO."; devolver_paquete; exit 1; }

if ! tar -xzf "$EN_CURSO" -C "$NUEVO" 2>>"$BITACORA"; then
  registrar "ERROR: fallo al descomprimir. El arbol anterior sigue intacto."
  rm -rf "$NUEVO"
  exit 1
fi

# Comprobacion antes de tocar lo que funciona. Un paquete sin server.js o sin
# .next no es un despliegue: es un accidente, y aplicarlo dejaria la obra sin
# sistema.
if [ ! -f "$NUEVO/server.js" ] || [ ! -d "$NUEVO/.next" ]; then
  registrar "ERROR: el paquete no trae server.js o .next. No se aplica."
  rm -rf "$NUEVO"
  exit 1
fi

# LAS MIGRACIONES, ANTES DEL CAMBIO Y NO DESPUES
#
# Hasta ahora no se aplicaban aqui, y por eso cada push con esquema nuevo dejaba
# el codigo nuevo hablando con la base vieja: el panel entero en 500 hasta que
# alguien entraba por SSH a mano. Con una sola constructora era una ventana de
# minutos; con clientes es una caida de todos a la vez, provocada por el propio
# despliegue.
#
# Se aplican con el paquete NUEVO ya desempacado pero TODAVIA NO publicado. Si
# fallan, se aborta y la version que estaba sirviendo sigue en pie, que es la
# misma regla que gobierna el resto del script: media version desplegada es peor
# que una version vieja.
#
# El precio, dicho en voz alta: entre la migracion y el intercambio hay unos
# segundos en que el codigo VIEJO ve el esquema NUEVO. Para una migracion que
# anade (columna, tabla, indice) eso es inocuo. Para una que quita o renombra,
# esos segundos son de error. Es un cambio de minutos de caida segura por
# segundos de riesgo acotado, y se prefiere; una migracion destructiva sigue
# pidiendo el despliegue en dos pasos de siempre.
#
# EL ENTORNO NO SE HEREDA, pero OJO: el `DATABASE_URL` de aqui NO gobierna
# nada. Este cron no es la aplicacion y no trae `npx` en el PATH; eso si lo
# arregla `~/.gcm-despliegue.env`, que solo puede leer su dueno, igual que
# `~/.gcm-avisos.curl` hace con el token del reloj:
#
#   cat > ~/.gcm-despliegue.env <<'FIN'
#   DATABASE_URL="mysql://USUARIO:CLAVE@127.0.0.1:3306/BASE"
#   NODEVENV_ACTIVATE="/home/USUARIO/nodevenv/RUTA_DE_LA_APP/22/bin/activate"
#   FIN
#   chmod 600 ~/.gcm-despliegue.env
#
# LO QUE ESTE BLOQUE DECIA ANTES ERA FALSO Y COSTO HORAS EL 21/08/2026:
# afirmaba que el `DATABASE_URL` de Prisma venia de este archivo. No viene. El
# selector de Node de CloudLinux INYECTA las variables de la aplicacion en TODO
# proceso `node` y PISA las del shell. Se comprueba en dos lineas:
#
#   export DATABASE_URL=MARCADOR
#   node -e 'console.log(process.env.DATABASE_URL)'   # imprime la de cPanel
#
# Asi que esa linea del archivo es DECORATIVA: sirve para que la comprobacion
# de mas abajo no aborte, y para nada mas. Prisma lee SIEMPRE la de
# *cPanel > Setup Node.js App*, que es el unico sitio donde cambiarla. Quien
# intente arreglar un fallo de conexion del despliegue editando este archivo no
# vera efecto ninguno por mucho que lo edite.
#
# `NODEVENV_ACTIVATE` SI sirve: es lo que pone `npx` en el PATH.
#
# Y EN CUALQUIER URL DE BASE, `127.0.0.1` Y NUNCA `localhost`. En este servidor
# `localhost` resuelve SOLO a `::1` —`getent hosts localhost` no devuelve
# 127.0.0.1— y MariaDB no atiende por IPv6, asi que Prisma da
# `P1001: Can't reach database server`. El cliente `mysql` no lo delata, porque
# `-h localhost` se va por el socket Unix y conecta tan ricamente.
#
# SIN ESE ARCHIVO NO SE ABORTA: se despliega igual y se grita en la bitacora.
# Que falte deja las cosas exactamente como estaban antes de este bloque (las
# migraciones se aplican a mano), y eso es preferible a que un servidor sin
# configurar deje de recibir despliegues.
CONFIG_DESPLIEGUE="$HOME/.gcm-despliegue.env"

# LA FIRMA DE LAS MIGRACIONES: para no arrancar Prisma cuando no hay nada que
# migrar, que es la mayoria de los despliegues.
#
# `npx --yes prisma@7 migrate deploy` es, con diferencia, el paso mas caro de
# todo esto: arranca npm, node y el schema-engine, tres procesos que en un
# hosting compartido se pagan del mismo cupo que la aplicacion. El 27/08/2026
# ese arranque murio a medias por agotar el tope de procesos de la cuenta y
# dejo el despliegue parado; el paquete de aquel dia NO traia ni una migracion
# nueva. Se jugo el sitio entero por un trabajo que no habia que hacer.
#
# La firma es la lista de carpetas de `prisma/migrations`. Se guarda al migrar
# con exito y se compara con la del paquete nuevo. Iguales -> no hay nada
# pendiente -> no se arranca Prisma.
#
# POR QUE ASI Y NO PREGUNTANDOLE A LA BASE: preguntar exige el cliente `mysql`,
# parsear la URL y acertar con la clave; cada una de esas tres cosas es otra
# forma de equivocarse, y equivocarse aqui significa saltarse una migracion
# —codigo nuevo contra tablas viejas, que es la caida mas cara que tiene este
# sistema—. Comparar dos listas de directorios no puede fallar.
#
# Y ES CONSERVADOR POR CONSTRUCCION: se salta el paso SOLO si la lista es
# identica a la de la ultima vez que `migrate deploy` termino bien. Sin marca
# previa, migra. Si la lista cambia en cualquier sentido -una mas, una menos,
# un rollback-, migra. Migrar de mas es gratis; migrar de menos, no.
FIRMA_MIGRACIONES="$RAIZ/tmp/migraciones-aplicadas"

firma_del_paquete() {
  # `LC_ALL=C` para que el orden no dependa del idioma del servidor: la misma
  # lista tiene que dar la misma firma aqui y en la maquina de al lado.
  ls -1 "$NUEVO/prisma/migrations" 2>/dev/null | LC_ALL=C sort | md5sum | cut -d' ' -f1
}

FIRMA_NUEVA="$(firma_del_paquete)"
FIRMA_PREVIA="$(cat "$FIRMA_MIGRACIONES" 2>/dev/null || echo "")"

# Una firma vacia significa que no se pudo leer el directorio: no se sabe que
# migraciones trae el paquete, asi que no se decide nada y se migra.
if [ -n "$FIRMA_NUEVA" ] && [ "$FIRMA_NUEVA" = "$FIRMA_PREVIA" ]; then
  registrar "OK: el paquete no trae migraciones nuevas; no se arranca Prisma."
elif [ ! -r "$CONFIG_DESPLIEGUE" ]; then
  registrar "AVISO: falta $CONFIG_DESPLIEGUE. Se aplica el paquete SIN migrar:" \
            "si esta version trae migraciones, hay que correr 'migrate deploy' a mano."
else
  # En subshell: ni el activate del nodevenv ni DATABASE_URL deben sobrevivir al
  # bloque y contaminar lo que viene despues.
  if (
    set -a
    # shellcheck disable=SC1090
    . "$CONFIG_DESPLIEGUE"
    set +a

    [ -n "${DATABASE_URL:-}" ] || { echo "sin DATABASE_URL en el archivo"; exit 1; }

    if [ -n "${NODEVENV_ACTIVATE:-}" ]; then
      # `set +u` ALREDEDOR DEL SOURCE, Y NO ES UN CAPRICHO.
      #
      # El `activate` de CloudLinux es un enlace a
      # /usr/share/l.v.e-manager/utils/activate, y en su linea 78 lee
      # `CL_VIRTUAL_ENV` sin valor por defecto. Con el `set -u` de la cabecera,
      # leer una variable sin definir mata el subshell AHI MISMO: el
      # `migrate deploy` no llegaba a ejecutarse nunca y el despliegue abortaba
      # entero. Fue exactamente lo que paso el 2026-08-15 y dejo todas las
      # paginas de obra en 500 hasta aplicar la migracion a mano.
      #
      # La auditoria del 12/08 no lo cazo porque lo comprobo con
      # `bash -c '. "$NODEVENV_ACTIVATE"; npx prisma migrate status'`, que NO
      # lleva `set -u`. El archivo funcionaba; lo que fallaba era cargarlo bajo
      # nounset.
      #
      # Se apaga solo para el source y se vuelve a encender inmediatamente: el
      # resto del bloque sigue protegido.
      set +u
      # shellcheck disable=SC1090
      . "$NODEVENV_ACTIVATE" || { set -u; echo "no se pudo activar $NODEVENV_ACTIVATE"; exit 1; }
      set -u
    fi

    command -v npx >/dev/null 2>&1 || { echo "npx no esta en el PATH"; exit 1; }

    # Desde el paquete NUEVO: alli estan prisma/migrations y prisma.config.js.
    # Correrlo desde la raiz usaria el esquema de la version que aun sirve.
    cd "$NUEVO" || { echo "no se pudo entrar en el paquete"; exit 1; }
    npx --yes prisma@7 migrate deploy 2>&1
  ) >> "$BITACORA" 2>&1; then
    registrar "OK: migraciones al dia."
    # Se anota DESPUES del exito y nunca antes: la firma significa «estas
    # migraciones ya estan aplicadas», y escribirla sin haberlo comprobado
    # convertiria el atajo de arriba en una forma de saltarse una migracion.
    [ -n "$FIRMA_NUEVA" ] && printf '%s\n' "$FIRMA_NUEVA" > "$FIRMA_MIGRACIONES"
  else
    registrar "ERROR: 'migrate deploy' fallo. NO se aplica el paquete;" \
              "la version anterior sigue sirviendo. Detalle justo arriba."
    rm -rf "$NUEVO"
    # El paquete esta entero: lo que fallo es la base. Vuelve a su nombre para
    # que el cron lo aplique solo en cuanto la causa se resuelva.
    devolver_paquete
    exit 1
  fi
fi

# El cambio. Solo se sustituye lo que VIENE en el paquete: app.js, desplegar.sh,
# tmp/, stderr.log y cualquier configuracion del servidor se quedan donde estan.
rm -rf "$VIEJO"
mkdir -p "$VIEJO"

cambiadas=0
for origen in "$NUEVO"/* "$NUEVO"/.[!.]*; do
  [ -e "$origen" ] || continue
  nombre="$(basename "$origen")"
  if [ -e "$RAIZ/$nombre" ]; then
    mv -f "$RAIZ/$nombre" "$VIEJO/$nombre" || { registrar "ERROR: no se pudo apartar $nombre."; exit 1; }
  fi
  mv -f "$origen" "$RAIZ/$nombre" || { registrar "ERROR: no se pudo colocar $nombre."; exit 1; }
  cambiadas=$((cambiadas + 1))
done

rmdir "$NUEVO" 2>/dev/null
rm -f "$EN_CURSO"
rm -f "$CUENTA_INTENTOS"

# El reinicio, al final y solo si todo salio bien.
date -u +%Y-%m-%dT%H:%M:%SZ > "$RAIZ/tmp/restart.txt"

# QUE version quedo viva, no solo cuantas entradas se movieron.
#
# El 15 de agosto hubo que reconstruir a mano que codigo estaba corriendo
# porque la bitacora decia «aplicado (24 entradas)» y nada mas: 24 entradas son
# 24 entradas en cualquier despliegue. Con el SHA, una linea del log responde
# la pregunta que se hace siempre —«¿esto ya lleva mi cambio?»— sin cruzarla
# con /api/health ni con fechas de archivos.
SHA_APLICADO="$(cat "$RAIZ/BUILD_SHA" 2>/dev/null || echo "sin BUILD_SHA")"
registrar "OK: aplicado ($cambiadas entradas), version $SHA_APLICADO. Reinicio pedido."

# El arbol viejo se borra despues de pedir el reinicio: son cientos de megas y
# no hay razon para que la obra espere a que termine.
rm -rf "$VIEJO" >/dev/null 2>&1 &

exit 0
