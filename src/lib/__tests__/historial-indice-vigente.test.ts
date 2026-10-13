import { afterEach, describe, expect, it } from "vitest";
import { indiceSiListo, indiceVigente } from "../server/historial-indice";
import type { IndiceHistorial } from "../historial-indice";

// La lista del Historial vive en `globalThis` y sobrevive al HMR. Si se añade
// una sección sin reiniciar, la lista vieja no la trae y el Historial de la
// nueva reventaba con un 500. Una lista así no vale: se reconstruye.

const lista = (base: Partial<IndiceHistorial["base"]>): IndiceHistorial =>
  ({ at: Date.now(), base, info: new Map(), personas: new Map() }) as IndiceHistorial;

afterEach(() => {
  globalThis.__coordinaHistorialIndice = undefined;
});

describe("una lista del Historial vale si trae todas las secciones", () => {
  it("con todas, se sirve", () => {
    const l = lista({ ot: [], diseno: [], impresion: [] });
    expect(indiceVigente(l)).toBe(l);
  });

  it("si le falta una (la de antes de añadir Impresión), no", () => {
    expect(indiceVigente(lista({ ot: [], diseno: [] }))).toBeNull();
  });

  it("sin lista, tampoco", () => {
    expect(indiceVigente(undefined)).toBeNull();
  });

  it("indiceSiListo no entrega la vieja: el Historial vuelve a la consulta de siempre", () => {
    globalThis.__coordinaHistorialIndice = lista({ ot: [], diseno: [] });
    expect(indiceSiListo()).toBeNull();
    const buena = lista({ ot: [], diseno: [], impresion: [] });
    globalThis.__coordinaHistorialIndice = buena;
    expect(indiceSiListo()).toBe(buena);
  });
});
