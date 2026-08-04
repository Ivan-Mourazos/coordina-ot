# Estructura de la pantalla principal — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que la zona personal deje de gastar ~400 px para 5 pedidos, liberando ese alto para la bandeja, sin que nada crezca cuando alguien va cargado.

**Architecture:** Se extrae a un módulo puro la clasificación por fase, hoy duplicada en tres componentes con nombres y colores distintos. Sobre él se reconstruye la zona personal con una fila por pedido, tope fijo por fase y desplegable flotante para el resto. Se retiran los mandos de redimensionar (ya no hacen falta) y se pulen la fila de equipo y la bandeja.

**Tech Stack:** Next.js 16 (App Router), React 19, TypeScript, Tailwind 4, dnd-kit, vitest.

## Global Constraints

- Tests: `npx vitest run`. Viven en `src/lib/__tests__/`. **No hay librería de testing de componentes**: la lógica se extrae a `src/lib/` y se prueba ahí; lo visual se verifica con `npx next build` y mirando la app.
- Alias `@/` → `src/` (ver `vitest.config.ts`).
- Las clases de Tailwind deben aparecer como **literales** para que se compilen. Nunca construir nombres de clase concatenando.
- Next.js 16 tiene breaking changes: ante cualquier API dudosa, leer `node_modules/next/dist/docs/` antes (ver `AGENTS.md`).
- Lint: `npx eslint src/lib src/components`. La regla `react-hooks/set-state-in-effect` está activa: no llamar `setState` de forma síncrona en el cuerpo de un efecto.
- Comentarios y textos de UI en **castellano**, como el resto del proyecto.
- Este plan cubre las secciones 1–4 del diseño (estructura). Las secciones 5 y 6 —flujo de revisión y reparto por rol entre Asignar y la pestaña Revisión— van en un **segundo plan**, porque cambian semántica y no layout.

## Acciones en línea

Iván confirmó que la fila debe conservar las acciones: perderlas seria pasar de un clic a dos en algo que se hace a diario. Van reveladas al pasar el raton (ver Task 2), y la jerarquia completa de botones sigue siendo asunto del segundo diseño.

## Estructura de ficheros

| Fichero | Responsabilidad |
|---|---|
| `src/lib/fases-tablero.ts` (nuevo) | Única definición de las 4 fases: id, etiqueta, color, y en qué fase cae una OF o un pedido. Tope y reparto. |
| `src/components/PedidoLinea.tsx` (nuevo) | Una fila compacta de pedido (código, cliente, descripción, nº OF, tiempo). |
| `src/components/ZonaPersonal.tsx` (nuevo) | La zona del operario actual: cabecera + columnas por fase con tope. Sustituye el uso de `Zona` con `soyYo`. |
| `src/components/FaseFlyout.tsx` (nuevo) | Desplegable flotante con todos los pedidos de una fase. |
| `src/components/PedidosPorEstado.tsx` | Pierde la definición de grupos (pasa a `fases-tablero`); sigue sirviendo el panel de compañero. |
| `src/components/TecnicoCard.tsx` | Barra legible y arrastre restringido. |
| `src/components/Zona.tsx` | Deja de usarse para `soyYo`; se elimina si no queda ningún uso. |
| `src/components/Board.tsx` | Se retiran `panelTopH`, `zonaColapsada`, `superiorColapsado` y sus mandos. |
| `src/components/PedidoCard.tsx` | Cliente bajo el código en la miniatura de bandeja. |

---

### Task 1: Módulo único de fases

Hoy la misma clasificación existe tres veces con nombres distintos: `bucketDe` en `PedidosPorEstado.tsx:17`, `faseDe` en `TecnicoCard.tsx:22` y `faseIdx` en `Zona.tsx:21`. Los colores están copiados en los tres. Se unifica antes de tocar nada más.

**Files:**
- Create: `src/lib/fases-tablero.ts`
- Test: `src/lib/__tests__/fases-tablero.test.ts`

**Interfaces:**
- Consumes: `OF` de `src/lib/types.ts`.
- Produces: `Fase`, `FASES`, `faseDeOF(of)`, `faseDePedido(p)`, `agruparPorFase(pedidos)`, `conTope(items, tope)`, `arrastrableDeCompanero(p)`.

- [ ] **Step 1: Escribir el test que falla**

