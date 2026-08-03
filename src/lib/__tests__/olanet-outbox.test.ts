import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type { Intervalo } from "../fichaje";

let dir: string;
let outbox: typeof import("../server/olanet-outbox");

beforeAll(async () => {
  dir = mkdtempSync(path.join(tmpdir(), "coordina-outbox-"));
  // Debe fijarse ANTES de importar: estado-db lee COORDINA_DB_PATH al cargar.
  process.env.COORDINA_DB_PATH = path.join(dir, "test.db");
  outbox = await import("../server/olanet-outbox");
});

afterAll(() => {
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {
    // Windows mantiene abierto el handle del WAL; limpieza best effort.
  }
});

const iv = (
  inicio: string,
  fin: string | null,
  ofIds: string[],
  operarioId = "ivan",
): Intervalo => ({ inicio, fin, ofIds, rol: "plantear", operarioId });

describe("encolarFichaje", () => {
  it("encola las líneas de tiempo y los movimientos de fase", () => {
    const nuevas = outbox.encolarFichaje([
      iv("2026-08-03T08:00:00Z", "2026-08-03T08:30:00Z", ["0230344:2", "0230345:4"]),
    ]);
    // 2 bonos (uno por OF) + 4 movimientos (iniciada + interrumpida por OF).
    expect(nuevas).toBe(6);
    const cola = outbox.leerPendientes();
    expect(cola.filter((p) => p.tipo === "bono")).toHaveLength(2);
    expect(cola.filter((p) => p.tipo === "fase")).toHaveLength(4);
  });

  it("el tiempo va ANTES que el cambio de estado de la fase", () => {
    const pendientes = outbox.leerPendientes();
    const ultimoBono = Math.max(...pendientes.filter((p) => p.tipo === "bono").map((p) => p.id));
    const primeraFase = Math.min(...pendientes.filter((p) => p.tipo === "fase").map((p) => p.id));
    expect(ultimoBono).toBeLessThan(primeraFase);
  });

  it("reencolar los mismos intervalos no duplica", () => {
    const mismos = [iv("2026-08-03T10:00:00Z", "2026-08-03T10:30:00Z", ["0230400:1"])];
    expect(outbox.encolarFichaje(mismos)).toBe(3);
    expect(outbox.encolarFichaje(mismos)).toBe(0);
  });

  it("un intervalo abierto encola la fase iniciada pero ningún bono", () => {
    const antes = outbox.leerPendientes().length;
    expect(outbox.encolarFichaje([iv("2026-08-03T12:00:00Z", null, ["0230500:1"])])).toBe(1);
    const nuevo = outbox.leerPendientes().slice(antes)[0];
    expect(nuevo.tipo).toBe("fase");
  });

  it("un operario sin código de RPS no revienta el fichaje", () => {
    expect(() =>
      outbox.encolarFichaje([
        iv("2026-08-03T13:00:00Z", "2026-08-03T13:30:00Z", ["0230600:1"], "desconocido"),
      ]),
    ).not.toThrow();
  });
});

describe("encolarFinalizacion", () => {
  it("encola un movimiento de finalizada por OF", () => {
    expect(outbox.encolarFinalizacion(["0230900:1", "0230901:2"], "ivan", "2026-08-03T16:00:00Z")).toBe(2);
    const finales = outbox
      .leerPendientes()
      .filter((p) => p.tipo === "fase" && p.datos.estado === 3);
    expect(finales).toHaveLength(2);
  });

  it("pasar dos veces el mismo pedido no duplica la finalización", () => {
    const args = [["0230950:1"], "ivan", "2026-08-03T17:00:00Z"] as const;
    expect(outbox.encolarFinalizacion(...args)).toBe(1);
    expect(outbox.encolarFinalizacion(...args)).toBe(0);
  });
});

describe("marcado de envío", () => {
  it("marcar enviado lo saca de pendientes pero sigue en la cola", () => {
    outbox.encolarFichaje([iv("2026-08-03T14:00:00Z", "2026-08-03T14:30:00Z", ["0230700:1"])]);
    const objetivo = outbox.leerPendientes().find((p) => p.tipo === "bono" && p.datos.of === "0230700")!;
    outbox.marcarEnviados([objetivo.id]);

    expect(outbox.leerPendientes().some((p) => p.id === objetivo.id)).toBe(false);
    expect(outbox.leerCola().find((p) => p.id === objetivo.id)!.enviadoAt).not.toBeNull();
  });

  it("marcar error deja el evento pendiente para reintentar", () => {
    outbox.encolarFichaje([iv("2026-08-03T15:00:00Z", "2026-08-03T15:30:00Z", ["0230800:1"])]);
    const objetivo = outbox.leerPendientes().find((p) => p.tipo === "bono" && p.datos.of === "0230800")!;
    outbox.marcarError(objetivo.id, "conexión rechazada");

    const tras = outbox.leerPendientes().find((p) => p.id === objetivo.id)!;
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
