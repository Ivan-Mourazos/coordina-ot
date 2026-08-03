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

// La ruta siempre pasa la lista COMPLETA de intervalos del operario, que va
// creciendo; los tests la modelan igual. Cada bloque usa su propio operario
// para no compartir la marca de procesado.

describe("encolarFichaje", () => {
  it("encola las líneas de tiempo y los movimientos de fase", () => {
    const nuevas = outbox.encolarFichaje("ivan", [
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

  it("reencolar la misma lista no duplica", () => {
    const lista = [iv("2026-08-03T10:00:00Z", "2026-08-03T10:30:00Z", ["0230400:1"], "jaime")];
    expect(outbox.encolarFichaje("jaime", lista)).toBe(3);
    expect(outbox.encolarFichaje("jaime", lista)).toBe(0);
  });

  it("al crecer la lista solo procesa lo nuevo", () => {
    const uno = iv("2026-08-03T08:00:00Z", "2026-08-03T08:30:00Z", ["A:1"], "tamara");
    const dos = iv("2026-08-03T08:30:00Z", "2026-08-03T09:00:00Z", ["B:2"], "tamara");
    expect(outbox.encolarFichaje("tamara", [uno])).toBe(3);
    // El segundo POST vuelve a mandar `uno`, pero ya está dado por procesado.
    expect(outbox.encolarFichaje("tamara", [uno, dos])).toBe(3);
  });

  it("el intervalo abierto se reprocesa al cerrarse", () => {
    const abierto = iv("2026-08-03T11:00:00Z", null, ["C:1"], "adrian");
    // Abierto: solo su "fase iniciada", aún no hay tiempo que imputar.
    expect(outbox.encolarFichaje("adrian", [abierto])).toBe(1);
    const cerrado = { ...abierto, fin: "2026-08-03T11:30:00Z" };
    // Al cerrarlo aparecen su bono y su "fase interrumpida"; la iniciada ya estaba.
    expect(outbox.encolarFichaje("adrian", [cerrado])).toBe(2);
  });

  it("si llegan menos intervalos de los procesados, se rederiva sin duplicar", () => {
    const lista = [iv("2026-08-03T12:00:00Z", "2026-08-03T12:30:00Z", ["D:1"], "angel")];
    expect(outbox.encolarFichaje("angel", lista)).toBe(3);
    expect(outbox.encolarFichaje("angel", [])).toBe(0);
    expect(outbox.encolarFichaje("angel", lista)).toBe(0);
  });

  it("un operario sin código de RPS no revienta el fichaje", () => {
    expect(() =>
      outbox.encolarFichaje("desconocido", [
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
    outbox.encolarFichaje("alberto", [
      iv("2026-08-03T14:00:00Z", "2026-08-03T14:30:00Z", ["0230700:1"], "alberto"),
    ]);
    const objetivo = outbox.leerPendientes().find((p) => p.tipo === "bono" && p.datos.of === "0230700")!;
    outbox.marcarEnviados([objetivo.id]);

    expect(outbox.leerPendientes().some((p) => p.id === objetivo.id)).toBe(false);
    expect(outbox.leerCola().find((p) => p.id === objetivo.id)!.enviadoAt).not.toBeNull();
  });

  it("marcar error deja el evento pendiente para reintentar", () => {
    outbox.encolarFichaje("alberto", [
      iv("2026-08-03T14:00:00Z", "2026-08-03T14:30:00Z", ["0230700:1"], "alberto"),
      iv("2026-08-03T15:00:00Z", "2026-08-03T15:30:00Z", ["0230800:1"], "alberto"),
    ]);
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
