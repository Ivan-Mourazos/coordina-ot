# Historial permanente (RPS, paginado) — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** El Historial muestra todos los pedidos finalizados por OT desde RPS, paginado, con búsqueda y rango de fechas, y detalle (tiempos imputados + quién) al expandir cada pedido.

**Architecture:** Una capa de datos server nueva (`historial-db.ts`) consulta RPS con la query validada (señal `tgm_estadosof_olanet.idestadoof=3`, OFFSET/FETCH). Tipos y helpers puros (constructor de filtros parametrizados, mapeo fila→objeto) viven en un módulo client-safe. Dos route handlers exponen página y detalle. `HistorialView` deja de derivar del tablero y se vuelve autónomo: fetch paginado con scroll infinito y detalle lazy.

**Tech Stack:** Next.js 16 (App Router route handlers), mssql (pool en `db.ts`), better-sqlite3 (no aquí), TypeScript, Vitest.

## Global Constraints

- Node ≥ 22, pnpm ≥ 11.
- **Solo lectura sobre RPS.** Ninguna escritura.
- **Nunca interpolar valores de usuario en SQL**: parámetros mssql (`request.input(nombre, valor)`). La única interpolación permitida es de identificadores fijos del propio código.
- Señal de finalización = `dbo.tgm_estadosof_olanet.idestadoof = 3`, agrupado por `FACOrderSL.CodOrder`. Empresa fija `CodCompany = '001'`.
- Paginación **OFFSET/FETCH**, page size fijo en server = **40**; `hasMore` pidiendo `size + 1` filas (sin COUNT aparte).
- Códigos de pedido NO son solo `AR.*` (hay `BE.*`, `SA.*`…): aceptar cualquiera; patrón de validación `^[A-Z]{2}\.\d{2}\.\d{5}$`.
- Modo `DATASOURCE=mock` debe funcionar sin BD (fallback desde el mock).
- Tests con Vitest en `src/lib/__tests__/`, `pnpm test`.
- Reutilizar patrones existentes: `getPool` de [db.ts](../../../src/lib/server/db.ts); query de imputaciones OT (recurso `a-otec`/`otec-a`) de [rps.ts:414-429](../../../src/lib/server/rps.ts); `operarioDeEmpleado` de [operarios.ts](../../../src/lib/server/operarios.ts).

---

### Task 1: Tipos + helpers puros del historial

Tipos compartidos y las piezas con lógica pura (constructor de cláusulas de
filtro parametrizadas y mapeo de fila→objeto), aisladas y testeables sin BD.

**Files:**
- Create: `src/lib/historial.ts`
- Test: `src/lib/__tests__/historial.test.ts`

**Interfaces:**
- Produces:
  - `interface HistorialFiltros { page: number; q?: string; desde?: string; hasta?: string }`
  - `interface HistorialItem { pedido: string; cliente: string | null; finalizada: string; nOf: number }`
  - `interface HistorialOF { codigo: string; descripcion: string; tiempoImputadoMin: number; quien: string[] }`
  - `interface FilaPagina { pedido: string; finalizada: Date | string | null; cliente: string | null; n_of: number }`
  - `const PAGE_SIZE = 40`
  - `function construirFiltros(f: HistorialFiltros): { clausulas: string[]; params: Array<{ nombre: string; valor: string }> }`
  - `function filaAItem(fila: FilaPagina): HistorialItem`
  - `const CODIGO_PEDIDO_RE = /^[A-Z]{2}\.\d{2}\.\d{5}$/`

- [ ] **Step 1: Escribir el test que falla**

Crea `src/lib/__tests__/historial.test.ts`:

```ts
import { expect, test } from "vitest";
import { construirFiltros, filaAItem, CODIGO_PEDIDO_RE } from "../historial";

test("sin filtros no genera cláusulas ni params", () => {
  const r = construirFiltros({ page: 0 });
  expect(r.clausulas).toEqual([]);
  expect(r.params).toEqual([]);
});

test("q genera cláusula LIKE parametrizada sobre pedido y cliente", () => {
  const r = construirFiltros({ page: 0, q: "MAHOU" });
  expect(r.clausulas).toHaveLength(1);
  expect(r.clausulas[0]).toMatch(/p\.pedido LIKE @q OR cli\.Description LIKE @q/);
  expect(r.params).toContainEqual({ nombre: "q", valor: "%MAHOU%" });
});

test("desde/hasta generan cláusulas de rango parametrizadas", () => {
  const r = construirFiltros({ page: 0, desde: "2026-01-01", hasta: "2026-02-01" });
  expect(r.params).toContainEqual({ nombre: "desde", valor: "2026-01-01" });
  expect(r.params).toContainEqual({ nombre: "hasta", valor: "2026-02-01" });
  expect(r.clausulas.some((c) => c.includes("p.finalizada >= @desde"))).toBe(true);
  expect(r.clausulas.some((c) => c.includes("p.finalizada < @hasta"))).toBe(true);
});

test("q vacío o solo espacios se ignora", () => {
  expect(construirFiltros({ page: 0, q: "   " }).clausulas).toEqual([]);
});

test("filaAItem normaliza fecha a ISO y recorta el pedido", () => {
  const item = filaAItem({
    pedido: " AR.26.03453 ", finalizada: new Date("2026-07-22T13:04:06.887Z"),
    cliente: "MAHOU, S.A.", n_of: 13,
  });
  expect(item).toEqual({
    pedido: "AR.26.03453", cliente: "MAHOU, S.A.",
    finalizada: "2026-07-22T13:04:06.887Z", nOf: 13,
  });
});

test("CODIGO_PEDIDO_RE acepta AR/BE/SA y rechaza basura", () => {
  expect(CODIGO_PEDIDO_RE.test("AR.26.03453")).toBe(true);
  expect(CODIGO_PEDIDO_RE.test("BE.25.01165")).toBe(true);
  expect(CODIGO_PEDIDO_RE.test("'; DROP TABLE x --")).toBe(false);
});
```

- [ ] **Step 2: Ejecutar el test y verificar que falla**

Run: `pnpm test historial`
Expected: FAIL (`Cannot find module '../historial'`).

- [ ] **Step 3: Implementar `historial.ts`**

Crea `src/lib/historial.ts`:

```ts
// ─── Historial permanente: tipos + lógica pura (client-safe) ─────────────────
// Sin acceso a BD: solo los tipos que comparten API y UI, el constructor de
// cláusulas de filtro (parametrizadas, NUNCA interpoladas) y el mapeo de fila.

export const PAGE_SIZE = 40;

/** Códigos de pedido de cualquier serie (AR/BE/SA…): 2 letras . 2 díg . 5 díg. */
export const CODIGO_PEDIDO_RE = /^[A-Z]{2}\.\d{2}\.\d{5}$/;

export interface HistorialFiltros {
  page: number;
  q?: string; // busca en código de pedido o nombre de cliente
  desde?: string; // ISO yyyy-mm-dd (inclusive)
  hasta?: string; // ISO yyyy-mm-dd (exclusivo)
}

export interface HistorialItem {
  pedido: string;
  cliente: string | null;
  finalizada: string; // ISO
  nOf: number;
}

export interface HistorialOF {
  codigo: string;
  descripcion: string;
  tiempoImputadoMin: number;
  quien: string[]; // nombres (operario mapeado o código de empleado)
}

/** Fila cruda de la query de página (antes de mapear). */
export interface FilaPagina {
  pedido: string;
  finalizada: Date | string | null;
  cliente: string | null;
  n_of: number;
}

/** Cláusulas AND parametrizadas para el WHERE de la página. Los valores van
 *  como params mssql (request.input), nunca interpolados. */
export function construirFiltros(f: HistorialFiltros): {
  clausulas: string[];
  params: Array<{ nombre: string; valor: string }>;
} {
  const clausulas: string[] = [];
  const params: Array<{ nombre: string; valor: string }> = [];

  const q = f.q?.trim();
  if (q) {
    clausulas.push("(p.pedido LIKE @q OR cli.Description LIKE @q)");
    params.push({ nombre: "q", valor: `%${q}%` });
  }
  if (f.desde?.trim()) {
    clausulas.push("p.finalizada >= @desde");
    params.push({ nombre: "desde", valor: f.desde.trim() });
  }
  if (f.hasta?.trim()) {
    clausulas.push("p.finalizada < @hasta");
    params.push({ nombre: "hasta", valor: f.hasta.trim() });
  }
  return { clausulas, params };
}

export function filaAItem(fila: FilaPagina): HistorialItem {
  const finalizada =
    fila.finalizada instanceof Date
      ? fila.finalizada.toISOString()
      : (fila.finalizada ?? "");
  return {
    pedido: (fila.pedido ?? "").trim(),
    cliente: fila.cliente,
    finalizada,
    nOf: fila.n_of ?? 0,
  };
}
```

- [ ] **Step 4: Ejecutar el test y verificar que pasa**

