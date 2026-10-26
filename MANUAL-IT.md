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
        │  HTTP :4300
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
git clone <repo> /webs/coordina-ot && cd /webs/coordina-ot
cp .env.example .env.local     # rellenar credenciales (sección 5)
pnpm install && pnpm build
pm2 start ecosystem.config.cjs
pm2 save && pm2 startup
```

Queda en `http://<host>:4300`. Opcional: reverse proxy (nginx/caddy) para
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
- **Backup**: `pnpm backup`. Diario, al NAS de copias de IT.

  Es la base PROPIA de Coordina (este SQLite), no las de RPS ni OLANET: esas
  ya las protege Veeam, esta no. Hasta el 26/10/2026 la copia de fuera iba al
  share de Oficina Técnica del 192.168.4.113; ese equipo dejó de usarse y
  David indicó el NAS: `\\192.168.0.248\backups_bd\Coordina`.

```bash
# 1. Montar el NAS (una vez). Usuario con escritura en backups_bd\Coordina,
#    en un fichero que solo lee root:
apt-get install -y cifs-utils
mkdir -p /mnt/backups-bd
cat > /root/.cred-backups-bd <<'EOF2'
username=<usuario>
password=<contraseña>
domain=<dominio, si lo lleva>
EOF2
chmod 600 /root/.cred-backups-bd
# /etc/fstab
//192.168.0.248/backups_bd/Coordina  /mnt/backups-bd  cifs  credentials=/root/.cred-backups-bd,uid=0,gid=0,file_mode=0600,dir_mode=0700,_netdev,nofail  0  0
mount /mnt/backups-bd && mountpoint /mnt/backups-bd

# 2. Node vive bajo nvm (/root/.nvm/versions/node/vXX/bin/node) y cron no
#    hereda el PATH: sin esto, la línea de abajo no encuentra `node` y la copia
#    no se hace, en silencio. El enlace deja un único sitio que tocar el día
#    que se actualice Node.
ln -sf "$(which node)" /usr/local/bin/node

# 3. /etc/cron.d/coordina-backup  (a las 21:00, guarda 30 días). Sustituye a
#    la línea vieja que apuntaba a /mnt/oftecnica.
0 21 * * * root cd /webs/coordina-ot && /usr/local/bin/node scripts/backup-db.mjs $(mountpoint -q /mnt/backups-bd && echo /mnt/backups-bd) >> logs/backup.log 2>&1
```

La copia va a DOS sitios: `data/backups/` (local, para recuperar rápido) y el
NAS (para cuando el problema sea el disco de esta máquina). El
`$(mountpoint …)` de la línea de cron está a propósito: si el NAS no está
montado, `/mnt/backups-bd` es una carpeta normal del disco y la "copia de
fuera" acabaría ahí sin avisar. Así, sin NAS, solo se hace la local, y en
`logs/backup.log` falta la línea `Fuera:`; con NAS salen las dos.

**NO se copia con `cp`.** La base va en modo WAL: lo escrito últimamente vive
en `coordina.db-wal` hasta que SQLite lo integra, y ese fichero llega a ser
más grande que la propia base (el 04/09/2026, en el servidor: 2,5 MB de `.db`
y 4,0 MB de `-wal`). Un `cp coordina.db` se deja fuera esa mitad y da una
copia que parece buena hasta el día que hace falta. `scripts/backup-db.mjs`
usa la copia en caliente de SQLite, que se lleva el WAL, sale consistente con
la app escribiendo, comprueba que la copia abre y rota las de más de 30 días.

No hace falta el CLI `sqlite3` (el servidor no lo tiene): el script usa
`better-sqlite3`, que ya es dependencia de la app.

> Esto estuvo MAL desde el principio y conviene saberlo: el cron de aquí
> apuntaba a `/opt/coordina-ot`, que en esa máquina no existe. Nadie lo montó,
> así que hasta el 04/09/2026 esta base no tuvo ninguna copia. Es la única
> fuente de autores, revisores, notas, causas y fichajes: no está en RPS.

