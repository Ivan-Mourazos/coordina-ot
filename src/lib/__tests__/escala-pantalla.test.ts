import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// La web se ajusta al alto de la pantalla (spec del 23/09/2026): 16 px a 1080
// de alto, 14 px a 611, y la variante `bajo:` por debajo de 760. Es CSS, así
// que se comprueba el texto: si alguien la borra repasando estilos, en los
// monitores de Diseño la primera OF vuelve a quedarse en el borde.
const css = readFileSync("src/app/globals.css", "utf8");

describe("escala según la pantalla", () => {
  it("el tamaño base va de 14 a 16 px con el alto", () => {
    expect(css).toMatch(
      /font-size:\s*clamp\(14px,\s*calc\(14px \+ \(100vh - 611px\) \* 0\.004264\),\s*16px\)/,
    );
  });

  it("existe la variante de pantalla baja", () => {
    expect(css).toContain("@custom-variant bajo (@media (max-height: 759px));");
  });

  it("la fórmula da lo que dice la spec", () => {
    const base = (alto: number) => Math.min(16, Math.max(14, 14 + (alto - 611) * 0.004264));
    expect(base(611)).toBe(14);
    expect(base(1080)).toBeCloseTo(16, 1);
    expect(base(928)).toBeCloseTo(15.35, 1);
    expect(base(500)).toBe(14);
  });
});
