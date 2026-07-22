# Fichaje compartido (server) + notificaciones en segundo plano — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Los tiempos de fichaje se guardan y comparten en el SQLite propio con la hora del server, y las notificaciones (campana + título) funcionan con la pestaña en segundo plano.

**Architecture:** El motor puro de fichaje (`src/lib/fichaje.ts`) pasa a ejecutarse en el server, que persiste los intervalos por operario en `data/coordina.db` y les inyecta su propia hora. `GET /api/tablero` suma los minutos por OF (planteo/revisión) desde esos intervalos. El Board deja de tratar `localStorage` como verdad: carga y escribe contra `POST/GET /api/fichaje`. Dos retoques de cliente arreglan las notificaciones.

**Tech Stack:** Next.js 16 (App Router, route handlers), better-sqlite3, TypeScript, Vitest.

## Global Constraints

- Node ≥ 22, pnpm ≥ 11 (copiado de `package.json` `engines`).
- **No two-PC concurrency**: no se ficha desde dos equipos a la vez; last-write-wins por operario, sin bloqueo.
- El server es la fuente de la HORA de todos los intervalos (nunca el cliente).
- La BD propia `data/coordina.db` se crea sola en el arranque (`CREATE TABLE IF NOT EXISTS`); prohibido pedir a IT pasos SQL manuales.
- Modo fork, 1 instancia (ya fijado en `ecosystem.config.cjs`): hay un único proceso, así que el singleton de conexión SQLite es válido.
- Fuera de alcance: subida a RPS, login, pop-ups del SO, cronómetro en vivo para terceros.
- Los tests de este proyecto usan Vitest y viven en `src/lib/__tests__/`. Ejecutar con `pnpm test`.

---

### Task 1: Persistencia de intervalos de fichaje (BD)

Crea la tabla `fichaje_intervalo` y la capa de lectura/escritura. El esquema se
centraliza en `estado-db.ts` (donde ya se crean las demás tablas); las funciones
de fichaje viven en un fichero hermano para no mezclar responsabilidades.

**Files:**
- Modify: `src/lib/server/estado-db.ts` (añadir tabla al `exec` de `abrir()` y exportar `getDb`)
- Create: `src/lib/server/fichaje-db.ts`
- Test: `src/lib/__tests__/fichaje-db.test.ts`

**Interfaces:**
- Consumes: `Fichaje`, `Intervalo` de `src/lib/fichaje.ts`; `Rol` de `src/lib/types.ts`.
- Produces:
  - `getDb(): Database.Database` (en `estado-db.ts`)
  - `leerFichaje(operarioId: string): Fichaje`
  - `leerTodosIntervalos(): Intervalo[]`
  - `guardarFichaje(operarioId: string, f: Fichaje): void`

- [ ] **Step 1: Añadir la tabla al esquema y exportar `getDb`**

En `src/lib/server/estado-db.ts`, dentro del `db.exec(\`...\`)` de `abrir()`,
añade al final del bloque SQL (después de `acciones_log`):

```sql
    CREATE TABLE IF NOT EXISTS fichaje_intervalo (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      operario_id TEXT NOT NULL,
      of_ids      TEXT NOT NULL,
      rol         TEXT NOT NULL,
      inicio      TEXT NOT NULL,
      fin         TEXT,
      updated_at  TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_fichaje_operario ON fichaje_intervalo(operario_id);
```

Y al final del fichero, exporta el acceso compartido a la conexión:

```ts
/** Conexión compartida (misma que el flujo). La usan otros módulos de datos
 *  propios, p. ej. fichaje-db.ts, para no duplicar apertura ni esquema. */
export function getDb(): Database.Database {
  return abrir();
}
```

- [ ] **Step 2: Escribir el test que falla**

Crea `src/lib/__tests__/fichaje-db.test.ts`:

