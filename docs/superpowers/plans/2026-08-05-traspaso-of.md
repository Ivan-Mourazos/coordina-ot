# Traspaso de trabajo entre operarios — plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Poder pasar una OF suelta (o el pedido entero) a otro operario conservando los tiempos ya fichados, cambiar el revisor cuando hay un cambio de última hora, y que Producción reciba el pedido solo cuando todas sus OF están aprobadas.

**Architecture:** Las reglas del traspaso viven en funciones puras (`lib/traspaso.ts`, `lib/avisos.ts`) que se prueban sin BD ni React. El corte del fichaje ajeno lo hace el **servidor** con su reloj, porque la persona afectada puede estar en otro equipo. Los avisos se derivan de `acciones_log`, que ya registra cada mutación; el endpoint devuelve datos crudos (ids) y el cliente compone el texto con los operarios y pedidos que ya tiene en memoria.

**Tech Stack:** Next.js 16 (App Router), React 19, TypeScript, better-sqlite3, vitest.

## Global Constraints

- **Lee `node_modules/next/dist/docs/` antes de usar cualquier API de Next que no esté ya en el repo** (AGENTS.md: "This is NOT the Next.js you know").
- Comentarios y textos de interfaz **en español**. Los comentarios explican *por qué*, no *qué*.
- Clases de Tailwind **literales**: nunca construidas por concatenación, o no se compilan.
- Está activo `react-hooks/set-state-in-effect`: no llamar a `setState` de forma síncrona dentro de un `useEffect`.
- Verificación de cada tarea: `npx vitest run && npx tsc --noEmit && npx eslint src`.
- El revisor **solo** se nombra al mandar a revisar o al corregir uno ya nombrado. No se reintroduce ningún selector de revisor sobre OF que no lo tengan.
- No se añaden permisos por rol. La seguridad es el rastro, no el candado.

---

### Task 1: Reglas puras del traspaso

**Files:**
- Create: `src/lib/traspaso.ts`
- Test: `src/lib/__tests__/traspaso.test.ts`

**Interfaces:**
- Consumes: `OF`, `EstadoOF` de `src/lib/types.ts`.
- Produces: `puedeTraspasarAutor(of: OF): boolean`, `traspasarAutor(of: OF, autorId: string): OF`, `puedeCambiarRevisor(of: OF): boolean`, `cambiarRevisor(of: OF, revisorId: string): OF`.

- [ ] **Step 1: Write the failing test**

Crea `src/lib/__tests__/traspaso.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { OF } from "../types";
import {
  cambiarRevisor,
  puedeCambiarRevisor,
  puedeTraspasarAutor,
  traspasarAutor,
} from "../traspaso";

const of = (parcial: Partial<OF> = {}): OF => ({
  id: "of-1",
  codigo: "OF-023",
  descripcion: "Toldo portal A",
  familia: "TOLDO",
  piezas: 1,
  autorId: "ivan",
  revisorId: null,
  estado: "en_curso",
  fichandoRol: null,
  tiempoEstimadoMin: 60,
  tiempoPlanteoMin: 52,
  tiempoRevisionMin: 0,
  ...parcial,
});

describe("puedeTraspasarAutor", () => {
  it("solo donde queda trabajo del autor", () => {
    expect(puedeTraspasarAutor(of({ estado: "pendiente" }))).toBe(true);
    expect(puedeTraspasarAutor(of({ estado: "en_curso" }))).toBe(true);
    expect(puedeTraspasarAutor(of({ estado: "devuelta" }))).toBe(true);
  });

  it("no cuando el autor ya terminó ni sobre lo anulado", () => {
    expect(puedeTraspasarAutor(of({ estado: "por_revisar" }))).toBe(false);
    expect(puedeTraspasarAutor(of({ estado: "en_revision" }))).toBe(false);
    expect(puedeTraspasarAutor(of({ estado: "aprobada" }))).toBe(false);
    expect(puedeTraspasarAutor(of({ estado: "anulada" }))).toBe(false);
  });
});

describe("traspasarAutor", () => {
  it("conserva el trabajo hecho y solo cambia de manos", () => {
    const r = traspasarAutor(of({ observacion: "faltan cotas" }), "tamara");
    expect(r.autorId).toBe("tamara");
    expect(r.estado).toBe("en_curso");
    expect(r.tiempoPlanteoMin).toBe(52);
    expect(r.observacion).toBe("faltan cotas");
  });

  it("borra el revisor: se nombró para el trabajo del autor anterior", () => {
    const r = traspasarAutor(of({ estado: "devuelta", revisorId: "tamara" }), "jaime");
    expect(r.revisorId).toBeNull();
  });

  it("no deja a nadie de autor y revisor a la vez", () => {
    const r = traspasarAutor(of({ estado: "devuelta", revisorId: "tamara" }), "tamara");
    expect(r.autorId).toBe("tamara");
    expect(r.revisorId).toBeNull();
  });
});

describe("cambiarRevisor", () => {
  it("solo sobre OF que ya tienen revisión en marcha", () => {
    expect(puedeCambiarRevisor(of({ estado: "por_revisar" }))).toBe(true);
    expect(puedeCambiarRevisor(of({ estado: "en_revision" }))).toBe(true);
    expect(puedeCambiarRevisor(of({ estado: "en_curso" }))).toBe(false);
    expect(puedeCambiarRevisor(of({ estado: "aprobada" }))).toBe(false);
  });

  it("en por_revisar solo cambia el nombre", () => {
    const r = cambiarRevisor(of({ estado: "por_revisar", revisorId: "tamara" }), "jaime");
    expect(r.revisorId).toBe("jaime");
    expect(r.estado).toBe("por_revisar");
  });

  it("si la revisión ya había empezado, vuelve a por_revisar", () => {
    const r = cambiarRevisor(
      of({ estado: "en_revision", revisorId: "tamara", tiempoRevisionMin: 20 }),
      "jaime",
    );
    expect(r.estado).toBe("por_revisar");
    expect(r.revisorId).toBe("jaime");
    // El tiempo de Tamara no se toca: es suyo y ya está fichado.
    expect(r.tiempoRevisionMin).toBe(20);
  });

  it("el autor nunca puede ser su propio revisor", () => {
    expect(() => cambiarRevisor(of({ estado: "por_revisar" }), "ivan")).toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/__tests__/traspaso.test.ts`
Expected: FAIL — `Failed to resolve import "../traspaso"`.

- [ ] **Step 3: Write minimal implementation**

Crea `src/lib/traspaso.ts`:

```ts
import type { OF } from "./types";

// ─── Pasarle trabajo a otro ──────────────────────────────────────────────────
// Las dos operaciones que mueven una OF de manos, como funciones puras: el
// estado, los tiempos y la observación son datos del TRABAJO y sobreviven al
// cambio; lo que cambia es quién lo tiene.

/** Traspasar la autoría solo tiene sentido donde queda trabajo del autor. En
 *  `por_revisar`, `en_revision` y `aprobada` su parte ya terminó: cambiar el
 *  nombre ahí no movería trabajo, solo reescribiría quién lo hizo. */
export function puedeTraspasarAutor(of: OF): boolean {
  return of.estado === "pendiente" || of.estado === "en_curso" || of.estado === "devuelta";
}

/** La OF cambia de manos tal como está: mismo estado, mismos tiempos, misma
 *  observación. No empieza de cero.
 *
 *  El revisor SÍ se borra: se nombró para el trabajo del autor anterior, y el
 *  nuevo lo elegirá cuando mande a revisar (que es el único momento en que se
 *  nombra revisor). De paso hace imposible que alguien acabe siendo autor y
 *  revisor de la misma OF. */
export function traspasarAutor(of: OF, autorId: string): OF {
  return { ...of, autorId, revisorId: null };
}

/** Cambiar un revisor YA nombrado —cambio de última hora, alguien que se pone
 *  malo— no contradice la regla de "el revisor se nombra al mandar a revisar":
 *  no es elegirlo antes de tiempo, es corregir una elección hecha. */
export function puedeCambiarRevisor(of: OF): boolean {
  return of.estado === "por_revisar" || of.estado === "en_revision";
}

/** Si la revisión ya había empezado, la OF vuelve a `por_revisar` y el nuevo
 *  arranca cuando pulse "Empezar revisión". No se deja en `en_revision`
 *  esperando: quedaría marcada como "se está revisando" sin que nadie la esté
 *  revisando. El tiempo del anterior no se toca, es suyo y ya está fichado. */
export function cambiarRevisor(of: OF, revisorId: string): OF {
  if (revisorId === of.autorId)
    throw new Error("El revisor no puede ser el autor de la OF");
  return { ...of, revisorId, estado: "por_revisar" };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/__tests__/traspaso.test.ts`
