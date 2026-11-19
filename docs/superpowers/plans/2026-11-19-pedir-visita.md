# Pedir visita a Oficina Técnica — plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Botón «Pedir visita» en la ficha del pedido que manda el correo a Instalaciones (CC OT y Producción) con los días en que no estamos en OT y deja una nota en el pedido; más «Mis ausencias» en el menú de cada técnico.

**Architecture:** Lógica pura en `src/lib/visita.ts` (fechas, ausencias, validación) y `src/lib/correo-visita.ts` (asunto, frase, cuerpo, nota). En servidor: migración v24, `visitas-db.ts` (ausencias y nombres), `visita-correo-cola.ts` + `visita-correo-worker.ts` (cola propia con el patrón de `correo-cola`), `pedir-visita.ts` (orquesta nota + cola). Rutas finas `/api/ausencias` y `/api/visitas`. UI: `MisAusencias.tsx` (desde la pestaña Visitas, cuyo calendario pinta las ausencias) y `PedirVisita.tsx` (en las acciones del Drawer).

**Tech Stack:** Next.js (versión con cambios: leer `node_modules/next/dist/docs/` antes de tocar rutas), TypeScript, React, better-sqlite3, Microsoft Graph (`graph-correo.ts`), vitest, pnpm.

**Spec:** `docs/superpowers/specs/2026-11-19-pedir-visita-design.md` · Maqueta: `tmp/maqueta-pedir-visita.html`

## Global Constraints

- pnpm siempre. Comandos: `pnpm test`, `pnpm exec vitest run <fichero>`, `pnpm lint`, `pnpm exec tsc --noEmit`, `pnpm build`.
- No tocar los cambios ajenos sin commitear: `src/components/vista-belen/FilaOFBelen.tsx`, `src/lib/server/vista-belen-db.ts`, `src/lib/vista-belen.ts`. Al commitear, `git add` solo los ficheros de cada tarea.
- Commits SOLO si Iván lo autoriza. Si no hay autorización, sustituir el paso «Commit» por `git status` y seguir.
- Bizneo fuera. Coordina NO guarda ni enseña fecha de visita propia: solo la nota.
- La nota va para todos (`para: []`), sin menciones, `enConsultaPublica: false`.
- Correo: De coordina@; Para Instalaciones; CC Oficina Técnica y Producción; Responder a = quien pide, sin mencionarlo en el texto.
- `.env`: `CORREO_VISITA=off|ensayo|activo` (por defecto `off`), `CORREO_VISITA_PARA`, `CORREO_VISITA_CC`; en ensayo todo a `CORREO_ENSAYO_PARA`.
- Estilo HeroUI (`docs/ESTILO-HEROUI.md`): paneles radio 24 sin borde, botones radio 999 (primario `brand-400` / tinta `brand-950`), campos radio 14 con `--hero-sombra-campo`, píldora `.tira-3d` + `.pestana-activa`. Solo tokens: comprobar nombres de clase en `src/app/globals.css` antes de usarlos.
- Textos de cara al usuario en castellano llano, sin nombres de campos ni estados internos.
- Novedad (solo en el commit que lo deja usable, el último):
  `Novedad[ot]: nuevo | Pedir visita a Instalaciones desde el pedido`
  `Detalle: Marcas las OF, quién viene y el motivo; el correo lleva los días que no estáis en la oficina y queda nota en el pedido.`

## Mapa de ficheros

| Fichero | Qué hace |
|---|---|
| `src/lib/visita.ts` (nuevo) | Tipos, fechas L–V, ausentes por día, retoques, agrupado de rangos, validación de entrada |
| `src/lib/correo-visita.ts` (nuevo) | Asunto, frase, cuerpo texto/HTML, texto de la nota |
| `src/lib/server/estado-db.ts` (mod.) | Migración v24 `visitas` |
| `src/lib/server/visitas-db.ts` (nuevo) | Mis ausencias (leer/guardar), ausencias de varios, nombres de «Viene» |
| `src/lib/server/visita-correo-cola.ts` (nuevo) | Modo, destinatarios, encolar, leer pendientes, marcar enviado/fallo/descartado |
| `src/lib/server/visita-correo-worker.ts` (nuevo) | Vuelta cada 30 s; si se descarta, responde en el hilo de la nota |
| `src/lib/server/pedir-visita.ts` (nuevo) | Crea nota + encola correo + guarda nombre |
| `src/instrumentation.ts` (mod.) | Arranca el worker |
| `src/app/api/ausencias/route.ts` (nuevo) | GET/PUT mis ausencias |
| `src/app/api/visitas/route.ts` (nuevo) | GET datos de la ventana, POST pedir |
| `src/components/MisAusencias.tsx` (nuevo) | Panel de ausencias |
| `src/components/CalendarioVisitas.tsx`, `src/components/VisitasCotView.tsx`, `src/components/Board.tsx` (mod.) | Ausencias en el calendario de Visitas + botón «Mis ausencias» (no en la consulta sin login) |
| `src/app/api/ausencias/equipo/route.ts` (nuevo) | Ausencias de OT sin notas, para el calendario |
| `src/components/PedirVisita.tsx` (nuevo) | Botón + ventana |
| `src/components/Drawer.tsx` (mod.) | Botón en las acciones; recarga del hilo de notas |
| `.env.example` (mod.) | Las tres variables nuevas |
| Tests: `src/lib/__tests__/visita.test.ts`, `correo-visita.test.ts`, `visitas-db.test.ts`, `visita-correo.test.ts` (nuevos) | |

---

### Task 1: Lógica pura de días y ausencias (`src/lib/visita.ts`)

**Files:**
- Create: `src/lib/visita.ts`
- Test: `src/lib/__tests__/visita.test.ts`

**Interfaces:**
- Produces:
  - `type Cuando = { tipo: "pronto" } | { tipo: "dia"; fecha: string } | { tipo: "sinPrisa" }`
  - `interface Rango { desde: string; hasta: string; nota?: string | null }`
  - `interface Ausencias { operarioId: string; dias: number[]; rangos: Rango[] }` (dias: 1=L … 5=V)
  - `interface DiaFuera { fecha: string; quien: string[] }` (quien = ids)
  - `interface Tramo { desde: string; hasta: string; quien: string }` (quien = nombres unidos)
  - `diaSemana(iso: string): number` (1=lunes … 7=domingo)
  - `sumarDias(iso: string, n: number): string`
  - `diasLaborables(hoy: string, semanas?: number): string[]` (desde el lunes de la semana de `hoy`, L–V)
  - `ausentesPorDia(dias: string[], ausencias: Ausencias[], atienden: string[]): Record<string, string[]>`
  - `diasNoEstamos(dias: string[], ausentes: Record<string, string[]>, retoques: Record<string, boolean>, atienden: string[]): DiaFuera[]`
  - `unirNombres(nombres: string[]): string`
  - `agruparDias(fuera: DiaFuera[], nombreDe: (id: string) => string): Tramo[]`
  - `fechaCorta(iso)`, `diaCorto(iso)`, `diaLargo(iso)`: `"25/11"`, `"mar 25/11"`, `"martes 25/11"`
  - `lineaTramo(t: Tramo): string`
  - `validarAusencias(v: unknown): { dias: number[]; rangos: Rango[] } | null`
  - `interface EntradaVisita { pedido: string; cliente: string; solicitada: string | null; prioridad: number | null; ofs: { codigo: string; descripcion: string }[]; viene: string; cuando: Cuando; motivo: string | null; atienden: string[]; noEstamos: DiaFuera[] }`
  - `validarVisita(b: Record<string, unknown>): { ok: true; entrada: EntradaVisita } | { ok: false; campo: string; error: string }`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/__tests__/visita.test.ts
import { describe, expect, it } from "vitest";
import {
  agruparDias, ausentesPorDia, diaCorto, diaLargo, diaSemana, diasLaborables, diasNoEstamos,
  fechaCorta, lineaTramo, sumarDias, unirNombres, validarAusencias, validarVisita,
} from "../visita";

const T = { operarioId: "tamara", dias: [3, 5], rangos: [{ desde: "2026-12-02", hasta: "2026-12-05" }] };
const A = { operarioId: "alberto", dias: [4], rangos: [] };
const NOMBRES: Record<string, string> = { tamara: "Tamara", alberto: "Alberto", ivan: "Iván" };

describe("fechas", () => {
  it("día de la semana con lunes = 1", () => {
    expect(diaSemana("2026-11-17")).toBe(1);
    expect(diaSemana("2026-11-19")).toBe(4);
    expect(diaSemana("2026-11-22")).toBe(7);
  });
  it("suma días cruzando de mes", () => {
    expect(sumarDias("2026-11-30", 2)).toBe("2026-12-02");
  });
  it("tres semanas L–V desde el lunes de esta semana", () => {
    const d = diasLaborables("2026-11-19");
    expect(d).toHaveLength(15);
    expect(d[0]).toBe("2026-11-17");
    expect(d[14]).toBe("2026-12-05");
    expect(d).not.toContain("2026-11-22");
  });
  it("formatos", () => {
    expect(fechaCorta("2026-11-25")).toBe("25/11");
    expect(fechaCorta("2026-12-02")).toBe("2/12");
    expect(diaCorto("2026-11-25")).toBe("mar 25/11");
    expect(diaLargo("2026-11-25")).toBe("martes 25/11");
  });
});

describe("ausencias", () => {
  const dias = diasLaborables("2026-11-19");
  it("fijos y rangos, solo de quien atiende, en su orden", () => {
    const a = ausentesPorDia(dias, [T, A], ["tamara", "alberto"]);
    expect(a["2026-11-19"]).toEqual(["alberto"]);
    expect(a["2026-11-21"]).toEqual(["tamara"]);
    expect(a["2026-12-03"]).toEqual(["tamara"]);
    expect(a["2026-12-04"]).toEqual(["tamara", "alberto"]);
    expect(a["2026-11-17"]).toEqual([]);
    expect(ausentesPorDia(dias, [T, A], ["tamara"])["2026-11-19"]).toEqual([]);
  });
  it("retoques: true marca a todos, false quita", () => {
    const a = ausentesPorDia(dias, [T, A], ["tamara", "alberto"]);
    const f = diasNoEstamos(dias, a, { "2026-11-17": true, "2026-11-19": false }, ["tamara", "alberto"]);
    expect(f.find((d) => d.fecha === "2026-11-17")?.quien).toEqual(["tamara", "alberto"]);
    expect(f.find((d) => d.fecha === "2026-11-19")).toBeUndefined();
    expect(f.find((d) => d.fecha === "2026-11-21")?.quien).toEqual(["tamara"]);
  });
});

describe("agrupado para el correo", () => {
  const nombreDe = (id: string) => NOMBRES[id] ?? id;
  it("une días seguidos con la misma gente; el finde no corta", () => {
    expect(agruparDias([
      { fecha: "2026-11-27", quien: ["tamara"] },
      { fecha: "2026-11-30", quien: ["tamara"] },
    ], nombreDe)).toEqual([{ desde: "2026-11-27", hasta: "2026-11-30", quien: "Tamara" }]);
  });
  it("corta si falta un día o cambia la gente", () => {
    const t = agruparDias([
      { fecha: "2026-11-28", quien: ["tamara"] },
      { fecha: "2026-12-01", quien: ["tamara"] },
      { fecha: "2026-12-02", quien: ["tamara"] },
      { fecha: "2026-12-04", quien: ["tamara", "alberto"] },
    ], nombreDe);
    expect(t.map(lineaTramo)).toEqual(["vie 28/11 · Tamara", "1/12 al 2/12 · Tamara", "vie 4/12 · Tamara y Alberto"]);
  });
  it("une nombres en castellano", () => {
    expect(unirNombres(["Tamara"])).toBe("Tamara");
    expect(unirNombres(["Tamara", "Alberto"])).toBe("Tamara y Alberto");
    expect(unirNombres(["Iván", "Tamara", "Alberto"])).toBe("Iván, Tamara y Alberto");
  });
});

describe("validarAusencias", () => {
  it("acepta días L–V y rangos ordenados", () => {
    expect(validarAusencias({ dias: [5, 3, 3], rangos: [{ desde: "2026-12-02", hasta: "2026-12-05", nota: " vacaciones " }] }))
      .toEqual({ dias: [3, 5], rangos: [{ desde: "2026-12-02", hasta: "2026-12-05", nota: "vacaciones" }] });
  });
  it("rechaza sábado, fechas malas y rangos al revés", () => {
    expect(validarAusencias({ dias: [6], rangos: [] })).toBeNull();
    expect(validarAusencias({ dias: [], rangos: [{ desde: "2026-13-01", hasta: "2026-13-02" }] })).toBeNull();
    expect(validarAusencias({ dias: [], rangos: [{ desde: "2026-12-05", hasta: "2026-12-02" }] })).toBeNull();
  });
});

