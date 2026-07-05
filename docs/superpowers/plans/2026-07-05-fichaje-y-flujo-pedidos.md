# Fichaje por intervalos y flujo de pedidos — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Motor de fichaje por intervalos con timestamps, máquina de estados de OF única (textos/confirmaciones centralizados) y panel «Mi fichaje», sustituyendo el fichaje simulado del mock.

**Architecture:** Dos módulos puros en `src/lib` (`fichaje.ts`, `acciones.ts`) con tests Vitest; `Board.tsx` orquesta (estado + localStorage) y las superficies de UI (Drawer, PedidoChip, panel nuevo `MiFichaje`) pintan botones generados desde la máquina. Spec: `docs/superpowers/specs/2026-07-05-fichaje-y-flujo-pedidos-design.md`.

**Tech Stack:** Next.js 16 (¡breaking changes! docs en `node_modules/next/dist/docs/`), React 19, TypeScript strict, Tailwind 4, Vitest (nuevo), pnpm.

## Global Constraints

- UI en español; terminología del dominio: pedido, OF, plantear, revisar, fichar.
- Colores de estado/rol SOLO desde `ESTADO`/`ROL` (`src/lib/estado.ts`); esmeralda = plantear, violeta = revisar.
- Clases Tailwind como literales (nunca concatenación dinámica); tokens del tema (`text-text-muted`, `ring-border`, `var(--glass-*)`).
- Componentes: named exports, props inline, doc-comment en español (ver skill `new-component`).
- Nada de `window.confirm` — diálogo propio (Task 4).
- Los tiempos se guardan como intervalos ISO; los totales SIEMPRE derivados. Nunca guardar contadores de minutos.
- No tocar `pnpm-lock.yaml` a mano. Tras cada tarea: `npx tsc --noEmit` limpio (el hook PostToolUse ya lo corre).
- Commits frecuentes, mensajes en el estilo del repo (`feat:`, `fix:`, `docs:`).

---

### Task 1: Vitest + motor de fichaje (núcleo: fichar/pausar/abierto)

**Files:**
- Create: `src/lib/fichaje.ts`
- Create: `src/lib/__tests__/fichaje.test.ts`
- Modify: `package.json` (script `test`)

**Interfaces (Produces):**
```ts
export interface Intervalo {
  inicio: string;            // ISO
  fin: string | null;        // null = corriendo
  ofIds: string[];           // reparto igual entre estas OFs
  rol: Rol;
  operarioId: string;
}
export interface Fichaje { intervalos: Intervalo[] }
export const FICHAJE_VACIO: Fichaje;
export function abierto(f: Fichaje): Intervalo | null;
export function fichar(f: Fichaje, ofIds: string[], rol: Rol, operarioId: string, ahora: string): Fichaje;
export function pausar(f: Fichaje, ahora: string): Fichaje;
```

- [ ] **Step 1: Instalar Vitest y añadir script**

```bash
pnpm add -D vitest
```

En `package.json`, scripts: añadir `"test": "vitest run"` tras `"db:introspect"`.

- [ ] **Step 2: Escribir tests que fallan**

`src/lib/__tests__/fichaje.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { FICHAJE_VACIO, abierto, fichar, pausar } from "../fichaje";

const T0 = "2026-07-06T08:00:00.000Z";
const T1 = "2026-07-06T08:30:00.000Z";

describe("fichar", () => {
  it("abre un intervalo con las OFs dadas", () => {
    const f = fichar(FICHAJE_VACIO, ["of1", "of2"], "plantear", "op1", T0);
    expect(abierto(f)).toMatchObject({ inicio: T0, fin: null, ofIds: ["of1", "of2"], rol: "plantear" });
  });
  it("cambiar el conjunto cierra el intervalo y abre otro (historia intacta)", () => {
    let f = fichar(FICHAJE_VACIO, ["of1"], "plantear", "op1", T0);
    f = fichar(f, ["of1", "of2"], "plantear", "op1", T1);
    expect(f.intervalos).toHaveLength(2);
    expect(f.intervalos[0]).toMatchObject({ inicio: T0, fin: T1, ofIds: ["of1"] });
    expect(abierto(f)).toMatchObject({ inicio: T1, ofIds: ["of1", "of2"] });
  });
  it("deduplica ofIds y con lista vacía solo pausa", () => {
    let f = fichar(FICHAJE_VACIO, ["of1", "of1"], "plantear", "op1", T0);
    expect(abierto(f)!.ofIds).toEqual(["of1"]);
    f = fichar(f, [], "plantear", "op1", T1);
    expect(abierto(f)).toBeNull();
    expect(f.intervalos[0].fin).toBe(T1);
  });
  it("mismo conjunto y rol: no toca nada (idempotente)", () => {
    const f = fichar(FICHAJE_VACIO, ["of1"], "plantear", "op1", T0);
    expect(fichar(f, ["of1"], "plantear", "op1", T1)).toBe(f);
  });
});

describe("pausar", () => {
  it("cierra el intervalo abierto", () => {
    const f = pausar(fichar(FICHAJE_VACIO, ["of1"], "plantear", "op1", T0), T1);
    expect(abierto(f)).toBeNull();
    expect(f.intervalos[0].fin).toBe(T1);
  });
  it("sin intervalo abierto es no-op", () => {
    expect(pausar(FICHAJE_VACIO, T1)).toBe(FICHAJE_VACIO);
  });
});
```