Crear `src/lib/__tests__/fases-tablero.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { OF } from "../types";
import {
  FASES,
  agruparPorFase,
  arrastrableDeCompanero,
  conTope,
  faseDeOF,
  faseDePedido,
} from "../fases-tablero";

const of = (p: Partial<OF>): OF =>
  ({
    id: "0230001:5",
    codigo: "0230001",
    descripcion: "LONA",
    familia: "LONA",
    piezas: 1,
    autorId: null,
    revisorId: null,
    estado: "pendiente",
    fichandoRol: null,
    tiempoEstimadoMin: 0,
    tiempoPlanteoMin: 0,
    tiempoRevisionMin: 0,
    ...p,
  }) as OF;

describe("FASES", () => {
  it("son cuatro, en orden de ciclo y con los nombres nuevos", () => {
    expect(FASES.map((f) => f.id)).toEqual([
      "sinEmpezar",
      "planteando",
      "esperandoRevision",
      "listoParaPasar",
    ]);
    // "Esperando revisión" y no "Para revisar": es mi trabajo en manos de otro,
    // no trabajo que me toque revisar a mí.
    expect(FASES[2].label).toBe("Esperando revisión");
    expect(FASES[3].label).toBe("Listo para pasar");
  });
});

describe("faseDeOF", () => {
  it("aprobada → listo para pasar", () => {
    expect(faseDeOF(of({ estado: "aprobada" }))).toBe("listoParaPasar");
  });
  it("por_revisar y en_revision → esperando revisión", () => {
    expect(faseDeOF(of({ estado: "por_revisar" }))).toBe("esperandoRevision");
    expect(faseDeOF(of({ estado: "en_revision" }))).toBe("esperandoRevision");
  });
  it("en_curso y devuelta → planteando", () => {
    expect(faseDeOF(of({ estado: "en_curso" }))).toBe("planteando");
    expect(faseDeOF(of({ estado: "devuelta" }))).toBe("planteando");
  });
  it("pendiente sin tiempo ni fichaje → sin empezar", () => {
    expect(faseDeOF(of({ estado: "pendiente" }))).toBe("sinEmpezar");
  });
  it("pendiente pero con tiempo o fichándose ya cuenta como planteando", () => {
    expect(faseDeOF(of({ estado: "pendiente", tiempoPlanteoMin: 12 }))).toBe("planteando");
    expect(faseDeOF(of({ estado: "pendiente", fichandoRol: "plantear" }))).toBe("planteando");
  });
});

describe("faseDePedido", () => {
  it("todas aprobadas → listo para pasar", () => {
    expect(faseDePedido({ ofs: [of({ estado: "aprobada" }), of({ estado: "aprobada" })] }))
      .toBe("listoParaPasar");
  });
  it("si alguna se está planteando, manda planteando", () => {
    expect(faseDePedido({ ofs: [of({ estado: "aprobada" }), of({ estado: "en_curso" })] }))
      .toBe("planteando");
  });
  it("todas sin empezar → sin empezar", () => {
    expect(faseDePedido({ ofs: [of({}), of({})] })).toBe("sinEmpezar");
  });
  it("mezcla de sin empezar y esperando revisión → esperando revisión", () => {
    expect(faseDePedido({ ofs: [of({}), of({ estado: "por_revisar" })] }))
      .toBe("esperandoRevision");
  });
  it("un pedido sin OFs no revienta", () => {
    expect(faseDePedido({ ofs: [] })).toBe("sinEmpezar");
  });
});

describe("agruparPorFase", () => {
  it("devuelve las cuatro fases, en orden, aunque estén vacías", () => {
    const g = agruparPorFase([{ ofs: [of({ estado: "en_curso" })] }]);
    expect(g.map((x) => x.id)).toEqual(FASES.map((f) => f.id));
    expect(g[1].items).toHaveLength(1);
    expect(g[0].items).toHaveLength(0);
  });
});

describe("conTope", () => {
  it("por debajo del tope no oculta nada", () => {
    expect(conTope([1, 2], 3)).toEqual({ visibles: [1, 2], resto: 0 });
  });
  it("por encima recorta y dice cuántos quedan", () => {
    expect(conTope([1, 2, 3, 4, 5], 3)).toEqual({ visibles: [1, 2, 3], resto: 2 });
  });
  it("justo en el tope no deja resto", () => {
    expect(conTope([1, 2, 3], 3)).toEqual({ visibles: [1, 2, 3], resto: 0 });
  });
});

describe("arrastrableDeCompanero", () => {
  it("solo se mueve lo que no ha empezado", () => {
    expect(arrastrableDeCompanero({ ofs: [of({}), of({})] })).toBe(true);
  });
  it("con tiempo ya fichado no se mueve: las horas quedarían a nombre de otro", () => {
    expect(arrastrableDeCompanero({ ofs: [of({}), of({ tiempoPlanteoMin: 5 })] })).toBe(false);
  });
  it("si alguien la está fichando ahora, tampoco", () => {
    expect(arrastrableDeCompanero({ ofs: [of({ fichandoRol: "plantear" })] })).toBe(false);
  });
  it("fuera de pendiente, tampoco", () => {
    expect(arrastrableDeCompanero({ ofs: [of({ estado: "por_revisar" })] })).toBe(false);
  });
  it("un pedido sin OFs no es arrastrable", () => {
    expect(arrastrableDeCompanero({ ofs: [] })).toBe(false);
  });
});
```

- [ ] **Step 2: Ejecutar el test y comprobar que falla**

Run: `npx vitest run src/lib/__tests__/fases-tablero.test.ts`
Expected: FAIL — `Failed to resolve import "../fases-tablero"`.

- [ ] **Step 3: Escribir el módulo**

Crear `src/lib/fases-tablero.ts`:

```ts
import type { OF } from "./types";

// ─── Las cuatro fases del tablero ────────────────────────────────────────────
// Definición ÚNICA. Antes vivía copiada en PedidosPorEstado (bucketDe),
// TecnicoCard (faseDe) y Zona (faseIdx), con etiquetas y colores distintos en
// cada sitio; al cambiar un nombre había que acordarse de los tres.

export type Fase = "sinEmpezar" | "planteando" | "esperandoRevision" | "listoParaPasar";

export interface FaseMeta {
  id: Fase;
  label: string;
  /** Color del punto y de la barra de carga. Literal, no clase de Tailwind:
   *  se usa en `style`, porque Tailwind no compila clases construidas. */
  color: string;
}

export const FASES: readonly FaseMeta[] = [
  { id: "sinEmpezar", label: "Sin empezar", color: "#9ca3af" },
  { id: "planteando", label: "Planteando", color: "#059669" },
  // "Esperando revisión", no "Para revisar": es MI trabajo en manos de otro.
  // Lo que me toca revisar a mí vive en la pestaña Revisión.
  { id: "esperandoRevision", label: "Esperando revisión", color: "#7c3aed" },
  { id: "listoParaPasar", label: "Listo para pasar", color: "#0891b2" },
];

/** Pedido visto desde el tablero: solo hacen falta sus OFs. */
export interface ConOFs {
  ofs: OF[];
}

export function faseDeOF(of: OF): Fase {
  if (of.estado === "aprobada") return "listoParaPasar";
  if (of.estado === "por_revisar" || of.estado === "en_revision") return "esperandoRevision";
  if (of.estado === "en_curso" || of.estado === "devuelta") return "planteando";
  // Pendiente pero con tiempo o con alguien fichando: ya está en marcha.
  return of.tiempoPlanteoMin > 0 || of.fichandoRol ? "planteando" : "sinEmpezar";
}

/** Fase del pedido entero. Manda lo que está más "en marcha": un pedido con
 *  una OF planteándose está planteándose, aunque las demás estén aprobadas. */
export function faseDePedido(p: ConOFs): Fase {
  if (p.ofs.length === 0) return "sinEmpezar";
  const fases = p.ofs.map(faseDeOF);
  if (fases.every((f) => f === "listoParaPasar")) return "listoParaPasar";
  if (fases.some((f) => f === "planteando")) return "planteando";
  if (fases.some((f) => f === "esperandoRevision")) return "esperandoRevision";
  return "sinEmpezar";
}

export interface GrupoFase<T> extends FaseMeta {
  items: T[];
}

/** Reparte pedidos en las cuatro fases. Devuelve SIEMPRE las cuatro, también
 *  vacías: quien pinta decide si una fase vacía ocupa sitio o no. */
export function agruparPorFase<T extends ConOFs>(pedidos: readonly T[]): GrupoFase<T>[] {
  return FASES.map((meta) => ({
    ...meta,
    items: pedidos.filter((p) => faseDePedido(p) === meta.id),
  }));
}

/** Recorta a `tope` elementos y dice cuántos se quedan fuera. Es lo que hace
 *  que la zona personal mida lo mismo con 5 pedidos que con 40. */
export function conTope<T>(items: readonly T[], tope: number): { visibles: T[]; resto: number } {
  return {
    visibles: items.slice(0, tope),
    resto: Math.max(0, items.length - tope),
  };
}

/** ¿Se puede quitar este pedido a un compañero? Solo si no ha empezado.
 *  Moverlo con tiempo ya fichado dejaría las horas a nombre de una persona y
 *  el trabajo a nombre de otra. */
export function arrastrableDeCompanero(p: ConOFs): boolean {
  if (p.ofs.length === 0) return false;
  return p.ofs.every(
    (o) => o.estado === "pendiente" && o.tiempoPlanteoMin === 0 && !o.fichandoRol,
  );
}
```

