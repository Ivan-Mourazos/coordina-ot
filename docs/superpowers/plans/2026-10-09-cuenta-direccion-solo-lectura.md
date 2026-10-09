# Cuenta de Dirección (solo lectura) — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Carlos y Esteban entran con su PIN y ven toda la web del equipo sin poder escribir; Iván puede mirarla igual con un interruptor.

**Architecture:** Rol de acceso nuevo `direccion`. Solo lectura = la sesión no tiene `tecnico`, o lo tiene pero el interruptor «Ver como Dirección» está encendido. El servidor ya rechaza escrituras sin `tecnico` (403); la pantalla lee un contexto de React (`useSoloLectura()`) para no pintar ningún control que escriba. El tablero deja de suponer que quien entra es un operario: para un espectador construye un `Operario` sin sección ni columna.

**Tech Stack:** Next.js 16 (leer `node_modules/next/dist/docs/` ante dudas de API, ver AGENTS.md), React 19, TypeScript, better-sqlite3, Vitest 4, pnpm. Tailwind: las clases tienen que aparecer como literales.

**Spec:** `docs/superpowers/specs/2026-10-09-cuenta-direccion-solo-lectura-design.md`

## Global Constraints

- Rol nuevo: `"direccion"`, acumulable con `"tecnico"` y `"supervisor"`.
- Solo lectura = sin `tecnico`, o con `tecnico` + `direccion` y el interruptor encendido.
- Carlos (`carlos`) y Esteban (`esteban`): `supervisor` → `direccion`, `activo = 1`. Cris (`cris`) no cambia.
- Iván (`ivan`): se le AÑADE `direccion`; conserva `tecnico` y `supervisor`.
- La migración es la **11**, nombre `cuentas_de_direccion`, repetible y sin tocar `pin_hash`.
- Interruptor en el navegador: clave `coordina-ver-como-direccion`, valor `"1"` = encendido. Acceso a `localStorage` siempre en `try/catch`.
- Sin cambios de permisos en el servidor.
- Con `COORDINA_LOGIN` apagado la web no cambia.
- Comentarios en castellano, en el tono del fichero que se toca. Colores de estado y rol solo desde `ESTADO`/`ROL` (`src/lib/estado.ts`).
- **Ningún commit de este plan lleva línea `Novedad:`**: los técnicos no notan nada.
- Cada commit termina con `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Mapa de ficheros

| Fichero | Qué cambia |
|---|---|
| `src/lib/personas.ts` | `RolAcceso` admite `direccion`; `esSoloLectura`, `puedeVerComoDireccion` |
| `src/lib/server/estado-db.ts` | Migración 11 |
| `src/components/SoloLectura.tsx` (nuevo) | Contexto y hook |
| `src/components/Board.tsx` | Proveedor, espectador, efectos personales, zona, reloj |
| `src/components/Herramientas.tsx` | Interruptor «Ver como Dirección» |
| `src/components/LoginGate.tsx` | Grupo «Dirección» en la rejilla |
| `src/components/{Drawer,PedidoLinea,PedidoCard,LineaRevisar,RevisionView,NotasPedido,FasesSinFinalizar,AvisoParteNuevo,RecuperarPedido}.tsx` | No pintan controles de escribir en solo lectura |
| `src/lib/__tests__/personas-roles.test.ts` (nuevo) | Reglas de solo lectura |
| `src/lib/__tests__/migracion-direccion.test.ts` (nuevo) | Migración 11 |
| `src/lib/__tests__/api-direccion.test.ts` (nuevo) | 403/200 con sesión de Dirección |
| `src/lib/__tests__/migracion-supervisor.test.ts` | `user_version` esperado 10 → 11 |

---

### Task 1: El rol `direccion` y la regla de solo lectura

**Files:**
- Modify: `src/lib/personas.ts:12-20`
- Test: `src/lib/__tests__/personas-roles.test.ts` (nuevo)

**Interfaces:**
- Produces: `type RolAcceso = "tecnico" | "supervisor" | "direccion"`; `esSoloLectura(roles: readonly RolAcceso[], verComoDireccion: boolean): boolean`; `puedeVerComoDireccion(roles: readonly RolAcceso[]): boolean`.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import { esRolAcceso, esSoloLectura, puedeVerComoDireccion } from "../personas";

describe("roles de acceso", () => {
  it("direccion es un rol válido", () => {
    expect(esRolAcceso("direccion")).toBe(true);
    expect(esRolAcceso("jefe")).toBe(false);
  });

  it("sin tecnico es solo lectura, haya interruptor o no", () => {
    expect(esSoloLectura(["direccion"], false)).toBe(true);
    expect(esSoloLectura([], false)).toBe(true);
    expect(esSoloLectura(["supervisor"], false)).toBe(true);
  });

  it("un técnico escribe salvo que tenga direccion y el interruptor puesto", () => {
    expect(esSoloLectura(["tecnico"], false)).toBe(false);
    expect(esSoloLectura(["tecnico"], true)).toBe(false);
    expect(esSoloLectura(["tecnico", "supervisor", "direccion"], false)).toBe(false);
    expect(esSoloLectura(["tecnico", "supervisor", "direccion"], true)).toBe(true);
  });

  it("el interruptor solo existe para quien tiene tecnico y direccion", () => {
    expect(puedeVerComoDireccion(["tecnico", "direccion"])).toBe(true);
    expect(puedeVerComoDireccion(["direccion"])).toBe(false);
    expect(puedeVerComoDireccion(["tecnico", "supervisor"])).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/lib/__tests__/personas-roles.test.ts`