Run: `pnpm test historial`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/historial.ts src/lib/__tests__/historial.test.ts
git commit -m "feat(historial): tipos y helpers puros (filtros parametrizados + mapeo)"
```

---

### Task 2: Capa de datos server (`historial-db.ts`) + fallback mock

Las dos funciones que consultan RPS (página y detalle) y su equivalente mock.
La query de página está validada por el spike; la de detalle se verifica contra
la BD real con un script antes de confiar en ella.

**Files:**
- Create: `src/lib/server/historial-db.ts`
- Create (temporal, NO commitear): un script de verificación de la query de detalle
- Modify: `.gitignore` no hace falta (el script va al scratchpad, fuera del repo)

**Interfaces:**
- Consumes: `getPool` de `db.ts`; `PAGE_SIZE`, `construirFiltros`, `filaAItem`, tipos de `historial.ts`; `operarioDeEmpleado` de `operarios.ts`; `PEDIDOS` de `../mock`.
- Produces:
  - `async function leerHistorialPagina(f: HistorialFiltros): Promise<{ pedidos: HistorialItem[]; hasMore: boolean }>`
  - `async function leerHistorialPedido(pedido: string): Promise<HistorialOF[]>`

- [ ] **Step 1: Verificar la query de DETALLE contra la BD real (spike)**

La query de página ya está validada. La de detalle NO. Antes de escribirla en el
código, verifica su forma y rendimiento. Crea en el **scratchpad** (fuera del
repo) `spike-detalle.mjs` y ejecútalo con las credenciales reales
(`node --env-file=.env.local`). Copia esta query dentro de un `pool.request().query(...)`
sustituyendo `@pedido` por un pedido real que exista (p.ej. `'AR.26.03365'`):

```sql
SELECT mo.CodManufacturingOrder AS orden, mo.Description AS descripcion,
       e.CodEmployee AS empleado, SUM(i.ExecutionTime) AS minutos
FROM dbo.FACOrderSL o
JOIN dbo.FACOrderLineSL l ON l.IDOrder = o.IDOrder
JOIN dbo.CPRManufacturingOrder mo
  ON mo.IDManufacturingOrder = l.IDManufacturingOrder AND mo.CodCompany = '001'
JOIN dbo.CPRMOTask t ON t.IDManufacturingOrder = mo.IDManufacturingOrder
LEFT JOIN dbo.CPRImputationMO i
  ON i.IDMOTask = t.IDMOTask AND i.IDManufacturingOrder = mo.IDManufacturingOrder
LEFT JOIN dbo.GENEmployee e ON e.IDEmployee = i.IDEmployeeMachineTool
WHERE o.CodOrder = 'AR.26.03365' AND o.CodCompany = '001'
  AND EXISTS (
    SELECT 1 FROM dbo.CPRMOResourceMachine rm
    WHERE rm.IDMOTask = t.IDMOTask AND rm.CodMOResourceMachine IN ('a-otec','otec-a')
  )
GROUP BY mo.CodManufacturingOrder, mo.Description, e.CodEmployee
```

Confirma: (a) devuelve filas (OF con minutos y empleado), (b) tarda poco (<1 s),
(c) `minutos` es coherente. Si la forma difiere (columnas, duplicados por líneas),
ajusta la query aquí ANTES de seguir y anota el resultado. Si el pedido de prueba
no tiene imputaciones, prueba con otro de la primera página del historial.
Borra el script del scratchpad al terminar. **No dependas de la memoria: usa lo
que devuelva la BD.**

- [ ] **Step 2: Implementar `historial-db.ts`**

Crea `src/lib/server/historial-db.ts` (ajusta la query de detalle a lo que
confirmaste en el Step 1 si hizo falta):

```ts
import { getPool } from "./db";
import { operarioDeEmpleado } from "./operarios";
import { PEDIDOS } from "../mock";
import {
  PAGE_SIZE,
  construirFiltros,
  filaAItem,
  type FilaPagina,
  type HistorialFiltros,
  type HistorialItem,
  type HistorialOF,
} from "../historial";

// ─── Historial permanente: acceso a RPS (solo lectura) ───────────────────────
// Señal de finalización: tgm_estadosof_olanet.idestadoof=3, agrupado por pedido.
// Paginación OFFSET/FETCH (validada: <1 s incluso en profundidad). En modo mock
// se sirve un historial derivado de los pedidos mock, para desarrollo sin BD.

const ES_MOCK = process.env.DATASOURCE !== "rps";

