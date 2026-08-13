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

# Sin paquete no hay nada que hacer. Es el caso normal: el cron corre cada
# minuto y despliegues hay pocos.
[ -f "$PAQUETE" ] || exit 0

mkdir -p "$RAIZ/tmp"

registrar() {
  echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] $*" >> "$BITACORA"
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
mkdir -p "$NUEVO" || { registrar "ERROR: no se pudo crear $NUEVO."; exit 1; }

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
# EL ENTORNO NO SE HEREDA. Este cron no es la aplicacion: no tiene DATABASE_URL
# —que vive en la configuracion Node de cPanel— ni `npx` en el PATH. Ambos
# vienen de `~/.gcm-despliegue.env`, que solo puede leer su dueno, igual que
# `~/.gcm-avisos.curl` hace con el token del reloj:
#
#   cat > ~/.gcm-despliegue.env <<'FIN'
#   DATABASE_URL="mysql://USUARIO:CLAVE@localhost:3306/BASE"
#   NODEVENV_ACTIVATE="/home/USUARIO/nodevenv/RUTA_DE_LA_APP/22/bin/activate"
#   FIN
#   chmod 600 ~/.gcm-despliegue.env
#
# SIN ESE ARCHIVO NO SE ABORTA: se despliega igual y se grita en la bitacora.
# Que falte deja las cosas exactamente como estaban antes de este bloque (las
# migraciones se aplican a mano), y eso es preferible a que un servidor sin
# configurar deje de recibir despliegues.
CONFIG_DESPLIEGUE="$HOME/.gcm-despliegue.env"

if [ ! -r "$CONFIG_DESPLIEGUE" ]; then
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
      # shellcheck disable=SC1090
      . "$NODEVENV_ACTIVATE" || { echo "no se pudo activar $NODEVENV_ACTIVATE"; exit 1; }
    fi

    command -v npx >/dev/null 2>&1 || { echo "npx no esta en el PATH"; exit 1; }

    # Desde el paquete NUEVO: alli estan prisma/migrations y prisma.config.js.
    # Correrlo desde la raiz usaria el esquema de la version que aun sirve.
    cd "$NUEVO" || { echo "no se pudo entrar en el paquete"; exit 1; }
    npx --yes prisma@7 migrate deploy 2>&1
  ) >> "$BITACORA" 2>&1; then
    registrar "OK: migraciones al dia."
  else
    registrar "ERROR: 'migrate deploy' fallo. NO se aplica el paquete;" \
              "la version anterior sigue sirviendo. Detalle justo arriba."
    rm -rf "$NUEVO"
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

# El reinicio, al final y solo si todo salio bien.
date -u +%Y-%m-%dT%H:%M:%SZ > "$RAIZ/tmp/restart.txt"
registrar "OK: aplicado ($cambiadas entradas). Reinicio pedido."

# El arbol viejo se borra despues de pedir el reinicio: son cientos de megas y
# no hay razon para que la obra espere a que termine.
rm -rf "$VIEJO" >/dev/null 2>&1 &

exit 0
