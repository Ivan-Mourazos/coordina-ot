import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type { Intervalo } from "../fichaje";

let dir: string;
let outbox: typeof import("../server/bonos-outbox");

beforeAll(async () => {
  dir = mkdtempSync(path.join(tmpdir(), "coordina-outbox-"));
  // Debe fijarse ANTES de importar: estado-db lee COORDINA_DB_PATH al cargar.
  process.env.COORDINA_DB_PATH = path.join(dir, "test.db");
  outbox = await import("../server/bonos-outbox");
});

afterAll(() => {
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {
    // Windows mantiene abierto el handle del WAL; limpieza best effort.
  }
});

const iv = (inicio: string, fin: string | null, ofIds: string[], operarioId = "ivan"): Intervalo => ({
  inicio,
  fin,
  ofIds,
  rol: "plantear",
  operarioId,
});

describe("encolarBonos", () => {
  it("encola una fila por sub-tramo", () => {
    const nuevas = outbox.encolarBonos([
      iv("2026-08-03T08:00:00Z", "2026-08-03T08:30:00Z", ["0230344:2", "0230345:4"]),
    ]);
    expect(nuevas).toBe(2);
    const cola = outbox.leerPendientes();
    expect(cola.map((b) => b.fila.of)).toContain("0230344");
    expect(cola.every((b) => b.enviadoAt === null)).toBe(true);
  });

  it("reencolar los mismos intervalos no duplica", () => {
    const mismos = [iv("2026-08-03T10:00:00Z", "2026-08-03T10:30:00Z", ["0230400:1"])];
    expect(outbox.encolarBonos(mismos)).toBe(1);
    expect(outbox.encolarBonos(mismos)).toBe(0);
  });

  it("un intervalo abierto no encola nada", () => {
    expect(outbox.encolarBonos([iv("2026-08-03T12:00:00Z", null, ["0230500:1"])])).toBe(0);
  });

  it("un operario sin código de RPS no revienta el fichaje", () => {
    expect(() =>
      outbox.encolarBonos([
        iv("2026-08-03T13:00:00Z", "2026-08-03T13:30:00Z", ["0230600:1"], "desconocido"),
      ]),
    ).not.toThrow();
  });
});

describe("marcado de envío", () => {
  it("marcar enviado lo saca de pendientes pero sigue en la cola", () => {
    outbox.encolarBonos([iv("2026-08-03T14:00:00Z", "2026-08-03T14:30:00Z", ["0230700:1"])]);
    const antes = outbox.leerPendientes();
    const objetivo = antes.find((b) => b.fila.of === "0230700")!;
    outbox.marcarEnviados([objetivo.id]);

    expect(outbox.leerPendientes().some((b) => b.id === objetivo.id)).toBe(false);
    const enCola = outbox.leerCola().find((b) => b.id === objetivo.id)!;
    expect(enCola.enviadoAt).not.toBeNull();
  });

  it("marcar error deja la fila pendiente para reintentar", () => {
    outbox.encolarBonos([iv("2026-08-03T15:00:00Z", "2026-08-03T15:30:00Z", ["0230800:1"])]);
    const objetivo = outbox.leerPendientes().find((b) => b.fila.of === "0230800")!;
    outbox.marcarError(objetivo.id, "conexión rechazada");

    const tras = outbox.leerPendientes().find((b) => b.id === objetivo.id)!;
    expect(tras.enviadoAt).toBeNull();
    expect(tras.error).toBe("conexión rechazada");
  });
});

describe("modoFichaje", () => {
  it("por defecto es sombra: escribir en OLANET hay que pedirlo", () => {
    delete process.env.FICHAJE_OLANET;
    expect(outbox.modoFichaje()).toBe("sombra");
    process.env.FICHAJE_OLANET = "cualquier-otra-cosa";
    expect(outbox.modoFichaje()).toBe("sombra");
  });

  it("solo el valor exacto 'activo' escribe de verdad", () => {
    process.env.FICHAJE_OLANET = "activo";
    expect(outbox.modoFichaje()).toBe("activo");
    delete process.env.FICHAJE_OLANET;
  });
});
