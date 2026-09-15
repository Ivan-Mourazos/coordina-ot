# Material gastado, dar por terminada una OF en RPS y recuperar un pedido — plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementar las tres funciones de `docs/superpowers/specs/2026-09-15-material-gastado-y-cerrar-of-design.md`: el botón de material gastado en el Historial, la acción «Dar por terminada en RPS» sobre una OF suelta del tablero, y «Volver a plantear el pedido» desde el Historial.

**Architecture:** Material gastado es de solo lectura (consulta nueva a RPS, ruta con sesión, botón en `HistorialCentros`). Las otras dos comparten una base: una tabla `of_retenida` (SQLite) que hace que `filasDeLaSeccion` (rps.ts) siga trayendo al tablero las OF que la web recuerda aunque la vista de RPS ya no las traiga; tres columnas nuevas en `of_overlay` para la marca «cerrada en RPS»; y una función de servidor (`finalizarFase`, en `server/olanet.ts`) que comparten `POST /api/fases` (el arrastre de hoy) y la ruta nueva `POST /api/fases/cerrar-of`. «Dar por terminada» corta el fichaje, drena la cola de OLANET con un candado nuevo en `drenarCola`, escribe el 3 solo en modo `activo`, y marca la OF en la misma transacción que la retiene. «Recuperar un pedido» reconstruye sus OF (de `pedido_paso_seccion.of_ids` o, si no hay, de RPS) y las reabre con `guardarMutacion`.

**Tech Stack:** Next.js 16 (App Router), React, TypeScript, mssql (RPS y OLANET), better-sqlite3 (BD propia), Vitest.

## Global Constraints

- Nada se escribe en RPS. En OLANET, solo lo que dice la spec y siempre respetando `modoFichaje()` (`src/lib/server/olanet-outbox.ts`). Los tests mockean OLANET (`vi.mock("@/lib/server/olanet", …)` o `"../server/olanet"` según la ruta del test): ningún test ni script de este plan escribe en OLANET. El ensayo final contra el servidor real (Tarea 8) queda como paso MANUAL de Iván, con David/IT avisados; ningún agente lo ejecuta.
- Parámetros SQL tipados: `CodOrder` → `sql.VarChar(25)`. Sin tipo, el driver manda `nvarchar` contra una columna `varchar` y se pierde el índice (medido: 5.522 ms frente a 8 ms).
- Cada commit que el equipo note lleva línea `Novedad:` en la primera columna (ver `AGENTS.md`); refactors y tests no llevan.
- Comentarios en castellano explicando el porqué, con la densidad del código de alrededor.
- Verificación por tarea: `pnpm test`, `npx tsc --noEmit`, `pnpm lint`.
- Rama `tareas-tiempos-equipo`. Antes de tocar rutas o `app/`, si hay dudas sobre una API de Next 16, mirar `node_modules/next/dist/docs/` (AGENTS.md).

---

## Task 1: Material gastado en el Historial

Sección 1 de la spec. No escribe en OLANET ni en RPS: es una consulta nueva y un botón nuevo.

**Files:**
- Modify: `src/lib/server/historial-db.ts` (nueva función `leerMaterialGastadoPedido`; añadir `import sql from "mssql";`)
- Modify: `src/lib/historial.ts` (nuevo tipo `MaterialGastadoOF` y helper `fmtCantidad`)
- Create: `src/app/api/historial/[pedido]/gastado/route.ts`
- Modify: `src/components/HistorialDrawer.tsx` (pide la ruta nueva a la vez que el detalle; pasa `gastado` a `HistorialCentros`)
- Modify: `src/components/HistorialCentros.tsx` (rótulo «Asignado», botón «Gastado» nuevo)
- Test: `src/lib/__tests__/historial-db-gastado.test.ts` (consulta, con mssql simulado)
- Test: `src/lib/__tests__/historial.test.ts` (helper `fmtCantidad`)
- Test: `src/lib/__tests__/api-historial-gastado.test.ts` (ruta, con sesión)

**Interfaces:**
- Produces: `MaterialGastadoOF { material: string; codigo: string; gastado: number; ultimaSalida: string | null }` (`src/lib/historial.ts`).
- Produces: `leerMaterialGastadoPedido(pedido: string): Promise<Record<string, MaterialGastadoOF[]>>` (`src/lib/server/historial-db.ts`).
- Produces: `fmtCantidad(n: number): string` (`src/lib/historial.ts`) — cantidad con coma decimal ("17,7").
- Produces: `GET /api/historial/[pedido]/gastado` → `{ gastado: Record<string, MaterialGastadoOF[]> }`.

- [ ] **Step 1: Escribir el tipo y el helper de formato, con su test (falla)**

Crear `src/lib/__tests__/historial.test.ts` — si el fichero ya existe, añadir al final:

```ts
import { fmtCantidad } from "../historial";

describe("fmtCantidad", () => {
  it("cantidades enteras sin decimales, y con coma si los lleva", () => {
    expect(fmtCantidad(12)).toBe("12");
    expect(fmtCantidad(17.7)).toBe("17,7");
    expect(fmtCantidad(-1)).toBe("-1");
  });
});
```

Run: `pnpm vitest run src/lib/__tests__/historial.test.ts -t fmtCantidad`
Expected: FAIL — `fmtCantidad is not exported`.

- [ ] **Step 2: Añadir el tipo y el helper a `src/lib/historial.ts`**

Detrás de la definición de `MaterialOF` (justo después de `export function aMaterialOF`, antes de `repartirMateriales`), añadir:

```ts
// ─── Material GASTADO: tercera fuente, la del almacén ────────────────────────
// Ni "asignado" (CPRMOMaterial, lo que OT planeó) ni "reservado"
// (STKStockReserve, lo que sigue apartado): esto es lo que salió de verdad
// (CPRImputationMaterialMO). No se casan línea a línea —IDMOMaterial está
// vacío en el 95,4 % de los apuntes de 2026— así que viajan por su cuenta.
// Ver material-gastado.md y la sección 1 de la spec del 15/09/2026.

/** Una línea de lo gastado en una OF, YA neta (las devoluciones parciales ya
 *  están restadas: la consulta agrupa con `SUM(Quantity)`). */
export interface MaterialGastadoOF {
  /** Descripción del artículo en el momento de la salida — puede no coincidir
   *  con `MaterialOF.texto` de lo asignado: son datos de momentos distintos. */
  material: string;
  /** Código de artículo (`STKArticle.CodArticle`), lo que reconoce el almacén.
   *  Cadena vacía si RPS no lo tiene enlazado. */
  codigo: string;
  /** Cantidad neta. Negativa = se devolvió más de lo que se había sacado (1
   *  caso en todo 2026); los devueltos ENTEROS (neto cero) no llegan aquí. */
  gastado: number;
  /** yyyy-mm-dd de la salida más reciente de esta línea, o null si RPS no
   *  trae fecha (no debería pasar: la consulta siempre agrega `MAX`). */
  ultimaSalida: string | null;
}

/** Cantidad con coma decimal, como se escribe en castellano ("17,7"). Sin
 *  decimales de sobra: `toLocaleString` ya recorta un entero a "12". */
export function fmtCantidad(n: number): string {
  return n.toLocaleString("es-ES", { maximumFractionDigits: 2 });
}
```

- [ ] **Step 3: Ejecutar el test y verlo pasar**

Run: `pnpm vitest run src/lib/__tests__/historial.test.ts -t fmtCantidad`
Expected: PASS.

- [ ] **Step 4: Escribir el test de la consulta (falla)**

Crear `src/lib/__tests__/historial-db-gastado.test.ts`:

```ts
import { afterEach, beforeEach, expect, test, vi } from "vitest";

// mssql se simula por completo: lo que se comprueba es la FORMA de la
// consulta (parámetro tipado, agrupado por OF+material) y el mapeo del
// resultado, no la conexión real.
const query = vi.fn();
const input = vi.fn().mockReturnThis();
const request = vi.fn(() => ({ input, query }));
const getPool = vi.fn(async () => ({ request }));

vi.mock("../server/db", () => ({ getPool: () => getPool() }));

let historialDb: typeof import("../server/historial-db");

beforeEach(async () => {
  vi.clearAllMocks();
  process.env.DATASOURCE = "rps";
  vi.resetModules();
  historialDb = await import("../server/historial-db");
});
afterEach(() => {
  delete process.env.DATASOURCE;
});

test("el parámetro del pedido va tipado VarChar(25)", async () => {
  query.mockResolvedValue({ recordset: [] });
  await historialDb.leerMaterialGastadoPedido("AR.26.04488");
  expect(input).toHaveBeenCalledWith("pedido", expect.objectContaining({ type: 2 /* sql.VarChar */ }), "AR.26.04488");
});

test("agrupa por OF, sin campos de coste", async () => {
  query.mockResolvedValue({
    recordset: [
      { orden: "0232070 ", material: "TUBO 500", codigo: "TUB500", gastado: 2, ultima_salida: new Date("2026-09-10") },
      { orden: "0232070 ", material: "TUBO 700", codigo: "TUB700", gastado: 1, ultima_salida: new Date("2026-09-12") },
      { orden: "0232071 ", material: "MANIVELA", codigo: "MAN01", gastado: 3, ultima_salida: new Date("2026-09-08") },
    ],
  });
  const r = await historialDb.leerMaterialGastadoPedido("AR.26.04488");
  expect(r["0232070"]).toEqual([
    { material: "TUBO 500", codigo: "TUB500", gastado: 2, ultimaSalida: "2026-09-10" },
    { material: "TUBO 700", codigo: "TUB700", gastado: 1, ultimaSalida: "2026-09-12" },
  ]);
  expect(r["0232071"]).toHaveLength(1);
  // El SQL en sí no pide CostAmountReal: es margen, y la ficha no enseña dinero.
  const sql = query.mock.calls[0][0] as string;
  expect(sql).not.toMatch(/CostAmountReal/);
  expect(sql).toMatch(/HAVING SUM\(i\.Quantity\) <> 0/);
});

test("sin filas, mapa vacío — no 'no se gastó material'", async () => {
  query.mockResolvedValue({ recordset: [] });
  expect(await historialDb.leerMaterialGastadoPedido("AR.26.09999")).toEqual({});
});

test("en modo mock no consulta RPS", async () => {
  delete process.env.DATASOURCE;
  vi.resetModules();
  historialDb = await import("../server/historial-db");
  expect(await historialDb.leerMaterialGastadoPedido("AR.26.04488")).toEqual({});
  expect(getPool).not.toHaveBeenCalled();
});
```

Run: `pnpm vitest run src/lib/__tests__/historial-db-gastado.test.ts`
Expected: FAIL — `leerMaterialGastadoPedido is not exported`.

- [ ] **Step 5: Añadir la consulta a `src/lib/server/historial-db.ts`**

Añadir `import sql from "mssql";` a la cabecera de imports (detrás de la línea 1, junto a los demás imports de servidor). Después de `leerMaterialesPedido` (la función que cierra en la línea 586), añadir:

```ts
interface FilaGastado {
  orden: string | null;
  material: string | null;
  codigo: string | null;
  gastado: number | null;
  ultima_salida: Date | null;
}

/** Lo que salió de verdad del almacén para las OF de este pedido
 *  (`CPRImputationMaterialMO`), agrupado por OF y material. Va por el índice
 *  `IXP_CPRImputationMaterialMO1 (CodCompany, IDManufacturingOrder,
 *  ImputationDate)`. Sin `SUM(CostAmountReal)`: es coste de almacén (margen)
 *  y la ficha no enseña dinero. Ver material-gastado.md §4.
 *
 *  El `HAVING` esconde las devoluciones ENTERAS (neto cero); un neto negativo
 *  se deja pasar tal cual, con su signo — es la única forma honesta de
 *  contarlo sin inventar una columna de "desvío" que no existe (IDMOMaterial
 *  vacío en el 95,4 % de los apuntes de 2026: no se puede casar con lo
 *  asignado línea a línea). */
export async function leerMaterialGastadoPedido(
  pedido: string,
): Promise<Record<string, MaterialGastadoOF[]>> {
  const salida: Record<string, MaterialGastadoOF[]> = {};
  if (ES_MOCK) return salida;

  const pool = await getPool();
  const r = await pool
    .request()
    .input("pedido", sql.VarChar(25), pedido)
    .query<FilaGastado>(`
      SELECT mo.CodManufacturingOrder AS orden,
             COALESCE(NULLIF(LTRIM(RTRIM(i.Description)), ''), art.Description) AS material,
             art.CodArticle        AS codigo,
             SUM(i.Quantity)       AS gastado,
             MAX(i.ImputationDate) AS ultima_salida
      FROM dbo.CPRImputationMaterialMO i
      JOIN dbo.CPRManufacturingOrder mo
        ON mo.IDManufacturingOrder = i.IDManufacturingOrder
      LEFT JOIN dbo.STKArticle art ON art.IDArticle = i.IDArticle
      WHERE i.CodCompany = '001'
        AND EXISTS (
          SELECT 1 FROM dbo.FACOrderLineSL l
          JOIN dbo.FACOrderSL o ON o.IDOrder = l.IDOrder AND o.CodCompany = '001'
          WHERE l.IDManufacturingOrder = i.IDManufacturingOrder
            AND o.CodOrder = @pedido)
      GROUP BY mo.CodManufacturingOrder,
               COALESCE(NULLIF(LTRIM(RTRIM(i.Description)), ''), art.Description),
               art.CodArticle
      HAVING SUM(i.Quantity) <> 0
      ORDER BY orden, material
    `);

  for (const fila of r.recordset) {
    const orden = (fila.orden ?? "").trim();
    if (!orden) continue;
    const lista = salida[orden] ?? (salida[orden] = []);
    lista.push({
      material: (fila.material ?? "").trim() || "(material sin nombre)",
      codigo: (fila.codigo ?? "").trim(),
      gastado: fila.gastado ?? 0,
      ultimaSalida: fila.ultima_salida ? fila.ultima_salida.toISOString().slice(0, 10) : null,
    });
  }
  return salida;
}
```

Añadir `MaterialGastadoOF` al bloque de `import { … } from "../historial";` ya existente en la cabecera del fichero.

- [ ] **Step 6: Ejecutar el test y verlo pasar**

Run: `pnpm vitest run src/lib/__tests__/historial-db-gastado.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 7: Commit**

```bash
git add src/lib/historial.ts src/lib/server/historial-db.ts src/lib/__tests__/historial.test.ts src/lib/__tests__/historial-db-gastado.test.ts
git commit -m "$(cat <<'EOF'
feat(historial): consulta de material gastado por OF, sin coste

Novedad: nuevo | El Historial va a enseñar cuánto material salió de verdad del almacén para cada OF, no solo lo que se apuntó al planificar.
EOF
)"
```

(La `Novedad:` se escribe ya aquí porque la consulta es la base del botón que sale en la Tarea siguiente; si se prefiere una sola línea de novedad por toda la Tarea 1, mover este texto al commit del Step 12 y quitarlo de aquí — pero un commit que se note lleva su línea, y este ya es code que el equipo va a ejecutar en producción en cuanto se despliegue el botón.)

- [ ] **Step 8: Escribir el test de la ruta (falla)**

Crear `src/lib/__tests__/api-historial-gastado.test.ts`:

```ts
import { afterEach, beforeEach, expect, test, vi } from "vitest";

const leerMaterialGastadoPedido = vi.fn();
vi.mock("@/lib/server/historial-db", () => ({
  leerMaterialGastadoPedido: (p: string) => leerMaterialGastadoPedido(p),
}));
// Login apagado por defecto en los tests: soloConSesion deja pasar a todos.
vi.mock("@/lib/server/sesion", () => ({ soloConSesion: () => null }));

let ruta: typeof import("../../app/api/historial/[pedido]/gastado/route");

beforeEach(async () => {
  vi.clearAllMocks();
  ruta = await import("../../app/api/historial/[pedido]/gastado/route");
});
afterEach(() => vi.resetModules());

const get = (pedido: string) =>
  ruta.GET(new Request(`http://x/api/historial/${pedido}/gastado`), {
    params: Promise.resolve({ pedido }),
  });

test("código de pedido inválido es 400 y no consulta nada", async () => {
  const res = await get("'; DROP--");
  expect(res.status).toBe(400);
  expect(leerMaterialGastadoPedido).not.toHaveBeenCalled();
});

test("devuelve el mapa de la consulta", async () => {
  leerMaterialGastadoPedido.mockResolvedValue({ "0232070": [{ material: "TUBO", codigo: "T1", gastado: 2, ultimaSalida: "2026-09-10" }] });
  const res = await get("AR.26.04488");
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ gastado: { "0232070": [{ material: "TUBO", codigo: "T1", gastado: 2, ultimaSalida: "2026-09-10" }] } });
});

test("RPS caído es 500, no un 200 con datos falsos", async () => {
  leerMaterialGastadoPedido.mockRejectedValue(new Error("timeout"));
  expect((await get("AR.26.04488")).status).toBe(500);
});
```

Run: `pnpm vitest run src/lib/__tests__/api-historial-gastado.test.ts`
Expected: FAIL — no existe la ruta.

- [ ] **Step 9: Crear la ruta**

Crear `src/app/api/historial/[pedido]/gastado/route.ts`:

```ts
import { NextResponse } from "next/server";
import { leerMaterialGastadoPedido } from "@/lib/server/historial-db";
import { CODIGO_PEDIDO_RE } from "@/lib/historial";
import { soloConSesion } from "@/lib/server/sesion";

// ─── GET /api/historial/[pedido]/gastado ─────────────────────────────────────
// Aparte del detalle (`/api/historial/[pedido]`) y no dentro de
// `leerHistorialPedidoDetalle`: la consulta sin login llama a esa misma
// función (`detalleConsulta`, server/publico-db.ts), y metido ahí el invitado
// pagaría la consulta y su seguridad dependería de que la lista blanca de
// `ofConsulta` (lib/publico.ts) no lo copiara nunca. En ruta propia, el
// invitado no tiene camino para leerlo — ver "Cómo" de la sección 1 de la
// spec del 15/09/2026.

