# Visor de PDF propio — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Pintar los PDF del parte y del visor de documentos con pdf.js en un canvas propio —giro sin girar el scroll, sin recargas al cambiar encaje, más rápido—, dejando el visor del navegador a un clic para quien lo prefiera.

**Architecture:** Las cuentas (escala, giro, zoom, preferencia, caché) van en `src/lib/visor-pdf.ts`, puras y probadas sin DOM. Los componentes en `src/components/VisorPdf/` cargan pdf.js de forma perezosa con un worker compartido servido desde `public/`, pintan solo las páginas visibles y sueltan la memoria de las que salen de pantalla. `ParteEscaneado` y `VisorDocumento` eligen entre ese motor y el `<iframe>` de siempre según una preferencia guardada en `localStorage`.

**Tech Stack:** Next 16.2.9 (Turbopack), React 19.2, `pdfjs-dist` 6.1.200 (ya instalado), Tailwind 4, Vitest 4 (entorno node, render con `renderToStaticMarkup`).

**Spec:** `docs/superpowers/specs/2026-09-18-visor-pdf-propio-design.md`

## Global Constraints

- Sin anotaciones ni dibujos. Sin búsqueda de texto. `ScanViewer` no se toca.
- Ningún cambio de servidor: ni tablas, ni rutas. Las rutas ya mandan `Cache-Control: private, max-age=86400` y no entienden `Range`.
- `getDocument` siempre con `disableRange: true, disableStream: true`.
- Tope de `devicePixelRatio`: 2. Tope de documentos abiertos en caché: 5.
- Preferencia de motor en `localStorage`, clave `coordina-visor-motor`, valores `"propio"` (por defecto) y `"navegador"`. Leerla nunca revienta.
- Ajustar al ancho / al alto en los DOS visores (parte y documentos), recordado en `localStorage` por separado: `coordina-parte-encaje` (la clave de hoy, para no perder lo que cada uno ya tiene puesto) y `coordina-documentos-encaje`. Pulsar otra vez el puesto vuelve a página entera. El giro NO se recuerda.
- Botón «Abrir en pestaña» visible en los dos motores.
- En motor navegador no hay botón de giro (lo pone el visor de cada uno).
- Worker en `/pdf.worker.mjs`, copiado desde `pdfjs-dist/build/pdf.worker.min.mjs` por `scripts/copiar-worker.mjs`; nunca a mano, nunca commiteado.
- Comentarios y textos de interfaz en castellano, con el tono de los ficheros vecinos (explican el porqué, no el qué).
- Commits que el equipo nota llevan línea `Novedad:` en la primera columna (ver `AGENTS.md`). Los demás, no.
- Ningún `setState` síncrono en el cuerpo de un `useEffect` (lo marca el lint de `react-hooks`); solo en callbacks de promesas, observers o eventos.

## Mapa de ficheros

| Fichero | Qué hace |
|---|---|
| `src/lib/visor-pdf.ts` (nuevo) | Giro, escala por encaje, zoom, pixel ratio, preferencia de motor, caché LRU de documentos. Puro. |
| `src/lib/__tests__/visor-pdf.test.ts` (nuevo) | Pruebas de lo anterior. |
| `scripts/copiar-worker.mjs` (nuevo) | Copia el worker de pdf.js a `public/`. |
| `src/components/VisorPdf/pdfjs-cliente.ts` (nuevo) | `import()` perezoso de pdf.js + worker compartido. |
| `src/components/VisorPdf/usePdfDoc.ts` (nuevo) | Hook de carga con la caché; `precargarPdf`. |
| `src/components/VisorPdf/imprimir.ts` (nuevo) | Imprimir el PDF desde un iframe oculto. |
| `src/components/VisorPdf/preferencias.ts` (nuevo) | Hooks `useMotorPdf` y `useEncajePdf`: lo que cada uno deja puesto. |
| `src/components/VisorPdf/BotonesEncaje.tsx` (nuevo) | Los dos botones ↔ ↕, compartidos por parte y documentos. |
| `src/components/VisorPdf/PaginaPdf.tsx` (nuevo) | Una página: canvas, render perezoso, cancelación, liberar memoria. |
| `src/components/VisorPdf/VisorPdf.tsx` (nuevo) | El hueco con scroll, encaje, zoom con Ctrl+rueda, miniatura de arranque. |
| `src/components/VisorPdf/MotorNavegador.tsx` (nuevo) | El `<iframe>` de siempre. |
| `src/components/ParteEscaneado.tsx` | Elige motor; carril de chips con el nuevo interruptor y «abrir en pestaña». |
| `src/components/VisorDocumento.tsx` | Elige motor; precarga vecinos. |
| `src/lib/__tests__/parte-girar.test.ts` | Se adapta: el giro ya no es CSS. |
| `src/lib/__tests__/visor-pdf-componente.test.ts` (nuevo) | Render en servidor de `VisorPdf`. |
| `package.json`, `.gitignore` | `dev`/`build` copian el worker; se ignora `public/pdf.worker.mjs`. |

---

### Task 1: Las cuentas del visor, puras y probadas

**Files:**
- Create: `src/lib/visor-pdf.ts`
- Create: `src/lib/__tests__/visor-pdf.test.ts`
- Modify: `src/components/ParteEscaneado.tsx` (quitar `GIROS`, `Giro`, `siguienteGiro`, `giroIntercambia` e importarlos de la lib)
- Modify: `src/lib/__tests__/parte-girar.test.ts:4` (import)

**Interfaces:**
- Produces (usado por las tareas 2–5):
  - `type Giro = 0 | 90 | 180 | 270`
  - `siguienteGiro(giro: Giro): Giro`
  - `giroIntercambia(giro: Giro): boolean`
  - `rotacionTotal(rotacionPagina: number, giro: Giro): number`
  - `type Encaje = "Fit" | "FitH" | "FitV"`
  - `interface Medidas { ancho: number; alto: number }`
  - `escalaParaEncaje(pagina: Medidas, giro: Giro, hueco: Medidas, encaje: Encaje): number`
  - `ZOOM_MIN = 0.25`, `ZOOM_MAX = 6`, `acotarZoom(z: number): number`, `factorRueda(deltaY: number): number`
  - `TOPE_PIXEL_RATIO = 2`, `pixelRatio(dpr: number): number`
  - `type MotorPdf = "propio" | "navegador"`, `CLAVE_MOTOR = "coordina-visor-motor"`
  - `leerMotor(almacen: Pick<Storage, "getItem"> | undefined): MotorPdf`
  - `guardarMotor(almacen: Pick<Storage, "setItem"> | undefined, motor: MotorPdf): void`
  - `CLAVE_ENCAJE_PARTE = "coordina-parte-encaje"`, `CLAVE_ENCAJE_DOCUMENTOS = "coordina-documentos-encaje"`
  - `leerEncaje(almacen: Pick<Storage, "getItem"> | undefined, clave: string): Encaje`
  - `guardarEncaje(almacen: Pick<Storage, "setItem"> | undefined, clave: string, encaje: Encaje): void`
  - `alternarEncaje(actual: Encaje, pulsado: "FitH" | "FitV"): Encaje`
  - `crearCacheDocumentos<D extends { destroy(): unknown }>(abrir: (url: string) => Promise<D>, tope: number): { obtener(url: string): Promise<D>; readonly tamano: number }`

- [ ] **Step 1: Escribir las pruebas (fallan)**

`src/lib/__tests__/visor-pdf.test.ts`:

