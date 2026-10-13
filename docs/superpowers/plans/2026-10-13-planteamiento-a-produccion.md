# Planteamiento de CAD impreso en Producción — plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Al pasar a Producción un pedido de Oficina Técnica, CoordinaOT busca su planteamiento de CAD en la carpeta Planteamientos y lo imprime solo en la impresora de Producción. Si alguna página no es A4, abre el cuadro de imprimir. En el Historial se ve el estado y hay un botón «Reimprimir».

**Architecture:** Las reglas puras (nombres, años, A4) van en `lib/planteamiento.ts`. La lectura de carpetas y PDF va en `lib/server/planteamiento-pdf.ts`, y el cliente IPP mínimo en `lib/server/ipp.ts`. Una cola SQLite (`planteamiento_impresion`) con su trabajador, como la de OLANET. El servidor decide qué se imprime dentro del `completar` de `/api/estado`. La UI añade una línea al diálogo de pasar y un bloque en la ficha del Historial.

**Tech Stack:** Next.js 16 (lee `node_modules/next/dist/docs/` antes de crear rutas), TypeScript, better-sqlite3, pdfjs-dist 6 (ya está), Vitest. `pdf-lib` entra solo como devDependency, para fabricar PDF en los tests.

**Spec:** `docs/superpowers/specs/2026-10-13-planteamiento-a-produccion-design.md`

## Global Constraints

- Solo pedidos de la sección `ot`. Diseño e Impresión nunca imprimen.
- Los PDF que llevan adjunto `*.toldos.json` o `*.remolques.json` (de `toldos-testar`) NUNCA se imprimen.
- Impresión: 1 copia, `sides=one-sided`, `media=iso_a4_210x297mm`, `document-format=application/pdf`.
- A4 = 595.28 × 841.89 puntos, con margen de 3 puntos y en cualquier orientación.
- Carpeta Planteamientos: `PLANTEAMIENTOS_DIR` (servidor: `/mnt/escaner/Planteamientos`, sin año). Nombre compacto: `AR2605016-10.pdf`.
- Archivo de RPS: `PLANTEAMIENTOS_ARCHIVO_DIR` (servidor: `/mnt/rps/VENTAS/PLANTEAMIENTOS/{YYYY}`). Nombre con puntos: `AR.26.05016-10.pdf`.
- Modo `IMPRESION_PRODUCCION`: `off` (por defecto) | `ensayo` | `activo`.
  - `activo` imprime en `IMPRESORA_PRODUCCION`, por defecto `ipp://192.168.4.245/ipp`.
  - `ensayo` imprime en `IMPRESORA_ENSAYO`, por defecto `ipp://192.168.4.249/ipp` (la de OT).
- El servidor recalcula qué se imprime al pasar el pedido. Nunca se fía del navegador.
- Imprimir NUNCA bloquea ni hace fallar el paso a Producción: todo va envuelto en try/catch.
- Comentarios en español que expliquen el porqué, con la densidad del fichero que se toca.
- Parámetros de texto en SQL de OLANET o RPS siempre tipados. Aquí solo se usa SQLite, pero se respeta si se toca algo de mssql.
- Solo el último commit lleva la línea `Novedad:`.
- `vi.mock("../server/olanet-outbox")` de `api-estado.test.ts` exporta solo `encolarFinalizacion`. Lo nuevo va en módulos nuevos, nunca en `olanet-outbox.ts`.
- La campana NO entra en esta versión: el estado se ve en el Historial. Es la alternativa que prevé la spec, porque los avisos solo existen para pedidos en el tablero.
- Comandos: `pnpm test <ruta>`, `pnpm test`, `pnpm exec tsc --noEmit`, `pnpm lint`.

## Mapa de ficheros

| Fichero | Responsabilidad |
|---|---|
| `src/lib/planteamiento.ts` (nuevo) | Reglas puras: partes del código, nombres, sufijo, año, A4. |
| `src/lib/server/pdfjs.ts` (nuevo) | Carga compartida de pdfjs en Node (sale de `miniaturas.ts`). |
| `src/lib/server/miniaturas.ts` | Usa `pdfjs.ts`. |
| `src/lib/server/planteamiento-pdf.ts` (nuevo) | `leerPdf`, `carpetasPlanteamiento`, `planteamientosDe`. |
| `src/lib/server/ipp.ts` (nuevo) | Bytes de `Print-Job`, lectura de la respuesta, `imprimirPdf`. |
| `src/lib/server/estado-db.ts` | Tabla `planteamiento_impresion`. |
| `src/lib/server/impresion-cola.ts` (nuevo) | Modo, destino, `prepararImpresion`, estados de la cola. |
| `src/lib/server/impresion-worker.ts` (nuevo) | Vuelta cada 30 s, con esperas crecientes. |
| `src/instrumentation.ts` | Arranca el trabajador. |
| `.env.example` | Sección de impresión. |
| `src/app/api/estado/route.ts` | Llama a `prepararImpresion` al completar en OT. |
| `src/app/api/planteamiento/route.ts` (nuevo) | GET: vista previa y estado. |
| `src/app/api/planteamiento/fichero/route.ts` (nuevo) | GET: el PDF, para imprimirlo a mano. |
| `src/app/api/planteamiento/reimprimir/route.ts` (nuevo) | POST: reimprimir. |
| `src/components/Board.tsx` | Diálogo de pasar: línea, casilla e impresión manual. |
| `src/components/PlanteamientoPedido.tsx` (nuevo) | Bloque de la ficha del Historial. |
| `src/components/HistorialDrawer.tsx` | Lo monta tras `DocumentosPedido`. |
| `scripts/verificar-planteamientos.test.ts` (nuevo) | Comprobación opt-in contra carpetas e impresora. |

---

### Task 1: Reglas puras de nombres y tamaños

**Files:**
- Create: `src/lib/planteamiento.ts`
- Test: `src/lib/__tests__/planteamiento.test.ts`

**Interfaces:**
- Produces:
  - `partesPedido(codigo: string): { serie: string; yy: string; numero: string } | null`
  - `nombreCompacto(codigo: string): string | null`
  - `anioPedido(codigo: string): number | null`
  - `sufijoDe(fichero: string, codigo: string): string | null`
  - `nombreArchivoRps(codigo: string, sufijo: string): string`
  - `conAnio(plantilla: string, anio: number): string`
  - `esA4(ancho: number, alto: number): boolean`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import { anioPedido, conAnio, esA4, nombreArchivoRps, nombreCompacto, partesPedido, sufijoDe } from "../planteamiento";

describe("nombres del planteamiento", () => {
  it("parte el código de pedido", () => {
    expect(partesPedido("AR.26.05016")).toEqual({ serie: "AR", yy: "26", numero: "05016" });
    expect(partesPedido("SA.26.00498")).toEqual({ serie: "SA", yy: "26", numero: "00498" });
    expect(partesPedido("sin-pedido:3")).toBeNull();
  });

  it("el nombre compacto es el de la carpeta Planteamientos", () => {
    expect(nombreCompacto("AR.26.05016")).toBe("AR2605016");
    expect(nombreCompacto("nada")).toBeNull();
  });

  it("el año sale de las dos cifras tras la serie", () => {
    expect(anioPedido("AR.26.05016")).toBe(2026);
    expect(anioPedido("BE.25.00001")).toBe(2025);
  });

  it("el sufijo sale tanto del nombre compacto como del de RPS", () => {
    expect(sufijoDe("AR2605016-10.pdf", "AR.26.05016")).toBe("-10");
    expect(sufijoDe("AR.26.05016-1.PDF", "AR.26.05016")).toBe("-1");
    // Otro pedido, sin sufijo o con añadidos: no es su planteamiento.
    expect(sufijoDe("AR2605017-10.pdf", "AR.26.05016")).toBeNull();
    expect(sufijoDe("AR2605016.pdf", "AR.26.05016")).toBeNull();
    expect(sufijoDe("AR2605016-10 copia.pdf", "AR.26.05016")).toBeNull();
  });

  it("el nombre en el archivo de RPS lleva puntos", () => {
    expect(nombreArchivoRps("AR.26.05016", "-10")).toBe("AR.26.05016-10.pdf");
  });

  it("la plantilla de carpeta admite el año", () => {
    expect(conAnio("/mnt/rps/VENTAS/PLANTEAMIENTOS/{YYYY}", 2026)).toBe("/mnt/rps/VENTAS/PLANTEAMIENTOS/2026");
    expect(conAnio("/mnt/escaner/Planteamientos", 2026)).toBe("/mnt/escaner/Planteamientos");
  });

  it("A4 en vertical y apaisado, con margen; A5 y A3 no", () => {
    expect(esA4(595.28, 841.89)).toBe(true);
    expect(esA4(841.89, 595.28)).toBe(true);
    expect(esA4(596, 842)).toBe(true);
    expect(esA4(419.53, 595.28)).toBe(false); // A5
    expect(esA4(841.89, 1190.55)).toBe(false); // A3
  });
});
```

- [ ] **Step 2: Run to verify fail**

Run: `pnpm test src/lib/__tests__/planteamiento.test.ts`
Expected: FAIL. No resuelve `../planteamiento`.

- [ ] **Step 3: Implement**

```ts
// ─── El planteamiento de un pedido: nombres y tamaños ────────────────────────
// Los PDF de planteamiento los deja Oficina Técnica en la carpeta Planteamientos
// —desde CAD, a mano, igual que los genera toldos-testar— con el código del
// pedido SIN puntos y un sufijo: AR2605016-10.pdf (PVC), AR2605016-1.pdf
// (toldos). RPS los procesa en pocos minutos y los archiva con el código CON
// puntos, AR.26.05016-10.pdf, en una carpeta por año. Aquí está la regla de
// esos nombres, sin tocar disco, para que la busqueda y los tests digan lo mismo.

const PEDIDO_RE = /^([A-Z]{2})\.(\d{2})\.(\d{5})$/;

export function partesPedido(codigo: string): { serie: string; yy: string; numero: string } | null {
  const m = PEDIDO_RE.exec(codigo.trim());
  return m ? { serie: m[1], yy: m[2], numero: m[3] } : null;
}

export function nombreCompacto(codigo: string): string | null {
  const p = partesPedido(codigo);
  return p ? `${p.serie}${p.yy}${p.numero}` : null;
}

export function anioPedido(codigo: string): number | null {
  const p = partesPedido(codigo);
  return p ? 2000 + Number(p.yy) : null;
}

/** El sufijo (`-10`, `-1`…) si el fichero es un planteamiento de ESTE pedido,
 *  con su nombre compacto o con el de RPS. Cualquier otra cosa —otro pedido,
 *  sin sufijo, «copia», otra extensión— es null: no se imprime lo que no se
 *  sabe seguro que es suyo. */