export const dynamic = "force-dynamic";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ pedido: string }> },
) {
  const corte = soloConSesion(req);
  if (corte) return corte;

  const { pedido } = await params;
  if (!CODIGO_PEDIDO_RE.test(pedido))
    return NextResponse.json({ error: "Código de pedido no válido" }, { status: 400 });

  try {
    const gastado = await leerMaterialGastadoPedido(pedido);
    return NextResponse.json({ gastado }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    console.error("[historial] material gastado falló:", (e as Error).message);
    return NextResponse.json({ error: "No se pudo consultar el material gastado" }, { status: 500 });
  }
}
```

- [ ] **Step 10: Ejecutar el test y verlo pasar**

Run: `pnpm vitest run src/lib/__tests__/api-historial-gastado.test.ts`
Expected: PASS.

- [ ] **Step 11: Pedir la ruta desde `HistorialDrawer` a la vez que el detalle**

En `src/components/HistorialDrawer.tsx`, añadir el import del tipo detrás de `import type { HistorialPedidoDetalle } from "@/lib/historial";`:

```ts
import type { HistorialPedidoDetalle, MaterialGastadoOF } from "@/lib/historial";
```

Sustituir el bloque `const [detalle, setDetalle] = useState…` … `const cargar = useCallback(…)` (líneas 49-79 de hoy) por:

```ts
  const [detalle, setDetalle] = useState<HistorialPedidoDetalle | null>(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState(false);
  // undefined = todavía cargando; null = RPS no contestó; objeto = cargado
  // (puede llevar OF sin ninguna línea: eso no es lo mismo que "error").
  const [gastado, setGastado] = useState<Record<string, MaterialGastadoOF[]> | null | undefined>(undefined);
  const reqSeq = useRef(0);

  const [prevPedido, setPrevPedido] = useState<string | null>(null);
  // Reset al cambiar de pedido DURANTE el render (no en un efecto): así nunca
  // hay un frame con la cabecera del pedido nuevo y los datos/PDF del anterior.
  if (pedido !== prevPedido) {
    setPrevPedido(pedido);
    setDetalle(null);
    setError(false);
    setGastado(undefined);
  }

  // Dos peticiones INDEPENDIENTES bajo la misma marca de secuencia: si RPS no
  // contesta a "gastado" el resto de la ficha no se entera (spec §1, "Cómo se
  // ve"). Con un solo try/catch para las dos, un fallo de la más nueva de las
  // dos tumbaba también el detalle, que es justo lo que no puede pasar.
  const cargarDetalle = useCallback(async (cod: string, seq: number) => {
    setCargando(true);
    setError(false);
    try {
      const r = await fetch(`/api/historial/${cod}?seccion=${seccion}`, { cache: "no-store" });
      if (!r.ok) throw new Error(String(r.status));
      const d = (await r.json()) as HistorialPedidoDetalle;
      if (seq !== reqSeq.current) return; // respuesta de un pedido anterior: la ignoramos
      setDetalle(d);
    } catch {
      if (seq !== reqSeq.current) return;
      setError(true);
    } finally {
      if (seq === reqSeq.current) setCargando(false);
    }
  }, [seccion]);

  const cargarGastado = useCallback(async (cod: string, seq: number) => {
    try {
      const r = await fetch(`/api/historial/${cod}/gastado`, { cache: "no-store" });
      if (!r.ok) throw new Error(String(r.status));
      const d = (await r.json()) as { gastado: Record<string, MaterialGastadoOF[]> };
      if (seq === reqSeq.current) setGastado(d.gastado);
    } catch {
      if (seq === reqSeq.current) setGastado(null);
    }
  }, []);

  const cargar = useCallback((cod: string) => {
    const seq = ++reqSeq.current;
    setGastado(undefined);
    void cargarDetalle(cod, seq);
    void cargarGastado(cod, seq);
  }, [cargarDetalle, cargarGastado]);
```

El resto del fichero (el `useEffect` que llama a `cargar(pedido)` con `setTimeout(0)`) no cambia: `cargar` sigue siendo una función síncrona que dispara las dos peticiones.

Bajar `gastado` hasta `HistorialCentros`. Buscar la línea `<HistorialCentros ofs={detalle.ofs} seccion={seccion} />` (dentro del bloque de OFs, más abajo en el fichero) y sustituirla por:

```tsx
              <HistorialCentros ofs={detalle.ofs} seccion={seccion} gastado={gastado} onReintentarGastado={() => cargar(pedido)} />
```

- [ ] **Step 12: `HistorialCentros` — rótulo «Asignado» y botón «Gastado»**

En `src/components/HistorialCentros.tsx`, añadir a los imports:

```ts
import { fmtCantidad, personasConRol, personasDeOF, personasDeOFs, repartirMateriales, repartoDe, type MaterialGastadoOF } from "@/lib/historial";
import { fmtDiaMesAno } from "@/lib/fechas";
```

Cambiar la firma y el `extraOF` de `HistorialCentros`:

```tsx
export function HistorialCentros({
  ofs,
  seccion,
  gastado,
  onReintentarGastado,
}: {
  ofs: HistorialOF[];
  seccion: SeccionId;
  /** undefined = cargando; null = RPS no contestó; objeto = cargado. */
  gastado?: Record<string, MaterialGastadoOF[]> | null;
  onReintentarGastado?: () => void;
}) {
  const conDesglose = centrosConDesglose(ofs, seccion);
  return (
    <section aria-label="Tiempos por centro de trabajo">
      <TareasPorCentro
        ofs={ofs}
        seccion={seccion}
        conColor
        extraCentro={(centro) => <PersonasCentro centro={centro} conDesglose={conDesglose} />}
        extraOF={(of, centro) => (
          <>
            {conDesglose.has(centro.id) && centro.ofs.length > 1 && !of.tareas?.length && <PersonasOF of={of} />}
            <Materiales
              of={of}
              gastadoOF={gastado === null ? null : gastado?.[of.codigo]}
              onReintentarGastado={onReintentarGastado}
            />
          </>
        )}
      />
    </section>
  );
}
```

Sustituir la función `Materiales` (la que hoy solo pinta `MaterialHistorico` y `NotasProduccion`) por:

```tsx
function Materiales({
  of,
  gastadoOF,
  onReintentarGastado,
}: {
  of: HistorialOF;
  /** undefined = todavía cargando; null = RPS no contestó; [] = cargado y sin líneas. */
  gastadoOF: MaterialGastadoOF[] | null | undefined;
  onReintentarGastado?: () => void;
}) {
  const { apartados, apuntados } = repartirMateriales(of.materiales);
  // El botón de Gastado sale SIEMPRE (ver MaterialGastadoBoton); el resto,
  // solo si dice algo.
  return (
    <div className="mt-2 flex flex-wrap gap-1.5">
      {apartados.length + apuntados.length > 0 && (
        <MaterialHistorico of={of.codigo} reservados={apartados} resto={apuntados} />
      )}
      <MaterialGastadoBoton of={of.codigo} lineas={gastadoOF} onReintentar={onReintentarGastado} />
      {of.notasProduccion && <NotasProduccion of={of.codigo} texto={of.notasProduccion} />}
    </div>
  );
}
```

En `MaterialHistorico`, cambiar el texto del botón de `Material` a `Asignado` (el `title` y la cabecera ya dicen «Asignado en la OF»; solo cambia lo que se lee en la fila):

```tsx
        <span aria-hidden>🧵</span>
        Asignado
```

Y a continuación de `MaterialHistorico`, añadir el componente nuevo:

```tsx
/** Lo que salió de verdad del almacén (RPS, `CPRImputationMaterialMO`). Sale
 *  SIEMPRE, también en una OF sin nada asignado: con el 57 % de las OF que
 *  gastan sin nada apuntado, escondiendo el botón se perdía justo lo que esto
 *  viene a enseñar (spec §1, "Cómo se ve"). */
function MaterialGastado({
  of,
  lineas,
  onReintentar,
}: {
  of: string;
  lineas: MaterialGastadoOF[] | null | undefined;
  onReintentar?: () => void;
}) {
  const { anclaje, alternar, cerrar } = useVentanaAnclada();
  const cargando = lineas === undefined;
  const error = lineas === null;
  const n = lineas?.length ?? 0;
  const ultimaSalida = (lineas ?? []).reduce<string | null>(
    (max, m) => (m.ultimaSalida && (!max || m.ultimaSalida > max) ? m.ultimaSalida : max),
    null,
  );
  return (
    <>
      <button
        type="button"
        onClick={(e) => alternar(e.currentTarget)}
        aria-expanded={anclaje !== null}
        aria-haspopup="dialog"
        title="Material que salió del almacén para esta OF, según RPS."
        className={`${BOTON_DETALLE} ${n > 0 ? "text-teal-700 dark:text-teal-300" : "text-text-muted"}`}
      >
        <span aria-hidden>📦</span>
        Gastado
        <span className="rounded-full bg-surface-2 px-1.5 text-[10px] font-bold text-text ring-1 ring-border">
          {n}
        </span>
      </button>
      {anclaje && (
        <VentanaAnclada anclaje={anclaje} onCerrar={cerrar} etiqueta={`Material gastado de la OF ${of}`}>
          <CabeceraVentana
            titulo="Salido del almacén"
            cuantos={cargando ? undefined : n}
            nota={ultimaSalida ? `Última salida ${fmtDiaMesAno(ultimaSalida)}` : undefined}
          />
          {error && (
            <p className="text-[11px] text-red-600 dark:text-red-400">
              No se pudo consultar el material gastado.{" "}
              <button type="button" onClick={onReintentar} className="underline">
                Reintentar
              </button>
            </p>
          )}
          {!error && cargando && <p className="text-[11px] text-text-muted">Consultando…</p>}
          {!error && !cargando && n === 0 && (
            <div className="text-[11px] text-text-muted">
              <p>Todavía no hay salidas apuntadas para esta OF.</p>
              <p className="mt-1">
                El almacén las apunta según sale el material. Las reparaciones y manipulaciones no suelen llevarlo.
              </p>
            </div>
          )}
          {!error && n > 0 && (
            <ul className={LISTA}>
              {lineas!.map((m, i) => (
                <li key={`${i}-${m.material}`} className={`${LINEA} text-text`}>
                  {m.material}
                  <span className="font-mono tabular-nums"> {fmtCantidad(m.gastado)}</span>
                  {m.gastado < 0 && (
                    <span className="block text-[10px] text-amber-700 dark:text-amber-300">
                      devuelto al almacén
                    </span>
                  )}
                  {m.codigo && <span className="block text-[10px] text-text-muted">{m.codigo}</span>}
                </li>
              ))}
            </ul>
          )}
        </VentanaAnclada>
      )}
    </>
  );
}

const MaterialGastadoBoton = MaterialGastado;
```

(El alias `MaterialGastadoBoton` es solo para que el nombre que usa `Materiales` —`<MaterialGastadoBoton …/>`— y el nombre del componente coincidan con el resto de la ficha, que llama a sus botones por lo que hacen; se puede quitar y llamar `MaterialGastado` directamente en los dos sitios si se prefiere no tener el alias.)

- [ ] **Step 13: Tipos y suite**

Run: `npx tsc --noEmit`
Expected: sin errores.

Run: `pnpm test`
Expected: todo en verde (los tests de `HistorialCentros`/`HistorialDrawer` que ya existen no deberían romperse: `gastado` y `onReintentarGastado` son opcionales).

- [ ] **Step 14: Commit**

```bash
git add src/components/HistorialCentros.tsx src/components/HistorialDrawer.tsx
git commit -m "$(cat <<'EOF'
feat(historial): botón de material gastado en la ficha de cada OF

Novedad: nuevo | Cada OF del Historial enseña también lo que salió de verdad del almacén, no solo lo que se apuntó al planificar. El botón de siempre pasa a llamarse «Asignado» para que se distinga del nuevo.
EOF
)"
```

---

## Task 2: Base compartida — esquema, tipos y la lista de OF retenidas

Prepara lo que necesitan las Tareas 4-7: la marca «cerrada en RPS» en `of_overlay` y la tabla `of_retenida` (sección 2 «Cómo» y sección 3 «Decisiones» de la spec). No añade ningún botón todavía.

**Files:**
- Modify: `src/lib/types.ts` (`OF.cerradaRps`)
- Modify: `src/lib/server/overlay.ts` (`CambioOF.cerradaRps`, `aplicarOverlay` lo copia)
- Modify: `src/lib/server/estado-db.ts` (columnas nuevas, tabla `of_retenida`, `Mutacion.ofRetenida`/`quitarRetenida`, `guardarMutacion`, `leerOfsRetenidas`)
- Modify: `src/app/api/estado/route.ts` (`cambioValido` acepta el campo nuevo)
- Test: `src/lib/__tests__/overlay.test.ts` (añadir casos)
- Test: `src/lib/__tests__/estado-db-retenida.test.ts` (nuevo)

**Interfaces:**
- Produces: `OF.cerradaRps?: { at: string; por: string; modo: "sombra" | "ensayo" | "activo" }` (`src/lib/types.ts`).
- Produces: `CambioOF.cerradaRps?: { at: string; por: string; modo: "sombra" | "ensayo" | "activo" } | null` (`src/lib/server/overlay.ts`) — `undefined` = no se toca (compatibilidad con `CambioOF` construidos antes de esta tarea); `null` = sin marca.
- Produces (`src/lib/server/estado-db.ts`): `type MotivoRetenida = "cerrada" | "recuperada" | "del_pedido"`, `interface OfRetenida { ofId: string; pedido: string; motivo: MotivoRetenida; por: string | null; at: string }`, `leerOfsRetenidas(seccion: SeccionId): OfRetenida[]`, `Mutacion.ofRetenida?: OfRetenida | OfRetenida[]`, `Mutacion.quitarRetenida?: string[]`.

- [ ] **Step 1: `OF.cerradaRps` en el tipo, sin lógica todavía**

En `src/lib/types.ts`, dentro de `export interface OF { … }`, detrás del campo `revisada?: boolean;` (con su comentario), añadir:

```ts
  /** Dada por terminada en RPS desde el tablero, antes de pasar el pedido
   *  entero. NO es un estado nuevo: la OF sigue en `aprobada`; es una marca al
   *  lado, como `revisada`. `undefined` = nunca se cerró así. Ver
   *  `acciones.ts` (`cerrar_en_rps`) y la sección 2 de
   *  docs/superpowers/specs/2026-09-15-material-gastado-y-cerrar-of-design.md.
   *
   *  `modo` es una copia de `ModoFichaje` (server/olanet-outbox.ts) escrita a
   *  mano: este fichero es client-safe y ese otro no, así que no se puede
   *  importar el tipo — solo repetir la unión de tres literales. */
  cerradaRps?: {
    at: string; // ISO
    por: string; // operarioId de quien cerró
    modo: "sombra" | "ensayo" | "activo";
  };
```

- [ ] **Step 2: Escribir el test de `aplicarOverlay` con la marca (falla)**

Añadir al final de `src/lib/__tests__/overlay.test.ts`:

```ts
it("aplicarOverlay copia cerradaRps a la OF, y su ausencia la deja sin marca", () => {
  const t = { operarios: [], pedidos: [pedido("P1", [of("A"), of("B")])] };
  const overlay: Overlay = {
    pedidosCompletados: new Set(),
    ofs: new Map([
      ["A", { ofId: "A", autorId: "ivan", revisorId: null, estado: "aprobada", observacion: null, cerradaRps: { at: "2026-09-15T10:00:00.000Z", por: "ivan", modo: "activo" } }],
      ["B", { ofId: "B", autorId: "ivan", revisorId: null, estado: "en_curso", observacion: null }],
    ]),
  };
  const [a, b] = aplicarOverlay(t, overlay).pedidos[0].ofs;
  expect(a.cerradaRps).toEqual({ at: "2026-09-15T10:00:00.000Z", por: "ivan", modo: "activo" });
  expect(b.cerradaRps).toBeUndefined();
});
```

Run: `pnpm vitest run src/lib/__tests__/overlay.test.ts`
Expected: FAIL — `Property 'cerradaRps' does not exist` (error de tipos; con Vitest+esbuild el test puede incluso "pasar" en tiempo de ejecución porque el campo simplemente no se copia y `toBeUndefined()`/el primero fallan igual). Comprobar con `npx tsc --noEmit` que además falla de tipos si el runtime no lo pilla.

- [ ] **Step 3: `CambioOF.cerradaRps` y que `aplicarOverlay` lo copie**

En `src/lib/server/overlay.ts`, dentro de `export interface CambioOF { … }`, detrás de `revisada?: boolean;`, añadir:

```ts
  /** Ver `OF.cerradaRps`. `undefined` = no se toca (compatibilidad con
   *  `CambioOF` construidos antes de esta marca, en tests y en cualquier
   *  llamador que aún no la conozca: `guardarMutacion` los trata como "sin
   *  marca"). `null` = se guarda SIN marca a propósito — lo manda
   *  "Volver a plantear" y "Recuperar un pedido". */
  cerradaRps?: { at: string; por: string; modo: "sombra" | "ensayo" | "activo" } | null;
```

En `aplicarOverlay`, dentro del `.map((of) => { … return { ...of, autorId: …, revisada: o.revisada ?? false }; })`, añadir la última línea del objeto devuelto:

```ts
        return {
          ...of,
          autorId: o.autorId,
          revisorId: o.revisorId,
          estado: o.estado,
          observacion: o.observacion ?? undefined,
          revisada: o.revisada ?? false,
          cerradaRps: o.cerradaRps ?? undefined,
        };
```

- [ ] **Step 4: Ejecutar el test y verlo pasar**

Run: `pnpm vitest run src/lib/__tests__/overlay.test.ts && npx tsc --noEmit`
Expected: PASS, sin errores de tipos.

- [ ] **Step 5: Escribir los tests de `estado-db.ts` (fallan)**

Crear `src/lib/__tests__/estado-db-retenida.test.ts`:

```ts
import { afterAll, beforeAll, expect, test } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

let dir: string;
let db: typeof import("../server/estado-db");

beforeAll(async () => {
  dir = mkdtempSync(path.join(tmpdir(), "coordina-retenida-"));
  process.env.COORDINA_DB_PATH = path.join(dir, "test.db");
  db = await import("../server/estado-db");
});
afterAll(() => {
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {
    // Windows mantiene abierto el handle del WAL; limpieza best effort.
  }
});

test("guardarMutacion escribe y borra la marca cerradaRps en of_overlay", () => {
  db.guardarMutacion({
    operarioId: "ivan",
    motivo: "cerrar_en_rps",
    cambiosOF: [{
      ofId: "0232086:9", autorId: "ivan", revisorId: null, estado: "aprobada", observacion: null,
      cerradaRps: { at: "2026-09-15T11:42:00.000Z", por: "ivan", modo: "activo" },
    }],
  });
  expect(db.leerOverlay("ot").ofs.get("0232086:9")?.cerradaRps).toEqual({ at: "2026-09-15T11:42:00.000Z", por: "ivan", modo: "activo" });

  db.guardarMutacion({
    operarioId: "tamara",
    motivo: "volver_a_plantear",
    cambiosOF: [{
      ofId: "0232086:9", autorId: "ivan", revisorId: null, estado: "en_curso", observacion: null,
      cerradaRps: null,
    }],
  });
  expect(db.leerOverlay("ot").ofs.get("0232086:9")?.cerradaRps).toBeUndefined();
});

test("un CambioOF sin cerradaRps (compatibilidad) no toca la marca existente", () => {
  db.guardarMutacion({
    operarioId: "ivan",
    motivo: "cerrar_en_rps",
    cambiosOF: [{
      ofId: "0232090:9", autorId: "ivan", revisorId: null, estado: "aprobada", observacion: null,
      cerradaRps: { at: "2026-09-15T12:00:00.000Z", por: "ivan", modo: "ensayo" },
    }],
  });
  // Antigua llamada, sin el campo: escribe NULL (sin marca). Es el
  // comportamiento correcto para cualquier acción normal, que siempre manda
  // el snapshot COMPLETO de la OF — si de verdad quería conservar la marca,
  // tenía que incluirla, igual que con autorId o estado.
  db.guardarMutacion({
    operarioId: "ivan",
    motivo: "asignar",
    cambiosOF: [{ ofId: "0232090:9", autorId: "jaime", revisorId: null, estado: "en_curso", observacion: null }],
  });
  expect(db.leerOverlay("ot").ofs.get("0232090:9")?.cerradaRps).toBeUndefined();
});

test("of_retenida: se marca, se lee por sección y se borra", () => {
  db.guardarMutacion({
    operarioId: "ivan",
    motivo: "cerrar_en_rps",
    seccion: "ot",
    cambiosOF: [{ ofId: "0232086:9", autorId: "ivan", revisorId: null, estado: "aprobada", observacion: null, cerradaRps: { at: "x", por: "ivan", modo: "activo" } }],
    ofRetenida: { ofId: "0232086:9", pedido: "AR.26.04351", motivo: "cerrada", por: "ivan", at: "2026-09-15T11:42:00.000Z" },
  });
  expect(db.leerOfsRetenidas("ot")).toEqual([
    { ofId: "0232086:9", pedido: "AR.26.04351", motivo: "cerrada", por: "ivan", at: "2026-09-15T11:42:00.000Z" },
  ]);
  expect(db.leerOfsRetenidas("diseno")).toEqual([]);

  db.guardarMutacion({
    operarioId: "tamara",
    motivo: "volver_a_plantear",
    cambiosOF: [{ ofId: "0232086:9", autorId: "ivan", revisorId: null, estado: "en_curso", observacion: null, cerradaRps: null }],
    quitarRetenida: ["0232086:9"],
  });
  expect(db.leerOfsRetenidas("ot")).toEqual([]);
});

test("of_retenida: varias filas de golpe, y pasar el pedido borra las de su sección", () => {
  db.guardarMutacion({
    operarioId: "tamara",
    motivo: "recuperar_pedido",
    seccion: "ot",
    ofRetenida: [
      { ofId: "0232200:2", pedido: "AR.26.05000", motivo: "recuperada", por: "tamara", at: "2026-09-15T09:00:00.000Z" },
      { ofId: "0232201:5", pedido: "AR.26.05000", motivo: "del_pedido", por: "tamara", at: "2026-09-15T09:00:00.000Z" },
    ],
  });
  expect(db.leerOfsRetenidas("ot").filter((r) => r.pedido === "AR.26.05000")).toHaveLength(2);

  db.guardarMutacion({
    operarioId: "tamara",
    motivo: "completar",
    completarPedidoId: "AR.26.05000",
    seccion: "ot",
    ofIdsPedido: ["0232200:2", "0232201:5"],
  });
  expect(db.leerOfsRetenidas("ot").filter((r) => r.pedido === "AR.26.05000")).toEqual([]);
});
```

Run: `pnpm vitest run src/lib/__tests__/estado-db-retenida.test.ts`
Expected: FAIL — `leerOfsRetenidas is not a function` / columnas inexistentes.

- [ ] **Step 6: Las tres columnas nuevas de `of_overlay`**

En `src/lib/server/estado-db.ts`, detrás de la función `prepararTraspasado` (la que añade `traspasado_at` a `fichaje_intervalo`), añadir:

```ts
/** Las tres columnas de la marca «cerrada en RPS» (ver `OF.cerradaRps`). Sin
 *  backfill que hacer —toda OF existente sigue sin marca, que es lo
 *  correcto— así que basta el guardado de columna, como `prepararTraspasado`;
 *  no hace falta la maquinaria de `MIGRACIONES` (esa es para cuando el
 *  segundo paso, el relleno, puede fallar a medias). */
function prepararCierreRps(db: Database.Database): void {
  const columnas = db.prepare("PRAGMA table_info(of_overlay)").all() as Array<{ name: string }>;
  if (columnas.some((c) => c.name === "cerrada_rps_at")) return;
  db.exec(`
    ALTER TABLE of_overlay ADD COLUMN cerrada_rps_at TEXT;
    ALTER TABLE of_overlay ADD COLUMN cerrada_rps_por TEXT;
    ALTER TABLE of_overlay ADD COLUMN cerrada_rps_modo TEXT;
  `);
}
```

En `abrir()`, detrás de la línea `prepararTraspasado(db);`, añadir `prepararCierreRps(db);`.

- [ ] **Step 7: La tabla `of_retenida`**

En el bloque `db.exec(\`…\`)` de dentro de `abrir()`, detrás de la tabla `aviso_visto` (justo antes del cierre de la plantilla), añadir:

```sql
    -- OF que la web sigue enseñando en el tablero aunque RPS ya no las
    -- traiga: TGM_PENDIENTE_OT solo trae tareas por debajo del 100 %, y en OT
    -- el 100 llega al cerrar la fase. Dos casos comparten tabla: una OF
    -- cerrada desde el tablero antes de pasar el pedido (motivo 'cerrada') y
    -- las OF de un pedido que se vuelve a plantear desde el Historial
    -- ('recuperada' la que se reabre, 'del_pedido' el resto, para que el
    -- pedido se vea entero). Sale de aquí al pasar el pedido o al volver a
    -- plantear la OF a mano.
    CREATE TABLE IF NOT EXISTS of_retenida (
      of_id   TEXT NOT NULL,
      pedido  TEXT NOT NULL,
      seccion TEXT NOT NULL,
      motivo  TEXT NOT NULL,
      por     TEXT,
      at      TEXT NOT NULL,
      PRIMARY KEY (of_id, seccion)
    );
    CREATE INDEX IF NOT EXISTS idx_of_retenida_pedido ON of_retenida(pedido, seccion);
```

- [ ] **Step 8: `Mutacion.ofRetenida`/`quitarRetenida`, `guardarMutacion` y `leerOfsRetenidas`**

Detrás de `export interface Mutacion { … }`, añadir el tipo y ampliar la interfaz:

```ts
export type MotivoRetenida = "cerrada" | "recuperada" | "del_pedido";

export interface OfRetenida {
  ofId: string;
  pedido: string;
  motivo: MotivoRetenida;
  por: string | null;
  at: string;
}
```

Dentro de `export interface Mutacion { … }`, detrás de `completarPedidoId?: string;`, añadir:

```ts
  /** Filas que ENTRAN en `of_retenida`, en la misma transacción. Una sola OF
   *  (cerrar una OF suelta) o varias de golpe (recuperar un pedido entero). */
  ofRetenida?: OfRetenida | OfRetenida[];
  /** Ids que SALEN de `of_retenida`, en la misma transacción. Lo usa
   *  "Volver a plantear": la OF deja de estar retenida y vuelve a depender
   *  solo de lo que traiga RPS/OLANET. */
  quitarRetenida?: string[];
```

Dentro de `guardarMutacion`, cambiar la sentencia `upsertOF` por:

```ts
  const upsertOF = db.prepare(`
    INSERT INTO of_overlay (of_id, autor_id, revisor_id, estado, observacion, updated_at, revisada,
                             cerrada_rps_at, cerrada_rps_por, cerrada_rps_modo)
    VALUES (@ofId, @autorId, @revisorId, @estado, @observacion, @ahora, @revisada,
            @cerradaRpsAt, @cerradaRpsPor, @cerradaRpsModo)
    ON CONFLICT(of_id) DO UPDATE SET
      autor_id = excluded.autor_id,
      revisor_id = excluded.revisor_id,
      estado = excluded.estado,
      observacion = excluded.observacion,
      updated_at = excluded.updated_at,
      revisada = MAX(of_overlay.revisada, excluded.revisada),
      cerrada_rps_at = excluded.cerrada_rps_at,
      cerrada_rps_por = excluded.cerrada_rps_por,
      cerrada_rps_modo = excluded.cerrada_rps_modo
  `);
  const upsertRetenida = db.prepare(`
    INSERT INTO of_retenida (of_id, pedido, seccion, motivo, por, at)
    VALUES (@ofId, @pedido, @seccion, @motivo, @por, @at)
    ON CONFLICT(of_id, seccion) DO UPDATE SET
      pedido = excluded.pedido, motivo = excluded.motivo, por = excluded.por, at = excluded.at
  `);
  const deleteRetenida = db.prepare("DELETE FROM of_retenida WHERE of_id = ?");
  const deleteRetenidaDelPedido = db.prepare("DELETE FROM of_retenida WHERE pedido = ? AND seccion = ?");
```

Cambiar la llamada `upsertOF.run({ … })` de dentro del `db.transaction(() => { … })` para incluir las tres columnas nuevas:

```ts
    for (const c of m.cambiosOF ?? [])
      upsertOF.run({
        ofId: c.ofId,
        autorId: c.autorId,
        revisorId: c.revisorId,
        estado: c.estado,
        observacion: c.observacion,
        ahora,
        revisada: c.estado === "en_revision" ? 1 : 0,
        // undefined ("no lo sé", CambioOF construidos antes de esta marca) se
        // trata igual que null: cada mutación manda el snapshot COMPLETO de
        // la OF, así que quien de verdad quiera conservar la marca tiene que
        // incluirla, igual que ya pasa con autorId o estado.
        cerradaRpsAt: c.cerradaRps?.at ?? null,
        cerradaRpsPor: c.cerradaRps?.por ?? null,
        cerradaRpsModo: c.cerradaRps?.modo ?? null,
      });
```

Y, dentro de la misma transacción, detrás del bloque `if (m.completarPedidoId) upsertPedido.run(…);`, añadir:

```ts
    for (const r of Array.isArray(m.ofRetenida) ? m.ofRetenida : m.ofRetenida ? [m.ofRetenida] : [])
      upsertRetenida.run({ ofId: r.ofId, pedido: r.pedido, seccion: m.seccion ?? seccionDeOperario(m.operarioId ?? ""), motivo: r.motivo, por: r.por, at: r.at });
    for (const ofId of m.quitarRetenida ?? []) deleteRetenida.run(ofId);
    // Al pasar el pedido, sea cual sea el motivo por el que estuviera
    // retenida alguna de sus OF: desde este momento el pedido depende otra
    // vez solo de RPS, que es lo que tiene que pasar.
    if (m.completarPedidoId)
      deleteRetenidaDelPedido.run(m.completarPedidoId, m.seccion ?? seccionDeOperario(m.operarioId ?? ""));
```

Y, detrás de `export function leerOverlay(…)` (o en cualquier punto del fichero tras `leerOverlay`), añadir:

```ts
/** OF que esta sección sigue enseñando en el tablero aunque RPS ya no las
 *  traiga (ver el comentario de la tabla `of_retenida`). Las suma
 *  `filasDeLaSeccion` (server/rps.ts) a lo que trae la vista u OLANET. */
export function leerOfsRetenidas(seccion: SeccionId): OfRetenida[] {
  const filas = abrir()
    .prepare("SELECT of_id AS ofId, pedido, motivo, por, at FROM of_retenida WHERE seccion = ?")
    .all(seccion) as Array<{ ofId: string; pedido: string; motivo: string; por: string | null; at: string }>;
  return filas.map((f) => ({ ...f, motivo: f.motivo as MotivoRetenida }));
}
```

- [ ] **Step 9: Ejecutar los tests y verlos pasar**

Run: `pnpm vitest run src/lib/__tests__/estado-db-retenida.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 10: `cambioValido` acepta el campo nuevo**

En `src/app/api/estado/route.ts`, dentro de `function cambioValido(c: unknown): c is CambioOF { … }`, añadir la comprobación antes del `return`:

```ts
  const cerradaRpsOk =
    x.cerradaRps === undefined ||
    x.cerradaRps === null ||
    (typeof x.cerradaRps === "object" &&
      x.cerradaRps !== null &&
      typeof (x.cerradaRps as Record<string, unknown>).at === "string" &&
      typeof (x.cerradaRps as Record<string, unknown>).por === "string" &&
      ["sombra", "ensayo", "activo"].includes((x.cerradaRps as Record<string, unknown>).modo as string));
  return (
    idOk &&
    nulable(x.autorId) &&
    nulable(x.revisorId) &&
    rolesDistintos &&
    typeof x.estado === "string" &&
    ESTADOS_OF.has(x.estado) &&
    nulable(x.observacion) &&
    cerradaRpsOk
  );
```

- [ ] **Step 11: Suite completa**

Run: `pnpm test`
Expected: todo en verde.

Run: `npx tsc --noEmit && pnpm lint`
Expected: sin errores.

- [ ] **Step 12: Commit**

```bash
git add src/lib/types.ts src/lib/server/overlay.ts src/lib/server/estado-db.ts src/app/api/estado/route.ts src/lib/__tests__/overlay.test.ts src/lib/__tests__/estado-db-retenida.test.ts
git commit -m "refactor(overlay): marca cerradaRps y tabla of_retenida, sin usarlas todavía"
```

(Sin línea `Novedad:`: nada de esto es observable aún — no hay botón ni cambio de comportamiento hasta la Tarea 6.)

---

## Task 3: Cerrar una fase — función compartida, candado de la cola y el 3 que no se repite

Sección 2 «Cómo» de la spec, y los tres puntos de «Confirmado con Iván»: la función que las dos rutas van a compartir, el candado de `drenarCola`, y que ni el worker ni la ruta manden un 3 sobre una fase que ya está en 3. Todavía sin ruta nueva: `POST /api/fases` (el arrastre de hoy) pasa a usar la función compartida, y con eso ya cambia su comportamiento en `sombra`/`ensayo` (punto 1 de «Confirmado con Iván»).

**Files:**
- Modify: `src/lib/server/olanet.ts` (`finalizarFase`, función compartida)
- Modify: `src/app/api/fases/route.ts` (usa `finalizarFase`; respeta `modoFichaje()`)
- Modify: `src/lib/server/olanet-worker.ts` (candado en `drenarCola`; `enviarUno` no repite un 3)
- Test: `src/lib/__tests__/api-fases.test.ts` (casos nuevos de modo)
- Test: `src/lib/__tests__/olanet-worker.test.ts` (candado y no-repetición)

**Interfaces:**
- Produces: `ResultadoFinalizarFase = { ok: true; yaEstaba: boolean; idBoletin: string } | { ok: false; status: 403 | 404 | 409; error: string }` y `finalizarFase(opts: { idBoletin: string; of?: string | null; fase?: string | null; esNuestra: (maquina: string) => boolean; operarioRps: string; cuando: Date }): Promise<ResultadoFinalizarFase>` (`src/lib/server/olanet.ts`).
- Consumes (Task 5): `finalizarFase` la llama también `POST /api/fases/cerrar-of`.

- [ ] **Step 1: Escribir los tests de `finalizarFase` compartida (fallan)**

Añadir a `src/lib/__tests__/api-fases.test.ts`, al final del fichero:

```ts
// ── modoFichaje() también manda aquí ──────────────────────────────────────
// Antes el arrastre no miraba el modo del fichaje: escribía el 3 siempre.
// Al compartir la función con la ruta nueva (Confirmado con Iván, punto 1),
// en sombra/ensayo tampoco escribe — en activo no cambia nada.

test("en modo sombra no se escribe, y se dice por qué", async () => {
  vi.stubEnv("FICHAJE_OLANET", "sombra");
  const res = await post({ idBoletin: "456", operarioId: "ivan" });
  expect(res.status).toBe(409);
  expect(moverFase).not.toHaveBeenCalled();
  expect(maquinaDeFase).not.toHaveBeenCalled();
  vi.unstubAllEnvs();
});

test("en modo ensayo tampoco se escribe", async () => {
  vi.stubEnv("FICHAJE_OLANET", "ensayo");
  const res = await post({ idBoletin: "456", operarioId: "ivan" });
  expect(res.status).toBe(409);
  expect(moverFase).not.toHaveBeenCalled();
  vi.unstubAllEnvs();
});

test("en modo activo (o sin variable) no cambia nada", async () => {
  maquinaDeFase.mockResolvedValue("A-OTEC");
  estadoDeFase.mockResolvedValue(2);
  vi.stubEnv("FICHAJE_OLANET", "activo");
  expect((await post({ idBoletin: "456", operarioId: "ivan" })).status).toBe(200);
  expect(moverFase).toHaveBeenCalledTimes(1);
  vi.unstubAllEnvs();
});
```

Run: `pnpm vitest run src/lib/__tests__/api-fases.test.ts`
Expected: los dos primeros FALLAN (hoy escribe también en sombra/ensayo, porque el arrastre no mira el modo); el tercero pasa ya.

- [ ] **Step 2: `finalizarFase` en `src/lib/server/olanet.ts`**

Añadir a los imports de cabecera:

```ts
import { ESTADO_FASE } from "../fases";
import { situacionDe } from "../fase-pendiente";
```

Al final del fichero (detrás de `maquinaDeFase`), añadir:

```ts
export type ResultadoFinalizarFase =
  | { ok: true; yaEstaba: boolean; idBoletin: string }
  | { ok: false; status: 403 | 404 | 409; error: string };

/** Cerrar UNA fase en RPS: releer máquina y estado (el boletín que trajo la
 *  ficha puede haberse quedado viejo), rebuscar por (OF, fase) si hace falta,
 *  comprobar que es nuestra y que se puede finalizar, y mover a 3 con la
 *  fecha de hoy. Compartida por `POST /api/fases` (arrastre de fases sueltas)
 *  y `POST /api/fases/cerrar-of` (spec 2026-09-15, sección 2 "Cómo": "Lo que
 *  se comparte con /api/fases").
 *
 *  NO mira `modoFichaje()`: en sombra/ensayo no se debe llegar a llamarla, y
 *  esa decisión la toma cada ruta ANTES de entrar aquí (ver el comentario en
 *  `POST /api/fases`) — mezclarlo aquí obligaría a las dos rutas a tratar el
 *  "no se escribe por el modo" como si fuera un fallo de OLANET, cuando para
 *  cerrar una OF suelta NO lo es (ahí se guarda la marca igual, con el modo). */
export async function finalizarFase(opts: {
  idBoletin: string;
  /** Para rebuscar el boletín si se quedó viejo (caso AR.25.02771, ver el
   *  comentario de `POST /api/fases`). Sin ellos, un boletín viejo es 404
   *  directo. */
  of?: string | null;
  fase?: string | null;
  /** ¿Esta fase se puede cerrar desde aquí? El arrastre acepta cualquiera de
   *  las dos secciones (`esFaseDeLaWeb`); cerrar una OF suelta, solo las de
   *  SU sección (`(m) => esFaseDe(m, seccion)`), para no cerrar de rebote una
   *  fase de la otra sección. */
  esNuestra: (maquina: string) => boolean;
  operarioRps: string;
  cuando: Date;
}): Promise<ResultadoFinalizarFase> {
  let boletin = opts.idBoletin;
  let maquina = await maquinaDeFase(boletin);

  if (maquina === null && opts.of && opts.fase) {
    const rebuscado = await buscarIdBoletin(opts.of, opts.fase);
    if (rebuscado) {
      boletin = rebuscado;
      maquina = await maquinaDeFase(boletin);
    }
  }
  if (maquina === null)
    return { ok: false, status: 404, error: "Esa fase ya no existe en OLANET" };
  if (!opts.esNuestra(maquina))
    return { ok: false, status: 403, error: `Esa fase es de ${maquina}, que no es trabajo de oficina` };

  const estado = await estadoDeFase(boletin);
  if (estado === ESTADO_FASE.finalizada) return { ok: true, yaEstaba: true, idBoletin: boletin };
  if (situacionDe(estado ?? -1) !== "sin_finalizar")
    return { ok: false, status: 409, error: "Esa fase no se puede finalizar desde aquí" };

  await moverFase({ idBoletin: boletin, estado: ESTADO_FASE.finalizada, operarioRps: opts.operarioRps, cuando: opts.cuando });
  return { ok: true, yaEstaba: false, idBoletin: boletin };
}
```

- [ ] **Step 3: `POST /api/fases` usa `finalizarFase` y respeta `modoFichaje()`**

En `src/app/api/fases/route.ts`, sustituir todo el cuerpo del `try { … }` de `POST` (desde `const { buscarIdBoletin, estadoDeFase, maquinaDeFase, moverFase } = …` hasta el `moverFase({ … })` + `return NextResponse.json({ ok: true, yaEstaba: false });`, es decir las líneas 91-159 de hoy) por:

```ts
  try {
    const { modoFichaje } = await import("@/lib/server/olanet-outbox");
    // Antes esto escribía siempre, sin mirar el modo del fichaje — no había
    // hecho falta porque nadie más escribía un movimiento de fase desde la
    // web. Al compartir `finalizarFase` con la ruta nueva de cerrar una OF
    // suelta, que sí necesita el gate, el arrastre lo hereda: en `activo` no
    // cambia nada (Confirmado con Iván, punto 1).
    if (modoFichaje() !== "activo")
      return NextResponse.json(
        { error: "El fichaje está en modo de pruebas: no se escribe en RPS." },
        { status: 409 },
      );

    const { finalizarFase } = await import("@/lib/server/olanet");
    const { esFaseDeLaWeb } = await import("@/lib/secciones");
    const r = await finalizarFase({
      idBoletin,
      of,
      fase,
      esNuestra: esFaseDeLaWeb,
      operarioRps,
      cuando: new Date(),
    });
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
    return NextResponse.json({ ok: true, yaEstaba: r.yaEstaba });
  } catch (e) {
    console.warn("[coordina] no se pudo finalizar la fase:", (e as Error).message);
    return NextResponse.json({ error: "No se pudo escribir en OLANET" }, { status: 503 });
  }
}
```

El resto de la función `POST` (identidad, código de RPS, `of`/`fase` opcionales) no cambia. Los imports sueltos `buscarIdBoletin, estadoDeFase, maquinaDeFase, moverFase` que quedaban al principio del fichero (`import { ESTADO_OF, situacionDe } from "@/lib/fase-pendiente";`) tampoco cambian: siguen sin usarse en `POST` (los usaba el bloque que se acaba de sustituir) pero `GET` no los necesitaba y `situacionDe`/`ESTADO_OF` ya no se referencian en este fichero — se pueden quitar del import si `tsc`/`lint` avisan de que sobran.

- [ ] **Step 4: Ejecutar los tests y verlos pasar**

Run: `pnpm vitest run src/lib/__tests__/api-fases.test.ts`
Expected: PASS (todos, incluidos los seis de siempre que comprueba que no se escribe — ver «Qué se prueba» de la spec).

- [ ] **Step 5: Tipos**

Run: `npx tsc --noEmit`
Expected: sin errores (o, si `situacionDe`/`ESTADO_OF` quedaron sin usar en `api/fases/route.ts`, quitar ese import).

- [ ] **Step 6: Commit**

```bash
git add src/lib/server/olanet.ts src/app/api/fases/route.ts src/lib/__tests__/api-fases.test.ts
git commit -m "$(cat <<'EOF'
refactor(fases): función compartida para cerrar una fase, y el arrastre respeta el modo del fichaje

Novedad: arreglado | El botón de cerrar una operación atascada de RPS podía llegar a escribir en RPS incluso con el fichaje en modo de pruebas. Ahora respeta el mismo interruptor que el resto del fichaje.
EOF
)"
```

- [ ] **Step 7: Escribir los tests del candado y de "no repetir un 3" (fallan)**

Añadir a `src/lib/__tests__/olanet-worker.test.ts`, al final del fichero (fuera de los `describe` existentes, o dentro de uno nuevo):

```ts
describe("candado de drenarCola", () => {
  it("dos llamadas a la vez no envían el mismo evento dos veces", async () => {
    process.env.FICHAJE_OLANET = "activo";
    estadoDb.getDb().prepare("DELETE FROM olanet_pendiente").run();
    outbox.encolarFichaje("ivan", [iv("2026-09-15T08:00:00Z", "2026-09-15T08:05:00Z", ["0230344:2"], "ivan")]);

    // moverFase se resuelve tarde a propósito, para que las dos llamadas a
    // drenarCola() se solapen de verdad y no una detrás de otra por suerte.
    let liberar: () => void = () => {};
    const bloqueado = new Promise<void>((ok) => { liberar = ok; });
    moverFase.mockImplementation(async () => { await bloqueado; });

    const p1 = worker.drenarCola();
    const p2 = worker.drenarCola(); // llega con la primera pasada en curso
    // Dar tiempo a que las dos hayan LEÍDO la cola antes de liberar moverFase.
    await new Promise((r) => setTimeout(r, 10));
    liberar();
    const [n1, n2] = await Promise.all([p1, p2]);

    expect(n1 + n2).toBe(1); // el evento se envió UNA vez, sin importar quién se lo apunte
    expect(moverFase).toHaveBeenCalledTimes(1);
    delete process.env.FICHAJE_OLANET;
  });
});