```ts
import { expect, test, vi } from "vitest";
import {
  CLAVE_ENCAJE_DOCUMENTOS,
  CLAVE_ENCAJE_PARTE,
  CLAVE_MOTOR,
  ZOOM_MAX,
  ZOOM_MIN,
  acotarZoom,
  alternarEncaje,
  crearCacheDocumentos,
  escalaParaEncaje,
  factorRueda,
  giroIntercambia,
  guardarEncaje,
  guardarMotor,
  leerEncaje,
  leerMotor,
  pixelRatio,
  rotacionTotal,
  siguienteGiro,
} from "../visor-pdf";

// A4 vertical en puntos PDF, que es lo que da getViewport({ scale: 1 }).
const A4 = { ancho: 595, alto: 842 };

test("el giro da la vuelta entera en cuatro", () => {
  expect(siguienteGiro(0)).toBe(90);
  expect(siguienteGiro(90)).toBe(180);
  expect(siguienteGiro(180)).toBe(270);
  expect(siguienteGiro(270)).toBe(0);
});

test("solo el cuarto impar intercambia ancho y alto", () => {
  expect(giroIntercambia(90)).toBe(true);
  expect(giroIntercambia(270)).toBe(true);
  expect(giroIntercambia(0)).toBe(false);
  expect(giroIntercambia(180)).toBe(false);
});

test("el giro del botón se SUMA al que ya trae la página", () => {
  // Escáner que guarda la hoja tumbada con /Rotate 90: girar 270 la endereza.
  expect(rotacionTotal(90, 270)).toBe(0);
  expect(rotacionTotal(0, 90)).toBe(90);
  expect(rotacionTotal(270, 180)).toBe(90);
});

test("página entera: manda el lado que antes se sale", () => {
  // Hueco apaisado: el A4 de pie lo limita el alto.
  expect(escalaParaEncaje(A4, 0, { ancho: 1000, alto: 421 }, "Fit")).toBeCloseTo(0.5);
});

test("al ancho y al alto usan solo su eje", () => {
  const hueco = { ancho: 1190, alto: 421 };
  expect(escalaParaEncaje(A4, 0, hueco, "FitH")).toBeCloseTo(2);
  expect(escalaParaEncaje(A4, 0, hueco, "FitV")).toBeCloseTo(0.5);
});

test("girado un cuarto, el ancho de la hoja es su alto de antes", () => {
  // Tumbado, el A4 mide 842 de ancho: al ancho de un hueco de 842 es escala 1.
  expect(escalaParaEncaje(A4, 90, { ancho: 842, alto: 2000 }, "FitH")).toBeCloseTo(1);
  expect(escalaParaEncaje(A4, 270, { ancho: 842, alto: 2000 }, "FitH")).toBeCloseTo(1);
  expect(escalaParaEncaje(A4, 180, { ancho: 595, alto: 2000 }, "FitH")).toBeCloseTo(1);
});

test("sin hueco medido todavía no devuelve cero ni infinito", () => {
  expect(escalaParaEncaje(A4, 0, { ancho: 0, alto: 0 }, "Fit")).toBe(1);
  expect(escalaParaEncaje({ ancho: 0, alto: 0 }, 0, { ancho: 500, alto: 500 }, "Fit")).toBe(1);
});

test("el zoom tiene suelo y techo, y lo que no es número vuelve a 1", () => {
  expect(acotarZoom(100)).toBe(ZOOM_MAX);
  expect(acotarZoom(0.01)).toBe(ZOOM_MIN);
  expect(acotarZoom(1.5)).toBe(1.5);
  expect(acotarZoom(Number.NaN)).toBe(1);
});

test("acercar y alejar lo mismo vuelve al mismo sitio", () => {
  expect(factorRueda(-100) * factorRueda(100)).toBeCloseTo(1);
  expect(factorRueda(-100)).toBeGreaterThan(1); // rueda hacia arriba acerca
});

test("el pixel ratio no baja de 1 ni pasa de 2", () => {
  expect(pixelRatio(3)).toBe(2);
  expect(pixelRatio(1.5)).toBe(1.5);
  expect(pixelRatio(0.5)).toBe(1);
  expect(pixelRatio(Number.NaN)).toBe(1);
});

test("el motor por defecto es el propio, y la basura también cuenta como propio", () => {
  expect(leerMotor(undefined)).toBe("propio");
  expect(leerMotor({ getItem: () => null })).toBe("propio");
  expect(leerMotor({ getItem: () => "adobe" })).toBe("propio");
  expect(leerMotor({ getItem: () => "navegador" })).toBe("navegador");
});

test("un almacenamiento capado no revienta ni al leer ni al guardar", () => {
  const capado = {
    getItem: () => {
      throw new Error("SecurityError");
    },
    setItem: () => {
      throw new Error("QuotaExceededError");
    },
  };
  expect(leerMotor(capado)).toBe("propio");
  expect(() => guardarMotor(capado, "navegador")).not.toThrow();
});

test("guardar escribe en la clave de siempre", () => {
  const setItem = vi.fn();
  guardarMotor({ setItem }, "navegador");
  expect(setItem).toHaveBeenCalledWith(CLAVE_MOTOR, "navegador");
});

test("la clave del parte es la de siempre: nadie pierde el encaje que ya tenía", () => {
  expect(CLAVE_ENCAJE_PARTE).toBe("coordina-parte-encaje");
  expect(CLAVE_ENCAJE_DOCUMENTOS).not.toBe(CLAVE_ENCAJE_PARTE);
});

test("el encaje guardado se lee; lo que no lo es, es la página entera", () => {
  expect(leerEncaje({ getItem: () => "FitH" }, CLAVE_ENCAJE_PARTE)).toBe("FitH");
  expect(leerEncaje({ getItem: () => "FitV" }, CLAVE_ENCAJE_PARTE)).toBe("FitV");
  expect(leerEncaje({ getItem: () => "basura" }, CLAVE_ENCAJE_PARTE)).toBe("Fit");
  expect(leerEncaje({ getItem: () => null }, CLAVE_ENCAJE_PARTE)).toBe("Fit");
  expect(leerEncaje(undefined, CLAVE_ENCAJE_PARTE)).toBe("Fit");
  expect(
    leerEncaje(
      {
        getItem: () => {
          throw new Error("SecurityError");
        },
      },
      CLAVE_ENCAJE_PARTE,
    ),
  ).toBe("Fit");
});

test("cada visor guarda su encaje en su clave", () => {
  const setItem = vi.fn();
  guardarEncaje({ setItem }, CLAVE_ENCAJE_DOCUMENTOS, "FitV");
  expect(setItem).toHaveBeenCalledWith(CLAVE_ENCAJE_DOCUMENTOS, "FitV");
  expect(() =>
    guardarEncaje(
      {
        setItem: () => {
          throw new Error("QuotaExceededError");
        },
      },
      CLAVE_ENCAJE_PARTE,
      "FitH",
    ),
  ).not.toThrow();
});

test("pulsar el encaje puesto vuelve a la página entera; otro, cambia a ese", () => {
  expect(alternarEncaje("Fit", "FitH")).toBe("FitH");
  expect(alternarEncaje("FitH", "FitH")).toBe("Fit");
  expect(alternarEncaje("FitH", "FitV")).toBe("FitV");
  expect(alternarEncaje("FitV", "FitV")).toBe("Fit");
});

const docFalso = () => ({ destroy: vi.fn() });

test("la caché devuelve el mismo documento sin volver a abrirlo", async () => {
  const abrir = vi.fn(async () => docFalso());
  const cache = crearCacheDocumentos(abrir, 5);
  const a = await cache.obtener("/a.pdf");
  const b = await cache.obtener("/a.pdf");
  expect(a).toBe(b);
  expect(abrir).toHaveBeenCalledTimes(1);
});

test("pasado el tope, suelta el más antiguo, no el último que se miró", async () => {
  const cache = crearCacheDocumentos(async () => docFalso(), 2);
  const a = await cache.obtener("/a.pdf");
  await cache.obtener("/b.pdf");
  await cache.obtener("/a.pdf"); // a vuelve a ser el más reciente
  await cache.obtener("/c.pdf"); // sale b, no a
  await Promise.resolve();
  expect(cache.tamano).toBe(2);
  expect(a.destroy).not.toHaveBeenCalled();
});

test("el destruido es el que salió", async () => {
  const docs: Record<string, ReturnType<typeof docFalso>> = {};
  const cache = crearCacheDocumentos(async (url) => (docs[url] = docFalso()), 1);
  await cache.obtener("/a.pdf");
  await cache.obtener("/b.pdf");
  await Promise.resolve();
  expect(docs["/a.pdf"].destroy).toHaveBeenCalledTimes(1);
  expect(docs["/b.pdf"].destroy).not.toHaveBeenCalled();
});

test("un fallo no se queda en la caché: el siguiente intento vuelve a abrir", async () => {
  let intentos = 0;
  const cache = crearCacheDocumentos(async () => {
    intentos++;
    if (intentos === 1) throw new Error("404");
    return docFalso();
  }, 5);
  await expect(cache.obtener("/a.pdf")).rejects.toThrow("404");
  await expect(cache.obtener("/a.pdf")).resolves.toBeDefined();
  expect(intentos).toBe(2);
});
```

- [ ] **Step 2: Comprobar que fallan**

Run: `pnpm vitest run src/lib/__tests__/visor-pdf.test.ts`
Expected: FAIL — `Failed to resolve import "../visor-pdf"`.

- [ ] **Step 3: Escribir `src/lib/visor-pdf.ts`**

```ts
// ─── Las cuentas del visor de PDF propio ─────────────────────────────────────
// Todo lo que el visor decide sin tocar el navegador: a qué escala se pinta la
// hoja para que encaje, hacia dónde mira, qué motor prefiere cada uno y qué
// documentos se quedan abiertos. Vive aparte de los componentes para poder
// probarlo sin DOM: es donde se esconden los errores de «sale recortado».

/** Los cuatro cuartos de vuelta, en el orden en que los da el botón. */
const GIROS = [0, 90, 180, 270] as const;
export type Giro = (typeof GIROS)[number];

/** El siguiente cuarto de vuelta. Cuatro pulsaciones = vuelta entera. */
export function siguienteGiro(giro: Giro): Giro {
  return GIROS[(GIROS.indexOf(giro) + 1) % GIROS.length];
}

/** ¿Este giro intercambia el ancho y el alto de la hoja? A 90° y a 270° lo que
 *  era alto pasa a ser ancho; boca abajo mide igual que del derecho. */
export function giroIntercambia(giro: Giro): boolean {
  return giro === 90 || giro === 270;
}

/** El giro que se le pide a pdf.js: el del botón SUMADO al que ya trae la
 *  página. Hay escáneres que guardan la hoja tumbada con `/Rotate 90` en vez de
 *  girar la imagen; pasar solo el del botón deshace ese giro sin avisar y el
 *  parte sale de lado a la primera. */
export function rotacionTotal(rotacionPagina: number, giro: Giro): number {
  return (((rotacionPagina + giro) % 360) + 360) % 360;
}

/** Cómo encaja la hoja en el hueco. Son los nombres del visor del navegador
 *  (`#view=`), para que el mismo valor guardado valga en los dos motores:
 *  `Fit` es la página entera, `FitH` al ancho y `FitV` al alto. */
