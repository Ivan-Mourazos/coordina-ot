# Consulta sin login — plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que quien no tiene sesión pueda consultar, en solo lectura, los pedidos pendientes y los terminados de toda la casa y las consultas con OT, sin poder leer nada interno del equipo.

**Architecture:** El índice en memoria del Historial (`server/historial-indice.ts`) ya guarda los 153.451 pedidos de la casa; se le añaden dos campos (fecha de entrega y si queda algo por entregar) y las dos primeras pestañas son ese índice filtrado, con un detalle por página contra RPS. La pantalla del invitado es un componente aparte que reutiliza piezas, no una bandera dentro de `Board`. Las rutas de lectura de siempre pasan a exigir sesión y el invitado estrena las suyas, que recortan en el servidor.

**Tech Stack:** Next.js 16.2.9 (App Router, componentes de servidor), React 19.2.4, TypeScript, vitest, mssql (RPS, solo lectura), better-sqlite3 (overlay local), Tailwind 4.

**Spec:** `docs/superpowers/specs/2026-09-14-consulta-publica-design.md`

## Global Constraints

- **Idioma:** todo el código, comentarios, nombres e interfaz en español, como el resto del proyecto. Los identificadores de RPS se dejan en su inglés original (`PendingDelivery`, `CodOrder`).
- **Comentarios:** el proyecto explica **por qué**, con el dato medido cuando lo hay. No describir lo que el código ya dice.
- **`COORDINA_LOGIN`:** `loginActivo()` es `process.env.COORDINA_LOGIN === "activo"`. Se despliega apagado. Con el login apagado **no existe la vista de invitado** y la web es exactamente la de hoy.
- **Novedades:** ningún commit de este plan lleva línea `Novedad:`. Nada de esto lo nota un técnico de OT mientras esté apagado. La línea se escribe el día que se enciende, en el commit del despliegue.
- **Tests:** `pnpm test` (vitest). Los ficheros van a `src/lib/__tests__/*.test.ts` y se nombran como los de al lado (`api-*.test.ts` para rutas).
- **Datos que el invitado NO puede ver, nunca, en ninguna respuesta:** notas del pedido, nota de devolución, causas de rechazo, marcas del parte revisado, métricas.
- **Sin sesión no se escribe nada.** Ninguna ruta nueva de este plan acepta POST, PUT ni PATCH.
- **Modo mock:** `DATASOURCE !== "rps"` tiene que seguir arrancando y funcionando sin base de datos, como hace hoy `historial-db.ts`.

---

### Task 1: El índice aprende la entrega

Hoy el índice sabe si a un pedido le queda alguna tarea, pero no cuándo hay que entregarlo ni si ya salió. Sin esas dos cosas no se puede ordenar la lista del invitado ni decidir cuándo un pedido deja de estar pendiente. Medido en RPS el 14/09/2026: **184 pedidos de 2026 tienen todas las tareas al 100 y la entrega pendiente**.

**Files:**
- Modify: `src/lib/historial-indice.ts:14-25` (interfaz `BaseHistorial`)
- Modify: `src/lib/server/historial-finalizacion-sql.ts:56-77` (las CTE `ResumenPedido` y `PedFin`)
- Modify: `src/lib/server/historial-indice.ts:41-49` (interfaz `FilaBase`) y `:101-125` (`baseDe`)
- Test: `src/lib/__tests__/historial-indice-entrega.test.ts`

**Interfaces:**
- Consumes: nada.
- Produces: `BaseHistorial.fechaEntrega: number | null` (ms) y `BaseHistorial.pendienteEntrega: boolean`. Los usa la Task 2.

- [ ] **Step 1: Escribir el test que falla**

Crear `src/lib/__tests__/historial-indice-entrega.test.ts`:

```ts
import { expect, test } from "vitest";
import type { BaseHistorial } from "../historial-indice";

// Los dos campos nuevos del índice. El test es de TIPO y de forma: lo que
// se rompe si alguien los quita es la lista entera del invitado, y eso no
// puede depender de acordarse.
test("un pedido del índice lleva fecha de entrega y si queda algo por entregar", () => {
  const b: BaseHistorial = {
    pedido: "AR.26.00001",
    fechaPedido: Date.UTC(2026, 0, 10),
    nOf: 2,
    tieneSeccion: true,
    pendienteSeccion: false,
    pendienteTotal: false,
    finalizada: Date.UTC(2026, 0, 20),
    fechaEntrega: Date.UTC(2026, 1, 1),
    pendienteEntrega: true,
  };
  expect(b.fechaEntrega).toBe(Date.UTC(2026, 1, 1));
  expect(b.pendienteEntrega).toBe(true);
});

test("la entrega puede faltar: hay pedidos sin fecha solicitada", () => {
  const b: Pick<BaseHistorial, "fechaEntrega" | "pendienteEntrega"> = {
    fechaEntrega: null,
    pendienteEntrega: false,
  };
  expect(b.fechaEntrega).toBeNull();
});
```

- [ ] **Step 2: Ejecutarlo y verlo fallar**

Run: `pnpm vitest run src/lib/__tests__/historial-indice-entrega.test.ts`
Expected: FAIL — `Object literal may only specify known properties, and 'fechaEntrega' does not exist in type 'BaseHistorial'`.

- [ ] **Step 3: Añadir los dos campos a la interfaz**

En `src/lib/historial-indice.ts`, dentro de `interface BaseHistorial`, después de `nOf`:

```ts
  /** La entrega que pide el cliente: MIN de las líneas del pedido, en ms.
   *  Es lo que ORDENA la lista del invitado, así que se guarda en el índice y
   *  no se pide por página: ordenar solo se puede con todo delante. */
  fechaEntrega: number | null;
  /** Queda alguna línea sin entregar (`FACOrderLineSL.PendingDelivery`).
   *
   *  Terminar en fábrica no es entregar: medido el 14/09/2026, 184 pedidos de
   *  2026 tienen todas las tareas al 100 y la entrega pendiente. Sin esto, el
   *  invitado vería «terminado» un pedido que sigue en el almacén sin salir,
   *  que es justo la etapa por la que llaman. */
  pendienteEntrega: boolean;
```

- [ ] **Step 4: Traerlos de RPS**

En `src/lib/server/historial-finalizacion-sql.ts`, dentro de la CTE `ResumenPedido`, añadir dos columnas al `SELECT` (después de `MAX(t.fin_total) AS fin_total`):

```sql
        , MIN(l.ReceptionDemandDate) AS fecha_entrega
        , MAX(CASE WHEN l.PendingDelivery = 1 THEN 1 ELSE 0 END) AS pendiente_entrega
```

Y en la CTE `PedFin`, arrastrarlas al `SELECT`:

```sql
      SELECT pedido, fecha_pedido, n_of, tiene_seccion, pendiente_seccion, pendiente_total,
        fecha_entrega, pendiente_entrega,
        CASE WHEN tiene_seccion=1 THEN fin_seccion ELSE fin_total END AS finalizada
      FROM ResumenPedido
```

`ResumenPedido` ya une `FACOrderLineSL l`, así que no hay un JOIN nuevo ni una consulta nueva: son dos agregados más sobre filas que ya se recorren.

- [ ] **Step 5: Leerlos al construir el índice**

En `src/lib/server/historial-indice.ts`, añadir a `interface FilaBase`:

```ts
  fecha_entrega: Date | null;
  pendiente_entrega: number | null;
```

Y en `baseDe`, la consulta y el `push`:

```ts
  await porFilas<FilaBase>(req, `${ctesFinalizacionHistorial(seccion)}
    SELECT pedido, fecha_pedido, n_of, tiene_seccion, pendiente_seccion, pendiente_total,
           fecha_entrega, pendiente_entrega, finalizada FROM PedFin;
    DROP TABLE #CoordinaHistorialPendientes;
    DROP TABLE #CoordinaHistorialFinalizados;`, (f) => {
    const pedido = (f.pedido ?? "").trim();
    if (!pedido) return;
    base.push({
      pedido,
      fechaPedido: ms(f.fecha_pedido),
      nOf: f.n_of ?? 0,
      tieneSeccion: f.tiene_seccion === 1,
      pendienteSeccion: f.pendiente_seccion === 1,
      pendienteTotal: f.pendiente_total === 1,
      fechaEntrega: ms(f.fecha_entrega),
      pendienteEntrega: f.pendiente_entrega === 1,
      finalizada: ms(f.finalizada),
    });
  });