- [ ] **Step 3: Verificar que fallan** — `pnpm test` → FAIL (`Cannot find module '../fichaje'`).

- [ ] **Step 4: Implementación mínima**

`src/lib/fichaje.ts`:

```ts
import type { Rol } from "./types";

// ─── Motor de fichaje por intervalos ─────────────────────────────────────────
// Funciones puras. Regla clave: cambiar el conjunto de OFs de un fichaje que
// corre = cerrar el intervalo y abrir otro; la historia nunca se recalcula.
// Los minutos por OF se DERIVAN de los intervalos (nunca se guardan sumados):
// Olanet funciona por tramos horarios, así conservamos la información completa.

export interface Intervalo {
  inicio: string; // ISO
  fin: string | null; // null = corriendo ahora
  ofIds: string[]; // OFs que comparten el tramo (reparto a partes iguales)
  rol: Rol;
  operarioId: string; // solo uso interno de la web (RPS no recibe nombres)
}

export interface Fichaje {
  intervalos: Intervalo[];
}

export const FICHAJE_VACIO: Fichaje = { intervalos: [] };

export function abierto(f: Fichaje): Intervalo | null {
  const ultimo = f.intervalos[f.intervalos.length - 1];
  return ultimo && ultimo.fin === null ? ultimo : null;
}

function cerrar(f: Fichaje, ahora: string): Fichaje {
  const ab = abierto(f);
  if (!ab) return f;
  return {
    intervalos: [...f.intervalos.slice(0, -1), { ...ab, fin: ahora }],
  };
}

/** Deja corriendo exactamente `ofIds` (deduplicadas). Lista vacía = pausar. */
export function fichar(
  f: Fichaje,
  ofIds: string[],
  rol: Rol,
  operarioId: string,
  ahora: string,
): Fichaje {
  const ids = [...new Set(ofIds)];
  const ab = abierto(f);
  if (ab && ab.rol === rol && ids.length === ab.ofIds.length && ids.every((id) => ab.ofIds.includes(id))) {
    return f; // idempotente
  }
  const cerrado = cerrar(f, ahora);
  if (ids.length === 0) return cerrado;
  return {
    intervalos: [...cerrado.intervalos, { inicio: ahora, fin: null, ofIds: ids, rol, operarioId }],
  };
}

export function pausar(f: Fichaje, ahora: string): Fichaje {
  return cerrar(f, ahora);
}
```

- [ ] **Step 5: Verificar que pasan** — `pnpm test` → 6 passed.
- [ ] **Step 6: Commit** — `git add src/lib/fichaje.ts src/lib/__tests__/fichaje.test.ts package.json && git commit -m "feat(fichaje): motor de intervalos (fichar/pausar) con Vitest"`

---

### Task 2: Minutos derivados y expansión pedido→OFs fichables

**Files:**
- Modify: `src/lib/fichaje.ts` (añadir `minutosOF`, `ofsFichables`)
- Modify: `src/lib/types.ts` (campo `detenida?: boolean` en `OF`)
- Modify: `src/lib/__tests__/fichaje.test.ts` (añadir tests)

**Interfaces (Produces):**
```ts
export function minutosOF(f: Fichaje, ofId: string, opts?: { rol?: Rol; ahora?: string }): number;
export function ofsFichables(p: Pedido): OF[]; // excluye detenida, anulada, aprobada
```

- [ ] **Step 1: Tests que fallan** (añadir al mismo fichero de tests)

```ts
import { minutosOF, ofsFichables } from "../fichaje";
import type { OF, Pedido } from "../types";

const T2 = "2026-07-06T09:00:00.000Z";

describe("minutosOF", () => {
  it("reparte cada tramo entre sus OFs", () => {
    let f = fichar(FICHAJE_VACIO, ["of1", "of2"], "plantear", "op1", T0); // 30 min entre 2
    f = fichar(f, ["of1"], "plantear", "op1", T1); // 30 min solo of1
    f = pausar(f, T2);
    expect(minutosOF(f, "of1")).toBeCloseTo(45);
    expect(minutosOF(f, "of2")).toBeCloseTo(15);
  });
  it("intervalo abierto cuenta hasta `ahora`; filtra por rol", () => {
    const f = fichar(FICHAJE_VACIO, ["of1"], "revisar", "op1", T0);
    expect(minutosOF(f, "of1", { ahora: T1 })).toBeCloseTo(30);
    expect(minutosOF(f, "of1", { ahora: T1, rol: "plantear" })).toBe(0);
  });
});

describe("ofsFichables", () => {
  const base: Omit<OF, "id" | "estado"> = {
    codigo: "OF-01", descripcion: "x", familia: "TOLDO", piezas: 1,
    autorId: "op1", revisorId: null, fichandoRol: null,
    tiempoEstimadoMin: 0, tiempoPlanteoMin: 0, tiempoRevisionMin: 0,
  };
  it("excluye detenidas, anuladas y aprobadas", () => {
    const p = {
      ofs: [
        { ...base, id: "a", estado: "pendiente" },
        { ...base, id: "b", estado: "anulada" },
        { ...base, id: "c", estado: "aprobada" },
        { ...base, id: "d", estado: "en_curso", detenida: true },
      ],
    } as unknown as Pedido;
    expect(ofsFichables(p).map((o) => o.id)).toEqual(["a"]);
  });
});
```