```ts
import { afterAll, beforeAll, expect, test } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fichar, pausar, FICHAJE_VACIO } from "../fichaje";

let dir: string;
let db: typeof import("../server/fichaje-db");

beforeAll(async () => {
  dir = mkdtempSync(path.join(tmpdir(), "coordina-fdb-"));
  // Debe fijarse ANTES de importar: estado-db lee COORDINA_DB_PATH al cargar.
  process.env.COORDINA_DB_PATH = path.join(dir, "test.db");
  db = await import("../server/fichaje-db");
});

afterAll(() => rmSync(dir, { recursive: true, force: true }));

test("round-trip: guarda y lee el fichaje de un operario", () => {
  const t0 = "2026-07-22T08:00:00.000Z";
  const t1 = "2026-07-22T08:10:00.000Z";
  let f = fichar(FICHAJE_VACIO, ["OF-1"], "plantear", "op-1", t0);
  f = pausar(f, t1); // un intervalo cerrado de 10 min
  db.guardarFichaje("op-1", f);

  const leido = db.leerFichaje("op-1");
  expect(leido.intervalos).toHaveLength(1);
  expect(leido.intervalos[0]).toMatchObject({
    ofIds: ["OF-1"], rol: "plantear", operarioId: "op-1", inicio: t0, fin: t1,
  });
});

test("guardarFichaje reemplaza los intervalos previos de ese operario", () => {
  const f1 = fichar(FICHAJE_VACIO, ["OF-1"], "plantear", "op-2", "2026-07-22T09:00:00.000Z");
  db.guardarFichaje("op-2", f1);
  const f2 = fichar(FICHAJE_VACIO, ["OF-9"], "revisar", "op-2", "2026-07-22T10:00:00.000Z");
  db.guardarFichaje("op-2", f2);

  const leido = db.leerFichaje("op-2");
  expect(leido.intervalos).toHaveLength(1);
  expect(leido.intervalos[0].ofIds).toEqual(["OF-9"]);
  expect(leido.intervalos[0].fin).toBeNull(); // sigue abierto
});

test("leerTodosIntervalos junta a todos los operarios", () => {
  db.guardarFichaje("op-3", fichar(FICHAJE_VACIO, ["OF-5"], "plantear", "op-3", "2026-07-22T11:00:00.000Z"));
  const todos = db.leerTodosIntervalos();
  const ops = new Set(todos.map((i) => i.operarioId));
  expect(ops.has("op-3")).toBe(true);
});
```

- [ ] **Step 3: Ejecutar el test y verificar que falla**

Run: `pnpm test fichaje-db`
Expected: FAIL (`Cannot find module '../server/fichaje-db'`).

- [ ] **Step 4: Implementar `fichaje-db.ts`**

Crea `src/lib/server/fichaje-db.ts`:

