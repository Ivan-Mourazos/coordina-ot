# Historial filtros v2 (familia + cliente autocompletar + volver arriba) — Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Filtrar el Historial por familia (7 chips) y por cliente (autocompletar desde la BD), y añadir un botón "volver arriba" al scroll infinito.

**Architecture:** `construirFiltros` gana `familia` (cláusula `EXISTS` por palabras clave sobre las descripciones de las MO, parametrizada) y `cliente` (igualdad exacta), que fluyen al WHERE de la query de página ya existente. Un endpoint nuevo `/api/historial/clientes` alimenta el autocompletar. En la UI, la barra de filtros gana los chips y el autocompletar, y la lista un botón flotante de volver arriba.

**Tech Stack:** Next.js 16 (route handlers), mssql, React 19, TypeScript, Vitest.

## Global Constraints

- Node ≥ 22, pnpm ≥ 11. SOLO LECTURA sobre RPS; parámetros mssql (`request.input`), NUNCA interpolar valores. `CodCompany='001'`.
- Familia = catálogo de 7 (TOLDO, LONA, CARPA, REMOLQUE, TAPIZADO, REPARACION, SUMINISTRO). Filtro por palabras clave que replica `familiaDeTexto` de `rps.ts`: `TOLDO→[TOLDO], LONA→[LONA,ROLLO], CARPA→[CARPA], REMOLQUE→[REMOLQUE], TAPIZADO→[TAPIZ], REPARACION→[REPARAC], SUMINISTRO→[SUMINISTRO]`.
- Cliente = igualdad exacta `cli.Description = @cliente` (valor del autocompletar, no texto libre).
- Autocompletar: `q` ≥ 2 chars, tope 20 resultados, del conjunto de OT finalizada.
- Se mantiene el scroll infinito (page size 40, `hasMore` por size+1). Cambio de filtro reinicia a page 0 (ya implementado con `filtrosKey` + debounce + `reqSeq`).
- Modo `DATASOURCE!=='rps'` → fallback mock.
- Tests con Vitest en `src/lib/__tests__/`, `pnpm test`.

---

### Task 1: `construirFiltros` con familia + cliente (+ `FAMILIA_KEYWORDS`)

**Files:**
- Modify: `src/lib/historial.ts`
- Test: `src/lib/__tests__/historial.test.ts` (añadir casos)

**Interfaces:**
- Produces:
  - `HistorialFiltros` gana `familia?: string` y `cliente?: string`.
  - `const FAMILIA_KEYWORDS: Record<string, string[]>` (las 7 familias → keywords).
  - `construirFiltros` emite la cláusula `EXISTS` de familia y la igualdad de cliente.

- [ ] **Step 1: Escribir el test que falla**

Añade a `src/lib/__tests__/historial.test.ts`:

```ts
import { FAMILIA_KEYWORDS } from "../historial";

test("FAMILIA_KEYWORDS tiene las 7 familias con sus keywords", () => {
  expect(Object.keys(FAMILIA_KEYWORDS).sort()).toEqual(
    ["CARPA", "LONA", "REMOLQUE", "REPARACION", "SUMINISTRO", "TAPIZADO", "TOLDO"],
  );
  expect(FAMILIA_KEYWORDS.LONA).toEqual(["LONA", "ROLLO"]);
});

test("filtro familia genera EXISTS parametrizado con las keywords de esa familia", () => {
  const r = construirFiltros({ page: 0, familia: "LONA" });
  expect(r.clausulas.some((c) => c.includes("EXISTS"))).toBe(true);
  expect(r.clausulas.some((c) => c.includes("mo2.Description LIKE @fam0"))).toBe(true);
  expect(r.clausulas.some((c) => c.includes("mo2.Description LIKE @fam1"))).toBe(true);
  expect(r.params).toContainEqual({ nombre: "fam0", valor: "%LONA%" });
  expect(r.params).toContainEqual({ nombre: "fam1", valor: "%ROLLO%" });
});

test("filtro familia desconocida se ignora", () => {
  expect(construirFiltros({ page: 0, familia: "XXX" }).clausulas).toEqual([]);
});

test("filtro cliente genera igualdad exacta parametrizada", () => {
  const r = construirFiltros({ page: 0, cliente: "MAHOU, S.A." });
  expect(r.clausulas).toContain("cli.Description = @cliente");
  expect(r.params).toContainEqual({ nombre: "cliente", valor: "MAHOU, S.A." });
});
```

