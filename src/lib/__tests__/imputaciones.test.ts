import { describe, expect, it } from "vitest";
import { minutosDeRps, minutosEnCoordina } from "../imputaciones";
import type { ImputacionRps, OF } from "../types";

// El tiempo de una OF llega por dos caminos y se suma en el mismo campo: lo que
// ya está imputado en RPS (el terminal de siempre, que se sigue usando a la vez
// que la web) y lo que se ficha aquí. El detalle enseña cada minuto una sola
// vez: los de RPS en el desglose por persona, y en la línea de Autor solo lo
// fichado en CoordinaOT.

const imp = (operarioId: string | null, minutos: number): ImputacionRps => ({
  empleado: operarioId ?? "188",
  nombre: "X",
  operarioId,
  minutos,
});

const of = (extra: Partial<OF> = {}): OF => ({
  id: "0217537:5", codigo: "0217537", descripcion: "x", familia: "TOLDO", piezas: 1,
  autorId: "alberto", revisorId: null, estado: "en_curso", fichandoRol: null,
  tiempoEstimadoMin: 60, tiempoPlanteoMin: 0, tiempoRevisionMin: 0, ...extra,
});

describe("minutosDeRps", () => {
  it("suma el desglose; sin desglose, cero", () => {
    expect(minutosDeRps(of({ imputaciones: [imp("alberto", 1287), imp("jaime", 93)] }))).toBe(1380);
    expect(minutosDeRps(of())).toBe(0);
  });
});

describe("minutosEnCoordina", () => {
  it("cero cuando todo el planteo se fichó con la herramienta antigua", () => {
    // Da igual que sea de 2025 o de esta mañana: si el tiempo entró por el
    // terminal, la línea de Autor no tiene minutos propios que enseñar.
    expect(minutosEnCoordina(of({
      tiempoPlanteoMin: 1380,
      imputaciones: [imp("alberto", 1287), imp("jaime", 93)],
    }))).toBe(0);
  });

  it("lo fichado aquí, cuando se ficha en las dos", () => {
    // Caso real del 12/08/2026 (AR.26.03980): 19 min en el terminal y unos
    // segundos en la web. La línea de Autor cuenta esos segundos y nada más.
    const min = minutosEnCoordina(of({
      tiempoPlanteoMin: 19.117466666666665,
      imputaciones: [imp("ivan", 19)],
    }));
    expect(min).toBeCloseTo(0.117, 3);
  });

  it("sin nada en RPS, todo el planteo es de aquí", () => {
    expect(minutosEnCoordina(of({ tiempoPlanteoMin: 30 }))).toBe(30);
    expect(minutosEnCoordina(of({ tiempoPlanteoMin: 30, imputaciones: [] }))).toBe(30);
  });

  it("nunca negativo: si RPS trajera de más, cero antes que un tiempo inventado", () => {
    expect(minutosEnCoordina(of({ tiempoPlanteoMin: 10, imputaciones: [imp("alberto", 40)] })))
      .toBe(0);
  });
});
