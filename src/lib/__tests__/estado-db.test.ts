import { afterAll, beforeAll, expect, test } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

let dir: string;
let db: typeof import("../server/estado-db");

beforeAll(async () => {
  dir = mkdtempSync(path.join(tmpdir(), "coordina-estado-"));
  process.env.COORDINA_DB_PATH = path.join(dir, "test.db");
  db = await import("../server/estado-db");
});

afterAll(() => {
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {
    // Windows mantiene abierto el handle del WAL; limpieza best effort.
  }
});

test("el log guarda el estado PREVIO, no solo el nuevo", () => {
  const of = {
    ofId: "of-p1",
    autorId: "ivan",
    revisorId: null,
    estado: "en_curso" as const,
    observacion: null,
  };
  db.guardarMutacion({ operarioId: "ivan", motivo: "asignar", cambiosOF: [of] });
  db.guardarMutacion({
    operarioId: "ivan",
    motivo: "traspaso",
    cambiosOF: [{ ...of, autorId: "tamara" }],
  });

  const filas = db.leerAccionesDesde("1970-01-01T00:00:00.000Z");
  const traspaso = filas.find((f) => f.motivo === "traspaso")!;
  // Sin el previo no se puede decir "antes Iván": el cliente solo manda el
  // snapshot nuevo, así que el anterior lo tiene que leer el servidor.
  expect(traspaso.previos).toEqual([expect.objectContaining({ ofId: "of-p1", autorId: "ivan" })]);
  expect(traspaso.cambiosOF).toEqual([expect.objectContaining({ autorId: "tamara" })]);
});
