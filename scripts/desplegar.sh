#!/usr/bin/env bash
# Actualiza CoordinaOT en el servidor sin dejar la web caída mientras compila.
#
#   cd /webs/coordina-ot && bash scripts/desplegar.sh
#
# Antes se compilaba encima de .next, la carpeta desde la que sirve la web, y
# la web estaba rota todo el build. Ahora hay dos carpetas, .next-a y .next-b:
# se compila en la que está libre con la web en pie, y solo al final se apunta
# .next-activa a la nueva y se reinicia (unos segundos). Si el build falla, no
# se toca nada y sigue la versión de antes.
#
# Volver a la versión anterior (sigue compilada en la otra carpeta):
#   echo .next-a > .next-activa && pm2 restart coordina-ot   (o .next-b)
# Todo va entre llaves: bash lee el bloque entero antes de empezar. Sin ellas lee el fichero
# a medida que avanza, y el git pull de abajo lo cambia a mitad de camino (25/11/2026).
{
set -euo pipefail
cd "$(dirname "$0")/.."

APP=coordina-ot
PUERTO=4300
t0=$SECONDS
# Colores solo si la salida es una pantalla (no en logs ni tuberías): pasos en cian,
# el final bueno en verde y los errores en rojo, para encontrarlos entre la salida del build.
if [ -t 1 ]; then c_paso=$'\e[1;36m'; c_ok=$'\e[1;32m'; c_mal=$'\e[1;31m'; c_fin=$'\e[0m'
else c_paso=; c_ok=; c_mal=; c_fin=; fi
paso() { echo; echo "${c_paso}── $1  ($((SECONDS - t0)) s)${c_fin}"; }
ok() { echo; echo "${c_ok}── $1  ($((SECONDS - t0)) s)${c_fin}"; }
mal() { echo "${c_mal}!! $1${c_fin}"; }

activa=$(cat .next-activa 2>/dev/null || echo .next)
if [ "$activa" = ".next-a" ]; then nueva=.next-b; else nueva=.next-a; fi

paso "git pull"
lock_antes=$(git rev-parse HEAD:pnpm-lock.yaml)
git pull --ff-only

# pnpm install cambia node_modules debajo de la web en marcha: solo si hace falta.
if [ "$(git rev-parse HEAD:pnpm-lock.yaml)" != "$lock_antes" ]; then
  paso "pnpm install (cambiaron las dependencias)"
  pnpm install --frozen-lockfile
fi

paso "build en $nueva (la web sigue sirviendo desde $activa)"
# Los tipos que generó el build anterior no los usa la web, y si una ruta se
# borró harían fallar la comprobación de TypeScript del build nuevo.
rm -rf "$activa/types" "$nueva/types"
NEXT_DIST_DIR=$nueva pnpm build

paso "cambio a $nueva y reinicio"
echo "$nueva" > .next-activa
# La tabla de PM2 solo tapa los pasos; si falla, el error sigue saliendo.
pm2 restart "$APP" > /dev/null

for _ in $(seq 1 60); do
  if curl -fsS -m 2 "http://localhost:$PUERTO/api/health" >/dev/null 2>&1; then
    ok "listo: la web responde con $nueva"
    exit 0
  fi
  sleep 1
done

echo
mal "La web no responde tras 60 s. Mira: pm2 logs $APP --lines 50"
mal "Para volver a la versión anterior: echo $activa > .next-activa && pm2 restart $APP"
exit 1
}
exit