- [ ] **Step 4: Ejecutar el test y comprobar que pasa**

Run: `npx vitest run src/lib/__tests__/fases-tablero.test.ts`
Expected: PASS, 20 tests.

- [ ] **Step 5: Comprobar tipos y lint**

Run: `npx tsc --noEmit && npx eslint src/lib/fases-tablero.ts src/lib/__tests__/fases-tablero.test.ts`
Expected: sin salida de error.

- [ ] **Step 6: Commit**

```bash
git add src/lib/fases-tablero.ts src/lib/__tests__/fases-tablero.test.ts
git commit -m "refactor(tablero): una sola definicion de las fases

Estaba copiada en PedidosPorEstado, TecnicoCard y Zona, con etiquetas y
colores distintos en cada sitio. Aprovecha para renombrar la tercera fase a
Esperando revision: Para revisar se leia como me toca revisar a mi, que es lo
contrario de lo que significa."
```

---

### Task 2: Fila compacta de pedido, con acciones en línea

Sustituye la tarjeta de tres líneas por una fila. Es la pieza que hace que 5 pedidos ocupen ~130 px en vez de ~340.

**Las acciones se conservan**: hoy se puede fichar y cambiar de estado desde el tablero sin abrir nada, y perder eso serían dos clics donde hay uno, cada día. Van reveladas al pasar el ratón para no gastar sitio en reposo, salvo el botón de pausa del pedido que se está fichando, que está siempre visible porque es el que más se usa.

Qué acción ofrecer no se decide en el componente: sale de `accionesDisponibles()` de `src/lib/acciones.ts`, que ya es la fuente única de verdad de la máquina de estados. Lo único nuevo es reducir las acciones de las N OFs de un pedido a **una** primaria, y eso es lógica pura y con tests.

**Files:**
- Create: `src/lib/accion-pedido.ts`
- Test: `src/lib/__tests__/accion-pedido.test.ts`
- Create: `src/components/PedidoLinea.tsx`

**Interfaces:**
- Consumes: `Fase`, `FASES` (Task 1); `accionesDisponibles`, `AccionDef`, `AccionOF` de `src/lib/acciones.ts`; `esFichable`, `rolFichajeDe` de `src/lib/fichaje.ts`; `Facet` de `./PedidoCard`.
- Produces: `accionPrimariaDePedido(p)`, `ofsPara(p, accion)`, `ofsFichablesDe(p)` y `<PedidoLinea facet fase onOpen onAccion onFichar onDesfichar completarPedido />`.

- [ ] **Step 1: Escribir el test que falla**

Crear `src/lib/__tests__/accion-pedido.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { OF } from "../types";
import { accionPrimariaDePedido, ofsFichablesDe, ofsPara } from "../accion-pedido";

const of = (p: Partial<OF>): OF =>
  ({
    id: "0230001:5",
    codigo: "0230001",
    descripcion: "LONA",
    familia: "LONA",
    piezas: 1,
    autorId: "ivan",
    revisorId: null,
    estado: "pendiente",
    fichandoRol: null,
    tiempoEstimadoMin: 0,
    tiempoPlanteoMin: 0,
    tiempoRevisionMin: 0,
    ...p,
  }) as OF;

describe("accionPrimariaDePedido", () => {
  it("pendiente con autor → empezar planteo", () => {
    expect(accionPrimariaDePedido({ ofs: [of({})] })?.id).toBe("empezar_planteo");
  });

  it("en curso → pasar a revisión", () => {
    expect(accionPrimariaDePedido({ ofs: [of({ estado: "en_curso" })] })?.id)
      .toBe("terminar_planteo");
  });

  it("devuelta → retomar planteo", () => {
    expect(accionPrimariaDePedido({ ofs: [of({ estado: "devuelta" })] })?.id).toBe("retomar");
  });

  it("aprobada no ofrece accion primaria: lo que toca es pasar el pedido", () => {
    expect(accionPrimariaDePedido({ ofs: [of({ estado: "aprobada" })] })).toBeNull();
  });

  it("pendiente SIN autor no ofrece empezar: la accion lo exige", () => {
    expect(accionPrimariaDePedido({ ofs: [of({ autorId: null })] })).toBeNull();
  });

  it("con OFs en estados distintos manda la de la fase del pedido", () => {
    // El pedido está "planteando" porque una OF está en curso; la acción tiene
    // que ser la de esa fase, no la de la OF que sigue pendiente.
    const p = { ofs: [of({ estado: "pendiente" }), of({ estado: "en_curso" })] };
    expect(accionPrimariaDePedido(p)?.id).toBe("terminar_planteo");
  });

  it("un pedido sin OFs no ofrece nada", () => {
    expect(accionPrimariaDePedido({ ofs: [] })).toBeNull();
  });
});

describe("ofsPara", () => {
  it("devuelve solo las OFs que admiten esa accion", () => {
    const a = of({ id: "a:1", estado: "en_curso" });
    const b = of({ id: "b:1", estado: "aprobada" });
    expect(ofsPara({ ofs: [a, b] }, "terminar_planteo").map((o) => o.id)).toEqual(["a:1"]);
  });

  it("lista vacia si ninguna la admite", () => {
    expect(ofsPara({ ofs: [of({ estado: "aprobada" })] }, "empezar_planteo")).toEqual([]);
  });
});

describe("ofsFichablesDe", () => {
  it("excluye anuladas, aprobadas y detenidas", () => {
    const ok = of({ id: "ok:1", estado: "en_curso" });
    const p = {
      ofs: [
        ok,
        of({ id: "x:1", estado: "aprobada" }),
        of({ id: "y:1", estado: "anulada" }),
        of({ id: "z:1", estado: "en_curso", detenida: true }),
      ],
    };
    expect(ofsFichablesDe(p).map((o) => o.id)).toEqual(["ok:1"]);
  });
});
```

- [ ] **Step 2: Ejecutar el test y comprobar que falla**

Run: `npx vitest run src/lib/__tests__/accion-pedido.test.ts`
Expected: FAIL — `Failed to resolve import "../accion-pedido"`.

- [ ] **Step 3: Escribir el módulo**