```ts
import type { Fichaje, Intervalo } from "../fichaje";
import type { Rol } from "../types";
import { getDb } from "./estado-db";

// ─── Persistencia del fichaje (SQLite propio) ────────────────────────────────
// Los intervalos de tiempo por operario. La HORA la pone siempre el server al
// aplicar el motor; aquí solo se guardan/leen. Reemplazo completo por operario:
// no hay fichaje simultáneo desde dos equipos, así que last-write-wins basta.

interface Fila {
  operario_id: string;
  of_ids: string;
  rol: string;
  inicio: string;
  fin: string | null;
}

function filaAIntervalo(fila: Fila): Intervalo | null {
  let ofIds: unknown;
  try {
    ofIds = JSON.parse(fila.of_ids);
  } catch {
    return null; // fila corrupta: se ignora, nunca se propaga a medias
  }
  if (!Array.isArray(ofIds) || !ofIds.every((x) => typeof x === "string")) return null;
  if (fila.rol !== "plantear" && fila.rol !== "revisar") return null;
  return {
    inicio: fila.inicio,
    fin: fila.fin,
    ofIds: ofIds as string[],
    rol: fila.rol as Rol,
    operarioId: fila.operario_id,
  };
}

const SELECT = "SELECT operario_id, of_ids, rol, inicio, fin FROM fichaje_intervalo";

export function leerFichaje(operarioId: string): Fichaje {
  const filas = getDb()
    .prepare(`${SELECT} WHERE operario_id = ? ORDER BY inicio`)
    .all(operarioId) as Fila[];
  return {
    intervalos: filas.map(filaAIntervalo).filter((x): x is Intervalo => x !== null),
  };
}

export function leerTodosIntervalos(): Intervalo[] {
  const filas = getDb().prepare(`${SELECT} ORDER BY inicio`).all() as Fila[];
  return filas.map(filaAIntervalo).filter((x): x is Intervalo => x !== null);
}

export function guardarFichaje(operarioId: string, f: Fichaje): void {
  const db = getDb();
  const ahora = new Date().toISOString();
  const del = db.prepare("DELETE FROM fichaje_intervalo WHERE operario_id = ?");
  const ins = db.prepare(
    "INSERT INTO fichaje_intervalo (operario_id, of_ids, rol, inicio, fin, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
  );
  db.transaction(() => {
    del.run(operarioId);
    for (const iv of f.intervalos) {
      // Se fuerza el operarioId de la fila: un guardado solo toca SUS filas.
      ins.run(operarioId, JSON.stringify(iv.ofIds), iv.rol, iv.inicio, iv.fin, ahora);
    }
  })();
}
```

- [ ] **Step 5: Ejecutar el test y verificar que pasa**

Run: `pnpm test fichaje-db`
Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
git add src/lib/server/estado-db.ts src/lib/server/fichaje-db.ts src/lib/__tests__/fichaje-db.test.ts
git commit -m "feat(fichaje): persistencia de intervalos por operario en SQLite"
```

---

### Task 2: Agregación de minutos por OF (tiempo compartido)

Función pura que, dados el tablero y todos los intervalos, suma a cada OF sus
minutos de planteo y revisión. Se apoya en `minutosOF` (ya existe) tratando
todos los intervalos como una sola lista. Pura → testeable sin BD.

**Files:**
- Create: `src/lib/server/tiempos.ts`
- Test: `src/lib/__tests__/tiempos.test.ts`

**Interfaces:**
- Consumes: `Tablero` de `src/lib/data.ts`; `Intervalo`, `minutosOF` de `src/lib/fichaje.ts`.
- Produces: `aplicarTiemposFichaje(tablero: Tablero, intervalos: Intervalo[], ahora: string): Tablero`

- [ ] **Step 1: Escribir el test que falla**

Crea `src/lib/__tests__/tiempos.test.ts`:

```ts
import { expect, test } from "vitest";
import { aplicarTiemposFichaje } from "../server/tiempos";
import type { Tablero } from "../data";
import type { Intervalo } from "../fichaje";
import type { OF, Pedido } from "../types";

function of(id: string): OF {
  return {
    id, codigo: id, descripcion: "", familia: "TOLDO", piezas: 1,
    autorId: null, revisorId: null, estado: "pendiente", fichandoRol: null,
    tiempoEstimadoMin: 0, tiempoPlanteoMin: 0, tiempoRevisionMin: 0,
  };
}
function pedido(ofs: OF[]): Pedido {
  return {
    id: "AR1", codigo: "AR1", cliente: "C", situacion: "procesado",
    fechaSolicitud: "2026-07-22", fechaPlanificacion: "2026-07-22",
    fechaEntrega: "2026-07-22", prioridad: 2, ofs,
    accent: "ninguno", lineas: 0, croquis: false,
  };
}

test("suma minutos de planteo y revisión a la OF", () => {
  const tablero: Tablero = { operarios: [], pedidos: [pedido([of("OF-1")])] };
  const intervalos: Intervalo[] = [
    { inicio: "2026-07-22T08:00:00.000Z", fin: "2026-07-22T08:10:00.000Z", ofIds: ["OF-1"], rol: "plantear", operarioId: "a" },
    { inicio: "2026-07-22T09:00:00.000Z", fin: "2026-07-22T09:05:00.000Z", ofIds: ["OF-1"], rol: "revisar", operarioId: "b" },
  ];
  const out = aplicarTiemposFichaje(tablero, intervalos, "2026-07-22T10:00:00.000Z");
  const ofOut = out.pedidos[0].ofs[0];
  expect(ofOut.tiempoPlanteoMin).toBe(10);
  expect(ofOut.tiempoRevisionMin).toBe(5);
});