export type Encaje = "Fit" | "FitH" | "FitV";

export interface Medidas {
  ancho: number;
  alto: number;
}

/** La escala a la que hay que pintar la hoja para que encaje en el hueco.
 *
 *  `pagina` son sus medidas a escala 1 con el giro PROPIO de la página ya
 *  aplicado (lo que da `getViewport({ scale: 1 })`); `giro` es solo el del
 *  botón. Con hueco o página sin medir devuelve 1 y no 0 ni infinito: en el
 *  primer render el hueco aún no se ha medido, y un canvas de 0 o de infinitos
 *  píxeles es peor que uno a tamaño natural durante un instante. */
export function escalaParaEncaje(pagina: Medidas, giro: Giro, hueco: Medidas, encaje: Encaje): number {
  const ancho = giroIntercambia(giro) ? pagina.alto : pagina.ancho;
  const alto = giroIntercambia(giro) ? pagina.ancho : pagina.alto;
  if (ancho <= 0 || alto <= 0 || hueco.ancho <= 0 || hueco.alto <= 0) return 1;
  const alAncho = hueco.ancho / ancho;
  const alAlto = hueco.alto / alto;
  if (encaje === "FitH") return alAncho;
  if (encaje === "FitV") return alAlto;
  return Math.min(alAncho, alAlto);
}

/** Zoom encima del encaje: 1 es «como encaja». Un cuarto por abajo es la hoja
 *  en sello; seis por arriba basta para leer una cota a lápiz en un escaneo. */
export const ZOOM_MIN = 0.25;
export const ZOOM_MAX = 6;

export function acotarZoom(z: number): number {
  if (!Number.isFinite(z)) return 1;
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, z));
}

/** Cuánto amplía un golpe de rueda con Ctrl. Exponencial y no lineal: así
 *  acercar y alejar lo mismo deja la hoja donde estaba, y el paso se siente
 *  igual a escala 0,5 que a escala 4. `deltaY` negativo (rueda arriba) acerca. */
export function factorRueda(deltaY: number): number {
  return Math.exp(-deltaY * 0.002);
}

/** Por encima de 2 no se nota en un parte escaneado y el canvas crece al
 *  cuadrado: una pantalla 4K a su ratio de 3 pediría hojas de 8 000 px. */
export const TOPE_PIXEL_RATIO = 2;

export function pixelRatio(dpr: number): number {
  if (!Number.isFinite(dpr) || dpr < 1) return 1;
  return Math.min(dpr, TOPE_PIXEL_RATIO);
}

/** Con qué se pinta el PDF. `navegador` es el `<iframe>` de siempre: hay quien
 *  tiene la extensión de Adobe en Firefox y prefiere ese visor. */
export type MotorPdf = "propio" | "navegador";

/** Dónde se recuerda. En el navegador y no en el servidor, por lo mismo que el
 *  encaje del parte: es cómo se MIRA, y va con la pantalla en la que se está
 *  sentado. */
export const CLAVE_MOTOR = "coordina-visor-motor";

/** La preferencia guardada. Cualquier cosa que no sea `navegador` —nada,
 *  basura, un almacenamiento que lanza— es el motor propio. */
export function leerMotor(almacen: Pick<Storage, "getItem"> | undefined): MotorPdf {
  try {
    return almacen?.getItem(CLAVE_MOTOR) === "navegador" ? "navegador" : "propio";
  } catch {
    return "propio";
  }
}

export function guardarMotor(almacen: Pick<Storage, "setItem"> | undefined, motor: MotorPdf): void {
  try {
    almacen?.setItem(CLAVE_MOTOR, motor);
  } catch {
    // Sin almacenamiento el interruptor sigue funcionando; solo no dura.
  }
}

/** Dónde recuerda cada visor su encaje. POR SEPARADO: el parte es un A4 de
 *  pie que se lee entero, y un planteamiento apaisado se mira de otra manera;
 *  quien pone el parte al alto no quiere por eso los planos al alto.
 *
 *  La del parte es la clave que ya existía: cambiarla haría que todo el mundo
 *  perdiera, sin avisar, el encaje que ya tenía elegido. */
export const CLAVE_ENCAJE_PARTE = "coordina-parte-encaje";
export const CLAVE_ENCAJE_DOCUMENTOS = "coordina-documentos-encaje";

/** El encaje guardado en `clave`, o la página entera si no hay uno válido. */
export function leerEncaje(almacen: Pick<Storage, "getItem"> | undefined, clave: string): Encaje {
  try {
    const v = almacen?.getItem(clave);
    return v === "FitH" || v === "FitV" ? v : "Fit";
  } catch {
    return "Fit";
  }
}

export function guardarEncaje(
  almacen: Pick<Storage, "setItem"> | undefined,
  clave: string,
  encaje: Encaje,
): void {
  try {
    almacen?.setItem(clave, encaje);
  } catch {
    // Sin almacenamiento el botón sigue funcionando; solo no dura.
  }
}

/** Dos botones para tres encajes: pulsar el que ya está puesto vuelve a la
 *  página entera, que es como empieza todo. */
export function alternarEncaje(actual: Encaje, pulsado: "FitH" | "FitV"): Encaje {
  return actual === pulsado ? "Fit" : pulsado;
}

/** Documentos ya abiertos, el más reciente al final.
 *
 *  Con las flechas del visor de documentos se va y se vuelve; tener los
 *  últimos a mano hace que volver sea instantáneo. Con tope, porque cada
 *  documento abierto ocupa memoria en el worker, y el que sale se destruye.
 *
 *  Un fallo (404, PDF roto) NO se queda: el siguiente intento vuelve a pedirlo,
 *  que el parte de hoy puede escanearse dentro de cinco minutos. */