- [ ] **Step 2: Verificar FAIL** — `pnpm test`.
- [ ] **Step 3: Implementar**

En `src/lib/types.ts`, dentro de `interface OF`, tras `fichandoRol`:

```ts
  /** Detenida por Producción: se omite SIEMPRE del fichaje (dato de RPS). */
  detenida?: boolean;
```

En `src/lib/fichaje.ts`:

```ts
import type { OF, Pedido, Rol } from "./types";

/** Minutos atribuidos a una OF: Σ (fin−inicio)/nºOFs de sus tramos. */
export function minutosOF(
  f: Fichaje,
  ofId: string,
  opts: { rol?: Rol; ahora?: string } = {},
): number {
  let total = 0;
  for (const iv of f.intervalos) {
    if (!iv.ofIds.includes(ofId)) continue;
    if (opts.rol && iv.rol !== opts.rol) continue;
    const fin = iv.fin ?? opts.ahora;
    if (!fin) continue; // abierto y sin `ahora`: no se cuenta
    total += (Date.parse(fin) - Date.parse(iv.inicio)) / 60000 / iv.ofIds.length;
  }
  return total;
}

/** OFs de un pedido en las que se puede fichar. */
export function ofsFichables(p: Pedido): OF[] {
  return p.ofs.filter(
    (of) => !of.detenida && of.estado !== "anulada" && of.estado !== "aprobada",
  );
}
```

- [ ] **Step 4: Verificar PASS** — `pnpm test` → 9 passed. `npx tsc --noEmit` limpio.
- [ ] **Step 5: Commit** — `git commit -m "feat(fichaje): minutos derivados por OF y expansión pedido→OFs fichables"`

---

### Task 3: Máquina de estados `src/lib/acciones.ts`

**Files:**
- Create: `src/lib/acciones.ts`
- Create: `src/lib/__tests__/acciones.test.ts`

**Interfaces (Produces):**
```ts
export type AccionOF =
  | "empezar_planteo" | "terminar_planteo" | "deshacer_empezar"
  | "empezar_revision" | "aprobar" | "devolver" | "reabrir"
  | "retomar" | "anular" | "restaurar";
export interface AccionDef {
  id: AccionOF; label: string; tono: "primaria" | "peligro" | "neutra";
  confirmar?: string; desde: EstadoOF[]; requiere?: "autor" | "revisor";
  efectoFichaje?: "corta" | "arranca"; conNota?: boolean;
}
export const ACCIONES: AccionDef[];
export function accionesDisponibles(of: OF): AccionDef[];
export function aplicarAccion(of: OF, accion: AccionOF, obs?: string): OF; // NO toca fichandoRol
```

Nota de diseño: `aplicarAccion` solo cambia `estado`/`observacion`. El efecto sobre el
fichaje (`corta`/`arranca`) lo ejecuta el Board (Task 5) leyendo `efectoFichaje` de la def.