describe("no se repite un 3 ya escrito", () => {
  it("si la fase ya está finalizada, el evento se da por enviado sin llamar a moverFase", async () => {
    process.env.FICHAJE_OLANET = "activo";
    estadoDb.getDb().prepare("DELETE FROM olanet_pendiente").run();
    outbox.encolarFinalizacion(["0230999:9"], "ivan");
    estadoDeFase.mockResolvedValue(3); // ya finalizada en OLANET

    expect(await worker.drenarCola()).toBe(1);
    expect(moverFase).not.toHaveBeenCalled();
    delete process.env.FICHAJE_OLANET;
  });

  it("si sigue abierta, escribe el 3 normalmente", async () => {
    process.env.FICHAJE_OLANET = "activo";
    estadoDb.getDb().prepare("DELETE FROM olanet_pendiente").run();
    outbox.encolarFinalizacion(["0230998:9"], "ivan");
    estadoDeFase.mockResolvedValue(2); // interrumpida: sigue por cerrar

    expect(await worker.drenarCola()).toBe(1);
    expect(moverFase).toHaveBeenCalledTimes(1);
    delete process.env.FICHAJE_OLANET;
  });
});
```

Añadir `estadoDeFase` al mock de `"../server/olanet"` que ya existe al principio del fichero (junto a `insertarBono`, `moverFase`, `buscarIdBoletin`, `sincronizarFichajeEnCurso`, `bonosTraspasados`):

```ts
const estadoDeFase = vi.fn<(...a: unknown[]) => Promise<number | null>>();
```

y en el `vi.mock("../server/olanet", () => ({ … }))`, añadir la línea `estadoDeFase: (...a: unknown[]) => estadoDeFase(...a),`. En el `beforeEach`, añadir `estadoDeFase.mockReset().mockResolvedValue(0);` junto a los demás `mockReset()`.

Run: `pnpm vitest run src/lib/__tests__/olanet-worker.test.ts`
Expected: FALLAN los tres — `drenarCola` no tiene candado, y `enviarUno` no llama a `estadoDeFase` antes de un movimiento de finalización.

- [ ] **Step 8: El candado en `drenarCola`**

En `src/lib/server/olanet-worker.ts`, renombrar el cuerpo actual de `drenarCola` a una función interna y envolverla con el candado:

```ts
async function drenarColaUnaVez(): Promise<number> {
  if (modoFichaje() === "sombra") return 0;

  const pendientes = leerPendientes(LOTE);
  const enviados: number[] = [];
  for (const p of pendientes) {
    try {
      if (await enviarUno(p)) enviados.push(p.id);
    } catch (e) {
      const mensaje = e instanceof Error ? e.message : String(e);
      marcarError(p.id, mensaje);
      if (p.intentos + 1 >= MAX_INTENTOS) {
        descartar(p.id, `${MAX_INTENTOS} intentos fallidos — ${mensaje}`);
        continue; // se descarta y se sigue: ya no bloquea
      }
      console.error(`[olanet] evento ${p.id} falló, se reintenta:`, mensaje);
      break; // el orden importa: no se adelantan los de detrás
    }
  }
  marcarEnviados(enviados);
  return enviados.length;
}

/** Una pasada en curso a la vez. `drenarCola` no tenía candado propio:
 *  `corriendo` (más abajo) protege solo la `vuelta()` periódica, no la
 *  función en sí. Si `POST /api/fases/cerrar-of` la llama mientras el
 *  temporizador de 60 s está a mitad de otra pasada, sin candado un mismo
 *  evento podía salir dos veces.
 *
 *  Quien llega con otra pasada en curso ESPERA a que termine y hace SU
 *  PROPIA pasada — no se conforma con el resultado ajeno ni la salta: cerrar
 *  una OF necesita la garantía de que SUS eventos, encolados después de que
 *  la pasada en curso empezara a leer la cola, también salieron. */
let colaEnCurso: Promise<number> | null = null;

export async function drenarCola(): Promise<number> {
  if (colaEnCurso) {
    await colaEnCurso.catch(() => {}); // nunca lanza (ver el try/catch de arriba), pero por si acaso
    return drenarCola();
  }
  const p = drenarColaUnaVez();
  colaEnCurso = p;
  try {
    return await p;
  } finally {
    colaEnCurso = null;
  }
}
```

(Esto sustituye la función `drenarCola` de hoy, líneas 98-119; el resto del fichero no cambia todavía.)

- [ ] **Step 9: `enviarUno` no repite un 3 ya escrito**

En `enviarUno`, dentro del bloque que maneja movimientos de fase (después de `if (ensayo) { … }` y de resolver `operarioRps`), justo antes de `const idBoletin = await buscarIdBoletin(…)`, no cambia nada; el cambio va DESPUÉS de resolver `idBoletin` y ANTES de `await moverFase({ … })`:

```ts
  const idBoletin = await buscarIdBoletin(p.datos.of, p.datos.numope);
  if (idBoletin === null) {
    descartar(p.id, `OLANET no tiene la fase ${p.datos.of}/${p.datos.numope}`);
    return false;
  }
  // Si es un movimiento de FINALIZACIÓN y la fase YA está en 3, se da por
  // enviado sin escribir: evita un segundo apunte en sch_FasesMov al volver a
  // pasar un pedido recuperado (Tarea 8), y de paso arregla lo que ya pasaba
  // con los pedidos que RPS reabre solo con una OF nueva (Confirmado con
  // Iván, punto 2). Cuesta una consulta por evento de fase.
  if (p.datos.estado === ESTADO_FASE.finalizada) {
    const estadoActual = await estadoDeFase(idBoletin);
    if (estadoActual === ESTADO_FASE.finalizada) return true;
  }
  await moverFase({
    idBoletin,
    estado: p.datos.estado,
    operarioRps,
    cuando: new Date(p.datos.cuando),
  });
  return true;
```

Añadir `ESTADO_FASE` y `estadoDeFase` a los imports de cabecera del fichero: `ESTADO_FASE` viene de `"../fases"` (junto a `eventosFaseDe`, `eventosFinalizacion`) y `estadoDeFase` se añade a la lista que ya se importa de `"./olanet"` (junto a `bonosTraspasados, buscarIdBoletin, insertarBono, moverFase, sincronizarFichajeEnCurso`).

- [ ] **Step 10: Ejecutar los tests y verlos pasar**

Run: `pnpm vitest run src/lib/__tests__/olanet-worker.test.ts`
Expected: PASS.

- [ ] **Step 11: Suite y tipos**

Run: `pnpm test && npx tsc --noEmit && pnpm lint`
Expected: todo en verde.

- [ ] **Step 12: Commit**

```bash
git add src/lib/server/olanet-worker.ts src/lib/__tests__/olanet-worker.test.ts
git commit -m "$(cat <<'EOF'
fix(fichaje): la cola no envía un mismo movimiento dos veces, y no repite un cierre ya escrito

Novedad: arreglado | Dos acciones que drenaran la cola de OLANET a la vez podían llegar a enviar el mismo tramo de tiempo dos veces. Y si una fase ya estaba cerrada en RPS, la cola podía volver a escribirla sin necesidad.
EOF
)"
```

---

## Task 4: El tablero suma las OF retenidas

`filasDeLaSeccion` (rps.ts) pasa a sumar, a lo que traiga la vista o OLANET, las OF que `of_retenida` dice que la sección sigue enseñando. Sección 2 «Cómo» de la spec ("La lista de OF retenidas").

**Files:**
- Modify: `src/lib/server/rps.ts` (`unirRetenidas`, `paresRetenidosDe`, `filasDeLaSeccion`, `consultarTablero`, `invalidarCacheTablero`)
- Test: `src/lib/__tests__/fuentes-tablero.test.ts` (añadir casos)

**Interfaces:**
- Produces: `unirRetenidas(pares: readonly {of,fase}[], retenidas: readonly {of,fase}[]): {of,fase}[]` (`src/lib/server/rps.ts`).
- Produces: `paresRetenidosDe(retenidas: readonly { ofId: string }[]): { of: string; fase: string }[]` (`src/lib/server/rps.ts`).
- Produces: `invalidarCacheTablero(seccionId: SeccionId): void` (`src/lib/server/rps.ts`) — la usa la Tarea 8 (recuperar un pedido).
- Consumes: `leerOfsRetenidas` (Tarea 2, `server/estado-db.ts`), `partirOfId` (`src/lib/bonos.ts`, ya existe).

- [ ] **Step 1: Escribir los tests de las dos funciones puras (fallan)**

Añadir a `src/lib/__tests__/fuentes-tablero.test.ts`:

```ts
import { paresRetenidosDe, unirRetenidas } from "../server/rps";

describe("unirRetenidas", () => {
  it("suma lo retenido a lo pendiente, sin duplicar por claveFase", () => {
    const pendiente = [{ of: "0230700", fase: "3" }];
    const retenida = [{ of: "0230700", fase: "3" }, { of: "0232086", fase: "09" }];
    expect(unirRetenidas(pendiente, retenida)).toEqual([
      { of: "0230700", fase: "3" },
      { of: "0232086", fase: "09" },
    ]);
  });

  it("distingue \"9\" de \"09\" igual que claveFase (no los junta ni los separa)", () => {
    expect(unirRetenidas([{ of: "0232086", fase: "9" }], [{ of: "0232086", fase: "09" }]))
      .toEqual([{ of: "0232086", fase: "9" }]); // misma clave: gana la que ya estaba pendiente
  });

  it("sin retenidas, devuelve los pares tal cual", () => {
    const pendiente = [{ of: "0230700", fase: "3" }];
    expect(unirRetenidas(pendiente, [])).toEqual(pendiente);
  });
});

describe("paresRetenidosDe", () => {
  it("parte el id de OF ('orden:tarea') en (of, fase)", () => {
    expect(paresRetenidosDe([{ ofId: "0232086:9" }, { ofId: "0232090:02" }]))
      .toEqual([{ of: "0232086", fase: "9" }, { of: "0232090", fase: "02" }]);
  });

  it("una fila corrupta (sin ':') se descarta, no revienta el resto", () => {
    expect(paresRetenidosDe([{ ofId: "sinformato" }, { ofId: "0232086:9" }]))
      .toEqual([{ of: "0232086", fase: "9" }]);
  });
});
```

Run: `pnpm vitest run src/lib/__tests__/fuentes-tablero.test.ts`
Expected: FALLAN los dos `describe` nuevos — no existen todavía.

- [ ] **Step 2: `unirRetenidas` y `paresRetenidosDe` en `rps.ts`**

Añadir `import { partirOfId } from "../bonos";` a los imports de cabecera de `src/lib/server/rps.ts` (junto al resto de imports de `../…`).

Detrás de `filasQueFaltan` (justo antes del comentario `/** Escala nueva: … */` que empieza `prioridadDe`), añadir:

```ts
/** Une los pares "pendientes según la fuente" con los que la web retiene
 *  (`of_retenida`), sin duplicar por `claveFase`: si alguien recupera una OF
 *  justo cuando OLANET ya ha vuelto a traerla sola, no debe salir dos veces.
 *  Gana el par de `pares` cuando las dos claves coinciden: es el dato más
 *  fresco, y `paresDe`/`fasesPendientesDe` van siempre primero en la llamada. */
