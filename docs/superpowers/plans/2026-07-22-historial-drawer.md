# Abrir pedido desde el Historial (drawer read-only) — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Al hacer clic en un pedido del Historial se abre un drawer read-only con el PDF (mediano, ampliable) a un lado y los datos del pedido + sus OFs con tiempos al otro.

**Architecture:** Se amplía el detalle: `GET /api/historial/[pedido]` pasa de devolver solo `{pedido, ofs}` a la cabecera completa del pedido finalizado (`HistorialPedidoDetalle`). La capa `historial-db.ts` gana `leerHistorialPedidoDetalle` (query de cabecera validada en vivo, reutilizando helpers de `rps.ts`). En el frontend, la fila del Historial deja de expandir OFs inline: al hacer clic abre un `HistorialDrawer` autónomo que carga el detalle.

**Tech Stack:** Next.js 16 (route handlers), mssql, React 19, TypeScript, Vitest.

## Global Constraints

- Node ≥ 22, pnpm ≥ 11. SOLO LECTURA sobre RPS; parámetros mssql (nunca interpolar valores).
- `CodCompany = '001'`. OT = recurso `a-otec`/`otec-a`. Fecha finalización = `MAX(tgm_estadosof_olanet.fecha_cambio)` con `idestadoof=3`.
- Reutilizar, sin duplicar, los helpers de `src/lib/server/rps.ts`: `familiaDeTexto`, `prioridadDe`, `fechaISO` (hoy privados — se exportan). Patrón de cabecera de venta = el de la query `ventas` de `rps.ts` (FACOrderSL/FACCustomer/FACCustomerDeliveryAddress).
- El drawer es READ-ONLY: sin asignar/fichar/acciones.
- PDF: `scanUrl = /api/pedidos/{codigo}.pdf`; la ruta solo resuelve series `AR.*`. Si no hay PDF, aviso "PDF no disponible", nunca romper.
- Modo `DATASOURCE!=='rps'` → fallback mock sin BD.
- Tests con Vitest en `src/lib/__tests__/`, `pnpm test`.

---

### Task 1: Tipo `HistorialPedidoDetalle` + mapeo puro

**Files:**
- Modify: `src/lib/historial.ts`
- Test: `src/lib/__tests__/historial.test.ts` (añadir casos)

**Interfaces:**
- Produces:
  - `interface HistorialPedidoDetalle { codigo: string; cliente: string | null; negocio: string | null; ciudadEntrega: string | null; prioridad: 1|2|3; fechaSolicitud: string | null; fechaFinalizacion: string | null; piezas: number; familias: string[]; comentarioVenta: string | null; scanUrl: string; ofs: HistorialOF[] }`
  - `interface FilaCabecera { pedido: string; cliente: string | null; negocio: string | null; ciudad: string | null; comentario: string | null; solicitada: Date | string | null; prioridad: number | null; piezas: number | null }`
  - `function cabeceraADetalle(fila: FilaCabecera, ofs: HistorialOF[], finalizada: string | null, familias: string[]): HistorialPedidoDetalle`

- [ ] **Step 1: Escribir el test que falla**

Añade a `src/lib/__tests__/historial.test.ts`:

```ts
import { cabeceraADetalle } from "../historial";

test("cabeceraADetalle arma el detalle con fechas ISO, scanUrl y prioridad saneada", () => {
  const d = cabeceraADetalle(
    {
      pedido: " AR.26.03365 ", cliente: "MAHOU, S.A.", negocio: "NOVA",
      ciudad: "Coruña", comentario: "sin prisa",
      solicitada: new Date("2026-06-01T00:00:00.000Z"), prioridad: 9, piezas: 4,
    },
    [{ codigo: "0230262", descripcion: "TOLDO", tiempoImputadoMin: 12, quien: ["Alberto"] }],
    "2026-07-22T13:00:00.000Z",
    ["TOLDO"],
  );
  expect(d.codigo).toBe("AR.26.03365");
  expect(d.scanUrl).toBe("/api/pedidos/AR.26.03365.pdf");
  expect(d.prioridad).toBe(1); // 9 fuera de rango → 1
  expect(d.fechaSolicitud).toBe("2026-06-01");
  expect(d.fechaFinalizacion).toBe("2026-07-22T13:00:00.000Z");
  expect(d.piezas).toBe(4);
  expect(d.familias).toEqual(["TOLDO"]);
  expect(d.ofs).toHaveLength(1);
});

test("cabeceraADetalle tolera nulos (fecha, piezas, cliente)", () => {
  const d = cabeceraADetalle(
    { pedido: "AR.26.00001", cliente: null, negocio: null, ciudad: null, comentario: null, solicitada: null, prioridad: null, piezas: null },
    [], null, [],
  );
  expect(d.cliente).toBeNull();
  expect(d.fechaSolicitud).toBeNull();
  expect(d.fechaFinalizacion).toBeNull();
  expect(d.piezas).toBe(0);
  expect(d.prioridad).toBe(1);
});
```