export async function leerHistorialPagina(
  f: HistorialFiltros,
): Promise<{ pedidos: HistorialItem[]; hasMore: boolean }> {
  if (ES_MOCK) return paginaMock(f);

  const { clausulas, params } = construirFiltros(f);
  const where = clausulas.length ? `WHERE ${clausulas.join(" AND ")}` : "";
  const off = Math.max(0, f.page) * PAGE_SIZE;

  const pool = await getPool();
  const req = pool.request();
  for (const p of params) req.input(p.nombre, p.valor);
  req.input("off", off);
  req.input("size", PAGE_SIZE + 1); // una fila extra para saber si hay más

  const r = await req.query<FilaPagina>(`
    ;WITH FinOT AS (
      SELECT e.orden, MAX(e.fecha_cambio) AS fin
      FROM dbo.tgm_estadosof_olanet e
      WHERE e.idestadoof = 3
      GROUP BY e.orden
    ),
    PedFin AS (
      SELECT o.CodOrder AS pedido, MAX(f.fin) AS finalizada,
             MAX(o.IDCustomer) AS idc,
             COUNT(DISTINCT mo.IDManufacturingOrder) AS n_of
      FROM FinOT f
      JOIN dbo.CPRManufacturingOrder mo
        ON mo.CodManufacturingOrder = f.orden AND mo.CodCompany = '001'
      JOIN dbo.FACOrderLineSL l ON l.IDManufacturingOrder = mo.IDManufacturingOrder
      JOIN dbo.FACOrderSL o ON o.IDOrder = l.IDOrder AND o.CodCompany = '001'
      GROUP BY o.CodOrder
    )
    SELECT p.pedido, p.finalizada, p.n_of, cli.Description AS cliente
    FROM PedFin p
    LEFT JOIN dbo.FACCustomer cli ON cli.IDCustomer = p.idc
    ${where}
    ORDER BY p.finalizada DESC
    OFFSET @off ROWS FETCH NEXT @size ROWS ONLY
  `);

  const filas = r.recordset;
  const hasMore = filas.length > PAGE_SIZE;
  const pedidos = filas.slice(0, PAGE_SIZE).map(filaAItem);
  return { pedidos, hasMore };
}

interface FilaDetalle {
  orden: string | null;
  descripcion: string | null;
  empleado: string | null;
  minutos: number | null;
}

export async function leerHistorialPedido(pedido: string): Promise<HistorialOF[]> {
  if (ES_MOCK) return detalleMock(pedido);

  const pool = await getPool();
  const r = await pool
    .request()
    .input("pedido", pedido)
    .query<FilaDetalle>(`
      SELECT mo.CodManufacturingOrder AS orden, mo.Description AS descripcion,
             e.CodEmployee AS empleado, SUM(i.ExecutionTime) AS minutos
      FROM dbo.FACOrderSL o
      JOIN dbo.FACOrderLineSL l ON l.IDOrder = o.IDOrder
      JOIN dbo.CPRManufacturingOrder mo
        ON mo.IDManufacturingOrder = l.IDManufacturingOrder AND mo.CodCompany = '001'
      JOIN dbo.CPRMOTask t ON t.IDManufacturingOrder = mo.IDManufacturingOrder
      LEFT JOIN dbo.CPRImputationMO i
        ON i.IDMOTask = t.IDMOTask AND i.IDManufacturingOrder = mo.IDManufacturingOrder
      LEFT JOIN dbo.GENEmployee e ON e.IDEmployee = i.IDEmployeeMachineTool
      WHERE o.CodOrder = @pedido AND o.CodCompany = '001'
        AND EXISTS (
          SELECT 1 FROM dbo.CPRMOResourceMachine rm
          WHERE rm.IDMOTask = t.IDMOTask AND rm.CodMOResourceMachine IN ('a-otec','otec-a')
        )
      GROUP BY mo.CodManufacturingOrder, mo.Description, e.CodEmployee
    `);

  // Agrupar por OF (orden): sumar minutos y juntar quién.
  const porOF = new Map<string, HistorialOF>();
  for (const fila of r.recordset) {
    const codigo = (fila.orden ?? "").trim();
    if (!codigo) continue;
    const of = porOF.get(codigo) ?? {
      codigo,
      descripcion: (fila.descripcion ?? "").trim(),
      tiempoImputadoMin: 0,
      quien: [] as string[],
    };
    of.tiempoImputadoMin += fila.minutos ?? 0;
    if (fila.empleado) {
      const nombre = operarioDeEmpleado(fila.empleado)?.nombre ?? fila.empleado.trim();
      if (nombre && !of.quien.includes(nombre)) of.quien.push(nombre);
    }
    porOF.set(codigo, of);
  }
  return [...porOF.values()];
}

// ── Fallback mock (desarrollo sin BD) ──
function pedidosFinalizadosMock(): HistorialItem[] {
  return PEDIDOS.filter((p) => p.ofs.length > 0 && p.ofs.every((o) => o.estado === "aprobada"))
    .map((p) => ({
      pedido: p.codigo,
      cliente: p.cliente,
      finalizada: `${p.fechaPlanificacion}T00:00:00.000Z`,
      nOf: p.ofs.length,
    }))
    .sort((a, b) => b.finalizada.localeCompare(a.finalizada));
}