```

- [ ] **Step 6: Ejecutar los tests**

Run: `pnpm test`
Expected: PASS, incluidos los del historial que ya existen (`historial-indice*.test.ts`, `api-historial*.test.ts`). Si alguno construye un `BaseHistorial` a mano, añadirle los dos campos nuevos.

- [ ] **Step 7: Comprobar la memoria contra RPS**

Con `.env.local` apuntando a RPS, arrancar (`pnpm dev`), abrir el Historial y esperar a que el índice se construya. En el log tiene que salir el mismo tiempo de construcción de siempre (±10 %).

Medida esperada: el índice ocupaba ~197 MB; dos campos por pedido son ~1,5 MB más. Si el proceso se acerca al tope de 1 GB de PM2, **parar y decirlo**, no seguir.

- [ ] **Step 8: Commit**

```bash
git add src/lib/historial-indice.ts src/lib/server/historial-finalizacion-sql.ts src/lib/server/historial-indice.ts src/lib/__tests__/historial-indice-entrega.test.ts
git commit -m "feat(indice): guarda la entrega y lo que queda por entregar"
```

---

### Task 2: `lib/publico.ts` — qué es pendiente y cómo se cuenta

Todo lo que decide qué ve el invitado, en un fichero puro y con tests sin base de datos. Aquí no se importa `mssql` ni nada de `server/`.

**Files:**
- Create: `src/lib/publico.ts`
- Test: `src/lib/__tests__/publico.test.ts`

**Interfaces:**
- Consumes: `BaseHistorial` (Task 1), `IndiceHistorial` e `InfoPedidoHistorial` de `lib/historial-indice.ts`.
- Produces:
  - `PAGE_PUBLICO = 40`
  - `type ListaPublica = "pendientes" | "realizados"`
  - `interface FiltrosPublicos { lista: ListaPublica; page: number; q?: string; cliente?: string; familia?: string; desde?: string; hasta?: string }`
  - `interface PedidoPublico { codigo; cliente; negocio; fechaPedido; fechaEntrega; nOf; pendiente; pendienteEntrega; centros: string[]; estado: string }` (fechas en ISO `yyyy-mm-dd` o `null`)
  - `function estaPendiente(b: BaseHistorial): boolean`
  - `function frasePublica(centros: readonly string[], pendienteEntrega: boolean): string`
  - `function filtrarPublico(indice, f): { filas: BaseHistorial[]; hasMore: boolean }`
  - `function normalizarFiltrosPublicos(sp: URLSearchParams): FiltrosPublicos`

- [ ] **Step 1: Escribir el test que falla**

Crear `src/lib/__tests__/publico.test.ts`:

```ts
import { expect, test } from "vitest";
import type { BaseHistorial, IndiceHistorial } from "../historial-indice";
import {
  estaPendiente,
  filtrarPublico,
  frasePublica,
  normalizarFiltrosPublicos,
  PAGE_PUBLICO,
} from "../publico";

const base = (p: Partial<BaseHistorial> & { pedido: string }): BaseHistorial => ({
  fechaPedido: Date.UTC(2026, 0, 1),
  nOf: 1,
  tieneSeccion: false,
  pendienteSeccion: false,
  pendienteTotal: false,
  finalizada: Date.UTC(2026, 0, 5),
  fechaEntrega: Date.UTC(2026, 1, 1),
  pendienteEntrega: false,
  ...p,
});

test("pendiente es tener tarea abierta O algo sin entregar", () => {
  expect(estaPendiente(base({ pedido: "A", pendienteTotal: true }))).toBe(true);
  expect(estaPendiente(base({ pedido: "B", pendienteEntrega: true }))).toBe(true);
  expect(estaPendiente(base({ pedido: "C" }))).toBe(false);
});

test("la frase dice por dónde va, y la entrega es el último tramo", () => {
  expect(frasePublica(["CORTE AUTOMÁTICO", "CONFECCION SANTIAGO"], true))
    .toBe("Pendiente de: Corte automático, Confeccion santiago");
  expect(frasePublica([], true)).toBe("Fabricado, pendiente de entregar");
  expect(frasePublica([], false)).toBe("Entregado");
});

const indice = (filas: BaseHistorial[]): IndiceHistorial => ({
  at: Date.now(),
  base: { ot: filas, diseno: filas },
  info: new Map(filas.map((f) => [f.pedido, {
    cliente: "MAHOU, S.A.", negocio: null, familias: ["TOLDO"],
    ordenes: "0230001", textos: "MAHOU, S.A.\nTOLDO DE FACHADA",
  }])),
  personas: new Map(),
});

test("pendientes: primero lo que se entrega antes, y lo sin fecha al final", () => {
  const i = indice([
    base({ pedido: "A", pendienteTotal: true, fechaEntrega: Date.UTC(2026, 2, 1) }),
    base({ pedido: "B", pendienteTotal: true, fechaEntrega: Date.UTC(2026, 1, 1) }),
    base({ pedido: "C", pendienteTotal: true, fechaEntrega: null }),
  ]);
  const { filas } = filtrarPublico(i, { lista: "pendientes", page: 0 });
  expect(filas.map((f) => f.pedido)).toEqual(["B", "A", "C"]);
});

test("realizados: lo último terminado primero, y no se cuela un pendiente", () => {
  const i = indice([
    base({ pedido: "A", finalizada: Date.UTC(2026, 0, 2) }),
    base({ pedido: "B", finalizada: Date.UTC(2026, 0, 9) }),
    base({ pedido: "VIVO", pendienteEntrega: true }),
  ]);
  const { filas } = filtrarPublico(i, { lista: "realizados", page: 0 });
  expect(filas.map((f) => f.pedido)).toEqual(["B", "A"]);
});

test("hasMore avisa de que hay otra página, sin devolver la fila de más", () => {
  const filas = Array.from({ length: PAGE_PUBLICO + 5 }, (_, n) =>
    base({ pedido: `P${String(n).padStart(3, "0")}`, pendienteTotal: true }));
  const r = filtrarPublico(indice(filas), { lista: "pendientes", page: 0 });
  expect(r.filas).toHaveLength(PAGE_PUBLICO);
  expect(r.hasMore).toBe(true);
});

test("buscar por código encuentra el pedido", () => {
  const i = indice([
    base({ pedido: "AR.26.00123", pendienteTotal: true }),
    base({ pedido: "AR.26.00999", pendienteTotal: true }),
  ]);
  const { filas } = filtrarPublico(i, { lista: "pendientes", page: 0, q: "AR.26.00123" });
  expect(filas.map((f) => f.pedido)).toEqual(["AR.26.00123"]);
});

test("los filtros llegan de la URL con valores sanos", () => {
  const f = normalizarFiltrosPublicos(new URLSearchParams("lista=realizados&page=3&q=mahou"));
  expect(f).toMatchObject({ lista: "realizados", page: 3, q: "mahou" });
  // Basura en la URL no puede tumbar la página ni colar otra lista.
  expect(normalizarFiltrosPublicos(new URLSearchParams("lista=inventada&page=-7")))
    .toMatchObject({ lista: "pendientes", page: 0 });
});
```

- [ ] **Step 2: Ejecutarlo y verlo fallar**

Run: `pnpm vitest run src/lib/__tests__/publico.test.ts`
Expected: FAIL — `Failed to resolve import "../publico"`.

- [ ] **Step 3: Escribir `src/lib/publico.ts`**

```ts
import { palabrasDe } from "./buscador";
import { normalizaBusqueda, type BaseHistorial, type IndiceHistorial } from "./historial-indice";
import { SECCION_POR_DEFECTO } from "./secciones";
import { esCodigoPedido } from "./types";

// ─── Lo que ve quien no tiene sesión ─────────────────────────────────────────
// Toda la casa pregunta lo mismo —"¿por dónde va este pedido?"— y hasta ahora
// lo preguntaba por teléfono. Aquí se decide qué es estar pendiente, en qué
// orden se enseña y cómo se cuenta. Sin base de datos, para poder probarlo.
//
// NO ENTRA NADA INTERNO. Ni notas, ni causas, ni marcas de revisión: eso se
// escribe entre nosotros y se escribe distinto si lo lee toda la casa.

export const PAGE_PUBLICO = 40;

export type ListaPublica = "pendientes" | "realizados";

export interface FiltrosPublicos {
  lista: ListaPublica;
  page: number;
  q?: string;
  cliente?: string;
  familia?: string;
  /** ISO yyyy-mm-dd, inclusive. Sobre la entrega en pendientes y sobre el
   *  cierre en realizados: en cada lista, la fecha que se está mirando. */
  desde?: string;
  hasta?: string;
}

export interface PedidoPublico {
  codigo: string;
  cliente: string | null;
  negocio: string | null;
  /** ISO yyyy-mm-dd. */
  fechaPedido: string | null;
  fechaEntrega: string | null;
  fechaFinalizacion: string | null;
  nOf: number;
  pendiente: boolean;
  pendienteEntrega: boolean;
  /** Centros de trabajo con tarea sin cerrar, por su descripción. */
  centros: string[];
  /** La frase que se lee en la fila (ver `frasePublica`). */
  estado: string;
}