Crear `src/lib/accion-pedido.ts`:

```ts
import { accionesDisponibles, type AccionDef, type AccionOF } from "./acciones";
import { esFichable } from "./fichaje";
import { faseDePedido, type ConOFs } from "./fases-tablero";
import type { OF } from "./types";

// ─── Qué acción ofrecer en la fila de un pedido ──────────────────────────────
// Un pedido tiene N OFs y cada una tiene sus acciones. La fila solo tiene sitio
// para UNA, así que se reduce a la primaria de la fase en la que está el pedido.
// Las demás siguen estando en el detalle.
//
// Las acciones NO se definen aquí: salen de accionesDisponibles(), que es la
// máquina de estados y la única fuente de verdad.

/** Acción primaria de cada fase. `null` = esa fase no tiene botón propio en la
 *  fila: "esperando revisión" es trabajo de otro, y "listo para pasar" tiene su
 *  propio botón de pasar el pedido entero. */
const PRIMARIA_POR_FASE: Record<string, AccionOF[]> = {
  sinEmpezar: ["empezar_planteo"],
  // Devuelta y en curso caen las dos en "planteando": si viene devuelta hay que
  // retomarla, y si ya está en curso lo que toca es mandarla a revisión.
  planteando: ["retomar", "terminar_planteo"],
  esperandoRevision: [],
  listoParaPasar: [],
};

/** OFs del pedido que admiten esa acción ahora mismo. */
export function ofsPara(p: ConOFs, accion: AccionOF): OF[] {
  return p.ofs.filter((o) => accionesDisponibles(o).some((a) => a.id === accion));
}

/** La acción que pinta la fila, o null si en esta fase no hay ninguna. */
export function accionPrimariaDePedido(p: ConOFs): AccionDef | null {
  if (p.ofs.length === 0) return null;
  const candidatas = PRIMARIA_POR_FASE[faseDePedido(p)] ?? [];
  for (const id of candidatas) {
    const ofs = ofsPara(p, id);
    if (ofs.length === 0) continue;
    const def = accionesDisponibles(ofs[0]).find((a) => a.id === id);
    if (def) return def;
  }
  return null;
}

/** OFs del pedido en las que se puede fichar. */
export function ofsFichablesDe(p: ConOFs): OF[] {
  return p.ofs.filter(esFichable);
}
```

- [ ] **Step 4: Ejecutar el test y comprobar que pasa**

Run: `npx vitest run src/lib/__tests__/accion-pedido.test.ts`
Expected: PASS, 10 tests.

- [ ] **Step 5: Escribir la fila**

Crear `src/components/PedidoLinea.tsx`:

```tsx
"use client";

import type { Rol } from "@/lib/types";
import type { Facet } from "./PedidoCard";
import { FASES, type Fase } from "@/lib/fases-tablero";
import { accionPrimariaDePedido, ofsFichablesDe, ofsPara } from "@/lib/accion-pedido";
import { rolFichajeDe } from "@/lib/fichaje";
import { fmtMin } from "@/lib/estado";
import type { AccionOF } from "@/lib/acciones";

/** Una línea por pedido: código, cliente, descripción y nº de OF. El detalle
 *  largo sale al abrir el pedido; aquí manda que quepan muchos sin crecer.
 *
 *  Las acciones se revelan al pasar el ratón para no gastar sitio en reposo.
 *  La excepción es la pausa del pedido que se está fichando: está siempre
 *  visible porque es la que más se pulsa y esconderla obligaría a buscarla.
 *
 *  El borde izquierdo lleva el color de la fase, salvo en urgentes, que lo
 *  pintan en rojo: la prioridad tiene que verse sin leer. */
export function PedidoLinea({
  facet,
  fase,
  onOpen,
  onAccion,
  onFichar,
  onDesfichar,
  completarPedido,
}: {
  facet: Facet;
  fase: Fase;
  onOpen: (f: Facet) => void;
  onAccion: (ofIds: string[], accion: AccionOF, obs?: string) => void;
  onFichar: (ofIds: string[], rol: Rol) => void;
  onDesfichar: (ofId: string) => void;
  completarPedido: (pedidoId: string) => void;
}) {
  const { pedido, ofs } = facet;
  const urgente = pedido.prioridad === 3;
  const fichando = ofs.find((o) => o.fichandoRol);
  const minutos = ofs.reduce((n, o) => n + o.tiempoPlanteoMin + o.tiempoRevisionMin, 0);
  const color = urgente ? "#dc2626" : FASES.find((f) => f.id === fase)?.color;
  const descripcion = ofs[0]?.descripcion ?? "";

  const accion = accionPrimariaDePedido(facet);
  const fichables = ofsFichablesDe(facet);

  return (
    <div
      style={{ borderLeftColor: color }}
      className={`group flex items-center gap-2 rounded-lg border border-l-[3px] border-[var(--glass-border)] px-2 py-1 text-[11px] transition-colors hover:border-brand-400 ${
        fichando ? "bg-emerald-500/10" : "bg-surface-2/60"
      }`}
    >
      <button
        onClick={() => onOpen(facet)}
        title={`${pedido.codigo} · ${pedido.cliente} · ${descripcion}`}
        className="flex min-w-0 flex-1 items-center gap-2 text-left"
      >
        {fichando && (
          <span className="size-1.5 shrink-0 rounded-full bg-emerald-500 ring-2 ring-emerald-500/30" />
        )}
        <b className="shrink-0 font-semibold tabular-nums text-text">{pedido.codigo}</b>
        <span className="min-w-0 flex-1 truncate text-text-muted">
          {pedido.cliente}
          {descripcion && ` · ${descripcion}`}
        </span>
        <span className="shrink-0 text-[10px] text-text-muted">
          {ofs.length} OF{minutos > 0 && ` · ${fmtMin(minutos)}`}
        </span>
      </button>

      <span className="flex shrink-0 items-center gap-1">
        {/* Pausa: siempre visible mientras se ficha. */}
        {fichando ? (
          <button
            onClick={() => onDesfichar(fichando.id)}
            title="Pausar el fichaje"
            className="rounded bg-emerald-600 px-1.5 py-0.5 text-[10px] font-bold text-white hover:bg-emerald-700"
          >
            Pausar
          </button>
        ) : (
          fichables.length > 0 && (
            <button
              onClick={() => onFichar(fichables.map((o) => o.id), rolFichajeDe(fichables[0]))}
              title="Empezar a fichar en este pedido"
              className="rounded px-1.5 py-0.5 text-[10px] font-bold text-text-muted opacity-0 transition-opacity hover:bg-[var(--glass-highlight)] hover:text-text focus:opacity-100 group-hover:opacity-100"
            >
              Fichar
            </button>
          )
        )}

        {accion && (
          <button
            onClick={() => onAccion(ofsPara(facet, accion.id).map((o) => o.id), accion.id)}
            title={accion.label}
            className="rounded bg-brand-500 px-1.5 py-0.5 text-[10px] font-bold text-white opacity-0 transition-opacity hover:bg-brand-600 focus:opacity-100 group-hover:opacity-100"
          >
            {accion.label}
          </button>
        )}

        {fase === "listoParaPasar" && (
          <button
            onClick={() => completarPedido(pedido.id)}
            title="Pasar el pedido a Producción"
            className="rounded bg-cyan-600 px-1.5 py-0.5 text-[10px] font-bold text-white hover:bg-cyan-700"
          >
            Pasar
          </button>
        )}
      </span>
    </div>
  );
}
```