### 2.5 Migraciones del esquema (se aplican solas al arrancar)

La app pone al día su propio SQLite al arrancar. **No hay comando que
lanzar**: ocurre en el primer acceso a la base después de reiniciar.

Cada migración va en una transacción y sella `PRAGMA user_version` al
terminar. Ese número es la comprobación de que entró **completa**:

```bash
sqlite3 /webs/coordina-ot/data/coordina.db "PRAGMA user_version;"
```

| Valor | Qué significa |
|---|---|
| `2` | Al día. Es lo que tiene que salir hoy. |
| menos de `2` tras reiniciar | Algo falló. Mirar `pm2 logs coordina-ot` y avisar. |

**Por qué importa el sello.** Estas migraciones no solo añaden una columna:
la RELLENAN con datos deducidos del histórico. Son dos pasos, y si el
segundo falla la base queda a medias **en silencio** — con la columna puesta
y vacía, y sin nada que lo delate por pantalla. Ya pasó una vez en
desarrollo. Por eso el sello se pone al final: mientras no esté, el arranque
siguiente vuelve a intentarlo solo.

**Antes de una actualización que traiga migración**, copia de seguridad del
momento (no vale `cp` con la app escribiendo):

```bash
cd /webs/coordina-ot
sqlite3 data/coordina.db ".backup /mnt/backups/coordina-antes-$(date +%F).db"
```

**Marcha atrás**: volver al commit anterior y reconstruir. Las columnas se
quedan y no estorban — el código viejo nombra las suyas una a una y las
ignora—, así que no hay que tocar la base.

#### Comprobación del despliegue del 2026-08-31 (versión con `revisada`)

Esta actualización trae las dos migraciones de golpe. Después de reiniciar:

```bash
# 1. Entró completa
sqlite3 data/coordina.db "PRAGMA user_version;"   # -> 2

# 2. El histórico no se ha vuelto "sin revisión"
sqlite3 data/coordina.db \
  "SELECT estado, revisada, COUNT(*) FROM of_overlay GROUP BY 1,2 ORDER BY 1;"

# 3. Quién pasó cada pedido (esta migración llevaba tiempo y pudo quedar a medias)
sqlite3 data/coordina.db \
  "SELECT COUNT(*) total, COUNT(pasado_por) con_autor FROM pedido_overlay WHERE completado=1;"
```

Qué tiene que salir:

- **(2)** las `aprobada` y `devuelta`, casi todas con `revisada = 1`. Las
  `por_revisar` a `0` es correcto: tener revisor nombrado no es haber sido
  revisada. Muchas `aprobada` a `0` **sí** es mala señal.
- **(3)** `con_autor` cerca de `total`. Si queda muy por debajo, es que esos
  pedidos no dejaron rastro en el registro y no hay de dónde sacar el nombre;
  no se puede arreglar, pero conviene saberlo.

Y a ojo, en la app: una OF aprobada de hace días tiene que decir
**"Aprobada"** a secas. Si dice "Aprobada sin revisión" en OF que sí se
revisaron, el relleno falló.

Hacerlo **por la mañana de un día de trabajo**, no al irse: si algo va mal
conviene tener gente delante para verlo.

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
| ~~Usuario SQL de escritura sobre las tablas del fichaje en OLANET~~ | Volcar los fichajes de tiempo de OT a RPS | Hecho: usuario `coordina` en `OLANET_TGM_DATOS` |
| ~~Acceso de red del servidor de la app a OLANET~~ | Lo mismo | Hecho. Desde el 26/10/2026 es `192.168.0.124:1433` (ver sección 5) |
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

