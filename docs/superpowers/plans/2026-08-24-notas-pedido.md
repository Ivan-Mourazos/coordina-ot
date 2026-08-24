# Notas en los pedidos — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Un hilo de notas por pedido, dentro de su ficha, para que lo que sabe OT no se pierda al pasar el trabajo a otra persona.

**Architecture:** Tabla nueva en el SQLite propio (`nota_pedido`), con el CÓDIGO del pedido como clave para que la nota sobreviva al paso al Historial. Una ruta `/api/notas` con cuatro verbos. Un componente de hilo montado en el Drawer del tablero (escritura) y en el del Historial (solo lectura). El tablero NO carga los hilos: se piden al abrir el pedido.

**Tech Stack:** Next.js 16 (App Router, Turbopack), React 19, TypeScript, better-sqlite3, Tailwind v4, Vitest.

## Global Constraints

- Diseño acordado: `docs/superpowers/specs/2026-08-23-notas-pedido-design.md`. No añadir nada que no esté ahí.
- **Sin chincheta en las filas.** Fuera de alcance a propósito; no tocar `PedidoLinea`, `ListaView`, `types.ts` ni `data.ts`.
- La clave de la nota es `Pedido.codigo` (`AR.26.03914`, o el sintético `OF 0231158`), NUNCA `Pedido.id`.
- Borrado blando: `borrado_at`. Nada de `DELETE FROM`.
- `PATCH` y `DELETE` llevan `AND operario_id = ?` en la sentencia.
- Comentarios y textos de interfaz en español, como el resto del repo.
- Antes de cada commit: `npx tsc --noEmit`, `npx eslint src`, `npx vitest run`. Los tres limpios.
- Regla del lint: `react-hooks/set-state-in-effect` prohíbe `setState` síncrono dentro de un efecto. Diferir con `setTimeout(..., 0)`, como hace `HistorialDrawer.tsx`.

---

### Task 1: El modelo puro y su validación

**Files:**
- Create: `src/lib/nota-pedido.ts`
- Test: `src/lib/__tests__/nota-pedido.test.ts`

**Interfaces:**
- Consumes: nada.
- Produces: `interface NotaPedido`, `NOTA_MAX`, `validarTexto(crudo: unknown): TextoValido`, `fmtCuandoNota(iso: string, ahora: string): string`.

- [ ] **Step 1: Escribir el test que falla**

Crear `src/lib/__tests__/nota-pedido.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { NOTA_MAX, fmtCuandoNota, validarTexto } from "../nota-pedido";

describe("validarTexto", () => {
  it("recorta los bordes y deja el texto limpio", () => {
    expect(validarTexto("  falta el color  ")).toEqual({ ok: true, texto: "falta el color" });
  });

  it("normaliza los saltos de Windows: el texto se guarda con \\n", () => {
    expect(validarTexto("una\r\ndos")).toEqual({ ok: true, texto: "una\ndos" });
  });

  it("respeta los saltos de línea de dentro", () => {
    expect(validarTexto("una\n\ndos")).toEqual({ ok: true, texto: "una\n\ndos" });
  });

  it("una nota vacía no es una nota", () => {
    expect(validarTexto("")).toEqual({ ok: false, motivo: "vacio" });
    expect(validarTexto("   \n  ")).toEqual({ ok: false, motivo: "vacio" });
  });

  it("lo que no es texto se rechaza igual que lo vacío", () => {
    expect(validarTexto(null)).toEqual({ ok: false, motivo: "vacio" });
    expect(validarTexto(42)).toEqual({ ok: false, motivo: "vacio" });
    expect(validarTexto(undefined)).toEqual({ ok: false, motivo: "vacio" });
  });

  it("justo en el tope cabe; uno más, no", () => {
    expect(validarTexto("a".repeat(NOTA_MAX)).ok).toBe(true);
    expect(validarTexto("a".repeat(NOTA_MAX + 1))).toEqual({ ok: false, motivo: "largo" });
  });

  it("el tope se mide DESPUÉS de recortar", () => {
    expect(validarTexto("  " + "a".repeat(NOTA_MAX) + "  ").ok).toBe(true);
  });
});

describe("fmtCuandoNota", () => {
  // Las fechas se construyen con el constructor local (no con literales ISO)
  // para que el test no dependa de la zona horaria de la máquina que lo corre.
  const hoy = new Date(2026, 7, 24, 15, 0, 0).toISOString();

  it("lo de hoy dice la hora", () => {
    const iso = new Date(2026, 7, 24, 11, 4, 0).toISOString();
    expect(fmtCuandoNota(iso, hoy)).toBe("hoy 11:04");
  });

  it("lo de ayer lo dice", () => {
    const iso = new Date(2026, 7, 23, 9, 30, 0).toISOString();
    expect(fmtCuandoNota(iso, hoy)).toBe("ayer 9:30");
  });

  it("más atrás, con el día y el mes", () => {
    const iso = new Date(2026, 7, 18, 12, 16, 0).toISOString();
    expect(fmtCuandoNota(iso, hoy)).toBe("18/8 12:16");
  });

  it("de otro año, con el año", () => {
    const iso = new Date(2025, 11, 3, 8, 5, 0).toISOString();
    expect(fmtCuandoNota(iso, hoy)).toBe("3/12/2025 8:05");
  });
});
```

- [ ] **Step 2: Correr el test y ver que falla**

Run: `npx vitest run src/lib/__tests__/nota-pedido.test.ts`
Expected: FAIL — `Failed to resolve import "../nota-pedido"`.

- [ ] **Step 3: Escribir el módulo**

Crear `src/lib/nota-pedido.ts`:

```ts
// ─── Notas de un pedido: el contrato y sus reglas ────────────────────────────
// Client-safe: no toca la BD ni importa nada de servidor. Lo comparten la ruta
// de la API y el componente del hilo, para que la validación sea la misma en
// los dos lados y no se puedan separar.
//
// La nota cuelga del CÓDIGO del pedido ("AR.26.03914"), no de su id interno:
// en el tablero el id sale del agrupado de RPS y en el Historial es "hist:…",
// así que una nota colgada del id se perdería justo al pasar a Producción, que
// es cuando más se quiere leer. Ver el spec del 2026-08-23.

export interface NotaPedido {
  id: number;
  /** Código del pedido. También vale el sintético de las OF sueltas. */
  pedido: string;
  operarioId: string;
  texto: string;
  /** ISO. */
  creadoAt: string;
  /** ISO, o null si nunca se editó. */
  editadoAt: string | null;
}

/** Tope de una nota. Es un recado, no un informe: con dos mil caracteres caben
 *  unas treinta líneas, de sobra para lo que se apunta en un post-it. El tope
 *  existe para que un pegado accidental no reviente la ficha. */
export const NOTA_MAX = 2000;

export type TextoValido =
  | { ok: true; texto: string }
  | { ok: false; motivo: "vacio" | "largo" };

/** Deja el texto como se va a guardar, o dice por qué no vale.
 *
 *  Devuelve el motivo y no solo `null` para que la ruta pueda decir qué pasa:
 *  "no has escrito nada" y "te has pasado de largo" se arreglan de formas
 *  distintas, y un 400 mudo obliga a adivinar cuál de las dos es.
 *
 *  Los saltos de Windows se normalizan a `\n`: el texto entra desde un
 *  `<textarea>` y se vuelve a pintar con `whitespace-pre-line`, así que
 *  guardar `\r\n` mete un carácter invisible que no aporta nada. */
export function validarTexto(crudo: unknown): TextoValido {
  if (typeof crudo !== "string") return { ok: false, motivo: "vacio" };
  const texto = crudo.replace(/\r\n/g, "\n").trim();
  if (texto.length === 0) return { ok: false, motivo: "vacio" };
  // El tope se mide sobre el texto YA recortado: si no, unos espacios de más
  // al pegar rechazarían una nota que cabe de sobra.
  if (texto.length > NOTA_MAX) return { ok: false, motivo: "largo" };
  return { ok: true, texto };
}

/** Cuándo se escribió, en corto: "hoy 11:04", "ayer 9:30", "18/8 12:16".
 *
 *  Con la hora siempre, que en un hilo de recados del mismo día es lo único
 *  que ordena. Y con el año solo cuando no es el de hoy: en los normales gasta
 *  sitio para decir lo que ya se sabe. */
export function fmtCuandoNota(iso: string, ahora: string): string {
  const d = new Date(iso);
  const hoy = new Date(ahora);
  const hora = `${d.getHours()}:${String(d.getMinutes()).padStart(2, "0")}`;
  const mismoDia = (a: Date, b: Date) => a.toDateString() === b.toDateString();
  if (mismoDia(d, hoy)) return `hoy ${hora}`;
  const ayer = new Date(hoy);
  ayer.setDate(ayer.getDate() - 1);
  if (mismoDia(d, ayer)) return `ayer ${hora}`;
  const dia = `${d.getDate()}/${d.getMonth() + 1}`;
  return d.getFullYear() === hoy.getFullYear()
    ? `${dia} ${hora}`
    : `${dia}/${d.getFullYear()} ${hora}`;
}
```

- [ ] **Step 4: Correr el test y ver que pasa**

Run: `npx vitest run src/lib/__tests__/nota-pedido.test.ts`
Expected: PASS, 11 tests.

- [ ] **Step 5: Comprobar y commitear**

```bash
npx tsc --noEmit && npx eslint src && npx vitest run
git add src/lib/nota-pedido.ts src/lib/__tests__/nota-pedido.test.ts
git commit -m "feat(notas): el contrato de una nota y sus reglas de validacion"
```

---

### Task 2: La capa de datos

**Files:**
- Modify: `src/lib/server/estado-db.ts` (añadir la tabla al `db.exec` del arranque, justo después del bloque `pedido_overlay`)
- Create: `src/lib/server/notas-db.ts`
- Test: `src/lib/__tests__/notas-db.test.ts`

**Interfaces:**
- Consumes: `NotaPedido` de `../nota-pedido`; `getDb()` de `./estado-db`.
- Produces: `leerNotas(pedido: string): NotaPedido[]`, `crearNota(pedido: string, operarioId: string, texto: string, ahora?: string): NotaPedido`, `editarNota(id: number, operarioId: string, texto: string, ahora?: string): boolean`, `borrarNota(id: number, operarioId: string, ahora?: string): boolean`.

- [ ] **Step 1: Escribir el test que falla**

Crear `src/lib/__tests__/notas-db.test.ts`:

```ts
import { afterAll, beforeAll, beforeEach, expect, test } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

let dir: string;
let db: typeof import("../server/notas-db");
let estado: typeof import("../server/estado-db");

beforeAll(async () => {
  dir = mkdtempSync(path.join(tmpdir(), "coordina-notas-"));
  process.env.COORDINA_DB_PATH = path.join(dir, "test.db");
  estado = await import("../server/estado-db");
  db = await import("../server/notas-db");
});

afterAll(() => {
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {
    // Windows mantiene abierto el handle del WAL; limpieza best effort.
  }
});

beforeEach(() => {
  estado.getDb().prepare("DELETE FROM nota_pedido").run();
});

test("una nota se guarda y se lee", () => {
  const creada = db.crearNota("AR.26.03914", "jaime", "falta el color", "2026-08-24T09:00:00.000Z");
  expect(creada.pedido).toBe("AR.26.03914");
  expect(creada.operarioId).toBe("jaime");
  expect(creada.texto).toBe("falta el color");
  expect(creada.editadoAt).toBeNull();
  expect(db.leerNotas("AR.26.03914")).toEqual([creada]);
});

test("el hilo sale de la más vieja a la más nueva: se lee como una conversación", () => {
  db.crearNota("AR.1", "jaime", "primera", "2026-08-24T09:00:00.000Z");
  db.crearNota("AR.1", "ivan", "segunda", "2026-08-24T10:00:00.000Z");
  expect(db.leerNotas("AR.1").map((n) => n.texto)).toEqual(["primera", "segunda"]);
});

test("cada pedido tiene su hilo", () => {
  db.crearNota("AR.1", "jaime", "la del uno", "2026-08-24T09:00:00.000Z");
  db.crearNota("AR.2", "jaime", "la del dos", "2026-08-24T09:00:00.000Z");
  expect(db.leerNotas("AR.1").map((n) => n.texto)).toEqual(["la del uno"]);
  expect(db.leerNotas("AR.2").map((n) => n.texto)).toEqual(["la del dos"]);
});

test("un pedido sin notas devuelve lista vacía, no revienta", () => {
  expect(db.leerNotas("AR.NO.EXISTE")).toEqual([]);
});

test("el código sintético de una OF suelta vale como clave", () => {
  db.crearNota("OF 0231158", "jaime", "ojo con esta", "2026-08-24T09:00:00.000Z");
  expect(db.leerNotas("OF 0231158")).toHaveLength(1);
});

test("editas la tuya y queda marcada como editada", () => {
  const n = db.crearNota("AR.1", "jaime", "antes", "2026-08-24T09:00:00.000Z");
  expect(db.editarNota(n.id, "jaime", "después", "2026-08-24T11:00:00.000Z")).toBe(true);
  const [leida] = db.leerNotas("AR.1");
  expect(leida.texto).toBe("después");
  expect(leida.editadoAt).toBe("2026-08-24T11:00:00.000Z");
});

test("NO puedes editar la de otro", () => {
  const n = db.crearNota("AR.1", "jaime", "mía", "2026-08-24T09:00:00.000Z");
  expect(db.editarNota(n.id, "ivan", "te la cambio", "2026-08-24T11:00:00.000Z")).toBe(false);
  expect(db.leerNotas("AR.1")[0].texto).toBe("mía");
});

test("borrar la tuya la saca del hilo", () => {
  const n = db.crearNota("AR.1", "jaime", "fuera", "2026-08-24T09:00:00.000Z");
  expect(db.borrarNota(n.id, "jaime", "2026-08-24T11:00:00.000Z")).toBe(true);
  expect(db.leerNotas("AR.1")).toEqual([]);
});

test("el borrado es BLANDO: la fila sigue ahí para poder recuperarla", () => {
  const n = db.crearNota("AR.1", "jaime", "fuera", "2026-08-24T09:00:00.000Z");
  db.borrarNota(n.id, "jaime", "2026-08-24T11:00:00.000Z");
  const fila = estado
    .getDb()
    .prepare("SELECT texto, borrado_at FROM nota_pedido WHERE id = ?")
    .get(n.id) as { texto: string; borrado_at: string | null };
  expect(fila.texto).toBe("fuera");
  expect(fila.borrado_at).toBe("2026-08-24T11:00:00.000Z");
});

test("NO puedes borrar la de otro", () => {
  const n = db.crearNota("AR.1", "jaime", "mía", "2026-08-24T09:00:00.000Z");
  expect(db.borrarNota(n.id, "ivan", "2026-08-24T11:00:00.000Z")).toBe(false);
  expect(db.leerNotas("AR.1")).toHaveLength(1);
});

test("una nota ya borrada no se puede editar ni volver a borrar", () => {
  const n = db.crearNota("AR.1", "jaime", "fuera", "2026-08-24T09:00:00.000Z");
  db.borrarNota(n.id, "jaime", "2026-08-24T11:00:00.000Z");
  expect(db.editarNota(n.id, "jaime", "vuelvo", "2026-08-24T12:00:00.000Z")).toBe(false);
  expect(db.borrarNota(n.id, "jaime", "2026-08-24T12:00:00.000Z")).toBe(false);
});

test("editar o borrar una nota que no existe devuelve false, no revienta", () => {
  expect(db.editarNota(9999, "jaime", "hola", "2026-08-24T09:00:00.000Z")).toBe(false);
  expect(db.borrarNota(9999, "jaime", "2026-08-24T09:00:00.000Z")).toBe(false);
});
```

- [ ] **Step 2: Correr el test y ver que falla**

Run: `npx vitest run src/lib/__tests__/notas-db.test.ts`
Expected: FAIL — `Failed to resolve import "../server/notas-db"`.

- [ ] **Step 3: Añadir la tabla al esquema**

En `src/lib/server/estado-db.ts`, dentro del `db.exec(...)` del arranque, justo DESPUÉS del bloque `CREATE TABLE IF NOT EXISTS pedido_overlay (...);` y ANTES de `CREATE TABLE IF NOT EXISTS acciones_log (`, añadir:

```sql
    CREATE TABLE IF NOT EXISTS nota_pedido (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      pedido      TEXT NOT NULL,
      operario_id TEXT NOT NULL,
      texto       TEXT NOT NULL,
      creado_at   TEXT NOT NULL,
      editado_at  TEXT,
      borrado_at  TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_nota_pedido ON nota_pedido(pedido);
```

- [ ] **Step 4: Escribir la capa de datos**

Crear `src/lib/server/notas-db.ts`:

```ts
import type { NotaPedido } from "../nota-pedido";
import { getDb } from "./estado-db";

// ─── Notas de pedido (SQLite propio) ─────────────────────────────────────────
// La tabla se crea en estado-db.ts, con el resto del esquema: es una sola BD y
// un solo sitio donde mirar qué hay dentro.
//
// El borrado es BLANDO (`borrado_at`) y no un DELETE: una nota que alguien
// quita sin querer se puede devolver desde la BD, y el `acciones_log` —que ya
// guarda cada cambio del tablero— sigue teniendo sentido al lado.
//
// Editar y borrar llevan SIEMPRE `AND operario_id = ?` en la sentencia. No es
// solo que la interfaz no ofrezca el botón: la regla vive aquí, que es donde no
// se puede saltar. Ojo con lo que esto NO es: sin login, el `operarioId` lo
// manda el navegador (mismo modelo que el fichaje), así que esto impide el
// accidente, no al que quiera saltárselo a propósito.

interface Fila {
  id: number;
  pedido: string;
  operario_id: string;
  texto: string;
  creado_at: string;
  editado_at: string | null;
}

const aNota = (f: Fila): NotaPedido => ({
  id: f.id,
  pedido: f.pedido,
  operarioId: f.operario_id,
  texto: f.texto,
  creadoAt: f.creado_at,
  editadoAt: f.editado_at,
});

/** El hilo de un pedido, de la más vieja a la más nueva: se lee como una
 *  conversación y lo último que pasó queda abajo del todo. Las borradas no
 *  salen. */
export function leerNotas(pedido: string): NotaPedido[] {
  return (
    getDb()
      .prepare(
        `SELECT id, pedido, operario_id, texto, creado_at, editado_at
           FROM nota_pedido
          WHERE pedido = ? AND borrado_at IS NULL
          ORDER BY creado_at, id`,
      )
      .all(pedido) as Fila[]
  ).map(aNota);
}

/** Añade una nota y devuelve la que quedó guardada, ya con su id. */
export function crearNota(
  pedido: string,
  operarioId: string,
  texto: string,
  ahora = new Date().toISOString(),
): NotaPedido {
  const r = getDb()
    .prepare(
      `INSERT INTO nota_pedido (pedido, operario_id, texto, creado_at)
       VALUES (?, ?, ?, ?)`,
    )
    .run(pedido, operarioId, texto, ahora);
  return {
    id: Number(r.lastInsertRowid),
    pedido,
    operarioId,
    texto,
    creadoAt: ahora,
    editadoAt: null,
  };
}

/** Cambia el texto de una nota PROPIA. Devuelve si se tocó alguna fila: false
 *  es "no era tuya", "no existe" o "ya estaba borrada", y las tres se contestan
 *  igual desde fuera. */
export function editarNota(
  id: number,
  operarioId: string,
  texto: string,
  ahora = new Date().toISOString(),
): boolean {
  return (
    getDb()
      .prepare(
        `UPDATE nota_pedido SET texto = ?, editado_at = ?
          WHERE id = ? AND operario_id = ? AND borrado_at IS NULL`,
      )
      .run(texto, ahora, id, operarioId).changes > 0
  );
}

/** Quita una nota PROPIA del hilo. Ver arriba: blando, no DELETE. */
export function borrarNota(
  id: number,
  operarioId: string,
  ahora = new Date().toISOString(),
): boolean {
  return (
    getDb()
      .prepare(
        `UPDATE nota_pedido SET borrado_at = ?
          WHERE id = ? AND operario_id = ? AND borrado_at IS NULL`,
      )
      .run(ahora, id, operarioId).changes > 0
  );
}
```

- [ ] **Step 5: Correr el test y ver que pasa**

Run: `npx vitest run src/lib/__tests__/notas-db.test.ts`
Expected: PASS, 12 tests.

- [ ] **Step 6: Comprobar y commitear**

```bash
npx tsc --noEmit && npx eslint src && npx vitest run
git add src/lib/server/estado-db.ts src/lib/server/notas-db.ts src/lib/__tests__/notas-db.test.ts
git commit -m "feat(notas): tabla nota_pedido y su capa de datos, con borrado blando"
```

---

### Task 3: La ruta de la API

**Files:**
- Create: `src/app/api/notas/route.ts`
- Test: `src/lib/__tests__/api-notas.test.ts`

**Interfaces:**
- Consumes: `leerNotas`, `crearNota`, `editarNota`, `borrarNota` de `@/lib/server/notas-db`; `validarTexto` de `@/lib/nota-pedido`.
- Produces: `GET/POST/PATCH/DELETE` en `/api/notas`. Respuestas: `GET` → `{ notas: NotaPedido[] }`; `POST` → `{ nota: NotaPedido }`; `PATCH`/`DELETE` → `{ ok: true }`; errores → `{ error: string }`.

- [ ] **Step 1: Escribir el test que falla**

Crear `src/lib/__tests__/api-notas.test.ts`:

```ts
import { afterAll, beforeAll, beforeEach, expect, test } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type { NotaPedido } from "../nota-pedido";

let dir: string;
let ruta: typeof import("../../app/api/notas/route");
let estado: typeof import("../server/estado-db");
let notasDb: typeof import("../server/notas-db");

beforeAll(async () => {
  dir = mkdtempSync(path.join(tmpdir(), "coordina-api-notas-"));
  process.env.COORDINA_DB_PATH = path.join(dir, "test.db");
  estado = await import("../server/estado-db");
  notasDb = await import("../server/notas-db");
  ruta = await import("../../app/api/notas/route");
});

afterAll(() => {
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {
    // Windows mantiene abierto el handle del WAL; limpieza best effort.
  }
});

beforeEach(() => {
  estado.getDb().prepare("DELETE FROM nota_pedido").run();
});

const post = (body: unknown) =>
  ruta.POST(new Request("http://x/api/notas", { method: "POST", body: JSON.stringify(body) }));
const patch = (body: unknown) =>
  ruta.PATCH(new Request("http://x/api/notas", { method: "PATCH", body: JSON.stringify(body) }));
const del = (body: unknown) =>
  ruta.DELETE(new Request("http://x/api/notas", { method: "DELETE", body: JSON.stringify(body) }));
const get = (q: string) => ruta.GET(new Request(`http://x/api/notas?${q}`));

test("POST crea la nota y la devuelve ya recortada", async () => {
  const res = await post({ pedido: "AR.26.03914", operarioId: "jaime", texto: "  falta el color  " });
  expect(res.status).toBe(200);
  const { nota } = (await res.json()) as { nota: NotaPedido };
  expect(nota.texto).toBe("falta el color");
  expect(nota.operarioId).toBe("jaime");
  expect(nota.id).toBeGreaterThan(0);
});