- [ ] **Step 6: Comprobar tipos, lint y suite completa**

Run: `npx vitest run && npx tsc --noEmit && npx eslint src/lib src/components/PedidoLinea.tsx`
Expected: 162 tests en verde (152 + 10), sin errores.

- [ ] **Step 7: Commit**

```bash
git add src/lib/accion-pedido.ts src/lib/__tests__/accion-pedido.test.ts src/components/PedidoLinea.tsx
git commit -m "feat(tablero): fila compacta de pedido con acciones en linea

Una linea en vez de las tres de la tarjeta actual, sin perder el poder fichar
y cambiar de estado desde el tablero: seria pasar de un clic a dos, cada dia.
Se revelan al pasar el raton para no gastar sitio en reposo, salvo la pausa
del pedido que se esta fichando, que es la que mas se pulsa.

Que accion toca no lo decide el componente: sale de accionesDisponibles(), la
maquina de estados. Lo unico nuevo es reducir las acciones de las N OFs de un
pedido a una primaria, y eso va como funcion pura con tests.

El borde izquierdo lleva el color de la fase, o rojo si el pedido es urgente:
la prioridad tiene que verse sin leer."
```

---

### Task 3: Zona personal con tope

**Files:**
- Create: `src/components/ZonaPersonal.tsx`
- Modify: `src/components/Board.tsx:827-841` (sustituir `<Zona … soyYo>` por `<ZonaPersonal …>`)

**Interfaces:**
- Consumes: `agruparPorFase`, `conTope`, `FASES` (Task 1); `PedidoLinea` (Task 2).
- Produces: `<ZonaPersonal operario facets live onOpen completarPedido />`.

- [ ] **Step 1: Escribir el componente**

Crear `src/components/ZonaPersonal.tsx`:

```tsx
"use client";

import { useDroppable } from "@dnd-kit/core";
import type { Operario, Rol } from "@/lib/types";
import type { AccionOF } from "@/lib/acciones";
import { agruparPorFase, conTope } from "@/lib/fases-tablero";
import type { Facet } from "./PedidoCard";
import type { LiveInfo } from "./Board";
import { PedidoLinea } from "./PedidoLinea";
import { LiveDot } from "./LiveBadge";
import { ROL } from "@/lib/estado";

/** Cuántos pedidos se ven por fase antes de "+N más". Es lo que garantiza que
 *  el bloque mida lo mismo con 5 pedidos que con 40. */
const TOPE = 3;

/** La zona del operario actual. Solo pinta las fases con contenido: las vacías
 *  se resumen como contadores en la cabecera, en vez de reservar una columna
 *  cada una (que era lo que gastaba ~270 px para no decir nada). */
export function ZonaPersonal({
  operario,
  facets,
  live,
  onOpen,
  onVerTodos,
  onAccion,
  onFichar,
  onDesfichar,
  completarPedido,
}: {
  operario: Operario;
  facets: Facet[];
  live?: LiveInfo | null;
  onOpen: (f: Facet) => void;
  /** Saca el pedido a Producción (columna "Listo para pasar"). */
  completarPedido: (pedidoId: string) => void;
  /** Abre el desplegable con todos los pedidos de una fase. */
  onVerTodos: (faseId: string) => void;
  onAccion: (ofIds: string[], accion: AccionOF, obs?: string) => void;
  onFichar: (ofIds: string[], rol: Rol) => void;
  onDesfichar: (ofId: string) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: operario.id });
  const grupos = agruparPorFase(facets);
  const conItems = grupos.filter((g) => g.items.length > 0);
  const vacias = grupos.filter((g) => g.items.length === 0);
  const nOFs = facets.reduce((n, f) => n + f.ofs.length, 0);

  return (
    <div
      ref={setNodeRef}
      style={!isOver ? { borderColor: operario.color } : undefined}
      className={`glass-panel flex flex-col rounded-2xl p-3 transition-colors ${
        isOver ? "border-brand-400 bg-brand-50/60 dark:bg-brand-900/15" : ""
      }`}
    >
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <span
          className="grid size-7 place-items-center rounded-full text-[11px] font-bold text-white"
          style={{ background: operario.color }}
        >
          {operario.iniciales}
        </span>
        <h2 className="text-sm font-semibold text-text">{operario.nombre}</h2>
        <span className="rounded-full bg-brand-500/15 px-2 py-0.5 text-[10px] font-bold uppercase text-brand-600">
          Tú
        </span>
        <span className="text-[11px] text-text-muted">
          {facets.length} pedidos · {nOFs} OF
        </span>

        {/* Fases vacías: contadores diminutos, sin gastar una columna. */}
        {vacias.length > 0 && (
          <span className="flex flex-wrap items-center gap-2 text-[10px] text-text-muted">
            {vacias.map((g) => (
              <span key={g.id} className="flex items-center gap-1">
                <span className="size-1.5 rounded-full" style={{ background: g.color }} />
                0 {g.label.toLowerCase()}
              </span>
            ))}
          </span>
        )}

        {live && (
          <span
            className="ml-auto flex items-center gap-1.5 text-[11px] font-semibold"
            style={{ color: ROL[live.rol].color }}
          >
            <LiveDot rol={live.rol} className="size-1.5" />
            {ROL[live.rol].label} {live.pedido.codigo}
          </span>
        )}
      </div>

      {conItems.length === 0 ? (
        <p className="py-2 text-[11px] text-text-muted">Sin pedidos asignados.</p>
      ) : (
        <div className="flex flex-wrap items-start gap-3">
          {conItems.map((g) => {
            const { visibles, resto } = conTope(g.items, TOPE);
            return (
              <div key={g.id} className="min-w-[220px] flex-1">
                <h3 className="mb-1 flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-wide text-text-muted">
                  <span className="size-1.5 rounded-full" style={{ background: g.color }} />
                  {g.label} · {g.items.length}
                </h3>
                <div className="flex flex-col gap-1">
                  {visibles.map((f) => (
                    <PedidoLinea
                      key={f.pedido.id}
                      facet={f}
                      fase={g.id}
                      onOpen={onOpen}
                      onAccion={onAccion}
                      onFichar={onFichar}
                      onDesfichar={onDesfichar}
                      completarPedido={completarPedido}
                    />
                  ))}
                  {resto > 0 && (
                    <button
                      onClick={() => onVerTodos(g.id)}
                      className="rounded-md border border-dashed border-[var(--glass-border)] py-0.5 text-[10px] font-semibold text-text-muted hover:border-brand-400 hover:text-text"
                    >
                      +{resto} más
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Enchufarlo en el Board**

En `src/components/Board.tsx`, añadir el import junto a los demás componentes:

```tsx
import { ZonaPersonal } from "./ZonaPersonal";
```

Añadir el estado del desplegable junto a los otros `useState` del componente (cerca de `const [expandedId, setExpandedId]`):

```tsx
// Fase cuyo "+N más" está desplegado en mi zona (null = ninguno).
const [faseAbierta, setFaseAbierta] = useState<string | null>(null);
```

Sustituir el bloque `<Zona … soyYo … />` (hoy en `Board.tsx:827-841`) por:

```tsx
<ZonaPersonal
  operario={yo}
  facets={facetsDe(yo.id)}
  live={liveByOp.get(yo.id) ?? null}
  onOpen={openFacet}
  onVerTodos={setFaseAbierta}
  onAccion={ejecutarAccion}
  onFichar={ficharOFsConAviso}
  onDesfichar={desficharOF}
  completarPedido={completarPedido}