describe("validarVisita", () => {
  const base = {
    pedido: "AR.26.05448", cliente: "Belts Vigo", solicitada: "2026-11-27", prioridad: 3,
    ofs: [{ codigo: "26/10234", descripcion: "Toldo cofre 5×3" }], viene: " Juan Castro ",
    cuando: { tipo: "dia", fecha: "2026-11-25" }, motivo: "", atienden: ["tamara"], noEstamos: [],
  };
  it("limpia y acepta", () => {
    const r = validarVisita(base);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.entrada.viene).toBe("Juan Castro");
      expect(r.entrada.motivo).toBeNull();
    }
  });
  it("pide OF, quién viene y quién atiende", () => {
    expect(validarVisita({ ...base, ofs: [] })).toMatchObject({ ok: false, campo: "ofs" });
    expect(validarVisita({ ...base, viene: "  " })).toMatchObject({ ok: false, campo: "viene" });
    expect(validarVisita({ ...base, atienden: [] })).toMatchObject({ ok: false, campo: "atienden" });
    expect(validarVisita({ ...base, cuando: { tipo: "dia" } })).toMatchObject({ ok: false, campo: "cuando" });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run src/lib/__tests__/visita.test.ts`
Expected: FAIL, `Failed to resolve import "../visita"`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/lib/visita.ts
// ─── Pedir visita: días, ausencias y validación (spec 2026-11-19) ───────────
// Puro: lo usan la ventana (navegador) y el servidor. Las fechas son cadenas
// ISO yyyy-mm-dd y se calcula en UTC para que el huso no mueva un día.

export type Cuando = { tipo: "pronto" } | { tipo: "dia"; fecha: string } | { tipo: "sinPrisa" };
export interface Rango { desde: string; hasta: string; nota?: string | null }
export interface Ausencias { operarioId: string; dias: number[]; rangos: Rango[] }
export interface DiaFuera { fecha: string; quien: string[] }
export interface Tramo { desde: string; hasta: string; quien: string }

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const aFecha = (iso: string) => new Date(`${iso}T00:00:00Z`);
export const esIso = (v: unknown): v is string =>
  typeof v === "string" && ISO.test(v) && !Number.isNaN(aFecha(v).getTime()) && aFecha(v).toISOString().startsWith(v);

export function diaSemana(iso: string): number {
  return ((aFecha(iso).getUTCDay() + 6) % 7) + 1;
}

export function sumarDias(iso: string, n: number): string {
  const d = aFecha(iso);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function diasLaborables(hoy: string, semanas = 3): string[] {
  const lunes = sumarDias(hoy, 1 - diaSemana(hoy));
  const dias: string[] = [];
  for (let i = 0; i < semanas * 7; i++) {
    const d = sumarDias(lunes, i);
    if (diaSemana(d) <= 5) dias.push(d);
  }
  return dias;
}

export function ausentesPorDia(dias: string[], ausencias: Ausencias[], atienden: string[]): Record<string, string[]> {
  const por = new Map(ausencias.map((a) => [a.operarioId, a]));
  const salida: Record<string, string[]> = {};
  for (const fecha of dias) {
    const ds = diaSemana(fecha);
    salida[fecha] = atienden.filter((id) => {
      const a = por.get(id);
      return !!a && (a.dias.includes(ds) || a.rangos.some((r) => r.desde <= fecha && fecha <= r.hasta));
    });
  }
  return salida;
}

/** Lo que va al correo: lo de sus ausencias, con los retoques de esta
 *  petición encima (true = ese día no está nadie; false = ese día sí). */
export function diasNoEstamos(
  dias: string[], ausentes: Record<string, string[]>, retoques: Record<string, boolean>, atienden: string[],
): DiaFuera[] {
  const salida: DiaFuera[] = [];
  for (const fecha of dias) {
    const r = retoques[fecha];
    const quien = r === true ? [...atienden] : r === false ? [] : ausentes[fecha] ?? [];
    if (quien.length > 0) salida.push({ fecha, quien });
  }
  return salida;
}

export function unirNombres(nombres: string[]): string {
  if (nombres.length <= 1) return nombres.join("");
  return `${nombres.slice(0, -1).join(", ")} y ${nombres[nombres.length - 1]}`;
}

const siguienteLaborable = (iso: string) => {
  let d = sumarDias(iso, 1);
  while (diaSemana(d) > 5) d = sumarDias(d, 1);
  return d;
};

export function agruparDias(fuera: DiaFuera[], nombreDe: (id: string) => string): Tramo[] {
  const tramos: Tramo[] = [];
  for (const d of [...fuera].sort((a, b) => a.fecha.localeCompare(b.fecha))) {
    const quien = unirNombres(d.quien.map(nombreDe));
    const ultimo = tramos[tramos.length - 1];
    if (ultimo && ultimo.quien === quien && siguienteLaborable(ultimo.hasta) === d.fecha) ultimo.hasta = d.fecha;
    else tramos.push({ desde: d.fecha, hasta: d.fecha, quien });
  }
  return tramos;
}

const CORTO = ["lun", "mar", "mié", "jue", "vie", "sáb", "dom"];
const LARGO = ["lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo"];

export function fechaCorta(iso: string): string {
  const [, m, d] = iso.split("-");
  return `${Number(d)}/${m}`;
}
export const diaCorto = (iso: string) => `${CORTO[diaSemana(iso) - 1]} ${fechaCorta(iso)}`;
export const diaLargo = (iso: string) => `${LARGO[diaSemana(iso) - 1]} ${fechaCorta(iso)}`;

export function lineaTramo(t: Tramo): string {
  const cuando = t.desde === t.hasta ? diaCorto(t.desde) : `${fechaCorta(t.desde)} al ${fechaCorta(t.hasta)}`;
  return `${cuando} · ${t.quien}`;
}

const NOTA_AUSENCIA_MAX = 200;

export function validarAusencias(v: unknown): { dias: number[]; rangos: Rango[] } | null {
  if (typeof v !== "object" || v === null) return null;
  const { dias, rangos } = v as { dias?: unknown; rangos?: unknown };
  if (!Array.isArray(dias) || !Array.isArray(rangos) || rangos.length > 60) return null;
  if (!dias.every((d) => Number.isInteger(d) && d >= 1 && d <= 5)) return null;
  const limpios: Rango[] = [];
  for (const r of rangos as unknown[]) {
    if (typeof r !== "object" || r === null) return null;
    const { desde, hasta, nota } = r as { desde?: unknown; hasta?: unknown; nota?: unknown };
    if (!esIso(desde) || !esIso(hasta) || desde > hasta) return null;
    const n = typeof nota === "string" ? nota.trim().slice(0, NOTA_AUSENCIA_MAX) : "";
    limpios.push(n ? { desde, hasta, nota: n } : { desde, hasta });
  }
  return { dias: [...new Set(dias as number[])].sort(), rangos: limpios };
}

export interface EntradaVisita {
  pedido: string;
  cliente: string;
  solicitada: string | null;
  prioridad: number | null;
  ofs: { codigo: string; descripcion: string }[];
  viene: string;
  cuando: Cuando;
  motivo: string | null;
  atienden: string[];
  noEstamos: DiaFuera[];
}

const texto = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const fallo = (campo: string, error: string) => ({ ok: false as const, campo, error });

export function validarVisita(b: Record<string, unknown>):
  { ok: true; entrada: EntradaVisita } | { ok: false; campo: string; error: string } {
  const pedido = texto(b.pedido, 60);
  if (!pedido) return fallo("pedido", "Falta el pedido");
  const ofs = Array.isArray(b.ofs)
    ? (b.ofs as unknown[]).flatMap((o) => {
        if (typeof o !== "object" || o === null) return [];
        const codigo = texto((o as { codigo?: unknown }).codigo, 40);
        return codigo ? [{ codigo, descripcion: texto((o as { descripcion?: unknown }).descripcion, 200) }] : [];
      }).slice(0, 50)
    : [];
  if (ofs.length === 0) return fallo("ofs", "Marca al menos una OF");
  const viene = texto(b.viene, 80);
  if (!viene) return fallo("viene", "Escribe quién tiene que venir");
  const c = b.cuando as { tipo?: unknown; fecha?: unknown } | undefined;
  let cuando: Cuando;
  if (c?.tipo === "pronto") cuando = { tipo: "pronto" };
  else if (c?.tipo === "sinPrisa") cuando = { tipo: "sinPrisa" };
  else if (c?.tipo === "dia" && esIso(c.fecha)) cuando = { tipo: "dia", fecha: c.fecha };
  else return fallo("cuando", "Elige el día de la visita");
  const atienden = Array.isArray(b.atienden)
    ? [...new Set((b.atienden as unknown[]).filter((x): x is string => typeof x === "string" && x.length > 0 && x.length <= 60))]
    : [];
  if (atienden.length === 0) return fallo("atienden", "Tiene que atenderle alguien");
  const noEstamos: DiaFuera[] = Array.isArray(b.noEstamos)
    ? (b.noEstamos as unknown[]).flatMap((d) => {
        if (typeof d !== "object" || d === null) return [];
        const { fecha, quien } = d as { fecha?: unknown; quien?: unknown };
        if (!esIso(fecha) || !Array.isArray(quien)) return [];
        const q = (quien as unknown[]).filter((x): x is string => typeof x === "string" && atienden.includes(x));
        return q.length ? [{ fecha, quien: q }] : [];
      }).slice(0, 40)
    : [];
  const motivo = texto(b.motivo, 500) || null;
  return {
    ok: true,
    entrada: {
      pedido,
      cliente: texto(b.cliente, 120),
      solicitada: esIso(b.solicitada) ? b.solicitada : null,
      prioridad: typeof b.prioridad === "number" && Number.isInteger(b.prioridad) ? b.prioridad : null,
      ofs, viene, cuando, motivo, atienden, noEstamos,
    },
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run src/lib/__tests__/visita.test.ts`
Expected: PASS (todos).

- [ ] **Step 5: Commit** (solo con autorización)

```bash
git add src/lib/visita.ts src/lib/__tests__/visita.test.ts
git commit -m "feat(visita): días L-V, ausencias y validación de la petición"
```

---

### Task 2: Textos del correo y de la nota (`src/lib/correo-visita.ts`)

**Files:**
- Create: `src/lib/correo-visita.ts`
- Test: `src/lib/__tests__/correo-visita.test.ts`

**Interfaces:**
- Consumes (Task 1): `Cuando`, `Tramo`, `diaCorto`, `diaLargo`, `lineaTramo`, `unirNombres`.
- Produces:
  - `interface DatosVisita { pedido: string; cliente: string; solicitada: string | null; prioridad: number | null; ofs: { codigo: string; descripcion: string }[]; viene: string; cuando: Cuando; motivo: string | null; atienden: string[] /* nombres */; noEstamos: Tramo[]; pide: string /* nombre */ }`
  - `PREFIJO_NOTA_VISITA = "Visita solicitada a Instalaciones"`
  - `fraseVisita(d): string`, `asuntoVisita(d): string`, `cuerpoVisita(d): string`, `cuerpoVisitaHtml(d): string`, `notaVisita(d): string`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/__tests__/correo-visita.test.ts
import { describe, expect, it } from "vitest";
import { asuntoVisita, cuerpoVisita, cuerpoVisitaHtml, fraseVisita, notaVisita, type DatosVisita } from "../correo-visita";

const D: DatosVisita = {
  pedido: "AR.26.05448", cliente: "Belts Vigo", solicitada: "2026-11-27", prioridad: 3,
  ofs: [
    { codigo: "26/10234", descripcion: "Toldo cofre 5×3" },
    { codigo: "26/10235", descripcion: "Lona PVC frontal" },
  ],
  viene: "Juan Castro", cuando: { tipo: "dia", fecha: "2026-11-25" },
  motivo: "Confirmar medidas del cofre", atienden: ["Tamara", "Alberto"],
  noEstamos: [{ desde: "2026-12-02", hasta: "2026-12-05", quien: "Tamara" }], pide: "Tamara",
};

describe("correo de visita", () => {
  it("frase según cuándo", () => {
    expect(fraseVisita(D)).toBe("Visita de Juan Castro a Oficina Técnica con Tamara y Alberto el martes 25/11.");
    expect(fraseVisita({ ...D, cuando: { tipo: "pronto" } })).toBe("Visita de Juan Castro a Oficina Técnica con Tamara y Alberto lo antes posible.");
    expect(fraseVisita({ ...D, cuando: { tipo: "sinPrisa" } })).toBe("Visita de Juan Castro a Oficina Técnica con Tamara y Alberto.");
  });
  it("asunto", () => {
    expect(asuntoVisita(D)).toBe("Visita de Juan Castro a Oficina Técnica · mar 25/11 · AR.26.05448");
    expect(asuntoVisita({ ...D, cuando: { tipo: "pronto" } })).toBe("Visita de Juan Castro a Oficina Técnica · lo antes posible · AR.26.05448");
    expect(asuntoVisita({ ...D, cuando: { tipo: "sinPrisa" } })).toBe("Visita de Juan Castro a Oficina Técnica · AR.26.05448");
  });
  it("cuerpo en texto: pedido, OF, motivo, días y firma; nada de responder", () => {
    const t = cuerpoVisita(D);
    expect(t).toContain("AR.26.05448 · Belts Vigo");
    expect(t).toContain("Solicitada: jue 27/11 · Prioridad 3");
    expect(t).toContain("26/10234 Toldo cofre 5×3");
    expect(t).toContain("Motivo: Confirmar medidas del cofre");
    expect(t).toContain("Esos días no estamos en OT, por favor no pongáis la visita:");
    expect(t).toContain("2/12 al 5/12 · Tamara");
    expect(t).toContain("Pedido desde Coordina por Tamara.");
    expect(t.toLowerCase()).not.toContain("respond");
    expect(t.indexOf("26/10235")).toBeLessThan(t.indexOf("Motivo"));
  });
  it("sin días fuera no sale el bloque; sin motivo, tampoco", () => {
    const t = cuerpoVisita({ ...D, noEstamos: [], motivo: null });
    expect(t).not.toContain("no estamos");
    expect(t).not.toContain("Motivo");
  });
  it("HTML escapa lo que escribe la gente", () => {
    const h = cuerpoVisitaHtml({ ...D, motivo: "<b>ojo</b> & más" });
    expect(h).toContain("&lt;b&gt;ojo&lt;/b&gt; &amp; más");
    expect(h).toContain("<b>Juan Castro</b>");
  });
  it("nota del pedido", () => {
    expect(notaVisita(D)).toBe(
      "Visita solicitada a Instalaciones: Juan Castro con Tamara y Alberto, preferible mar 25/11. OF 26/10234, 26/10235. Motivo: Confirmar medidas del cofre",
    );
    expect(notaVisita({ ...D, cuando: { tipo: "pronto" }, motivo: null }))
      .toBe("Visita solicitada a Instalaciones: Juan Castro con Tamara y Alberto, lo antes posible. OF 26/10234, 26/10235.");
    expect(notaVisita({ ...D, cuando: { tipo: "sinPrisa" }, motivo: null }))
      .toBe("Visita solicitada a Instalaciones: Juan Castro con Tamara y Alberto. OF 26/10234, 26/10235.");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run src/lib/__tests__/correo-visita.test.ts`
Expected: FAIL, no resuelve `../correo-visita`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/lib/correo-visita.ts
import { diaCorto, diaLargo, lineaTramo, unirNombres, type Cuando, type Tramo } from "./visita";

// ─── El correo y la nota de «Pedir visita» (spec 2026-11-19) ────────────────
// Va a Instalaciones; casi nunca responden, así que el texto no invita a
// hacerlo (el Responder a lleva a quien pide, por si acaso).

export interface DatosVisita {
  pedido: string;
  cliente: string;
  solicitada: string | null;
  prioridad: number | null;
  ofs: { codigo: string; descripcion: string }[];
  viene: string;
  cuando: Cuando;
  motivo: string | null;
  /** Nombres, no ids. */
  atienden: string[];
  noEstamos: Tramo[];
  pide: string;
}

export const PREFIJO_NOTA_VISITA = "Visita solicitada a Instalaciones";

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const conQuien = (d: DatosVisita) => (d.atienden.length ? ` con ${unirNombres(d.atienden)}` : "");

export function fraseVisita(d: DatosVisita): string {
  const cola = d.cuando.tipo === "dia" ? ` el ${diaLargo(d.cuando.fecha)}` : d.cuando.tipo === "pronto" ? " lo antes posible" : "";
  return `Visita de ${d.viene} a Oficina Técnica${conQuien(d)}${cola}.`;
}

export function asuntoVisita(d: DatosVisita): string {
  const cuando = d.cuando.tipo === "dia" ? diaCorto(d.cuando.fecha) : d.cuando.tipo === "pronto" ? "lo antes posible" : null;
  return [`Visita de ${d.viene} a Oficina Técnica`, cuando, d.pedido].filter(Boolean).join(" · ");
}

const datosPedido = (d: DatosVisita) =>
  [d.solicitada ? `Solicitada: ${diaCorto(d.solicitada)}` : null, d.prioridad ? `Prioridad ${d.prioridad}` : null]
    .filter(Boolean).join(" · ");

const AVISO_DIAS = "Esos días no estamos en OT, por favor no pongáis la visita:";
const firma = (d: DatosVisita) => `Pedido desde Coordina por ${d.pide}.`;

export function cuerpoVisita(d: DatosVisita): string {
  const lineas = [fraseVisita(d), "", d.cliente ? `${d.pedido} · ${d.cliente}` : d.pedido];
  const datos = datosPedido(d);
  if (datos) lineas.push(datos);
  lineas.push("", ...d.ofs.map((o) => `${o.codigo} ${o.descripcion}`.trim()));
  if (d.motivo) lineas.push("", `Motivo: ${d.motivo}`);
  if (d.noEstamos.length) lineas.push("", AVISO_DIAS, ...d.noEstamos.map((t) => `  ${lineaTramo(t)}`));
  lineas.push("", firma(d));
  return lineas.join("\n");
}

const C = { texto: "#18181b", apagado: "#71717a", codigo: "#1f2937", caja: "#f4f4f5", rojoFondo: "#fef2f2", rojo: "#b91c1c" };
const pildora = (rotulo: string, valor: string) =>
  `<span style="display:inline-block;margin:0 6px 4px 0;padding:3px 10px;border-radius:999px;background:#fef3c7;font-size:12px;line-height:18px;color:#3f3f46"><b style="color:#92400e;font-weight:600">${esc(rotulo)}</b>&nbsp; ${esc(valor)}</span>`;

export function cuerpoVisitaHtml(d: DatosVisita): string {
  const b = (s: string) => `<b>${esc(s)}</b>`;
  const cola = d.cuando.tipo === "dia" ? ` el ${b(diaLargo(d.cuando.fecha))}` : d.cuando.tipo === "pronto" ? ` ${b("lo antes posible")}` : "";
  const con = d.atienden.length ? ` con ${b(unirNombres(d.atienden))}` : "";
  const frase = `Visita de ${b(d.viene)} a Oficina Técnica${con}${cola}.`;
  const pildoras = [
    d.solicitada ? pildora("Solicitada", diaCorto(d.solicitada)) : "",
    d.prioridad ? pildora("Prioridad", String(d.prioridad)) : "",
  ].join("");
  const ofs = d.ofs
    .map((o) => `<div style="font-size:14px;color:${C.texto}"><b style="font-family:Consolas,Menlo,monospace;color:${C.codigo}">${esc(o.codigo)}</b>${o.descripcion ? `&nbsp; ${esc(o.descripcion)}` : ""}</div>`)
    .join("");
  const motivo = d.motivo
    ? `<div style="margin-top:10px;font-size:14px;color:${C.texto}"><span style="color:${C.apagado}">Motivo:</span> ${esc(d.motivo)}</div>`
    : "";
  const dias = d.noEstamos.length
    ? `<div style="margin-top:14px;padding:12px 16px;border-radius:16px;background:${C.rojoFondo};color:${C.rojo};font-size:14px"><b>${esc(AVISO_DIAS)}</b>${d.noEstamos.map((t) => `<div style="margin-top:4px">${esc(lineaTramo(t))}</div>`).join("")}</div>`
    : "";
  return `<div style="font-family:Segoe UI,Arial,sans-serif;color:${C.texto};max-width:640px">
<p style="font-size:15px;margin:0 0 14px">${frase}</p>
<div style="padding:14px 16px;border-radius:16px;background:${C.caja}">
<div style="font-size:14px;margin-bottom:6px"><b style="font-family:Consolas,Menlo,monospace">${esc(d.pedido)}</b>${d.cliente ? `&nbsp; ${esc(d.cliente)}` : ""}</div>
<div style="margin-bottom:6px">${pildoras}</div>${ofs}${motivo}</div>${dias}
<p style="margin:16px 0 0;font-size:12px;color:${C.apagado}">${esc(firma(d))}</p>
</div>`;
}

export function notaVisita(d: DatosVisita): string {
  const cuando = d.cuando.tipo === "dia" ? `, preferible ${diaCorto(d.cuando.fecha)}` : d.cuando.tipo === "pronto" ? ", lo antes posible" : "";
  const ofs = ` OF ${d.ofs.map((o) => o.codigo).join(", ")}.`;
  const motivo = d.motivo ? ` Motivo: ${d.motivo}` : "";
  return `${PREFIJO_NOTA_VISITA}: ${d.viene}${conQuien(d)}${cuando}.${ofs}${motivo}`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run src/lib/__tests__/correo-visita.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit** (solo con autorización)

```bash
git add src/lib/correo-visita.ts src/lib/__tests__/correo-visita.test.ts
git commit -m "feat(visita): asunto, cuerpo y nota de la visita"
```

---

### Task 3: Migración v24 y `visitas-db.ts`

**Files:**
- Modify: `src/lib/server/estado-db.ts` (función nueva junto a `personaColor`, ~línea 615; entrada en `MIGRACIONES` tras la línea 611)
- Create: `src/lib/server/visitas-db.ts`
- Test: `src/lib/__tests__/visitas-db.test.ts`

**Interfaces:**
- Consumes (Task 1): `Ausencias`, `Rango`, `sumarDias`.
- Produces:
  - Tablas: `ausencia_fija(operario_id PK, dias TEXT JSON)`, `ausencia_rango(id, operario_id, desde, hasta, nota)`, `visita_nombre(nombre PK NOCASE, usado_at)`, `visita_correo(...)` (la usa Task 4).
  - `leerMisAusencias(operarioId: string): { dias: number[]; rangos: Rango[] }` (con nota)
  - `guardarMisAusencias(operarioId: string, a: { dias: number[]; rangos: Rango[] }, hoy: string): void` (reemplaza; descarta rangos con `hasta` < hoy − 90 días)
  - `ausenciasDe(ids: string[]): Ausencias[]` (sin notas)
  - `nombresVisita(limite?: number): string[]` (uso reciente primero)
  - `usarNombreVisita(nombre: string, ahora: Date): void`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/__tests__/visitas-db.test.ts
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

let dir: string;
beforeAll(() => {
  dir = mkdtempSync(path.join(tmpdir(), "coordina-visitas-"));
  process.env.COORDINA_DB_PATH = path.join(dir, "test.db");
  process.env.DATASOURCE = "mock";
});
afterAll(() => { try { rmSync(dir, { recursive: true, force: true }); } catch {} });

let db: typeof import("../server/visitas-db");
beforeEach(async () => {
  vi.resetModules();
  const { getDb } = await import("../server/estado-db");
  getDb().exec("DELETE FROM ausencia_fija; DELETE FROM ausencia_rango; DELETE FROM visita_nombre;");
  db = await import("../server/visitas-db");
});

describe("mis ausencias", () => {
  it("guarda y lee días fijos y rangos con nota", () => {
    db.guardarMisAusencias("tamara", { dias: [3, 5], rangos: [{ desde: "2026-12-02", hasta: "2026-12-05", nota: "vacaciones" }] }, "2026-11-19");
    expect(db.leerMisAusencias("tamara")).toEqual({ dias: [3, 5], rangos: [{ desde: "2026-12-02", hasta: "2026-12-05", nota: "vacaciones" }] });
  });
  it("guardar reemplaza y tira lo pasado de hace más de 90 días", () => {
    db.guardarMisAusencias("tamara", { dias: [3], rangos: [{ desde: "2026-01-01", hasta: "2026-01-02" }, { desde: "2026-11-01", hasta: "2026-11-02" }] }, "2026-11-19");
    db.guardarMisAusencias("tamara", { dias: [5], rangos: [{ desde: "2026-01-01", hasta: "2026-01-02" }, { desde: "2026-11-01", hasta: "2026-11-02" }] }, "2026-11-19");
    expect(db.leerMisAusencias("tamara")).toEqual({ dias: [5], rangos: [{ desde: "2026-11-01", hasta: "2026-11-02", nota: null }] });
  });
  it("sin nada guardado, vacío", () => {
    expect(db.leerMisAusencias("nadie")).toEqual({ dias: [], rangos: [] });
  });
  it("ausenciasDe no lleva las notas", () => {
    db.guardarMisAusencias("tamara", { dias: [3], rangos: [{ desde: "2026-12-02", hasta: "2026-12-05", nota: "médico" }] }, "2026-11-19");
    expect(db.ausenciasDe(["tamara", "alberto"])).toEqual([
      { operarioId: "tamara", dias: [3], rangos: [{ desde: "2026-12-02", hasta: "2026-12-05" }] },
      { operarioId: "alberto", dias: [], rangos: [] },
    ]);
  });
});

describe("nombres de quien viene", () => {
  it("el último usado primero, sin duplicar por mayúsculas", () => {
    db.usarNombreVisita("Juan Castro", new Date("2026-11-10T09:00:00Z"));
    db.usarNombreVisita("Marta Pérez", new Date("2026-11-11T09:00:00Z"));
    db.usarNombreVisita("juan castro", new Date("2026-11-12T09:00:00Z"));
    expect(db.nombresVisita()).toEqual(["juan castro", "Marta Pérez"]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run src/lib/__tests__/visitas-db.test.ts`
Expected: FAIL (`no such table: ausencia_fija` o import no resuelto).

- [ ] **Step 3: Migración en `estado-db.ts`**

Añadir tras `personaColor` (~línea 619):

```ts
/** Pedir visita (spec 2026-11-19): las ausencias de cada técnico, los nombres
 *  de quien suele venir y la cola de su correo (aparte de la del
 *  planteamiento, que está atada a sus PDF). */
function visitas(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS ausencia_fija (
      operario_id TEXT PRIMARY KEY,
      dias TEXT NOT NULL DEFAULT '[]'
    );
    CREATE TABLE IF NOT EXISTS ausencia_rango (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      operario_id TEXT NOT NULL,
      desde TEXT NOT NULL,
      hasta TEXT NOT NULL,
      nota TEXT
    );
    CREATE INDEX IF NOT EXISTS ausencia_rango_operario ON ausencia_rango (operario_id);
    CREATE TABLE IF NOT EXISTS visita_nombre (
      nombre TEXT PRIMARY KEY COLLATE NOCASE,
      usado_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS visita_correo (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      pedido_id TEXT NOT NULL,
      nota_id INTEGER,
      para TEXT NOT NULL,
      cc TEXT NOT NULL,
      responder_a TEXT,
      asunto TEXT NOT NULL,
      cuerpo TEXT NOT NULL,
      cuerpo_html TEXT,
      estado TEXT NOT NULL,
      intentos INTEGER NOT NULL DEFAULT 0,
      error TEXT,
      modo TEXT,
      pedido_por TEXT NOT NULL,
      creado_at TEXT NOT NULL,
      proximo_at TEXT,
      enviado_at TEXT
    );
    CREATE INDEX IF NOT EXISTS visita_correo_pendiente ON visita_correo (estado, proximo_at);
  `);
}
```

Y en `MIGRACIONES`, tras la v23:

```ts
  { version: 24, nombre: "visitas", aplicar: visitas },
```

- [ ] **Step 4: Write `visitas-db.ts`**

```ts
// src/lib/server/visitas-db.ts
import type { Ausencias, Rango } from "../visita";
import { sumarDias } from "../visita";
import { getDb } from "./estado-db";

// ─── Ausencias de OT y nombres de quien viene (spec 2026-11-19) ─────────────
// La nota de una ausencia es de su dueño: solo sale en leerMisAusencias.
// Fuera de ahí, una ausencia es «no está en OT» y nada más.

const DIAS_GUARDA_PASADO = 90;

const parsearDias = (json: string): number[] => {
  try {
    const v = JSON.parse(json) as unknown;
    return Array.isArray(v) ? v.filter((d): d is number => Number.isInteger(d)) : [];
  } catch {
    return [];
  }
};

export function leerMisAusencias(operarioId: string): { dias: number[]; rangos: Rango[] } {
  const fija = getDb().prepare("SELECT dias FROM ausencia_fija WHERE operario_id = ?").get(operarioId) as { dias: string } | undefined;
  const rangos = getDb()
    .prepare("SELECT desde, hasta, nota FROM ausencia_rango WHERE operario_id = ? ORDER BY desde, id")
    .all(operarioId) as Array<{ desde: string; hasta: string; nota: string | null }>;
  return { dias: fija ? parsearDias(fija.dias) : [], rangos };
}

export function guardarMisAusencias(operarioId: string, a: { dias: number[]; rangos: Rango[] }, hoy: string): void {
  const corte = sumarDias(hoy, -DIAS_GUARDA_PASADO);
  const db = getDb();
  db.transaction(() => {
    db.prepare("INSERT INTO ausencia_fija (operario_id, dias) VALUES (?, ?) ON CONFLICT(operario_id) DO UPDATE SET dias = excluded.dias")
      .run(operarioId, JSON.stringify(a.dias));
    db.prepare("DELETE FROM ausencia_rango WHERE operario_id = ?").run(operarioId);
    const ins = db.prepare("INSERT INTO ausencia_rango (operario_id, desde, hasta, nota) VALUES (?, ?, ?, ?)");
    for (const r of a.rangos) if (r.hasta >= corte) ins.run(operarioId, r.desde, r.hasta, r.nota ?? null);
  })();
}

export function ausenciasDe(ids: string[]): Ausencias[] {
  return ids.map((id) => {
    const { dias, rangos } = leerMisAusencias(id);
    return { operarioId: id, dias, rangos: rangos.map(({ desde, hasta }) => ({ desde, hasta })) };
  });
}

export function nombresVisita(limite = 50): string[] {
  return (getDb().prepare("SELECT nombre FROM visita_nombre ORDER BY usado_at DESC LIMIT ?").all(limite) as Array<{ nombre: string }>)
    .map((r) => r.nombre);
}

/** Guarda el nombre tal como se escribió la última vez. */
export function usarNombreVisita(nombre: string, ahora: Date): void {
  const db = getDb();
  db.transaction(() => {
    db.prepare("DELETE FROM visita_nombre WHERE nombre = ?").run(nombre);
    db.prepare("INSERT INTO visita_nombre (nombre, usado_at) VALUES (?, ?)").run(nombre, ahora.toISOString());
  })();
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm exec vitest run src/lib/__tests__/visitas-db.test.ts`
Expected: PASS. Si falla «expected `nota: undefined`» en el primer test: `leerMisAusencias` devuelve `nota: null` cuando no hay; el test ya lo contempla en el segundo caso.

- [ ] **Step 6: Run whole suite (migración no rompe nada)**

Run: `pnpm test`
Expected: PASS salvo fallos ya existentes antes del cambio (comparar con `git stash`-free: anotar cuáles fallaban antes si hay alguno).

- [ ] **Step 7: Commit** (solo con autorización)

```bash
git add src/lib/server/estado-db.ts src/lib/server/visitas-db.ts src/lib/__tests__/visitas-db.test.ts
git commit -m "feat(visita): tablas de ausencias, nombres y cola del correo"
```

---

### Task 4: Cola, worker y servicio `pedirVisita`

**Files:**
- Create: `src/lib/server/visita-correo-cola.ts`
- Create: `src/lib/server/visita-correo-worker.ts`
- Create: `src/lib/server/pedir-visita.ts`
- Modify: `src/instrumentation.ts` (tras `arrancarCorreo();`, ~línea 67)
- Test: `src/lib/__tests__/visita-correo.test.ts`

**Interfaces:**
- Consumes: Task 1 (`EntradaVisita`, `agruparDias`), Task 2 (`DatosVisita`, `asuntoVisita`, `cuerpoVisita`, `cuerpoVisitaHtml`, `notaVisita`), Task 3 (`usarNombreVisita`, tabla `visita_correo`); existentes `crearNota` (`notas-db`), `credencialesGraph`, `enviarCorreo`, `ErrorGraph` (`graph-correo`), `esperaTras` (`impresion-cola`), `correoDeOperario` (`operarios`), `leerPersona` (`personas-db`), `ModoCorreo` (`correo-cola`).
- Produces:
  - `modoVisita(): ModoCorreo`
  - `destinatariosVisita(modo: ModoCorreo): { para: string[]; cc: string[] }`
  - `visitaDisponible(): boolean`
  - `encolarVisita(c: { pedido: string; notaId: number | null; para: string[]; cc: string[]; responderA: string | null; asunto: string; cuerpo: string; html: string; modo: ModoCorreo; pedidoPor: string }, ahora: Date): number`
  - `visitasParaEnviar(ahora: Date): VisitaPendiente[]`, `marcarVisitaEnviada(id, ahora)`, `marcarFalloVisita(id, intentosAntes, error, ahora)`, `descartarVisita(id, error): void`
  - `vueltaVisita(ahora?: Date, enviar?: typeof enviarCorreo): Promise<number>`, `arrancarVisita(): void`
  - `primerNombre(nombre: string): string`
  - `pedirVisita(e: EntradaVisita, pide: { id: string; nombre: string }, ahora?: Date, nombreDe?: (id: string) => string | null): { notaId: number; correoId: number }`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/__tests__/visita-correo.test.ts
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type { Correo } from "../server/graph-correo";
import type { EntradaVisita } from "../visita";

let dir: string;
beforeAll(() => {
  dir = mkdtempSync(path.join(tmpdir(), "coordina-visita-correo-"));
  process.env.COORDINA_DB_PATH = path.join(dir, "test.db");
  process.env.DATASOURCE = "mock";
});
afterAll(() => { try { rmSync(dir, { recursive: true, force: true }); } catch {} });

let cola: typeof import("../server/visita-correo-cola");
let worker: typeof import("../server/visita-correo-worker");
let servicio: typeof import("../server/pedir-visita");
let graph: typeof import("../server/graph-correo");
let getDb: typeof import("../server/estado-db").getDb;

beforeEach(async () => {
  vi.resetModules();
  process.env.CORREO_VISITA = "activo";
  process.env.CORREO_VISITA_PARA = "instalaciones@x.com";
  process.env.CORREO_VISITA_CC = "of.tecnica@x.com, produccion@x.com";
  process.env.GRAPH_TENANT_ID = "t";
  process.env.GRAPH_CLIENT_ID = "c";
  process.env.GRAPH_CLIENT_SECRET = "s";
  delete process.env.CORREO_ENSAYO_PARA;
  ({ getDb } = await import("../server/estado-db"));
  getDb().exec("DELETE FROM visita_correo; DELETE FROM nota_pedido; DELETE FROM visita_nombre;");
  cola = await import("../server/visita-correo-cola");
  worker = await import("../server/visita-correo-worker");
  servicio = await import("../server/pedir-visita");
  graph = await import("../server/graph-correo");
});

const T0 = new Date("2026-11-19T09:00:00Z");
const NOMBRES: Record<string, string> = { tamara: "Tamara Rey", alberto: "Alberto Gil" };
const nombreDe = (id: string) => NOMBRES[id] ?? null;
const ENTRADA: EntradaVisita = {
  pedido: "AR.26.05448", cliente: "Belts Vigo", solicitada: "2026-11-27", prioridad: 3,
  ofs: [{ codigo: "26/10234", descripcion: "Toldo cofre 5×3" }], viene: "Juan Castro",
  cuando: { tipo: "dia", fecha: "2026-11-25" }, motivo: null, atienden: ["tamara", "alberto"],
  noEstamos: [{ fecha: "2026-12-02", quien: ["tamara"] }, { fecha: "2026-12-03", quien: ["tamara"] }],
};

describe("modo y destinatarios", () => {
  it("activo: Instalaciones y copias del .env", () => {
    expect(cola.destinatariosVisita("activo")).toEqual({ para: ["instalaciones@x.com"], cc: ["of.tecnica@x.com", "produccion@x.com"] });
  });
  it("ensayo: todo a CORREO_ENSAYO_PARA, sin copias", () => {
    process.env.CORREO_ENSAYO_PARA = "ivan@x.com";
    expect(cola.destinatariosVisita("ensayo")).toEqual({ para: ["ivan@x.com"], cc: [] });
  });
  it("disponible solo con modo, credenciales y a quién mandar", () => {
    expect(cola.visitaDisponible()).toBe(true);
    process.env.CORREO_VISITA = "off";
    expect(cola.visitaDisponible()).toBe(false);
    process.env.CORREO_VISITA = "activo";
    delete process.env.CORREO_VISITA_PARA;
    expect(cola.visitaDisponible()).toBe(false);
    process.env.CORREO_VISITA_PARA = "instalaciones@x.com";
    delete process.env.GRAPH_CLIENT_SECRET;
    expect(cola.visitaDisponible()).toBe(false);
  });
});

describe("pedirVisita", () => {
  it("deja la nota para todos y encola el correo congelado", () => {
    const { notaId, correoId } = servicio.pedirVisita(ENTRADA, { id: "tamara", nombre: "Tamara Rey" }, T0, nombreDe);
    const nota = getDb().prepare("SELECT pedido, operario_id, texto, padre_id FROM nota_pedido WHERE id = ?").get(notaId) as Record<string, unknown>;
    expect(nota).toMatchObject({ pedido: "AR.26.05448", operario_id: "tamara", padre_id: null });
    expect(nota.texto).toBe("Visita solicitada a Instalaciones: Juan Castro con Tamara y Alberto, preferible mar 25/11. OF 26/10234.");
    const [c] = cola.visitasParaEnviar(T0);
    expect(c.id).toBe(correoId);
    expect(c.para).toEqual(["instalaciones@x.com"]);
    expect(c.asunto).toBe("Visita de Juan Castro a Oficina Técnica · mar 25/11 · AR.26.05448");
    expect(c.cuerpo).toContain("2/12 al 3/12 · Tamara");
    expect(c.cuerpo).toContain("Pedido desde Coordina por Tamara.");
  });
  it("recuerda el nombre de quien viene", async () => {
    servicio.pedirVisita(ENTRADA, { id: "tamara", nombre: "Tamara Rey" }, T0, nombreDe);
    const { nombresVisita } = await import("../server/visitas-db");
    expect(nombresVisita()).toEqual(["Juan Castro"]);
  });
  it("quien atiende tiene que existir", () => {
    expect(() => servicio.pedirVisita({ ...ENTRADA, atienden: ["fantasma"] }, { id: "tamara", nombre: "Tamara Rey" }, T0, nombreDe))
      .toThrow(/atiende/);
  });
});

describe("worker", () => {
  it("manda lo pendiente y lo marca enviado", async () => {
    servicio.pedirVisita(ENTRADA, { id: "tamara", nombre: "Tamara Rey" }, T0, nombreDe);
    const enviados: Correo[] = [];
    expect(await worker.vueltaVisita(T0, async (c) => { enviados.push(c); })).toBe(1);
    expect(enviados[0].cc).toEqual(["of.tecnica@x.com", "produccion@x.com"]);
    expect(enviados[0].html).toContain("<b>Juan Castro</b>");
    expect(cola.visitasParaEnviar(T0)).toHaveLength(0);
  });
  it("fallo reintentable: espera y no descarta", async () => {
    servicio.pedirVisita(ENTRADA, { id: "tamara", nombre: "Tamara Rey" }, T0, nombreDe);
    await worker.vueltaVisita(T0, async () => { throw new graph.ErrorGraph("timeout", true); });
    expect(cola.visitasParaEnviar(T0)).toHaveLength(0);
    expect(cola.visitasParaEnviar(new Date(T0.getTime() + 24 * 3600_000))).toHaveLength(1);
  });
  it("descartado: responde en el hilo de la nota", async () => {
    const { notaId } = servicio.pedirVisita(ENTRADA, { id: "tamara", nombre: "Tamara Rey" }, T0, nombreDe);
    await worker.vueltaVisita(T0, async () => { throw new graph.ErrorGraph("sin permiso", false); });
    const resp = getDb().prepare("SELECT texto FROM nota_pedido WHERE padre_id = ?").all(notaId) as Array<{ texto: string }>;
    expect(resp).toHaveLength(1);
    expect(resp[0].texto).toMatch(/no se pudo enviar/i);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run src/lib/__tests__/visita-correo.test.ts`
Expected: FAIL, imports no resueltos.

- [ ] **Step 3: Write `visita-correo-cola.ts`**

```ts
// src/lib/server/visita-correo-cola.ts
import type { ModoCorreo } from "./correo-cola";
import { getDb } from "./estado-db";
import { credencialesGraph } from "./graph-correo";
import { esperaTras } from "./impresion-cola";

// ─── Cola del correo de «Pedir visita» (spec 2026-11-19) ────────────────────
// Mismo patrón que correo-cola: se congela al encolar y se reintenta si
// Microsoft no responde. Tabla propia: la del planteamiento va atada a sus PDF.

export function modoVisita(): ModoCorreo {
  const v = process.env.CORREO_VISITA;
  return v === "activo" || v === "ensayo" ? v : "off";
}

const lista = (v: string | undefined) => (v ? v.split(",").map((s) => s.trim()).filter(Boolean) : []);

/** Instalaciones no tiene dirección por defecto: sin CORREO_VISITA_PARA, en
 *  activo, no hay a quién mandar y el botón no sale. */
export function destinatariosVisita(modo: ModoCorreo): { para: string[]; cc: string[] } {
  if (modo === "activo") return { para: lista(process.env.CORREO_VISITA_PARA), cc: lista(process.env.CORREO_VISITA_CC) };
  if (modo === "ensayo") {
    const ensayo = lista(process.env.CORREO_ENSAYO_PARA);
    return { para: ensayo.length ? ensayo : ["ivan.sanchez@toldosgomez.com"], cc: [] };
  }
  return { para: [], cc: [] };
}

export function visitaDisponible(): boolean {
  const modo = modoVisita();
  return modo !== "off" && credencialesGraph() !== null && destinatariosVisita(modo).para.length > 0;
}

export function encolarVisita(
  c: { pedido: string; notaId: number | null; para: string[]; cc: string[]; responderA: string | null; asunto: string; cuerpo: string; html: string; modo: ModoCorreo; pedidoPor: string },
  ahora: Date,
): number {
  const ts = ahora.toISOString();
  const r = getDb()
    .prepare(
      `INSERT INTO visita_correo (pedido_id, nota_id, para, cc, responder_a, asunto, cuerpo, cuerpo_html, estado, modo, pedido_por, creado_at, proximo_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pendiente', ?, ?, ?, ?)`,
    )
    .run(c.pedido, c.notaId, JSON.stringify(c.para), JSON.stringify(c.cc), c.responderA, c.asunto, c.cuerpo, c.html, c.modo, c.pedidoPor, ts, ts);
  return Number(r.lastInsertRowid);
}

export interface VisitaPendiente {
  id: number;
  pedidoId: string;
  notaId: number | null;
  para: string[];
  cc: string[];
  responderA: string | null;
  asunto: string;
  cuerpo: string;
  html: string | null;
  intentos: number;
  pedidoPor: string;
}

interface FilaDb {
  id: number; pedido_id: string; nota_id: number | null; para: string; cc: string; responder_a: string | null;
  asunto: string; cuerpo: string; cuerpo_html: string | null; intentos: number; pedido_por: string;
}

const parsear = (json: string): string[] => {
  try { const v = JSON.parse(json) as unknown; return Array.isArray(v) ? (v as string[]) : []; } catch { return []; }
};

export function visitasParaEnviar(ahora: Date): VisitaPendiente[] {
  return (getDb()
    .prepare("SELECT * FROM visita_correo WHERE estado = 'pendiente' AND proximo_at <= ? ORDER BY id LIMIT 20")
    .all(ahora.toISOString()) as FilaDb[]).map((r) => ({
    id: r.id, pedidoId: r.pedido_id, notaId: r.nota_id, para: parsear(r.para), cc: parsear(r.cc), responderA: r.responder_a,
    asunto: r.asunto, cuerpo: r.cuerpo, html: r.cuerpo_html, intentos: r.intentos, pedidoPor: r.pedido_por,
  }));
}

export function marcarVisitaEnviada(id: number, ahora: Date): void {
  getDb().prepare("UPDATE visita_correo SET estado = 'enviado', enviado_at = ?, error = NULL WHERE id = ?").run(ahora.toISOString(), id);
}

export function descartarVisita(id: number, error: string): void {
  getDb().prepare("UPDATE visita_correo SET estado = 'descartado', error = ? WHERE id = ?").run(error.slice(0, 500), id);
}

export function marcarFalloVisita(id: number, intentosAntes: number, error: string, ahora: Date): void {
  const intentos = intentosAntes + 1;
  getDb()
    .prepare("UPDATE visita_correo SET intentos = ?, error = ?, proximo_at = ? WHERE id = ?")
    .run(intentos, error.slice(0, 500), new Date(ahora.getTime() + esperaTras(intentos)).toISOString(), id);
}
```

- [ ] **Step 4: Write `visita-correo-worker.ts`**

```ts
// src/lib/server/visita-correo-worker.ts
import { credencialesGraph, enviarCorreo, ErrorGraph } from "./graph-correo";
import { crearNota } from "./notas-db";
import { descartarVisita, marcarFalloVisita, marcarVisitaEnviada, modoVisita, visitasParaEnviar } from "./visita-correo-cola";

// ─── El que manda los correos de «Pedir visita» ─────────────────────────────
// Igual que correo-worker. Lo que Microsoft rechaza se descarta y se dice en
// el hilo de la nota de la visita, para que quien la pidió lo mande a mano.

const CADA_MS = 30_000;

declare global {
  var __coordinaVisita: ReturnType<typeof setInterval> | undefined;
}

let corriendo = false;

export async function vueltaVisita(ahora = new Date(), enviar = enviarCorreo): Promise<number> {
  if (modoVisita() === "off" || corriendo) return 0;
  const cred = credencialesGraph();
  if (!cred) return 0;
  corriendo = true;
  let enviados = 0;
  try {
    for (const c of visitasParaEnviar(ahora)) {
      try {
        await enviar(
          {
            de: process.env.CORREO_REMITENTE ?? "coordina@toldosgomez.com",
            para: c.para,
            cc: c.cc,
            responderA: c.responderA ?? process.env.CORREO_RESPONDER_A ?? "of.tecnica@toldosgomez.com",
            asunto: c.asunto,
            texto: c.cuerpo,
            html: c.html ?? undefined,
            adjuntos: [],
          },
          cred,
        );
        marcarVisitaEnviada(c.id, ahora);
        enviados += 1;
      } catch (e) {
        const mensaje = (e as Error).message;
        if (e instanceof ErrorGraph && !e.reintentable) {
          descartarVisita(c.id, mensaje);
          console.warn(`[visita] ${c.pedidoId} descartado:`, mensaje);
          if (c.notaId !== null) {
            try {
              crearNota(c.pedidoId, c.pedidoPor, "No se pudo enviar el correo de esta visita. Hay que mandarlo a mano.", ahora.toISOString(), { padreId: c.notaId });
            } catch (err) {
              // La nota pudo borrarse entretanto: el descarte ya queda en la cola.
              console.warn(`[visita] no pude avisar en la nota ${c.notaId}:`, (err as Error).message);
            }
          }
          continue;
        }
        marcarFalloVisita(c.id, c.intentos, mensaje, ahora);
        console.warn(`[visita] ${c.pedidoId}:`, mensaje);
        break;
      }
    }
  } finally {
    corriendo = false;
  }
  return enviados;
}

export function arrancarVisita(): void {
  if (globalThis.__coordinaVisita) return;
  globalThis.__coordinaVisita = setInterval(() => {
    vueltaVisita().catch((e) => console.error("[visita] la vuelta falló:", e));
  }, CADA_MS);
  globalThis.__coordinaVisita.unref?.();
}
```

Comprobar que `Correo.adjuntos` admite `[]` (en `graph-correo.ts`); si el campo es opcional, quitar `adjuntos: []`.

- [ ] **Step 5: Write `pedir-visita.ts`**

```ts
// src/lib/server/pedir-visita.ts
import { asuntoVisita, cuerpoVisita, cuerpoVisitaHtml, notaVisita, type DatosVisita } from "../correo-visita";
import { agruparDias, type EntradaVisita } from "../visita";
import { crearNota } from "./notas-db";
import { correoDeOperario } from "./operarios";
import { leerPersona } from "./personas-db";
import { destinatariosVisita, encolarVisita, modoVisita } from "./visita-correo-cola";
import { usarNombreVisita } from "./visitas-db";

// ─── Pedir visita: nota + correo (spec 2026-11-19) ──────────────────────────
// La nota es lo que antes se escribía a mano en el hilo; el correo sale por
// la cola. La fecha de la visita de verdad la pone RPS: aquí no se guarda.

export const primerNombre = (nombre: string) => nombre.trim().split(/\s+/)[0] ?? nombre;

const nombreDePersona = (id: string) => leerPersona(id)?.nombre ?? null;

export function pedirVisita(
  e: EntradaVisita,
  pide: { id: string; nombre: string },
  ahora = new Date(),
  nombreDe: (id: string) => string | null = nombreDePersona,
): { notaId: number; correoId: number } {
  const nombres = new Map<string, string>();
  for (const id of e.atienden) {
    const n = nombreDe(id);
    if (!n) throw new Error(`Quien atiende no existe: ${id}`);
    nombres.set(id, primerNombre(n));
  }
  const datos: DatosVisita = {
    pedido: e.pedido, cliente: e.cliente, solicitada: e.solicitada, prioridad: e.prioridad, ofs: e.ofs,
    viene: e.viene, cuando: e.cuando, motivo: e.motivo,
    atienden: e.atienden.map((id) => nombres.get(id)!),
    noEstamos: agruparDias(e.noEstamos, (id) => nombres.get(id) ?? id),
    pide: primerNombre(pide.nombre),
  };
  const ts = ahora.toISOString();
  const nota = crearNota(e.pedido, pide.id, notaVisita(datos), ts, { para: [], enConsultaPublica: false });
  const modo = modoVisita();
  const { para, cc } = destinatariosVisita(modo);
  const correoId = encolarVisita(
    {
      pedido: e.pedido, notaId: nota.id, para, cc, responderA: correoDeOperario(pide.id),
      asunto: asuntoVisita(datos), cuerpo: cuerpoVisita(datos), html: cuerpoVisitaHtml(datos), modo, pedidoPor: pide.id,
    },
    ahora,
  );
  usarNombreVisita(e.viene, ahora);
  return { notaId: nota.id, correoId };
}
```

Comprobar que `NotaPedido` (retorno de `crearNota`) tiene `id: number`; si se llama distinto, ajustar.

- [ ] **Step 6: Arrancar el worker en `src/instrumentation.ts`** (tras `arrancarCorreo();`)

```ts
  // Pedir visita (spec 2026-11-19). Con CORREO_VISITA=off no hace nada.
  const { arrancarVisita } = await import("./lib/server/visita-correo-worker");
  arrancarVisita();
```

- [ ] **Step 7: Run tests**

Run: `pnpm exec vitest run src/lib/__tests__/visita-correo.test.ts`
Expected: PASS.

- [ ] **Step 8: Commit** (solo con autorización)

```bash
git add src/lib/server/visita-correo-cola.ts src/lib/server/visita-correo-worker.ts src/lib/server/pedir-visita.ts src/instrumentation.ts src/lib/__tests__/visita-correo.test.ts
git commit -m "feat(visita): cola y envío del correo, nota en el pedido"
```

---

### Task 5: Rutas `/api/ausencias` y `/api/visitas`

Antes de escribir: leer en `node_modules/next/dist/docs/` la guía de Route Handlers de esta versión (la forma `export async function GET(req: Request)` es la que ya usa `src/app/api/notas/route.ts`; copiar ese patrón).

**Files:**
- Create: `src/app/api/ausencias/route.ts`
- Create: `src/app/api/visitas/route.ts`
- Create: `src/app/api/ausencias/equipo/route.ts`

**Interfaces:**
- Consumes: `identidad`, `soloConSesion` (`sesion.ts`); `puedeEscribirNotas` (`personas.ts`); `lectorDePeticion` (`lector-sesion.ts`); `leerNotas` (`notas-db.ts`); `operariosDeSeccion` (`operarios.ts`); Tasks 1–4.
- Produces (contrato HTTP para Tasks 6–7):
  - `GET /api/ausencias?operarioId=` → `{ dias: number[]; rangos: Rango[] }`
  - `PUT /api/ausencias` body `{ operarioId?, dias, rangos }` → `{ ok: true }` | 400
  - `GET /api/visitas?pedido=` → `{ disponible: boolean; nombres: string[]; ausencias: Ausencias[]; ultimaNota: { texto: string; creadoAt: string } | null }`
  - `POST /api/visitas` body `{ operarioId?, ...EntradaVisita }` → `{ ok: true }` | 400 `{ error, campo }` | 403 | 503

- [ ] **Step 1: Write `src/app/api/ausencias/route.ts`**

```ts
import { NextResponse } from "next/server";
import { validarAusencias } from "@/lib/visita";
import { guardarMisAusencias, leerMisAusencias } from "@/lib/server/visitas-db";
import { identidad } from "@/lib/server/sesion";

// ─── /api/ausencias ─────────────────────────────────────────────────────────
// Las de quien pregunta, y solo las suyas: la nota de una ausencia es privada.

export const dynamic = "force-dynamic";

const hoy = () => new Date().toISOString().slice(0, 10);

export async function GET(req: Request) {
  const yo = identidad(req, new URL(req.url).searchParams.get("operarioId"));
  if (yo instanceof NextResponse) return yo;
  return NextResponse.json(leerMisAusencias(yo.id), { headers: { "Cache-Control": "no-store" } });
}

export async function PUT(req: Request) {
  let b: Record<string, unknown>;
  try {
    const v: unknown = await req.json();
    if (typeof v !== "object" || v === null) throw new Error();
    b = v as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }
  const yo = identidad(req, b.operarioId);
  if (yo instanceof NextResponse) return yo;
  const a = validarAusencias(b);
  if (!a) return NextResponse.json({ error: "Revisa los días: alguna fecha no vale" }, { status: 400 });
  guardarMisAusencias(yo.id, a, hoy());
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 1b: Write `src/app/api/ausencias/equipo/route.ts`** (para el calendario de Visitas)

```ts
import { NextResponse } from "next/server";
import { operariosDeSeccion } from "@/lib/server/operarios";
import { leerPersona } from "@/lib/server/personas-db";
import { soloConSesion } from "@/lib/server/sesion";
import { ausenciasDe } from "@/lib/server/visitas-db";

// ─── /api/ausencias/equipo ──────────────────────────────────────────────────
// Quién de OT no está qué días, para el calendario de Visitas. Sin notas: fuera
// de «Mis ausencias» una ausencia es «no está en OT» y nada más. Con sesión
// siempre: la consulta sin login usa /api/publico/visitas y no llega aquí.

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const corte = soloConSesion(req);
  if (corte) return corte;
  const ids = operariosDeSeccion("ot");
  return NextResponse.json(
    {
      nombres: Object.fromEntries(ids.map((id) => [id, (leerPersona(id)?.nombre ?? id).trim().split(/\s+/)[0]])),
      ausencias: ausenciasDe(ids),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
```

Contrato: `GET /api/ausencias/equipo` → `{ nombres: Record<string, string>; ausencias: Ausencias[] }`.

- [ ] **Step 2: Write `src/app/api/visitas/route.ts`**

```ts
import { NextResponse } from "next/server";
import { PREFIJO_NOTA_VISITA } from "@/lib/correo-visita";
import { validarVisita } from "@/lib/visita";
import { puedeEscribirNotas } from "@/lib/personas";
import { lectorDePeticion } from "@/lib/server/lector-sesion";
import { leerNotas } from "@/lib/server/notas-db";
import { operariosDeSeccion } from "@/lib/server/operarios";
import { pedirVisita } from "@/lib/server/pedir-visita";
import { identidad, soloConSesion } from "@/lib/server/sesion";
import { visitaDisponible } from "@/lib/server/visita-correo-cola";
import { ausenciasDe, nombresVisita } from "@/lib/server/visitas-db";

// ─── /api/visitas ───────────────────────────────────────────────────────────
// GET: lo que necesita la ventana de «Pedir visita». POST: la pide (nota en el
// pedido + correo a Instalaciones por la cola).

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const corte = soloConSesion(req);
  if (corte) return corte;
  const pedido = new URL(req.url).searchParams.get("pedido")?.trim() ?? "";
  if (!pedido || pedido.length > 60) return NextResponse.json({ error: "Falta pedido" }, { status: 400 });
  const disponible = visitaDisponible();
  if (!disponible) return NextResponse.json({ disponible, nombres: [], ausencias: [], ultimaNota: null });
  const ultima = leerNotas(pedido, lectorDePeticion(req))
    .filter((n) => n.texto.startsWith(PREFIJO_NOTA_VISITA))
    .at(-1);
  return NextResponse.json(
    {
      disponible,
      nombres: nombresVisita(),
      ausencias: ausenciasDe(operariosDeSeccion("ot")),
      ultimaNota: ultima ? { texto: ultima.texto, creadoAt: ultima.creadoAt } : null,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function POST(req: Request) {
  let b: Record<string, unknown>;
  try {
    const v: unknown = await req.json();
    if (typeof v !== "object" || v === null) throw new Error();
    b = v as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }
  const yo = identidad(req, b.operarioId);
  if (yo instanceof NextResponse) return yo;
  if (!puedeEscribirNotas(yo.roles)) return NextResponse.json({ error: "Esta cuenta es de solo lectura" }, { status: 403 });
  if (!visitaDisponible()) return NextResponse.json({ error: "El correo de visitas está apagado" }, { status: 503 });
  const v = validarVisita(b);
  if (!v.ok) return NextResponse.json({ error: v.error, campo: v.campo }, { status: 400 });
  try {
    pedirVisita(v.entrada, { id: yo.id, nombre: yo.nombre });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message, campo: "atienden" }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
```

Comprobar los nombres de campo de `NotaPedido` (`texto`, `creadoAt`) y el orden de `leerNotas` (si devuelve la más nueva primero, usar `.find` en vez de `.filter(...).at(-1)`).

- [ ] **Step 3: Typecheck y lint**

Run: `pnpm exec tsc --noEmit` y `pnpm lint`
Expected: sin errores nuevos.

- [ ] **Step 4: Prueba manual de humo** (dev server ya arrancado por Iván, o `pnpm dev`)

```bash
curl -s "http://localhost:3000/api/visitas?pedido=AR.26.05448"
```
Expected con `CORREO_VISITA=off`: `{"disponible":false,...}`.

- [ ] **Step 5: Commit** (solo con autorización)

```bash
git add src/app/api/ausencias/route.ts src/app/api/ausencias/equipo/route.ts src/app/api/visitas/route.ts
git commit -m "feat(visita): rutas de ausencias y de pedir visita"
```

---

### Task 6: «Mis ausencias» y ausencias en el calendario de Visitas

Antes: ejecutar la skill `modern-web-guidance` para `<dialog>` modal y leer `docs/ESTILO-HEROUI.md` y `src/components/ConfirmDialog.tsx` (patrón `<dialog>` + `showModal()`).

**Files:**
- Create: `src/components/MisAusencias.tsx`
- Modify: `src/components/CalendarioVisitas.tsx` (prop opcional `ausentes`; días con ausencia pinchables; franja; leyenda)
- Modify: `src/components/VisitasCotView.tsx` (prop opcional `ausencias`; carga `/api/ausencias/equipo`; botón «Mis ausencias»; línea «No están en OT» del día)
- Modify: `src/components/Board.tsx` (~línea 3361: `<VisitasCotView ausencias={{ miId }} />`)
- NO tocar `src/components/Consulta.tsx`: sin la prop, la consulta sin login no pide ni pinta ausencias.

**Interfaces:**
- Consumes: `GET/PUT /api/ausencias`, `GET /api/ausencias/equipo` (Task 5); `Rango`, `Ausencias`, `ausentesPorDia`, `unirNombres` (Task 1); `celdasDelMes` (ya en `CalendarioVisitas.tsx`).
- Produces:
  - `MisAusencias({ miId: string | null; onCerrar: () => void; onGuardado?: () => void })`
  - `CalendarioVisitas` acepta `ausentes?: Record<string, string[]>` (fecha → nombres).
  - `VisitasCotView` acepta `ausencias?: { miId: string | null }`.

- [ ] **Step 1: Write `MisAusencias.tsx`**

```tsx
"use client";

import { useEffect, useRef, useState } from "react";
import type { Rango } from "@/lib/visita";

// «Mis ausencias» (spec 2026-11-19): teletrabajo fijo y días sueltos. Sirven
// para rellenar «No estamos en OT» al pedir una visita. La nota es solo tuya.

const DIAS = [
  { n: 1, letra: "L" }, { n: 2, letra: "M" }, { n: 3, letra: "X" }, { n: 4, letra: "J" }, { n: 5, letra: "V" },
];

export function MisAusencias({ miId, onCerrar, onGuardado }: {
  miId: string | null; onCerrar: () => void; onGuardado?: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [dias, setDias] = useState<number[]>([]);
  const [rangos, setRangos] = useState<Rango[]>([]);
  const [estado, setEstado] = useState<"cargando" | "listo" | "guardando" | "error">("cargando");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    ref.current?.showModal();
    const q = miId ? `?operarioId=${encodeURIComponent(miId)}` : "";
    fetch(`/api/ausencias${q}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((a: { dias: number[]; rangos: Rango[] }) => { setDias(a.dias); setRangos(a.rangos); setEstado("listo"); })
      .catch(() => { setEstado("error"); setError("No he podido cargar tus ausencias"); });
  }, [miId]);

  const cambiarDia = (n: number) => setDias((d) => (d.includes(n) ? d.filter((x) => x !== n) : [...d, n].sort()));
  const cambiarRango = (i: number, cambio: Partial<Rango>) =>
    setRangos((rs) => rs.map((r, j) => (j === i ? { ...r, ...cambio } : r)));

  async function guardar() {
    setEstado("guardando");
    setError(null);
    const r = await fetch("/api/ausencias", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ operarioId: miId, dias, rangos: rangos.filter((x) => x.desde && x.hasta) }),
    }).catch(() => null);
    if (r?.ok) {
      onGuardado?.();
      return onCerrar();
    }
    setEstado("listo");
    setError(((await r?.json().catch(() => null)) as { error?: string } | null)?.error ?? "No se ha podido guardar");
  }

  return (
    <dialog
      ref={ref}
      onClose={onCerrar}
      aria-labelledby="mis-ausencias-titulo"
      className="w-[min(560px,calc(100vw-2rem))] rounded-[24px] bg-surface p-6 text-text backdrop:bg-black/40"
    >
      <h2 id="mis-ausencias-titulo" className="text-lg font-semibold">Mis ausencias</h2>
      <p className="mt-1 text-sm text-text-muted">Salen en el calendario de Visitas y en el correo al pedir una visita, como «no está en OT». La nota solo la ves tú.</p>

      <section className="mt-5">
        <h3 className="text-sm font-semibold">Teletrabajo fijo</h3>
        <div className="mt-2 flex gap-2" role="group" aria-label="Días de teletrabajo">
          {DIAS.map((d) => (
            <button
              key={d.n}
              type="button"
              aria-pressed={dias.includes(d.n)}
              onClick={() => cambiarDia(d.n)}
              className={`h-9 w-9 rounded-full text-sm font-semibold ${dias.includes(d.n) ? "bg-brand-400 text-brand-950" : "bg-surface-2 text-text"}`}
            >
              {d.letra}
            </button>
          ))}
        </div>
      </section>

      <section className="mt-5">
        <h3 className="text-sm font-semibold">Días sueltos (vacaciones, libres…)</h3>
        <ul className="mt-2 space-y-2">
          {rangos.map((r, i) => (
            <li key={i} className="flex flex-wrap items-center gap-2">
              <input type="date" aria-label="Desde" value={r.desde} onChange={(e) => cambiarRango(i, { desde: e.target.value, hasta: r.hasta || e.target.value })}
                className="rounded-[14px] bg-surface-2 px-3 py-1.5 text-sm shadow-[var(--hero-sombra-campo)]" />
              <span className="text-sm text-text-muted">al</span>
              <input type="date" aria-label="Hasta" value={r.hasta} min={r.desde} onChange={(e) => cambiarRango(i, { hasta: e.target.value })}
                className="rounded-[14px] bg-surface-2 px-3 py-1.5 text-sm shadow-[var(--hero-sombra-campo)]" />
              <input type="text" aria-label="Nota (solo la ves tú)" placeholder="Nota (solo tú)" maxLength={200} value={r.nota ?? ""}
                onChange={(e) => cambiarRango(i, { nota: e.target.value })}
                className="min-w-0 flex-1 rounded-[14px] bg-surface-2 px-3 py-1.5 text-sm shadow-[var(--hero-sombra-campo)]" />
              <button type="button" onClick={() => setRangos((rs) => rs.filter((_, j) => j !== i))}
                className="rounded-full px-3 py-1.5 text-sm text-text-muted hover:bg-surface-2" aria-label="Quitar estos días">Quitar</button>
            </li>
          ))}
        </ul>
        <button type="button" onClick={() => setRangos((rs) => [...rs, { desde: "", hasta: "" }])}
          className="mt-2 rounded-full bg-surface-2 px-4 py-1.5 text-sm font-semibold">+ Añadir días</button>
      </section>

      {error && <p role="alert" className="mt-4 text-sm text-error">{error}</p>}

      <div className="mt-6 flex justify-end gap-2">
        <button type="button" onClick={() => ref.current?.close()} className="rounded-full px-4 py-2 text-sm font-semibold hover:bg-surface-2">Cancelar</button>
        <button type="button" onClick={guardar} disabled={estado !== "listo"}
          className="rounded-full bg-brand-400 px-5 py-2 text-sm font-semibold text-brand-950 disabled:opacity-50">
          {estado === "guardando" ? "Guardando…" : "Guardar"}
        </button>
      </div>
    </dialog>
  );
}
```

Revisar en `src/app/globals.css` que existen `bg-surface`, `bg-surface-2`, `text-text`, `text-text-muted`, `text-error`, `brand-400`, `brand-950`; sustituir por los tokens reales si alguno cambia de nombre.

- [ ] **Step 2: `CalendarioVisitas.tsx`: pintar ausencias**

Prop nueva (opcional; sin ella el calendario queda como hoy):

```tsx
  /** Fecha → nombres de OT que no están. Solo con sesión; la consulta sin
   *  login no la pasa. */
  ausentes?: Record<string, string[]>;