export function unirRetenidas(
  pares: readonly { of: string; fase: string }[],
  retenidas: readonly { of: string; fase: string }[],
): { of: string; fase: string }[] {
  const vistas = new Set<string>();
  const salida: { of: string; fase: string }[] = [];
  for (const p of [...pares, ...retenidas]) {
    const clave = claveFase(p.of, p.fase);
    if (vistas.has(clave)) continue;
    vistas.add(clave);
    salida.push(p);
  }
  return salida;
}

/** Las OF retenidas de una sección, como pares (of, fase) listos para
 *  `filasPorFase`. El id de OF es "orden:tarea" (ver `aOF` más abajo): se
 *  parte con `partirOfId`, la misma función que ya usa el fichaje para lo
 *  mismo. Una fila sin ':' es imposible salvo corrupción y se descarta: no
 *  debe tumbar el tablero entero por una fila mala. */
export function paresRetenidosDe(
  retenidas: readonly { ofId: string }[],
): { of: string; fase: string }[] {
  return retenidas
    .map((r) => partirOfId(r.ofId))
    .filter((x): x is { of: string; numope: string } => x !== null)
    .map(({ of, numope }) => ({ of, fase: numope }));
}
```

- [ ] **Step 3: Ejecutar los tests y verlos pasar**

Run: `pnpm vitest run src/lib/__tests__/fuentes-tablero.test.ts`
Expected: PASS.

- [ ] **Step 4: `filasDeLaSeccion` y `consultarTablero` las usan**

En `src/lib/server/rps.ts`, sustituir la función `filasDeLaSeccion` de hoy (líneas 773-790) por:

```ts
async function filasDeLaSeccion(
  pool: import("mssql").ConnectionPool,
  seccion: Seccion,
  /** OF que la sección retiene aunque la fuente ya no las traiga (ver
   *  `of_retenida`). Sección 2 de la spec del 15/09/2026, "Cómo". */
  retenidas: readonly { of: string; fase: string }[] = [],
): Promise<FilaVista[]> {
  if (seccion.fuente === "vista") {
    const claves = await clavesDeLaVista(pool, seccion);
    return filasPorFase(pool, seccion, unirRetenidas(paresDe(claves), retenidas));
  }

  // OLANET manda, y la vista solo completa lo recién lanzado que OLANET aún no
  // tenga. Las dos consultas van en paralelo: son servidores distintos.
  const { fasesPendientesDe } = await import("./olanet");
  const [fases, claves] = await Promise.all([
    fasesPendientesDe(seccion),
    clavesDeLaVista(pool, seccion),
  ]);
  return filasPorFase(pool, seccion, unirRetenidas([...fases, ...paresDe(filasQueFaltan(claves, fases))], retenidas));
}
```

En `consultarTablero`, sustituir la línea `const vista = { recordset: await filasDeLaSeccion(pool, seccion) };` por:

```ts
  // OF que esta sección sigue enseñando aunque RPS ya no las traiga: una
  // cerrada desde el tablero antes de pasar el pedido, o las de un pedido
  // recuperado del Historial (Tareas 6 y 8).
  const { leerOfsRetenidas } = await import("./estado-db");
  const retenidas = paresRetenidosDe(leerOfsRetenidas(seccion.id));
  const vista = { recordset: await filasDeLaSeccion(pool, seccion, retenidas) };
```

- [ ] **Step 5: `invalidarCacheTablero`, para cuando se recupere un pedido**

Detrás de `getTableroRPS` (después de su `return refrescarTablero(seccion);`), añadir:

```ts
/** Invalida la caché de esta sección y lanza el refresco en segundo plano,
 *  SIN esperarlo: la consulta tarda de 7 a 15 s y no puede colgar la
 *  respuesta de quien acaba de recuperar un pedido del Historial (Tarea 8).
 *  Si el refresco falla, se sigue sirviendo lo último bueno hasta el
 *  siguiente TTL, igual que cualquier otro fallo de `refrescarTablero`. */
export function invalidarCacheTablero(seccionId: SeccionId): void {
  cache.delete(seccionId);
  void refrescarTablero(SECCIONES[seccionId]).catch(() => {});
}
```

- [ ] **Step 6: Suite y tipos**

Run: `pnpm test && npx tsc --noEmit && pnpm lint`
Expected: todo en verde. (No hay test de integración contra RPS real para este paso: `consultarTablero` no tiene mocking de mssql establecido en el repo — la verificación contra RPS de verdad queda para el ensayo manual de la Tarea 9, igual que el resto de `rps.ts`.)

- [ ] **Step 7: Commit**

```bash
git add src/lib/server/rps.ts src/lib/__tests__/fuentes-tablero.test.ts
git commit -m "refactor(rps): el tablero puede sumar OF retenidas a lo que trae RPS/OLANET, sin usarlo todavía"
```

(Sin línea `Novedad:`: `leerOfsRetenidas` siempre devuelve `[]` hasta la Tarea 6, así que hoy no cambia nada observable.)

---

## Task 5: «Dar por terminada en RPS» — servidor

La acción en `ACCIONES` y la ruta `POST /api/fases/cerrar-of`. Sección 2 de la spec entera (salvo la interfaz, que es la Tarea 6).

**Files:**
- Modify: `src/lib/acciones.ts` (`AccionDef.noSi`, `cerrar_en_rps`, `volver_a_plantear`, `reabrir`/`recuperar_aprobada` ganan `noSi`)
- Create: `src/app/api/fases/cerrar-of/route.ts`
- Test: `src/lib/__tests__/acciones.test.ts` (casos nuevos)
- Test: `src/lib/__tests__/api-fases-cerrar-of.test.ts` (nuevo)

**Interfaces:**
- Produces: `AccionOF` gana `"cerrar_en_rps" | "volver_a_plantear"`; `AccionDef.noSi?: (of: OF) => boolean`.
- Consumes: `finalizarFase` (Tarea 3), `finalizables` (`src/lib/fase-pendiente.ts`, ya existe), `cortarFichajeDeOF` (`src/lib/server/fichaje-db.ts`, ya existe), `drenarCola`/`modoFichaje`/`leerPendientes` (Tareas 3 y ya existentes), `guardarMutacion`/`Mutacion.ofRetenida` (Tarea 2), `ofsQueCuentan`/`pedidoListoParaPasar` (`src/lib/fases-tablero.ts`, ya existen).
- Produces: `POST /api/fases/cerrar-of` con `{ ofId, seccion? }` → `{ ok: true, modo, operaciones: Array<{ of; fase; ok; yaEstaba; error? }> }` o `{ error }` con el status que corresponda (400/403/404/409/503).

- [ ] **Step 1: Escribir los tests de `acciones.ts` (fallan)**

Añadir a `src/lib/__tests__/acciones.test.ts`, al final del fichero (reutilizando el helper `of` que ya define el fichero):

```ts
describe("cerrar_en_rps / volver_a_plantear", () => {
  it("el autor la ve desde pendiente, en_curso, devuelta y aprobada; no detenida ni ya marcada", () => {
    for (const estado of ["pendiente", "en_curso", "devuelta", "aprobada"] as const) {
      expect(accionesDisponibles(of(estado), "op1").map((a) => a.id)).toContain("cerrar_en_rps");
    }
    expect(accionesDisponibles(of("en_curso", { detenida: true }), "op1").map((a) => a.id))
      .not.toContain("cerrar_en_rps");
    expect(accionesDisponibles(of("aprobada", { cerradaRps: { at: "x", por: "op1", modo: "activo" } }), "op1").map((a) => a.id))
      .not.toContain("cerrar_en_rps");
  });

  it("no se ofrece en por_revisar ni en_revision, ni a quien no es el autor", () => {
    expect(accionesDisponibles(of("por_revisar"), "op1").map((a) => a.id)).not.toContain("cerrar_en_rps");
    expect(accionesDisponibles(of("en_revision"), "op1").map((a) => a.id)).not.toContain("cerrar_en_rps");
    expect(accionesDisponibles(of("en_curso"), "op2").map((a) => a.id)).not.toContain("cerrar_en_rps");
  });

  it("volver_a_plantear SOLO sale con la marca puesta, y reabrir/recuperar_aprobada desaparecen con ella", () => {
    const sinMarca = of("aprobada");
    const conMarca = of("aprobada", { cerradaRps: { at: "x", por: "op1", modo: "activo" } });
    expect(accionesDisponibles(sinMarca, "op2").map((a) => a.id)).not.toContain("volver_a_plantear");
    expect(accionesDisponibles(conMarca, "op2").map((a) => a.id)).toEqual(["volver_a_plantear"]);
    expect(accionesDisponibles(conMarca, "op1").map((a) => a.id)).toEqual(["volver_a_plantear"]);
  });

  it("volver_a_plantear la ofrece CUALQUIER técnico, como restaurar una anulada", () => {
    const conMarca = of("aprobada", { cerradaRps: { at: "x", por: "op1", modo: "activo" } });
    expect(accionesDisponibles(conMarca, "cualquiera").map((a) => a.id)).toEqual(["volver_a_plantear"]);
  });
});
```

Run: `pnpm vitest run src/lib/__tests__/acciones.test.ts`
Expected: FALLAN los cuatro — `cerrar_en_rps`/`volver_a_plantear` no existen y `cerradaRps` no es un campo válido de `Partial<OF>`.

- [ ] **Step 2: `AccionDef.noSi` y las dos acciones nuevas**

En `src/lib/acciones.ts`, ampliar `AccionOF`:

```ts
export type AccionOF =
  | "empezar_planteo" | "terminar_planteo" | "recuperar_planteo"
  | "empezar_revision" | "aprobar" | "aprobar_corregida" | "aprobar_sin_revision"
  | "devolver" | "reabrir" | "recuperar_aprobada"
  | "soltar_revision"
  | "retomar" | "anular" | "restaurar"
  | "cerrar_en_rps" | "volver_a_plantear";
```

Dentro de `AccionDef`, detrás de `noEl?: "autor" | "revisor";` (con su comentario), añadir:

```ts
  /** Además de lo anterior, la acción se descarta si esto es verdad para la
   *  OF. Una función libre y no una lista de estados o roles: hoy solo la
   *  usan dos acciones y por motivos opuestos — `cerrar_en_rps` se apaga si
   *  la OF está detenida o ya lleva la marca, `volver_a_plantear` solo se
   *  enciende CON ella puesta. Generalizar un campo de estado para un único
   *  par de acciones sería peor que una función. */
  noSi?: (of: OF) => boolean;
```

En `accionesDisponibles`, añadir la comprobación:

```ts
export function accionesDisponibles(of: OF, miId?: string | null): AccionDef[] {
  return ACCIONES.filter(
    (a) =>
      a.desde.includes(of.estado) &&
      cumpleRequisito(a, of) &&
      cumpleRevisada(a, of) &&
      esMia(a, of, miId) &&
      !(a.noSi?.(of) ?? false),
  );
}
```

En el array `ACCIONES`, cambiar las entradas `reabrir` y `recuperar_aprobada` para que se apaguen con la marca puesta:

```ts
  { id: "reabrir", label: "Reabrir revisión", tono: "neutra",
    confirmar: "La OF volverá a revisión y dejará de estar lista para Producción.",
    desde: ["aprobada"], noEl: "autor",
    noSi: (of) => of.cerradaRps !== undefined,
    destino: "en_revision" },
  { id: "recuperar_aprobada", label: "Recuperar para corregir", tono: "neutra",
    confirmar: "La OF vuelve a tu planteo y deja de estar lista para Producción. Cuando la mandes otra vez, entra en «Por revisar».",
    desde: ["aprobada"], requiere: "autor", soloEl: "autor",
    noSi: (of) => of.cerradaRps !== undefined,
    destino: "en_curso" },
```

Y, detrás de `recuperar_aprobada` (antes de la entrada `anular`), añadir las dos acciones nuevas:

```ts
  // «Dar por terminada en RPS»: sección 2 de la spec del 15/09/2026. Escribe
  // en el sistema de la fábrica, así que es SOLO del autor. No hay estado
  // nuevo: la OF queda `aprobada` con la marca `cerradaRps` al lado (ver
  // types.ts), como ya es `revisada`. `noSi` cubre lo que `desde` no puede:
  // detenida, o ya marcada. La TERCERA exclusión —que sea la última OF que
  // queda del pedido— no se puede mirar aquí, porque esta función no conoce
  // el pedido entero: la comprueba el Drawer (Tarea 6) y, otra vez, la ruta.
  //
  // A diferencia de las demás acciones de este archivo, el Board NO la
  // ejecuta con `aplicarAccion` + `/api/estado`: llama a `POST
  // /api/fases/cerrar-of`, que hace todo en el servidor (Tarea 6). Sigue
  // viviendo aquí para que `accionesDisponibles` decida si se ofrece el botón
  // y con qué texto — `destino`/`efectoFichaje` no se usan en la ejecución,
  // pero se dejan puestos porque describen lo que la acción HACE, que es lo
  // que este fichero documenta.
  { id: "cerrar_en_rps", label: "Dar por terminada en RPS", tono: "neutra",
    desde: ["pendiente", "en_curso", "devuelta", "aprobada"], requiere: "autor", soloEl: "autor",
    noSi: (of) => of.detenida === true || of.cerradaRps !== undefined,
    efectoFichaje: "corta", destino: "aprobada" },
  // Deshacer la marca. De CUALQUIER técnico, como "Restaurar" en las
  // anuladas: solo escribe en CoordinaOT, no hace nada irreversible y no deja
  // el pedido esperando a que vuelva su autor. En OLANET no se escribe nada:
  // el primer fichaje reabre sola la operación (`buscarIdBoletin` no mira el
  // estado de la fase, y `moverFase` hace el UPDATE sin condición).
  { id: "volver_a_plantear", label: "Volver a plantear", tono: "neutra",
    confirmar: "La OF vuelve a planteando. En RPS sigue terminada hasta que alguien fiche en ella: el primer fichaje la reabre. El apunte del cierre se queda en el histórico de RPS.",
    desde: ["aprobada"],
    noSi: (of) => of.cerradaRps === undefined,
    destino: "en_curso" },
```

- [ ] **Step 3: Ejecutar los tests y verlos pasar**

Run: `pnpm vitest run src/lib/__tests__/acciones.test.ts`
Expected: PASS.

- [ ] **Step 4: Tipos**

Run: `npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 5: Commit**

```bash
git add src/lib/acciones.ts src/lib/__tests__/acciones.test.ts
git commit -m "refactor(acciones): cerrar_en_rps y volver_a_plantear en la máquina de estados, sin ruta ni botón todavía"
```

- [ ] **Step 6: Escribir los tests de la ruta nueva (fallan)**

Crear `src/lib/__tests__/api-fases-cerrar-of.test.ts`:

```ts
import { afterAll, afterEach, beforeAll, beforeEach, expect, test, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

// OLANET se simula por completo: se comprueba el ORDEN (corte → drenado → 3)
// y que no se escribe cuando no debe, nunca la conexión real.
const fasesDeOFs = vi.fn();
const finalizarFase = vi.fn();
vi.mock("@/lib/server/olanet", () => ({
  fasesDeOFs: (ofs: string[]) => fasesDeOFs(ofs),
  finalizarFase: (o: unknown) => finalizarFase(o),
}));
vi.mock("@/lib/server/operarios", () => ({
  COD_RPS_POR_OPERARIO: { ivan: "195", tamara: "180" },
  seccionDeOperario: () => "ot",
}));

let dir: string;
let ruta: typeof import("../../app/api/fases/cerrar-of/route");
let estadoDb: typeof import("../server/estado-db");
let fichajeDb: typeof import("../server/fichaje-db");
let outbox: typeof import("../server/olanet-outbox");
let dataMod: typeof import("../data");

// Un pedido con DOS OF: la que se cierra y otra que sigue pendiente, para que
// "es la última que queda" no dispare de más.
const PEDIDO_DOS_OF = {
  id: "AR.26.04351", codigo: "AR.26.04351", cliente: "MAHOU", situacion: "procesado" as const,
  fechaSolicitud: "2026-09-01", fechaPlanificacion: "2026-09-01", fechaEntrega: "2026-09-20",
  prioridad: 2 as const, accent: "ninguno" as const, lineas: 1, croquis: false,
  ofs: [
    { id: "0232086:9", codigo: "0232086", descripcion: "Toldo cofre", familia: "TOLDO" as const, piezas: 1,
      autorId: "ivan", revisorId: null, estado: "aprobada" as const, fichandoRol: null,
      tiempoEstimadoMin: 0, tiempoPlanteoMin: 30, tiempoRevisionMin: 0 },
    { id: "0232087:9", codigo: "0232087", descripcion: "Pérgola", familia: "TOLDO" as const, piezas: 1,
      autorId: "ivan", revisorId: null, estado: "en_curso" as const, fichandoRol: null,
      tiempoEstimadoMin: 0, tiempoPlanteoMin: 0, tiempoRevisionMin: 0 },
  ],
};

beforeAll(async () => {
  dir = mkdtempSync(path.join(tmpdir(), "coordina-cerrar-of-"));
  process.env.COORDINA_DB_PATH = path.join(dir, "test.db");
  process.env.DATASOURCE = "mock";
  estadoDb = await import("../server/estado-db");
  fichajeDb = await import("../server/fichaje-db");
  outbox = await import("../server/olanet-outbox");
  dataMod = await import("../data");
});
afterAll(() => {
  delete process.env.DATASOURCE;
  try { rmSync(dir, { recursive: true, force: true }); } catch { /* Windows/WAL: best effort */ }
});

beforeEach(async () => {
  vi.clearAllMocks();
  delete process.env.FICHAJE_OLANET;
  estadoDb.getDb().exec("DELETE FROM of_overlay; DELETE FROM of_retenida; DELETE FROM olanet_pendiente; DELETE FROM fichaje_intervalo;");
  vi.spyOn(dataMod, "getTablero").mockResolvedValue({ operarios: [], pedidos: [PEDIDO_DOS_OF] });
  fasesDeOFs.mockResolvedValue([{ idBoletin: "900", of: "0232086", fase: "9", descripcion: "FINALIZAR", maquina: "A-OTEC", estado: 2 }]);
  finalizarFase.mockResolvedValue({ ok: true, yaEstaba: false, idBoletin: "900" });
  ruta = await import("../../app/api/fases/cerrar-of/route");
});
afterEach(() => vi.resetModules());

const post = (body: unknown) =>
  ruta.POST(new Request("http://x/api/fases/cerrar-of", { method: "POST", body: JSON.stringify(body) }));

test("solo el autor puede cerrarla; otro técnico recibe 403", async () => {
  const res = await post({ ofId: "0232086:9", operarioId: "tamara" });
  expect(res.status).toBe(403);
  expect(finalizarFase).not.toHaveBeenCalled();
});

test("sin código de RPS es 400, y ni se llega a leer el tablero", async () => {
  const res = await post({ ofId: "0232086:9", operarioId: "sincodigo" });
  expect(res.status).toBe(400);
});

test("una OF detenida no se puede cerrar", async () => {
  vi.spyOn(dataMod, "getTablero").mockResolvedValue({
    operarios: [],
    pedidos: [{ ...PEDIDO_DOS_OF, ofs: [{ ...PEDIDO_DOS_OF.ofs[0], detenida: true }, PEDIDO_DOS_OF.ofs[1]] }],
  });
  const res = await post({ ofId: "0232086:9", operarioId: "ivan" });
  expect(res.status).toBe(409);
  expect(finalizarFase).not.toHaveBeenCalled();
});

test("si es la ÚLTIMA OF que queda del pedido, no se ofrece: toca pasar el pedido", async () => {
  vi.spyOn(dataMod, "getTablero").mockResolvedValue({
    operarios: [],
    pedidos: [{ ...PEDIDO_DOS_OF, ofs: [PEDIDO_DOS_OF.ofs[0], { ...PEDIDO_DOS_OF.ofs[1], estado: "aprobada" }] }],
  });
  const res = await post({ ofId: "0232086:9", operarioId: "ivan" });
  expect(res.status).toBe(409);
  expect(finalizarFase).not.toHaveBeenCalled();
});

test("el corte del fichaje va ANTES que el 3, y con un tramo que no entra no se cierra nada", async () => {
  // Un intervalo abierto de Iván sobre esta OF: el corte lo cierra y lo
  // encola, y como el mock del envío no vacía la cola de verdad, el tramo
  // queda pendiente y la ruta tiene que rechazar el cierre.
  fichajeDb.guardarFichaje("ivan", { intervalos: [{ inicio: "2026-09-15T10:00:00.000Z", fin: null, ofIds: ["0232086:9"], rol: "plantear", operarioId: "ivan" }] });
  outbox.encolarFichaje("ivan", [{ inicio: "2026-09-15T10:00:00.000Z", fin: null, ofIds: ["0232086:9"], rol: "plantear", operarioId: "ivan" }]);

  const res = await post({ ofId: "0232086:9", operarioId: "ivan" });
  expect(res.status).toBe(409);
  expect(finalizarFase).not.toHaveBeenCalled();
  // El reloj SÍ se ha parado, aunque el cierre no haya entrado.
  const abiertos = fichajeDb.leerFichaje("ivan").intervalos.filter((iv) => iv.fin === null);
  expect(abiertos).toHaveLength(0);
  expect(estadoDb.leerOverlay("ot").ofs.get("0232086:9")?.cerradaRps).toBeUndefined();
});

test("escribe el 3, marca la OF y la retiene, en modo activo", async () => {
  process.env.FICHAJE_OLANET = "activo";
  const res = await post({ ofId: "0232086:9", operarioId: "ivan" });
  expect(res.status).toBe(200);
  const d = await res.json();
  expect(d.ok).toBe(true);
  expect(d.modo).toBe("activo");
  expect(finalizarFase).toHaveBeenCalledWith(expect.objectContaining({ idBoletin: "900", operarioRps: "195" }));

  const overlay = estadoDb.leerOverlay("ot");
  expect(overlay.ofs.get("0232086:9")?.estado).toBe("aprobada");
  expect(overlay.ofs.get("0232086:9")?.cerradaRps).toEqual(expect.objectContaining({ por: "ivan", modo: "activo" }));
  expect(estadoDb.leerOfsRetenidas("ot")).toEqual([
    expect.objectContaining({ ofId: "0232086:9", pedido: "AR.26.04351", motivo: "cerrada", por: "ivan" }),
  ]);
});

test("con la operación ya en 3 (finalizables no la trae), contesta yaEstaba y marca igual", async () => {
  process.env.FICHAJE_OLANET = "activo";
  fasesDeOFs.mockResolvedValue([{ idBoletin: "900", of: "0232086", fase: "9", descripcion: "FINALIZAR", maquina: "A-OTEC", estado: 3 }]);
  const res = await post({ ofId: "0232086:9", operarioId: "ivan" });
  expect(res.status).toBe(200);
  expect(finalizarFase).not.toHaveBeenCalled();
  expect(estadoDb.leerOverlay("ot").ofs.get("0232086:9")?.cerradaRps).toBeDefined();
});

test("operación eliminada (4): 409, no se marca", async () => {
  process.env.FICHAJE_OLANET = "activo";
  fasesDeOFs.mockResolvedValue([{ idBoletin: "900", of: "0232086", fase: "9", descripcion: "FINALIZAR", maquina: "A-OTEC", estado: 4 }]);
  const res = await post({ ofId: "0232086:9", operarioId: "ivan" });
  expect(res.status).toBe(409);
  expect(finalizarFase).not.toHaveBeenCalled();
  expect(estadoDb.leerOverlay("ot").ofs.get("0232086:9")?.cerradaRps).toBeUndefined();
});

test("la trampa 2/02: se cierran las dos de mi sección, la marca depende de la de la fila", async () => {
  process.env.FICHAJE_OLANET = "activo";
  fasesDeOFs.mockResolvedValue([
    { idBoletin: "900", of: "0232086", fase: "9", descripcion: "FINALIZAR", maquina: "A-OTEC", estado: 2 },
    { idBoletin: "901", of: "0232086", fase: "09", descripcion: "FINALIZAR bis", maquina: "A-OTEC", estado: 1 },
  ]);
  finalizarFase.mockImplementation(async (o: { idBoletin: string }) =>
    o.idBoletin === "900" ? { ok: true, yaEstaba: false, idBoletin: "900" } : { ok: false, status: 503, error: "no responde" });
  const res = await post({ ofId: "0232086:9", operarioId: "ivan" });
  // La de la fila (900, fase "9") entró: se marca, aunque la gemela fallara.
  expect(res.status).toBe(200);
  expect(finalizarFase).toHaveBeenCalledTimes(2);
  expect(estadoDb.leerOverlay("ot").ofs.get("0232086:9")?.cerradaRps).toBeDefined();
});

test("en sombra y ensayo no se llama a finalizarFase, se marca igual con el modo", async () => {
  for (const modo of ["sombra", "ensayo"]) {
    estadoDb.getDb().exec("DELETE FROM of_overlay; DELETE FROM of_retenida;");
    process.env.FICHAJE_OLANET = modo === "sombra" ? "" : modo;
    const res = await post({ ofId: "0232086:9", operarioId: "ivan" });
    expect(res.status).toBe(200);
    expect(finalizarFase).not.toHaveBeenCalled();
    expect(estadoDb.leerOverlay("ot").ofs.get("0232086:9")?.cerradaRps).toEqual(expect.objectContaining({ modo: modo === "sombra" ? "sombra" : "ensayo" }));
  }
});
```