test("un intervalo abierto cuenta hasta 'ahora'", () => {
  const tablero: Tablero = { operarios: [], pedidos: [pedido([of("OF-1")])] };
  const intervalos: Intervalo[] = [
    { inicio: "2026-07-22T08:00:00.000Z", fin: null, ofIds: ["OF-1"], rol: "plantear", operarioId: "a" },
  ];
  const out = aplicarTiemposFichaje(tablero, intervalos, "2026-07-22T08:30:00.000Z");
  expect(out.pedidos[0].ofs[0].tiempoPlanteoMin).toBe(30);
});

test("sin intervalos devuelve el tablero sin tocar", () => {
  const tablero: Tablero = { operarios: [], pedidos: [pedido([of("OF-1")])] };
  const out = aplicarTiemposFichaje(tablero, [], "2026-07-22T10:00:00.000Z");
  expect(out).toBe(tablero);
});
```

- [ ] **Step 2: Ejecutar el test y verificar que falla**

Run: `pnpm test tiempos`
Expected: FAIL (`Cannot find module '../server/tiempos'`).

- [ ] **Step 3: Implementar `tiempos.ts`**

Crea `src/lib/server/tiempos.ts`:

```ts
import type { Tablero } from "../data";
import type { Intervalo } from "../fichaje";
import { minutosOF, type Fichaje } from "../fichaje";

// ─── Tiempo de fichaje agregado por OF ───────────────────────────────────────
// Suma pura: trata TODOS los intervalos (de todos los operarios) como una sola
// lista y reparte por OF y rol con minutosOF. Añade el resultado a los minutos
// que ya trae la OF de base (mock/RPS). Un intervalo abierto cuenta hasta
// `ahora` (la hora del server), así el tiempo en curso también se ve.

export function aplicarTiemposFichaje(
  tablero: Tablero,
  intervalos: Intervalo[],
  ahora: string,
): Tablero {
  if (intervalos.length === 0) return tablero;
  const f: Fichaje = { intervalos };
  return {
    operarios: tablero.operarios,
    pedidos: tablero.pedidos.map((p) => {
      let cambiado = false;
      const ofs = p.ofs.map((of) => {
        const planteo = minutosOF(f, of.id, { rol: "plantear", ahora });
        const revision = minutosOF(f, of.id, { rol: "revisar", ahora });
        if (planteo === 0 && revision === 0) return of;
        cambiado = true;
        return {
          ...of,
          tiempoPlanteoMin: of.tiempoPlanteoMin + planteo,
          tiempoRevisionMin: of.tiempoRevisionMin + revision,
        };
      });
      return cambiado ? { ...p, ofs } : p;
    }),
  };
}
```

- [ ] **Step 4: Ejecutar el test y verificar que pasa**

Run: `pnpm test tiempos`
Expected: PASS (3 tests).

- [ ] **Step 5: Cablear en `getTablero`**

En `src/lib/data.ts`, dentro del `try` de `getTablero()`, sustituye el `return`
que fusiona el overlay por la fusión + tiempos:

```ts
  try {
    const { leerOverlay } = await import("./server/estado-db");
    const { aplicarOverlay } = await import("./server/overlay");
    const conFlujo = aplicarOverlay(base, leerOverlay());

    const { leerTodosIntervalos } = await import("./server/fichaje-db");
    const { aplicarTiemposFichaje } = await import("./server/tiempos");
    return aplicarTiemposFichaje(
      conFlujo,
      leerTodosIntervalos(),
      new Date().toISOString(),
    );
  } catch (e) {
    console.warn("[coordina] overlay no disponible:", (e as Error).message);
    return base;
  }