```

Añadirla a la desestructuración (`ausentes = {}`) y, dentro del `celdas.map`:

```tsx
          const fuera = ausentes[fecha] ?? [];
```

Cambios en el `<button>` del día:
- `disabled={!tiene && fuera.length === 0}`: un día sin visitas pero con alguien fuera se puede pinchar.
- En el `title`, añadir tras lo de las visitas: `${fuera.length ? `${tiene ? " · " : ""}No están: ${fuera.join(", ")}` : ""}` (y quitar el `: undefined` cuando hay ausencias).
- En la clase, `fuera.length > 0 && !tiene` cuenta como día con algo: `font-semibold text-text hover:bg-[var(--glass-highlight)]`.
- Dentro del botón, tras el punto de visitas:

```tsx
              {fuera.length > 0 && !activo && (
                <span aria-hidden="true" className="absolute inset-x-1.5 top-0.5 h-0.5 rounded-full bg-red-500" />
              )}
```

Arriba, no abajo: abajo está el punto de visitas y se pisarían.

Leyenda, tras «hechas», solo si se pasó la prop:

```tsx
        {Object.keys(ausentes).length > 0 && (
          <span className="flex items-center gap-1">
            <span className="h-0.5 w-2.5 rounded-full bg-red-500" /> falta alguien de OT
          </span>
        )}