# Fichaje → OLANET. Desde el 26/10/2026, el servidor principal (misma máquina
# que RPS, otra BD). Antes era 192.168.4.113 puerto 54325 (SQLExpress), que se
# cayó ese día. Sin OLANET_DB_INSTANCE: el .124 no tiene instancia con nombre.
FICHAJE_OLANET=activo
OLANET_DB_HOST=192.168.0.124
OLANET_DB_PORT=1433
OLANET_DB_DATABASE=OLANET_TGM_DATOS
OLANET_DB_USER=coordina
OLANET_DB_PASSWORD=***
OLANET_DB_ENCRYPT=false
OLANET_DB_TRUST_SERVER_CERTIFICATE=true
# Opcional: ruta del SQLite (por defecto ./data/coordina.db)
# COORDINA_DB_PATH=/webs/coordina-ot/data/coordina.db
```

## 6. Operación diaria

| Acción | Comando |
|---|---|
| Estado / logs | `pm2 status` · `pm2 logs coordina-ot` |
| Healthcheck | `curl http://localhost:4300/api/health` |
| Reiniciar | `pm2 restart coordina-ot` |
| Actualizar versión | `cd /webs/coordina-ot && git pull && pnpm install && pnpm build && pm2 restart coordina-ot` |

Comportamiento ante fallos, ya contemplado en la app:

- **RPS caído / VPN caída**: la app sigue sirviendo el último dato bueno de
  la caché; si arranca en frío sin RPS, la página da error 500 hasta que
  vuelva (reintenta sola).
- **SQLite ilegible**: el tablero se sirve sin el flujo guardado (se ve el
  trabajo de RPS igual) y se anota aviso en el log de PM2.
- **Caída del proceso**: PM2 lo reinicia solo (`autorestart`).

## 7. Fichaje: pasar de ensayo a activo

El fichaje tiene tres modos y se elige con **`FICHAJE_OLANET`** en `.env.local`:

| Modo | Qué hace |
|---|---|
| `sombra` | Deriva los bonos y los acumula en la cola local. **No escribe en OLANET.** |
| `ensayo` | Escribe en `sch_RPS_bonos` (tablas reales) con `traspasado = 2`, que OLANET no procesa: el tiempo **no** llega a RPS. No mueve fases ni toca `tgm_fichajes_olanet_ot`. |
| `activo` | Escribe con `traspasado = 0`, mueve las fases y sincroniza el "fichando ahora". El tiempo **sí** sube a RPS. |

### Antes de poner `activo`

No es una decisión de calendario: hay que mirar el informe de contraste, que
compara día a día lo que ha escrito CoordinaOT contra lo que ha escrito el
mini-olanet en esa misma tabla.

```bash
curl -s http://localhost:4300/api/fichaje/contraste?dias=14 | jq .veredicto
```

Se puede pasar a `activo` cuando el veredicto diga `"listo": true`, que exige
las dos cosas a la vez:

- **`noEscritos` vacío** — todos los bonos de la cola están en OLANET. Si no lo
  está, es un fallo técnico: avisar a desarrollo, no seguir adelante.
- **Tres días seguidos por encima del 95 % de cobertura** — o sea, que la gente
  esté fichando en la web prácticamente todo lo que apunta en la herramienta
  vieja. Esto no se arregla con código: mientras se siga fichando solo en la
  vieja, pasar a activo perdería esas horas.

`descuadres` lista las OF donde las dos herramientas no coinciden, de peor a
mejor: sirve para ver si falta algo concreto o es reparto normal.

### El cambio

```bash
cd /webs/coordina-ot
sed -i 's/^FICHAJE_OLANET=.*/FICHAJE_OLANET=activo/' .env.local
pm2 restart coordina-ot
curl -s http://localhost:4300/api/fichaje/cola?pendientes=1 | jq .total   # debe bajar a 0
```

Con `activo` puesto, OT deja de fichar en la herramienta vieja: fichar en las
dos duplicaría el tiempo en RPS.

### La comprobación del primer día

Hay un tramo del circuito que **no se puede probar antes de dar el paso**: que
el procedimiento de OLANET recoja nuestros bonos y los suba a RPS. En ensayo van
con `traspasado = 2` justamente para que no los toque. Así que el día del cambio
hay que mirarlo, y se ve en minutos:

```bash
curl -s http://localhost:4300/api/fichaje/contraste | jq .traspaso
# { "subidos": 37, "pendientes": 0 }   ← bien: OLANET los está recogiendo
# { "subidos": 0,  "pendientes": 37 }  ← mal: el tiempo se queda a medio camino
```

