import { describe, expect, it } from "vitest";
import { MESES_CORTOS, anoDe, mesDe, primeroDe, sumarMeses } from "../calendario";

// Saltar de mes o de año desde la rejilla del calendario. Los fallos de esto
// son siempre de los bordes —diciembre, enero, el salto de año—, así que se
// prueban aquí y no mirando el popover de reojo.

describe("la rejilla de meses", () => {
  it("son doce, en corto y en orden", () => {
    expect(MESES_CORTOS).toHaveLength(12);
    expect(MESES_CORTOS[0]).toBe("ene");
    expect(MESES_CORTOS[8]).toBe("sep");
    expect(MESES_CORTOS[11]).toBe("dic");
  });

  it("elegir un mes va al día 1 de ESE mes del año que se está mirando", () => {
    // Sin contar saltos desde el mes actual: se pulsa "sep" y se va a septiembre.
    expect(primeroDe(2025, 9)).toBe("2025-09-01");
    expect(primeroDe(2026, 12)).toBe("2026-12-01");
  });

  it("el año y el mes salen del día que se está mirando", () => {
    expect(anoDe("2026-09-12")).toBe(2026);
    expect(mesDe("2026-09-12")).toBe(9);
    expect(mesDe("2026-01-31")).toBe(1);
  });
});

describe("las flechas, en la rejilla, mueven de año", () => {
  it("doce meses atrás y adelante es el mismo mes del año vecino", () => {
    expect(sumarMeses("2026-09-01", -12)).toBe("2025-09-01");
    expect(sumarMeses("2026-09-01", 12)).toBe("2027-09-01");
  });

  it("y no se despeña en los bordes del año", () => {
    expect(sumarMeses("2026-01-01", -12)).toBe("2025-01-01");
    expect(sumarMeses("2026-12-01", 12)).toBe("2027-12-01");
    // Desde el 29 de febrero de un bisiesto, el año siguiente no tiene 29.
    expect(sumarMeses("2024-02-29", 12)).toBe("2025-02-28");
  });
});