export function sufijoDe(fichero: string, codigo: string): string | null {
  const compacto = nombreCompacto(codigo);
  if (!compacto) return null;
  for (const base of [compacto, codigo]) {
    const m = new RegExp(`^${base.replace(/\./g, "\\.")}(-\\d{1,3})\\.pdf$`, "i").exec(fichero);
    if (m) return m[1];
  }
  return null;
}

export function nombreArchivoRps(codigo: string, sufijo: string): string {
  return `${codigo}${sufijo}.pdf`;
}

export function conAnio(plantilla: string, anio: number): string {
  return plantilla.replaceAll("{YYYY}", String(anio));
}

/** A4 en puntos PDF. El margen cubre el redondeo de cada programa de CAD. */
const A4_CORTO = 595.28;
const A4_LARGO = 841.89;
const MARGEN = 3;

export function esA4(ancho: number, alto: number): boolean {
  const [corto, largo] = ancho <= alto ? [ancho, alto] : [alto, ancho];
  return Math.abs(corto - A4_CORTO) <= MARGEN && Math.abs(largo - A4_LARGO) <= MARGEN;
}
```

- [ ] **Step 4: Run test**

Run: `pnpm test src/lib/__tests__/planteamiento.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/planteamiento.ts src/lib/__tests__/planteamiento.test.ts
git commit -m "feat(planteamiento): reglas de nombres y tamaño A4 del planteamiento"
```

---

### Task 2: Encontrar y leer los planteamientos de un pedido

**Files:**
- Create: `src/lib/server/pdfjs.ts`
- Modify: `src/lib/server/miniaturas.ts` (`cargarMotor`, ~líneas 40-60)
- Create: `src/lib/server/planteamiento-pdf.ts`
- Test: `src/lib/__tests__/planteamiento-pdf.test.ts`
- Modify: `package.json` (devDependency `pdf-lib`)

**Interfaces:**
- Consumes: `sufijoDe`, `nombreCompacto`, `anioPedido`, `nombreArchivoRps`, `conAnio`, `esA4` (Task 1).
- Produces:
  - `cargarPdfjs(): Promise<{ pdfjs: ModuloPdfJs; pdfjsDir: string }>` en `pdfjs.ts`.
  - `interface InfoPdf { paginas: number; todoA4: boolean; deToldosTestar: boolean }`
  - `leerPdf(bytes: Uint8Array): Promise<InfoPdf>`
  - `interface CarpetasPlanteamiento { entrada: string | null; archivo: string | null }`
  - `carpetasPlanteamiento(): CarpetasPlanteamiento`
  - `interface FicheroPlanteamiento { nombre: string; ruta: string; origen: "planteamientos" | "archivo"; paginas: number; todoA4: boolean }`
  - `interface Planteamientos { ficheros: FicheroPlanteamiento[]; aviso: string | null }`
  - `planteamientosDe(codigo: string, carpetas?: CarpetasPlanteamiento): Promise<Planteamientos>`

- [ ] **Step 1: Sacar la carga de pdfjs a un módulo compartido**

`src/lib/server/pdfjs.ts`. Mueve aquí el trozo de `cargarMotor` que resuelve `pdfjs-dist` y lo importa, y el tipo `ModuloPdfJs`, que hoy está en `miniaturas.ts`. Copia la definición tal cual.

```ts
import { createRequire } from "node:module";
import path from "node:path";
import { pathToFileURL } from "node:url";

// ─── pdfjs en Node, una sola vez ─────────────────────────────────────────────
// Se carga en tiempo de ejecución desde su build `legacy` y no con un import
// normal: el empaquetador de Next no sabe con él (ver el comentario de
// miniaturas.ts). Lo usan las miniaturas y la lectura de planteamientos.

let promesa: Promise<{ pdfjs: ModuloPdfJs; pdfjsDir: string }> | null = null;

export function cargarPdfjs() {
  promesa ??= (async () => {
    const require = createRequire(path.join(process.cwd(), "package.json"));
    const pdfjsDir = path.dirname(require.resolve("pdfjs-dist/package.json")).replace(/\\/g, "/");
    const pdfjs: ModuloPdfJs = await import(
      /* webpackIgnore: true */
      pathToFileURL(`${pdfjsDir}/legacy/build/pdf.mjs`).href
    );
    return { pdfjs, pdfjsDir };
  })();
  return promesa;
}
```

`miniaturas.ts`: `cargarMotor` pasa a ser `const { pdfjs, pdfjsDir } = await cargarPdfjs();` más el `require("@napi-rs/canvas")` que ya tenía. Exporta `ModuloPdfJs` desde `pdfjs.ts` e impórtalo en `miniaturas.ts`.

Run: `pnpm test` y `pnpm exec tsc --noEmit`
Expected: verde; las miniaturas no cambian.

- [ ] **Step 2: Añadir pdf-lib para los tests**

Run: `pnpm add -D pdf-lib@^1.17.1`

- [ ] **Step 3: Write the failing test**

`src/lib/__tests__/planteamiento-pdf.test.ts`:

```ts
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { PDFDocument } from "pdf-lib";
import { leerPdf, planteamientosDe } from "../server/planteamiento-pdf";

const A4: [number, number] = [595.28, 841.89];
const A5: [number, number] = [419.53, 595.28];

async function pdf(paginas: Array<[number, number]>, adjunto?: string): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  for (const p of paginas) doc.addPage(p);
  if (adjunto) await doc.attach(Buffer.from("{}"), adjunto, { mimeType: "application/json" });
  return doc.save();
}

let raiz: string;
let entrada: string;
let archivo: string;

beforeAll(async () => {
  raiz = mkdtempSync(path.join(tmpdir(), "coordina-planteamientos-"));
  entrada = path.join(raiz, "Planteamientos");
  archivo = path.join(raiz, "ARCHIVO", "{YYYY}");
  mkdirSync(entrada, { recursive: true });
  mkdirSync(path.join(raiz, "ARCHIVO", "2026"), { recursive: true });
  writeFileSync(path.join(entrada, "AR2605016-10.pdf"), await pdf([A4]));
  writeFileSync(path.join(entrada, "AR2605016-1.pdf"), await pdf([A4], "AR2605016.toldos.json"));
  writeFileSync(path.join(entrada, "AR2605099-10.pdf"), await pdf([A4, A5]));
  // Ya procesado por RPS: solo está en el archivo, con puntos.
  writeFileSync(path.join(raiz, "ARCHIVO", "2026", "AR.26.05020-10.pdf"), await pdf([A4, A4]));
  // El mismo sufijo en los dos sitios: manda el de Planteamientos.
  writeFileSync(path.join(raiz, "ARCHIVO", "2026", "AR.26.05016-10.pdf"), await pdf([A4, A4, A4]));
});

afterAll(() => rmSync(raiz, { recursive: true, force: true }));

describe("leer un PDF", () => {
  it("cuenta páginas, mira A4 y reconoce los de toldos-testar", async () => {
    expect(await leerPdf(await pdf([A4, A4]))).toEqual({ paginas: 2, todoA4: true, deToldosTestar: false });
    expect((await leerPdf(await pdf([A4, A5]))).todoA4).toBe(false);
    expect((await leerPdf(await pdf([A4], "X.remolques.json"))).deToldosTestar).toBe(true);
  });
});

describe("los planteamientos de un pedido", () => {
  it("de Planteamientos, sin los de toldos-testar", async () => {
    const r = await planteamientosDe("AR.26.05016", { entrada, archivo });
    expect(r.aviso).toBeNull();
    expect(r.ficheros.map((f) => [f.nombre, f.origen, f.paginas])).toEqual([["AR2605016-10.pdf", "planteamientos", 1]]);
  });

  it("del archivo de RPS cuando ya se procesó", async () => {
    const r = await planteamientosDe("AR.26.05020", { entrada, archivo });
    expect(r.ficheros.map((f) => [f.nombre, f.origen, f.todoA4])).toEqual([["AR.26.05020-10.pdf", "archivo", true]]);
  });

  it("marca el que lleva páginas que no son A4", async () => {
    const r = await planteamientosDe("AR.26.05099", { entrada, archivo });
    expect(r.ficheros[0].todoA4).toBe(false);
  });

  it("sin planteamiento, lista vacía y sin aviso", async () => {
    expect(await planteamientosDe("AR.26.00001", { entrada, archivo })).toEqual({ ficheros: [], aviso: null });
  });

  it("carpeta Planteamientos que no se puede leer: lo dice", async () => {
    const r = await planteamientosDe("AR.26.05016", { entrada: path.join(raiz, "no-existe"), archivo });
    expect(r.aviso).toMatch(/Planteamientos/);
  });

  it("sin carpeta configurada: lo dice", async () => {
    const r = await planteamientosDe("AR.26.05016", { entrada: null, archivo: null });
    expect(r.aviso).toMatch(/configurada/);
  });
});
```

- [ ] **Step 4: Run to verify fail**

Run: `pnpm test src/lib/__tests__/planteamiento-pdf.test.ts`
Expected: FAIL. No resuelve `../server/planteamiento-pdf`.

- [ ] **Step 5: Implement `src/lib/server/planteamiento-pdf.ts`**

```ts
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { anioPedido, conAnio, esA4, nombreArchivoRps, sufijoDe } from "../planteamiento";
import { cargarPdfjs } from "./pdfjs";

// ─── Dónde está el planteamiento de un pedido, y cómo es ─────────────────────
// Dos sitios, en este orden: la carpeta Planteamientos, donde OT lo deja desde
// CAD, y el archivo de RPS, adonde va cuando RPS lo procesa (en pocos minutos).
// Un mismo sufijo en los dos es el mismo documento, y manda el de Planteamientos
// por ser el último que se guardó.
//
// Los de toldos-testar NO cuentan: llevan dentro su `.toldos.json` /
// `.remolques.json`, y de esos CoordinaOT no hace nada (Iván, 13/10/2026).

export interface InfoPdf {
  paginas: number;
  todoA4: boolean;
  deToldosTestar: boolean;
}

const ADJUNTOS_TOLDOS_TESTAR = [".toldos.json", ".remolques.json"];

export async function leerPdf(bytes: Uint8Array): Promise<InfoPdf> {
  const { pdfjs, pdfjsDir } = await cargarPdfjs();
  // Copia: pdfjs se queda con el buffer que recibe y lo deja inservible.
  const tarea = pdfjs.getDocument({
    data: new Uint8Array(bytes),
    standardFontDataUrl: `${pdfjsDir}/standard_fonts/`,
  });
  try {
    const doc = await tarea.promise;
    let todoA4 = true;
    for (let n = 1; n <= doc.numPages; n++) {
      const [x0, y0, x1, y1] = (await doc.getPage(n)).view;
      if (!esA4(x1 - x0, y1 - y0)) todoA4 = false;
    }
    const adjuntos = (await doc.getAttachments()) ?? {};
    const nombres = Object.values(adjuntos as Record<string, { filename?: string }>).map((a) =>
      String(a.filename ?? "").toLowerCase(),
    );
    const deToldosTestar = nombres.some((n) => ADJUNTOS_TOLDOS_TESTAR.some((s) => n.endsWith(s)));
    return { paginas: doc.numPages, todoA4, deToldosTestar };
  } finally {
    await tarea.destroy();
  }
}