Run: `pnpm vitest run src/lib/__tests__/api-fases-cerrar-of.test.ts`
Expected: FAIL — la ruta no existe todavía.

- [ ] **Step 7: Crear la ruta**

Crear `src/app/api/fases/cerrar-of/route.ts`:

```ts
import { NextResponse } from "next/server";
import { identidad } from "@/lib/server/sesion";
import { getTablero } from "@/lib/data";
import { aplicarOverlay } from "@/lib/server/overlay";
import { leerOverlay, guardarMutacion } from "@/lib/server/estado-db";
import { accionesDisponibles } from "@/lib/acciones";
import { esSeccionId, esFaseDe, SECCIONES } from "@/lib/secciones";
import { seccionDeOperario, COD_RPS_POR_OPERARIO } from "@/lib/server/operarios";
import { finalizables, situacionDe } from "@/lib/fase-pendiente";
import { ofsQueCuentan, pedidoListoParaPasar } from "@/lib/fases-tablero";
import { cortarFichajeDeOF } from "@/lib/server/fichaje-db";

// ─── POST /api/fases/cerrar-of ───────────────────────────────────────────────
// «Dar por terminada en RPS» sobre una OF suelta, antes de pasar el pedido
// entero. Sección 2 de la spec 2026-09-15-material-gastado-y-cerrar-of-design:
// corta el fichaje, drena la cola de OLANET, cierra en RPS (solo en modo
// `activo`) y marca la OF en la misma transacción que la retiene en el
// tablero. ESCRIBE EN EL SISTEMA DE LA FÁBRICA: por eso se relee todo del
// servidor y no se confía en nada de lo que traiga el navegador salvo el id.

export const dynamic = "force-dynamic";

const OF_ID_RE = /^\d{1,20}:[\w-]{1,20}$/;

export async function POST(req: Request) {
  let cuerpo: unknown;
  try {
    cuerpo = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }
  if (typeof cuerpo !== "object" || cuerpo === null)
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  const b = cuerpo as Record<string, unknown>;
  const ofId = typeof b.ofId === "string" && OF_ID_RE.test(b.ofId) ? b.ofId : null;
  if (!ofId) return NextResponse.json({ error: "Falta ofId" }, { status: 400 });

  const yo = identidad(req, b.operarioId, "tecnico");
  if (yo instanceof NextResponse) return yo;
  const operarioId = yo.id;
  const operarioRps = COD_RPS_POR_OPERARIO[operarioId];
  if (!operarioRps)
    return NextResponse.json({ error: `${operarioId} no tiene código de operario en RPS` }, { status: 400 });

  const seccionId = esSeccionId(b.seccion) ? b.seccion : seccionDeOperario(operarioId);
  const seccion = SECCIONES[seccionId];

  // 2. Se relee el tablero con su overlay, como hace /api/estado. Nada de lo
  //    que sigue se fía del cuerpo salvo el ofId y el operarioId.
  const base = await getTablero(seccionId);
  const tablero = aplicarOverlay(base, leerOverlay(seccionId));
  let pedido: (typeof tablero.pedidos)[number] | undefined;
  let of: (typeof tablero.pedidos)[number]["ofs"][number] | undefined;
  for (const p of tablero.pedidos) {
    const encontrada = p.ofs.find((o) => o.id === ofId);
    if (encontrada) {
      pedido = p;
      of = encontrada;
      break;
    }
  }
  if (!of || !pedido) return NextResponse.json({ error: "OF no encontrada" }, { status: 404 });
  if (of.autorId !== operarioId)
    return NextResponse.json({ error: "Solo el autor puede cerrar esta OF en RPS." }, { status: 403 });
  if (!accionesDisponibles(of, null).some((a) => a.id === "cerrar_en_rps"))
    return NextResponse.json({ error: "Esta OF no se puede dar por terminada en RPS ahora mismo." }, { status: 409 });
  // Última OF que queda: si al aprobar ESTA no quedara nada más que hacer, es
  // "Pasar a Producción" lo que toca, no esto — ver ofsQueCuentan/
  // pedidoListoParaPasar en fases-tablero.ts.
  const comoSiAprobada = { ...pedido, ofs: pedido.ofs.map((o) => (o.id === of!.id ? { ...o, estado: "aprobada" as const } : o)) };
  if (pedidoListoParaPasar(comoSiAprobada))
    return NextResponse.json({ error: "Es la última OF pendiente del pedido: usa «Pasar a Producción»." }, { status: 409 });

  // 3. El tiempo antes que el cierre: se corta con la hora del servidor.
  const ahora = new Date().toISOString();
  cortarFichajeDeOF(ofId, ahora);

  const { modoFichaje, leerPendientes } = await import("@/lib/server/olanet-outbox");
  const modo = modoFichaje();
  const operaciones: { of: string; fase: string; ok: boolean; yaEstaba: boolean; error?: string }[] = [];

  if (modo === "activo") {
    try {
      const { drenarCola } = await import("@/lib/server/olanet-worker");
      const { fasesDeOFs, finalizarFase } = await import("@/lib/server/olanet");
      const { claveFase } = await import("@/lib/server/rps");

      // 5. Se drena la cola EN ORDEN (con su candado, Tarea 3) y se comprueba
      //    que no queda pendiente ningún evento de esta orden.
      await drenarCola();
      const [orden, tareaFila] = ofId.split(":");
      if (leerPendientes().some((p) => p.tipo === "fase" && p.datos.of === orden)) {
        return NextResponse.json(
          { error: "Queda tiempo de esta OF por subir a RPS y ahora no entra. No se ha cerrado nada; el reloj sí se ha parado. Vuelve a probar en unos minutos." },
          { status: 409 },
        );
      }

      // 6. Las operaciones de MI sección para esta orden — normalmente una,
      //    dos con la trampa 2/02 (finalizables ya filtra por sección, así
      //    que la gemela de otra sección no se toca).
      const fases = await fasesDeOFs([orden]);
      const filaPropia = fases.find((f) => claveFase(f.of, f.fase) === claveFase(orden, tareaFila));
      const situacionPropia = filaPropia ? situacionDe(filaPropia.estado) : "desconocida";
      if (situacionPropia === "eliminada" || situacionPropia === "desconocida") {
        return NextResponse.json({ error: "RPS ya retiró esta operación; no hay nada que cerrar." }, { status: 409 });
      }

      const pendientesDeCerrar = finalizables(fases, seccion);
      for (const f of pendientesDeCerrar) {
        const r = await finalizarFase({
          idBoletin: f.idBoletin, of: f.of, fase: f.fase,
          esNuestra: (m) => esFaseDe(m, seccion), operarioRps, cuando: new Date(),
        });
        operaciones.push({
          of: f.of, fase: f.fase, ok: r.ok,
          yaEstaba: r.ok ? r.yaEstaba : false,
          error: r.ok ? undefined : r.error,
        });
      }
      // La fila no estaba en pendientesDeCerrar porque YA estaba en 3
      // (situacionPropia === "finalizada", descartado arriba lo demás): éxito
      // sin volver a escribir.
      const deLaFila = operaciones.find((o) => claveFase(o.of, o.fase) === claveFase(orden, tareaFila));
      if (deLaFila && !deLaFila.ok) {
        return NextResponse.json(
          { error: deLaFila.error ?? "No se ha podido escribir en RPS. No se ha cerrado nada; el reloj sí se ha parado.", operaciones },
          { status: 409 },
        );
      }
    } catch (e) {
      console.warn("[coordina] no se pudo cerrar la OF en RPS:", (e as Error).message);
      // El corte del reloj ya estaba hecho y no se deshace, igual que en
      // "Pasar a Producción": volver a pulsar es seguro (idempotente).
      return NextResponse.json({ error: "No se ha podido escribir en RPS. No se ha cerrado nada; el reloj sí se ha parado." }, { status: 503 });
    }
  }
  // En sombra/ensayo: nada de lo anterior se ejecuta. `operaciones` queda
  // vacío y la marca se guarda con el modo, tal cual pide el paso 4 de la spec.

  // 7. Marca + fila retenida, en la MISMA transacción que el cambio a
  //    "aprobada".
  guardarMutacion({
    operarioId,
    motivo: "cerrar_en_rps",
    seccion: seccionId,
    cambiosOF: [{
      ofId, autorId: of.autorId, revisorId: of.revisorId, estado: "aprobada",
      observacion: of.observacion ?? null,
      cerradaRps: { at: ahora, por: operarioId, modo },
    }],
    previosOF: [{
      ofId, autorId: of.autorId, revisorId: of.revisorId, estado: of.estado,
      observacion: of.observacion ?? null,
    }],
    ofRetenida: { ofId, pedido: pedido.codigo, motivo: "cerrada", por: operarioId, at: ahora },
  });

  return NextResponse.json({ ok: true, modo, operaciones });
}
```

- [ ] **Step 8: Ejecutar los tests y verlos pasar**

Run: `pnpm vitest run src/lib/__tests__/api-fases-cerrar-of.test.ts`
Expected: PASS (los once casos).

- [ ] **Step 9: Suite y tipos**

Run: `pnpm test && npx tsc --noEmit && pnpm lint`
Expected: todo en verde. (Ver también «Qué se prueba» de la spec: los tests de `api-fases.test.ts` de la Tarea 3 siguen intactos.)

- [ ] **Step 10: Commit**

```bash
git add src/app/api/fases/cerrar-of/route.ts src/lib/__tests__/api-fases-cerrar-of.test.ts
git commit -m "refactor(fases): ruta para dar por terminada una OF en RPS, sin botón todavía"
```

(Sin línea `Novedad:`: la ruta existe pero nada la llama hasta la Tarea 6.)

---

## Task 6: «Dar por terminada en RPS» — interfaz

El botón, la confirmación dinámica, el cajón de cerradas y «Volver a plantear». Sección 2 «Cómo se ve» de la spec.

**Files:**
- Create: `src/components/CerrarEnRpsInline.tsx`
- Modify: `src/lib/acciones.ts` (`aplicarAccion` limpia `cerradaRps` al volver a plantear)
- Modify: `src/lib/fichaje.ts` (`esFichable` excluye las cerradas)
- Modify: `src/app/api/estado/route.ts` (`Body.quitarRetenida`, pasa a `guardarMutacion`)
- Modify: `src/components/Drawer.tsx` (`grupoOculto`, `GRUPOS`, distintivo, cajón, `AccionesOF`/`OFRow` reciben `seccion`/`onCerradoEnRps`)
- Modify: `src/components/Board.tsx` (`snapshotDe` lleva `cerradaRps`; `mut`/`persistir` aceptan `quitarRetenida`; `marcarCerradaEnRps`; `facetsByLoc` salta las cerradas; se pasa `onCerradoEnRps` al Drawer)
- Modify: `src/lib/__tests__/drawer-pasar.test.ts` (prop nueva obligatoria)
- Test: `src/lib/__tests__/acciones.test.ts` (añadir caso)
- Test: `src/lib/__tests__/fichaje.test.ts` (añadir caso)
- Test: `src/lib/__tests__/api-estado.test.ts` (añadir caso)
- Test: `src/lib/__tests__/drawer-cerrada.test.ts` (nuevo, con `renderToStaticMarkup` como `drawer-pasar.test.ts`)

**Interfaces:**
- Produces: `<CerrarEnRpsInline of revisor seccion miId onCerrado abierto? onAbrirCambio? />` (`src/components/CerrarEnRpsInline.tsx`).
- Consumes: `finalizables` (`src/lib/fase-pendiente.ts`), `ConfirmDialog` (`src/components/ConfirmDialog.tsx`), `POST /api/fases/cerrar-of` (Tarea 5).

- [ ] **Step 1: `esFichable` excluye las OF cerradas — test (falla)**

Añadir a `src/lib/__tests__/fichaje.test.ts` (o al fichero equivalente que ya pruebe `esFichable`/`motivoNoFichable`):

```ts
it("una OF cerrada en RPS no se puede fichar, aunque esté aprobada", () => {
  const cerrada: OF = { ...OF_BASE, estado: "aprobada", cerradaRps: { at: "x", por: "ivan", modo: "activo" } };
  expect(esFichable(cerrada)).toBe(false);
  expect(motivoNoFichable(cerrada)).toBe("Dada por terminada en RPS");
});
```

(Sustituir `OF_BASE` por el helper/objeto de OF que ya use ese fichero de test; si no existe uno reutilizable, construir el objeto completo con los campos obligatorios de `OF`, como hace `acciones.test.ts`.)

Run: `pnpm vitest run src/lib/__tests__/fichaje.test.ts -t "cerrada en RPS"`
Expected: FAIL.

- [ ] **Step 2: `esFichable`/`motivoNoFichable` en `src/lib/fichaje.ts`**

Sustituir las dos funciones por:

```ts
export function esFichable(of: OF): boolean {
  return !of.detenida && of.fichable !== false && of.estado !== "anulada" && of.cerradaRps === undefined;
}

export function motivoNoFichable(of: OF): string | null {
  if (of.detenida) return "Detenida por Producción";
  // Antes de "no admite imputaciones": una OF cerrada normalmente SÍ admite
  // (sigue "aprobada"), y el motivo real es otro — fichar reabriría la
  // operación en OLANET y la marca quedaría mintiendo.
  if (of.cerradaRps) return "Dada por terminada en RPS";
  if (of.fichable === false)
    return "La situación en RPS no admite fichar (el tiempo no subiría)";
  if (of.estado === "anulada") return "OF anulada";
  return null;
}
```

- [ ] **Step 3: Ejecutar el test y verlo pasar**

Run: `pnpm vitest run src/lib/__tests__/fichaje.test.ts`
Expected: PASS.

- [ ] **Step 4: `aplicarAccion` limpia la marca al volver a plantear — test (falla)**

Añadir a `src/lib/__tests__/acciones.test.ts`:

```ts
it("aplicarAccion limpia cerradaRps al volver a plantear, y la deja intacta en las demás acciones", () => {
  const cerrada = of("aprobada", { cerradaRps: { at: "2026-09-15T11:42:00.000Z", por: "op1", modo: "activo" } });
  expect(aplicarAccion(cerrada, "volver_a_plantear").cerradaRps).toBeUndefined();
  expect(aplicarAccion(cerrada, "volver_a_plantear").estado).toBe("en_curso");

  const aprobadaSinMarca = of("aprobada");
  // "Reabrir" no toca cerradaRps porque nunca la tuvo: no confundir "no
  // tocarla" con "borrarla siempre en cualquier destino a en_curso".
  expect(aplicarAccion(aprobadaSinMarca, "reabrir").cerradaRps).toBeUndefined();
});
```

Run: `pnpm vitest run src/lib/__tests__/acciones.test.ts -t "limpia cerradaRps"`
Expected: FAIL.

- [ ] **Step 5: `aplicarAccion` en `src/lib/acciones.ts`**

Cambiar el `return` final de `aplicarAccion` por:

```ts
  return {
    ...of,
    estado,
    // Pasar por `en_revision` es lo que enciende `revisada`, aquí y en el
    // servidor (ver `guardarMutacion`). No se apaga nunca: la revisión ocurrió.
    ...(estado === "en_revision" ? { revisada: true } : {}),
    ...(def.conNota || def.conMotivo ? { observacion: obs!.trim() } : {}),
    // "Volver a plantear" quita la marca: en RPS la operación sigue
    // terminada, pero en CoordinaOT deja de estar "cerrada" y vuelve a
    // fichable. El resto de acciones nunca tocan este campo.
    ...(accion === "volver_a_plantear" ? { cerradaRps: undefined } : {}),
  };
```

- [ ] **Step 6: Ejecutar el test y verlo pasar**

Run: `pnpm vitest run src/lib/__tests__/acciones.test.ts`
Expected: PASS.

- [ ] **Step 7: `Body.quitarRetenida` en `POST /api/estado` — test (falla)**

Añadir a `src/lib/__tests__/api-estado.test.ts` (reutilizar el mock de `estado-db`/`fichaje-db` que ya tenga el fichero; si mockea `guardarMutacion`, comprobar la llamada; si usa una BD temporal como `estado-db-retenida.test.ts`, comprobar `leerOfsRetenidas`):

```ts
test("quitarRetenida llega a guardarMutacion", async () => {
  // Ajustar al patrón de mocks/BD que ya use este fichero. Con BD temporal:
  db.guardarMutacion({
    operarioId: "ivan", motivo: "cerrar_en_rps", seccion: "ot",
    cambiosOF: [{ ofId: "0232086:9", autorId: "ivan", revisorId: null, estado: "aprobada", observacion: null, cerradaRps: { at: "x", por: "ivan", modo: "activo" } }],
    ofRetenida: { ofId: "0232086:9", pedido: "AR.26.04351", motivo: "cerrada", por: "ivan", at: "x" },
  });
  await post({
    motivo: "volver_a_plantear", operarioId: "ivan", seccion: "ot",
    cambiosOF: [{ ofId: "0232086:9", autorId: "ivan", revisorId: null, estado: "en_curso", observacion: null, cerradaRps: null }],
    quitarRetenida: ["0232086:9"],
  });
  expect(db.leerOfsRetenidas("ot")).toEqual([]);
});
```

Run: `pnpm vitest run src/lib/__tests__/api-estado.test.ts -t quitarRetenida`
Expected: FAIL — `quitarRetenida` no se lee del cuerpo.

- [ ] **Step 8: `POST /api/estado` acepta y reenvía `quitarRetenida`**

En `src/app/api/estado/route.ts`, dentro de `interface Body { … }`, añadir detrás de `cortarFichajeDe?: string[];`:

```ts
  /** Ids que salen de `of_retenida` en la misma transacción. Los manda
   *  "Volver a plantear" (ver Board.tsx `ejecutarAccion`). */
  quitarRetenida?: string[];
```

Dentro de `POST`, en la llamada a `guardarMutacion({ … })`, añadir el campo:

```ts
  guardarMutacion({
    operarioId,
    motivo: body.motivo,
    cambiosOF: cambios,
    previosOF: previos,
    completarPedidoId,
    seccion,
    ofIdsPedido,
    quitarRetenida: Array.isArray(body.quitarRetenida)
      ? body.quitarRetenida.filter((x): x is string => typeof x === "string" && x.length > 0)
      : undefined,
  });
```

- [ ] **Step 9: Ejecutar el test y verlo pasar**

Run: `pnpm vitest run src/lib/__tests__/api-estado.test.ts`
Expected: PASS.

- [ ] **Step 10: Suite y tipos hasta aquí**

Run: `pnpm test && npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 11: Commit intermedio**

```bash
git add src/lib/fichaje.ts src/lib/acciones.ts src/app/api/estado/route.ts src/lib/__tests__/fichaje.test.ts src/lib/__tests__/acciones.test.ts src/lib/__tests__/api-estado.test.ts
git commit -m "refactor(fichaje): una OF cerrada en RPS deja de ser fichable, y volver a plantear limpia la marca"
```

- [ ] **Step 12: El componente `CerrarEnRpsInline`**

Crear `src/components/CerrarEnRpsInline.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";
import { finalizables, type FaseDeOF } from "@/lib/fase-pendiente";
import type { OF } from "@/lib/types";
import type { Seccion } from "@/lib/secciones";
import { ConfirmDialog } from "./ConfirmDialog";

interface FaseConBoletin extends FaseDeOF {
  idBoletin: string;
}

/** «Dar por terminada en RPS», con su confirmación DINÁMICA: antes de
 *  enseñarla se piden a OLANET las operaciones de la OF (`GET /api/fases?ofs=`,
 *  la misma ruta que usa `FasesSinFinalizar`), porque el texto depende de lo
 *  que haya de verdad — una operación, la trampa 2/02, o que ya esté
 *  terminada. Sección 2 de la spec del 15/09/2026, "La confirmación".
 *
 *  Mismo patrón CONTROLADO que `AnularInline`: sin `abierto`, trae su propio
 *  botón (para cuando es la única opción del cajón y `AccionesOF` la saca a
 *  la fila); con `abierto`/`onAbrirCambio`, la dispara el menú de "⋯". */
