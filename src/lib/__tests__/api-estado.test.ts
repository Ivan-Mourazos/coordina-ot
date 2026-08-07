import { afterAll, beforeAll, expect, test } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

let dir: string;
let route: typeof import("../../app/api/estado/route");
let fichajeDb: typeof import("../server/fichaje-db");
let fichaje: typeof import("../fichaje");

beforeAll(async () => {
  dir = mkdtempSync(path.join(tmpdir(), "coordina-api-estado-"));
  process.env.COORDINA_DB_PATH = path.join(dir, "test.db");
  route = await import("../../app/api/estado/route");
  fichajeDb = await import("../server/fichaje-db");
  fichaje = await import("../fichaje");
});

afterAll(() => {
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {
    // Windows mantiene abierto el handle del WAL; limpieza best effort.
  }
});

test("traspasar una OF corta el fichaje que otro tenía sobre ella", async () => {
  const f = fichaje.fichar(
    fichaje.FICHAJE_VACIO,
    ["of-x"],
    "plantear",
    "tamara",
    "2026-08-05T08:00:00.000Z",
  );
  fichajeDb.guardarFichaje("tamara", f);

  const res = await route.POST(
    new Request("http://x/api/estado", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        operarioId: "ivan",
        motivo: "traspaso",
        cambiosOF: [
          { ofId: "of-x", autorId: "ivan", revisorId: null, estado: "en_curso", observacion: null },
        ],
        cortarFichajeDe: ["of-x"],
      }),
    }),
  );
  expect(res.status).toBe(200);

  // Tamara ya no ficha algo que no es suyo, y su tiempo queda guardado.
  const suyo = fichajeDb.leerFichaje("tamara");
  expect(suyo.intervalos.every((i) => i.fin !== null)).toBe(true);
});
