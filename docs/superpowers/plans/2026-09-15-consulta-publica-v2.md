# Consulta sin login v2 — plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rehacer la pantalla del invitado según `docs/superpowers/specs/2026-09-15-consulta-publica-v2-design.md`: una pestaña «Pedidos» (buscador arriba, filtros, tarjetas por día, dónde está y quién lo tiene) y «Consultas con OT» sin cambios.

**Architecture:** El índice en memoria (`server/historial-indice.ts`) gana dos datos por pedido —`trabajoAbierto` (regla FINALIZAR, por OF) y `fechaEntregado` (último albarán)—. La lista se filtra en memoria con funciones puras (`lib/consulta.ts`); para las 40 filas visibles se piden a RPS las tareas y a OLANET el último movimiento de cada una (`lib/consulta-donde.ts` decide dónde está). El detalle es la ficha del equipo recortada en el servidor (`detalleConsulta`, `lib/publico.ts`) y se pinta con `HistorialCentros`, sacado a su propio fichero.

**Tech Stack:** Next.js 16 (App Router), React, TypeScript, mssql, Vitest, Tailwind.

## Global Constraints

- Rama `consulta-publica`. Antes de tocar rutas o `app/`, leer la guía de `node_modules/next/dist/docs/` (AGENTS.md).
- **Nada se escribe en RPS ni en OLANET.** Solo lecturas; en los tests de base de datos, solo tablas `#temporales`.
- Parámetros SQL tipados: OLANET `Orden` → `sql.VarChar(20)`, `IdBoletin` → `sql.BigInt`; RPS `CodOrder` → `sql.VarChar(25)`.
- Pendiente = SIN ENTREGAR (`PendingDelivery`). Entregado = rematado, tenga las tareas que tenga.
- Le queda trabajo (por OF): FINALIZAR cerrada → no; FINALIZAR abierta → sí; sin FINALIZAR → si alguna tarea con centro sin cerrar. El pedido tiene trabajo si alguna OF lo tiene. FINALIZAR = centro cuyo nombre contiene `FINALIZ` o tarea cuyo texto contiene `FINALIZ`.
- La regla `pendienteTotal` y el Historial del equipo NO cambian.
- Recorte SIEMPRE en el servidor. El invitado nunca recibe: notas del pedido, notas de devolución, causas de rechazo, marcas de revisión, métricas, `notasProduccion`, `comentarioVenta`, `prioridad`, `estadoActual`, `scanUrl`. Sí recibe nombres, tiempos y roles planteó/revisó.
- Próximas entregas = sin entregar con entrega entre hoy y hoy + 14 días, ambos incluidos. Páginas de 40.
- Si OLANET no contesta, la lista y la ficha cargan igual, sin nombres.
- Commits sin línea `Novedad:`: la consulta se despliega apagada (`COORDINA_LOGIN`) y el equipo no ve nada de esto.
- Comentarios en castellano, explicando el porqué, con la densidad del código de alrededor.
- Verificación: `pnpm test`, `npx tsc --noEmit`, `pnpm lint`. Tests contra RPS real: `VALIDAR_RPS_UI=1 node --env-file=.env.local node_modules/vitest/vitest.mjs run <fichero>`.
- Antes de levantar el servidor de desarrollo, matar lo que haya en los puertos 3000 y 3001.

---
### Task 1: El índice sabe si queda trabajo y cuándo salió

**Files:**
- Modify: `src/lib/server/historial-finalizacion-sql.ts` (CTEs `Centros`→`Tareas`→`ResumenOF`→`ResumenPedido`→`PedFin`)
- Modify: `src/lib/historial-indice.ts` (`BaseHistorial`)
- Modify: `src/lib/server/historial-indice.ts` (`FilaBase`, `baseDe`)
- Modify: `src/lib/__tests__/historial-indice.test.ts:11-22`, `src/lib/__tests__/historial-indice-entrega.test.ts:8-18`, `src/lib/__tests__/publico.test.ts:17-27` (literales de `BaseHistorial`)
- Rewrite: `scripts/verificar-historial-centros.test.ts`
- Create: `scripts/medir-indice-consulta.test.ts`

**Interfaces:**
- Produces: `BaseHistorial.trabajoAbierto: boolean` y `BaseHistorial.fechaEntregado: number | null` (ms). Columnas SQL `PedFin.trabajo_abierto` (0/1) y `PedFin.fecha_entregado` (datetime).

- [ ] **Step 1: Reescribir el test contra RPS con los casos nuevos (falla)**

Sustituir `scripts/verificar-historial-centros.test.ts` entero por:

```ts
import { afterAll, expect, test } from "vitest";
import { getPool } from "../src/lib/server/db";
import { ctesFinalizacionHistorial } from "../src/lib/server/historial-finalizacion-sql";

// ─── La consulta de cierre contra RPS real, con tablas temporales ───────────
// Se ejecuta el SQL REAL de ctesFinalizacionHistorial sustituyendo dbo.X por
// #UI_X y metiendo filas de prueba: un expect(sql).toContain(...) no puede
// fallar por un error de lógica, esto sí.
//
// Ninguna tabla de producción se toca: conexión de solo lectura y tablas
// #temporales de la sesión. Se tiran al principio de cada caso porque el pool
// reutiliza la conexión entre tests.
//
// Opt-in: VALIDAR_RPS_UI=1 node --env-file=.env.local node_modules/vitest/vitest.mjs
// run scripts/verificar-historial-centros.test.ts

const ACTIVO = process.env.VALIDAR_RPS_UI === "1";

afterAll(async () => {
  if (!ACTIVO) return;
  await (await getPool()).close();
});

const TABLAS = {
  CPRMOResourceMachine: "IDMOTask int, CodMOResourceMachine nvarchar(20), Description nvarchar(80)",
  tgm_estadosof_olanet: "orden nvarchar(20), fase nvarchar(20), idestadoof int, fecha_cambio datetime2",
  CPRManufacturingOrder: "IDManufacturingOrder int, CodManufacturingOrder nvarchar(20), CodCompany nvarchar(3)",
  CPRMOTask: "IDManufacturingOrder int, IDMOTask int, CodMOTask nvarchar(20), Description nvarchar(80), PercentProgress int, RealEndDate datetime2",
  FACOrderSL: "IDOrder int, CodOrder nvarchar(25), OrderDate datetime2, CodCompany nvarchar(3), IDCustomer int, IDCustomerDeliveryAddress int",
  FACOrderLineSL: "IDOrderLine int, IDOrder int, IDManufacturingOrder int, ReceptionDemandDate datetime2, PendingDelivery bit",
  FACDeliveryNoteSL: "IDDeliveryNote int, DeliveryNoteDate datetime2",
  FACDeliveryNoteLineSL: "IDDeliveryNote int, IDOrderLine int",
};

interface Fila {
  pedido: string;
  pendiente_total: number;
  trabajo_abierto: number;
  fecha_entregado: Date | null;
}

/** Crea las tablas, mete `filas` y devuelve PedFin por pedido. */
async function pedFinCon(filas: string): Promise<Map<string, Fila>> {
  const pool = await getPool();
  let sql = `${ctesFinalizacionHistorial("ot")}
    SELECT pedido, pendiente_total, trabajo_abierto, fecha_entregado FROM PedFin ORDER BY pedido;`;
  let preparar = "";
  for (const [tabla, columnas] of Object.entries(TABLAS)) {
    preparar += `IF OBJECT_ID('tempdb..#UI_${tabla}') IS NOT NULL DROP TABLE #UI_${tabla};\n`;
    preparar += `CREATE TABLE #UI_${tabla} (${columnas});\n`;
    // "dbo.FACOrderSL" no casa dentro de "dbo.FACOrderLineSL" (ni NoteSL
    // dentro de NoteLineSL): el orden de las sustituciones no importa.
    sql = sql.replaceAll(`dbo.${tabla}`, `#UI_${tabla}`);
  }
  const req = pool.request();
  req.input("pendientes", "<pedidos></pedidos>");
  const r = await req.query<Fila>(preparar + filas + sql);
  return new Map(r.recordset.map((f) => [f.pedido.trim(), f]));
}

test.skipIf(!ACTIVO)(
  "pendiente_total solo cuenta tareas con fila en CPRMOResourceMachine",
  async () => {
    const pedidos = await pedFinCon(`
      -- AR.26.00001: tarea de TRABAJO (con centro) sin cerrar → pendiente.
      INSERT INTO #UI_FACOrderSL VALUES (1,'AR.26.00001','2026-09-10','001',1,NULL);
      INSERT INTO #UI_FACOrderLineSL VALUES (1,1,1,'2026-09-20',0);
      INSERT INTO #UI_CPRManufacturingOrder VALUES (1,'0000001','001');
      INSERT INTO #UI_CPRMOTask VALUES (1,501,'5','19/8 TRABAJO DE VERDAD',0,NULL);
      INSERT INTO #UI_CPRMOResourceMachine VALUES (501,'CALDERERIA','CALDERERIA');

      -- AR.26.00002: la misma tarea SIN centro (Materiales, una nota) → no
      -- pendiente: nunca cierra en OLANET.
      INSERT INTO #UI_FACOrderSL VALUES (2,'AR.26.00002','2026-09-10','001',1,NULL);
      INSERT INTO #UI_FACOrderLineSL VALUES (2,2,2,'2026-09-20',0);
      INSERT INTO #UI_CPRManufacturingOrder VALUES (2,'0000002','001');
      INSERT INTO #UI_CPRMOTask VALUES (2,502,'5','99 · NOTA SIN CENTRO',0,NULL);
    `);
    expect(pedidos.get("AR.26.00001")?.pendiente_total).toBe(1);
    expect(pedidos.get("AR.26.00002")?.pendiente_total).toBe(0);
  },
  60_000,
);

test.skipIf(!ACTIVO)(
  "trabajo_abierto: FINALIZAR manda, por OF, y sin FINALIZAR cuenta cualquier tarea con centro",
  async () => {
    const pedidos = await pedFinCon(`
      -- AR.26.00003: FINALIZAR (por el CENTRO) cerrada y una calderería
      -- olvidada abierta → sin trabajo.
      INSERT INTO #UI_FACOrderSL VALUES (3,'AR.26.00003','2026-09-01','001',1,NULL);
      INSERT INTO #UI_FACOrderLineSL VALUES (3,3,3,'2026-09-20',1);
      INSERT INTO #UI_CPRManufacturingOrder VALUES (3,'0000003','001');
      INSERT INTO #UI_CPRMOTask VALUES (3,602,'5','SOLDAR',0,NULL);
      INSERT INTO #UI_CPRMOResourceMachine VALUES (602,'CALDERERIA','CALDERERIA');
      INSERT INTO #UI_CPRMOTask VALUES (3,603,'9','EMPAQUETAR',0,NULL);
      INSERT INTO #UI_CPRMOResourceMachine VALUES (603,'FINALIZACION','FINALIZACION');
      INSERT INTO #UI_tgm_estadosof_olanet VALUES ('0000003','9',3,'2026-09-12');

      -- AR.26.00004: sin FINALIZAR y un corte abierto → con trabajo.
      INSERT INTO #UI_FACOrderSL VALUES (4,'AR.26.00004','2026-09-01','001',1,NULL);
      INSERT INTO #UI_FACOrderLineSL VALUES (4,4,4,'2026-09-20',1);
      INSERT INTO #UI_CPRManufacturingOrder VALUES (4,'0000004','001');
      INSERT INTO #UI_CPRMOTask VALUES (4,604,'3','CORTAR',0,NULL);
      INSERT INTO #UI_CPRMOResourceMachine VALUES (604,'CORTE MANUAL ARZUA','CORTE MANUAL ARZUA');

      -- AR.26.00005: dos OF. Una con FINALIZAR cerrada; la otra, de Santiago,
      -- sin FINALIZAR y a medias → el pedido tiene trabajo.
      INSERT INTO #UI_FACOrderSL VALUES (5,'AR.26.00005','2026-09-01','001',1,NULL);
      INSERT INTO #UI_FACOrderLineSL VALUES (51,5,51,'2026-09-20',1);
      INSERT INTO #UI_FACOrderLineSL VALUES (52,5,52,'2026-09-20',1);
      INSERT INTO #UI_CPRManufacturingOrder VALUES (51,'0000051','001');
      INSERT INTO #UI_CPRManufacturingOrder VALUES (52,'0000052','001');
      INSERT INTO #UI_CPRMOTask VALUES (51,651,'9','FINALIZAR',0,NULL);
      INSERT INTO #UI_CPRMOResourceMachine VALUES (651,'FINALIZACION','FINALIZACION');
      INSERT INTO #UI_tgm_estadosof_olanet VALUES ('0000051','9',3,'2026-09-12');
      INSERT INTO #UI_CPRMOTask VALUES (52,652,'2','CONFECCIONAR',0,NULL);
      INSERT INTO #UI_CPRMOResourceMachine VALUES (652,'CONFECCION SANTIAGO','CONFECCION SANTIAGO');

      -- AR.26.00006: FINALIZAR reconocida por el TEXTO, en otro centro, cerrada
      -- → sin trabajo aunque quede otra abierta.
      INSERT INTO #UI_FACOrderSL VALUES (6,'AR.26.00006','2026-09-01','001',1,NULL);
      INSERT INTO #UI_FACOrderLineSL VALUES (6,6,6,'2026-09-20',1);
      INSERT INTO #UI_CPRManufacturingOrder VALUES (6,'0000006','001');
      INSERT INTO #UI_CPRMOTask VALUES (6,661,'4','COSER',0,NULL);
      INSERT INTO #UI_CPRMOResourceMachine VALUES (661,'COSTURA POLIGONO','COSTURA POLIGONO');
      INSERT INTO #UI_CPRMOTask VALUES (6,662,'8','FINALIZAR Y EMBALAR',0,NULL);
      INSERT INTO #UI_CPRMOResourceMachine VALUES (662,'MONTAJE DE TOLDOS','MONTAJE DE TOLDOS');
      INSERT INTO #UI_tgm_estadosof_olanet VALUES ('0000006','8',3,'2026-09-12');

      -- AR.26.00007: todo cerrado menos FINALIZAR → con trabajo.
      INSERT INTO #UI_FACOrderSL VALUES (7,'AR.26.00007','2026-09-01','001',1,NULL);
      INSERT INTO #UI_FACOrderLineSL VALUES (7,7,7,'2026-09-20',1);
      INSERT INTO #UI_CPRManufacturingOrder VALUES (7,'0000007','001');
      INSERT INTO #UI_CPRMOTask VALUES (7,671,'3','CORTAR',0,NULL);
      INSERT INTO #UI_CPRMOResourceMachine VALUES (671,'CORTE ACRILICO','CORTE ACRILICO');
      INSERT INTO #UI_tgm_estadosof_olanet VALUES ('0000007','3',3,'2026-09-10');
      INSERT INTO #UI_CPRMOTask VALUES (7,672,'9','FINALIZAR',0,NULL);
      INSERT INTO #UI_CPRMOResourceMachine VALUES (672,'FINALIZACION','FINALIZACION');
    `);
    expect(pedidos.get("AR.26.00003")?.trabajo_abierto).toBe(0);
    expect(pedidos.get("AR.26.00004")?.trabajo_abierto).toBe(1);
    expect(pedidos.get("AR.26.00005")?.trabajo_abierto).toBe(1);
    expect(pedidos.get("AR.26.00006")?.trabajo_abierto).toBe(0);
    expect(pedidos.get("AR.26.00007")?.trabajo_abierto).toBe(1);
  },
  60_000,
);