export function CerrarEnRpsInline({
  of,
  seccion,
  miId,
  onCerrado,
  abierto: abiertoFuera,
  onAbrirCambio,
}: {
  of: OF;
  seccion: Seccion;
  miId: string;
  /** La OF ya se cerró en el servidor: el Board actualiza su estado local. */
  onCerrado: (ofId: string, cerradaRps: NonNullable<OF["cerradaRps"]>) => void;
  abierto?: boolean;
  onAbrirCambio?: (v: boolean) => void;
}) {
  const [abiertoPropio, setAbiertoPropio] = useState(false);
  const controlado = abiertoFuera !== undefined;
  const abierto = controlado ? abiertoFuera : abiertoPropio;
  const cerrarPanel = () => (controlado ? onAbrirCambio?.(false) : setAbiertoPropio(false));

  const [cargando, setCargando] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmar, setConfirmar] = useState(false);
  const [pendientes, setPendientes] = useState<FaseConBoletin[]>([]);

  async function cargarYConfirmar() {
    setError(null);
    setCargando(true);
    try {
      const r = await fetch(`/api/fases?ofs=${encodeURIComponent(of.codigo)}`, { cache: "no-store" });
      if (!r.ok) throw new Error(String(r.status));
      const d = (await r.json()) as { fases: FaseConBoletin[] };
      setPendientes(finalizables(d.fases, seccion));
      setConfirmar(true);
    } catch {
      setError("No se puede hablar con RPS ahora mismo. No se ha cerrado nada.");
      cerrarPanel();
    } finally {
      setCargando(false);
    }
  }

  // Modo controlado: el disparo es el propio `abierto` (lo pone el menú de
  // "⋯"), no un clic aquí dentro. Diferido con setTimeout(0), mismo patrón
  // que FasesSinFinalizar/HistorialDrawer: un efecto no puede llamar a
  // setState de forma síncrona.
  useEffect(() => {
    if (!controlado || !abiertoFuera) return;
    const id = setTimeout(() => void cargarYConfirmar(), 0);
    return () => clearTimeout(id);
    // El resto de dependencias (of.codigo, seccion) no cambian mientras el
    // panel está abierto; recalcular solo cuando se abre es lo correcto.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [controlado, abiertoFuera]);

  async function confirmarCierre() {
    setConfirmar(false);
    setEnviando(true);
    setError(null);
    try {
      const r = await fetch("/api/fases/cerrar-of", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ofId: of.id, seccion: seccion.id, operarioId: miId }),
      });
      const d = (await r.json().catch(() => null)) as
        | { ok: true; modo: "sombra" | "ensayo" | "activo" }
        | { error: string }
        | null;
      if (!r.ok || !d || !("ok" in d)) {
        setError((d as { error?: string } | null)?.error ?? "No se ha podido escribir en RPS. No se ha cerrado nada; el reloj sí se ha parado.");
        return;
      }
      onCerrado(of.id, { at: new Date().toISOString(), por: miId, modo: d.modo });
      cerrarPanel();
    } catch {
      setError("No se ha podido escribir en RPS. No se ha cerrado nada; el reloj sí se ha parado.");
    } finally {
      setEnviando(false);
    }
  }

  const trampa = pendientes.length === 2;
  const yaEstaba = confirmar && pendientes.length === 0;
  const mensaje = yaEstaba
    ? "En RPS ya está terminada. Aquí la OF queda aprobada y se aparta del pedido."
    : trampa
      ? `En RPS esta OF tiene dos operaciones de ${seccion.nombre} abiertas, la ${pendientes[0].fase} y la ${pendientes[1].fase}. Se dan por terminadas las dos.\n\nProducción las verá terminadas, con la fecha de hoy y a tu nombre. Antes se para el reloj de quien la esté fichando.\n\nAquí la OF queda aprobada y se aparta del pedido; lo demás sigue en el panel.`
      : `Producción verá la operación ${pendientes[0]?.fase ?? ""} de la OF ${of.codigo} como terminada, con la fecha de hoy y a tu nombre. Antes se para el reloj de quien la esté fichando.\n\nAquí la OF queda aprobada y se aparta del pedido; lo demás sigue en el panel.`;

  return (
    <>
      {!controlado && (
        <button
          type="button"
          onClick={() => { setAbiertoPropio(true); void cargarYConfirmar(); }}
          disabled={cargando || enviando}
          className="rounded-lg px-2.5 py-1 text-xs font-semibold text-text-muted ring-1 ring-border hover:bg-[var(--glass-highlight)] disabled:opacity-50"
        >
          {cargando ? "Consultando RPS…" : "Dar por terminada en RPS"}
        </button>
      )}
      {error && (
        <p className="w-full text-[11px] text-red-600 dark:text-red-400" role="alert">
          {error}
        </p>
      )}
      {abierto && (
        <ConfirmDialog
          abierto={confirmar}
          titulo="Dar por terminada en RPS"
          mensaje={mensaje}
          onConfirmar={() => void confirmarCierre()}
          onCancelar={() => {
            setConfirmar(false);
            cerrarPanel();
          }}
        />
      )}
    </>
  );
}
```

- [ ] **Step 13: Tipos**

Run: `npx tsc --noEmit`
Expected: sin errores (el componente todavía no se usa en ningún sitio, así que no hay comprobación de comportamiento aquí — llega en los pasos siguientes).

- [ ] **Step 14: Commit**

```bash
git add src/components/CerrarEnRpsInline.tsx
git commit -m "feat(fases): componente de confirmación para dar por terminada una OF en RPS, sin conectar todavía"
```

- [ ] **Step 15: `Drawer.tsx` — cajón, distintivo y acciones**

En `src/components/Drawer.tsx`, añadir el import: `import { CerrarEnRpsInline } from "./CerrarEnRpsInline";`.

Cambiar `type GrupoOculto` y `grupoOculto`:

```ts
type GrupoOculto = "detenida" | "taller" | "anulada" | "cerrada";

/** Por qué NO se enseña de entrada, o null si es trabajo de OT.
 *
 *  El orden de los `if` es la precedencia: anulada > cerrada > taller >
 *  detenida. Una OF cerrada en RPS sigue "aprobada" y sin `ajenaOT`, así que
 *  sin este orden explícito caería antes en cualquier otro cajón que
 *  mencionara primero su estado real. */
function grupoOculto(of: OF): GrupoOculto | null {
  if (of.estado === "anulada") return "anulada";
  if (of.cerradaRps) return "cerrada";
  if (ofDeTaller(of)) return "taller";
  if (of.detenida) return "detenida";
  return null;
}
```

Añadir una entrada a `GRUPOS`, detrás de `"anulada"`:

```ts
  {
    id: "cerrada",
    nombre: (n) => (n === 1 ? "cerrada en RPS" : "cerradas en RPS"),
    ayuda: "Dadas por terminadas en RPS antes de pasar el pedido. Producción ya las ve terminadas.",
  },
```

Detrás de `motivoDeAnulada`, añadir:

```ts
/** "15/09/26 11:42", para el globo del distintivo y el resumen del cajón. */
function fmtCierre(iso: string): string {
  const d = new Date(iso);
  const f = `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getFullYear()).slice(2)}`;
  const h = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  return `${f} ${h}`;
}

/** "0232086 — Iván Sánchez, 15/09/26 11:42": para leer quién cerró cada OF y
 *  cuándo sin desplegar el cajón, como `motivoDeAnulada`. */
function motivoDeCerrada(of: OF, nombreDe: (id: string) => string | undefined): string {
  const c = of.cerradaRps;
  if (!c) return of.codigo;
  return `${of.codigo} — ${nombreDe(c.por) ?? c.por}, ${fmtCierre(c.at)}`;
}
```

En el bloque `{ocultas.length > 0 && ( … ocultas.map(({ grupo, ofs }) => { … }) )}` (más abajo, donde ya se pinta `title={ grupo.id === "anulada" ? … : grupo.ayuda }`), añadir, DETRÁS del `<button>` de cada grupo y dentro del mismo `return` del `.map`, las líneas visibles de las cerradas (spec: "Debajo, una línea por OF sin abrir el cajón, como las anuladas"):

```tsx
                return (
                  <div key={grupo.id} className={grupo.id === "cerrada" ? "w-full" : undefined}>
                    <button
                      onClick={() =>
                        setMostrar((prev) => {
                          const s = new Set(prev);
                          if (!s.delete(grupo.id)) s.add(grupo.id);
                          return s;
                        })
                      }
                      aria-expanded={abierto}
                      title={
                        grupo.id === "anulada"
                          ? `${grupo.ayuda}\n${ofs.map((o) => motivoDeAnulada(o)).join("\n")}`
                          : grupo.ayuda
                      }
                      className={`rounded-lg px-2.5 py-1 text-[11px] font-semibold ${
                        abierto
                          ? "glass-chip-activo text-text"
                          : "glass-chip text-text-muted hover:text-text"
                      }`}
                    >
                      {abierto ? "Ocultar" : "Ver"} {ofs.length} {grupo.nombre(ofs.length)}
                    </button>
                    {grupo.id === "cerrada" && (
                      <div className="mt-1 space-y-0.5">
                        {ofs.map((o) => (
                          <p key={o.id} className="text-[11px] text-text-muted">
                            {motivoDeCerrada(o, (id) => opById(id)?.nombre)}
                          </p>
                        ))}
                      </div>
                    )}
                  </div>
                );
```

(Esto sustituye el `<button>…</button>` suelto que hoy devuelve el `.map`; el resto del bloque —el `key`, el `{ocultas.map(({ grupo, ofs }) => { const abierto = mostrar.has(grupo.id); return ( … ) })}`— no cambia de estructura, solo el contenido de cada iteración.)

En `OFRow`, cambiar el `<span>` del distintivo de estado (líneas 1024-1033 de hoy) por:

```tsx
        <span
          className={`rounded px-1.5 py-0.5 text-[10px] font-bold uppercase ${of.cerradaRps ? "bg-cyan-600/15 text-cyan-800 dark:text-cyan-300" : meta.chip}`}
          title={
            of.cerradaRps
              ? `Cerrada en RPS por ${opById(of.cerradaRps.por)?.nombre ?? of.cerradaRps.por}, ${fmtCierre(of.cerradaRps.at)}${
                  of.cerradaRps.modo !== "activo" ? ` (modo ${of.cerradaRps.modo}: no se llegó a escribir en RPS)` : ""
                }`
              : anulacion?.nota
          }
        >
          {/* "Aprobada" a secas se lee como "alguien la repasó y le dio el
              visto bueno". Con la marca, lo que hay que leer es que ya está
              cerrada en RPS — y si fue en sombra/ensayo, que NO se llegó a
              escribir de verdad. */}
          {of.cerradaRps
            ? (of.cerradaRps.modo === "activo" ? "Cerrada en RPS" : "Cerrada · sin escribir en RPS")
            : aprobadaSinRevision(of) ? "Aprobada sin revisión" : meta.label}
          {anulacion && ` · ${textoAnulacion(anulacion)}`}
        </span>
```

En la firma de `OFRow`, añadir `seccion: Seccion;` y `onCerradoEnRps: (ofId: string, cerradaRps: NonNullable<OF["cerradaRps"]>) => void;` a la interfaz de props, y añadir los dos parámetros a la desestructuración. En la llamada a `<AccionesOF … />` desde dentro de `OFRow`, añadir `seccion={seccion}` y `onCerradoEnRps={onCerradoEnRps}`.

En el sitio donde `Drawer` invoca `<OFRow … />` (el `ofsVisibles.map((of) => ( <OFRow … /> ))`), añadir `seccion={seccion}` y `onCerradoEnRps={onCerradoEnRps}` a las props que ya se pasan (`seccion` ya existe como prop del propio `Drawer`; `onCerradoEnRps` es una prop NUEVA de `Drawer`, ver el paso siguiente).

Añadir `onCerradoEnRps: (ofId: string, cerradaRps: NonNullable<OF["cerradaRps"]>) => void;` a la interfaz de props de `Drawer` (junto a `onDesficharVarias`) y a su desestructuración.

- [ ] **Step 16: `AccionesOF` monta `CerrarEnRpsInline`**

En `AccionesOF`, añadir `seccion: Seccion;` y `onCerradoEnRps: (ofId: string, cerradaRps: NonNullable<OF["cerradaRps"]>) => void;` a su interfaz de props y a la desestructuración (junto a `revisionPorPedido`/`onAccion`).

Añadir el estado nuevo junto a `const [anulando, setAnulando] = useState(false);`:

```ts
  // "Dar por terminada en RPS" se abre desde el cajón de "⋯", como anular
  // (ver MenuAccionesOF).
  const [cerrandoEnRps, setCerrandoEnRps] = useState(false);
```

En `sueltas.map((a) => { … })`, añadir una rama ANTES de la rama genérica de `Btn` (después de la de `a.id === "terminar_planteo"`):

```tsx
        if (a.id === "cerrar_en_rps")
          return (
            <CerrarEnRpsInline
              key={a.id}
              of={of}
              seccion={seccion}
              miId={miId!}
              onCerrado={onCerradoEnRps}
            />
          );
```

(`miId!`: seguro, porque `cerrar_en_rps` solo entra en `acciones` cuando `accionesDisponibles(of, miId)` casó `soloEl: "autor"`, que exige `miId` no nulo.)

Detrás del bloque `{menu.some((a) => a.id === "anular") && ( <AnularInline … /> )}`, añadir el equivalente para cerrar en RPS:

```tsx
      {menu.some((a) => a.id === "cerrar_en_rps") && miId && (
        <CerrarEnRpsInline
          of={of}
          seccion={seccion}
          miId={miId}
          onCerrado={onCerradoEnRps}
          abierto={cerrandoEnRps}
          onAbrirCambio={setCerrandoEnRps}
        />
      )}
```

En `<MenuAccionesOF … onElegir={(a) => { … }} />`, añadir la rama:

```tsx
        onElegir={(a) => {
          if (a.id === "anular") setAnulando(true);
          else if (a.id === "terminar_planteo") setPidiendoRevisor(true);
          else if (a.id === "cerrar_en_rps") setCerrandoEnRps(true);
          else pedirConfirmacion(a);
        }}
```

- [ ] **Step 17: `Board.tsx` — `snapshotDe`, `mut`, `marcarCerradaEnRps` y excluir las cerradas de `facetsByLoc`**

Cambiar `snapshotDe`:

```ts
  const snapshotDe = (of: OF) => ({
    ofId: of.id,
    autorId: of.autorId,
    revisorId: of.revisorId,
    estado: of.estado,
    observacion: of.observacion ?? null,
    // Cada mutación manda el snapshot COMPLETO de la OF (ver el comentario de
    // guardarMutacion en estado-db.ts): sin esto, cualquier acción que NO sea
    // "volver a plantear" borraría la marca sin querer, al escribir `null` por
    // omisión.
    cerradaRps: of.cerradaRps ?? null,
  });
```

Cambiar la firma y el cuerpo de `mut`:

```ts
  const mut = useCallback(
    (
      ofIds: Set<string>,
      fn: (of: OF) => OF,
      motivo?: string,
      cortarFichajeDe?: string[],
      /** Ids que salen de `of_retenida` (los manda "volver_a_plantear"). */
      quitarRetenida?: string[],
    ) => {
      const cambios: ReturnType<typeof snapshotDe>[] = [];
      setPedidosSync((prev) =>
        prev.map((p) => ({
          ...p,
          ofs: p.ofs.map((of) => {
            if (!ofIds.has(of.id)) return of;
            const nueva = fn(of);
            if (motivo && nueva !== of) cambios.push(snapshotDe(nueva));
            return nueva;
          }),
        })),
      );
      if (motivo && cambios.length > 0)
        persistir({ motivo, cambiosOF: cambios, cortarFichajeDe, quitarRetenida });
    },
    [setPedidosSync, persistir],
  );
```

Añadir `quitarRetenida?: string[];` al tipo del parámetro `payload` de `persistir` (junto a `cortarFichajeDe?: string[];`); el `fetch` ya manda `JSON.stringify({ ...payload, … })`, así que no necesita más cambios.

En `ejecutarAccion`, cambiar la llamada a `mut(…)` para que pase `quitarRetenida` cuando la acción es `volver_a_plantear`:

```ts
      mut(
        new Set(aplicables),
        (of) => {
          try {
            return aplicarAccion(of, accion, obs);
          } catch {
            return of;
          }
        },
        accion,
        corta ? aplicables : undefined,
        accion === "volver_a_plantear" ? aplicables : undefined,
      );
```

Añadir, cerca de `completarPedidoAhora` (mismo bloque de handlers que se pasan al Drawer), el handler de «Dar por terminada en RPS» — NO usa `mut`/`persistir`, porque el servidor ya hizo todo el trabajo (Tarea 5) y esto solo refleja el resultado en pantalla, igual que `completarPedidoAhora` hace con `setPedidosSync` tras su propio `fetch`:

```ts
  // «Dar por terminada en RPS»: a diferencia de las demás acciones, el
  // servidor ya hizo TODO el trabajo (CerrarEnRpsInline llama a
  // /api/fases/cerrar-of directamente). Este handler solo refleja el
  // resultado en el tablero y suelta la OF de mi fichaje si la tenía abierta.
  const marcarCerradaEnRps = useCallback(
    (ofId: string, cerradaRps: NonNullable<OF["cerradaRps"]>) => {
      setPedidosSync((prev) =>
        prev.map((p) => ({
          ...p,
          ofs: p.ofs.map((of) => (of.id === ofId ? { ...of, estado: "aprobada", cerradaRps, fichandoRol: null } : of)),
        })),
      );
      soltarDeMiFichaje([ofId]);
    },
    [setPedidosSync, soltarDeMiFichaje],
  );
```

En `facetsByLoc`, dentro del bucle `for (const of of p.ofs) { … }`, añadir la exclusión junto a las dos que ya existen:

```ts
      for (const of of p.ofs) {
        if (of.estado === "anulada") continue;
        if (ofOcultaDeOT(of)) continue;
        // Cerrada en RPS: sale del reparto igual que una anulada — ya no es
        // trabajo por hacer, y se consulta en su cajón dentro de la ficha del
        // pedido (ver Drawer.tsx `grupoOculto`).
        if (of.cerradaRps) continue;
        const loc = of.autorId;
        …
```

Finalmente, en la invocación de `<Drawer … />`, añadir `onCerradoEnRps={marcarCerradaEnRps}` (junto a `onDesficharVarias={desficharVarias}`).

- [ ] **Step 18: Arreglar la prop nueva obligatoria en el test existente**

En `src/lib/__tests__/drawer-pasar.test.ts`, añadir `onCerradoEnRps: noop,` al objeto `props` (junto a `onDesficharVarias: noop`).

- [ ] **Step 19: Suite y tipos**

Run: `pnpm test && npx tsc --noEmit && pnpm lint`
Expected: todo en verde.

- [ ] **Step 20: Escribir el test de `Drawer` con una OF cerrada (falla)**

Crear `src/lib/__tests__/drawer-cerrada.test.ts`, siguiendo el patrón de `drawer-pasar.test.ts` (`renderToStaticMarkup`):

```ts
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, test } from "vitest";
import { Drawer } from "../../components/Drawer";
import { OPERARIOS, PEDIDOS } from "../mock";
import { SECCIONES } from "../secciones";

const noop = () => {};

test("una OF cerrada en RPS sale en su cajón, con el distintivo y sin las acciones normales de aprobada", () => {
  const pedido = {
    ...PEDIDOS[0], situacion: "procesado" as const,
    ofs: [
      { ...PEDIDOS[0].ofs[0], autorId: "ivan", revisorId: null, estado: "aprobada" as const, ajenaOT: false, detenida: false,
        cerradaRps: { at: "2026-09-15T11:42:00.000Z", por: "ivan", modo: "activo" as const } },
    ],
  };
  const props = {
    pedido, operarios: OPERARIOS, seccion: SECCIONES.ot, miId: "ivan",
    onClose: noop, onAssignPedido: noop, onCompletar: noop, onSetRevisor: noop,
    onTraspasarAutor: noop, onAccion: noop, onFichar: noop, onDesfichar: noop,
    onDesficharVarias: noop, onCerradoEnRps: noop,
  };
  const html = renderToStaticMarkup(createElement(Drawer, props));
  expect(html).toContain("Ver 1 cerrada en RPS");
  expect(html).toContain("Ninguna OF de este pedido es trabajo de");
  expect(html).not.toContain("Reabrir revisión");
  expect(html).not.toContain("Recuperar para corregir");
});
```

Run: `pnpm vitest run src/lib/__tests__/drawer-cerrada.test.ts`
Expected: FAIL si algo del cableado de los pasos 15-17 quedó incompleto; si los pasos anteriores están bien, puede pasar ya en este primer intento — en ese caso, el "fallo" que exige el TDD ya lo cubrieron los tests unitarios de los pasos 1-11, y este paso queda como RED→GREEN sobre la integración visual. Si pasa a la primera, seguir igualmente al Step 21 (no hay nada que "arreglar", pero el test se conserva como red de verdad).

- [ ] **Step 21: Ejecutar el test y verlo pasar**

Run: `pnpm vitest run src/lib/__tests__/drawer-cerrada.test.ts`
Expected: PASS.

- [ ] **Step 22: Suite completa, tipos y lint**

Run: `pnpm test && npx tsc --noEmit && pnpm lint`
Expected: todo en verde.

- [ ] **Step 23: Commit**

```bash
git add src/components/Drawer.tsx src/components/Board.tsx src/lib/__tests__/drawer-pasar.test.ts src/lib/__tests__/drawer-cerrada.test.ts
git commit -m "$(cat <<'EOF'
feat(fases): botón para dar por terminada una OF en RPS, con su cajón y «Volver a plantear»

Novedad: nuevo | Su autor puede dar por terminada una OF suelta en RPS antes de pasar el pedido entero, cuando Producción necesita esa operación antes que las demás. Queda apartada en un cajón de la ficha, con quién y cuándo, y se puede volver a plantear si hace falta.
EOF
)"
```

---

## Task 7: Recuperar un pedido del Historial — servidor

Sección 3 de la spec. Qué OF vuelven, con qué estado, y las dos rutas.

**Files:**
- Modify: `src/lib/server/rps.ts` (`fasesDeSeccionDelPedido`)
- Modify: `src/lib/server/historial-db.ts` (`leerEntregaPedido`)
- Create: `src/lib/server/recuperar-pedido.ts` (`ofsARecuperar`)
- Create: `src/app/api/historial/[pedido]/recuperar/route.ts` (GET + POST)
- Test: `src/lib/__tests__/recuperar-pedido.test.ts` (nuevo)
- Test: `src/lib/__tests__/api-historial-recuperar.test.ts` (nuevo)

**Interfaces:**
- Produces: `interface OfARecuperar { ofId: string; codigo: string; descripcion: string; autorId: string | null; fichable: boolean }` y `ofsARecuperar(pedido: string, seccionId: SeccionId): Promise<OfARecuperar[]>` (`src/lib/server/recuperar-pedido.ts`).
- Produces: `interface FaseDelPedido { of: string; fase: string; descripcion: string; fichable: boolean }` y `fasesDeSeccionDelPedido(pedido: string, seccion: Seccion): Promise<FaseDelPedido[]>` (`src/lib/server/rps.ts`).
- Produces: `leerEntregaPedido(pedido: string, seccion: SeccionId): Promise<{ pendienteEntrega: boolean; fechaEntregado: string | null }>` (`src/lib/server/historial-db.ts`).
- Produces: `GET /api/historial/[pedido]/recuperar?seccion=` → `{ ofs: OfARecuperar[]; entregado: boolean; fechaEntregado: string | null }`.
- Produces: `POST /api/historial/[pedido]/recuperar` con `{ seccion?, ofIds: string[] }` (las marcadas) → `{ ok: true, yaEstaba: boolean }` o `{ error }`.
- Consumes: `leerPedidosPasados`, `leerOverlay`, `guardarMutacion` (`Mutacion.ofRetenida`, Tarea 2), `leerOfsRetenidas`, `invalidarCacheTablero` (Tarea 4), `claveFase`/`permiteImputaciones` (ya existen en `rps.ts`).

- [ ] **Step 1: Escribir los tests de `fasesDeSeccionDelPedido` (falla)**

Crear `src/lib/__tests__/recuperar-pedido.test.ts`:

```ts
import { afterEach, beforeEach, expect, test, vi } from "vitest";

const query = vi.fn();
const input = vi.fn().mockReturnThis();
const request = vi.fn(() => ({ input, query }));
const getPool = vi.fn(async () => ({ request }));
vi.mock("../server/db", () => ({ getPool: () => getPool() }));

let rps: typeof import("../server/rps");

beforeEach(async () => {
  vi.clearAllMocks();
  vi.resetModules();
  rps = await import("../server/rps");
});
afterEach(() => vi.resetModules());

test("el parámetro del pedido va tipado VarChar(25)", async () => {
  query.mockResolvedValue({ recordset: [] });
  await rps.fasesDeSeccionDelPedido("AR.26.04351", rps.SECCIONES.ot);
  expect(input).toHaveBeenCalledWith("pedido", expect.objectContaining({ type: 2 /* sql.VarChar */ }), "AR.26.04351");
});

test("deduce fichable de PermiteImputaciones, y descarta filas sin OF o fase", async () => {
  query.mockResolvedValue({
    recordset: [
      { orden: "0232086 ", fase: " 9 ", descripcion: "FINALIZAR", SitOF: "LANZADA", PermiteImputaciones: null },
      { orden: "0232087", fase: "3", descripcion: "FINALIZADA", SitOF: "FINALIZADA", PermiteImputaciones: false },
      { orden: null, fase: "9", descripcion: "sin orden", SitOF: null, PermiteImputaciones: null },
    ],
  });
  const r = await rps.fasesDeSeccionDelPedido("AR.26.04351", rps.SECCIONES.ot);
  expect(r).toEqual([
    { of: "0232086", fase: "9", descripcion: "FINALIZAR", fichable: true },
    { of: "0232087", fase: "3", descripcion: "FINALIZADA", fichable: false },
  ]);
});
```

Run: `pnpm vitest run src/lib/__tests__/recuperar-pedido.test.ts`
Expected: FAIL — `fasesDeSeccionDelPedido` no existe (y `SECCIONES` no se reexporta de `rps.ts`; ver Step 2).

- [ ] **Step 2: `fasesDeSeccionDelPedido` en `src/lib/server/rps.ts`**

Añadir `import sql from "mssql";` a la cabecera de `src/lib/server/rps.ts` (junto al resto de imports; hoy este fichero construye sus listas `IN (…)` a partir de códigos ya saneados por regex, pero esta consulta es nueva y usa un parámetro de verdad). Reexportar `SECCIONES` para que el test pueda construirse una `Seccion`: añadir `export { SECCIONES } from "../secciones";` detrás de los imports (o, si ya se reexporta algo de `secciones.ts`, añadirlo a esa lista).

Detrás de `filasPorFase` (antes del comentario `/** De dónde sale la lista de trabajo de esta sección. … */` que empieza `filasDeLaSeccion`), añadir:

```ts
export interface FaseDelPedido {
  of: string;
  fase: string;
  descripcion: string;
  fichable: boolean;
}