/>
```

- [ ] **Step 3: Quitar la altura fija del contenedor**

En `Board.tsx:823-825`, el `<main>` que envuelve la zona lleva `style={zonaColapsada ? undefined : { height: panelTopH, minHeight: 120 }}`. Cambiar la apertura de ese `<main>` por:

```tsx
<main className="flex shrink-0 flex-col p-4 pb-2">
```

Es decir: sin `style`, sin `overflow-y-auto` y sin `scroll-thin`. El bloque mide ahora lo que necesita, que es el objetivo del cambio.

- [ ] **Step 4: Comprobar que compila**

Run: `npx tsc --noEmit`
Expected: puede fallar por `zonaColapsada`/`panelTopH` sin usar; se limpian en la Task 5. Si el error es otro, arreglarlo aquí.

Run: `npx next build`
Expected: `✓ Compiled successfully`.

- [ ] **Step 5: Mirar la app**

Run: `npx next dev -p 4399` (si el puerto está ocupado, usar otro) y abrir `http://localhost:4399`.
Expected: la zona personal ocupa una franja estrecha; solo aparecen las fases con pedidos; las vacías salen como contadores en la cabecera.

- [ ] **Step 6: Commit**

```bash
git add src/components/ZonaPersonal.tsx src/components/Board.tsx
git commit -m "feat(tablero): zona personal de altura acotada

Una linea por pedido y tope de 3 por fase. Las fases vacias dejan de reservar
una columna cada una y pasan a contadores en la cabecera: eran ~270 px para no
decir nada. El contenedor pierde la altura fija, asi que el bloque mide lo que
necesita en vez de lo que se le habia arrastrado."
```

---

### Task 4: Desplegable «+N más»

**Files:**
- Create: `src/components/FaseFlyout.tsx`
- Modify: `src/components/Board.tsx` (renderizarlo cuando `faseAbierta` no sea null)

**Interfaces:**
- Consumes: `agruparPorFase` (Task 1), `PedidoLinea` (Task 2), `faseAbierta`/`setFaseAbierta` (Task 3).
- Produces: `<FaseFlyout facets faseId onOpen onClose />`.

- [ ] **Step 1: Escribir el componente**

Crear `src/components/FaseFlyout.tsx`:

```tsx
"use client";

import { useEffect, useRef } from "react";
import type { Rol } from "@/lib/types";
import type { AccionOF } from "@/lib/acciones";
import { agruparPorFase } from "@/lib/fases-tablero";
import type { Facet } from "./PedidoCard";
import { PedidoLinea } from "./PedidoLinea";

/** Todos los pedidos de una fase, flotando sobre el tablero.
 *
 *  Flota en vez de empujar: si creciera el bloque, la página daría un salto y
 *  se perdería el alto que acabamos de ganar. Mismo comportamiento que el
 *  panel de compañero, para no tener dos formas distintas de "ver más". */
export function FaseFlyout({
  facets,
  faseId,
  onOpen,
  onClose,
  onAccion,
  onFichar,
  onDesfichar,
  completarPedido,
}: {
  facets: Facet[];
  faseId: string;
  onOpen: (f: Facet) => void;
  onClose: () => void;
  onAccion: (ofIds: string[], accion: AccionOF, obs?: string) => void;
  onFichar: (ofIds: string[], rol: Rol) => void;
  onDesfichar: (ofId: string) => void;
  completarPedido: (pedidoId: string) => void;
}) {
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (!ref.current?.contains(e.target as Node)) onClose();
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  const grupo = agruparPorFase(facets).find((g) => g.id === faseId);
  if (!grupo) return null;

  return (
    <div className="fixed inset-0 z-40 flex items-start justify-center pt-24">
      <div
        ref={ref}
        style={{ background: "var(--surface)" }}
        className="glass-pop scroll-thin max-h-[60vh] w-[min(32rem,92vw)] overflow-y-auto rounded-xl p-3"
      >
        <div className="mb-2 flex items-center gap-2">
          <span className="size-2 rounded-full" style={{ background: grupo.color }} />
          <h3 className="text-[11px] font-bold uppercase tracking-wide text-text-muted">
            {grupo.label} · {grupo.items.length}
          </h3>
          <button
            onClick={onClose}
            className="ml-auto text-[10px] font-semibold text-text-muted hover:text-text"
          >
            Cerrar · Esc
          </button>
        </div>
        <div className="flex flex-col gap-1">
          {grupo.items.map((f) => (
            <PedidoLinea
              key={f.pedido.id}
              facet={f}
              fase={grupo.id}
              onOpen={onOpen}
              onAccion={onAccion}
              onFichar={onFichar}
              onDesfichar={onDesfichar}
              completarPedido={completarPedido}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Renderizarlo desde el Board**

Añadir el import:

```tsx
import { FaseFlyout } from "./FaseFlyout";
```

Justo después del `<ZonaPersonal … />` que se puso en la Task 3, añadir:

```tsx
{faseAbierta && (
  <FaseFlyout
    facets={facetsDe(yo.id)}
    faseId={faseAbierta}
    onOpen={(f) => {
      setFaseAbierta(null);
      openFacet(f);
    }}
    onClose={() => setFaseAbierta(null)}
    onAccion={ejecutarAccion}
    onFichar={ficharOFsConAviso}
    onDesfichar={desficharOF}
    completarPedido={completarPedido}
  />
)}
```

- [ ] **Step 3: Comprobar tipos, lint y build**

Run: `npx tsc --noEmit && npx eslint src/components/FaseFlyout.tsx src/components/Board.tsx && npx next build`
Expected: sin errores; `✓ Compiled successfully`.

- [ ] **Step 4: Comprobarlo en la app**

Con el dev server abierto: asignarse pedidos hasta pasar de 3 en una fase, pulsar «+N más».
Expected: se abre el desplegable con todos, el bloque de abajo no se mueve, y se cierra con Esc y pinchando fuera.

- [ ] **Step 5: Commit**

```bash
git add src/components/FaseFlyout.tsx src/components/Board.tsx
git commit -m "feat(tablero): desplegable con todos los pedidos de una fase