test.skipIf(!ACTIVO)(
  "fecha_entregado es el ÚLTIMO albarán de las líneas, y null sin albarán",
  async () => {
    const pedidos = await pedFinCon(`
      -- AR.26.00008: dos líneas en dos albaranes → cuenta el del 14.
      INSERT INTO #UI_FACOrderSL VALUES (8,'AR.26.00008','2026-09-01','001',1,NULL);
      INSERT INTO #UI_FACOrderLineSL VALUES (81,8,81,'2026-09-11',0);
      INSERT INTO #UI_FACOrderLineSL VALUES (82,8,82,'2026-09-11',0);
      INSERT INTO #UI_CPRManufacturingOrder VALUES (81,'0000081','001');
      INSERT INTO #UI_CPRManufacturingOrder VALUES (82,'0000082','001');
      INSERT INTO #UI_FACDeliveryNoteSL VALUES (901,'2026-09-09');
      INSERT INTO #UI_FACDeliveryNoteSL VALUES (902,'2026-09-14');
      INSERT INTO #UI_FACDeliveryNoteLineSL VALUES (901,81);
      INSERT INTO #UI_FACDeliveryNoteLineSL VALUES (902,82);

      -- AR.26.00009: entregado sin albarán enlazado → null, nunca otra fecha.
      INSERT INTO #UI_FACOrderSL VALUES (9,'AR.26.00009','2026-09-01','001',1,NULL);
      INSERT INTO #UI_FACOrderLineSL VALUES (9,9,9,'2026-09-11',0);
      INSERT INTO #UI_CPRManufacturingOrder VALUES (9,'0000009','001');
    `);
    expect(pedidos.get("AR.26.00008")?.fecha_entregado?.toISOString().slice(0, 10)).toBe("2026-09-14");
    expect(pedidos.get("AR.26.00009")?.fecha_entregado).toBeNull();
  },
  60_000,
);
```

Nota: las OF 0000081/0000082 no tienen tareas; `Tareas` hace LEFT JOIN a `CPRMOTask`, así que la OF sigue saliendo con una fila y el pedido entra en `ResumenPedido`.

- [ ] **Step 2: Ejecutarlo y ver que falla**

Run: `VALIDAR_RPS_UI=1 node --env-file=.env.local node_modules/vitest/vitest.mjs run scripts/verificar-historial-centros.test.ts`
Expected: el primer test PASA; los otros dos FALLAN con `Invalid column name 'trabajo_abierto'`.

- [ ] **Step 3: Añadir la regla al SQL**

En `src/lib/server/historial-finalizacion-sql.ts`:

(a) Entre el CTE `Centros` (acaba en `SELECT DISTINCT IDMOTask FROM dbo.CPRMOResourceMachine`) y `), FinFase AS (`, añadir:

```sql
    ), Finalizacion AS (
      -- Tareas del centro de Finalización. Por el CENTRO entran EMPAQUETAR y
      -- PONER A MEDIDA Y EMBALAR, que no dicen «finalizar» (ver es_fin).
      SELECT DISTINCT IDMOTask FROM dbo.CPRMOResourceMachine
      WHERE UPPER(COALESCE(Description,'')) LIKE '%FINALIZ%'
```

(b) En `Tareas`, detrás de la columna `... END AS tiene_centro,`:

```sql
        -- FINALIZAR manda (Iván, 15/09/2026): cerrada, la OF está rematada
        -- en fábrica aunque quede algo de antes abierto por olvido.
        CASE WHEN fz.IDMOTask IS NOT NULL
          OR UPPER(COALESCE(t.Description,'')) LIKE '%FINALIZ%' THEN 1 ELSE 0 END AS es_fin,
```

y detrás de `LEFT JOIN Centros c ON c.IDMOTask=t.IDMOTask`:

```sql
      LEFT JOIN Finalizacion fz ON fz.IDMOTask=t.IDMOTask
```

(c) En `ResumenOF`, detrás de `MAX(CASE WHEN tiene_centro=1 THEN 1-terminada ELSE 0 END) AS pendiente_total,`:

```sql
        -- Si le queda trabajo, para la consulta sin login. Por OF y no por
        -- pedido: un pedido puede tener una OF con FINALIZAR y otra de
        -- Santiago sin ella, y guardar solo «finalizar cerrada» daría por
        -- rematada la de Santiago a medias. Sin FINALIZAR, la misma regla que
        -- pendiente_total, que NO cambia: es la del equipo.
        CASE WHEN MAX(CASE WHEN es_fin=1 AND terminada=1 THEN 1 ELSE 0 END)=1 THEN 0
             WHEN MAX(es_fin)=1 THEN 1
             ELSE MAX(CASE WHEN tiene_centro=1 THEN 1-terminada ELSE 0 END) END AS trabajo_abierto,
```

(d) En `ResumenPedido`: detrás de `MAX(t.pendiente_total) AS pendiente_total,` añadir `MAX(t.trabajo_abierto) AS trabajo_abierto,`. Cambiar la línea `MAX(CASE WHEN l.PendingDelivery = 1 THEN 1 ELSE 0 END) AS pendiente_entrega` por:

```sql
        MAX(CASE WHEN l.PendingDelivery = 1 THEN 1 ELSE 0 END) AS pendiente_entrega,
        -- Cuándo salió de verdad: el ÚLTIMO albarán de sus líneas. Por línea y
        -- no por cabecera: FACDeliveryNoteSL.IDOrder está vacío (0 pedidos
        -- enlazados así en 2025 y 2026). Sin albarán, null: ni la solicitada
        -- ni el cierre de tareas valen como sustituto.
        MAX(a.fecha) AS fecha_entregado
```

y detrás de `JOIN ResumenOF t ON t.IDManufacturingOrder=l.IDManufacturingOrder`:

```sql
      -- OUTER APPLY y no un CTE agrupado: esta consulta la usan también la
      -- búsqueda y la ficha del equipo con un solo pedido, y así solo se
      -- miran los albaranes de sus líneas.
      OUTER APPLY (
        SELECT MAX(d.DeliveryNoteDate) AS fecha
        FROM dbo.FACDeliveryNoteLineSL dl
        JOIN dbo.FACDeliveryNoteSL d ON d.IDDeliveryNote = dl.IDDeliveryNote
        WHERE dl.IDOrderLine = l.IDOrderLine
      ) a
```

(e) En `PedFin`, cambiar `fecha_entrega, pendiente_entrega,` por `fecha_entrega, pendiente_entrega, trabajo_abierto, fecha_entregado,`.

- [ ] **Step 4: Ejecutar el test y ver que pasa**

Run: el comando del Step 2.
Expected: 3 passed.

- [ ] **Step 5: Llevarlo al índice**

En `src/lib/historial-indice.ts`, dentro de `BaseHistorial`, detrás de `pendienteEntrega: boolean;`:

```ts
  /** Le queda trabajo en fábrica, con la regla de FINALIZAR (ver
   *  historial-finalizacion-sql.ts, ResumenOF). Solo lo usa la consulta sin
   *  login, para decir «en fábrica» o «esperando salir». */
  trabajoAbierto: boolean;
  /** Fecha del último albarán de sus líneas (ms), o null si no hay ninguno
   *  enlazado (antes de 2020, casi todos). */
  fechaEntregado: number | null;
```

En `src/lib/server/historial-indice.ts`:
- en `FilaBase`, añadir `trabajo_abierto: number | null;` y `fecha_entregado: Date | null;`;
- en el SELECT de `baseDe`, cambiar `fecha_entrega, pendiente_entrega, finalizada FROM PedFin;` por `fecha_entrega, pendiente_entrega, trabajo_abierto, fecha_entregado, finalizada FROM PedFin;`;
- en `base.push({...})`, detrás de `pendienteEntrega: ...,`:

```ts
      trabajoAbierto: f.trabajo_abierto === 1,
      fechaEntregado: ms(f.fecha_entregado),
```

En los tres literales de test (`historial-indice.test.ts` helper `base`, `historial-indice-entrega.test.ts` primer test, `publico.test.ts` helper `base`) añadir `trabajoAbierto: false,` y `fechaEntregado: null,`.

- [ ] **Step 6: Medir contra RPS que los números cuadran con la spec**

Crear `scripts/medir-indice-consulta.test.ts`:

```ts
import { afterAll, expect, test } from "vitest";
import { getPool } from "../src/lib/server/db";
import { construirIndice } from "../src/lib/server/historial-indice";
import { leerHistorialPedidoDetalle } from "../src/lib/server/historial-db";

// Mide lo que cuesta el índice con los dos datos nuevos y compara los totales
// con los medidos el 15/09/2026 (spec v2): 578 pendientes, 382 en fábrica, 196
// esperando salir. Los datos cambian cada día: se admite un 10 %.
//
// Opt-in: VALIDAR_RPS_UI=1 node --env-file=.env.local node_modules/vitest/vitest.mjs
// run scripts/medir-indice-consulta.test.ts

const ACTIVO = process.env.VALIDAR_RPS_UI === "1";

afterAll(async () => {
  if (ACTIVO) await (await getPool()).close();
});

test.skipIf(!ACTIVO)("el índice con trabajo y albarán", async () => {
  const t0 = Date.now();
  const indice = await construirIndice();
  const ms = Date.now() - t0;

  const filas = indice.base.ot;
  const pendientes = filas.filter((b) => b.pendienteEntrega);
  const enFabrica = pendientes.filter((b) => b.trabajoAbierto).length;
  const desde2026 = Date.UTC(2026, 0, 1);
  const entregados2026 = filas.filter((b) => !b.pendienteEntrega && (b.fechaPedido ?? 0) >= desde2026);
  const sinAlbaran2026 = entregados2026.filter((b) => b.fechaEntregado === null).length;

  const t1 = Date.now();
  await leerHistorialPedidoDetalle("AR.26.04082");
  const msFicha = Date.now() - t1;

  console.info({
    ms, msFicha, pendientes: pendientes.length, enFabrica,
    esperandoSalir: pendientes.length - enFabrica,
    entregados2026: entregados2026.length, sinAlbaran2026,
  });

  expect(pendientes.length).toBeGreaterThan(578 * 0.9);
  expect(pendientes.length).toBeLessThan(578 * 1.1);
  expect(ms).toBeLessThan(60_000);
  expect(msFicha).toBeLessThan(2_000);
}, 180_000);
```

Run: `VALIDAR_RPS_UI=1 node --env-file=.env.local node_modules/vitest/vitest.mjs run scripts/medir-indice-consulta.test.ts`
Expected: PASS. Copiar al informe los números del `console.info` (la spec da 4.973 entregados y 32 sin albarán en 2026). Si `enFabrica` se aleja más de un 10 % de 382, el índice pasa de 60 s o la ficha del equipo de 2 s: PARAR e informar, no maquillar.

- [ ] **Step 7: Suite y tipos**

Run: `pnpm test` y `npx tsc --noEmit`
Expected: todo en verde.

- [ ] **Step 8: Commit**

```bash
git add src/lib/server/historial-finalizacion-sql.ts src/lib/historial-indice.ts src/lib/server/historial-indice.ts src/lib/__tests__/historial-indice.test.ts src/lib/__tests__/historial-indice-entrega.test.ts src/lib/__tests__/publico.test.ts scripts/verificar-historial-centros.test.ts scripts/medir-indice-consulta.test.ts
git commit -m "feat(consulta): el índice sabe si a un pedido le queda trabajo y cuándo salió"
```

---

### Task 2: Qué pedidos salen, con qué estado y en qué orden

**Files:**
- Modify: `src/lib/historial-indice.ts` (extraer `coincideBusqueda` de `filtrarIndice`)
- Create: `src/lib/consulta.ts`
- Test: `src/lib/__tests__/consulta.test.ts`

**Interfaces:**
- Consumes: `BaseHistorial.trabajoAbierto`, `BaseHistorial.fechaEntregado` (Task 1).
- Produces (en `src/lib/consulta.ts`):
  - `PAGE_CONSULTA = 40`, `DIAS_PROXIMAS = 14`
  - `type EstadoConsulta = "proximas" | "fuera" | "fabrica" | "salir" | "entregados" | "todos"`, `ESTADOS_CONSULTA: { id: EstadoConsulta; label: string }[]`
  - `type PasoConsulta = "ot" | "diseno" | "taller"`, `PASOS_CONSULTA: { id: PasoConsulta; label: string }[]`
  - `type SituacionPedido = "fabrica" | "salir" | "entregado"`
  - `interface FiltrosConsulta { estado: EstadoConsulta; paso?: PasoConsulta; familia?: string; desde?: string; hasta?: string; q?: string; page: number }`
  - `diaIso(ms: number | null): string | null`, `sumaDias(iso: string, dias: number): string`
  - `situacionDe(b): SituacionPedido`, `estadoEfectivo(f): EstadoConsulta`, `diaDeFila(b): string | null`
  - `filtrarConsulta(indice: IndiceHistorial, f: FiltrosConsulta, hoy: string): PaginaConsulta` con `PaginaConsulta = { filas: BaseHistorial[]; hasMore: boolean; familias: string[]; porDia: Record<string, number> | null; estado: EstadoConsulta }`
  - `normalizarFiltrosConsulta(sp: URLSearchParams): FiltrosConsulta`
  - `textoFecha(p: { situacion: SituacionPedido; fechaEntrega: string | null; fechaEntregado: string | null }): string`
- Produces (en `src/lib/historial-indice.ts`): `coincideBusqueda(q: string): (pedido: string, info: InfoPedidoHistorial | undefined) => boolean`

- [ ] **Step 1: Escribir los tests (fallan)**

Crear `src/lib/__tests__/consulta.test.ts`:

```ts
import { expect, test } from "vitest";
import type { BaseHistorial, IndiceHistorial } from "../historial-indice";
import {
  filtrarConsulta,
  normalizarFiltrosConsulta,
  PAGE_CONSULTA,
  situacionDe,
  textoFecha,
  type FiltrosConsulta,
} from "../consulta";

const HOY = "2026-09-15";
const dia = (iso: string) => Date.UTC(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10)));

const base = (pedido: string, p: Partial<BaseHistorial> = {}): BaseHistorial => ({
  pedido,
  fechaPedido: dia("2026-09-01"),
  nOf: 1,
  tieneSeccion: false,
  pendienteSeccion: false,
  pendienteTotal: false,
  fechaEntrega: dia("2026-09-20"),
  pendienteEntrega: true,
  trabajoAbierto: true,
  fechaEntregado: null,
  finalizada: null,
  ...p,
});

const indice = (ot: BaseHistorial[], diseno: BaseHistorial[] = ot): IndiceHistorial => ({
  at: Date.now(),
  base: { ot, diseno },
  info: new Map(ot.map((b) => [b.pedido, {
    cliente: "MAHOU, S.A.", negocio: null, ciudadEntrega: "ARZUA",
    familias: b.pedido.endsWith("R") ? ["REMOLQUE"] : ["TOLDO"],
    ordenes: "0230001", textos: "MAHOU, S.A.\nTOLDO DE FACHADA",
  }])),
  personas: new Map(),
});

const f = (p: Partial<FiltrosConsulta> = {}): FiltrosConsulta => ({ estado: "proximas", page: 0, ...p });
const codigos = (i: IndiceHistorial, p: Partial<FiltrosConsulta>) => filtrarConsulta(i, f(p), HOY).filas.map((b) => b.pedido);

test("entregado manda sobre las tareas; sin entregar, el trabajo decide fábrica o esperando salir", () => {
  expect(situacionDe(base("A", { pendienteEntrega: false, trabajoAbierto: true }))).toBe("entregado");
  expect(situacionDe(base("B", { trabajoAbierto: true }))).toBe("fabrica");
  expect(situacionDe(base("C", { trabajoAbierto: false }))).toBe("salir");
});

test("próximas entregas: de hoy a hoy+14 incluidos, sin entregados ni sin fecha, lo antes primero", () => {
  const i = indice([
    base("MANANA", { fechaEntrega: dia("2026-09-16") }),
    base("HOY", { fechaEntrega: dia("2026-09-15") }),
    base("LIMITE", { fechaEntrega: dia("2026-09-29"), trabajoAbierto: false }),
    base("PASADO", { fechaEntrega: dia("2026-09-30") }),
    base("AYER", { fechaEntrega: dia("2026-09-14") }),
    base("SINFECHA", { fechaEntrega: null }),
    base("YASALIO", { fechaEntrega: dia("2026-09-16"), pendienteEntrega: false }),
  ]);
  expect(codigos(i, {})).toEqual(["HOY", "MANANA", "LIMITE"]);
});

test("fuera de plazo: sin entregar y con la entrega antes de hoy", () => {
  const i = indice([
    base("AYER", { fechaEntrega: dia("2026-09-14") }),
    base("HOY", { fechaEntrega: dia("2026-09-15") }),
    base("VIEJO_ENTREGADO", { fechaEntrega: dia("2026-01-01"), pendienteEntrega: false }),
    base("SINFECHA", { fechaEntrega: null }),
  ]);
  expect(codigos(i, { estado: "fuera" })).toEqual(["AYER"]);
});

test("en fábrica y esperando salir incluyen los que no tienen fecha, al final", () => {
  const i = indice([
    base("SINFECHA", { fechaEntrega: null }),
    base("CONFECHA", { fechaEntrega: dia("2026-12-01") }),
    base("SALIR", { trabajoAbierto: false }),
  ]);
  expect(codigos(i, { estado: "fabrica" })).toEqual(["CONFECHA", "SINFECHA"]);
  expect(codigos(i, { estado: "salir" })).toEqual(["SALIR"]);
});

test("buscar sin elegir estado encuentra un pedido de 2019 ya entregado", () => {
  const i = indice([
    base("AR.19.05555", { fechaPedido: dia("2019-06-01"), fechaEntrega: dia("2019-07-01"), pendienteEntrega: false }),
    base("AR.26.00001"),
  ]);
  const r = filtrarConsulta(i, f({ q: "AR.19.05555" }), HOY);
  expect(r.filas.map((b) => b.pedido)).toEqual(["AR.19.05555"]);
  expect(r.estado).toBe("todos");
  expect(r.porDia).toBeNull();
});

test("con un estado elegido a mano, buscar respeta el estado", () => {
  const i = indice([
    base("AR.26.00001", { pendienteEntrega: false }),
    base("AR.26.00002"),
  ]);
  expect(codigos(i, { estado: "entregados", q: "MAHOU" })).toEqual(["AR.26.00001"]);
});

test("paso: Oficina Técnica, Diseño Gráfico y Taller por descarte, solo en fábrica", () => {
  const ot = [
    base("OT", { pendienteSeccion: true }),
    base("DIS"),
    base("TALLER"),
    base("SALIR_OT", { pendienteSeccion: true, trabajoAbierto: false }),
  ];
  const diseno = [
    base("OT"),
    base("DIS", { pendienteSeccion: true }),
    base("TALLER"),
    base("SALIR_OT"),
  ];
  const i = indice(ot, diseno);
  expect(codigos(i, { estado: "todos", paso: "ot" })).toEqual(["OT"]);
  expect(codigos(i, { estado: "todos", paso: "diseno" })).toEqual(["DIS"]);
  expect(codigos(i, { estado: "todos", paso: "taller" })).toEqual(["TALLER"]);
});

test("entregados: lo último que salió primero, sin albarán al final, y totales por día", () => {
  const i = indice([
    base("A", { pendienteEntrega: false, fechaEntregado: dia("2026-09-09") }),
    base("B", { pendienteEntrega: false, fechaEntregado: dia("2026-09-14") }),
    base("SINALBARAN", { pendienteEntrega: false, fechaEntregado: null }),
    base("C", { pendienteEntrega: false, fechaEntregado: dia("2026-09-14") }),
  ]);
  const r = filtrarConsulta(i, f({ estado: "entregados" }), HOY);
  expect(r.filas.map((b) => b.pedido)).toEqual(["C", "B", "A", "SINALBARAN"]);
  expect(r.porDia).toEqual({ "2026-09-14": 2, "2026-09-09": 1, "sin-fecha": 1 });
});

test("las familias salen de lo filtrado ANTES de elegir familia", () => {
  const i = indice([base("T1"), base("R1R")]);
  const r = filtrarConsulta(i, f({ estado: "todos", familia: "REMOLQUE" }), HOY);
  expect(r.filas.map((b) => b.pedido)).toEqual(["R1R"]);
  expect(r.familias.sort()).toEqual(["REMOLQUE", "TOLDO"]);
});

test("desde y hasta, inclusive, sobre la fecha de la fila", () => {
  const i = indice([
    base("E9", { fechaEntrega: dia("2026-10-09") }),
    base("E10", { fechaEntrega: dia("2026-10-10") }),
    base("E11", { fechaEntrega: dia("2026-10-11") }),
    base("ENT10", { pendienteEntrega: false, fechaEntregado: dia("2026-10-10") }),
  ]);
  expect(codigos(i, { estado: "fabrica", desde: "2026-10-10", hasta: "2026-10-10" })).toEqual(["E10"]);
  expect(codigos(i, { estado: "entregados", desde: "2026-10-10", hasta: "2026-10-10" })).toEqual(["ENT10"]);
});

test("hasMore avisa de otra página sin devolver la fila de más", () => {
  const filas = Array.from({ length: PAGE_CONSULTA + 3 }, (_, n) => base(`P${String(n).padStart(3, "0")}`));
  const r = filtrarConsulta(indice(filas), f({ estado: "fabrica" }), HOY);
  expect(r.filas).toHaveLength(PAGE_CONSULTA);
  expect(r.hasMore).toBe(true);
  expect(filtrarConsulta(indice(filas), f({ estado: "fabrica", page: 1 }), HOY).filas).toHaveLength(3);
});

test("los filtros de la URL nunca revientan", () => {
  expect(normalizarFiltrosConsulta(new URLSearchParams("estado=raro&page=-2&desde=ayer&paso=nada")))
    .toEqual({ estado: "proximas", page: 0 });
  expect(normalizarFiltrosConsulta(new URLSearchParams("estado=fabrica&paso=ot&q=%20mahou%20&familia=TOLDO&desde=2026-01-01&hasta=2026-02-01&page=2")))
    .toEqual({ estado: "fabrica", paso: "ot", q: "mahou", familia: "TOLDO", desde: "2026-01-01", hasta: "2026-02-01", page: 2 });
  // El paso solo tiene sentido en lo que está en fábrica.
  expect(normalizarFiltrosConsulta(new URLSearchParams("estado=entregados&paso=ot")).paso).toBeUndefined();
});