/** Las tareas de una sección para las OF de un pedido, directamente de RPS,
 *  sin pasar por OLANET ni por el filtro de "pendiente". Es el `SELECT` de
 *  `filasPorFase` acotado por PEDIDO en vez de por lista de órdenes, y SIN su
 *  último filtro (el `quiero.has(...)` que deja solo lo pendiente): aquí se
 *  quiere TODO lo de la sección, esté o no al 100 %. El `JOIN` a
 *  `CPRMOResourceMachine` restringido a los recursos de la sección ya excluye
 *  el taller — no hace falta un filtro aparte.
 *
 *  Solo para cuando "Volver a plantear un pedido" (Tarea 8) no tiene
 *  `pedido_paso_seccion.of_ids` guardado: pedidos pasados antes de que
 *  existiera esa columna, o desde la herramienta vieja. Spec del 15/09/2026,
 *  sección 3, "Cómo". */
export async function fasesDeSeccionDelPedido(pedido: string, seccion: Seccion): Promise<FaseDelPedido[]> {
  const pool = await getPool();
  const r = await pool
    .request()
    .input("pedido", sql.VarChar(25), pedido)
    .query<{
      orden: string | null; fase: string | null; descripcion: string | null;
      SitOF: string | null; PermiteImputaciones: boolean | number | null;
    }>(`
      SELECT d.CodManufacturingOrder AS orden, e.CodMOTask AS fase, e.Description AS descripcion,
             sit.Description AS SitOF, sit.AllowImputations AS PermiteImputaciones
        FROM dbo.CPRMOTask e
        JOIN dbo.CPRManufacturingOrder d ON e.IDManufacturingOrder = d.IDManufacturingOrder
        JOIN dbo.CPRManufacturingOrderSituation sit ON d.IDMOSituation = sit.IDManufacturingOrderSituation
        JOIN dbo.CPRMOResourceMachine f ON e.IDMOTask = f.IDMOTask AND f.CodMOResourceMachine IN (${recursosSql(seccion)})
       WHERE d.CodCompany = '001' AND EXISTS (
         SELECT 1 FROM dbo.FACOrderLineSL l
         JOIN dbo.FACOrderSL o ON o.IDOrder = l.IDOrder AND o.CodCompany = '001'
         WHERE l.IDManufacturingOrder = d.IDManufacturingOrder AND o.CodOrder = @pedido)
    `);
  return r.recordset
    .map((f) => ({
      of: (f.orden ?? "").trim(),
      fase: (f.fase ?? "").trim(),
      descripcion: (f.descripcion ?? "").trim(),
      fichable: permiteImputaciones(f),
    }))
    .filter((f) => f.of !== "" && f.fase !== "");
}
```

- [ ] **Step 3: Ejecutar los tests y verlos pasar**

Run: `pnpm vitest run src/lib/__tests__/recuperar-pedido.test.ts`
Expected: PASS.

- [ ] **Step 4: `leerEntregaPedido` en `src/lib/server/historial-db.ts`**

Detrás de `leerHistorialPedidoDetalle` (después de su `return cabeceraADetalle(…)`), añadir:

```ts
/** Si un pedido sigue sin entregar y cuándo salió el último albarán, para la
 *  confirmación de "Volver a plantear el pedido" (Tarea 8): un pedido
 *  entregado se puede recuperar igual, pero la confirmación lo dice. Mismas
 *  CTE que `leerHistorialPedidoDetalle` usa para `finalizada`, acotadas a UN
 *  pedido — ver `ctesFinalizacionHistorial`. */
export async function leerEntregaPedido(
  pedido: string,
  seccion: SeccionId,
): Promise<{ pendienteEntrega: boolean; fechaEntregado: string | null }> {
  if (ES_MOCK) return { pendienteEntrega: true, fechaEntregado: null };
  const pool = await getPool();
  const fila = (
    await pool.request().input("pedido", pedido).input("pendientes", "<pedidos/>")
      .query<{ pendiente_entrega: number | null; fecha_entregado: Date | null }>(`
      ${ctesFinalizacionHistorial(seccion, "o.CodOrder=@pedido")}
      SELECT pendiente_entrega, fecha_entregado FROM PedFin;
      DROP TABLE #CoordinaHistorialOrdenes;
      DROP TABLE #CoordinaHistorialPedidos;
      DROP TABLE #CoordinaHistorialPendientes;
      DROP TABLE #CoordinaHistorialFinalizados;
    `)
  ).recordset[0];
  return {
    pendienteEntrega: fila ? fila.pendiente_entrega === 1 : true,
    fechaEntregado: fila?.fecha_entregado ? fila.fecha_entregado.toISOString().slice(0, 10) : null,
  };
}
```

(Sin test de SQL dedicado: reutiliza literalmente el mismo patrón de CTE que `leerHistorialPedidoDetalle`, ya cubierto por los tests de ese camino; esta función se verifica end-to-end en el Step 8.)

- [ ] **Step 5: Escribir los tests de `ofsARecuperar` (fallan)**

Añadir a `src/lib/__tests__/recuperar-pedido.test.ts`:

```ts
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

let dir: string;
let estadoDb: typeof import("../server/estado-db");
let recuperar: typeof import("../server/recuperar-pedido");

test.sequential("setup de BD temporal para ofsARecuperar", async () => {
  dir = mkdtempSync(path.join(tmpdir(), "coordina-recuperar-"));
  process.env.COORDINA_DB_PATH = path.join(dir, "test.db");
  estadoDb = await import("../server/estado-db");
});

test.sequential("con of_ids guardados, se usan esos y no se llama a RPS por el pedido entero", async () => {
  estadoDb.guardarMutacion({
    operarioId: "tamara", motivo: "completar", completarPedidoId: "AR.26.04351",
    seccion: "ot", ofIdsPedido: ["0232086:9", "0232087:9"],
  });
  query.mockResolvedValue({ recordset: [
    { orden: "0232086", fase: "9", descripcion: "Toldo cofre", SitOF: "LANZADA", PermiteImputaciones: true },
    { orden: "0232087", fase: "9", descripcion: "Pérgola", SitOF: "FINALIZADA", PermiteImputaciones: false },
  ] });
  recuperar = await import("../server/recuperar-pedido");
  const r = await recuperar.ofsARecuperar("AR.26.04351", "ot");
  expect(r).toEqual([
    { ofId: "0232086:9", codigo: "0232086", descripcion: "Toldo cofre", autorId: null, fichable: true },
    { ofId: "0232087:9", codigo: "0232087", descripcion: "Pérgola", autorId: null, fichable: false },
  ]);
});

test.sequential("sin of_ids guardados, salen las que traiga RPS para el pedido", async () => {
  query.mockResolvedValue({ recordset: [
    { orden: "0232200", fase: "2", descripcion: "Muestra", SitOF: "LANZADA", PermiteImputaciones: true },
  ] });
  const r = await recuperar.ofsARecuperar("AR.26.09999", "ot");
  expect(r).toEqual([{ ofId: "0232200:2", codigo: "0232200", descripcion: "Muestra", autorId: null, fichable: true }]);
});

test.sequential("el autor sale del overlay cuando hay fila", () => {
  estadoDb.guardarMutacion({
    operarioId: "ivan", motivo: "asignar",
    cambiosOF: [{ ofId: "0232086:9", autorId: "ivan", revisorId: null, estado: "aprobada", observacion: null }],
  });
});
test.sequential("…y se refleja en la siguiente llamada", async () => {
  query.mockResolvedValue({ recordset: [
    { orden: "0232086", fase: "9", descripcion: "Toldo cofre", SitOF: "LANZADA", PermiteImputaciones: true },
  ] });
  const r = await recuperar.ofsARecuperar("AR.26.04351", "ot");
  expect(r.find((o) => o.ofId === "0232086:9")?.autorId).toBe("ivan");
});

test.sequential("limpieza", () => {
  try { rmSync(dir, { recursive: true, force: true }); } catch { /* Windows/WAL: best effort */ }
});
```

(`test.sequential` porque comparten la misma BD y el mismo mock de `query`; si el runner de este repo ya corre los ficheros en serie por defecto, se pueden dejar como `test` normales — comprobar con `pnpm vitest run src/lib/__tests__/recuperar-pedido.test.ts` que no se solapan.)

Run: `pnpm vitest run src/lib/__tests__/recuperar-pedido.test.ts`
Expected: FALLAN los de `ofsARecuperar` — el fichero no existe.

- [ ] **Step 6: Crear `src/lib/server/recuperar-pedido.ts`**

```ts
import { leerOverlay, leerPedidosPasados } from "./estado-db";
import { claveFase, fasesDeSeccionDelPedido, SECCIONES } from "./rps";
import type { SeccionId } from "../secciones";

export interface OfARecuperar {
  ofId: string;
  codigo: string;
  descripcion: string;
  /** null = sin autor registrado; la confirmación dice "quedarás tú". */
  autorId: string | null;
  fichable: boolean;
}

/** Las OF de OT de un pedido que "Volver a plantear el pedido" puede reabrir.
 *  De `pedido_paso_seccion.of_ids` si se guardó al pasarlo (esa lista ya deja
 *  fuera anuladas, de taller y detenidas — ver `ofIdsPedido` en
 *  `api/estado/route.ts`); si no, de RPS directamente. Spec del 15/09/2026,
 *  sección 3, "Decisiones" ("Qué OF vuelven"). */
export async function ofsARecuperar(pedido: string, seccionId: SeccionId): Promise<OfARecuperar[]> {
  const seccion = SECCIONES[seccionId];
  const todasRps = await fasesDeSeccionDelPedido(pedido, seccion);
  const porClave = new Map(todasRps.map((f) => [claveFase(f.of, f.fase), f]));
  const overlay = leerOverlay(seccionId);
  const guardadas = leerPedidosPasados(seccionId).get(pedido)?.ofIds;

  const base = guardadas && guardadas.length > 0
    ? guardadas.map((ofId) => {
        const [of, fase] = ofId.split(":");
        const datos = porClave.get(claveFase(of, fase));
        return { ofId, codigo: of, descripcion: datos?.descripcion ?? "", fichable: datos?.fichable ?? false };
      })
    : todasRps.map((f) => ({ ofId: `${f.of}:${f.fase}`, codigo: f.of, descripcion: f.descripcion, fichable: f.fichable }));

  return base.map((of) => ({ ...of, autorId: overlay.ofs.get(of.ofId)?.autorId ?? null }));
}
```

- [ ] **Step 7: Ejecutar los tests y verlos pasar**

Run: `pnpm vitest run src/lib/__tests__/recuperar-pedido.test.ts`
Expected: PASS.

- [ ] **Step 8: Suite y tipos hasta aquí**

Run: `pnpm test && npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 9: Commit intermedio**

```bash
git add src/lib/server/rps.ts src/lib/server/historial-db.ts src/lib/server/recuperar-pedido.ts src/lib/__tests__/recuperar-pedido.test.ts
git commit -m "feat(historial): qué OF de un pedido puede reabrir «Volver a plantear», sin ruta todavía"
```

- [ ] **Step 10: Escribir los tests de las rutas (fallan)**

Crear `src/lib/__tests__/api-historial-recuperar.test.ts`:

```ts
import { afterAll, afterEach, beforeAll, beforeEach, expect, test, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const ofsARecuperar = vi.fn();
const leerEntregaPedido = vi.fn();
const invalidarCacheTablero = vi.fn();
vi.mock("@/lib/server/recuperar-pedido", () => ({ ofsARecuperar: (p: string, s: string) => ofsARecuperar(p, s) }));
vi.mock("@/lib/server/historial-db", () => ({ leerEntregaPedido: (p: string, s: string) => leerEntregaPedido(p, s) }));
vi.mock("@/lib/server/rps", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  invalidarCacheTablero: (s: string) => invalidarCacheTablero(s),
}));

let dir: string;
let ruta: typeof import("../../app/api/historial/[pedido]/recuperar/route");
let dataMod: typeof import("../data");
let estadoDb: typeof import("../server/estado-db");

const PEDIDO_FUERA_DEL_PANEL = { pedidos: [] as unknown[], operarios: [] };

beforeAll(async () => {
  dir = mkdtempSync(path.join(tmpdir(), "coordina-recuperar-ruta-"));
  process.env.COORDINA_DB_PATH = path.join(dir, "test.db");
  estadoDb = await import("../server/estado-db");
  dataMod = await import("../data");
});
afterAll(() => {
  try { rmSync(dir, { recursive: true, force: true }); } catch { /* Windows/WAL: best effort */ }
});

beforeEach(async () => {
  vi.clearAllMocks();
  estadoDb.getDb().exec("DELETE FROM of_overlay; DELETE FROM of_retenida; DELETE FROM pedido_paso_seccion;");
  vi.spyOn(dataMod, "getTablero").mockResolvedValue(PEDIDO_FUERA_DEL_PANEL as never);
  ofsARecuperar.mockResolvedValue([
    { ofId: "0232086:9", codigo: "0232086", descripcion: "Toldo cofre", autorId: "ivan", fichable: true },
    { ofId: "0232087:9", codigo: "0232087", descripcion: "Pérgola", autorId: null, fichable: true },
  ]);
  leerEntregaPedido.mockResolvedValue({ pendienteEntrega: false, fechaEntregado: "2026-09-12" });
  ruta = await import("../../app/api/historial/[pedido]/recuperar/route");
});
afterEach(() => vi.resetModules());

const get = (pedido: string) =>
  ruta.GET(new Request(`http://x/api/historial/${pedido}/recuperar`), { params: Promise.resolve({ pedido }) });
const post = (pedido: string, body: unknown) =>
  ruta.POST(new Request(`http://x/api/historial/${pedido}/recuperar`, { method: "POST", body: JSON.stringify(body) }), { params: Promise.resolve({ pedido }) });

test("GET devuelve las OF, si está entregado y desde cuándo", async () => {
  const res = await get("AR.26.04351");
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({
    ofs: [
      { ofId: "0232086:9", codigo: "0232086", descripcion: "Toldo cofre", autorId: "ivan", fichable: true },
      { ofId: "0232087:9", codigo: "0232087", descripcion: "Pérgola", autorId: null, fichable: true },
    ],
    entregado: true,
    fechaEntregado: "2026-09-12",
  });
});

test("POST: sin marcar ninguna es 400", async () => {
  const res = await post("AR.26.04351", { operarioId: "tamara", ofIds: [] });
  expect(res.status).toBe(400);
});

test("POST: una OF que no está en la lista real es 400", async () => {
  const res = await post("AR.26.04351", { operarioId: "tamara", ofIds: ["9999999:1"] });
  expect(res.status).toBe(400);
});

test("POST: si el pedido ya está en el panel (no completado), 409", async () => {
  vi.spyOn(dataMod, "getTablero").mockResolvedValue({
    operarios: [], pedidos: [{ id: "AR.26.04351", codigo: "AR.26.04351", situacion: "procesado", ofs: [] }],
  } as never);
  const res = await post("AR.26.04351", { operarioId: "tamara", ofIds: ["0232086:9"] });
  expect(res.status).toBe(409);
});

test("POST: recupera las marcadas en_curso (con autor propio o quien recupera) y deja aprobadas las demás", async () => {
  const res = await post("AR.26.04351", { operarioId: "tamara", ofIds: ["0232086:9"] });
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ ok: true, yaEstaba: false });

  const overlay = estadoDb.leerOverlay("ot");
  expect(overlay.ofs.get("0232086:9")).toEqual(expect.objectContaining({ estado: "en_curso", autorId: "ivan" }));
  expect(overlay.ofs.get("0232087:9")).toEqual(expect.objectContaining({ estado: "aprobada", autorId: null }));

  const retenidas = estadoDb.leerOfsRetenidas("ot");
  expect(retenidas.find((r) => r.ofId === "0232086:9")?.motivo).toBe("recuperada");
  expect(retenidas.find((r) => r.ofId === "0232087:9")?.motivo).toBe("del_pedido");
  expect(invalidarCacheTablero).toHaveBeenCalledWith("ot");
});

test("una OF SIN autor registrado que se marca queda a nombre de quien recupera", async () => {
  ofsARecuperar.mockResolvedValue([{ ofId: "0232087:9", codigo: "0232087", descripcion: "Pérgola", autorId: null, fichable: true }]);
  await post("AR.26.04351", { operarioId: "tamara", ofIds: ["0232087:9"] });
  expect(estadoDb.leerOverlay("ot").ofs.get("0232087:9")?.autorId).toBe("tamara");
});

test("recuperar dos veces contesta yaEstaba y no cambia nada la segunda vez", async () => {
  await post("AR.26.04351", { operarioId: "tamara", ofIds: ["0232086:9"] });
  const antes = estadoDb.leerOverlay("ot").ofs.get("0232086:9");
  const res = await post("AR.26.04351", { operarioId: "jaime", ofIds: ["0232087:9"] });
  expect(await res.json()).toEqual({ ok: true, yaEstaba: true });
  expect(estadoDb.leerOverlay("ot").ofs.get("0232086:9")).toEqual(antes);
});
```

Run: `pnpm vitest run src/lib/__tests__/api-historial-recuperar.test.ts`
Expected: FAIL — la ruta no existe.

- [ ] **Step 11: Crear la ruta**

Crear `src/app/api/historial/[pedido]/recuperar/route.ts`:

```ts
import { NextResponse } from "next/server";
import { CODIGO_PEDIDO_RE } from "@/lib/historial";
import { identidad, soloConSesion } from "@/lib/server/sesion";
import { seccionDe, esSeccionId } from "@/lib/secciones";
import { seccionDeOperario } from "@/lib/server/operarios";
import { ofsARecuperar } from "@/lib/server/recuperar-pedido";
import { leerEntregaPedido } from "@/lib/server/historial-db";
import { getTablero } from "@/lib/data";
import { aplicarOverlay } from "@/lib/server/overlay";
import { leerOverlay, leerOfsRetenidas, guardarMutacion } from "@/lib/server/estado-db";
import { invalidarCacheTablero } from "@/lib/server/rps";

// ─── /api/historial/[pedido]/recuperar ───────────────────────────────────────
// GET: prepara la confirmación de "Volver a plantear el pedido" — qué OF
// volverían, si RPS deja fichar en cada una, y si el pedido ya se entregó.
// POST: lo ejecuta. Sección 3 de la spec del 15/09/2026.

export const dynamic = "force-dynamic";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ pedido: string }> },
) {
  const corte = soloConSesion(req);
  if (corte) return corte;
  const { pedido } = await params;
  if (!CODIGO_PEDIDO_RE.test(pedido))
    return NextResponse.json({ error: "Código de pedido no válido" }, { status: 400 });

  try {
    const seccionId = seccionDe(new URL(req.url).searchParams.get("seccion")).id;
    const [ofs, entrega] = await Promise.all([
      ofsARecuperar(pedido, seccionId),
      leerEntregaPedido(pedido, seccionId),
    ]);
    return NextResponse.json(
      { ofs, entregado: !entrega.pendienteEntrega, fechaEntregado: entrega.fechaEntregado },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    console.error("[historial] preparar recuperar falló:", (e as Error).message);
    return NextResponse.json({ error: "No se puede consultar RPS ahora mismo. No se ha tocado nada." }, { status: 503 });
  }
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ pedido: string }> },
) {
  let cuerpo: unknown;
  try {
    cuerpo = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }
  if (typeof cuerpo !== "object" || cuerpo === null)
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  const b = cuerpo as Record<string, unknown>;

  const { pedido } = await params;
  if (!CODIGO_PEDIDO_RE.test(pedido))
    return NextResponse.json({ error: "Código de pedido no válido" }, { status: 400 });

  const yo = identidad(req, b.operarioId, "tecnico");
  if (yo instanceof NextResponse) return yo;
  const operarioId = yo.id;
  const seccionId = esSeccionId(b.seccion) ? b.seccion : seccionDeOperario(operarioId);
  const marcadas = new Set(
    Array.isArray(b.ofIds) ? b.ofIds.filter((x): x is string => typeof x === "string" && x.length > 0) : [],
  );

  try {
    // 2. Si ya está en el panel y no completado, no se toca nada. Si ya se
    //    había recuperado, se contesta igual sin volver a escribir.
    const base = await getTablero(seccionId);
    const tablero = aplicarOverlay(base, leerOverlay(seccionId));
    const enPanel = tablero.pedidos.find((p) => p.codigo === pedido);
    if (enPanel && enPanel.situacion !== "completado")
      return NextResponse.json({ error: "Este pedido ya está en el panel." }, { status: 409 });
    if (leerOfsRetenidas(seccionId).some((r) => r.pedido === pedido && r.motivo === "recuperada"))
      return NextResponse.json({ ok: true, yaEstaba: true });

    // 3. Las OF que vuelven, y que las marcadas estén entre ellas.
    const todas = await ofsARecuperar(pedido, seccionId);
    const idsValidos = new Set(todas.map((o) => o.ofId));
    if (marcadas.size === 0 || ![...marcadas].every((id) => idsValidos.has(id)))
      return NextResponse.json({ error: "Selección de OF no válida." }, { status: 400 });

    // 4. En una transacción: los cambios de estado (tabla de la spec §3) y las
    //    filas de of_retenida.
    const overlay = leerOverlay(seccionId);
    const ahora = new Date().toISOString();
    const cambiosOF = todas.map((of) => {
      const previa = overlay.ofs.get(of.ofId);
      const marcada = marcadas.has(of.ofId);
      return {
        ofId: of.ofId,
        autorId: marcada ? (previa?.autorId ?? operarioId) : (previa?.autorId ?? null),
        revisorId: previa?.revisorId ?? null,
        estado: (marcada ? "en_curso" : "aprobada") as const,
        observacion: previa?.observacion ?? null,
        // Recuperar deja SIEMPRE sin la marca de cerrada: si el pedido llegó
        // hasta aquí, ya se pasó (eso borró of_retenida de su sección) y
        // "cerrada en RPS" no tiene sentido sobre una OF que se va a
        // replantear.
        cerradaRps: null,
      };
    });
    const previosOF = todas
      .map((of) => overlay.ofs.get(of.ofId))
      .filter((x): x is NonNullable<typeof x> => x !== undefined);

    guardarMutacion({
      operarioId,
      motivo: "recuperar_pedido",
      seccion: seccionId,
      cambiosOF,
      previosOF,
      ofRetenida: todas.map((of) => ({
        ofId: of.ofId,
        pedido,
        por: operarioId,
        at: ahora,
        motivo: marcadas.has(of.ofId) ? ("recuperada" as const) : ("del_pedido" as const),
      })),
    });

    // 5. La consulta tarda de 7 a 15 s: se lanza el refresco sin esperarlo.
    invalidarCacheTablero(seccionId);

    return NextResponse.json({ ok: true, yaEstaba: false });
  } catch (e) {
    console.error("[historial] recuperar pedido falló:", (e as Error).message);
    return NextResponse.json({ error: "No se pudo recuperar el pedido." }, { status: 500 });
  }
}
```

- [ ] **Step 12: Ejecutar los tests y verlos pasar**

Run: `pnpm vitest run src/lib/__tests__/api-historial-recuperar.test.ts`
Expected: PASS.

- [ ] **Step 13: Suite completa, tipos y lint**

Run: `pnpm test && npx tsc --noEmit && pnpm lint`
Expected: todo en verde.

- [ ] **Step 14: Commit**

```bash
git add src/app/api/historial/\[pedido\]/recuperar/route.ts src/lib/__tests__/api-historial-recuperar.test.ts
git commit -m "feat(historial): rutas para volver a plantear un pedido, sin botón todavía"
```

(Sin línea `Novedad:`: la ruta existe pero nada la llama hasta la Tarea 8.)

---

## Task 8: Recuperar un pedido del Historial — interfaz

El botón «Volver a plantear el pedido» y su confirmación con casillas por OF. Sección 3 «Cómo se ve» de la spec.

**Files:**
- Create: `src/components/RecuperarPedido.tsx`
- Modify: `src/components/HistorialDrawer.tsx` (monta el botón junto a `FasesSinFinalizar`)
- Test: `src/lib/__tests__/historial-drawer-recuperar.test.ts` (nuevo, `renderToStaticMarkup` como `drawer-pasar.test.ts`)

**Interfaces:**
- Produces: `<RecuperarPedido pedido seccion miId operarios onRecuperado />` (`src/components/RecuperarPedido.tsx`).
- Consumes: `GET`/`POST /api/historial/[pedido]/recuperar` (Tarea 7), `ConfirmDialog` (ya existe), `fmtDiaMesAno` (`src/lib/fechas.ts`, ya existe).

- [ ] **Step 1: Escribir el test de render (falla)**

Crear `src/lib/__tests__/historial-drawer-recuperar.test.ts`:

```ts
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, test } from "vitest";
import { HistorialDrawer } from "../../components/HistorialDrawer";
import { OPERARIOS } from "../mock";