- [ ] **Step 2: Ejecutar el test y verificar que falla**

Run: `pnpm test historial`
Expected: FAIL (`cabeceraADetalle` no existe).

- [ ] **Step 3: Implementar en `historial.ts`**

Añade a `src/lib/historial.ts`:

```ts
export interface HistorialPedidoDetalle {
  codigo: string;
  cliente: string | null;
  negocio: string | null;
  ciudadEntrega: string | null;
  prioridad: 1 | 2 | 3;
  fechaSolicitud: string | null; // ISO yyyy-mm-dd
  fechaFinalizacion: string | null; // ISO
  piezas: number;
  familias: string[];
  comentarioVenta: string | null;
  scanUrl: string; // /api/pedidos/{codigo}.pdf (puede dar 404)
  ofs: HistorialOF[];
}

/** Fila cruda de la cabecera del pedido (antes de mapear). */
export interface FilaCabecera {
  pedido: string;
  cliente: string | null;
  negocio: string | null;
  ciudad: string | null;
  comentario: string | null;
  solicitada: Date | string | null;
  prioridad: number | null;
  piezas: number | null;
}

/** Fecha de venta a yyyy-mm-dd; centinela RPS (<2000) o inválida → null. */
function fechaSolicitudISO(v: Date | string | null): string | null {
  if (!v) return null;
  const d = v instanceof Date ? v : new Date(v);
  if (Number.isNaN(d.getTime()) || d.getFullYear() < 2000) return null;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function cabeceraADetalle(
  fila: FilaCabecera,
  ofs: HistorialOF[],
  finalizada: string | null,
  familias: string[],
): HistorialPedidoDetalle {
  const codigo = (fila.pedido ?? "").trim();
  const prioridad = fila.prioridad === 1 || fila.prioridad === 2 || fila.prioridad === 3 ? fila.prioridad : 1;
  return {
    codigo,
    cliente: fila.cliente,
    negocio: fila.negocio,
    ciudadEntrega: fila.ciudad,
    prioridad,
    fechaSolicitud: fechaSolicitudISO(fila.solicitada),
    fechaFinalizacion: finalizada,
    piezas: fila.piezas ?? 0,
    familias,
    comentarioVenta: fila.comentario,
    scanUrl: `/api/pedidos/${codigo}.pdf`,
    ofs,
  };
}
```

- [ ] **Step 4: Ejecutar el test y verificar que pasa**

Run: `pnpm test historial`
Expected: PASS (todos, incluidos los 2 nuevos).

- [ ] **Step 5: Commit**

```bash
git add src/lib/historial.ts src/lib/__tests__/historial.test.ts
git commit -m "feat(historial): tipo HistorialPedidoDetalle + mapeo de cabecera"
```

---

### Task 2: Backend — detalle con cabecera (`historial-db.ts` + rutas)

**Files:**
- Modify: `src/lib/server/rps.ts` (exportar `familiaDeTexto`, `prioridadDe`, `fechaISO`)
- Modify: `src/lib/server/historial-db.ts` (`leerHistorialPedidoDetalle` + mock)
- Modify: `src/app/api/historial/[pedido]/route.ts` (devolver el detalle)
- Modify: `src/lib/__tests__/api-historial.test.ts` (forma nueva en mock)