test("la fecha de la fila: nunca la solicitada haciéndose pasar por la de salida", () => {
  expect(textoFecha({ situacion: "entregado", fechaEntrega: "2026-09-11", fechaEntregado: "2026-09-14" })).toBe("Entregado el 14/09/26");
  expect(textoFecha({ situacion: "entregado", fechaEntrega: "2026-09-11", fechaEntregado: null })).toBe("Entregado");
  expect(textoFecha({ situacion: "fabrica", fechaEntrega: "2026-09-18", fechaEntregado: null })).toBe("Entrega 18/09/26");
  expect(textoFecha({ situacion: "salir", fechaEntrega: null, fechaEntregado: null })).toBe("Sin fecha de entrega");
});
```

- [ ] **Step 2: Ejecutar y ver que falla**

Run: `pnpm vitest run src/lib/__tests__/consulta.test.ts`
Expected: FAIL, `Failed to resolve import "../consulta"`.

- [ ] **Step 3: Sacar la búsqueda del Historial a una función compartida**

En `src/lib/historial-indice.ts`, antes de `export function filtrarIndice(`, añadir:

```ts
/** Cómo busca el Historial: código de pedido exacto, trozo de código de pedido
 *  o de OF, o todas las palabras en el MISMO campo de texto. Compartido con la
 *  consulta sin login: quien busca un pedido tiene que encontrar lo mismo en
 *  las dos pantallas. `q` llega ya recortado y no vacío. */
export function coincideBusqueda(q: string): (pedido: string, info: InfoPedidoHistorial | undefined) => boolean {
  const palabras = palabrasDe(q);
  const codigo = palabras.join("");
  const exacto = esCodigoPedido(q.toUpperCase()) ? q.toUpperCase() : null;
  return (pedido, info) => {
    if (exacto) return pedido === exacto;
    if (palabras.length === 0) return false;
    if (pedido.replaceAll(".", "").includes(codigo)) return true;
    if (!info) return false;
    // El código no lleva espacios, así que no puede casar a caballo entre dos OF.
    if (info.ordenes.includes(codigo)) return true;
    // Todas las palabras en el MISMO campo, como la consulta: "toldo fachada"
    // encuentra "TOLDO DE FACHADA", pero no un cliente "TOLDOS" con una OF de
    // "FACHADA". Primero la prueba barata sobre todo el texto; solo si pasa,
    // campo a campo.
    if (!palabras.every((p) => info.textos.includes(p))) return false;
    return info.textos.split("\n").some((t) => palabras.every((p) => t.includes(p)));
  };
}
```

Dentro de `filtrarIndice`: borrar las líneas `const palabras = palabrasDe(q);`, `const codigo = palabras.join("");`, `const exacto = ...;` y el bloque `const coincideTexto = (b, info) => { ... };` entero. En su lugar poner `const coincide = q ? coincideBusqueda(q) : null;`, y cambiar `if (q && !coincideTexto(b, info)) continue;` por `if (coincide && !coincide(b.pedido, info)) continue;`.

Run: `pnpm vitest run src/lib/__tests__/historial-indice.test.ts`
Expected: PASS (el Historial del equipo busca igual que antes).

- [ ] **Step 4: Escribir `src/lib/consulta.ts`**

```ts
import { fmtDiaMesAno } from "./fechas";
import { coincideBusqueda, type BaseHistorial, type IndiceHistorial } from "./historial-indice";
import { SECCION_POR_DEFECTO } from "./secciones";

// ─── La consulta sin login: qué pedidos salen y cómo se cuentan ──────────────
// Una sola lista para toda la casa. Se entra buscando, y sin buscar se ven las
// próximas entregas. Lo que decide si un pedido está pendiente es la ENTREGA,
// no las tareas: RPS tiene 109.566 pedidos entregados con alguna fase sin
// cerrar, y la entrega la mantiene administración con los albaranes (spec
// 2026-09-15-consulta-publica-v2-design.md). Sin base de datos, para probarlo.

export const PAGE_CONSULTA = 40;

/** Hoy y los catorce días siguientes: la lista corta de «qué sale esta semana
 *  y la que viene». */
export const DIAS_PROXIMAS = 14;

export type EstadoConsulta = "proximas" | "fuera" | "fabrica" | "salir" | "entregados" | "todos";

export const ESTADOS_CONSULTA: { id: EstadoConsulta; label: string }[] = [
  { id: "proximas", label: "Próximas entregas" },
  { id: "fuera", label: "Fuera de plazo" },
  { id: "fabrica", label: "En fábrica" },
  { id: "salir", label: "Esperando salir" },
  { id: "entregados", label: "Entregados" },
  { id: "todos", label: "Todos" },
];

export type PasoConsulta = "ot" | "diseno" | "taller";

export const PASOS_CONSULTA: { id: PasoConsulta; label: string }[] = [
  { id: "ot", label: "Oficina Técnica" },
  { id: "diseno", label: "Diseño Gráfico" },
  { id: "taller", label: "Taller" },
];

export type SituacionPedido = "fabrica" | "salir" | "entregado";

export interface FiltrosConsulta {
  estado: EstadoConsulta;
  /** Solo filtra lo que está en fábrica (ver `normalizarFiltrosConsulta`). */
  paso?: PasoConsulta;
  familia?: string;
  /** yyyy-mm-dd, inclusive, sobre la fecha de la fila (`diaDeFila`). */
  desde?: string;
  hasta?: string;
  q?: string;
  page: number;
}

export interface PaginaConsulta {
  filas: BaseHistorial[];
  hasMore: boolean;
  /** Familias presentes con los demás filtros puestos: elegir una nunca deja
   *  la lista en blanco. */
  familias: string[];
  /** Pedidos por día de la consulta ENTERA (clave yyyy-mm-dd o "sin-fecha"),
   *  o null cuando la lista no va por días (buscando o «Todos»). */
  porDia: Record<string, number> | null;
  /** El estado con el que se filtró de verdad (ver `estadoEfectivo`). */
  estado: EstadoConsulta;
}

/** ms → yyyy-mm-dd. Las dos fechas son de día sin hora en RPS
 *  (ReceptionDemandDate, DeliveryNoteDate) y el driver las trae a medianoche
 *  UTC: cortando en UTC no se corren de día. */
export const diaIso = (ms: number | null): string | null =>
  ms === null ? null : new Date(ms).toISOString().slice(0, 10);

export function sumaDias(iso: string, dias: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + dias)).toISOString().slice(0, 10);
}

/** Entregado manda: no se entrega un pedido sin hacerlo. Sin entregar, el
 *  trabajo que queda (regla de FINALIZAR, en el índice) separa fábrica de
 *  esperando salir. */
export function situacionDe(b: Pick<BaseHistorial, "pendienteEntrega" | "trabajoAbierto">): SituacionPedido {
  if (!b.pendienteEntrega) return "entregado";
  return b.trabajoAbierto ? "fabrica" : "salir";
}

/** «Próximas entregas» es la pantalla de entrada, no una elección: quien
 *  escribe en el buscador quiere el pedido esté como esté. Cualquier otro
 *  estado lo eligió a mano, y se respeta. */
export function estadoEfectivo(f: Pick<FiltrosConsulta, "estado" | "q">): EstadoConsulta {
  return f.estado === "proximas" && f.q?.trim() ? "todos" : f.estado;
}

/** La fecha que se lee en la fila y que agrupa: la de salida si ya salió, la
 *  solicitada si no. */
export function diaDeFila(b: BaseHistorial): string | null {
  return situacionDe(b) === "entregado" ? diaIso(b.fechaEntregado) : diaIso(b.fechaEntrega);
}

// Las dos secciones del índice tienen los mismos pedidos; la de diseño solo
// hace falta para saber si le queda trabajo de Diseño Gráfico. Se indexa una
// vez por índice (se rehace cada 30 min) y no en cada petición.
const disenoPorIndice = new WeakMap<IndiceHistorial, Map<string, BaseHistorial>>();
function disenoDe(indice: IndiceHistorial): Map<string, BaseHistorial> {
  let mapa = disenoPorIndice.get(indice);
  if (!mapa) {
    mapa = new Map(indice.base.diseno.map((b) => [b.pedido, b]));
    disenoPorIndice.set(indice, mapa);
  }
  return mapa;
}

/** Refleja las tareas TAL COMO ESTÁN en RPS: una de OT olvidada abierta hace
 *  que salga en Oficina Técnica. Taller es lo que queda, por descarte. */
function enPaso(paso: PasoConsulta, ot: BaseHistorial, diseno: BaseHistorial | undefined): boolean {
  const deOt = ot.pendienteSeccion;
  const deDiseno = diseno?.pendienteSeccion ?? false;
  if (paso === "ot") return deOt;
  if (paso === "diseno") return deDiseno;
  return !deOt && !deDiseno;
}

const ascNulosAlFinal = (a: string | null, b: string | null) =>
  a === b ? 0 : a === null ? 1 : b === null ? -1 : a < b ? -1 : 1;

export function filtrarConsulta(indice: IndiceHistorial, f: FiltrosConsulta, hoy: string): PaginaConsulta {
  const estado = estadoEfectivo(f);
  const q = f.q?.trim() ?? "";
  const coincide = q ? coincideBusqueda(q) : null;
  const limite = sumaDias(hoy, DIAS_PROXIMAS);
  const familia = f.familia?.trim() || null;
  const diseno = f.paso ? disenoDe(indice) : null;

  const sinFamilia: { b: BaseHistorial; dia: string | null; familias: string[] }[] = [];
  for (const b of indice.base[SECCION_POR_DEFECTO]) {
    const situacion = situacionDe(b);
    const entrega = diaIso(b.fechaEntrega);
    if (estado === "proximas" && (situacion === "entregado" || entrega === null || entrega < hoy || entrega > limite)) continue;
    if (estado === "fuera" && (situacion === "entregado" || entrega === null || entrega >= hoy)) continue;
    if (estado === "fabrica" && situacion !== "fabrica") continue;
    if (estado === "salir" && situacion !== "salir") continue;
    if (estado === "entregados" && situacion !== "entregado") continue;
    if (f.paso && (situacion !== "fabrica" || !enPaso(f.paso, b, diseno!.get(b.pedido)))) continue;
    const dia = diaDeFila(b);
    if (f.desde && (dia === null || dia < f.desde)) continue;
    if (f.hasta && (dia === null || dia > f.hasta)) continue;
    const info = indice.info.get(b.pedido);
    if (coincide && !coincide(b.pedido, info)) continue;
    sinFamilia.push({ b, dia, familias: info?.familias ?? [] });
  }

  const cuenta = new Map<string, number>();
  for (const { familias } of sinFamilia) for (const fam of familias) cuenta.set(fam, (cuenta.get(fam) ?? 0) + 1);
  const familias = [...cuenta].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "es")).map(([fam]) => fam);

  const lista = familia ? sinFamilia.filter((x) => x.familias.includes(familia)) : sinFamilia;
  if (estado === "todos") {
    // Buscando manda lo reciente: el pedido que se busca casi siempre es de
    // estos meses, aunque la búsqueda llegue a 2019.
    lista.sort((x, y) => (y.b.fechaPedido ?? -Infinity) - (x.b.fechaPedido ?? -Infinity) || y.b.pedido.localeCompare(x.b.pedido));
  } else if (estado === "entregados") {
    // Lo último que salió primero; los que no tienen albarán, al final.
    lista.sort((x, y) => {
      if (x.dia !== y.dia) {
        if (x.dia === null) return 1;
        if (y.dia === null) return -1;
        return x.dia < y.dia ? 1 : -1;
      }
      return y.b.pedido.localeCompare(x.b.pedido);
    });
  } else {
    lista.sort((x, y) => ascNulosAlFinal(x.dia, y.dia) || x.b.pedido.localeCompare(y.b.pedido));
  }

  let porDia: Record<string, number> | null = null;
  if (estado !== "todos") {
    porDia = {};
    for (const { dia } of lista) porDia[dia ?? "sin-fecha"] = (porDia[dia ?? "sin-fecha"] ?? 0) + 1;
  }

  const off = Math.max(0, f.page) * PAGE_CONSULTA;
  const trozo = lista.slice(off, off + PAGE_CONSULTA + 1).map((x) => x.b);
  return { filas: trozo.slice(0, PAGE_CONSULTA), hasMore: trozo.length > PAGE_CONSULTA, familias, porDia, estado };
}

const ESTADOS = new Set<string>(ESTADOS_CONSULTA.map((e) => e.id));
const PASOS = new Set<string>(PASOS_CONSULTA.map((p) => p.id));
const ISO = /^\d{4}-\d{2}-\d{2}$/;

/** Los filtros tal como llegan de la URL. NUNCA lanza: viene de fuera. */
export function normalizarFiltrosConsulta(sp: URLSearchParams): FiltrosConsulta {
  const texto = (k: string) => sp.get(k)?.trim() || undefined;
  const fecha = (k: string) => {
    const v = texto(k);
    return v && ISO.test(v) ? v : undefined;
  };
  const crudo = sp.get("estado") ?? "";
  const estado = (ESTADOS.has(crudo) ? crudo : "proximas") as EstadoConsulta;
  const pasoCrudo = sp.get("paso") ?? "";
  // «Esperando salir» y «Entregados» no están en fábrica: un paso ahí dejaría
  // la lista vacía sin decir por qué.
  const paso = PASOS.has(pasoCrudo) && estado !== "salir" && estado !== "entregados"
    ? (pasoCrudo as PasoConsulta)
    : undefined;
  const page = Number(sp.get("page"));
  const f: FiltrosConsulta = { estado, page: Number.isInteger(page) && page >= 0 ? page : 0 };
  if (paso) f.paso = paso;
  const q = texto("q");
  if (q) f.q = q;
  const familia = texto("familia");
  if (familia) f.familia = familia;
  const desde = fecha("desde");
  if (desde) f.desde = desde;
  const hasta = fecha("hasta");
  if (hasta) f.hasta = hasta;
  return f;
}

/** «Entrega 18/09/26», «Entregado el 09/09/26» o «Entregado» a secas: sin
 *  albarán enlazado no se pone ninguna otra fecha en su lugar. Con año: la
 *  búsqueda llega a pedidos de hace años. */
export function textoFecha(p: { situacion: SituacionPedido; fechaEntrega: string | null; fechaEntregado: string | null }): string {
  if (p.situacion === "entregado") return p.fechaEntregado ? `Entregado el ${fmtDiaMesAno(p.fechaEntregado)}` : "Entregado";
  return p.fechaEntrega ? `Entrega ${fmtDiaMesAno(p.fechaEntrega)}` : "Sin fecha de entrega";
}
```

- [ ] **Step 5: Ejecutar y ver que pasa**

Run: `pnpm vitest run src/lib/__tests__/consulta.test.ts src/lib/__tests__/historial-indice.test.ts`
Expected: PASS.

- [ ] **Step 6: Tipos y commit**

Run: `npx tsc --noEmit`
Expected: sin errores.

```bash
git add src/lib/consulta.ts src/lib/__tests__/consulta.test.ts src/lib/historial-indice.ts
git commit -m "feat(consulta): una sola lista con estados, paso, familia y fechas"
```

---

### Task 3: Dónde está cada OF, y quién la tiene

**Files:**
- Modify: `src/lib/publico.ts` (renombrar `enFrase` → `export function nombreDeCentro`)
- Create: `src/lib/consulta-donde.ts`
- Test: `src/lib/__tests__/consulta-donde.test.ts`

**Interfaces:**
- Consumes: `capitalizaFrase(texto: string): string` (ya exportada en `src/lib/publico.ts`).
- Produces (en `src/lib/publico.ts`): `nombreDeCentro(centro: string): string`.
- Produces (en `src/lib/consulta-donde.ts`):
  - `EN_CURSO = 1`, `PAUSADA = 2`, `FINALIZADA = 3`
  - `interface MovimientoFase { estado: number; nombre: string | null; desde: string | null }`
  - `interface TareaConEstado { orden: string; codigo: string; descripcion: string; centro: string | null; esFinalizar: boolean; cerrada: boolean; movimiento: MovimientoFase | null }`
  - `interface PasoDonde { paso: string; tarea: string; quien: string | null; desde: string | null }`
  - `interface DondeOF { orden: string; enCurso: PasoDonde[]; pausadas: PasoDonde[]; siguientes: PasoDonde[] }`
  - `numeroDeTarea(codigo: string): number`
  - `dondeEstaOF(orden: string, tareas: readonly TareaConEstado[]): DondeOF | null`
  - `dondeEstaPedido(tareas: readonly TareaConEstado[]): DondeOF[]`
  - `fraseDonde(donde: readonly DondeOF[]): string | null`
  - `textoSituacion(situacion: SituacionPedido, donde: readonly DondeOF[]): string | null`

- [ ] **Step 1: Escribir los tests (fallan)**

Crear `src/lib/__tests__/consulta-donde.test.ts`:

```ts
import { expect, test } from "vitest";
import {
  dondeEstaOF,
  dondeEstaPedido,
  EN_CURSO,
  FINALIZADA,
  fraseDonde,
  numeroDeTarea,
  PAUSADA,
  textoSituacion,
  type TareaConEstado,
} from "../consulta-donde";

const tarea = (p: Partial<TareaConEstado> & Pick<TareaConEstado, "codigo">): TareaConEstado => ({
  orden: "0231429",
  descripcion: "TAREA",
  centro: "CALDERERIA",
  esFinalizar: false,
  cerrada: false,
  movimiento: null,
  ...p,
});

test("FINALIZAR cerrada: la OF no tiene dónde estar, aunque quede algo de antes abierto", () => {
  expect(dondeEstaOF("0231429", [
    tarea({ codigo: "3", centro: "CORTE ACRILICO" }),
    tarea({ codigo: "9", centro: "FINALIZACION", esFinalizar: true, cerrada: true }),
  ])).toBeNull();
});

test("una tarea pausada en OLANET sale con el nombre de quien la tiene", () => {
  // Inspirado en AR.26.04082: «Plantear y preparar archivos» pausada por
  // Adrián Quinteiro desde el 07/09.
  const donde = dondeEstaOF("0231429", [
    tarea({ codigo: "2", centro: "OFICINA TECNICA ARZUA", cerrada: true }),
    tarea({
      codigo: "5",
      descripcion: "PLANTEAR Y PREPARAR ARCHIVOS",
      centro: "CORTE AUTOMÁTICO PARQUE EMPRESARIAL",
      movimiento: { estado: PAUSADA, nombre: "Adrián Quinteiro", desde: "2026-09-07" },
    }),
    tarea({ codigo: "7", centro: "COSTURA POLIGONO" }),
  ]);
  expect(donde).toEqual({
    orden: "0231429",
    enCurso: [],
    pausadas: [{ paso: "Corte (Parque Empresarial)", tarea: "Plantear y preparar archivos", quien: "Adrián Quinteiro", desde: "2026-09-07" }],
    siguientes: [],
  });
});

test("en curso y pausada a la vez: salen las dos, y no hay «siguiente»", () => {
  const donde = dondeEstaOF("X", [
    tarea({ codigo: "3", centro: "CALDERERIA", movimiento: { estado: EN_CURSO, nombre: "Ana", desde: null } }),
    tarea({ codigo: "4", centro: "CORTE ACRILICO", movimiento: { estado: PAUSADA, nombre: "Luis", desde: null } }),
    tarea({ codigo: "8", centro: "COSTURA POLIGONO" }),
  ])!;
  expect(donde.enCurso.map((p) => p.quien)).toEqual(["Ana"]);
  expect(donde.pausadas.map((p) => p.quien)).toEqual(["Luis"]);
  expect(donde.siguientes).toEqual([]);
});

test("si nadie ha empezado nada, lo siguiente son las abiertas con el número más bajo, varias si empatan", () => {
  const donde = dondeEstaOF("X", [
    tarea({ codigo: "2", centro: "OFICINA TECNICA ARZUA", cerrada: true }),
    tarea({ codigo: "5", centro: "CORTE ACRILICO" }),
    tarea({ codigo: "05", centro: "COSTURA POLIGONO" }),
    tarea({ codigo: "7", centro: "CALDERERIA" }),
  ])!;
  expect(donde.siguientes.map((p) => p.paso)).toEqual(["Corte", "Costura (Parque Empresarial)"]);
});

