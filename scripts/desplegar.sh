#!/bin/bash
#
# Aplica en el servidor el paquete que sube el despliegue.
#
# Lo llama un CRON cada minuto:
#   cd /home/drcacere/gcm && bash desplegar.sh
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