export function crearCacheDocumentos<D extends { destroy(): unknown }>(
  abrir: (url: string) => Promise<D>,
  tope: number,
) {
  const vivos = new Map<string, Promise<D>>();
  return {
    obtener(url: string): Promise<D> {
      const ya = vivos.get(url);
      if (ya) {
        // Borrar y volver a poner lo manda al final: es el más reciente.
        vivos.delete(url);
        vivos.set(url, ya);
        return ya;
      }
      const nuevo = Promise.resolve().then(() => abrir(url));
      vivos.set(url, nuevo);
      nuevo.catch(() => {
        if (vivos.get(url) === nuevo) vivos.delete(url);
      });
      while (vivos.size > tope) {
        const [viejaUrl, viejo] = vivos.entries().next().value as [string, Promise<D>];
        vivos.delete(viejaUrl);
        viejo.then(
          (d) => d.destroy(),
          () => {},
        );
      }
      return nuevo;
    },
    get tamano() {
      return vivos.size;
    },
  };
}
```

- [ ] **Step 4: Pasar `ParteEscaneado` a usar la lib**

En `src/components/ParteEscaneado.tsx`, borrar el bloque desde `/** Los cuatro cuartos de vuelta` hasta el cierre de `giroIntercambia` (líneas 19–37: `GIROS`, `Giro`, `siguienteGiro`, `giroIntercambia` con sus comentarios) y dejar los imports de arriba así:

```ts
import { useRef, useState } from "react";
import { giroIntercambia, siguienteGiro, type Giro } from "@/lib/visor-pdf";
```

En `src/lib/__tests__/parte-girar.test.ts` cambiar la línea 4 por:

```ts
import { ParteEscaneado } from "../../components/ParteEscaneado";
import { giroIntercambia, siguienteGiro } from "../visor-pdf";
```

- [ ] **Step 5: Comprobar que pasa todo**

Run: `pnpm vitest run src/lib/__tests__/visor-pdf.test.ts src/lib/__tests__/parte-girar.test.ts`
Expected: PASS, todas.

Run: `pnpm exec tsc --noEmit`
Expected: sin errores. Si otro fichero importaba `Giro`/`siguienteGiro`/`giroIntercambia` de `ParteEscaneado`, cambiarle el import a `@/lib/visor-pdf` (comprobar con `grep -rn "from \"./ParteEscaneado\"\|components/ParteEscaneado" src`).

- [ ] **Step 6: Commit** (sin `Novedad:`: nadie lo nota)

```bash
git add src/lib/visor-pdf.ts src/lib/__tests__/visor-pdf.test.ts src/components/ParteEscaneado.tsx src/lib/__tests__/parte-girar.test.ts
git commit -m "refactor(visor): las cuentas del visor de PDF, aparte y probadas

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: pdf.js en el cliente — worker, carga perezosa, caché, imprimir

**Files:**
- Create: `scripts/copiar-worker.mjs`
- Create: `src/components/VisorPdf/pdfjs-cliente.ts`
- Create: `src/components/VisorPdf/usePdfDoc.ts`
- Create: `src/components/VisorPdf/imprimir.ts`
- Modify: `package.json` (scripts `dev` y `build`)
- Modify: `.gitignore`

**Interfaces:**
- Consumes: `crearCacheDocumentos` (Task 1).
- Produces:
  - `cargarPdfJs(): Promise<typeof import("pdfjs-dist")>`
  - `workerCompartido(): Promise<PDFWorker>`
  - `usePdfDoc(url: string): { doc: PDFDocumentProxy | null; error: boolean }`
  - `precargarPdf(url: string): void`
  - `imprimirPdf(url: string): void`

- [ ] **Step 1: El script que copia el worker**

`scripts/copiar-worker.mjs`:

```js
// Copia el worker de pdf.js a public/, que es desde donde lo pide el visor
// (/pdf.worker.mjs). Por script y no a mano: así la versión del worker va
// siempre con la del paquete, y una actualización de pdfjs-dist no deja un
// worker viejo hablando con una librería nueva — eso falla sin error claro.
//
// No se commitea (.gitignore): se genera en cada `pnpm dev` y `pnpm build`.
import { copyFileSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);
const raiz = path.dirname(require.resolve("pdfjs-dist/package.json"));
const origen = path.join(raiz, "build", "pdf.worker.min.mjs");
const destino = path.join(process.cwd(), "public", "pdf.worker.mjs");

mkdirSync(path.dirname(destino), { recursive: true });
copyFileSync(origen, destino);
console.log(`pdf.worker → ${path.relative(process.cwd(), destino)}`);
```

- [ ] **Step 2: Engancharlo a `dev` y `build`, e ignorar la copia**

En `package.json`, dentro de `"scripts"`, cambiar estas dos líneas. Explícito y no con `prebuild`: pnpm no garantiza los scripts pre/post según configuración.

```json
    "dev": "node scripts/copiar-worker.mjs && next dev",
    "build": "node scripts/copiar-worker.mjs && next build",
```

Añadir al final de `.gitignore`:

```
# Worker de pdf.js: lo copia scripts/copiar-worker.mjs en dev y build.
/public/pdf.worker.mjs
```

Run: `node scripts/copiar-worker.mjs && ls public/pdf.worker.mjs && git status --short public`
Expected: imprime `pdf.worker → public/pdf.worker.mjs` (con `\` en Windows), el fichero existe y `git status` no lo lista.

- [ ] **Step 3: `src/components/VisorPdf/pdfjs-cliente.ts`**

```ts
import type { PDFWorker } from "pdfjs-dist";

// ─── pdf.js en el navegador ──────────────────────────────────────────────────
// Se carga con import() la primera vez que se abre un visor, no con el
// tablero: son cientos de KB que la mayoría de visitas no necesita.
//
// Un solo worker para todos los documentos. Por defecto pdf.js levanta uno por
// documento, y pasando planteamientos con las flechas serían arranques de
// worker en cadena. Al que se le pasa un worker de fuera, pdf.js no lo destruye
// al cerrar el documento: vive lo que vive la pestaña.

type PdfJs = typeof import("pdfjs-dist");

/** Lo copia scripts/copiar-worker.mjs. */
export const RUTA_WORKER = "/pdf.worker.mjs";

let modulo: Promise<PdfJs> | null = null;
let worker: PDFWorker | null = null;

export function cargarPdfJs(): Promise<PdfJs> {
  modulo ??= import("pdfjs-dist")
    .then((pdfjs) => {
      pdfjs.GlobalWorkerOptions.workerSrc = RUTA_WORKER;
      return pdfjs;
    })
    .catch((e) => {
      // Que un fallo de red al cargarlo no deje el visor muerto hasta recargar.
      modulo = null;
      throw e;
    });
  return modulo;
}

export async function workerCompartido(): Promise<PDFWorker> {
  const pdfjs = await cargarPdfJs();
  worker ??= new pdfjs.PDFWorker({ name: "coordina-visor" });
  return worker;
}
```

- [ ] **Step 4: `src/components/VisorPdf/usePdfDoc.ts`**

```ts
import { useEffect, useState } from "react";
import type { PDFDocumentProxy } from "pdfjs-dist";
import { crearCacheDocumentos } from "@/lib/visor-pdf";
import { cargarPdfJs, workerCompartido } from "./pdfjs-cliente";

/** Cinco: el que se ve, sus dos vecinos precargados y dos para volver atrás. */
const TOPE_DOCUMENTOS = 5;

// SIN RANGE Y SIN STREAM. Las rutas que sirven el PDF no entienden `Range`:
// pdf.js haría una petición de sondeo para nada. Pedido entero en un GET
// normal, la caché del navegador (Cache-Control de 24 h, ya puesto en las
// rutas) lo sirve de disco la segunda vez.
const cache = crearCacheDocumentos<PDFDocumentProxy>(async (url) => {
  const [pdfjs, worker] = await Promise.all([cargarPdfJs(), workerCompartido()]);
  return pdfjs.getDocument({ url, worker, disableRange: true, disableStream: true }).promise;
}, TOPE_DOCUMENTOS);

/** Lo deja abierto sin enseñarlo: para el siguiente de la lista. */
export function precargarPdf(url: string): void {
  cache.obtener(url).catch(() => {});
}

interface Estado {
  url: string;
  doc: PDFDocumentProxy | null;
  error: boolean;
}

/** El documento de `url`, o null mientras carga. Al cambiar de url se ve
 *  vacío al momento (no el documento anterior): la comparación de `url` de
 *  abajo lo resuelve sin un setState dentro del efecto. */
export function usePdfDoc(url: string): { doc: PDFDocumentProxy | null; error: boolean } {
  const [estado, setEstado] = useState<Estado>({ url, doc: null, error: false });
  useEffect(() => {
    let vivo = true;
    cache.obtener(url).then(
      (doc) => {
        if (vivo) setEstado({ url, doc, error: false });
      },
      () => {
        if (vivo) setEstado({ url, doc: null, error: true });
      },
    );
    return () => {
      vivo = false;
    };
  }, [url]);
  return estado.url === url ? estado : { doc: null, error: false };
}
```

- [ ] **Step 5: `src/components/VisorPdf/imprimir.ts`**

```ts
/** Imprime el PDF de verdad, no el canvas: un `<iframe>` escondido lo carga
 *  con el visor del navegador y se le pide `print()`. El canvas saldría a la
 *  resolución de pantalla y con los márgenes del visor.
 *
 *  Si el navegador no deja (Firefox con la extensión de Adobe puede no meter
 *  el PDF dentro de un iframe), se abre en otra pestaña y se imprime desde ahí.
 *  El iframe se quita al minuto: antes cortaría el diálogo de imprimir. */
export function imprimirPdf(url: string): void {
  const marco = document.createElement("iframe");
  marco.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0";
  marco.setAttribute("aria-hidden", "true");
  marco.src = url;
  marco.onload = () => {
    try {
      const ventana = marco.contentWindow;
      if (!ventana) throw new Error("sin ventana");
      ventana.focus();
      ventana.print();
    } catch {
      window.open(url, "_blank", "noopener");
    }
    window.setTimeout(() => marco.remove(), 60_000);
  };
  document.body.appendChild(marco);
}
```

- [ ] **Step 6: Tipos y lint**

Run: `pnpm exec tsc --noEmit && pnpm lint`
Expected: sin errores.

- [ ] **Step 7: Commit** (sin `Novedad:`)

```bash
git add scripts/copiar-worker.mjs src/components/VisorPdf/pdfjs-cliente.ts src/components/VisorPdf/usePdfDoc.ts src/components/VisorPdf/imprimir.ts package.json .gitignore
git commit -m "feat(visor): pdf.js en el cliente, con worker compartido y caché de documentos

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: El visor — páginas en canvas, encaje, zoom

**Files:**
- Create: `src/components/VisorPdf/PaginaPdf.tsx`
- Create: `src/components/VisorPdf/VisorPdf.tsx`
- Create: `src/lib/__tests__/visor-pdf-componente.test.ts`

**Interfaces:**
- Consumes: `usePdfDoc` (Task 2); `escalaParaEncaje`, `acotarZoom`, `factorRueda`, `giroIntercambia`, `pixelRatio`, `rotacionTotal`, `Encaje`, `Giro`, `Medidas` (Task 1).
- Produces:
  - `<VisorPdf url: string; encaje: Encaje; giro: Giro; titulo: string; poster?: string />`

- [ ] **Step 1: La prueba de render (falla)**

`src/lib/__tests__/visor-pdf-componente.test.ts`:

```ts
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, test } from "vitest";
import { VisorPdf } from "../../components/VisorPdf/VisorPdf";

const pintar = (poster?: string) =>
  renderToStaticMarkup(
    createElement(VisorPdf, { url: "/x.pdf", encaje: "Fit", giro: 0, titulo: "Pedido X", poster }),
  );

test("el hueco se anuncia con el nombre del documento", () => {
  expect(pintar()).toContain('aria-label="Pedido X"');
});

test("mientras pdf.js arranca se ve la miniatura, no un hueco en blanco", () => {
  expect(pintar("/x.png")).toContain('src="/x.png"');
});

test("sin miniatura no pinta una imagen rota", () => {
  expect(pintar()).not.toContain("<img");
});
```

