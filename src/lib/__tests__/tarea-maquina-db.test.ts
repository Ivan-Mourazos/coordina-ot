import { afterAll, beforeAll, expect, test } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

let dir: string;
let db: typeof import("../server/estado-db");

beforeAll(async () => {
  dir = mkdtempSync(path.join(tmpdir(), "coordina-tarea-maquina-"));
  process.env.COORDINA_DB_PATH = path.join(dir, "test.db");
  db = await import("../server/estado-db");
});
afterAll(() => {
  try { rmSync(dir, { recursive: true, force: true }); } catch { /* Windows/WAL */ }
});

test("guarda la máquina de cada tarea y la devuelve por su id de OF", () => {
  db.guardarMaquinasDeTarea([["0232035:5", "P-PCUS"], ["0232036:11", "A-DGRA"]]);
  const m = db.maquinasDeTareas(["0232035:5", "0232036:11"]);
  expect(m.get("0232035:5")).toBe("P-PCUS");
  expect(m.get("0232036:11")).toBe("A-DGRA");
});

test("lo que no está no sale, y quien pregunte decide qué hacer", () => {
  // `bonosDe` se queda entonces con la máquina de la persona, que es lo que
  // hacía siempre: un bono sin máquina no se puede escribir.
  expect(db.maquinasDeTareas(["0000000:1"]).size).toBe(0);
  expect(db.maquinasDeTareas([]).size).toBe(0);
});

test("si a una tarea le cambian el recurso, el siguiente refresco lo recoge", () => {
  db.guardarMaquinasDeTarea([["0232035:5", "P-PCMU"]]);
  expect(db.maquinasDeTareas(["0232035:5"]).get("0232035:5")).toBe("P-PCMU");
});

test("una OF que sale del tablero NO se borra: su bono está a punto de escribirse", () => {
  // Es justo el caso más común — la OF que se acaba de cerrar— y por eso
  // `guardarMaquinasDeTarea` nunca borra lo que ya hay.
  db.guardarMaquinasDeTarea([["0232036:11", "A-DGRA"]]);
  expect(db.maquinasDeTareas(["0232035:5"]).get("0232035:5")).toBe("P-PCMU");
});