- [ ] **Step 2: Ejecutar el test y verificar que falla**

Run: `pnpm test historial`
Expected: FAIL (`FAMILIA_KEYWORDS` no existe / familia no genera cláusula).

- [ ] **Step 3: Implementar en `historial.ts`**

(a) Amplía `HistorialFiltros`:

```ts
export interface HistorialFiltros {
  page: number;
  q?: string;
  desde?: string;
  hasta?: string;
  familia?: string;
  cliente?: string;
}
```

(b) Añade el mapa de keywords (junto a los demás exports):

```ts
/** Palabras clave por familia visual (réplica de familiaDeTexto de rps.ts): el
 *  filtro por familia busca estas en la descripción de las MO del pedido. Sus
 *  claves son el catálogo de 7 familias que pintan los chips. */
export const FAMILIA_KEYWORDS: Record<string, string[]> = {
  TOLDO: ["TOLDO"],
  LONA: ["LONA", "ROLLO"],
  CARPA: ["CARPA"],
  REMOLQUE: ["REMOLQUE"],
  TAPIZADO: ["TAPIZ"],
  REPARACION: ["REPARAC"],
  SUMINISTRO: ["SUMINISTRO"],
};
```

(c) En `construirFiltros`, tras las cláusulas de fecha y antes del `return`,
añade familia y cliente:

```ts
  const familia = f.familia?.trim();
  if (familia && FAMILIA_KEYWORDS[familia]) {
    const kws = FAMILIA_KEYWORDS[familia];
    const likes = kws.map((_, i) => `mo2.Description LIKE @fam${i}`).join(" OR ");
    clausulas.push(
      `EXISTS (SELECT 1 FROM dbo.FACOrderSL o2 ` +
        `JOIN dbo.FACOrderLineSL l2 ON l2.IDOrder = o2.IDOrder ` +
        `JOIN dbo.CPRManufacturingOrder mo2 ON mo2.IDManufacturingOrder = l2.IDManufacturingOrder AND mo2.CodCompany = '001' ` +
        `WHERE o2.CodOrder = p.pedido AND o2.CodCompany = '001' AND (${likes}))`,
    );
    kws.forEach((kw, i) => params.push({ nombre: `fam${i}`, valor: `%${kw}%` }));
  }

  const cliente = f.cliente?.trim();
  if (cliente) {
    clausulas.push("cli.Description = @cliente");
    params.push({ nombre: "cliente", valor: cliente });
  }
```

- [ ] **Step 4: Ejecutar el test y verificar que pasa**

Run: `pnpm test historial`
Expected: PASS (todos, incluidos los nuevos).

- [ ] **Step 5: Commit**

```bash
git add src/lib/historial.ts src/lib/__tests__/historial.test.ts
git commit -m "feat(historial): filtros de familia (keyword EXISTS) y cliente exacto"
```

---

### Task 2: Backend — autocompletar de cliente + mock + validación de familia

**Files:**
- Modify: `src/lib/server/historial-db.ts` (`leerClientesHistorial` + mock familia/cliente en `paginaMock`)
- Create: `src/app/api/historial/clientes/route.ts`
- Modify: `src/lib/__tests__/api-historial.test.ts` (test del endpoint clientes)