El +N mas abre un panel flotante en vez de crecer el bloque: si empujara, la
pagina daria un salto y se perderia el alto ganado. Se cierra con Esc o
pinchando fuera, igual que el panel de compañero."
```

---

### Task 5: Retirar los mandos de redimensionar

Los tres sobran: la zona ya se ajusta sola. Es el motivo original del rediseño («las funcionalidades para ajustar los tamaños no me convencen»).

**Files:**
- Modify: `src/components/Board.tsx` (estado `panelTopH`, `zonaColapsada`, `superiorColapsado`, `equipoRef`, `startResize`, el `<div role="separator">` y el botón «Maximizar bandeja»)
- Modify: `src/components/Zona.tsx` (borrar si deja de usarse)

- [ ] **Step 1: Comprobar si `Zona` sigue usándose**

Run: `grep -rn "from \"./Zona\"\|<Zona" src/`
Expected: si solo aparece su propia definición, se borra el fichero en el Step 3.

- [ ] **Step 2: Quitar el estado y sus efectos**

En `src/components/Board.tsx` eliminar:
- `const [superiorColapsado, setSuperiorColapsado] = useState(false);` (línea ~118)
- `const [zonaColapsada, setZonaColapsada] = useState(false);` (línea ~120)
- `const [panelTopH, setPanelTopH] = useState…` (línea ~123) y el `useEffect` que lo guarda en `localStorage` (líneas ~135-137)
- `const equipoRef = useRef…` (línea ~132) y el `ref={equipoRef}` del div de equipo
- La función `startResize` y el `dragRef` asociado

Eliminar también el envoltorio `{!superiorColapsado && ( … )}` de las líneas ~818 y ~892, dejando su contenido tal cual.

- [ ] **Step 3: Quitar los mandos del DOM**

Eliminar el bloque `{!zonaColapsada && ( <div onMouseDown={startResize} … /> )}` (líneas ~871-891).

Eliminar el `<button onClick={() => setSuperiorColapsado(…)}>` con el texto «Maximizar bandeja» (líneas ~901-911) y, en su lugar, dejar el contador de sin asignar:

```tsx
<span className="shrink-0 text-[11px] font-semibold text-text-muted">
  {facetsDe(null).length} sin asignar
</span>
```

Si `Zona` quedó sin usos: `git rm src/components/Zona.tsx`.

- [ ] **Step 4: Comprobar que no queda nada colgando**

Run: `grep -rn "panelTopH\|zonaColapsada\|superiorColapsado\|startResize\|coordina-panel-sizes" src/`
Expected: sin resultados.

Run: `npx tsc --noEmit && npx eslint src/components && npx next build`
Expected: sin errores.

- [ ] **Step 5: Commit**

```bash
git add -A src/components
git commit -m "feat(tablero): fuera los mandos de redimensionar

El handle de contraer, el arrastre de altura y Maximizar bandeja obligaban a
ajustar a mano algo que ahora se ajusta solo. En el sitio del boton queda el
contador de sin asignar, que informa sin ocupar mas.

Con 111 partes la bandeja sigue teniendo scroll: lo que desaparece es el boton,
no la necesidad de desplazarse."
```

---

### Task 6: Fila de equipo — leyenda, barra legible y arrastre restringido

**Files:**
- Modify: `src/components/TecnicoCard.tsx:14-27` (usar el módulo de fases), `:166-182` (barra), `:215-226` (panel)
- Modify: `src/components/Board.tsx:845-847` (leyenda junto al título EQUIPO)
- Modify: `src/components/PedidosPorEstado.tsx` y `src/components/PedidoChip.tsx` (propagar `arrastrable`)

**Interfaces:**
- Consumes: `FASES`, `faseDeOF`, `arrastrableDeCompanero` (Task 1).

- [ ] **Step 1: Sustituir la definición local de fases**

En `src/components/TecnicoCard.tsx`, borrar el bloque `const FASES = […]` y la función `faseDe` (líneas 14-27) e importar del módulo:

```tsx
import { FASES, arrastrableDeCompanero, faseDeOF } from "@/lib/fases-tablero";
```

Sustituir el cálculo de `porFase` (líneas 95-98) por:

```tsx
const porFase = FASES.map((fase) => ({
  ...fase,
  n: ofs.filter((o) => faseDeOF(o) === fase.id).length,
}));
```

- [ ] **Step 2: Hacer legible la barra**

Sustituir el `<div>` de la barra (líneas 168-182) por:

```tsx
{/* Barra de carga por fase: dice EN QUÉ está cargado cada uno, no solo
    cuánto. Antes era de 1 px y al 70% de opacidad, ilegible. */}
<div
  className="mt-1.5 flex h-1.5 w-full gap-px overflow-hidden rounded-full bg-[var(--glass-highlight)]"
  title={porFase.filter((f) => f.n).map((f) => `${f.label}: ${f.n} OF`).join(" · ")}
>
  {ofs.length > 0 &&
    porFase
      .filter((f) => f.n > 0)
      .map((f) => (
        <span
          key={f.id}
          className="h-full"
          style={{ width: `${(f.n / ofs.length) * 100}%`, background: f.color }}
        />
      ))}