/** Un pedido sigue vivo mientras le quede una tarea abierta O algo por
 *  entregar. Lo segundo no es un extra: terminar en fábrica no es entregar, y
 *  el almacén es la etapa por la que más llaman. */
export function estaPendiente(b: BaseHistorial): boolean {
  return b.pendienteTotal || b.pendienteEntrega;
}

/** "CORTE AUTOMÁTICO PARQUE EMPRESARIAL" → "Corte automático parque empresarial".
 *  RPS los guarda a gritos; en una fila de lista eso no se lee. */
function enFrase(centro: string): string {
  const limpio = centro.trim().toLowerCase();
  return limpio.charAt(0).toUpperCase() + limpio.slice(1);
}

/** Por dónde va el pedido, con la entrega de último tramo. */
export function frasePublica(centros: readonly string[], pendienteEntrega: boolean): string {
  if (centros.length > 0) return `Pendiente de: ${centros.map(enFrase).join(", ")}`;
  return pendienteEntrega ? "Fabricado, pendiente de entregar" : "Entregado";
}

/** yyyy-mm-dd → medianoche LOCAL, como compara SQL Server una fecha sin hora. */
function medianoche(iso: string | undefined): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso?.trim() ?? "");
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])).getTime() : null;
}

/** Lo que entrega antes, primero. Sin fecha, al final: un pedido sin entrega
 *  puesta no es urgente, es un pedido del que no se sabe. */
const porEntrega = (a: BaseHistorial, b: BaseHistorial): number =>
  (a.fechaEntrega ?? Infinity) - (b.fechaEntrega ?? Infinity) || (a.pedido < b.pedido ? -1 : 1);

const porCierre = (a: BaseHistorial, b: BaseHistorial): number =>
  (b.finalizada ?? -Infinity) - (a.finalizada ?? -Infinity) || (a.pedido < b.pedido ? -1 : 1);

export function filtrarPublico(
  indice: IndiceHistorial,
  f: FiltrosPublicos,
): { filas: BaseHistorial[]; hasMore: boolean } {
  const pendientes = f.lista === "pendientes";
  const q = f.q?.trim() ?? "";
  const palabras = palabrasDe(q);
  const codigo = palabras.join("");
  const exacto = esCodigoPedido(q.toUpperCase()) ? q.toUpperCase() : null;
  const cliente = f.cliente?.trim() ? normalizaBusqueda(f.cliente.trim()) : null;
  const familia = f.familia?.trim() || null;
  const desde = medianoche(f.desde);
  const hasta = medianoche(f.hasta);

  const elegidas: BaseHistorial[] = [];
  // Las dos secciones del índice llevan los MISMOS pedidos de la casa (lo que
  // cambia entre ellas es de qué tareas se mira el cierre), así que aquí se
  // recorre una sola: contarlas las dos duplicaría cada pedido.
  for (const b of indice.base[SECCION_POR_DEFECTO]) {
    if (estaPendiente(b) !== pendientes) continue;

    const fecha = pendientes ? b.fechaEntrega : b.finalizada;
    if (desde !== null && (fecha === null || fecha < desde)) continue;
    if (hasta !== null && (fecha === null || fecha > hasta)) continue;

    const info = indice.info.get(b.pedido);
    if (cliente && !normalizaBusqueda(info?.cliente ?? "").includes(cliente)) continue;
    if (familia && !(info?.familias ?? []).includes(familia)) continue;

    if (q) {
      if (exacto) {
        if (b.pedido !== exacto) continue;
      } else if (palabras.length === 0) {
        continue;
      } else if (
        !b.pedido.replaceAll(".", "").includes(codigo) &&
        !(info?.ordenes ?? "").includes(codigo) &&
        !palabras.every((p) => (info?.textos ?? "").includes(p))
      ) {
        continue;
      }
    }
    elegidas.push(b);
  }

  elegidas.sort(pendientes ? porEntrega : porCierre);
  const off = Math.max(0, f.page) * PAGE_PUBLICO;
  const trozo = elegidas.slice(off, off + PAGE_PUBLICO + 1);
  return { filas: trozo.slice(0, PAGE_PUBLICO), hasMore: trozo.length > PAGE_PUBLICO };
}

/** Los filtros tal como llegan de la URL. NUNCA lanza: esto viene de fuera y
 *  un valor raro no puede tumbar la página de nadie. */
export function normalizarFiltrosPublicos(sp: URLSearchParams): FiltrosPublicos {
  const page = Number(sp.get("page"));
  const texto = (k: string): string | undefined => sp.get(k)?.trim() || undefined;
  return {
    lista: sp.get("lista") === "realizados" ? "realizados" : "pendientes",
    page: Number.isInteger(page) && page >= 0 ? page : 0,
    q: texto("q"),
    cliente: texto("cliente"),
    familia: texto("familia"),
    desde: texto("desde"),
    hasta: texto("hasta"),
  };
}
```

- [ ] **Step 4: Ejecutar el test**

Run: `pnpm vitest run src/lib/__tests__/publico.test.ts`
Expected: PASS, los siete.

- [ ] **Step 5: Commit**

```bash
git add src/lib/publico.ts src/lib/__tests__/publico.test.ts
git commit -m "feat(consulta): decide qué es un pedido pendiente para quien mira"
```

---

### Task 3: `server/publico-db.ts` — la página y su detalle

El índice dice qué pedidos salen; RPS dice por qué centros van. El detalle se pide **para las 40 filas de la página de una vez**, como hace hoy `extrasDePagina` en el Historial: una consulta por pedido serían 40 idas y vueltas.

**La regla de "tarea abierta" tiene que ser LA MISMA que usa el índice** (`tgm_estadosof_olanet.idestadoof = 3`, más el rescate de OT por `PercentProgress`). Si aquí se usara `PercentProgress < 100` a secas, habría pedidos en la lista de pendientes sin un solo centro que enseñar: la lista diría «Entregado» en un pedido que está en la lista de pendientes.

**Files:**
- Create: `src/lib/server/publico-db.ts`
- Test: `src/lib/__tests__/publico-centros.test.ts`

**Interfaces:**
- Consumes: `filtrarPublico`, `frasePublica`, `PedidoPublico`, `FiltrosPublicos` (Task 2); `asegurarIndice`, `indiceSiListo` de `server/historial-indice.ts`; `getPool` de `server/db.ts`.
- Produces:
  - `function agruparCentros(filas: readonly { pedido: string | null; centro: string | null }[]): Map<string, string[]>`
  - `async function leerPaginaPublica(f: FiltrosPublicos): Promise<{ pedidos: PedidoPublico[]; hasMore: boolean }>`

- [ ] **Step 1: Escribir el test que falla**

Crear `src/lib/__tests__/publico-centros.test.ts`:

```ts
import { expect, test } from "vitest";
import { agruparCentros } from "../server/publico-db";

test("un centro escrito de dos maneras es un solo centro", () => {
  // En RPS el mismo centro aparece con el código al derecho y al revés
  // (A-ROTU y ROTU-A, OTEC-A y A-OTEC) con la MISMA descripción. Agrupando
  // por código, "Rotulaciones Arzúa" salía dos veces en la misma línea.
  const mapa = agruparCentros([
    { pedido: "AR.26.00001", centro: "ROTULACIONES ARZUA" },
    { pedido: "AR.26.00001", centro: "ROTULACIONES ARZUA" },
    { pedido: "AR.26.00001", centro: "CORTE AUTOMÁTICO PARQUE EMPRESARIAL" },
  ]);
  expect(mapa.get("AR.26.00001")).toEqual([
    "CORTE AUTOMÁTICO PARQUE EMPRESARIAL",
    "ROTULACIONES ARZUA",
  ]);
});

test("filas sin pedido o sin centro no rompen el agrupado", () => {
  const mapa = agruparCentros([
    { pedido: null, centro: "CALDERERIA" },
    { pedido: "AR.26.00002", centro: null },
    { pedido: "AR.26.00002", centro: "  CALDERERIA  " },
  ]);
  expect(mapa.get("AR.26.00002")).toEqual(["CALDERERIA"]);
});
```

- [ ] **Step 2: Ejecutarlo y verlo fallar**

Run: `pnpm vitest run src/lib/__tests__/publico-centros.test.ts`
Expected: FAIL — `Failed to resolve import "../server/publico-db"`.

- [ ] **Step 3: Escribir `src/lib/server/publico-db.ts`**

```ts
import { getPool } from "./db";
import { asegurarIndice, indiceSiListo } from "./historial-indice";
import { recursosDeLaWebSql } from "../secciones";
import {
  filtrarPublico,
  frasePublica,
  type FiltrosPublicos,
  type PedidoPublico,
} from "../publico";
import { PEDIDOS } from "../mock";

