import { describe, expect, it } from "vitest";
import { pasoRedondo } from "@/components/MetricasGrafica";

describe("pasoRedondo", () => {
  it("da pasos redondos y enteros para unas cuatro marcas", () => {
    // 325 OF en el mejor mes → 0 · 100 · 200 · 300 · 400, no 165 y 330.
    expect(pasoRedondo(325 / 4)).toBe(100);
    expect(pasoRedondo(125 / 4)).toBe(50);
    expect(pasoRedondo(90 / 4)).toBe(25);
    expect(pasoRedondo(5 / 4)).toBe(2);
    expect(pasoRedondo(1 / 4)).toBe(1);
  });
});