```

- [ ] **Step 6: Verificar el build y los tests**

Run: `pnpm test && pnpm build`
Expected: tests PASS, build `Compiled successfully`.

- [ ] **Step 7: Commit**

```bash
git add src/lib/server/tiempos.ts src/lib/__tests__/tiempos.test.ts src/lib/data.ts
git commit -m "feat(fichaje): tiempo agregado por OF en el tablero"
```

---

### Task 3: API `/api/fichaje` (server aplica el motor con su hora)

Route handler: `POST` recibe la intención (`operarioId`, `ofIds`, `rol`) y el
server abre/cierra el intervalo con SU hora; `GET` devuelve el fichaje de un
operario para la carga inicial del cliente.

**Files:**
- Create: `src/app/api/fichaje/route.ts`
- Test: `src/lib/__tests__/api-fichaje.test.ts`

**Interfaces:**
- Consumes: `leerFichaje`, `guardarFichaje` de `src/lib/server/fichaje-db.ts`; `fichar`, `pausar` de `src/lib/fichaje.ts`.
- Produces: HTTP `POST /api/fichaje` → `{ fichaje: Fichaje }`; `GET /api/fichaje?operarioId=…` → `{ fichaje: Fichaje }`.

- [ ] **Step 1: Escribir el test que falla**

Crea `src/lib/__tests__/api-fichaje.test.ts`:

```ts
import { afterAll, beforeAll, expect, test } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

let dir: string;
let route: typeof import("../../app/api/fichaje/route");

beforeAll(async () => {
  dir = mkdtempSync(path.join(tmpdir(), "coordina-api-"));
  process.env.COORDINA_DB_PATH = path.join(dir, "test.db");
  route = await import("../../app/api/fichaje/route");
});

afterAll(() => rmSync(dir, { recursive: true, force: true }));