Run: `pnpm vitest run src/lib/__tests__/visor-pdf-componente.test.ts`
Expected: FAIL — no resuelve `../../components/VisorPdf/VisorPdf`.

- [ ] **Step 2: `src/components/VisorPdf/PaginaPdf.tsx`**

```tsx
"use client";

import { useEffect, useRef, useState } from "react";
import type { PDFDocumentProxy, PDFPageProxy, RenderTask } from "pdfjs-dist";
import { pixelRatio, rotacionTotal, type Giro, type Medidas } from "@/lib/visor-pdf";

/** Cuánto se espera a que pare el zoom antes de volver a pintar nítido.
 *  Mientras, se estira lo ya pintado: instantáneo, borroso un momento. Sin
 *  esta espera, cada golpe de rueda es un render completo encolado. */
const ESPERA_REPINTADO_MS = 150;

/** Una página del PDF.
 *
 *  SOLO SE PINTA SI SE VE (o está a una pantalla de verse). Un planteamiento
 *  de 40 páginas no pinta 40 canvas; y la que sale de pantalla SUELTA su
 *  memoria (canvas a 0×0): a ratio 2, una hoja al ancho son ~14 MB, cuarenta
 *  son más de medio giga.
 *
 *  Se pinta en un canvas aparte y se copia al final: así lo viejo sigue a la
 *  vista, estirado, hasta que lo nuevo está listo — nunca un parpadeo en
 *  blanco. Un render que se queda viejo (otro zoom, otro giro) se cancela. */
export function PaginaPdf({
  doc,
  numero,
  escala,
  giro,
  raiz,
  provisional,
  poster,
}: {
  doc: PDFDocumentProxy;
  numero: number;
  escala: number;
  giro: Giro;
  /** El hueco con scroll: es la ventana contra la que se mira si se ve. */
  raiz: HTMLElement | null;
  /** Medidas en pantalla mientras esta página no ha dicho las suyas: las de
   *  la primera. Sin ellas, cuarenta cajas a 0 px se verían todas a la vez. */
  provisional: Medidas;
  /** Solo la primera: la miniatura del servidor, hasta que se pinta. */
  poster?: string;
}) {
  const caja = useRef<HTMLDivElement>(null);
  const lienzo = useRef<HTMLCanvasElement>(null);
  const giroPintado = useRef<Giro | null>(null);
  const [pagina, setPagina] = useState<PDFPageProxy | null>(null);
  const [visible, setVisible] = useState(false);
  const [pintada, setPintada] = useState(false);

  useEffect(() => {
    let vivo = true;
    doc.getPage(numero).then(
      (p) => {
        if (vivo) setPagina(p);
      },
      () => {},
    );
    return () => {
      vivo = false;
    };
  }, [doc, numero]);

  useEffect(() => {
    const el = caja.current;
    if (!el || !raiz) return;
    const io = new IntersectionObserver(([e]) => setVisible(e.isIntersecting), {
      root: raiz,
      rootMargin: "100% 0px",
    });
    io.observe(el);
    return () => io.disconnect();
  }, [raiz]);

  useEffect(() => {
    const c = lienzo.current;
    if (!pagina || !c) return;
    if (!visible) {
      c.width = 0;
      c.height = 0;
      giroPintado.current = null;
      return;
    }
    const vp = pagina.getViewport({
      scale: escala * pixelRatio(window.devicePixelRatio),
      rotation: rotacionTotal(pagina.rotate, giro),
    });
    // Girar NO espera: estirar la hoja vieja a la forma nueva la deformaría.
    // El zoom sí, y la primera vez no hay nada que estirar.
    const espera = giroPintado.current === giro && c.width > 0 ? ESPERA_REPINTADO_MS : 0;
    let vivo = true;
    let tarea: RenderTask | null = null;
    const t = window.setTimeout(() => {
      const fuera = document.createElement("canvas");
      fuera.width = Math.max(1, Math.floor(vp.width));
      fuera.height = Math.max(1, Math.floor(vp.height));
      tarea = pagina.render({ canvas: fuera, viewport: vp });
      tarea.promise.then(
        () => {
          if (!vivo) return;
          c.width = fuera.width;
          c.height = fuera.height;
          c.getContext("2d")?.drawImage(fuera, 0, 0);
          giroPintado.current = giro;
          setPintada(true);
        },
        // Cancelado por un render más nuevo: es lo esperado, no un error.
        () => {},
      );
    }, espera);
    return () => {
      vivo = false;
      window.clearTimeout(t);
      tarea?.cancel();
    };
  }, [pagina, visible, escala, giro]);

  const vista = pagina?.getViewport({ scale: escala, rotation: rotacionTotal(pagina.rotate, giro) });
  const ancho = vista?.width ?? provisional.ancho;
  const alto = vista?.height ?? provisional.alto;

  return (
    <div ref={caja} className="relative shrink-0 bg-white shadow-md" style={{ width: ancho, height: alto }}>
      {poster && !pintada && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={poster} alt="" aria-hidden="true" className="absolute inset-0 h-full w-full object-contain" />
      )}
      <canvas ref={lienzo} className="block h-full w-full" />
    </div>
  );
}
```

- [ ] **Step 3: `src/components/VisorPdf/VisorPdf.tsx`**