Expected: FAIL — `esSoloLectura is not a function`.

- [ ] **Step 3: Implementation** — sustituir el bloque de `RolAcceso` (líneas 12-20) por:

```ts
/** Roles ACUMULABLES, no uno por persona: Ángel revisa Y supervisa, así que
 *  lleva los dos. De ahí que una persona tenga una lista y no un valor.
 *
 *  · `tecnico`: trabaja — plantea, revisa, ficha, escribe notas.
 *  · `supervisor`: resetea el PIN de otro. Nada más.
 *  · `direccion`: entra y lo ve todo, sin escribir. Separado de `supervisor`
 *    a propósito: mirar todo no es arreglar cuentas, y un PIN reseteado por
 *    error deja a un técnico fuera. */
export type RolAcceso = "tecnico" | "supervisor" | "direccion";

export const ROLES_ACCESO: readonly RolAcceso[] = ["tecnico", "supervisor", "direccion"];

export function esRolAcceso(v: unknown): v is RolAcceso {
  return v === "tecnico" || v === "supervisor" || v === "direccion";
}

/** ¿Se pinta la web sin controles de escribir? Sin `tecnico`, siempre: el
 *  servidor ya le contesta 403 a cualquier escritura. Con `tecnico`, solo si
 *  además tiene `direccion` y ha encendido «Ver como Dirección», que es para
 *  mirar lo que ven ellos sin cambiar de cuenta — su cuenta sigue pudiendo
 *  escribir en el servidor. */
export function esSoloLectura(roles: readonly RolAcceso[], verComoDireccion: boolean): boolean {
  if (!roles.includes("tecnico")) return true;
  return verComoDireccion && roles.includes("direccion");
}

/** Quién ve el interruptor «Ver como Dirección»: quien puede trabajar Y mirar
 *  como Dirección. Hoy solo Iván, mientras se desarrolla. */
export function puedeVerComoDireccion(roles: readonly RolAcceso[]): boolean {
  return roles.includes("tecnico") && roles.includes("direccion");
}
```

- [ ] **Step 4: Run tests**

Run: `pnpm vitest run src/lib/__tests__/personas-roles.test.ts src/lib/__tests__/personas-db.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/personas.ts src/lib/__tests__/personas-roles.test.ts
git commit -m "feat(personas): rol de acceso «direccion» y regla de solo lectura"
```

---

### Task 2: Migración 11 — cuentas de Dirección

**Files:**
- Modify: `src/lib/server/estado-db.ts` (lista `MIGRACIONES`, tras la versión 10; función nueva tras `rolesDeSupervisor`)
- Modify: `src/lib/__tests__/migracion-supervisor.test.ts:70,109` (`toBe(10)` → `toBe(11)`)
- Test: `src/lib/__tests__/migracion-direccion.test.ts` (nuevo)

**Interfaces:**
- Consumes: tabla `persona(id, nombre, pin_hash, roles, seccion, activo)`, roles separados por comas.

- [ ] **Step 1: Write the failing test** — `src/lib/__tests__/migracion-direccion.test.ts`