// ─── La consulta sin login: acceso a RPS (solo lectura) ──────────────────────
// El índice en memoria (historial-indice.ts) dice QUÉ pedidos salen; esta
// consulta dice por dónde van. Se pide para las 40 filas de la página de una
// vez: una consulta por pedido serían 40 idas y vueltas.

const ES_MOCK = process.env.DATASOURCE !== "rps";

const iso = (ms: number | null): string | null =>
  ms === null ? null : new Date(ms).toISOString().slice(0, 10);

/** Pedido → centros con tarea abierta, por DESCRIPCIÓN y sin repetir.
 *  Ver el test: el mismo centro tiene dos códigos en RPS. */
export function agruparCentros(
  filas: readonly { pedido: string | null; centro: string | null }[],
): Map<string, string[]> {
  const mapa = new Map<string, Set<string>>();
  for (const f of filas) {
    const pedido = (f.pedido ?? "").trim();
    const centro = (f.centro ?? "").trim();
    if (!pedido || !centro) continue;
    let suyos = mapa.get(pedido);
    if (!suyos) {
      suyos = new Set();
      mapa.set(pedido, suyos);
    }
    suyos.add(centro);
  }
  return new Map([...mapa].map(([pedido, set]) => [pedido, [...set].sort()]));
}

/** Los centros abiertos de una página entera.
 *
 *  «Abierta» se mide EXACTAMENTE como la mide el índice: sin cierre en
 *  `tgm_estadosof_olanet` (idestadoof = 3), más el rescate de las tareas de la
 *  web al 100 %. Con otra regla, un pedido podría salir en la lista de
 *  pendientes sin un solo centro debajo. */
async function centrosDe(pedidos: readonly string[]): Promise<Map<string, string[]>> {
  if (pedidos.length === 0) return new Map();
  const pool = await getPool();
  const req = pool.request();
  const marcas = pedidos.map((p, i) => {
    req.input(`p${i}`, p);
    return `@p${i}`;
  });
  const r = await req.query<{ pedido: string | null; centro: string | null }>(`
    SELECT DISTINCT o.CodOrder AS pedido, rm.Description AS centro
    FROM dbo.FACOrderSL o
    JOIN dbo.FACOrderLineSL l ON l.IDOrder = o.IDOrder
    JOIN dbo.CPRManufacturingOrder mo ON mo.IDManufacturingOrder = l.IDManufacturingOrder
      AND mo.CodCompany = '001'
    JOIN dbo.CPRMOTask t ON t.IDManufacturingOrder = mo.IDManufacturingOrder
    JOIN dbo.CPRMOResourceMachine rm ON rm.IDMOTask = t.IDMOTask
    LEFT JOIN (
      SELECT orden, fase, MAX(fecha_cambio) AS fin
      FROM dbo.tgm_estadosof_olanet WHERE idestadoof = 3 GROUP BY orden, fase
    ) e ON e.orden = mo.CodManufacturingOrder AND e.fase = t.CodMOTask
    WHERE o.CodCompany = '001' AND o.CodOrder IN (${marcas.join(",")})
      AND e.fin IS NULL
      -- El rescate de OT: una tarea NUESTRA al 100 % está terminada aunque
      -- OLANET no lo diga (ver historial-finalizacion-sql.ts).
      AND NOT (
        rm.CodMOResourceMachine IN (${recursosDeLaWebSql()})
        AND COALESCE(t.Description, '') NOT LIKE 'PLANTEAR EN TALLER%'
        AND t.PercentProgress >= 100
      )`);
  return agruparCentros(r.recordset);
}

/** La página del invitado: el índice filtrado, con sus centros puestos. */
export async function leerPaginaPublica(
  f: FiltrosPublicos,
): Promise<{ pedidos: PedidoPublico[]; hasMore: boolean }> {
  if (ES_MOCK) return paginaMock(f);

  await asegurarIndice();
  const indice = indiceSiListo();
  // Sin índice no hay lista: la consulta de respaldo del Historial recalcula
  // toda la historia (3,8 s) y esta pantalla la mira la casa entera. Mejor
  // decir que no se pudo que tumbar RPS.
  if (!indice) throw new Error("La lista de pedidos todavía se está construyendo");

  const { filas, hasMore } = filtrarPublico(indice, f);
  const centros = f.lista === "pendientes"
    ? await centrosDe(filas.map((b) => b.pedido))
    : new Map<string, string[]>();

  const pedidos = filas.map((b): PedidoPublico => {
    const info = indice.info.get(b.pedido);
    const suyos = centros.get(b.pedido) ?? [];
    return {
      codigo: b.pedido,
      cliente: info?.cliente ?? null,
      negocio: info?.negocio ?? null,
      fechaPedido: iso(b.fechaPedido),
      fechaEntrega: iso(b.fechaEntrega),
      fechaFinalizacion: iso(b.finalizada),
      nOf: b.nOf,
      pendiente: f.lista === "pendientes",
      pendienteEntrega: b.pendienteEntrega,
      centros: suyos,
      estado: frasePublica(suyos, b.pendienteEntrega),
    };
  });
  return { pedidos, hasMore };
}

/** Sin base de datos (DATASOURCE distinto de "rps"): la web de desarrollo
 *  tiene que arrancar igual, como ya hace el Historial. */
function paginaMock(f: FiltrosPublicos): { pedidos: PedidoPublico[]; hasMore: boolean } {
  const pedidos = PEDIDOS.filter((p) =>
    f.lista === "pendientes" ? p.situacion !== "completado" : p.situacion === "completado",
  ).map((p): PedidoPublico => {
    const centros = f.lista === "pendientes" ? ["OFICINA TECNICA ARZUA"] : [];
    return {
      codigo: p.codigo,
      cliente: p.cliente ?? null,
      negocio: null,
      fechaPedido: p.fechaCreacion ?? null,
      fechaEntrega: p.fechaEntrega ?? null,
      fechaFinalizacion: null,
      nOf: p.ofs.length,
      pendiente: f.lista === "pendientes",
      pendienteEntrega: f.lista === "pendientes",
      centros,
      estado: frasePublica(centros, f.lista === "pendientes"),
    };
  });
  return { pedidos, hasMore: false };
}
```

- [ ] **Step 4: Ejecutar el test**

Run: `pnpm vitest run src/lib/__tests__/publico-centros.test.ts`
Expected: PASS, los dos.

- [ ] **Step 5: Comprobar contra RPS que no hay pendientes huérfanos**

Con `.env.local` de RPS, `pnpm dev`, y en otra consola:

```bash
curl -s "http://localhost:3000/api/publico/pedidos?lista=pendientes" | head -c 400
```

(La ruta llega en la Task 4; si se ejecuta esta tarea suelta, comprobarlo al terminar aquella.)

Lo que hay que mirar: **ningún pedido de la lista de pendientes puede salir con `centros: []` y `pendienteEntrega: false`**. Si sale alguno, la regla de "tarea abierta" de esta consulta y la del índice se han separado: pararse y arreglarlo, no maquillarlo en la pantalla.

- [ ] **Step 6: Commit**

```bash
git add src/lib/server/publico-db.ts src/lib/__tests__/publico-centros.test.ts
git commit -m "feat(consulta): saca de RPS por qué centros va cada pedido"
```

---

### Task 4: Las rutas del invitado

Tres rutas nuevas. Solo GET, y solo devuelven lo que el invitado puede ver: **el recorte se hace aquí, en el servidor**, no en la pantalla.

**Files:**
- Create: `src/app/api/publico/pedidos/route.ts`
- Create: `src/app/api/publico/pedidos/[pedido]/route.ts`
- Create: `src/app/api/publico/visitas/route.ts`
- Test: `src/lib/__tests__/api-publico.test.ts`

**Interfaces:**
- Consumes: `leerPaginaPublica` (Task 3), `normalizarFiltrosPublicos` (Task 2), `leerHistorialPedido` de `server/historial-db.ts`, `leerVisitasCot` y `normalizarFiltrosVisitasCot` (ya existen).
- Produces: `GET /api/publico/pedidos`, `GET /api/publico/pedidos/[pedido]`, `GET /api/publico/visitas`. Las usa la Task 7.

- [ ] **Step 1: Mirar cómo se llama hoy al detalle del pedido**

Run: `grep -n "export async function leerHistorialPedido" -A 12 src/lib/server/historial-db.ts`

Anotar la firma exacta y qué devuelve (`HistorialPedidoDetalle`, definido en `src/lib/historial.ts:807`). El detalle público es ese mismo objeto **sin** los campos internos.

- [ ] **Step 2: Escribir el test que falla**

Crear `src/lib/__tests__/api-publico.test.ts`:

```ts
import { beforeAll, expect, test } from "vitest";

let pedidos: typeof import("../../app/api/publico/pedidos/route");