```tsx
"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  acotarZoom,
  escalaParaEncaje,
  factorRueda,
  giroIntercambia,
  type Encaje,
  type Giro,
  type Medidas,
} from "@/lib/visor-pdf";
import { PaginaPdf } from "./PaginaPdf";
import { usePdfDoc } from "./usePdfDoc";

/** Aire alrededor de la hoja, en px: que el borde del papel se vea. */
const MARGEN = 8;

/** El PDF pintado por nosotros.
 *
 *  EL GIRO NO TOCA ESTE CONTENEDOR. Va dentro del render de cada página
 *  (`getViewport({ rotation })`), así que el scroll sigue bajando hacia abajo a
 *  90° igual que a 0°. Era el motivo de todo esto: girando el `<iframe>` con
 *  `transform`, el eje de scroll giraba con él.
 *
 *  EL ENCAJE ES UNA ESCALA, no un fragmento de URL: cambiarlo repinta, no
 *  descarga otra vez ni vuelve a la página 1.
 *
 *  ZOOM CON CTRL + RUEDA (y el pellizco del touchpad, que el navegador manda
 *  igual). La rueda sola es el scroll de siempre. El punto bajo el ratón se
 *  queda bajo el ratón. Cambiar de documento, encaje o giro vuelve a «como
 *  encaja». */
export function VisorPdf({
  url,
  encaje,
  giro,
  titulo,
  poster,
}: {
  url: string;
  encaje: Encaje;
  giro: Giro;
  titulo: string;
  /** Miniatura de la 1ª página que ya genera el servidor: se ve al instante,
   *  borrosa, mientras pdf.js arranca. */
  poster?: string;
}) {
  const { doc, error } = usePdfDoc(url);
  const [raiz, setRaiz] = useState<HTMLDivElement | null>(null);
  const [hueco, setHueco] = useState<Medidas>({ ancho: 0, alto: 0 });
  const [base, setBase] = useState<{ doc: unknown; medidas: Medidas } | null>(null);

  // El zoom va atado a lo que se mira: si cambia documento, encaje o giro,
  // `clave` deja de coincidir y vuelve a 1 sin un efecto que lo resetee.
  const clave = `${url}|${encaje}|${giro}`;
  const [zoom, setZoom] = useState({ clave, valor: 1 });
  const valorZoom = zoom.clave === clave ? zoom.valor : 1;
  const zoomActual = useRef(valorZoom);
  const ancla = useRef<{ x: number; y: number; ratio: number } | null>(null);

  useEffect(() => {
    zoomActual.current = valorZoom;
  }, [valorZoom]);

  // El hueco disponible. ResizeObserver avisa también al empezar a observar,
  // así que no hace falta medir a mano. `clientWidth` ya descuenta la barra de
  // scroll, y `scrollbar-gutter: stable` evita que aparecer y desaparecer la
  // barra haga bailar el encaje al ancho.
  useEffect(() => {
    if (!raiz) return;
    const ro = new ResizeObserver(() =>
      setHueco({ ancho: raiz.clientWidth - MARGEN * 2, alto: raiz.clientHeight - MARGEN * 2 }),
    );
    ro.observe(raiz);
    return () => ro.disconnect();
  }, [raiz]);

  // La primera página marca la escala de todas.
  useEffect(() => {
    if (!doc) return;
    let vivo = true;
    doc.getPage(1).then(
      (p) => {
        if (!vivo) return;
        const v = p.getViewport({ scale: 1 });
        setBase({ doc, medidas: { ancho: v.width, alto: v.height } });
      },
      () => {},
    );
    return () => {
      vivo = false;
    };
  }, [doc]);

  useEffect(() => {
    if (!raiz) return;
    function onRueda(e: WheelEvent) {
      if (!e.ctrlKey) return;
      // Sin esto, Ctrl + rueda amplía la web entera.
      e.preventDefault();
      const r = raiz!.getBoundingClientRect();
      const antes = zoomActual.current;
      const despues = acotarZoom(antes * factorRueda(e.deltaY));
      if (despues === antes) return;
      zoomActual.current = despues;
      ancla.current = { x: e.clientX - r.left, y: e.clientY - r.top, ratio: despues / antes };
      setZoom({ clave, valor: despues });
    }
    raiz.addEventListener("wheel", onRueda, { passive: false });
    return () => raiz.removeEventListener("wheel", onRueda);
  }, [raiz, clave]);

  // Tras ampliar, se corre el scroll para que lo que estaba bajo el ratón
  // siga ahí. Antes de pintar (layout effect), o se ve el salto.
  useLayoutEffect(() => {
    const a = ancla.current;
    if (!a || !raiz) return;
    ancla.current = null;
    raiz.scrollLeft = (raiz.scrollLeft + a.x) * a.ratio - a.x;
    raiz.scrollTop = (raiz.scrollTop + a.y) * a.ratio - a.y;
  }, [valorZoom, raiz]);

  const medidas = base && base.doc === doc ? base.medidas : null;
  const escala = medidas ? escalaParaEncaje(medidas, giro, hueco, encaje) * valorZoom : 0;
  const provisional: Medidas = medidas
    ? giroIntercambia(giro)
      ? { ancho: medidas.alto * escala, alto: medidas.ancho * escala }
      : { ancho: medidas.ancho * escala, alto: medidas.alto * escala }
    : { ancho: 0, alto: 0 };

  return (
    <div
      ref={setRaiz}
      role="document"
      aria-label={titulo}
      tabIndex={0}
      onClick={(e) => e.stopPropagation()}
      className="h-full w-full overflow-auto rounded-xl bg-neutral-200 outline-none [scrollbar-gutter:stable] dark:bg-neutral-800"
    >
      {error ? (
        <div className="grid h-full place-items-center p-6 text-center text-sm text-text-muted">
          <p>
            No se ha podido abrir este PDF aquí.{" "}
            <a href={url} target="_blank" rel="noopener" className="underline">
              Ábrelo en otra pestaña
            </a>
            .
          </p>
        </div>
      ) : (
        <div className="mx-auto flex w-fit flex-col items-center gap-2" style={{ padding: MARGEN }}>
          {doc && escala > 0
            ? Array.from({ length: doc.numPages }, (_, i) => (
                <PaginaPdf
                  key={i}
                  doc={doc}
                  numero={i + 1}
                  escala={escala}
                  giro={giro}
                  raiz={raiz}
                  provisional={provisional}
                  poster={i === 0 ? poster : undefined}
                />
              ))
            : poster && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={poster}
                  alt=""
                  aria-hidden="true"
                  className="bg-white object-contain shadow-md"
                  style={{ maxWidth: hueco.ancho || undefined, maxHeight: hueco.alto || undefined }}
                />
              )}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Comprobar**

Run: `pnpm vitest run src/lib/__tests__/visor-pdf-componente.test.ts`
Expected: PASS (3).

Run: `pnpm exec tsc --noEmit && pnpm lint`
Expected: sin errores. Si el lint marca `react-hooks/set-state-in-effect` en algún sitio, el `setState` está fuera de un callback: moverlo dentro, no desactivar la regla.

Run: `pnpm build`
Expected: compila. **Si Turbopack no puede empaquetar `pdfjs-dist`** (error de resolución sobre `module`, `fs` o `canvas` dentro de `pdf.mjs`), aplicar el plan B:
1. En `scripts/copiar-worker.mjs`, copiar también `build/pdf.min.mjs` a `public/pdf.mjs` (segunda llamada a `copyFileSync`, mismo patrón) y añadir `/public/pdf.mjs` al `.gitignore`.
2. En `pdfjs-cliente.ts`, cambiar `import("pdfjs-dist")` por
   `(import(/* webpackIgnore: true */ /* turbopackIgnore: true */ "/pdf.mjs" as string) as Promise<PdfJs>)`.
3. Volver a correr `pnpm build`.

- [ ] **Step 5: Commit** (sin `Novedad:`: aún no lo usa nadie)

```bash
git add src/components/VisorPdf/PaginaPdf.tsx src/components/VisorPdf/VisorPdf.tsx src/lib/__tests__/visor-pdf-componente.test.ts
git commit -m "feat(visor): el PDF en canvas, con encaje, zoom y giro que no gira el scroll

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: El parte escaneado elige motor

**Files:**
- Create: `src/components/VisorPdf/MotorNavegador.tsx`
- Create: `src/components/VisorPdf/preferencias.ts`
- Create: `src/components/VisorPdf/BotonesEncaje.tsx`
- Modify: `src/components/ParteEscaneado.tsx` (reescritura)
- Modify: `src/lib/__tests__/parte-girar.test.ts`

**Interfaces:**
- Consumes: `VisorPdf` (Task 3), `imprimirPdf` (Task 2), `leerMotor`, `guardarMotor`, `leerEncaje`, `guardarEncaje`, `alternarEncaje`, `CLAVE_ENCAJE_PARTE`, `siguienteGiro`, `Giro`, `Encaje`, `MotorPdf` (Task 1).
- Produces:
  - `<MotorNavegador url: string; fragmento: string; titulo: string />`
  - `useMotorPdf(): [MotorPdf, (m: MotorPdf) => void]`
  - `useEncajePdf(clave: string): [Encaje, (pulsado: "FitH" | "FitV") => void]`
  - `<BotonesEncaje encaje: Encaje; onPulsar: (p: "FitH" | "FitV") => void; clase: string; clasePuesto: string />`

- [ ] **Step 1: Pruebas nuevas del parte (fallan)**

Sustituir `src/lib/__tests__/parte-girar.test.ts` entero por:

```ts
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, test } from "vitest";
import { ParteEscaneado } from "../../components/ParteEscaneado";
import { giroIntercambia, siguienteGiro } from "../visor-pdf";

const pintar = () =>
  renderToStaticMarkup(
    createElement(ParteEscaneado, { codigo: "AR.26.03914", scanUrl: "/scan/AR.26.03914.pdf" }),
  );

test("hay un botón para girar el parte", () => {
  expect(pintar()).toContain("Girar el parte");
});

test("el botón da la vuelta entera en cuatro y empieza otra vez", () => {
  expect(siguienteGiro(0)).toBe(90);
  expect(siguienteGiro(90)).toBe(180);
  expect(siguienteGiro(180)).toBe(270);
  expect(siguienteGiro(270)).toBe(0);
});

test("solo el cuarto IMPAR intercambia ancho y alto", () => {
  expect(giroIntercambia(90)).toBe(true);
  expect(giroIntercambia(270)).toBe(true);
  expect(giroIntercambia(0)).toBe(false);
  expect(giroIntercambia(180)).toBe(false);
});

test("el botón dice en qué posición está la hoja, y lo dice donde lo lee un lector de pantalla", () => {
  expect(pintar()).toContain('aria-label="Girar el parte · ahora 0°"');
});

test("de salida se ve con el visor propio: el giro ya no es un transform del marco", () => {
  const html = pintar();
  expect(html).not.toContain("<iframe");
  expect(html).not.toContain("rotate(");
});

test("mientras carga se ve la miniatura del parte", () => {
  expect(pintar()).toContain('src="/scan/AR.26.03914.png"');
});

test("siguen los dos botones de encaje, y dicen que se recuerdan", () => {
  const html = pintar();
  expect(html).toContain('aria-label="Ajustar al ancho"');
  expect(html).toContain('aria-label="Ajustar al alto"');
  expect(html).toContain("se recuerda para la próxima vez");
});

test("se puede pasar al visor del navegador", () => {
  expect(pintar()).toContain('aria-label="Ver con el visor del navegador"');
});

test("abrir en pestaña está siempre, para quien quiera su propio visor", () => {
  const html = pintar();
  expect(html).toContain('aria-label="Abrir el parte en otra pestaña"');
  expect(html).toContain('href="/scan/AR.26.03914.pdf"');
});
```

Run: `pnpm vitest run src/lib/__tests__/parte-girar.test.ts`
Expected: FAIL en las cuatro últimas.

- [ ] **Step 2: `src/components/VisorPdf/MotorNavegador.tsx`**

```tsx
/** El PDF pintado por el navegador, como siempre: cada uno con lo que tenga
 *  puesto (el de Chrome, el de Firefox, la extensión de Adobe…).
 *
 *  `key` con el fragmento, y no es cosmética: cambiar solo el fragmento de la
 *  URL no recarga nada —para el navegador es la misma página— y el visor se
 *  quedaba con el encaje anterior. Con la clave, React tira el iframe y monta
 *  otro. Es la recarga que el motor propio se ahorra. */
export function MotorNavegador({
  url,
  fragmento,
  titulo,
}: {
  url: string;
  fragmento: string;
  titulo: string;
}) {
  return (
    <iframe
      key={fragmento}
      src={`${url}#${fragmento}`}
      title={titulo}
      onClick={(e) => e.stopPropagation()}
      className="h-full w-full rounded-xl border-none bg-white"
    />
  );
}
```

- [ ] **Step 3: `src/components/VisorPdf/preferencias.ts`**

```ts
import { useState } from "react";
import {
  alternarEncaje,
  guardarEncaje,
  guardarMotor,
  leerEncaje,
  leerMotor,
  type Encaje,
  type MotorPdf,
} from "@/lib/visor-pdf";

