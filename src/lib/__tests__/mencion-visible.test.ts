import { describe, expect, test } from "vitest";
import { etiquetasMencion, tokensAVisible, trocearVisible, visibleATokens } from "../nota-pedido";

const personas = [
  { id: "ivan", nombre: "Iván", nombreCompleto: "Iván Sánchez" },
  { id: "carron", nombre: "Carrón", nombreCompleto: "José Luis Carrón" },
  { id: "belen-alamancos", nombre: "Belén", nombreCompleto: "Belén Alamancos" },
  { id: "belen-quintela", nombre: "Belén", nombreCompleto: "Belén Quintela" },
];
const et = etiquetasMencion(personas);

describe("el cuadro enseña nombres y guarda tokens", () => {
  test("del token al nombre", () => {
    expect(tokensAVisible("ojo @[seccion:produccion] y @[persona:carron]", et)).toBe("ojo @Producción y @Carrón");
  });

  test("del nombre al token", () => {
    expect(visibleATokens("ojo @Producción y @Carrón", et)).toBe("ojo @[seccion:produccion] y @[persona:carron]");
  });

  test("dos con el mismo nombre corto llevan el completo", () => {
    const visible = tokensAVisible("@[persona:belen-alamancos] @[persona:belen-quintela]", et);
    expect(visible).toBe("@Belén Alamancos @Belén Quintela");
    expect(visibleATokens(visible, et)).toBe("@[persona:belen-alamancos] @[persona:belen-quintela]");
  });

  test("la etiqueta debe terminar ahí: @Carrónes no es mención", () => {
    expect(visibleATokens("@Carrónes", et)).toBe("@Carrónes");
    expect(visibleATokens("@Carrón, mira", et)).toBe("@[persona:carron], mira");
  });

  test("ida y vuelta exacta, también a medio escribir", () => {
    for (const t of ["@Produc", "@Producción", "a@b.com", "@[persona:fantasma] hola", "línea\n@Diseño\n"]) {
      expect(tokensAVisible(visibleATokens(t, et), et)).toBe(t);
    }
  });

  test("un token de alguien que no está se queda tal cual", () => {
    expect(tokensAVisible("@[persona:fantasma]", et)).toBe("@[persona:fantasma]");
  });

  test("trocea marcando las menciones", () => {
    expect(trocearVisible("hola @Diseño!", et)).toEqual([
      { texto: "hola ", mencion: null },
      { texto: "@Diseño", mencion: "seccion" },
      { texto: "!", mencion: null },
    ]);
  });
});