function paginaMock(f: HistorialFiltros): { pedidos: HistorialItem[]; hasMore: boolean } {
  let todos = pedidosFinalizadosMock();
  const q = f.q?.trim().toLowerCase();
  if (q)
    todos = todos.filter(
      (p) => p.pedido.toLowerCase().includes(q) || (p.cliente ?? "").toLowerCase().includes(q),
    );
  if (f.desde?.trim()) todos = todos.filter((p) => p.finalizada >= f.desde!.trim());
  if (f.hasta?.trim()) todos = todos.filter((p) => p.finalizada < f.hasta!.trim());
  const off = Math.max(0, f.page) * PAGE_SIZE;
  const pagina = todos.slice(off, off + PAGE_SIZE + 1);
  return { pedidos: pagina.slice(0, PAGE_SIZE), hasMore: pagina.length > PAGE_SIZE };
}

function detalleMock(pedido: string): HistorialOF[] {
  const p = PEDIDOS.find((x) => x.codigo === pedido);
  if (!p) return [];
  return p.ofs.map((of) => ({
    codigo: of.codigo,
    descripcion: of.descripcion,
    tiempoImputadoMin: of.tiempoPlanteoMin + of.tiempoRevisionMin,
    quien: [],
  }));
}
```

- [ ] **Step 3: Verificar build y tipos**

Run: `pnpm build`
Expected: `Compiled successfully`, TypeScript limpio. (No hay test unitario de la
capa RPS: la query de página está validada por el spike y la de detalle por el
Step 1; el modo mock lo ejercita la Task 3.)

- [ ] **Step 4: Commit**

```bash
git add src/lib/server/historial-db.ts
git commit -m "feat(historial): capa de datos RPS (página paginada + detalle) con fallback mock"
```

---

### Task 3: API `/api/historial` (página) + `/api/historial/[pedido]` (detalle)

Route handlers finos: validan entrada y delegan en la capa de datos. Se testean
en modo mock (sin BD) llamando a los handlers directamente.

**Files:**
- Create: `src/app/api/historial/route.ts`
- Create: `src/app/api/historial/[pedido]/route.ts`
- Test: `src/lib/__tests__/api-historial.test.ts`

**Interfaces:**
- Consumes: `leerHistorialPagina`, `leerHistorialPedido` de `historial-db.ts`; `CODIGO_PEDIDO_RE` de `historial.ts`.
- Produces: `GET /api/historial?page=&q=&desde=&hasta=` → `{ pedidos, hasMore }`; `GET /api/historial/[pedido]` → `{ pedido, ofs }`.

- [ ] **Step 1: Escribir el test que falla**

Crea `src/lib/__tests__/api-historial.test.ts` (corre en modo mock: no fija
`DATASOURCE=rps`, así la capa usa el fallback):

```ts
import { expect, test } from "vitest";
import * as pagina from "../../app/api/historial/route";
import * as detalle from "../../app/api/historial/[pedido]/route";

test("GET página devuelve { pedidos, hasMore }", async () => {
  const res = await pagina.GET(new Request("http://x/api/historial?page=0"));
  expect(res.status).toBe(200);
  const data = (await res.json()) as { pedidos: unknown[]; hasMore: boolean };
  expect(Array.isArray(data.pedidos)).toBe(true);
  expect(typeof data.hasMore).toBe("boolean");
});

test("GET página con page inválida cae a 0 (no rompe)", async () => {
  const res = await pagina.GET(new Request("http://x/api/historial?page=abc"));
  expect(res.status).toBe(200);
});

test("GET detalle con código válido responde 200 y { pedido, ofs }", async () => {
  const res = await detalle.GET(new Request("http://x/api/historial/AR.26.03453"), {
    params: Promise.resolve({ pedido: "AR.26.03453" }),
  });
  expect(res.status).toBe(200);
  const data = (await res.json()) as { pedido: string; ofs: unknown[] };
  expect(data.pedido).toBe("AR.26.03453");
  expect(Array.isArray(data.ofs)).toBe(true);
});

test("GET detalle con código inválido responde 400", async () => {
  const res = await detalle.GET(new Request("http://x/api/historial/xxx"), {
    params: Promise.resolve({ pedido: "xxx" }),
  });
  expect(res.status).toBe(400);
});
```

- [ ] **Step 2: Ejecutar el test y verificar que falla**

Run: `pnpm test api-historial`
Expected: FAIL (módulos de ruta no existen).

- [ ] **Step 3: Implementar los route handlers**

Crea `src/app/api/historial/route.ts`:

```ts
import { NextResponse } from "next/server";
import { leerHistorialPagina } from "@/lib/server/historial-db";