```

Un día con alguien fuera y sin visitas: el texto de la cabecera de la lista ya dice «0 visitas»; la línea del Step 3 dice quién falta.

- [ ] **Step 3: `VisitasCotView.tsx`: cargar, enseñar y editar**

Prop nueva:

```tsx
  /** Ausencias de OT en el calendario y botón «Mis ausencias». Solo la pasa
   *  el tablero (con sesión); la consulta sin login no. */
  ausencias?: { miId: string | null };
```

Imports: `import { MisAusencias } from "./MisAusencias";` y `import { ausentesPorDia, diaSemana, unirNombres, type Ausencias } from "@/lib/visita";`. Más `celdasDelMes` (ya exportada de `./CalendarioVisitas`).

Estado y carga (junto a los demás `useState`/`useEffect`):

```tsx
  const [equipo, setEquipo] = useState<{ nombres: Record<string, string>; ausencias: Ausencias[] } | null>(null);
  const [misAusenciasAbierto, setMisAusenciasAbierto] = useState(false);
  const [vueltaAusencias, setVueltaAusencias] = useState(0);
  const conAusencias = ausencias !== undefined;

  useEffect(() => {
    if (!conAusencias) return;
    let vivo = true;
    fetch("/api/ausencias/equipo", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (vivo) setEquipo(d); })
      .catch(() => {});
    return () => { vivo = false; };
  }, [conAusencias, vueltaAusencias]);

  const ausentesMes = useMemo(() => {
    if (!equipo) return {};
    const dias = celdasDelMes(mes).filter((d): d is string => d !== null);
    const ids = equipo.ausencias.map((a) => a.operarioId);
    const porDia = ausentesPorDia(dias, equipo.ausencias, ids);
    const salida: Record<string, string[]> = {};
    for (const [fecha, quien] of Object.entries(porDia)) {
      // Un rango de vacaciones de lunes a domingo no marca el finde.
      if (quien.length && diaSemana(fecha) <= 5) salida[fecha] = quien.map((id) => equipo.nombres[id] ?? id);
    }
    return salida;
  }, [equipo, mes]);