**Interfaces:**
- Consumes: `cabeceraADetalle`, `HistorialPedidoDetalle`, `FilaCabecera` (Task 1); `leerHistorialPedido` (existente); `familiaDeTexto` de `rps.ts`.
- Produces: `async function leerHistorialPedidoDetalle(pedido: string): Promise<HistorialPedidoDetalle>`; `GET /api/historial/[pedido]` → `HistorialPedidoDetalle`.

- [ ] **Step 1: Exportar helpers de `rps.ts`**

En `src/lib/server/rps.ts`, añade `export` a las funciones `familiaDeTexto`, `prioridadDe` y `fechaISO` (hoy `function ...` privadas). No cambies su cuerpo. (Solo se les antepone `export`.)

- [ ] **Step 2: Verificar la query de CABECERA contra la BD real (spike)**

Antes de escribirla en el código, verifica forma y rendimiento. Crea en el
**scratchpad** (fuera del repo) un `.mjs` y ejecútalo con
`node --env-file=.env.local` (necesita VPN; si no conecta, reporta NEEDS_CONTEXT).
Prueba con un pedido real (p.ej. `'AR.26.03365'`). Query candidata de cabecera:

```sql
SELECT TOP 1
  o.CodOrder AS pedido,
  cli.Description AS cliente,
  d.Description AS negocio,
  o.CityDelivery AS ciudad,
  o.Comment AS comentario,
  (SELECT MIN(l2.ReceptionDemandDate) FROM dbo.FACOrderLineSL l2
     WHERE l2.IDOrder = o.IDOrder AND l2.ReceptionDemandDate > '2000-01-01') AS solicitada
FROM dbo.FACOrderSL o
LEFT JOIN dbo.FACCustomer cli ON cli.IDCustomer = o.IDCustomer
LEFT JOIN dbo.FACCustomerDeliveryAddress d ON d.IDCustomerDeliveryAddress = o.IDCustomerDeliveryAddress
WHERE o.CodOrder = 'AR.26.03365' AND o.CodCompany = '001'
```

Y query candidata de prioridad + piezas (agregado sobre las MO de OT del pedido):

```sql
SELECT MAX(mo.Priority) AS prioridad, SUM(mo.Quantity) AS piezas
FROM dbo.CPRManufacturingOrder mo
WHERE mo.CodCompany = '001'
  AND EXISTS (
    SELECT 1 FROM dbo.FACOrderLineSL l JOIN dbo.FACOrderSL o ON o.IDOrder = l.IDOrder AND o.CodCompany='001'
    WHERE l.IDManufacturingOrder = mo.IDManufacturingOrder AND o.CodOrder = 'AR.26.03365'
  )
  AND EXISTS (
    SELECT 1 FROM dbo.CPRMOTask t JOIN dbo.CPRMOResourceMachine rm ON rm.IDMOTask = t.IDMOTask
    WHERE t.IDManufacturingOrder = mo.IDManufacturingOrder AND rm.CodMOResourceMachine IN ('a-otec','otec-a')
  )
```

Y la fecha de finalización:

```sql
SELECT MAX(e.fecha_cambio) AS finalizada
FROM dbo.tgm_estadosof_olanet e
JOIN dbo.CPRManufacturingOrder mo ON mo.CodManufacturingOrder = e.orden AND mo.CodCompany='001'
WHERE e.idestadoof = 3 AND EXISTS (
  SELECT 1 FROM dbo.FACOrderLineSL l JOIN dbo.FACOrderSL o ON o.IDOrder = l.IDOrder AND o.CodCompany='001'
  WHERE l.IDManufacturingOrder = mo.IDManufacturingOrder AND o.CodOrder = 'AR.26.03365'
)
```

Confirma que las tres devuelven datos coherentes y rápidos (<1 s cada una).
Ajusta las queries si la forma real difiere. Borra el script del scratchpad.
**Usa lo que devuelva la BD, no la memoria.**

- [ ] **Step 3: Implementar `leerHistorialPedidoDetalle` en `historial-db.ts`**