beforeAll(async () => {
  // Sin RPS: la ruta tiene que contestar igual en desarrollo.
  process.env.DATASOURCE = "mock";
  pedidos = await import("../../app/api/publico/pedidos/route");
});

const get = (qs: string) =>
  pedidos.GET(new Request(`http://x/api/publico/pedidos?${qs}`));

test("la lista de pendientes contesta sin sesión", async () => {
  const res = await get("lista=pendientes");
  expect(res.status).toBe(200);
  const json = await res.json();
  expect(Array.isArray(json.pedidos)).toBe(true);
});

test("no se escapa NADA interno en la lista", async () => {
  const res = await get("lista=pendientes");
  const crudo = JSON.stringify(await res.json()).toLowerCase();
  for (const prohibido of ["nota", "causa", "devolucion", "devolución", "marca", "observacion"]) {
    expect(crudo).not.toContain(prohibido);
  }
});

test("una lista que no existe cae en pendientes, no revienta", async () => {
  const res = await get("lista=loquesea&page=-3");
  expect(res.status).toBe(200);
});
```

- [ ] **Step 3: Ejecutarlo y verlo fallar**

Run: `pnpm vitest run src/lib/__tests__/api-publico.test.ts`
Expected: FAIL — no existe `src/app/api/publico/pedidos/route.ts`.

- [ ] **Step 4: Escribir la ruta de la lista**

Crear `src/app/api/publico/pedidos/route.ts`:

```ts
import { NextResponse } from "next/server";
import { normalizarFiltrosPublicos } from "@/lib/publico";
import { leerPaginaPublica } from "@/lib/server/publico-db";

// ─── GET /api/publico/pedidos ────────────────────────────────────────────────
// La lista que ve quien NO tiene sesión: pendientes o realizados, de toda la
// casa. Sale del índice en memoria del Historial, así que filtrar son
// milisegundos; lo único que toca RPS es el detalle de las 40 filas.
//
// ESTA RUTA ES PÚBLICA A PROPÓSITO y es la única de su clase junto a las otras
// dos de `publico/`. Lo que decide qué se puede enseñar está en lib/publico.ts
// y en publico-db.ts: aquí no se añade ni un campo más.

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const filtros = normalizarFiltrosPublicos(new URL(req.url).searchParams);
  try {
    const pagina = await leerPaginaPublica(filtros);
    return NextResponse.json(pagina, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    console.error("[publico] lista falló:", (e as Error).message);
    return NextResponse.json({ error: "No se pudieron cargar los pedidos" }, { status: 500 });
  }
}
```

- [ ] **Step 5: Ejecutar el test**

Run: `pnpm vitest run src/lib/__tests__/api-publico.test.ts`
Expected: PASS, los tres.

- [ ] **Step 6: Escribir la ruta del detalle**

Crear `src/app/api/publico/pedidos/[pedido]/route.ts`. Usa el mismo detalle que el Historial y **quita lo interno antes de responder**:

```ts
import { NextResponse } from "next/server";
import { leerHistorialPedido } from "@/lib/server/historial-db";
import { esCodigoPedido } from "@/lib/types";

// ─── GET /api/publico/pedidos/[pedido] ───────────────────────────────────────
// El pedido abierto, para quien no tiene sesión: sus OF, tareas, tiempos,
// personas y los documentos que RPS tiene colgados.
//
// Lo interno se quita AQUÍ y no en la pantalla: esconderlo en el navegador es
// decoración, porque la respuesta se lee escribiendo la dirección.

export const dynamic = "force-dynamic";

/** Los campos del detalle que no salen de casa. Se enumeran por NOMBRE y se
 *  borran uno a uno en vez de elegir los que sí: así, el día que el Historial
 *  añada un campo nuevo, el invitado NO lo ve hasta que alguien lo decida. */