```ts
import Database from "better-sqlite3";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, expect, test, vi } from "vitest";

// ─── La migración 11 sobre una base como la de producción ────────────────────
// Igual que la 9: producción ya pasó la siembra de personas, así que hay que
// probar sobre una base sellada en la 10 y con las filas puestas.

let dir: string;
let ruta: string;
let estado: typeof import("../server/estado-db");

function baseComoProduccion(): void {
  const db = new Database(ruta);
  db.exec(`CREATE TABLE persona (
    id       TEXT PRIMARY KEY,
    nombre   TEXT NOT NULL,
    pin_hash TEXT,
    roles    TEXT NOT NULL,
    seccion  TEXT,
    activo   INTEGER NOT NULL DEFAULT 1
  )`);
  const ins = db.prepare(
    `INSERT INTO persona (id, nombre, pin_hash, roles, seccion, activo) VALUES (?, ?, ?, ?, ?, ?)`,
  );
  ins.run("ivan", "Iván", "hash-ivan", "tecnico,supervisor", "ot", 1);
  ins.run("jaime", "Jaime", null, "tecnico", "ot", 1);
  ins.run("cris", "Cris", null, "supervisor", null, 0);
  ins.run("carlos", "Carlos", null, "supervisor", null, 0);
  ins.run("esteban", "Esteban", "hash-esteban", "supervisor", null, 0);
  db.pragma("user_version = 10");
  db.close();
}

const fila = (id: string) =>
  estado.getDb().prepare("SELECT roles, activo, pin_hash FROM persona WHERE id = ?").get(id) as {
    roles: string;
    activo: number;
    pin_hash: string | null;
  };

beforeAll(async () => {
  dir = mkdtempSync(path.join(tmpdir(), "coordina-direccion-"));
  ruta = path.join(dir, "test.db");
  process.env.COORDINA_DB_PATH = ruta;
  baseComoProduccion();
  estado = await import("../server/estado-db");
  estado.getDb();
});

afterAll(() => {
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {
    // Windows mantiene abierto el handle del WAL; limpieza best effort.
  }
});

test("Carlos y Esteban pasan a Dirección, activos y sin supervisor", () => {
  expect(fila("carlos")).toMatchObject({ roles: "direccion", activo: 1 });
  expect(fila("esteban")).toMatchObject({ roles: "direccion", activo: 1 });
  expect(estado.getDb().pragma("user_version", { simple: true })).toBe(11);
});

test("Iván gana direccion sin perder nada; Cris y Jaime no cambian", () => {
  expect(fila("ivan").roles).toBe("tecnico,supervisor,direccion");
  expect(fila("cris")).toMatchObject({ roles: "supervisor", activo: 0 });
  expect(fila("jaime").roles).toBe("tecnico");
});

test("no toca los PIN", () => {
  expect(fila("ivan").pin_hash).toBe("hash-ivan");
  expect(fila("esteban").pin_hash).toBe("hash-esteban");
});

test("pasarla dos veces deja lo mismo", () => {
  estado.getDb().pragma("user_version = 10");
  delete (globalThis as { __coordinaDb?: unknown }).__coordinaDb;
  vi.resetModules();
  return import("../server/estado-db").then((otra) => {
    otra.getDb();
    const roles = (id: string) =>
      (otra.getDb().prepare("SELECT roles FROM persona WHERE id = ?").get(id) as { roles: string }).roles;
    expect(roles("ivan")).toBe("tecnico,supervisor,direccion");
    expect(roles("carlos")).toBe("direccion");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/lib/__tests__/migracion-direccion.test.ts`
Expected: FAIL — `user_version` sigue en 10 y Carlos con `supervisor`.

- [ ] **Step 3: Implementation** — en `MIGRACIONES`, detrás de la entrada `version: 10`:

```ts
  // Carlos y Esteban entran a verlo todo sin escribir (rol `direccion`, ver
  // lib/personas.ts). Se sembraron en la 7 como supervisores desactivados;
  // aquí se les cambia el rol y se activan. Iván gana `direccion` además de lo
  // suyo para poder mirar la web como ellos mientras se desarrolla — cuando
  // den el visto bueno, otra migración se lo quita. Cris no cambia.
  { version: 11, nombre: "cuentas_de_direccion", aplicar: cuentasDeDireccion },
```

Y la función, detrás de `rolesDeSupervisor`:

```ts
/** Activa las cuentas de Dirección y le da el rol a Iván.
 *
 *  Se puede repetir sin estropear nada: a Carlos y Esteban se les deja la
 *  lista en `direccion` (que es lo único que deben tener), y a Iván solo se le
 *  AÑADE el rol si le falta, como hace `rolesDeSupervisor`. Ni una ni otra
 *  tocan `pin_hash`: un PIN ya elegido sigue valiendo. Una fila que no existe
 *  se salta. */
function cuentasDeDireccion(db: Database.Database): void {
  const leer = db.prepare("SELECT roles FROM persona WHERE id = ?");
  const activar = db.prepare("UPDATE persona SET roles = 'direccion', activo = 1 WHERE id = ?");
  const guardar = db.prepare("UPDATE persona SET roles = ? WHERE id = ?");
  for (const id of ["carlos", "esteban"]) {
    if (leer.get(id)) activar.run(id);
  }
  const ivan = leer.get("ivan") as { roles: string } | undefined;
  if (ivan) {
    const roles = ivan.roles.split(",").map((r) => r.trim()).filter(Boolean);
    if (!roles.includes("direccion")) {
      roles.push("direccion");
      guardar.run(roles.join(","), "ivan");
    }
  }
}
```

- [ ] **Step 4: Ajustar el test de la migración 9** — en `src/lib/__tests__/migracion-supervisor.test.ts`, las dos líneas `toBe(10)` pasan a `toBe(11)` (el propio test explica que el número sube con cada migración).

- [ ] **Step 5: Run tests**

Run: `pnpm vitest run src/lib/__tests__/migracion-direccion.test.ts src/lib/__tests__/migracion-supervisor.test.ts src/lib/__tests__/personas-db.test.ts src/lib/__tests__/estado-db.test.ts`
Expected: PASS. Si `personas-db.test.ts` contaba a Carlos/Esteban como inactivos, ajustar SOLO esa expectativa y anotar el porqué en el mensaje del commit.

- [ ] **Step 6: Commit**

```bash
git add src/lib/server/estado-db.ts src/lib/__tests__/migracion-direccion.test.ts src/lib/__tests__/migracion-supervisor.test.ts
git commit -m "feat(personas): migración 11, Carlos y Esteban entran como Dirección"
```

---

### Task 3: El servidor ya cierra la escritura a Dirección — demostrarlo

**Files:**
- Test: `src/lib/__tests__/api-direccion.test.ts` (nuevo)

No cambia código de producción. Si algún test sale distinto de lo esperado, es un agujero: parar y avisar, no ajustar el test.

- [ ] **Step 1: Write the test**

```ts
import { afterAll, beforeAll, expect, test } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

// Dirección lo ve todo y no escribe nada. La pantalla esconde los botones,
// pero quien lo garantiza es el servidor: toda escritura pide `tecnico`.

let dir: string;
let s: typeof import("../server/sesion");
let estado: typeof import("../../app/api/estado/route");
let fichaje: typeof import("../../app/api/fichaje/route");
let notas: typeof import("../../app/api/notas/route");
let causas: typeof import("../../app/api/causas/route");
let db: typeof import("../server/estado-db");

beforeAll(async () => {
  dir = mkdtempSync(path.join(tmpdir(), "coordina-direccion-api-"));
  process.env.COORDINA_DB_PATH = path.join(dir, "test.db");
  process.env.COORDINA_SESION_SECRET = "secreto-de-pruebas";
  process.env.COORDINA_LOGIN = "activo";
  s = await import("../server/sesion");
  estado = await import("../../app/api/estado/route");
  fichaje = await import("../../app/api/fichaje/route");
  notas = await import("../../app/api/notas/route");
  causas = await import("../../app/api/causas/route");
  db = await import("../server/estado-db");
  db.getDb(); // base nueva: siembra (7) + migración 11 → Carlos activo con `direccion`
});

afterAll(() => {
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {
    // Windows mantiene abierto el handle del WAL; limpieza best effort.
  }
});

const carlos = () => ({ cookie: `${s.COOKIE}=${s.firmarSesion("carlos")}` });

const peticion = (url: string, method: string, body?: unknown) =>
  new Request(url, {
    method,
    headers: carlos(),
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });

test("la sesión de Carlos es válida y es de Dirección", () => {
  const yo = s.quienEs(new Request("http://x/", { headers: carlos() }));
  expect(yo?.roles).toEqual(["direccion"]);
});

test("cambiar el estado de una OF: 403", async () => {
  const res = await estado.POST(
    peticion("http://x/api/estado", "POST", {
      motivo: "aprobar",
      cambiosOF: [
        { ofId: "of-dir-1", autorId: "alberto", revisorId: "tamara", estado: "aprobada", observacion: null },
      ],
    }),
  );
  expect(res.status).toBe(403);
});

test("fichar: 403", async () => {
  const res = await fichaje.POST(peticion("http://x/api/fichaje", "POST", { ofIds: ["of-dir-1"], rol: "plantear" }));
  expect(res.status).toBe(403);
});

test("escribir una nota: 403", async () => {
  const res = await notas.POST(peticion("http://x/api/notas", "POST", { pedido: "AR.26.00001", texto: "hola" }));
  expect(res.status).toBe(403);
});

test("leer notas y causas: 200", async () => {
  const n = await notas.GET(peticion("http://x/api/notas?pedido=AR.26.00001", "GET"));
  expect(n.status).toBe(200);
  const c = await causas.GET(peticion("http://x/api/causas", "GET"));
  expect(c.status).toBe(200);
});
```