Añade (ajusta las queries a lo confirmado en el spike). Reutiliza `leerHistorialPedido`
para las OFs y `familiaDeTexto` para derivar familias de las descripciones:

```ts
import { familiaDeTexto } from "./rps";
import {
  cabeceraADetalle,
  type FilaCabecera,
  type HistorialPedidoDetalle,
} from "../historial";

export async function leerHistorialPedidoDetalle(
  pedido: string,
): Promise<HistorialPedidoDetalle> {
  const ofs = await leerHistorialPedido(pedido); // ya respeta mock/rps
  if (ES_MOCK) return detalleCabeceraMock(pedido, ofs);

  const pool = await getPool();

  const cab = (
    await pool.request().input("pedido", pedido).query<FilaCabecera>(`
      SELECT TOP 1 o.CodOrder AS pedido, cli.Description AS cliente,
             d.Description AS negocio, o.CityDelivery AS ciudad, o.Comment AS comentario,
             (SELECT MIN(l2.ReceptionDemandDate) FROM dbo.FACOrderLineSL l2
                WHERE l2.IDOrder = o.IDOrder AND l2.ReceptionDemandDate > '2000-01-01') AS solicitada,
             NULL AS prioridad, NULL AS piezas
      FROM dbo.FACOrderSL o
      LEFT JOIN dbo.FACCustomer cli ON cli.IDCustomer = o.IDCustomer
      LEFT JOIN dbo.FACCustomerDeliveryAddress d ON d.IDCustomerDeliveryAddress = o.IDCustomerDeliveryAddress
      WHERE o.CodOrder = @pedido AND o.CodCompany = '001'
    `)
  ).recordset[0] ?? null;

  const pp = (
    await pool.request().input("pedido", pedido).query<{ prioridad: number | null; piezas: number | null }>(`
      SELECT MAX(mo.Priority) AS prioridad, SUM(mo.Quantity) AS piezas
      FROM dbo.CPRManufacturingOrder mo
      WHERE mo.CodCompany = '001'
        AND EXISTS (SELECT 1 FROM dbo.FACOrderLineSL l JOIN dbo.FACOrderSL o ON o.IDOrder = l.IDOrder AND o.CodCompany='001'
                    WHERE l.IDManufacturingOrder = mo.IDManufacturingOrder AND o.CodOrder = @pedido)
        AND EXISTS (SELECT 1 FROM dbo.CPRMOTask t JOIN dbo.CPRMOResourceMachine rm ON rm.IDMOTask = t.IDMOTask
                    WHERE t.IDManufacturingOrder = mo.IDManufacturingOrder AND rm.CodMOResourceMachine IN ('a-otec','otec-a'))
    `)
  ).recordset[0] ?? { prioridad: null, piezas: null };

  const fin = (
    await pool.request().input("pedido", pedido).query<{ finalizada: Date | null }>(`
      SELECT MAX(e.fecha_cambio) AS finalizada
      FROM dbo.tgm_estadosof_olanet e
      JOIN dbo.CPRManufacturingOrder mo ON mo.CodManufacturingOrder = e.orden AND mo.CodCompany='001'
      WHERE e.idestadoof = 3 AND EXISTS (
        SELECT 1 FROM dbo.FACOrderLineSL l JOIN dbo.FACOrderSL o ON o.IDOrder = l.IDOrder AND o.CodCompany='001'
        WHERE l.IDManufacturingOrder = mo.IDManufacturingOrder AND o.CodOrder = @pedido)
    `)
  ).recordset[0]?.finalizada ?? null;

  const fila: FilaCabecera = cab ?? {
    pedido, cliente: null, negocio: null, ciudad: null, comentario: null, solicitada: null, prioridad: null, piezas: null,
  };
  fila.prioridad = pp.prioridad;
  fila.piezas = pp.piezas;

  const familias = [...new Set(ofs.map((of) => familiaDeTexto(of.descripcion, null)))];
  const finalizada = fin ? fin.toISOString() : null;
  return cabeceraADetalle(fila, ofs, finalizada, familias);
}

function detalleCabeceraMock(pedido: string, ofs: HistorialOF[]): HistorialPedidoDetalle {
  const p = PEDIDOS.find((x) => x.codigo === pedido);
  const familias = [...new Set(ofs.map((of) => familiaDeTexto(of.descripcion, null)))];
  return cabeceraADetalle(
    {
      pedido,
      cliente: p?.cliente ?? null,
      negocio: p?.negocio ?? null,
      ciudad: p?.ciudadEntrega ?? null,
      comentario: p?.comentarioVenta ?? null,
      solicitada: p ? p.fechaSolicitud : null,
      prioridad: p?.prioridad ?? null,
      piezas: p ? p.ofs.reduce((n, o) => n + o.piezas, 0) : null,
    },
    ofs,
    p ? `${p.fechaPlanificacion}T00:00:00.000Z` : null,
    familias,
  );
}
```