function post(body: unknown): Request {
  return new Request("http://x/api/fichaje", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

test("POST abre un intervalo y lo devuelve", async () => {
  const res = await route.POST(post({ operarioId: "op-1", ofIds: ["OF-1"], rol: "plantear" }));
  expect(res.status).toBe(200);
  const data = (await res.json()) as { fichaje: { intervalos: unknown[] } };
  expect(data.fichaje.intervalos).toHaveLength(1);
});

test("POST con ofIds vacío pausa (cierra el intervalo abierto)", async () => {
  await route.POST(post({ operarioId: "op-2", ofIds: ["OF-1"], rol: "plantear" }));
  const res = await route.POST(post({ operarioId: "op-2", ofIds: [] }));
  const data = (await res.json()) as { fichaje: { intervalos: { fin: string | null }[] } };
  expect(data.fichaje.intervalos.every((i) => i.fin !== null)).toBe(true);
});

test("GET devuelve el fichaje del operario", async () => {
  await route.POST(post({ operarioId: "op-3", ofIds: ["OF-7"], rol: "revisar" }));
  const res = await route.GET(new Request("http://x/api/fichaje?operarioId=op-3"));
  const data = (await res.json()) as { fichaje: { intervalos: { ofIds: string[] }[] } };
  expect(data.fichaje.intervalos[0].ofIds).toEqual(["OF-7"]);
});

test("POST sin operarioId responde 400", async () => {
  const res = await route.POST(post({ ofIds: [], rol: "plantear" }));
  expect(res.status).toBe(400);
});

test("POST con rol inválido y ofIds no vacío responde 400", async () => {
  const res = await route.POST(post({ operarioId: "op-9", ofIds: ["OF-1"], rol: "xxx" }));
  expect(res.status).toBe(400);
});
```

- [ ] **Step 2: Ejecutar el test y verificar que falla**

Run: `pnpm test api-fichaje`
Expected: FAIL (`Cannot find module '../../app/api/fichaje/route'`).

- [ ] **Step 3: Implementar el route handler**

Crea `src/app/api/fichaje/route.ts`:

```ts
import { NextResponse } from "next/server";
import { leerFichaje, guardarFichaje } from "@/lib/server/fichaje-db";
import { fichar, pausar } from "@/lib/fichaje";
import type { Rol } from "@/lib/types";

// ─── /api/fichaje ────────────────────────────────────────────────────────────
// El cliente manda la INTENCIÓN (qué OFs deja corriendo y con qué rol); el
// server aplica el motor con SU hora y persiste. Así todos los tiempos salen
// del mismo reloj. Sin login: se confía en el operarioId que manda el cliente
// (modelo "sin login" del proyecto; la verdad oficial será RPS en la fase 2b).

export const dynamic = "force-dynamic";

interface Body {
  operarioId?: unknown;
  ofIds?: unknown;
  rol?: unknown;
}

export async function POST(req: Request) {
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const operarioId = body.operarioId;
  if (typeof operarioId !== "string" || operarioId.length === 0)
    return NextResponse.json({ error: "Falta operarioId" }, { status: 400 });

  const ofIds = body.ofIds;
  if (!Array.isArray(ofIds) || !ofIds.every((x) => typeof x === "string"))
    return NextResponse.json({ error: "ofIds inválido" }, { status: 400 });

  const ahora = new Date().toISOString();
  const actual = leerFichaje(operarioId);

  let nuevo;
  if (ofIds.length === 0) {
    nuevo = pausar(actual, ahora);
  } else if (body.rol === "plantear" || body.rol === "revisar") {
    nuevo = fichar(actual, ofIds as string[], body.rol as Rol, operarioId, ahora);
  } else {
    return NextResponse.json({ error: "rol inválido" }, { status: 400 });
  }

  guardarFichaje(operarioId, nuevo);
  return NextResponse.json({ fichaje: nuevo });
}

export async function GET(req: Request) {
  const operarioId = new URL(req.url).searchParams.get("operarioId");
  if (!operarioId)
    return NextResponse.json({ error: "Falta operarioId" }, { status: 400 });
  return NextResponse.json(
    { fichaje: leerFichaje(operarioId) },
    { headers: { "Cache-Control": "no-store" } },
  );
}
```

- [ ] **Step 4: Ejecutar el test y verificar que pasa**

Run: `pnpm test api-fichaje`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/app/api/fichaje/route.ts src/lib/__tests__/api-fichaje.test.ts
git commit -m "feat(fichaje): API /api/fichaje aplica el motor con la hora del server"
```

---

### Task 4: Board.tsx — cargar y escribir el fichaje contra el server

El estado `fichaje` sigue siendo local (feedback optimista), pero: (a) al conocer
`miId` se carga del server, y (b) cada acción que lo cambia hace también
`POST /api/fichaje` y reconcilia con la respuesta. Sin migración del
`localStorage` previo. No hay test unitario de componente en este repo: se
verifica con build + comprobación manual descrita.

**Files:**
- Modify: `src/components/Board.tsx`

**Interfaces:**
- Consumes: `POST/GET /api/fichaje` (Task 3); `fichar`, `pausar`, `abierto`, `parseFichaje`, `type Fichaje` (ya importados en el Board); `fichajeRef` (ya existe, `Board.tsx:205-208`); `miId` (ya existe).
- Produces: nada nuevo para otras tareas.

- [ ] **Step 1: Añadir el POST reconciliador y la carga inicial**

En `src/components/Board.tsx`, justo antes de `const ficharOFs = useCallback(`
(está sobre `Board.tsx:514`), añade el helper de POST:

```ts
  // Envía la intención al server (fuente de la hora) y reconcilia el estado
  // local con lo que devuelve. Fire-and-forget: si falla la red, se conserva
  // el optimista y la siguiente acción/carga lo corrige.
  const postFichaje = useCallback(
    (ofIds: string[], rol: Rol) => {
      if (!miId) return;
      fetch("/api/fichaje", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ operarioId: miId, ofIds, rol }),
      })
        .then((r) => (r.ok ? r.json() : null))
        .then((d: { fichaje: Fichaje } | null) => {
          if (d?.fichaje) setFichaje(d.fichaje);
        })
        .catch(() => {});
    },
    [miId],
  );
```

Y tras el bloque del motor de fichaje (después de `reanudar`, sobre
`Board.tsx:575`), añade la carga inicial desde el server:

```ts
  // Al conocer quién soy, adopto MI fichaje del server (verdad compartida).
  // No se migra el localStorage previo (era contra datos mock).
  useEffect(() => {
    if (!miId) return;
    let cancelado = false;
    fetch(`/api/fichaje?operarioId=${encodeURIComponent(miId)}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { fichaje: Fichaje } | null) => {
        if (d?.fichaje && !cancelado) setFichaje(d.fichaje);
      })
      .catch(() => {});
    return () => {
      cancelado = true;
    };
  }, [miId]);