// ─── GET /api/historial ──────────────────────────────────────────────────────
// Página del historial permanente de pedidos finalizados por OT. El page size
// lo fija el server (no viene del cliente). Filtros opcionales: q, desde, hasta.

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const pageRaw = Number(url.searchParams.get("page"));
  const page = Number.isInteger(pageRaw) && pageRaw >= 0 ? pageRaw : 0;

  try {
    const data = await leerHistorialPagina({
      page,
      q: url.searchParams.get("q") ?? undefined,
      desde: url.searchParams.get("desde") ?? undefined,
      hasta: url.searchParams.get("hasta") ?? undefined,
    });
    return NextResponse.json(data, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    console.error("[historial] página falló:", (e as Error).message);
    return NextResponse.json({ error: "No se pudo cargar el historial" }, { status: 500 });
  }
}
```

Crea `src/app/api/historial/[pedido]/route.ts`:

```ts
import { NextResponse } from "next/server";
import { leerHistorialPedido } from "@/lib/server/historial-db";
import { CODIGO_PEDIDO_RE } from "@/lib/historial";

// ─── GET /api/historial/[pedido] ─────────────────────────────────────────────
// Detalle (lazy) de un pedido finalizado: sus OFs de OT con tiempo imputado y
// quién lo hizo. Valida el código para no inyectar ni pedir basura.

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ pedido: string }> },
) {
  const { pedido } = await params;
  if (!CODIGO_PEDIDO_RE.test(pedido))
    return NextResponse.json({ error: "Código de pedido no válido" }, { status: 400 });

  try {
    const ofs = await leerHistorialPedido(pedido);
    return NextResponse.json({ pedido, ofs }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    console.error("[historial] detalle falló:", (e as Error).message);
    return NextResponse.json({ error: "No se pudo cargar el pedido" }, { status: 500 });
  }
}
```

- [ ] **Step 4: Ejecutar el test y verificar que pasa**

Run: `pnpm test api-historial`
Expected: PASS (4 tests).

- [ ] **Step 5: Verificar build**

Run: `pnpm build`
Expected: `Compiled successfully`; ambas rutas aparecen como dinámicas.

- [ ] **Step 6: Commit**

```bash
git add "src/app/api/historial/route.ts" "src/app/api/historial/[pedido]/route.ts" src/lib/__tests__/api-historial.test.ts
git commit -m "feat(historial): API de página y detalle (validación + errores)"
```

---

### Task 4: UI — HistorialView autónomo (fetch paginado + scroll infinito + detalle lazy)

`HistorialView` deja de recibir `pedidos` del tablero y pasa a pedir su propia
data a la API: primera página al montar y más al hacer scroll; al expandir un
pedido, carga su detalle. Se quita el `FilterBar` del tablero para el Historial y
se ponen filtros propios (búsqueda + rango de fechas). No hay test unitario de
componente en el repo: se verifica con build + comprobación manual.

**Files:**
- Rewrite: `src/components/HistorialView.tsx`
- Modify: `src/components/Board.tsx` (dejar de calcular/pasar `historialOrdenados`; render del Historial sin el FilterBar del tablero)

**Interfaces:**
- Consumes: `GET /api/historial`, `GET /api/historial/[pedido]` (Task 3); tipos `HistorialItem`, `HistorialOF` de `@/lib/historial`; `fmtMin` de `@/lib/estado`.
- Produces: `<HistorialView />` autónomo (sin props de datos; opcionalmente `onOpen?` para abrir el PDF).

- [ ] **Step 1: Reescribir `HistorialView.tsx` como componente autónomo**

Reemplaza el contenido de `src/components/HistorialView.tsx` por:

```tsx
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { HistorialItem, HistorialOF } from "@/lib/historial";
import { fmtMin } from "@/lib/estado";

function fmtFecha(iso: string) {
  if (!iso) return "—";
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
}

/** Historial permanente de pedidos finalizados por OT (datos de RPS, paginado). */
export function HistorialView() {
  const [items, setItems] = useState<HistorialItem[]>([]);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState(false);

  // Filtros (se aplican reiniciando desde la página 0).
  const [q, setQ] = useState("");
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");

  // Clave de filtros: al cambiar, se reinicia la lista.
  const filtrosKey = `${q}|${desde}|${hasta}`;

  const cargar = useCallback(
    async (pageAcargar: number, reemplazar: boolean) => {
      setCargando(true);
      setError(false);
      try {
        const params = new URLSearchParams({ page: String(pageAcargar) });
        if (q.trim()) params.set("q", q.trim());
        if (desde) params.set("desde", desde);
        if (hasta) params.set("hasta", hasta);
        const r = await fetch(`/api/historial?${params}`, { cache: "no-store" });
        if (!r.ok) throw new Error(String(r.status));
        const data = (await r.json()) as { pedidos: HistorialItem[]; hasMore: boolean };
        setItems((prev) => (reemplazar ? data.pedidos : [...prev, ...data.pedidos]));
        setHasMore(data.hasMore);
        setPage(pageAcargar);
      } catch {
        setError(true);
      } finally {
        setCargando(false);
      }
    },
    [q, desde, hasta],
  );

  // Al cambiar filtros (o al montar), recarga desde la página 0.
  useEffect(() => {
    cargar(0, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtrosKey]);

  // Scroll infinito: un centinela al final dispara la siguiente página.
  const sentinela = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = sentinela.current;
    if (!el || !hasMore || cargando) return;
    const io = new IntersectionObserver((entradas) => {
      if (entradas[0].isIntersecting) cargar(page + 1, false);
    });
    io.observe(el);
    return () => io.disconnect();
  }, [hasMore, cargando, page, cargar]);

  return (
    <div className="space-y-3">
      {/* Filtros propios del historial */}
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col text-xs text-text-muted">
          Buscar (AR o cliente)
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="AR.26… o cliente"
            className="mt-1 w-56 rounded-lg border border-border bg-surface px-2 py-1 text-sm text-text"
          />
        </label>
        <label className="flex flex-col text-xs text-text-muted">
          Desde
          <input type="date" value={desde} onChange={(e) => setDesde(e.target.value)}
            className="mt-1 rounded-lg border border-border bg-surface px-2 py-1 text-sm text-text" />
        </label>
        <label className="flex flex-col text-xs text-text-muted">
          Hasta
          <input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)}
            className="mt-1 rounded-lg border border-border bg-surface px-2 py-1 text-sm text-text" />
        </label>
      </div>

      {error && (
        <div className="flex items-center gap-3 rounded-xl border border-red-500/40 bg-red-500/5 px-4 py-3 text-sm text-text">
          No se pudo cargar el historial.
          <button onClick={() => cargar(0, true)} className="rounded-lg bg-surface px-2 py-1 text-xs font-semibold ring-1 ring-border hover:bg-surface-2">
            Reintentar
          </button>
        </div>
      )}

      {!error && items.length === 0 && !cargando && (
        <div className="grid min-h-40 place-items-center rounded-xl border border-dashed border-border text-sm text-text-muted">
          Sin resultados con estos filtros.
        </div>
      )}

      <div className="space-y-2">
        {items.map((it) => (
          <FilaHistorial key={it.pedido} item={it} />
        ))}
      </div>

      {cargando && <p className="py-2 text-center text-xs text-text-muted">Cargando…</p>}
      <div ref={sentinela} className="h-1" />
    </div>
  );
}

