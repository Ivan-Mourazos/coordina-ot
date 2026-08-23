import { describe, expect, it } from "vitest";
import { NOTA_MAX, fmtCuandoNota, validarTexto } from "../nota-pedido";

describe("validarTexto", () => {
  it("recorta los bordes y deja el texto limpio", () => {
    expect(validarTexto("  falta el color  ")).toEqual({ ok: true, texto: "falta el color" });
  });

  it("normaliza los saltos de Windows: el texto se guarda con \\n", () => {
    expect(validarTexto("una\r\ndos")).toEqual({ ok: true, texto: "una\ndos" });
  });

  it("respeta los saltos de línea de dentro", () => {
    expect(validarTexto("una\n\ndos")).toEqual({ ok: true, texto: "una\n\ndos" });
  });

  it("una nota vacía no es una nota", () => {
    expect(validarTexto("")).toEqual({ ok: false, motivo: "vacio" });
    expect(validarTexto("   \n  ")).toEqual({ ok: false, motivo: "vacio" });
  });

  it("lo que no es texto se rechaza igual que lo vacío", () => {
    expect(validarTexto(null)).toEqual({ ok: false, motivo: "vacio" });
    expect(validarTexto(42)).toEqual({ ok: false, motivo: "vacio" });
    expect(validarTexto(undefined)).toEqual({ ok: false, motivo: "vacio" });
  });

  it("justo en el tope cabe; uno más, no", () => {
    expect(validarTexto("a".repeat(NOTA_MAX)).ok).toBe(true);
    expect(validarTexto("a".repeat(NOTA_MAX + 1))).toEqual({ ok: false, motivo: "largo" });
  });

  it("el tope se mide DESPUÉS de recortar", () => {
    expect(validarTexto("  " + "a".repeat(NOTA_MAX) + "  ").ok).toBe(true);
  });
});

describe("fmtCuandoNota", () => {
  // Las fechas se construyen con el constructor local (no con literales ISO)
  // para que el test no dependa de la zona horaria de la máquina que lo corre.
  const hoy = new Date(2026, 7, 24, 15, 0, 0).toISOString();

  it("lo de hoy dice la hora", () => {
    const iso = new Date(2026, 7, 24, 11, 4, 0).toISOString();
    expect(fmtCuandoNota(iso, hoy)).toBe("hoy 11:04");
  });

  it("lo de ayer lo dice", () => {
    const iso = new Date(2026, 7, 23, 9, 30, 0).toISOString();
    expect(fmtCuandoNota(iso, hoy)).toBe("ayer 9:30");
  });

  it("más atrás, con el día y el mes", () => {
    const iso = new Date(2026, 7, 18, 12, 16, 0).toISOString();
    expect(fmtCuandoNota(iso, hoy)).toBe("18/8 12:16");
  });

  it("de otro año, con el año", () => {
    const iso = new Date(2025, 11, 3, 8, 5, 0).toISOString();
    expect(fmtCuandoNota(iso, hoy)).toBe("3/12/2025 8:05");
  });
});