// ─── Lo que cada uno deja puesto ─────────────────────────────────────────────
// Con qué visor abre los PDF y cómo los encaja. En el navegador y no en el
// servidor: es cómo se MIRA, no un dato del trabajo, y va con la pantalla en la
// que se está sentado — el mismo de siempre puede querer una cosa en el
// portátil y otra en el de sobremesa.
//
// Se lee de forma SÍNCRONA al montar (no en un efecto): así el visor arranca ya
// como lo dejaste, en vez de pintarse de una manera y saltar a la otra.

/** `window.localStorage` puede lanzar solo con tocarlo (cookies bloqueadas). */
function almacen(): Storage | undefined {
  try {
    return typeof window === "undefined" ? undefined : window.localStorage;
  } catch {
    return undefined;
  }
}

export function useMotorPdf(): [MotorPdf, (m: MotorPdf) => void] {
  const [motor, setMotor] = useState<MotorPdf>(() => leerMotor(almacen()));
  return [
    motor,
    (m) => {
      guardarMotor(almacen(), m);
      setMotor(m);
    },
  ];
}

/** El encaje de un visor, recordado en `clave`. Devuelve el actual y lo que
 *  hace pulsar ↔ o ↕ (pulsar el puesto vuelve a la página entera). */
export function useEncajePdf(clave: string): [Encaje, (pulsado: "FitH" | "FitV") => void] {
  const [encaje, setEncaje] = useState<Encaje>(() => leerEncaje(almacen(), clave));
  return [
    encaje,
    (pulsado) => {
      const nuevo = alternarEncaje(encaje, pulsado);
      guardarEncaje(almacen(), clave, nuevo);
      setEncaje(nuevo);
    },
  ];
}
```

- [ ] **Step 3b: `src/components/VisorPdf/BotonesEncaje.tsx`**

```tsx
import type { Encaje } from "@/lib/visor-pdf";

const AJUSTES = [
  { id: "FitH", icono: "↔", nombre: "Ajustar al ancho" },
  { id: "FitV", icono: "↕", nombre: "Ajustar al alto" },
] as const;

/** ↔ y ↕, los mismos en el parte y en el visor de documentos. El aspecto lo
 *  pone quien los usa: chips del carril en el parte, botones claros sobre
 *  fondo negro en el visor de documentos. */
export function BotonesEncaje({
  encaje,
  onPulsar,
  clase,
  clasePuesto,
}: {
  encaje: Encaje;
  onPulsar: (pulsado: "FitH" | "FitV") => void;
  clase: string;
  clasePuesto: string;
}) {
  return (
    <>
      {AJUSTES.map((a) => (
        <button
          key={a.id}
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onPulsar(a.id);
          }}
          aria-pressed={encaje === a.id}
          title={`${encaje === a.id ? "Volver a la página entera" : a.nombre} · se recuerda para la próxima vez`}
          aria-label={a.nombre}
          className={`${clase} ${encaje === a.id ? clasePuesto : ""}`}
        >
          {a.icono}
        </button>
      ))}
    </>
  );
}
```

- [ ] **Step 4: Reescribir `src/components/ParteEscaneado.tsx`**

```tsx
"use client";

import { useState } from "react";
import { CLAVE_ENCAJE_PARTE, siguienteGiro, type Giro } from "@/lib/visor-pdf";
import { BotonesEncaje } from "./VisorPdf/BotonesEncaje";
import { imprimirPdf } from "./VisorPdf/imprimir";
import { MotorNavegador } from "./VisorPdf/MotorNavegador";
import { useEncajePdf, useMotorPdf } from "./VisorPdf/preferencias";
import { VisorPdf } from "./VisorPdf/VisorPdf";

/** El parte escaneado, con sus botones en una barra estrecha a la izquierda.
 *
 *  LA ALTURA ES DE LA HOJA. El parte es un A4 vertical y lo que se viene a
 *  hacer aquí es leerlo entero; cualquier cosa puesta encima le come alto. Los
 *  botones van al lado, en vertical, donde sobra sitio.
 *
 *  DOS MOTORES. Por defecto lo pinta CoordinaOT (`VisorPdf`): el giro no gira
 *  el scroll y cambiar de encaje no recarga. Quien prefiere el visor de su
 *  navegador —hay quien usa el de Adobe en Firefox— lo elige con un botón y
 *  se le recuerda. En ese modo no hay botón de girar: lo trae su visor.
 *
 *  Vive aquí y no dentro de una ficha porque son DOS: la del Historial y la del
 *  tablero (Pendientes y panel). */