const INTERNOS = ["notas", "nota", "causas", "devolucion", "marcas", "observacion"] as const;

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ pedido: string }> },
) {
  const { pedido } = await params;
  const codigo = decodeURIComponent(pedido).toUpperCase();
  if (!esCodigoPedido(codigo)) {
    return NextResponse.json({ error: "Ese pedido no existe" }, { status: 404 });
  }
  try {
    const detalle = await leerHistorialPedido(codigo);
    if (!detalle) return NextResponse.json({ error: "Ese pedido no existe" }, { status: 404 });
    const limpio = Object.fromEntries(
      Object.entries(detalle).filter(
        ([clave]) => !INTERNOS.some((i) => clave.toLowerCase().includes(i)),
      ),
    );
    return NextResponse.json(limpio, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    console.error("[publico] detalle falló:", (e as Error).message);
    return NextResponse.json({ error: "No se pudo cargar el pedido" }, { status: 500 });
  }
}
```

**Antes de dar esto por bueno**, comprobar la firma real de `leerHistorialPedido` (Step 1) y ajustar la llamada si pide más argumentos (por ejemplo la sección). Si el detalle trae los documentos por una URL de `/api/historial/...`, apuntarlos a la ruta pública equivalente; si no existe, añadir `src/app/api/publico/pedidos/[pedido]/documento/[indice]/route.ts` copiando la de `historial` sin más cambios que el nombre.

- [ ] **Step 7: Escribir la ruta de visitas**

Crear `src/app/api/publico/visitas/route.ts`, que es la de hoy sin más:

```ts
import { NextResponse } from "next/server";
import { normalizarFiltrosVisitasCot } from "@/lib/visitas-cot";
import { leerVisitasCot } from "@/lib/server/visitas-cot-db";

// ─── GET /api/publico/visitas ────────────────────────────────────────────────
// Las consultas con OT para quien no tiene sesión. Son las mismas que ve el
// equipo: aquí no hay nada escrito entre nosotros, es lo que RPS guarda de
// cada aviso. La de siempre (/api/visitas-cot) pasa a pedir sesión en la
// Task 5, y esta queda como su puerta abierta.

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const filtros = normalizarFiltrosVisitasCot(new URL(req.url).searchParams);
  try {
    const pagina = await leerVisitasCot(filtros);
    return NextResponse.json(pagina, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("[publico] visitas falló:", (error as Error).message);
    return NextResponse.json({ error: "No se pudieron cargar las visitas" }, { status: 500 });
  }
}
```

- [ ] **Step 8: Ejecutar todo y commit**

Run: `pnpm test && pnpm lint`
Expected: PASS y sin avisos nuevos.

```bash
git add src/app/api/publico src/lib/__tests__/api-publico.test.ts
git commit -m "feat(consulta): rutas de solo lectura para quien no tiene sesión"
```

---

### Task 5: Cerrar las rutas de lectura

Hoy quedan catorce rutas de lectura abiertas. Mientras sigan así, esconder las notas del invitado es decoración: se leen escribiendo la dirección en la barra. Este es el paso que hace verdad todo lo anterior.

**Files:**
- Modify: `src/lib/server/sesion.ts` (helper nuevo al final del fichero)
- Modify: las rutas de lectura, una a una (lista en el Step 3)
- Test: `src/lib/__tests__/api-lecturas-cerradas.test.ts`

**Interfaces:**
- Consumes: `loginActivo`, `exigir`, `quienEs` de `server/sesion.ts`.
- Produces: `function soloConSesion(req: Request): NextResponse | null` — devuelve la respuesta con la que hay que cortar, o `null` para seguir.

- [ ] **Step 1: Escribir el test que falla**

Crear `src/lib/__tests__/api-lecturas-cerradas.test.ts`:

```ts
import { afterAll, beforeAll, expect, test } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

let dir: string;
let s: typeof import("../server/sesion");
let historial: typeof import("../../app/api/historial/route");
let publico: typeof import("../../app/api/publico/pedidos/route");

beforeAll(async () => {
  dir = mkdtempSync(path.join(tmpdir(), "coordina-lecturas-"));
  process.env.COORDINA_DB_PATH = path.join(dir, "test.db");
  process.env.COORDINA_SESION_SECRET = "secreto-de-pruebas";
  process.env.COORDINA_LOGIN = "activo";
  process.env.DATASOURCE = "mock";
  s = await import("../server/sesion");
  historial = await import("../../app/api/historial/route");
  publico = await import("../../app/api/publico/pedidos/route");
});

afterAll(() => {
  process.env.COORDINA_LOGIN = "activo";
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {
    // Windows mantiene abierto el handle del WAL; limpieza best effort.
  }
});

test("sin sesión, el historial del equipo NO se lee", async () => {
  const res = await historial.GET(new Request("http://x/api/historial"));
  expect(res.status).toBe(401);
});

test("con sesión de técnico, el historial se lee como siempre", async () => {
  const res = await historial.GET(
    new Request("http://x/api/historial", {
      headers: { cookie: `coordina_sesion=${s.firmarSesion("tamara")}` },
    }),
  );
  expect(res.status).toBe(200);
});

test("la consulta pública sigue abierta: es su motivo de existir", async () => {
  const res = await publico.GET(new Request("http://x/api/publico/pedidos"));
  expect(res.status).toBe(200);
});

test("con el login APAGADO no cambia nada de lo de hoy", async () => {
  process.env.COORDINA_LOGIN = "off";
  const res = await historial.GET(new Request("http://x/api/historial"));
  expect(res.status).toBe(200);
  process.env.COORDINA_LOGIN = "activo";
});
```

- [ ] **Step 2: Ejecutarlo y verlo fallar**

Run: `pnpm vitest run src/lib/__tests__/api-lecturas-cerradas.test.ts`
Expected: FAIL — el primer test da 200 donde espera 401.

- [ ] **Step 3: Escribir el helper**

Al final de `src/lib/server/sesion.ts`:

```ts
/** La puerta de las LECTURAS del equipo. Devuelve la respuesta con la que hay
 *  que cortar, o null para seguir.
 *
 *  Una función y no la comprobación repetida en catorce rutas: repetirla
 *  garantiza que a la quinceava se le olvide, y aquí lo que se olvida es una
 *  ruta que enseña las notas internas a toda la casa.
 *
 *  Con el login APAGADO deja pasar a todo el mundo, como hasta hoy: apagado no
 *  hay invitados ni sesiones, y cerrar las lecturas dejaría al equipo fuera de
 *  su propia herramienta. */
export function soloConSesion(req: Request): NextResponse | null {
  if (!loginActivo()) return null;
  const yo = exigir(req);
  return yo instanceof NextResponse ? yo : null;
}
```

- [ ] **Step 4: Ponerlo en cada ruta de lectura**

En cada una de estas, la primera línea del `GET` (y del `POST`/`PATCH` donde no lo tengan ya):

```ts
const corte = soloConSesion(req);
if (corte) return corte;
```

Las rutas, una por una:

1. `src/app/api/tablero/route.ts` — quitando además el comentario de «esta ruta NO comprueba sesión», que deja de ser verdad.
2. `src/app/api/historial/route.ts`
3. `src/app/api/historial/[pedido]/route.ts`
4. `src/app/api/historial/[pedido]/documento/[indice]/route.ts`
5. `src/app/api/historial/clientes/route.ts`
6. `src/app/api/metricas/route.ts`
7. `src/app/api/buscar/route.ts`
8. `src/app/api/notas-recientes/route.ts`
9. `src/app/api/notas/route.ts` (el GET; el POST ya usa `identidad`)
10. `src/app/api/avisos/route.ts` (el GET)
11. `src/app/api/visitas-cot/route.ts`
12. `src/app/api/pedidos/[archivo]/route.ts`
13. `src/app/api/pedidos/[archivo]/documentos/route.ts`
14. `src/app/api/fichaje/cola/route.ts` y `src/app/api/fichaje/contraste/route.ts`

**No se tocan**: `src/app/api/sesion/route.ts` ni `src/app/api/personas/route.ts` (GET) — son las que hacen falta para poder entrar, y cerrarlas deja la pantalla del PIN sin caras. Tampoco `src/app/api/health/route.ts`, que la usa el despliegue. Ni las tres de `api/publico/`, que existen para estar abiertas.

Cuando una ruta recibe `req` con otro nombre (o no lo recibe), añadirlo: `export async function GET(req: Request, …)`.

- [ ] **Step 5: Ejecutar los tests**

Run: `pnpm test`
Expected: PASS. Si algún test viejo de rutas empieza a dar 401, es porque corre con `COORDINA_LOGIN=activo` y sin cookie: darle una sesión con `s.firmarSesion("tamara")`, como hace `api-guardas.test.ts`.

- [ ] **Step 6: Comprobar el recuento**

Run: `grep -rLn "soloConSesion\|identidad(\|exigir(" src/app/api --include=route.ts`

Expected: solo `sesion`, `personas`, `health`, `novedades` y las tres de `publico`. Cualquier otra que salga en esa lista es una ruta abierta que se ha escapado.

- [ ] **Step 7: Commit**

```bash
git add src/lib/server/sesion.ts src/app/api src/lib/__tests__/api-lecturas-cerradas.test.ts
git commit -m "feat(sesion): las lecturas del equipo piden sesión"
```

---

### Task 6: La puerta — quién ve qué al entrar

`page.tsx` decide con la cookie. `LoginGate` sale de dentro de `Board` a su propia ruta: desde ahí dentro no puede servir a una pantalla que no es la suya.

**Files:**
- Modify: `src/app/page.tsx`
- Create: `src/app/entrar/page.tsx`
- Modify: `src/components/Board.tsx:1907-1927` (quitar la puerta del login)
- Test: `src/lib/__tests__/puerta-inicio.test.ts`

**Interfaces:**
- Consumes: `quienEs`, `loginActivo` de `server/sesion.ts`; `Consulta` (Task 7 — hasta entonces, un componente mínimo que se completa allí).
- Produces: `/entrar` (pantalla del PIN) y el reparto de `page.tsx`.

- [ ] **Step 1: Escribir el test que falla**

Crear `src/lib/__tests__/puerta-inicio.test.ts`:

```ts
import { beforeAll, expect, test } from "vitest";

let sesion: typeof import("../server/sesion");

beforeAll(async () => {
  process.env.COORDINA_SESION_SECRET = "secreto-de-pruebas";
  sesion = await import("../server/sesion");
});

test("apagado, nadie es invitado: la web es la de siempre", () => {
  process.env.COORDINA_LOGIN = "off";
  expect(sesion.loginActivo()).toBe(false);
});

test("encendido y sin cookie, quienEs no da nadie: eso es un invitado", () => {
  process.env.COORDINA_LOGIN = "activo";
  expect(sesion.quienEs(new Request("http://x/"))).toBeNull();
});
```

- [ ] **Step 2: Ejecutarlo**

Run: `pnpm vitest run src/lib/__tests__/puerta-inicio.test.ts`
Expected: PASS (documenta la regla que va a usar `page.tsx`; si falla, el problema está en `sesion.ts`).

- [ ] **Step 3: Repartir en `src/app/page.tsx`**

```tsx
import { headers } from "next/headers";
import { Board } from "@/components/Board";
import { Consulta } from "@/components/Consulta";
import { getTablero } from "@/lib/data";
import { loginActivo, quienEs } from "@/lib/server/sesion";

// Tablero en vivo: datos frescos en cada carga (imprescindible con DATASOURCE=rps;
// sin esto el build congelaría los datos como HTML estático).
export const dynamic = "force-dynamic";

export default async function Home() {
  // QUIÉN PREGUNTA decide qué web es esta. Con el login encendido, quien no ha
  // entrado ve la consulta: tres pestañas de solo lectura para toda la casa.
  // Apagado no hay invitados y la web es exactamente la de siempre.
  if (loginActivo()) {
    const cabeceras = await headers();
    const yo = quienEs(new Request("http://interno/", { headers: cabeceras }));
    if (!yo) return <Consulta />;
  }

  const { operarios, pedidos, dobleFichaje } = await getTablero();
  return (
    <Board
      operarios={operarios}
      pedidos={pedidos}
      dobleFichaje={dobleFichaje ?? true}
      loginActivo={loginActivo()}
    />
  );
}
```

- [ ] **Step 4: Crear `/entrar`**

Crear `src/app/entrar/page.tsx`:

```tsx
"use client";

import { useRouter } from "next/navigation";
import { LoginGate } from "@/components/LoginGate";

// La pantalla del PIN, que hasta hoy vivía dentro de Board. Desde allí no
// podía servir a la consulta, que no es una vista del tablero: quien llega sin
// sesión ve la consulta y entra por aquí cuando quiere trabajar.
export default function Entrar() {
  const router = useRouter();
  return (
    <LoginGate
      onEntrado={() => {
        // `refresh` y no `push`: la cookie ya está puesta, lo que hace falta es
        // que el servidor vuelva a decidir qué web toca (ver app/page.tsx).
        router.replace("/");
        router.refresh();
      }}
    />
  );
}
```

- [ ] **Step 5: Quitar la puerta de dentro de `Board`**

En `src/components/Board.tsx`, sustituir el bloque de `if (!miId)` (líneas 1916-1927) por:

```tsx
  if (!miId) {
    // Con el login encendido aquí no llega nadie: el servidor manda a la
    // consulta a quien no tiene sesión, y a /entrar a quien quiere trabajar
    // (ver app/page.tsx). Lo que queda es el camino de SIEMPRE, con el login
    // apagado: elegirse en la rejilla de caras, sin PIN.
    //
    // TODOS, no los de la sección que se esté sirviendo: con la lista filtrada
    // nadie de Diseño Gráfico podría elegirse a sí mismo, porque el tablero
    // arranca con el de Oficina Técnica.
    return <IdentityGate operarios={TODOS_LOS_OPERARIOS} onSelect={setMiId} />;
  }
```

Y borrar el `import { LoginGate, type Yo } from "./LoginGate";`, dejando el `type Yo` si se sigue usando (`import type { Yo } from "./LoginGate";`).

El bloque de «Cargando…» de la línea 1907 se queda: mientras se pregunta al servidor quién eres, el tablero no puede pintarse.

- [ ] **Step 6: Probarlo a mano**

```bash
COORDINA_LOGIN=activo COORDINA_SESION_SECRET=pruebas pnpm dev
```

En un navegador **sin cookie** (ventana privada), abrir `http://localhost:3000`:
- Sale la consulta, no la rejilla de caras.
- El botón «Entrar» lleva a `/entrar` y sale la pantalla del PIN.
- Al entrar, vuelve a `/` y sale el tablero de siempre.
- Con `COORDINA_LOGIN` sin poner, `/` es el tablero de siempre y no hay consulta por ninguna parte.

- [ ] **Step 7: Commit**

```bash
git add src/app/page.tsx src/app/entrar src/components/Board.tsx src/lib/__tests__/puerta-inicio.test.ts
git commit -m "feat(consulta): quien no tiene sesión aterriza en la consulta"
```

---

### Task 7: Las tres pestañas

La pantalla del invitado. Reutiliza las piezas que ya existen; lo único nuevo de verdad es la fila de un pedido de la casa.

**Files:**
- Create: `src/components/Consulta.tsx` (la cáscara y las pestañas)
- Create: `src/components/ConsultaPendientes.tsx` (la lista y su fila)
- Modify: `src/components/VisitasCotView.tsx` (prop `base` para el endpoint)
- Modify: `src/components/HistorialView.tsx` (prop `base` para el endpoint y `soloLectura`)
- Test: `src/lib/__tests__/consulta-fila.test.ts`

**Interfaces:**
- Consumes: `GET /api/publico/*` (Task 4), `PedidoPublico` y `frasePublica` (Task 2), `lineaTiempo` y `urgenciaRecorrido` de `lib/linea-tiempo.ts`, `LineaTiempoPedido`, `VisitasCotView`, `HistorialView`.
- Produces: `export function Consulta()` — lo usa `app/page.tsx` (Task 6).

- [ ] **Step 1: Escribir el test que falla**

La regla que no puede romperse: **para un invitado, el recorrido se mide contra la ENTREGA**, no contra la planificada de OT. Esa fecha la recalcula el planificador de RPS en bloque y fuera de OT no significa nada.

Crear `src/lib/__tests__/consulta-fila.test.ts`:

```ts
import { expect, test } from "vitest";
import { lineaTiempo, urgenciaRecorrido } from "../linea-tiempo";

/** Lo que la fila del invitado le pasa a la línea de tiempo: sin planificada
 *  de OT, la entrega manda. */
const recorridoPublico = (p: { fechaCreacion: string; fechaEntrega: string }) => ({
  fechaCreacion: p.fechaCreacion,
  fechaPlanificacion: p.fechaEntrega,
  planificacionEstimada: true,
  fechaEntrega: p.fechaEntrega,
});

test("el recorrido del invitado se mide contra la entrega", () => {
  const p = recorridoPublico({ fechaCreacion: "2026-09-01", fechaEntrega: "2026-09-20" });
  const linea = lineaTiempo(p, "2026-09-10");
  expect(linea.diasParaEntrega).toBe(10);
  const u = urgenciaRecorrido(linea, p as never, "2026-09-10");
  expect(u.sinPlanificar).toBe(true);
});

test("pasada la entrega, el recorrido lo dice", () => {
  const p = recorridoPublico({ fechaCreacion: "2026-08-01", fechaEntrega: "2026-09-01" });
  const linea = lineaTiempo(p, "2026-09-10");
  expect(linea.diasParaEntrega).toBeLessThan(0);
});
```

- [ ] **Step 2: Ejecutarlo**

Run: `pnpm vitest run src/lib/__tests__/consulta-fila.test.ts`
Expected: PASS o FAIL según lo que devuelva `urgenciaRecorrido` con `planificacionEstimada`. Si falla, **leer `src/lib/linea-tiempo.ts` y ajustar el test a lo que la función hace de verdad** — la función es la que manda, el test solo fija la regla de qué fecha se mide.

- [ ] **Step 3: Dar a `VisitasCotView` y a `HistorialView` la dirección de donde leen**

En `src/components/VisitasCotView.tsx`:

```tsx
export function VisitasCotView({ base = "/api/visitas-cot" }: { base?: string } = {}) {
```

y en la llamada de la línea 120:

```tsx
        const res = await fetch(`${base}?${params}`, { cache: "no-store" });
```

Añadir `base` a las dependencias del `useCallback` de `cargar`.

En `src/components/HistorialView.tsx`, añadir a las props:

```tsx
  /** De dónde lee. El invitado lee de la suya, que no trae nada interno. */
  base?: string;
  /** Sin acciones: ni finalizar fases, ni notas, ni marcar nada. */
  soloLectura?: boolean;
```

con `base = "/api/historial"` y `soloLectura = false` por defecto, sustituyendo `"/api/historial"` por `base` en los `fetch`, y envolviendo en `{!soloLectura && (…)}` todo control que escriba (el filtro por persona se queda: el invitado ve nombres).

- [ ] **Step 4: Escribir `ConsultaPendientes.tsx`**

```tsx
"use client";

import { useCallback, useEffect, useState } from "react";
import type { PedidoPublico } from "@/lib/publico";
import { lineaTiempo, urgenciaRecorrido } from "@/lib/linea-tiempo";
import { hoyISO } from "@/lib/types";
import { fmtDiaMes } from "@/lib/fechas";
import { ErrorCarga } from "./ErrorCarga";

// ─── Los pedidos de la casa, para quien solo mira ────────────────────────────
// Lo primero que se ve: lo que se entrega antes, y lo vencido arriba. Contesta
// "¿qué va tarde?" sin tocar un filtro, que es la pregunta con la que la gente
// llega aquí.

export function ConsultaPendientes({ lista }: { lista: "pendientes" | "realizados" }) {
  const [pedidos, setPedidos] = useState<PedidoPublico[]>([]);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [q, setQ] = useState("");
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(false);

  const cargar = useCallback(async () => {
    setCargando(true);
    setError(false);
    try {
      const sp = new URLSearchParams({ lista, page: String(page) });
      if (q.trim()) sp.set("q", q.trim());
      const res = await fetch(`/api/publico/pedidos?${sp}`, { cache: "no-store" });
      if (!res.ok) throw new Error(String(res.status));
      const json: { pedidos: PedidoPublico[]; hasMore: boolean } = await res.json();
      setPedidos((previos) => (page === 0 ? json.pedidos : [...previos, ...json.pedidos]));
      setHasMore(json.hasMore);
    } catch {
      setError(true);
    } finally {
      setCargando(false);
    }
  }, [lista, page, q]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  // Sin sondeo automático: toda la casa preguntando cada 30 segundos es carga
  // de RPS a cambio de nada. Nadie mira esta pantalla esperando a que cambie.
  return (
    <div className="p-5">
      <div className="mb-4 flex items-center gap-2">
        <input
          type="search"
          value={q}
          onChange={(e) => {
            setPage(0);
            setQ(e.target.value);
          }}
          placeholder="Pedido, cliente o descripción"
          className="glass-chip h-9 w-full max-w-md rounded-lg px-3 text-sm"
        />
        <button
          type="button"
          onClick={() => {
            setPage(0);
            void cargar();
          }}
          className="glass-chip h-9 rounded-lg px-3 text-sm"
        >
          Actualizar
        </button>
      </div>

      {error && <ErrorCarga onReintentar={() => void cargar()} />}

      <ul className="flex flex-col gap-2">
        {pedidos.map((p) => (
          <FilaPublica key={p.codigo} pedido={p} />
        ))}
      </ul>

      {cargando && <p className="p-4 text-sm text-text-muted">Cargando…</p>}
      {hasMore && !cargando && (
        <button
          type="button"
          onClick={() => setPage((n) => n + 1)}
          className="glass-chip mt-3 h-9 rounded-lg px-3 text-sm"
        >
          Ver más
        </button>
      )}
    </div>
  );
}

function FilaPublica({ pedido }: { pedido: PedidoPublico }) {
  const hoy = hoyISO();
  const [abierto, setAbierto] = useState(false);
  // Sin planificada de OT: la entrega manda, y `planificacionEstimada` es lo
  // que le dice eso a la línea (ver lib/linea-tiempo.ts).
  const recorrido = pedido.fechaEntrega
    ? lineaTiempo(
        {
          fechaCreacion: pedido.fechaPedido ?? undefined,
          fechaPlanificacion: pedido.fechaEntrega,
          planificacionEstimada: true,
          fechaEntrega: pedido.fechaEntrega,
        },
        hoy,
      )
    : null;
  const vencido = recorrido !== null && recorrido.diasParaEntrega < 0;

  return (
    <li className="glass-panel rounded-xl p-3">
      <button
        type="button"
        onClick={() => setAbierto((a) => !a)}
        className="flex w-full items-baseline justify-between gap-3 text-left"
        aria-expanded={abierto}
      >
        <span className="font-semibold">{pedido.codigo}</span>
        <span className="truncate text-sm text-text-muted">{pedido.cliente ?? "—"}</span>
        <span className={`text-sm ${vencido ? "text-red-500" : "text-text-muted"}`}>
          {pedido.fechaEntrega ? fmtDiaMes(pedido.fechaEntrega) : "Sin fecha"}
        </span>
      </button>
      <p className="mt-1 text-[13px] text-text-muted">{pedido.estado}</p>
      {abierto && <DetallePublico codigo={pedido.codigo} />}
    </li>
  );
}

/** Las OF con sus tareas y tiempos, y el PDF del pedido. Se pide al abrir y no
 *  con la lista: son 40 pedidos por página y casi ninguno se abre. */
function DetallePublico({ codigo }: { codigo: string }) {
  const [detalle, setDetalle] = useState<Record<string, unknown> | null>(null);
  useEffect(() => {
    let vivo = true;
    fetch(`/api/publico/pedidos/${encodeURIComponent(codigo)}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (vivo) setDetalle(j);
      })
      .catch(() => {});
    return () => {
      vivo = false;
    };
  }, [codigo]);

  if (!detalle) return <p className="mt-2 text-sm text-text-muted">Cargando…</p>;
  return <DetalleDelPedido detalle={detalle} />;
}
```

`DetalleDelPedido` pinta las OF y sus tareas. **Antes de escribirlo**, mirar cómo lo hace ya el equipo en `src/components/HistorialTareas.tsx` y `src/components/HistorialOFsCompactas.tsx` y usar esos componentes tal cual con los datos del detalle público: son las mismas OF y las mismas tareas, y duplicar la pintura garantiza que dentro de un mes digan cosas distintas. El enlace al PDF es el campo `scanUrl` del detalle.

- [ ] **Step 5: Escribir `Consulta.tsx`**

```tsx
"use client";