**Interfaces:**
- Consumes: `construirFiltros` (ya aplica familia/cliente en la query de página, sin cambiar la SQL de página); `PEDIDOS` mock.
- Produces: `async function leerClientesHistorial(q: string): Promise<string[]>`; `GET /api/historial/clientes?q=` → `{ clientes: string[] }`.

- [ ] **Step 1: Validar en vivo (spike): familia EXISTS + query de clientes**

Con `node --env-file=.env.local` (VPN; si no conecta, NEEDS_CONTEXT), verifica:

(a) **Coste del filtro de familia** en la query de página real. Copia la query de
`leerHistorialPagina` (la de `historial-db.ts`) y añade en el WHERE la cláusula
EXISTS de familia con `@fam0='%TOLDO%'`. Mide el tiempo de la primera página.
Si tarda mucho (>3-4 s), anótalo: en el Step 3 se puede limitar el EXISTS o
degradar; si va bien (<1-2 s), seguimos.

(b) **Query de clientes** (autocompletar). Prueba y cronometra:

```sql
;WITH FinOT AS (SELECT DISTINCT e.orden FROM dbo.tgm_estadosof_olanet e WHERE e.idestadoof=3)
SELECT TOP 20 cli.Description AS cliente
FROM FinOT f
JOIN dbo.CPRManufacturingOrder mo ON mo.CodManufacturingOrder=f.orden AND mo.CodCompany='001'
JOIN dbo.FACOrderLineSL l ON l.IDManufacturingOrder=mo.IDManufacturingOrder
JOIN dbo.FACOrderSL o ON o.IDOrder=l.IDOrder AND o.CodCompany='001'
JOIN dbo.FACCustomer cli ON cli.IDCustomer=o.IDCustomer
WHERE cli.Description LIKE '%MAHOU%'
GROUP BY cli.Description
ORDER BY cli.Description
```

Confirma que devuelve nombres y en tiempo aceptable (<1-2 s). Si es lenta, en el
Step 3 se puede simplificar a `FACCustomer` directamente (sin el join FinOT) —
anota la decisión con datos. Borra el script del scratchpad. **Usa lo que
devuelva la BD.**

- [ ] **Step 2: Implementar `leerClientesHistorial` + mock en `historial-db.ts`**

Añade (ajusta la query si el spike lo pidió):

```ts
export async function leerClientesHistorial(q: string): Promise<string[]> {
  const term = q.trim();
  if (term.length < 2) return [];
  if (ES_MOCK) {
    const t = term.toLowerCase();
    return [...new Set(PEDIDOS.map((p) => p.cliente))]
      .filter((c) => c.toLowerCase().includes(t))
      .sort()
      .slice(0, 20);
  }
  const pool = await getPool();
  const r = await pool
    .request()
    .input("q", `%${term}%`)
    .query<{ cliente: string | null }>(`
      ;WITH FinOT AS (SELECT DISTINCT e.orden FROM dbo.tgm_estadosof_olanet e WHERE e.idestadoof=3)
      SELECT TOP 20 cli.Description AS cliente
      FROM FinOT f
      JOIN dbo.CPRManufacturingOrder mo ON mo.CodManufacturingOrder=f.orden AND mo.CodCompany='001'
      JOIN dbo.FACOrderLineSL l ON l.IDManufacturingOrder=mo.IDManufacturingOrder
      JOIN dbo.FACOrderSL o ON o.IDOrder=l.IDOrder AND o.CodCompany='001'
      JOIN dbo.FACCustomer cli ON cli.IDCustomer=o.IDCustomer
      WHERE cli.Description LIKE @q
      GROUP BY cli.Description
      ORDER BY cli.Description
    `);
  return r.recordset.map((x) => (x.cliente ?? "").trim()).filter(Boolean);
}
```

Y en `paginaMock`, aplica también familia y cliente (para que el mock refleje los
filtros nuevos). Tras los filtros de `q`/`desde`/`hasta` existentes añade:

```ts
  if (f.cliente?.trim()) todos = todos.filter((p) => p.cliente === f.cliente!.trim());
  const fam = f.familia?.trim();
  if (fam && FAMILIA_KEYWORDS[fam]) {
    const kws = FAMILIA_KEYWORDS[fam].map((k) => k.toLowerCase());
    const pedidosFam = new Set(
      PEDIDOS.filter((p) =>
        p.ofs.some((of) => kws.some((k) => of.descripcion.toLowerCase().includes(k))),
      ).map((p) => p.codigo),
    );
    todos = todos.filter((p) => pedidosFam.has(p.pedido));
  }
```

(Importa `FAMILIA_KEYWORDS` de `../historial` en `historial-db.ts`.)

- [ ] **Step 3: Crear el endpoint `/api/historial/clientes`**

Crea `src/app/api/historial/clientes/route.ts`:

```ts
import { NextResponse } from "next/server";
import { leerClientesHistorial } from "@/lib/server/historial-db";

// ─── GET /api/historial/clientes?q=texto ─────────────────────────────────────
// Autocompletar de cliente: hasta 20 nombres distintos del histórico de OT que
// contengan q (mín. 2 caracteres). Solo lectura.

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const q = new URL(req.url).searchParams.get("q") ?? "";
  try {
    const clientes = await leerClientesHistorial(q);
    return NextResponse.json({ clientes }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    console.error("[historial] clientes falló:", (e as Error).message);
    return NextResponse.json({ error: "No se pudieron cargar los clientes" }, { status: 500 });
  }
}
```

- [ ] **Step 4: Escribir el test del endpoint (mock)**

Añade a `src/lib/__tests__/api-historial.test.ts`:

```ts
import * as clientes from "../../app/api/historial/clientes/route";

test("GET clientes con q<2 devuelve lista vacía", async () => {
  const res = await clientes.GET(new Request("http://x/api/historial/clientes?q=a"));
  expect(res.status).toBe(200);
  const data = (await res.json()) as { clientes: string[] };
  expect(data.clientes).toEqual([]);
});

test("GET clientes con q válida devuelve array (<=20)", async () => {
  const res = await clientes.GET(new Request("http://x/api/historial/clientes?q=cli"));
  expect(res.status).toBe(200);
  const data = (await res.json()) as { clientes: string[] };
  expect(Array.isArray(data.clientes)).toBe(true);
  expect(data.clientes.length).toBeLessThanOrEqual(20);
});
```

- [ ] **Step 5: Ejecutar tests + build**

Run: `pnpm test api-historial && pnpm test historial && pnpm build`
Expected: PASS; `Compiled successfully`, TypeScript limpio.

- [ ] **Step 6: Commit**

```bash
git add src/lib/server/historial-db.ts "src/app/api/historial/clientes/route.ts" src/lib/__tests__/api-historial.test.ts
git commit -m "feat(historial): autocompletar de cliente + familia/cliente en mock"
```

---

### Task 3: UI — chips de familia + autocompletar de cliente + volver arriba

**Files:**
- Modify: `src/components/HistorialView.tsx`

**Interfaces:**
- Consumes: `FAMILIA_KEYWORDS` de `@/lib/historial`; `familiaMeta` de `@/lib/familia`; `GET /api/historial/clientes`.
- Produces: filtros de familia/cliente en la barra + botón volver arriba. No hay test unitario (sin RTL): build + manual.

- [ ] **Step 1: Estado de los filtros nuevos + inclusión en `cargar` y `filtrosKey`**

En `src/components/HistorialView.tsx`, junto a los `useState` de filtros:

```tsx
  const [familia, setFamilia] = useState<string | null>(null);
  const [cliente, setCliente] = useState<string | null>(null);
```

Incluye ambos en `filtrosKey`:

```tsx
  const filtrosKey = `${q}|${desde}|${hasta}|${familia ?? ""}|${cliente ?? ""}`;
```