```

- [ ] **Step 2: Enganchar el POST en las cuatro acciones de fichaje**

En `ficharOFs` (`Board.tsx:543-547`), sustituye el `setFichaje` final por una
versión que calcula el conjunto desde `fichajeRef` y hace también POST:

```ts
      const ab = abierto(fichajeRef.current);
      const conjunto = ab && ab.rol === rol ? [...ab.ofIds, ...ofIds] : ofIds;
      setFichaje((f) => fichar(f, conjunto, rol, miId, ahora())); // optimista
      postFichaje(conjunto, rol);
```

En `desficharOF` (`Board.tsx:552-558`), sustituye el cuerpo por:

```ts
  const desficharOF = useCallback(
    (ofId: string) => {
      const ab = abierto(fichajeRef.current);
      if (!ab) return;
      const resto = ab.ofIds.filter((id) => id !== ofId);
      setFichaje((f) => fichar(f, resto, ab.rol, ab.operarioId, ahora())); // optimista
      postFichaje(resto, ab.rol);
    },
    [postFichaje],
  );
```

En `pausarTodo` (`Board.tsx:563`), sustituye por:

```ts
  const pausarTodo = useCallback(() => {
    setFichaje((f) => pausar(f, ahora())); // optimista
    postFichaje([], "plantear"); // rol ignorado al pausar (ofIds vacío)
  }, [postFichaje]);
```

En `reanudar` (`Board.tsx:565-575`), añade el POST tras el `setFichaje`:

```ts
  const reanudar = useCallback(() => {
    if (!miId) return;
    const ultimo = fichajeRef.current.intervalos[fichajeRef.current.intervalos.length - 1];
    if (!ultimo || ultimo.fin === null) return;
    setFichaje((f) => fichar(f, ultimo.ofIds, ultimo.rol, miId, ahora())); // optimista
    postFichaje(ultimo.ofIds, ultimo.rol);
  }, [miId, postFichaje]);