- [ ] **Step 2: Run**

Run: `pnpm vitest run src/lib/__tests__/api-direccion.test.ts`
Expected: PASS (5 tests). Si `quienEs` devuelve null, revisar que la base del test pasó la migración 11 (Carlos `activo = 1`).

- [ ] **Step 3: Commit**

```bash
git add src/lib/__tests__/api-direccion.test.ts
git commit -m "test(api): una sesión de Dirección lee y no escribe"
```

---

### Task 4: Contexto de solo lectura, espectador en el tablero e interruptor

**Files:**
- Create: `src/components/SoloLectura.tsx`
- Modify: `src/components/Board.tsx`
- Modify: `src/components/Herramientas.tsx`

**Interfaces:**
- Consumes: `esSoloLectura`, `puedeVerComoDireccion` (Task 1). `sesion: Yo | null | undefined` ya existe en Board (`Yo = { id, nombre, roles }`, de `LoginGate.tsx`).
- Produces: `SoloLecturaProvider` (`Context.Provider<boolean>`), `useSoloLectura(): boolean`. Herramientas recibe `verComoDireccion?: { activo: boolean; onCambiar: (v: boolean) => void }`.

- [ ] **Step 1: Crear `src/components/SoloLectura.tsx`**

```tsx
"use client";

import { createContext, useContext } from "react";

// ─── Solo lectura ────────────────────────────────────────────────────────────
// Lo enciende el tablero para Dirección (y para quien mira «como Dirección»).
// Cada control que escribe lo pregunta y no se pinta. Contexto y no prop: los
// botones viven diez niveles por debajo de Board.
//
// Es PRESENTACIÓN, no seguridad: quien cierra la escritura es el servidor
// (toda escritura pide rol `tecnico`). Un botón que se escape da un 403.

const SoloLectura = createContext(false);

export const SoloLecturaProvider = SoloLectura.Provider;

export function useSoloLectura(): boolean {
  return useContext(SoloLectura);
}
```

- [ ] **Step 2: Board — estado del interruptor y solo lectura.** Junto al estado `sesion` (≈ línea 305), añadir:

```tsx
  // «Ver como Dirección»: solo para quien tiene `tecnico` y `direccion` (hoy,
  // Iván). Se recuerda en el navegador; ver lib/personas.ts.
  const [verComoDireccion, setVerComoDireccion] = useState<boolean>(() => {
    try {
      return localStorage.getItem("coordina-ver-como-direccion") === "1";
    } catch {
      return false;
    }
  });
  const cambiarVerComoDireccion = (v: boolean) => {
    setVerComoDireccion(v);
    try {
      if (v) localStorage.setItem("coordina-ver-como-direccion", "1");
      else localStorage.removeItem("coordina-ver-como-direccion");
    } catch {
      // Sin almacenamiento funciona igual; solo no se recuerda.
    }
  };
  // Apagado no hay sesión ni roles: nadie es de solo lectura.
  const soloLectura = loginActivo && !!sesion && esSoloLectura(sesion.roles, verComoDireccion);
  // Un ESPECTADOR no tiene sitio en el tablero (Carlos, Esteban). Iván mirando
  // como Dirección sí lo tiene, pero se le trata igual para ver lo mismo.
  const espectador = soloLectura;
```