En `cargar`, añade sus params tras los de fecha:

```tsx
        if (familia) params.set("familia", familia);
        if (cliente) params.set("cliente", cliente);
```

Y añade `familia`, `cliente` a las deps del `useCallback` de `cargar`
(`[q, desde, hasta, familia, cliente]`).

- [ ] **Step 2: Chips de familia**

Importa arriba:

```tsx
import { FAMILIA_KEYWORDS } from "@/lib/historial";
import { familiaMeta } from "@/lib/familia";
```

Dentro de la barra de filtros (tras los inputs de fecha, dentro del
`<div className="flex flex-wrap items-end gap-3">` o justo debajo), añade la fila
de chips:

```tsx
      <div className="flex w-full flex-wrap gap-1.5">
        {Object.keys(FAMILIA_KEYWORDS).map((fam) => {
          const activa = familia === fam;
          const meta = familiaMeta(fam);
          return (
            <button
              key={fam}
              onClick={() => setFamilia(activa ? null : fam)}
              className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 transition ${
                activa ? "text-white ring-transparent" : "text-text-muted ring-border hover:text-text"
              }`}
              style={activa ? { background: meta.color } : undefined}
            >
              {meta.label ?? fam}
            </button>
          );
        })}
      </div>
```

(Si `familiaMeta` no expone `label`, usa `fam` como texto. Verifica la forma de
`FamiliaMeta` en `src/lib/familia.ts` y usa el campo de nombre que exista, o el
propio `fam`.)

- [ ] **Step 3: Autocompletar de cliente**

Añade un componente `ClienteAutocomplete` en el mismo fichero y colócalo en la
barra de filtros. Estado local con debounce y fetch a `/api/historial/clientes`:

```tsx
function ClienteAutocomplete({
  value,
  onChange,
}: {
  value: string | null;
  onChange: (cliente: string | null) => void;
}) {
  const [texto, setTexto] = useState("");
  const [sug, setSug] = useState<string[]>([]);
  const [abierto, setAbierto] = useState(false);

  useEffect(() => {
    const t = texto.trim();
    if (t.length < 2) {
      setSug([]);
      return;
    }
    const timer = setTimeout(async () => {
      try {
        const r = await fetch(`/api/historial/clientes?q=${encodeURIComponent(t)}`, { cache: "no-store" });
        if (!r.ok) return;
        const d = (await r.json()) as { clientes: string[] };
        setSug(d.clientes);
        setAbierto(true);
      } catch {
        /* sin sugerencias */
      }
    }, 250);
    return () => clearTimeout(timer);
  }, [texto]);

  if (value) {
    return (
      <label className="flex flex-col text-xs text-text-muted">
        Cliente
        <span className="mt-1 flex items-center gap-1 rounded-lg border border-border bg-surface px-2 py-1 text-sm text-text">
          {value}
          <button onClick={() => onChange(null)} aria-label="Quitar cliente" className="ml-1 text-text-muted hover:text-text">
            ✕
          </button>
        </span>
      </label>
    );
  }

  return (
    <label className="relative flex flex-col text-xs text-text-muted">
      Cliente
      <input
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        onFocus={() => sug.length > 0 && setAbierto(true)}
        onBlur={() => setTimeout(() => setAbierto(false), 150)}
        placeholder="Escribe 2+ letras…"
        className="mt-1 w-56 rounded-lg border border-border bg-surface px-2 py-1 text-sm text-text"
      />
      {abierto && sug.length > 0 && (
        <ul className="glass-pop absolute top-full z-30 mt-1 max-h-60 w-72 overflow-y-auto rounded-lg p-1">
          {sug.map((c) => (
            <li key={c}>
              <button
                onMouseDown={() => {
                  onChange(c);
                  setTexto("");
                  setAbierto(false);
                }}
                className="block w-full truncate rounded px-2 py-1 text-left text-sm text-text hover:bg-[var(--glass-highlight)]"
              >
                {c}
              </button>
            </li>
          ))}
        </ul>
      )}
    </label>
  );
}
```

Colócalo en la barra de filtros:

```tsx
        <ClienteAutocomplete value={cliente} onChange={setCliente} />