Expected: PASS — 8 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/traspaso.ts src/lib/__tests__/traspaso.test.ts
git commit -m "feat(traspaso): reglas puras de cambiar autor y revisor de una OF"
```

---

### Task 2: Cortar el fichaje ajeno desde el servidor

**Files:**
- Modify: `src/lib/server/fichaje-db.ts` (añadir al final, antes de `guardarFichaje`)
- Test: `src/lib/__tests__/fichaje-db.test.ts` (añadir al final)

**Interfaces:**
- Consumes: `leerTodosIntervalos()`, `leerFichaje()`, `guardarFichaje()` del mismo módulo; `fichar` de `src/lib/fichaje.ts`.
- Produces: `cortarFichajeDeOF(ofId: string, ahora: string): string[]` — devuelve los `operarioId` a los que se les cortó.

- [ ] **Step 1: Write the failing test**

Añade al final de `src/lib/__tests__/fichaje-db.test.ts`:

```ts
test("cortarFichajeDeOF cierra el fichaje de OTRO operario y respeta el resto de OFs", () => {
  // Tamara ficha dos OFs a la vez; se traspasa solo una.
  let f = fichar(FICHAJE_VACIO, ["OF-T1", "OF-T2"], "plantear", "tamara", "2026-08-05T09:00:00.000Z");
  db.guardarFichaje("tamara", f);

  const afectados = db.cortarFichajeDeOF("OF-T1", "2026-08-05T09:30:00.000Z");
  expect(afectados).toEqual(["tamara"]);

  const guardado = db.leerFichaje("tamara");
  // El tramo compartido se cierra a las 09:30 y se abre otro solo con OF-T2:
  // si se borrase el intervalo, se perdería el tiempo de la que sigue siendo suya.
  expect(guardado.intervalos).toHaveLength(2);
  expect(guardado.intervalos[0].fin).toBe("2026-08-05T09:30:00.000Z");
  expect(guardado.intervalos[0].ofIds).toEqual(["OF-T1", "OF-T2"]);
  expect(guardado.intervalos[1].fin).toBeNull();
  expect(guardado.intervalos[1].ofIds).toEqual(["OF-T2"]);
});

test("cortarFichajeDeOF con la única OF del intervalo deja el fichaje parado", () => {
  const f = fichar(FICHAJE_VACIO, ["OF-U1"], "revisar", "jaime", "2026-08-05T10:00:00.000Z");
  db.guardarFichaje("jaime", f);

  expect(db.cortarFichajeDeOF("OF-U1", "2026-08-05T10:20:00.000Z")).toEqual(["jaime"]);
  const guardado = db.leerFichaje("jaime");
  expect(guardado.intervalos).toHaveLength(1);
  expect(guardado.intervalos[0].fin).toBe("2026-08-05T10:20:00.000Z");
});

test("cortarFichajeDeOF no toca a quien no la está fichando", () => {
  const f = fichar(FICHAJE_VACIO, ["OF-V1"], "plantear", "adrian", "2026-08-05T11:00:00.000Z");
  db.guardarFichaje("adrian", f);

  expect(db.cortarFichajeDeOF("OF-QUE-NADIE-FICHA", "2026-08-05T11:10:00.000Z")).toEqual([]);
  expect(db.leerFichaje("adrian").intervalos[0].fin).toBeNull();
});
```

Comprueba la cabecera del fichero: si no importa `fichar`/`FICHAJE_VACIO`, añádelo a los imports existentes (`import { fichar, FICHAJE_VACIO } from "../fichaje";`).

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/__tests__/fichaje-db.test.ts`
Expected: FAIL — `db.cortarFichajeDeOF is not a function`.

- [ ] **Step 3: Write minimal implementation**

En `src/lib/server/fichaje-db.ts`, añade el import de `fichar` a la primera línea de imports y esta función justo antes de `guardarFichaje`:

```ts
/** Cierra el fichaje que CUALQUIER operario tenga abierto sobre esta OF y
 *  devuelve a quiénes afectó.
 *
 *  Existe porque traspasar una OF es soltarla: si el intervalo sigue abierto,
 *  al anterior le sigue corriendo el tiempo de algo que ya no es suyo. Y a
 *  diferencia del resto del fichaje, esto NO lo puede hacer el navegador de
 *  quien traspasa: el afectado puede estar en otro equipo, o con la app
 *  cerrada. Lo hace el servidor, con su reloj, que es la hora oficial.
 *
 *  Si el intervalo llevaba más OFs, se cierra y se abre otro con las que
 *  quedan: borrarlo perdería el tiempo de las que siguen siendo suyas. */
export function cortarFichajeDeOF(ofId: string, ahora: string): string[] {
  const abiertos = getDb()
    .prepare(`${SELECT} WHERE fin IS NULL`)
    .all() as Fila[];
  const afectados: string[] = [];
  for (const fila of abiertos) {
    const iv = filaAIntervalo(fila);
    if (!iv || !iv.ofIds.includes(ofId)) continue;
    const resto = iv.ofIds.filter((id) => id !== ofId);
    const actual = leerFichaje(iv.operarioId);
    guardarFichaje(iv.operarioId, fichar(actual, resto, iv.rol, iv.operarioId, ahora));
    afectados.push(iv.operarioId);
  }
  return afectados;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/__tests__/fichaje-db.test.ts`
Expected: PASS — los 3 tests nuevos entre los ya existentes.

- [ ] **Step 5: Commit**

```bash
git add src/lib/server/fichaje-db.ts src/lib/__tests__/fichaje-db.test.ts
git commit -m "feat(fichaje): cortar desde el servidor el fichaje que otro tenga sobre una OF"
```

---

### Task 3: El servidor registra el estado previo de cada cambio

**Files:**
- Modify: `src/lib/server/estado-db.ts` (función `guardarMutacion`)
- Test: `src/lib/__tests__/estado-db.test.ts` (crear si no existe)

**Interfaces:**
- Produces: cada fila de `acciones_log` pasa a guardar `detalle.previos: CambioOF[]` con el estado que tenían esas OF **antes** del cambio. Task 4 lo lee para saber "antes Tamara".

- [ ] **Step 1: Write the failing test**

Crea `src/lib/__tests__/estado-db.test.ts` (si ya existe, añade solo el `test`):

```ts
import { afterAll, beforeAll, expect, test } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

let dir: string;
let db: typeof import("../server/estado-db");

beforeAll(async () => {
  dir = mkdtempSync(path.join(tmpdir(), "coordina-estado-"));
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

test("el log guarda el estado PREVIO, no solo el nuevo", () => {
  const of = {
    ofId: "of-p1",
    autorId: "ivan",
    revisorId: null,
    estado: "en_curso" as const,
    observacion: null,
  };
  db.guardarMutacion({ operarioId: "ivan", motivo: "asignar", cambiosOF: [of] });
  db.guardarMutacion({
    operarioId: "ivan",
    motivo: "traspaso",
    cambiosOF: [{ ...of, autorId: "tamara" }],
  });

  const filas = db.leerAccionesDesde("1970-01-01T00:00:00.000Z");
  const traspaso = filas.find((f) => f.motivo === "traspaso")!;
  // Sin el previo no se puede decir "antes Iván": el cliente solo manda el
  // snapshot nuevo, así que el anterior lo tiene que leer el servidor.
  expect(traspaso.previos).toEqual([expect.objectContaining({ ofId: "of-p1", autorId: "ivan" })]);
  expect(traspaso.cambiosOF).toEqual([expect.objectContaining({ autorId: "tamara" })]);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/__tests__/estado-db.test.ts`
