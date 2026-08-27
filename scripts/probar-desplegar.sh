#!/usr/bin/env bash
# Banco de pruebas de scripts/desplegar.sh, contra un servidor de mentira.
#
# Cada caso monta una raiz limpia, deja el paquete como corresponda, corre el
# script de verdad y comprueba lo que quedo. Sin base de datos y sin npx: los
# casos que llegarian a Prisma se quedan en el aviso de «falta la config», que
# es el camino que el propio script documenta.

set -uo pipefail

ORIGEN="$1"
BANCO="$(mktemp -d)"
FALLOS=0

montar() {
  RAIZ="$BANCO/$1"
  rm -rf "$RAIZ"
  mkdir -p "$RAIZ/tmp" "$RAIZ/prisma/migrations"
  cp "$ORIGEN" "$RAIZ/desplegar.sh"

  # Un paquete valido: server.js, .next y unas migraciones.
  local caja="$BANCO/caja-$1"
  rm -rf "$caja"
  mkdir -p "$caja/prisma/migrations/20260101_una" "$caja/prisma/migrations/20260202_otra" "$caja/.next"
  echo "servidor" > "$caja/server.js"
  echo "sha-de-prueba" > "$caja/BUILD_SHA"
  ( cd "$caja" && tar -czf "$RAIZ/gcm.tar.gz" . )
}

correr() { HOME="$BANCO/hogar-sin-config" bash "$RAIZ/desplegar.sh"; }
bitacora() { cat "$RAIZ/tmp/despliegue.log" 2>/dev/null; }

comprobar() {
  if [ "$2" = "$3" ]; then
    echo "  ok   $1"
  else
    echo "  FALLA $1"
    echo "       esperaba: $3"
    echo "       obtuvo:   $2"
    FALLOS=$((FALLOS + 1))
  fi
}

contiene() {
  if bitacora | grep -q "$2"; then
    echo "  ok   $1"
  else
    echo "  FALLA $1 (la bitacora no dice «$2»)"
    echo "       bitacora: $(bitacora | tail -3)"
    FALLOS=$((FALLOS + 1))
  fi
}

echo "== 1. Sin paquete no hace nada"
montar caso1
rm -f "$RAIZ/gcm.tar.gz"
correr
comprobar "no escribe bitacora" "$(bitacora | wc -l)" "0"

echo "== 2. Un paquete reservado hace un momento NO se rescata"
montar caso2
mv "$RAIZ/gcm.tar.gz" "$RAIZ/gcm.tar.gz.desplegando"
correr
comprobar "sigue reservado" "$(ls "$RAIZ" | grep -c 'desplegando')" "1"
comprobar "y no dice nada" "$(bitacora | wc -l)" "0"

echo "== 3. Un paquete reservado y olvidado SI se rescata"
montar caso3
mv "$RAIZ/gcm.tar.gz" "$RAIZ/gcm.tar.gz.desplegando"
touch -d "40 minutes ago" "$RAIZ/gcm.tar.gz.desplegando"
correr
comprobar "vuelve a la cola" "$([ -f "$RAIZ/gcm.tar.gz" ] && echo si || echo no)" "si"
contiene "lo explica en la bitacora" "sin tocar desde hace mas de"
comprobar "cuenta como intento" "$(cut -d' ' -f2 "$RAIZ/tmp/intentos-migracion")" "1"

echo "== 4. Primer despliegue: sin firma previa, no se salta Prisma"
montar caso4
correr
contiene "avisa de que falta la config y no salta el paso" "falta"
comprobar "el paquete se aplico" "$([ -f "$RAIZ/server.js" ] && echo si || echo no)" "si"
comprobar "y pidio reinicio" "$([ -f "$RAIZ/tmp/restart.txt" ] && echo si || echo no)" "si"

echo "== 5. Con la firma ya anotada, NO se arranca Prisma"
montar caso5
# Firma de las mismas dos migraciones que trae el paquete.
printf '%s\n' "$(printf '20260101_una\n20260202_otra\n' | LC_ALL=C sort | md5sum | cut -d' ' -f1)" \
  > "$RAIZ/tmp/migraciones-aplicadas"
correr
contiene "lo dice" "no trae migraciones nuevas"
comprobar "el paquete se aplico igual" "$([ -f "$RAIZ/server.js" ] && echo si || echo no)" "si"

echo "== 6. Si la lista de migraciones cambia, se migra"
montar caso6
printf 'firma-de-otro-paquete\n' > "$RAIZ/tmp/migraciones-aplicadas"
correr
comprobar "NO se salta el paso" "$(bitacora | grep -c 'no trae migraciones nuevas')" "0"

echo
if [ "$FALLOS" = "0" ]; then
  echo "TODO OK"
else
  echo "$FALLOS COMPROBACIONES FALLIDAS"
fi
rm -rf "$BANCO"
exit "$FALLOS"