test("las pseudo-tareas sin centro no cuentan, y un movimiento finalizado cierra la tarea", () => {
  expect(dondeEstaOF("X", [
    tarea({ codigo: "0", descripcion: "MATERIALES", centro: null }),
    tarea({ codigo: "3", movimiento: { estado: FINALIZADA, nombre: "Ana", desde: null } }),
  ])).toBeNull();
});

test("FINALIZAR abierta sin centro sigue siendo trabajo pendiente", () => {
  const donde = dondeEstaOF("X", [
    tarea({ codigo: "3", cerrada: true }),
    tarea({ codigo: "9", descripcion: "FINALIZAR", centro: null, esFinalizar: true }),
  ])!;
  expect(donde.siguientes.map((p) => p.paso)).toEqual(["Finalizar"]);
});

test("sin OLANET (sin movimientos) se sigue diciendo por dónde va, sin nombres", () => {
  const donde = dondeEstaOF("X", [tarea({ codigo: "3", centro: "CALDERERIA" })])!;
  expect(donde.siguientes).toEqual([{ paso: "Calderería", tarea: "Tarea", quien: null, desde: null }]);
});

test("códigos que no son número van detrás de los que sí", () => {
  expect(numeroDeTarea("02")).toBe(2);
  expect(numeroDeTarea("A1")).toBe(Number.POSITIVE_INFINITY);
});

test("el pedido junta sus OF en el orden en que llegan y deja fuera las rematadas", () => {
  const donde = dondeEstaPedido([
    tarea({ orden: "B", codigo: "3" }),
    tarea({ orden: "A", codigo: "9", esFinalizar: true, cerrada: true }),
    tarea({ orden: "C", codigo: "4", centro: "CORTE ACRILICO" }),
  ]);
  expect(donde.map((d) => d.orden)).toEqual(["B", "C"]);
});

test("la frase de la fila junta todas las OF sin repetir", () => {
  const donde = dondeEstaPedido([
    tarea({ orden: "A", codigo: "3", movimiento: { estado: EN_CURSO, nombre: "Ana", desde: null } }),
    tarea({ orden: "B", codigo: "3", movimiento: { estado: EN_CURSO, nombre: "Ana", desde: null } }),
    tarea({ orden: "C", codigo: "4", centro: "CORTE ACRILICO", movimiento: { estado: PAUSADA, nombre: null, desde: null } }),
    tarea({ orden: "D", codigo: "1", centro: "COSTURA POLIGONO" }),
  ]);
  expect(fraseDonde(donde)).toBe("Haciendo: Calderería (Ana) · Pausado: Corte · Siguiente: Costura (Parque Empresarial)");
  expect(fraseDonde([])).toBeNull();
});

