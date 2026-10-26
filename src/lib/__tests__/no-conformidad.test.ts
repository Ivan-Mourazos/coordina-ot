import { describe, expect, it } from "vitest";
import { papelDiseno, resumenNc, sinClasificar, textoProcesos } from "../no-conformidad";

const nc = (proceso1: string | null, proceso2: string | null) => ({ proceso1, proceso2 });

describe("papelDiseno", () => {
  it("DISEÑO en el primer hueco es el principal", () => {
    expect(papelDiseno(nc("DISEÑO", "COMERCIAL"))).toBe("principal");
  });

  it("DISEÑO en el segundo hueco es el secundario", () => {
    expect(papelDiseno(nc("COMERCIAL", "DISEÑO"))).toBe("secundario");
  });

  it("en los dos huecos cuenta como principal, no dos veces", () => {
    expect(papelDiseno(nc("DISEÑO", "DISEÑO"))).toBe("principal");
  });

  it("sin ningún proceso es «sin clasificar», y con otros procesos no es nuestra", () => {
    expect(papelDiseno(nc(null, null))).toBe("sinClasificar");
    expect(sinClasificar(nc(null, null))).toBe(true);
    expect(papelDiseno(nc("PRODUCCIÓN", null))).toBe("otro");
  });
});

describe("textoProcesos", () => {
  it("dice cuál es el principal y cuál el secundario", () => {
    expect(textoProcesos(nc("COMERCIAL", "DISEÑO"))).toBe("COMERCIAL (principal) · DISEÑO (secundario)");
  });

  it("sin procesos lo dice", () => {
    expect(textoProcesos(nc(null, null))).toBe("sin proceso todavía");
  });
});

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