export interface CarpetasPlanteamiento {
  entrada: string | null;
  archivo: string | null;
}

/** Igual que el PDF del pedido (pdf-pedido.ts): ruta Linux en el servidor y
 *  UNC en un PC de desarrollo. La entrada no tiene valor por defecto en Windows
 *  porque no se sabe su ruta de red; sin ella, la búsqueda lo dice. */
export function carpetasPlanteamiento(): CarpetasPlanteamiento {
  return process.platform === "win32"
    ? {
        entrada: process.env.PLANTEAMIENTOS_DIR_WIN ?? null,
        archivo: process.env.PLANTEAMIENTOS_ARCHIVO_DIR_WIN ?? "\\\\192.168.0.128\\RPS\\VENTAS\\PLANTEAMIENTOS\\{YYYY}",
      }
    : {
        entrada: process.env.PLANTEAMIENTOS_DIR ?? "/mnt/escaner/Planteamientos",
        archivo: process.env.PLANTEAMIENTOS_ARCHIVO_DIR ?? "/mnt/rps/VENTAS/PLANTEAMIENTOS/{YYYY}",
      };
}

export interface FicheroPlanteamiento {
  nombre: string;
  ruta: string;
  origen: "planteamientos" | "archivo";
  paginas: number;
  todoA4: boolean;
}

export interface Planteamientos {
  ficheros: FicheroPlanteamiento[];
  /** Por qué la lista puede no ser fiable (carpeta sin montar o sin
   *  configurar). null = se miró bien. Nunca lanza: esto se llama al pasar un
   *  pedido, y un disco que falla no puede impedirlo. */
  aviso: string | null;
}

async function listar(dir: string): Promise<string[] | null> {
  try {
    return await readdir(dir);
  } catch {
    return null;
  }
}

export async function planteamientosDe(
  codigo: string,
  carpetas: CarpetasPlanteamiento = carpetasPlanteamiento(),
): Promise<Planteamientos> {
  const anio = anioPedido(codigo);
  if (anio === null) return { ficheros: [], aviso: null };
  if (!carpetas.entrada) return { ficheros: [], aviso: "La carpeta Planteamientos no está configurada" };

  const entrada = conAnio(carpetas.entrada, anio);
  const enEntrada = await listar(entrada);
  // El archivo del año puede no existir todavía (enero): eso no es un fallo.
  const dirArchivo = carpetas.archivo ? conAnio(carpetas.archivo, anio) : null;
  const enArchivo = dirArchivo ? ((await listar(dirArchivo)) ?? []) : [];

  const porSufijo = new Map<string, { nombre: string; ruta: string; origen: FicheroPlanteamiento["origen"] }>();
  for (const nombre of enArchivo) {
    const s = sufijoDe(nombre, codigo);
    if (s && nombre === nombreArchivoRps(codigo, s)) porSufijo.set(s, { nombre, ruta: path.join(dirArchivo!, nombre), origen: "archivo" });
  }
  for (const nombre of enEntrada ?? []) {
    const s = sufijoDe(nombre, codigo);
    if (s) porSufijo.set(s, { nombre, ruta: path.join(entrada, nombre), origen: "planteamientos" });
  }

  const ficheros: FicheroPlanteamiento[] = [];
  for (const [, f] of [...porSufijo].sort(([a], [b]) => Number(a.slice(1)) - Number(b.slice(1)))) {
    try {
      const info = await leerPdf(new Uint8Array(await readFile(f.ruta)));
      if (info.deToldosTestar) continue;
      ficheros.push({ ...f, paginas: info.paginas, todoA4: info.todoA4 });
    } catch (e) {
      // Un PDF roto no se imprime ni tumba la lista: se anota y se sigue.
      console.warn(`[planteamiento] no se pudo leer ${f.ruta}:`, (e as Error).message);
    }
  }
  return {
    ficheros,
    aviso: enEntrada === null ? "No puedo leer la carpeta Planteamientos" : null,
  };
}
```

Si el tipo `ModuloPdfJs` no declara `getAttachments` o `view`, amplíalo en `pdfjs.ts` con lo mínimo y un comentario.

- [ ] **Step 6: Run tests**

Run: `pnpm test src/lib/__tests__/planteamiento-pdf.test.ts && pnpm test && pnpm exec tsc --noEmit`
Expected: PASS y todo verde.

- [ ] **Step 7: Commit**

```bash
git add src/lib/server/pdfjs.ts src/lib/server/miniaturas.ts src/lib/server/planteamiento-pdf.ts src/lib/__tests__/planteamiento-pdf.test.ts package.json pnpm-lock.yaml
git commit -m "feat(planteamiento): encontrar el planteamiento de CAD de un pedido y leer sus páginas"
```

---

### Task 3: Cliente IPP mínimo

**Files:**
- Create: `src/lib/server/ipp.ts`
- Test: `src/lib/__tests__/ipp.test.ts`

**Interfaces:**
- Produces:
  - `interface TrabajoIpp { nombre: string; usuario: string }`
  - `peticionPrintJob(uri: string, pdf: Uint8Array, t: TrabajoIpp, idPeticion?: number): Uint8Array`
  - `leerRespuesta(bytes: Uint8Array): { estado: number; ok: boolean; trabajo: number | null }`
  - `urlHttp(uri: string): string`
  - `imprimirPdf(uri: string, pdf: Uint8Array, t: TrabajoIpp, f?: typeof fetch): Promise<{ trabajo: number | null }>`. Lanza `Error` con un mensaje en español.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it, vi } from "vitest";
import { imprimirPdf, leerRespuesta, peticionPrintJob, urlHttp } from "../server/ipp";

const PDF = new Uint8Array([0x25, 0x50, 0x44, 0x46]); // "%PDF"
const T = { nombre: "Planteamiento AR.26.05016", usuario: "CoordinaOT" };

/** Lee los nombres y valores de atributos de una petición, para no comparar
 *  bytes a ciegas. */
function atributos(b: Uint8Array): Record<string, string | number> {
  const out: Record<string, string | number> = {};
  let i = 8;
  let ultimo = "";
  while (i < b.length) {
    const tag = b[i++];
    if (tag === 0x03) break;
    if (tag < 0x10) continue; // delimitador de grupo
    const ln = (b[i] << 8) | b[i + 1]; i += 2;
    const nombre = new TextDecoder().decode(b.slice(i, i + ln)); i += ln;
    const lv = (b[i] << 8) | b[i + 1]; i += 2;
    const v = b.slice(i, i + lv); i += lv;
    if (nombre) ultimo = nombre;
    out[ultimo] = tag === 0x21 ? new DataView(v.buffer, v.byteOffset).getInt32(0) : new TextDecoder().decode(v);
  }
  return out;
}

describe("Print-Job", () => {
  it("cabecera IPP 2.0, operación Print-Job y el PDF al final", () => {
    const b = peticionPrintJob("ipp://192.168.4.245/ipp", PDF, T, 7);
    expect([...b.slice(0, 4)]).toEqual([0x02, 0x00, 0x00, 0x02]);
    expect(new DataView(b.buffer).getInt32(4)).toBe(7);
    expect([...b.slice(-4)]).toEqual([...PDF]);
  });

  it("lleva lo que pide la spec: PDF, 1 copia, una cara, A4", () => {
    const a = atributos(peticionPrintJob("ipp://192.168.4.245/ipp", PDF, T));
    expect(a).toMatchObject({
      "attributes-charset": "utf-8",
      "printer-uri": "ipp://192.168.4.245/ipp",
      "requesting-user-name": "CoordinaOT",
      "job-name": "Planteamiento AR.26.05016",
      "document-format": "application/pdf",
      copies: 1,
      sides: "one-sided",
      media: "iso_a4_210x297mm",
    });
  });
});

describe("respuesta", () => {
  const resp = (estado: number, trabajo?: number) => {
    const partes = [0x02, 0x00, estado >> 8, estado & 255, 0, 0, 0, 1, 0x02];
    if (trabajo !== undefined) {
      const n = new TextEncoder().encode("job-id");
      partes.push(0x21, 0, n.length, ...n, 0, 4, (trabajo >> 24) & 255, (trabajo >> 16) & 255, (trabajo >> 8) & 255, trabajo & 255);
    }
    partes.push(0x03);
    return new Uint8Array(partes);
  };

  it("aceptado, con número de trabajo", () => {
    expect(leerRespuesta(resp(0x0000, 1234))).toEqual({ estado: 0, ok: true, trabajo: 1234 });
  });

  it("rechazado", () => {
    expect(leerRespuesta(resp(0x0406)).ok).toBe(false);
  });

  it("imprimirPdf manda POST application/ipp al puerto 631 y lanza si la impresora rechaza", async () => {
    const f = vi.fn(async () => new Response(resp(0x0000, 9)));
    expect(await imprimirPdf("ipp://192.168.4.245/ipp", PDF, T, f as unknown as typeof fetch)).toEqual({ trabajo: 9 });
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("http://192.168.4.245:631/ipp");
    expect((init.headers as Record<string, string>)["Content-Type"]).toBe("application/ipp");

    const mal = vi.fn(async () => new Response(resp(0x0400)));
    await expect(imprimirPdf("ipp://192.168.4.245/ipp", PDF, T, mal as unknown as typeof fetch)).rejects.toThrow(/rechazó/);
  });

  it("ipp:// pasa a http:// con el puerto 631 si no lo trae", () => {
    expect(urlHttp("ipp://192.168.4.245/ipp")).toBe("http://192.168.4.245:631/ipp");
    expect(urlHttp("ipp://impresora:8631/ipp/print")).toBe("http://impresora:8631/ipp/print");
  });
});
```

- [ ] **Step 2: Run to verify fail**

Run: `pnpm test src/lib/__tests__/ipp.test.ts`
Expected: FAIL. No resuelve `../server/ipp`.

- [ ] **Step 3: Implement `src/lib/server/ipp.ts`**