- [ ] **Step 1: Tests que fallan** — `src/lib/__tests__/acciones.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { ACCIONES, accionesDisponibles, aplicarAccion } from "../acciones";
import type { OF } from "../types";

const of = (estado: OF["estado"], extra: Partial<OF> = {}): OF => ({
  id: "of1", codigo: "OF-01", descripcion: "x", familia: "TOLDO", piezas: 1,
  autorId: "op1", revisorId: "op2", estado, fichandoRol: null,
  tiempoEstimadoMin: 0, tiempoPlanteoMin: 0, tiempoRevisionMin: 0, ...extra,
});

describe("accionesDisponibles", () => {
  it("pendiente con autor: empezar planteo y anular", () => {
    expect(accionesDisponibles(of("pendiente")).map((a) => a.id))
      .toEqual(["empezar_planteo", "anular"]);
  });
  it("pendiente sin autor: solo anular (empezar requiere autor)", () => {
    expect(accionesDisponibles(of("pendiente", { autorId: null })).map((a) => a.id))
      .toEqual(["anular"]);
  });
  it("por_revisar sin revisor no ofrece empezar revisión", () => {
    expect(accionesDisponibles(of("por_revisar", { revisorId: null })).map((a) => a.id))
      .toEqual(["anular"]);
  });
  it("anulada ofrece restaurar; aprobada ofrece reabrir", () => {
    expect(accionesDisponibles(of("anulada")).map((a) => a.id)).toEqual(["restaurar"]);
    expect(accionesDisponibles(of("aprobada")).map((a) => a.id)).toEqual(["reabrir"]);
  });
});

describe("aplicarAccion", () => {
  it("transiciones básicas", () => {
    expect(aplicarAccion(of("pendiente"), "empezar_planteo").estado).toBe("en_curso");
    expect(aplicarAccion(of("en_curso"), "terminar_planteo").estado).toBe("por_revisar");
    expect(aplicarAccion(of("en_revision"), "aprobar").estado).toBe("aprobada");
    expect(aplicarAccion(of("devuelta"), "retomar").estado).toBe("en_curso");
    expect(aplicarAccion(of("anulada"), "restaurar").estado).toBe("pendiente");
  });
  it("devolver exige nota y la guarda", () => {
    const r = aplicarAccion(of("en_revision"), "devolver", "falta cota");
    expect(r.estado).toBe("devuelta");
    expect(r.observacion).toBe("falta cota");
    expect(() => aplicarAccion(of("en_revision"), "devolver", "  ")).toThrow();
  });
  it("acción no disponible desde ese estado lanza error", () => {
    expect(() => aplicarAccion(of("aprobada"), "anular")).toThrow();
  });
  it("aprobar y anular piden confirmación en su def", () => {
    const porId = Object.fromEntries(ACCIONES.map((a) => [a.id, a]));
    expect(porId.aprobar.confirmar).toBeTruthy();
    expect(porId.anular.confirmar).toBeTruthy();
  });
});
```

- [ ] **Step 2: Verificar FAIL** — `pnpm test`.
- [ ] **Step 3: Implementar** — `src/lib/acciones.ts`:

```ts
import type { EstadoOF, OF } from "./types";

// ─── Máquina de estados de OF: ÚNICA fuente de verdad ────────────────────────
// Tarjeta (PedidoChip), drawer y panel Mi fichaje pintan botones desde
// accionesDisponibles(); textos, confirmaciones y efecto sobre el fichaje
// viven aquí y solo aquí.

export type AccionOF =
  | "empezar_planteo" | "terminar_planteo" | "deshacer_empezar"
  | "empezar_revision" | "aprobar" | "devolver" | "reabrir"
  | "retomar" | "anular" | "restaurar";

export interface AccionDef {
  id: AccionOF;
  label: string;
  tono: "primaria" | "peligro" | "neutra";
  confirmar?: string; // si existe, la UI pide confirmación con este texto
  desde: EstadoOF[];
  requiere?: "autor" | "revisor"; // asignación necesaria para ofrecerla
  efectoFichaje?: "corta" | "arranca"; // lo ejecuta el Board sobre el motor
  conNota?: boolean; // requiere observación (devolver)
  destino: EstadoOF | ((of: OF) => EstadoOF);
}

export const ACCIONES: AccionDef[] = [
  { id: "empezar_planteo", label: "Empezar planteo", tono: "primaria",
    desde: ["pendiente"], requiere: "autor", efectoFichaje: "arranca", destino: "en_curso" },
  { id: "retomar", label: "Retomar planteo", tono: "primaria",
    desde: ["devuelta"], requiere: "autor", efectoFichaje: "arranca", destino: "en_curso" },
  { id: "terminar_planteo", label: "Pasar a revisión", tono: "primaria",
    desde: ["en_curso"], efectoFichaje: "corta", destino: "por_revisar" },
  { id: "deshacer_empezar", label: "Volver a pendiente", tono: "neutra",
    confirmar: "La OF volverá a pendiente. El tiempo ya fichado se conserva.",
    desde: ["en_curso"], efectoFichaje: "corta", destino: "pendiente" },
  { id: "empezar_revision", label: "Empezar revisión", tono: "primaria",
    desde: ["por_revisar"], requiere: "revisor", efectoFichaje: "arranca", destino: "en_revision" },
  { id: "aprobar", label: "Aprobar → Producción", tono: "primaria",
    confirmar: "La OF quedará aprobada y lista para Producción.",
    desde: ["en_revision"], efectoFichaje: "corta", destino: "aprobada" },
  { id: "devolver", label: "Devolver con nota", tono: "peligro",
    desde: ["en_revision"], efectoFichaje: "corta", conNota: true, destino: "devuelta" },
  { id: "reabrir", label: "Reabrir revisión", tono: "neutra",
    confirmar: "La OF volverá a revisión y dejará de estar lista para Producción.",
    desde: ["aprobada"], destino: "en_revision" },
  { id: "anular", label: "Anular OF", tono: "peligro",
    confirmar: "La OF quedará anulada (no se hace en Oficina Técnica). Se puede restaurar.",
    desde: ["pendiente", "en_curso", "por_revisar"], efectoFichaje: "corta", destino: "anulada" },
  { id: "restaurar", label: "Restaurar", tono: "neutra",
    confirmar: "La OF anulada volverá a pendiente.",
    desde: ["anulada"], destino: "pendiente" },
];

const cumpleRequisito = (a: AccionDef, of: OF): boolean =>
  a.requiere === "autor" ? of.autorId !== null
  : a.requiere === "revisor" ? of.revisorId !== null
  : true;

export function accionesDisponibles(of: OF): AccionDef[] {
  return ACCIONES.filter((a) => a.desde.includes(of.estado) && cumpleRequisito(a, of));
}

/** Aplica la transición de estado. NO toca el fichaje (eso es del Board). */
export function aplicarAccion(of: OF, accion: AccionOF, obs?: string): OF {
  const def = accionesDisponibles(of).find((a) => a.id === accion);
  if (!def) throw new Error(`Acción "${accion}" no disponible desde "${of.estado}"`);
  if (def.conNota && !obs?.trim()) throw new Error(`La acción "${def.label}" requiere una nota`);
  const estado = typeof def.destino === "function" ? def.destino(of) : def.destino;
  return { ...of, estado, ...(def.conNota ? { observacion: obs!.trim() } : {}) };
}
```

