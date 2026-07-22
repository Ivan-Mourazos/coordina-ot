# Fichaje compartido (server) + notificaciones en segundo plano — Diseño

Fecha: 2026-07-22
Estado: aprobado (pendiente de plan de implementación)

## Problema

Hoy el fichaje vive en `localStorage` de cada navegador
(`coordina-fichaje-v1`, [Board.tsx](../../../src/components/Board.tsx)):

- **No se comparte**: los minutos de cada persona están solo en su equipo. Si
  un autor ficha planteo y un revisor ficha revisión en la misma OF, esos
  tiempos quedan en dos navegadores distintos y nadie ve el conjunto.
- **No sobrevive**: cambiar de PC o borrar datos del navegador pierde los
  tiempos; no entran en el backup del SQLite propio.
- **Reloj del cliente**: los intervalos se abren con la hora del navegador
  (`ahora()`), así que dos equipos con hora ligeramente distinta producen
  tiempos incoherentes.
- **Notificaciones ciegas en segundo plano**: el polling que refresca la
  campana se detiene cuando la pestaña está oculta (`document.hidden`), y no
  hay ninguna señal fuera de la app (ni badge en el título).

Esta es la **fase 2a**: dejar los tiempos compartidos, persistidos y con hora
única (la del server), y que los avisos lleguen aunque la app esté al fondo.
NO incluye la subida a RPS (fase 2b, bloqueada por el usuario SQL de escritura
de IT) ni login.

## Decisiones de diseño (acordadas)

1. **El reloj pertenece a la PERSONA, no al dispositivo.** Un solo fichaje por
   técnico en todo el sistema; se vea desde donde se vea, es el mismo. Si abre
   en dos equipos, el último que toca manda (last-write-wins, sin bloqueo).
   En la práctica no se ficha desde dos PCs a la vez (confirmado por el
   usuario), así que este caso es un borde defensivo, no un flujo real: por eso
   basta last-write-wins y no hace falta bloqueo ni resolución de conflictos.
2. **El server es la fuente de verdad y del reloj.** El cliente manda la
   intención ("deja corriendo exactamente estas OFs con este rol"); el server
   abre/cierra el intervalo con SU hora.
3. **Los demás ven el tiempo ACUMULADO**, actualizado en el refresco normal
   (~30 s). No hay cronómetro en vivo tick a tick para terceros.
4. **Notificaciones: campana viva en segundo plano + badge en el título de la
   pestaña.** Sin pop-ups del SO, sin sonido, sin Web Push, sin permisos.

## Arquitectura

### Sección 1 — Datos

Tabla nueva en la BD propia de CoordinaOT (`data/coordina.db`, SQLite; se crea
sola en el arranque con `CREATE TABLE IF NOT EXISTS`, igual que las demás en
[estado-db.ts](../../../src/lib/server/estado-db.ts)). No requiere migración
manual ni SQL para IT.

```
fichaje_intervalo
  id          INTEGER PRIMARY KEY AUTOINCREMENT
  operario_id TEXT NOT NULL     -- de quién es el tiempo
  of_ids      TEXT NOT NULL     -- JSON string[]: OFs que comparten el tramo
  rol         TEXT NOT NULL     -- 'plantear' | 'revisar'
  inicio      TEXT NOT NULL     -- ISO, hora del SERVER
  fin         TEXT              -- ISO o NULL (=corriendo ahora)
  updated_at  TEXT NOT NULL
```

- Misma forma que el tipo `Intervalo` de [fichaje.ts](../../../src/lib/fichaje.ts):
  el motor puro se reutiliza tal cual.
- Al vivir en `coordina.db`, los tiempos entran en el backup diario ya montado.
- Índice sugerido: `(operario_id)` para cargar rápido el fichaje de una persona,
  y para el intervalo abierto basta `fin IS NULL`.

**Invariante clave** (heredado del motor actual): por cada `operario_id` hay
**como mucho un** intervalo con `fin IS NULL`. El motor lo garantiza al cerrar
el anterior antes de abrir otro.

### Sección 2 — Motor en el server

El motor puro de [fichaje.ts](../../../src/lib/fichaje.ts) (`fichar`, `pausar`,
`abierto`, `minutosOF`) **no cambia**: son funciones puras que reciben `ahora`
como argumento. Pasan a ejecutarse también en el server, que les inyecta su
propia hora.

Nuevas funciones en la capa de BD (junto a `estado-db.ts`, o en un
`fichaje-db.ts` hermano si conviene aislar):

- `leerFichaje(operarioId): Fichaje` — reconstruye el `Fichaje` de una persona
  desde sus filas.