```

En el render, pasar al calendario `ausentes={ausentesMes}` y, debajo del calendario (dentro del mismo `div` sticky):

```tsx
          {conAusencias && (
            <button
              type="button"
              onClick={() => setMisAusenciasAbierto(true)}
              className="mt-2 w-full rounded-full bg-surface-2 py-1.5 text-xs font-semibold text-text hover:brightness-95"
            >
              Mis ausencias
            </button>
          )}
```

Con un día elegido, justo debajo del `<h2>` del título del día:

```tsx
          {dia && ausentesMes[dia] && (
            <p className="w-full rounded-[14px] bg-red-500/12 px-3 py-1.5 text-xs font-semibold text-red-700 dark:text-red-300">
              No están en OT: {unirNombres(ausentesMes[dia])}
            </p>
          )}
```

(Si el `<h2>` vive dentro de un `flex flex-wrap`, `w-full` lo pasa a su propia línea.)

Al final del componente:

```tsx
      {misAusenciasAbierto && ausencias && (
        <MisAusencias
          miId={ausencias.miId}
          onCerrar={() => setMisAusenciasAbierto(false)}
          onGuardado={() => setVueltaAusencias((n) => n + 1)}
        />
      )}
```

- [ ] **Step 3b: `Board.tsx`**

Línea ~3361: `<VisitasCotView />` → `<VisitasCotView ausencias={{ miId }} />`. Comprobar que la variable de identidad en ese punto se llama `miId` (hay también `miIdLocal`; usar la misma que se pasa a `PanelImpresoras`).

- [ ] **Step 4: Typecheck, lint, tests**

Run: `pnpm exec tsc --noEmit && pnpm lint && pnpm test`
Expected: sin errores nuevos.

- [ ] **Step 5: Commit** (solo con autorización)

```bash
git add src/components/MisAusencias.tsx src/components/CalendarioVisitas.tsx src/components/VisitasCotView.tsx src/components/Board.tsx
git commit -m "feat(visita): ausencias de OT en el calendario de Visitas"
```

---

### Task 7: Ventana «Pedir visita» y botón en la ficha

Antes: `modern-web-guidance` (dialog, datalist, formulario) y la maqueta `tmp/maqueta-pedir-visita.html` (servir con `python -m http.server 8765 --bind 127.0.0.1` desde `tmp/` para verla en Playwright).

**Files:**
- Create: `src/components/PedirVisita.tsx`
- Modify: `src/components/Drawer.tsx` (línea ~734 `acciones=…`; línea ~862 `key` de `NotasPedido`)

**Interfaces:**
- Consumes: `GET/POST /api/visitas` (Task 5); de Task 1 `Ausencias`, `Cuando`, `ausentesPorDia`, `diasLaborables`, `diasNoEstamos`, `diaCorto`, `unirNombres`; tipos `Pedido`, `Operario` de `@/lib/types`.
- Produces: `PedirVisita({ pedido: Pedido; operarios: Operario[]; miId: string | null; onPedida: () => void })`.

- [ ] **Step 1: Write `PedirVisita.tsx`**

```tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Operario, Pedido } from "@/lib/types";
import {
  ausentesPorDia, diaCorto, diasLaborables, diasNoEstamos, unirNombres, type Ausencias, type Cuando,
} from "@/lib/visita";