- [ ] **Step 4: Verificar PASS** — `pnpm test` → todos. `npx tsc --noEmit` fallará en los consumidores del viejo `AccionOF` de Drawer — **eso se arregla en Tasks 5-7**; si el hook de typecheck bloquea, es esperado: continuar la tarea siguiente sin commitear roto NO vale → para no dejar `main` roto, este commit incluye solo ficheros nuevos (los viejos siguen usando el `AccionOF` de `Drawer.tsx`, que aún existe — no hay conflicto de nombres porque los módulos son distintos).
- [ ] **Step 5: Commit** — `git commit -m "feat(acciones): máquina de estados de OF con textos y confirmaciones"`

---

### Task 4: Diálogo de confirmación `ConfirmDialog.tsx`

**Files:**
- Create: `src/components/ConfirmDialog.tsx`

**Interfaces (Produces):**
```ts
export function ConfirmDialog(props: {
  abierto: boolean; titulo: string; mensaje: string;
  tono?: "primaria" | "peligro" | "neutra";
  onConfirmar: () => void; onCancelar: () => void;
}): ReactNode;
```

- [ ] **Step 1: Implementar** (componente presentacional; se verifica visualmente en Task 9)

```tsx
"use client";

import { useEffect, useRef } from "react";

/** Confirmación ligera para acciones con consecuencias (aprobar, anular…).
 *  Escape o clic fuera cancelan; el botón de confirmar recibe el foco. */
export function ConfirmDialog({
  abierto,
  titulo,
  mensaje,
  tono = "primaria",
  onConfirmar,
  onCancelar,
}: {
  abierto: boolean;
  titulo: string;
  mensaje: string;
  tono?: "primaria" | "peligro" | "neutra";
  onConfirmar: () => void;
  onCancelar: () => void;
}) {
  const btnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!abierto) return;
    btnRef.current?.focus();
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onCancelar();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [abierto, onCancelar]);

  if (!abierto) return null;

  const toneCls =
    tono === "peligro"
      ? "bg-red-600 text-white hover:bg-red-700"
      : "bg-teal-600 text-white hover:bg-teal-700";

  return (
    <div className="fixed inset-0 z-[60]" role="alertdialog" aria-modal="true" aria-label={titulo}>
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onCancelar} />
      <div className="glass-panel-strong absolute left-1/2 top-1/3 w-full max-w-sm -translate-x-1/2 rounded-2xl p-4">
        <h3 className="text-sm font-bold text-text">{titulo}</h3>
        <p className="mt-1.5 text-sm text-text-muted">{mensaje}</p>
        <div className="mt-4 flex justify-end gap-2">
          <button
            onClick={onCancelar}
            className="rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-text-muted hover:text-text"
          >
            Cancelar
          </button>
          <button
            ref={btnRef}
            onClick={onConfirmar}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${toneCls}`}
          >
            Confirmar
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: `npx tsc --noEmit` limpio.**
- [ ] **Step 3: Commit** — `git commit -m "feat(ui): ConfirmDialog para acciones con consecuencias"`

---

### Task 5: Board orquesta motor + máquina (corazón del cambio)

**Files:**
- Modify: `src/components/Board.tsx`
- Modify: `src/components/Drawer.tsx` (quitar `export type AccionOF`; importar de `@/lib/acciones`)

**Interfaces (Consumes):** `fichar/pausar/abierto/minutosOF/ofsFichables` (Tasks 1-2), `aplicarAccion/accionesDisponibles/AccionOF` (Task 3).
**Interfaces (Produces)** — props nuevas que consumirán Drawer/PedidoChip/MiFichaje:
```ts
ejecutarAccion(ofIds: string[], accion: AccionOF, obs?: string): void
ficharOFs(ofIds: string[], rol: Rol): void       // añade al conjunto corriente
desficharOF(ofId: string): void                   // lo quita del conjunto
pausarTodo(): void
reanudar(): void
fichaje: Fichaje                                  // para panel y badges
```

