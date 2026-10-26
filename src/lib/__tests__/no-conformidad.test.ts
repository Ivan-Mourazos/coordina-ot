import { describe, expect, it } from "vitest";
import { resumenNc } from "../no-conformidad";

describe("resumenNc", () => {
  it("pone en una línea lo que Calidad escribió en varias", () => {
    expect(resumenNc("RECTIFICAR MEDIDAS DE TOLDO UMIA.\r\n\r\nPor la información recopilada")).toBe(
      "RECTIFICAR MEDIDAS DE TOLDO UMIA. Por la información recopilada",
    );
  });

  it("recorta lo largo con puntos suspensivos, sin pasarse del máximo", () => {
    const r = resumenNc("a ".repeat(200), 20);
    expect(r.length).toBeLessThanOrEqual(20);
    expect(r.endsWith("…")).toBe(true);
  });

  it("lo corto se queda tal cual", () => {
    expect(resumenNc("POR RECTIFICAR LONA.")).toBe("POR RECTIFICAR LONA.");
  });
});