Si tras un rato de fichaje normal `pendientes` no baja, volver a `ensayo` y
avisar a desarrollo. El tiempo no se pierde: los intervalos están guardados en
el SQLite de CoordinaOT y se reencolan.

### Marcha atrás

El mismo `sed` con `ensayo` y otro `pm2 restart`. Los bonos ya escritos con
`traspasado = 0` **no se deshacen solos** — si hubiera que retirarlos, es cosa
de IT sobre `sch_RPS_bonos`, y hay que avisar antes.

## 8. El reloj del servidor (pendiente para IT)

Medido el 16/08/2026: **el servidor va 60 s por delante** de los PC de la
oficina. Se comprueba en un segundo desde cualquier puesto:

```bash
curl -sI http://192.168.0.90:4300/api/health | grep -i '^date:'   # y compararlo con la hora del PC
```

Las horas del fichaje las pone el servidor, así que:

- **Las duraciones salen bien.** El inicio y el fin del tramo vienen los dos de
  su reloj, y la resta es correcta. Esto no compromete el paso a activo.
- **La hora a la que dice que se trabajó, no.** Un bono que pone las 10:00:00
  se echó de verdad a las 09:59:00. Un minuto no rompe nada hoy, pero la deriva
  crece sola si nadie sincroniza, y `sch_RPS_bonos` es un registro de horas.

Conviene ponerle NTP (`timedatectl set-ntp true` y comprobar con
`timedatectl status`). La web ya no depende de ello para pintar el contador
—descuenta el desfase por su cuenta, ver `lib/reloj-servidor.ts`— pero el dato
que se guarda sigue siendo el del reloj de la máquina.

## 9. «Dar por terminada en RPS»: segunda cosa que escribe en OLANET

Desde la rama `tareas-tiempos-equipo`, además del fichaje (sección 7), la app
puede escribir un **movimiento de fase a terminada (`IdEstadoOF = 3`)** en
`scg_Fases`/`sch_FasesMov`: lo hace el botón «Dar por terminada en RPS» sobre
una OF suelta, y el arrastre de siempre al pasar un pedido entero. Las dos
rutas comparten la misma función de servidor (`finalizarFase`,
`src/lib/server/olanet.ts`).

**Respeta el mismo interruptor `FICHAJE_OLANET`** de la sección 7: en `sombra`
y en `ensayo` no se escribe el 3 (se guarda solo la marca en CoordinaOT, con
el modo, y el aviso lo dice). En `activo`, sí. No hace falta ningún cambio
adicional al pasar de `ensayo` a `activo`: es el mismo paso de la sección 7.

**El ensayo manual contra OLANET real**, antes del primer 3 desde el botón en
producción: `scripts/ensayo-cerrar-fase-muerta.test.ts`. Cierra, con la misma
función que usan las dos rutas, una operación ya muerta (de las de arrastre
2020-2024, en pedidos entregados hace años) y comprueba que la segunda llamada
no repite el movimiento. **No lo ejecuta ningún agente ni CI**: el propio
fichero lo deja en mayúsculas. Solo Iván, a mano, avisando antes a David/IT
como se hizo con el primer 3 del fichaje. El fichero trae las instrucciones
completas (qué mirar en `scg_Fases`/`sch_FasesMov` antes y después, y las
cuatro variables de entorno que hacen falta).

## 10. Qué NO hace esta app (por diseño)

- No escribe nada en RPS ni en el share de PDFs. Lo único que escribe fuera de
  su propio SQLite es en OLANET: el fichaje y el movimiento de fase a
  terminada de «Dar por terminada en RPS»/pasar un pedido (sección 9), y los
  dos solo cuando `FICHAJE_OLANET` no es `sombra` ni `ensayo` (secciones 7 y 9).
- No expone nada fuera de la LAN (sin auth de momento: confiar en red interna;
  si se quiere publicar más allá de OT, hablar antes con desarrollo).