import { useState } from "react";
import { ConsultaPendientes } from "./ConsultaPendientes";
import { HistorialView, FILTROS_HISTORIAL_INICIALES, type FiltrosHistorial } from "./HistorialView";
import { VisitasCotView } from "./VisitasCotView";
import { Logo } from "./Logo";
import { ThemeToggle } from "./ThemeToggle";

// ─── La web para quien no ha entrado ─────────────────────────────────────────
// Tres pestañas y ni un botón que guarde. No es el Board con cosas escondidas:
// es otra pantalla, para que el día que se olvide esconder algo no sea un botón
// de escribir delante de quien no debe.

type Pestana = "pendientes" | "realizados" | "consultas";

const PESTANAS: { id: Pestana; label: string }[] = [
  { id: "pendientes", label: "Pedidos Pendientes" },
  { id: "realizados", label: "Pedidos Realizados" },
  { id: "consultas", label: "Consultas con OT" },
];

export function Consulta() {
  const [pestana, setPestana] = useState<Pestana>("pendientes");
  const [filtros, setFiltros] = useState<FiltrosHistorial>({
    ...FILTROS_HISTORIAL_INICIALES,
    // El invitado mira la casa entera, no el trabajo de una sección.
    soloSeccion: false,
  });

  return (
    <div className="min-h-full">
      <header className="glass-panel sticky top-0 z-10 flex items-center gap-3 px-4 py-2">
        <Logo />
        <nav className="glass-chip inline-flex rounded-lg p-[3px]">
          {PESTANAS.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => setPestana(p.id)}
              aria-current={p.id === pestana ? "page" : undefined}
              className={`h-7 rounded-md px-3 text-sm ${p.id === pestana ? "bg-[var(--glass-highlight)] font-semibold" : ""}`}
            >
              {p.label}
            </button>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <ThemeToggle />
          <a href="/entrar" className="glass-chip h-9 rounded-lg px-3 text-sm leading-9">
            Entrar
          </a>
        </div>
      </header>

      {pestana === "pendientes" && <ConsultaPendientes lista="pendientes" />}
      {pestana === "realizados" && (
        <div className="p-5">
          <HistorialView
            base="/api/publico/pedidos?lista=realizados"
            soloLectura
            filtros={filtros}
            onFiltros={(cambio) => setFiltros((f) => ({ ...f, ...cambio }))}
          />
        </div>
      )}
      {pestana === "consultas" && (
        <div className="p-5">
          <VisitasCotView base="/api/publico/visitas" />
        </div>
      )}
    </div>
  );
}
```

**Si `HistorialView` no encaja** con la forma de `/api/publico/pedidos` (campos distintos), no deformar ninguna de las dos: usar `ConsultaPendientes lista="realizados"` para esta pestaña también, con la columna de cierre en lugar de la de entrega, y las tareas y tiempos en el desplegable. Es la misma fila con otra fecha, y sale más barato que retorcer una vista de 537 líneas que el equipo usa a diario.

- [ ] **Step 6: Probarlo a mano**

```bash
COORDINA_LOGIN=activo COORDINA_SESION_SECRET=pruebas pnpm dev
```

En ventana privada, en `http://localhost:3000`:
- Las tres pestañas cargan y ninguna tiene un botón que guarde.
- La lista de pendientes empieza por lo que se entrega antes; lo vencido, en rojo.
- Al desplegar un pedido salen sus OF, tareas y tiempos.
- **Buscar «nota» en el HTML de la página (Ctrl+U) no encuentra ni una nota interna.**

