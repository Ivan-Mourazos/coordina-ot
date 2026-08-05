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

test("guardado incremental: la historia previa no se pierde al crecer la lista", () => {
  // Simula la secuencia real de POSTs: la lista crece y solo cambia su cola.
  let f = fichar(FICHAJE_VACIO, ["OF-A"], "plantear", "op-5", "2026-07-22T08:00:00.000Z");
  db.guardarFichaje("op-5", f); // 1 abierto
  f = pausar(f, "2026-07-22T08:30:00.000Z");
  db.guardarFichaje("op-5", f); // el mismo, ya cerrado
  f = fichar(f, ["OF-B"], "revisar", "op-5", "2026-07-22T09:00:00.000Z");
  db.guardarFichaje("op-5", f); // + uno nuevo abierto

  const leido = db.leerFichaje("op-5");
  expect(leido.intervalos).toHaveLength(2);
  // El primero conserva su cierre: el upsert lo actualizó, no lo duplicó.
  expect(leido.intervalos[0]).toMatchObject({
    ofIds: ["OF-A"], rol: "plantear", fin: "2026-07-22T08:30:00.000Z",
  });
  expect(leido.intervalos[1]).toMatchObject({ ofIds: ["OF-B"], rol: "revisar", fin: null });
});

test("guardado incremental: guardar dos veces lo mismo no duplica filas", () => {
  let f = fichar(FICHAJE_VACIO, ["OF-C"], "plantear", "op-6", "2026-07-22T10:00:00.000Z");
  f = pausar(f, "2026-07-22T10:15:00.000Z");
  db.guardarFichaje("op-6", f);
  db.guardarFichaje("op-6", f);
  expect(db.leerFichaje("op-6").intervalos).toHaveLength(1);
});

test("guardarFichaje registra latido: un intervalo recién abierto nunca se queda sin latido", () => {
  const f = fichar(FICHAJE_VACIO, ["OF-G"], "plantear", "op-8", "2026-07-22T13:00:00.000Z");
  db.guardarFichaje("op-8", f);
  expect(db.leerUltimoLatido("op-8")).not.toBeNull();
});

test("registrarLatido/leerUltimoLatido: round-trip, y null si nunca se registró", () => {
  expect(db.leerUltimoLatido("op-sin-latido")).toBeNull();
  db.registrarLatido("op-9", "2026-07-22T14:00:00.000Z");
  expect(db.leerUltimoLatido("op-9")).toBe("2026-07-22T14:00:00.000Z");
  db.registrarLatido("op-9", "2026-07-22T14:05:00.000Z"); // upsert, no duplica
  expect(db.leerUltimoLatido("op-9")).toBe("2026-07-22T14:05:00.000Z");
});

test("el aviso de cierre sobrevive a leerlo: solo lo borra el acuse del cliente", () => {
  expect(db.leerAvisoCierre("op-10")).toBeNull();
  db.registrarAvisoCierre("op-10", ["OF-H"], "2026-07-22T15:00:00.000Z");
  const esperado = { ofIds: ["OF-H"], fin: "2026-07-22T15:00:00.000Z" };
  expect(db.leerAvisoCierre("op-10")).toEqual(esperado);
  // Leerlo NO lo consume: si se borrara aquí, bastaría con que la respuesta se
  // perdiera para que el técnico nunca se enterase de que le cerraron el fichaje.
  expect(db.leerAvisoCierre("op-10")).toEqual(esperado);

  db.marcarAvisoCierreVisto("op-10");
  expect(db.leerAvisoCierre("op-10")).toBeNull();
});

test("si llegan menos intervalos de los guardados, se reescribe entero", () => {
  let f = fichar(FICHAJE_VACIO, ["OF-D"], "plantear", "op-7", "2026-07-22T11:00:00.000Z");
  f = pausar(f, "2026-07-22T11:10:00.000Z");
  f = fichar(f, ["OF-E"], "plantear", "op-7", "2026-07-22T11:20:00.000Z");
  db.guardarFichaje("op-7", f); // 2 intervalos

  const corto = fichar(FICHAJE_VACIO, ["OF-F"], "revisar", "op-7", "2026-07-22T12:00:00.000Z");
  db.guardarFichaje("op-7", corto);

  const leido = db.leerFichaje("op-7");
  expect(leido.intervalos).toHaveLength(1);
  expect(leido.intervalos[0].ofIds).toEqual(["OF-F"]);
});