test("el texto de situación: en fábrica dice dónde; esperando salir lo dice; entregado calla (lo dice la fecha)", () => {
  const donde = dondeEstaPedido([tarea({ codigo: "3" })]);
  expect(textoSituacion("fabrica", donde)).toBe("Siguiente: Calderería");
  expect(textoSituacion("fabrica", [])).toBe("En fábrica");
  expect(textoSituacion("salir", [])).toBe("Fabricado, esperando salir");
  expect(textoSituacion("entregado", [])).toBeNull();
});
```

- [ ] **Step 2: Ejecutar y ver que falla**

Run: `pnpm vitest run src/lib/__tests__/consulta-donde.test.ts`
Expected: FAIL, `Failed to resolve import "../consulta-donde"`.

- [ ] **Step 3: Exportar el nombre legible del centro**

En `src/lib/publico.ts`, cambiar `function enFrase(centro: string): string {` por `export function nombreDeCentro(centro: string): string {`, y dentro de `frasePublica` cambiar `centros.map(enFrase)` por `centros.map(nombreDeCentro)`.

- [ ] **Step 4: Escribir `src/lib/consulta-donde.ts`**

```ts
import type { SituacionPedido } from "./consulta";
import { capitalizaFrase, nombreDeCentro } from "./publico";

// ─── Por dónde va un pedido en fábrica, y quién lo tiene ─────────────────────
// Lo segundo que pregunta un comercial, después de «¿cómo va?», es «¿quién lo
// tiene?», para poder llamarle. RPS no lo sabe: el estado de cada tarea y el
// operario están en OLANET (sch_FasesMov). Aquí, sin base de datos, se decide
// qué se dice con las tareas de RPS y el último movimiento de OLANET ya juntos.
//
// Puede ser más de un sitio a la vez: las tareas van en paralelo (en la OF
// 0231429 la calderería se cerró antes de empezar el corte).

/** Estados de `sch_FasesMov.IdEstadoOF` (ver lib/fases.ts). */
export const EN_CURSO = 1;
export const PAUSADA = 2;
export const FINALIZADA = 3;

export interface MovimientoFase {
  estado: number;
  /** Nombre de quien hizo el último movimiento, o null si no se pudo saber. */
  nombre: string | null;
  /** yyyy-mm-dd del último movimiento. */
  desde: string | null;
}

export interface TareaConEstado {
  orden: string;
  codigo: string;
  descripcion: string;
  /** Centro de trabajo de RPS. Sin centro es una pseudo-tarea (Materiales, una
   *  nota tecleada como tarea) que nunca cierra: no cuenta. */
  centro: string | null;
  esFinalizar: boolean;
  /** Cerrada en RPS (tgm_estadosof_olanet, o el rescate de OT al 100 %). */
  cerrada: boolean;
  /** Último movimiento en OLANET, o null si no hay (o OLANET no contestó). */
  movimiento: MovimientoFase | null;
}

export interface PasoDonde {
  /** El paso legible: el centro con su nombre para gente de fuera, o el texto
   *  de la tarea si no tiene centro. */
  paso: string;
  tarea: string;
  quien: string | null;
  desde: string | null;
}

export interface DondeOF {
  orden: string;
  enCurso: PasoDonde[];
  pausadas: PasoDonde[];
  /** Solo cuando nadie ha empezado nada en la OF. */
  siguientes: PasoDonde[];
}

/** El número de secuencia de la tarea es su código ("5", "05"). Uno que no es
 *  número no se puede ordenar: va detrás. */
export function numeroDeTarea(codigo: string): number {
  const limpio = codigo.trim();
  return /^\d+$/.test(limpio) ? Number(limpio) : Number.POSITIVE_INFINITY;
}

const estaCerrada = (t: TareaConEstado) => t.cerrada || t.movimiento?.estado === FINALIZADA;

function pasoDe(t: TareaConEstado, conQuien: boolean): PasoDonde {
  return {
    paso: t.centro ? nombreDeCentro(t.centro) : capitalizaFrase(t.descripcion),
    tarea: capitalizaFrase(t.descripcion),
    quien: conQuien ? (t.movimiento?.nombre ?? null) : null,
    desde: conQuien ? (t.movimiento?.desde ?? null) : null,
  };
}

/** null = la OF no tiene trabajo pendiente. Misma regla que el índice
 *  (trabajo_abierto): FINALIZAR cerrada manda; si no, cuenta lo que tiene
 *  centro, más FINALIZAR aunque no lo tenga. */
export function dondeEstaOF(orden: string, tareas: readonly TareaConEstado[]): DondeOF | null {
  if (tareas.some((t) => t.esFinalizar && estaCerrada(t))) return null;
  const abiertas = tareas.filter((t) => (t.centro || t.esFinalizar) && !estaCerrada(t));
  if (abiertas.length === 0) return null;
  const enCurso = abiertas.filter((t) => t.movimiento?.estado === EN_CURSO).map((t) => pasoDe(t, true));
  const pausadas = abiertas.filter((t) => t.movimiento?.estado === PAUSADA).map((t) => pasoDe(t, true));
  let siguientes: PasoDonde[] = [];
  if (enCurso.length === 0 && pausadas.length === 0) {
    const minimo = Math.min(...abiertas.map((t) => numeroDeTarea(t.codigo)));
    siguientes = abiertas.filter((t) => numeroDeTarea(t.codigo) === minimo).map((t) => pasoDe(t, false));
  }
  return { orden, enCurso, pausadas, siguientes };
}

export function dondeEstaPedido(tareas: readonly TareaConEstado[]): DondeOF[] {
  const porOrden = new Map<string, TareaConEstado[]>();
  for (const t of tareas) {
    const suyas = porOrden.get(t.orden);
    if (suyas) suyas.push(t);
    else porOrden.set(t.orden, [t]);
  }
  return [...porOrden].map(([orden, suyas]) => dondeEstaOF(orden, suyas)).filter((d): d is DondeOF => d !== null);
}

const unicos = (textos: string[]) => [...new Set(textos)];

/** Una línea para la fila: «Haciendo: Corte (Ana) · Pausado: … · Siguiente: …».
 *  Se juntan todas las OF sin repetir: en la fila no cabe una línea por OF, y
 *  la ficha ya las separa. */
export function fraseDonde(donde: readonly DondeOF[]): string | null {
  const conQuien = (p: PasoDonde) => (p.quien ? `${p.paso} (${p.quien})` : p.paso);
  const enCurso = unicos(donde.flatMap((d) => d.enCurso).map(conQuien));
  const pausadas = unicos(donde.flatMap((d) => d.pausadas).map(conQuien));
  const siguientes = unicos(donde.flatMap((d) => d.siguientes).map((p) => p.paso));
  const trozos: string[] = [];
  if (enCurso.length) trozos.push(`Haciendo: ${enCurso.join(", ")}`);
  if (pausadas.length) trozos.push(`Pausado: ${pausadas.join(", ")}`);
  if (siguientes.length) trozos.push(`Siguiente: ${siguientes.join(", ")}`);
  return trozos.length ? trozos.join(" · ") : null;
}

/** Lo que dice la fila en «dónde está». Entregado calla: la fecha de al lado
 *  ya dice «Entregado el …». En fábrica sin tareas que enseñar (RPS no
 *  contestó, o la regla no encontró ninguna abierta) se dice sin más. */
export function textoSituacion(situacion: SituacionPedido, donde: readonly DondeOF[]): string | null {
  if (situacion === "entregado") return null;
  if (situacion === "salir") return "Fabricado, esperando salir";
  return fraseDonde(donde) ?? "En fábrica";
}
```

- [ ] **Step 5: Ejecutar y ver que pasa**

Run: `pnpm vitest run src/lib/__tests__/consulta-donde.test.ts src/lib/__tests__/publico.test.ts`
Expected: PASS.

- [ ] **Step 6: Tipos y commit**

Run: `npx tsc --noEmit`
Expected: sin errores.

```bash
git add src/lib/consulta-donde.ts src/lib/__tests__/consulta-donde.test.ts src/lib/publico.ts
git commit -m "feat(consulta): por dónde va cada OF y quién la tiene"
```

---

### Task 4: La ficha del equipo, recortada para el invitado

**Files:**
- Modify: `src/lib/publico.ts` (añadir `PedidoConsultaDetalle` y `detalleConsulta` al final)
- Test: `src/lib/__tests__/publico-detalle.test.ts`

**Interfaces:**
- Consumes: `SituacionPedido` (`src/lib/consulta.ts`, Task 2); `DondeOF` (`src/lib/consulta-donde.ts`, Task 3); `documentoPublico` (privada, ya en `publico.ts`).
- Produces:
  - `interface PedidoConsultaDetalle { codigo: string; cliente: string | null; negocio: string | null; ciudadEntrega: string | null; fechaSolicitud: string | null; piezas: number; familias: string[]; situacion: SituacionPedido | null; fechaEntregado: string | null; donde: DondeOF[]; ofs: HistorialOF[]; documentos: DocumentoRps[] }`
  - `detalleConsulta(detalle: HistorialPedidoDetalle, extra: { situacion: SituacionPedido | null; fechaEntregado: string | null; donde: DondeOF[] }): PedidoConsultaDetalle`

- [ ] **Step 1: Escribir los tests (fallan)**

Crear `src/lib/__tests__/publico-detalle.test.ts`:

```ts
import { expect, test } from "vitest";
import type { HistorialOF, HistorialPedidoDetalle } from "../historial";
import { detalleConsulta } from "../publico";

// La lista blanca del detalle del invitado. Se prueba con un objeto hecho a
// mano porque el mock de desarrollo no genera ni notasProduccion ni
// materiales: sin esto, la mitad del recorte nunca se ejercitaría.

function detalle(): HistorialPedidoDetalle {
  const of = {
    codigo: "0230001",
    descripcion: "Toldo cofre",
    tiempoImputadoMin: 120,
    quien: ["Juan Pérez"],
    centro: "ot" as const,
    personas: [{ nombre: "Juan Pérez", min: 120 }],
    tareas: [{ codigo: "010", descripcion: "Plantear", tiempoImputadoMin: 120, personas: [{ nombre: "Juan Pérez", min: 120 }] }],
    autorRegistrado: "Juan Pérez",
    revisorRegistrado: "Jaime López",
    rol: { planteoMin: 100, revisionMin: 20, planteo: [], revision: [] },
    materiales: [{ texto: "LONA ACRÍLICA · 5", apartado: true }],
    notasProduccion: "BELEN AB - se devolvió por medidas mal tomadas",
    // Un campo que el Historial añadiera mañana no puede salir solo.
    campoNuevoInterno: "no debería salir",
  } as HistorialOF;
  return {
    estadoActual: "En curso",
    codigo: "AR.26.09999",
    cliente: "Cliente de prueba",
    negocio: "Negocio",
    ciudadEntrega: "Arzúa",
    prioridad: 2,
    fechaSolicitud: "2026-01-01",
    fechaFinalizacion: "2026-01-05",
    piezas: 3,
    familias: ["TOLDO NUEVO"],
    comentarioVenta: "Entre nosotros: cliente pesado, avisar a ventas",
    scanUrl: "/api/pedidos/AR.26.09999.pdf",
    ofs: [of],
    documentos: [
      { descripcion: "Planteamiento", archivo: "plan.pdf", clase: "Planteamiento", url: "/api/historial/AR.26.09999/documento/0" },
      { descripcion: "Sin fichero", archivo: "x.msg", clase: "Documento", url: null },
    ],
  };
}

const extra = { situacion: "fabrica" as const, fechaEntregado: null, donde: [] };

test("la cabecera interna no sale", () => {
  const d = detalleConsulta(detalle(), extra) as unknown as Record<string, unknown>;
  for (const clave of ["estadoActual", "prioridad", "comentarioVenta", "scanUrl", "fechaFinalizacion"]) {
    expect(d).not.toHaveProperty(clave);
  }
  expect(d.codigo).toBe("AR.26.09999");
  expect(d.ciudadEntrega).toBe("Arzúa");
});

test("vuelven los nombres, los tiempos y quién planteó y revisó: la ficha del equipo", () => {
  const of = detalleConsulta(detalle(), extra).ofs[0];
  expect(of.quien).toEqual(["Juan Pérez"]);
  expect(of.personas).toEqual([{ nombre: "Juan Pérez", min: 120 }]);
  expect(of.tiempoImputadoMin).toBe(120);
  expect(of.tareas?.[0]).toEqual({ codigo: "010", descripcion: "Plantear", tiempoImputadoMin: 120, personas: [{ nombre: "Juan Pérez", min: 120 }] });
  expect(of.autorRegistrado).toBe("Juan Pérez");
  expect(of.revisorRegistrado).toBe("Jaime López");
  expect(of.rol?.planteoMin).toBe(100);
  expect(of.materiales).toHaveLength(1);
});

test("las notas de producción y lo que no está en la lista blanca, no", () => {
  const d = detalleConsulta(detalle(), extra);
  const of = d.ofs[0] as unknown as Record<string, unknown>;
  expect(of).not.toHaveProperty("notasProduccion");
  expect(of).not.toHaveProperty("campoNuevoInterno");
  const crudo = JSON.stringify(d);
  expect(crudo).not.toContain("devolvió");
  expect(crudo).not.toContain("cliente pesado");
});

test("los documentos apuntan a la ruta pública; sin fichero se queda en null", () => {
  const d = detalleConsulta(detalle(), extra);
  expect(d.documentos[0].url).toBe("/api/publico/pedidos/AR.26.09999/documento/0");
  expect(d.documentos[1].url).toBeNull();
});

test("situación, fecha de salida y dónde está pasan tal cual", () => {
  const donde = [{ orden: "0230001", enCurso: [], pausadas: [], siguientes: [{ paso: "Corte", tarea: "Cortar", quien: null, desde: null }] }];
  const d = detalleConsulta(detalle(), { situacion: "entregado", fechaEntregado: "2026-09-14", donde });
  expect(d.situacion).toBe("entregado");
  expect(d.fechaEntregado).toBe("2026-09-14");
  expect(d.donde).toEqual(donde);
});
```

- [ ] **Step 2: Ejecutar y ver que falla**

Run: `pnpm vitest run src/lib/__tests__/publico-detalle.test.ts`
Expected: FAIL, `detalleConsulta is not a function` (o error de import).

- [ ] **Step 3: Escribir `detalleConsulta`**

En `src/lib/publico.ts`, cambiar el import de tipos de la línea 2 por:

```ts
import type { DocumentoRps, HistorialOF, HistorialPedidoDetalle } from "./historial";
import type { SituacionPedido } from "./consulta";
import type { DondeOF } from "./consulta-donde";
```

y añadir al final del fichero:

```ts
// ─── El detalle, segunda versión: la ficha del equipo ───────────────────────
// Corrección de Iván al rehacer la consulta: el invitado ve la MISMA ficha que
// el equipo —por centro, quién trabajó y cuánto, y dentro de cada OF sus tareas
// con nombres y tiempos—, porque un comercial necesita saber a quién llamar.
// Lo que sigue sin salir nunca: notas (del pedido, de producción, de
// devolución), causas de rechazo, marcas de revisión, comentario de venta,
// prioridad y estado interno.
//
// Campo a campo y a propósito: cada línea es un «sí» explícito, y lo que no
// está escrito no sale aunque el Historial añada un campo mañana.

export interface PedidoConsultaDetalle {
  codigo: string;
  cliente: string | null;
  negocio: string | null;
  ciudadEntrega: string | null;
  fechaSolicitud: string | null;
  piezas: number;
  familias: string[];
  /** null si la lista en memoria todavía no está hecha. */
  situacion: SituacionPedido | null;
  /** yyyy-mm-dd del último albarán, solo si ya salió. */
  fechaEntregado: string | null;
  donde: DondeOF[];
  ofs: HistorialOF[];
  documentos: DocumentoRps[];
}

function ofConsulta(of: HistorialOF): HistorialOF {
  const salida: HistorialOF = {
    codigo: of.codigo,
    descripcion: of.descripcion,
    tiempoImputadoMin: of.tiempoImputadoMin,
    quien: of.quien,
  };
  if (of.centro !== undefined) salida.centro = of.centro;
  if (of.personas) salida.personas = of.personas;
  if (of.tareas) {
    salida.tareas = of.tareas.map((t) => ({
      codigo: t.codigo,
      descripcion: t.descripcion,
      tiempoImputadoMin: t.tiempoImputadoMin,
      personas: t.personas,
    }));
  }
  // Quién consta como autor y revisor, y el reparto planteo/revisión: es
  // quién lleva el pedido, no a quién se lo devolvieron ni por qué.
  if (of.autorRegistrado !== undefined) salida.autorRegistrado = of.autorRegistrado;
  if (of.revisorRegistrado !== undefined) salida.revisorRegistrado = of.revisorRegistrado;
  if (of.rol) salida.rol = of.rol;
  if (of.rolDeducido) salida.rolDeducido = of.rolDeducido;
  if (of.materiales) salida.materiales = of.materiales;
  // notasProduccion NO: es una nota, y las notas no salen de casa.
  return salida;
}

export function detalleConsulta(
  detalle: HistorialPedidoDetalle,
  extra: { situacion: SituacionPedido | null; fechaEntregado: string | null; donde: DondeOF[] },
): PedidoConsultaDetalle {
  return {
    codigo: detalle.codigo,
    cliente: detalle.cliente,
    negocio: detalle.negocio,
    ciudadEntrega: detalle.ciudadEntrega,
    fechaSolicitud: detalle.fechaSolicitud,
    piezas: detalle.piezas,
    familias: detalle.familias,
    situacion: extra.situacion,
    fechaEntregado: extra.fechaEntregado,
    donde: extra.donde,
    ofs: detalle.ofs.map(ofConsulta),
    documentos: detalle.documentos.map(documentoPublico),
  };
}
```

Si `npx tsc --noEmit` dice que `rolDeducido` no existe en `HistorialOF`, quitar esa línea (y solo esa): significa que el campo se llama distinto o ya no está, y `HistorialCentros` no lo necesita.

- [ ] **Step 4: Ejecutar y ver que pasa**

Run: `pnpm vitest run src/lib/__tests__/publico-detalle.test.ts`
Expected: PASS.

- [ ] **Step 5: Tipos y commit**

Run: `npx tsc --noEmit`
Expected: sin errores.

```bash
git add src/lib/publico.ts src/lib/__tests__/publico-detalle.test.ts
git commit -m "feat(consulta): el detalle del invitado es la ficha del equipo sin notas"
```

---

### Task 5: El servidor junta índice, RPS y OLANET

**Files:**
- Create: `src/lib/server/olanet-movimientos.ts`
- Modify: `src/lib/consulta.ts` (añadir `PedidoConsulta`, `RespuestaConsulta`, `pedidoConsulta`)
- Modify: `src/lib/server/publico-db.ts` (añadir `tareasDePedidos`, `leerDonde`, `leerPaginaConsulta`, `leerDetalleConsulta`, `paginaMockConsulta`)
- Test: `src/lib/__tests__/consulta-pedido.test.ts`, `src/lib/__tests__/publico-db-olanet.test.ts`

**Interfaces:**
- Consumes: `filtrarConsulta`, `situacionDe`, `diaIso`, `diaDeFila`, `estadoEfectivo` (Task 2); `dondeEstaPedido`, `TareaConEstado`, `DondeOF` (Task 3); `detalleConsulta`, `PedidoConsultaDetalle` (Task 4); `getPool`, `getPoolOlanet` (`server/db.ts`); `nombresHistorial()` (`server/nombres-historial.ts`); `rescateOtSql()` (privada, ya en `publico-db.ts`).
- Produces:
  - `src/lib/server/olanet-movimientos.ts`: `claveFase(orden: string, fase: string): string`; `interface UltimoMovimiento { estado: number; operario: string | null; fecha: Date | null }`; `ultimosMovimientos(ordenes: readonly string[]): Promise<Map<string, UltimoMovimiento>>` (lanza si OLANET falla).
  - `src/lib/consulta.ts`: `interface PedidoConsulta { codigo: string; cliente: string | null; negocio: string | null; ciudadEntrega: string | null; situacion: SituacionPedido; fechaEntrega: string | null; fechaEntregado: string | null; dia: string | null; fueraDePlazo: boolean; familias: string[]; donde: DondeOF[] }`; `interface RespuestaConsulta { pedidos: PedidoConsulta[]; hasMore: boolean; familias: string[]; porDia: Record<string, number> | null; estado: EstadoConsulta }`; `pedidoConsulta(b: BaseHistorial, info: InfoPedidoHistorial | undefined, donde: DondeOF[], hoy: string): PedidoConsulta`.
  - `src/lib/server/publico-db.ts`: `leerDonde(pedidos: readonly string[]): Promise<Map<string, DondeOF[]>>`; `leerPaginaConsulta(f: FiltrosConsulta): Promise<RespuestaConsulta>`; `leerDetalleConsulta(pedido: string): Promise<PedidoConsultaDetalle>`. `ListaEnConstruccion` se queda como está.

- [ ] **Step 1: Test de la fila (falla)**

Crear `src/lib/__tests__/consulta-pedido.test.ts`:

```ts
import { expect, test } from "vitest";
import type { BaseHistorial } from "../historial-indice";
import { pedidoConsulta } from "../consulta";

const b = (p: Partial<BaseHistorial>): BaseHistorial => ({
  pedido: "SA.26.00927",
  fechaPedido: Date.UTC(2026, 8, 1),
  nOf: 1,
  tieneSeccion: false,
  pendienteSeccion: false,
  pendienteTotal: false,
  fechaEntrega: Date.UTC(2026, 8, 11),
  pendienteEntrega: false,
  trabajoAbierto: false,
  fechaEntregado: Date.UTC(2026, 8, 14),
  finalizada: null,
  ...p,
});

const info = { cliente: "CLIENTE", negocio: null, ciudadEntrega: "SANTIAGO", familias: ["TOLDO"], ordenes: "", textos: "" };

test("entregado: la fecha de salida es la del albarán, no la solicitada, y nunca fuera de plazo", () => {
  // SA.26.00927: se pidió para el 11/09 y su albarán es del 14/09.
  const p = pedidoConsulta(b({}), info, [], "2026-09-15");
  expect(p).toMatchObject({ situacion: "entregado", fechaEntrega: "2026-09-11", fechaEntregado: "2026-09-14", dia: "2026-09-14", fueraDePlazo: false, ciudadEntrega: "SANTIAGO" });
});

test("sin entregar: el día es la entrega solicitada, y fuera de plazo si ya pasó", () => {
  const p = pedidoConsulta(b({ pendienteEntrega: true, trabajoAbierto: true, fechaEntregado: Date.UTC(2026, 8, 1) }), info, [], "2026-09-15");
  expect(p).toMatchObject({ situacion: "fabrica", fechaEntregado: null, dia: "2026-09-11", fueraDePlazo: true });
});
```

Run: `pnpm vitest run src/lib/__tests__/consulta-pedido.test.ts`
Expected: FAIL, `pedidoConsulta is not a function`.

- [ ] **Step 2: Añadir la fila a `src/lib/consulta.ts`**

Cambiar el import de `./historial-indice` por:

```ts
import { coincideBusqueda, type BaseHistorial, type IndiceHistorial, type InfoPedidoHistorial } from "./historial-indice";
import type { DondeOF } from "./consulta-donde";
```

y añadir al final:

```ts
/** Una fila de la lista tal como sale de casa: nada que no se pinte. */
export interface PedidoConsulta {
  codigo: string;
  cliente: string | null;
  negocio: string | null;
  ciudadEntrega: string | null;
  situacion: SituacionPedido;
  fechaEntrega: string | null;
  /** Solo si ya salió: una fecha de salida en un pedido sin entregar sería de
   *  una entrega parcial, y la fila diría que salió cuando no. */
  fechaEntregado: string | null;
  /** El día que agrupa la fila (`diaDeFila`). */
  dia: string | null;
  fueraDePlazo: boolean;
  familias: string[];
  /** Solo en fábrica; vacío en lo demás. */
  donde: DondeOF[];
}

export interface RespuestaConsulta {
  pedidos: PedidoConsulta[];
  hasMore: boolean;
  familias: string[];
  porDia: Record<string, number> | null;
  estado: EstadoConsulta;
}

export function pedidoConsulta(
  b: BaseHistorial,
  info: InfoPedidoHistorial | undefined,
  donde: DondeOF[],
  hoy: string,
): PedidoConsulta {
  const situacion = situacionDe(b);
  const fechaEntrega = diaIso(b.fechaEntrega);
  return {
    codigo: b.pedido,
    cliente: info?.cliente ?? null,
    negocio: info?.negocio ?? null,
    ciudadEntrega: info?.ciudadEntrega ?? null,
    situacion,
    fechaEntrega,
    fechaEntregado: situacion === "entregado" ? diaIso(b.fechaEntregado) : null,
    dia: diaDeFila(b),
    fueraDePlazo: situacion !== "entregado" && fechaEntrega !== null && fechaEntrega < hoy,
    familias: info?.familias ?? [],
    donde,
  };
}
```

Run: `pnpm vitest run src/lib/__tests__/consulta-pedido.test.ts`
Expected: PASS.

- [ ] **Step 3: Test de «OLANET caído» (falla)**

Crear `src/lib/__tests__/publico-db-olanet.test.ts`:

```ts
import { beforeAll, expect, test, vi } from "vitest";

// Con OLANET caído, la lista tiene que cargar igual: se dice por dónde va el
// pedido, sin nombres. RPS se simula con una fila por tarea.

vi.mock("../server/db", () => {
  const filas = [
    { pedido: "AR.26.04082", orden: "0231429", tarea: "5", descripcion: "PLANTEAR Y PREPARAR ARCHIVOS", centro: "CALDERERIA", es_fin: 0, cerrada: 0 },
    { pedido: "AR.26.04082", orden: "0231429", tarea: "2", descripcion: "PLANTEAR", centro: "OFICINA TECNICA ARZUA", es_fin: 0, cerrada: 1 },
  ];
  const request = () => {
    const req = { input: () => req, query: async () => ({ recordset: filas }) };
    return req;
  };
  return {
    getPool: async () => ({ request }),
    getPoolOlanet: async () => { throw new Error("OLANET no contesta"); },
  };
});

vi.mock("../server/nombres-historial", () => ({
  nombresHistorial: async () => new Map([["187", "Adrián Quinteiro"]]),
}));

let leerDonde: typeof import("../server/publico-db").leerDonde;

beforeAll(async () => {
  process.env.DATASOURCE = "rps";
  ({ leerDonde } = await import("../server/publico-db"));
});

test("sin OLANET, cada pedido en fábrica sigue diciendo por dónde va, sin nombres", async () => {
  const aviso = vi.spyOn(console, "warn").mockImplementation(() => {});
  const donde = await leerDonde(["AR.26.04082"]);
  expect(donde.get("AR.26.04082")).toEqual([
    { orden: "0231429", enCurso: [], pausadas: [], siguientes: [{ paso: "Calderería", tarea: "Plantear y preparar archivos", quien: null, desde: null }] },
  ]);
  expect(aviso).toHaveBeenCalled();
});

test("sin pedidos no se pregunta a nadie", async () => {
  expect((await leerDonde([])).size).toBe(0);
});
```

Run: `pnpm vitest run src/lib/__tests__/publico-db-olanet.test.ts`
Expected: FAIL, `leerDonde is not a function`.

- [ ] **Step 4: Escribir `src/lib/server/olanet-movimientos.ts`**

```ts
import sql from "mssql";
import { getPoolOlanet } from "./db";

// ─── Quién tiene cada tarea, según OLANET ────────────────────────────────────
// RPS no guarda quién tiene una tarea ni si está pausada: tgm_estadosof_olanet
// solo trae orden, fase, estado y fecha. Está en OLANET: scg_Fases (un
// boletín por OF y fase) y sch_FasesMov (cada movimiento de ese boletín, con
// su operario_id, que es el CodEmployee de RPS).
//
// Por página y en dos pasos: preguntar por todas las tareas pausadas de golpe
// pasó de 3 minutos. Así son 538 ms para 40 OF (medido el 15/09/2026).
//
// LOS TIPOS NO SON OPCIONALES: Orden es varchar(20) e IdBoletin bigint. Un
// texto sin tipo viaja como nvarchar, SQL Server convierte la columna fila a
// fila y no usa el índice de Orden: 5.522 ms contra 8 ms para las mismas OF.

/** Misma clave con que publico-db.ts junta las tareas de RPS: código de OF y
 *  de tarea tal cual, sin normalizar el cero de delante (hay OF con la tarea
 *  "2" y la "02" a la vez, y son tareas distintas). */
export const claveFase = (orden: string, fase: string): string => `${orden.trim()}:${fase.trim()}`;

export interface UltimoMovimiento {
  estado: number;
  operario: string | null;
  fecha: Date | null;
}

/** Muy por debajo del tope de 2.100 parámetros de SQL Server. */
const TROZO = 500;

function trozos<T>(lista: readonly T[]): T[][] {
  const salida: T[][] = [];
  for (let i = 0; i < lista.length; i += TROZO) salida.push(lista.slice(i, i + TROZO));
  return salida;
}

/** Último movimiento de cada tarea de esas OF, por `claveFase`. Lanza si
 *  OLANET falla: decide quien llama qué hacer (la consulta sigue sin nombres). */
export async function ultimosMovimientos(ordenes: readonly string[]): Promise<Map<string, UltimoMovimiento>> {
  const salida = new Map<string, UltimoMovimiento>();
  const unicas = [...new Set(ordenes.map((o) => o.trim()).filter(Boolean))];
  if (unicas.length === 0) return salida;
  const pool = await getPoolOlanet();

  const faseDe = new Map<string, string>();
  for (const trozo of trozos(unicas)) {
    const req = pool.request();
    const marcas = trozo.map((o, i) => {
      req.input(`o${i}`, sql.VarChar(20), o);
      return `@o${i}`;
    });
    const r = await req.query<{ IdBoletin: string | number; Orden: string | null; Fase: string | null }>(
      `SELECT IdBoletin, Orden, Fase FROM dbo.scg_Fases WHERE Orden IN (${marcas.join(",")})`,
    );
    for (const f of r.recordset) {
      if (!f.Orden || !f.Fase) continue;
      faseDe.set(String(f.IdBoletin), claveFase(f.Orden, f.Fase));
    }
  }

  for (const trozo of trozos([...faseDe.keys()])) {
    const req = pool.request();
    const marcas = trozo.map((b, i) => {
      req.input(`b${i}`, sql.BigInt, b);
      return `@b${i}`;
    });
    const r = await req.query<{ IdBoletin: string | number; IdEstadoOF: number; operario_id: string | number | null; dhMovimiento: Date | null }>(
      `SELECT IdBoletin, IdEstadoOF, operario_id, dhMovimiento FROM dbo.sch_FasesMov WHERE IdBoletin IN (${marcas.join(",")})`,
    );
    for (const f of r.recordset) {
      const clave = faseDe.get(String(f.IdBoletin));
      if (!clave) continue;
      const previo = salida.get(clave);
      const cuando = f.dhMovimiento?.getTime() ?? -Infinity;
      // Una OF y fase puede tener más de un boletín: manda el movimiento más
      // reciente de cualquiera de ellos.
      if (previo && (previo.fecha?.getTime() ?? -Infinity) > cuando) continue;
      const operario = f.operario_id === null ? "" : String(f.operario_id).trim();
      salida.set(clave, { estado: f.IdEstadoOF, operario: operario || null, fecha: f.dhMovimiento });
    }
  }
  return salida;
}
```

- [ ] **Step 5: Añadir la parte de servidor a `src/lib/server/publico-db.ts`**

Añadir estos imports arriba (sin quitar los que hay; los viejos se van en la Task 8):

```ts
import sql from "mssql";
import { nombresHistorial } from "./nombres-historial";
import { claveFase, ultimosMovimientos, type UltimoMovimiento } from "./olanet-movimientos";
import {
  diaIso,
  estadoEfectivo,
  filtrarConsulta,
  pedidoConsulta,
  situacionDe,
  type FiltrosConsulta,
  type PedidoConsulta,
  type RespuestaConsulta,
  type SituacionPedido,
} from "../consulta";
import { dondeEstaPedido, type DondeOF, type TareaConEstado } from "../consulta-donde";
import { detalleConsulta, type PedidoConsultaDetalle } from "../publico";
```

(`detallePublico`, `filtrarPublico`, etc. siguen importándose de `../publico` en el import existente; se juntan los dos imports de `../publico` en uno.)

Añadir al final del fichero:

```ts
// ─── Segunda versión: dónde está y quién lo tiene ───────────────────────────

interface FilaTarea {
  pedido: string | null;
  orden: string | null;
  tarea: string | null;
  descripcion: string | null;
  centro: string | null;
  es_fin: number;
  cerrada: number;
}

/** Las tareas de las OF de esos pedidos, con si son FINALIZAR y si están
 *  cerradas, con la MISMA regla que el índice (historial-finalizacion-sql.ts:
 *  Finalizacion, es_fin, terminada). Con otra regla, un pedido «en fábrica»
 *  podría no tener dónde estar. */
async function tareasDePedidos(pedidos: readonly string[]): Promise<FilaTarea[]> {
  const pool = await getPool();
  const req = pool.request();
  const marcas = pedidos.map((p, i) => {
    req.input(`p${i}`, sql.VarChar(25), p);
    return `@p${i}`;
  });
  const r = await req.query<FilaTarea>(`
    SELECT DISTINCT o.CodOrder AS pedido, mo.CodManufacturingOrder AS orden,
      t.CodMOTask AS tarea, t.Description AS descripcion, c.centro,
      CASE WHEN EXISTS (
          SELECT 1 FROM dbo.CPRMOResourceMachine fz
          WHERE fz.IDMOTask = t.IDMOTask AND UPPER(COALESCE(fz.Description,'')) LIKE '%FINALIZ%'
        ) OR UPPER(COALESCE(t.Description,'')) LIKE '%FINALIZ%' THEN 1 ELSE 0 END AS es_fin,
      CASE WHEN e.fin IS NOT NULL OR (${rescateOtSql()}) THEN 1 ELSE 0 END AS cerrada
    FROM dbo.FACOrderSL o
    JOIN dbo.FACOrderLineSL l ON l.IDOrder = o.IDOrder
    JOIN dbo.CPRManufacturingOrder mo ON mo.IDManufacturingOrder = l.IDManufacturingOrder
      AND mo.CodCompany = '001'
    JOIN dbo.CPRMOTask t ON t.IDManufacturingOrder = mo.IDManufacturingOrder
    -- Todas las tareas de 2026 tienen exactamente un centro (medido el
    -- 14/09/2026); el TOP 1 es por si un día no.
    OUTER APPLY (
      SELECT TOP 1 rm.Description AS centro FROM dbo.CPRMOResourceMachine rm
      WHERE rm.IDMOTask = t.IDMOTask ORDER BY rm.Description
    ) c
    LEFT JOIN (
      SELECT orden, fase, MAX(fecha_cambio) AS fin
      FROM dbo.tgm_estadosof_olanet WHERE idestadoof = 3 GROUP BY orden, fase
    ) e ON e.orden = mo.CodManufacturingOrder AND e.fase = t.CodMOTask
    WHERE o.CodCompany = '001' AND o.CodOrder IN (${marcas.join(",")})`);
  return r.recordset;
}

/** Pedido → dónde está cada OF con trabajo. Si OLANET no contesta, sin nombres
 *  ni pausas, pero con el «siguiente» que sale de RPS: una pantalla con menos
 *  detalle antes que un error. */
export async function leerDonde(pedidos: readonly string[]): Promise<Map<string, DondeOF[]>> {
  const salida = new Map<string, DondeOF[]>();
  if (pedidos.length === 0) return salida;
  const filas = await tareasDePedidos(pedidos);
  const ordenes = filas.map((f) => (f.orden ?? "").trim()).filter(Boolean);
  const [movimientos, nombres] = await Promise.all([
    ultimosMovimientos(ordenes).catch((e) => {
      console.warn("[consulta] OLANET no contesta, sale sin nombres:", (e as Error).message);
      return new Map<string, UltimoMovimiento>();
    }),
    nombresHistorial().catch(() => new Map<string, string>()),
  ]);

  const porPedido = new Map<string, TareaConEstado[]>();
  for (const f of filas) {
    const pedido = (f.pedido ?? "").trim();
    const orden = (f.orden ?? "").trim();
    const codigo = (f.tarea ?? "").trim();
    if (!pedido || !orden || !codigo) continue;
    const m = movimientos.get(claveFase(orden, codigo));
    const tarea: TareaConEstado = {
      orden,
      codigo,
      descripcion: f.descripcion ?? "",
      centro: f.centro?.trim() || null,
      esFinalizar: f.es_fin === 1,
      cerrada: f.cerrada === 1,
      movimiento: m
        ? { estado: m.estado, nombre: m.operario ? (nombres.get(m.operario) ?? null) : null, desde: m.fecha ? diaIso(m.fecha.getTime()) : null }
        : null,
    };
    const suyas = porPedido.get(pedido);
    if (suyas) suyas.push(tarea);
    else porPedido.set(pedido, [tarea]);
  }
  for (const [pedido, tareas] of porPedido) salida.set(pedido, dondeEstaPedido(tareas));
  return salida;
}

/** La página del invitado: el índice filtrado y, para lo que está en fábrica,
 *  dónde está. */
export async function leerPaginaConsulta(f: FiltrosConsulta): Promise<RespuestaConsulta> {
  const hoy = hoyISO();
  if (ES_MOCK) return paginaMockConsulta(f, hoy);

  await asegurarIndice();
  const indice = indiceSiListo();
  // Sin índice no hay lista: la consulta de respaldo recalcula toda la
  // historia y esta pantalla la mira la casa entera.
  if (!indice) throw new ListaEnConstruccion();

  const { filas, ...resto } = filtrarConsulta(indice, f, hoy);
  const enFabrica = filas.filter((b) => situacionDe(b) === "fabrica").map((b) => b.pedido);
  const donde = await leerDonde(enFabrica).catch((e) => {
    console.warn("[consulta] no se pudo leer por dónde va cada pedido:", (e as Error).message);
    return new Map<string, DondeOF[]>();
  });
  return {
    ...resto,
    pedidos: filas.map((b) => pedidoConsulta(b, indice.info.get(b.pedido), donde.get(b.pedido) ?? [], hoy)),
  };
}

/** La ficha del invitado. La situación sale del índice si ya está hecho; sin
 *  él, la ficha se enseña igual y sin rótulo de estado. */
export async function leerDetalleConsulta(pedido: string): Promise<PedidoConsultaDetalle> {
  if (ES_MOCK) {
    const detalle = await leerHistorialPedidoDetalle(pedido);
    return detalleConsulta(detalle, { situacion: null, fechaEntregado: null, donde: [] });
  }
  const b = indiceSiListo()?.base[SECCION_POR_DEFECTO].find((x) => x.pedido === pedido) ?? null;
  const situacion: SituacionPedido | null = b ? situacionDe(b) : null;
  const [detalle, donde] = await Promise.all([
    leerHistorialPedidoDetalle(pedido),
    situacion === "entregado"
      ? Promise.resolve(new Map<string, DondeOF[]>())
      : leerDonde([pedido]).catch(() => new Map<string, DondeOF[]>()),
  ]);
  return detalleConsulta(detalle, {
    situacion,
    fechaEntregado: situacion === "entregado" && b ? diaIso(b.fechaEntregado) : null,
    donde: situacion === "salir" ? [] : (donde.get(pedido) ?? []),
  });
}

/** Sin RPS (DATASOURCE distinto de "rps"): la web de desarrollo arranca igual.
 *  `estaFinalizado` separa fábrica de esperando salir, como ya hacía la
 *  primera versión; el mock no tiene entregas ni OLANET. */
function paginaMockConsulta(f: FiltrosConsulta, hoy: string): RespuestaConsulta {
  const q = f.q?.trim().toUpperCase() ?? "";
  const pedidos = PEDIDOS
    .filter((p) => !q || p.codigo.includes(q) || (p.cliente ?? "").toUpperCase().includes(q))
    .map((p): PedidoConsulta => {
      const situacion: SituacionPedido = estaFinalizado(p) ? "salir" : "fabrica";
      const fechaEntrega = p.fechaEntrega ?? null;
      return {
        codigo: p.codigo,
        cliente: p.cliente ?? null,
        negocio: null,
        ciudadEntrega: p.ciudadEntrega ?? null,
        situacion,
        fechaEntrega,
        fechaEntregado: null,
        dia: fechaEntrega,
        fueraDePlazo: fechaEntrega !== null && fechaEntrega < hoy,
        familias: [],
        donde: situacion === "fabrica"
          ? [{ orden: p.codigo, enCurso: [], pausadas: [], siguientes: [{ paso: "Oficina Técnica", tarea: "Plantear", quien: null, desde: null }] }]
          : [],
      };
    });
  return { pedidos, hasMore: false, familias: [], porDia: null, estado: estadoEfectivo(f) };
}
```

- [ ] **Step 6: Ejecutar y ver que pasa**

Run: `pnpm vitest run src/lib/__tests__/publico-db-olanet.test.ts src/lib/__tests__/consulta-pedido.test.ts`
Expected: PASS.

- [ ] **Step 7: Probar contra RPS y OLANET de verdad**

Crear `scripts/verificar-consulta-donde.test.ts`:

```ts
import { afterAll, expect, test } from "vitest";
import { getPool, getPoolOlanet } from "../src/lib/server/db";
import { leerDonde } from "../src/lib/server/publico-db";

// Contra RPS y OLANET reales, solo lectura. El pedido es el del ejemplo de la
// spec: si ya no está en fábrica cuando se ejecute, cambiar el código por otro
// que lo esté y apuntarlo en el informe.
//
// Opt-in: VALIDAR_RPS_UI=1 node --env-file=.env.local node_modules/vitest/vitest.mjs
// run scripts/verificar-consulta-donde.test.ts

const ACTIVO = process.env.VALIDAR_RPS_UI === "1";

afterAll(async () => {
  if (!ACTIVO) return;
  await (await getPool()).close();
  await (await getPoolOlanet()).close();
});

test.skipIf(!ACTIVO)("dónde está AR.26.04082, con nombres y en menos de 2 s", async () => {
  const t0 = Date.now();
  const donde = await leerDonde(["AR.26.04082"]);
  const ms = Date.now() - t0;
  console.info(ms, JSON.stringify(donde.get("AR.26.04082"), null, 2));
  expect(ms).toBeLessThan(2_000);
}, 60_000);
```

Run: `VALIDAR_RPS_UI=1 DATASOURCE=rps node --env-file=.env.local node_modules/vitest/vitest.mjs run scripts/verificar-consulta-donde.test.ts`
Expected: PASS. En la salida, comprobar a mano que alguna tarea en curso o pausada trae `quien` con un nombre (no un número). Si todas llegan con `quien: null` habiendo movimientos, el `operario_id` de OLANET no casa con las claves de `nombresHistorial()` (por ejemplo, ceros a la izquierda): PARAR e informar con un ejemplo de `operario_id`.

- [ ] **Step 8: Tipos y commit**

Run: `npx tsc --noEmit`
Expected: sin errores.

```bash
git add src/lib/server/olanet-movimientos.ts src/lib/server/publico-db.ts src/lib/consulta.ts src/lib/__tests__/consulta-pedido.test.ts src/lib/__tests__/publico-db-olanet.test.ts scripts/verificar-consulta-donde.test.ts
git commit -m "feat(consulta): la página y la ficha dicen dónde está cada pedido y quién lo tiene"
```

---

### Task 6: Las rutas públicas sirven la versión nueva

**Files:**
- Modify: `src/app/api/publico/pedidos/route.ts`
- Modify: `src/app/api/publico/pedidos/[pedido]/route.ts`
- Modify: `src/lib/__tests__/api-publico.test.ts`

**Interfaces:**
- Consumes: `normalizarFiltrosConsulta` (Task 2); `leerPaginaConsulta`, `leerDetalleConsulta`, `ListaEnConstruccion` (Task 5).
- Produces: `GET /api/publico/pedidos?estado=&paso=&familia=&desde=&hasta=&q=&page=` → `RespuestaConsulta` (503 con `{ construyendo: true }` mientras se construye el índice). `GET /api/publico/pedidos/[pedido]` → `PedidoConsultaDetalle`.

- [ ] **Step 1: Cambiar los tests de las rutas (fallan)**

En `src/lib/__tests__/api-publico.test.ts`:

(a) Quitar `import { detallePublico } from "../publico";`, `import type { HistorialPedidoDetalle } from "../historial";` y todo el bloque desde `// ─── detallePublico: la función pura que hace el recorte` hasta el último test de `detallePublico` incluido (`"detallePublico reescribe la URL de los documentos a la ruta pública"`). Esa lista blanca ya la prueba `publico-detalle.test.ts`.

(b) Sustituir los tres tests de la lista por:

```ts
test("la lista contesta sin sesión, con el estado con que filtró", async () => {
  const res = await getLista("estado=proximas");
  expect(res.status).toBe(200);
  const json = await res.json();
  expect(Array.isArray(json.pedidos)).toBe(true);
  expect(json.estado).toBe("proximas");
});

test("buscar sin elegir estado busca en todos", async () => {
  const json = await (await getLista("q=AR")).json();
  expect(json.estado).toBe("todos");
});

test("no se escapa NADA interno en la lista", async () => {
  const res = await getLista("estado=todos");
  const crudo = JSON.stringify(await res.json()).toLowerCase();
  for (const prohibido of ["nota", "causa", "devolucion", "devolución", "marca", "observacion", "comentario"]) {
    expect(crudo).not.toContain(prohibido);
  }
});

test("un estado que no existe cae en próximas entregas, no revienta", async () => {
  const res = await getLista("estado=loquesea&page=-3");
  expect(res.status).toBe(200);
});
```

(c) Sustituir el test `"el detalle no trae ni cabecera interna ni marcas de revisión por OF"` por:

```ts
test("el detalle no trae cabecera interna ni notas, y sí dónde está", async () => {
  // AR.26.05501 trae, en el mock, una OF "en_revision" con autor y revisor.
  const data = (await (await getDetalle("AR.26.05501")).json()) as Record<string, unknown>;
  for (const clave of ["comentarioVenta", "prioridad", "estadoActual", "scanUrl", "fechaFinalizacion"]) {
    expect(data).not.toHaveProperty(clave);
  }
  expect(JSON.stringify(data)).not.toContain("notasProduccion");
  expect(Array.isArray(data.donde)).toBe(true);
  expect(data).toHaveProperty("situacion");
});
```

Run: `pnpm vitest run src/lib/__tests__/api-publico.test.ts`
Expected: FAIL (`json.estado` undefined; `donde` no existe).

- [ ] **Step 2: Cambiar las rutas**

`src/app/api/publico/pedidos/route.ts`: cambiar los imports por

```ts
import { normalizarFiltrosConsulta } from "@/lib/consulta";
import { ListaEnConstruccion, leerPaginaConsulta } from "@/lib/server/publico-db";
```

el comentario de cabecera por

```ts
// ─── GET /api/publico/pedidos ────────────────────────────────────────────────
// La lista que ve quien NO tiene sesión: todos los pedidos de la casa con OF,
// filtrados por estado, paso, familia, fechas y búsqueda. Sale del índice en
// memoria; lo único que va a RPS y a OLANET es dónde está cada fila en fábrica.
//
// ESTA RUTA ES PÚBLICA A PROPÓSITO. Lo que se puede enseñar lo deciden
// lib/consulta.ts y server/publico-db.ts: aquí no se añade ni un campo.
```

y dentro de `GET`: `normalizarFiltrosPublicos(...)` → `normalizarFiltrosConsulta(...)`, `leerPaginaPublica(filtros)` → `leerPaginaConsulta(filtros)`.

`src/app/api/publico/pedidos/[pedido]/route.ts`: import `leerDetalleConsulta` en vez de `leerDetallePublico`, llamar a `leerDetalleConsulta(pedido)`, y sustituir el comentario de cabecera por:

```ts
// ─── GET /api/publico/pedidos/[pedido] ───────────────────────────────────────
// El pedido abierto, para quien no tiene sesión: la ficha del equipo (por
// centro, quién trabajó y cuánto, las OF con sus tareas), dónde está ahora y
// los documentos de RPS.
//
// Lo interno se quita AQUÍ, en el servidor, y no en la pantalla: la respuesta
// se lee escribiendo la dirección. La lista blanca es `detalleConsulta`
// (lib/publico.ts): ni notas, ni causas, ni comentario de venta, ni prioridad.
```

- [ ] **Step 3: Ejecutar y ver que pasa**

Run: `pnpm vitest run src/lib/__tests__/api-publico.test.ts`
Expected: PASS.

- [ ] **Step 4: Tipos y commit**

Run: `npx tsc --noEmit`
Expected: sin errores.

```bash
git add src/app/api/publico/pedidos/route.ts "src/app/api/publico/pedidos/[pedido]/route.ts" src/lib/__tests__/api-publico.test.ts
git commit -m "feat(consulta): las rutas públicas sirven la lista única y la ficha nueva"
```

---

### Task 7: La pantalla: buscador arriba, filtros, tarjetas por día y la ficha del equipo

**Files:**
- Create: `src/components/HistorialCentros.tsx` (sale de `src/components/HistorialDrawer.tsx:286-544`)
- Modify: `src/components/HistorialDrawer.tsx`
- Create: `src/lib/consulta-dias.ts`
- Test: `src/lib/__tests__/consulta-dias.test.ts`
- Modify: `src/components/VisitasCotView.tsx` (prop `busqueda`)
- Create: `src/components/ConsultaPedidos.tsx`
- Rewrite: `src/components/Consulta.tsx`

**Interfaces:**
- Consumes: `FiltrosConsulta`, `RespuestaConsulta`, `PedidoConsulta`, `ESTADOS_CONSULTA`, `PASOS_CONSULTA`, `textoFecha` (Tasks 2 y 5); `textoSituacion`, `DondeOF`, `PasoDonde` (Task 3); `PedidoConsultaDetalle` (Task 4); rutas de la Task 6; `tituloDia(d: Date, hoy: Date)` (`lib/historial-dias.ts`); `HistorialCentros({ ofs, seccion })`; `DocumentosRps({ documentos, clasePrimero })`; `FamiliaTag({ familia })`, `FamiliaIcon({ familia, className })`; `Select`; `SelectorFecha({ desde, hasta, onCambiar })`; `ErrorCarga({ mensaje, onReintentar })`; `TRAMO.fuera` (`lib/linea-tiempo.ts`).
- Produces: `HistorialCentros` en `src/components/HistorialCentros.tsx` (y reexportado desde `HistorialDrawer.tsx`); `agruparPedidosPorDia(pedidos: readonly PedidoConsulta[], opciones: { hoy: Date; totales: Record<string, number> }): DiaConsulta[]` con `DiaConsulta = { clave: string; titulo: string; pedidos: PedidoConsulta[]; total: number }`; `VisitasCotView({ base?, sondeo?, busqueda?: string })`; `ConsultaPedidos({ filtros: Omit<FiltrosConsulta, "page">; onFamilias: (familias: string[]) => void })`.

- [ ] **Step 1: Sacar la ficha del equipo a su propio fichero**

Motivo: `ConsultaPedidos` necesita `HistorialCentros`, y si lo importara de `HistorialDrawer.tsx` el invitado se descargaría también las notas y el resto de la ficha del equipo.

1. Crear `src/components/HistorialCentros.tsx` con esta cabecera y, debajo, las líneas 286 a 544 de `HistorialDrawer.tsx` copiadas tal cual (desde `/** El centro decide qué minutos se suman; la selección decide el desglose visible. */` hasta el final del fichero, que incluye `HistorialCentros`, `PersonasOF`, `Materiales`, `MaterialHistorico` y `NotasProduccion`):

```tsx
"use client";

import type { HistorialOF, MaterialOF } from "@/lib/historial";
import { personasConRol, personasDeOF, personasDeOFs, repartirMateriales, repartoDe } from "@/lib/historial";
import { fmtMin, ROL } from "@/lib/estado";
import { agruparCentros, centrosConDesglose } from "@/lib/historial-centros";
import { SECCIONES, type SeccionId } from "@/lib/secciones";
import { TareasDeOF } from "./HistorialTareas";
import {
  BOTON_DETALLE,
  CabeceraVentana,
  LINEA,
  LISTA,
  VentanaAnclada,
  useVentanaAnclada,
} from "./VentanaAnclada";

// ─── Tiempos por centro de la ficha del pedido ──────────────────────────────
// Vivía dentro de HistorialDrawer.tsx. Sale a su fichero porque la consulta
// sin login pinta la MISMA ficha, y la pantalla del invitado no debe arrastrar
// el resto del cajón del equipo (notas, parte escaneado, avisos).
```

2. En `HistorialDrawer.tsx`: borrar las líneas 286 a 544 y añadir, junto a los demás imports:

```tsx
import { HistorialCentros } from "./HistorialCentros";
```

y justo después de los imports:

```tsx
// Reexportado: los tests y quien ya lo importaba de aquí siguen funcionando.
export { HistorialCentros };
```

3. Run: `pnpm lint src/components/HistorialDrawer.tsx src/components/HistorialCentros.tsx`
Borrar de cada fichero SOLO los imports que lint marque como no usados (en `HistorialDrawer.tsx` serán, previsiblemente, `MaterialOF`, `personasConRol`, `personasDeOF`, `personasDeOFs`, `repartirMateriales`, `repartoDe`, `fmtMin`, `ROL`, `TareasDeOF`, `agruparCentros`, `centrosConDesglose` y los de `./VentanaAnclada`; en `HistorialCentros.tsx`, `SECCIONES` si no se usa). Repetir hasta que lint quede limpio.

4. Run: `npx tsc --noEmit` y `pnpm vitest run src/lib/__tests__/historial-ficha-personas.test.ts`
Expected: sin errores; PASS.

5. Commit:

```bash
git add src/components/HistorialCentros.tsx src/components/HistorialDrawer.tsx
git commit -m "refactor(historial): la ficha por centros sale a su propio componente"
```

- [ ] **Step 2: Test de la agrupación por días (falla)**

Crear `src/lib/__tests__/consulta-dias.test.ts`:

```ts
import { expect, test } from "vitest";
import type { PedidoConsulta } from "../consulta";
import { agruparPedidosPorDia } from "../consulta-dias";

const p = (codigo: string, dia: string | null): PedidoConsulta => ({
  codigo, cliente: null, negocio: null, ciudadEntrega: null, situacion: "fabrica",
  fechaEntrega: dia, fechaEntregado: null, dia, fueraDePlazo: false, familias: [], donde: [],
});

test("una tarjeta por día en el orden en que llegan, con el total del día entero", () => {
  const dias = agruparPedidosPorDia(
    [p("A", "2026-09-15"), p("B", "2026-09-15"), p("C", "2026-09-16"), p("D", null)],
    { hoy: new Date(2026, 8, 15), totales: { "2026-09-15": 5, "2026-09-16": 1, "sin-fecha": 1 } },
  );
  expect(dias.map((d) => [d.clave, d.pedidos.map((x) => x.codigo), d.total])).toEqual([
    ["2026-09-15", ["A", "B"], 5],
    ["2026-09-16", ["C"], 1],
    ["sin-fecha", ["D"], 1],
  ]);
  expect(dias[0].titulo.startsWith("Hoy, ")).toBe(true);
  expect(dias[0].titulo).toContain("15/09/26");
  expect(dias[1].titulo).toContain("16/09/26");
  expect(dias[2].titulo).toBe("Sin fecha");
});

test("sin total del servidor para ese día, cuenta lo cargado", () => {
  const dias = agruparPedidosPorDia([p("A", "2026-10-01")], { hoy: new Date(2026, 8, 15), totales: {} });
  expect(dias[0].total).toBe(1);
});
```

Run: `pnpm vitest run src/lib/__tests__/consulta-dias.test.ts`
Expected: FAIL, `Failed to resolve import "../consulta-dias"`.

- [ ] **Step 3: Escribir `src/lib/consulta-dias.ts`**

```ts
import type { PedidoConsulta } from "./consulta";
import { tituloDia } from "./historial-dias";

// ─── La lista del invitado, por días ─────────────────────────────────────────
// Igual que el Historial del equipo: una tarjeta por día con la fecha encima.
// El día es el de la entrega solicitada, o el de salida si ya salió
// (`PedidoConsulta.dia`). La lista ya llega ordenada: un día nuevo empieza
// cuando cambia la fecha.

export interface DiaConsulta {
  /** yyyy-mm-dd o "sin-fecha". */
  clave: string;
  titulo: string;
  pedidos: PedidoConsulta[];
  /** Pedidos del día en la consulta ENTERA (lo manda el servidor), no solo
   *  los cargados: si no, el número crece según se pulsa «Ver más». */
  total: number;
}

export function agruparPedidosPorDia(
  pedidos: readonly PedidoConsulta[],
  opciones: { hoy: Date; totales: Record<string, number> },
): DiaConsulta[] {
  const dias: DiaConsulta[] = [];
  for (const pedido of pedidos) {
    const clave = pedido.dia ?? "sin-fecha";
    let dia = dias.at(-1);
    if (!dia || dia.clave !== clave) {
      let titulo = "Sin fecha";
      if (pedido.dia) {
        const [y, m, d] = pedido.dia.split("-").map(Number);
        titulo = tituloDia(new Date(y, m - 1, d), opciones.hoy);
      }
      dia = { clave, titulo, pedidos: [], total: 0 };
      dias.push(dia);
    }
    dia.pedidos.push(pedido);
  }
  for (const dia of dias) dia.total = opciones.totales[dia.clave] ?? dia.pedidos.length;
  return dias;
}
```

Run: `pnpm vitest run src/lib/__tests__/consulta-dias.test.ts`
Expected: PASS.

- [ ] **Step 4: El buscador de visitas puede venir de fuera**

En `src/components/VisitasCotView.tsx`:

(a) Firma: detrás de `sondeo = true,` añadir `busqueda,`; en el tipo, detrás de `sondeo?: boolean;` añadir:

```ts
  /** El texto a buscar, cuando lo escribe otro. La consulta sin login tiene un
   *  solo buscador arriba para las dos pestañas: con esto, esta vista esconde
   *  el suyo y usa ese. Sin él, el de siempre. */
  busqueda?: string;
```

(b) Cambiar `const queryDebounced = useDebounced(query.trim(), 300);` por:

```ts
  const texto = busqueda ?? query;
  const queryDebounced = useDebounced(texto.trim(), 300);
```

(c) Envolver el `<label className="relative ml-auto min-w-64 flex-1 sm:max-w-sm">…</label>` del buscador en `{busqueda === undefined && ( … )}`.

(d) En los dos mensajes de «sin visitas» (líneas 331 y 340 hoy), cambiar `{query` por `{texto`.

Run: `npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 5: Escribir `src/components/ConsultaPedidos.tsx`**

```tsx
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { textoFecha, type FiltrosConsulta, type PedidoConsulta, type RespuestaConsulta } from "@/lib/consulta";
import { textoSituacion, type DondeOF, type PasoDonde } from "@/lib/consulta-donde";
import { agruparPedidosPorDia } from "@/lib/consulta-dias";
import { fmtDiaMesAno } from "@/lib/fechas";
import { TRAMO } from "@/lib/linea-tiempo";
import type { PedidoConsultaDetalle } from "@/lib/publico";
import { SECCION_POR_DEFECTO } from "@/lib/secciones";
import { DocumentosRps } from "./DocumentosRps";
import { ErrorCarga } from "./ErrorCarga";
import { FamiliaTag } from "./FamiliaTag";
import { HistorialCentros } from "./HistorialCentros";

// ─── Los pedidos de la casa, para quien solo mira ────────────────────────────
// Una sola lista. Se entra buscando; sin buscar, las próximas entregas. Cada
// fila dice de quién es, dónde está y para cuándo, y al abrirla sale la misma
// ficha que ve el equipo, con quién lo tiene. Ni un botón que guarde.

type Filtros = Omit<FiltrosConsulta, "page">;

function consultaDe(f: Filtros): string {
  const sp = new URLSearchParams({ estado: f.estado });
  for (const k of ["paso", "familia", "desde", "hasta", "q"] as const) {
    const v = f[k]?.trim();
    if (v) sp.set(k, v);
  }
  return sp.toString();
}

export function ConsultaPedidos({
  filtros,
  onFamilias,
}: {
  filtros: Filtros;
  /** Las familias que hay con los demás filtros puestos, para el desplegable. */
  onFamilias: (familias: string[]) => void;
}) {
  const [pedidos, setPedidos] = useState<PedidoConsulta[]>([]);
  const [resto, setResto] = useState<Omit<RespuestaConsulta, "pedidos"> | null>(null);
  const [page, setPage] = useState(0);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(false);
  /** 503: la lista en memoria se está construyendo (unos 35 s tras arrancar). */
  const [preparando, setPreparando] = useState(false);
  const peticion = useRef(0);
  // Un texto y no el objeto: el objeto es nuevo en cada render y dispararía
  // una consulta por render.
  const consulta = consultaDe(filtros);

  const cargar = useCallback(
    async (pagina: number, reemplazar: boolean) => {
      const esta = ++peticion.current;
      setCargando(true);
      setError(false);
      try {
        const sp = new URLSearchParams(consulta);
        sp.set("page", String(pagina));
        const res = await fetch(`/api/publico/pedidos?${sp}`, { cache: "no-store" });
        if (esta !== peticion.current) return;
        if (res.status === 503) {
          setPreparando(true);
          return;
        }
        if (!res.ok) throw new Error(String(res.status));
        const json: RespuestaConsulta = await res.json();
        // Llegó tarde: ya se escribió otra cosa en el buscador.
        if (esta !== peticion.current) return;
        const { pedidos: nuevos, ...demas } = json;
        setPreparando(false);
        setPedidos((previos) => (reemplazar ? nuevos : [...previos, ...nuevos]));
        setResto(demas);
        setPage(pagina);
        onFamilias(json.familias);
      } catch {
        if (esta === peticion.current) setError(true);
      } finally {
        if (esta === peticion.current) setCargando(false);
      }
    },
    [consulta, onFamilias],
  );

  // Con espera, para no lanzar una consulta por cada tecla del buscador.
  useEffect(() => {
    const t = setTimeout(() => void cargar(0, true), 300);
    return () => clearTimeout(t);
  }, [cargar]);

  // Mientras se construye la lista, se vuelve a preguntar sola: nadie tiene
  // por qué saber que hay que recargar.
  useEffect(() => {
    if (!preparando) return;
    const t = setTimeout(() => void cargar(0, true), 10_000);
    return () => clearTimeout(t);
  }, [preparando, cargar]);

  const dias = resto?.porDia ? agruparPedidosPorDia(pedidos, { hoy: new Date(), totales: resto.porDia }) : null;
  const fila = (p: PedidoConsulta) => <FilaConsulta key={p.codigo} pedido={p} />;

  return (
    <main className="mx-auto w-full max-w-[1100px] space-y-3 p-4">
      {error && <ErrorCarga mensaje="No se pudieron cargar los pedidos." onReintentar={() => void cargar(0, true)} />}

      {preparando && !error && (
        <div className="glass-panel grid min-h-32 place-items-center rounded-2xl px-6 text-center">
          <div>
            <p className="text-sm font-semibold text-text">Preparando la lista de pedidos…</p>
            <p className="mt-1 text-xs text-text-muted">
              Pasa la primera vez después de una actualización y tarda menos de un minuto. Esta pantalla se
              actualiza sola.
            </p>
          </div>
        </div>
      )}

      {!error && !preparando && !cargando && pedidos.length === 0 && (
        <div className="grid min-h-32 place-items-center rounded-xl border border-dashed border-border px-6 text-center">
          <p className="text-sm text-text-muted">
            {filtros.q?.trim() ? "Ningún pedido con esa búsqueda." : "No hay pedidos con estos filtros."}
          </p>
        </div>
      )}

      {/* Buscando o en «Todos» no hay días: van por fecha del pedido. */}
      {!dias && pedidos.length > 0 && (
        <p className="px-3 text-[11px] text-text-muted">
          {pedidos.length}
          {resto?.hasMore ? " y más" : ""} pedido{pedidos.length === 1 ? "" : "s"} · los más recientes primero
        </p>
      )}

      <div className="flex flex-col gap-3">
        {dias
          ? dias.map((dia, i) => (
              <section key={`${dia.clave}-${i}`} aria-label={dia.titulo}>
                <h3 className="mb-1 flex items-baseline gap-2 px-3 text-[11px] font-semibold text-text">
                  {dia.titulo}
                  <span className="font-normal text-text-muted">
                    · {dia.total} pedido{dia.total === 1 ? "" : "s"}
                  </span>
                </h3>
                <ul className="bloque-3d overflow-hidden rounded-xl">{dia.pedidos.map(fila)}</ul>
              </section>
            ))
          : pedidos.length > 0 && <ul className="bloque-3d overflow-hidden rounded-xl">{pedidos.map(fila)}</ul>}
      </div>

      {cargando && pedidos.length === 0 && !preparando && (
        <p role="status" className="py-2 text-center text-xs text-text-muted">Cargando…</p>
      )}
      {/* Montado mientras carga: si desaparece al pulsarlo, quien usa el
          teclado pierde el foco. */}
      {resto?.hasMore && (
        <div className="flex justify-center">
          <button
            type="button"
            onClick={() => void cargar(page + 1, false)}
            disabled={cargando}
            className="chip-3d h-9 rounded-lg px-4 text-xs font-semibold text-text disabled:cursor-wait disabled:opacity-60"
          >
            {cargando ? "Cargando…" : "Ver más"}
          </button>
        </div>
      )}
    </main>
  );
}

/** Código · cliente · ciudad · dónde está · fecha. Sin línea de tiempo: la
 *  fecha ya dice lo que hacía falta. */
function FilaConsulta({ pedido }: { pedido: PedidoConsulta }) {
  const [abierto, setAbierto] = useState(false);
  // Abierta una vez, la ficha se queda montada: no se repite la consulta a
  // RPS cada vez que se pliega y despliega.
  const [tocado, setTocado] = useState(false);
  const donde = textoSituacion(pedido.situacion, pedido.donde);
  const quien = [pedido.cliente ?? "—", pedido.ciudadEntrega].filter(Boolean).join(" · ");
  const id = `ficha-${pedido.codigo}`;

  return (
    <li className="border-b border-border last:border-b-0">
      <button
        type="button"
        aria-expanded={abierto}
        aria-controls={id}
        onClick={() => {
          setAbierto((a) => !a);
          setTocado(true);
        }}
        className="flex w-full flex-wrap items-baseline gap-x-3 gap-y-0.5 px-3 py-2 text-left hover:bg-[var(--glass-highlight)] focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-400"
      >
        <span className="font-mono text-sm font-semibold text-text">{pedido.codigo}</span>
        {/* Con suelo: un «dónde está» largo no puede aplastar de quién es. Si
            no caben, baja «dónde está» a otra línea (flex-wrap). */}
        <span className="min-w-[12rem] flex-1 truncate text-sm text-text-muted" title={quien}>
          {quien}
        </span>
        {donde && <span className="text-xs text-text">{donde}</span>}
        <span
          className="shrink-0 text-xs font-semibold text-text-muted"
          style={pedido.fueraDePlazo ? { color: TRAMO.fuera } : undefined}
        >
          {pedido.fueraDePlazo && "Fuera de plazo · "}
          {textoFecha(pedido)}
        </span>
        <svg
          viewBox="0 0 24 24"
          className={`size-4 shrink-0 self-center text-text-muted transition-transform ${abierto ? "rotate-180" : ""}`}
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          aria-hidden="true"
        >
          <path d="m6 9 6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {/* Siempre montado (con hidden): aria-controls no puede apuntar a un id
          que no existe. */}
      <div id={id} hidden={!abierto} className="border-t border-border px-3 py-3">
        {tocado && <FichaConsulta codigo={pedido.codigo} />}
      </div>
    </li>
  );
}

/** La ficha: dónde está ahora, la de centros del equipo y los documentos. Se
 *  pide al abrir: son 40 filas y casi ninguna se abre. */
function FichaConsulta({ codigo }: { codigo: string }) {
  const [detalle, setDetalle] = useState<PedidoConsultaDetalle | null>(null);
  const [error, setError] = useState(false);
  const [cargando, setCargando] = useState(true);

  const cargar = useCallback(() => {
    setCargando(true);
    setError(false);
    fetch(`/api/publico/pedidos/${encodeURIComponent(codigo)}`, { cache: "no-store" })
      .then((r) => {
        if (!r.ok) throw new Error(String(r.status));
        return r.json() as Promise<PedidoConsultaDetalle>;
      })
      .then(setDetalle)
      .catch(() => setError(true))
      .finally(() => setCargando(false));
  }, [codigo]);

  useEffect(() => {
    const t = setTimeout(() => cargar(), 0);
    return () => clearTimeout(t);
  }, [cargar]);

  if (cargando) return <p className="text-sm text-text-muted">Cargando…</p>;
  if (error || !detalle) return <ErrorCarga mensaje="No se pudo cargar el pedido." onReintentar={cargar} />;

  return (
    <div className="space-y-3">
      {detalle.familias.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          {detalle.familias.map((f) => (
            <FamiliaTag key={f} familia={f} />
          ))}
        </div>
      )}
      {detalle.donde.length > 0 && (
        <div className="bloque-3d rounded-xl px-3 py-2">
          <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-text-muted">Dónde está ahora</p>
          <DondeEsta donde={detalle.donde} />
        </div>
      )}
      {detalle.situacion === "salir" && (
        <p className="text-xs font-semibold text-text">Fabricado, esperando salir.</p>
      )}
      <HistorialCentros ofs={detalle.ofs} seccion={SECCION_POR_DEFECTO} />
      {/* El pedido escaneado, el primero: es el documento que todo el mundo
          busca aquí. */}
      <div className="bloque-3d rounded-xl px-3 py-2">
        <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-text-muted">Documentos de RPS</p>
        <DocumentosRps documentos={detalle.documentos} clasePrimero="Pedido escaneado" />
      </div>
    </div>
  );
}