```ts
// ─── IPP: mandar un PDF a una impresora de red ───────────────────────────────
// Las Konica de Producción (bizhub 551i) y de OT aceptan PDF directamente por
// IPP (comprobado el 13/10/2026), así que no hace falta CUPS ni controladores
// en el servidor: un Print-Job son unos pocos bytes de cabecera y el PDF
// detrás. Se escribe a mano para no añadir una dependencia por esto.
//
// «Aceptado» quiere decir que la impresora cogió el trabajo, no que el papel
// haya salido: si se queda sin papel, se resuelve allí.

export interface TrabajoIpp {
  nombre: string;
  usuario: string;
}

const enc = new TextEncoder();

function atributo(salida: number[], tag: number, nombre: string, valor: Uint8Array) {
  const n = enc.encode(nombre);
  salida.push(tag, n.length >> 8, n.length & 255, ...n, valor.length >> 8, valor.length & 255, ...valor);
}

const texto = (s: string) => enc.encode(s);
const entero = (v: number) => new Uint8Array([(v >> 24) & 255, (v >> 16) & 255, (v >> 8) & 255, v & 255]);

export function peticionPrintJob(uri: string, pdf: Uint8Array, t: TrabajoIpp, idPeticion = 1): Uint8Array {
  const b: number[] = [0x02, 0x00, 0x00, 0x02, ...entero(idPeticion)];
  b.push(0x01); // operation-attributes
  atributo(b, 0x47, "attributes-charset", texto("utf-8"));
  atributo(b, 0x48, "attributes-natural-language", texto("es"));
  atributo(b, 0x45, "printer-uri", texto(uri));
  atributo(b, 0x42, "requesting-user-name", texto(t.usuario));
  atributo(b, 0x42, "job-name", texto(t.nombre));
  atributo(b, 0x49, "document-format", texto("application/pdf"));
  b.push(0x02); // job-attributes
  atributo(b, 0x21, "copies", entero(1));
  atributo(b, 0x44, "sides", texto("one-sided"));
  atributo(b, 0x44, "media", texto("iso_a4_210x297mm"));
  b.push(0x03);
  const salida = new Uint8Array(b.length + pdf.length);
  salida.set(b, 0);
  salida.set(pdf, b.length);
  return salida;
}

export function leerRespuesta(bytes: Uint8Array): { estado: number; ok: boolean; trabajo: number | null } {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const estado = dv.getUint16(2);
  let trabajo: number | null = null;
  let i = 8;
  while (i < bytes.length) {
    const tag = bytes[i++];
    if (tag === 0x03) break;
    if (tag < 0x10) continue;
    const ln = dv.getUint16(i); i += 2;
    const nombre = new TextDecoder().decode(bytes.slice(i, i + ln)); i += ln;
    const lv = dv.getUint16(i); i += 2;
    if (nombre === "job-id" && tag === 0x21 && lv === 4) trabajo = dv.getInt32(i);
    i += lv;
  }
  // 0x0000–0x00FF son los «successful-ok*» de IPP.
  return { estado, ok: estado <= 0x00ff, trabajo };
}

export function urlHttp(uri: string): string {
  const u = new URL(uri.replace(/^ipp:/, "http:"));
  if (!u.port) u.port = "631";
  return u.toString();
}

export async function imprimirPdf(
  uri: string,
  pdf: Uint8Array,
  t: TrabajoIpp,
  f: typeof fetch = fetch,
): Promise<{ trabajo: number | null }> {
  let r: Response;
  try {
    r = await f(urlHttp(uri), {
      method: "POST",
      headers: { "Content-Type": "application/ipp" },
      body: peticionPrintJob(uri, pdf, t),
      signal: AbortSignal.timeout(30_000),
    });
  } catch (e) {
    throw new Error(`La impresora no responde (${(e as Error).message})`);
  }
  if (!r.ok) throw new Error(`La impresora contestó HTTP ${r.status}`);
  const res = leerRespuesta(new Uint8Array(await r.arrayBuffer()));
  if (!res.ok) throw new Error(`La impresora rechazó el trabajo (IPP 0x${res.estado.toString(16).padStart(4, "0")})`);
  return { trabajo: res.trabajo };
}
```

- [ ] **Step 4: Run tests**

Run: `pnpm test src/lib/__tests__/ipp.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/server/ipp.ts src/lib/__tests__/ipp.test.ts
git commit -m "feat(impresion): cliente IPP mínimo para mandar un PDF a la impresora"
```

---

### Task 4: La cola de impresión y su trabajador

**Files:**
- Modify: `src/lib/server/estado-db.ts` (bloque `CREATE TABLE` de `abrir()`, tras `of_retenida`, ~líneas 228-237)
- Create: `src/lib/server/impresion-cola.ts`
- Create: `src/lib/server/impresion-worker.ts`
- Modify: `src/instrumentation.ts` (tras `arrancarVigilanciaDePartes`)
- Modify: `.env.example` (sección nueva tras la de `FICHAJE_OLANET`)
- Test: `src/lib/__tests__/impresion-cola.test.ts`

**Interfaces:**
- Consumes:
  - `planteamientosDe`, `Planteamientos` (Task 2);
  - `imprimirPdf`, `TrabajoIpp` (Task 3);
  - `getDb()` de `estado-db.ts`.
- Produces:
  - `type ModoImpresion = "off" | "ensayo" | "activo"`
  - `modoImpresion(): ModoImpresion`
  - `impresoraDestino(modo: ModoImpresion): string | null`
  - `type EstadoImpresion = "pendiente" | "enviado" | "manual" | "sin_planteamiento" | "descartado"`
  - `interface FilaImpresion { id: number; pedidoId: string; fichero: string | null; paginas: number | null; estado: EstadoImpresion; intentos: number; error: string | null; impresora: string | null; pasadoPor: string | null; creadoAt: string; enviadoAt: string | null }`
  - `prepararImpresion(codigo: string, operarioId: string, ahora?: Date, buscar?: typeof planteamientosDe): Promise<{ encolados: number; manuales: string[]; aviso: string | null }>`
  - `leerImpresionesDe(pedidoId: string): FilaImpresion[]` (la más reciente primero)
  - `vueltaImpresion(ahora?: Date, imprimir?: typeof imprimirPdf): Promise<number>` (cuántos envió)
  - `arrancarImpresion(): void`

- [ ] **Step 1: La tabla**

En `estado-db.ts`, dentro del `db.exec` de `abrir()`, tras `of_retenida`:

```sql
    -- Planteamientos de CAD que se mandan a la impresora de Producción al pasar
    -- un pedido de OT (spec 2026-10-13-planteamiento-a-produccion). Una fila
    -- por fichero y por pase; también las que NO se imprimen solas —«manual»,
    -- «sin_planteamiento»— para que el Historial pueda decir qué pasó.
    CREATE TABLE IF NOT EXISTS planteamiento_impresion (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      pedido_id   TEXT NOT NULL,
      fichero     TEXT,
      copia       TEXT,
      paginas     INTEGER,
      estado      TEXT NOT NULL,
      intentos    INTEGER NOT NULL DEFAULT 0,
      error       TEXT,
      trabajo_ipp INTEGER,
      impresora   TEXT,
      pasado_por  TEXT,
      creado_at   TEXT NOT NULL,
      proximo_at  TEXT,
      enviado_at  TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_planteamiento_impresion ON planteamiento_impresion(pedido_id, id);
    CREATE INDEX IF NOT EXISTS idx_planteamiento_impresion_cola ON planteamiento_impresion(estado, proximo_at);
```

- [ ] **Step 2: Write the failing test**

`src/lib/__tests__/impresion-cola.test.ts`:

```ts
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type { Planteamientos } from "../server/planteamiento-pdf";

let dir: string;
beforeAll(() => {
  dir = mkdtempSync(path.join(tmpdir(), "coordina-impresion-"));
  process.env.COORDINA_DB_PATH = path.join(dir, "test.db");
  process.env.COORDINA_PLANTEAMIENTOS_COPIAS = path.join(dir, "copias");
  process.env.DATASOURCE = "mock";
});
afterAll(() => {
  try { rmSync(dir, { recursive: true, force: true }); } catch {}
});

let cola: typeof import("../server/impresion-cola");
let worker: typeof import("../server/impresion-worker");

beforeEach(async () => {
  vi.resetModules();
  process.env.IMPRESION_PRODUCCION = "activo";
  const { getDb } = await import("../server/estado-db");
  getDb().exec("DELETE FROM planteamiento_impresion");
  cola = await import("../server/impresion-cola");
  worker = await import("../server/impresion-worker");
});

const T0 = new Date("2026-10-13T11:00:00Z");
const pdfDe = (nombre: string, todoA4: boolean): Planteamientos => ({
  aviso: null,
  ficheros: [{ nombre, ruta: path.join(__dirname, "planteamiento.test.ts"), origen: "planteamientos", paginas: 1, todoA4 }],
});

describe("modo y destino", () => {
  it("apagado por defecto; ensayo va a la de OT", async () => {
    delete process.env.IMPRESION_PRODUCCION;
    expect(cola.modoImpresion()).toBe("off");
    expect(cola.impresoraDestino("ensayo")).toBe("ipp://192.168.4.249/ipp");
    expect(cola.impresoraDestino("activo")).toBe("ipp://192.168.4.245/ipp");
    expect(cola.impresoraDestino("off")).toBeNull();
  });
});

describe("al pasar el pedido", () => {
  it("todo A4: copia y encola", async () => {
    const r = await cola.prepararImpresion("AR.26.05016", "ivan", T0, async () => pdfDe("AR2605016-10.pdf", true));
    expect(r).toEqual({ encolados: 1, manuales: [], aviso: null });
    const [f] = cola.leerImpresionesDe("AR.26.05016");
    expect(f).toMatchObject({ estado: "pendiente", fichero: "AR2605016-10.pdf", pasadoPor: "ivan" });
  });

  it("alguna página no A4: manual, no se encola", async () => {
    const r = await cola.prepararImpresion("AR.26.05099", "ivan", T0, async () => pdfDe("AR2605099-10.pdf", false));
    expect(r.manuales).toEqual(["AR2605099-10.pdf"]);
    expect(cola.leerImpresionesDe("AR.26.05099")[0].estado).toBe("manual");
  });

  it("sin planteamiento: se anota con el motivo", async () => {
    await cola.prepararImpresion("AR.26.00001", "ivan", T0, async () => ({ ficheros: [], aviso: "No puedo leer la carpeta Planteamientos" }));
    expect(cola.leerImpresionesDe("AR.26.00001")[0]).toMatchObject({ estado: "sin_planteamiento", error: "No puedo leer la carpeta Planteamientos" });
  });
});

describe("el trabajador", () => {
  it("manda lo pendiente, lo marca enviado y borra la copia", async () => {
    await cola.prepararImpresion("AR.26.05016", "ivan", T0, async () => pdfDe("AR2605016-10.pdf", true));
    const imprimir = vi.fn(async () => ({ trabajo: 77 }));
    expect(await worker.vueltaImpresion(T0, imprimir)).toBe(1);
    expect(imprimir.mock.calls[0][0]).toBe("ipp://192.168.4.245/ipp");
    const [f] = cola.leerImpresionesDe("AR.26.05016");
    expect(f).toMatchObject({ estado: "enviado", impresora: "ipp://192.168.4.245/ipp" });
    expect(existsSync(path.join(process.env.COORDINA_PLANTEAMIENTOS_COPIAS!, `${f.id}-AR2605016-10.pdf`))).toBe(false);
  });

  it("si falla, espera cada vez más antes de reintentar", async () => {
    await cola.prepararImpresion("AR.26.05016", "ivan", T0, async () => pdfDe("AR2605016-10.pdf", true));
    const falla = vi.fn(async () => { throw new Error("La impresora no responde (ECONNREFUSED)"); });
    await worker.vueltaImpresion(T0, falla);
    expect(cola.leerImpresionesDe("AR.26.05016")[0]).toMatchObject({ estado: "pendiente", intentos: 1, error: "La impresora no responde (ECONNREFUSED)" });
    // Antes de la espera no se reintenta…
    await worker.vueltaImpresion(new Date(T0.getTime() + 10_000), falla);
    expect(falla).toHaveBeenCalledTimes(1);
    // …y pasada, sí.
    await worker.vueltaImpresion(new Date(T0.getTime() + 31_000), falla);
    expect(falla).toHaveBeenCalledTimes(2);
  });

  it("en off no manda nada", async () => {
    await cola.prepararImpresion("AR.26.05016", "ivan", T0, async () => pdfDe("AR2605016-10.pdf", true));
    process.env.IMPRESION_PRODUCCION = "off";
    const imprimir = vi.fn(async () => ({ trabajo: 1 }));
    expect(await worker.vueltaImpresion(T0, imprimir)).toBe(0);
    expect(imprimir).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 3: Run to verify fail**

Run: `pnpm test src/lib/__tests__/impresion-cola.test.ts`
Expected: FAIL. No resuelven `../server/impresion-cola` ni `../server/impresion-worker`.

- [ ] **Step 4: Implement `src/lib/server/impresion-cola.ts`**

```ts
import { copyFileSync, mkdirSync, rmSync } from "node:fs";
import path from "node:path";
import { getDb } from "./estado-db";
import { planteamientosDe } from "./planteamiento-pdf";

