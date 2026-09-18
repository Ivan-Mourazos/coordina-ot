import { describe, expect, it } from "vitest";
import { OPERARIOS } from "../mock";
import { tintaSobre } from "../tinta";

describe("tintaSobre", () => {
  it("pone tinta oscura sobre los colores claros", () => {
    expect(tintaSobre("#d39a1c")).toBe("#1a1206");
    expect(tintaSobre("#1fa37a")).toBe("#1a1206");
  });

  it("deja el blanco sobre los oscuros", () => {
    expect(tintaSobre("#5a6472")).toBe("#ffffff");
    expect(tintaSobre("#9b3de0")).toBe("#ffffff");
  });

  it("si no entiende el color, blanco", () => {
    expect(tintaSobre("rojo")).toBe("#ffffff");
  });

  // La razón de ser del helper: ninguna persona del equipo con las iniciales
  // por debajo de 4,4:1 (el azul y el turquesa se quedan justo ahí con
  // cualquiera de las dos tintas; subirlos exigiría cambiarles el color).
  it("ningún avatar del equipo baja de 4,4:1", () => {
    const lum = (hex: string) => {
      const n = parseInt(hex.slice(1), 16);
      const c = (v: number) => ((v /= 255) <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
      return 0.2126 * c((n >> 16) & 255) + 0.7152 * c((n >> 8) & 255) + 0.0722 * c(n & 255);
    };
    for (const op of OPERARIOS) {
      const a = lum(op.color);
      const b = lum(tintaSobre(op.color));
      const r = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
      expect(r, op.nombre).toBeGreaterThanOrEqual(4.4);
    }
  });
});