/** Una línea por OF: quién lo está haciendo, quién lo tiene pausado o qué
 *  viene. Con el nombre, que es a quien hay que llamar. */
function DondeEsta({ donde }: { donde: DondeOF[] }) {
  return (
    <ul className="space-y-1.5">
      {donde.map((d) => (
        <li key={d.orden} className="text-xs">
          <span className="font-mono font-semibold text-text">OF {d.orden}</span>
          <ul className="mt-0.5 space-y-0.5 pl-3">
            {d.enCurso.map((p, i) => (
              <li key={`curso-${i}`}>
                <LineaPaso paso={p} conNombre="Lo está haciendo" sinNombre="En curso" />
              </li>
            ))}
            {d.pausadas.map((p, i) => (
              <li key={`pausa-${i}`}>
                <LineaPaso paso={p} conNombre="Lo tiene pausado" sinNombre="Pausado" />
              </li>
            ))}
            {d.siguientes.length > 0 && (
              <li className="text-text-muted">Siguiente: {d.siguientes.map((p) => p.paso).join(", ")}</li>
            )}
          </ul>
        </li>
      ))}
    </ul>
  );
}

function LineaPaso({ paso, conNombre, sinNombre }: { paso: PasoDonde; conNombre: string; sinNombre: string }) {
  return (
    <span className="text-text">
      {paso.quien ? (
        <>
          {conNombre} <strong>{paso.quien}</strong>
        </>
      ) : (
        sinNombre
      )}
      <span className="text-text-muted">
        {" "}
        — {paso.paso}
        {paso.tarea !== paso.paso ? ` · ${paso.tarea}` : ""}
        {paso.desde ? ` · desde el ${fmtDiaMesAno(paso.desde)}` : ""}
      </span>
    </span>
  );
}
```

Run: `npx tsc --noEmit` y `pnpm lint src/components/ConsultaPedidos.tsx`
Expected: sin errores.

- [ ] **Step 6: Reescribir `src/components/Consulta.tsx`**

```tsx
"use client";