- [ ] **Step 1: Estado + persistencia + sincronización de `fichandoRol`**

En `Board.tsx`, junto a `IDENTITY_KEY` (línea ~35):

```ts
const FICHAJE_KEY = "coordina-fichaje-v1";

function leerFichajeGuardado(): Fichaje {
  if (typeof window === "undefined") return FICHAJE_VACIO;
  try {
    return JSON.parse(localStorage.getItem(FICHAJE_KEY) ?? "") as Fichaje;
  } catch {
    return FICHAJE_VACIO;
  }
}
```

Dentro del componente `Board`:

```ts
const [fichaje, setFichaje] = useState<Fichaje>(FICHAJE_VACIO);
useEffect(() => { setFichaje(leerFichajeGuardado()); }, []); // tras hidratar
useEffect(() => { localStorage.setItem(FICHAJE_KEY, JSON.stringify(fichaje)); }, [fichaje]);

// fichandoRol de cada OF se DERIVA del intervalo abierto (denormalizado en pedidos
// para que LiveBadge, chips y contadores existentes sigan funcionando sin tocarlos).
useEffect(() => {
  const ab = abierto(fichaje);
  setPedidos((prev) =>
    prev.map((p) => ({
      ...p,
      ofs: p.ofs.map((of) => {
        const rol = ab && ab.ofIds.includes(of.id) ? ab.rol : null;
        return of.fichandoRol === rol ? of : { ...of, fichandoRol: rol };
      }),
    })),
  );
}, [fichaje]);
```

- [ ] **Step 2: API de fichaje del Board**

```ts
const ahora = () => new Date().toISOString();

const ficharOFs = useCallback((ofIds: string[], rol: Rol) => {
  if (!miId) return;
  setFichaje((f) => {
    const ab = abierto(f);
    const conjunto = ab && ab.rol === rol ? [...ab.ofIds, ...ofIds] : ofIds;
    return fichar(f, conjunto, rol, miId, ahora());
  });
}, [miId]);

const desficharOF = useCallback((ofId: string) => {
  setFichaje((f) => {
    const ab = abierto(f);
    if (!ab) return f;
    return fichar(f, ab.ofIds.filter((id) => id !== ofId), ab.rol, ab.operarioId, ahora());
  });
}, []);

const pausarTodo = useCallback(() => setFichaje((f) => pausar(f, ahora())), []);

const reanudar = useCallback(() => {
  setFichaje((f) => {
    const ultimo = f.intervalos[f.intervalos.length - 1];
    if (!ultimo || ultimo.fin === null) return f;
    return fichar(f, ultimo.ofIds, ultimo.rol, ultimo.operarioId, ahora());
  });
}, []);
```

- [ ] **Step 3: `ejecutarAccion` sustituye a `accionOF` + `accionFacet`**

Borrar los dos `switch` (líneas 312-385 actuales) y poner:

```ts
const ejecutarAccion = useCallback(
  (ofIds: string[], accion: AccionOF, obs?: string) => {
    const def = ACCIONES.find((a) => a.id === accion);
    mut(new Set(ofIds), (of) => {
      try { return aplicarAccion(of, accion, obs); } catch { return of; }
    });
    if (def?.efectoFichaje === "corta") {
      setFichaje((f) => {
        const ab = abierto(f);
        if (!ab) return f;
        const resto = ab.ofIds.filter((id) => !ofIds.includes(id));
        return fichar(f, resto, ab.rol, ab.operarioId, ahora());
      });
    } else if (def?.efectoFichaje === "arranca") {
      const rol = accion === "empezar_revision" ? "revisar" : "plantear";
      ficharOFs(ofIds, rol);
    }
  },
  [mut, ficharOFs],
);
```

Adaptadores para no romper firmas aguas abajo todavía (se eliminan en Tasks 6-7):
`const accionOF = (ofId: string, a: AccionOF, obs?: string) => ejecutarAccion([ofId], a, obs);`
`const accionFacet = (facet: Facet, a: AccionOF, obs?: string, revisorId?: string) => { if (revisorId !== undefined) mut(new Set(facet.ofs.map(o=>o.id)), (of)=>({ ...of, revisorId })); ejecutarAccion(facet.ofs.map((o) => o.id), a, obs); };`

