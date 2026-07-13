# CoordinaOT — Manual para IT

Aplicación web interna de Oficina Técnica (toldosgomez): tablero de trabajo
sobre los pedidos/OF pendientes que ya existen en RPS. **No modifica RPS en
nada**: lee sus datos y guarda el flujo propio (quién plantea, quién revisa,
estados) en una base de datos SQLite aparte.

Contacto de desarrollo: Iván Sánchez (Oficina Técnica).

---

## 1. Arquitectura en una pantalla

```
Navegadores OT (6 usuarios)
        │  HTTP :3100
        ▼
┌─────────────────────────────────┐
│  Servidor Linux + PM2           │
│  app Next.js "coordina-ot"      │
│  ├── SQLite (data/coordina.db)  │ ← flujo de OT (propio, NO es RPS)
│  └── caché en memoria (60 s)    │
└──────┬──────────────────┬───────┘
       │ solo LECTURA     │ solo LECTURA (CIFS)
       ▼                  ▼
 SQL Server RPS      \\192.168.0.128\RPS\VENTAS\PEDIDOS
 192.168.0.124:1433  (PDF escaneados de pedidos)
 (RPSNext, usuario "lectura")
```

- Lecturas de RPS: vista `RPSNext.dbo.TGM_PENDIENTE_OT` + tablas de fichajes
  y maestros, siempre con el usuario `lectura`.
- La app cachea la vista en memoria y la refresca en segundo plano: RPS
  recibe como mucho una consulta pesada por minuto con uso activo, o una
  cada 5 minutos en reposo.

## 2. Qué necesita IT montar (una vez)

### 2.1 Máquina

- VM Linux pequeña (2 vCPU / 2 GB RAM / 10 GB disco sobra).
- Node.js ≥ 22 y pnpm ≥ 11 (`corepack enable`), PM2 global (`npm i -g pm2`).
- Acceso de red a `192.168.0.124:1433` y al share de `192.168.0.128`.

### 2.2 Share de PDFs

- Cuenta de servicio con **solo lectura** sobre `\\192.168.0.128\RPS\VENTAS\PEDIDOS`.
- Montaje CIFS persistente, p. ej. en `/mnt/rps-pedidos` (fstab con
  `credentials=`). La ruta se pone en `.env.local` (`RPS_PEDIDOS_PDF_DIR`).

### 2.3 Despliegue (todo ya configurado en el repo)

```bash
git clone <repo> /opt/coordina-ot && cd /opt/coordina-ot
cp .env.example .env.local     # rellenar credenciales (sección 5)
pnpm install && pnpm build
pm2 start ecosystem.config.cjs
pm2 save && pm2 startup
```

Queda en `http://<host>:3100`. Opcional: reverse proxy (nginx/caddy) para
darle nombre DNS interno (`coordina.<dominio>`).

**Importante**: el `ecosystem.config.cjs` fija **1 sola instancia** (modo
fork). No pasarlo a cluster: la caché de la vista pesada vive en memoria del
proceso y en cluster se multiplicarían las consultas contra RPS.

### 2.4 Base de datos propia (SQLite — nada que instalar)

- Fichero único: `data/coordina.db` dentro del directorio de la app
  (configurable con `COORDINA_DB_PATH`).
- Guarda SOLO el flujo de OT: asignaciones OF→técnico, revisor, estado del
  ciclo (planteando/por revisar/en revisión/aprobada…), pedidos completados
  y un log de acciones. Nada de esto existe en RPS.
- **Backup**: copiar el fichero. Cron sugerido (diario a un share):

```bash
# /etc/cron.d/coordina-backup  (a las 21:00, guarda 30 días)
0 21 * * * root sqlite3 /opt/coordina-ot/data/coordina.db ".backup /mnt/backups/coordina-$(date +\%F).db" && find /mnt/backups -name 'coordina-*.db' -mtime +30 -delete
```

(`sqlite3` CLI: `apt install sqlite3`. `.backup` es consistente aunque la
app esté escribiendo.)

## 3. Mejora de rendimiento pedida (solo añade objetos, no toca RPS)

La vista `TGM_PENDIENTE_OT` tarda 7-15 s. La app ya lo esconde con caché,
pero cada refresco sigue costándole ese trabajo al servidor de RPS.

**Petición**: ejecutar [`scripts/it/snapshot_tgm_pendiente_ot.sql`](scripts/it/snapshot_tgm_pendiente_ot.sql)
en RPSNext y programar el job del SQL Agent que trae comentado (refresco
cada 5 min en horario laboral). Crea una tabla espejo + procedimiento;
cuando esté, avisad y la app pasa a leer la tabla (la consulta pesada
desaparece del camino).

## 4. Peticiones pendientes para fases futuras

| Qué | Para qué | Estado |
|---|---|---|
| Usuario SQL de **escritura** acotado (o procedimiento) sobre `tgm_estadosof` / `fichajes_olanet` en RPSNext y `SCH_RPS_BONOs` / `SCG_FASES` en `stinkor\sqlexpress:54325` | Volcar los fichajes de tiempo de OT a RPS (hoy solo se miden en la app) | Por definir con David (spec de fichaje) |
| Acceso de red del servidor de la app a `stinkor\sqlexpress:54325` | Lo mismo | Junto con lo anterior |
| Aviso de altas/bajas en Oficina Técnica | El mapa empleado RPS ↔ técnico del tablero es configuración de la app | Continuo |

## 5. `.env.local` (credenciales — no está en el repo)

```ini
DATASOURCE=rps
RPS_DB_HOST=192.168.0.124
RPS_DB_PORT=1433
RPS_DB_DATABASE=RPSNext
RPS_DB_USER=lectura
RPS_DB_PASSWORD=***
# SQL Server 2014: su TLS no negocia con Node moderno → sin cifrado en LAN.
# Si se actualiza el servidor SQL, avisar para activar RPS_DB_ENCRYPT=true.
RPS_DB_ENCRYPT=false
RPS_DB_TRUST_SERVER_CERTIFICATE=true
RPS_DB_REQUEST_TIMEOUT=60000
RPS_PEDIDOS_PDF_DIR=/mnt/rps-pedidos
# Opcional: ruta del SQLite (por defecto ./data/coordina.db)
# COORDINA_DB_PATH=/opt/coordina-ot/data/coordina.db
```

## 6. Operación diaria

| Acción | Comando |
|---|---|
| Estado / logs | `pm2 status` · `pm2 logs coordina-ot` |
| Healthcheck | `curl http://localhost:3100/api/health` |
| Reiniciar | `pm2 restart coordina-ot` |
| Actualizar versión | `cd /opt/coordina-ot && git pull && pnpm install && pnpm build && pm2 restart coordina-ot` |

Comportamiento ante fallos, ya contemplado en la app:

- **RPS caído / VPN caída**: la app sigue sirviendo el último dato bueno de
  la caché; si arranca en frío sin RPS, la página da error 500 hasta que
  vuelva (reintenta sola).
- **SQLite ilegible**: el tablero se sirve sin el flujo guardado (se ve el
  trabajo de RPS igual) y se anota aviso en el log de PM2.
- **Caída del proceso**: PM2 lo reinicia solo (`autorestart`).

## 7. Qué NO hace esta app (por diseño)

- No escribe absolutamente nada en RPS ni en el share de PDFs.
- No expone nada fuera de la LAN (sin auth de momento: confiar en red interna;
  si se quiere publicar más allá de OT, hablar antes con desarrollo).
- No sustituye al terminal de fichaje de taller: los tiempos de OT se
  volcarán a RPS en una fase futura (sección 4).