// ─── Cola de impresión de planteamientos ─────────────────────────────────────
// Al pasar un pedido de OT a Producción, su planteamiento de CAD sale solo en
// la impresora de arriba (spec 2026-10-13). Se encola en vez de imprimir en la
// petición por lo mismo que los bonos de OLANET: la impresora puede estar
// apagada, y pasar el pedido no puede depender de eso.
//
// Se COPIA el PDF al encolar: RPS mueve el fichero de Planteamientos a su
// archivo en pocos minutos, y lo que se imprime es lo que había al pasar.

export type ModoImpresion = "off" | "ensayo" | "activo";

/** Apagado salvo que se pida: imprimir en Producción por error es papel y un
 *  susto arriba. `ensayo` manda a la impresora de OT. */
export function modoImpresion(): ModoImpresion {
  const v = process.env.IMPRESION_PRODUCCION;
  return v === "activo" || v === "ensayo" ? v : "off";
}

export function impresoraDestino(modo: ModoImpresion): string | null {
  if (modo === "activo") return process.env.IMPRESORA_PRODUCCION ?? "ipp://192.168.4.245/ipp";
  if (modo === "ensayo") return process.env.IMPRESORA_ENSAYO ?? "ipp://192.168.4.249/ipp";
  return null;
}

export type EstadoImpresion = "pendiente" | "enviado" | "manual" | "sin_planteamiento" | "descartado";

export interface FilaImpresion {
  id: number;
  pedidoId: string;
  fichero: string | null;
  paginas: number | null;
  estado: EstadoImpresion;
  intentos: number;
  error: string | null;
  impresora: string | null;
  pasadoPor: string | null;
  creadoAt: string;
  enviadoAt: string | null;
}

export function dirCopias(): string {
  return process.env.COORDINA_PLANTEAMIENTOS_COPIAS ?? path.join(process.cwd(), "data", "planteamientos");
}