- [ ] **Step 4: Mover el tipo** — en `Drawer.tsx` borrar `export type AccionOF = ...` (línea 14) y añadir `import type { AccionOF } from "@/lib/acciones";`. En `Board.tsx`, `PedidoChip.tsx`, `PedidosPorEstado.tsx`, `Zona.tsx`, `TecnicoCard.tsx`: cambiar `import ... { type AccionOF } from "./Drawer"` → `from "@/lib/acciones"`. Imports nuevos en Board: `import { ACCIONES, aplicarAccion, type AccionOF } from "@/lib/acciones"; import { FICHAJE_VACIO, abierto, fichar, pausar, type Fichaje } from "@/lib/fichaje"; import type { Rol } from "@/lib/types";`
- [ ] **Step 5: Compatibilidad de ids** — Drawer y PedidoChip aún emiten ids viejos (`"empezar"`, `"terminar"`…). Sustituir en esos ficheros SOLO los strings: `"empezar"`→`"empezar_planteo"` (en contexto por_revisar/en_revision → `"empezar_revision"`), `"terminar"`→`"terminar_planteo"`, `"pausar"`→ llamar `pausarTodo` vía prop nueva (provisional: botón pausa global). Los botones se rehacen bien en Tasks 6-7; aquí solo debe compilar y funcionar.
- [ ] **Step 6: Verificar** — `npx tsc --noEmit` limpio; `pnpm test` verde; `pnpm dev` → tablero funciona: empezar planteo arranca fichaje (badge vivo), pasar a revisión lo corta.
- [ ] **Step 7: Commit** — `git commit -m "feat(board): orquestación de fichaje por intervalos y máquina de estados"`

---

### Task 6: Drawer pinta botones desde la máquina

**Files:**
- Modify: `src/components/Drawer.tsx` (sección «acciones según estado», líneas ~326-386)

**Interfaces (Consumes):** `accionesDisponibles`, `ConfirmDialog`, props del Board (`onAccion` pasa a `(ofIds: string[], accion: AccionOF, obs?: string)`; nuevas `onFichar(ofIds, rol)`, `onDesfichar(ofId)`, `fichaje`).

- [ ] **Step 1: Reemplazar el bloque de botones hardcodeados** por:

```tsx
function AccionesOF({
  of,
  onAccion,
}: {
  of: OF;
  onAccion: (ofIds: string[], accion: AccionOF, obs?: string) => void;
}) {
  const [confirmando, setConfirmando] = useState<AccionDef | null>(null);
  const acciones = accionesDisponibles(of);
  const tono = { primaria: "teal", peligro: "amber", neutra: "ghost" } as const;

  return (
    <div className="mt-2.5 flex flex-wrap gap-2">
      {acciones.map((a) =>
        a.conNota ? (
          <DevolverInline key={a.id} onDevolver={(obs) => onAccion([of.id], a.id, obs)} />
        ) : (
          <Btn
            key={a.id}
            tone={tono[a.tono]}
            onClick={() => (a.confirmar ? setConfirmando(a) : onAccion([of.id], a.id))}
          >
            {a.label}
          </Btn>
        ),
      )}
      <ConfirmDialog
        abierto={confirmando !== null}
        titulo={confirmando?.label ?? ""}
        mensaje={confirmando?.confirmar ?? ""}
        tono={confirmando?.tono}
        onConfirmar={() => { if (confirmando) onAccion([of.id], confirmando.id); setConfirmando(null); }}
        onCancelar={() => setConfirmando(null)}
      />
    </div>
  );
}
```

Y en `OFRow` sustituir todo el bloque `{/* acciones según estado */}` por `<AccionesOF of={of} onAccion={onAccion} />`. Añadir botón fichar en la fila (junto a tiempos):

```tsx
{of.fichandoRol ? (
  <Btn tone="ghost" onClick={() => onDesfichar(of.id)}>⏸ Dejar de fichar</Btn>
) : (
  !of.detenida && of.estado !== "anulada" && of.estado !== "aprobada" && (
    <Btn tone="ghost" onClick={() => onFichar([of.id], of.estado === "por_revisar" || of.estado === "en_revision" ? "revisar" : "plantear")}>
      ⏱ Fichar
    </Btn>
  )
)}
```

- [ ] **Step 2: Actualizar firma** de `onAccion` en props de `Drawer`/`OFRow` y su llamada en `Board.tsx` (pasar `ejecutarAccion` directamente; borrar adaptador `accionOF`).
- [ ] **Step 3: Verificar** — tsc limpio; en dev: cada estado enseña sus botones nuevos, aprobar/anular piden confirmación, devolver exige nota.
- [ ] **Step 4: Commit** — `git commit -m "feat(drawer): botones generados desde la máquina de estados + fichar por OF"`

---

### Task 7: PedidoChip desde la máquina (máx. 2 acciones + fichar)

**Files:**
- Modify: `src/components/PedidoChip.tsx` (bloque líneas ~207-250)

- [ ] **Step 1:** Sustituir los botones por-bucket por: primeras **2** `accionesDisponibles(of)` con tono `primaria` del conjunto del facet (aplicadas a todas sus OFs), + toggle fichar (`onFichar(facet.ofs.map(o=>o.id), rol)` / `onDesfichar`). Acciones con `confirmar` abren `ConfirmDialog` (mismo patrón de Task 6). El selector de revisor existente al terminar planteo se conserva tal cual.
- [ ] **Step 2:** Borrar el adaptador `accionFacet` del Board; pasar `ejecutarAccion`/`onFichar`/`onDesfichar` por `Zona`→`TecnicoCard`→`PedidoChip` y `PedidosPorEstado` (actualizar tipos de props en los 4 ficheros).
- [ ] **Step 3:** Verificar tsc + dev (tarjetas muestran máx. 2 botones + fichar; sin duplicidad con drawer).
- [ ] **Step 4: Commit** — `git commit -m "feat(chips): acciones desde la máquina y fichaje rápido en tarjeta"`