function FilaHistorial({ item }: { item: HistorialItem }) {
  const [abierto, setAbierto] = useState(false);
  const [ofs, setOfs] = useState<HistorialOF[] | null>(null);
  const [cargandoDet, setCargandoDet] = useState(false);

  const toggle = useCallback(async () => {
    const nuevo = !abierto;
    setAbierto(nuevo);
    if (nuevo && ofs === null && !cargandoDet) {
      setCargandoDet(true);
      try {
        const r = await fetch(`/api/historial/${item.pedido}`, { cache: "no-store" });
        const data = (await r.json()) as { ofs: HistorialOF[] };
        setOfs(r.ok ? data.ofs : []);
      } catch {
        setOfs([]);
      } finally {
        setCargandoDet(false);
      }
    }
  }, [abierto, ofs, cargandoDet, item.pedido]);

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-surface">
      <button
        onClick={toggle}
        aria-expanded={abierto}
        className="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-surface-2/60"
      >
        <svg viewBox="0 0 24 24" className={`size-3.5 shrink-0 text-text-muted transition-transform ${abierto ? "rotate-90" : ""}`}
          fill="none" stroke="currentColor" strokeWidth="2.5">
          <path d="m9 6 6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <span className="size-2.5 shrink-0 rounded-full bg-cyan-600" />
        <span className="font-semibold text-text">{item.pedido}</span>
        <span className="truncate text-sm text-text-muted">{item.cliente ?? "—"}</span>
        <span className="ml-auto flex shrink-0 items-center gap-3 text-xs text-text-muted">
          <span>{item.nOf} OF</span>
          <span>Finalizado {fmtFecha(item.finalizada)}</span>
        </span>
      </button>

      {abierto && (
        <div className="border-t border-border">
          {cargandoDet && <p className="px-4 py-3 text-xs text-text-muted">Cargando detalle…</p>}
          {ofs && ofs.length === 0 && !cargandoDet && (
            <p className="px-4 py-3 text-xs text-text-muted">Sin imputaciones de OT registradas.</p>
          )}
          {ofs && ofs.length > 0 && (
            <ul className="divide-y divide-border">
              {ofs.map((of) => (
                <li key={of.codigo} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3">
                  <span className="font-mono text-xs font-semibold text-text">{of.codigo}</span>
                  <span className="text-sm text-text">{of.descripcion}</span>
                  <span className="ml-auto text-[11px] text-text-muted">
                    {of.quien.length > 0 ? of.quien.join(", ") : "—"}
                  </span>
                  <span className="rounded bg-surface-2 px-1.5 py-0.5 text-[11px] font-semibold text-text ring-1 ring-border">
                    {fmtMin(of.tiempoImputadoMin)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Actualizar `Board.tsx` para el Historial autónomo**

En `src/components/Board.tsx`, localiza el bloque `{vista === "historial" && (`
(sobre la línea 960) y sustitúyelo por el render autónomo, sin el `FilterBar` del
tablero ni `historialOrdenados`:

```tsx
        {vista === "historial" && (
          <div className="p-5">
            <HistorialView />
          </div>
        )}
```

Luego elimina el `useMemo` de `historialOrdenados` (sobre `Board.tsx:304-310`),
que ya no se usa. Si `estaFinalizado` queda sin usarse tras quitarlo, retíralo del
import de `@/lib/types` (`Board.tsx:15`). No toques el resto de vistas.

- [ ] **Step 3: Verificar build y tests**

Run: `pnpm test && pnpm build`
Expected: tests siguen en verde (14 previos), build `Compiled successfully`,
TypeScript limpio, `HistorialView` lint-clean.

- [ ] **Step 4: Comprobación manual**

Con `DATASOURCE=rps` y VPN (o en el server tras deploy):
1. Abre la pestaña **Historial**. Carga la primera página (más recientes arriba).
2. Baja hasta el final: se cargan más pedidos (scroll infinito) sin recargar.
3. Escribe un cliente o un `AR.` en Buscar: la lista se reinicia filtrada.
4. Pon un rango de fechas: filtra por fecha de finalización.
5. Expande un pedido: aparecen sus OFs con tiempo imputado y quién.
6. Con `DATASOURCE=mock`: el historial sale del mock (pocos pedidos), sin errores.

- [ ] **Step 5: Commit**

```bash
git add src/components/HistorialView.tsx src/components/Board.tsx
git commit -m "feat(historial): vista autónoma paginada con filtros, scroll infinito y detalle lazy"
```

---

## Self-Review

**Cobertura del spec:**
- Fuente RPS (tgm_estadosof_olanet idestadoof=3, agrupado por pedido) → Task 2 query de página (validada). ✅
- Paginación OFFSET/FETCH, size fijo 40, hasMore por size+1 → Task 2. ✅
- Filtros: búsqueda pedido/cliente + rango de fechas → Task 1 (builder) + Task 2 (aplicación) + Task 4 (UI). ✅
  - Filtro por cliente/familia (dropdown): NO en v1 — el spec lo marcó como degradable; `q` cubre búsqueda por cliente y la familia se difiere (ver nota). Follow-up.
- Detalle lazy por pedido (tiempos imputados + quién) → Task 2 (`leerHistorialPedido`) + Task 3 (API) + Task 4 (expand). ✅
- UI autónoma, scroll infinito, estados cargando/vacío/error → Task 4. ✅
- Fallback mock, solo lectura, sin interpolar SQL → Tasks 2/3. ✅
- Limitación (sin split planteo/revisión en históricos) → el detalle muestra tiempo total imputado + quién, sin roles. ✅

**Placeholders:** ninguno. La query de detalle lleva un paso de verificación real (Task 2 Step 1) en lugar de asumirse.

**Consistencia de tipos:**
- `HistorialFiltros/HistorialItem/HistorialOF/FilaPagina/PAGE_SIZE/construirFiltros/filaAItem/CODIGO_PEDIDO_RE` definidos en Task 1, consumidos con las mismas firmas en Tasks 2/3/4. ✅
- `leerHistorialPagina(f): {pedidos, hasMore}` y `leerHistorialPedido(pedido): HistorialOF[]` (Task 2) usados igual en Task 3. ✅
- Rutas `GET` con la firma de handler de Next 16 (`{ params: Promise<...> }`) coherente con el resto del repo. ✅

**Notas / follow-ups (fuera de v1):**
- Filtro por cliente (desplegable) y por familia: requieren, respectivamente, una query de clientes distintos y un `EXISTS` sobre el artículo cuya perf no se midió. Diferidos; `q` cubre la búsqueda por cliente mientras tanto.
- Caché de página: v1 sin caché (query < 1 s). Añadir si la carga real lo pide.
- Ver PDF del pedido desde el historial: solo resuelve series `AR.*` hoy; no se cablea el `onOpen` en v1.
