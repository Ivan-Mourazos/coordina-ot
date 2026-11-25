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
set -euo pipefail
cd "$(dirname "$0")/.."

APP=coordina-ot
PUERTO=4300
t0=$SECONDS
paso() { echo; echo "── $1  ($((SECONDS - t0)) s)"; }

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
pm2 restart "$APP"

for _ in $(seq 1 60); do
  if curl -fsS -m 2 "http://localhost:$PUERTO/api/health" >/dev/null 2>&1; then
    paso "listo: la web responde con $nueva"
    exit 0
  fi
  sleep 1
done

echo
echo "!! La web no responde tras 60 s. Mira: pm2 logs $APP --lines 50"
echo "!! Para volver a la versión anterior: echo $activa > .next-activa && pm2 restart $APP"
exit 1
