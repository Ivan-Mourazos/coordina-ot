import { afterAll, beforeAll, expect, test } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fichar, pausar, FICHAJE_VACIO } from "../fichaje";

let dir: string;
let db: typeof import("../server/fichaje-db");

beforeAll(async () => {
  dir = mkdtempSync(path.join(tmpdir(), "coordina-fdb-"));
  // Debe fijarse ANTES de importar: estado-db lee COORDINA_DB_PATH al cargar.
  process.env.COORDINA_DB_PATH = path.join(dir, "test.db");
  db = await import("../server/fichaje-db");
});

afterAll(() => {
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {
    // Windows: better-sqlite3 mantiene el handle del fichero WAL abierto
    // (globalThis.__coordinaDb se cachea a propósito para reuso en HMR), así
    // que borrar el directorio temporal puede dar EPERM aquí. Limpieza best
    // effort: el SO recicla el temp dir igualmente; no afecta a las aserciones.
  }
});

test("round-trip: guarda y lee el fichaje de un operario", () => {
  const t0 = "2026-07-22T08:00:00.000Z";
  const t1 = "2026-07-22T08:10:00.000Z";
  let f = fichar(FICHAJE_VACIO, ["OF-1"], "plantear", "op-1", t0);
  f = pausar(f, t1); // un intervalo cerrado de 10 min
  db.guardarFichaje("op-1", f);

  const leido = db.leerFichaje("op-1");
  expect(leido.intervalos).toHaveLength(1);
  expect(leido.intervalos[0]).toMatchObject({
    ofIds: ["OF-1"], rol: "plantear", operarioId: "op-1", inicio: t0, fin: t1,
  });
});

test("guardarFichaje reemplaza los intervalos previos de ese operario", () => {
  const f1 = fichar(FICHAJE_VACIO, ["OF-1"], "plantear", "op-2", "2026-07-22T09:00:00.000Z");
  db.guardarFichaje("op-2", f1);
  const f2 = fichar(FICHAJE_VACIO, ["OF-9"], "revisar", "op-2", "2026-07-22T10:00:00.000Z");
  db.guardarFichaje("op-2", f2);

  const leido = db.leerFichaje("op-2");
  expect(leido.intervalos).toHaveLength(1);
  expect(leido.intervalos[0].ofIds).toEqual(["OF-9"]);
  expect(leido.intervalos[0].fin).toBeNull(); // sigue abierto
});

test("leerTodosIntervalos junta a todos los operarios", () => {
  db.guardarFichaje("op-3", fichar(FICHAJE_VACIO, ["OF-5"], "plantear", "op-3", "2026-07-22T11:00:00.000Z"));
  const todos = db.leerTodosIntervalos();
  const ops = new Set(todos.map((i) => i.operarioId));
  expect(ops.has("op-3")).toBe(true);
});

test("conserva el orden de un historial multi-intervalo con el último abierto", () => {
  let f = fichar(FICHAJE_VACIO, ["OF-1"], "plantear", "op-4", "2026-07-22T08:00:00.000Z");
  f = pausar(f, "2026-07-22T08:10:00.000Z"); // cerrado 1
  f = fichar(f, ["OF-2"], "plantear", "op-4", "2026-07-22T08:20:00.000Z");
  f = pausar(f, "2026-07-22T08:25:00.000Z"); // cerrado 2
  f = fichar(f, ["OF-3"], "revisar", "op-4", "2026-07-22T08:30:00.000Z"); // abierto
  db.guardarFichaje("op-4", f);

  const leido = db.leerFichaje("op-4");
  expect(leido.intervalos).toHaveLength(3);
  expect(leido.intervalos.map((i) => i.ofIds[0])).toEqual(["OF-1", "OF-2", "OF-3"]);
  expect(leido.intervalos[2].fin).toBeNull(); // el último sigue abierto
});