export async function prepararImpresion(
  codigo: string,
  operarioId: string,
  ahora = new Date(),
  buscar: typeof planteamientosDe = planteamientosDe,
): Promise<{ encolados: number; manuales: string[]; aviso: string | null }> {
  const { ficheros, aviso } = await buscar(codigo);
  const db = getDb();
  const ts = ahora.toISOString();
  const insertar = db.prepare(
    `INSERT INTO planteamiento_impresion (pedido_id, fichero, paginas, estado, error, pasado_por, creado_at, proximo_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  if (ficheros.length === 0) {
    insertar.run(codigo, null, null, "sin_planteamiento", aviso, operarioId, ts, null);
    return { encolados: 0, manuales: [], aviso };
  }
  const manuales: string[] = [];
  let encolados = 0;
  mkdirSync(dirCopias(), { recursive: true });
  for (const f of ficheros) {
    if (!f.todoA4) {
      insertar.run(codigo, f.nombre, f.paginas, "manual", null, operarioId, ts, null);
      manuales.push(f.nombre);
      continue;
    }
    const { lastInsertRowid } = insertar.run(codigo, f.nombre, f.paginas, "pendiente", null, operarioId, ts, ts);
    const copia = path.join(dirCopias(), `${lastInsertRowid}-${f.nombre}`);
    copyFileSync(f.ruta, copia);
    db.prepare("UPDATE planteamiento_impresion SET copia = ? WHERE id = ?").run(copia, lastInsertRowid);
    encolados += 1;
  }
  return { encolados, manuales, aviso };
}

interface FilaDb {
  id: number; pedido_id: string; fichero: string | null; copia: string | null; paginas: number | null;
  estado: EstadoImpresion; intentos: number; error: string | null; impresora: string | null;
  pasado_por: string | null; creado_at: string; enviado_at: string | null;
}

const aFila = (r: FilaDb): FilaImpresion => ({
  id: r.id, pedidoId: r.pedido_id, fichero: r.fichero, paginas: r.paginas, estado: r.estado,
  intentos: r.intentos, error: r.error, impresora: r.impresora, pasadoPor: r.pasado_por,
  creadoAt: r.creado_at, enviadoAt: r.enviado_at,
});

export function leerImpresionesDe(pedidoId: string): FilaImpresion[] {
  return (getDb()
    .prepare("SELECT * FROM planteamiento_impresion WHERE pedido_id = ? ORDER BY id DESC LIMIT 20")
    .all(pedidoId) as FilaDb[]).map(aFila);
}

export function pendientesParaEnviar(ahora: Date): Array<FilaImpresion & { copia: string | null }> {
  return (getDb()
    .prepare("SELECT * FROM planteamiento_impresion WHERE estado = 'pendiente' AND proximo_at <= ? ORDER BY id LIMIT 20")
    .all(ahora.toISOString()) as FilaDb[]).map((r) => ({ ...aFila(r), copia: r.copia }));
}

export function marcarImpreso(id: number, trabajo: number | null, impresora: string, ahora: Date, copia: string | null): void {
  getDb()
    .prepare("UPDATE planteamiento_impresion SET estado = 'enviado', trabajo_ipp = ?, impresora = ?, enviado_at = ?, error = NULL, copia = NULL WHERE id = ?")
    .run(trabajo, impresora, ahora.toISOString(), id);
  if (copia) rmSync(copia, { force: true });
}

/** 30 s, 1 min, 2, 4, 8… hasta 10 minutos. Una impresora apagada no se
 *  arregla insistiendo cada medio minuto toda la noche. */
export function esperaTras(intentos: number): number {
  return Math.min(30_000 * 2 ** Math.max(0, intentos - 1), 10 * 60_000);
}

export function marcarFallo(id: number, intentosAntes: number, error: string, ahora: Date): void {
  const intentos = intentosAntes + 1;
  getDb()
    .prepare("UPDATE planteamiento_impresion SET intentos = ?, error = ?, proximo_at = ? WHERE id = ?")
    .run(intentos, error.slice(0, 500), new Date(ahora.getTime() + esperaTras(intentos)).toISOString(), id);
}
```

- [ ] **Step 5: Implement `src/lib/server/impresion-worker.ts`**

```ts
import { readFileSync } from "node:fs";
import { imprimirPdf } from "./ipp";
import { impresoraDestino, marcarFallo, marcarImpreso, modoImpresion, pendientesParaEnviar } from "./impresion-cola";

// ─── El que manda los planteamientos a la impresora ─────────────────────────
// Cada 30 s, lo pendiente cuya espera ya pasó. Uno detrás de otro: si la
// impresora no responde al primero, no responderá al segundo, y se para la
// vuelta hasta la siguiente.

const CADA_MS = 30_000;

declare global {
  // Sobrevive a recargas de módulo (HMR en dev) para no arrancar dos.
  var __coordinaImpresion: ReturnType<typeof setInterval> | undefined;
}

let corriendo = false;

export async function vueltaImpresion(ahora = new Date(), imprimir = imprimirPdf): Promise<number> {
  const destino = impresoraDestino(modoImpresion());
  if (!destino || corriendo) return 0;
  corriendo = true;
  let enviados = 0;
  try {
    for (const p of pendientesParaEnviar(ahora)) {
      try {
        if (!p.copia) throw new Error("Falta la copia del PDF");
        const { trabajo } = await imprimir(destino, new Uint8Array(readFileSync(p.copia)), {
          nombre: `Planteamiento ${p.pedidoId}`,
          usuario: "CoordinaOT",
        });
        marcarImpreso(p.id, trabajo, destino, ahora, p.copia);
        enviados += 1;
      } catch (e) {
        marcarFallo(p.id, p.intentos, (e as Error).message, ahora);
        console.warn(`[impresion] ${p.pedidoId} ${p.fichero}:`, (e as Error).message);
        break;
      }
    }
  } finally {
    corriendo = false;
  }
  return enviados;
}

export function arrancarImpresion(): void {
  if (globalThis.__coordinaImpresion) return;
  globalThis.__coordinaImpresion = setInterval(() => {
    vueltaImpresion().catch((e) => console.error("[impresion] la vuelta falló:", e));
  }, CADA_MS);
  globalThis.__coordinaImpresion.unref?.();
}
```

- [ ] **Step 6: Arranque y configuración**

`src/instrumentation.ts`, tras `arrancarVigilanciaDePartes();`, dentro de la parte que ya exige `DATASOURCE=rps`:

```ts
  // Planteamientos de CAD a la impresora de Producción (spec 2026-10-13).
  // Arranca siempre; con IMPRESION_PRODUCCION=off cada vuelta no hace nada.
  const { arrancarImpresion } = await import("./lib/server/impresion-worker");
  arrancarImpresion();
```

`.env.example`, tras la sección de `FICHAJE_OLANET`:

```dotenv
# ── Impresión del planteamiento en Producción ──────────────────────────────
# Al pasar un pedido de OT a Producción, su planteamiento de CAD (el PDF de la
# carpeta Planteamientos) sale solo en la impresora de arriba.
#   · off    → no imprime nada (por defecto).
#   · ensayo → imprime en la impresora de OT, para probar sin molestar arriba.
#   · activo → imprime en Producción.
IMPRESION_PRODUCCION=off
IMPRESORA_PRODUCCION=ipp://192.168.4.245/ipp
IMPRESORA_ENSAYO=ipp://192.168.4.249/ipp
# La misma carpeta que PLANTEAMIENTOS_DIRECTORY de toldos-testar, y su archivo
# en RPS ({YYYY} = año del pedido). En Windows: *_WIN con rutas UNC.
PLANTEAMIENTOS_DIR=/mnt/escaner/Planteamientos
PLANTEAMIENTOS_ARCHIVO_DIR=/mnt/rps/VENTAS/PLANTEAMIENTOS/{YYYY}
```

- [ ] **Step 7: Run tests**

Run: `pnpm test src/lib/__tests__/impresion-cola.test.ts && pnpm test && pnpm exec tsc --noEmit && pnpm lint`
Expected: verde.

- [ ] **Step 8: Commit**

```bash
git add src/lib/server/estado-db.ts src/lib/server/impresion-cola.ts src/lib/server/impresion-worker.ts src/instrumentation.ts .env.example src/lib/__tests__/impresion-cola.test.ts
git commit -m "feat(impresion): cola de planteamientos a imprimir y su trabajador"
```

---

### Task 5: El servidor imprime al pasar, y las rutas de consulta y reimpresión

**Files:**
- Modify: `src/app/api/estado/route.ts` (`interface Body` 17-31; bloque `completar` 126-152; final 233-246)
- Create: `src/app/api/planteamiento/route.ts`
- Create: `src/app/api/planteamiento/fichero/route.ts`
- Create: `src/app/api/planteamiento/reimprimir/route.ts`
- Modify: `src/lib/__tests__/api-estado.test.ts` (mock nuevo)
- Test: `src/lib/__tests__/api-planteamiento.test.ts`

**Interfaces:**
- Consumes:
  - `prepararImpresion`, `leerImpresionesDe`, `modoImpresion`, `FilaImpresion` (Task 4);
  - `planteamientosDe` (Task 2);
  - `identidad`, `soloConSesion` (`src/lib/server/sesion.ts`);
  - `esCodigoPedido` (`src/lib/types.ts`).
- Produces:
  - Body de `/api/estado`: `imprimirPlanteamiento?: boolean` (ausente = sí).
  - `GET /api/planteamiento?pedido=AR.26.05016` →
    `{ modo: ModoImpresion; ficheros: Array<{ nombre: string; paginas: number; todoA4: boolean }>; aviso: string | null; impresiones: FilaImpresion[] }`
  - `GET /api/planteamiento/fichero?pedido=…&nombre=…` → el PDF (`application/pdf`, inline).
  - `POST /api/planteamiento/reimprimir` con body `{ pedido, operarioId }` → `{ encolados, manuales, aviso }`, o 409 si está en `off`.

Antes de escribir las rutas, lee la guía de Route Handlers de `node_modules/next/dist/docs/` (AGENTS.md). Copia el estilo de `src/app/api/historial/[pedido]/recuperar/route.ts`: GET con `soloConSesion` y POST con `identidad(req, b.operarioId, "tecnico")`.

- [ ] **Step 1: Failing tests**

En `api-estado.test.ts`, junto a los otros `vi.mock`:

```ts
const { prepararImpresionMock } = vi.hoisted(() => ({ prepararImpresionMock: vi.fn(async () => ({ encolados: 1, manuales: [], aviso: null })) }));
vi.mock("../server/impresion-cola", () => ({ prepararImpresion: prepararImpresionMock, modoImpresion: () => "activo" }));
```

Añade casos. Usa el pedido de OT que ya usen los tests de `completar` de ese fichero; mira cómo construyen el body y la sección.

```ts
test("al pasar un pedido de OT se prepara la impresión de su planteamiento", async () => {
  // …pasar el pedido como en los tests de completar de este fichero, con seccion "ot"…
  expect(prepararImpresionMock).toHaveBeenCalledWith(CODIGO, "ivan");
});

test("con la casilla desmarcada no se imprime", async () => {
  // …mismo pase con imprimirPlanteamiento: false…
  expect(prepararImpresionMock).not.toHaveBeenCalled();
});

test("Diseño e Impresión no imprimen", async () => {
  // …mismo pase con seccion "diseno"…
  expect(prepararImpresionMock).not.toHaveBeenCalled();
});

test("si la impresión falla, el pase sale bien igual", async () => {
  prepararImpresionMock.mockRejectedValueOnce(new Error("disco"));
  // …pase de OT…
  expect(res.status).toBe(200);
});
```

Rellena los `…` copiando el pase de un test de `completar` que ya exista en ese fichero, con su pedido, sus OF y su `operarioId`.

`src/lib/__tests__/api-planteamiento.test.ts`. Sigue el montaje de `api-fases-cerrar-of.test.ts`: BD temporal, `DATASOURCE=mock`, login apagado, persona sembrada `ivan`. Mockea `../server/planteamiento-pdf` y `../server/impresion-cola`:

```ts
test("GET devuelve modo, ficheros e impresiones", async () => {
  const r = await ruta.GET(new Request("http://x/api/planteamiento?pedido=AR.26.05016"));
  expect(r.status).toBe(200);
  expect(await r.json()).toMatchObject({ modo: "activo", ficheros: [{ nombre: "AR2605016-10.pdf", paginas: 1, todoA4: true }] });
});

test("GET con un código que no es de pedido: 400", async () => {
  expect((await ruta.GET(new Request("http://x/api/planteamiento?pedido=../etc"))).status).toBe(400);
});

test("fichero: solo sirve un nombre que esté en la lista del pedido", async () => {
  expect((await fichero.GET(new Request("http://x/api/planteamiento/fichero?pedido=AR.26.05016&nombre=..%2F..%2Fsecreto.pdf"))).status).toBe(404);
});

test("reimprimir en off: 409", async () => {
  modoMock.mockReturnValueOnce("off");
  const r = await reimprimir.POST(new Request("http://x", { method: "POST", body: JSON.stringify({ pedido: "AR.26.05016", operarioId: "ivan" }) }));
  expect(r.status).toBe(409);
});
```

Run: `pnpm test src/lib/__tests__/api-estado.test.ts src/lib/__tests__/api-planteamiento.test.ts`
Expected: FAIL. No llama a `prepararImpresion` y las rutas no existen.

- [ ] **Step 2: `/api/estado`**

- En `interface Body`: `imprimirPlanteamiento?: boolean;`.
- Antes del `if (completarPedidoId) {` de la línea ~126: `let codigoPedido: string | undefined;`. Dentro, tras encontrar `pedido`: `codigoPedido = pedido.codigo;`.
- Al final, tras `encolarFinalizacion(aFinalizar, operarioId);` y dentro del mismo `if (completarPedidoId)`:

```ts
    // El planteamiento de CAD sale solo en Producción (spec 2026-10-13). Solo
    // OT, y lo decide aquí el servidor: vuelve a buscar el PDF en vez de
    // fiarse de lo que vio el navegador. Nunca tumba el pase: imprimir es lo
    // de después, el pedido ya está pasado.
    if (
      seccion === "ot" &&
      body.imprimirPlanteamiento !== false &&
      codigoPedido &&
      esCodigoPedido(codigoPedido) &&
      modoImpresion() !== "off"
    ) {
      try {
        await prepararImpresion(codigoPedido, operarioId);
      } catch (e) {
        console.error(`[impresion] no se pudo preparar ${codigoPedido}:`, (e as Error).message);
      }
    }
```

Importa `prepararImpresion` y `modoImpresion` de `@/lib/server/impresion-cola` y `esCodigoPedido` de `@/lib/types`, si no estaba ya.

- [ ] **Step 3: `src/app/api/planteamiento/route.ts`**

```ts
import { NextResponse } from "next/server";
import { esCodigoPedido } from "@/lib/types";
import { planteamientosDe } from "@/lib/server/planteamiento-pdf";
import { leerImpresionesDe, modoImpresion } from "@/lib/server/impresion-cola";
import { soloConSesion } from "@/lib/server/sesion";

// ─── GET /api/planteamiento?pedido=AR.26.05016 ───────────────────────────────
// Lo que el diálogo de pasar enseña («se imprimirá…») y lo que la ficha del
// Historial cuenta de lo ya impreso. Solo lectura.

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const corte = soloConSesion(req);
  if (corte) return corte;
  const pedido = new URL(req.url).searchParams.get("pedido") ?? "";
  if (!esCodigoPedido(pedido)) return NextResponse.json({ error: "Pedido no válido" }, { status: 400 });
  const { ficheros, aviso } = await planteamientosDe(pedido);
  return NextResponse.json(
    {
      modo: modoImpresion(),
      ficheros: ficheros.map(({ nombre, paginas, todoA4 }) => ({ nombre, paginas, todoA4 })),
      aviso,
      impresiones: leerImpresionesDe(pedido),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
```

- [ ] **Step 4: `src/app/api/planteamiento/fichero/route.ts`**

```ts
import { readFile } from "node:fs/promises";
import { NextResponse } from "next/server";
import { esCodigoPedido } from "@/lib/types";
import { planteamientosDe } from "@/lib/server/planteamiento-pdf";
import { soloConSesion } from "@/lib/server/sesion";

// ─── GET /api/planteamiento/fichero?pedido=…&nombre=… ───────────────────────
// El PDF para imprimirlo a mano, cuando lleva páginas que no son A4. El
// nombre NO es una ruta: se busca en la lista del pedido, así que no se puede
// pedir otro fichero del disco.

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const corte = soloConSesion(req);
  if (corte) return corte;
  const q = new URL(req.url).searchParams;
  const pedido = q.get("pedido") ?? "";
  const nombre = q.get("nombre") ?? "";
  if (!esCodigoPedido(pedido)) return NextResponse.json({ error: "Pedido no válido" }, { status: 400 });
  const f = (await planteamientosDe(pedido)).ficheros.find((x) => x.nombre === nombre);
  if (!f) return NextResponse.json({ error: "No existe" }, { status: 404 });
  return new NextResponse(new Uint8Array(await readFile(f.ruta)), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${encodeURIComponent(f.nombre)}"`,
      "Cache-Control": "no-store",
    },
  });
}
```

- [ ] **Step 5: `src/app/api/planteamiento/reimprimir/route.ts`**

```ts
import { NextResponse } from "next/server";
import { esCodigoPedido } from "@/lib/types";
import { modoImpresion, prepararImpresion } from "@/lib/server/impresion-cola";
import { identidad } from "@/lib/server/sesion";