Importar `esSoloLectura, puedeVerComoDireccion` de `@/lib/personas` y `SoloLecturaProvider` de `./SoloLectura`. Si `useState` con `localStorage` diera aviso de hidratación, no pasa: Board solo pinta tras montar (`useHydrated`).

- [ ] **Step 3: Board — `yo` para el espectador.** Sustituir:

```tsx
  const yo = (TODOS_LOS_OPERARIOS.find((o) => o.id === miId) ??
    operarios.find((o) => o.id === miId)) as Operario;
```

por:

```tsx
  // Dirección no está en la lista de operarios: no planta toldos. Se le hace
  // un Operario de paso, sin sección (cae en la de siempre) y en gris, para
  // que lo que solo necesita nombre e id no tenga que preguntar quién es.
  const yo = (TODOS_LOS_OPERARIOS.find((o) => o.id === miId) ??
    operarios.find((o) => o.id === miId) ?? {
      id: miId,
      nombre: sesion?.nombre ?? miId,
      iniciales: (sesion?.nombre ?? miId).slice(0, 2).toUpperCase(),
      color: "#5a6472",
    }) as Operario;
```

- [ ] **Step 4: Board — nada personal para el espectador.**
  1. Efecto de avisos (`fetch(\`/api/avisos?operarioId=…\`)`, ≈ línea 456): cambiar `if (!miId) return;` por `if (!miId || espectador) return;` y añadir `espectador` a sus dependencias. (La ruta pide `tecnico`: Carlos recibiría 403.)
  2. Efecto de carga del fichaje (`fetch(\`/api/fichaje?operarioId=…\`)`, ≈ línea 1607): mismo cambio, misma razón.
  3. `notifItems`: `if (!miId) return [];` → `if (!miId || espectador) return [];` y `espectador` en dependencias.
  4. `equipo` (useMemo de «Libres»): sustituir las dos apariciones de `o.id !== miId` por `o.id !== (espectador ? null : miId)` y añadir `espectador` a dependencias, para que Iván mirando como Dirección salga en el Equipo como uno más.
  5. Vista Asignar: envolver el `<main>` de `<ZonaPersonal …/>` y el `{faseAbierta && (<FaseFlyout …/>)}` en `{!espectador && ( … )}`.
  6. `<MiFichaje …/>` (≈ línea 2711): envolver en `{!espectador && ( … )}`.

- [ ] **Step 5: Board — proveedor y marca.** Envolver TODO el JSX que devuelve el tablero ya identificado (el `return (` final, el que contiene el `<header>`) con `<SoloLecturaProvider value={soloLectura}> … </SoloLecturaProvider>`. En el `<header>`, justo antes de `<Herramientas`, añadir:

```tsx
            {soloLectura && (
              <span
                className="glass-chip rounded-full px-2.5 py-0.5 text-[11px] font-semibold text-text-muted"
                title="Esta cuenta ve toda la web, pero no puede cambiar nada."
              >
                Solo lectura
              </span>
            )}
```

Y pasar a `<Herramientas>`:

```tsx
              verComoDireccion={
                sesion && puedeVerComoDireccion(sesion.roles)
                  ? { activo: verComoDireccion, onCambiar: cambiarVerComoDireccion }
                  : undefined
              }
```

- [ ] **Step 6: Herramientas — el interruptor.** Añadir la prop `verComoDireccion?: { activo: boolean; onCambiar: (v: boolean) => void };` (con su JSDoc: «Solo para quien tiene técnico y dirección. Cambia lo que se pinta, no lo que puede hacer la cuenta.»). Pintarlo junto a `{loginActivo && roles.includes("supervisor") && <ResetPin />}`:

```tsx
          {verComoDireccion && (
            <label className="flex cursor-pointer items-center justify-between gap-3 rounded-lg px-2 py-1.5 text-xs text-text hover:bg-[var(--glass-highlight)]">
              <span>
                <span className="block font-semibold">Ver como Dirección</span>
                <span className="block text-[11px] text-text-muted">La web sin botones de escribir, como la ven Carlos y Esteban</span>
              </span>
              <input
                type="checkbox"
                checked={verComoDireccion.activo}
                onChange={(e) => verComoDireccion.onCambiar(e.target.checked)}
                className="size-4 accent-brand-500"
              />
            </label>
          )}
```

- [ ] **Step 7: Typecheck y tests**