- [ ] **Step 7: Pasar el revisor de interfaz**

Run: el agente `ui-reviewer` sobre `src/components/Consulta.tsx` y `src/components/ConsultaPendientes.tsx`.
Arreglar lo que diga de foco, contraste y tema claro/oscuro. Esta pantalla la va a abrir gente que no ha visto la web nunca.

- [ ] **Step 8: Commit**

```bash
git add src/components/Consulta.tsx src/components/ConsultaPendientes.tsx src/components/VisitasCotView.tsx src/components/HistorialView.tsx src/lib/__tests__/consulta-fila.test.ts
git commit -m "feat(consulta): tres pestañas de solo lectura para toda la casa"
```

---

### Task 8: Repaso y despliegue apagado

**Files:**
- Modify: `docs/despliegue-login.md`
- Modify: `.env.example`

- [ ] **Step 1: Todo verde**

Run: `pnpm test && pnpm lint && pnpm build`
Expected: PASS las tres. El build es el que caza los tipos que vitest no mira.

- [ ] **Step 2: Las dos caras, a mano, contra RPS**

Con `.env.local` apuntando a RPS y `COORDINA_LOGIN=activo`:

1. Ventana privada → consulta. Abrir un pedido pendiente y comprobar contra RPS que los centros que dice son los que tiene abiertos.
2. Entrar con un PIN → tablero de siempre, fichaje incluido.
3. `COORDINA_LOGIN` fuera → la web es exactamente la de hoy, sin consulta y sin PIN.

Con **cada una** de estas direcciones, en ventana privada y con el login encendido, comprobar que responden 401:

```bash
for r in historial metricas buscar notas-recientes tablero visitas-cot; do
  echo -n "$r: "; curl -s -o /dev/null -w "%{http_code}\n" "http://localhost:3000/api/$r"
done
```

Expected: `401` en las seis.

- [ ] **Step 3: Escribir el día de encenderlo**

En `docs/despliegue-login.md`, añadir al final la sección de la fase 2: qué cambia para la casa el día que se enciende, y **el orden** — encender el login sin la consulta deja a la casa fuera de una web que antes veían entera.

En `.env.example`, dejar dicho junto a `COORDINA_LOGIN` que ese mismo interruptor enciende la consulta sin login.

- [ ] **Step 4: Commit**

```bash
git add docs/despliegue-login.md .env.example
git commit -m "docs(consulta): cómo se enciende, y en qué orden"
```

---

## Lo que este plan NO hace

- **No enseña pedidos sin ninguna OF** (asistencias, portes, material de almacén: 1.060 de los 6.393 de 2026). No pasan por fábrica y no tienen recorrido que enseñar. El índice ya los deja fuera por construcción.
- **No abre las Métricas ni el buscador global** al invitado.
- **No construye la vista de supervisión** de Cris, Carlos y Esteban: es la fase 3, y sigue aplazada hasta saber qué preguntas quieren contestar.
- **No enciende nada.** Todo se despliega apagado, como el login.
