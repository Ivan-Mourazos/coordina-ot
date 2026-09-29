import { describe, expect, test } from "vitest";
import { claveValida, filasDeOficinaTecnica, leerOfsPedidas, resumirOf } from "../integracion";

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
    expect(resumirOf("0230194", [])).toEqual({ of: "0230194", estado: "sin_estado", nota: "", actualizado: null, revisor: "" });
  });
  test("una fila aprobada", () => {
    expect(resumirOf("0230194", [{ estado: "aprobada", observacion: "vieja", updatedAt: "2026-09-29T08:00:00Z", revisorId: "jaime" }]))
      .toEqual({ of: "0230194", estado: "aprobada", nota: "", actualizado: "2026-09-29T08:00:00Z", revisor: "jaime" });
  });
  test("varias tareas: manda la menos avanzada y la nota solo si está devuelta", () => {
    const r = resumirOf("0230700", [
      { estado: "aprobada", observacion: null, updatedAt: "2026-09-29T08:00:00Z", revisorId: "angel" },
      { estado: "devuelta", observacion: "Falta el lado del brazo", updatedAt: "2026-09-29T09:00:00Z", revisorId: null },
    ]);
    expect(r).toEqual({ of: "0230700", estado: "devuelta", nota: "Falta el lado del brazo", actualizado: "2026-09-29T09:00:00Z", revisor: "" });
    expect(resumirOf("0230701", [
      { estado: "aprobada", observacion: null, updatedAt: "2026-09-29T08:00:00Z", revisorId: "angel" },
      { estado: "en_revision", observacion: "nota interna", updatedAt: "2026-09-29T07:00:00Z", revisorId: null },
    ])).toEqual({ of: "0230701", estado: "en_revision", nota: "", actualizado: "2026-09-29T08:00:00Z", revisor: "" });
  });
  test("una tarea anulada no cuenta si hay otra: anulada + aprobada = aprobada, con el revisor de la aprobada", () => {
    expect(resumirOf("0230700", [
      { estado: "anulada", observacion: "duplicado", updatedAt: "2026-09-29T10:00:00Z", revisorId: "carron" },
      { estado: "aprobada", observacion: null, updatedAt: "2026-09-29T08:00:00Z", revisorId: "angel" },
    ])).toEqual({ of: "0230700", estado: "aprobada", nota: "", actualizado: "2026-09-29T08:00:00Z", revisor: "angel" });
  });
  test("anulada sigue sin frenar a una devuelta: la menos avanzada de las no anuladas manda", () => {
    expect(resumirOf("0230701", [
      { estado: "anulada", observacion: null, updatedAt: "2026-09-29T10:00:00Z", revisorId: null },
      { estado: "devuelta", observacion: "Falta cota", updatedAt: "2026-09-29T08:00:00Z", revisorId: null },
    ]).estado).toBe("devuelta");
  });
  test("solo tareas anuladas: anulada", () => {
    expect(resumirOf("0230702", [
      { estado: "anulada", observacion: null, updatedAt: "2026-09-29T08:00:00Z", revisorId: "angel" },
      { estado: "anulada", observacion: null, updatedAt: "2026-09-29T09:00:00Z", revisorId: null },
    ])).toEqual({ of: "0230702", estado: "anulada", nota: "", actualizado: "2026-09-29T09:00:00Z", revisor: "" });
  });
  test("un estado desconocido se trata como pendiente", () => {
    expect(resumirOf("0230194", [{ estado: "rara", observacion: null, updatedAt: "2026-09-29T08:00:00Z", revisorId: null }]).estado).toBe("pendiente");
  });
  test("revisor solo si está aprobada: el de la aprobada más reciente", () => {
    expect(resumirOf("1", [
      { estado: "aprobada", observacion: null, updatedAt: "2026-09-29T08:00:00Z", revisorId: "angel" },
      { estado: "aprobada", observacion: null, updatedAt: "2026-09-29T09:00:00Z", revisorId: "jaime" },
    ]).revisor).toBe("jaime");
    expect(resumirOf("2", [
      { estado: "aprobada", observacion: null, updatedAt: "2026-09-29T08:00:00Z", revisorId: "angel" },
      { estado: "en_revision", observacion: null, updatedAt: "2026-09-29T09:00:00Z", revisorId: "jaime" },
    ]).revisor).toBe("");
    expect(resumirOf("3", []).revisor).toBe("");
    expect(resumirOf("4", [{ estado: "aprobada", observacion: null, updatedAt: "2026-09-29T08:00:00Z", revisorId: null }]).revisor).toBe("");
  });
});

// Iván (29/09/2026): para la web de planteamientos solo cuenta la revisión de
// Oficina Técnica; una tarea de Diseño Gráfico no puede bloquear la OF.
describe("filasDeOficinaTecnica", () => {
  const f = (seccion: "ot" | "diseno" | null, estado: string, revisorId: string | null = null) =>
    ({ estado, observacion: estado === "devuelta" ? "nota de " + (seccion ?? "nadie") : null, updatedAt: "2026-09-29T08:00:00Z", revisorId, seccion });

  test("se queda con las de OT y tira las de Diseño", () => {
    const ot = f("ot", "aprobada", "jaime");
    expect(filasDeOficinaTecnica([ot, f("diseno", "devuelta", "manuel")])).toEqual([ot]);
  });
  test("las de sección desconocida valen solo si no hay ninguna de OT", () => {
    const ot = f("ot", "aprobada", "jaime");
    const sinSaber = f(null, "devuelta");
    expect(filasDeOficinaTecnica([ot, sinSaber])).toEqual([ot]);
    expect(filasDeOficinaTecnica([sinSaber])).toEqual([sinSaber]);
    expect(filasDeOficinaTecnica([sinSaber, f("diseno", "devuelta")])).toEqual([sinSaber]);
  });
  test("solo Diseño: no queda nada y la OF sale sin_estado", () => {
    const filas = filasDeOficinaTecnica([f("diseno", "devuelta", "manuel")]);
    expect(filas).toEqual([]);
    expect(resumirOf("0230194", filas).estado).toBe("sin_estado");
  });
});