const noop = () => {};

test("el botón de volver a plantear sale en la ficha del Historial", () => {
  const html = renderToStaticMarkup(
    createElement(HistorialDrawer, { pedido: "AR.26.04351", onClose: noop, operarios: OPERARIOS, miId: "ivan" }),
  );
  expect(html).toContain("Volver a plantear el pedido");
});
```

Run: `pnpm vitest run src/lib/__tests__/historial-drawer-recuperar.test.ts`
Expected: FAIL — el botón no existe todavía (el componente `RecuperarPedido` tampoco).

- [ ] **Step 2: Crear `src/components/RecuperarPedido.tsx`**

```tsx
"use client";

import { useState } from "react";
import type { Operario } from "@/lib/types";
import { fmtDiaMesAno } from "@/lib/fechas";
import { ConfirmDialog } from "./ConfirmDialog";

// ─── "Volver a plantear el pedido" ───────────────────────────────────────────
// Sección 3 de la spec del 15/09/2026. Vuelve el pedido ENTERO; qué OF se
// reabren se elige aquí, con TODAS marcadas por defecto — es lo que se
// entiende por "recuperar el pedido", y quien sabe cuál hay que corregir
// desmarca el resto.

interface OfARecuperar {
  ofId: string;
  codigo: string;
  descripcion: string;
  autorId: string | null;
  fichable: boolean;
}

interface RespuestaRecuperar {
  ofs: OfARecuperar[];
  entregado: boolean;
  fechaEntregado: string | null;
}

export function RecuperarPedido({
  pedido,
  seccion,
  miId,
  operarios,
  onRecuperado,
}: {
  pedido: string;
  seccion: string;
  miId: string | null;
  operarios: readonly Operario[];
  /** El servidor ya recuperó el pedido: la ficha se cierra y el panel lo
   *  enseñará en cuanto se refresque (la consulta tarda de 7 a 15 s, así que
   *  no hay nada que esperar aquí). */
  onRecuperado: () => void;
}) {
  const [abierto, setAbierto] = useState(false);
  const [cargando, setCargando] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [datos, setDatos] = useState<RespuestaRecuperar | null>(null);
  const [marcadas, setMarcadas] = useState<Set<string>>(new Set());

  async function abrir() {
    setError(null);
    setCargando(true);
    try {
      const r = await fetch(`/api/historial/${pedido}/recuperar?seccion=${seccion}`, { cache: "no-store" });
      if (!r.ok) throw new Error(String(r.status));
      const d = (await r.json()) as RespuestaRecuperar;
      setDatos(d);
      setMarcadas(new Set(d.ofs.map((o) => o.ofId))); // todas marcadas por defecto
      setAbierto(true);
    } catch {
      setError("No se puede consultar RPS ahora mismo. No se ha tocado nada.");
    } finally {
      setCargando(false);
    }
  }

  function alternar(ofId: string) {
    setMarcadas((prev) => {
      const s = new Set(prev);
      if (!s.delete(ofId)) s.add(ofId);
      return s;
    });
  }

  async function confirmar() {
    if (marcadas.size === 0) {
      setError("Marca al menos una OF para volver a plantear el pedido.");
      return;
    }
    setEnviando(true);
    setError(null);
    try {
      const r = await fetch(`/api/historial/${pedido}/recuperar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ofIds: [...marcadas], seccion, operarioId: miId }),
      });
      const d = (await r.json().catch(() => null)) as { ok?: true; error?: string } | null;
      if (!r.ok || !d?.ok) {
        setError(d?.error ?? "No se ha podido recuperar el pedido.");
        return;
      }
      setAbierto(false);
      onRecuperado();
    } catch {
      setError("No se ha podido recuperar el pedido. Comprueba la conexión.");
    } finally {
      setEnviando(false);
    }
  }

  const nombreDe = (id: string | null) => (id ? (operarios.find((o) => o.id === id)?.nombre ?? id) : null);

  return (
    <div className="mb-3">
      <button
        type="button"
        onClick={() => void abrir()}
        disabled={cargando}
        className="rounded-lg border border-border px-2.5 py-1 text-xs font-semibold text-text-muted hover:border-border-strong hover:text-text disabled:opacity-50"
      >
        {cargando ? "Consultando…" : "Volver a plantear el pedido"}
      </button>
      {error && !abierto && (
        <p className="mt-1.5 text-[11px] text-red-600 dark:text-red-400" role="alert">
          {error}
        </p>
      )}
      <ConfirmDialog
        abierto={abierto && datos !== null}
        titulo={`Volver a plantear ${pedido}`}
        tono="primaria"
        mensaje={
          datos && (
            <div className="space-y-2">
              {datos.entregado && (
                <p>
                  Este pedido ya se entregó al cliente
                  {datos.fechaEntregado ? ` el ${fmtDiaMesAno(datos.fechaEntregado)}` : ""}.
                </p>
              )}
              <p>
                El pedido vuelve al panel y las OF marcadas vuelven a planteando, con su autor y su
                revisor de antes. Las demás vuelven aprobadas, para que se vea el pedido entero.
              </p>
              <ul className="space-y-1.5">
                {datos.ofs.map((o) => (
                  <li key={o.ofId}>
                    <label className="flex items-start gap-1.5">
                      <input
                        type="checkbox"
                        checked={marcadas.has(o.ofId)}
                        onChange={() => alternar(o.ofId)}
                        className="mt-0.5"
                      />
                      <span>
                        <span className="font-mono font-semibold text-text">{o.codigo}</span> —{" "}
                        {o.descripcion || "(sin descripción)"}, {nombreDe(o.autorId) ?? "sin autor: quedarás tú"}
                        {!o.fichable && (
                          <span className="mt-0.5 block text-amber-700 dark:text-amber-400">
                            RPS no deja fichar en esta OF (FINALIZADA). Si hay que echarle tiempo, pide a
                            Producción que la vuelva a lanzar.
                          </span>
                        )}
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
              <p>
                En RPS siguen terminadas. En cuanto alguien fiche en una, Producción la verá empezada
                hasta que se vuelva a pasar el pedido.
              </p>
              {error && (
                <p className="text-red-600 dark:text-red-400" role="alert">
                  {error}
                </p>
              )}
            </div>
          )
        }
        onConfirmar={() => void confirmar()}
        onCancelar={() => setAbierto(false)}
      />
    </div>
  );
}
```

(`enviando` no deshabilita nada del `ConfirmDialog` —no admite un `disabled` por fuera—, pero un doble clic en "Confirmar" es inofensivo: la ruta es idempotente, `yaEstaba` responde igual la segunda vez.)

- [ ] **Step 3: Montarlo en `HistorialDrawer`**

En `src/components/HistorialDrawer.tsx`, añadir el import: `import { RecuperarPedido } from "./RecuperarPedido";`.

Sustituir el bloque:

```tsx
          {!detalle.estadoActual && <FasesSinFinalizar ofs={[...new Set(detalle.ofs.map((o) => o.codigo))]} miId={miId} seccion={SECCIONES[seccion]} />}
```

por:

```tsx
          {!detalle.estadoActual && (
            <>
              <FasesSinFinalizar ofs={[...new Set(detalle.ofs.map((o) => o.codigo))]} miId={miId} seccion={SECCIONES[seccion]} />
              <RecuperarPedido pedido={pedido} seccion={seccion} miId={miId} operarios={operarios} onRecuperado={onClose} />
            </>
          )}
```

- [ ] **Step 4: Ejecutar el test y verlo pasar**

Run: `pnpm vitest run src/lib/__tests__/historial-drawer-recuperar.test.ts`
Expected: PASS.

- [ ] **Step 5: Suite completa, tipos y lint**

Run: `pnpm test && npx tsc --noEmit && pnpm lint`
Expected: todo en verde.

- [ ] **Step 6: Commit**

```bash
git add src/components/RecuperarPedido.tsx src/components/HistorialDrawer.tsx src/lib/__tests__/historial-drawer-recuperar.test.ts
git commit -m "$(cat <<'EOF'
feat(historial): botón para volver a plantear un pedido entero desde el Historial

Novedad: nuevo | Un pedido que ya salió del panel se puede volver a plantear desde su ficha del Historial, eligiendo qué OF se reabren. El pedido entero vuelve, y en RPS sigue terminado hasta que alguien fiche.
EOF
)"
```

---

## Task 9: Verificación final y ensayo manual (sin ejecutarlo)

Cierra el plan: suite completa, cobertura contra «Qué se prueba» de la spec, y el guion del ensayo contra OLANET real — escrito, con su candado de variables de entorno, pero **NUNCA ejecutado por un agente**. Solo Iván, a mano, tras avisar a David/IT.

**Files:**
- Create: `scripts/ensayo-cerrar-fase-muerta.test.ts` (guion del ensayo manual; opt-in por variables de entorno, no corre en `pnpm test`)
- Modify: `docs/despliegue-login.md` o el `MANUAL-IT.md` que ya documenta el interruptor `FICHAJE_OLANET` (añadir la referencia al ensayo nuevo, si ese fichero existe; si no, dejar constancia en el propio script)

**Interfaces:**
- Consumes: `finalizarFase` (Tarea 3, `src/lib/server/olanet.ts`), `esFaseDeLaWeb` (`src/lib/secciones.ts`).

- [ ] **Step 1: Suite completa**

Run: `pnpm test`
Expected: todo en verde, incluidos los ficheros nuevos de las Tareas 1-8 y los seis casos de `api-fases.test.ts` que comprueban que no se escribe (spec, «Qué se prueba», «Dar por terminada en RPS»).

- [ ] **Step 2: Tipos y lint**

Run: `npx tsc --noEmit && pnpm lint`
Expected: sin errores ni avisos.

- [ ] **Step 3: Repasar «Qué se prueba» de la spec, sección por sección**

Comprobar, marcando cada punto contra el fichero de test que lo cubre (no hay código que escribir en este paso; es una revisión):

- **Material gastado**: neto con devolución parcial / entero no sale / negativo con signo → `historial-db-gastado.test.ts` (Step 4 de la Tarea 1, vía el `HAVING` y el mapeo). Sin salidas → `MaterialGastado` en `HistorialCentros.tsx` (Tarea 1, Step 12; sin test dedicado del mensaje — si se quiere una red explícita, añadir un test de snapshot del componente con `lineas: []`). Botón sin material asignado → sale siempre (Tarea 1, Step 12). Sin coste → `historial-db-gastado.test.ts` (`not.toMatch(/CostAmountReal/)`). Sin sesión → pendiente de test explícito: añadir a `api-historial-gastado.test.ts` un caso con `soloConSesion` devolviendo 401, mockeado a `() => NextResponse.json({...}, {status:401})`, si se quiere la cobertura literal (la ruta ya delega en `soloConSesion`, que tiene sus propios tests). `VarChar(25)` → `historial-db-gastado.test.ts`.
- **Dar por terminada en RPS**: autor/otro técnico → `api-fases-cerrar-of.test.ts`. Detenida/por_revisar/en_revision/ya marcada/última que queda → `acciones.test.ts` (los cuatro primeros) + `api-fases-cerrar-of.test.ts` (detenida y última que queda, con el servidor). Corte antes del 3 → `api-fases-cerrar-of.test.ts` ("el corte del fichaje va ANTES que el 3"). Tramo que no entra → mismo test. Sombra/ensayo → `api-fases-cerrar-of.test.ts` + `api-fases.test.ts` (arrastre). yaEstaba → `api-fases-cerrar-of.test.ts`. Trampa 2/02 → `api-fases-cerrar-of.test.ts`. Pasar un pedido con una cerrada en activo/ensayo → **hueco**: no hay test que compruebe que `encolarFinalizacion`/`ofIdsPedido` tratan distinto una OF `cerradaRps.modo === "activo"` de una en `"ensayo"` al pasar el pedido — la spec lo pide en la sección 2 ("Al pasar el pedido no se reenvía el cierre") pero **este plan no ha tocado `api/estado/route.ts` para ese filtro**: ver el Step 4 de este mismo Task para cerrarlo antes de dar la Tarea por completa. Volver a plantear → `acciones.test.ts` + `estado-db-retenida.test.ts`. Candado de la cola → `olanet-worker.test.ts`. OF cerrada sigue en el tablero → cubierto por diseño (`filasDeLaSeccion`, Tarea 4) pero sin test de integración con mssql real (ver el Step 6 de la Tarea 4).
- **Recuperar un pedido**: sale en el tablero con `reabiertoPor` → cubierto por `overlay.test.ts` (comportamiento ya existente de `aplicarOverlay`; no hay test NUEVO en este plan que junte "vista sin ninguna tarea del pedido" + `ofsARecuperar`, porque `ofsARecuperar` no toca el overlay de reapertura — es `aplicarOverlay`, ya probado, el que decide `reabiertoPor` a partir de que la OF esté `pendienteDeOT`). Marcadas en_curso con autor/revisor de antes → `api-historial-recuperar.test.ts`. Sin `of_ids` guardados → `recuperar-pedido.test.ts`. Entregado se recupera igual → `RecuperarPedido.tsx` (Tarea 8, sin test dedicado del texto — cubierto visualmente por `historial-drawer-recuperar.test.ts` solo para el botón, no para el aviso de entrega). FINALIZADA se recupera con aviso → mismo hueco. Recuperar dos veces / pedido en el panel → `api-historial-recuperar.test.ts`. No escribe en OLANET → cierto por construcción (la ruta no importa `server/olanet` en ningún punto). Al pasar, solo el 3 de las `recuperada` → **mismo hueco que arriba**, depende del Step 4 de este Task.

- [ ] **Step 4: Cerrar el hueco — al pasar el pedido, solo se encola el 3 de lo que corresponde**

Esto lo pedía la spec en las dos secciones («Al pasar el pedido no se reenvía el cierre» / «Al pasar el pedido» de la sección 3) y quedó pendiente de las Tareas 6 y 8: `POST /api/estado` (`api/estado/route.ts`) calcula `ofIdsPedido` y llama a `encolarFinalizacion(ofIdsPedido, operarioId)` con la lista COMPLETA de OF no anuladas/ajenas/detenidas — sin quitar las `cerradaRps.modo === "activo"` ni las `del_pedido`.

Escribir el test primero, añadiendo a `src/lib/__tests__/api-estado.test.ts`:

```ts
test("al pasar el pedido no se reencola el 3 de una OF ya cerrada en activo, pero sí la de una cerrada en ensayo", async () => {
  // Preparar el overlay: una OF cerrada en activo, otra en ensayo, las dos
  // aprobadas y listas para pasar.
  db.guardarMutacion({
    operarioId: "ivan", motivo: "cerrar_en_rps", seccion: "ot",
    cambiosOF: [
      { ofId: "0232086:9", autorId: "ivan", revisorId: null, estado: "aprobada", observacion: null, cerradaRps: { at: "x", por: "ivan", modo: "activo" } },
      { ofId: "0232087:9", autorId: "ivan", revisorId: null, estado: "aprobada", observacion: null, cerradaRps: { at: "x", por: "ivan", modo: "ensayo" } },
    ],
  });
  // … completar con el resto del montaje que ya use este fichero para
  // simular el pedido listo y llamar a POST /api/estado con completarPedidoId,
  // y comprobar (con encolarFinalizacion mockeado, o leyendo la cola con
  // BD temporal) que solo se encola la fase de "0232087:9".
});
```

(El test exacto depende de cómo `api-estado.test.ts` ya mockee `encolarFinalizacion`/`getTablero` — seguir su patrón existente en vez de inventar uno nuevo; si el fichero usa mocks de módulo, comprobar `encolarFinalizacion` con la lista filtrada; si usa BD temporal + `getTablero` real mockeado, comprobar `leerCola()`.)

Run el test correspondiente y comprobar que FALLA.

En `src/app/api/estado/route.ts`, cambiar el bloque final de `POST`:

```ts
  if (completarPedidoId) {
    // No se reenvía el 3 de las OF ya cerradas EN ACTIVO desde el tablero
    // (Tarea 6): su fase ya está en 3, y `enviarUno` ya evita repetirlo, pero
    // evitarlo aquí ahorra el viaje y dice la intención. Las cerradas en
    // sombra/ensayo SÍ mandan su 3 al pasar: nunca llegó a escribirse.
    const tablero = aplicarOverlay(await getTablero(seccion), leerOverlay(seccion));
    const pedidoActual = tablero.pedidos.find((p) => p.id === completarPedidoId);
    const yaCerradasEnActivo = new Set(
      (pedidoActual?.ofs ?? [])
        .filter((of) => of.cerradaRps?.modo === "activo")
        .map((of) => of.id),
    );
    encolarFinalizacion((ofIdsPedido ?? []).filter((id) => !yaCerradasEnActivo.has(id)), operarioId);
  }
```

Y, en el mismo bloque de `guardarMutacion({ … })` de más arriba (el que ya existe, antes de este `if`), no cambia nada: `ofIdsPedido` sigue incluyendo TODAS las OF no anuladas/ajenas/detenidas — es lo que mantiene `reabiertoPor` funcionando (`overlay.ts:101-108`) y lo que deja constancia en `pedido_paso_seccion.of_ids` para que la Tarea 7 sepa qué OF recuperar la próxima vez.

Import nuevo en la cabecera del fichero: `aplicarOverlay` y `leerOverlay` ya están importados; no hace falta nada más.

Run el test del principio de este Step y comprobar que PASA.

Run: `pnpm test && npx tsc --noEmit`
Expected: todo en verde.

Commit:

```bash
git add src/app/api/estado/route.ts src/lib/__tests__/api-estado.test.ts
git commit -m "$(cat <<'EOF'
fix(estado): al pasar un pedido no se reenvía el cierre de una OF ya cerrada en RPS

Novedad: arreglado | Pasar a Producción un pedido con una OF ya dada por terminada en RPS podía dejar un segundo apunte en el histórico de la fábrica. Las cerradas de verdad ya no se reenvían; las que se cerraron en modo de pruebas sí mandan su cierre, porque nunca llegó a escribirse.
EOF
)"
```

- [ ] **Step 5: El guion del ensayo manual — escribirlo, sin ejecutarlo**

Crear `scripts/ensayo-cerrar-fase-muerta.test.ts`:

```ts
import { afterAll, expect, test } from "vitest";
import sql from "mssql";
import { getPoolOlanet } from "../src/lib/server/db";
import { finalizarFase } from "../src/lib/server/olanet";
import { esFaseDeLaWeb } from "../src/lib/secciones";

// ─── ENSAYO MANUAL contra OLANET real — NO LO EJECUTA NINGÚN AGENTE ─────────
// Sección 2 de la spec del 15/09/2026, "Ensayo antes de producción", punto 4:
// no hay forma neutra de escribir un 3 (R4 del informe finalizar-of-olanet.md),
// así que el último escalón antes de producción es cerrar una operación YA
// MUERTA — de las de arrastre 2020-2024, casi todas de urgencias (U-A-OTEC) y
// en pedidos entregados hace años — con la MISMA función que usan las dos
// rutas (`finalizarFase`, Tarea 3). Esto NO prueba el botón ni el corte del
// fichaje: esas operaciones no están en el tablero, no tienen autor y nadie
// las ficha. Lo que prueba es que `finalizarFase` escribe UN solo movimiento
// a 3 y que la segunda llamada no repite nada.
//
// ANTES DE EJECUTARLO, IVÁN A MANO:
//  1. Avisar a David/IT, como se hizo con el primer 3 del fichaje.
//  2. Elegir una fase muerta de verdad, por ejemplo con:
//       SELECT TOP 5 IdBoletin, Orden, Fase, MaquinaTeo, IdEstadoOF
//         FROM scg_Fases
//        WHERE MaquinaTeo LIKE '%OTEC%' AND IdEstadoOF IN (0, 1, 2)
//        ORDER BY IdBoletin
//     y comprobar en RPS que esa Orden es de un pedido entregado hace años.
//  3. Ejecutar, con las cuatro variables rellenas y NUNCA en CI:
//       ENSAYO_CERRAR_FASE_MUERTA=1 ENSAYO_ID_BOLETIN=<IdBoletin> \
//       ENSAYO_OF=<Orden> ENSAYO_FASE=<Fase> ENSAYO_OPERARIO_RPS=<código> \
//       node --env-file=.env.local node_modules/vitest/vitest.mjs run scripts/ensayo-cerrar-fase-muerta.test.ts
//  4. Comprobar a mano en `scg_Fases`/`sch_FasesMov` que solo hay UN
//     movimiento a 3, con la fecha de hoy y el operario correcto.

const ACTIVO = process.env.ENSAYO_CERRAR_FASE_MUERTA === "1";

afterAll(async () => {
  if (!ACTIVO) return;
  await (await getPoolOlanet()).close();
});

test.skipIf(!ACTIVO)(
  "cierra una fase muerta de verdad, y la segunda llamada no repite el movimiento",
  async () => {
    const idBoletin = process.env.ENSAYO_ID_BOLETIN;
    const of = process.env.ENSAYO_OF;
    const fase = process.env.ENSAYO_FASE;
    const operarioRps = process.env.ENSAYO_OPERARIO_RPS;
    if (!idBoletin || !of || !fase || !operarioRps) {
      throw new Error("Faltan ENSAYO_ID_BOLETIN / ENSAYO_OF / ENSAYO_FASE / ENSAYO_OPERARIO_RPS");
    }

    const r1 = await finalizarFase({ idBoletin, of, fase, esNuestra: esFaseDeLaWeb, operarioRps, cuando: new Date() });
    expect(r1.ok).toBe(true);
    if (r1.ok) expect(r1.yaEstaba).toBe(false);

    // Idempotente: la segunda llamada no debe dejar un segundo apunte.
    const r2 = await finalizarFase({ idBoletin, of, fase, esNuestra: esFaseDeLaWeb, operarioRps, cuando: new Date() });
    expect(r2.ok).toBe(true);
    if (r2.ok) expect(r2.yaEstaba).toBe(true);

    const pool = await getPoolOlanet();
    const movs = await pool
      .request()
      .input("idBoletin", sql.BigInt, idBoletin)
      .query<{ n: number }>("SELECT COUNT(*) AS n FROM sch_FasesMov WHERE IdBoletin = @idBoletin AND IdEstadoOF = 3");
    expect(movs.recordset[0].n).toBe(1);
  },
  60_000,
);
```

Este script **NO se ejecuta como parte de este plan**. `pnpm test` no lo toca (el `skipIf` lo salta siempre que falte `ENSAYO_CERRAR_FASE_MUERTA=1`, que nunca está puesta en CI ni en desarrollo normal). Queda listo para que Iván lo dispare a mano cuando avise a David/IT.

- [ ] **Step 6: Commit del guion**

```bash
git add scripts/ensayo-cerrar-fase-muerta.test.ts
git commit -m "docs(fases): guion del ensayo manual contra OLANET real, para ejecutar a mano"
```

- [ ] **Step 7: Última pasada**

Run: `pnpm test && npx tsc --noEmit && pnpm lint`
Expected: todo en verde. Confirmar también, si el repo lo tiene configurado, que `pnpm novedades --ver` recoge las seis líneas `Novedad:` de este plan (Tareas 1, 3, 6, 8, 9 y el fix del Step 4 de esta Tarea) sin errores de formato.

---

## Resumen de lo que queda MANUAL (ninguna tarea de este plan lo ejecuta)

1. **El ensayo contra OLANET real** (Task 9, Step 5): Iván, a mano, con David/IT avisados, contra una fase muerta de las de arrastre 2020-2024.
2. **El primer uso real del botón** «Dar por terminada en RPS» sobre una OF viva del tablero, en producción, con el fichaje en `activo`: es la spec la que dice que este es "ya real" y no necesita un ensayo aparte, porque el orden corte→drenado→3, los permisos y el efecto de pasar el pedido ya los cubren los tests (Tareas 3, 5 y 6) y el ensayo del Step 5.
3. **Encender `FICHAJE_OLANET=activo`** en producción, si todavía no lo está: fuera del alcance de este plan (es el interruptor general del fichaje, no algo que esta spec active o desactive).

