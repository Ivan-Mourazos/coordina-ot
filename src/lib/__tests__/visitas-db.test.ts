import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

let dir: string;
beforeAll(() => {
  dir = mkdtempSync(path.join(tmpdir(), "coordina-visitas-"));
  process.env.COORDINA_DB_PATH = path.join(dir, "test.db");
  process.env.DATASOURCE = "mock";
});
afterAll(() => { try { rmSync(dir, { recursive: true, force: true }); } catch {} });

let db: typeof import("../server/visitas-db");
beforeEach(async () => {
  vi.resetModules();
  const { getDb } = await import("../server/estado-db");
  getDb().exec("DELETE FROM ausencia_fija; DELETE FROM ausencia_rango; DELETE FROM visita_nombre;");
  db = await import("../server/visitas-db");
});

describe("mis ausencias", () => {
  it("guarda y lee días fijos y rangos con nota", () => {
    db.guardarMisAusencias("tamara", { dias: [3, 5], rangos: [{ desde: "2026-12-02", hasta: "2026-12-05", nota: "vacaciones" }] }, "2026-11-19");
    expect(db.leerMisAusencias("tamara")).toEqual({ dias: [3, 5], rangos: [{ desde: "2026-12-02", hasta: "2026-12-05", nota: "vacaciones" }] });
  });
  it("guardar reemplaza y tira lo pasado de hace más de 90 días", () => {
    db.guardarMisAusencias("tamara", { dias: [3], rangos: [{ desde: "2026-01-01", hasta: "2026-01-02" }, { desde: "2026-11-01", hasta: "2026-11-02" }] }, "2026-11-19");
    db.guardarMisAusencias("tamara", { dias: [5], rangos: [{ desde: "2026-01-01", hasta: "2026-01-02" }, { desde: "2026-11-01", hasta: "2026-11-02" }] }, "2026-11-19");
    expect(db.leerMisAusencias("tamara")).toEqual({ dias: [5], rangos: [{ desde: "2026-11-01", hasta: "2026-11-02", nota: null }] });
  });
  it("sin nada guardado, vacío", () => {
    expect(db.leerMisAusencias("nadie")).toEqual({ dias: [], rangos: [] });
  });
  it("ausenciasDe no lleva las notas", () => {
    db.guardarMisAusencias("tamara", { dias: [3], rangos: [{ desde: "2026-12-02", hasta: "2026-12-05", nota: "médico" }] }, "2026-11-19");
    expect(db.ausenciasDe(["tamara", "alberto"])).toEqual([
      { operarioId: "tamara", dias: [3], rangos: [{ desde: "2026-12-02", hasta: "2026-12-05" }] },
      { operarioId: "alberto", dias: [], rangos: [] },
    ]);
  });
});

describe("nombres de quien viene", () => {
  it("el último usado primero, sin duplicar por mayúsculas", () => {
    db.usarNombreVisita("Juan Castro", new Date("2026-11-10T09:00:00Z"));
    db.usarNombreVisita("Marta Pérez", new Date("2026-11-11T09:00:00Z"));
    db.usarNombreVisita("juan castro", new Date("2026-11-12T09:00:00Z"));
    expect(db.nombresVisita()).toEqual(["juan castro", "Marta Pérez"]);
  });
});