Run: `npx tsc --noEmit -p . 2>&1 | grep "^src"` → sin salida.
Run: `pnpm vitest run` → todo PASS.

- [ ] **Step 8: Commit**

```bash
git add src/components/SoloLectura.tsx src/components/Board.tsx src/components/Herramientas.tsx
git commit -m "feat(direccion): el tablero sabe pintarse en solo lectura y sin columna propia"
```

---

### Task 5: Ningún control de escribir en solo lectura

**Files:** los de la tabla. En cada uno: `import { useSoloLectura } from "./SoloLectura";` y `const soloLectura = useSoloLectura();` al principio del componente que se cita. Las anclas son texto literal del fichero: buscarlas, no fiarse de números de línea.

- [ ] **Step 1: `Drawer.tsx`, componente `Drawer`**
  - `{listoParaCompletar && (` → `{!soloLectura && listoParaCompletar && (`
  - La fila de botones del pedido: `<div className="mb-2 flex flex-wrap items-center justify-end gap-1.5 empty:hidden">` → envolver ese `<div>…</div>` completo en `{!soloLectura && ( … )}`. Igual con el `{avisoPausarPrimero && (` que va detrás → `{!soloLectura && avisoPausarPrimero && (`.
  - `{miasParaRevisar.length > 0 && (` (GuiaRevision) → `{!soloLectura && miasParaRevisar.length > 0 && (`
  - `{paraDevolver.length >= minimoDelBloque && (` → `{!soloLectura && paraDevolver.length >= minimoDelBloque && (`
  - `{pidiendoRevisorPedido && (` → `{!soloLectura && pidiendoRevisorPedido && (`
  - Donde se pinta `<ReintentarGemelaInline`: anteponer `!soloLectura &&` a la condición que lo envuelve.
- [ ] **Step 2: `Drawer.tsx`, componente `OFRow`** — `<AccionesOF` (bajo el comentario `{/* acciones según estado: …`) → envolver en `{!soloLectura && ( … )}`. `useSoloLectura()` va dentro de `OFRow`.
- [ ] **Step 3: `PedidoLinea.tsx`** — el bloque que contiene `onClick={() => onDesficharVarias(`, `onClick={() => onFichar(fichables` y `onClick={() => completarPedido(` no se pinta: anteponer `!soloLectura &&` a la condición de cada uno de los tres. El botón de coger (`{onCoger ? (`) → `{onCoger && !soloLectura ? (`.
- [ ] **Step 4: `PedidoCard.tsx`** — `onAsignar && (` dentro de `accion={` → `!soloLectura && onAsignar && (`.
- [ ] **Step 5: `LineaRevisar.tsx`** — los tres botones (`onDesficharVarias`, `onEmpezar`, `onFichar(reanudables`) → anteponer `!soloLectura &&` a su condición.
- [ ] **Step 6: `RevisionView.tsx`** — `const puedo = (accion: AccionOF) =>` → añadir `!soloLectura &&` al principio de la expresión. `{selectorRevisor}` → `{!soloLectura && selectorRevisor}`.
- [ ] **Step 7: `NotasPedido.tsx`** — el botón con `onClick={() => setEscribiendo(true)}` y los de editar (`setEditando`) y borrar (`setBorrando`) → `{!soloLectura && ( … )}`. Las notas se siguen leyendo.
- [ ] **Step 8: `FasesSinFinalizar.tsx`** — el botón con `onClick={() => setConfirmar(f)}` → `{!soloLectura && ( … )}`.
- [ ] **Step 9: `AvisoParteNuevo.tsx`** — el botón con `onClick={() => void marcar()}` → `{!soloLectura && ( … )}`. El aviso se sigue viendo.
- [ ] **Step 10: `RecuperarPedido.tsx`** — `return (` del componente: si `soloLectura`, `return null;` antes.
- [ ] **Step 11: Typecheck, lint y tests**

Run: `npx tsc --noEmit -p . 2>&1 | grep "^src"` → sin salida. `pnpm lint` → sin errores nuevos. `pnpm vitest run` → PASS.

- [ ] **Step 12: Commit**

```bash
git add src/components/Drawer.tsx src/components/PedidoLinea.tsx src/components/PedidoCard.tsx src/components/LineaRevisar.tsx src/components/RevisionView.tsx src/components/NotasPedido.tsx src/components/FasesSinFinalizar.tsx src/components/AvisoParteNuevo.tsx src/components/RecuperarPedido.tsx
git commit -m "feat(direccion): en solo lectura no se pinta ningún control de escribir"
```

