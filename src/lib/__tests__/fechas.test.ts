import { describe, expect, it } from "vitest";
import { diasEntre, fmtDiaMes, relativoA, tituloDia } from "../fechas";

const HOY = "2026-08-05";

describe("diasEntre", () => {
  it("cuenta días naturales en ambos sentidos", () => {
    expect(diasEntre(HOY, HOY)).toBe(0);
    expect(diasEntre(HOY, "2026-08-06")).toBe(1);
    expect(diasEntre(HOY, "2026-08-01")).toBe(-4);
  });

  it("no se descuadra al cruzar el cambio de hora", () => {
    // Último domingo de octubre: 25/10/2026 tiene 25 h en Europe/Madrid.
    expect(diasEntre("2026-10-24", "2026-10-26")).toBe(2);
    // Y el de marzo, 23 h.
    expect(diasEntre("2026-03-28", "2026-03-30")).toBe(2);
  });

  it("con una fecha ilegible devuelve 0 en vez de NaN", () => {
    expect(diasEntre(HOY, "")).toBe(0);
  });
});

describe("relativoA", () => {
  it("nombra hoy y mañana en vez de dar la fecha", () => {
    expect(relativoA(HOY, HOY).etiqueta).toBe("Hoy");
    expect(relativoA(HOY, HOY).tono).toBe("hoy");
    expect(relativoA("2026-08-06", HOY).etiqueta).toBe("Mañana");
  });

  it("gradúa el atraso: -1 d y -28 d no son el mismo problema", () => {
    const ayer = relativoA("2026-08-04", HOY);
    expect(ayer.etiqueta).toBe("-1 d");
    expect(ayer.completa).toContain("hace 1 día");
    expect(ayer.tono).toBe("vencida");

    const viejo = relativoA("2026-07-08", HOY);
    expect(viejo.etiqueta).toBe("-28 d");
    expect(viejo.tono).toBe("vencida");
  });

  it("dentro de la semana cuenta días; más allá, da la fecha", () => {
    expect(relativoA("2026-08-09", HOY).etiqueta).toBe("+4 d");
    expect(relativoA("2026-08-09", HOY).tono).toBe("proxima");
    expect(relativoA("2026-09-01", HOY).etiqueta).toBe("01/09");
    expect(relativoA("2026-09-01", HOY).tono).toBe("lejana");
  });
});

describe("tituloDia", () => {
  it("usa el nombre del día salvo para hoy, mañana y ayer", () => {
    expect(tituloDia(HOY, HOY).titulo).toBe("Hoy");
    expect(tituloDia("2026-08-06", HOY).titulo).toBe("Mañana");
    expect(tituloDia("2026-08-04", HOY).titulo).toBe("Ayer");
    expect(tituloDia("2026-08-12", HOY).titulo).toMatch(/^Miércoles/);
  });

  it("sin fecha lo dice, no inventa un día", () => {
    expect(tituloDia(null, HOY)).toEqual({ titulo: "Sin fecha", sub: "no planificada" });
  });
});

describe("fmtDiaMes", () => {
  it("da dd/mm", () => {
    expect(fmtDiaMes("2026-08-05")).toBe("05/08");
  });
});