Expected: FAIL — `db.leerAccionesDesde is not a function`.

- [ ] **Step 3: Write minimal implementation**

En `src/lib/server/estado-db.ts`, dentro de `guardarMutacion`, antes del `db.transaction(...)` añade la lectura del previo, y sustituye el `log.run(...)` por la versión que lo guarda:

```ts
  // El cliente manda el snapshot NUEVO de cada OF; el anterior solo lo sabe el
  // servidor, y hace falta para poder decir "antes Tamara" en los avisos.
  const leerPrevio = db.prepare(
    "SELECT of_id AS ofId, autor_id AS autorId, revisor_id AS revisorId, estado, observacion FROM of_overlay WHERE of_id = ?",
  );
```

Dentro de la transacción, antes del bucle de upserts:

```ts
    const previos = (m.cambiosOF ?? [])
      .map((c) => leerPrevio.get(c.ofId) as CambioOF | undefined)
      .filter((x): x is CambioOF => x !== undefined);
```

Y en el `log.run`, añade `previos` al JSON:

```ts
      JSON.stringify({
        cambiosOF: m.cambiosOF ?? [],
        previos,
        completarPedidoId: m.completarPedidoId ?? null,
      }),
```

Añade al final del fichero el lector:

```ts
export interface AccionLog {
  id: number;
  ts: string;
  operarioId: string | null;
  motivo: string;
  cambiosOF: CambioOF[];
  previos: CambioOF[];
}

/** Movimientos registrados desde `desde` (ISO), del más reciente al más
 *  antiguo. Es la materia prima de los avisos de traspaso: un cambio de manos
 *  no deja marca en la OF, así que solo se puede saber leyendo el registro. */
export function leerAccionesDesde(desde: string): AccionLog[] {
  const filas = abrir()
    .prepare(
      "SELECT id, ts, operario_id, motivo, detalle FROM acciones_log WHERE ts >= ? ORDER BY id DESC",
    )
    .all(desde) as Array<{
    id: number;
    ts: string;
    operario_id: string | null;
    motivo: string;
    detalle: string;
  }>;
  return filas.flatMap((f) => {
    let d: { cambiosOF?: CambioOF[]; previos?: CambioOF[] };
    try {
      d = JSON.parse(f.detalle);
    } catch {
      return []; // fila corrupta: se ignora, nunca se propaga a medias
    }
    return [
      {
        id: f.id,
        ts: f.ts,
        operarioId: f.operario_id,
        motivo: f.motivo,
        cambiosOF: d.cambiosOF ?? [],
        previos: d.previos ?? [],
      },
    ];
  });
}
```

Asegúrate de que `CambioOF` está importado en el fichero (`import type { CambioOF } from "./overlay";` si no lo estaba).

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/__tests__/estado-db.test.ts && npx vitest run`
Expected: PASS. Los registros anteriores sin `previos` devuelven `[]`, no rompen.

- [ ] **Step 5: Commit**

```bash
git add src/lib/server/estado-db.ts src/lib/__tests__/estado-db.test.ts
git commit -m "feat(estado): el registro de acciones guarda también el estado previo"
```

---

### Task 4: Derivar los avisos de traspaso

**Files:**
- Create: `src/lib/avisos.ts`
- Test: `src/lib/__tests__/avisos.test.ts`

**Interfaces:**
- Consumes: `AccionLog` de `src/lib/server/estado-db.ts` (solo el tipo; la función es pura y recibe la lista ya leída).
- Produces: `type TipoAviso`, `interface AvisoMovimiento`, `avisosPara(acciones: AccionLog[], operarioId: string, vistos: ReadonlySet<number>): AvisoMovimiento[]`, `VENTANA_AVISOS_DIAS = 30`.

- [ ] **Step 1: Write the failing test**

Crea `src/lib/__tests__/avisos.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { AccionLog } from "../server/estado-db";
import { avisosPara } from "../avisos";

const accion = (parcial: Partial<AccionLog>): AccionLog => ({
  id: 1,
  ts: "2026-08-05T09:00:00.000Z",
  operarioId: "ivan",
  motivo: "traspaso",
  cambiosOF: [],
  previos: [],
  ...parcial,
});

const of = (ofId: string, autorId: string | null, revisorId: string | null) => ({
  ofId,
  autorId,
  revisorId,
  estado: "en_curso" as const,
  observacion: null,
});