</div>
```

- [ ] **Step 3: Añadir la mini-leyenda**

En `src/components/Board.tsx`, sustituir el `<h2>Equipo</h2>` (líneas ~845-847) por:

```tsx
<div className="mb-1.5 flex flex-wrap items-center gap-3">
  <h2 className="text-[11px] font-semibold uppercase tracking-wide text-text-muted">
    Equipo
  </h2>
  <span className="flex flex-wrap items-center gap-2.5 text-[10px] text-text-muted">
    {FASES.map((f) => (
      <span key={f.id} className="flex items-center gap-1">
        <span className="size-1.5 rounded-sm" style={{ background: f.color }} />
        {f.label.toLowerCase()}
      </span>
    ))}
  </span>
</div>
```

Añadir el import `import { FASES } from "@/lib/fases-tablero";` si no está ya.

- [ ] **Step 4: Migrar `PedidosPorEstado` y `PedidoChip` a las fases nuevas**

`PedidosPorEstado` sigue definiendo su propio tipo y sus propios grupos, y `PedidoChip` compara contra los nombres viejos en seis sitios. Si no se migran, `bucket={g.id}` deja de tipar en cuanto los ids cambian.

En `src/components/PedidosPorEstado.tsx`: borrar `type Bucket`, la constante `GRUPOS` y la función `bucketDe` (líneas 8-40) y sustituir el cálculo de `grupos` (líneas 72-75) por:

```tsx
const grupos = agruparPorFase(facets);
```

con el import `import { agruparPorFase } from "@/lib/fases-tablero";`.

En `src/components/PedidoChip.tsx`, cambiar el tipo de la prop (línea 42) por:

```tsx
  bucket?: Fase;
```

con `import type { Fase } from "@/lib/fases-tablero";`, y actualizar las seis comparaciones:
- línea 89: `bucket === "revision"` → `bucket === "esperandoRevision"`
- líneas 97-101: `bucket === "revision"` → `bucket === "esperandoRevision"` y `bucket === "finalizado"` → `bucket === "listoParaPasar"`
- línea 291: `bucket === "revision"` → `bucket === "esperandoRevision"`
- línea 327: `bucket === "finalizado"` → `bucket === "listoParaPasar"`

Comprobar que no queda ninguno: `grep -n '"revision"\|"finalizado"' src/components/PedidoChip.tsx` debe salir vacío.

- [ ] **Step 5: Restringir el arrastre en el panel de compañero**

En `src/components/PedidosPorEstado.tsx`, añadir la prop y pasarla a cada chip:

```tsx
  /** Decide si un pedido concreto se puede arrastrar. Por defecto, todos. */
  arrastrable = () => true,
```

en la lista de props desestructuradas, con su tipo:

```tsx
  arrastrable?: (f: Facet) => boolean;
```

y en **las dos** llamadas a `<PedidoChip …>` (layout "list" y layout "grid") añadir:

```tsx
  arrastrable={arrastrable(f)}
```

En `src/components/PedidoChip.tsx`, añadir la prop:

```tsx
  arrastrable = true,
```

con tipo:

```tsx
  /** false = con candado: el pedido no se puede quitar a quien lo tiene. */
  arrastrable?: boolean;
```

y pasarla a dnd-kit en la línea 105:

```tsx
const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
  id: facet.pedido.id,
  disabled: !arrastrable,
});
```

(mantener el resto de opciones que ya tuviera esa llamada).

En `src/components/TecnicoCard.tsx`, en el `<PedidosPorEstado …>` del panel flotante (líneas ~215-226), añadir:

```tsx
arrastrable={arrastrableDeCompanero}
```

- [ ] **Step 6: Comprobar**

Run: `npx vitest run && npx tsc --noEmit && npx eslint src/components && npx next build`
Expected: 152 tests en verde (los 132 de antes + los 20 de la Task 1), sin errores, build correcto.

En la app: abrir un compañero con pedidos ya empezados.
Expected: los de «Sin empezar» se arrastran; los que tienen tiempo fichado, no.

- [ ] **Step 7: Commit**

```bash
git add src/components/TecnicoCard.tsx src/components/Board.tsx src/components/PedidosPorEstado.tsx src/components/PedidoChip.tsx
git commit -m "feat(tablero): barra de equipo legible y arrastre restringido

La barra pasa de 1 px al 70% de opacidad a 1,5 px opaca, y con la leyenda al
lado del titulo dice en que fase esta cargado cada uno, no solo cuanto.

Del panel de un compañero solo se arrastra lo que no ha empezado: mover un
pedido con tiempo ya fichado dejaria las horas a nombre de uno y el trabajo a
nombre de otro."
```

---

### Task 7: Cliente en las miniaturas de la bandeja

Con 111 partes, el código solo no basta para repartir.

**Files:**
- Modify: `src/components/PedidoCard.tsx` (bloque de la miniatura, alrededor de la línea 74)

- [ ] **Step 1: Añadir el cliente bajo el código**

En `src/components/PedidoCard.tsx`, localizar el elemento que pinta el código del pedido bajo `<PedidoScan pedido={pedido} />` y añadir justo debajo:

```tsx
<span className="block truncate text-[9px] leading-tight text-text-muted" title={pedido.cliente}>
  {pedido.cliente}
</span>
```

- [ ] **Step 2: Comprobar**

Run: `npx tsc --noEmit && npx eslint src/components/PedidoCard.tsx && npx next build`
Expected: sin errores.

En la app: la bandeja muestra código y cliente bajo cada miniatura, sin que la tarjeta crezca de ancho.

- [ ] **Step 3: Commit**

```bash
git add src/components/PedidoCard.tsx
git commit -m "feat(bandeja): cliente bajo el codigo de cada parte

Con 111 partes sin asignar, el codigo solo no basta para decidir a quien va."
```

---

## Verificación final

- [ ] `npx vitest run` → 152 tests en verde.
- [ ] `npx tsc --noEmit` → sin salida.
- [ ] `npx eslint src` → solo los 3 avisos preexistentes de `src/components/` (`PedidoCard.tsx` variable sin usar y `set-state-in-effect`), ninguno nuevo.
- [ ] `npx next build` → `✓ Compiled successfully`.
- [ ] Medir en el navegador el alto real de la zona personal con 5 pedidos. El diseño estima ~150 px frente a ~400; si sale muy por encima, ajustar `TOPE` o el padding antes de dar por buena la tarea.

## Lo que queda para el segundo plan

Secciones 5 y 6 del diseño, que son semántica y no estructura:

- Elección de revisor al pasar a revisión, con los compañeros ordenados por carga y sin el autor en la lista.
- Notificación al revisor.
- Pestaña Revisión por defecto con lo mío como revisor, más el interruptor «Todo el equipo».
- Contadores de cabecera pasando a contar lo mío.

También queda fuera de este plan el hover de la bandeja con miniatura ampliada y «Cogerlo yo»: depende de decidir antes qué hace el clic sobre un parte, que es parte del segundo diseño (flujo de fichaje y botones).
