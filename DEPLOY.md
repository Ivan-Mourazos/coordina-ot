# Despliegue de CoordinaOT (Linux + PM2)

> Guía rápida. El contexto completo para IT (arquitectura, BD propia,
> backups, peticiones pendientes) está en [MANUAL-IT.md](MANUAL-IT.md).

## Requisitos de la máquina

- Node.js ≥ 22 y pnpm ≥ 11 (`corepack enable` los activa)
- PM2 instalado global (`npm i -g pm2`)
- Acceso de red a:
  - `192.168.0.124:1433` — SQL Server de RPS (RPSNext)
  - `\\192.168.0.128\RPS\VENTAS\PEDIDOS` — share con los PDF de pedidos
    (montar por CIFS, p. ej. en `/mnt/rps-pedidos`, con cuenta de servicio
    de solo lectura; ajustar `RPS_PEDIDOS_PDF_DIR` a esa ruta)

## Pasos

```bash
git clone <repo> /opt/coordina-ot && cd /opt/coordina-ot
cp .env.example .env.local        # rellenar credenciales (ver abajo)
pnpm install
pnpm build
pm2 start ecosystem.config.cjs
pm2 save && pm2 startup           # arranque con el sistema
```

La app queda en `http://<host>:3100`. Si se quiere nombre bonito
(`coordina.<dominio>`) basta un reverse proxy (nginx/caddy) delante.

## .env.local mínimo

```ini
DATASOURCE=rps
RPS_DB_HOST=192.168.0.124
RPS_DB_PORT=1433
RPS_DB_DATABASE=RPSNext
RPS_DB_USER=lectura
RPS_DB_PASSWORD=***
# SQL Server 2014: TLS viejo no negocia con Node moderno → sin cifrado en LAN
RPS_DB_ENCRYPT=false
RPS_DB_TRUST_SERVER_CERTIFICATE=true
RPS_DB_REQUEST_TIMEOUT=60000
# Ruta del share de PDFs tal y como quede montado en ESTA máquina
RPS_PEDIDOS_PDF_DIR=/mnt/rps-pedidos
```

## Actualizar versión

```bash
cd /opt/coordina-ot && git pull && pnpm install && pnpm build
pm2 restart coordina-ot
```

## Notas para IT

- **Una sola instancia** (ya lo fija el ecosystem): la app cachea en memoria
  la vista pesada `TGM_PENDIENTE_OT`; en cluster se multiplicarían las
  consultas de 7-15 s contra RPS.
- Logs en `logs/` del propio directorio (`pm2 logs coordina-ot`).
- Healthcheck: `GET /api/health`.
- **`data/coordina.db` es la BD de la app (SQLite)**: guarda el flujo de OT.
  Hay que hacerle backup (cron sugerido en MANUAL-IT.md §2.4) y conservarla
  entre despliegues (vive fuera de git).