- [ ] **Step 4: Actualizar el route handler**

En `src/app/api/historial/[pedido]/route.ts`, cambia el import y la llamada para
devolver el detalle completo:

```ts
import { leerHistorialPedidoDetalle } from "@/lib/server/historial-db";
// ...
    const detalle = await leerHistorialPedidoDetalle(pedido);
    return NextResponse.json(detalle, { headers: { "Cache-Control": "no-store" } });
```

(Se mantiene la validación `CODIGO_PEDIDO_RE` → 400 y el try/catch → 500.)

- [ ] **Step 5: Actualizar el test de API a la forma nueva**

En `src/lib/__tests__/api-historial.test.ts`, el test de detalle válido pasa a
comprobar la forma nueva:

```ts
test("GET detalle con código válido responde 200 y el detalle del pedido", async () => {
  const res = await detalle.GET(new Request("http://x/api/historial/AR.26.03453"), {
    params: Promise.resolve({ pedido: "AR.26.03453" }),
  });
  expect(res.status).toBe(200);
  const data = (await res.json()) as { codigo: string; ofs: unknown[]; scanUrl: string };
  expect(data.codigo).toBe("AR.26.03453");
  expect(Array.isArray(data.ofs)).toBe(true);
  expect(data.scanUrl).toBe("/api/pedidos/AR.26.03453.pdf");
});
```

- [ ] **Step 6: Ejecutar tests + build**

Run: `pnpm test api-historial && pnpm test historial && pnpm build`
Expected: PASS; `Compiled successfully`, TypeScript limpio.

- [ ] **Step 7: Commit**

```bash
git add src/lib/server/rps.ts src/lib/server/historial-db.ts "src/app/api/historial/[pedido]/route.ts" src/lib/__tests__/api-historial.test.ts
git commit -m "feat(historial): detalle con cabecera del pedido (cliente, datos, familias)"
```

---

### Task 3: UI — `HistorialDrawer` + clic en fila abre el drawer

**Files:**
- Create: `src/components/HistorialDrawer.tsx`
- Modify: `src/components/HistorialView.tsx` (fila → abre drawer; quitar expand inline)

**Interfaces:**
- Consumes: `GET /api/historial/[pedido]` → `HistorialPedidoDetalle` (Task 2); tipos `HistorialItem`, `HistorialPedidoDetalle`, `HistorialOF` de `@/lib/historial`; `fmtMin` de `@/lib/estado`; `FamiliaTag` de `./FamiliaTag`.
- Produces: `<HistorialDrawer pedido={codigo} onClose={...} />` (read-only).

- [ ] **Step 1: Crear `HistorialDrawer.tsx`**

Crea `src/components/HistorialDrawer.tsx`:

```tsx
"use client";

import { useCallback, useEffect, useState } from "react";
import type { HistorialPedidoDetalle } from "@/lib/historial";
import { fmtMin } from "@/lib/estado";
import { FamiliaTag } from "./FamiliaTag";

function fmtFecha(iso: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
}

/** Drawer read-only del historial: PDF (mediano, ampliable) + datos del pedido y
 *  sus OFs con tiempos. Sin acciones (el pedido está finalizado). */
export function HistorialDrawer({
  pedido,
  onClose,
}: {
  pedido: string | null;
  onClose: () => void;
}) {
  const [detalle, setDetalle] = useState<HistorialPedidoDetalle | null>(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState(false);
  const [ampliado, setAmpliado] = useState(false);

  const cargar = useCallback(async (cod: string) => {
    setCargando(true);
    setError(false);
    try {
      const r = await fetch(`/api/historial/${cod}`, { cache: "no-store" });
      if (!r.ok) throw new Error(String(r.status));
      setDetalle((await r.json()) as HistorialPedidoDetalle);
    } catch {
      setError(true);
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    if (!pedido) return;
    setDetalle(null);
    setAmpliado(false);
    cargar(pedido);
  }, [pedido, cargar]);

  useEffect(() => {
    if (!pedido) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        if (ampliado) setAmpliado(false);
        else onClose();
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [pedido, ampliado, onClose]);

  if (!pedido) return null;
  const scanUrl = detalle?.scanUrl ?? `/api/pedidos/${pedido}.pdf`;
  // La ruta de PDFs solo resuelve AR.*; para otras series se avisa en vez de romper.
  const pdfSoportado = /^AR\./.test(pedido);

  return (
    <div className="fixed inset-0 z-50">
      <div className="overlay-in absolute inset-0 bg-black/60 backdrop-blur-md" onClick={onClose} />

      {/* PDF mediano a la izquierda */}
      <div className="overlay-in absolute inset-y-0 left-0 right-[32rem] flex flex-col p-6" onClick={onClose}>
        <div className="min-h-0 flex-1" onClick={(e) => e.stopPropagation()}>
          {pdfSoportado ? (
            <div className="relative h-full w-full">
              <iframe
                src={`${scanUrl}#view=Fit`}
                title={`Pedido ${pedido}`}
                className="h-full w-full rounded-xl border-none bg-white"
              />
              <button
                onClick={() => setAmpliado(true)}
                className="absolute right-3 top-3 rounded-lg bg-black/60 px-3 py-1.5 text-xs font-semibold text-white hover:bg-black/80"
              >
                Ampliar ⤢
              </button>
            </div>
          ) : (
            <div className="grid h-full w-full place-items-center rounded-xl bg-surface-2 text-sm text-text-muted">
              PDF no disponible para esta serie
            </div>
          )}
        </div>
      </div>

      {/* Panel derecho: datos + OFs */}
      <aside className="glass-panel-strong drawer-in absolute right-0 top-0 flex h-full w-full max-w-lg flex-col rounded-l-2xl">
        <header className="flex items-start gap-3 p-4" style={{ boxShadow: "inset 0 -1px 0 0 var(--glass-border)" }}>
          <div className="min-w-0">
            <h2 className="font-mono text-lg font-bold text-text">{pedido}</h2>
            <p className="truncate text-sm text-text-muted">
              {detalle?.cliente ?? "—"}
              {detalle?.negocio && <span className="font-semibold text-text"> · {detalle.negocio}</span>}
            </p>
          </div>
          <button onClick={onClose} aria-label="Cerrar"
            className="ml-auto grid size-8 shrink-0 place-items-center rounded-lg text-text-muted hover:bg-[var(--glass-highlight)] hover:text-text">
            ✕
          </button>
        </header>

        <div className="scroll-thin flex-1 overflow-y-auto p-4">
          {cargando && <p className="text-sm text-text-muted">Cargando…</p>}
          {error && (
            <div className="flex items-center gap-3 rounded-xl border border-red-500/40 bg-red-500/5 px-4 py-3 text-sm text-text">
              No se pudo cargar el pedido.
              <button onClick={() => cargar(pedido)} className="rounded-lg bg-surface px-2 py-1 text-xs font-semibold ring-1 ring-border hover:bg-surface-2">
                Reintentar
              </button>
            </div>
          )}

          {detalle && !cargando && (
            <>
              <dl className="mb-4 grid grid-cols-2 gap-x-4 gap-y-2.5 text-xs">
                <Meta k="Solicitud" v={fmtFecha(detalle.fechaSolicitud)} />
                <Meta k="Finalización" v={fmtFecha(detalle.fechaFinalizacion)} />
                <Meta k="Piezas" v={String(detalle.piezas)} />
                {detalle.ciudadEntrega && <Meta k="Entrega en" v={detalle.ciudadEntrega} />}
                <div className="col-span-2">
                  <dt className="mb-1 text-text-muted">Familias</dt>
                  <dd className="flex flex-wrap gap-1">
                    {detalle.familias.map((f) => <FamiliaTag key={f} familia={f} />)}
                  </dd>
                </div>
              </dl>

              {detalle.comentarioVenta && (
                <div className="mb-4 rounded-xl border border-[var(--glass-border)] bg-[var(--glass-highlight)] p-3">
                  <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-text-muted">Comentario del pedido</p>
                  <p className="whitespace-pre-line text-[11px] leading-snug text-text">{detalle.comentarioVenta}</p>
                </div>
              )}

              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-muted">
                Órdenes de fabricación ({detalle.ofs.length})
              </h3>
              <ul className="space-y-2">
                {detalle.ofs.map((of) => (
                  <li key={of.codigo} className="glass-chip rounded-xl p-3">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs font-semibold text-text">{of.codigo}</span>
                      <span className="ml-auto rounded bg-surface-2 px-1.5 py-0.5 text-[11px] font-semibold text-text ring-1 ring-border">
                        {fmtMin(of.tiempoImputadoMin)}
                      </span>
                    </div>
                    <p className="mt-1 text-sm text-text">{of.descripcion}</p>
                    <p className="mt-1 text-[11px] text-text-muted">
                      {of.quien.length > 0 ? of.quien.join(", ") : "—"}
                    </p>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      </aside>

      {/* Ampliado: PDF a pantalla casi completa */}
      {ampliado && pdfSoportado && (
        <div className="overlay-in fixed inset-0 z-[80] bg-black/70 backdrop-blur-md" onClick={() => setAmpliado(false)}>
          <div className="absolute inset-x-0 top-0 z-10 flex items-center gap-3 p-4 text-white">
            <span className="font-mono text-sm font-bold">{pedido}</span>
            <a href={scanUrl} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}
              className="ml-auto rounded-lg bg-white/10 px-3 py-1.5 text-xs font-semibold hover:bg-white/20">
              Abrir original ↗
            </a>
            <button onClick={() => setAmpliado(false)} aria-label="Cerrar"
              className="grid size-9 place-items-center rounded-lg bg-white/10 text-lg hover:bg-white/20">✕</button>
          </div>
          <div className="grid h-full place-items-center p-10" onClick={() => setAmpliado(false)}>
            <iframe src={scanUrl} title={`Pedido ${pedido}`} onClick={(e) => e.stopPropagation()}
              className="h-full w-full max-w-5xl rounded-xl bg-white shadow-2xl" />
          </div>
        </div>
      )}
    </div>
  );
}

function Meta({ k, v }: { k: string; v: string }) {
  return (
    <div>
      <dt className="text-text-muted">{k}</dt>
      <dd className="font-medium text-text">{v}</dd>
    </div>
  );
}
```

- [ ] **Step 2: Cambiar la fila del Historial para abrir el drawer**

En `src/components/HistorialView.tsx`:

(a) Importa el drawer y añade estado del pedido abierto en el componente `HistorialView`:

```tsx
import { HistorialDrawer } from "./HistorialDrawer";
// dentro de HistorialView, junto a los demás useState:
  const [abierto, setAbierto] = useState<string | null>(null);
```

(b) La fila (`FilaHistorial`) deja de expandir OFs inline: se simplifica a un
botón que llama a un `onOpen(item.pedido)`. Reemplaza el componente
`FilaHistorial` por esta versión sin estado de detalle:

```tsx
function FilaHistorial({ item, onOpen }: { item: HistorialItem; onOpen: (pedido: string) => void }) {
  return (
    <button
      onClick={() => onOpen(item.pedido)}
      className="flex w-full items-center gap-3 rounded-xl border border-border bg-surface px-4 py-2.5 text-left hover:bg-surface-2/60"
    >
      <span className="size-2.5 shrink-0 rounded-full bg-cyan-600" />
      <span className="font-semibold text-text">{item.pedido}</span>
      <span className="truncate text-sm text-text-muted">{item.cliente ?? "—"}</span>
      <span className="ml-auto flex shrink-0 items-center gap-3 text-xs text-text-muted">
        <span>{item.nOf} OF</span>
        <span>Finalizado {fmtFecha(item.finalizada)}</span>
      </span>
    </button>
  );
}
```

(c) En el render de la lista, pasa `onOpen` y monta el drawer. Sustituye el map
de items y añade el drawer al final del JSX de `HistorialView`:

```tsx
        {items.map((it) => (
          <FilaHistorial key={it.pedido} item={it} onOpen={setAbierto} />
        ))}
```

```tsx
      {/* al final del árbol devuelto por HistorialView, antes del cierre */}
      <HistorialDrawer pedido={abierto} onClose={() => setAbierto(null)} />
```

(d) Elimina de `HistorialView.tsx` el import de `HistorialOF` y el `fmtMin` si
quedan sin uso tras quitar el detalle inline (el antiguo `FilaHistorial` los
usaba). Verifica con el build/lint y quítalos solo si el linter los marca.

- [ ] **Step 3: Verificar build + tests + lint**

Run: `pnpm test && pnpm build`
Expected: tests verdes, `Compiled successfully`, TypeScript limpio.
Run: `pnpm lint` → `HistorialView.tsx` y `HistorialDrawer.tsx` sin errores nuevos
(los pre-existentes en Drawer.tsx/MiFichaje.tsx/PedidoCard.tsx se dejan).

- [ ] **Step 4: Comprobación manual**

Con `DATASOURCE=rps` + VPN (o en el server):
1. Historial: clic en un pedido → abre el drawer, con el PDF mediano a la izquierda.
2. Datos a la derecha: cliente, fechas, piezas, familias, comentario, y las OFs con su tiempo y quién.
3. "Ampliar" → PDF casi a pantalla completa; Escape o ✕ vuelve al drawer; Escape de nuevo cierra.
4. Un pedido de serie no `AR.` → panel izquierdo con "PDF no disponible", datos igual.
5. Con `DATASOURCE=mock`: abre un pedido mock; datos del mock, sin errores.

- [ ] **Step 5: Commit**

```bash
git add src/components/HistorialDrawer.tsx src/components/HistorialView.tsx
git commit -m "feat(historial): abrir pedido en drawer read-only (PDF ampliable + datos + OFs)"
```

---

## Self-Review

**Cobertura del spec:**
- Clic en fila → drawer, sin expand inline → Task 3. ✅
- PDF mediano + Ampliar → Task 3 (iframe + overlay ampliado). ✅
- Cabecera completa (cliente, negocio, ciudad, prioridad, fechas, piezas, familias, comentario, scanUrl) → Tasks 1 (tipo/mapeo) + 2 (query). ✅
- OFs con tiempos + quién → reusa `leerHistorialPedido`. ✅
- Read-only (sin acciones) → el drawer no monta ninguna acción. ✅
- PDF no soportado (no `AR.*`) → aviso, no rompe. ✅
- Fallback mock → Task 2 `detalleCabeceraMock`. ✅
- Solo lectura, params mssql → Task 2 (`.input`). ✅

**Placeholders:** ninguno. La query de cabecera lleva spike de verificación (Task 2 Step 2).

**Consistencia de tipos:**
- `HistorialPedidoDetalle`/`FilaCabecera`/`cabeceraADetalle` (Task 1) consumidos en Task 2 y Task 3 con las mismas firmas.
- `leerHistorialPedidoDetalle(pedido): Promise<HistorialPedidoDetalle>` (Task 2) usado en el route y devuelto al drawer (Task 3).
- `familiaDeTexto` exportado en Task 2 Step 1, consumido en `historial-db.ts` (misma firma `(descripcionMO, articulo)`).

**Notas:**
- El "Ampliar" no reutiliza `ScanViewer` (requiere un `Pedido` completo + réplica dibujada, no aplicable): se hace un overlay iframe propio, más simple y sin dependencias sobrantes.
- `nOf` de la lista (señal idestadoof=3) puede diferir del nº de OFs del detalle (recurso a-otec): ya anotado como follow-up del historial; no se aborda aquí.