import { useState } from "react";
import {
  ESTADOS_CONSULTA,
  PASOS_CONSULTA,
  type EstadoConsulta,
  type FiltrosConsulta,
  type PasoConsulta,
} from "@/lib/consulta";
import { familiaMeta } from "@/lib/familia";
import { FAMILIAS_FILTRABLES } from "@/lib/historial";
import type { Familia } from "@/lib/types";
import { ConsultaPedidos } from "./ConsultaPedidos";
import { FamiliaIcon } from "./FamiliaTag";
import { Logo } from "./Logo";
import { Select } from "./Select";
import { SelectorFecha } from "./SelectorFecha";
import { ThemeToggle } from "./ThemeToggle";
import { VisitasCotView } from "./VisitasCotView";

// ─── La web para quien no ha entrado ─────────────────────────────────────────
// Comerciales, administración y taller llegan con un nombre o un número y una
// pregunta: ¿cómo va?, ¿ya salió?, ¿quién lo tiene? Por eso se entra buscando:
// un solo buscador arriba, que vale para las dos pestañas. Todo de solo
// lectura: no es el tablero con cosas escondidas, es otra pantalla.

type Pestana = "pedidos" | "consultas";

const PESTANAS: { id: Pestana; label: string }[] = [
  { id: "pedidos", label: "Pedidos" },
  { id: "consultas", label: "Consultas con OT" },
];