```

- [ ] **Step 4: Botón "volver arriba"**

Añade estado + listener de scroll y el botón flotante. En `HistorialView`:

```tsx
  const [mostrarArriba, setMostrarArriba] = useState(false);
  useEffect(() => {
    const onScroll = () => setMostrarArriba(window.scrollY > 600);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
```

Y al final del árbol devuelto (junto al `<HistorialDrawer .../>`):

```tsx
      {mostrarArriba && (
        <button
          onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
          aria-label="Volver arriba"
          className="fixed bottom-6 right-6 z-40 grid size-11 place-items-center rounded-full bg-surface text-lg text-text shadow-lg ring-1 ring-border hover:bg-surface-2"
        >
          ↑
        </button>
      )}
```

(Nota: si el scroll del historial no es el de `window` sino el de un contenedor,
ajusta el listener/scroll al contenedor correspondiente — verifícalo al probar.)

- [ ] **Step 5: Verificar build + tests + lint**

Run: `pnpm test && pnpm build`
Expected: verdes; `Compiled successfully`, TypeScript limpio.
Run: `pnpm lint` → `HistorialView.tsx` sin errores nuevos.

- [ ] **Step 6: Comprobación manual**

Con `DATASOURCE=rps` + VPN (o en el server):
1. Chips de familia: pulsar "Toldo" filtra a pedidos con esa familia; volver a
   pulsarlo lo quita. Solo uno activo a la vez.
2. Cliente: escribir 2+ letras → sugerencias; elegir una filtra por ese cliente;
   la "✕" lo limpia.
3. Combinar familia + cliente + búsqueda + fechas: se acumulan.
4. Bajar en la lista larga → aparece el botón "↑"; pulsarlo vuelve arriba.
5. Con `DATASOURCE=mock`: chips y cliente filtran sobre los pedidos mock.

- [ ] **Step 7: Commit**

```bash
git add src/components/HistorialView.tsx
git commit -m "feat(historial): chips de familia, autocompletar de cliente y volver arriba"
```

---

## Self-Review

**Cobertura del spec:**
- Familia 7 chips (single-select, EXISTS por keyword) → Task 1 (SQL) + Task 3 (chips). ✅
- Cliente autocompletar (endpoint + UI) → Task 2 (`leerClientesHistorial` + ruta) + Task 3 (`ClienteAutocomplete`). ✅
- Scroll infinito + volver arriba → Task 3 Step 4. ✅
- Reinicio a page 0 al cambiar filtro → `filtrosKey` incluye familia/cliente (Task 3 Step 1). ✅
- Solo lectura, params mssql, mock fallback → Tasks 1/2. ✅
- Subfamilias / multi-selección / páginas numeradas → fuera (no hay tareas). ✅

**Placeholders:** ninguno. El coste del EXISTS de familia y la query de clientes se validan en vivo (Task 2 Step 1).

**Consistencia de tipos:**
- `HistorialFiltros` (familia/cliente) y `FAMILIA_KEYWORDS` (Task 1) consumidos en Task 2 (mock, `construirFiltros` en la query de página) y Task 3 (chips). Mismas firmas.
- `leerClientesHistorial(q): Promise<string[]>` (Task 2) usado en la ruta y consumido por `ClienteAutocomplete` vía `{ clientes }`.

**Notas:**
- Imprecisión de familia por keyword (una descripción con dos palabras cuenta para dos familias): asumida en el spec; es un filtro "contiene".
- Si el scroll del Historial resulta estar en un contenedor y no en `window`, el botón "volver arriba" se ajusta al contenedor (verificación manual en Task 3 Step 4/6).