// ─── POST /api/planteamiento/reimprimir ──────────────────────────────────────
// «Reimprimir» desde la ficha del Historial: vuelve a buscar el planteamiento
// —puede haberse corregido— y lo encola como al pasar. Solo con rol técnico.

export async function POST(req: Request) {
  let b: Record<string, unknown>;
  try {
    b = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "JSON no válido" }, { status: 400 });
  }
  const pedido = typeof b.pedido === "string" ? b.pedido : "";
  if (!esCodigoPedido(pedido)) return NextResponse.json({ error: "Pedido no válido" }, { status: 400 });
  const yo = identidad(req, b.operarioId, "tecnico");
  if (yo instanceof NextResponse) return yo;
  if (modoImpresion() === "off") return NextResponse.json({ error: "La impresión está apagada" }, { status: 409 });
  return NextResponse.json(await prepararImpresion(pedido, yo.id));
}
```

Ajusta la firma de `identidad` a la real (ver `sesion.ts:209`).

- [ ] **Step 6: Run tests**

Run: `pnpm test src/lib/__tests__/api-estado.test.ts src/lib/__tests__/api-planteamiento.test.ts && pnpm test && pnpm exec tsc --noEmit && pnpm lint`
Expected: verde.

- [ ] **Step 7: Commit**

```bash
git add src/app/api/estado/route.ts src/app/api/planteamiento src/lib/__tests__/api-estado.test.ts src/lib/__tests__/api-planteamiento.test.ts
git commit -m "feat(impresion): al pasar un pedido de OT se imprime su planteamiento; rutas de consulta y reimpresión"
```

---

### Task 6: La pantalla: diálogo de pasar e Historial

**Files:**
- Create: `src/lib/imprimir-pdf.ts` (cliente: abre el cuadro de imprimir)
- Modify: `src/components/Board.tsx` (`completarPedido` ~2202; `completarPedidoAhora` ~2210-2256; `ConfirmDialog` ~2970-2985)
- Create: `src/components/PlanteamientoPedido.tsx`
- Modify: `src/components/HistorialDrawer.tsx` (tras `<DocumentosPedido>`, ~308)
- Test: `src/lib/__tests__/planteamiento-textos.test.ts` (los textos son funciones puras)

**Interfaces:**
- Consumes: las tres rutas de la Task 5.
- Produces:
  - `textoAntesDePasar(d: VistaPlanteamiento): string | null`
  - `textoImpresion(f: FilaImpresion): string`
  - `interface VistaPlanteamiento { modo: ModoImpresion; ficheros: { nombre: string; paginas: number; todoA4: boolean }[]; aviso: string | null; impresiones: FilaImpresion[] }`

  Todo en `src/lib/planteamiento-textos.ts`. `FilaImpresion` y `ModoImpresion` se importan como `import type` desde `@/lib/server/impresion-cola`; en el cliente solo existen los tipos.

- [ ] **Step 1: Failing test de los textos**

```ts
import { describe, expect, it } from "vitest";
import { textoAntesDePasar, textoImpresion } from "../planteamiento-textos";

const base = { modo: "activo" as const, aviso: null, impresiones: [] };

describe("lo que dice el diálogo de pasar", () => {
  it("todo A4", () => {
    expect(textoAntesDePasar({ ...base, ficheros: [{ nombre: "AR2605016-10.pdf", paginas: 1, todoA4: true }] }))
      .toBe("Se imprimirá en Producción: AR2605016-10.pdf (1 pág.)");
  });
  it("alguna página no A4", () => {
    expect(textoAntesDePasar({ ...base, ficheros: [{ nombre: "AR2605099-10.pdf", paginas: 2, todoA4: false }] }))
      .toBe("AR2605099-10.pdf lleva una página que no es A4: al pasar se abrirá el cuadro de imprimir");
  });
  it("sin planteamiento", () => {
    expect(textoAntesDePasar({ ...base, ficheros: [] })).toBe("No encuentro el planteamiento en Planteamientos: se pasará sin imprimir");
  });
  it("carpeta ilegible", () => {
    expect(textoAntesDePasar({ ...base, ficheros: [], aviso: "No puedo leer la carpeta Planteamientos" }))
      .toBe("No puedo leer la carpeta Planteamientos: se pasará sin imprimir");
  });
  it("en ensayo lo dice", () => {
    expect(textoAntesDePasar({ ...base, modo: "ensayo", ficheros: [{ nombre: "A-10.pdf", paginas: 3, todoA4: true }] }))
      .toBe("Se imprimirá en la impresora de OT (ensayo): A-10.pdf (3 págs.)");
  });
  it("apagado: no dice nada", () => {
    expect(textoAntesDePasar({ ...base, modo: "off", ficheros: [] })).toBeNull();
  });
});

describe("lo que cuenta el Historial", () => {
  const fila = { id: 1, pedidoId: "AR.26.05016", fichero: "AR2605016-10.pdf", paginas: 1, intentos: 0, error: null, impresora: "ipp://192.168.4.245/ipp", pasadoPor: "ivan", creadoAt: "2026-10-13T11:05:00Z", enviadoAt: "2026-10-13T11:05:30Z" };
  it("enviado", () => {
    expect(textoImpresion({ ...fila, estado: "enviado" })).toBe("Impreso en Producción el 13/10 a las 13:05 · AR2605016-10.pdf");
  });
  it("pendiente con error", () => {
    expect(textoImpresion({ ...fila, estado: "pendiente", intentos: 3, error: "La impresora no responde", enviadoAt: null }))
      .toBe("Pendiente de imprimir: La impresora no responde (3 intentos)");
  });
  it("manual y sin planteamiento", () => {
    expect(textoImpresion({ ...fila, estado: "manual" })).toBe("Impresión a mano: AR2605016-10.pdf lleva páginas que no son A4");
    expect(textoImpresion({ ...fila, estado: "sin_planteamiento", fichero: null })).toBe("Se pasó sin planteamiento en Planteamientos");
  });
});
```

Run: `pnpm test src/lib/__tests__/planteamiento-textos.test.ts`
Expected: FAIL. No resuelve `../planteamiento-textos`.

- [ ] **Step 2: `src/lib/planteamiento-textos.ts`**

```ts
import type { FilaImpresion, ModoImpresion } from "./server/impresion-cola";

// ─── Lo que la pantalla dice del planteamiento ───────────────────────────────
// Funciones puras para que el diálogo de pasar y la ficha del Historial digan
// siempre lo mismo, y se puedan probar sin montar componentes.

export interface VistaPlanteamiento {
  modo: ModoImpresion;
  ficheros: { nombre: string; paginas: number; todoA4: boolean }[];
  aviso: string | null;
  impresiones: FilaImpresion[];
}

const pags = (n: number) => `${n} ${n === 1 ? "pág." : "págs."}`;

export function textoAntesDePasar(d: VistaPlanteamiento): string | null {
  if (d.modo === "off") return null;
  if (d.ficheros.length === 0) {
    return `${d.aviso ?? "No encuentro el planteamiento en Planteamientos"}: se pasará sin imprimir`;
  }
  const manual = d.ficheros.find((f) => !f.todoA4);
  if (manual) return `${manual.nombre} lleva una página que no es A4: al pasar se abrirá el cuadro de imprimir`;
  const donde = d.modo === "ensayo" ? "la impresora de OT (ensayo)" : "Producción";
  return `Se imprimirá en ${donde}: ${d.ficheros.map((f) => `${f.nombre} (${pags(f.paginas)})`).join(", ")}`;
}

/** «13/10 a las 13:05», en hora de Madrid. */
function cuando(iso: string): string {
  const d = new Date(iso);
  const dia = d.toLocaleDateString("es-ES", { day: "2-digit", month: "2-digit", timeZone: "Europe/Madrid" });
  const hora = d.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Madrid" });
  return `${dia} a las ${hora}`;
}

export function textoImpresion(f: FilaImpresion): string {
  switch (f.estado) {
    case "enviado": {
      const donde = f.impresora?.includes("192.168.4.249") ? "la impresora de OT (ensayo)" : "Producción";
      return `Impreso en ${donde} el ${cuando(f.enviadoAt ?? f.creadoAt)} · ${f.fichero}`;
    }
    case "pendiente":
      return f.error
        ? `Pendiente de imprimir: ${f.error} (${f.intentos} ${f.intentos === 1 ? "intento" : "intentos"})`
        : "Pendiente de imprimir";
    case "manual":
      return `Impresión a mano: ${f.fichero} lleva páginas que no son A4`;
    case "sin_planteamiento":
      return "Se pasó sin planteamiento en Planteamientos";
    case "descartado":
      return `Descartado: ${f.fichero ?? ""}`;
  }
}
```

Para no depender de una IP fija en el texto de «ensayo», la cola puede guardar el modo (`ensayo`/`activo`) en vez de comparar la IP. Si al implementar resulta sencillo, añade la columna `modo` en la Task 4 y úsala aquí; si no, deja la comparación con un comentario.

Run: `pnpm test src/lib/__tests__/planteamiento-textos.test.ts`
Expected: PASS.

- [ ] **Step 3: Abrir el cuadro de imprimir (`src/lib/imprimir-pdf.ts`)**

```ts
// ─── Imprimir un PDF desde el navegador ──────────────────────────────────────
// Para los planteamientos que no son todo A4: se carga el PDF en un iframe
// oculto y se abre el cuadro de imprimir, donde se elige impresora y páginas.
// Si el navegador no deja imprimir el iframe, se abre en una pestaña nueva.
// Se llama DENTRO del clic de confirmar: fuera de un gesto del usuario el
// navegador bloquearía la pestaña de respaldo.

export function abrirParaImprimir(url: string): void {
  const marco = document.createElement("iframe");
  marco.style.position = "fixed";
  marco.style.width = "0";
  marco.style.height = "0";
  marco.style.border = "0";
  marco.src = url;
  marco.onload = () => {
    try {
      marco.contentWindow?.focus();
      marco.contentWindow?.print();
    } catch {
      window.open(url, "_blank", "noopener");
    }
    // Se quita pasado un rato: si se quita antes de que cierre el cuadro,
    // algunos navegadores cancelan la impresión.
    setTimeout(() => marco.remove(), 120_000);
  };
  document.body.appendChild(marco);
}
```

- [ ] **Step 4: Diálogo de pasar en `Board.tsx`**

1. Estado nuevo junto a `pasarPendiente`:
```ts
  // Lo que se va a imprimir al pasar (solo OT). Se pide al abrir el diálogo;
  // mientras no llega, el diálogo sale sin la línea. Ver spec 2026-10-13.
  const [vistaPlanteamiento, setVistaPlanteamiento] = useState<{ pedidoId: string; datos: VistaPlanteamiento } | null>(null);
  const [imprimirAlPasar, setImprimirAlPasar] = useState(true);
