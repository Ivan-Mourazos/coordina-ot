import { describe, expect, test } from "vitest";
import { claveValida, leerOfsPedidas, resumirOf } from "../integracion";

describe("claveValida", () => {
  test("acepta solo la clave exacta", () => {
    expect(claveValida("secreta-123", "secreta-123")).toBe(true);
    expect(claveValida("secreta-124", "secreta-123")).toBe(false);
    expect(claveValida("", "secreta-123")).toBe(false);
    expect(claveValida(null, "secreta-123")).toBe(false);
    expect(claveValida("secreta-123", "")).toBe(false);
  });
});

describe("leerOfsPedidas", () => {
  test("lista limpia y sin repetidas", () => {
    expect(leerOfsPedidas("0230194, 0230195,0230194")).toEqual(["0230194", "0230195"]);
  });
  test("rechaza vacío, formatos raros y más de 50", () => {
    expect(leerOfsPedidas(null)).toBeNull();
    expect(leerOfsPedidas("")).toBeNull();
    expect(leerOfsPedidas("0230194,abc")).toBeNull();
    expect(leerOfsPedidas("0230194:5")).toBeNull();
    expect(leerOfsPedidas(Array.from({ length: 51 }, (_, i) => String(1000000 + i)).join(","))).toBeNull();
  });
});

describe("resumirOf", () => {
  test("sin filas: sin_estado", () => {
    expect(resumirOf("0230194", [])).toEqual({ of: "0230194", estado: "sin_estado", nota: "", actualizado: null });
  });
  test("una fila aprobada", () => {
    expect(resumirOf("0230194", [{ estado: "aprobada", observacion: "vieja", updatedAt: "2026-09-29T08:00:00Z" }]))
      .toEqual({ of: "0230194", estado: "aprobada", nota: "", actualizado: "2026-09-29T08:00:00Z" });
  });
  test("varias tareas: manda la menos avanzada y la nota solo si está devuelta", () => {
    const r = resumirOf("0230700", [
      { estado: "aprobada", observacion: null, updatedAt: "2026-09-29T08:00:00Z" },
      { estado: "devuelta", observacion: "Falta el lado del brazo", updatedAt: "2026-09-29T09:00:00Z" },
    ]);
    expect(r).toEqual({ of: "0230700", estado: "devuelta", nota: "Falta el lado del brazo", actualizado: "2026-09-29T09:00:00Z" });
    expect(resumirOf("0230701", [
      { estado: "aprobada", observacion: null, updatedAt: "2026-09-29T08:00:00Z" },
      { estado: "en_revision", observacion: "nota interna", updatedAt: "2026-09-29T07:00:00Z" },
    ])).toEqual({ of: "0230701", estado: "en_revision", nota: "", actualizado: "2026-09-29T08:00:00Z" });
  });
  test("un estado desconocido se trata como pendiente", () => {
    expect(resumirOf("0230194", [{ estado: "rara", observacion: null, updatedAt: "2026-09-29T08:00:00Z" }]).estado).toBe("pendiente");
  });
});