---

### Task 8: Panel «Mi fichaje» (`MiFichaje.tsx`)

**Files:**
- Create: `src/components/MiFichaje.tsx`
- Modify: `src/components/Board.tsx` (montarlo junto al tablero)

**Interfaces (Consumes):**
```ts
{ miId: string | null; operarios: Operario[]; pedidos: Pedido[]; fichaje: Fichaje;
  onFichar(ofIds: string[], rol: Rol): void; onDesfichar(ofId: string): void;
  onPausarTodo(): void; onReanudar(): void }
```

- [ ] **Step 1: Componente.** Estructura (usar patrones de `Drawer`/`glass-chip`; reloj con `useEffect` + `setInterval` 30 s):
  - **Píldora colapsada** (fija, esquina inferior derecha): sin fichaje → `⏱ Sin fichar` gris; fichando → `⏱ {n} OFs · {h:mm}` con `LiveDot` del rol y animación pulso (`motion-reduce:animate-none`); **ámbar** si hay OFs mías `en_curso` y nada corriendo desde hace >10 min (constante `AVISO_SIN_FICHAR_MIN = 10`): texto `⚠ Planteando sin fichar`.
  - **Expandido** (panel `glass-panel-strong`, ancho ~22rem): mis OFs (autor o revisor = miId, estados fichables) agrupadas por pedido. Por pedido: cabecera `codigo · cliente` + botón «Fichar pedido» (usa `ofsFichables(p)` ∩ mías; si salta detenidas, subtexto «fichando 4 de 5 — 1 detenida»). Por OF: toggle fichar/desfichar, chip de estado (`ESTADO[of.estado].chip`), `Detenida` deshabilitada, minutos de hoy (`minutosOF(fichaje, of.id, { ahora })` redondeados con `fmtMin`). Abajo: botón grande `⏸ Pausar todo` / `▶ Reanudar` + total corriendo.
  - Identidad bien visible arriba: `OpDot` + nombre (reutilizar patrón de `IdentityBadge`).
  - Cambio de identidad con reloj corriendo (spec §3): en `Board`, al cambiar `miId` con `abierto(fichaje) !== null`, abrir `ConfirmDialog` «Tienes un fichaje corriendo a nombre de {nombre}. ¿Pausarlo antes de cambiar?» — Confirmar = `pausarTodo()` y cambia; Cancelar = no cambia de identidad.
- [ ] **Step 2: Montar en Board** debajo del contenido principal: `{miId && <MiFichaje miId={miId} operarios={operarios} pedidos={procesadosAll} fichaje={fichaje} onFichar={ficharOFs} onDesfichar={desficharOF} onPausarTodo={pausarTodo} onReanudar={reanudar} />}`.
- [ ] **Step 3: Verificar en dev:** fichar 2 pedidos a la vez reparte tiempo (mirar minutos tras un rato); recargar la página conserva el reloj corriendo; pausar todo lo para; aviso ámbar aparece con OF en curso sin fichar.
- [ ] **Step 4: Commit** — `git commit -m "feat(fichaje): panel Mi fichaje con multi-OF, aviso anti-olvido y persistencia"`

---

### Task 9: Verificación end-to-end y limpieza

- [ ] **Step 1:** `pnpm test` (todo verde) + `npx tsc --noEmit` + `pnpm build` (sin errores).
- [ ] **Step 2:** Con Playwright MCP sobre `pnpm dev` (puerto 3000 puede estar ocupado por otra app — usar `-p 3100`): recorrer flujo completo — identificarse, fichar pedido desde panel, empezar planteo desde chip (arranca fichaje), pasar a revisión (corta), aprobar con confirmación, anular y restaurar, recargar página con reloj corriendo.
- [ ] **Step 3:** Lanzar subagent `ui-reviewer` sobre los ficheros tocados; corregir hallazgos de severidad alta.
- [ ] **Step 4:** Grep de restos: `rg '"empezar"|"terminar"|"pausar"' src/` no debe devolver ids viejos de acciones. Los campos `tiempoPlanteoMin`/`tiempoRevisionMin` del mock quedan como datos históricos de partida (los minutos nuevos los suma el motor aparte; la fusión con lo ya imputado en RPS se decide cuando IT responda — pregunta 5 del spec).
- [ ] **Step 5: Commit final** — `git commit -m "feat: fichaje por intervalos y flujo de pedidos unificado"`

---

## Fuera de este plan (bloqueado por IT — spec §4 y preguntas abiertas)

Export a Olanet (`src/lib/server/olanet.ts`), OFs detenidas leídas de RPS, columna real
de tiempo estimado, fusión con tiempos ya imputados. El campo `detenida` queda listo
para cuando llegue el dato real.