export function Consulta() {
  const [pestana, setPestana] = useState<Pestana>("pedidos");
  const [q, setQ] = useState("");
  const [estado, setEstado] = useState<EstadoConsulta>("proximas");
  const [paso, setPaso] = useState<PasoConsulta | null>(null);
  const [familia, setFamilia] = useState<string | null>(null);
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const [familias, setFamilias] = useState<string[] | null>(null);

  // «Esperando salir» y «Entregados» ya no están en fábrica: ahí el paso no
  // filtra nada, y se apaga en vez de dejar la lista vacía sin decir por qué.
  const sinPaso = estado === "salir" || estado === "entregados";
  const filtros: Omit<FiltrosConsulta, "page"> = {
    estado,
    ...(paso && !sinPaso ? { paso } : {}),
    ...(familia ? { familia } : {}),
    ...(desde ? { desde } : {}),
    ...(hasta ? { hasta } : {}),
    ...(q.trim() ? { q: q.trim() } : {}),
  };
  const hayFiltros = estado !== "proximas" || paso !== null || familia !== null || desde !== "" || hasta !== "";

  return (
    <div className="min-h-full">
      <header className="glass-panel sticky top-0 z-10 flex flex-wrap items-center gap-3 px-4 py-2">
        <Logo height={36} />
        {/* Flechas entre pestañas y el tabulador entra y sale de la tira: así
            se recorre un tablist con teclado. */}
        <div
          role="tablist"
          aria-label="Secciones"
          className="glass-chip inline-flex flex-wrap rounded-lg p-[3px]"
          onKeyDown={(e) => {
            const salto = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
            if (salto === 0) return;
            e.preventDefault();
            const i = PESTANAS.findIndex((p) => p.id === pestana);
            const siguiente = PESTANAS[(i + salto + PESTANAS.length) % PESTANAS.length];
            setPestana(siguiente.id);
            document.getElementById(`pestana-${siguiente.id}`)?.focus();
          }}
        >
          {PESTANAS.map((p) => (
            <button
              key={p.id}
              type="button"
              role="tab"
              id={`pestana-${p.id}`}
              aria-selected={p.id === pestana}
              aria-controls={`panel-${p.id}`}
              tabIndex={p.id === pestana ? 0 : -1}
              onClick={() => setPestana(p.id)}
              className={`h-8 rounded-md px-3 text-sm font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 ${
                p.id === pestana ? "bg-[var(--glass-highlight)] text-text" : "text-text-muted hover:text-text"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
        <label className="relative min-w-56 flex-1">
          <span className="sr-only">{pestana === "pedidos" ? "Buscar pedidos" : "Buscar visitas"}</span>
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={pestana === "pedidos" ? "Pedido, cliente, obra u OF…" : "Comercial, cliente, pedido o incidencia…"}
            className="h-10 w-full rounded-xl border border-border bg-surface px-3 pr-9 text-sm text-text outline-none focus:border-brand-400"
          />
          {q && (
            <button
              type="button"
              aria-label="Vaciar la búsqueda"
              onClick={() => setQ("")}
              className="absolute right-1.5 top-1/2 grid size-7 -translate-y-1/2 place-items-center rounded text-text-muted hover:bg-surface-2"
            >
              ✕
            </button>
          )}
        </label>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <a href="/entrar" className="glass-chip flex h-9 items-center rounded-lg px-3 text-sm font-semibold text-text">
            Entrar
          </a>
        </div>
      </header>

      {pestana === "pedidos" && (
        <div role="tabpanel" id="panel-pedidos" aria-labelledby="pestana-pedidos">
          <div className="mx-auto w-full max-w-[1100px] px-4 pt-4">
            <div className="flex flex-wrap items-end gap-3 rounded-xl border border-border bg-surface-2/40 px-3 py-2.5">
              <label className="flex flex-col text-xs text-text-muted">
                Estado
                <span className="mt-1">
                  <Select
                    value={estado}
                    onChange={(v) => setEstado((v as EstadoConsulta | null) ?? "proximas")}
                    placeholder={null}
                    options={ESTADOS_CONSULTA.map((e) => ({ value: e.id, label: e.label }))}
                  />
                </span>
              </label>
              <label className="flex flex-col text-xs text-text-muted">
                Paso
                <span className="mt-1" title={sinPaso ? "Solo para lo que está en fábrica" : undefined}>
                  <Select
                    value={sinPaso ? null : paso}
                    onChange={(v) => setPaso(v as PasoConsulta | null)}
                    placeholder={sinPaso ? "—" : "Todos los pasos"}
                    etiquetaVaciar="Todos los pasos"
                    acentuarActivo
                    options={sinPaso ? [] : PASOS_CONSULTA.map((p) => ({ value: p.id, label: p.label }))}
                  />
                </span>
              </label>
              <label className="flex flex-col text-xs text-text-muted">
                Familia
                <span className="mt-1">
                  <Select
                    value={familia}
                    onChange={setFamilia}
                    placeholder="Todas"
                    etiquetaVaciar="Todas las familias"
                    acentuarActivo
                    // Solo las que hay con los demás filtros; la elegida se
                    // conserva aunque ya no esté, para poder quitarla.
                    options={[...new Set([...(familias ?? FAMILIAS_FILTRABLES), ...(familia ? [familia] : [])])].map((fam) => ({
                      value: fam,
                      label: familiaMeta(fam as Familia).label ?? fam,
                      icon: <FamiliaIcon familia={fam as Familia} className="size-3.5" />,
                    }))}
                  />
                </span>
              </label>
              <div className="flex flex-col text-xs text-text-muted">
                Fechas
                <span className="mt-1 flex items-center">
                  <SelectorFecha
                    desde={desde}
                    hasta={hasta}
                    onCambiar={(d, h) => {
                      setDesde(d);
                      setHasta(h);
                    }}
                  />
                </span>
              </div>
              {/* Siempre puesto, apagado sin nada que limpiar: si aparece y
                  desaparece, los botones de al lado bailan de sitio. */}
              <button
                type="button"
                disabled={!hayFiltros}
                onClick={() => {
                  setEstado("proximas");
                  setPaso(null);
                  setFamilia(null);
                  setDesde("");
                  setHasta("");
                }}
                className="self-end rounded-lg border border-border px-2.5 py-1.5 text-xs font-semibold text-text-muted transition-colors enabled:hover:border-border-strong enabled:hover:text-text disabled:opacity-40"
              >
                Limpiar filtros
              </button>
            </div>
            {/* Buscar salta «Próximas entregas» (ver estadoEfectivo): se dice,
                para que nadie crea que el filtro de arriba sigue mandando. */}
            {q.trim() && estado === "proximas" && (
              <p className="mt-2 px-1 text-[11px] text-text-muted">Buscando en todos los pedidos, estén como estén y sean del año que sean.</p>
            )}
          </div>
          <ConsultaPedidos filtros={filtros} onFamilias={setFamilias} />
        </div>
      )}
      {pestana === "consultas" && (
        <main role="tabpanel" id="panel-consultas" aria-labelledby="pestana-consultas" className="p-4">
          <VisitasCotView base="/api/publico/visitas" sondeo={false} busqueda={q} />
        </main>
      )}
    </div>
  );
}
```

Si `npx tsc --noEmit` no acepta `options={[]}` o `placeholder` en `Select` tal como está arriba, mirar las props de `src/components/Select.tsx:35-60` y ajustar solo esas dos props, sin cambiar `Select`.

Run: `npx tsc --noEmit` y `pnpm lint`
Expected: sin errores. (`ConsultaPendientes.tsx` sigue existiendo pero ya no lo importa nadie; se borra en la Task 8.)

- [ ] **Step 7: Mirarlo con datos reales**

1. Matar lo que haya en los puertos 3000 y 3001.
2. Arrancar con `DATASOURCE=rps` y `COORDINA_LOGIN=activo` (en `.env.local` o en la línea de comandos) y abrir la web en una ventana sin sesión.
3. Comprobar, apuntando lo visto en el informe:
   - Sin buscar salen las próximas entregas, en tarjetas por día con el total del día.
   - Buscar `SA.26.00927` lo encuentra con «Entregado el 14/09/26».
   - Buscar un pedido de 2019 lo encuentra.
   - «Fuera de plazo», «En fábrica», «Esperando salir» y «Entregados» cambian la lista; «Paso» se apaga en «Esperando salir» y «Entregados».
   - Una fila en fábrica dice dónde está; al abrir `AR.26.04082` (u otro en fábrica con alguien trabajando) sale «Dónde está ahora» con un nombre, la ficha por centros con nombres y tiempos, y los documentos con el pedido escaneado el primero.
   - En «Consultas con OT», el buscador de arriba filtra las visitas y la vista ya no tiene buscador propio.
   - A 400 px de ancho la fila no desborda y el cliente no queda aplastado.
   - Tema claro y oscuro.
4. Lanzar el agente `ui-reviewer` sobre `src/components/Consulta.tsx` y `src/components/ConsultaPedidos.tsx` y corregir lo que encuentre de ARIA, foco y contraste.

- [ ] **Step 8: Commit**

```bash
git add src/lib/consulta-dias.ts src/lib/__tests__/consulta-dias.test.ts src/components/VisitasCotView.tsx src/components/ConsultaPedidos.tsx src/components/Consulta.tsx
git commit -m "feat(consulta): una pestaña de pedidos que se usa buscando"
```

---

### Task 8: Fuera la primera versión, documentación y verificación completa

**Files:**
- Delete: `src/components/ConsultaPendientes.tsx`, `src/lib/__tests__/consulta-fila.test.ts`, `src/lib/__tests__/publico-centros.test.ts`
- Modify: `src/lib/publico.ts`, `src/lib/server/publico-db.ts`
- Rewrite: `src/lib/__tests__/publico.test.ts`
- Modify: `docs/despliegue-login.md:155-180`, `.superpowers/sdd/progress.md`

**Interfaces:**
- Consumes: todo lo anterior.
- Produces: nada nuevo. Tras esta tarea, `src/lib/publico.ts` exporta solo `capitalizaFrase`, `nombreDeCentro`, `PedidoConsultaDetalle` y `detalleConsulta`; `src/lib/server/publico-db.ts` exporta solo `ListaEnConstruccion`, `leerDonde`, `leerPaginaConsulta` y `leerDetalleConsulta`.

- [ ] **Step 1: Borrar lo que ya no usa nadie**

```bash
git rm src/components/ConsultaPendientes.tsx src/lib/__tests__/consulta-fila.test.ts src/lib/__tests__/publico-centros.test.ts
```

- [ ] **Step 2: Dejar `src/lib/__tests__/publico.test.ts` con lo que sigue vivo**

Sustituir el fichero entero por:

```ts
import { expect, test } from "vitest";
import { capitalizaFrase, nombreDeCentro } from "../publico";

// Los nombres de centro para gente de fuera. La lista blanca del detalle está
// en publico-detalle.test.ts; la lista, en consulta.test.ts.

test("un centro de la tabla sale con su nombre bonito", () => {
  expect(nombreDeCentro("PLOTER DE CORTE MASCARA ULTRA SIGN PAL GRC1325")).toBe("Plotter de corte");
  expect(nombreDeCentro("OFICINA TECNICA ARZUA")).toBe("Oficina Técnica");
});

test("un centro que no está en la tabla sale con el texto de RPS, en frase", () => {
  expect(nombreDeCentro("UN CENTRO INVENTADO XYZ")).toBe("Un centro inventado xyz");
});

test("la trampa del centro escrito de dos formas (espacios de más) no rompe la tabla", () => {
  expect(nombreDeCentro("CONFECCION  BERGONDO")).toBe("Confección (Bergondo)");
  expect(nombreDeCentro("MONTAJE TOLDO PLANO ")).toBe("Montaje");
});

test("capitalizaFrase baja el volumen: RPS a gritos, aquí solo la inicial", () => {
  expect(capitalizaFrase("PLANTEAR Y PREPARAR ARCHIVOS MAQ. DE CORTE")).toBe("Plantear y preparar archivos maq. de corte");
  expect(capitalizaFrase("lona remolque")).toBe("Lona remolque");
});
```

- [ ] **Step 3: Limpiar `src/lib/publico.ts`**

Se quedan, y en este orden: la tabla `NOMBRE_DE_CENTRO` con su comentario, `normalizaCentro`, `capitalizaFrase`, `nombreDeCentro`, `PREFIJO_DOCUMENTO_INTERNO`, `PREFIJO_DOCUMENTO_PUBLICO`, `documentoPublico`, y el bloque de la Task 4 (`PedidoConsultaDetalle`, `ofConsulta`, `detalleConsulta`).

Se borra todo lo demás: el bloque `// ─── Lo que ve quien no tiene sesión` (con `PAGE_PUBLICO`, `ListaPublica`, `FiltrosPublicos`, `PedidoPublico`, `estaPendiente`), `frasePublica`, el bloque de `recorridoPublico`, `medianoche`, `porEntrega`, `porCierre`, `CORTE_PENDIENTES_SIN_BUSQUEDA` con su comentario, `filtrarPublico`, `normalizarFiltrosPublicos`, y del bloque `// ─── El detalle de un pedido, para quien no tiene sesión`: `TareaPublica`, `OfPublica`, `claveTarea`, `tareaCerrada`, `pedidoTerminado`, `tareaPublica`, `ofPublica`, `esPedidoTerminado`, `OfPublicaAgrupada`, `agruparOfsPublicas`, `PedidoPublicoDetalle` y `detallePublico` (con sus comentarios).

Los imports quedan en:

```ts
import type { DocumentoRps, HistorialOF, HistorialPedidoDetalle } from "./historial";
import type { SituacionPedido } from "./consulta";
import type { DondeOF } from "./consulta-donde";
```

Encima de `PREFIJO_DOCUMENTO_INTERNO`, poner:

```ts
// ─── Los documentos del pedido, con su dirección pública ────────────────────
// La descarga del equipo (/api/historial/...) pide sesión: al invitado se le
// da su gemela pública.
```

- [ ] **Step 4: Limpiar `src/lib/server/publico-db.ts`**

Se quedan: `ES_MOCK`, `rescateOtSql`, `ListaEnConstruccion` y todo el bloque de la Task 5 (`FilaTarea`, `tareasDePedidos`, `leerDonde`, `leerPaginaConsulta`, `leerDetalleConsulta`, `paginaMockConsulta`).

Se borran: `iso`, `agruparCentros`, `centrosDe`, `tareasCerradasDe`, `leerDetallePublico`, `leerPaginaPublica` y `paginaMock`, con sus comentarios.

En el comentario de `rescateOtSql`, cambiar la primera frase por: «El rescate de OT como fragmento SQL: `tareasDePedidos` tiene que dar por cerrada EXACTAMENTE la misma tarea que el índice (`ctesFinalizacionHistorial`), o un pedido «en fábrica» no tendría dónde estar.» y quitar las menciones a `centrosDe`, `tareasCerradasDe`, `estaPendiente` y «la fila decía Entregado dentro de la lista de los que no lo están»; el resto del razonamiento (por qué `SECCION_POR_DEFECTO` y por qué EXISTS por tarea) se queda.

Cambiar el comentario de cabecera por:

```ts
// ─── La consulta sin login: acceso a RPS y OLANET (solo lectura) ────────────
// El índice en memoria (historial-indice.ts) dice QUÉ pedidos salen y en qué
// situación; esto dice dónde está cada uno en fábrica y quién lo tiene, para
// las 40 filas de la página de una vez.
```

Dejar los imports en lo que se usa (lint lo dice): previsiblemente `sql`, `getPool`, `asegurarIndice`, `indiceSiListo`, `leerHistorialPedidoDetalle`, `nombresHistorial`, `claveFase`, `ultimosMovimientos`, `UltimoMovimiento`, `recursosSql`, `SECCIONES`, `SECCION_POR_DEFECTO`, los de `../consulta`, `../consulta-donde`, `detalleConsulta`, `PedidoConsultaDetalle`, `PEDIDOS`, `estaFinalizado`, `hoyISO`.

- [ ] **Step 5: Comprobar que no queda nada de la primera versión**

Run: `git grep -n -E "filtrarPublico|PedidoPublico|FiltrosPublicos|ConsultaPendientes|recorridoPublico|agruparOfsPublicas|esPedidoTerminado|leerPaginaPublica|leerDetallePublico|detallePublico|frasePublica|estaPendiente|tareasCerradasDe|centrosDe|PAGE_PUBLICO" -- src scripts`
Expected: ninguna línea.

- [ ] **Step 6: Documentación**

En `docs/despliegue-login.md`, sustituir desde `### Qué ve quien no tiene sesión` hasta justo antes de `### El orden importa` por:

```markdown
### Qué ve quien no tiene sesión

En vez del tablero del equipo, dos pestañas de solo lectura pensadas para el
resto de la casa —comercial, administración, taller—, que hoy hace esta
pregunta por teléfono porque la web no se la contestaba:

- **Pedidos** — se entra buscando: pedido, cliente, obra u OF, de cualquier
  año y esté como esté. Sin buscar, lo que se entrega hoy y los catorce días
  siguientes. Filtros de estado (fuera de plazo, en fábrica, esperando salir,
  entregados), paso, familia y fechas. Cada pedido dice dónde está y, al
  abrirlo, quién lo tiene y quién trabajó en él.
- **Consultas con OT** — el calendario de visitas, sin los botones de crear,
  editar ni cerrar. El buscador de arriba vale también para esta pestaña.

Pendiente quiere decir **sin entregar**: lo que ya salió está rematado, tenga
las tareas que tenga abiertas en RPS.

Lo que NO enseña, en ninguna pestaña: las notas del pedido, las notas de
producción, la nota de devolución, las causas de rechazo ni las marcas del
parte revisado. Eso se escribe entre nosotros para trabajar, y no cambia porque
ahora lo pueda leer cualquiera de la casa.

### Verificado contra RPS y OLANET

Pegar aquí, con fecha, los números medidos en esta rama: pendientes, en
fábrica y esperando salir (Task 1, Step 6), el tiempo de construir la lista,
lo que tarda «dónde está» de un pedido (Task 5, Step 7) y lo que se descarga
quien no tiene sesión (Step 7 de esta tarea).
```

(El párrafo «Pegar aquí» se sustituye por los números reales antes de hacer el commit: no se deja la instrucción en el documento.)

En `.superpowers/sdd/progress.md`, añadir al final una línea con la fecha, «consulta v2 implementada según el plan 2026-09-15-consulta-publica-v2» y los números del párrafo anterior.

- [ ] **Step 7: Verificación completa**

Run, en orden, y copiar al informe el resultado de cada uno:

1. `pnpm test` — Expected: todo en verde.
2. `npx tsc --noEmit` — Expected: sin errores.
3. `pnpm lint` — Expected: sin errores.
4. `pnpm build` — Expected: termina. Apuntar el «First Load JS» de la ruta `/` y compararlo con los 39 KB de la primera versión; si pasa de 80 KB, comprobar que `ConsultaPedidos` no está arrastrando `HistorialDrawer` ni `Board` y avisar.
5. `VALIDAR_RPS_UI=1 node --env-file=.env.local node_modules/vitest/vitest.mjs run scripts/verificar-historial-centros.test.ts scripts/medir-indice-consulta.test.ts scripts/verificar-consulta-donde.test.ts` — Expected: PASS.
6. Con el servidor de desarrollo (puertos 3000/3001 limpios, `DATASOURCE=rps`):
   - Sin sesión y `COORDINA_LOGIN=activo`: la consulta nueva; `curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/api/historial` da 401.
   - Con sesión: el tablero del equipo y su Historial, idénticos (buscar un pedido en el Historial del equipo y abrir su ficha).
   - Con `COORDINA_LOGIN` sin poner: la web de siempre, sin consulta.

- [ ] **Step 8: Commit**

```bash
git add -A src scripts docs/despliegue-login.md .superpowers/sdd/progress.md
git commit -m "refactor(consulta): fuera la primera versión de la consulta sin login"
```