```

- [ ] **Step 3: Verificar el build**

Run: `pnpm build`
Expected: `Compiled successfully` sin errores de TypeScript. Si TS marca que
`postFichaje` se usa antes de declararse, mueve su `useCallback` por encima de
`ficharOFs` (paso 1 ya lo coloca ahí).

- [ ] **Step 4: Comprobación manual (dos navegadores)**

1. `pnpm build && pnpm start` (o el deploy).
2. Navegador A: elige identidad Alberto, "Empezar planteo" en una OF. El reloj corre.
3. Navegador B (ventana privada): identidad Jaime. En ≤30 s la OF muestra los minutos que va echando Alberto.
4. En A, recarga la página (F5): el fichaje abierto sigue (viene del server), no se pierde.
5. En A, pausa: el intervalo se cierra; en B, tras el refresco, el tiempo queda fijo.

- [ ] **Step 5: Commit**

```bash
git add src/components/Board.tsx
git commit -m "feat(fichaje): Board carga y escribe el fichaje contra el server"
```

---

### Task 5: Notificaciones en segundo plano (campana viva + badge en el título)

Dos retoques de cliente: que el polling no se pare con la pestaña oculta y que el
título de la pestaña muestre el número de avisos.

**Files:**
- Modify: `src/components/Board.tsx`

**Interfaces:**
- Consumes: `misPorRevisar`, `misDevueltas` (ya calculados, `Board.tsx:410-411`); `activeRef` (ya existe).
- Produces: nada nuevo.

- [ ] **Step 1: Que el polling siga en segundo plano**

En el efecto de polling (`Board.tsx:214-215`), cambia la guarda para que solo
corte durante un arrastre, no por pestaña oculta:

```ts
    const id = setInterval(async () => {
      if (activeRef.current) return; // solo se salta durante un drag&drop
```

(Se elimina `document.hidden ||`. Se mantiene `activeRef.current`.)

- [ ] **Step 2: Badge en el título de la pestaña**

Tras el cálculo de `misPorRevisar`/`misDevueltas` (`Board.tsx:410-411`), añade
el efecto:

```ts
  // Aviso visible aunque la pestaña esté al fondo: "(2) CoordinaOT".
  useEffect(() => {
    const n = misPorRevisar + misDevueltas;
    document.title = n > 0 ? `(${n}) CoordinaOT` : "CoordinaOT";
  }, [misPorRevisar, misDevueltas]);
```

- [ ] **Step 3: Verificar el build**

Run: `pnpm build`
Expected: `Compiled successfully`.

- [ ] **Step 4: Comprobación manual**

1. `pnpm build && pnpm start`.
2. Navegador A (Alberto): pasa una OF a "por revisar" con Jaime como revisor.
3. Navegador B (Jaime) en OTRA pestaña que NO sea CoordinaOT (deja CoordinaOT al fondo).
4. En ≤30 s, la pestaña de fondo de Jaime pasa a `(1) CoordinaOT` en su lengüeta.
5. Jaime abre la OF y la resuelve → el título vuelve a `CoordinaOT`.

- [ ] **Step 5: Commit**

```bash
git add src/components/Board.tsx
git commit -m "feat(notif): campana viva en segundo plano + badge en el título"
```

---

## Self-Review

**Cobertura del spec:**
- Datos (tabla `fichaje_intervalo`, se crea sola) → Task 1. ✅
- Motor en el server → Tasks 1 (persistencia) + 3 (aplica `fichar`/`pausar` con hora server). ✅
- Minutos acumulados por OF, separados por rol → Task 2. ✅
- API POST intención / GET carga → Task 3. ✅
- Cliente: carga del server + POST optimista, sin migración → Task 4. ✅
- Notificaciones: polling en 2º plano + badge título → Task 5. ✅
- Fuera de alcance (RPS, login, pop-ups, tick en vivo) → no hay tareas para ello. ✅

**Consistencia de tipos:**
- `getDb(): Database.Database` (Task 1) usado por `fichaje-db.ts` (Task 1) — mismo módulo.
- `leerFichaje/guardarFichaje/leerTodosIntervalos` (Task 1) consumidos por Task 2 (`leerTodosIntervalos`) y Task 3 (`leerFichaje/guardarFichaje`) — firmas idénticas.
- `aplicarTiemposFichaje(tablero, intervalos, ahora)` (Task 2) llamado en `data.ts` con esos tres argumentos. ✅
- `postFichaje(ofIds, rol)` (Task 4) definido antes de su primer uso en `ficharOFs`. ✅
- `Intervalo`/`Fichaje` reutilizados sin redefinir (vienen de `fichaje.ts`). ✅

**Notas:**
- Validación de `operarioId` contra el catálogo: se omite a propósito (evita una consulta pesada por POST y encaja con el modelo "sin login"); se acepta cualquier `operarioId` no vacío. Coherente con el spec (fuera de alcance: login).
- `minutosOF` devuelve minutos fraccionados; la UI ya formatea tiempos, no se redondea aquí.