export function ParteEscaneado({ codigo, scanUrl }: { codigo: string; scanUrl: string }) {
  // El encaje y el motor se recuerdan (ver preferencias.ts); el giro no.
  const [ajuste, pulsarEncaje] = useEncajePdf(CLAVE_ENCAJE_PARTE);
  const [motor, setMotor] = useMotorPdf();
  // El giro NO se guarda entre pedidos: que el siguiente se abriera torcido
  // porque el anterior lo estaba sería peor que no tener botón.
  const [giro, setGiro] = useState<Giro>(0);
  const propio = motor === "propio";
  const titulo = `Pedido ${codigo}`;
  // La miniatura que ya pinta el servidor para las tarjetas: misma ruta, .png.
  const poster = /\.pdf$/i.test(scanUrl) ? scanUrl.replace(/\.pdf$/i, ".png") : undefined;
  // Cuadrados: en una barra estrecha el rótulo no cabe, así que el nombre va
  // en el `title` y en el `aria-label`.
  const chip = "chip-3d grid size-8 place-items-center rounded-lg text-sm text-text";
  // Anillo y color de marca para el que está puesto. NO `glass-chip-activo`:
  // esa tiñe el fondo, y `chip-3d` va después en la hoja y se lo comería.
  const puesto = "ring-2 ring-brand-400 text-brand-700 dark:text-brand-300";

  return (
    // El clic no sale de aquí: en la ficha del tablero, un clic fuera la
    // cierra, y pulsar un botón del parte no es salirse de ella.
    <div className="flex h-full w-full gap-2" onClick={(e) => e.stopPropagation()}>
      <div className="flex shrink-0 flex-col gap-1.5">
        <BotonesEncaje encaje={ajuste} onPulsar={pulsarEncaje} clase={chip} clasePuesto={puesto} />
        {propio && (
          <button
            type="button"
            onClick={() => setGiro(siguienteGiro)}
            title={`Girar el parte · ahora ${giro}°`}
            // El grado también en el `aria-label`: con uno fijo, quien usa
            // lector de pantalla no sabría en qué posición está la hoja.
            aria-label={`Girar el parte · ahora ${giro}°`}
            className={`${chip} ${giro !== 0 ? puesto : ""}`}
          >
            ↻
          </button>
        )}
        <button
          type="button"
          onClick={() => setMotor(propio ? "navegador" : "propio")}
          aria-pressed={!propio}
          title={
            propio
              ? "Ver con el visor del navegador · se recuerda para la próxima vez"
              : "Volver al visor de CoordinaOT · se recuerda para la próxima vez"
          }
          aria-label={propio ? "Ver con el visor del navegador" : "Volver al visor de CoordinaOT"}
          className={`${chip} ${propio ? "" : puesto}`}
        >
          ⇄
        </button>
        <a
          href={scanUrl}
          target="_blank"
          rel="noopener"
          title="Abrir el parte en otra pestaña"
          aria-label="Abrir el parte en otra pestaña"
          className={chip}
        >
          ↗
        </a>
        <a href={scanUrl} download={`${codigo}.pdf`} title="Descargar el parte" aria-label="Descargar el parte" className={chip}>
          ↓
        </a>
        <button
          type="button"
          onClick={() => imprimirPdf(scanUrl)}
          title="Imprimir el parte"
          aria-label="Imprimir el parte"
          className={chip}
        >
          ⎙
        </button>
      </div>
      <div className="relative h-full min-w-0 flex-1 overflow-hidden rounded-xl">
        {propio ? (
          <VisorPdf url={scanUrl} encaje={ajuste} giro={giro} titulo={titulo} poster={poster} />
        ) : (
          // `toolbar=0`: la barra gris de Chrome cantaba encima de la ficha.
          // Quien quiere la barra entera tiene «abrir en otra pestaña».
          <MotorNavegador url={scanUrl} fragmento={`page=1&view=${ajuste}&toolbar=0`} titulo={titulo} />
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Comprobar**

Run: `pnpm vitest run src/lib/__tests__/parte-girar.test.ts && pnpm test`
Expected: PASS todo el proyecto.

Run: `pnpm exec tsc --noEmit && pnpm lint`
Expected: sin errores.

- [ ] **Step 6: Commit** (este sí lo nota el equipo)

```bash
git add src/components/VisorPdf/MotorNavegador.tsx src/components/VisorPdf/preferencias.ts src/components/VisorPdf/BotonesEncaje.tsx src/components/ParteEscaneado.tsx src/lib/__tests__/parte-girar.test.ts
git commit -F - <<'MSG'
feat(parte): el parte lo pinta CoordinaOT, con el visor del navegador a un clic

Novedad: arreglado | Al girar el parte, la rueda del ratón ya baja por la hoja y no de lado
Novedad: mejor | Cambiar entre ajustar al ancho y al alto ya no vuelve a cargar el parte
Novedad: nuevo | Puedes ver los PDF con el visor de CoordinaOT o con el de tu navegador
Detalle: El botón ⇄, junto a girar e imprimir. Se recuerda en tu ordenador. Si usas el de Adobe en Firefox, elige el del navegador. Y con ↗ lo abres en otra pestaña.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
MSG
```

---

### Task 5: El visor de documentos elige motor y precarga

**Files:**
- Modify: `src/components/VisorDocumento.tsx`

**Interfaces:**
- Consumes: `VisorPdf` (Task 3), `precargarPdf` (Task 2), `MotorNavegador`, `useMotorPdf`, `useEncajePdf`, `BotonesEncaje` (Task 4), `CLAVE_ENCAJE_DOCUMENTOS` (Task 1).

`VisorDocumento` devuelve `null` en servidor (usa `createPortal`), así que no hay prueba de render: se verifica en la Task 6.

- [ ] **Step 1: Imports y cabecera del fichero**

Sustituir los imports (líneas 3–7) por:

```tsx
import { useEffect } from "react";
import { createPortal } from "react-dom";
import { comoServir, type DocumentoRps } from "@/lib/historial";
import { useCapaEscape } from "@/lib/useCapaEscape";
import { CLAVE_ENCAJE_DOCUMENTOS } from "@/lib/visor-pdf";
import { FotoConZoom } from "./FotoConZoom";
import { BotonesEncaje } from "./VisorPdf/BotonesEncaje";
import { MotorNavegador } from "./VisorPdf/MotorNavegador";
import { precargarPdf } from "./VisorPdf/usePdfDoc";
import { useEncajePdf, useMotorPdf } from "./VisorPdf/preferencias";
import { VisorPdf } from "./VisorPdf/VisorPdf";
```

Sustituir el último párrafo del comentario de cabecera (el que empieza `// El visor lo pone el navegador` y acaba en `habría que rehacerlo peor.`) por:

```tsx
// El PDF lo pinta CoordinaOT (VisorPdf), o el navegador para quien lo prefiera
// —la misma preferencia que el parte—. La foto, un `img` con zoom.
```

- [ ] **Step 2: Precarga de los vecinos**

Justo después de `const doc = documentos[indice];` añadir:

```tsx
  const [motor, setMotor] = useMotorPdf();
  // Su propio encaje, recordado aparte del del parte: un planteamiento
  // apaisado no se mira como un A4 de pie.
  const [encaje, pulsarEncaje] = useEncajePdf(CLAVE_ENCAJE_DOCUMENTOS);

  // Las flechas son un paseo, no un salto: el de al lado ya está abierto
  // cuando se llega. Solo con el motor propio; el del navegador no se deja.
  useEffect(() => {
    if (motor !== "propio") return;
    for (const vecino of [documentos[indice - 1], documentos[indice + 1]]) {
      if (vecino && comoServir(vecino.archivo).tipo === "application/pdf") precargarPdf(vecino.url);
    }
  }, [motor, indice, documentos]);
```

- [ ] **Step 3: Botones en la barra**

Justo antes del `<a href={doc.url} download=…>` de «⤓ Descargar», añadir:

```tsx
        {esPdf && (
          <>
            <BotonesEncaje
              encaje={encaje}
              onPulsar={pulsarEncaje}
              clase="grid size-8 shrink-0 place-items-center rounded-lg bg-white/10 text-sm hover:bg-white/20"
              clasePuesto="bg-white/25 ring-2 ring-white/60"
            />
            <button
              onClick={(e) => {
                e.stopPropagation();
                setMotor(motor === "propio" ? "navegador" : "propio");
              }}
              title="Se recuerda para la próxima vez, también en el parte"
              className="shrink-0 rounded-lg bg-white/10 px-3 py-1.5 text-xs font-semibold hover:bg-white/20"
            >
              {motor === "propio" ? "⇄ Visor del navegador" : "⇄ Visor de CoordinaOT"}
            </button>
            <a
              href={doc.url}
              target="_blank"
              rel="noopener"
              onClick={(e) => e.stopPropagation()}
              className="shrink-0 rounded-lg bg-white/10 px-3 py-1.5 text-xs font-semibold hover:bg-white/20"
            >
              ↗ Abrir en pestaña
            </a>
          </>
        )}
```

- [ ] **Step 4: El cuerpo**

Sustituir el bloque `{esPdf && ( <iframe … /> )}` por:

```tsx
        {esPdf &&
          (motor === "propio" ? (
            <VisorPdf
              // La clave con la URL: cada documento empieza en su página 1 y
              // con su zoom, no con el scroll del anterior.
              key={doc.url}
              url={doc.url}
              encaje={encaje}
              giro={0}
              titulo={doc.descripcion || doc.archivo}
              poster={`${doc.url}?mini=1`}
            />
          ) : (
            <MotorNavegador url={doc.url} fragmento={`view=${encaje}`} titulo={doc.descripcion || doc.archivo} />
          ))}
```

- [ ] **Step 5: Comprobar**

Run: `pnpm exec tsc --noEmit && pnpm lint && pnpm test`
Expected: sin errores, todo en verde.

- [ ] **Step 6: Commit**

```bash
git add src/components/VisorDocumento.tsx
git commit -F - <<'MSG'
feat(documentos): los PDF del pedido con el visor propio, y el siguiente ya cargado

Novedad: mejor | Pasar de un documento del pedido a otro con las flechas va más deprisa
Novedad: nuevo | Los documentos del pedido también se ajustan al ancho o al alto
Detalle: Con ↔ y ↕ arriba del documento. Se recuerda en tu ordenador, aparte de cómo tengas puesto el parte.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
MSG
```

---

### Task 6: Verificación en el navegador

Sin código nuevo salvo arreglos de lo que salga. Con `pnpm dev` levantado y el navegador de Playwright (o a mano). Cada arreglo, su commit.

- [ ] **Step 1: El worker se sirve bien**

Run: `curl -sI http://localhost:3000/pdf.worker.mjs`
Expected: `200` y `Content-Type` con `javascript`. Con otro tipo el worker de módulo no arranca: arreglar antes de seguir.

- [ ] **Step 2: Parte en la ficha del tablero y en el Historial**

Abrir un pedido con parte escaneado en los dos sitios y comprobar:
- Se ve la miniatura al instante y se afina sola.
- Girar 90°: la hoja gira, la rueda sigue bajando **hacia abajo**. Otra vez a 180° y 270°.
- Al ancho / al alto: cambia sin recargar. En la pestaña Red, **una sola** petición al `.pdf`.
- Ctrl + rueda amplía; el punto bajo el ratón se queda bajo el ratón. La web entera no se amplía.
- ⇄ pasa al iframe de siempre (sin botón de giro); recargar la página: sigue en navegador. ⇄ otra vez vuelve.
- ↗ abre el PDF en otra pestaña.
- ⎙ abre el diálogo de imprimir con el parte, no con la web.

- [ ] **Step 3: Visor de documentos**

En un pedido con varios planteamientos:
- Abre en el visor propio; ← → pasan de uno a otro; volver al anterior es instantáneo.
- Un PDF de varias páginas: el scroll las recorre y todas se pintan.
- «⇄ Visor del navegador» cambia y afecta también al parte (misma preferencia).
- ↔ y ↕ ajustan el documento; recargar la página y abrir otro: sigue igual. Y el parte conserva SU encaje, no el de los documentos.
- Escape cierra el visor y deja la ficha.

- [ ] **Step 4: Tema oscuro y errores**

- Con tema oscuro, el fondo del hueco no es un bloque blanco.
- Un pedido sin parte escaneado sigue enseñando lo de siempre (el Drawer comprueba antes de montar).

- [ ] **Step 5: Firefox**

Si hay Firefox a mano: el motor propio se ve igual; con ⇄ en navegador, Firefox usa su visor (o el de Adobe si está la extensión).

Si en algún PC del equipo el motor propio se queda en la miniatura y la consola dice algo como `Promise.withResolvers is not a function` o `SyntaxError` dentro de `pdf.mjs`, es un navegador viejo: cambiar a la build compatible. En `pdfjs-cliente.ts`, `import("pdfjs-dist")` → `import("pdfjs-dist/legacy/build/pdf.mjs")`, y en `scripts/copiar-worker.mjs`, `"build"` → `path.join("legacy", "build")`.

- [ ] **Step 6: Build final**

Run: `pnpm build`
Expected: compila sin errores. Con esto, listo para `pnpm novedades` y desplegar.