test("GET devuelve el hilo del pedido que se pide y nada más", async () => {
  notasDb.crearNota("AR.1", "jaime", "primera", "2026-08-24T09:00:00.000Z");
  notasDb.crearNota("AR.2", "ivan", "otra", "2026-08-24T09:00:00.000Z");
  const res = await get("pedido=AR.1");
  expect(res.status).toBe(200);
  expect(res.headers.get("cache-control")).toBe("no-store");
  const { notas } = (await res.json()) as { notas: NotaPedido[] };
  expect(notas.map((n) => n.texto)).toEqual(["primera"]);
});

test("GET sin pedido es 400", async () => {
  expect((await get("")).status).toBe(400);
});

test("POST rechaza la nota vacía y dice por qué", async () => {
  const res = await post({ pedido: "AR.1", operarioId: "jaime", texto: "   " });
  expect(res.status).toBe(400);
  expect(((await res.json()) as { error: string }).error).toMatch(/vac/i);
});

test("POST rechaza la nota demasiado larga y lo dice distinto", async () => {
  const res = await post({ pedido: "AR.1", operarioId: "jaime", texto: "a".repeat(2001) });
  expect(res.status).toBe(400);
  expect(((await res.json()) as { error: string }).error).toMatch(/larga/i);
});

test("POST sin operarioId es 400", async () => {
  expect((await post({ pedido: "AR.1", texto: "hola" })).status).toBe(400);
});

test("POST sin pedido es 400", async () => {
  expect((await post({ operarioId: "jaime", texto: "hola" })).status).toBe(400);
});

test("un cuerpo que no es JSON es 400 y no un 500", async () => {
  const res = await ruta.POST(new Request("http://x/api/notas", { method: "POST", body: "{{{" }));
  expect(res.status).toBe(400);
});

test("PATCH cambia la mía", async () => {
  const n = notasDb.crearNota("AR.1", "jaime", "antes", "2026-08-24T09:00:00.000Z");
  const res = await patch({ id: n.id, operarioId: "jaime", texto: "después" });
  expect(res.status).toBe(200);
  expect(notasDb.leerNotas("AR.1")[0].texto).toBe("después");
});

test("PATCH sobre la de otro es 403 y no la toca", async () => {
  const n = notasDb.crearNota("AR.1", "jaime", "mía", "2026-08-24T09:00:00.000Z");
  const res = await patch({ id: n.id, operarioId: "ivan", texto: "te la cambio" });
  expect(res.status).toBe(403);
  expect(notasDb.leerNotas("AR.1")[0].texto).toBe("mía");
});

test("DELETE quita la mía", async () => {
  const n = notasDb.crearNota("AR.1", "jaime", "fuera", "2026-08-24T09:00:00.000Z");
  expect((await del({ id: n.id, operarioId: "jaime" })).status).toBe(200);
  expect(notasDb.leerNotas("AR.1")).toEqual([]);
});

test("DELETE sobre la de otro es 403 y no la toca", async () => {
  const n = notasDb.crearNota("AR.1", "jaime", "mía", "2026-08-24T09:00:00.000Z");
  expect((await del({ id: n.id, operarioId: "ivan" })).status).toBe(403);
  expect(notasDb.leerNotas("AR.1")).toHaveLength(1);
});

test("PATCH o DELETE con un id que no es número es 400", async () => {
  expect((await patch({ id: "ocho", operarioId: "jaime", texto: "x" })).status).toBe(400);
  expect((await del({ id: null, operarioId: "jaime" })).status).toBe(400);
});
```

- [ ] **Step 2: Correr el test y ver que falla**

Run: `npx vitest run src/lib/__tests__/api-notas.test.ts`
Expected: FAIL — `Failed to resolve import "../../app/api/notas/route"`.

- [ ] **Step 3: Escribir la ruta**

Crear `src/app/api/notas/route.ts`:

```ts
import { NextResponse } from "next/server";
import { NOTA_MAX, validarTexto } from "@/lib/nota-pedido";
import { borrarNota, crearNota, editarNota, leerNotas } from "@/lib/server/notas-db";

// ─── /api/notas ──────────────────────────────────────────────────────────────
// El hilo de notas de un pedido. Cuatro verbos en un fichero, como hace
// /api/fichaje: son la misma cosa vista de cuatro maneras y separarlos en rutas
// anidadas solo repartiría la validación.
//
// El hilo NO viaja en el tablero: se pide al abrir el pedido. El tablero se
// refresca cada 30 s con 81 pedidos y mandar los hilos en cada vuelta sería
// peso muerto.
//
// Sin login, el `operarioId` lo manda el navegador (mismo modelo que el
// fichaje). Editar y borrar comprueban la propiedad en la sentencia SQL, así
// que esto para el accidente; no al que quiera saltárselo a propósito.

export const dynamic = "force-dynamic";

/** Un código de pedido cabe de sobra: "AR.26.03914" son 11 caracteres y el
 *  sintético de una OF suelta ronda los 12. El tope está para que no entre un
 *  texto entero por el sitio de la clave. */
const PEDIDO_MAX = 60;

const noJson = () => NextResponse.json({ error: "JSON inválido" }, { status: 400 });