// «Pedir visita» (spec 2026-11-19): un instalador o comercial viene a OT. Manda
// el correo a Instalaciones con los días que no estamos y deja nota en el
// pedido. La fecha de verdad la pone RPS; aquí no se guarda ninguna.

interface DatosVentana {
  disponible: boolean;
  nombres: string[];
  ausencias: Ausencias[];
  ultimaNota: { texto: string; creadoAt: string } | null;
}

const hoyIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const primer = (n: string) => n.trim().split(/\s+/)[0] ?? n;

export function PedirVisita({ pedido, operarios, miId, onPedida }: {
  pedido: Pedido; operarios: Operario[]; miId: string | null; onPedida: () => void;
}) {
  const [datos, setDatos] = useState<DatosVentana | null>(null);
  const [abierta, setAbierta] = useState(false);

  useEffect(() => {
    let vivo = true;
    fetch(`/api/visitas?pedido=${encodeURIComponent(pedido.codigo)}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: DatosVentana | null) => { if (vivo) setDatos(d); })
      .catch(() => {});
    return () => { vivo = false; };
  }, [pedido.codigo, abierta]);

  if (!datos?.disponible) return null;
  return (
    <>
      <button type="button" onClick={() => setAbierta(true)}
        className="rounded-full bg-surface-2 px-3 py-1.5 text-xs font-semibold text-text hover:brightness-95">
        Pedir visita
      </button>
      {abierta && (
        <VentanaVisita pedido={pedido} operarios={operarios} miId={miId} datos={datos}
          onCerrar={() => setAbierta(false)} onPedida={() => { setAbierta(false); onPedida(); }} />
      )}
    </>
  );
}

function VentanaVisita({ pedido, operarios, miId, datos, onCerrar, onPedida }: {
  pedido: Pedido; operarios: Operario[]; miId: string | null; datos: DatosVentana; onCerrar: () => void; onPedida: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { ref.current?.showModal(); }, []);

  const deOT = useMemo(() => operarios.filter((o) => !o.seccion || o.seccion === "ot"), [operarios]);
  const nombre = (id: string) => primer(operarios.find((o) => o.id === id)?.nombre ?? id);

  const [ofs, setOfs] = useState<string[]>(pedido.ofs.length === 1 ? [pedido.ofs[0].id] : []);
  const [viene, setViene] = useState("");
  const [cuando, setCuando] = useState<Cuando>({ tipo: "pronto" });
  const [fechaDia, setFechaDia] = useState("");
  const [motivo, setMotivo] = useState("");
  const [atienden, setAtienden] = useState<string[]>(miId ? [miId] : []);
  const [retoques, setRetoques] = useState<Record<string, boolean>>({});
  const [errores, setErrores] = useState<Record<string, string>>({});
  const [enviando, setEnviando] = useState(false);

  const hoy = hoyIso();
  const dias = useMemo(() => diasLaborables(hoy), [hoy]);
  const ausentes = useMemo(() => ausentesPorDia(dias, datos.ausencias, atienden), [dias, datos.ausencias, atienden]);
  const fuera = useMemo(() => diasNoEstamos(dias, ausentes, retoques, atienden), [dias, ausentes, retoques, atienden]);
  const fueraPor = new Map(fuera.map((f) => [f.fecha, f.quien]));
  const elegido = cuando.tipo === "dia" ? cuando.fecha : null;
  const avisoDia = elegido && fueraPor.has(elegido) ? `El ${diaCorto(elegido)} no estáis todos en OT.` : null;

  const etiqueta = (quien: string[]) =>
    quien.length === atienden.length && atienden.length > 1 ? (atienden.length === 2 ? "Ambos" : "Todos") : unirNombres(quien.map(nombre));

  const cambiarDia = (fecha: string) =>
    setRetoques((r) => {
      const n = { ...r };
      if (fecha in n) delete n[fecha];
      else n[fecha] = !((ausentes[fecha] ?? []).length > 0);
      return n;
    });

  async function enviar() {
    const e: Record<string, string> = {};
    if (ofs.length === 0) e.ofs = "Marca al menos una OF";
    if (!viene.trim()) e.viene = "Escribe quién tiene que venir";
    if (atienden.length === 0) e.atienden = "Tiene que atenderle alguien";
    if (cuando.tipo === "dia" && !cuando.fecha) e.cuando = "Elige el día";
    setErrores(e);
    if (Object.keys(e).length) return;
    setEnviando(true);
    const r = await fetch("/api/visitas", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        operarioId: miId,
        pedido: pedido.codigo,
        cliente: pedido.cliente,
        solicitada: pedido.fechaEntrega || null,
        prioridad: pedido.prioridad,
        ofs: pedido.ofs.filter((o) => ofs.includes(o.id)).map((o) => ({ codigo: o.codigo, descripcion: o.descripcion })),
        viene: viene.trim(),
        cuando,
        motivo: motivo.trim(),
        atienden,
        noEstamos: fuera,
      }),
    }).catch(() => null);
    setEnviando(false);
    if (r?.ok) return onPedida();
    const j = (await r?.json().catch(() => null)) as { error?: string; campo?: string } | null;
    setErrores({ [j?.campo ?? "general"]: j?.error ?? "No se ha podido pedir la visita" });
  }

  const campo = "rounded-[14px] bg-surface-2 px-3 py-2 text-sm shadow-[var(--hero-sombra-campo)]";
  const err = (k: string) => errores[k] && <p role="alert" className="mt-1 text-xs text-error">{errores[k]}</p>;

  return (
    <dialog ref={ref} onClose={onCerrar} aria-labelledby="pedir-visita-titulo"
      className="w-[min(720px,calc(100vw-2rem))] max-h-[calc(100vh-2rem)] overflow-y-auto rounded-[24px] bg-surface p-6 text-text backdrop:bg-black/40">
      <h2 id="pedir-visita-titulo" className="text-lg font-semibold">Pedir visita a Oficina Técnica</h2>
      <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
        <b className="font-mono">{pedido.codigo}</b><span>{pedido.cliente}</span>
        {pedido.fechaEntrega && <span className="rounded-full bg-surface-2 px-2.5 py-0.5 text-xs"><b>Solicitada</b> {diaCorto(pedido.fechaEntrega)}</span>}
        <span className="rounded-full bg-surface-2 px-2.5 py-0.5 text-xs"><b>Prioridad</b> {pedido.prioridad}</span>
        <span className="text-xs text-text-muted">{pedido.ofs.length} OF</span>
      </div>
      {datos.ultimaNota && (
        <p className="mt-3 rounded-[14px] bg-surface-2 px-3 py-2 text-xs text-text-muted">Última pedida: {datos.ultimaNota.texto}</p>
      )}

      <fieldset className="mt-4">
        <legend className="text-sm font-semibold">OF</legend>
        <div className="mt-1 space-y-1">
          {pedido.ofs.map((o) => (
            <label key={o.id} className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={ofs.includes(o.id)}
                onChange={() => setOfs((s) => (s.includes(o.id) ? s.filter((x) => x !== o.id) : [...s, o.id]))} />
              <b className="font-mono">{o.codigo}</b> <span>{o.descripcion}</span>
            </label>
          ))}
        </div>
        {err("ofs")}
      </fieldset>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <label className="block text-sm font-semibold">Viene
          <input list="visita-nombres" value={viene} onChange={(e) => setViene(e.target.value)} maxLength={80}
            placeholder="Instalador o comercial" className={`mt-1 block w-full font-normal ${campo}`} />
          <datalist id="visita-nombres">{datos.nombres.map((n) => <option key={n} value={n} />)}</datalist>
          {err("viene")}
        </label>
        <div className="text-sm">
          <span className="font-semibold">Cuándo</span>
          <div className="tira-3d mt-1 flex w-fit rounded-full p-1" role="radiogroup" aria-label="Cuándo">
            {([["pronto", "Lo antes posible"], ["dia", "Un día"], ["sinPrisa", "Sin prisa"]] as const).map(([t, txt]) => (
              <button key={t} type="button" role="radio" aria-checked={cuando.tipo === t}
                onClick={() => setCuando(t === "dia" ? { tipo: "dia", fecha: fechaDia } : { tipo: t })}
                className={`whitespace-nowrap rounded-full px-3 py-1 text-xs font-semibold ${cuando.tipo === t ? "pestana-activa" : ""}`}>
                {txt}
              </button>
            ))}
          </div>
          {cuando.tipo === "dia" && (
            <input type="date" min={hoy} value={fechaDia} aria-label="Día de la visita"
              onChange={(e) => { setFechaDia(e.target.value); setCuando({ tipo: "dia", fecha: e.target.value }); }}
              className={`mt-2 ${campo}`} />
          )}
          {err("cuando")}
        </div>
      </div>

      <label className="mt-4 block text-sm font-semibold">Motivo <span className="font-normal text-text-muted">(opcional)</span>
        <textarea value={motivo} onChange={(e) => setMotivo(e.target.value)} maxLength={500} rows={2}
          className={`mt-1 block w-full font-normal ${campo}`} />
      </label>

      <fieldset className="mt-4">
        <legend className="text-sm font-semibold">Le atiende</legend>
        <div className="mt-1 flex flex-wrap gap-2">
          {deOT.map((o) => (
            <button key={o.id} type="button" aria-pressed={atienden.includes(o.id)}
              onClick={() => setAtienden((s) => (s.includes(o.id) ? s.filter((x) => x !== o.id) : [...s, o.id]))}
              className={`rounded-full px-3 py-1 text-xs font-semibold ${atienden.includes(o.id) ? "bg-brand-400 text-brand-950" : "bg-surface-2"}`}>
              {primer(o.nombre)}
            </button>
          ))}
        </div>
        {err("atienden")}
      </fieldset>

      <fieldset className="mt-4">
        <legend className="text-sm font-semibold">No estamos en OT</legend>
        <p className="text-xs text-text-muted">Sale de «Mis ausencias». Pincha un día para quitarlo o añadirlo solo en esta visita.</p>
        <div className="mt-2 grid grid-cols-5 gap-1.5">
          {dias.map((d) => {
            const quien = fueraPor.get(d);
            const pasado = d < hoy;
            const borde = d === elegido ? "ring-2 ring-emerald-500" : d === pedido.fechaEntrega ? "ring-2 ring-brand-500" : "";
            return (
              <button key={d} type="button" disabled={pasado} aria-pressed={!!quien} onClick={() => cambiarDia(d)}
                className={`rounded-[14px] px-2 py-1.5 text-left text-xs ${quien ? "bg-red-500/12 text-red-700 dark:text-red-300" : "bg-surface-2"} ${borde} disabled:opacity-40`}>
                <div className="font-semibold">{diaCorto(d)}</div>
                <div className="truncate">{quien ? etiqueta(quien) : " "}</div>
              </button>
            );
          })}
        </div>
      </fieldset>

      {avisoDia && <p className="mt-3 text-sm text-yellow-800 dark:text-yellow-300">{avisoDia}</p>}
      {err("general")}

      <div className="mt-6 flex justify-end gap-2">
        <button type="button" onClick={() => ref.current?.close()} className="rounded-full px-4 py-2 text-sm font-semibold hover:bg-surface-2">Cancelar</button>
        <button type="button" onClick={enviar} disabled={enviando}
          className="rounded-full bg-brand-400 px-5 py-2 text-sm font-semibold text-brand-950 disabled:opacity-50">
          {enviando ? "Enviando…" : "Pedir visita"}
        </button>
      </div>
    </dialog>
  );
}
```

Revisar tokens (`text-success`/`ring-emerald-500`, `text-yellow-800 dark:text-yellow-300`, `bg-danger/15`) en `globals.css`; sustituir por los reales. Comprobar que `Operario.seccion` admite `"ot"` o ausente (= OT) y que `Pedido.ofs[].id` existe.

- [ ] **Step 2: Drawer: botón y recarga del hilo**

Import: `import { PedirVisita } from "./PedirVisita";`. Estado cerca de los demás `useState` del Drawer:

```ts
  const [visitasPedidas, setVisitasPedidas] = useState(0);
```

Línea ~734:

```tsx
          acciones={
            <>
              <PedirVisita pedido={pedido} operarios={operarios} miId={miId} onPedida={() => setVisitasPedidas((n) => n + 1)} />
              <AtajosPedido codigo={pedido.codigo} plantear={plantear} />
            </>
          }
```

Línea ~862, el `key` de `NotasPedido` (así el hilo se recarga y enseña la nota nueva):

```tsx
            key={`notas:${pedido.codigo}:${visitasPedidas}`}
```

Si `acciones` se pinta dentro de un contenedor sin `flex gap`, envolver en `<div className="flex items-center gap-2">` en vez del fragmento.

- [ ] **Step 3: Typecheck, lint, tests**

Run: `pnpm exec tsc --noEmit && pnpm lint && pnpm test`
Expected: sin errores nuevos.

- [ ] **Step 4: Prueba en el navegador** (`.env.local` de desarrollo: `CORREO_VISITA=ensayo`, credenciales `GRAPH_*` presentes; si no hay credenciales en local, el botón no sale: para la prueba visual poner temporalmente `GRAPH_*` de ensayo o revisar solo con la ruta)

- Abrir un pedido con varias OF → «Pedir visita» → marcar 2 OF, «Viene», «Un día», motivo, añadir compañero, retocar un día.
- Enviar → la ventana se cierra y aparece la nota en el hilo.
- Comprobar fila en `visita_correo` (`estado` pendiente → enviado tras ≤ 30 s) y el correo en el buzón de ensayo.
- Capturas 1280×720 en claro y oscuro de la ventana y de «Mis ausencias»; comparar con `tmp/maqueta-pedir-visita.png`.
- Pasar el agente `ui-reviewer` sobre `PedirVisita.tsx` y `MisAusencias.tsx`.

- [ ] **Step 5: Commit** (solo con autorización)

```bash
git add src/components/PedirVisita.tsx src/components/Drawer.tsx
git commit -m "feat(visita): ventana Pedir visita en la ficha del pedido"
```

---

### Task 8: Configuración, verificación final y Novedad

**Files:**
- Modify: `.env.example` (tras el bloque `CORREO_*` del planteamiento, ~línea 203)

- [ ] **Step 1: `.env.example`**

```bash
# ─── Pedir visita (spec 2026-11-19) ───────────────────────────────────────────
# off: el botón no sale. ensayo: todo a CORREO_ENSAYO_PARA. activo: a Instalaciones.
CORREO_VISITA=off
# Para (Instalaciones). Sin esto, en activo el botón no sale.
CORREO_VISITA_PARA=
# Copia: Oficina Técnica y Producción, separados por comas.
CORREO_VISITA_CC=of.tecnica@toldosgomez.com,produccion@toldosgomez.com
```

- [ ] **Step 2: Verificación completa**

Run: `pnpm test && pnpm lint && pnpm exec tsc --noEmit && pnpm build`
Expected: todo en verde. Anotar cualquier fallo ya existente antes del cambio.

- [ ] **Step 3: `git status`**

Confirmar que siguen intactos y sin añadir: `src/components/vista-belen/FilaOFBelen.tsx`, `src/lib/server/vista-belen-db.ts`, `src/lib/vista-belen.ts`.

- [ ] **Step 4: Commit final con Novedad** (solo con autorización; si se hizo un único commit, la Novedad va en él)

```bash
git add .env.example
git commit -m "$(cat <<'EOF'
feat(visita): configuración del correo de visitas

Novedad[ot]: nuevo | Pedir visita a Instalaciones desde el pedido
Detalle: Marcas las OF, quién viene y el motivo; el correo lleva los días que no estáis en la oficina y queda nota en el pedido.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 5: Despliegue** (solo si Iván lo pide): en el servidor añadir al `.env` real `CORREO_VISITA=ensayo` primero, `CORREO_VISITA_PARA=<correo de Instalaciones>` y `CORREO_VISITA_CC`; después del push, dar el comando de pull/build/pm2 listo para pegar.

---

## Pendiente de confirmar con Iván antes de activar

- Dirección de correo de Instalaciones (`CORREO_VISITA_PARA`): no hay valor por defecto.
- Si las copias deben ser exactamente `of.tecnica@` y `produccion@` (las del ejemplo del correo manual).