---

### Task 6: Entrar como Dirección

**Files:**
- Modify: `src/components/LoginGate.tsx` (función `Rejilla`)

- [ ] **Step 1:** Sustituir el comentario que empieza `// La spec preveía un enlace discreto` (hasta `// activen, junto a lo que van a mirar.`) por:

```tsx
  // Dirección (Carlos, Esteban) entra por la misma rejilla, en su grupo y
  // debajo de las secciones: no son caras del tablero, pero tampoco hace falta
  // otra pantalla para cuatro dígitos. Quien tenga `tecnico` sale arriba, en
  // su sección, aunque también tenga `direccion` (Iván).
```

y tras `const tecnicos = …` añadir:

```tsx
  const direccion = personas.filter((p) => p.roles.includes("direccion") && !p.roles.includes("tecnico"));
```

- [ ] **Step 2:** Detrás del `{agrupar(tecnicos).map(…)}`, dentro del mismo `<div className="flex flex-col gap-5">`, pintar el grupo con el MISMO marcado que una sección (copiar la `<section>` de dentro del map: `h2` con el rótulo, rejilla `grid grid-cols-2 gap-3 sm:grid-cols-3` y los botones de cara con `pinta(p)`), con rótulo `Dirección` y la lista `direccion`, solo si `direccion.length > 0`. Para no duplicar el botón de cara, extraerlo antes a una función local `Cara({ p, onElegir })` en el mismo fichero y usarla en los dos sitios.
- [ ] **Step 3: Typecheck y tests** — `npx tsc --noEmit -p . 2>&1 | grep "^src"` vacío; `pnpm vitest run src/lib/__tests__/api-sesion.test.ts` PASS.
- [ ] **Step 4: Commit**

```bash
git add src/components/LoginGate.tsx
git commit -m "feat(login): Dirección entra por la rejilla, en su propio grupo"
```

---

### Task 7: Recorrido real y cierre

**Files:** ninguno de código, salvo lo que el recorrido destape.

- [ ] **Step 1:** Base de desarrollo migrada: arrancar `pnpm dev` con `COORDINA_LOGIN=activo` y `COORDINA_SESION_SECRET` en `.env.local` (ver `docs/despliegue-login.md`). Comprobar en el log que no hay errores de migración.
- [ ] **Step 2: Como Carlos** (Playwright contra `http://localhost:3000`): en `/entrar` sale el grupo «Dirección» con Carlos y Esteban y sin Cris; elegir PIN de prueba; dentro, recorrer Panel, Pendientes, Revisiones, Visitas, Historial y Métricas; cambiar a Diseño Gráfico desde Herramientas; abrir la ficha de un pedido con notas. Comprobar con `browser_evaluate` que no hay botones con texto `Plantear`, `Fichar`, `Pausar`, `Aprobar`, `Devolver`, `Pasar a Producción`, `Coger`, `Nueva nota`, `Asignar` ni el panel `MiFichaje`; que la cabecera dice «Solo lectura»; y que la consola no tiene errores ni respuestas 403.
- [ ] **Step 3: Como Iván:** con «Ver como Dirección» apagado, la web es la de siempre (su zona, su reloj); encendido, igual que Carlos, y su tarjeta aparece en el Equipo.
- [ ] **Step 4:** Con `COORDINA_LOGIN` apagado, el tablero arranca con la rejilla de siempre y sin «Solo lectura».
- [ ] **Step 5:** Si el recorrido destapa un botón que escribe, ocultarlo con el mismo patrón de la Task 5 y commit `fix(direccion): …`. Si destapa un 403 en la consola, es una lectura personal que hay que saltar para el espectador como en la Task 4 Step 4.
- [ ] **Step 6:** `pnpm vitest run` y `pnpm lint` finales. Actualizar la memoria `login-y-accesos.md` del proyecto: la fase 3 pasa a ser «cuenta de Dirección», y queda pendiente quitarle `direccion` a Iván cuando Carlos y Esteban den el visto bueno.

---

## Fuera de este plan (a propósito)

- Quitarle `direccion` a Iván: migración aparte cuando lo aprueben (paso de cierre de la spec).
- Que Carlos impute: añadirle `tecnico` y sección.
- La pestaña del invitado y los datos de WF: specs propias.