```
2. En `completarPedido`, cuando se abre el diálogo (`setPasarPendiente(pedidoId)`), si `seccionActual === "ot"` y el pedido tiene `codigo`:
```ts
      setImprimirAlPasar(true);
      setVistaPlanteamiento(null);
      if (seccionActual === "ot" && pedido.codigo) {
        fetch(`/api/planteamiento?pedido=${encodeURIComponent(pedido.codigo)}`, { cache: "no-store" })
          .then((r) => (r.ok ? r.json() : null))
          .then((d: VistaPlanteamiento | null) => d && setVistaPlanteamiento({ pedidoId, datos: d }))
          .catch(() => {});
      }
```
3. `completarPedidoAhora` gana un tercer parámetro, `opciones?: { imprimirPlanteamiento?: boolean }`, que se pasa en el `persistir` de `completar`: `imprimirPlanteamiento: opciones?.imprimirPlanteamiento`. `marcarImpreso` no cambia; su sección no es OT y el servidor lo ignora.
4. El `ConfirmDialog` pasa a recibir un `mensaje` montado (ReactNode). Debajo del texto de siempre, si `vistaPlanteamiento?.pedidoId === pasarPendiente` y `textoAntesDePasar(...)` no es null:
```tsx
            <div className="mt-3 rounded-lg border border-border bg-surface-2 p-2.5 text-xs">
              <p className="text-text">{textoAntesDePasar(vistaPlanteamiento.datos)}</p>
              {vistaPlanteamiento.datos.impresiones.some((f) => f.estado === "enviado") && (
                <p className="mt-1 text-text-muted">Ya se imprimió antes: {textoImpresion(vistaPlanteamiento.datos.impresiones.find((f) => f.estado === "enviado")!)}</p>
              )}
              {vistaPlanteamiento.datos.ficheros.length > 0 && (
                <label className="mt-2 flex items-center gap-2 text-text">
                  <input type="checkbox" checked={imprimirAlPasar} onChange={(e) => setImprimirAlPasar(e.target.checked)} />
                  Imprimir en Producción
                </label>
              )}
            </div>
```
   Usa los tokens de color que ya use el resto del `Board` para recuadros secundarios: mira cómo pintan sus avisos los otros `ConfirmDialog` del fichero y copia sus clases.
5. `onConfirmar`:
```ts
        onConfirmar={() => {
          const id = pasarPendiente;
          setPasarPendiente(null);
          if (!id) return;
          const vista = vistaPlanteamiento?.pedidoId === id ? vistaPlanteamiento.datos : null;
          const pedido = pedidos.find((p) => p.id === id);
          // Los que no son todo A4 se imprimen a mano: el cuadro se abre AQUÍ,
          // dentro del clic, porque fuera de él el navegador lo bloquea.
          if (imprimirAlPasar && vista && vista.modo !== "off" && pedido?.codigo) {
            for (const f of vista.ficheros.filter((x) => !x.todoA4)) {
              abrirParaImprimir(`/api/planteamiento/fichero?pedido=${encodeURIComponent(pedido.codigo)}&nombre=${encodeURIComponent(f.nombre)}`);
            }
          }
          completarPedidoAhora(id, undefined, { imprimirPlanteamiento: imprimirAlPasar });
        }}
```

- [ ] **Step 5: Bloque del Historial (`src/components/PlanteamientoPedido.tsx`)**

```tsx
"use client";

import { useCallback, useEffect, useState } from "react";
import { textoImpresion, type VistaPlanteamiento } from "@/lib/planteamiento-textos";

/** El planteamiento en la ficha del Historial: qué se imprimió y cuándo, y
 *  «Reimprimir». Pide sus datos aparte, como «gastado»: si falla, el resto de
 *  la ficha no se entera. Solo se monta en la sección OT. */
export function PlanteamientoPedido({ pedido, miId }: { pedido: string; miId: string | null }) {
  const [datos, setDatos] = useState<VistaPlanteamiento | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [mensaje, setMensaje] = useState<string | null>(null);

  const cargar = useCallback(() => {
    fetch(`/api/planteamiento?pedido=${encodeURIComponent(pedido)}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: VistaPlanteamiento | null) => setDatos(d))
      .catch(() => setDatos(null));
  }, [pedido]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  if (!datos || datos.modo === "off" || (datos.impresiones.length === 0 && datos.ficheros.length === 0)) return null;

  const reimprimir = async () => {
    setEnviando(true);
    setMensaje(null);
    try {
      const r = await fetch("/api/planteamiento/reimprimir", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pedido, operarioId: miId }),
      });
      setMensaje(r.ok ? "Enviado a la cola de impresión" : "No se ha podido reimprimir");
      cargar();
    } finally {
      setEnviando(false);
    }
  };

  return (
    <section className="mb-4">
      <h3 className="mb-1.5 text-[11px] font-bold uppercase tracking-wide text-text-muted">Planteamiento</h3>
      <ul className="flex flex-col gap-1 text-xs text-text">
        {datos.impresiones.slice(0, 3).map((f) => (
          <li key={f.id}>{textoImpresion(f)}</li>
        ))}
      </ul>
      {datos.ficheros.length > 0 && miId && (
        <button
          type="button"
          onClick={reimprimir}
          disabled={enviando}
          className="chip-3d mt-2 rounded-lg px-2.5 py-1 text-xs font-semibold text-text disabled:opacity-40"
        >
          Reimprimir
        </button>
      )}
      {mensaje && <p className="mt-1 text-[11px] text-text-muted">{mensaje}</p>}
    </section>
  );
}
```

Copia la clase del título de bloque de `HistorialDrawer.tsx` (`TITULO_BLOQUE`) en vez de la escrita arriba, para que el título se vea igual que los demás.

En `HistorialDrawer.tsx`, tras `<DocumentosPedido …/>`:
```tsx
              {seccion === "ot" && esCodigoPedido(pedido) && (
                <PlanteamientoPedido key={`plan:${pedido}`} pedido={pedido} miId={miId} />
              )}
```
Comprueba qué nombre tiene `miId` en ese componente; `NotasPedido` ya lo recibe.

- [ ] **Step 6: Verificar**

Run: `pnpm test && pnpm exec tsc --noEmit && pnpm lint`
Expected: verde.

- [ ] **Step 7: Commit**

```bash
git add src/lib/planteamiento-textos.ts src/lib/imprimir-pdf.ts src/components/Board.tsx src/components/PlanteamientoPedido.tsx src/components/HistorialDrawer.tsx src/lib/__tests__/planteamiento-textos.test.ts
git commit -m "feat(impresion): el diálogo de pasar dice qué se imprime y el Historial cuenta lo impreso"
```

---

### Task 7: Comprobación real, prueba en la app y novedad

**Files:**
- Create: `scripts/verificar-planteamientos.test.ts`

- [ ] **Step 1: Script opt-in**

```ts
import { expect, test } from "vitest";
import { planteamientosDe } from "../src/lib/server/planteamiento-pdf";
import { imprimirPdf } from "../src/lib/server/ipp";
import { readFileSync } from "node:fs";

// ─── Planteamientos contra las carpetas y la impresora de verdad ─────────────
// Solo lectura, salvo la última prueba, que IMPRIME una página en la impresora
// de OT y necesita su propia bandera.
//
//   VALIDAR_PLANTEAMIENTOS=1 PEDIDOS_CAD=AR.26.05016 PEDIDOS_TGM=AR.26.04351 \
//     node --env-file=.env.local node_modules/vitest/vitest.mjs run scripts/verificar-planteamientos.test.ts
//   …y para imprimir una prueba en OT: IMPRIMIR_PRUEBA_OT=/ruta/a/una-pagina.pdf

const ACTIVO = process.env.VALIDAR_PLANTEAMIENTOS === "1";
const lista = (v?: string) => (v ?? "").split(",").map((s) => s.trim()).filter(Boolean);

test.skipIf(!ACTIVO)("los de CAD se encuentran y los de toldos-testar no", async () => {
  for (const p of lista(process.env.PEDIDOS_CAD)) {
    const r = await planteamientosDe(p);
    console.info(p, r);
    expect(r.aviso).toBeNull();
    expect(r.ficheros.length).toBeGreaterThan(0);
  }
  for (const p of lista(process.env.PEDIDOS_TGM)) {
    expect((await planteamientosDe(p)).ficheros).toEqual([]);
  }
});

test.skipIf(!process.env.IMPRIMIR_PRUEBA_OT)("imprime una página en la impresora de OT", async () => {
  const r = await imprimirPdf("ipp://192.168.4.249/ipp", new Uint8Array(readFileSync(process.env.IMPRIMIR_PRUEBA_OT!)), {
    nombre: "Prueba CoordinaOT",
    usuario: "CoordinaOT",
  });
  console.info("trabajo", r.trabajo);
});
```

Ejecútalo desde un PC de la oficina con `PLANTEAMIENTOS_DIR_WIN` apuntando a la carpeta Planteamientos por red. Si no se conoce esa ruta, apunta la prueba de carpetas como pendiente de hacer en el servidor. **La de imprimir solo se lanza si Iván lo pide.**

- [ ] **Step 2: Commit con novedad**

```bash
git add scripts/verificar-planteamientos.test.ts
git commit -F - <<'EOF'
test(impresion): planteamientos contra las carpetas y la impresora reales

Novedad: nuevo | Al pasar un pedido a Producción, su planteamiento se imprime solo arriba
Detalle: El PDF de CAD que guardas en Planteamientos sale en la impresora de Producción. Si lleva alguna página que no es A4, se abre el cuadro de imprimir.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

- [ ] **Step 3: Despliegue (lo hace Iván)**

En el `.env` del servidor, para empezar en ensayo:
```
cd /webs/coordina-ot && printf '\nIMPRESION_PRODUCCION=ensayo\nPLANTEAMIENTOS_DIR=/mnt/escaner/Planteamientos\nPLANTEAMIENTOS_ARCHIVO_DIR=/mnt/rps/VENTAS/PLANTEAMIENTOS/{YYYY}\n' >> .env
```
Despliegue normal. Unos días en `ensayo`, imprimiendo en OT, y después `IMPRESION_PRODUCCION=activo` y `pm2 restart coordina-ot`.
