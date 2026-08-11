#!/bin/bash
#
# Despierta el reloj de los avisos de GCM.
#
# Lo llama un CRON cada cinco minutos, desde cPanel -> Trabajos cron:
#   bash ~/RUTA_DE_LA_APP/avisos.sh
#
# Como el del despliegue, la ruta real no se escribe aqui: este repositorio es
# publico y el nombre de la cuenta se deduce de ella.
#
# POR QUE EL TOKEN NO VA EN LA LINEA DEL CRON
#
# Porque esa linea no es privada. cPanel la muestra en pantalla a cualquiera
# que entre al panel, la guarda en el crontab del usuario, y mientras el
# trabajo corre `ps` la ensena entera a cualquiera con shell en la maquina.
# Un secreto en un argumento de linea de comandos es un secreto publicado.
#
# Va en `~/.gcm-avisos.curl`, que solo puede leer su dueno:
#
#   printf 'header = "Authorization: Bearer %s"\n' 'EL_TOKEN' > ~/.gcm-avisos.curl
#   chmod 600 ~/.gcm-avisos.curl
#
# Y el mismo valor en la variable AVISOS_CRON_TOKEN de la aplicacion. Si no
# coinciden, la ruta responde 401 y aqui se ve en el log.
#
# POR QUE NO VA EN LA URL
#
# Los servidores escriben las URL completas en su log de accesos. Un token ahi
# queda en claro para siempre, y esos logs se rotan, se copian y se comparten
# con soporte. Va en una cabecera, igual que en la cola de SMS.
#
# POR QUE NO CUELGA DEL LATIDO DEL TELEFONO EMISOR
#
# La purga de la cola de SMS si cuelga de ahi, y se acepto a sabiendas: es
# limpieza, y que se retrase no rompe nada. Un recordatorio si. El dia que el
# movil de la empresa se queda sin bateria es justo el dia que nadie recibiria
# el aviso de que algo lleva una semana sin resolverse.

set -u

RAIZ="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REGISTRO="$RAIZ/tmp/avisos.log"
CONFIG="$HOME/.gcm-avisos.curl"

mkdir -p "$RAIZ/tmp"

anotar() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" >> "$REGISTRO"
}

if [ ! -r "$CONFIG" ]; then
  anotar "ERROR: falta $CONFIG (ver la cabecera de este script)"
  exit 1
fi

# La URL se puede pasar por variable de entorno para poder probar contra otro
# entorno sin tocar el script.
DESTINO="${GCM_URL:-https://gcm.drcaceresruiz.com}/api/reloj"

# -m 60: mas que el presupuesto de una pasada (20 s) con holgura, pero acotado.
# Un curl sin limite que se queda colgado deja el cron encadenando procesos.
# --config: aqui es donde entra la cabecera con el token, sin pasar por
# argumentos ni por la URL.
RESPUESTA="$(curl -sS -m 60 -X POST --config "$CONFIG" \
  -w '\n%{http_code}' "$DESTINO" 2>&1)"

CODIGO="$(echo "$RESPUESTA" | tail -n 1)"
CUERPO="$(echo "$RESPUESTA" | sed '$d')"

# El silencio solo cuando todo va bien Y no hubo nada que hacer: un log que
# crece cada cinco minutos no lo lee nadie, y un log vacio no dice nada cuando
# hace falta.
case "$CODIGO" in
  200)
    if echo "$CUERPO" | grep -q '"avisosApp":0,"correos":0'; then
      exit 0
    fi
    anotar "$CUERPO"
    ;;
  401)
    anotar "ERROR 401: el token no coincide con AVISOS_CRON_TOKEN"
    ;;
  *)
    anotar "ERROR $CODIGO: $CUERPO"
    ;;
esac

# Que no crezca sin fin: nos quedamos con las ultimas 500 lineas.
if [ -f "$REGISTRO" ] && [ "$(wc -l < "$REGISTRO")" -gt 500 ]; then
  tail -n 500 "$REGISTRO" > "$REGISTRO.tmp" && mv "$REGISTRO.tmp" "$REGISTRO"
fi

exit 0