describe("avisosPara", () => {
  const traspaso = accion({
    id: 7,
    operarioId: "ivan",
    previos: [of("of-1", "ivan", null)],
    cambiosOF: [of("of-1", "tamara", null)],
  });

  it("avisa al que recibe el trabajo", () => {
    const r = avisosPara([traspaso], "tamara", new Set());
    expect(r).toEqual([
      { logId: 7, ts: traspaso.ts, tipo: "recibida", ofId: "of-1", quien: "ivan", otro: "ivan" },
    ]);
  });

  it("avisa también al que lo pierde: si no, ve desaparecer algo sin saber por qué", () => {
    const deAngel = accion({ ...traspaso, id: 8, operarioId: "angel" });
    const r = avisosPara([deAngel], "ivan", new Set());
    expect(r[0]).toMatchObject({ tipo: "cedida", quien: "angel", otro: "tamara" });
  });

  it("no se avisa a sí mismo de lo que acaba de hacer", () => {
    expect(avisosPara([traspaso], "ivan", new Set())).toEqual([]);
  });

  it("no avisa de asignar trabajo que no tenía dueño", () => {
    const asignar = accion({
      id: 9,
      motivo: "asignar",
      previos: [of("of-2", null, null)],
      cambiosOF: [of("of-2", "tamara", null)],
    });
    // Una OF que sale de la bandeja ya se anuncia sola en la campana como
    // "sin empezar": repetirlo aquí sería el mismo aviso dos veces.
    expect(avisosPara([asignar], "tamara", new Set())).toEqual([]);
  });

  it("avisa del cambio de revisor en las dos direcciones", () => {
    const cambio = accion({
      id: 10,
      motivo: "revisor",
      operarioId: "ivan",
      previos: [of("of-3", "ivan", "tamara")],
      cambiosOF: [of("of-3", "ivan", "jaime")],
    });
    expect(avisosPara([cambio], "jaime", new Set())[0]).toMatchObject({
      tipo: "revisarNueva",
      otro: "tamara",
    });
    expect(avisosPara([cambio], "tamara", new Set())[0]).toMatchObject({
      tipo: "revisarQuitada",
      otro: "jaime",
    });
  });

  it("los ya vistos no vuelven a salir", () => {
    expect(avisosPara([traspaso], "tamara", new Set([7]))).toEqual([]);
  });

  it("ignora los cambios que no mueven a nadie de sitio", () => {
    const soloEstado = accion({
      id: 11,
      motivo: "accion",
      previos: [of("of-4", "ivan", null)],
      cambiosOF: [{ ...of("of-4", "ivan", null), estado: "por_revisar" }],
    });
    expect(avisosPara([soloEstado], "ivan", new Set())).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/__tests__/avisos.test.ts`
Expected: FAIL — `Failed to resolve import "../avisos"`.

- [ ] **Step 3: Write minimal implementation**

Crea `src/lib/avisos.ts`:

```ts
import type { AccionLog } from "./server/estado-db";

// ─── Avisos de "te han movido el trabajo" ────────────────────────────────────
// Los tres avisos originales de la campana se DEDUCEN mirando la OF (me toca
// revisar, me la han devuelto, la tengo sin empezar). Un cambio de manos no
// deja marca en la OF: pasado un segundo, mirándola, no hay forma de saber que
// antes era de otro. Por eso estos se leen del registro de acciones.
//
// Función pura: recibe el registro ya leído y devuelve ids. El texto lo compone
// el cliente, que es quien tiene los nombres de los operarios y los códigos de
// pedido; el servidor no necesita cargar el tablero (que en RPS tarda 7-15 s).

export type TipoAviso = "recibida" | "cedida" | "revisarNueva" | "revisarQuitada";

export interface AvisoMovimiento {
  /** Fila de `acciones_log`. Es lo que se marca como visto. */
  logId: number;
  ts: string;
  tipo: TipoAviso;
  ofId: string;
  /** Quién hizo el cambio. */
  quien: string | null;
  /** La otra parte: de quién venía, o a quién ha ido. */
  otro: string | null;
}

/** Cuánto aguanta un aviso que nunca se ha llegado a ver.
 *
 *  Los avisos se apagan al abrir el pedido, pero si nunca se abre no se
 *  apagarían solos y la campana arrastraría un traspaso de hace ocho meses de
 *  un pedido que ya ni existe. Un mes cubre unas vacaciones largas o una baja
 *  corta —el caso para el que se diseñó esto—; pasado eso, el trabajo o se ha
 *  hecho o se ha vuelto a mover. */
export const VENTANA_AVISOS_DIAS = 30;

export function avisosPara(
  acciones: readonly AccionLog[],
  operarioId: string,
  vistos: ReadonlySet<number>,
): AvisoMovimiento[] {
  const out: AvisoMovimiento[] = [];
  for (const a of acciones) {
    if (vistos.has(a.id)) continue;
    const previoDe = new Map(a.previos.map((p) => [p.ofId, p]));
    for (const nuevo of a.cambiosOF) {
      const previo = previoDe.get(nuevo.ofId);
      if (!previo) continue; // OF que no existía en el overlay: nada que comparar

      const base = { logId: a.id, ts: a.ts, ofId: nuevo.ofId, quien: a.operarioId };

      // Autor. Solo de persona a persona: sacar una OF de la bandeja
      // (previo.autorId === null) ya se anuncia como "sin empezar", y avisar
      // otra vez sería el mismo hecho contado dos veces.
      if (previo.autorId !== nuevo.autorId && previo.autorId !== null) {
        if (nuevo.autorId === operarioId && a.operarioId !== operarioId)
          out.push({ ...base, tipo: "recibida", otro: previo.autorId });
        if (previo.autorId === operarioId && a.operarioId !== operarioId)
          out.push({ ...base, tipo: "cedida", otro: nuevo.autorId });
      }

      // Revisor. Aquí sí cuenta pasar de "sin revisor" a tenerlo: nombrar
      // revisor es siempre encargarle algo a alguien.
      if (previo.revisorId !== nuevo.revisorId) {
        if (nuevo.revisorId === operarioId && a.operarioId !== operarioId)
          out.push({ ...base, tipo: "revisarNueva", otro: previo.revisorId });
        if (previo.revisorId === operarioId && a.operarioId !== operarioId)
          out.push({ ...base, tipo: "revisarQuitada", otro: nuevo.revisorId });
      }
    }
  }
  return out;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/__tests__/avisos.test.ts`
Expected: PASS — 7 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/avisos.ts src/lib/__tests__/avisos.test.ts
git commit -m "feat(avisos): derivar del registro quién ha movido trabajo y a quién"
```

---

### Task 5: Guardar qué avisos ha visto cada uno

**Files:**
- Modify: `src/lib/server/estado-db.ts` (esquema + dos funciones)
- Test: `src/lib/__tests__/estado-db.test.ts`

**Interfaces:**
- Produces: `marcarAvisosVistos(operarioId: string, logIds: number[]): void`, `leerAvisosVistos(operarioId: string): Set<number>`.

- [ ] **Step 1: Write the failing test**

Añade a `src/lib/__tests__/estado-db.test.ts`:

```ts
test("lo visto se guarda por operario, no globalmente", () => {
  expect(db.leerAvisosVistos("tamara").size).toBe(0);
  db.marcarAvisosVistos("tamara", [7, 8]);
  db.marcarAvisosVistos("tamara", [8]); // repetir no duplica ni revienta

  expect([...db.leerAvisosVistos("tamara")].sort()).toEqual([7, 8]);
  // Que Tamara lo haya visto no lo apaga para Jaime: el mismo movimiento le
  // llega a los dos y cada uno lo ve cuando abre el pedido.
  expect(db.leerAvisosVistos("jaime").size).toBe(0);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/__tests__/estado-db.test.ts`
Expected: FAIL — `db.leerAvisosVistos is not a function`.

- [ ] **Step 3: Write minimal implementation**

En `src/lib/server/estado-db.ts`, dentro del `db.exec(\`...\`)` del esquema, añade la tabla:

```sql
    CREATE TABLE IF NOT EXISTS aviso_visto (
      operario_id TEXT NOT NULL,
      log_id      INTEGER NOT NULL,
      visto_at    TEXT NOT NULL,
      PRIMARY KEY (operario_id, log_id)
    );
```

Y al final del fichero:

```ts
/** Marca avisos como vistos por un operario.
 *
 *  La clave es la pareja (operario, movimiento) y no una marca de "último
 *  visto": los avisos se apagan de uno en uno, al abrir el pedido al que
 *  pertenecen, y un mismo movimiento le llega a dos personas que lo verán en
 *  momentos distintos. */
export function marcarAvisosVistos(operarioId: string, logIds: number[]): void {
  if (logIds.length === 0) return;
  const db = abrir();
  const ins = db.prepare(
    "INSERT OR IGNORE INTO aviso_visto (operario_id, log_id, visto_at) VALUES (?, ?, ?)",
  );
  const ahora = new Date().toISOString();
  db.transaction(() => {
    for (const id of logIds) ins.run(operarioId, id, ahora);
  })();
}

export function leerAvisosVistos(operarioId: string): Set<number> {
  const filas = abrir()
    .prepare("SELECT log_id FROM aviso_visto WHERE operario_id = ?")
    .all(operarioId) as Array<{ log_id: number }>;
  return new Set(filas.map((f) => f.log_id));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/__tests__/estado-db.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/server/estado-db.ts src/lib/__tests__/estado-db.test.ts
git commit -m "feat(avisos): recordar qué avisos ha visto ya cada operario"
```

---

### Task 6: Endpoint de avisos

**Files:**
- Create: `src/app/api/avisos/route.ts`
- Test: `src/lib/__tests__/api-avisos.test.ts`

**Interfaces:**
- Consumes: `leerAccionesDesde`, `leerAvisosVistos`, `marcarAvisosVistos` (estado-db); `avisosPara`, `VENTANA_AVISOS_DIAS` (lib/avisos).
- Produces: `GET /api/avisos?operarioId=X` → `{ avisos: AvisoMovimiento[] }`; `POST /api/avisos` con `{ operarioId, logIds: number[] }` → `{ ok: true }`.

- [ ] **Step 1: Write the failing test**

Crea `src/lib/__tests__/api-avisos.test.ts`:

```ts
import { afterAll, beforeAll, expect, test } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type { AvisoMovimiento } from "../avisos";

let dir: string;
let route: typeof import("../../app/api/avisos/route");
let estadoDb: typeof import("../server/estado-db");

beforeAll(async () => {
  dir = mkdtempSync(path.join(tmpdir(), "coordina-avisos-"));
  process.env.COORDINA_DB_PATH = path.join(dir, "test.db");
  route = await import("../../app/api/avisos/route");
  estadoDb = await import("../server/estado-db");
});

afterAll(() => {
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {
    // Windows mantiene abierto el handle del WAL; limpieza best effort.
  }
});

const of = (ofId: string, autorId: string | null) => ({
  ofId,
  autorId,
  revisorId: null,
  estado: "en_curso" as const,
  observacion: null,
});

async function avisosDe(operarioId: string): Promise<AvisoMovimiento[]> {
  const res = await route.GET(new Request(`http://x/api/avisos?operarioId=${operarioId}`));
  const data = (await res.json()) as { avisos: AvisoMovimiento[] };
  return data.avisos;
}

test("GET devuelve los movimientos que le tocan y POST los apaga", async () => {
  estadoDb.guardarMutacion({ operarioId: "ivan", motivo: "asignar", cambiosOF: [of("of-a", "ivan")] });
  estadoDb.guardarMutacion({
    operarioId: "ivan",
    motivo: "traspaso",
    cambiosOF: [of("of-a", "tamara")],
  });

  const avisos = await avisosDe("tamara");
  expect(avisos).toHaveLength(1);
  expect(avisos[0]).toMatchObject({ tipo: "recibida", ofId: "of-a", quien: "ivan" });

  const ack = await route.POST(
    new Request("http://x/api/avisos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ operarioId: "tamara", logIds: [avisos[0].logId] }),
    }),
  );
  expect(ack.status).toBe(200);
  expect(await avisosDe("tamara")).toHaveLength(0);
});

test("GET sin operarioId responde 400", async () => {
  const res = await route.GET(new Request("http://x/api/avisos"));
  expect(res.status).toBe(400);
});

test("POST con logIds que no son números responde 400", async () => {
  const res = await route.POST(
    new Request("http://x/api/avisos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ operarioId: "tamara", logIds: ["7"] }),
    }),
  );
  expect(res.status).toBe(400);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/__tests__/api-avisos.test.ts`
Expected: FAIL — no resuelve `../../app/api/avisos/route`.

- [ ] **Step 3: Write minimal implementation**

Crea `src/app/api/avisos/route.ts`:

```ts
import { NextResponse } from "next/server";
import {
  leerAccionesDesde,
  leerAvisosVistos,
  marcarAvisosVistos,
} from "@/lib/server/estado-db";
import { avisosPara, VENTANA_AVISOS_DIAS } from "@/lib/avisos";

// ─── /api/avisos ─────────────────────────────────────────────────────────────
// Los avisos de "te han movido el trabajo". Se derivan del registro de
// acciones, no del estado de la OF: un cambio de manos no deja marca en ella.
// Devuelve ids crudos (operario, OF); el texto lo compone el cliente, que ya
// tiene los nombres y los pedidos en memoria — así el servidor no tiene que
// cargar el tablero, que contra RPS tarda 7-15 s.

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const operarioId = new URL(req.url).searchParams.get("operarioId");
  if (!operarioId)
    return NextResponse.json({ error: "Falta operarioId" }, { status: 400 });

  const desde = new Date(Date.now() - VENTANA_AVISOS_DIAS * 86_400_000).toISOString();
  const avisos = avisosPara(
    leerAccionesDesde(desde),
    operarioId,
    leerAvisosVistos(operarioId),
  );
  return NextResponse.json({ avisos }, { headers: { "Cache-Control": "no-store" } });
}

interface Body {
  operarioId?: unknown;
  logIds?: unknown;
}

export async function POST(req: Request) {
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }
  // Un body JSON que no sea objeto (p.ej. el literal `null`) parsea sin error:
  // sin esta guarda, leer body.operarioId reventaría con un 500 en vez de 400.
  if (typeof body !== "object" || body === null)
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });

  const operarioId = body.operarioId;
  if (typeof operarioId !== "string" || operarioId.length === 0)
    return NextResponse.json({ error: "Falta operarioId" }, { status: 400 });

  const logIds = body.logIds;
  if (!Array.isArray(logIds) || !logIds.every((x) => Number.isInteger(x)))
    return NextResponse.json({ error: "logIds inválido" }, { status: 400 });

  marcarAvisosVistos(operarioId, logIds as number[]);
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/__tests__/api-avisos.test.ts`
Expected: PASS — 3 tests.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/avisos/route.ts src/lib/__tests__/api-avisos.test.ts
git commit -m "feat(avisos): endpoint para leer y apagar los avisos de traspaso"
```

---

### Task 7: `/api/estado` corta el fichaje de las OF traspasadas

**Files:**
- Modify: `src/app/api/estado/route.ts`
- Test: `src/lib/__tests__/api-estado.test.ts` (crear si no existe)

**Interfaces:**
- Consumes: `cortarFichajeDeOF` (Task 2).
- Produces: el body de `POST /api/estado` admite `cortarFichajeDe?: string[]` (ids de OF). El Board lo usa en Tasks 8 y 9.

- [ ] **Step 1: Write the failing test**

Crea `src/lib/__tests__/api-estado.test.ts`:

```ts
import { afterAll, beforeAll, expect, test } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

let dir: string;
let route: typeof import("../../app/api/estado/route");
let fichajeDb: typeof import("../server/fichaje-db");
let fichaje: typeof import("../fichaje");

beforeAll(async () => {
  dir = mkdtempSync(path.join(tmpdir(), "coordina-api-estado-"));
  process.env.COORDINA_DB_PATH = path.join(dir, "test.db");
  route = await import("../../app/api/estado/route");
  fichajeDb = await import("../server/fichaje-db");
  fichaje = await import("../fichaje");
});

afterAll(() => {
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {
    // Windows mantiene abierto el handle del WAL; limpieza best effort.
  }
});

test("traspasar una OF corta el fichaje que otro tenía sobre ella", async () => {
  const f = fichaje.fichar(
    fichaje.FICHAJE_VACIO,
    ["of-x"],
    "plantear",
    "tamara",
    "2026-08-05T08:00:00.000Z",
  );
  fichajeDb.guardarFichaje("tamara", f);

  const res = await route.POST(
    new Request("http://x/api/estado", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        operarioId: "ivan",
        motivo: "traspaso",
        cambiosOF: [
          { ofId: "of-x", autorId: "ivan", revisorId: null, estado: "en_curso", observacion: null },
        ],
        cortarFichajeDe: ["of-x"],
      }),
    }),
  );
  expect(res.status).toBe(200);

  // Tamara ya no ficha algo que no es suyo, y su tiempo queda guardado.
  const suyo = fichajeDb.leerFichaje("tamara");
  expect(suyo.intervalos.every((i) => i.fin !== null)).toBe(true);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/__tests__/api-estado.test.ts`
Expected: FAIL — el intervalo sigue abierto (`fin` es `null`).

- [ ] **Step 3: Write minimal implementation**

En `src/app/api/estado/route.ts`:

Añade el import:

```ts
import { cortarFichajeDeOF } from "@/lib/server/fichaje-db";
```

Añade el campo a `interface Body`:

```ts
  /** OFs que dejan de ser de quien las tenía: hay que cerrar el fichaje que
   *  alguien tuviera abierto sobre ellas. */
  cortarFichajeDe?: string[];
```

Y justo después de `guardarMutacion({...})`:

```ts
  // Soltar una OF cierra el fichaje de quien la tenía. NO lo puede hacer su
  // navegador: puede estar en otro equipo o con la app cerrada, así que lo
  // hace el servidor con su reloj, que es la hora oficial de todo el fichaje.
  const cortar = Array.isArray(body.cortarFichajeDe)
    ? body.cortarFichajeDe.filter((x): x is string => typeof x === "string" && x.length > 0)
    : [];
  if (cortar.length > 0) {
    const ahora = new Date().toISOString();
    for (const ofId of cortar) cortarFichajeDeOF(ofId, ahora);
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/__tests__/api-estado.test.ts && npx vitest run`
Expected: PASS, y el resto de la suite sigue en verde.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/estado/route.ts src/lib/__tests__/api-estado.test.ts
git commit -m "feat(estado): traspasar una OF cierra el fichaje que otro tuviera sobre ella"
```

---

### Task 8: Traspasar el autor desde el parte

**Files:**
- Modify: `src/components/Drawer.tsx` (`OFRow`, y sus props desde `Drawer`)
- Modify: `src/components/Board.tsx` (nuevo callback, pasado al `Drawer`)

**Interfaces:**
- Consumes: `puedeTraspasarAutor`, `traspasarAutor` (Task 1); `cortarFichajeDe` del body de `/api/estado` (Task 7).
- Produces: `onTraspasarAutor: (ofId: string, autorId: string) => void`, prop de `Drawer` y de `OFRow`.

- [ ] **Step 1: Añadir el callback en Board**

En `src/components/Board.tsx`, junto a `setRevisor`, añade:

```ts
  // Traspasar UNA OF a otro operario. `mut` no vale tal cual: hay que mandar
  // también `cortarFichajeDe` para que el servidor cierre el fichaje que el
  // anterior tuviera abierto sobre ella (no lo puede hacer este navegador).
  const traspasarAutorOF = useCallback(
    (ofId: string, autorId: string) => {
      const antes = pedidosRef.current
        .flatMap((p) => p.ofs)
        .find((o) => o.id === ofId);
      if (!antes || antes.autorId === autorId) return;
      const nueva = traspasarAutor(antes, autorId);
      mut(new Set([ofId]), () => nueva);
      persistir({
        motivo: "traspaso",
        cambiosOF: [snapshotDe(nueva)],
        cortarFichajeDe: [ofId],
      });
    },
    [mut, persistir],
  );
```

Añade `traspasarAutor` al import de `@/lib/traspaso` y `cortarFichajeDe?: string[];` al tipo del payload de `persistir`.

Pásalo al Drawer (junto a `onSetRevisor={setRevisor}`):

```tsx
        onTraspasarAutor={traspasarAutorOF}
```

- [ ] **Step 2: Añadir la prop en Drawer y OFRow**

En `src/components/Drawer.tsx`, añade a las props de `Drawer` y reenvíala a `OFRow`:

```ts
  onTraspasarAutor: (ofId: string, autorId: string) => void;
```

- [ ] **Step 3: Sustituir el chip de autor por un selector cuando se puede traspasar**

En `OFRow`, cambia el bloque de roles por:

```tsx
      {/* Roles. El autor se puede traspasar mientras quede trabajo suyo; el
          revisor sigue siendo de solo lectura aquí, se nombra al mandar a
          revisar (o se corrige desde la vista Revisión). */}
      <div className="mt-2.5 grid grid-cols-2 gap-2">
        <div className="flex items-center gap-2 rounded-lg bg-surface-2/70 px-2 py-1.5">
          {puedeTraspasarAutor(of) ? (
            <>
              <span className="text-[11px] text-text-muted">Autor</span>
              <Select
                value={of.autorId}
                onChange={(v) => v && onTraspasarAutor(of.id, v)}
                placeholder={null}
                alignRight
                className="ml-auto"
                options={opcionesOperario(operarios, miId)}
              />
            </>
          ) : (
            <Chip op={autor} label="Autor" />
          )}
        </div>
        <div className="flex items-center rounded-lg bg-surface-2/70 px-2 py-1.5">
          <Chip op={revisor} label="Revisor" />
        </div>
      </div>
```

`OFRow` necesita recibir `miId: string | null` para poder marcar "(tú)": añádelo a sus props y pásalo desde `Drawer`, que ya lo tiene. Importa `puedeTraspasarAutor` de `@/lib/traspaso` y `Select` ya está importado.

`placeholder={null}` es deliberado: desde aquí no se puede dejar una OF sin autor. Para eso está devolverla a la bandeja.

- [ ] **Step 4: Verificar a mano en simulación**

```bash
npx tsc --noEmit && npx eslint src && npx vitest run
```

Levanta el entorno de simulación y comprueba: abrir un pedido propio con una OF en curso → cambiar su autor a un compañero → la OF desaparece de tu zona y aparece en la de él, sola, con su tiempo; el resto del pedido sigue siendo tuyo.

- [ ] **Step 5: Commit**

```bash
git add src/components/Drawer.tsx src/components/Board.tsx
git commit -m "feat(traspaso): pasar una OF suelta a otro operario desde el parte"
```

---

### Task 9: Cambiar el revisor desde la vista Revisión

**Files:**
- Modify: `src/components/RevisionView.tsx`
- Modify: `src/components/Board.tsx` (callback de cambio de revisor con corte de fichaje)

**Interfaces:**
- Consumes: `puedeCambiarRevisor`, `cambiarRevisor` (Task 1).
- Produces: `onCambiarRevisor: (ofId: string, revisorId: string) => void` en `RevisionView`.

- [ ] **Step 1: Callback en Board**

En `src/components/Board.tsx`, junto a `traspasarAutorOF`:

```ts
  // Cambiar quién revisa. Si la revisión ya había empezado, la OF vuelve a
  // "por revisar" y hay que cerrar el fichaje de revisión del anterior: su
  // tiempo se queda guardado a su nombre, pero deja de correr.
  const cambiarRevisorOF = useCallback(
    (ofId: string, revisorId: string) => {
      const antes = pedidosRef.current.flatMap((p) => p.ofs).find((o) => o.id === ofId);
      if (!antes || antes.revisorId === revisorId) return;
      const nueva = cambiarRevisor(antes, revisorId);
      mut(new Set([ofId]), () => nueva);
      persistir({
        motivo: "revisor",
        cambiosOF: [snapshotDe(nueva)],
        cortarFichajeDe: antes.estado === "en_revision" ? [ofId] : undefined,
      });
    },
    [mut, persistir],
  );
```

Pásalo a `RevisionView` como `onCambiarRevisor={cambiarRevisorOF}`.

- [ ] **Step 2: En la tarjeta, el selector solo cambia un revisor ya nombrado**

En `RevisionView.tsx`, dentro de `ReviewCard`, sustituye el bloque `estado === "por_revisar"` por:

```tsx
        {estado === "por_revisar" && (
          <>
            {todasConRevisor ? (
              <div className="flex w-full items-center gap-1.5 text-[11px] text-text-muted">
                Revisor:
                <Select
                  value={revisorComun}
                  onChange={(v) => v && ofIds.forEach((id) => onCambiarRevisor(id, v))}
                  placeholder={null}
                  alignRight
                  className="ml-auto"
                  options={operarios
                    .filter((o) => !autores.has(o.id))
                    .map((o) => ({
                      value: o.id,
                      label: o.id === miId ? `${o.nombre} (tú)` : o.nombre,
                      icon: <OpDot color={o.color} iniciales={o.iniciales} />,
                    }))}
                />
              </div>
            ) : (
              // Sin revisor no se ofrece elegirlo: el revisor se nombra al
              // mandar a revisar. Una OF que llega así (de RPS) es una cola de
              // la que se coge trabajo — quien pulse se pone a sí mismo.
              <span className="text-[11px] text-text-muted">Sin coger</span>
            )}
            <button
              onClick={() => {
                if (!todasConRevisor && miId) ofIds.forEach((id) => onSetRevisor(id, miId));
                accionTodas("empezar_revision");
              }}
              title={
                todasConRevisor
                  ? "Pasa a En revisión y arranca el fichaje del revisor"
                  : "Te pone como revisor y arranca tu fichaje"
              }
              className="rounded-lg bg-violet-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-violet-700"
            >
              {todasConRevisor ? "Empezar revisión" : "Coger y empezar"}
            </button>
          </>
        )}
```

Añade `onCambiarRevisor` a las props de `RevisionView`, `ColumnaRevision` y `ReviewCard`, con la firma de la sección Interfaces. `ColumnaRevision` solo lo reenvía a cada `ReviewCard`.

Nota: `empezar_revision` exige revisor en la máquina de estados (`requiere: "revisor"`), así que la autoasignación tiene que ir **antes** de la acción, y ambas en el mismo manejador.

- [ ] **Step 3: También con la revisión ya empezada**

En el bloque `estado === "en_revision"` de `ReviewCard`, delante de los botones Aprobar/Devolver:

```tsx
            {/* Cambio de última hora con la revisión en marcha: al elegir a
                otro, `cambiarRevisor` devuelve la OF a "por revisar" y el
                servidor cierra el fichaje del anterior — sus minutos se
                quedan a su nombre, pero dejan de correr. */}
            {ofs.every(puedeCambiarRevisor) && (
              <div className="flex w-full items-center gap-1.5 text-[11px] text-text-muted">
                Revisor:
                <Select
                  value={revisorComun}
                  onChange={(v) => v && ofIds.forEach((id) => onCambiarRevisor(id, v))}
                  placeholder={null}
                  alignRight
                  className="ml-auto"
                  options={operarios
                    .filter((o) => !autores.has(o.id))
                    .map((o) => ({
                      value: o.id,
                      label: o.id === miId ? `${o.nombre} (tú)` : o.nombre,
                      icon: <OpDot color={o.color} iniciales={o.iniciales} />,
                    }))}
                />
              </div>
            )}
```

Importa `puedeCambiarRevisor` de `@/lib/traspaso`.

- [ ] **Step 4: Cambiar el texto del resumen**

En `RevisionView.tsx`, en la barra de "Para revisar", sustituye `{sinRevisor} sin revisor asignado` por `{sinRevisor} sin coger`.

- [ ] **Step 5: Verificar**

```bash
npx tsc --noEmit && npx eslint src && npx vitest run
```

En simulación: una OF en "Por revisar" con revisor → cambiar el nombre → le llega al nuevo. Una sin revisor → "Coger y empezar" te la asigna y arranca tu fichaje.

- [ ] **Step 6: Commit**

```bash
git add src/components/RevisionView.tsx src/components/Board.tsx
git commit -m "feat(revision): cambiar un revisor ya nombrado, y coger las OF sin revisor"
```

---

### Task 10: Pasar a Producción mira el pedido entero

**Files:**
- Modify: `src/lib/fases-tablero.ts`
- Modify: `src/components/PedidoLinea.tsx`
- Test: `src/lib/__tests__/fases-tablero.test.ts` (añadir; crear si no existe)

**Interfaces:**
- Produces: `pedidoListoParaPasar(p: { ofs: OF[] }): boolean`, `autoresQueFaltan(p: { ofs: OF[] }): Array<{ autorId: string | null; n: number }>`.

- [ ] **Step 1: Write the failing test**

Añade a `src/lib/__tests__/fases-tablero.test.ts`:

```ts
import { autoresQueFaltan, pedidoListoParaPasar } from "../fases-tablero";

const ofDe = (id: string, estado: OF["estado"], autorId: string | null): OF => ({
  id,
  codigo: id,
  descripcion: "x",
  familia: "TOLDO",
  piezas: 1,
  autorId,
  revisorId: null,
  estado,
  fichandoRol: null,
  tiempoEstimadoMin: 0,
  tiempoPlanteoMin: 0,
  tiempoRevisionMin: 0,
});

test("un pedido repartido no se pasa hasta que TODOS acaban", () => {
  const p = {
    ofs: [
      ofDe("a", "aprobada", "ivan"),
      ofDe("b", "aprobada", "ivan"),
      ofDe("c", "en_curso", "tamara"),
    ],
  };
  // Mis dos OF están listas, pero Producción recibe el pedido entero: si esto
  // devolviera true, pasaría a Producción la OF que Tamara tiene a medias.
  expect(pedidoListoParaPasar(p)).toBe(false);
  expect(autoresQueFaltan(p)).toEqual([{ autorId: "tamara", n: 1 }]);
});

test("con todas aprobadas se puede pasar, y no falta nadie", () => {
  const p = { ofs: [ofDe("a", "aprobada", "ivan"), ofDe("b", "aprobada", "tamara")] };
  expect(pedidoListoParaPasar(p)).toBe(true);
  expect(autoresQueFaltan(p)).toEqual([]);
});

test("las anuladas no cuentan: no son trabajo de OT", () => {
  const p = { ofs: [ofDe("a", "aprobada", "ivan"), ofDe("b", "anulada", "tamara")] };
  expect(pedidoListoParaPasar(p)).toBe(true);
});

test("un pedido sin OF activas no se puede pasar", () => {
  expect(pedidoListoParaPasar({ ofs: [ofDe("a", "anulada", "ivan")] })).toBe(false);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/__tests__/fases-tablero.test.ts`
Expected: FAIL — `autoresQueFaltan is not exported`.

- [ ] **Step 3: Write minimal implementation**

Añade a `src/lib/fases-tablero.ts`:

```ts
/** ¿Se puede mandar este pedido a Producción?
 *
 *  Mira el pedido ENTERO, no las OF de quien pregunta. El tablero reparte cada
 *  pedido por autor, así que quien acabe su parte vería su trozo "listo para
 *  pasar" y, si el botón mirase solo eso, mandaría a Producción la OF que otro
 *  tiene a medias. Producción recibe el pedido completo o no lo recibe. */
export function pedidoListoParaPasar(p: ConOFs): boolean {
  const activas = p.ofs.filter((o) => o.estado !== "anulada");
  return activas.length > 0 && activas.every((o) => o.estado === "aprobada");
}

/** Quién tiene todavía trabajo en este pedido, para poder decir a quién se
 *  espera en vez de un botón apagado sin explicación. */
export function autoresQueFaltan(p: ConOFs): Array<{ autorId: string | null; n: number }> {
  const cuenta = new Map<string | null, number>();
  for (const of of p.ofs) {
    if (of.estado === "anulada" || of.estado === "aprobada") continue;
    cuenta.set(of.autorId, (cuenta.get(of.autorId) ?? 0) + 1);
  }
  return [...cuenta].map(([autorId, n]) => ({ autorId, n }));
}
```

- [ ] **Step 4: Usarlo en la fila**

En `src/components/PedidoLinea.tsx`, sustituye el bloque del botón «Pasar»:

```tsx
        {fase === "listoParaPasar" &&
          (pedidoListoParaPasar(pedido) ? (
            <button
              onClick={() => completarPedido(pedido.id)}
              title="Pasar el pedido a Producción"
              className="rounded bg-cyan-600 px-1.5 py-0.5 text-[10px] font-bold text-white hover:bg-cyan-700"
            >
              Pasar
            </button>
          ) : (
            // Lo tuyo está hecho pero el pedido va entero a Producción: se
            // dice a quién se espera, que si no el botón desaparece sin más.
            <span
              className="whitespace-nowrap text-[10px] text-text-muted"
              title="El pedido se pasa a Producción cuando están aprobadas todas sus OF"
            >
              falta {faltanTexto}
            </span>
          ))}
```

Y arriba, en el cuerpo del componente:

```tsx
  // `pedido` son TODAS las OF del pedido, no solo las de este facet: por eso
  // se puede saber desde aquí si falta gente sin pedir nada más.
  const faltan = autoresQueFaltan(pedido);
  const faltanTexto = faltan
    .map((f) => {
      const nombre = operarios?.find((o) => o.id === f.autorId)?.nombre ?? "sin asignar";
      return `${nombre} (${f.n} OF)`;
    })
    .join(", ");
```

Importa `pedidoListoParaPasar` y `autoresQueFaltan` de `@/lib/fases-tablero`.

- [ ] **Step 5: Verificar y commit**

```bash
npx vitest run && npx tsc --noEmit && npx eslint src
git add src/lib/fases-tablero.ts src/lib/__tests__/fases-tablero.test.ts src/components/PedidoLinea.tsx
git commit -m "fix(tablero): un pedido repartido no se pasa a Producción hasta que acaban todos"
```

---

### Task 11: Los avisos nuevos en la campana

**Files:**
- Modify: `src/components/Notificaciones.tsx`
- Modify: `src/components/Board.tsx`

**Interfaces:**
- Consumes: `GET/POST /api/avisos` (Task 6), `AvisoMovimiento` (Task 4), `pedidoListoParaPasar` (Task 10).
- Produces: `NotifItem` admite los tipos `recibida`, `cedida`, `revisarNueva`, `revisarQuitada` y `pedidoCompleto`, con campos opcionales `quien`, `otro` y `logId`.

- [ ] **Step 1: Ampliar el tipo del aviso**

En `src/components/Notificaciones.tsx`:

```ts
export type NotifTipo =
  | "revisar"
  | "devuelta"
  | "sinEmpezar"
  | "recibida"
  | "cedida"
  | "revisarNueva"
  | "revisarQuitada"
  | "pedidoCompleto";

export interface NotifItem {
  tipo: NotifTipo;
  pedido: Pedido;
  /** Los avisos de pedido completo no son de una OF concreta. */
  of: OF | null;
  /** Quién movió el trabajo, ya resuelto a nombre. Solo en los de movimiento. */
  quien?: string;
  /** La otra parte (de quién venía / a quién ha ido), ya resuelta a nombre. */
  otro?: string;
  /** Fila de `acciones_log`: es lo que se marca como visto al abrir. */
  logId?: number;
}

const META: Record<NotifTipo, { label: string; vista: Vista; dot: string }> = {
  revisar: { label: "Me toca revisar", vista: "revision", dot: "bg-violet-600" },
  devuelta: { label: "Devuelta, a corregir", vista: "asignar", dot: "bg-red-600" },
  sinEmpezar: { label: "Sin empezar", vista: "asignar", dot: "bg-gray-400" },
  recibida: { label: "Te han pasado trabajo", vista: "asignar", dot: "bg-emerald-600" },
  cedida: { label: "Ya no lo tienes tú", vista: "asignar", dot: "bg-gray-400" },
  revisarNueva: { label: "Te toca revisar", vista: "revision", dot: "bg-violet-600" },
  revisarQuitada: { label: "Ya no lo revisas tú", vista: "revision", dot: "bg-gray-400" },
  pedidoCompleto: { label: "Listo para pasar", vista: "asignar", dot: "bg-cyan-600" },
};
```

En el `<li>`, sustituye las dos últimas líneas del contenido por una que aguante `of: null` y muestre quién:

```tsx
                        <span className="block truncate text-[11px] text-text-muted">
                          {item.of ? `${item.of.codigo} — ${item.of.descripcion}` : "Todas sus OF aprobadas"}
                        </span>
                        {item.quien && (
                          <span className="block truncate text-[11px] text-text-muted">
                            {item.quien}
                            {item.otro ? ` · antes ${item.otro}` : ""}
                          </span>
                        )}
```

Y la `key` del `<li>` pasa a `key={item.logId ?? `${item.of?.id}-${item.tipo}-${i}`}`.

- [ ] **Step 2: Traer los avisos en Board**

En `src/components/Board.tsx`, junto al resto de estado:

```ts
  // Avisos de movimiento: no se pueden deducir del tablero (una OF traspasada
  // no guarda de quién venía), así que se piden aparte. Mismo ritmo que el
  // polling del tablero, que es donde se notaría el cambio.
  const [avisosMov, setAvisosMov] = useState<AvisoMovimiento[]>([]);
  useEffect(() => {
    if (!miId) return;
    let vivo = true;
    const cargar = () => {
      fetch(`/api/avisos?operarioId=${encodeURIComponent(miId)}`, { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : null))
        .then((d: { avisos: AvisoMovimiento[] } | null) => {
          if (vivo && d) setAvisosMov(d.avisos);
        })
        .catch(() => {});
    };
    cargar();
    const id = setInterval(cargar, 30_000);
    return () => {
      vivo = false;
      clearInterval(id);
    };
  }, [miId]);
```

En el `useMemo` de `notifItems`, después del bucle actual:

```ts
    // Pedidos míos ya completos: aviso a todos los implicados, porque un
    // pedido repartido puede quedarse listo y parado si cada uno da por hecho
    // que lo pasa el otro.
    for (const p of procesadosAll) {
      if (p.situacion !== "procesado") continue;
      if (!p.ofs.some((o) => o.autorId === miId)) continue;
      if (pedidoListoParaPasar(p)) out.push({ pedido: p, of: null, tipo: "pedidoCompleto" });
    }

    // Movimientos leídos del registro. Los ids se resuelven aquí: el servidor
    // manda ids crudos para no tener que cargar el tablero.
    const nombre = (id: string | null) => operarios.find((o) => o.id === id)?.nombre;
    for (const a of avisosMov) {
      const pedido = procesadosAll.find((p) => p.ofs.some((o) => o.id === a.ofId));
      const of = pedido?.ofs.find((o) => o.id === a.ofId);
      if (!pedido || !of) continue; // OF que ya no está en el tablero
      out.push({
        pedido,
        of,
        tipo: a.tipo,
        quien: nombre(a.quien),
        otro: nombre(a.otro),
        logId: a.logId,
      });
    }
```

Añade `avisosMov` y `operarios` a las dependencias del `useMemo`, e importa `AvisoMovimiento` de `@/lib/avisos` y `pedidoListoParaPasar` de `@/lib/fases-tablero`.

Todos los `out.push` existentes necesitan que `of` sea el objeto OF (ya lo es); no hace falta tocarlos.

- [ ] **Step 3: Apagar el aviso al abrir el pedido**

En `irANotificacion` (el `onNavigate` de la campana), antes de navegar:

```ts
    // Abrir el pedido ES haber visto el aviso: se apaga solo, sin un botón
    // más que pulsar.
    const logIds = notifItems
      .filter((i) => i.pedido.id === pedidoId && i.logId !== undefined)
      .map((i) => i.logId as number);
    if (logIds.length > 0 && miId) {
      setAvisosMov((prev) => prev.filter((a) => !logIds.includes(a.logId)));
      fetch("/api/avisos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ operarioId: miId, logIds }),
      }).catch(() => {});
    }
```

- [ ] **Step 4: Verificar**

```bash
npx vitest run && npx tsc --noEmit && npx eslint src && npx next build
```

En simulación, con dos identidades: pasar una OF de Iván a Tamara → la campana de Tamara dice "Te han pasado trabajo · Iván"; al abrir el pedido, el aviso desaparece y no vuelve al recargar.

- [ ] **Step 5: Commit**

```bash
git add src/components/Notificaciones.tsx src/components/Board.tsx
git commit -m "feat(avisos): la campana avisa de los traspasos y de los pedidos ya completos"
```

---

## Verificación final

- [ ] `npx vitest run && npx tsc --noEmit && npx eslint src && npx next build`
- [ ] Recorrido completo en simulación, con dos identidades:
  1. Iván ficha una OF de un pedido de 3 → la traspasa a Tamara desde el parte.
  2. El fichaje de Iván sobre esa OF queda cerrado; su tiempo sigue contando para él.
  3. Tamara ve ese pedido con esa OF sola, en curso, con el tiempo de Iván.
  4. La campana de Tamara: "Te han pasado trabajo · Iván". Al abrir, se apaga.
  5. Iván acaba sus 2 OF y las aprueba: su fila dice `falta Tamara (1 OF)`, sin botón.
  6. Tamara aprueba la suya → los dos reciben "Listo para pasar" y a los dos les sale el botón.
  7. Cualquiera lo pulsa; en el Historial consta quién lo pasó.