- `leerTodosIntervalos(): Intervalo[]` — todos, para calcular acumulados por OF.
- `guardarFichaje(operarioId, Fichaje): void` — reemplaza los intervalos de esa
  persona (borra los suyos e inserta el estado nuevo) en una transacción. Al ser
  last-write-wins por persona y volúmenes pequeños, el reemplazo completo es
  simple y correcto; no hace falta diffing incremental.

### Sección 2 — API + flujo

- `POST /api/fichaje` — el cliente manda **intención**, no hora:
  ```
  { operarioId, ofIds: string[], rol }   // dejar corriendo exactamente esas OFs
  { operarioId, ofIds: [] }              // pausar
  ```
  El handler:
  1. `leerFichaje(operarioId)`
  2. aplica `fichar(f, ofIds, rol, operarioId, serverNow())` (o `pausar` si
     `ofIds` vacío)
  3. `guardarFichaje(operarioId, nuevo)`
  4. responde `{ fichaje }` actualizado.

  Validación: `operarioId` debe existir en el catálogo de operarios; `rol ∈
  {plantear, revisar}`; `ofIds` array de strings. Entrada inválida → 400.

- `GET /api/tablero` (ya existe) añade **minutos acumulados por OF** calculados
  con `minutosOF` sobre `leerTodosIntervalos()`, separados por rol
  (planteo/revisión). La forma exacta del campo se concreta en el plan; la UI ya
  tiene dónde mostrar tiempo por OF.

**Flujo:**
1. Alberto pulsa "Empezar planteo" → `POST /api/fichaje` → el server abre el
   intervalo con su hora → responde.
2. El Board de Alberto refleja de inmediato su reloj (feedback local optimista),
   pero la verdad ya está en el server.
3. Jaime, en el próximo refresco (~30 s), ve los minutos acumulados de Alberto
   en esa OF.
4. Alberto cambia de PC: al entrar, el cliente lee del server su intervalo
   abierto y sigue donde estaba.

### Sección 2 — Cliente (Board.tsx)

- El estado `fichaje` deja de nacer solo de `localStorage`: en el arranque se
  **carga del server** (el fichaje de `miId`). `localStorage` queda como caché
  de feedback inmediato, no como verdad.
- Cada acción que hoy hace `setFichaje(...)` local pasa a: actualización
  optimista local **+** `POST /api/fichaje`. La respuesta reconcilia.
- **Migración one-shot**: si el server no tiene intervalos para `miId` y
  `localStorage` sí tiene un fichaje válido, se sube una vez (POST) y a partir
  de ahí manda el server.

### Sección 3 — Notificaciones (Board.tsx, solo cliente)

1. **Campana viva en segundo plano.** En el polling
   ([Board.tsx:215](../../../src/components/Board.tsx#L215)) se quita el corte
   por `document.hidden`; se mantiene el corte por arrastre (`activeRef`) para
   no pisar un drag&drop. El refresco de 30 s sigue con la pestaña al fondo, así
   el contador de la campana se actualiza siempre.
2. **Badge en el título.** Efecto nuevo que sigue a `notifItems`:
   ```
   document.title = n > 0 ? `(${n}) CoordinaOT` : "CoordinaOT"
   ```
   con `n` = *por revisar* + *devueltas* (ya calculado en `notifItems`). Se
   restaura "CoordinaOT" cuando `n` llega a 0 y al desmontar.

## Manejo de errores

- `POST /api/fichaje` falla (red/servidor): la UI conserva el estado optimista
  local y reintenta en la siguiente acción o refresco; nunca pierde el intervalo
  en curso (mismo patrón tolerante que `persistir` en el Board hoy).
- BD no disponible al leer el tablero: los acumulados salen a 0 pero el tablero
  se sigue viendo (degradación, como el overlay actual).
- Fila corrupta (`of_ids` no parseable, `rol` desconocido): se ignora esa fila
  al reconstruir, nunca se propaga a medias (mismo criterio que `leerOverlay`).

## Testing

- Motor puro: ya cubierto en
  [fichaje.test.ts](../../../src/lib/__tests__/fichaje.test.ts); añadir casos de
  `minutosOF` agregando intervalos de varios operarios sobre la misma OF.
- Capa BD: round-trip `guardarFichaje` → `leerFichaje` (incluye intervalo
  abierto), invariante "un solo abierto por operario", reemplazo completo.
- API: intención → estado esperado con hora de server mockeada; validación de
  entrada (400).

## Fuera de alcance

- Subida de tiempos a RPS (fase 2b; necesita el usuario SQL de escritura de IT
  y el documento de cambios de tiempos pendiente de David).
- Login / autenticación (sigue el modelo "sin login", identidad por honor en un
  equipo de 3 personas; los tiempos son de confianza hasta que RPS sea la
  verdad oficial).
- Pop-ups del SO, sonido, Web Push, favicon con punto.
- Cronómetro en vivo tick a tick para terceros.