async function cuerpo(req: Request): Promise<Record<string, unknown> | null> {
  try {
    const b: unknown = await req.json();
    // Un JSON que no sea objeto (el literal `null`, un número) parsea sin
    // error: sin esta guarda, leerle una propiedad reventaría con un 500.
    return typeof b === "object" && b !== null ? (b as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/** Cadena corta y no vacía, o null. Vale para el pedido y para el operario. */
const clave = (v: unknown): string | null =>
  typeof v === "string" && v.length > 0 && v.length <= PEDIDO_MAX ? v : null;

/** El 400 de un texto que no vale, con el motivo escrito: "no has puesto nada"
 *  y "te has pasado" se arreglan de formas distintas. */
function errorTexto(motivo: "vacio" | "largo") {
  return NextResponse.json(
    {
      error:
        motivo === "vacio"
          ? "La nota está vacía"
          : `La nota es demasiado larga: no puede pasar de ${NOTA_MAX} caracteres`,
    },
    { status: 400 },
  );
}

export async function GET(req: Request) {
  const pedido = clave(new URL(req.url).searchParams.get("pedido"));
  if (!pedido) return NextResponse.json({ error: "Falta pedido" }, { status: 400 });
  return NextResponse.json(
    { notas: leerNotas(pedido) },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function POST(req: Request) {
  const b = await cuerpo(req);
  if (!b) return noJson();
  const pedido = clave(b.pedido);
  const operarioId = clave(b.operarioId);
  if (!pedido) return NextResponse.json({ error: "Falta pedido" }, { status: 400 });
  if (!operarioId) return NextResponse.json({ error: "Falta operarioId" }, { status: 400 });

  const v = validarTexto(b.texto);
  if (!v.ok) return errorTexto(v.motivo);
  return NextResponse.json({ nota: crearNota(pedido, operarioId, v.texto) });
}

/** Id de una nota: entero, tal como lo devolvió el POST. */
const idDe = (v: unknown): number | null =>
  typeof v === "number" && Number.isInteger(v) ? v : null;

export async function PATCH(req: Request) {
  const b = await cuerpo(req);
  if (!b) return noJson();
  const id = idDe(b.id);
  const operarioId = clave(b.operarioId);
  if (id === null) return NextResponse.json({ error: "Falta id" }, { status: 400 });
  if (!operarioId) return NextResponse.json({ error: "Falta operarioId" }, { status: 400 });

  const v = validarTexto(b.texto);
  if (!v.ok) return errorTexto(v.motivo);
  // 403 y no 404: desde fuera no se distingue "no era tuya" de "ya no está", y
  // decir cuál de las dos es sería contar algo de una nota que no es tuya.
  return editarNota(id, operarioId, v.texto)
    ? NextResponse.json({ ok: true })
    : NextResponse.json({ error: "Esa nota no es tuya" }, { status: 403 });
}

export async function DELETE(req: Request) {
  const b = await cuerpo(req);
  if (!b) return noJson();
  const id = idDe(b.id);
  const operarioId = clave(b.operarioId);
  if (id === null) return NextResponse.json({ error: "Falta id" }, { status: 400 });
  if (!operarioId) return NextResponse.json({ error: "Falta operarioId" }, { status: 400 });

  return borrarNota(id, operarioId)
    ? NextResponse.json({ ok: true })
    : NextResponse.json({ error: "Esa nota no es tuya" }, { status: 403 });
}
```

- [ ] **Step 4: Correr el test y ver que pasa**

Run: `npx vitest run src/lib/__tests__/api-notas.test.ts`
Expected: PASS, 13 tests.

- [ ] **Step 5: Comprobar y commitear**

```bash
npx tsc --noEmit && npx eslint src && npx vitest run
git add src/app/api/notas/route.ts src/lib/__tests__/api-notas.test.ts
git commit -m "feat(notas): ruta /api/notas con los cuatro verbos y la propiedad comprobada en SQL"
```

---

### Task 4: El componente del hilo

**Files:**
- Create: `src/components/NotasPedido.tsx`

**Interfaces:**
- Consumes: `NotaPedido`, `NOTA_MAX`, `fmtCuandoNota` de `@/lib/nota-pedido`; `OpDot` de `./Select`; `ConfirmDialog` de `./ConfirmDialog`; `Operario` de `@/lib/types`.
- Produces: `<NotasPedido pedido={string} miId={string | null} operarios={Operario[]} soloLectura?={boolean} />`.

**Nota para quien lo implemente:** este repo NO tiene tests de componentes — todas las pruebas son de `lib/` y de rutas. No montes un runner de React aquí; la comprobación de esta tarea es `tsc` + `eslint`, y la de verdad es el repaso en el navegador de la Task 5.

- [ ] **Step 1: Escribir el componente**

Crear `src/components/NotasPedido.tsx`:

```tsx
"use client";

import { useCallback, useEffect, useState } from "react";
import type { Operario } from "@/lib/types";
import { NOTA_MAX, fmtCuandoNota, type NotaPedido } from "@/lib/nota-pedido";
import { OpDot } from "./Select";
import { ConfirmDialog } from "./ConfirmDialog";

// ─── El hilo de notas de un pedido ───────────────────────────────────────────
// El post-it que pidió Ángel: lo que sabe OT y no está en ningún campo de RPS
// —"falta confirmar el color", "hablar con Juan José antes de cortar"— para que
// no se pierda al pasar el trabajo a otro.
//
// Hilo y no una nota que se reescribe: al traspasar hace falta saber QUIÉN dijo
// qué y CUÁNDO, y con un solo texto el segundo que escribe borra al primero.
//
// El hilo se pide al abrir el pedido y se recarga al guardar. NO hay sondeo: si
// otro escribe mientras lo tienes abierto, lo ves al volver a abrirlo. Para
// seis personas y notas de dos líneas, montar tiempo real no compensa.

export function NotasPedido({
  pedido,
  miId,
  operarios,
  soloLectura = false,
}: {
  /** CÓDIGO del pedido ("AR.26.03914"), no su id interno: es lo que sobrevive
   *  al paso al Historial, donde el id cambia. */
  pedido: string;
  miId: string | null;
  operarios: Operario[];
  /** El Historial no escribe: el pedido ya está cerrado para OT. */
  soloLectura?: boolean;
}) {
  const [notas, setNotas] = useState<NotaPedido[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [borrador, setBorrador] = useState("");
  const [escribiendo, setEscribiendo] = useState(false);
  const [editando, setEditando] = useState<{ id: number; texto: string } | null>(null);
  const [borrando, setBorrando] = useState<NotaPedido | null>(null);
  const [guardando, setGuardando] = useState(false);

  const cargar = useCallback(async () => {
    try {
      const r = await fetch(`/api/notas?pedido=${encodeURIComponent(pedido)}`, {
        cache: "no-store",
      });
      if (!r.ok) throw new Error(String(r.status));
      const d = (await r.json()) as { notas: NotaPedido[] };
      setNotas(d.notas);
      setError(null);
    } catch {
      setNotas([]);
      setError("No se pudieron cargar las notas.");
    }
  }, [pedido]);

  useEffect(() => {
    // Diferido con setTimeout(0), como en HistorialDrawer: un efecto no puede
    // llamar a setState de forma síncrona (react-hooks/set-state-in-effect).
    const id = setTimeout(() => {
      setNotas(null);
      setEditando(null);
      setEscribiendo(false);
      setBorrador("");
      void cargar();
    }, 0);
    return () => clearTimeout(id);
  }, [cargar]);

  /** Manda el cambio y recarga el hilo. Devuelve si salió bien, para que quien
   *  llama sepa si puede cerrar su editor. */
  async function mandar(init: RequestInit): Promise<boolean> {
    setGuardando(true);
    try {
      const r = await fetch("/api/notas", {
        headers: { "Content-Type": "application/json" },
        ...init,
      });
      if (!r.ok) {
        const d = (await r.json().catch(() => null)) as { error?: string } | null;
        setError(d?.error ?? "No se pudo guardar.");
        return false;
      }
      setError(null);
      await cargar();
      return true;
    } catch {
      setError("No se pudo guardar. Comprueba la conexión.");
      return false;
    } finally {
      setGuardando(false);
    }
  }

  const opPorId = (id: string) => operarios.find((o) => o.id === id) ?? null;
  const ahora = new Date().toISOString();
  const puedeEscribir = !soloLectura && miId !== null;

  return (
    <div className="mb-4 rounded-xl border border-[var(--glass-border)] bg-[var(--glass-highlight)] p-3">
      <div className="mb-2 flex items-baseline gap-2">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-text-muted">
          Notas{notas && notas.length > 0 ? ` (${notas.length})` : ""}
        </p>
        {/* El botón sale SIEMPRE que se pueda escribir, también con el hilo
            vacío: si no, nadie descubre que esto existe. */}
        {puedeEscribir && !escribiendo && editando === null && (
          <button
            type="button"
            onClick={() => setEscribiendo(true)}
            className="ml-auto rounded-lg border border-border px-2 py-0.5 text-[11px] font-semibold text-text-muted hover:border-border-strong hover:text-text"
          >
            + Añadir
          </button>
        )}
      </div>

      {notas === null && <p className="text-[11px] text-text-muted">Cargando notas…</p>}

      {notas !== null && notas.length === 0 && !escribiendo && (
        <p className="text-[11px] leading-snug text-text-muted">
          Sin notas. Aquí se apunta lo que hay que saber de este pedido y no está en RPS.
        </p>
      )}

      <ul className="space-y-2">
        {(notas ?? []).map((n) => {
          const op = opPorId(n.operarioId);
          const mia = n.operarioId === miId;
          if (editando?.id === n.id) {
            return (
              <li key={n.id}>
                <Editor
                  valor={editando.texto}
                  guardando={guardando}
                  onCambio={(texto) => setEditando({ id: n.id, texto })}
                  onGuardar={async () => {
                    const ok = await mandar({
                      method: "PATCH",
                      body: JSON.stringify({ id: n.id, operarioId: miId, texto: editando.texto }),
                    });
                    if (ok) setEditando(null);
                  }}
                  onCancelar={() => setEditando(null)}
                />
              </li>
            );
          }
          return (
            <li key={n.id} className="flex gap-2">
              {op ? (
                <OpDot color={op.color} iniciales={op.iniciales} />
              ) : (
                // Quien ya no está en la plantilla no tiene color ni iniciales,
                // pero su nota sigue valiendo: hueco del mismo tamaño para que
                // las filas no bailen.
                <span className="size-4.5 shrink-0 rounded-full ring-1 ring-inset ring-border" />
              )}
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-baseline gap-x-1.5 text-[11px]">
                  <span className="font-semibold text-text">{op?.nombre ?? n.operarioId}</span>
                  <span className="text-text-muted">· {fmtCuandoNota(n.creadoAt, ahora)}</span>
                  {n.editadoAt && (
                    <span
                      className="text-text-muted"
                      title={`Editada el ${fmtCuandoNota(n.editadoAt, ahora)}`}
                    >
                      · editado
                    </span>
                  )}
                  {mia && !soloLectura && (
                    <span className="ml-auto flex shrink-0 gap-2">
                      <button
                        type="button"
                        onClick={() => setEditando({ id: n.id, texto: n.texto })}
                        className="text-[10px] font-semibold text-text-muted hover:text-text"
                      >
                        Editar
                      </button>
                      <button
                        type="button"
                        onClick={() => setBorrando(n)}
                        className="text-[10px] font-semibold text-text-muted hover:text-red-600 dark:hover:text-red-400"
                      >
                        Borrar
                      </button>
                    </span>
                  )}
                </p>
                <p className="whitespace-pre-line text-[13px] leading-snug text-text">{n.texto}</p>
              </div>
            </li>
          );
        })}
      </ul>

      {puedeEscribir && escribiendo && editando === null && (
        <div className="mt-2">
          <Editor
            valor={borrador}
            guardando={guardando}
            onCambio={setBorrador}
            onGuardar={async () => {
              const ok = await mandar({
                method: "POST",
                body: JSON.stringify({ pedido, operarioId: miId, texto: borrador }),
              });
              if (ok) {
                setBorrador("");
                setEscribiendo(false);
              }
            }}
            onCancelar={() => {
              setBorrador("");
              setEscribiendo(false);
            }}
          />
        </div>
      )}

      {error && (
        <p className="mt-1.5 text-[11px] text-red-600 dark:text-red-400" role="alert">
          {error}
        </p>
      )}

      <ConfirmDialog
        abierto={borrando !== null}
        titulo="Borrar la nota"
        tono="peligro"
        mensaje={`Se quita del hilo:\n\n"${borrando?.texto.slice(0, 160) ?? ""}"`}
        onConfirmar={() => {
          const n = borrando;
          setBorrando(null);
          if (n) {
            void mandar({
              method: "DELETE",
              body: JSON.stringify({ id: n.id, operarioId: miId }),
            });
          }
        }}
        onCancelar={() => setBorrando(null)}
      />
    </div>
  );
}

/** El cuadro de escribir, el mismo para una nota nueva y para editar una. */
function Editor({
  valor,
  onCambio,
  onGuardar,
  onCancelar,
  guardando,
}: {
  valor: string;
  onCambio: (v: string) => void;
  onGuardar: () => void;
  onCancelar: () => void;
  guardando: boolean;
}) {
  const largo = valor.trim().length;
  const vacio = largo === 0;
  const pasado = largo > NOTA_MAX;
  return (
    <div>
      <textarea
        value={valor}
        autoFocus
        rows={3}
        onChange={(e) => onCambio(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape") onCancelar();
          // Ctrl/Cmd+Enter guarda: el Enter suelto hace falta para el salto de
          // línea, que estas notas suelen llevar más de una.
          if (e.key === "Enter" && (e.ctrlKey || e.metaKey) && !vacio && !pasado) onGuardar();
        }}
        placeholder="Lo que hay que saber de este pedido…"
        className="w-full rounded-lg border border-border bg-surface px-2 py-1.5 text-[13px] leading-snug text-text"
      />
      <div className="mt-1 flex items-center gap-2">
        <button
          type="button"
          onClick={onGuardar}
          disabled={vacio || pasado || guardando}
          className="rounded-lg bg-teal-600 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-teal-700 disabled:opacity-50"
        >
          {guardando ? "Guardando…" : "Guardar"}
        </button>
        <button
          type="button"
          onClick={onCancelar}
          className="rounded-lg border border-border px-2.5 py-1 text-[11px] font-semibold text-text-muted hover:text-text"
        >
          Cancelar
        </button>
        {pasado && (
          <span className="text-[10px] text-red-600 dark:text-red-400">
            {largo} de {NOTA_MAX} caracteres
          </span>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Comprobar que compila y pasa el lint**

Run: `npx tsc --noEmit && npx eslint src/components/NotasPedido.tsx`
Expected: sin errores y sin warnings. Si sale `react-hooks/set-state-in-effect`, es que se ha perdido el `setTimeout(..., 0)` del efecto: volver a ponerlo.

- [ ] **Step 3: Commitear**

```bash
git add src/components/NotasPedido.tsx
git commit -m "feat(notas): el componente del hilo, con editar y borrar lo propio"
```

---

### Task 5: Montarlo en las dos fichas

**Files:**
- Modify: `src/components/Drawer.tsx` (después del bloque `{pedido.comentarioVenta && (...)}`, antes del comentario `{/* asignar autor del pedido entero */}`)
- Modify: `src/components/HistorialDrawer.tsx` (después del bloque `{detalle.comentarioVenta && (...)}`)

**Interfaces:**
- Consumes: `<NotasPedido />` de la Task 4.
- Produces: nada nuevo hacia fuera.

- [ ] **Step 1: Montarlo en el Drawer del tablero**

En `src/components/Drawer.tsx`, añadir el import junto a los de componentes:

```tsx
import { NotasPedido } from "./NotasPedido";
```

Y justo DESPUÉS del bloque que pinta `pedido.comentarioVenta` y ANTES del comentario `{/* asignar autor del pedido entero */}`, insertar:

```tsx
          {/* El hilo de notas de OT. Va aquí, entre lo que dijo el comercial y
              lo que se decide, porque es contexto: primero se lee de qué va
              esto y después se actúa.
              Panel, Pendientes y Revisiones abren ESTE mismo Drawer, así que el
              revisor ve el hilo al abrir el pedido sin nada más que hacer. */}
          <NotasPedido pedido={pedido.codigo} miId={miId} operarios={operarios} />
```

- [ ] **Step 2: Montarlo en el Historial, de solo lectura**

En `src/components/HistorialDrawer.tsx`, añadir el import:

```tsx
import { NotasPedido } from "./NotasPedido";
```

Y justo después del bloque que pinta `detalle.comentarioVenta`, insertar:

```tsx
              {/* Solo lectura: el pedido ya está cerrado para OT y una nota que
                  no cambia nada sería ruido. El momento de dejar el recado es
                  antes de pasarlo, y eso lo cubre el Drawer del tablero.
                  `pedido` aquí ya es el CÓDIGO (es lo que recibe este drawer),
                  que es justo la clave con la que se guardó la nota.
                  La prop es `string | null`, pero el `if (!pedido) return null`
                  de arriba ya la estrechó para todo lo que va debajo. */}
              <NotasPedido pedido={pedido} miId={null} operarios={[]} soloLectura />
```

- [ ] **Step 3: Comprobar que compila, pasa el lint y los tests**

```bash
npx tsc --noEmit && npx eslint src && npx vitest run
```
Expected: sin errores, sin warnings, todos los tests en verde.

- [ ] **Step 4: Probarlo en el navegador**

```bash
npx next dev -p 4321
```

Con el servidor arriba, comprobar a mano en `http://localhost:4321`:

1. `?v=asignar` → abrir un pedido → sale el bloque **Notas** con "Sin notas" y el botón **+ Añadir**.
2. Escribir una nota y guardar → aparece con la cara, el nombre y "hoy HH:MM".
3. **Editar** → el texto cambia y sale "· editado".
4. **Borrar** → sale el diálogo de confirmación; al confirmar, la nota desaparece del hilo.
5. Cerrar el pedido y volver a abrirlo → la nota sigue ahí.
6. `?v=revision` → abrir el MISMO pedido → se ve la misma nota (es el mismo Drawer).
7. `?v=historial` → abrir un pedido ya pasado → el bloque sale **sin** "+ Añadir" y **sin** "Editar/Borrar".
8. **La prueba que justifica el diseño:** dejar una nota en un pedido del tablero, pasarlo a Producción, y buscarlo después en el Historial. El hilo tiene que seguir ahí — es la razón de que la clave sea el código y no el id.

- [ ] **Step 5: Commitear**

```bash
git add src/components/Drawer.tsx src/components/HistorialDrawer.tsx
git commit -m "feat(notas): el hilo en la ficha del pedido y en la del historial"
```
